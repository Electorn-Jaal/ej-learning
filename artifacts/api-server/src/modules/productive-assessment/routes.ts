import { Router, type IRouter } from "express";
import {
  GetMarkableClassesResponse,
  GetProductiveMarkSheetResponse,
  SaveProductiveRatingBody,
} from "@workspace/api-zod";
import { requireRole } from "../../middlewares/auth";
import { badRequest } from "../../shared/http-error";
import * as service from "./service";

const router: IRouter = Router();
const asTeacher = requireRole("TEACHER", "ADMIN");

router.get("/teacher/productive/classes", asTeacher, async (req, res, next) => {
  try {
    res.json(GetMarkableClassesResponse.parse(await service.markableClasses(req.user!)));
  } catch (error) {
    next(error);
  }
});

router.get("/teacher/productive/classes/:classId", asTeacher, async (req, res, next) => {
  try {
    res.json(GetProductiveMarkSheetResponse.parse(
      await service.classMarkSheet(req.user!, String(req.params.classId)),
    ));
  } catch (error) {
    next(error);
  }
});

router.put("/teacher/productive/rating", asTeacher, async (req, res, next) => {
  try {
    const parsed = SaveProductiveRatingBody.safeParse(req.body);
    if (!parsed.success) throw badRequest(parsed.error.message, "INVALID_RATING");
    res.json(GetProductiveMarkSheetResponse.parse(
      await service.rate(req.user!, parsed.data),
    ));
  } catch (error) {
    next(error);
  }
});

export default router;
