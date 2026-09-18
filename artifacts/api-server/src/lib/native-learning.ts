import { readRows } from '@workspace/db';

type StudentRow = {
  id: string; code: string; displayName: string; className: string; gradeLevel: number;
};

const STUDENT_COLUMNS = `SELECT s.id::text AS id, s.student_code AS code,
    s.display_name AS "displayName",
    COALESCE(string_agg(DISTINCT c.name_mn, ', ' ORDER BY c.name_mn), '') AS "className",
    COALESCE(max(g.grade_number), 0)::int AS "gradeLevel"
  FROM core.students s
  LEFT JOIN core.student_enrollments e ON e.student_id=s.id AND e.is_active
  LEFT JOIN core.classes c ON c.id=e.class_id AND c.is_active
  LEFT JOIN core.grade_levels g ON g.id=c.grade_level_id`;

/**
 * Students the signed-in teacher is responsible for: the ones enrolled in a
 * class they are assigned to teach. An admin sees everybody.
 *
 * The listing used to be every active student in the school, for any account
 * holding TEACHER. The role check answered "is this a teacher" and nothing
 * asked "whose students are these", so one teacher's account read the whole
 * roll - names, student codes and classes included.
 */
export const studentsForTeacher = (teacherId: number | null, isAdmin: boolean) =>
  readRows<StudentRow>(
    `${STUDENT_COLUMNS}
  WHERE s.is_active AND ($2::boolean OR EXISTS (
      SELECT 1 FROM core.student_enrollments se
      JOIN core.class_teachers ct ON ct.class_id = se.class_id AND ct.is_active
      WHERE se.student_id = s.id AND se.is_active AND ct.teacher_id = $1::bigint))
  GROUP BY s.id ORDER BY s.student_code`,
    [teacherId ?? 0, isAdmin],
  );

/**
 * One student by id, for the account that owns that record. Reading the whole
 * table and filtering in JavaScript, which is what this replaced, got slower
 * with every student enrolled and put every row on the wire to find one.
 */
export const studentById = (studentId: number | string) =>
  readRows<StudentRow>(
    `${STUDENT_COLUMNS}
  WHERE s.is_active AND s.id = $1::bigint
  GROUP BY s.id`,
    [studentId],
  );

export const classes = () => readRows(`SELECT c.id::text AS id,c.name_mn AS name,
  g.grade_number::int AS "gradeLevel", ''::text AS subject,
  (SELECT count(DISTINCT e.student_id)::int FROM core.student_enrollments e
    JOIN core.students s ON s.id=e.student_id AND s.is_active
    WHERE e.class_id=c.id AND e.is_active) AS "studentCount",
  'Сэдэв оноох урсгал холбогдоогүй'::text AS "currentTopic",
  (SELECT count(DISTINCT w.id)::int FROM assessment.web_diagnostic_submissions w
    JOIN core.student_enrollments e ON e.student_id=w.student_id AND e.is_active
    WHERE e.class_id=c.id AND w.status='PENDING_REVIEW') AS "needsReview"
  FROM core.classes c JOIN core.grade_levels g ON g.id=c.grade_level_id
  WHERE c.is_active ORDER BY c.class_code`);

/**
 * Every skill this student is working on, with the subject it belongs to.
 *
 * The grade used to be the only filter, so a child saw skills for subjects
 * nobody teaches them - their class runs three and the grade has more. It is
 * the subjects the class is actually taught now, which is the same rule
 * `subjects` uses, so the two screens can no longer disagree about what a
 * child studies.
 */
