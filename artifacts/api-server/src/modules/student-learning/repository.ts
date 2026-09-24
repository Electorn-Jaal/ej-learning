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
  // Which half of a split class this slot is for, in the school's own words.
  groupLabel?: string | null;
  selectionPending?: boolean;
  timetableSlotId?: number | null;
  teacherName?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  held?: boolean;
  notHeldReason?: string | null;
  isContinuation?: boolean;
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

/**
 * The child's day, read off the school's weekly timetable.
 *
 * The timetable is the spine and the lesson content hangs off it, not the
 * other way round. This used to start from learning.class_schedule and join
 * daily_lessons, which meant a period with no prepared content vanished - and
 * since the school has a full timetable and thirty-one demonstration lessons,
 * that hid the entire timetable. A child is owed "Maths, third period,
 * B.Chingunbayar" whether or not anybody has written the lesson yet.
 *
 * One row per slot rather than per subject. Монгол хэл in the first period and
 * again in the second is two lessons, and collapsing them by subject told a
 * child they had one.
 *
 * Splits come back as two rows on the same period, which is what they are:
 * half of 6a is in design and the other half in IT, and groupLabel says which
 * half the school meant.
 */
export const lessonsForDay = (studentId: number, onDate: string) =>
  readRows<LessonRow>(
    `WITH enrolled AS (
       SELECT c.id AS class_id, c.school_year
         FROM core.student_enrollments e
         JOIN core.classes c ON c.id = e.class_id AND c.is_active
        WHERE e.student_id = $1::bigint AND e.is_active
     ),
     pattern AS (
       SELECT ts.id, ts.subject_id, ts.period_no, ts.group_label, ts.teacher_id,
              (ts.group_label IS NOT NULL AND NOT ts.audience_assigned) AS selection_pending
         FROM learning.timetable_slots ts
         JOIN enrolled ON enrolled.class_id = ts.class_id
        WHERE ts.weekday_no = EXTRACT(ISODOW FROM $2::date)
          AND ts.valid_from <= $2::date
          AND (ts.valid_to IS NULL OR ts.valid_to >= $2::date)
          AND (NOT ts.audience_assigned OR EXISTS (
            SELECT 1 FROM learning.timetable_slot_students m
            WHERE m.timetable_slot_id = ts.id AND m.student_id = $1))
     ),
     dated AS (
       SELECT cs.subject_id, cs.period_no, cs.daily_lesson_id, cs.note, cs.timetable_slot_id,
              cs.page_from, cs.page_to, cs.held, cs.not_held_reason, cs.is_continuation
         FROM learning.class_schedule cs
         JOIN enrolled ON enrolled.class_id = cs.class_id
        LEFT JOIN learning.timetable_slots ts ON ts.id = cs.timetable_slot_id
        WHERE cs.scheduled_on = $2::date
          AND (ts.id IS NULL OR NOT ts.audience_assigned OR EXISTS (
            SELECT 1 FROM learning.timetable_slot_students m
            WHERE m.timetable_slot_id = ts.id AND m.student_id = $1))
     ),
     combined AS (
       -- Every period the timetable says the class has, with whatever content
       -- has been prepared for it.
       SELECT p.subject_id, p.period_no, p.group_label, p.teacher_id,
              d.daily_lesson_id, d.note, d.page_from, d.page_to,
              p.selection_pending, p.id AS slot_id,
              COALESCE(d.held, true) AS held, d.not_held_reason,
              COALESCE(d.is_continuation, false) AS is_continuation
         FROM pattern p
         LEFT JOIN dated d
           ON d.subject_id = p.subject_id
          AND (d.timetable_slot_id = p.id OR
               (d.timetable_slot_id IS NULL AND d.period_no IS NOT DISTINCT FROM p.period_no))
       UNION ALL
       -- And anything put on this date that the weekly pattern does not have:
       -- a makeup lesson, a one-off, a class moved. Dropping these would lose
       -- the only lessons that were deliberately scheduled by hand.
       SELECT d.subject_id, d.period_no, NULL::varchar, NULL::bigint,
              d.daily_lesson_id, d.note, d.page_from, d.page_to, false, d.timetable_slot_id,
              COALESCE(d.held, true), d.not_held_reason, COALESCE(d.is_continuation, false)
         FROM dated d
        WHERE NOT EXISTS (
                SELECT 1 FROM pattern p
                 WHERE p.subject_id = d.subject_id
                   AND (d.timetable_slot_id = p.id OR
                        (d.timetable_slot_id IS NULL AND p.period_no IS NOT DISTINCT FROM d.period_no)))
     )
     SELECT dl.id::int AS id, dl.lesson_code AS "lessonCode", dl.lesson_type AS "lessonType",
       subj.code AS "subjectCode", subj.name_mn AS "subjectName",
       sk.name_mn AS "skillName", dl.learning_goal_mn AS "learningGoal",
       dl.remember_mn AS remember, dl.worked_example_mn AS "workedExample",
       dl.guided_practice_mn AS "guidedPractice",
       dl.independent_practice_mn AS "independentPractice",
       dl.student_message_mn AS "studentMessage", combined.note AS "teacherNote",
       dl.estimated_minutes::int AS "estimatedMinutes",
       book.material_id::int AS "materialId", book.material_title AS "materialTitle",
       book.chapter_title AS "chapterTitle",
       -- The teacher's own range where they set one: the child is sent to the
       -- pages their class actually worked from, not the book's default.
       COALESCE(combined.page_from, book.page_from)::int AS "pageFrom",
       COALESCE(combined.page_to, book.page_to)::int AS "pageTo",
       COALESCE(book.page_offset, 0)::int AS "pageOffset",
       combined.slot_id::int AS "timetableSlotId",
       combined.selection_pending AS "selectionPending",
       combined.period_no::int AS "periodNo", combined.group_label AS "groupLabel",
       teacher.display_name AS "teacherName",
       to_char(p.starts_at, 'HH24:MI') AS "startsAt",
       to_char(p.ends_at, 'HH24:MI') AS "endsAt",
       combined.held, combined.not_held_reason AS "notHeldReason",
       combined.is_continuation AS "isContinuation"
     FROM combined
     CROSS JOIN LATERAL (SELECT school_year FROM enrolled LIMIT 1) me
     JOIN core.subjects subj ON subj.id = combined.subject_id AND subj.is_active
     LEFT JOIN learning.class_periods p
       ON p.period_no = combined.period_no AND p.school_year = me.school_year
     LEFT JOIN core.teachers t ON t.id = combined.teacher_id
     LEFT JOIN core.users teacher ON teacher.id = t.user_id
     LEFT JOIN learning.daily_lessons dl
       ON dl.id = combined.daily_lesson_id AND dl.status = 'APPROVED'
     LEFT JOIN content.skills sk ON sk.id = dl.core_skill_id
     LEFT JOIN LATERAL (
       SELECT material_id, material_title, chapter_title, page_from, page_to, page_offset
       FROM (
         (SELECT sm.id AS material_id, sm.title AS material_title,
                son.title AS chapter_title, a.page_from, a.page_to,
                (SELECT sv.page_offset FROM content.source_versions sv
                  WHERE sv.source_material_id = sm.id AND sv.status = 'APPROVED'
                  ORDER BY sv.version_no DESC LIMIT 1) AS page_offset,
                1 AS rank
           FROM content.content_skill_maps m
           JOIN content.content_nodes cn ON cn.id = m.content_node_id AND cn.status = 'APPROVED'
           JOIN content.content_source_alignments a ON a.content_node_id = cn.id AND a.status = 'APPROVED'
           JOIN content.source_materials sm ON sm.id = a.source_material_id AND sm.status = 'APPROVED'
           LEFT JOIN content.source_outline_nodes son ON son.id = a.source_outline_node_id
          WHERE m.skill_id = sk.id AND m.status = 'APPROVED'
          ORDER BY m.is_primary DESC, a.page_from
          LIMIT 1)
         UNION ALL
         -- The section the lesson itself names. Content authored from a book
         -- outline carries source_outline_node_id and no skill map, so the
         -- chain above cannot see it; without this every imported lesson looks
         -- as though it had no book at all - no title, no pages, nothing to
         -- open.
         (SELECT sm.id, sm.title, son.title, son.page_from, son.page_to,
                (SELECT sv.page_offset FROM content.source_versions sv
                  WHERE sv.source_material_id = sm.id AND sv.status = 'APPROVED'
                  ORDER BY sv.version_no DESC LIMIT 1), 2
           FROM content.source_outline_nodes son
           JOIN content.source_materials sm ON sm.id = son.source_material_id
            AND sm.status = 'APPROVED'
          WHERE son.id = dl.source_outline_node_id)
       ) found ORDER BY rank LIMIT 1
     ) book ON true
     ORDER BY combined.period_no NULLS LAST, subj.code`,
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
       -- The book's own range, and only that: personal work belongs to one
       -- child rather than to a lesson a class sat through, so there is no
       -- "what we actually covered" to override it with.
       book.page_to::int AS "pageTo", COALESCE(book.page_offset, 0)::int AS "pageOffset",
       NULL::int AS "periodNo", sa.source::text AS source, sa.reason
     FROM learning.student_assignments sa
     JOIN learning.daily_lessons dl ON dl.id = sa.daily_lesson_id AND dl.status = 'APPROVED'
     JOIN content.skills sk ON sk.id = dl.core_skill_id
     JOIN core.subjects subj ON subj.id = sk.subject_id
     LEFT JOIN LATERAL (
       SELECT material_id, material_title, chapter_title, page_from, page_to, page_offset
       FROM (
         (SELECT sm.id AS material_id, sm.title AS material_title,
                son.title AS chapter_title, a.page_from, a.page_to,
                (SELECT sv.page_offset FROM content.source_versions sv
                  WHERE sv.source_material_id = sm.id AND sv.status = 'APPROVED'
                  ORDER BY sv.version_no DESC LIMIT 1) AS page_offset,
                1 AS rank
           FROM content.content_skill_maps m
           JOIN content.content_nodes cn ON cn.id = m.content_node_id AND cn.status = 'APPROVED'
           JOIN content.content_source_alignments a ON a.content_node_id = cn.id AND a.status = 'APPROVED'
           JOIN content.source_materials sm ON sm.id = a.source_material_id AND sm.status = 'APPROVED'
           LEFT JOIN content.source_outline_nodes son ON son.id = a.source_outline_node_id
          WHERE m.skill_id = sk.id AND m.status = 'APPROVED'
          ORDER BY m.is_primary DESC, a.page_from
          LIMIT 1)
         UNION ALL
         -- The section the lesson itself names. Content authored from a book
         -- outline carries source_outline_node_id and no skill map, so the
         -- chain above cannot see it; without this every imported lesson looks
         -- as though it had no book at all - no title, no pages, nothing to
         -- open.
         (SELECT sm.id, sm.title, son.title, son.page_from, son.page_to,
                (SELECT sv.page_offset FROM content.source_versions sv
                  WHERE sv.source_material_id = sm.id AND sv.status = 'APPROVED'
                  ORDER BY sv.version_no DESC LIMIT 1), 2
           FROM content.source_outline_nodes son
           JOIN content.source_materials sm ON sm.id = son.source_material_id
            AND sm.status = 'APPROVED'
          WHERE son.id = dl.source_outline_node_id)
       ) found ORDER BY rank LIMIT 1
     ) book ON true
     WHERE sa.student_id = $1::bigint AND sa.assigned_on = $2::date
     ORDER BY subj.code`,
    [studentId, onDate],
  );
