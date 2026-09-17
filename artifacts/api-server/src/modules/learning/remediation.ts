import { sql } from "drizzle-orm";
import { db, readRows } from "@workspace/db";

/**
 * Deciding what a student who is behind should do next.
 *
 * The rule from the requirements: a student weak on a skill repeats that
 * topic, or the lower work the topic stands on. The second half is the part
 * worth building - anyone can re-serve the same lesson, but finding *where* a
 * student actually fell behind means walking back through what the skill
 * depends on until the ground is solid.
 *
 * So this walks the prerequisite graph from each gap, and stops at the deepest
 * skill the student has not mastered. That is the real starting point: sending
 * a student back one step when they are three steps behind just fails them
 * again a day later.
 */

/** How far back the walk will go. A guard against a cycle in the graph too. */
export const MAX_DEPTH = 5;

export type Recommendation = {
  studentId: number;
  originSkillId: number;
  originSkillName: string;
  originScore: number;
  targetSkillId: number;
  targetSkillName: string;
  targetLessonId: number;
  depth: number;
};

/**
 * What each student with a gap should be working on.
 *
 * Pass a student id for one student, or null for everyone.
 *
 * Only REQUIRED links are followed. A RECOMMENDED one is a note for a teacher
 * planning a year; it is not grounds for telling a child to go and do
 * something else. Only a skill that has an approved, web-ready lesson can be
 * the answer - a prerequisite with nothing to study is a dead end, and the
 * walk keeps the nearest one that does have a lesson.
 */
export const recommendationsFor = (studentId: number | null) =>
  readRows<Recommendation>(
    `WITH RECURSIVE gaps AS (
       SELECT m.student_id, m.skill_id, m.mastery_score
       FROM learning.student_skill_mastery m
       WHERE m.mastery_status = 'GAP'
         AND ($1::bigint IS NULL OR m.student_id = $1::bigint)
     ),
     walk AS (
       SELECT g.student_id, g.skill_id AS origin_skill_id, g.mastery_score AS origin_score,
              g.skill_id, 0 AS depth
       FROM gaps g
       UNION ALL
       SELECT w.student_id, w.origin_skill_id, w.origin_score,
              d.prerequisite_skill_id, w.depth + 1
       FROM walk w
       JOIN content.skill_dependencies d
         ON d.skill_id = w.skill_id
        AND d.status = 'APPROVED'
        AND d.relation_type = 'REQUIRED'
       LEFT JOIN learning.student_skill_mastery m
         ON m.student_id = w.student_id AND m.skill_id = d.prerequisite_skill_id
       WHERE w.depth < ${MAX_DEPTH}
         -- Stop at anything the student already holds: that ground is solid,
         -- and there is no reason to send them further back than the problem.
         AND COALESCE(m.mastery_status, 'NOT_ASSESSED') <> 'MASTERED'
     ),
     teachable AS (
       SELECT w.*, dl.id AS lesson_id
       FROM walk w
       JOIN learning.daily_lessons dl
         ON dl.core_skill_id = w.skill_id AND dl.status = 'APPROVED' AND dl.web_ready
     )
     SELECT DISTINCT ON (t.student_id, t.origin_skill_id)
       t.student_id::int AS "studentId",
       t.origin_skill_id::int AS "originSkillId",
       origin.name_mn AS "originSkillName",
       round(t.origin_score)::int AS "originScore",
       t.skill_id::int AS "targetSkillId",
       target.name_mn AS "targetSkillName",
       t.lesson_id::int AS "targetLessonId",
       t.depth
     FROM teachable t
     JOIN content.skills origin ON origin.id = t.origin_skill_id
     JOIN content.skills target ON target.id = t.skill_id
     ORDER BY t.student_id, t.origin_skill_id, t.depth DESC, t.lesson_id`,
    [studentId],
  );

/** The line the student reads above the extra work, explaining why it is there. */
export const reasonFor = (row: Recommendation) =>
  row.depth === 0
    ? `«${row.originSkillName}» сэдвийн шалгалтад ${row.originScore}% авсан тул дахин давтъя.`
    : `«${row.originSkillName}» хүндэрсэн байна (${row.originScore}%). Түүний суурь болох «${row.targetSkillName}»-г эхлээд бататгая.`;

/**
 * Books one student's extra work for a day.
 *
 * A student gets one piece of extra work at a time, so where several skills
 * are weak the lowest score wins - it is the one most likely to be blocking
 * the rest.
 *
 * A teacher's assignment for that day is never overwritten. The requirement
 * asks for this to be automatic *with* a teacher able to override it, and an
 * override that a background rule can undo an hour later is not an override.
 * That is what the WHERE on the conflict clause is doing.
 */
export async function assignRemediation(studentId: number, assignedOn: string) {
  const rows = await recommendationsFor(studentId);
  if (rows.length === 0) return null;

  const pick = rows.reduce((worst, row) =>
    row.originScore < worst.originScore ? row : worst,
  );

  const result = await db.execute(sql`
    INSERT INTO learning.student_assignments
      (student_id, daily_lesson_id, assigned_on, source, reason)
    VALUES (${studentId}, ${pick.targetLessonId}, ${assignedOn}::date, 'AUTO', ${reasonFor(pick)})
    ON CONFLICT ON CONSTRAINT student_assignments_student_day_key DO UPDATE SET
      daily_lesson_id = EXCLUDED.daily_lesson_id,
      reason = EXCLUDED.reason
    WHERE student_assignments.source = 'AUTO'`);

  // rowCount is 0 when a teacher's row held the day, which is not a failure.
  return { ...pick, written: (result.rowCount ?? 0) > 0 };
}
