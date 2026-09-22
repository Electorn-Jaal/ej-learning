import { Router, type IRouter } from "express";
import { AssignExtraWorkBody, AssignExtraWorkResponse } from "@workspace/api-zod";
import { requireRole } from "../../middlewares/auth";
import { badRequest } from "../../shared/http-error";
import { assignExtraWork } from "./service";

const router: IRouter = Router();

router.post("/teacher/assignments", requireRole("TEACHER", "ADMIN"), async (req, res, next) => {
  try {
    const parsed = AssignExtraWorkBody.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest("Даалгаврын мэдээлэл буруу байна.", "INVALID_INPUT");
    }
    res.status(201).json(
      AssignExtraWorkResponse.parse(await assignExtraWork(req.user!, parsed.data)),
    );
  } catch (error) {
    next(error);
  }
});

export default router;
