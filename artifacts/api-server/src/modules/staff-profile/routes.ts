import express, { Router, type IRouter } from "express";
import {
  AddStaffFieldBody,
  GetStaffFieldsResponse,
  GetTeacherCardResponse,
  GetStaffListResponse,
  GetStaffProfileResponse,
  SaveStaffProfileBody,
  UpdateStaffFieldBody,
} from "@workspace/api-zod";
import { requireRole } from "../../middlewares/auth";
import { badRequest } from "../../shared/http-error";
import {
  addField,
  editField,
  fieldList,
  ownPhotoFile,
  teacherCard,
  photoFile,
  profile,
  saveProfile,
  savePhoto,
  staffList,
} from "./service";

const router: IRouter = Router();
const asStaff = requireRole("TEACHER", "ADMIN");
const asAdmin = requireRole("ADMIN");

const teacherId = (raw: unknown) => {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw badRequest("Ажилтны дугаар буруу байна.", "INVALID_TEACHER_ID");
  }
  return id;
};

router.get("/staff/fields", asStaff, async (req, res, next) => {
  try {
    res.json(GetStaffFieldsResponse.parse(await fieldList(req.user!)));
  } catch (error) {
    next(error);
  }
});

router.get("/staff", asAdmin, async (req, res, next) => {
  try {
    res.json(GetStaffListResponse.parse(await staffList(req.user!)));
  } catch (error) {
    next(error);
  }
});

/** The signed-in member of staff's own record. */
router.get("/staff/me", asStaff, async (req, res, next) => {
  try {
    res.json(GetStaffProfileResponse.parse(await profile(req.user!, null)));
  } catch (error) {
    next(error);
  }
});

router.patch("/staff/me", asStaff, async (req, res, next) => {
  try {
    const parsed = SaveStaffProfileBody.safeParse(req.body);
    if (!parsed.success) throw badRequest("Талбарын утга буруу байна.", "INVALID_INPUT");
    res.json(GetStaffProfileResponse.parse(
      await saveProfile(req.user!, null, parsed.data.fields),
    ));
  } catch (error) {
    next(error);
  }
});

/**
 * The teacher as their class sees them, which any signed-in member of the
 * school may read. Declared before /staff/:teacherId so the narrower route
 * wins: a child asking for a card must not fall through to the full record.
 */
router.get(
  "/staff/:teacherId/card",
  requireRole("STUDENT", "TEACHER", "ADMIN"),
  async (req, res, next) => {
    try {
      res.json(GetTeacherCardResponse.parse(await teacherCard(teacherId(req.params.teacherId))));
    } catch (error) {
      next(error);
    }
  },
);

router.get("/staff/:teacherId", asStaff, async (req, res, next) => {
  try {
    res.json(GetStaffProfileResponse.parse(
      await profile(req.user!, teacherId(req.params.teacherId)),
    ));
  } catch (error) {
    next(error);
  }
});

router.patch("/staff/:teacherId", asStaff, async (req, res, next) => {
  try {
    const parsed = SaveStaffProfileBody.safeParse(req.body);
    if (!parsed.success) throw badRequest("Талбарын утга буруу байна.", "INVALID_INPUT");
    res.json(GetStaffProfileResponse.parse(
      await saveProfile(req.user!, teacherId(req.params.teacherId), parsed.data.fields),
    ));
  } catch (error) {
    next(error);
  }
});

router.post("/admin/staff/fields", asAdmin, async (req, res, next) => {
  try {
    const parsed = AddStaffFieldBody.safeParse(req.body);
    if (!parsed.success) throw badRequest("Талбарын мэдээлэл буруу байна.", "INVALID_INPUT");
    res.status(201).json(GetStaffFieldsResponse.parse(await addField(req.user!, parsed.data)));
  } catch (error) {
    next(error);
  }
});

router.patch("/admin/staff/fields/:fieldId", asAdmin, async (req, res, next) => {
  try {
    const parsed = UpdateStaffFieldBody.safeParse(req.body);
    if (!parsed.success) throw badRequest("Талбарын мэдээлэл буруу байна.", "INVALID_INPUT");
    const id = Number(req.params.fieldId);
    if (!Number.isInteger(id) || id <= 0) {
      throw badRequest("Талбарын дугаар буруу байна.", "INVALID_FIELD_ID");
    }
    res.json(GetStaffFieldsResponse.parse(await editField(req.user!, id, parsed.data)));
  } catch (error) {
    next(error);
  }
});

/**
 * A photograph is a few hundred kilobytes, so the limit is generous but
 * finite. Raw rather than multipart, for the same reason the textbook upload
 * is: one file needs no envelope.
 */
const photoBody = express.raw({
  type: ["image/jpeg", "image/png", "image/webp"],
  limit: "8mb",
});

router.post("/staff/:teacherId/photo", asStaff, photoBody, async (req, res, next) => {
  try {
    if (!Buffer.isBuffer(req.body)) throw badRequest("Зураг ирсэнгүй.", "NO_BODY");
    const result = await savePhoto(req.user!, teacherId(req.params.teacherId), {
      bytes: req.body,
      contentType: String(req.headers["content-type"] ?? "").split(";")[0]!.trim(),
    });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * The signed-in person's own photograph.
 *
 * Addressed by the session rather than by an id, because the shell draws this
 * for whoever is looking - a child included - and a child has no teacher row
 * to name in a URL.
 */
router.get(
  "/me/photo",
  requireRole("STUDENT", "TEACHER", "ADMIN"),
  async (req, res, next) => {
    try {
      const found = await ownPhotoFile(req.user!);
      if (!found) {
        res.status(404).json({ error: "Зураг алга." });
        return;
      }
      res.type(found.mimeType);
      res.setHeader("Cache-Control", "private, max-age=300");
      res.sendFile(found.filePath);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * Served to any signed-in member of the school. A face is not a secret inside
 * the building, and the alternative - a signed URL per avatar - buys nothing
 * for a photograph the person chose to upload.
 */
router.get("/staff/:teacherId/photo", requireRole("TEACHER", "ADMIN", "STUDENT"), async (req, res, next) => {
  try {
    const found = await photoFile(teacherId(req.params.teacherId));
    if (!found) {
      res.status(404).json({ error: "Зураг алга." });
      return;
    }
    res.type(found.mimeType);
    res.setHeader("Cache-Control", "private, max-age=300");
    res.sendFile(found.filePath);
  } catch (error) {
    next(error);
  }
});

export default router;
