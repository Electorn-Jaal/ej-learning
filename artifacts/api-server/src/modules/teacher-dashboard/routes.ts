import { Router, type IRouter } from "express";
import {
  GetTeacherDashboardResponse,
  GetWorkspaceIntegrationDashboardResponse,
} from "@workspace/api-zod";
import { requireRole } from "../../middlewares/auth";
import { teacherDashboard, workspaceIntegration } from "./service";

const router: IRouter = Router();

router.get("/teacher/dashboard", requireRole("TEACHER", "ADMIN"), async (req, res, next) => {
  try {
    res.json(GetTeacherDashboardResponse.parse(await teacherDashboard(req.user!)));
  } catch (error) {
    next(error);
  }
});

router.get(
  "/teacher/integrations/workspace",
  requireRole("TEACHER", "ADMIN"),
  (_req, res, next) => {
    try {
      res.json(GetWorkspaceIntegrationDashboardResponse.parse(workspaceIntegration()));
    } catch (error) {
      next(error);
    }
  },
);

export default router;
