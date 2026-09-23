/**
 * A worked timetable for 6a, so the schedule grid has something to draw.
 *
 * Dry-run (default): pnpm --filter @workspace/api-server seed-demo-timetable
 * Apply:             pnpm --filter @workspace/api-server seed-demo-timetable -- --apply --yes
 * Remove:            pnpm --filter @workspace/api-server seed-demo-timetable -- --remove --yes
 *
 * Four subjects, not eleven: a demo is for reading, and a full grid of
 * invented lessons is harder to judge than a sparse one of believable ones.
 *
 * WHAT IS REAL AND WHAT IS NOT. Maths and Mongolian have their books' section
 * lists imported, so their lessons ARE the book's own sections, in the book's
 * own order, one per occurrence - tapping through them walks the real
 * syllabus. English and civics have no section list, so those two carry a
 * single invented lesson apiece and say as much in their text. The timetable
 * itself - which subject at which hour - is invented in every case.
 *
 * Everything is prefixed DEMO-TT- and `--remove` takes all of it back out.
 * content.skills and learning.daily_lessons carry no data_origin column, so a
 * code prefix is the convention, the same one the other demo content follows.
 */
import { pool } from "@workspace/db";

const apply = process.argv.includes("--apply");
const remove = process.argv.includes("--remove");
if ((apply || remove) && !process.argv.includes("--yes")) {
  throw new Error("Refusing to write without --yes.");
}
if (apply && remove) throw new Error("Pick --apply or --remove, not both.");

const CLASS_CODE = "EJ-2627-6A";
const PREFIX = "DEMO-TT-";

/**
 * ETHICS stands in for "нийгэм". The school asked for social studies, and
 * core.subjects has no such row: the grade-6 set runs to civics and history
 * instead, and civics is the nearer of the two. Add a Нийгэм судлал subject
 * and change this line if the school teaches it under that name.
 */
const SUBJECTS = ["MATH", "MGL", "ENG", "ETHICS"] as const;

/** Invented lessons, for the subjects whose books have no section list yet. */
const standIn: Record<string, string> = {
  ENG: "Daily routines — present simple",
  ETHICS: "Иргэний үүрэг, хариуцлага",
};

/**
 * [period, subject] per weekday, Monday first.
 *
 * Spread across the eight-period day rather than stacked at the top: four
 * subjects cannot fill eight slots, and bunching them into the first three
 * would draw a timetable that stops before break. Real days have gaps.
 */
const week: [number, string][][] = [
  [[1, "MATH"], [2, "MGL"], [4, "ENG"], [6, "ETHICS"]],
  [[1, "MATH"], [3, "ETHICS"], [5, "MGL"], [7, "ENG"]],
  [[2, "MGL"], [3, "MATH"], [5, "ENG"]],
  [[1, "MATH"], [2, "ENG"], [4, "ETHICS"], [6, "MGL"]],
  [[1, "MGL"], [3, "MATH"], [4, "ENG"], [8, "ETHICS"]],
];

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ulaanbaatar" }).format(new Date());

/** Weekdays of the three weeks around today, Monday-based. */
function schoolDays() {
  const anchor = new Date(today + "T00:00:00Z");
  const monday = new Date(anchor);
  monday.setUTCDate(monday.getUTCDate() - ((anchor.getUTCDay() + 6) % 7) - 7);
  const days: { date: string; weekday: number }[] = [];
  for (let i = 0; i < 21; i += 1) {
    const d = new Date(monday);
    d.setUTCDate(d.getUTCDate() + i);
    const weekday = (d.getUTCDay() + 6) % 7;
    if (weekday < 5) days.push({ date: isoDay(d), weekday });
  }
  return days;
}

type Section = { id: string; sequenceNo: number; printedNumber: string | null; title: string };

