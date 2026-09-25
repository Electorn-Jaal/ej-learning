import { Router, type IRouter } from "express";
import {
  ApplyPromotionBody,
  ApplyPromotionResponse,
  GetEnrollmentHistoryResponse,
  GetEnrollmentOverviewResponse,
  GetPromotionPreviewQueryParams,
  GetPromotionPreviewResponse,
  SearchEnrollmentStudentsQueryParams,
  SearchEnrollmentStudentsResponse,
  SetClassTeacherBody,
  SetClassTeacherResponse,
  TransferStudentBody,
  TransferStudentResponse,
} from "@workspace/api-zod";
import { requireRole } from "../../middlewares/auth";
import { badRequest } from "../../shared/http-error";
import * as service from "./service";

const router: IRouter = Router();
// The manager these belong to is not a role yet (D05); until then the
// administrator does them, as they do the rest of the school's records.
const asAdmin = requireRole("ADMIN");

router.get("/admin/enrollment", asAdmin, async (_req, res, next) => {
  try {
    res.json(GetEnrollmentOverviewResponse.parse(await service.overview()));
  } catch (error) {
    next(error);
  }
});

router.get("/admin/enrollment/students", asAdmin, async (req, res, next) => {
  try {
    const query = SearchEnrollmentStudentsQueryParams.safeParse(req.query);
    if (!query.success) throw badRequest("Хайх нэр эсвэл код оруулна уу.", "INVALID_QUERY");
    res.json(SearchEnrollmentStudentsResponse.parse(await service.searchStudents(query.data.q)));
  } catch (error) {
    next(error);
  }
});

router.post("/admin/enrollment/transfer", asAdmin, async (req, res, next) => {
  try {
    const input = TransferStudentBody.safeParse(req.body);
    if (!input.success) throw badRequest("Шилжилтийн мэдээлэл буруу байна.", "INVALID_INPUT");
    res.status(201).json(TransferStudentResponse.parse(await service.transfer(req.user!, input.data)));
  } catch (error) {
    next(error);
  }
});

router.put("/admin/enrollment/class-teacher", asAdmin, async (req, res, next) => {
  try {
    const input = SetClassTeacherBody.safeParse(req.body);
    if (!input.success) throw badRequest("Ангийн багшийн мэдээлэл буруу байна.", "INVALID_INPUT");
    res.json(SetClassTeacherResponse.parse(await service.setClassTeacher(req.user!, input.data)));
  } catch (error) {
    next(error);
  }
});

router.get("/admin/enrollment/history", asAdmin, async (req, res, next) => {
  try {
    const raw = req.query.studentId;
    const studentId = raw === undefined ? null : Number(raw);
    if (studentId !== null && (!Number.isSafeInteger(studentId) || studentId <= 0)) {
      throw badRequest("Сурагчийн дугаар буруу байна.", "INVALID_STUDENT_ID");
    }
    res.json(GetEnrollmentHistoryResponse.parse(await service.history(studentId)));
  } catch (error) {
    next(error);
  }
});

router.get("/admin/promotion/preview", asAdmin, async (req, res, next) => {
  try {
    const query = GetPromotionPreviewQueryParams.safeParse(req.query);
    if (!query.success) throw badRequest("Хичээлийн жил буруу байна.", "INVALID_YEAR");
    res.json(GetPromotionPreviewResponse.parse(await service.promotionPreview(query.data.fromYear)));
  } catch (error) {
    next(error);
  }
});

router.post("/admin/promotion", asAdmin, async (req, res, next) => {
  try {
    const input = ApplyPromotionBody.safeParse(req.body);
    if (!input.success) throw badRequest("Дэвшилтийн мэдээлэл буруу байна.", "INVALID_INPUT");
    res.json(ApplyPromotionResponse.parse(await service.applyPromotion(req.user!, input.data)));
  } catch (error) {
    next(error);
  }
});

export default router;
