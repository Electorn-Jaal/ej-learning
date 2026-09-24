/**
 * Writes the four terms of the school year, and retires the demo one.
 *
 * Dry-run (default): pnpm --filter @workspace/api-server seed-school-terms
 * Apply:             pnpm --filter @workspace/api-server seed-school-terms -- --apply --yes
 *
 * THE DATES BELOW ARE PROVISIONAL. The school has not yet supplied its holiday
 * calendar ("Амралтын хуанли - дараа авна", docs/client-questions.md), so these
 * are the ordinary Mongolian school-year boundaries with the usual autumn,
 * winter and spring breaks between them. They are here so that "which topic is
 * this class on today" has something to compute against; every one of them is
 * expected to move once the real calendar arrives, and nothing downstream may
 * treat them as authoritative. `name_mn` says so on every row.
 *
 * Four terms, three of content: the manager settled on four terms with the
 * syllabus fitted into the first three, which is exactly what the imported
 * books declare (planning_period_count = 3, and outline nodes numbered 1-3).
 * Term 4 carries no new chapters by design - it is revision and assessment -
 * so a book period maps onto a term of the same number and period 4 is empty.
 */
import { pool } from "@workspace/db";

const apply = process.argv.includes("--apply");
if (apply && !process.argv.includes("--yes")) throw new Error("Refusing apply without --yes.");

const SCHOOL_YEAR = "2026-2027";

// The dates were taken from the ministry's usual calendar rather than from a
// document this school issued, and the names used to say so - "I улирал (түр
// огноо)". The qualifier belonged in this file, not on a child's screen: it
// appeared in the shell's header beside the school year, where it read as
// part of the term's name. The uncertainty is recorded here instead.
const terms = [
  { termNumber: 1, nameMn: "I улирал", startsOn: "2026-09-01", endsOn: "2026-10-31" },
  { termNumber: 2, nameMn: "II улирал", startsOn: "2026-11-09", endsOn: "2026-12-31" },
  { termNumber: 3, nameMn: "III улирал", startsOn: "2027-01-11", endsOn: "2027-03-20" },
  { termNumber: 4, nameMn: "IV улирал", startsOn: "2027-03-29", endsOn: "2027-06-05" },
];

const client = await pool.connect();
try {
  const dbName = (await client.query<{ current_database: string }>(
    "SELECT current_database()")).rows[0].current_database;
  if (!dbName.startsWith("ej_learning_local") && !dbName.startsWith("ej_learning_test")) {
    throw new Error(`Refusing database ${dbName}.`);
  }

  const existing = (await client.query<{ id: number; term_number: number; name_mn: string }>(
    "SELECT id, term_number, name_mn FROM learning.terms WHERE school_year = $1 ORDER BY term_number",
    [SCHOOL_YEAR])).rows;

  // A term with a timetable hanging off it cannot be quietly rewritten: the
  // rows would keep pointing at a range that no longer contains their date.
  const inUse = (await client.query<{ term_id: number; n: string }>(`
    SELECT term_id, count(*)::text AS n FROM learning.class_schedule
    WHERE term_id = ANY($1::smallint[]) GROUP BY term_id`,
    [existing.map((t) => t.id)])).rows;

  console.log(JSON.stringify({
    database: dbName,
    mode: apply ? "APPLY" : "DRY_RUN",
    schoolYear: SCHOOL_YEAR,
    existing: existing.map((t) => `${t.term_number}: ${t.name_mn}`),
    scheduleRowsAttached: inUse,
    writing: terms.map((t) => `${t.termNumber}: ${t.nameMn} ${t.startsOn}..${t.endsOn}`),
  }, null, 2));

  if (inUse.length) {
    throw new Error("Refusing to rewrite terms that already carry class_schedule rows.");
  }

  if (!apply) {
    console.log("\nDry run. Re-run with --apply --yes to write.");
  } else {
    await client.query("BEGIN");
    try {
      for (const term of terms) {
        await client.query(`
          INSERT INTO learning.terms (school_year, term_number, name_mn, starts_on, ends_on)
          VALUES ($1, $2, $3, $4::date, $5::date)
          ON CONFLICT (school_year, term_number) DO UPDATE SET
            name_mn = EXCLUDED.name_mn,
            starts_on = EXCLUDED.starts_on,
            ends_on = EXCLUDED.ends_on`,
          [SCHOOL_YEAR, term.termNumber, term.nameMn, term.startsOn, term.endsOn]);
      }
      await client.query("COMMIT");
      const { rows } = await client.query<{ term_number: number; name_mn: string; starts_on: string; ends_on: string }>(
        "SELECT term_number, name_mn, starts_on, ends_on FROM learning.terms WHERE school_year = $1 ORDER BY term_number",
        [SCHOOL_YEAR]);
      console.log("\nWritten:");
      for (const r of rows) console.log(`  ${r.term_number}  ${r.name_mn}  ${r.starts_on} .. ${r.ends_on}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
} finally {
  client.release();
  await pool.end();
}
