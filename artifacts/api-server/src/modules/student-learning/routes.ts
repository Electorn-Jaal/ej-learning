import { Router, type IRouter } from "express";
import { GetStudentTodayResponse } from "@workspace/api-zod";
import { requireRole } from "../../middlewares/auth";
import { badRequest } from "../../shared/http-error";
import { validIsoDate } from "../../shared/school-date";
import { studentToday } from "./service";

const router: IRouter = Router();
const asStudent = requireRole("STUDENT");

router.get("/student/today", asStudent, async (req, res, next) => {
  try {
    res.json(GetStudentTodayResponse.parse(await studentToday(req.user!)));
  } catch (error) {
    next(error);
  }
});

router.get("/student/schedule", asStudent, async (req, res, next) => {
  try {
    const date = req.query.date;
    if (date !== undefined && !validIsoDate(date)) {
      throw badRequest("Огноо буруу байна.", "INVALID_DATE");
    }
    res.json(GetStudentTodayResponse.parse(await studentToday(req.user!, date)));
  } catch (error) {
    next(error);
  }
});

export default router;
