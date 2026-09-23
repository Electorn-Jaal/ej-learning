import { sql } from "drizzle-orm";
import { db, readRows } from "@workspace/db";

/**
 * The classes this teacher may mark productive tasks for, in one subject.
 *
 * Scoped by the registered specialty, the same standing the class-topic board
 * uses. No class assignment has arrived for anybody, so requiring one would
 * mean nobody could mark anything - and the two English teachers on the staff
 * register are not in doubt about which subject is theirs.
 */
export const markableClasses = (teacherId: number | null, isAdmin: boolean) =>
  readRows<{ classId: string; className: string; gradeLevel: number; students: number }>(`
    SELECT c.id::text AS "classId", c.name_mn AS "className",
      g.grade_number::int AS "gradeLevel",
      (SELECT count(DISTINCT e.student_id)::int
         FROM core.student_enrollments e
         JOIN assessment.placement_attempts a ON a.student_id = e.student_id
        WHERE e.class_id = c.id AND e.is_active) AS students
    FROM core.classes c
    JOIN core.grade_levels g ON g.id = c.grade_level_id
    JOIN core.class_subjects cs ON cs.class_id = c.id AND cs.is_active
    JOIN core.subjects sub ON sub.id = cs.subject_id AND sub.code = $3
    WHERE c.is_active AND (
      $2::boolean
      OR EXISTS (SELECT 1 FROM core.teacher_subjects ts
                  WHERE ts.teacher_id = $1::bigint AND ts.subject_id = sub.id AND ts.is_active)
      OR EXISTS (SELECT 1 FROM core.class_teachers t
                  WHERE t.class_id = c.id AND t.teacher_id = $1::bigint AND t.is_active
                    AND (t.subject_id IS NULL OR t.subject_id = sub.id)))
    ORDER BY g.grade_number, c.class_code`,
    [teacherId ?? 0, isAdmin, "ENG"]);

export type MarkRow = {
  studentId: string; studentCode: string; studentName: string;
  levelCode: string; levelName: string; objectiveScore: number | null;
  itemId: string; itemCode: string; domain: string; prompt: string;
  rubric: string | null; maxScore: number;
  score: number | null; comment: string | null;
  ratedByName: string | null; ratedAt: string | null;
};

/**
 * Every child in a class who has been placed, with the four tasks their level
 * asks of them and whatever a teacher has already said about each.
 *
 * The tasks come from the child's own level, not the class's: two children in
 * 9б placed at A2 and C1 are asked different things, which is the entire
 * point of having placed them. The join is on proficiency level, so a child
 * who moves up is asked the new level's tasks with no data migration.
 */
export const marksForClass = (classId: string, subjectCode: string) =>
  readRows<MarkRow>(`
    WITH placed AS (
      SELECT DISTINCT ON (a.student_id)
        a.student_id, a.proficiency_level_id, a.total_score
      FROM assessment.placement_attempts a
      JOIN core.subjects sub ON sub.id = a.subject_id AND sub.code = $2
      JOIN core.student_enrollments e ON e.student_id = a.student_id AND e.is_active
      WHERE e.class_id = $1::bigint
      ORDER BY a.student_id, a.attempted_on DESC NULLS LAST, a.id DESC
    )
    SELECT s.id::text AS "studentId", s.student_code AS "studentCode",
      s.display_name AS "studentName",
      p.code AS "levelCode", p.name_mn AS "levelName",
      placed.total_score::float8 AS "objectiveScore",
      i.id::text AS "itemId", i.item_code AS "itemCode", i.domain_mn AS domain,
      i.title_mn AS prompt, i.rubric_mn AS rubric, i.max_score::float8 AS "maxScore",
      r.score::float8 AS score, r.comment_mn AS comment,
      u.display_name AS "ratedByName", r.rated_at::text AS "ratedAt"
    FROM placed
    JOIN core.students s ON s.id = placed.student_id AND s.is_active
    JOIN content.proficiency_levels p ON p.id = placed.proficiency_level_id
    -- The judged half of the paper: no options, a rubric instead of a key.
    JOIN assessment.diagnostic_items i
      ON i.proficiency_level_id = placed.proficiency_level_id
     AND i.rubric_mn IS NOT NULL
     AND i.status = 'APPROVED'
    LEFT JOIN assessment.productive_ratings r
      ON r.student_id = s.id AND r.diagnostic_item_id = i.id
    LEFT JOIN core.users u ON u.id = r.rated_by
    ORDER BY s.student_code, i.item_order`,
    [classId, subjectCode]);

/** Whether this item really is a judged task, and what it is worth. */
export const judgedItem = (itemId: string) =>
  readRows<{ maxScore: number }>(`
    SELECT max_score::float8 AS "maxScore"
    FROM assessment.diagnostic_items
    WHERE id = $1::bigint AND rubric_mn IS NOT NULL AND status = 'APPROVED'`,
    [itemId]);

export async function saveRating(row: {
  studentId: string; itemId: string; score: number; maxScore: number;
  comment: string | null; ratedBy: number;
}) {
  await db.execute(sql`
    INSERT INTO assessment.productive_ratings
      (student_id, diagnostic_item_id, score, max_score, comment_mn, rated_by, rated_at)
    VALUES (${row.studentId}::bigint, ${row.itemId}::bigint, ${row.score},
            ${row.maxScore}, ${row.comment}, ${row.ratedBy}, now())
    ON CONFLICT (student_id, diagnostic_item_id) DO UPDATE SET
      score = EXCLUDED.score,
      max_score = EXCLUDED.max_score,
      comment_mn = EXCLUDED.comment_mn,
      rated_by = EXCLUDED.rated_by,
      rated_at = now()`);
}

/**
 * Promotes a placement from provisional to confirmed once every judged task
 * at that child's level has been marked.
 *
 * This is the whole point of the screen. answer_source was RECONSTRUCTED
 * because the level rested on a key nobody exported and on the objective half
 * of the paper alone; a teacher having now read the writing and heard the
 * speaking is exactly what makes it AUTHORITATIVE. It reverses too: delete a
 * rating and the level goes back to provisional rather than keeping a
 * confirmation it no longer has behind it.
 */
export async function refreshPlacementConfidence(studentId: string, subjectCode: string) {
  await db.execute(sql`
    WITH latest AS (
      SELECT DISTINCT ON (a.student_id) a.id, a.proficiency_level_id
      FROM assessment.placement_attempts a
      JOIN core.subjects sub ON sub.id = a.subject_id AND sub.code = ${subjectCode}
      WHERE a.student_id = ${studentId}::bigint
      ORDER BY a.student_id, a.attempted_on DESC NULLS LAST, a.id DESC
    ), tally AS (
      SELECT latest.id,
        count(i.id) AS required,
        count(r.id) AS done
      FROM latest
      JOIN assessment.diagnostic_items i
        ON i.proficiency_level_id = latest.proficiency_level_id
       AND i.rubric_mn IS NOT NULL AND i.status = 'APPROVED'
      LEFT JOIN assessment.productive_ratings r
        ON r.diagnostic_item_id = i.id AND r.student_id = ${studentId}::bigint
      GROUP BY latest.id
    )
    UPDATE assessment.placement_attempts a
       SET answer_source = CASE
             WHEN tally.required > 0 AND tally.done = tally.required THEN 'AUTHORITATIVE'
             ELSE 'RECONSTRUCTED'
           END::assessment.answer_source
      FROM tally
     WHERE a.id = tally.id`);
}
