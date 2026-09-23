/**
 * Lays a book's lessons onto the periods the class actually has for it.
 *
 * Dry-run (default): pnpm --filter @workspace/api-server schedule-book-lessons
 * Apply:             pnpm --filter @workspace/api-server schedule-book-lessons -- --apply --yes
 * From a date:       ... -- --from 2026-09-23
 *
 * Why this exists. Two halves of the day were already true and had nothing
 * joining them. learning.timetable_slots holds the school's real timetable -
 * 6а has mathematics in the first period on a Wednesday - and
 * learning.daily_lessons holds the sections of the grade-6 books in the order
 * the books print them. learning.class_schedule is the row that says "this
 * section, in that period, on this date", and it was empty: the timetable
 * import cleared the demonstration rows and nothing replaced them. So a child
 * opening their day saw Математик with no lesson behind it, and the Хичээл
 * button - which only appears where there is something to open - stayed away.
 *
 * What it assumes, and it is the only thing it assumes: one section per
 * period, in book order, starting from --from. That is a pace, not a fact.
 * A teacher who covers II.4 in two lessons, or skips a revision page, changes
 * the day from the schedule screen and their choice is kept - the script
 * never overwrites a row that already exists, and created_by stays null so
 * the rows it writes are distinguishable from the ones a person chose.
 *
 * It stops at the end of the term the start date falls in. A plan that ran to
 * June would be a claim about three terms nobody has planned yet.
 */
import { pool } from "@workspace/db";

const apply = process.argv.includes("--apply");
if (apply && !process.argv.includes("--yes")) throw new Error("Refusing apply without --yes.");

const fromArg = process.argv[process.argv.indexOf("--from") + 1];
const start = process.argv.includes("--from") && fromArg && /^\d{4}-\d{2}-\d{2}$/.test(fromArg)
  ? fromArg
  : new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ulaanbaatar" }).format(new Date());

