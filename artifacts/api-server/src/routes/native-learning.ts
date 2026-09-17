import { Router, type IRouter, type Request } from 'express';
import { readRows } from '@workspace/db';
import {
  GetCurrentUserResponse, GetPreviewStudentsResponse, GetStudentDashboardResponse,
  GetStudentAssignmentResponse, GetStudentProgressResponse, GetStudentSubjectsResponse,
  GetTeacherClassesResponse, GetTeacherDashboardResponse, GetTeacherReviewQueueResponse,
  GetTeacherCatalogResponse, GetWorkspaceIntegrationDashboardResponse,
} from '@workspace/api-zod';
import * as data from '../lib/native-learning';

const router: IRouter = Router();
const serializable = (value: unknown): unknown => JSON.parse(JSON.stringify(value));
const readOnlyNotice = 'Бодит өгөгдлийн санг зөвхөн уншиж байна. Нэвтрэлт, хариулт хадгалах болон үнэлэх урсгал хараахан холбогдоогүй.';

// Explicit local data preview, not a substitute for authentication.
router.use((req, res, next) => {
  const loopback = ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '');
  const localHostname = (value: string) => ['localhost','127.0.0.1','[::1]'].includes(value);
  let localOrigin = true;
  try { if (req.headers.origin) localOrigin = localHostname(new URL(req.headers.origin).hostname); }
  catch { localOrigin = false; }
  if (process.env.EJ_LOCAL_PREVIEW !== 'true' || process.env.NODE_ENV === 'production' ||
      !loopback || !localHostname(req.hostname) || !localOrigin) {
    res.status(403).json({error:'Орон нутгийн өгөгдөл харах горим идэвхгүй. Нэвтрэлт тохируулах шаардлагатай.'});
    return;
  }
  res.setHeader('Cache-Control','no-store');
  if (!['GET','HEAD','OPTIONS'].includes(req.method)) {
    res.status(409).json({error:readOnlyNotice,code:'READ_ONLY_PREVIEW'});
    return;
  }
  next();
});

async function selectedStudent(req: Request) {
  const id = req.get('X-Preview-Student-Id') ?? process.env.LOCAL_STUDENT_ID;
  if (!id) throw Object.assign(new Error('Харах сурагчаа сонгоно уу.'),{status:409});
  if (!/^[1-9]\d{0,18}$/.test(id) || BigInt(id)>9223372036854775807n)
    throw Object.assign(new Error('Сурагчийн дугаар буруу байна.'),{status:400});
  const student = (await data.students()).find(student => student.id === id);
  if (!student) throw Object.assign(new Error('Идэвхтэй сурагч олдсонгүй.'),{status:404});
  return student;
}

