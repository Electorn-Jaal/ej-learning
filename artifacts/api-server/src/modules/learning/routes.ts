import { Router, type IRouter } from "express";
import {
  GenerateScheduleBody,
  GenerateScheduleResponse,
  GetQuizPaperResponse,
  GetStudentTodayResponse,
  GetTeacherDashboardResponse,
  GetTeacherLessonsResponse,
  GetTeacherQuizAttemptsResponse,
  GetTeacherScheduleResponse,
  AssignExtraWorkBody,
  AssignExtraWorkResponse,
  SetScheduleDayBody,
  SubmitQuizAttemptBody,
  SubmitQuizAttemptResponse,
} from "@workspace/api-zod";
import { requireRole } from "../../middlewares/auth";
import { badRequest, unauthorized } from "../../shared/http-error";
import {
  assignExtraWork,
  generateSchedule,
  materialFile,
  quizAttemptsForTeacher,
  quizPaper,
  recordQuizAttemptScored,
  schedulableLessons,
  setScheduleDay,
  studentToday,
  teacherDashboard,
  teacherSchedule,
} from "./service";

const router: IRouter = Router();

router.get(
  "/student/today",
  requireRole("STUDENT"),
  async (req, res, next) => {
    try {
      res.json(GetStudentTodayResponse.parse(await studentToday(req.user!)));
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/teacher/schedule",
  requireRole("TEACHER", "ADMIN"),
  async (req, res, next) => {
    try {
      const classId = Number(req.query.classId);
      if (!Number.isInteger(classId) || classId <= 0) {
        throw badRequest("Ангийн дугаар буруу байна.", "INVALID_CLASS_ID");
      }
      const schedule = await teacherSchedule(req.user!, {
        classId,
        from: req.query.from,
        to: req.query.to,
      });
      res.json(GetTeacherScheduleResponse.parse(schedule));
    } catch (error) {
      next(error);
    }
  },
);

const asStaff = requireRole("TEACHER", "ADMIN");

router.get("/teacher/dashboard", asStaff, async (req, res, next) => {
  try {
    res.json(GetTeacherDashboardResponse.parse(await teacherDashboard(req.user!)));
  } catch (error) {
    next(error);
  }
});

router.get("/teacher/lessons", asStaff, async (req, res, next) => {
  try {
    const classId = Number(req.query.classId);
    if (!Number.isInteger(classId) || classId <= 0) {
      throw badRequest("Ангийн дугаар буруу байна.", "INVALID_CLASS_ID");
    }
    res.json(
      GetTeacherLessonsResponse.parse(await schedulableLessons(req.user!, classId)),
    );
  } catch (error) {
    next(error);
  }
});

router.post("/teacher/schedule/generate", asStaff, async (req, res, next) => {
  try {
    const parsed = GenerateScheduleBody.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest("Анги, улирлаа сонгоно уу.", "INVALID_INPUT");
    }
    const result = await generateSchedule(req.user!, parsed.data);
    res.json(GenerateScheduleResponse.parse(result));
  } catch (error) {
    next(error);
  }
});

router.post("/teacher/assignments", asStaff, async (req, res, next) => {
  try {
    const parsed = AssignExtraWorkBody.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest("Даалгаврын мэдээлэл буруу байна.", "INVALID_INPUT");
    }
    const result = await assignExtraWork(req.user!, parsed.data);
    res.status(201).json(AssignExtraWorkResponse.parse(result));
  } catch (error) {
    next(error);
  }
});

router.put("/teacher/schedule/day", asStaff, async (req, res, next) => {
  try {
    const parsed = SetScheduleDayBody.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest("Өдрийн мэдээлэл буруу байна.", "INVALID_INPUT");
    }
    await setScheduleDay(req.user!, parsed.data);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

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

router.post(
  "/student/quiz-attempts",
  requireRole("STUDENT"),
  async (req, res, next) => {
    try {
      const parsed = SubmitQuizAttemptBody.safeParse(req.body);
      if (!parsed.success) {
        throw badRequest("Хариултын бүрдэл буруу байна.", "INVALID_ATTEMPT");
      }
      const attempt = await recordQuizAttemptScored(req.user!, parsed.data);
      res.status(201).json(SubmitQuizAttemptResponse.parse(attempt));
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/teacher/quiz-attempts",
  requireRole("TEACHER", "ADMIN"),
  async (req, res, next) => {
    try {
      const classId = Number(req.query.classId);
      if (!Number.isInteger(classId) || classId <= 0) {
        throw badRequest("Ангийн дугаар буруу байна.", "INVALID_CLASS_ID");
      }
      const raw = Number(req.query.limit);
      const limit = Number.isInteger(raw) && raw > 0 ? Math.min(raw, 200) : 50;

      const result = await quizAttemptsForTeacher(req.user!, classId, limit);
      res.json(GetTeacherQuizAttemptsResponse.parse(result));
    } catch (error) {
      next(error);
    }
  },
);

// Any signed-in account may read an approved book. Which lesson points at it
// is what differs per student, not the book itself.
router.get("/content/materials/:materialId/file", async (req, res, next) => {
  try {
    if (!req.user) throw unauthorized("Нэвтэрнэ үү.", "NOT_AUTHENTICATED");

    const materialId = Number(req.params.materialId);
    if (!Number.isInteger(materialId) || materialId <= 0) {
      throw badRequest("Материалын дугаар буруу байна.", "INVALID_MATERIAL_ID");
    }

    const file = await materialFile(materialId);
    if (!file) {
      res.status(404).json({
        error: "Баталгаажсан файл олдсонгүй.",
        code: "FILE_NOT_FOUND",
      });
      return;
    }

    res.type(file.mimeType);
    // inline: the viewer opens it in place, and a #page=N fragment lands the
    // student on the pages their lesson covers.
    res.setHeader(
      "Content-Disposition",
      `inline; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
    );
    res.sendFile(file.filePath, (error) => {
      if (error) next(error);
    });
  } catch (error) {
    next(error);
  }
});

export default router;
