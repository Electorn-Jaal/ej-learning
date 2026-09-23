/**
 * Loads the school's weekly timetable: every class, day and period.
 *
 * Dry-run (default): pnpm --filter @workspace/api-server import-timetable-slots
 * Apply:             pnpm --filter @workspace/api-server import-timetable-slots -- --apply --yes
 *
 * The second pass over the 2026-2027 grid. The first recorded who teaches
 * what; this records when. Until now the only timetable in the system was
 * fifty-seven invented rows for 6a, which meant twenty-nine children were
 * shown a made-up day and the other two hundred and eighteen an empty one.
 *
 * Written as a weekly pattern rather than a row per date. The sheet is headed
 * "from 21 September" and holds until the school replaces it, so dated rows
 * would store the same fact every week and turn a correction into a
 * re-generation.
 *
 * Two lessons in one class's period is expected, not an error. 12a divides
 * between social science and chemistry, the middle years between physical
 * education and jiu-jitsu, and 6a into halves for design and IT. Collapsing
 * those to one lesson would tell half of each class the wrong room.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pool } from "@workspace/db";

const apply = process.argv.includes("--apply");
if (apply && !process.argv.includes("--yes")) throw new Error("Refusing apply without --yes.");

const EXTRACT = resolve(process.cwd(), "../../local-data/extracted/timetable-2026-2027.json");

/** The sheet is headed "9.21 ээс" - in force from that Monday. */
const VALID_FROM = "2026-09-21";
const SOURCE_NOTE = "2026-2027 хичээлийн хуваарь (9.21-ээс)";

const WEEKDAY: Record<string, number> = {
  "Даваа": 1, "Мягмар": 2, "Лхагва": 3, "Пүрэв": 4, "Баасан": 5,
};

const CLASSES = new Set([
  "1а", "2а", "3а", "4а", "5а", "6а", "7а", "7б",
  "8а", "9а", "9б", "10а", "11а", "12а",
]);

/** The class a cell names, and the half of it where the school wrote one. */
function resolveClass(cell: string): { name: string; group: string | null } | null {
  const value = cell.trim();
  if (CLASSES.has(value)) return { name: value, group: null };
  if (value === "12a") return { name: "12а", group: null };
  const split = /^(\d{1,2}[абАБ])-\d$/u.exec(value);
  if (split && CLASSES.has(split[1]!)) return { name: split[1]!, group: value };
  return null;
}

type Slot = {
  teacher: string; subject: string; day: string; period: number;
  class: string; group?: string;
};
const extract = JSON.parse(readFileSync(EXTRACT, "utf8")) as { source: string; slots: Slot[] };

