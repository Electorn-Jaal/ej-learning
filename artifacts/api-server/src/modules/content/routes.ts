import { Router, type IRouter } from "express";
import {
  GetAdminMaterialsResponse,
  GetMaterialOutlineResponse,
  SaveMaterialOutlineBody,
  SaveMaterialOutlineResponse,
} from "@workspace/api-zod";
import { requireRole } from "../../middlewares/auth";
import { badRequest } from "../../shared/http-error";
import { listMaterials, materialOutline, saveOutline } from "./service";

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

export default router;
