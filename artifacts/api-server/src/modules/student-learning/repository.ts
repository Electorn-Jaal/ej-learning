import { readRows } from "@workspace/db";

export type LessonRow = {
  id: number;
  subjectCode: string;
  subjectName: string;
  lessonCode: string;
  lessonType: string;
  skillName: string;
  learningGoal: string | null;
  remember: string | null;
  workedExample: string | null;
  guidedPractice: string | null;
  independentPractice: string | null;
  studentMessage: string | null;
  teacherNote: string | null;
  estimatedMinutes: number | null;
  materialId: number | null;
  materialTitle: string | null;
  chapterTitle: string | null;
  pageFrom: number | null;
  pageTo: number | null;
  pageOffset: number;
  periodNo: number | null;
};

export const studentClass = (studentId: number) =>
  readRows<{ classId: number; className: string; gradeLevel: number }>(
    `SELECT c.id::int AS "classId", c.name_mn AS "className",
       g.grade_number::int AS "gradeLevel"
     FROM core.student_enrollments e
     JOIN core.classes c ON c.id = e.class_id AND c.is_active
     JOIN core.grade_levels g ON g.id = c.grade_level_id
     WHERE e.student_id = $1::bigint AND e.is_active
     ORDER BY c.class_code
     LIMIT 1`,
    [studentId],
  );

export const lessonsForDay = (studentId: number, onDate: string) =>
  readRows<LessonRow>(
    `SELECT dl.id::int AS id, dl.lesson_code AS "lessonCode", dl.lesson_type AS "lessonType",
       subj.code AS "subjectCode", subj.name_mn AS "subjectName",
       sk.name_mn AS "skillName", dl.learning_goal_mn AS "learningGoal",
       dl.remember_mn AS remember, dl.worked_example_mn AS "workedExample",
       dl.guided_practice_mn AS "guidedPractice",
       dl.independent_practice_mn AS "independentPractice",
       dl.student_message_mn AS "studentMessage", cs.note AS "teacherNote",
       dl.estimated_minutes::int AS "estimatedMinutes",
       book.material_id::int AS "materialId", book.material_title AS "materialTitle",
       book.chapter_title AS "chapterTitle", book.page_from::int AS "pageFrom",
       book.page_to::int AS "pageTo", COALESCE(book.page_offset, 0)::int AS "pageOffset",
       cs.period_no::int AS "periodNo"
     FROM core.student_enrollments e
     JOIN core.classes c ON c.id = e.class_id AND c.is_active
     JOIN learning.class_schedule cs ON cs.class_id = c.id AND cs.scheduled_on = $2::date
     JOIN learning.daily_lessons dl ON dl.id = cs.daily_lesson_id AND dl.status = 'APPROVED'
     JOIN content.skills sk ON sk.id = dl.core_skill_id
     JOIN core.subjects subj ON subj.id = sk.subject_id
     LEFT JOIN LATERAL (
       SELECT sm.id AS material_id, sm.title AS material_title,
              son.title AS chapter_title, a.page_from, a.page_to,
              (SELECT sv.page_offset FROM content.source_versions sv
               WHERE sv.source_material_id = sm.id AND sv.status = 'APPROVED'
               ORDER BY sv.version_no DESC LIMIT 1) AS page_offset
       FROM content.content_skill_maps m
       JOIN content.content_nodes cn ON cn.id = m.content_node_id AND cn.status = 'APPROVED'
       JOIN content.content_source_alignments a ON a.content_node_id = cn.id AND a.status = 'APPROVED'
       JOIN content.source_materials sm ON sm.id = a.source_material_id AND sm.status = 'APPROVED'
       LEFT JOIN content.source_outline_nodes son ON son.id = a.source_outline_node_id
       WHERE m.skill_id = sk.id AND m.status = 'APPROVED'
       ORDER BY m.is_primary DESC, a.page_from
       LIMIT 1
     ) book ON true
     WHERE e.student_id = $1::bigint AND e.is_active
     ORDER BY cs.period_no NULLS LAST, subj.code`,
    [studentId, onDate],
  );

export type AssignedLessonRow = LessonRow & { source: string; reason: string | null };

/** Personal work with its lesson details, fetched in one query to avoid N+1 reads. */
export const assignmentsForDay = (studentId: number, onDate: string) =>
  readRows<AssignedLessonRow>(
    `SELECT dl.id::int AS id, dl.lesson_code AS "lessonCode", dl.lesson_type AS "lessonType",
       subj.code AS "subjectCode", subj.name_mn AS "subjectName",
       sk.name_mn AS "skillName", dl.learning_goal_mn AS "learningGoal",
       dl.remember_mn AS remember, dl.worked_example_mn AS "workedExample",
       dl.guided_practice_mn AS "guidedPractice",
       dl.independent_practice_mn AS "independentPractice",
       dl.student_message_mn AS "studentMessage", NULL::text AS "teacherNote",
       dl.estimated_minutes::int AS "estimatedMinutes",
       book.material_id::int AS "materialId", book.material_title AS "materialTitle",
       book.chapter_title AS "chapterTitle", book.page_from::int AS "pageFrom",
       book.page_to::int AS "pageTo", COALESCE(book.page_offset, 0)::int AS "pageOffset",
       NULL::int AS "periodNo", sa.source::text AS source, sa.reason
     FROM learning.student_assignments sa
     JOIN learning.daily_lessons dl ON dl.id = sa.daily_lesson_id AND dl.status = 'APPROVED'
     JOIN content.skills sk ON sk.id = dl.core_skill_id
     JOIN core.subjects subj ON subj.id = sk.subject_id
     LEFT JOIN LATERAL (
       SELECT sm.id AS material_id, sm.title AS material_title,
              son.title AS chapter_title, a.page_from, a.page_to,
              (SELECT sv.page_offset FROM content.source_versions sv
               WHERE sv.source_material_id = sm.id AND sv.status = 'APPROVED'
               ORDER BY sv.version_no DESC LIMIT 1) AS page_offset
       FROM content.content_skill_maps m
       JOIN content.content_nodes cn ON cn.id = m.content_node_id AND cn.status = 'APPROVED'
       JOIN content.content_source_alignments a ON a.content_node_id = cn.id AND a.status = 'APPROVED'
       JOIN content.source_materials sm ON sm.id = a.source_material_id AND sm.status = 'APPROVED'
       LEFT JOIN content.source_outline_nodes son ON son.id = a.source_outline_node_id
       WHERE m.skill_id = sk.id AND m.status = 'APPROVED'
       ORDER BY m.is_primary DESC, a.page_from
       LIMIT 1
     ) book ON true
     WHERE sa.student_id = $1::bigint AND sa.assigned_on = $2::date
     ORDER BY subj.code`,
    [studentId, onDate],
  );