export const progressSkills = (studentId: string) => readRows(`
  SELECT s.name_mn AS skill,s.skill_code AS code,sub.name_mn AS subject,
    COALESCE(g.grade_number,0)::int AS "gradeLevel",
    CASE m.mastery_status WHEN 'MASTERED' THEN 'mastered' WHEN 'DEVELOPING' THEN 'developing'
      WHEN 'GAP' THEN 'needs_support' ELSE 'unassessed' END AS status,
    round(m.mastery_score)::int AS percentage,
    COALESCE(m.attempt_count,0)::int AS "evidenceCount",
    m.last_assessed_at AS "lastEvidenceDate"
  FROM content.skills s
  JOIN core.subjects sub ON sub.id=s.subject_id
  LEFT JOIN core.grade_levels g ON g.id=s.grade_level_id
  LEFT JOIN learning.student_skill_mastery m ON m.skill_id=s.id AND m.student_id=$1::bigint
  WHERE m.student_id IS NOT NULL OR (s.status='APPROVED' AND EXISTS (
    SELECT 1 FROM core.student_enrollments e
    JOIN core.classes c ON c.id=e.class_id AND c.is_active
    JOIN core.class_teachers ct ON ct.class_id=c.id AND ct.is_active AND ct.subject_id=s.subject_id
    WHERE e.student_id=$1::bigint AND e.is_active AND c.grade_level_id=s.grade_level_id))
  ORDER BY sub.name_mn, s.skill_code`, [studentId]);

export const attemptHistory = (studentId: string) => readRows(`
  SELECT 'diagnostic:'||a.id AS id, sub.name_mn||' — оношилгоо '||a.attempt_code AS assignment,
    a.attempted_at AS "submittedAt", 'Импортолсон оношилгоо: '||a.status AS status,
    a.total_score::float8 AS score,a.total_max_score::float8 AS "maxScore",NULL::text AS reviewer
  FROM assessment.diagnostic_attempts a JOIN core.subjects sub ON sub.id=a.subject_id
  WHERE a.student_id=$1::bigint
  UNION ALL
  SELECT 'web:'||w.id,sub.name_mn||' — цахим оношилгоо',COALESCE(w.submitted_at,w.started_at),
    CASE w.status WHEN 'REVIEWED' THEN 'Үнэлэгдсэн' WHEN 'PENDING_REVIEW' THEN 'Багшийн үнэлгээ хүлээж байна'
      WHEN 'IN_PROGRESS' THEN 'Үргэлжилж байна' ELSE 'Цуцлагдсан' END,
    CASE WHEN w.status='REVIEWED' AND count(a.diagnostic_item_id)>0 AND count(a.awarded_score)=count(a.diagnostic_item_id)
      THEN sum(a.awarded_score)::float8 ELSE NULL END,
    sum(i.max_score)::float8,w.reviewed_by
  FROM assessment.web_diagnostic_submissions w JOIN core.subjects sub ON sub.id=w.subject_id
  LEFT JOIN assessment.web_diagnostic_answers a ON a.submission_id=w.id
  LEFT JOIN assessment.diagnostic_items i ON i.id=a.diagnostic_item_id
  WHERE w.student_id=$1::bigint GROUP BY w.id,sub.name_mn
  UNION ALL
  SELECT 'quiz:'||q.id, sk.name_mn||' — шалгах асуулт', q.submitted_at, 'Шалгагдсан',
    q.score::float8, q.max_score::float8, NULL
  FROM learning.quiz_attempts q
  JOIN learning.daily_lessons dl ON dl.id=q.daily_lesson_id
  JOIN content.skills sk ON sk.id=dl.core_skill_id
  WHERE q.student_id=$1::bigint
  ORDER BY "submittedAt" DESC`, [studentId]);

