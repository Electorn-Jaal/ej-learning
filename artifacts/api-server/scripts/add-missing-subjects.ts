/**
 * Adds the subjects the school teaches that the database had never heard of.
 *
 * Dry-run (default): pnpm --filter @workspace/api-server add-missing-subjects
 * Apply:             pnpm --filter @workspace/api-server add-missing-subjects -- --apply --yes
 *
 * core.subjects was built from the eleven grade-6 textbooks the school
 * supplied, so it holds the subjects that come with a book and nothing else.
 * Music and physical education come with a teacher and no textbook, and were
 * therefore invisible: three members of staff are registered to teach them and
 * no class could be timetabled for either.
 *
 * ANGIIN-TSAG is a different kind of entry and is marked as such. In the
 * primary years a slot often belongs to the class teacher rather than to a
 * subject - the register writes no subject name against it at all. The
 * timetable cannot hold that, because learning.class_schedule.subject_id is
 * NOT NULL: every slot has to name something. Inventing a subject name for
 * those hours would be worse than admitting what they are, so they get one
 * honest entry that says "the class teacher's hour" rather than being spread
 * across Монгол хэл and Математик to make the grid look tidy.
 */
import { pool } from "@workspace/db";

const apply = process.argv.includes("--apply");
if (apply && !process.argv.includes("--yes")) throw new Error("Refusing apply without --yes.");

/**
 * Only subjects there is evidence for.
 *
 * Music and PE each have registered teachers on the staff sheet, which is why
 * they are here and geography, chemistry and biology - which the upper years
 * almost certainly teach - are not. A subject added on a hunch would appear in
 * every timetable dropdown in the school and be filled in by somebody who
 * assumed we knew.
 */
const SUBJECTS: { code: string; nameMn: string; why: string }[] = [
  { code: "MUSIC", nameMn: "Дуу хөгжим", why: "Ц.Урангоо бүртгэлтэй багш" },
  { code: "PE", nameMn: "Биеийн тамир", why: "Г.Батцэцэг, Б.Түвшинбат бүртгэлтэй багш нар" },
  {
    code: "ANGIIN-TSAG",
    nameMn: "Ангийн багшийн цаг",
    why: "Бага ангид хичээлийн нэргүй, ангийн багш ордог цаг",
  },
];

/** Left over from the demo seed on a subject the school really teaches. */
const RENAME: { code: string; from: string; to: string }[] = [
  { code: "PHYS", from: "Физик — local demo", to: "Физик" },
];

/** Staff whose specialty had no subject row to point at until now. */
const SPECIALTIES: { subject: string; teachers: string[] }[] = [
  { subject: "MUSIC", teachers: ["Ц.Урангоо"] },
  { subject: "PE", teachers: ["Г.Батцэцэг", "Б.Түвшинбат"] },
];

const client = await pool.connect();
try {
  const { rows: existing } = await client.query<{ code: string; nameMn: string }>(
    "SELECT code, name_mn AS \"nameMn\" FROM core.subjects");
  const known = new Map(existing.map((row) => [row.code, row.nameMn]));

  const toAdd = SUBJECTS.filter((subject) => !known.has(subject.code));
  const toRename = RENAME.filter((row) => known.get(row.code) === row.from);

  const { rows: teachers } = await client.query<{ id: string; name: string }>(
    `SELECT t.id::text AS id, u.display_name AS name
     FROM core.teachers t JOIN core.users u ON u.id = t.user_id WHERE t.is_active`);
  const teacherId = new Map(teachers.map((row) => [row.name, row.id]));
  const missingTeachers = SPECIALTIES.flatMap((row) =>
    row.teachers.filter((name) => !teacherId.has(name)));

  console.log(JSON.stringify({
    subjectsNow: known.size,
    toAdd: toAdd.map((row) => `${row.code} — ${row.nameMn} (${row.why})`),
    alreadyPresent: SUBJECTS.filter((row) => known.has(row.code)).map((row) => row.code),
    toRename: toRename.map((row) => `${row.from} → ${row.to}`),
    specialtiesToRecord: SPECIALTIES.flatMap((row) =>
      row.teachers.map((name) => `${name} → ${row.subject}`)),
    teachersNotOnTheRegister: missingTeachers,
    notAdded: "Газар зүй, хими, биологи: багш нь тусад нь бүртгэгдээгүй тул таамаглаагүй.",
  }, null, 2));

  if (missingTeachers.length) {
    throw new Error("Refusing: a named teacher is not on the register.");
  }

  if (!apply) {
    console.log("\nDry run. Re-run with --apply --yes to write.");
  } else {
    await client.query("BEGIN");
    try {
      for (const subject of toAdd) {
        await client.query(
          "INSERT INTO core.subjects (code, name_mn, is_active) VALUES ($1, $2, true)",
          [subject.code, subject.nameMn]);
      }
      for (const row of toRename) {
        await client.query("UPDATE core.subjects SET name_mn = $2 WHERE code = $1",
          [row.code, row.to]);
      }
      for (const row of SPECIALTIES) {
        for (const name of row.teachers) {
          await client.query(`
            INSERT INTO core.teacher_subjects
              (teacher_id, subject_id, is_primary, is_active, source_title)
            SELECT $1::bigint, s.id, true, true, $3
            FROM core.subjects s WHERE s.code = $2
            ON CONFLICT (teacher_id, subject_id) DO UPDATE SET
              is_primary = true, is_active = true`,
            [teacherId.get(name), row.subject, "Багш нарын бүртгэлийн албан тушаалаас"]);
          await client.query(`
            UPDATE core.teachers SET subject_id = (SELECT id FROM core.subjects WHERE code = $2)
            WHERE id = $1::bigint AND subject_id IS NULL`,
            [teacherId.get(name), row.subject]);
        }
      }
      await client.query("COMMIT");

      const { rows: [count] } = await client.query<Record<string, string>>(`
        SELECT (SELECT count(*)::text FROM core.subjects WHERE is_active) AS subjects,
               (SELECT count(*)::text FROM core.teacher_subjects WHERE is_active) AS specialties,
               (SELECT count(*)::text FROM core.teachers t WHERE t.is_active
                  AND NOT EXISTS (SELECT 1 FROM core.teacher_subjects ts
                                   WHERE ts.teacher_id = t.id AND ts.is_active)) AS unplaced`);
      console.log(`\nWritten. Subjects: ${count.subjects},`
        + ` specialties: ${count.specialties},`
        + ` teachers still without one: ${count.unplaced} (бага ангийн багш нар).`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
} finally {
  client.release();
  await pool.end();
}
