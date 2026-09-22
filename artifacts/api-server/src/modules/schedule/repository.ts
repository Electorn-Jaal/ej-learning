import { and, eq, inArray, sql } from "drizzle-orm";
import { classScheduleInLearning, db, readRows } from "@workspace/db";

export type SchedulableLesson = {
  id: number;
  lessonCode: string;
  lessonType: string;
  skillName: string;
  chapterTitle: string | null;
  pageFrom: number | null;
};

export const scheduleForClass = (
  classId: number,
  from: string,
  to: string,
  subjectIds: number[] | null,
) =>
  readRows<{
    scheduledOn: string;
    subjectId: number | null;
    subject: string | null;
    lessonId: number | null;
    lessonCode: string | null;
    lessonType: string | null;
    skillName: string | null;
    note: string | null;
  }>(
    `WITH visible_subjects AS (
       SELECT sub.id, sub.name_mn FROM core.subjects sub
       WHERE ($4::bigint[] IS NOT NULL AND sub.id = ANY($4::bigint[]))
          OR ($4::bigint[] IS NULL AND sub.id IN (
            SELECT ct.subject_id FROM core.class_teachers ct
            WHERE ct.class_id = $1::bigint AND ct.is_active AND ct.subject_id IS NOT NULL
            UNION
            SELECT cs.subject_id FROM learning.class_schedule cs WHERE cs.class_id = $1::bigint
          ))
     )
     SELECT d.day::date::text AS "scheduledOn",
       sub.id::int AS "subjectId", sub.name_mn AS subject,
       dl.id::int AS "lessonId", dl.lesson_code AS "lessonCode",
       dl.lesson_type AS "lessonType", sk.name_mn AS "skillName", cs.note
     FROM generate_series($2::date, $3::date, interval '1 day') AS d(day)
     LEFT JOIN visible_subjects sub ON true
     LEFT JOIN learning.class_schedule cs
       ON cs.class_id = $1::bigint AND cs.scheduled_on = d.day::date AND cs.subject_id = sub.id
     LEFT JOIN learning.daily_lessons dl ON dl.id = cs.daily_lesson_id
     LEFT JOIN content.skills sk ON sk.id = dl.core_skill_id
     ORDER BY d.day, sub.name_mn NULLS FIRST`,
    [classId, from, to, subjectIds],
  );

export const schedulableLessons = (classId: number, subjectIds: number[] | null) =>
  readRows<SchedulableLesson & { sequenceNo: number | null; orderPage: number | null }>(
    `SELECT DISTINCT ON (dl.id)
       dl.id::int AS id, dl.lesson_code AS "lessonCode",
       dl.lesson_type AS "lessonType", sk.name_mn AS "skillName",
       son.title AS "chapterTitle", a.page_from::int AS "pageFrom",
       son.sequence_no::int AS "sequenceNo", a.page_from::int AS "orderPage"
     FROM core.classes c
     JOIN content.skills sk ON sk.grade_level_id = c.grade_level_id
     JOIN learning.daily_lessons dl ON dl.core_skill_id = sk.id AND dl.status = 'APPROVED'
     LEFT JOIN content.content_skill_maps m ON m.skill_id = sk.id AND m.status = 'APPROVED'
     LEFT JOIN content.content_nodes cn ON cn.id = m.content_node_id AND cn.status = 'APPROVED'
     LEFT JOIN content.content_source_alignments a ON a.content_node_id = cn.id AND a.status = 'APPROVED'
     LEFT JOIN content.source_outline_nodes son ON son.id = a.source_outline_node_id
     WHERE c.id = $1::bigint AND sk.status = 'APPROVED'
       AND ($2::bigint[] IS NULL OR sk.subject_id = ANY($2::bigint[]))
     ORDER BY dl.id, son.sequence_no NULLS LAST, a.page_from NULLS LAST`,
    [classId, subjectIds],
  ).then((rows) =>
    [...rows].sort(
      (left, right) =>
        (left.sequenceNo ?? 9e9) - (right.sequenceNo ?? 9e9) ||
        (left.orderPage ?? 9e9) - (right.orderPage ?? 9e9) ||
        left.lessonCode.localeCompare(right.lessonCode),
    ),
  );

export const termById = (termId: number) =>
  readRows<{ id: number; nameMn: string; startsOn: string; endsOn: string }>(
    `SELECT id::int AS id, name_mn AS "nameMn",
       starts_on::text AS "startsOn", ends_on::text AS "endsOn"
     FROM learning.terms WHERE id = $1::smallint`,
    [termId],
  );

export const termCovering = (isoDate: string) =>
  readRows<{ id: number }>(
    `SELECT id::int AS id FROM learning.terms
     WHERE $1::date BETWEEN starts_on AND ends_on ORDER BY term_number LIMIT 1`,
    [isoDate],
  );

export const scheduledDates = (classId: number, from: string, to: string) =>
  readRows<{ scheduledOn: string }>(
    `SELECT scheduled_on::text AS "scheduledOn" FROM learning.class_schedule
     WHERE class_id = $1::bigint AND scheduled_on BETWEEN $2::date AND $3::date`,
    [classId, from, to],
  );

export async function insertScheduleDays(
  rows: Array<{
    classId: number;
    termId: number;
    dailyLessonId: number;
    scheduledOn: string;
    createdBy: number | null;
  }>,
) {
  for (const row of rows) {
    await db.execute(sql`
      INSERT INTO learning.class_schedule
        (class_id, term_id, daily_lesson_id, scheduled_on, subject_id, created_by)
      SELECT ${row.classId}, ${row.termId}, ${row.dailyLessonId}, ${row.scheduledOn}::date,
        sk.subject_id, ${row.createdBy}
      FROM learning.daily_lessons dl
      JOIN content.skills sk ON sk.id = dl.core_skill_id
      WHERE dl.id = ${row.dailyLessonId}`);
  }
}

export async function clearScheduleDay(
  classId: number,
  scheduledOn: string,
  subjectIds: number[] | null,
) {
  const conditions = [
    eq(classScheduleInLearning.classId, classId),
    eq(classScheduleInLearning.scheduledOn, scheduledOn),
  ];
  if (subjectIds !== null) {
    conditions.push(inArray(classScheduleInLearning.subjectId, subjectIds));
  }
  await db.delete(classScheduleInLearning).where(and(...conditions));
}

export async function setScheduleDay(row: {
  classId: number;
  termId: number;
  dailyLessonId: number;
  scheduledOn: string;
  createdBy: number | null;
  note: string | null;
  replaceNote: boolean;
}) {
  await db.execute(sql`
    INSERT INTO learning.class_schedule
      (class_id, term_id, daily_lesson_id, scheduled_on, subject_id, created_by, note)
    SELECT ${row.classId}, ${row.termId}, ${row.dailyLessonId}, ${row.scheduledOn}::date,
      sk.subject_id, ${row.createdBy}, ${row.note}
    FROM learning.daily_lessons dl
    JOIN content.skills sk ON sk.id = dl.core_skill_id
    WHERE dl.id = ${row.dailyLessonId}
    ON CONFLICT ON CONSTRAINT class_schedule_class_day_key DO UPDATE SET
      daily_lesson_id = EXCLUDED.daily_lesson_id,
      term_id = EXCLUDED.term_id,
      created_by = EXCLUDED.created_by,
      note = CASE WHEN ${row.replaceNote} THEN EXCLUDED.note
                  ELSE learning.class_schedule.note END`);
}
