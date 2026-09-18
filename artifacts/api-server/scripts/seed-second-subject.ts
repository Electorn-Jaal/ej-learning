/**
 * Gives one class a second subject, so a day looks like a day.
 *
 *   node scripts/run-ts.mjs scripts/seed-second-subject.ts --yes
 *
 * Every class in the database teaches exactly one subject, which is an
 * accident of how the data arrived rather than anything about schools: 10А
 * came from the algebra seed and the rest from an English placement workbook.
 * A student therefore saw one lesson and the product looked like a
 * single-subject tutor.
 *
 * Class 10А already studies maths through a class schedule. This adds English,
 * which works the other way - placed per student by level rather than taught
 * to the class as a whole - so the two models that have to coexist are both
 * visible on one child's page.
 *
 * Levels are spread across the ten students rather than given uniformly,
 * because a real class is not all at one level and a screen that shows it
 * uniform teaches the wrong thing about the product. These are mock students,
 * marked as such in core.students, so inventing a level for them invents
 * nothing about a real child.
 *
 * Idempotent: re-running assigns the same student the same level.
 */
import { sql } from "drizzle-orm";
import { db, pool, readRows } from "@workspace/db";

if (!process.argv.includes("--yes")) {
  console.error("Refusing to run without --yes.");
  process.exit(1);
}

const CLASS_CODE = "ALG10-G10-A";
/** A plausible spread for one class, not a measurement. */
const LEVELS = ["A2", "A2", "B1", "B1", "B1", "B2", "B2", "B2", "C1", "C1"];

try {
  const [klass] = await readRows<{ id: number; name: string }>(
    `SELECT id::int, name_mn AS name FROM core.classes WHERE class_code = $1`,
    [CLASS_CODE],
  );
  if (!klass) throw new Error(`Class ${CLASS_CODE} not found.`);

  const [english] = await readRows<{ id: number }>(
    `SELECT id::int FROM core.subjects WHERE code = 'ENG'`,
  );
  if (!english) throw new Error("Subject ENG not found.");

  // The class needs a teacher of record for the subject, or the teacher-side
  // screens have no way to reach it. The English teacher is the right answer
  // here; it no longer has to be a different person from the maths one, since
  // class_teachers is keyed per subject.
  const teacherLink = await db.execute(sql`
    INSERT INTO core.class_teachers (class_id, teacher_id, subject_id, is_active)
    SELECT ${klass.id}, t.id, ${english.id}, true
    FROM core.teachers t
    JOIN core.users u ON u.id = t.user_id
    WHERE u.username = 'bagsh-eng'
    ON CONFLICT (class_id, teacher_id, subject_id) DO UPDATE SET
      is_active = true`);

  const students = await readRows<{ id: number; name: string }>(
    `SELECT st.id::int, st.display_name AS name
     FROM core.student_enrollments e
     JOIN core.students st ON st.id = e.student_id AND st.is_active
     WHERE e.class_id = $1::bigint AND e.is_active
     ORDER BY st.id`,
    [klass.id],
  );

  // Four weeks of English weekdays, the same timetable the imported students
  // follow, starting from the Monday of the current week.
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ulaanbaatar" }).format(
    new Date(),
  );
  const monday = new Date(`${today}T00:00:00Z`);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));

  let assigned = 0;
  let missing = 0;

  for (const [index, student] of students.entries()) {
    const level = LEVELS[index % LEVELS.length];

    for (let week = 1; week <= 4; week += 1) {
      for (const [dayIndex, day] of ["MON", "TUE", "WED", "THU", "FRI"].entries()) {
        const date = new Date(monday);
        date.setUTCDate(date.getUTCDate() + (week - 1) * 7 + dayIndex);
        const on = date.toISOString().slice(0, 10);
        const lessonCode = `ENG-${level}-W${week}-${day}`;

        const result = await db.execute(sql`
          INSERT INTO learning.student_assignments
            (student_id, daily_lesson_id, assigned_on, subject_id, source, reason)
          SELECT ${student.id}, dl.id, ${on}::date, sk.subject_id, 'AUTO',
            ${`${level} түвшний хуваарь.`}
          FROM learning.daily_lessons dl
          JOIN content.skills sk ON sk.id = dl.core_skill_id
          WHERE dl.lesson_code = ${lessonCode}
          ON CONFLICT ON CONSTRAINT student_assignments_student_day_key DO UPDATE SET
            daily_lesson_id = EXCLUDED.daily_lesson_id,
            reason = EXCLUDED.reason
          WHERE student_assignments.source = 'AUTO'`);

        if ((result.rowCount ?? 0) > 0) assigned += 1;
        else missing += 1;
      }
    }
  }

  const check = (
    await db.execute(sql`
      SELECT subj.code, count(*)::int AS n
      FROM learning.student_assignments sa
      JOIN core.subjects subj ON subj.id = sa.subject_id
      JOIN core.student_enrollments e ON e.student_id = sa.student_id AND e.is_active
      WHERE e.class_id = ${klass.id} AND sa.assigned_on = ${today}::date
      GROUP BY subj.code`)
  ).rows as { code: string; n: number }[];

  console.log(`${klass.name}: ${students.length} students, levels ${[...new Set(LEVELS)].join(", ")}`);
  console.log(`  teacher link rows added   ${teacherLink.rowCount ?? 0}`);
  console.log(`  assignments written       ${assigned}`);
  if (missing > 0) {
    console.log(`  skipped                   ${missing} (no such lesson, or a teacher held the day)`);
  }
  console.log(`Today in ${klass.name}, by subject:`);
  for (const row of check) console.log(`  ${row.code.padEnd(6)} ${row.n} personal assignment(s)`);
} catch (error) {
  const cause = (error as { cause?: { message?: string; detail?: string } }).cause;
  console.error(`Failed: ${error instanceof Error ? error.message : String(error)}`);
  if (cause?.message) console.error(`  ${cause.message}`);
  if (cause?.detail) console.error(`  ${cause.detail}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
