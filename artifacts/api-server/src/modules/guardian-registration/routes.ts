import { Router, type IRouter } from "express";
import {
  CreateGuardianInviteBody,
  CreateGuardianInviteResponse,
  DecideGuardianRequestBody,
  DecideGuardianRequestResponse,
  GetGuardianRequestsResponse,
  RegisterGuardianBody,
  RegisterGuardianResponse,
} from "@workspace/api-zod";
import { requireRole } from "../../middlewares/auth";
import { badRequest } from "../../shared/http-error";
import * as service from "./service";

const router: IRouter = Router();
const asAdmin = requireRole("ADMIN");

// Deliberately without a role: the parent has no account yet. The one-time
// code is the gate, and wrong codes are slowed per address in the service.
router.post("/guardian-register", async (req, res, next) => {
  try {
    const input = RegisterGuardianBody.safeParse(req.body);
    if (!input.success) throw badRequest("Мэдээлэл дутуу байна.", "INVALID_INPUT");
    res.status(201).json(RegisterGuardianResponse.parse(await service.register(req.ip ?? "unknown", input.data)));
  } catch (error) {
    next(error);
  }
});

router.post("/admin/guardian-invites", asAdmin, async (req, res, next) => {
  try {
    const input = CreateGuardianInviteBody.safeParse(req.body);
    if (!input.success) throw badRequest("Сурагч сонгоно уу.", "INVALID_INPUT");
    res.status(201).json(CreateGuardianInviteResponse.parse(await service.createInvite(req.user!, input.data.studentId)));
  } catch (error) {
    next(error);
  }
});

router.get("/admin/guardian-requests", asAdmin, async (_req, res, next) => {
  try {
    res.json(GetGuardianRequestsResponse.parse(await service.pending()));
  } catch (error) {
    next(error);
  }
});

router.post("/admin/guardian-requests/:requestId/decision", asAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.requestId);
    if (!Number.isSafeInteger(id) || id <= 0) throw badRequest("Хүсэлтийн дугаар буруу байна.", "INVALID_ID");
    const input = DecideGuardianRequestBody.safeParse(req.body);
    if (!input.success) throw badRequest("Шийдвэр буруу байна.", "INVALID_INPUT");
    res.json(DecideGuardianRequestResponse.parse(await service.decide(req.user!, id, input.data)));
  } catch (error) {
    next(error);
  }
});

export default router;
