import { Router, type IRouter } from "express";
import { GetStudentSubjectOutlineResponse } from "@workspace/api-zod";
import { requireRole } from "../../middlewares/auth";
import { studentSubjectOutline } from "./service";

const router: IRouter = Router();

router.get("/student/subject-outline", requireRole("STUDENT"), async (req, res, next) => {
  try {
    const result = await studentSubjectOutline(req.user!, req.query.subject);
    res.json(GetStudentSubjectOutlineResponse.parse(result));
  } catch (error) {
    next(error);
  }
});

export default router;
