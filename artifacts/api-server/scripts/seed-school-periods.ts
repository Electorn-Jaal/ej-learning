/**
 * Writes the school's bell times.
 *
 * Dry-run (default): pnpm --filter @workspace/api-server seed-school-periods
 * Apply:             pnpm --filter @workspace/api-server seed-school-periods -- --apply --yes
 *
 * These are the school's own times, from the 2026-2027 timetable it supplied
 * and from the corrected bell sheet returned with the blank form. They are no
 * longer provisional and the names no longer say so.
 *
 * Ten periods, 08:00 to 15:25, forty minutes each with a five-minute change
 * between them. An earlier version of this script invented eight periods on
 * the ordinary Mongolian secondary shape, and was wrong in both the count and
 * every time after the third - which put two lessons a day in the wrong row
 * of the grid.
 *
 * Monday and Friday run to nine of these ten; the middle three days use all
 * ten. The table holds one list per school year rather than one per weekday,
 * so a day that finishes early simply has nothing timetabled in the last row.
 */
import { pool } from "@workspace/db";

const apply = process.argv.includes("--apply");
if (apply && !process.argv.includes("--yes")) throw new Error("Refusing apply without --yes.");

const SCHOOL_YEAR = "2026-2027";

const periods = [
  { periodNo: 1, startsAt: "08:00", endsAt: "08:40" },
  { periodNo: 2, startsAt: "08:45", endsAt: "09:25" },
  { periodNo: 3, startsAt: "09:30", endsAt: "10:10" },
  { periodNo: 4, startsAt: "10:15", endsAt: "10:55" },
  { periodNo: 5, startsAt: "11:00", endsAt: "11:40" },
  { periodNo: 6, startsAt: "11:45", endsAt: "12:25" },
  { periodNo: 7, startsAt: "12:30", endsAt: "13:10" },
  { periodNo: 8, startsAt: "13:15", endsAt: "13:55" },
  { periodNo: 9, startsAt: "14:00", endsAt: "14:40" },
  { periodNo: 10, startsAt: "14:45", endsAt: "15:25" },
];

const client = await pool.connect();
try {
  const dbName = (await client.query<{ current_database: string }>(
    "SELECT current_database()")).rows[0].current_database;
  if (!dbName.startsWith("ej_learning_local") && !dbName.startsWith("ej_learning_test")) {
    throw new Error(`Refusing database ${dbName}.`);
  }

  // A period a timetable already points at cannot be quietly moved out from
  // under it - the lesson would keep its slot number and gain a new hour.
  const inUse = (await client.query<{ period_no: number; n: string }>(`
    SELECT period_no, count(*)::text AS n FROM learning.class_schedule
    WHERE period_no IS NOT NULL GROUP BY period_no ORDER BY period_no`)).rows;

  console.log(JSON.stringify({
    database: dbName,
    mode: apply ? "APPLY" : "DRY_RUN",
    schoolYear: SCHOOL_YEAR,
    scheduleRowsUsingPeriods: inUse,
    writing: periods.map((p) => `${p.periodNo}: ${p.startsAt}–${p.endsAt}`),
  }, null, 2));

  if (inUse.length) {
    console.log("\nЭдгээр цагийг хуваарь ашиглаж байна. Цаг өөрчлөх нь хуваарийг шилжүүлнэ.");
  }

  if (!apply) {
    console.log("\nDry run. Re-run with --apply --yes to write.");
  } else {
    await client.query("BEGIN");
    try {
      for (const p of periods) {
        await client.query(`
          INSERT INTO learning.class_periods (school_year, period_no, name_mn, starts_at, ends_at)
          VALUES ($1, $2, $3, $4::time, $5::time)
          ON CONFLICT (school_year, period_no) DO UPDATE SET
            name_mn = EXCLUDED.name_mn,
            starts_at = EXCLUDED.starts_at,
            ends_at = EXCLUDED.ends_at`,
          [SCHOOL_YEAR, p.periodNo, `${p.periodNo}-р цаг`, p.startsAt, p.endsAt]);
      }
      await client.query("COMMIT");
      const { rows } = await client.query<{ period_no: number; starts_at: string; ends_at: string }>(
        "SELECT period_no, starts_at::text, ends_at::text FROM learning.class_periods WHERE school_year = $1 ORDER BY period_no",
        [SCHOOL_YEAR]);
      console.log("\nWritten:");
      for (const r of rows) console.log(`  ${r.period_no}  ${r.starts_at} .. ${r.ends_at}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
} finally {
  client.release();
  await pool.end();
}
