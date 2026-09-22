import { Router, type IRouter } from 'express';
import {
  GetStudentAssignmentResponse, GetStudentDashboardResponse,
  GetStudentPlacementsResponse, GetStudentRecordResponse, GetStudentProgressResponse, GetStudentSubjectsResponse,
} from '@workspace/api-zod';
import { requireRole } from '../../middlewares/auth';
import * as service from './service';

const router: IRouter = Router();
const asStudent = requireRole('STUDENT');

router.get('/student/subjects', asStudent, async (req, res, next) => {
  try {
    res.json(GetStudentSubjectsResponse.parse(await service.studentSubjects(req.user!)));
  } catch (error) {
    next(error);
  }
});

router.get('/student/dashboard', asStudent, async (req, res, next) => {
  try {
    res.json(GetStudentDashboardResponse.parse(await service.studentDashboard(req.user!)));
  } catch (error) {
    next(error);
  }
});

router.get('/student/assignments/:assignmentId', asStudent, async (req, res, next) => {
  try {
    res.json(GetStudentAssignmentResponse.parse(
      await service.studentAssignment(req.user!, String(req.params.assignmentId)),
    ));
  } catch (error) {
    next(error);
  }
});

router.get('/student/progress', asStudent, async (req, res, next) => {
  try {
    res.json(GetStudentProgressResponse.parse(await service.studentProgress(req.user!)));
  } catch (error) {
    next(error);
  }
});

router.get('/student/placements', asStudent, async (req, res, next) => {
  try {
    res.json(GetStudentPlacementsResponse.parse(await service.studentPlacements(req.user!)));
  } catch (error) {
    next(error);
  }
});

router.get('/student/record', asStudent, async (req, res, next) => {
  try {
    res.json(GetStudentRecordResponse.parse(await service.studentRecord(req.user!)));
  } catch (error) {
    next(error);
  }
});

export default router;
