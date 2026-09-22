/**
 * Writes the school's bell times.
 *
 * Dry-run (default): pnpm --filter @workspace/api-server seed-school-periods
 * Apply:             pnpm --filter @workspace/api-server seed-school-periods -- --apply --yes
 *
 * THE TIMES BELOW ARE PROVISIONAL, the same way the term dates are. The school
 * has not supplied its bell schedule, so these are the ordinary Mongolian
 * secondary shape: eight 40-minute periods with a short break between each, a
 * longer one after the third and lunch after the sixth. They exist so the grid has rows to
 * draw; every one of them is expected to move, and `name_mn` says so on each.
 *
 * Eight periods, 08:00 to 15:00. The day does not stop at noon - the school
 * runs into the afternoon - and a grid that ends at one o'clock would simply
 * lose every lesson after it.
 */
import { pool } from "@workspace/db";

const apply = process.argv.includes("--apply");
if (apply && !process.argv.includes("--yes")) throw new Error("Refusing apply without --yes.");

const SCHOOL_YEAR = "2026-2027";

const periods = [
  { periodNo: 1, startsAt: "08:00", endsAt: "08:40" },
  { periodNo: 2, startsAt: "08:50", endsAt: "09:30" },
  { periodNo: 3, startsAt: "09:40", endsAt: "10:20" },
  // Twenty minutes here rather than ten: the long morning break.
  { periodNo: 4, startsAt: "10:40", endsAt: "11:20" },
  { periodNo: 5, startsAt: "11:30", endsAt: "12:10" },
  { periodNo: 6, startsAt: "12:20", endsAt: "13:00" },
  // Lunch sits between the sixth and the seventh.
  { periodNo: 7, startsAt: "13:30", endsAt: "14:10" },
  { periodNo: 8, startsAt: "14:20", endsAt: "15:00" },
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
          [SCHOOL_YEAR, p.periodNo, `${p.periodNo}-р цаг (түр)`, p.startsAt, p.endsAt]);
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