export const subjects = (studentId: string) => readRows(`
  SELECT sub.code,sub.name_mn AS name,
    (SELECT count(*)::int FROM learning.student_skill_mastery m JOIN content.skills s ON s.id=m.skill_id
      WHERE m.student_id=$1::bigint AND s.subject_id=sub.id AND m.mastery_status<>'NOT_ASSESSED') AS "assessedSkills",
    (SELECT count(*)::int FROM learning.student_skill_mastery m JOIN content.skills s ON s.id=m.skill_id
      WHERE m.student_id=$1::bigint AND s.subject_id=sub.id AND m.mastery_status='MASTERED') AS "masteredSkills",
    (SELECT count(*)::int FROM learning.daily_lessons l JOIN content.skills s ON s.id=l.core_skill_id
      WHERE s.subject_id=sub.id AND s.status='APPROVED' AND l.status='APPROVED' AND l.web_ready
      AND EXISTS (SELECT 1 FROM core.student_enrollments e JOIN core.classes c ON c.id=e.class_id AND c.is_active
        WHERE e.student_id=$1::bigint AND e.is_active AND c.grade_level_id=s.grade_level_id)) AS "approvedLessons"
  FROM core.subjects sub WHERE sub.is_active AND (
    -- A subject this child's class is taught. This used to ask only whether
    -- they had been measured in it, so a subject they sit through every week
    -- was missing from their own page until the first quiz.
    EXISTS (
      SELECT 1 FROM core.student_enrollments e
      JOIN core.class_teachers ct ON ct.class_id=e.class_id AND ct.is_active
      WHERE e.student_id=$1::bigint AND e.is_active AND ct.subject_id=sub.id)
    -- Or one they carry a result in, which may be from a class they have left.
    OR EXISTS (
      SELECT 1 FROM content.skills s JOIN learning.student_skill_mastery m ON m.skill_id=s.id
      WHERE s.subject_id=sub.id AND m.student_id=$1::bigint))
  ORDER BY sub.code`, [studentId]);

type CatalogRow = {
  id: string; kind: 'lesson'|'task'|'check'; code: string; subject: string; skill: string;
  skillCode: string; gradeLevel: number|null; status: string; skillStatus: string;
  title: string; body: string|null; example: string|null; practice: string|null;
  material: string|null; estimatedMinutes: number|null; maxScore: number|null; sourceTitle: string|null;
};
// Deliberately excludes answer_guide_mn and diagnostic response data.
export async function catalog() {
  const rows = await readRows<CatalogRow>(`
    WITH items AS (
      SELECT l.id,'lesson'::text AS kind,l.lesson_code AS code,l.core_skill_id AS skill_id,l.status,
        COALESCE(l.learning_goal_mn,l.lesson_code) AS title,l.remember_mn AS body,l.worked_example_mn AS example,
        concat_ws(E'\n\n',l.guided_practice_mn,l.independent_practice_mn) AS practice,
        NULL::text AS material,l.estimated_minutes,l.source_material_id,NULL::numeric AS max_score
      FROM learning.daily_lessons l
      UNION ALL SELECT t.id,'task',t.task_code,t.skill_id,t.status,t.question_mn,t.instruction_mn,NULL,NULL,
        t.material_mn,t.estimated_minutes,t.source_material_id,t.max_score FROM learning.tasks t
      UNION ALL SELECT m.id,'check',m.check_code,m.skill_id,m.status,m.question_mn,NULL,NULL,NULL,
        m.material_mn,NULL,m.source_material_id,m.max_score FROM learning.mastery_checks m
    ) SELECT i.kind||':'||i.id AS id,i.kind,i.code,sub.name_mn AS subject,s.name_mn AS skill,
      s.skill_code AS "skillCode",g.grade_number::int AS "gradeLevel",i.status::text,
      s.status::text AS "skillStatus",i.title,i.body,i.example,i.practice,i.material,
      i.estimated_minutes::int AS "estimatedMinutes",i.max_score::float8 AS "maxScore",src.title AS "sourceTitle"
    FROM items i JOIN content.skills s ON s.id=i.skill_id JOIN core.subjects sub ON sub.id=s.subject_id
    LEFT JOIN core.grade_levels g ON g.id=s.grade_level_id
    LEFT JOIN content.source_materials src ON src.id=i.source_material_id
    ORDER BY sub.code,s.skill_code,i.kind,i.code`);
  return rows.map(({body,example,practice,material,...item}) => ({ ...item,
    materialBlocks: [
      {kind:'explanation',title:'Тайлбар',body}, {kind:'example',title:'Жишээ',body:example},
      {kind:'practice',title:'Дадлага',body:practice}, {kind:'explanation',title:'Эх материал',body:material},
    ].filter(block => block.body?.trim()).map(block => ({...block,pageLabel:null,available:true})),
  }));
}

