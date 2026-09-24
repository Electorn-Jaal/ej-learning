import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { classScheduleInLearning, db, pool, readRows } from "@workspace/db";

export type SchedulableLesson = {
  id: number;
  subjectId: number;
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
    timetableSlotId: number | null;
    periodNo: number | null;
    groupLabel: string | null;
    startsAt: string | null;
    teacherName: string | null;
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
            SELECT ct.subject_id FROM core.class_teachers ct WHERE ct.class_id = $1 AND ct.is_active
            UNION SELECT subject_id FROM learning.class_schedule WHERE class_id = $1
            UNION SELECT subject_id FROM learning.timetable_slots WHERE class_id = $1
          ))
     ), weekly AS (
       SELECT d.day::date AS day, ts.*
       FROM generate_series($2::date, $3::date, interval '1 day') d(day)
       JOIN learning.timetable_slots ts ON ts.class_id = $1
        AND ts.weekday_no = EXTRACT(ISODOW FROM d.day)
        AND ts.valid_from <= d.day AND (ts.valid_to IS NULL OR ts.valid_to >= d.day)
       JOIN visible_subjects sub ON sub.id = ts.subject_id
     ), rows AS (
       SELECT w.day, w.subject_id, w.id AS slot_id, w.period_no, w.group_label, w.teacher_id,
              cs.daily_lesson_id, cs.note
       FROM weekly w
       LEFT JOIN learning.class_schedule cs ON cs.class_id = $1 AND cs.scheduled_on = w.day
         AND cs.subject_id = w.subject_id
         AND (cs.timetable_slot_id = w.id OR
              (cs.timetable_slot_id IS NULL AND cs.period_no = w.period_no))
       UNION ALL
       SELECT d.day::date, sub.id, NULL::bigint, cs.period_no, NULL::varchar, NULL::bigint,
              cs.daily_lesson_id, cs.note
       FROM generate_series($2::date, $3::date, interval '1 day') d(day)
       LEFT JOIN visible_subjects sub ON true
       LEFT JOIN learning.class_schedule cs ON cs.class_id = $1 AND cs.scheduled_on = d.day::date
         AND cs.subject_id = sub.id AND cs.timetable_slot_id IS NULL
       WHERE NOT EXISTS (SELECT 1 FROM weekly w WHERE w.day = d.day::date AND w.subject_id = sub.id
         AND (cs.id IS NULL OR w.period_no IS NOT DISTINCT FROM cs.period_no))
     )
     SELECT rows.day::text AS "scheduledOn", rows.slot_id::int AS "timetableSlotId",
       rows.period_no::int AS "periodNo", rows.group_label AS "groupLabel",
       to_char(p.starts_at, 'HH24:MI') AS "startsAt", u.display_name AS "teacherName",
       sub.id::int AS "subjectId", sub.name_mn AS subject,
       dl.id::int AS "lessonId", dl.lesson_code AS "lessonCode",
       dl.lesson_type AS "lessonType", sk.name_mn AS "skillName", rows.note
     FROM rows
     LEFT JOIN core.subjects sub ON sub.id = rows.subject_id
     JOIN core.classes c ON c.id = $1
     LEFT JOIN learning.class_periods p ON p.school_year = c.school_year AND p.period_no = rows.period_no
     LEFT JOIN core.teachers t ON t.id = rows.teacher_id
     LEFT JOIN core.users u ON u.id = t.user_id
     LEFT JOIN learning.daily_lessons dl ON dl.id = rows.daily_lesson_id
     LEFT JOIN content.skills sk ON sk.id = dl.core_skill_id
     ORDER BY rows.day, rows.period_no NULLS LAST, sub.name_mn NULLS FIRST, rows.slot_id`,
    [classId, from, to, subjectIds],
  );

export const schedulableLessons = (classId: number, subjectIds: number[] | null) =>
  readRows<SchedulableLesson & { sequenceNo: number | null; orderPage: number | null }>(
    `SELECT DISTINCT ON (dl.id)
       sk.subject_id::int AS "subjectId", dl.id::int AS id, dl.lesson_code AS "lessonCode",
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
    timetableSlotId?: number | null;
    periodNo?: number | null;
  }>,
) {
  for (const row of rows) {
    await db.execute(sql`
      INSERT INTO learning.class_schedule
        (class_id, term_id, daily_lesson_id, scheduled_on, subject_id, created_by, timetable_slot_id, period_no)
      SELECT ${row.classId}, ${row.termId}, ${row.dailyLessonId}, ${row.scheduledOn}::date,
        sk.subject_id, ${row.createdBy}, ${row.timetableSlotId ?? null}, ${row.periodNo ?? null}
      FROM learning.daily_lessons dl
      JOIN content.skills sk ON sk.id = dl.core_skill_id
      WHERE dl.id = ${row.dailyLessonId}
      ON CONFLICT ON CONSTRAINT class_schedule_class_day_key DO NOTHING`);
  }
}

