import express, { Router, type IRouter } from "express";
import {
  GetAdminMaterialsResponse,
  GetLibraryBooksResponse,
  GetMaterialOutlineResponse,
  GetSkillChainResponse,
  GetSkillMapResponse,
  GetTeacherCatalogResponse,
  SaveMaterialOutlineBody,
  SaveMaterialOutlineResponse,
  SetMaterialPageOffsetBody,
  SetMaterialPageOffsetResponse,
  UploadMaterialFileResponse,
} from "@workspace/api-zod";
import { requireRole } from "../../middlewares/auth";
import { badRequest, unauthorized } from "../../shared/http-error";
import {
  listMaterials,
  libraryBooks,
  materialCover,
  materialFile,
  materialOutline,
  saveOutline,
  skillChain,
  skillMap,
  teacherCatalog,
  storeMaterialFile,
  updatePageOffset,
} from "./service";

const router: IRouter = Router();
const asAdmin = requireRole("ADMIN");

router.get("/content/library", requireRole("STUDENT", "TEACHER", "ADMIN"), async (_req, res, next) => {
  try {
    res.json(GetLibraryBooksResponse.parse(await libraryBooks()));
  } catch (error) { next(error); }
});

router.get('/content/materials/:materialId/cover', requireRole('STUDENT', 'TEACHER', 'ADMIN'), async (req, res, next) => {
  try {
    const cover = await materialCover(materialId(req.params.materialId));
    if (!cover) { res.status(404).json({ error: 'Номын хавтас бэлэн биш байна.', code: 'COVER_NOT_FOUND' }); return; }
    res.type('image/jpeg').setHeader('Cache-Control', 'private, max-age=3600');
    res.sendFile(cover, (error) => { if (error) next(error); });
  } catch (error) { next(error); }
});

const materialId = (raw: unknown) => {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw badRequest("Материалын дугаар буруу байна.", "INVALID_MATERIAL_ID");
  }
  return value;
};

router.get("/admin/materials", asAdmin, async (_req, res, next) => {
  try {
    res.json(GetAdminMaterialsResponse.parse(await listMaterials()));
  } catch (error) {
    next(error);
  }
});

router.get("/admin/skill-chain", asAdmin, async (_req, res, next) => {
  try {
    res.json(GetSkillChainResponse.parse(await skillChain()));
  } catch (error) {
    next(error);
  }
});

router.get("/admin/skill-map", asAdmin, async (_req, res, next) => {
  try {
    res.json(GetSkillMapResponse.parse(await skillMap()));
  } catch (error) {
    next(error);
  }
});

router.get("/admin/materials/:materialId/outline", asAdmin, async (req, res, next) => {
  try {
    const outline = await materialOutline(materialId(req.params.materialId));
    res.json(GetMaterialOutlineResponse.parse(outline));
  } catch (error) {
    next(error);
  }
});

router.put("/admin/materials/:materialId/outline", asAdmin, async (req, res, next) => {
  try {
    const parsed = SaveMaterialOutlineBody.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest("Бүтцийн мэдээлэл буруу байна.", "INVALID_OUTLINE");
    }
    const saved = await saveOutline(materialId(req.params.materialId), parsed.data);
    res.json(SaveMaterialOutlineResponse.parse(saved));
  } catch (error) {
    next(error);
  }
});

/**
 * A textbook scan is 3-5 MB, so the limit is generous but finite - an
 * unbounded body is a way to fill the disk. Raw rather than multipart: one
 * file needs no envelope, and it saves a dependency whose only job would be
 * to unwrap it.
 */
const pdfBody = express.raw({ type: "application/pdf", limit: "64mb" });

router.post(
  "/admin/materials/:materialId/file/:filename",
  asAdmin,
  pdfBody,
  async (req, res, next) => {
    try {
      const filename = String(req.params.filename ?? "").trim();
      if (!filename) {
        throw badRequest("Файлын нэр алга.", "MISSING_FILENAME");
      }
      if (!Buffer.isBuffer(req.body)) {
        throw badRequest("PDF агуулга ирсэнгүй.", "NO_BODY");
      }

      const stored = await storeMaterialFile(
        materialId(req.params.materialId),
        { bytes: req.body, filename },
        0,
        req.user!.username,
      );
      res.status(201).json(UploadMaterialFileResponse.parse(stored));
    } catch (error) {
      next(error);
    }
  },
);

router.put("/admin/materials/:materialId/page-offset", asAdmin, async (req, res, next) => {
  try {
    const parsed = SetMaterialPageOffsetBody.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest("Хуудасны зөрүү буруу байна.", "INVALID_PAGE_OFFSET");
    }
    const updated = await updatePageOffset(
      materialId(req.params.materialId),
      parsed.data.pageOffset,
      req.user!.username,
    );
    res.json(SetMaterialPageOffsetResponse.parse(updated));
  } catch (error) {
    next(error);
  }
});

// Any signed-in account may read an approved book. Which lesson points at it
// is what differs per student, not the book itself.
router.get("/content/materials/:materialId/file", async (req, res, next) => {
  try {
    if (!req.user) throw unauthorized("Нэвтэрнэ үү.", "NOT_AUTHENTICATED");

    const materialId = Number(req.params.materialId);
    if (!Number.isInteger(materialId) || materialId <= 0) {
      throw badRequest("Материалын дугаар буруу байна.", "INVALID_MATERIAL_ID");
    }

    const file = await materialFile(materialId);
    if (!file) {
      res.status(404).json({
        error: "Баталгаажсан файл олдсонгүй.",
        code: "FILE_NOT_FOUND",
      });
      return;
    }

    res.type(file.mimeType);
    // inline: the viewer opens it in place, and a #page=N fragment lands the
    // student on the pages their lesson covers.
    res.setHeader(
      "Content-Disposition",
      `inline; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
    );
    res.sendFile(file.filePath, (error) => {
      if (error) next(error);
    });
  } catch (error) {
    next(error);
  }
});

// The whole approved library, for staff browsing what exists. Not scoped by
// class: a teacher choosing material looks past their own timetable.
router.get("/teacher/catalog", requireRole("TEACHER", "ADMIN"), async (_req, res, next) => {
  try {
    res.json(GetTeacherCatalogResponse.parse(await teacherCatalog()));
  } catch (error) {
    next(error);
  }
});

export default router;
