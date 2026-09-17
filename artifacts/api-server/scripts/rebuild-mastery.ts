/**
 * Rebuilds every student's skill standing from the answers already recorded.
 *
 *   node scripts/run-ts.mjs scripts/rebuild-mastery.ts --yes
 *
 * Mastery is derived, never entered: the attempts are the record, this table
 * is a conclusion drawn from them. That makes it safe to throw away and
 * recompute, which is what this does - and it is the only honest way to change
 * the rule in mastery.ts, since the stored score is a blend that carries the
 * old thresholds inside it.
 *
 * Attempts are replayed oldest first through the same function the live
 * submission path uses, so a rebuild lands on exactly the state that path
 * would have produced.
 */
import { db, pool } from "@workspace/db";
import { sql } from "drizzle-orm";
import {
  attemptEvidenceInOrder,
  orphanedAttempts,
  recordSkillEvidence,
} from "../src/modules/learning/mastery";

if (!process.argv.includes("--yes")) {
  console.error("Refusing to run without --yes.");
  process.exit(1);
}

try {
  const evidence = await attemptEvidenceInOrder();
  if (evidence.length === 0) {
    console.log("No answered questions are attached to a skill; nothing to rebuild.");
  }

  await db.execute(sql`DELETE FROM learning.student_skill_mastery`);

  // One sitting at a time, in the order they happened: the blend is
  // order-dependent, and replaying it any other way would invent a history.
  for (const row of evidence) {
    await recordSkillEvidence(
      row.studentId,
      [{ skillId: row.skillId, correct: row.correct, total: row.total }],
      row.submittedAt,
    );
  }

  const summary = (
    await db.execute(sql`
      SELECT mastery_status AS status, count(*)::int AS rows,
        round(avg(mastery_score))::int AS "avgScore"
      FROM learning.student_skill_mastery
      GROUP BY mastery_status ORDER BY mastery_status`)
  ).rows as { status: string; rows: number; avgScore: number }[];

  const students = (
    await db.execute(sql`
      SELECT count(DISTINCT student_id)::int AS n FROM learning.student_skill_mastery`)
  ).rows as { n: number }[];

  const [{ n: orphaned }] = await orphanedAttempts();

  console.log(`Replayed ${evidence.length} skill sittings for ${students[0]?.n ?? 0} students.`);
  if (orphaned > 0) {
    console.log(
      `  ${orphaned} older attempt(s) skipped: their answers name no item in the bank.`,
    );
  }
  for (const row of summary) {
    console.log(`  ${row.status.padEnd(11)} ${String(row.rows).padStart(4)} rows, avg ${row.avgScore}%`);
  }
} catch (error) {
  const cause = (error as { cause?: { message?: string; detail?: string } }).cause;
  console.error(`Failed: ${error instanceof Error ? error.message : String(error)}`);
  if (cause?.message) console.error(`  ${cause.message}`);
  if (cause?.detail) console.error(`  ${cause.detail}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