export async function clearScheduleDay(
  classId: number,
  scheduledOn: string,
  subjectIds: number[] | null,
  timetableSlotId: number | null = null,
) {
  const conditions = [
    eq(classScheduleInLearning.classId, classId),
    eq(classScheduleInLearning.scheduledOn, scheduledOn),
    timetableSlotId === null ? isNull(classScheduleInLearning.timetableSlotId) : eq(classScheduleInLearning.timetableSlotId, timetableSlotId),
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
  pageFrom: number | null;
  pageTo: number | null;
  replacePages: boolean;
  timetableSlotId: number | null;
  periodNo: number | null;
}) {
  await db.execute(sql`
    INSERT INTO learning.class_schedule
      (class_id, term_id, daily_lesson_id, scheduled_on, subject_id, created_by, note,
       page_from, page_to, timetable_slot_id, period_no)
    SELECT ${row.classId}, ${row.termId}, ${row.dailyLessonId}, ${row.scheduledOn}::date,
      sk.subject_id, ${row.createdBy}, ${row.note}, ${row.pageFrom}, ${row.pageTo},
      ${row.timetableSlotId}, ${row.periodNo}
    FROM learning.daily_lessons dl
    JOIN content.skills sk ON sk.id = dl.core_skill_id
    WHERE dl.id = ${row.dailyLessonId}
    ON CONFLICT ON CONSTRAINT class_schedule_class_day_key DO UPDATE SET
      daily_lesson_id = EXCLUDED.daily_lesson_id,
      period_no = EXCLUDED.period_no,
      term_id = EXCLUDED.term_id,
      created_by = EXCLUDED.created_by,
      note = CASE WHEN ${row.replaceNote} THEN EXCLUDED.note
                  ELSE learning.class_schedule.note END,
      -- A page range belongs to the section that was taught. Changing the
      -- section without saying anything about pages drops the old range rather
      -- than carrying it onto a different part of the book.
      page_from = CASE WHEN ${row.replacePages} THEN EXCLUDED.page_from
                       WHEN learning.class_schedule.daily_lesson_id IS DISTINCT FROM EXCLUDED.daily_lesson_id
                       THEN NULL ELSE learning.class_schedule.page_from END,
      page_to = CASE WHEN ${row.replacePages} THEN EXCLUDED.page_to
                     WHEN learning.class_schedule.daily_lesson_id IS DISTINCT FROM EXCLUDED.daily_lesson_id
                     THEN NULL ELSE learning.class_schedule.page_to END`);
}

/**
 * Whether this class is timetabled for these subjects at all, and whether any
 * of it falls on this date.
 *
 * Both halves matter. A school whose timetable has not been loaded has no
 * slots for anything, and refusing every write there would lock the product
 * for a school that has not got that far - so "no timetable at all" means the
 * rule does not apply. Once a subject IS timetabled, a day it does not fall on
 * is a day nobody teaches it, and content put there would appear to a class
 * that is somewhere else.
 */
export const timetableCoverage = (
  classId: number,
  subjectIds: number[] | null,
  onDate: string,
) =>
  readRows<{ total: number; onDay: number }>(
    `SELECT
       count(*)::int AS total,
       count(*) FILTER (
         WHERE ts.weekday_no = EXTRACT(ISODOW FROM $3::date)
           AND ts.valid_from <= $3::date
           AND (ts.valid_to IS NULL OR ts.valid_to >= $3::date)
       )::int AS "onDay"
     FROM learning.timetable_slots ts
     WHERE ts.class_id = $1::bigint
       AND ($2::bigint[] IS NULL OR ts.subject_id = ANY($2::bigint[]))`,
    [classId, subjectIds, onDate],
  );

