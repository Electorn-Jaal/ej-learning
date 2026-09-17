/**
 * Repairs Mongolian text that reached the database as question marks.
 *
 *   node scripts/run-ts.mjs scripts/repair-mangled-text.ts --yes
 *
 * Not an application bug: the API round-trips UTF-8 intact and the database is
 * UTF8 on both sides. The damage came from test requests whose payload was
 * typed as a shell argument on Windows, where Cyrillic is replaced with "?"
 * before curl is even invoked. Anything written from a file or from the browser
 * is fine.
 *
 * Two outline titles and two assignment reasons were affected. The outline
 * titles are recoverable because the same text exists intact on the skill each
 * section teaches; the reasons were written by tests and are removed rather
 * than invented.
 *
 * The lesson is in the repo rather than only here: never put Mongolian in a
 * command-line argument on Windows. Put it in a file and send the file.
 */
import { sql } from "drizzle-orm";
import { db, pool, readRows } from "@workspace/db";

if (!process.argv.includes("--yes")) {
  console.error("Refusing to run without --yes.");
  process.exit(1);
}

try {
  const before = await readRows<{ table: string; n: number }>(
    `SELECT 'source_outline_nodes' AS table, count(*)::int AS n
       FROM content.source_outline_nodes WHERE title LIKE '%???%'
     UNION ALL
     SELECT 'student_assignments', count(*)::int
       FROM learning.student_assignments WHERE reason LIKE '%???%'`,
  );
  console.log("Damaged rows found:");
  for (const row of before) console.log(`  ${row.table.padEnd(24)} ${row.n}`);

  // An outline section and the skill taught from it carry the same name, and
  // the skills are undamaged, so the title can be restored rather than guessed.
  const outline = await db.execute(sql`
    UPDATE content.source_outline_nodes o
    SET title = sk.name_mn
    FROM content.skills sk
    WHERE o.title LIKE '%???%'
      AND sk.skill_code = 'ALG10-SK-' || replace(o.printed_number, '.', '-')`);

  const stillBroken = await readRows<{ id: number; printedNumber: string }>(
    `SELECT id::int, printed_number AS "printedNumber"
     FROM content.source_outline_nodes WHERE title LIKE '%???%'`,
  );

  // Test rows. Their text was never meaningful, so it is dropped rather than
  // replaced with something invented to look right.
  const reasons = await db.execute(sql`
    UPDATE learning.student_assignments SET reason = NULL WHERE reason LIKE '%???%'`);

  console.log(`\nOutline titles restored from their skill:  ${outline.rowCount ?? 0}`);
  console.log(`Test reasons cleared:                      ${reasons.rowCount ?? 0}`);
  if (stillBroken.length > 0) {
    console.log(`Still damaged, no skill to restore from:   ${stillBroken.map((r) => r.printedNumber).join(", ")}`);
  }

  console.log("\nOutline now reads:");
  for (const row of await readRows<{ printedNumber: string; title: string }>(
    `SELECT printed_number AS "printedNumber", title FROM content.source_outline_nodes
     ORDER BY sequence_no`,
  )) {
    console.log(`  ${row.printedNumber}  ${row.title}`);
  }
} catch (error) {
  const cause = (error as { cause?: { message?: string; detail?: string } }).cause;
  console.error(`Failed: ${error instanceof Error ? error.message : String(error)}`);
  if (cause?.message) console.error(`  ${cause.message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
