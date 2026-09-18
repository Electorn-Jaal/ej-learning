/**
 * Rebuilds every student's skill standing from the answers already recorded.
 *
 *   node scripts/run-ts.mjs scripts/rebuild-mastery.ts --yes
 *
 * Most of this table is derived: the attempts are the record and the row is a
 * conclusion drawn from them, so it can be thrown away and recomputed. That
 * is the only honest way to change the rule in mastery.ts, since the stored
 * score is a blend carrying the old thresholds inside it.
 *
 * A teacher's mark is the exception. It is a judgement, not a derivation:
 * nothing replays it, and changing a threshold does not change what a teacher
 * decided about a child. This used to delete every row before replaying, so a
 * skill a teacher had marked and no quiz had touched simply vanished, and one
 * with both lost the teacher's figure from the blend. Teacher rows are left
 * where they are now.
 *
 * Attempts are replayed oldest first through the same function the live
 * submission path uses, so a rebuild lands on exactly the state that path
 * would have produced - including the ordering against teacher marks. Evidence
 * older than a teacher's mark is skipped, because live it was the prior that
 * mark overwrote; evidence newer blends into the mark, which is what live did
 * too.
 */
import { db, pool, readRows } from "@workspace/db";
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

  // Read the teacher marks before clearing anything, so the replay can be
  // ordered against them. They are not deleted: nothing can recompute them.
  const teacherMarks = await readRows<{
    studentId: number;
    skillId: number;
    assessedAt: string | null;
  }>(
    `SELECT student_id::int AS "studentId", skill_id::int AS "skillId",
       to_json(last_assessed_at) #>> '{}' AS "assessedAt"
     FROM learning.student_skill_mastery
     WHERE source = 'TEACHER'`,
  );
  const markedAt = new Map(
    teacherMarks.map((mark) => [
      `${mark.studentId}:${mark.skillId}`,
      mark.assessedAt === null ? null : new Date(mark.assessedAt),
    ]),
  );

  await db.execute(
    sql`DELETE FROM learning.student_skill_mastery WHERE source IS DISTINCT FROM 'TEACHER'`,
  );

  // One sitting at a time, in the order they happened: the blend is
  // order-dependent, and replaying it any other way would invent a history.
  let superseded = 0;
  for (const row of evidence) {
    const mark = markedAt.get(`${row.studentId}:${row.skillId}`);
    if (mark && row.submittedAt && new Date(row.submittedAt) <= mark) {
      // Live, this sitting came first and the teacher's mark replaced it.
      superseded += 1;
      continue;
    }
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

  console.log(
    `Replayed ${evidence.length - superseded} skill sittings for ${students[0]?.n ?? 0} students.`,
  );
  if (teacherMarks.length > 0) {
    console.log(`  ${teacherMarks.length} teacher mark(s) kept; they are not recomputed.`);
  }
  if (superseded > 0) {
    console.log(
      `  ${superseded} sitting(s) skipped: a teacher marked that skill afterwards.`,
    );
  }
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
