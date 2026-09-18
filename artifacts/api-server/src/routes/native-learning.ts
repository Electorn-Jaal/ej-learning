import { teacherClassOptions } from '../modules/learning/repository';
import { Router, type IRouter, type Request } from 'express';
import {
  GetCurrentUserResponse, GetPreviewStudentsResponse, GetStudentDashboardResponse,
  GetStudentAssignmentResponse, GetStudentProgressResponse, GetStudentSubjectsResponse,
  GetTeacherClassesResponse, GetTeacherReviewQueueResponse,
  GetTeacherCatalogResponse, GetWorkspaceIntegrationDashboardResponse,
} from '@workspace/api-zod';
import { requireRole } from '../middlewares/auth';
import { forbidden } from '../shared/http-error';
import * as data from '../lib/native-learning';

const router: IRouter = Router();
const serializable = (value: unknown): unknown => JSON.parse(JSON.stringify(value));
const dataNotice = 'Сургалтын агуулга хараахан оруулаагүй байна.';

const asStudent = requireRole('STUDENT');
const asTeacher = requireRole('TEACHER', 'ADMIN');

/** The signed-in account's own student record. No account can read another's. */
async function currentStudent(req: Request) {
  const studentId = req.user?.studentId;
  if (studentId === null || studentId === undefined) {
    throw forbidden(
      'Энэ бүртгэл сурагчийн бүртгэлтэй холбогдоогүй байна.',
      'NO_STUDENT_LINK',
    );
  }
  const [student] = await data.studentById(studentId);
  if (!student) {
    throw Object.assign(new Error('Идэвхтэй сурагч олдсонгүй.'), { status: 404 });
  }
  return student;
}

const handle = (fn: (req: Request, res: import('express').Response) => Promise<void>) =>
  (req: Request, res: import('express').Response, next: import('express').NextFunction) => {
    fn(req, res).catch(next);
  };

// A teacher legitimately lists the students they are responsible for - which
// is narrower than every student in the school. The role check alone does not
// establish whose students these are, so the query is scoped to the classes
// this teacher is assigned to. An admin sees everybody.
router.get('/preview/students', asTeacher, handle(async (req, res) => {
  const user = req.user!;
  res.json(GetPreviewStudentsResponse.parse(
    await data.studentsForTeacher(user.teacherId, user.roles.includes('ADMIN')),
  ));
}));

router.get('/session/me', handle(async (req, res) => {
  if (!req.user) throw forbidden('Нэвтэрнэ үү.', 'NOT_AUTHENTICATED');
  const isStudent = req.user.roles.includes('STUDENT');
  const student = isStudent ? await currentStudent(req) : null;
  res.json(GetCurrentUserResponse.parse({
    id: String(req.user.id),
    displayName: req.user.displayName,
    role: isStudent ? 'student' : req.user.roles.includes('ADMIN') ? 'admin' : 'teacher',
    gradeLevel: student?.gradeLevel ?? 0,
    className: student?.className ?? '',
    isDemo: false,
    authConfigured: true,
  }));
}));

router.get('/student/subjects', asStudent, handle(async (req, res) => {
  const student = await currentStudent(req);
  const [subjects, lessons] = await Promise.all([
    data.subjects(student.id),
    data.approvedLessons(student.id),
  ]);
  res.json(GetStudentSubjectsResponse.parse(subjects.map(subject => ({
    ...subject,
    approvedLessons: lessons.filter(lesson => lesson.subjectCode === subject.code).length,
  }))));
}));

router.get('/student/dashboard', asStudent, handle(async (req, res) => {
  const student = await currentStudent(req);
  const lessons = await data.approvedLessons(student.id);
  res.json(GetStudentDashboardResponse.parse({
    displayName: student.displayName,
    dateLabel: new Intl.DateTimeFormat('mn-MN', { dateStyle: 'long', timeZone: 'Asia/Ulaanbaatar' }).format(new Date()),
    currentStreak: 0, completedToday: 0, totalToday: 0,
    focusTopic: 'Баталгаажсан хичээлийн сан',
    activities: lessons.map(lesson => ({
      ...lesson, activityType: 'lesson', status: 'not_started',
      actionLabel: 'Унших', actionPath: `/assignment/${lesson.id}`, steps: [],
      materialAvailable: Boolean(lesson.explanation || lesson.example || lesson.practice),
    })),
    subjects: [],
    dataNotice: `${dataNotice} Өдөр тутмын ажил оноох урсгал хараахан холбогдоогүй; зөвхөн баталгаажсан хичээл харагдана.`,
  }));
}));

