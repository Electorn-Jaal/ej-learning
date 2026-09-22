import { Router, type IRouter } from "express";
import { GetPreviewStudentsResponse, GetTeacherClassesResponse } from "@workspace/api-zod";
import { requireRole } from "../../middlewares/auth";
import { previewStudents, teacherClassChoices } from "./service";

const router: IRouter = Router();
const asTeacher = requireRole("TEACHER", "ADMIN");

// What this account is allowed to look at, in two shapes: the classes and the
// children in them. Both answer the same question, so both live here.
router.get("/teacher/classes", asTeacher, async (req, res, next) => {
  try {
    res.json(GetTeacherClassesResponse.parse(await teacherClassChoices(req.user!)));
  } catch (error) {
    next(error);
  }
});

router.get("/preview/students", asTeacher, async (req, res, next) => {
  try {
    res.json(GetPreviewStudentsResponse.parse(await previewStudents(req.user!)));
  } catch (error) {
    next(error);
  }
});

export default router;
