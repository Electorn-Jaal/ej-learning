import express, { Router, type IRouter } from "express";
import {
  GetAdminMaterialsResponse,
  GetMaterialOutlineResponse,
  GetSkillChainResponse,
  GetSkillMapResponse,
  SaveMaterialOutlineBody,
  SaveMaterialOutlineResponse,
  SetMaterialPageOffsetBody,
  SetMaterialPageOffsetResponse,
  UploadMaterialFileResponse,
} from "@workspace/api-zod";
import { requireRole } from "../../middlewares/auth";
import { badRequest } from "../../shared/http-error";
import {
  listMaterials,
  materialOutline,
  saveOutline,
  skillChain,
  skillMap,
  storeMaterialFile,
  updatePageOffset,
} from "./service";

const router: IRouter = Router();
const asAdmin = requireRole("ADMIN");

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

export default router;
