import { Router, type IRouter } from "express";
import {
  CreateExamBody,
  CreateExamResponse,
  GetTeacherExamsResponse,
  GetTeacherExamResponse,
  ReopenExamBody,
  ReopenExamResponse,
  ReleaseExamAnswersBody,
  ReleaseExamAnswersResponse,
  GetStudentExamsResponse,
  GetStudentExamResponse,
  SubmitExamBody,
  SubmitExamResponse,
  EnterPaperAnswersBody,
  EnterPaperAnswersResponse,
} from "@workspace/api-zod";
import { requireRole } from "../../middlewares/auth";
import { badRequest } from "../../shared/http-error";
import {
  createExam,
  enterPaperAnswers,
  releaseAnswers,
  reopenFor,
  studentExam,
  studentExams,
  submitExam,
  teacherExam,
  teacherExams,
} from "./service";

const router: IRouter = Router();
const asStaff = requireRole("TEACHER", "ADMIN");
const asStudent = requireRole("STUDENT");

const positiveId = (raw: unknown, message: string, code: string) => {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw badRequest(message, code);
  return value;
};

router.get("/teacher/exams", asStaff, async (req, res, next) => {
  try {
    const classId = positiveId(req.query.classId, "Ангийн дугаар буруу байна.", "INVALID_CLASS_ID");
    const raw = req.query.subjectId;
    const subjectId = raw === undefined || raw === null || raw === ""
      ? null
      : positiveId(raw, "Хичээлийн дугаар буруу байна.", "INVALID_SUBJECT_ID");
    res.json(GetTeacherExamsResponse.parse(await teacherExams(req.user!, classId, subjectId)));
  } catch (error) {
    next(error);
  }
});

router.post("/teacher/exams", asStaff, async (req, res, next) => {
  try {
    const parsed = CreateExamBody.safeParse(req.body);
    if (!parsed.success) throw badRequest("Шалгалтын мэдээлэл буруу байна.", "INVALID_INPUT");
    res.status(201).json(CreateExamResponse.parse(await createExam(req.user!, parsed.data)));
  } catch (error) {
    next(error);
  }
});

router.get("/teacher/exams/:sittingId", asStaff, async (req, res, next) => {
  try {
    const id = positiveId(req.params.sittingId, "Шалгалтын дугаар буруу байна.", "INVALID_EXAM_ID");
    res.json(GetTeacherExamResponse.parse(await teacherExam(req.user!, id)));
  } catch (error) {
    next(error);
  }
});

router.post("/teacher/exams/:sittingId/reopen", asStaff, async (req, res, next) => {
  try {
    const id = positiveId(req.params.sittingId, "Шалгалтын дугаар буруу байна.", "INVALID_EXAM_ID");
    const parsed = ReopenExamBody.safeParse(req.body);
    if (!parsed.success) throw badRequest("Сурагчаа сонгоно уу.", "INVALID_INPUT");
    res.json(ReopenExamResponse.parse(await reopenFor(req.user!, id, parsed.data.studentIds)));
  } catch (error) {
    next(error);
  }
});

router.put("/teacher/exams/:sittingId/answers", asStaff, async (req, res, next) => {
  try {
    const id = positiveId(req.params.sittingId, "Шалгалтын дугаар буруу байна.", "INVALID_EXAM_ID");
    const parsed = ReleaseExamAnswersBody.safeParse(req.body);
    if (!parsed.success) throw badRequest("Утга буруу байна.", "INVALID_INPUT");
    res.json(ReleaseExamAnswersResponse.parse(
      await releaseAnswers(req.user!, id, parsed.data.open),
    ));
  } catch (error) {
    next(error);
  }
});

router.post("/teacher/exams/:sittingId/entry", asStaff, async (req, res, next) => {
  try {
    const id = positiveId(req.params.sittingId, "Шалгалтын дугаар буруу байна.", "INVALID_EXAM_ID");
    const parsed = EnterPaperAnswersBody.safeParse(req.body);
    if (!parsed.success) throw badRequest("Хариулт буруу байна.", "INVALID_INPUT");
    res.status(201).json(EnterPaperAnswersResponse.parse(
      await enterPaperAnswers(req.user!, id, parsed.data),
    ));
  } catch (error) {
    next(error);
  }
});

router.get("/student/exams", asStudent, async (req, res, next) => {
  try {
    res.json(GetStudentExamsResponse.parse(await studentExams(req.user!)));
  } catch (error) {
    next(error);
  }
});

router.get("/student/exams/:sittingId", asStudent, async (req, res, next) => {
  try {
    const id = positiveId(req.params.sittingId, "Шалгалтын дугаар буруу байна.", "INVALID_EXAM_ID");
    res.json(GetStudentExamResponse.parse(await studentExam(req.user!, id)));
  } catch (error) {
    next(error);
  }
});

router.post("/student/exams/:sittingId/attempt", asStudent, async (req, res, next) => {
  try {
    const id = positiveId(req.params.sittingId, "Шалгалтын дугаар буруу байна.", "INVALID_EXAM_ID");
    const parsed = SubmitExamBody.safeParse(req.body);
    if (!parsed.success) throw badRequest("Хариулт буруу байна.", "INVALID_INPUT");
    res.status(201).json(SubmitExamResponse.parse(
      await submitExam(req.user!, id, parsed.data.answers),
    ));
  } catch (error) {
    next(error);
  }
});

export default router;
