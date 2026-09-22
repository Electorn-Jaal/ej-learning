import { Router, type IRouter } from 'express';
import {
  GetStudentPlanResponse,
  SaveStudentPlanBody,
  SaveStudentPlanResponse,
} from '@workspace/api-zod';
import { requireRole } from '../../middlewares/auth';
import { badRequest } from '../../shared/http-error';
import { saveStudentPlan, studentPlan } from './service';

const router: IRouter = Router();
const asStudent = requireRole('STUDENT');

router.get('/student/plan', asStudent, async (req, res, next) => {
  try {
    res.json(GetStudentPlanResponse.parse(await studentPlan(req.user!, req.query.date)));
  } catch (error) {
    next(error);
  }
});

router.put('/student/plan', asStudent, async (req, res, next) => {
  try {
    const parsed = SaveStudentPlanBody.safeParse(req.body);
    if (!parsed.success) throw badRequest('Төлөвлөгөө буруу байна.', 'INVALID_PLAN');
    res.json(SaveStudentPlanResponse.parse(await saveStudentPlan(req.user!, parsed.data)));
  } catch (error) {
    next(error);
  }
});

export default router;