/**
 * Work waiting to be marked, for this teacher's students only. Each row
 * carries a student's name, class and their written answer, so an unscoped
 * queue handed every teacher the whole school's submissions.
 */
export const reviewQueue = (teacherId: number | null, isAdmin: boolean) =>
  readRows(`SELECT w.id||':'||i.id AS "attemptId",
  s.display_name AS "studentName",
  COALESCE((SELECT string_agg(DISTINCT c.name_mn, ', ' ORDER BY c.name_mn)
    FROM core.student_enrollments e JOIN core.classes c ON c.id=e.class_id AND c.is_active
    WHERE e.student_id=s.id AND e.is_active),'') AS "className",
  i.title_mn AS topic,sk.name_mn AS skill,a.response_text AS answer,
  COALESCE(w.submitted_at,w.started_at) AS "submittedAt",
  CASE WHEN i.rubric_mn IS NULL THEN ARRAY[]::text[] ELSE ARRAY[i.rubric_mn] END AS rubric,
  i.max_score::float8 AS "maxScore"
  FROM assessment.web_diagnostic_submissions w JOIN core.students s ON s.id=w.student_id
  JOIN assessment.web_diagnostic_answers a ON a.submission_id=w.id
  JOIN assessment.diagnostic_items i ON i.id=a.diagnostic_item_id JOIN content.skills sk ON sk.id=i.skill_id
  WHERE w.status='PENDING_REVIEW' AND ($2::boolean OR EXISTS (
      SELECT 1 FROM core.student_enrollments se
      JOIN core.class_teachers ct ON ct.class_id = se.class_id AND ct.is_active
      WHERE se.student_id = s.id AND se.is_active AND ct.teacher_id = $1::bigint))
  ORDER BY w.submitted_at NULLS LAST,w.id,i.item_order`,
  [teacherId ?? 0, isAdmin]);

export const approvedLessons = (studentId: string) => readRows<{
  id:string; topic:string; subject:string; subjectCode:string; targetSkill:string;
  targetSkillCode:string; goal:string; reason:string; estimatedMinutes:number;
  gradeLevel:number; explanation:string|null; example:string|null; practice:string|null;
}>(`SELECT 'lesson:'||l.id AS id,s.name_mn AS topic,sub.name_mn AS subject,sub.code AS "subjectCode",
  s.name_mn AS "targetSkill",s.skill_code AS "targetSkillCode",
  COALESCE(l.learning_goal_mn,'') AS goal,COALESCE(l.student_message_mn,'Баталгаажсан хичээлийн сан') AS reason,
  COALESCE(l.estimated_minutes,0)::int AS "estimatedMinutes",g.grade_number::int AS "gradeLevel",
  l.remember_mn AS explanation,l.worked_example_mn AS example,
  concat_ws(E'\n\n',l.guided_practice_mn,l.independent_practice_mn) AS practice
  FROM learning.daily_lessons l JOIN content.skills s ON s.id=l.core_skill_id
  JOIN core.subjects sub ON sub.id=s.subject_id AND sub.is_active
  JOIN core.grade_levels g ON g.id=s.grade_level_id
  LEFT JOIN content.source_materials src ON src.id=l.source_material_id
  LEFT JOIN content.skills recovery ON recovery.id=l.recovery_skill_id
  WHERE l.status='APPROVED' AND l.web_ready AND s.status='APPROVED'
    AND (l.source_material_id IS NULL OR src.status='APPROVED')
    AND (l.lesson_type<>'RECOVERY' OR recovery.status='APPROVED')
    AND EXISTS (SELECT 1 FROM core.student_enrollments e JOIN core.classes c ON c.id=e.class_id AND c.is_active
      WHERE e.student_id=$1::bigint AND e.is_active AND c.grade_level_id=s.grade_level_id)
  ORDER BY s.skill_code,l.lesson_code`,[studentId]);
