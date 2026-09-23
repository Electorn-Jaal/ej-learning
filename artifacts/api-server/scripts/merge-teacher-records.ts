/**
 * Merges two records that turned out to be one teacher.
 *
 * Dry-run (default): pnpm --filter @workspace/api-server merge-teacher-records
 * Apply:             pnpm --filter @workspace/api-server merge-teacher-records -- --apply --yes
 *
 * The August staff register spells a name one way and the 2026-2027 timetable
 * spells it another - "Т.Эрдэнээ" against "Т.Эрдэнэ" - and the timetable
 * import deliberately created a second record rather than guessing they were
 * the same person. The school has now said they are, so this joins them.
 *
 * The register's record survives, because it is the one with a roster account
 * and a specialty read off a job title. Only the display name changes, to the
 * spelling the school used most recently. Everything the timetable attached to
 * the duplicate - the classes, the subjects - moves across, and the duplicate's
 * account is deactivated rather than deleted: it was issued and may have been
 * handed out, and a login that stops working is easier to explain than one
 * that disappears.
 */
import { pool } from "@workspace/db";

const apply = process.argv.includes("--apply");
if (apply && !process.argv.includes("--yes")) throw new Error("Refusing apply without --yes.");

/** Confirmed by the school, one pair at a time. Nothing is inferred here. */
const MERGES: { keep: string; drop: string; rename: string }[] = [
  { keep: "Т.Эрдэнээ", drop: "Т.Эрдэнэ", rename: "Т.Эрдэнэ" },
];

const client = await pool.connect();
try {
  const { rows: teachers } = await client.query<{
    id: string; userId: string; code: string; name: string; username: string;
  }>(`SELECT t.id::text AS id, t.user_id::text AS "userId", t.teacher_code AS code,
        u.display_name AS name, u.username
      FROM core.teachers t JOIN core.users u ON u.id = t.user_id`);
  const byName = new Map(teachers.map((row) => [row.name, row]));

  const planned = MERGES.map((merge) => ({
    ...merge,
    keepRow: byName.get(merge.keep),
    dropRow: byName.get(merge.drop),
  }));

  for (const merge of planned) {
    if (!merge.keepRow || !merge.dropRow) {
      throw new Error(`Both records must exist: ${merge.keep}, ${merge.drop}.`);
    }
    if (merge.keepRow.id === merge.dropRow.id) {
      throw new Error(`${merge.keep} and ${merge.drop} are already one record.`);
    }
  }

  for (const merge of planned) {
    const { rows: [counts] } = await client.query<Record<string, string>>(`
      SELECT (SELECT count(*)::text FROM core.class_teachers WHERE teacher_id = $1::bigint) AS classes,
             (SELECT count(*)::text FROM core.teacher_subjects WHERE teacher_id = $1::bigint) AS subjects`,
      [merge.dropRow!.id]);
    console.log(JSON.stringify({
      keep: `${merge.keepRow!.name} (${merge.keepRow!.code}, ${merge.keepRow!.username})`,
      drop: `${merge.dropRow!.name} (${merge.dropRow!.code}, ${merge.dropRow!.username})`,
      renameTo: merge.rename,
      movingFromDuplicate: { classTeachers: counts.classes, specialties: counts.subjects },
    }, null, 2));
  }

  if (!apply) {
    console.log("\nDry run. Re-run with --apply --yes to write.");
  } else {
    await client.query("BEGIN");
    try {
      for (const merge of planned) {
        const keep = merge.keepRow!.id;
        const drop = merge.dropRow!.id;

        // Move first, then delete what would collide. class_teachers is unique
        // on (class, teacher, subject) and the duplicate may hold a pairing
        // the survivor already has.
        await client.query(`
          DELETE FROM core.class_teachers d
           WHERE d.teacher_id = $2::bigint
             AND EXISTS (SELECT 1 FROM core.class_teachers k
                          WHERE k.teacher_id = $1::bigint
                            AND k.class_id = d.class_id
                            AND k.subject_id IS NOT DISTINCT FROM d.subject_id)`,
          [keep, drop]);
        await client.query(
          "UPDATE core.class_teachers SET teacher_id = $1::bigint WHERE teacher_id = $2::bigint",
          [keep, drop]);

        await client.query(`
          DELETE FROM core.teacher_subjects d
           WHERE d.teacher_id = $2::bigint
             AND EXISTS (SELECT 1 FROM core.teacher_subjects k
                          WHERE k.teacher_id = $1::bigint AND k.subject_id = d.subject_id)`,
          [keep, drop]);
        await client.query(
          "UPDATE core.teacher_subjects SET teacher_id = $1::bigint WHERE teacher_id = $2::bigint",
          [keep, drop]);

        await client.query(
          "UPDATE core.classes SET class_teacher_id = $1::bigint WHERE class_teacher_id = $2::bigint",
          [keep, drop]);

        await client.query(
          "UPDATE core.teachers SET is_active = false WHERE id = $1::bigint", [drop]);
        await client.query(
          "UPDATE core.users SET is_active = false, updated_at = now() WHERE id = $1::bigint",
          [merge.dropRow!.userId]);
        await client.query(
          "UPDATE core.users SET display_name = $2, updated_at = now() WHERE id = $1::bigint",
          [merge.keepRow!.userId, merge.rename]);
      }
      await client.query("COMMIT");

      for (const merge of planned) {
        const { rows: [after] } = await client.query<Record<string, string>>(`
          SELECT u.display_name AS name,
            (SELECT count(*)::text FROM core.class_teachers ct
              WHERE ct.teacher_id = $1::bigint AND ct.is_active) AS classes,
            (SELECT count(*)::text FROM core.teacher_subjects ts
              WHERE ts.teacher_id = $1::bigint AND ts.is_active) AS subjects
          FROM core.teachers t JOIN core.users u ON u.id = t.user_id WHERE t.id = $1::bigint`,
          [merge.keepRow!.id]);
        console.log(`\nMerged. ${after.name}: ${after.classes} class links,`
          + ` ${after.subjects} subjects. The duplicate account is deactivated.`);
      }
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
} finally {
  client.release();
  await pool.end();
}
