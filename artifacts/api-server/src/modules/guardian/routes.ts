import { Router, type IRouter } from "express";
import {
  GetMyChildrenResponse,
  GetChildDayResponse,
  GetChildRecordResponse,
  GetGuardianAccountsResponse,
  LinkChildBody,
  LinkChildResponse,
  UnlinkChildBody,
  UnlinkChildResponse,
  CreateGuardianBody,
  CreateGuardianResponse,
  GetClassChildrenResponse,
} from "@workspace/api-zod";
import { requireRole } from "../../middlewares/auth";
import { badRequest } from "../../shared/http-error";
import {
  childDay,
  classChildren,
  createGuardian,
  childRecord,
  guardianAccounts,
  linkChild,
  myChildren,
  unlinkChild,
} from "./service";

const router: IRouter = Router();
// An administrator reaches these too. They already see every child through the
// teacher screens, and shutting them out here would only mean a second way of
// looking rather than one fewer.
const asGuardian = requireRole("GUARDIAN", "ADMIN");
const asAdmin = requireRole("ADMIN");

const positiveId = (raw: unknown, message: string, code: string) => {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw badRequest(message, code);
  return value;
};

router.get("/guardian/children", asGuardian, async (req, res, next) => {
  try {
    res.json(GetMyChildrenResponse.parse(await myChildren(req.user!)));
  } catch (error) {
    next(error);
  }
});

router.get("/guardian/day", asGuardian, async (req, res, next) => {
  try {
    const id = positiveId(req.query.studentId, "Сурагчийн дугаар буруу байна.", "INVALID_STUDENT_ID");
    res.json(GetChildDayResponse.parse(await childDay(req.user!, id, req.query.on)));
  } catch (error) {
    next(error);
  }
});

router.get("/guardian/record", asGuardian, async (req, res, next) => {
  try {
    const id = positiveId(req.query.studentId, "Сурагчийн дугаар буруу байна.", "INVALID_STUDENT_ID");
    res.json(GetChildRecordResponse.parse(
      await childRecord(req.user!, id, { from: req.query.from, to: req.query.to }),
    ));
  } catch (error) {
    next(error);
  }
});

router.get("/admin/guardians", asAdmin, async (req, res, next) => {
  try {
    res.json(GetGuardianAccountsResponse.parse(await guardianAccounts(req.user!)));
  } catch (error) {
    next(error);
  }
});

router.post("/admin/guardians/link", asAdmin, async (req, res, next) => {
  try {
    const parsed = LinkChildBody.safeParse(req.body);
    if (!parsed.success) throw badRequest("Холбоосын мэдээлэл буруу байна.", "INVALID_INPUT");
    res.json(LinkChildResponse.parse(await linkChild(req.user!, parsed.data)));
  } catch (error) {
    next(error);
  }
});

router.post("/admin/guardians/unlink", asAdmin, async (req, res, next) => {
  try {
    const parsed = UnlinkChildBody.safeParse(req.body);
    if (!parsed.success) throw badRequest("Холбоосын мэдээлэл буруу байна.", "INVALID_INPUT");
    res.json(UnlinkChildResponse.parse(await unlinkChild(req.user!, parsed.data)));
  } catch (error) {
    next(error);
  }
});

router.post("/admin/guardians/accounts", asAdmin, async (req, res, next) => {
  try {
    const parsed = CreateGuardianBody.safeParse(req.body);
    if (!parsed.success) throw badRequest("Бүртгэлийн мэдээлэл буруу байна.", "INVALID_INPUT");
    res.status(201).json(CreateGuardianResponse.parse(
      await createGuardian(req.user!, parsed.data),
    ));
  } catch (error) {
    next(error);
  }
});

router.get("/admin/guardians/class-children", asAdmin, async (req, res, next) => {
  try {
    const classId = positiveId(req.query.classId, "Ангийн дугаар буруу байна.", "INVALID_CLASS_ID");
    res.json(GetClassChildrenResponse.parse(await classChildren(req.user!, classId)));
  } catch (error) {
    next(error);
  }
});

export default router;
