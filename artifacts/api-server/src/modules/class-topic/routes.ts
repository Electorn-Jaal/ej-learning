import { Router, type IRouter } from 'express';
import {
  GetTeacherClassTopicsResponse, GetTeacherOutlineChoicesResponse,
  SetClassTopicBody, SetClassTopicResponse,
} from '@workspace/api-zod';
import { requireRole } from '../../middlewares/auth';
import { badRequest } from '../../shared/http-error';
import * as service from './service';

const router: IRouter = Router();
const asTeacher = requireRole('TEACHER', 'ADMIN');

router.get('/teacher/class-topics', asTeacher, async (req, res, next) => {
  try {
    res.json(GetTeacherClassTopicsResponse.parse(await service.teacherClassTopics(req.user!)));
  } catch (error) {
    next(error);
  }
});

router.get('/teacher/class-topics/:classId/:subjectCode/sections', asTeacher,
  async (req, res, next) => {
    try {
      res.json(GetTeacherOutlineChoicesResponse.parse(await service.teacherOutlineChoices(
        req.user!, String(req.params.classId), String(req.params.subjectCode),
      )));
    } catch (error) {
      next(error);
    }
  });

router.put('/teacher/class-topic', asTeacher, async (req, res, next) => {
  try {
    const parsed = SetClassTopicBody.safeParse(req.body);
    if (!parsed.success) throw badRequest(parsed.error.message, 'INVALID_CLASS_TOPIC');
    res.json(SetClassTopicResponse.parse(await service.setClassTopic(req.user!, parsed.data)));
  } catch (error) {
    next(error);
  }
});

export default router;
