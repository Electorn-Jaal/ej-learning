import { readRows } from "@workspace/db";

type StudentRow = {
  id: string; code: string; displayName: string; className: string; gradeLevel: number;
  schoolYear: string | null;
};

// s.external_code is deliberately absent. It holds the national registration
// number, which nothing on the student's own screens needs; the moment it is
// in a response it is in a browser cache and on a shoulder-surfer's screen.
const STUDENT_COLUMNS = `SELECT s.id::text AS id, s.student_code AS code,
    s.display_name AS "displayName",
    COALESCE(string_agg(DISTINCT c.name_mn, ', ' ORDER BY c.name_mn), '') AS "className",
    COALESCE(max(g.grade_number), 0)::int AS "gradeLevel",
    max(c.school_year) AS "schoolYear"
  FROM core.students s
  LEFT JOIN core.student_enrollments e ON e.student_id=s.id AND e.is_active
  LEFT JOIN core.classes c ON c.id=e.class_id AND c.is_active
  LEFT JOIN core.grade_levels g ON g.id=c.grade_level_id`;

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

/**
 * The subjects a student studies, each with the core textbook their class
 * works from and where the school calendar says that book has reached.
 *
 * The curriculum comes from core.class_subjects, not core.class_teachers. It

 * disappear whenever no teacher was on file against them - with an unstaffed
 * register that meant every child saw an empty page. What a class is taught
 * and who happens to teach it are different facts with different lifetimes.
 *
 * `origin` is carried through to the screen on purpose. A ROSTER row was read
 * off books the school actually supplied; a CURRICULUM row is the national
 * subject list filled in as a stand-in. The caller is expected to say which
 * it is showing rather than present a guess as a record.
 *
 * Two different "where are we" answers come back, and they must not be
 * confused. The period figures describe the term the school is in TODAY and
 * they describe the BOOK: which chapters this term is meant to cover. The
 * topic fields describe the CLASS, and only exist because a teacher said so -
 * learning.class_topics is written by hand, never derived from the calendar.
 * A class behind its term shows a topic from an earlier period, which is the
 * truth and the whole reason the pointer is not computed.
 */
export const subjects = (studentId: string) => readRows(`
  WITH enrolled AS (
    -- One row per subject even if a child sits in two classes: prefer the
    -- enrolment that actually carries a book, and a real roster row over a
    -- curriculum placeholder.
    SELECT DISTINCT ON (cs.subject_id)
      cs.subject_id, cs.class_id, cs.source_material_id, cs.origin
    FROM core.student_enrollments e
    JOIN core.class_subjects cs ON cs.class_id=e.class_id AND cs.is_active
    WHERE e.student_id=$1::bigint AND e.is_active
    ORDER BY cs.subject_id, (cs.source_material_id IS NULL), cs.origin DESC
  ), current_term AS (
    SELECT term_number FROM learning.terms
    WHERE CURRENT_DATE BETWEEN starts_on AND ends_on
    ORDER BY term_number LIMIT 1
  )
  SELECT sub.code,sub.name_mn AS name,
    (SELECT count(*)::int FROM learning.student_skill_mastery m JOIN content.skills s ON s.id=m.skill_id
      WHERE m.student_id=$1::bigint AND s.subject_id=sub.id AND m.mastery_status<>'NOT_ASSESSED') AS "assessedSkills",
    (SELECT count(*)::int FROM learning.student_skill_mastery m JOIN content.skills s ON s.id=m.skill_id
      WHERE m.student_id=$1::bigint AND s.subject_id=sub.id AND m.mastery_status='MASTERED') AS "masteredSkills",
    (SELECT count(*)::int FROM learning.daily_lessons l JOIN content.skills s ON s.id=l.core_skill_id
      WHERE s.subject_id=sub.id AND s.status='APPROVED' AND l.status='APPROVED' AND l.web_ready
      AND EXISTS (SELECT 1 FROM core.student_enrollments e JOIN core.classes c ON c.id=e.class_id AND c.is_active
        WHERE e.student_id=$1::bigint AND e.is_active AND c.grade_level_id=s.grade_level_id)) AS "approvedLessons",
    COALESCE(en.origin,'CURRICULUM') AS origin,
    bk.id::text AS "materialId",
    bk.source_code AS "sourceCode",
    bk.title AS "bookTitle",
    bk.total_pages AS "bookPages",
    bk.planning_period_count AS "periodCount",
    (SELECT term_number FROM current_term)::int AS "currentPeriod",
    (SELECT count(*)::int FROM content.source_outline_nodes n
      WHERE n.source_material_id=bk.id AND n.planning_period_no=(SELECT term_number FROM current_term)) AS "periodSections",
    (SELECT min(n.page_from)::int FROM content.source_outline_nodes n
      WHERE n.source_material_id=bk.id AND n.planning_period_no=(SELECT term_number FROM current_term)) AS "periodPageFrom",
    (SELECT max(n.page_to)::int FROM content.source_outline_nodes n
      WHERE n.source_material_id=bk.id AND n.planning_period_no=(SELECT term_number FROM current_term)) AS "periodPageTo",
    tn.id::text AS "topicNodeId",
    tn.printed_number AS "topicNumber",
    tn.title AS "topicTitle",
    tn.page_from::int AS "topicPageFrom",
    tn.page_to::int AS "topicPageTo",
    ct.effective_on::text AS "topicSince",
    -- How long the book is, and how far into it that topic sits. The subject
    -- cards report "the 14th of 72", which is the CLASS's position - the only
    -- progress this system can honestly measure while no skill is mapped or
    -- assessed.
    (SELECT count(*)::int FROM content.source_outline_nodes o
      WHERE o.source_material_id=bk.id) AS "bookSections",
    (SELECT count(*)::int FROM content.source_outline_nodes o
      WHERE o.source_material_id=bk.id AND o.sequence_no<=tn.sequence_no) AS "topicPosition"
  FROM core.subjects sub
  LEFT JOIN enrolled en ON en.subject_id=sub.id
  LEFT JOIN content.source_materials bk ON bk.id=en.source_material_id
  LEFT JOIN learning.class_topics ct
    ON ct.class_id=en.class_id AND ct.subject_id=sub.id
  LEFT JOIN content.source_outline_nodes tn ON tn.id=ct.source_outline_node_id
  WHERE sub.is_active AND (
    -- A subject this child's class is taught.
    en.subject_id IS NOT NULL
    -- Or one they carry a result in, which may be from a class they have left.
    OR EXISTS (
      SELECT 1 FROM content.skills s JOIN learning.student_skill_mastery m ON m.skill_id=s.id
      WHERE s.subject_id=sub.id AND m.student_id=$1::bigint))
  ORDER BY sub.code`, [studentId]);


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

