import { Router, type IRouter } from "express";
import {
  GetQuizPaperResponse,
  GetTeacherQuizAttemptsResponse,
  GetTeacherQuizPaperResponse,
  SubmitQuizAttemptBody,
  SubmitQuizAttemptResponse,
  GetQuizPreviewQueryParams,
  GetQuizPreviewResponse,
  SetQuizQuestionsBody,
  SetQuizQuestionsResponse,
} from "@workspace/api-zod";
import { requireRole } from "../../middlewares/auth";
import { badRequest } from "../../shared/http-error";
import {
  quizAttemptsForTeacher,
  quizPaper,
  quizPaperForTeacher,
  recordQuizAttemptScored,
  quizPreview,
  setQuizQuestions,
} from "./service";

const router: IRouter = Router();

function readSubjectId(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const subjectId = Number(raw);
  if (!Number.isInteger(subjectId) || subjectId <= 0) {
    throw badRequest("Хичээлийн дугаар буруу байна.", "INVALID_SUBJECT_ID");
  }
  return subjectId;
}

router.get("/student/quiz/:lessonId", requireRole("STUDENT"), async (req, res, next) => {
  try {
    const lessonId = Number(req.params.lessonId);
    if (!Number.isInteger(lessonId) || lessonId <= 0) {
      throw badRequest("Хичээлийн дугаар буруу байна.", "INVALID_LESSON_ID");
    }
    res.json(GetQuizPaperResponse.parse(await quizPaper(req.user!, lessonId)));
  } catch (error) {
    next(error);
  }
});

router.post("/student/quiz-attempts", requireRole("STUDENT"), async (req, res, next) => {
  try {
    const parsed = SubmitQuizAttemptBody.safeParse(req.body);
    if (!parsed.success) throw badRequest("Хариултын бүрдэл буруу байна.", "INVALID_ATTEMPT");
    const attempt = await recordQuizAttemptScored(req.user!, parsed.data);
    res.status(201).json(SubmitQuizAttemptResponse.parse(attempt));
  } catch (error) {
    next(error);
  }
});

router.get(
  "/teacher/quiz-attempts",
  requireRole("TEACHER", "ADMIN"),
  async (req, res, next) => {
    try {
      const classId = Number(req.query.classId);
      if (!Number.isInteger(classId) || classId <= 0) {
        throw badRequest("Ангийн дугаар буруу байна.", "INVALID_CLASS_ID");
      }
      const rawLimit = Number(req.query.limit);
      const limit = Number.isInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 200) : 50;
      const result = await quizAttemptsForTeacher(req.user!, {
        classId,
        limit,
        subjectId: readSubjectId(req.query.subjectId),
        from: req.query.from,
        to: req.query.to,
      });
      res.json(GetTeacherQuizAttemptsResponse.parse(result));
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/teacher/quiz-paper",
  requireRole("TEACHER", "ADMIN"),
  async (req, res, next) => {
    try {
      const classId = Number(req.query.classId);
      const lessonId = Number(req.query.lessonId);
      if (!Number.isInteger(classId) || classId <= 0) {
        throw badRequest("Ангийн дугаар буруу байна.", "INVALID_CLASS_ID");
      }
      if (!Number.isInteger(lessonId) || lessonId <= 0) {
        throw badRequest("Хичээлийн дугаар буруу байна.", "INVALID_LESSON_ID");
      }
      const paper = await quizPaperForTeacher(req.user!, classId, lessonId);
      res.json(GetTeacherQuizPaperResponse.parse(paper));
    } catch (error) {
      next(error);
    }
  },
);

router.get("/teacher/quiz-preview", requireRole("TEACHER", "ADMIN"), async (req, res, next) => {
  try {
    const query = GetQuizPreviewQueryParams.safeParse(req.query);
    if (!query.success) throw badRequest("Анги, хичээл сонгоно уу.", "INVALID_QUERY");
    res.json(GetQuizPreviewResponse.parse(await quizPreview(req.user!, query.data.classId, query.data.lessonId)));
  } catch (error) {
    next(error);
  }
});

router.put("/teacher/quiz-preview", requireRole("TEACHER", "ADMIN"), async (req, res, next) => {
  try {
    const input = SetQuizQuestionsBody.safeParse(req.body);
    if (!input.success) throw badRequest("Асуултын сонголт буруу байна.", "INVALID_INPUT");
    res.json(SetQuizQuestionsResponse.parse(await setQuizQuestions(req.user!, input.data)));
  } catch (error) {
    next(error);
  }
});

export default router;
