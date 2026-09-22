import { Router, type IRouter } from 'express';
import {
  GetAssessmentSheetResponse,
  GetClassSkillsResponse,
  GetItemAnalysisResponse,
  GetTeacherReviewQueueResponse,
  SubmitAssessmentBody,
  SubmitAssessmentResponse,
} from '@workspace/api-zod';
import { requireRole } from '../../middlewares/auth';
import { badRequest } from '../../shared/http-error';
import {
  assessmentSheet,
  classSkillsForTeacher,
  itemAnalysis,
  submitAssessment,
  teacherReviewQueue,
} from './service';

const router: IRouter = Router();
const asTeacher = requireRole('TEACHER', 'ADMIN');

const positiveId = (raw: unknown, message: string, code: string) => {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw badRequest(message, code);
  return value;
};

const optionalId = (raw: unknown, message: string, code: string) =>
  raw === undefined ? null : positiveId(raw, message, code);

router.get('/teacher/assessment-sheet', asTeacher, async (req, res, next) => {
  try {
    const result = await assessmentSheet(
      req.user!,
      positiveId(req.query.classId, 'Ангийн дугаар буруу байна.', 'INVALID_CLASS_ID'),
      optionalId(req.query.skillId, 'Чадварын дугаар буруу байна.', 'INVALID_SKILL_ID'),
      optionalId(req.query.subjectId, 'Хичээлийн дугаар буруу байна.', 'INVALID_SUBJECT_ID'),
    );
    res.json(GetAssessmentSheetResponse.parse(result));
  } catch (error) {
    next(error);
  }
});

router.post('/teacher/assessments', asTeacher, async (req, res, next) => {
  try {
    const parsed = SubmitAssessmentBody.safeParse(req.body);
    if (!parsed.success) throw badRequest('Үнэлгээний бүрдэл буруу байна.', 'INVALID_ASSESSMENT');
    res.status(201).json(SubmitAssessmentResponse.parse(
      await submitAssessment(req.user!, parsed.data),
    ));
  } catch (error) {
    next(error);
  }
});

router.get('/teacher/item-analysis', asTeacher, async (req, res, next) => {
  try {
    const classId = positiveId(req.query.classId, 'Ангийн дугаар буруу байна.', 'INVALID_CLASS_ID');
    res.json(GetItemAnalysisResponse.parse(await itemAnalysis(req.user!, classId)));
  } catch (error) {
    next(error);
  }
});

router.get('/teacher/class-skills', asTeacher, async (req, res, next) => {
  try {
    const result = await classSkillsForTeacher(
      req.user!,
      positiveId(req.query.classId, 'Ангийн дугаар буруу байна.', 'INVALID_CLASS_ID'),
      optionalId(req.query.subjectId, 'Хичээлийн дугаар буруу байна.', 'INVALID_SUBJECT_ID'),
    );
    res.json(GetClassSkillsResponse.parse(result));
  } catch (error) {
    next(error);
  }
});

router.get('/teacher/review-queue', asTeacher, async (req, res, next) => {
  try {
    res.json(GetTeacherReviewQueueResponse.parse(await teacherReviewQueue(req.user!)));
  } catch (error) {
    next(error);
  }
});

export default router;