/**
 * Where this child was placed, and what that level says to study next.
 *
 * Two queries rather than a join, because they answer different questions and
 * one of them can be empty on its own: a child may have a level with no
 * pathway loaded, and the screen has to say which of the two is missing
 * rather than showing an empty list either way.
 */
export const latestPlacement = (studentId: string) =>
  readRows<{
    subjectCode: string; subjectName: string; levelId: number; levelCode: string;
    levelName: string; score: number | null; maxScore: number | null;
    attemptedOn: string | null; notes: string | null; answerSource: string;
  }>(`
    SELECT DISTINCT ON (a.subject_id)
      sub.code AS "subjectCode", sub.name_mn AS "subjectName",
      p.id::int AS "levelId", p.code AS "levelCode", p.name_mn AS "levelName",
      a.total_score::float8 AS score, a.total_max_score::float8 AS "maxScore",
      a.attempted_on::text AS "attemptedOn", a.notes, a.answer_source::text AS "answerSource"
    FROM assessment.placement_attempts a
    JOIN core.subjects sub ON sub.id = a.subject_id AND sub.is_active
    JOIN content.proficiency_levels p ON p.id = a.proficiency_level_id
    WHERE a.student_id = $1::bigint
    -- The most recent sitting is the current level. Four children sat twice.
    ORDER BY a.subject_id, a.attempted_on DESC NULLS LAST, a.id DESC`,
    [studentId]);

/** The six steps a level prescribes, in reading order. */
export const pathwayForLevel = (levelId: number) =>
  readRows<{
    domain: string; sequenceNo: number; sourceLabel: string;
    materialId: string | null; unitFocus: string | null; pages: string | null;
    task: string; priority: string; verification: string | null;
  }>(`
    SELECT w.domain_mn AS domain, w.sequence_no::int AS "sequenceNo",
      w.source_label AS "sourceLabel", w.source_material_id::text AS "materialId",
      w.unit_focus_mn AS "unitFocus", w.pages_mn AS pages, w.task_mn AS task,
      w.priority, w.verification_mn AS verification
    FROM content.placement_pathways w
    WHERE w.proficiency_level_id = $1::smallint
    ORDER BY w.sequence_no`,
    [levelId]);

/**
 * The child's own register entry, as the school recorded it.
 *
 * external_code is absent on purpose, as everywhere else: it is the school's
 * internal registration number and no screen needs it to show a child who
 * they are.
 */
export const studentRecord = (studentId: string) =>
  readRows<{
    studentCode: string; displayName: string;
    familyName: string | null; givenName: string | null;
    personalFile: string | null; attendance: string | null; notes: string | null;
    className: string; gradeLevel: number; schoolYear: string | null;
  }>(`
    SELECT s.student_code AS "studentCode", s.display_name AS "displayName",
      s.family_name AS "familyName", s.given_name AS "givenName",
      s.personal_file_mn AS "personalFile", s.attendance_mn AS attendance, s.notes,
      COALESCE(string_agg(DISTINCT c.name_mn, ', ' ORDER BY c.name_mn), '') AS "className",
      COALESCE(max(g.grade_number), 0)::int AS "gradeLevel",
      max(c.school_year) AS "schoolYear"
    FROM core.students s
    LEFT JOIN core.student_enrollments e ON e.student_id = s.id AND e.is_active
    LEFT JOIN core.classes c ON c.id = e.class_id AND c.is_active
    LEFT JOIN core.grade_levels g ON g.id = c.grade_level_id
    WHERE s.is_active AND s.id = $1::bigint
    GROUP BY s.id`,
    [studentId]);

/**
 * This child's own family contacts, and nobody else's.
 *
 * Scoped by the signed-in student's id, which the caller takes from the
 * session rather than the request. The table holds every family's telephone
 * number in the school; a listing that took an id from a query string would
 * hand the lot to whoever asked.
 */
export const guardiansOf = (studentId: string) =>
  readRows<{ relationMn: string | null; fullName: string | null; phone: string }>(`
    SELECT relation_mn AS "relationMn", full_name AS "fullName", phone
    FROM core.student_guardians
    WHERE student_id = $1::bigint
    ORDER BY sequence_no`,
    [studentId]);
