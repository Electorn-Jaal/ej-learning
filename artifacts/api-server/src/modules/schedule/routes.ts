import { Router, type IRouter } from "express";
import {
  GenerateScheduleBody,
  GenerateScheduleResponse,
  GetTeacherLessonsResponse,
  GetTeacherScheduleResponse,
  GetTeacherWeekResponse,
  SetScheduleDayBody,
  SetScheduleDayResponse,
  ApplyReplanBody,
  ApplyReplanResponse,
  GetTimetableStudentsResponse,
  SetTimetableStudentsBody,
} from "@workspace/api-zod";
import { requireRole } from "../../middlewares/auth";
import { badRequest } from "../../shared/http-error";
import { applyReplan, generateSchedule, schedulableLessons, setScheduleDay, teacherSchedule, teacherWeek, timetableStudents, setTimetableStudents } from "./service";

const router: IRouter = Router();
const asStaff = requireRole("TEACHER", "ADMIN");

function readSubjectId(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const subjectId = Number(raw);
  if (!Number.isInteger(subjectId) || subjectId <= 0) {
    throw badRequest("Хичээлийн дугаар буруу байна.", "INVALID_SUBJECT_ID");
  }
  return subjectId;
}

router.get("/teacher/schedule", asStaff, async (req, res, next) => {
  try {
    const classId = Number(req.query.classId);
    if (!Number.isInteger(classId) || classId <= 0) {
      throw badRequest("Ангийн дугаар буруу байна.", "INVALID_CLASS_ID");
    }
    res.json(
      GetTeacherScheduleResponse.parse(
        await teacherSchedule(req.user!, {
          classId,
          from: req.query.from,
          to: req.query.to,
          subjectId: readSubjectId(req.query.subjectId),
        }),
      ),
    );
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
      GetTeacherLessonsResponse.parse(
        await schedulableLessons(req.user!, classId, readSubjectId(req.query.subjectId)),
      ),
    );
  } catch (error) {
    next(error);
  }
});

router.post("/teacher/schedule/generate", asStaff, async (req, res, next) => {
  try {
    const parsed = GenerateScheduleBody.safeParse(req.body);
    if (!parsed.success) throw badRequest("Анги, улирлаа сонгоно уу.", "INVALID_INPUT");
    res.json(GenerateScheduleResponse.parse(await generateSchedule(req.user!, parsed.data)));
  } catch (error) {
    next(error);
  }
});

router.put("/teacher/schedule/day", asStaff, async (req, res, next) => {
  try {
    const parsed = SetScheduleDayBody.safeParse(req.body);
    if (!parsed.success) throw badRequest("Өдрийн мэдээлэл буруу байна.", "INVALID_INPUT");
    res.json(SetScheduleDayResponse.parse(await setScheduleDay(req.user!, parsed.data)));
  } catch (error) {
    next(error);
  }
});

router.post("/teacher/schedule/replan", asStaff, async (req, res, next) => {
  try {
    const parsed = ApplyReplanBody.safeParse(req.body);
    if (!parsed.success) throw badRequest("Хуваарийн мэдээлэл буруу байна.", "INVALID_INPUT");
    res.json(ApplyReplanResponse.parse(await applyReplan(req.user!, parsed.data)));
  } catch (error) {
    next(error);
  }
});

router.get("/teacher/timetable/:slotId/students", asStaff, async (req, res, next) => {
  try {
    const id = readSubjectId(req.params.slotId);
    if (id === null) throw badRequest("Цагаа сонгоно уу.", "INVALID_INPUT");
    res.json(GetTimetableStudentsResponse.parse(await timetableStudents(req.user!, id)));
  } catch (error) { next(error); }
});

router.put("/teacher/timetable/:slotId/students", asStaff, async (req, res, next) => {
  try {
    const id = readSubjectId(req.params.slotId);
    const body = SetTimetableStudentsBody.safeParse(req.body);
    if (id === null || !body.success) throw badRequest("Сурагчдаа сонгоно уу.", "INVALID_INPUT");
    await setTimetableStudents(req.user!, id, body.data.studentIds);
    res.status(204).end();
  } catch (error) { next(error); }
});

router.get('/teacher/my-week', asStaff, async (req, res, next) => {
  try {
    res.json(GetTeacherWeekResponse.parse(await teacherWeek(req.user!)));
  } catch (error) {
    next(error);
  }
});

export default router;
