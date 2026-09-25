import { Router, type IRouter } from "express";
import {
  GetClassDayResponse,
  MarkNotebooksBody,
  MarkNotebooksResponse,
  MarkAttendanceBody,
  MarkAttendanceResponse,
} from "@workspace/api-zod";
import { requireRole } from "../../middlewares/auth";
import { badRequest } from "../../shared/http-error";
import { classDay, markAttendance, markNotebooks } from "./service";

const router: IRouter = Router();

router.get("/teacher/class-day", requireRole("TEACHER", "ADMIN"), async (req, res, next) => {
  try {
    const classId = Number(req.query.classId);
    if (!Number.isInteger(classId) || classId <= 0) {
      throw badRequest("Ангийн дугаар буруу байна.", "INVALID_CLASS_ID");
    }
    const raw = req.query.subjectId;
    let subjectId: number | null = null;
    if (raw !== undefined && raw !== null && raw !== "") {
      subjectId = Number(raw);
      if (!Number.isInteger(subjectId) || subjectId <= 0) {
        throw badRequest("Хичээлийн дугаар буруу байна.", "INVALID_SUBJECT_ID");
      }
    }
    res.json(GetClassDayResponse.parse(await classDay(req.user!, {
      classId,
      subjectId,
      on: req.query.on,
    })));
  } catch (error) {
    next(error);
  }
});

router.put("/teacher/notebook", requireRole("TEACHER", "ADMIN"), async (req, res, next) => {
  try {
    const parsed = MarkNotebooksBody.safeParse(req.body);
    if (!parsed.success) throw badRequest("Тэмдэглэгээ буруу байна.", "INVALID_INPUT");
    res.json(MarkNotebooksResponse.parse(await markNotebooks(req.user!, parsed.data)));
  } catch (error) {
    next(error);
  }
});

router.put("/teacher/attendance", requireRole("TEACHER", "ADMIN"), async (req, res, next) => {
  try {
    const parsed = MarkAttendanceBody.safeParse(req.body);
    if (!parsed.success) throw badRequest("Ирцийн мэдээлэл буруу байна.", "INVALID_INPUT");
    res.json(MarkAttendanceResponse.parse(await markAttendance(req.user!, parsed.data)));
  } catch (error) {
    next(error);
  }
});

export default router;