const client = await pool.connect();
try {
  const tidy = (value: string) => value.replace(/[\s.]/g, "").toUpperCase();

  const { rows: classRows } = await client.query<{ id: string; name: string }>(
    "SELECT id::text AS id, name_mn AS name FROM core.classes WHERE is_active");
  const { rows: subjectRows } = await client.query<{ id: string; name: string }>(
    "SELECT id::text AS id, name_mn AS name FROM core.subjects WHERE is_active ORDER BY id");
  const { rows: teacherRows } = await client.query<{ id: string; name: string }>(
    `SELECT t.id::text AS id, u.display_name AS name
       FROM core.teachers t JOIN core.users u ON u.id = t.user_id
      WHERE t.is_active ORDER BY t.id`);
  const { rows: periodRows } = await client.query<{ periodNo: number }>(
    `SELECT period_no::int AS "periodNo" FROM learning.class_periods
      WHERE school_year = '2026-2027' ORDER BY period_no`);

  const classId = new Map(classRows.map((row) => [tidy(row.name), row.id]));
  const subjectId = new Map(subjectRows.map((row) => [tidy(row.name), row.id]));
  const teacherId = new Map(teacherRows.map((row) => [tidy(row.name), row.id]));
  const periods = new Set(periodRows.map((row) => row.periodNo));

  const planned = new Map<string, {
    classId: string; subjectId: string; teacherId: string | null;
    weekday: number; period: number; group: string | null;
  }>();
  const skipped: string[] = [];
  const beyondBell: string[] = [];

  for (const slot of extract.slots) {
    const klass = resolveClass(slot.class);
    const weekday = WEEKDAY[slot.day];
    if (!klass || !weekday) {
      if (!klass) skipped.push(slot.class);
      continue;
    }
    // A lesson in a period the bell schedule does not have would draw outside
    // the grid, so it is reported rather than stored.
    if (!periods.has(slot.period)) {
      beyondBell.push(`${klass.name} ${slot.day} ${slot.period}`);
      continue;
    }
    const subject = subjectId.get(tidy(slot.subject));
    const teacher = teacherId.get(tidy(slot.teacher)) ?? null;
    const cls = classId.get(tidy(klass.name));
    if (!subject || !cls) continue;
    const group = slot.group ?? klass.group ?? null;
    planned.set(`${cls}|${weekday}|${slot.period}|${subject}|${teacher ?? ""}`, {
      classId: cls, subjectId: subject, teacherId: teacher,
      weekday, period: slot.period, group,
    });
  }

  const perClass = new Map<string, number>();
  for (const row of planned.values()) {
    perClass.set(row.classId, (perClass.get(row.classId) ?? 0) + 1);
  }

  console.log(JSON.stringify({
    source: extract.source,
    validFrom: VALID_FROM,
    slotsInSheet: extract.slots.length,
    slotsToWrite: planned.size,
    cellsThatNameNoClass: [...new Set(skipped)],
    periodsBeyondTheBellSchedule: beyondBell,
    lessonsPerWeek: Object.fromEntries(
      classRows
        .map((row) => [row.name, perClass.get(row.id) ?? 0] as const)
        .sort((a, b) => b[1] - a[1])),
    withoutATeacher: [...planned.values()].filter((row) => !row.teacherId).length,
  }, null, 2));

  if (beyondBell.length) {
    throw new Error("Refusing: the sheet uses periods the bell schedule does not have.");
  }

  if (!apply) {
    console.log("\nDry run. Re-run with --apply --yes to write.");
  } else {
    await client.query("BEGIN");
    try {
      // Keep stable IDs: lesson content and group memberships refer to these slots.
      // Refuse to remove a slot that already has content or an assigned audience.
      const { rows: existing } = await client.query(
        `SELECT ts.id, ts.class_id, ts.weekday_no, ts.period_no, ts.subject_id, ts.teacher_id,
                ts.audience_assigned OR EXISTS (SELECT 1 FROM learning.class_schedule cs
                  WHERE cs.timetable_slot_id = ts.id) AS used
         FROM learning.timetable_slots ts WHERE ts.valid_from = $1::date`, [VALID_FROM]);
      for (const row of existing) {
        const key = `${row.class_id}|${row.weekday_no}|${row.period_no}|${row.subject_id}|${row.teacher_id ?? ""}`;
        if (!planned.has(key)) {
          if (row.used) throw new Error(`Slot ${row.id} has content or group assignments; retire it explicitly before replacing it.`);
          await client.query('DELETE FROM learning.timetable_slots WHERE id = $1', [row.id]);
        }
      }
      for (const row of planned.values()) {
        await client.query(`
          INSERT INTO learning.timetable_slots
            (class_id, subject_id, teacher_id, weekday_no, period_no,
             group_label, valid_from, source_note)
          VALUES ($1::bigint, $2::bigint, $3::bigint, $4, $5, $6, $7::date, $8)
          ON CONFLICT ON CONSTRAINT timetable_slots_key DO UPDATE SET
            group_label = EXCLUDED.group_label, source_note = EXCLUDED.source_note`,
          [row.classId, row.subjectId, row.teacherId, row.weekday, row.period,
           row.group, VALID_FROM, SOURCE_NOTE]);
      }

      // The invented 6a timetable was seeded to stop a screen being empty.
      // It is a lie the moment a real one exists.
      const { rowCount: removed } = await client.query(
        `DELETE FROM learning.class_schedule cs
          USING learning.daily_lessons dl
          WHERE dl.id = cs.daily_lesson_id
            AND (dl.lesson_code LIKE 'DEMO%' OR dl.lesson_code LIKE 'MOCK%')`);
      await client.query("COMMIT");

      const { rows: [count] } = await client.query<Record<string, string>>(`
        SELECT count(*)::text AS slots,
               count(DISTINCT class_id)::text AS classes,
               count(DISTINCT teacher_id)::text AS teachers,
               count(*) FILTER (WHERE group_label IS NOT NULL)::text AS grouped
          FROM learning.timetable_slots`);
      console.log(`\nWritten. Slots: ${count.slots} across ${count.classes} classes`
        + ` and ${count.teachers} teachers (${count.grouped} in a named half).`
        + ` Demo timetable rows removed: ${removed ?? 0}.`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
} finally {
  client.release();
  await pool.end();
}
