import { Router, type IRouter } from "express";
import {
  GetClassHomeworkResponse,
  CreateHomeworkBody,
  CreateHomeworkResponse,
  GetHomeworkDetailResponse,
  SetHomeworkActiveBody,
  SetHomeworkActiveResponse,
  GetMyHomeworkResponse,
  GetMyHomeworkDetailResponse,
  SubmitHomeworkBody,
  SubmitHomeworkResponse,
} from "@workspace/api-zod";
import { requireRole } from "../../middlewares/auth";
import { badRequest } from "../../shared/http-error";
import {
  createHomework,
  homeworkDetail,
  listForClass,
  myHomework,
  myHomeworkDetail,
  setActive,
  submitHomework,
} from "./service";

const router: IRouter = Router();
const asStaff = requireRole("TEACHER", "ADMIN");
const asStudent = requireRole("STUDENT");

const positiveId = (raw: unknown, message: string, code: string) => {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw badRequest(message, code);
  return value;
};

router.get("/teacher/homework", asStaff, async (req, res, next) => {
  try {
    const classId = positiveId(req.query.classId, "Ангийн дугаар буруу байна.", "INVALID_CLASS_ID");
    const raw = req.query.subjectId;
    const subjectId = raw === undefined || raw === null || raw === ""
      ? null
      : positiveId(raw, "Хичээлийн дугаар буруу байна.", "INVALID_SUBJECT_ID");
    res.json(GetClassHomeworkResponse.parse(await listForClass(req.user!, classId, subjectId)));
  } catch (error) {
    next(error);
  }
});

router.post("/teacher/homework", asStaff, async (req, res, next) => {
  try {
    const parsed = CreateHomeworkBody.safeParse(req.body);
    if (!parsed.success) throw badRequest("Ажлын мэдээлэл буруу байна.", "INVALID_INPUT");
    res.status(201).json(CreateHomeworkResponse.parse(
      await createHomework(req.user!, parsed.data),
    ));
  } catch (error) {
    next(error);
  }
});

router.get("/teacher/homework/:homeworkId", asStaff, async (req, res, next) => {
  try {
    const id = positiveId(req.params.homeworkId, "Ажлын дугаар буруу байна.", "INVALID_HOMEWORK_ID");
    res.json(GetHomeworkDetailResponse.parse(await homeworkDetail(req.user!, id)));
  } catch (error) {
    next(error);
  }
});

router.put("/teacher/homework/:homeworkId/active", asStaff, async (req, res, next) => {
  try {
    const id = positiveId(req.params.homeworkId, "Ажлын дугаар буруу байна.", "INVALID_HOMEWORK_ID");
    const parsed = SetHomeworkActiveBody.safeParse(req.body);
    if (!parsed.success) throw badRequest("Утга буруу байна.", "INVALID_INPUT");
    res.json(SetHomeworkActiveResponse.parse(
      await setActive(req.user!, id, parsed.data.isActive),
    ));
  } catch (error) {
    next(error);
  }
});

router.get("/student/homework", asStudent, async (req, res, next) => {
  try {
    res.json(GetMyHomeworkResponse.parse(await myHomework(req.user!)));
  } catch (error) {
    next(error);
  }
});

router.get("/student/homework/:homeworkId", asStudent, async (req, res, next) => {
  try {
    const id = positiveId(req.params.homeworkId, "Ажлын дугаар буруу байна.", "INVALID_HOMEWORK_ID");
    res.json(GetMyHomeworkDetailResponse.parse(await myHomeworkDetail(req.user!, id)));
  } catch (error) {
    next(error);
  }
});

router.post("/student/homework/:homeworkId/submit", asStudent, async (req, res, next) => {
  try {
    const id = positiveId(req.params.homeworkId, "Ажлын дугаар буруу байна.", "INVALID_HOMEWORK_ID");
    const parsed = SubmitHomeworkBody.safeParse(req.body);
    if (!parsed.success) throw badRequest("Хариулт буруу байна.", "INVALID_INPUT");
    res.status(201).json(SubmitHomeworkResponse.parse(
      await submitHomework(req.user!, id, parsed.data),
    ));
  } catch (error) {
    next(error);
  }
});

export default router;