/** What this day already carries, so a write can tell a change from a repeat. */
export const scheduledLessonOn = (
  classId: number,
  subjectId: number,
  onDate: string,
  slotId: number | null,
) =>
  readRows<{ dailyLessonId: number | null }>(
    `SELECT daily_lesson_id::int AS "dailyLessonId"
     FROM learning.class_schedule
     WHERE class_id = $1::bigint AND subject_id = $2::bigint AND scheduled_on = $3::date
       AND timetable_slot_id IS NOT DISTINCT FROM $4::bigint
     LIMIT 1`,
    [classId, subjectId, onDate, slotId],
  );

/** The periods a class has for one subject, for walking a term forward. */
export const subjectSlots = (classId: number, subjectId: number) =>
  readRows<{
    id: number;
    weekdayNo: number;
    periodNo: number;
    validFrom: string;
    validTo: string | null;
  }>(
    `SELECT ts.id::int AS id, ts.weekday_no::int AS "weekdayNo", ts.period_no::int AS "periodNo",
       ts.valid_from::text AS "validFrom", ts.valid_to::text AS "validTo"
     FROM learning.timetable_slots ts
     WHERE ts.class_id = $1::bigint AND ts.subject_id = $2::bigint
     ORDER BY ts.weekday_no, ts.period_no`,
    [classId, subjectId],
  );

/**
 * Days a person chose, which a replan must step around rather than over.
 *
 * The lesson comes back with them because stepping around a day is not enough:
 * a section a teacher has already pinned to the 14th must not also be dealt
 * out to the 3rd, which is what laying the remaining sections out in order
 * without looking at the pinned ones would do.
 */
export const pinnedScheduleDays = (
  classId: number,
  subjectId: number,
  after: string,
  until: string,
) =>
  readRows<{ scheduledOn: string; timetableSlotId: number | null; dailyLessonId: number | null }>(
    `SELECT scheduled_on::text AS "scheduledOn", timetable_slot_id::int AS "timetableSlotId",
       daily_lesson_id::int AS "dailyLessonId"
     FROM learning.class_schedule
     WHERE class_id = $1::bigint AND subject_id = $2::bigint AND created_by IS NOT NULL
       AND scheduled_on > $3::date AND scheduled_on <= $4::date`,
    [classId, subjectId, after, until],
  );

/**
 * Every section this class has already been through, on or before a date.
 *
 * Two sources, because there are two kinds of claim. class_schedule says what
 * each day was for - the plan's own account, and all anybody has for a day
 * that went by unremarked. class_lesson_coverage says what a teacher told us
 * actually got covered in a period, which is the only way a day that took two
 * sections, or a day that skipped one, can be told apart from the plan.
 *
 * Union, not preference: a section counts as taught if either says so.
 */
export const coveredLessonIds = (classId: number, subjectId: number, until: string) =>
  readRows<{ id: number }>(
    `SELECT DISTINCT daily_lesson_id::int AS id FROM (
       SELECT daily_lesson_id FROM learning.class_schedule
        WHERE class_id = $1::bigint AND subject_id = $2::bigint
          AND scheduled_on <= $3::date AND daily_lesson_id IS NOT NULL
       UNION
       SELECT daily_lesson_id FROM learning.class_lesson_coverage
        WHERE class_id = $1::bigint AND subject_id = $2::bigint
          AND scheduled_on <= $3::date
     ) covered`,
    [classId, subjectId, until],
  ).then((rows) => rows.map((row) => row.id));

/** What a teacher said was covered in one period, for the screen to show back. */
export const dayCoverage = (
  classId: number,
  subjectId: number,
  scheduledOn: string,
  slotId: number | null,
) =>
  readRows<{ id: number }>(
    `SELECT daily_lesson_id::int AS id
       FROM learning.class_lesson_coverage
      WHERE class_id = $1::bigint AND subject_id = $2::bigint
        AND scheduled_on = $3::date AND timetable_slot_id IS NOT DISTINCT FROM $4::bigint
      ORDER BY daily_lesson_id`,
    [classId, subjectId, scheduledOn, slotId],
  ).then((rows) => rows.map((row) => row.id));