router.get('/student/assignments/:assignmentId', asStudent, handle(async (req, res) => {
  const student = await currentStudent(req);
  const lesson = (await data.approvedLessons(student.id))
    .find(item => item.id === req.params.assignmentId);
  if (!lesson) {
    res.status(404).json({ error: 'Баталгаажсан, тухайн ангид тохирох хичээл олдсонгүй.' });
    return;
  }
  res.json(GetStudentAssignmentResponse.parse({
    ...lesson, activityType: 'lesson', status: 'not_started', materialVersion: null,
    materialBlocks: [
      { kind: 'explanation', title: 'Тайлбар', body: lesson.explanation },
      { kind: 'example', title: 'Жишээ', body: lesson.example },
      { kind: 'practice', title: 'Дадлага', body: lesson.practice },
    ].filter(block => block.body?.trim()).map(block => ({ ...block, pageLabel: null, available: true })),
    question: null, answerKeyVisible: false, completedSteps: [], readOnly: true, dataNotice,
  }));
}));

router.get('/student/progress', asStudent, handle(async (req, res) => {
  const student = await currentStudent(req);
  const [skills, attempts] = await Promise.all([
    data.progressSkills(student.id),
    data.attemptHistory(student.id),
  ]);
  res.json(GetStudentProgressResponse.parse(serializable({
    skills, attempts,
    dataNotice:
      'Чадварын хувь нь сүүлийн хариултыг илүү жинтэйгээр, өмнөх хариултуудтай нийлүүлж бодогддог. Нэг удаагийн сайн дүнгээр эзэмшсэн гэж тооцохгүй.',
  })));
}));

router.get('/teacher/classes', asTeacher, handle(async (req, res) => {
  // Scoped to what this teacher actually teaches. The previous listing returned
  // every class in the school, so a picker built from it offered rows that
  // answered 403 as soon as one was chosen.
  const user = req.user!;
  res.json(GetTeacherClassesResponse.parse(
    await teacherClassOptions(user.teacherId, user.roles.includes('ADMIN')),
  ));
}));

router.get('/teacher/catalog', asTeacher, handle(async (_req, res) => {
  res.json(GetTeacherCatalogResponse.parse(await data.catalog()));
}));

router.get('/teacher/review-queue', asTeacher, handle(async (req, res) => {
  const user = req.user!;
  res.json(GetTeacherReviewQueueResponse.parse(serializable(
    await data.reviewQueue(user.teacherId, user.roles.includes('ADMIN')),
  )));
}));

router.get('/teacher/integrations/workspace', asTeacher, handle(async (_req, res) => {
  res.json(GetWorkspaceIntegrationDashboardResponse.parse({
    mode: 'not_connected', systemOfRecord: 'EJ Learning PostgreSQL',
    principle: 'Үндсэн бүртгэл PostgreSQL-д байна. Google-ийн бодит холболт хийгдээгүй.',
    sources: [
      { source: 'classroom', role: 'Анги, сурагчийн холбоос' },
      { source: 'sheets', role: 'Материал, асуултын импорт' },
      { source: 'drive', role: 'Эх материалын файл' },
      { source: 'forms', role: 'Нэмэлт оношилгооны эх сурвалж' },
    ].map(source => ({ ...source, status: source.source === 'forms' ? 'optional' : 'not_connected', recordCount: 0, lastSyncAt: null })),
    entities: [
      { name: 'Сурагч ба анги', ownership: 'postgresql', fields: ['core.students', 'core.classes', 'core.student_enrollments'], relation: 'Сурагч → ангийн бүртгэл' },
      { name: 'Импорт', ownership: 'postgresql', fields: ['staging.import_jobs', 'staging.import_rows'], relation: 'Эх сурвалж → шалгах мөр → баталгаажуулалт' },
      { name: 'Эх материал', ownership: 'postgresql', fields: ['content.source_materials', 'content.source_versions'], relation: 'Материал → файлын хувилбар' },
    ],
    pipeline: ['Эх сурвалж', 'Ноорог импорт', 'Шалгалт', 'Баталгаажуулалт', 'Сургалтын материал'],
    courses: [], importBatches: [], auditEvents: [],
    dataNotice: 'Google account холбогдоогүй.',
  }));
}));

export default router;
