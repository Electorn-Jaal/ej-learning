/**
 * Reads the school's real timetable and records who teaches what, where.
 *
 * Dry-run (default): pnpm --filter @workspace/api-server import-timetable-links
 * Apply:             pnpm --filter @workspace/api-server import-timetable-links -- --apply --yes
 *
 * This is the first of three passes over the 2026-2027 timetable, and the only
 * one that needs no schema change. It loads the facts the grid states outright:
 *
 *   core.subjects        - thirteen subjects the school teaches and the
 *                          database had never heard of, because it was built
 *                          from the eleven grade-6 textbooks.
 *   core.teachers        - eight members of staff who take lessons and were
 *                          not on the August staff register.
 *   core.class_teachers  - who takes which subject in which class. This is the
 *                          link the whole teacher side has been blocked on:
 *                          it was empty, so every teacher screen was empty.
 *   core.class_subjects  - what each class actually studies, replacing 108
 *                          rows that were filled in from the national
 *                          curriculum because nothing better existed.
 *
 * The slots themselves - Monday, third period - are NOT written here. A
 * timetable row needs learning.class_schedule.daily_lesson_id, which is NOT
 * NULL, and no real lesson content exists to point it at. That is a schema
 * question and it gets its own pass.
 *
 * NOTHING IS GUESSED. Where a cell could plausibly mean something already in
 * the database, this script says so and stops:
 *
 *   Т.Эрдэнэ was one letter from Т.Эрдэнээ on the staff register. A second
 *   record was created rather than the two being merged on a resemblance, the
 *   near-match was reported, and the school confirmed they are one person -
 *   merge-teacher-records.ts then joined them. That is the shape every such
 *   case should take: report, wait, act on an answer.
 *
 *   Cells that still name no class - БС, ДС-1, 10-12С - are counted and
 *   listed, not invented into one. The combined year groups the school did
 *   explain are expanded upstream by the extractor.
 */
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pool } from "@workspace/db";
import { hashPassword } from "../src/shared/password";

const apply = process.argv.includes("--apply");
if (apply && !process.argv.includes("--yes")) throw new Error("Refusing apply without --yes.");

const EXTRACT = resolve(process.cwd(), "../../local-data/extracted/timetable-2026-2027.json");

/** The fourteen classes on the roll. Everything else in a cell is not one. */
const CLASSES = new Set([
  "1а", "2а", "3а", "4а", "5а", "6а", "7а", "7б",
  "8а", "9а", "9б", "10а", "11а", "12а",
]);

/**
 * Cell text to a class, where the answer is not in doubt.
 *
 * "12a" is 12а with a Latin a - the same two characters a keyboard produces
 * by accident. "6а-1" and "6а-2" are the two halves of 6а sitting in
 * different rooms for design and IT; both halves are 6а for the purpose of
 * who teaches them.
 */
function classOf(cell: string): string | null {
  const value = cell.trim();
  if (CLASSES.has(value)) return value;
  if (value === "12a") return "12а";
  const split = /^(\d{1,2}[абАБ])-\d$/u.exec(value);
  if (split && CLASSES.has(split[1]!)) return split[1]!;
  return null;
}

/** A code for a subject the sheet names but the database has never held. */
function subjectCode(name: string, taken: Set<string>) {
  const base = name.toUpperCase()
    .replace(/[^A-ZА-ЯӨҮЁ0-9]+/gu, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24) || "SUBJECT";
  let code = base;
  let n = 2;
  while (taken.has(code)) code = `${base}-${n++}`;
  taken.add(code);
  return code;
}

type Slot = { teacher: string; subject: string; day: string; period: number; class: string };
const extract = JSON.parse(readFileSync(EXTRACT, "utf8")) as { source: string; slots: Slot[] };

const placed = extract.slots.filter((slot) => classOf(slot.class));
const unplaced = extract.slots.filter((slot) => !classOf(slot.class));

