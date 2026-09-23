import { Router, type IRouter } from "express";
import { GetClassDayResponse } from "@workspace/api-zod";
import { requireRole } from "../../middlewares/auth";
import { badRequest } from "../../shared/http-error";
import { classDay } from "./service";

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

export default router;
