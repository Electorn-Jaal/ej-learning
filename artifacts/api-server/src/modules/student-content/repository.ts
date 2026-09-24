import { readRows } from "@workspace/db";

export const subjectOutline = (studentId: number, subjectCode: string) =>
  readRows<{
    nodeId: string;
    printedNumber: string | null;
    title: string;
    pageFrom: number | null;
    pageTo: number | null;
    periodNo: number | null;
    position: number;
    isCurrent: boolean;
    isPast: boolean;
  }>(
    `WITH mine AS (
       SELECT cs.class_id, cs.subject_id, cs.source_material_id
         FROM core.student_enrollments e
         JOIN core.class_subjects cs ON cs.class_id = e.class_id AND cs.is_active
         JOIN core.subjects s ON s.id = cs.subject_id AND s.code = $2
        WHERE e.student_id = $1::bigint AND e.is_active
        LIMIT 1
     ), here AS (
       -- Where the class is, read off the calendar rather than off a pointer
       -- somebody maintains by hand: the newest section the timetable has
       -- actually put in front of them. learning.class_topics survives as the
       -- fallback for a class whose days carry no content yet.
       -- Each arm is bracketed. ORDER BY and LIMIT inside a UNION arm bind to
       -- the whole union unless the arm is parenthesised, and Postgres refuses
       -- the statement outright: 42601, syntax error at or near "UNION". The
       -- page this feeds - the sections of a subject's book, with the class's
       -- place in it - returned 500 for every child until this was corrected.
       SELECT sequence_no FROM (
         (SELECT n.sequence_no, 1 AS rank
            FROM learning.class_schedule cs
            JOIN mine ON mine.class_id = cs.class_id AND mine.subject_id = cs.subject_id
            JOIN learning.daily_lessons dl ON dl.id = cs.daily_lesson_id
            JOIN content.source_outline_nodes n ON n.id = dl.source_outline_node_id
           WHERE cs.scheduled_on <= (now() AT TIME ZONE 'Asia/Ulaanbaatar')::date
           ORDER BY cs.scheduled_on DESC, n.sequence_no DESC
           LIMIT 1)
         UNION ALL
         (SELECT n.sequence_no, 2
            FROM learning.class_topics ct
            JOIN mine ON mine.class_id = ct.class_id AND mine.subject_id = ct.subject_id
            JOIN content.source_outline_nodes n ON n.id = ct.source_outline_node_id)
       ) found ORDER BY rank LIMIT 1
     )
     SELECT n.id::text AS "nodeId", n.printed_number AS "printedNumber", n.title,
       n.page_from::int AS "pageFrom", n.page_to::int AS "pageTo",
       n.planning_period_no::int AS "periodNo",
       (row_number() OVER (ORDER BY n.sequence_no))::int AS "position",
       COALESCE(n.sequence_no = (SELECT sequence_no FROM here), false) AS "isCurrent",
       COALESCE(n.sequence_no < (SELECT sequence_no FROM here), false) AS "isPast"
     FROM content.source_outline_nodes n
     JOIN mine ON mine.source_material_id = n.source_material_id
     ORDER BY n.sequence_no`,
    [studentId, subjectCode],
  );

export const subjectBook = (studentId: number, subjectCode: string) =>
  readRows<{
    subjectName: string;
    bookTitle: string | null;
    materialId: string | null;
    pageOffset: number;
    totalSections: number;
  }>(
    `SELECT s.name_mn AS "subjectName", m.title AS "bookTitle",
       m.id::text AS "materialId",
       COALESCE((SELECT sv.page_offset FROM content.source_versions sv
                  WHERE sv.source_material_id = m.id AND sv.status = 'APPROVED'
                  ORDER BY sv.version_no DESC LIMIT 1), 0)::int AS "pageOffset",
       (SELECT count(*)::int FROM content.source_outline_nodes n
         WHERE n.source_material_id = cs.source_material_id) AS "totalSections"
     FROM core.student_enrollments e
     JOIN core.class_subjects cs ON cs.class_id = e.class_id AND cs.is_active
     JOIN core.subjects s ON s.id = cs.subject_id AND s.code = $2
     LEFT JOIN content.source_materials m ON m.id = cs.source_material_id
     WHERE e.student_id = $1::bigint AND e.is_active
     LIMIT 1`,
    [studentId, subjectCode],
  );

/**
 * Who teaches this child this subject.
 *
 * Two sources, because the school records it twice and neither is complete on
 * its own: core.class_teachers is the assignment the school made, and
 * timetable_slots names whoever is actually standing in the room for a period.
 * A subject taught by one person appears once either way; a class split
 * between two teachers shows both, which is the truth.
 */
export const subjectTeachers = (studentId: number, subjectCode: string) =>
  readRows<{ teacherId: number; name: string; hasPhoto: boolean }>(
    `WITH mine AS (
       SELECT e.class_id, s.id AS subject_id
         FROM core.student_enrollments e
         JOIN core.class_subjects cs ON cs.class_id = e.class_id AND cs.is_active
         JOIN core.subjects s ON s.id = cs.subject_id AND s.code = $2
        WHERE e.student_id = $1::bigint AND e.is_active
        LIMIT 1
     ), holders AS (
       SELECT ct.teacher_id
         FROM core.class_teachers ct
         JOIN mine ON mine.class_id = ct.class_id AND mine.subject_id = ct.subject_id
        WHERE ct.is_active
       UNION
       SELECT ts.teacher_id
         FROM learning.timetable_slots ts
         JOIN mine ON mine.class_id = ts.class_id AND mine.subject_id = ts.subject_id
        WHERE ts.teacher_id IS NOT NULL
     )
     SELECT t.id::int AS "teacherId", u.display_name AS name,
            (u.photo_key IS NOT NULL) AS "hasPhoto"
       FROM holders
       JOIN core.teachers t ON t.id = holders.teacher_id AND t.is_active
       JOIN core.users u ON u.id = t.user_id AND u.is_active
      ORDER BY u.display_name`,
    [studentId, subjectCode],
  );
