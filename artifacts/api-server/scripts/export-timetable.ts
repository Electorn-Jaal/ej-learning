/**
 * Writes the school's timetable out of the database, as JSON.
 *
 *   pnpm --filter @workspace/api-server export-timetable
 *   python scripts/src/build-timetable-xlsx.py \
 *       local-data/extracted/timetable.json \
 *       local-data/generated/timetable-export.xlsx
 *
 * Two steps because that is how everything else here handles Excel: the
 * database is TypeScript's, the spreadsheet is Python's, and JSON in between
 * means neither has to learn the other's job.
 *
 * The shape is the school's own, not a convenient one. Their timetable is a
 * grid of teacher-and-subject rows against weekday-and-period columns, with a
 * class name in each cell, and anybody who has to check this against the paper
 * on the wall should be able to do it by looking, not by translating.
 *
 * Nothing is interpreted on the way out. A slot with no teacher, a group label,
 * a period the bell list does not know - all of it goes through as it stands,
 * because the first use of this file is finding out where what we hold and what
 * the school wrote have drifted apart.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pool } from "@workspace/db";

type Row = {
  teacherName: string | null;
  teacherCode: string | null;
  department: string | null;
  subjectName: string;
  className: string;
  groupLabel: string | null;
  weekdayNo: number;
  periodNo: number;
  validFrom: string;
  validTo: string | null;
};

const { rows } = await pool.query<Row>(`
  SELECT u.display_name AS "teacherName", t.teacher_code AS "teacherCode",
         t.department_mn AS department,
         sub.name_mn AS "subjectName", c.name_mn AS "className",
         ts.group_label AS "groupLabel",
         ts.weekday_no::int AS "weekdayNo", ts.period_no::int AS "periodNo",
         ts.valid_from::text AS "validFrom", ts.valid_to::text AS "validTo"
    FROM learning.timetable_slots ts
    JOIN core.classes c ON c.id = ts.class_id
    JOIN core.subjects sub ON sub.id = ts.subject_id
    LEFT JOIN core.teachers t ON t.id = ts.teacher_id
    LEFT JOIN core.users u ON u.id = t.user_id
   ORDER BY t.teacher_code NULLS LAST, u.display_name, sub.name_mn,
            ts.weekday_no, ts.period_no`);

const { rows: periods } = await pool.query<{
  periodNo: number;
  startsAt: string;
  endsAt: string;
  schoolYear: string;
}>(`
  SELECT period_no::int AS "periodNo",
         to_char(starts_at, 'HH24:MI') AS "startsAt",
         to_char(ends_at, 'HH24:MI') AS "endsAt",
         school_year AS "schoolYear"
    FROM learning.class_periods
   ORDER BY school_year, period_no`);

const [{ schoolYear }] = (await pool.query<{ schoolYear: string }>(
  "SELECT school_year AS \"schoolYear\" FROM core.classes WHERE is_active GROUP BY school_year ORDER BY count(*) DESC LIMIT 1",
)).rows;

const out = path.resolve(process.cwd(), "../../local-data/extracted");
await mkdir(out, { recursive: true });
await writeFile(
  path.join(out, "timetable.json"),
  JSON.stringify({ schoolYear, periods, slots: rows }, null, 2) + "\n",
);

// Counted on the way out, because a silent export of 3 rows looks exactly like
// a silent export of 552 until somebody opens the file.
const teachers = new Set(rows.map((row) => row.teacherName ?? "—"));
const pairs = new Set(rows.map((row) => `${row.teacherName}\u0000${row.subjectName}`));
console.log(`Цаг ${rows.length}, багш ${teachers.size}, багш-хичээл ${pairs.size}.`);
const orphans = rows.filter((row) => row.teacherName === null);
if (orphans.length > 0) console.log(`Багшгүй цаг: ${orphans.length}.`);
console.log("local-data/extracted/timetable.json");
await pool.end();
