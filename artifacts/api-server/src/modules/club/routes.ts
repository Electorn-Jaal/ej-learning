import { Router, type IRouter } from "express";
import {
  GetClubsResponse,
  CreateClubBody,
  CreateClubResponse,
  GetClubMembersResponse,
  SetClubMembersBody,
  SetClubMembersResponse,
  SetClubActiveBody,
  SetClubActiveResponse,
} from "@workspace/api-zod";
import { requireRole } from "../../middlewares/auth";
import { badRequest } from "../../shared/http-error";
import { clubMembers, createClub, listClubs, setActive, setMembers } from "./service";

const router: IRouter = Router();
const asStaff = requireRole("TEACHER", "ADMIN");

const positiveId = (raw: unknown, message: string, code: string) => {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw badRequest(message, code);
  return value;
};

router.get("/teacher/clubs", asStaff, async (req, res, next) => {
  try {
    res.json(GetClubsResponse.parse(await listClubs(req.user!)));
  } catch (error) {
    next(error);
  }
});

router.post("/teacher/clubs", asStaff, async (req, res, next) => {
  try {
    const parsed = CreateClubBody.safeParse(req.body);
    if (!parsed.success) throw badRequest("Дугуйлангийн мэдээлэл буруу байна.", "INVALID_INPUT");
    res.status(201).json(CreateClubResponse.parse(await createClub(req.user!, parsed.data)));
  } catch (error) {
    next(error);
  }
});

router.get("/teacher/clubs/:clubId/members", asStaff, async (req, res, next) => {
  try {
    const id = positiveId(req.params.clubId, "Дугуйлангийн дугаар буруу байна.", "INVALID_CLUB_ID");
    res.json(GetClubMembersResponse.parse(await clubMembers(req.user!, id)));
  } catch (error) {
    next(error);
  }
});

router.put("/teacher/clubs/:clubId/members", asStaff, async (req, res, next) => {
  try {
    const id = positiveId(req.params.clubId, "Дугуйлангийн дугаар буруу байна.", "INVALID_CLUB_ID");
    const parsed = SetClubMembersBody.safeParse(req.body);
    if (!parsed.success) throw badRequest("Сурагчдын жагсаалт буруу байна.", "INVALID_INPUT");
    res.json(SetClubMembersResponse.parse(
      await setMembers(req.user!, id, parsed.data.studentIds),
    ));
  } catch (error) {
    next(error);
  }
});

router.put("/teacher/clubs/:clubId/active", asStaff, async (req, res, next) => {
  try {
    const id = positiveId(req.params.clubId, "Дугуйлангийн дугаар буруу байна.", "INVALID_CLUB_ID");
    const parsed = SetClubActiveBody.safeParse(req.body);
    if (!parsed.success) throw badRequest("Утга буруу байна.", "INVALID_INPUT");
    res.json(SetClubActiveResponse.parse(
      await setActive(req.user!, id, parsed.data.isActive),
    ));
  } catch (error) {
    next(error);
  }
});

export default router;
