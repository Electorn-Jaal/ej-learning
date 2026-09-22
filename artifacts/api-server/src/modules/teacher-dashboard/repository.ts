import { readRows } from "@workspace/db";

export type DashboardClass = {
  classId: number;
  className: string;
  gradeLevel: number;
  subjectId: number | null;
  subjectName: string;
};

export const teacherClasses = (teacherId: number | null, isAdmin: boolean) =>
  isAdmin
    ? readRows<DashboardClass>(
        `SELECT c.id::int AS "classId", c.name_mn AS "className",
           g.grade_number::int AS "gradeLevel", NULL::int AS "subjectId", '' AS "subjectName"
         FROM core.classes c
         JOIN core.grade_levels g ON g.id = c.grade_level_id
         WHERE c.is_active ORDER BY g.grade_number, c.class_code`,
      )
    : readRows<DashboardClass>(
        `SELECT c.id::int AS "classId", c.name_mn AS "className",
           g.grade_number::int AS "gradeLevel", v.subject_id::int AS "subjectId",
           COALESCE(sub.name_mn, '') AS "subjectName"
         FROM core.classes c
         JOIN core.grade_levels g ON g.id = c.grade_level_id
         JOIN LATERAL (
           SELECT DISTINCT ct.subject_id
           FROM core.class_teachers ct
           WHERE ct.class_id = c.id AND ct.is_active AND ct.subject_id IS NOT NULL
             AND (c.class_teacher_id = $1::bigint OR ct.teacher_id = $1::bigint)
         ) v ON true
         LEFT JOIN core.subjects sub ON sub.id = v.subject_id
         WHERE c.is_active
         ORDER BY g.grade_number, c.class_code, sub.name_mn`,
        [teacherId ?? 0],
      );

export const frameworkOfSubject = (subjectId: number | null) =>
  subjectId === null
    ? Promise.resolve([])
    : readRows<{ framework: string | null }>(
        `SELECT (SELECT p.framework FROM content.skills k
                 JOIN content.proficiency_levels p ON p.id = k.proficiency_level_id
                 WHERE k.subject_id = $1::bigint LIMIT 1) AS framework`,
        [subjectId],
      );

export const classLessonToday = (
  classId: number,
  onDate: string,
  subjectId: number | null,
) =>
  readRows<{
    lessonCode: string;
    skillName: string;
    pageFrom: number | null;
    pageTo: number | null;
  }>(
    `SELECT dl.lesson_code AS "lessonCode", sk.name_mn AS "skillName",
       a.page_from::int AS "pageFrom", a.page_to::int AS "pageTo"
     FROM learning.class_schedule cs
     JOIN learning.daily_lessons dl ON dl.id = cs.daily_lesson_id
     JOIN content.skills sk ON sk.id = dl.core_skill_id
     JOIN core.subjects subj ON subj.id = sk.subject_id
     LEFT JOIN LATERAL (
       SELECT al.page_from, al.page_to
       FROM content.content_skill_maps m
       JOIN content.content_source_alignments al ON al.content_node_id = m.content_node_id
       WHERE m.skill_id = sk.id AND m.status = 'APPROVED'
       ORDER BY m.is_primary DESC LIMIT 1
     ) a ON true
     WHERE cs.class_id = $1::bigint AND cs.scheduled_on = $2::date
       AND ($3::bigint IS NULL OR cs.subject_id = $3::bigint)
     ORDER BY subj.code`,
    [classId, onDate, subjectId],
  );

export const classCounts = (classId: number, onDate: string) =>
  readRows<{ studentCount: number; answeredToday: number }>(
    `WITH roll AS (
       SELECT DISTINCT e.student_id FROM core.student_enrollments e
       WHERE e.is_active AND e.class_id = $1::bigint
     )
     SELECT (SELECT count(*)::int FROM roll) AS "studentCount",
       (SELECT count(DISTINCT q.student_id)::int FROM learning.quiz_attempts q
        JOIN roll ON roll.student_id = q.student_id
        WHERE q.submitted_at >= $2::date) AS "answeredToday"`,
    [classId, onDate],
  );

export const classAttention = (classId: number, onDate: string, levelled: boolean) =>
  readRows<{
    studentId: number;
    studentCode: string;
    studentName: string;
    level: string | null;
    reason: string;
    detail: string;
  }>(
    `WITH roll AS (
       SELECT DISTINCT e.student_id FROM core.student_enrollments e
       WHERE e.is_active AND e.class_id = $1::bigint
     ), latest_placement AS (
       SELECT DISTINCT ON (a.student_id) a.student_id, p.code
       FROM assessment.placement_attempts a
       LEFT JOIN content.proficiency_levels p ON p.id = a.proficiency_level_id
       ORDER BY a.student_id, a.id DESC
     ), latest_quiz AS (
       SELECT DISTINCT ON (q.student_id) q.student_id, q.score, q.max_score
       FROM learning.quiz_attempts q ORDER BY q.student_id, q.submitted_at DESC
     ), assigned AS (
       SELECT DISTINCT student_id FROM learning.student_assignments WHERE assigned_on = $2::date
       UNION
       SELECT roll.student_id FROM roll
       WHERE EXISTS (SELECT 1 FROM learning.class_schedule cs
                     WHERE cs.class_id = $1::bigint AND cs.scheduled_on = $2::date)
     )
     SELECT s.id::int AS "studentId", s.student_code AS "studentCode",
       s.display_name AS "studentName", lp.code AS level,
       CASE WHEN $3::boolean AND lp.code IS NULL THEN 'NO_PLACEMENT'
            WHEN lq.student_id IS NOT NULL AND lq.score::float / lq.max_score < 0.5 THEN 'LOW_SCORE'
            ELSE 'NOT_ANSWERED' END AS reason,
       CASE WHEN $3::boolean AND lp.code IS NULL THEN 'Түвшин тогтоогоогүй'
            WHEN lq.student_id IS NOT NULL AND lq.score::float / lq.max_score < 0.5
              THEN 'Сүүлийн шалгалт: ' || lq.score || '/' || lq.max_score
            ELSE 'Өнөөдрийн ажилдаа хариулаагүй' END AS detail
     FROM roll
     JOIN core.students s ON s.id = roll.student_id AND s.is_active
     LEFT JOIN latest_placement lp ON lp.student_id = s.id
     LEFT JOIN latest_quiz lq ON lq.student_id = s.id
     WHERE ($3::boolean AND lp.code IS NULL)
        OR (lq.student_id IS NOT NULL AND lq.score::float / lq.max_score < 0.5)
        OR (s.id IN (SELECT student_id FROM assigned)
            AND NOT EXISTS (SELECT 1 FROM learning.quiz_attempts q2
                            WHERE q2.student_id = s.id AND q2.submitted_at >= $2::date))
     ORDER BY s.student_code
     LIMIT 30`,
    [classId, onDate, levelled],
  );