const shiftDay = (day: string, offset: number) => {
  const date = new Date(day + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
};

/** Monday 1 … Sunday 7, the same numbering timetable_slots.weekday_no uses. */
const isoWeekday = (day: string) => ((new Date(day + "T00:00:00Z").getUTCDay() + 6) % 7) + 1;

type Term = { id: string; nameMn: string; schoolYear: string; startsOn: string; endsOn: string };
type Lesson = { id: string; lessonCode: string; skill: string };
type Slot = {
  id: string;
  periodNo: number;
  weekdayNo: number;
  validFrom: string;
  validTo: string | null;
};

const client = await pool.connect();
try {
  const { rows: terms } = await client.query<Term>(`
    SELECT id::text, name_mn AS "nameMn", school_year AS "schoolYear",
           to_char(starts_on, 'YYYY-MM-DD') AS "startsOn",
           to_char(ends_on, 'YYYY-MM-DD') AS "endsOn"
      FROM learning.terms ORDER BY starts_on`);

  const term = terms.find((row) => row.startsOn <= start && start <= row.endsOn);
  if (!term) {
    console.log(`${start} нь бүртгэлтэй улиралд багтахгүй байна. Улирлууд:`);
    for (const row of terms) console.log(`  ${row.startsOn} … ${row.endsOn}  ${row.nameMn}`);
    throw new Error("No term covers the start date.");
  }

  console.log(`${start} … ${term.endsOn}  ${term.nameMn} (${term.schoolYear})\n`);

  /**
   * Every subject that has authored lessons pointing at a book, and the grades
   * that book is for. A lesson with no source material is skipped: without the
   * book there is no order to lay it out in, and guessing one would put
   * sections in front of a class in an order nobody chose.
   */
  const { rows: sets } = await client.query<{
    subjectId: string; subjectCode: string; subjectName: string;
    materialId: string; materialTitle: string; gradeNumbers: number[];
  }>(`
    SELECT sub.id::text AS "subjectId", sub.code AS "subjectCode", sub.name_mn AS "subjectName",
           sm.id::text AS "materialId", sm.title AS "materialTitle",
           array_agg(DISTINCT gl.grade_number) AS "gradeNumbers"
      FROM learning.daily_lessons dl
      JOIN content.skills sk ON sk.id = dl.core_skill_id
      JOIN core.subjects sub ON sub.id = sk.subject_id
      JOIN content.source_materials sm ON sm.id = dl.source_material_id
      JOIN content.source_material_grades smg ON smg.source_material_id = sm.id
      JOIN core.grade_levels gl ON gl.id = smg.grade_level_id
     WHERE dl.status = 'APPROVED' AND dl.source_outline_node_id IS NOT NULL
     GROUP BY 1, 2, 3, 4, 5
     ORDER BY sub.name_mn`);

  let written = 0;
  let planned = 0;
  if (apply) await client.query("BEGIN");

  for (const set of sets) {
    const { rows: lessons } = await client.query<Lesson>(`
      SELECT dl.id::text, dl.lesson_code AS "lessonCode", sk.name_mn AS skill
        FROM learning.daily_lessons dl
        JOIN content.skills sk ON sk.id = dl.core_skill_id
        JOIN content.source_outline_nodes n ON n.id = dl.source_outline_node_id
       WHERE sk.subject_id = $1::bigint AND dl.source_material_id = $2::bigint
         AND dl.status = 'APPROVED'
       ORDER BY n.sequence_no, dl.lesson_code`,
      [set.subjectId, set.materialId]);

    const { rows: classes } = await client.query<{ id: string; nameMn: string }>(`
      SELECT cl.id::text, cl.name_mn AS "nameMn"
        FROM core.classes cl
        JOIN core.grade_levels gl ON gl.id = cl.grade_level_id
       WHERE cl.is_active AND cl.school_year = $2 AND gl.grade_number = ANY($1::int[])
       ORDER BY gl.grade_number, cl.name_mn`,
      [set.gradeNumbers, term.schoolYear]);

    for (const klass of classes) {
      const { rows: slots } = await client.query<Slot>(`
        SELECT ts.id::text, ts.period_no AS "periodNo", ts.weekday_no AS "weekdayNo",
               to_char(ts.valid_from, 'YYYY-MM-DD') AS "validFrom",
               to_char(ts.valid_to, 'YYYY-MM-DD') AS "validTo"
          FROM learning.timetable_slots ts
         WHERE ts.class_id = $1::bigint AND ts.subject_id = $2::bigint
         ORDER BY ts.weekday_no, ts.period_no`,
        [klass.id, set.subjectId]);
      if (slots.length === 0) continue;

      // One lesson per period, not per slot. Where a class splits into two
      // groups the register writes two rows for the same period, and both
      // halves are taught the same section of the same book - giving the
      // second half the next lesson would put one group a topic ahead of the
      // other for no reason anybody decided.
      const rows: { date: string; periodNo: number; slotIds: string[]; lesson: Lesson }[] = [];
      let next = 0;
      for (let date = start; date <= term.endsOn && next < lessons.length; date = shiftDay(date, 1)) {
        const weekday = isoWeekday(date);
        const today = slots.filter((slot) =>
          slot.weekdayNo === weekday && slot.validFrom <= date && (slot.validTo === null || slot.validTo >= date));
        const periods = [...new Set(today.map((slot) => slot.periodNo))].sort((a, b) => a - b);
        for (const periodNo of periods) {
          if (next >= lessons.length) break;
          rows.push({
            date,
            periodNo,
            slotIds: today.filter((slot) => slot.periodNo === periodNo).map((slot) => slot.id),
            lesson: lessons[next]!,
          });
          next += 1;
        }
      }

      planned += rows.length;
      const last = rows[rows.length - 1];
      console.log(`${klass.nameMn.padEnd(5)} ${set.subjectName.padEnd(28)}`
        + ` ${rows.length}/${lessons.length} хичээл`
        + (last ? `  ${rows[0]!.date} … ${last.date}` : "  (хуваарьт цаг алга)"));
      if (rows.length && rows.length < lessons.length) {
        console.log(`      ${lessons.length - rows.length} сэдэв улирлын төгсгөлөөс хэтэрлээ.`);
      }

      if (!apply) continue;
      for (const row of rows) {
        for (const slotId of row.slotIds) {
          const result = await client.query(`
            INSERT INTO learning.class_schedule
              (class_id, term_id, subject_id, scheduled_on, period_no, timetable_slot_id, daily_lesson_id)
            VALUES ($1::bigint, $2::bigint, $3::bigint, $4::date, $5, $6::bigint, $7::bigint)
            ON CONFLICT DO NOTHING`,
            [klass.id, term.id, set.subjectId, row.date, row.periodNo, slotId, row.lesson.id]);
          written += result.rowCount ?? 0;
        }
      }
    }
  }

  if (apply) {
    await client.query("COMMIT");
    const { rows: [count] } = await client.query<Record<string, string>>(`
      SELECT count(*)::text AS total,
             count(*) FILTER (WHERE created_by IS NULL)::text AS laid_out
        FROM learning.class_schedule`);
    console.log(`\nБичигдлээ: ${written} мөр. learning.class_schedule нийт ${count.total}.`);
  } else {
    console.log(`\nТуршилт. ${planned} хичээлийн өдөр бэлэн. Бичихдээ --apply --yes нэм.`);
  }
} catch (error) {
  if (apply) await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