const client = await pool.connect();
try {
  const dbName = (await client.query<{ current_database: string }>(
    "SELECT current_database()")).rows[0].current_database;
  if (!dbName.startsWith("ej_learning_local") && !dbName.startsWith("ej_learning_test")) {
    throw new Error(`Refusing database ${dbName}.`);
  }

  if (remove) {
    await client.query("BEGIN");
    try {
      const sched = await client.query(
        `DELETE FROM learning.class_schedule cs USING learning.daily_lessons dl
          WHERE dl.id = cs.daily_lesson_id AND dl.lesson_code LIKE $1`, [PREFIX + "%"]);
      // The pointer may name a section a demo lesson also used; the section
      // itself is real, so only the lesson and skill go.
      const lessons = await client.query(
        "DELETE FROM learning.daily_lessons WHERE lesson_code LIKE $1", [PREFIX + "%"]);
      const skills = await client.query(
        "DELETE FROM content.skills WHERE skill_code LIKE $1", [PREFIX + "%"]);
      await client.query("COMMIT");
      console.log(`Removed: ${sched.rowCount} schedule rows, ${lessons.rowCount} lessons, ${skills.rowCount} skills.`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
    process.exit(0);
  }

  const [klass] = (await client.query<{ id: string; grade_level_id: number; school_year: string }>(
    "SELECT id, grade_level_id, school_year FROM core.classes WHERE class_code = $1",
    [CLASS_CODE])).rows;
  if (!klass) throw new Error(`No class ${CLASS_CODE}.`);

  const taught = new Map((await client.query<{
    subject_id: string; code: string; source_material_id: string | null;
  }>(`SELECT cs.subject_id, s.code, cs.source_material_id
        FROM core.class_subjects cs JOIN core.subjects s ON s.id = cs.subject_id
       WHERE cs.class_id = $1::bigint AND cs.is_active`, [klass.id])).rows.map((r) => [r.code, r]));

  // The book's own sections, where the school imported them.
  const sectionsOf = new Map<string, Section[]>();
  for (const code of SUBJECTS) {
    const subject = taught.get(code);
    if (!subject?.source_material_id) continue;
    const rows = (await client.query<Section>(`
      SELECT id::text AS id, sequence_no AS "sequenceNo", printed_number AS "printedNumber", title
        FROM content.source_outline_nodes
       WHERE source_material_id = $1::bigint ORDER BY sequence_no`,
      [subject.source_material_id])).rows;
    if (rows.length) sectionsOf.set(code, rows);
  }

  // Where each subject is now, so the timetable and the class's own pointer
  // tell the same story: today's lesson IS the section the teacher marked.
  const anchorSeq = new Map((await client.query<{ code: string; sequence_no: number }>(`
    SELECT s.code, n.sequence_no
      FROM learning.class_topics ct
      JOIN core.subjects s ON s.id = ct.subject_id
      JOIN content.source_outline_nodes n ON n.id = ct.source_outline_node_id
     WHERE ct.class_id = $1::bigint`, [klass.id])).rows.map((r) => [r.code, r.sequence_no]));

  const days = schoolDays();
  const occurrences = days.flatMap(({ date, weekday }) =>
    week[weekday]!.map(([periodNo, code]) => ({ date, periodNo, code }))
      .filter((row) => taught.has(row.code)),
  );

  /** Which book section each occurrence of an outlined subject teaches. */
  const sectionFor = new Map<string, Section>();
  for (const [code, sections] of sectionsOf) {
    const mine = occurrences.filter((row) => row.code === code);
    const todayIndex = mine.findIndex((row) => row.date === today);
    const anchorIndex = sections.findIndex((s) => s.sequenceNo === anchorSeq.get(code));
    // Line today's lesson up with the marked section; with none marked, start
    // the window at the front of the book.
    const offset = todayIndex >= 0 && anchorIndex >= 0 ? anchorIndex - todayIndex : 0;
    mine.forEach((row, index) => {
      const section = sections[Math.min(Math.max(index + offset, 0), sections.length - 1)];
      if (section) sectionFor.set(`${row.code}:${row.date}`, section);
    });
  }

  const [admin] = (await client.query<{ id: string }>(
    "SELECT id FROM core.users ORDER BY id LIMIT 1")).rows;

  console.log(JSON.stringify({
    database: dbName,
    mode: apply ? "APPLY" : "DRY_RUN",
    class: CLASS_CODE,
    subjects: SUBJECTS.filter((c) => taught.has(c)),
    fromRealBook: [...sectionsOf.keys()],
    inventedLesson: SUBJECTS.filter((c) => taught.has(c) && !sectionsOf.has(c)),
    schoolDays: days.length,
    scheduleRows: occurrences.length,
    from: days[0]?.date,
    to: days[days.length - 1]?.date,
    todaySample: occurrences
      .filter((row) => row.date === today)
      .map((row) => `${row.periodNo}. ${row.code} — ${sectionFor.get(`${row.code}:${row.date}`)?.title ?? standIn[row.code] ?? "?"}`),
  }, null, 2));

  if (!apply) {
    console.log("\nDry run. Re-run with --apply --yes to write, --remove --yes to take it out.");
    process.exit(0);
  }

  await client.query("BEGIN");
  try {
    /** A skill and lesson per distinct thing taught, keyed for reuse. */
    const lessonIdOf = new Map<string, string>();
    const ensureLesson = async (
      code: string, key: string, name: string, nodeId: string | null,
    ) => {
      const cached = lessonIdOf.get(key);
      if (cached) return cached;
      const subject = taught.get(code)!;
      const [skill] = (await client.query<{ id: string }>(`
        INSERT INTO content.skills
          (skill_code, subject_id, grade_level_id, name_mn, learning_outcome_mn,
           status, data_quality_status, notes)
        VALUES ($1, $2::bigint, $3::smallint, $4, $5, 'APPROVED', 'COMPLETE', 'Demo timetable fixture')
        ON CONFLICT (skill_code) DO UPDATE SET name_mn = EXCLUDED.name_mn
        RETURNING id`,
        [PREFIX + key, subject.subject_id, klass.grade_level_id, name,
         `${name} — сурагч энэ сэдвийг эзэмшинэ`])).rows;
      const [lesson] = (await client.query<{ id: string }>(`
        INSERT INTO learning.daily_lessons
          (lesson_code, core_skill_id, lesson_type, learning_goal_mn, remember_mn,
           worked_example_mn, independent_practice_mn, estimated_minutes,
           student_message_mn, print_ready, web_ready, source_material_id,
           source_outline_node_id, status)
        VALUES ($1, $2::bigint, 'CORE', $3, $4, $5, $6, 40, $7, true, true,
                $8::bigint, $9::bigint, 'APPROVED')
        ON CONFLICT (lesson_code) DO UPDATE SET learning_goal_mn = EXCLUDED.learning_goal_mn
        RETURNING id`,
        // Nulls, not filler. A lesson made from a book's table of contents
        // knows the section, the book and the pages, and knows nothing about
        // how to teach it; sentences invented to fill the headings read as a
        // lesson to the child looking at them, which is worse than a heading
        // that is simply not drawn.
        [PREFIX + key, skill.id, `${name}-ийг ойлгож, дасгал гүйцэтгэх`,
         nodeId ? null : "Энэ бол хуваарийг харуулах зорилгоор оруулсан жишээ агуулга.",
         null, null,
         nodeId ? null : "Жишээ агуулга — жинхэнэ сургалтын материал биш.",
         subject.source_material_id, nodeId])).rows;
      lessonIdOf.set(key, lesson.id);
      return lesson.id;
    };

    let written = 0;
    for (const row of occurrences) {
      const section = sectionFor.get(`${row.code}:${row.date}`);
      const name = section
        ? `${section.printedNumber ? section.printedNumber + ". " : ""}${section.title}`
        : standIn[row.code];
      if (!name) continue;
      const key = section ? `${row.code}-${section.sequenceNo}` : row.code;
      const lessonId = await ensureLesson(row.code, key, name, section?.id ?? null);

      const result = await client.query(`
        INSERT INTO learning.class_schedule
          (class_id, term_id, daily_lesson_id, scheduled_on, subject_id, period_no, created_by)
        SELECT $1::bigint, t.id, $2::bigint, $3::date, $4::bigint, $5::smallint, $6::bigint
          FROM learning.terms t
         WHERE t.school_year = $7 AND $3::date BETWEEN t.starts_on AND t.ends_on
        ON CONFLICT DO NOTHING`,
        [klass.id, lessonId, row.date, taught.get(row.code)!.subject_id,
         row.periodNo, admin?.id ?? null, klass.school_year]);
      written += result.rowCount ?? 0;
    }

    // Every outlined subject now has a marked position, so the subjects page,
    // the grid and the "what comes next" panel agree with one another.
    for (const code of sectionsOf.keys()) {
      const section = sectionFor.get(`${code}:${today}`);
      if (!section) continue;
      await client.query(`
        INSERT INTO learning.class_topics
          (class_id, subject_id, source_outline_node_id, effective_on, set_by)
        VALUES ($1::bigint, $2::bigint, $3::bigint, CURRENT_DATE, $4::bigint)
        ON CONFLICT (class_id, subject_id) DO UPDATE SET
          source_outline_node_id = EXCLUDED.source_outline_node_id,
          effective_on = EXCLUDED.effective_on,
          updated_at = now()`,
        [klass.id, taught.get(code)!.subject_id, section.id, admin?.id ?? null]);
    }
    await client.query("COMMIT");

    const [{ n }] = (await client.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM learning.class_schedule cs
       JOIN learning.daily_lessons dl ON dl.id = cs.daily_lesson_id
       WHERE dl.lesson_code LIKE $1`, [PREFIX + "%"])).rows;
    console.log(`\nWritten. New schedule rows: ${written}. Demo rows in place: ${n}.`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
} finally {
  client.release();
  await pool.end();
}