/**
 * Replace what one period says it covered.
 *
 * Replace rather than add: the teacher is correcting a single period, and the
 * list on their screen is the whole of their answer. One transaction, so a
 * period is never left saying it covered nothing at all.
 */
export async function setDayCoverage(
  classId: number,
  subjectId: number,
  scheduledOn: string,
  slotId: number | null,
  lessonIds: number[],
  createdBy: number,
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `DELETE FROM learning.class_lesson_coverage
        WHERE class_id = $1::bigint AND subject_id = $2::bigint
          AND scheduled_on = $3::date AND timetable_slot_id IS NOT DISTINCT FROM $4::bigint`,
      [classId, subjectId, scheduledOn, slotId],
    );
    if (lessonIds.length > 0) {
      await client.query(
        `INSERT INTO learning.class_lesson_coverage
           (class_id, subject_id, scheduled_on, timetable_slot_id, daily_lesson_id, created_by)
         SELECT $1::bigint, $2::bigint, $3::date, $4::bigint, x.lesson_id, $6::bigint
           FROM unnest($5::bigint[]) AS x(lesson_id)
         ON CONFLICT ON CONSTRAINT class_lesson_coverage_key DO NOTHING`,
        [classId, subjectId, scheduledOn, slotId, lessonIds, createdBy],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/** Coverage goes with the day it describes when the day is emptied. */
export const clearDayCoverage = (
  classId: number,
  subjectIds: number[] | null,
  scheduledOn: string,
  slotId: number | null,
) =>
  pool.query(
    `DELETE FROM learning.class_lesson_coverage
      WHERE class_id = $1::bigint AND scheduled_on = $3::date
        AND ($2::bigint[] IS NULL OR subject_id = ANY($2::bigint[]))
        AND timetable_slot_id IS NOT DISTINCT FROM $4::bigint`,
    [classId, subjectIds, scheduledOn, slotId],
  );

/**
 * Lay the rest of the term out again, all of it or none of it.
 *
 * Every row it writes carries created_by null, which is how this system says
 * "nobody decided this, it follows from the order of the book". The rows it
 * replaces were written the same way; days a teacher chose are not in the list
 * at all, because the caller leaves them out.
 *
 * The delete goes first so that a plan which now needs fewer days does not
 * leave the tail of the old one lying in the calendar - and that is exactly
 * why the two statements share one transaction. Between them the rest of the
 * term is empty. A connection dropped there, or an insert that fails on a row
 * near the end, would leave a class with no plan at all: not the old one, not
 * the new one, and nothing on the screen to say so. A teacher approved a
 * change, so they get the change or they get what they had.
 */
export async function replanScheduleDays(
  classId: number,
  subjectId: number,
  after: string,
  until: string,
  rows: Array<{ lessonId: number; onDate: string; slotId: number | null; periodNo: number | null }>,
) {
  // One client, held for both statements. readRows would not do: it opens a
  // READ ONLY transaction. Nor would a drizzle template: it expands a JS array
  // into a list of parameters, which turns unnest($3::bigint[]) into
  // unnest(1, 2, 3::bigint[]).
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `DELETE FROM learning.class_schedule
        WHERE class_id = $1::bigint AND subject_id = $2::bigint AND created_by IS NULL
          AND scheduled_on > $3::date AND scheduled_on <= $4::date`,
      [classId, subjectId, after, until],
    );
    if (rows.length > 0) {
      await client.query(
        `INSERT INTO learning.class_schedule
           (class_id, term_id, daily_lesson_id, scheduled_on, subject_id, created_by,
            timetable_slot_id, period_no)
         SELECT $1::bigint, t.id, x.lesson_id, x.on_date, $2::bigint, NULL, x.slot_id, x.period_no
           FROM unnest($3::bigint[], $4::date[], $5::bigint[], $6::int[])
                  AS x(lesson_id, on_date, slot_id, period_no)
           JOIN LATERAL (
             SELECT id FROM learning.terms
              WHERE x.on_date BETWEEN starts_on AND ends_on
              ORDER BY term_number LIMIT 1
           ) t ON true
         ON CONFLICT ON CONSTRAINT class_schedule_class_day_key DO UPDATE SET
           daily_lesson_id = EXCLUDED.daily_lesson_id,
           period_no = EXCLUDED.period_no,
           term_id = EXCLUDED.term_id,
           created_by = EXCLUDED.created_by`,
        [
          classId,
          subjectId,
          rows.map((row) => row.lessonId),
          rows.map((row) => row.onDate),
          rows.map((row) => row.slotId),
          rows.map((row) => row.periodNo),
        ],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export const timetableSlot = (id: number) => readRows<{
  id: number; classId: number; subjectId: number; periodNo: number;
  weekdayNo: number; validFrom: string; validTo: string | null; groupLabel: string | null;
  assigned: boolean;
}>(`SELECT id::int, class_id::int AS "classId", subject_id::int AS "subjectId",
    period_no::int AS "periodNo", weekday_no::int AS "weekdayNo",
    valid_from::text AS "validFrom", valid_to::text AS "validTo", group_label AS "groupLabel",
    audience_assigned AS assigned
    FROM learning.timetable_slots WHERE id = $1`, [id]);

export const slotStudents = (slotId: number, classId: number) => readRows<{
  id: number; name: string; selected: boolean;
}>(`SELECT s.id::int, s.display_name AS name,
    EXISTS (SELECT 1 FROM learning.timetable_slot_students m
      WHERE m.timetable_slot_id = $1 AND m.student_id = s.id) AS selected
    FROM core.students s JOIN core.student_enrollments e ON e.student_id = s.id
    WHERE e.class_id = $2 AND e.is_active AND s.is_active ORDER BY s.display_name`, [slotId, classId]);

export async function setSlotStudents(slotId: number, studentIds: number[]) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT id FROM learning.timetable_slots WHERE id = $1 FOR UPDATE', [slotId]);
    await client.query('DELETE FROM learning.timetable_slot_students WHERE timetable_slot_id = $1', [slotId]);
    await client.query(`INSERT INTO learning.timetable_slot_students (timetable_slot_id, student_id)
      SELECT $1, unnest($2::bigint[])`, [slotId, studentIds]);
    await client.query('UPDATE learning.timetable_slots SET audience_assigned = true WHERE id = $1', [slotId]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

/**
 * A teacher's own week, across every class they take.
 *
 * The week view used to be one class at a time with a row per subject, which
 * answers "what does 9a do" - a question the class list already answers. A
 * teacher looking at a week wants the other one: where am I at half past
 * eleven on Wednesday. So the rows are periods and the cells name the class.
 *
 * Read from the weekly pattern rather than from dated rows, because that is
 * where the school's timetable lives; content, when any exists, is looked up
 * per date by the caller.
 */
export const teacherWeek = (teacherId: number | null, isAdmin: boolean) =>
  readRows<{
    slotId: string; weekdayNo: number; periodNo: number;
    startsAt: string | null; endsAt: string | null;
    classId: number; className: string; gradeLevel: number;
    subjectId: number; subject: string; groupLabel: string | null;
    teacherName: string | null;
  }>(
    `SELECT ts.id::text AS "slotId", ts.weekday_no::int AS "weekdayNo",
       ts.period_no::int AS "periodNo",
       to_char(p.starts_at, 'HH24:MI') AS "startsAt",
       to_char(p.ends_at, 'HH24:MI') AS "endsAt",
       c.id::int AS "classId", c.name_mn AS "className",
       g.grade_number::int AS "gradeLevel",
       sub.id::int AS "subjectId", sub.name_mn AS subject,
       ts.group_label AS "groupLabel", u.display_name AS "teacherName"
     FROM learning.timetable_slots ts
     JOIN core.classes c ON c.id = ts.class_id AND c.is_active
     JOIN core.grade_levels g ON g.id = c.grade_level_id
     JOIN core.subjects sub ON sub.id = ts.subject_id AND sub.is_active
     LEFT JOIN learning.class_periods p
       ON p.period_no = ts.period_no AND p.school_year = c.school_year
     LEFT JOIN core.teachers t ON t.id = ts.teacher_id
     LEFT JOIN core.users u ON u.id = t.user_id
     WHERE ($2::boolean OR ts.teacher_id = $1::bigint)
       AND (ts.valid_to IS NULL OR ts.valid_to >= CURRENT_DATE)
     ORDER BY ts.weekday_no, ts.period_no, c.class_code, sub.code`,
    [teacherId ?? 0, isAdmin],
  );
