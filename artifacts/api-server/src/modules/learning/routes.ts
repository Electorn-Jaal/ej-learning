import { Router, type IRouter } from "express";
import {
  GetStudentTodayResponse,
  GetTeacherScheduleResponse,
} from "@workspace/api-zod";
import { requireRole } from "../../middlewares/auth";
import { badRequest, unauthorized } from "../../shared/http-error";
import { materialFile, studentToday, teacherSchedule } from "./service";

const router: IRouter = Router();

router.get(
  "/student/today",
  requireRole("STUDENT"),
  async (req, res, next) => {
    try {
      res.json(GetStudentTodayResponse.parse(await studentToday(req.user!)));
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/teacher/schedule",
  requireRole("TEACHER", "ADMIN"),
  async (req, res, next) => {
    try {
      const classId = Number(req.query.classId);
      if (!Number.isInteger(classId) || classId <= 0) {
        throw badRequest("Ангийн дугаар буруу байна.", "INVALID_CLASS_ID");
      }
      const schedule = await teacherSchedule(req.user!, {
        classId,
        from: req.query.from,
        to: req.query.to,
      });
      res.json(GetTeacherScheduleResponse.parse(schedule));
    } catch (error) {
      next(error);
    }
  },
);

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

export default router;
