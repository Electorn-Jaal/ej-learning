import { readRows } from '@workspace/db';

export type ClassSkillRow = {
  skillId: number; skillCode: string; skillName: string; gradeLevel: number | null;
  assessed: number; gap: number; developing: number; mastered: number; averageScore: number;
  weakest: { studentId: number; studentName: string; score: number }[];
};

export const classSkillMastery = (classId: number, subjectIds: number[] | null) =>
  readRows<ClassSkillRow>(
    `SELECT sk.id::int AS "skillId", sk.skill_code AS "skillCode",
       sk.name_mn AS "skillName", g.grade_number::int AS "gradeLevel",
       count(*)::int AS assessed,
       count(*) FILTER (WHERE m.mastery_status = 'GAP')::int AS gap,
       count(*) FILTER (WHERE m.mastery_status = 'DEVELOPING')::int AS developing,
       count(*) FILTER (WHERE m.mastery_status = 'MASTERED')::int AS mastered,
       round(avg(m.mastery_score))::int AS "averageScore",
       COALESCE(jsonb_agg(jsonb_build_object(
         'studentId', m.student_id::int, 'studentName', st.display_name,
         'score', round(m.mastery_score)::int) ORDER BY m.mastery_score)
         FILTER (WHERE m.mastery_status <> 'MASTERED'), '[]'::jsonb) AS weakest
     FROM learning.student_skill_mastery m
     JOIN core.student_enrollments e ON e.student_id = m.student_id AND e.is_active
     JOIN core.students st ON st.id = m.student_id AND st.is_active
     JOIN content.skills sk ON sk.id = m.skill_id
     LEFT JOIN core.grade_levels g ON g.id = sk.grade_level_id
     WHERE e.class_id = $1::bigint AND m.mastery_status <> 'NOT_ASSESSED'
       AND ($2::bigint[] IS NULL OR sk.subject_id = ANY($2::bigint[]))
     GROUP BY sk.id, sk.skill_code, sk.name_mn, g.grade_number
     ORDER BY gap DESC, "averageScore", sk.skill_code`,
    [classId, subjectIds],
  );

export type AssessableSkill = {
  skillId: number;
  skillCode: string;
  skillName: string;
};

export const assessableSkills = (classId: number, subjectIds: number[] | null) =>
  readRows<AssessableSkill>(
    `SELECT DISTINCT sk.id::int AS "skillId", sk.skill_code AS "skillCode",
       sk.name_mn AS "skillName"
     FROM core.classes c
     JOIN core.class_teachers ct ON ct.class_id = c.id AND ct.is_active
     JOIN content.skills sk ON sk.subject_id = ct.subject_id
       AND sk.status = 'APPROVED'
       AND (sk.grade_level_id IS NULL OR sk.grade_level_id = c.grade_level_id)
     WHERE c.id = $1::bigint
       AND ($2::bigint[] IS NULL OR sk.subject_id = ANY($2::bigint[]))
     ORDER BY sk.skill_code`,
    [classId, subjectIds],
  );

export type RosterRow = {
  studentId: number;
  studentCode: string;
  studentName: string;
  masteryStatus: string | null;
  masteryScore: number | null;
  source: string | null;
  assessedBy: string | null;
  lastAssessedAt: string | null;
};

export const classRosterForSkill = (classId: number, skillId: number) =>
  readRows<RosterRow>(
    `SELECT st.id::int AS "studentId", st.student_code AS "studentCode",
       st.display_name AS "studentName",
       m.mastery_status AS "masteryStatus", round(m.mastery_score)::int AS "masteryScore",
       m.source, m.assessed_by AS "assessedBy",
       to_json(m.last_assessed_at) #>> '{}' AS "lastAssessedAt"
     FROM core.student_enrollments e
     JOIN core.students st ON st.id = e.student_id AND st.is_active
     LEFT JOIN learning.student_skill_mastery m
       ON m.student_id = st.id AND m.skill_id = $2::bigint
     WHERE e.class_id = $1::bigint AND e.is_active
     ORDER BY st.display_name`,
    [classId, skillId],
  );

export const skillAssessableForClass = (
  classId: number,
  skillId: number,
  subjectIds: number[] | null,
) => assessableSkills(classId, subjectIds)
  .then((skills) => skills.some((skill) => skill.skillId === skillId));

export const enrolledStudentIds = async (classId: number) =>
  new Set((await readRows<{ id: number }>(
    `SELECT e.student_id::int AS id FROM core.student_enrollments e
     JOIN core.students st ON st.id = e.student_id AND st.is_active
     WHERE e.class_id = $1::bigint AND e.is_active`,
    [classId],
  )).map((row) => row.id));

export type ItemAnalysisRow = {
  itemId: number; prompt: string; skillName: string; answered: number; correct: number;
  percentCorrect: number; commonWrongAnswer: string | null; commonWrongCount: number;
};

export const itemAnalysisForClass = (classId: number, subjectIds: number[] | null) =>
  readRows<ItemAnalysisRow>(
    `WITH latest AS (
       SELECT DISTINCT ON (qa.student_id, answer->>'questionId')
         qa.student_id, (answer->>'questionId')::bigint AS item_id,
         (answer->>'correct')::boolean AS correct,
         NULLIF(answer->>'chosenText', '') AS chosen
       FROM learning.quiz_attempts qa
       JOIN core.student_enrollments e
         ON e.student_id = qa.student_id AND e.is_active AND e.class_id = $1::bigint
       CROSS JOIN LATERAL jsonb_array_elements(qa.answers) AS answer
       WHERE answer->>'questionId' ~ '^[0-9]+$'
       ORDER BY qa.student_id, answer->>'questionId', qa.submitted_at DESC
     ), wrong AS (
       SELECT item_id, chosen, count(*)::int AS n,
         row_number() OVER (PARTITION BY item_id ORDER BY count(*) DESC, chosen) AS rank
       FROM latest WHERE NOT correct AND chosen IS NOT NULL GROUP BY item_id, chosen
     )
     SELECT i.id::int AS "itemId", i.title_mn AS prompt,
       COALESCE(sk.name_mn, '—') AS "skillName", count(*)::int AS answered,
       count(*) FILTER (WHERE l.correct)::int AS correct,
       round(100.0 * count(*) FILTER (WHERE l.correct) / count(*))::int AS "percentCorrect",
       max(w.chosen) FILTER (WHERE w.rank = 1) AS "commonWrongAnswer",
       COALESCE(max(w.n) FILTER (WHERE w.rank = 1), 0)::int AS "commonWrongCount"
     FROM latest l
     JOIN assessment.diagnostic_items i ON i.id = l.item_id
      AND ($2::bigint[] IS NULL OR i.subject_id = ANY($2::bigint[]))
     LEFT JOIN content.skills sk ON sk.id = i.skill_id
     LEFT JOIN wrong w ON w.item_id = l.item_id AND w.rank = 1
     GROUP BY i.id, i.title_mn, sk.name_mn, i.item_order
     ORDER BY "percentCorrect", i.item_order`,
    [classId, subjectIds],
  );
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
