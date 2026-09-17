import { sql } from "drizzle-orm";
import { db, readRows } from "@workspace/db";

/**
 * Turning answers into a judgement about a skill.
 *
 * A quiz attempt measures one sitting. Mastery is a claim about the student,
 * and the two are not the same thing: one good morning does not mean a skill
 * is held, and one bad morning does not mean it is lost. So the stored score
 * is a blend - the newest sitting carries most of the weight, and what came
 * before it still counts.
 *
 * Every constant here is a pedagogical choice rather than a technical one, so
 * they sit together, named, where a teacher's objection can be answered by
 * changing a number instead of reading a query.
 */

/** How much of the score comes from the newest sitting. The rest is history. */
export const RECENCY_WEIGHT = 0.6;

/** At or above this, the skill is held. */
export const MASTERED_AT = 80;

/** At or above this, the skill is coming along. Below it, it is a gap. */
export const DEVELOPING_AT = 50;

/**
 * Mastery means repeatable, so it is never awarded on a single sitting - three
 * lucky guesses out of three would otherwise close a skill for good. A student
 * scoring 100% first time is DEVELOPING until they do it again.
 */
export const SITTINGS_FOR_MASTERY = 2;

export type SkillEvidence = {
  skillId: number;
  correct: number;
  total: number;
};

/**
 * Folds one sitting's worth of evidence into a student's standing on a skill.
 *
 * Written as a single statement so the read of the previous score and the
 * write of the new one cannot be interleaved: the CTE takes a row lock where
 * a row already exists, and where it does not, two concurrent inserts settle
 * through ON CONFLICT rather than one of them failing.
 *
 * `assessedAt` is when the sitting happened, not when the row was written. A
 * rebuild replays old attempts, and stamping those with today's date would
 * tell a student their skill was measured this morning.
 */
export async function recordSkillEvidence(
  studentId: number,
  evidence: SkillEvidence[],
  assessedAt: string | null = null,
) {
  for (const item of evidence) {
    if (item.total <= 0) continue;
    const percent = (item.correct / item.total) * 100;

    await db.execute(sql`
      WITH prior AS (
        SELECT mastery_score, attempt_count
        FROM learning.student_skill_mastery
        WHERE student_id = ${studentId} AND skill_id = ${item.skillId}
        FOR UPDATE
      ),
      blended AS (
        SELECT
          COALESCE((SELECT attempt_count FROM prior), 0) + 1 AS attempts,
          round(
            CASE
              WHEN (SELECT mastery_score FROM prior) IS NULL THEN ${percent}::numeric
              ELSE (SELECT mastery_score FROM prior) * ${1 - RECENCY_WEIGHT}
                 + ${percent}::numeric * ${RECENCY_WEIGHT}
            END, 2) AS score
      )
      INSERT INTO learning.student_skill_mastery
        (student_id, skill_id, mastery_status, mastery_score,
         attempt_count, last_assessed_at, updated_at)
      SELECT ${studentId}, ${item.skillId},
        CASE
          WHEN b.score >= ${MASTERED_AT} AND b.attempts >= ${SITTINGS_FOR_MASTERY}
            THEN 'MASTERED'
          WHEN b.score >= ${DEVELOPING_AT} THEN 'DEVELOPING'
          ELSE 'GAP'
        END,
        b.score, b.attempts, COALESCE(${assessedAt}::timestamptz, now()), now()
      FROM blended b
      ON CONFLICT ON CONSTRAINT student_skill_mastery_pkey DO UPDATE SET
        mastery_status = EXCLUDED.mastery_status,
        mastery_score = EXCLUDED.mastery_score,
        attempt_count = EXCLUDED.attempt_count,
        last_assessed_at = EXCLUDED.last_assessed_at,
        updated_at = now()`);
  }
}

export type PastAttempt = {
  studentId: number;
  skillId: number;
  correct: number;
  total: number;
  submittedAt: string;
};

/**
 * Every recorded answer, oldest first, grouped by the skill its question
 * tested.
 *
 * The attempt stores its answers as jsonb keyed by item id, so the skill comes
 * from the item bank rather than from the attempt. Replaying these in order
 * through `recordSkillEvidence` reproduces exactly the state the live path
 * would have reached, which is what makes a rebuild safe to run.
 *
 * Attempts taken before the questions moved into the database carry their old
 * frontend ids ("q1", "q2"), which name no item and so can say nothing about
 * any skill. They are skipped rather than guessed at; `orphanedAttempts`
 * counts them so a rebuild can report what it could not use.
 */
export const attemptEvidenceInOrder = () =>
  readRows<PastAttempt>(
    `SELECT qa.student_id::int AS "studentId", i.skill_id::int AS "skillId",
       count(*) FILTER (WHERE (answer->>'correct')::boolean)::int AS correct,
       count(*)::int AS total, to_json(qa.submitted_at) #>> '{}' AS "submittedAt"
     FROM learning.quiz_attempts qa
     CROSS JOIN LATERAL jsonb_array_elements(qa.answers) AS answer
     JOIN assessment.diagnostic_items i
       ON answer->>'questionId' ~ '^[0-9]+$'
      AND i.id = (answer->>'questionId')::bigint
     WHERE i.skill_id IS NOT NULL
     GROUP BY qa.id, qa.submitted_at, qa.student_id, i.skill_id
     ORDER BY qa.submitted_at, qa.id`,
  );

/** Attempts whose answers name no item in the bank, and so yield no evidence. */
export const orphanedAttempts = () =>
  readRows<{ n: number }>(
    `SELECT count(*)::int AS n FROM learning.quiz_attempts qa
     WHERE NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(qa.answers) AS answer
       JOIN assessment.diagnostic_items i
         ON answer->>'questionId' ~ '^[0-9]+$'
        AND i.id = (answer->>'questionId')::bigint
       WHERE i.skill_id IS NOT NULL)`,
  );