const client = await pool.connect();
try {
  const { rows: subjectRows } = await client.query<{ id: string; code: string; name: string }>(
    "SELECT id::text AS id, code, name_mn AS name FROM core.subjects WHERE is_active ORDER BY id");
  // Active only, and ordered, because a merge leaves a deactivated record
  // behind under the same name. Without the filter the name map could resolve
  // to the dead one and hang a term of lessons off nobody.
  const { rows: teacherRows } = await client.query<{ id: string; name: string }>(
    `SELECT t.id::text AS id, u.display_name AS name
       FROM core.teachers t JOIN core.users u ON u.id = t.user_id
      WHERE t.is_active ORDER BY t.id`);
  const { rows: classRows } = await client.query<{ id: string; name: string }>(
    "SELECT id::text AS id, name_mn AS name FROM core.classes WHERE is_active");

  const tidy = (value: string) => value.replace(/[\s.]/g, "").toUpperCase();
  const subjectByName = new Map(subjectRows.map((row) => [tidy(row.name), row]));
  const teacherByName = new Map(teacherRows.map((row) => [tidy(row.name), row]));
  const classByName = new Map(classRows.map((row) => [tidy(row.name), row]));

  const newSubjects = [...new Set(placed.concat(unplaced).map((s) => s.subject))]
    .filter((name) => !subjectByName.has(tidy(name))).sort();
  const newTeachers = [...new Set(placed.concat(unplaced).map((s) => s.teacher))]
    .filter((name) => !teacherByName.has(tidy(name))).sort();

  // Close spellings that are probably one person. Reported, never merged.
  const nearMatches = newTeachers.flatMap((name) => {
    const a = tidy(name);
    return teacherRows
      .filter((row) => {
        const b = tidy(row.name);
        return b !== a && (b.startsWith(a) || a.startsWith(b))
          && Math.abs(a.length - b.length) <= 2;
      })
      .map((row) => `${name} ≈ ${row.name}`);
  });

  const links = new Map<string, { className: string; subject: string; teacher: string }>();
  for (const slot of placed) {
    const className = classOf(slot.class)!;
    links.set(`${className}|${slot.subject}|${slot.teacher}`,
      { className, subject: slot.subject, teacher: slot.teacher });
  }
  const pairs = new Map<string, { className: string; subject: string }>();
  for (const link of links.values()) {
    pairs.set(`${link.className}|${link.subject}`,
      { className: link.className, subject: link.subject });
  }

  console.log(JSON.stringify({
    source: extract.source,
    slots: extract.slots.length,
    slotsWithAClass: placed.length,
    slotsWithoutAClass: unplaced.length,
    subjectsToAdd: newSubjects,
    teachersToAdd: newTeachers,
    possibleDuplicatesNotMerged: nearMatches,
    classTeacherRows: links.size,
    classSubjectRows: pairs.size,
    cellsThatAreNotAClass: Object.entries(
      unplaced.reduce<Record<string, number>>(
        (acc, slot) => ({ ...acc, [slot.class]: (acc[slot.class] ?? 0) + 1 }), {}))
      .sort((a, b) => b[1] - a[1]).map(([cell, count]) => `${cell} ×${count}`),
    notWrittenHere: "learning.class_schedule - needs a nullable daily_lesson_id.",
  }, null, 2));

  const unknownClasses = [...new Set(placed.map((s) => classOf(s.class)!))]
    .filter((name) => !classByName.has(tidy(name)));
  if (unknownClasses.length) {
    throw new Error(`Classes not on the roll: ${unknownClasses.join(", ")}.`);
  }

  if (!apply) {
    console.log("\nDry run. Re-run with --apply --yes to write.");
    console.log(`\nNote: ${newTeachers.length} new staff accounts would be created.`);
  } else {
    const credentials: { name: string; username: string; password: string }[] = [];
    await client.query("BEGIN");
    try {
      const taken = new Set(subjectRows.map((row) => row.code));
      for (const name of newSubjects) {
        const { rows: [row] } = await client.query<{ id: string; code: string }>(
          `INSERT INTO core.subjects (code, name_mn, is_active) VALUES ($1, $2, true)
           RETURNING id::text AS id, code`,
          [subjectCode(name, taken), name]);
        subjectByName.set(tidy(name), { id: row.id, code: row.code, name });
      }

      // A teacher needs an account, because core.teachers.user_id is NOT NULL.
      // The password is random and printed once: nobody, this script included,
      // should be able to read it back out of the database afterwards.
      const { rows: [seq] } = await client.query<{ next: string }>(
        `SELECT COALESCE(max(substring(teacher_code from 'T(\\d+)$')::int), 0) + 1 AS next
           FROM core.teachers WHERE teacher_code LIKE 'EJ-2627-T%'`);
      let nextNo = Number(seq.next);
      for (const name of newTeachers) {
        const code = `EJ-2627-T${String(nextNo).padStart(3, "0")}`;
        const username = `ej26t${String(nextNo).padStart(3, "0")}`;
        const password = randomBytes(9).toString("base64url");
        const { rows: [user] } = await client.query<{ id: string }>(
          `INSERT INTO core.users (username, password_hash, display_name)
           VALUES ($1, $2, $3) RETURNING id::text AS id`,
          [username, await hashPassword(password), name]);
        await client.query(
          "INSERT INTO core.user_roles (user_id, role) VALUES ($1::bigint, 'TEACHER')",
          [user.id]);
        const { rows: [teacher] } = await client.query<{ id: string }>(
          `INSERT INTO core.teachers (user_id, teacher_code, is_active, data_origin)
           VALUES ($1::bigint, $2, true, 'REAL') RETURNING id::text AS id`,
          [user.id, code]);
        teacherByName.set(tidy(name), { id: teacher.id, name });
        credentials.push({ name, username, password });
        nextNo += 1;
      }

      // The timetable is the authority on what a class studies, so the
      // curriculum guesses give way to it. Rows it does not mention are
      // deactivated rather than deleted: a subject taught in a term with no
      // timetable entry is a question for the school, not a row to destroy.
      await client.query("UPDATE core.class_subjects SET is_active = false");
      for (const pair of pairs.values()) {
        await client.query(`
          INSERT INTO core.class_subjects (class_id, subject_id, origin, is_active)
          VALUES ($1::bigint, $2::bigint, 'ROSTER', true)
          ON CONFLICT (class_id, subject_id) DO UPDATE SET
            origin = 'ROSTER', is_active = true, updated_at = now()`,
          [classByName.get(tidy(pair.className))!.id,
           subjectByName.get(tidy(pair.subject))!.id]);
      }

      await client.query("UPDATE core.class_teachers SET is_active = false");
      for (const link of links.values()) {
        await client.query(`
          INSERT INTO core.class_teachers (class_id, teacher_id, subject_id, is_active)
          VALUES ($1::bigint, $2::bigint, $3::bigint, true)
          ON CONFLICT (class_id, teacher_id, subject_id) DO UPDATE SET is_active = true`,
          [classByName.get(tidy(link.className))!.id,
           teacherByName.get(tidy(link.teacher))!.id,
           subjectByName.get(tidy(link.subject))!.id]);
      }

      // What a teacher is qualified in follows from what they are timetabled
      // to teach, which is better evidence than a job title.
      for (const link of links.values()) {
        await client.query(`
          INSERT INTO core.teacher_subjects (teacher_id, subject_id, is_primary, is_active, source_title)
          VALUES ($1::bigint, $2::bigint, false, true, $3)
          ON CONFLICT (teacher_id, subject_id) DO UPDATE SET is_active = true`,
          [teacherByName.get(tidy(link.teacher))!.id,
           subjectByName.get(tidy(link.subject))!.id,
           "2026-2027 хичээлийн хуваариас"]);
      }

      await client.query("COMMIT");

      const { rows: [count] } = await client.query<Record<string, string>>(`
        SELECT (SELECT count(*)::text FROM core.subjects WHERE is_active) AS subjects,
               (SELECT count(*)::text FROM core.teachers WHERE is_active) AS teachers,
               (SELECT count(*)::text FROM core.class_teachers WHERE is_active) AS links,
               (SELECT count(*)::text FROM core.class_subjects WHERE is_active) AS pairs,
               (SELECT count(*)::text FROM core.teacher_subjects WHERE is_active) AS specialties`);
      console.log(`\nWritten. Subjects: ${count.subjects}, teachers: ${count.teachers},`
        + ` class_teachers: ${count.links}, class_subjects: ${count.pairs},`
        + ` specialties: ${count.specialties}.`);
      if (credentials.length) {
        console.log("\nNew staff accounts - printed once, not recoverable:");
        for (const row of credentials) {
          console.log(`  ${row.name.padEnd(18)} ${row.username}  ${row.password}`);
        }
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