router.get('/preview/students',async (_req,res) => {
  res.json(GetPreviewStudentsResponse.parse(await data.students()));
});
router.get('/session/me',async (req,res) => {
  const student = await selectedStudent(req);
  res.json(GetCurrentUserResponse.parse({...student,role:'student',isDemo:false,authConfigured:false}));
});
router.get('/student/subjects',async (req,res) => {
  const student = await selectedStudent(req);
  const [subjects,lessons] = await Promise.all([data.subjects(student.id),data.approvedLessons(student.id)]);
  res.json(GetStudentSubjectsResponse.parse(subjects.map(subject => ({...subject,
    approvedLessons:lessons.filter(lesson => lesson.subjectCode === subject.code).length,
  }))));
});
router.get('/student/dashboard',async (req,res) => {
  const student = await selectedStudent(req);
  const lessons = await data.approvedLessons(student.id);
  res.json(GetStudentDashboardResponse.parse({
    displayName:student.displayName,
    dateLabel:new Intl.DateTimeFormat('mn-MN',{dateStyle:'long',timeZone:'Asia/Ulaanbaatar'}).format(new Date()),
    currentStreak:0,completedToday:0,totalToday:0,focusTopic:'Баталгаажсан хичээлийн сан',
    activities:lessons.map(lesson => ({...lesson,activityType:'lesson',status:'not_started',
      actionLabel:'Унших',actionPath:`/assignment/${lesson.id}`,steps:[],
      materialAvailable:Boolean(lesson.explanation || lesson.example || lesson.practice),
    })),subjects:[],
    dataNotice: `${readOnlyNotice} Өдөр тутмын ажил оноох бүртгэл энэ схемд байхгүй. Зөвхөн баталгаажсан хичээл харагдана; ноорог материалыг багшийн сангаас харна.`,
  }));
});
router.get('/student/assignments/:assignmentId',async (req,res) => {
  const student = await selectedStudent(req);
  const lesson = (await data.approvedLessons(student.id)).find(item => item.id===req.params.assignmentId);
  if (!lesson) {res.status(404).json({error:'Баталгаажсан, тухайн ангид тохирох хичээл олдсонгүй.'});return;}
  res.json(GetStudentAssignmentResponse.parse({
    ...lesson,activityType:'lesson',status:'not_started',materialVersion:null,
    materialBlocks:[
      {kind:'explanation',title:'Тайлбар',body:lesson.explanation},
      {kind:'example',title:'Жишээ',body:lesson.example},
      {kind:'practice',title:'Дадлага',body:lesson.practice},
    ].filter(block=>block.body?.trim()).map(block=>({...block,pageLabel:null,available:true})),
    question:null,answerKeyVisible:false,completedSteps:[],readOnly:true,dataNotice:readOnlyNotice,
  }));
});
router.get('/student/progress',async (req,res) => {
  const student = await selectedStudent(req);
  const [skills,attempts] = await Promise.all([data.progressSkills(student.id),data.attemptHistory(student.id)]);
  res.json(GetStudentProgressResponse.parse(serializable({skills,attempts,
    dataNotice:'Хадгалагдсан чадварын үнэлгээ болон оношилгооны түүх. Ноорог чадварын өмнөх үнэлгээг түүх болгон харуулна; энэ нь сургалтын материалыг баталгаажуулсан гэсэн үг биш.',
  })));
});
router.get('/teacher/classes',async (_req,res) => {
  res.json(GetTeacherClassesResponse.parse(await data.classes()));
});
router.get('/teacher/dashboard',async (_req,res) => {
  const [counts] = await readRows(`SELECT
    (SELECT count(*)::int FROM core.classes WHERE is_active) AS "classCount",
    (SELECT count(*)::int FROM core.students WHERE is_active) AS "studentCount",
    (SELECT count(*)::int FROM assessment.web_diagnostic_submissions WHERE status='PENDING_REVIEW') AS "awaitingReview"`);
  res.json(GetTeacherDashboardResponse.parse({...counts,teacherName:'Багшийн өгөгдөл харах орчин',
    currentTopic:'Сэдэв оноох урсгал холбогдоогүй',
    insight:`${readOnlyNotice} Шалгах тоо нь хариултын тоо биш, илгээсэн оношилгооны хуудасны тоо.`,
  }));
});
router.get('/teacher/catalog',async (_req,res) => {
  res.json(GetTeacherCatalogResponse.parse(await data.catalog()));
});
router.get('/teacher/review-queue',async (_req,res) => {
  res.json(GetTeacherReviewQueueResponse.parse(serializable(await data.reviewQueue())));
});
router.get('/teacher/integrations/workspace',async (_req,res) => {
  res.json(GetWorkspaceIntegrationDashboardResponse.parse({
    mode:'not_connected',systemOfRecord:'EJ Learning PostgreSQL',
    principle:'Үндсэн бүртгэл PostgreSQL-д байна. Google-ийн бодит холболт хараахан хийгдээгүй.',
    sources:[
      {source:'classroom',role:'Анги, сурагчийн холбоос'},
      {source:'sheets',role:'Материал, асуултын импорт'},
      {source:'drive',role:'Эх материалын файл'},
      {source:'forms',role:'Нэмэлт оношилгооны эх сурвалж'},
    ].map(source=>({...source,status:source.source==='forms'?'optional':'not_connected',recordCount:0,lastSyncAt:null})),
    entities:[
      {name:'Сурагч ба анги',ownership:'postgresql',fields:['core.students','core.classes','core.student_enrollments'],relation:'Сурагч → ангийн бүртгэл'},
      {name:'Импорт',ownership:'postgresql',fields:['staging.import_jobs','staging.import_rows'],relation:'Эх сурвалж → шалгах мөр → баталгаажуулалт'},
      {name:'Эх материал',ownership:'postgresql',fields:['content.source_materials','content.source_versions'],relation:'Материал → файлын хувилбар'},
    ],pipeline:['Эх сурвалж','Ноорог импорт','Шалгалт','Баталгаажуулалт','Сургалтын материал'],
    courses:[],importBatches:[],auditEvents:[],
    dataNotice:'Google account холбогдоогүй. Бодит өгөгдөл харах горимд mock sync/import үйлдэл ажиллахгүй.',
  }));
});

export default router;
