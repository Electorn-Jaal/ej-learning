/**
 * Turns the placement workbook's daily timetable into real lessons and days.
 *
 *   python scripts/src/extract-daily-schedule.py <workbook.xlsx> \
 *       local-data/extracted/daily-schedule.json
 *   node scripts/run-ts.mjs scripts/import-daily-schedule.ts --yes [--from 2026-09-14]
 *
 * Until now every English student had one lesson per skill and a placement row
 * saying which level they sat at. The workbook already holds four weeks of
 * actual daily work - what to read, out of which book, what the teacher should
 * check - and none of it was in the system.
 *
 * ## What becomes what
 *
 * 1880 rows are 91 students following their level's timetable, so the 123
 * distinct plans become 123 daily_lessons and the rows become assignments
 * pointing at them. Three of those plans are the source system's own
 * remediation, marked "[ADAPTIVE PRIORITY] ... REVIEW AND RETEST"; they import
 * as RECOVERY lessons rather than CORE, which is what our own remediation
 * produces and what the student's page already labels differently.
 *
 * Focus Skills reads like "Reading + Listening". The first one named becomes
 * the lesson's core skill, since a lesson has one and the pair is recorded in
 * the lesson text anyway. Choosing the first is the source's own ordering
 * rather than a judgement of ours.
 *
 * Friday is "Integrated Review", which is not one of the six domains and
 * covers all of them. Crediting it to Grammar because Grammar is listed first
 * elsewhere would put a week of mixed work under one heading and make that
 * skill's mastery a lie. Each level gets its own review skill instead, so the
 * lesson has somewhere honest to hang and a review score says what it is.
 *
 * ## Dates
 *
 * Week 1 Monday lands on the Monday of the current week unless --from says
 * otherwise, so today is a real day in the timetable rather than an empty one.
 * Four weeks of weekdays follow it.
 *
 * ## What it will not do
 *
 * A day a teacher has already claimed is left alone. The placement rows this
 * replaces were written AUTO and are ours to move; a teacher's are not.
 *
 * The workbook's own Score and Status columns are read but not imported. They
 * are one system's opinion of how a day went, and writing them into
 * student_skill_mastery would make them indistinguishable from evidence this
 * system actually collected. The counts are reported so the decision can be
 * taken with the numbers in view.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { sql } from "drizzle-orm";
import { db, pool, readRows } from "@workspace/db";

if (!process.argv.includes("--yes")) {
  console.error("Refusing to run without --yes.");
  process.exit(1);
}

type Plan = {
  planId: string;
  level: string;
  week: string;
  day: string;
  "Focus Skills": string | null;
  "Book / Source": string | null;
  "Unit / Focus": string | null;
  Pages: string | null;
  "Student Task": string | null;
  "Teacher Check": string | null;
  Target: string | null;
};

type Entry = {
  planId: string;
  studentCode: string;
  level: string;
  week: string;
  day: string;
  score: string | null;
  status: string | null;
};

const DAY_INDEX: Record<string, number> = {
  Monday: 0,
  Tuesday: 1,
  Wednesday: 2,
  Thursday: 3,
  Friday: 4,
};

const flag = (name: string) => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
};

/** Monday of the week containing today, in the timezone the school lives in. */
function currentMonday() {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ulaanbaatar" }).format(
    new Date(),
  );
  const date = new Date(`${today}T00:00:00Z`);
  // getUTCDay: 0 is Sunday, so Sunday steps back six days rather than none.
  const offset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return date;
}

const isoDate = (start: Date, days: number) => {
  const date = new Date(start);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

try {
  const file = path.resolve(process.cwd(), "../../local-data/extracted/daily-schedule.json");
  const payload = JSON.parse(await readFile(file, "utf8")) as {
    plans: Plan[];
    entries: Entry[];
  };

  const start = flag("from") ? new Date(`${flag("from")}T00:00:00Z`) : currentMonday();
  if (Number.isNaN(start.getTime())) throw new Error("--from must be YYYY-MM-DD.");

  // One review skill per level, created on demand. They are real skills - a
  // student either can pull a week's work together or cannot - and keeping
  // them separate stops a review result being counted as grammar.
  for (const level of ["A1", "A2", "B1", "B2", "C1", "C2"]) {
    await db.execute(sql`
      INSERT INTO content.skills
        (skill_code, subject_id, name_mn, proficiency_level_id, description_mn,
         status, data_quality_status)
      SELECT ${`ENG-${level}-REVIEW`}, sub.id, ${`Нэгтгэсэн давтлага — ${level}`},
        pl.id, 'Долоо хоногийн бүх чиглэлийг нэгтгэн давтах.', 'APPROVED', 'COMPLETE'
      FROM core.subjects sub, content.proficiency_levels pl
      WHERE sub.code = 'ENG' AND pl.code = ${level}
      ON CONFLICT (skill_code) DO NOTHING`);
  }

  const skills = new Map(
    (
      await readRows<{ id: number; skillCode: string }>(
        `SELECT s.id::int, s.skill_code AS "skillCode" FROM content.skills s
         JOIN core.subjects sub ON sub.id = s.subject_id WHERE sub.code = 'ENG'`,
      )
    ).map((row) => [row.skillCode, row.id]),
  );

  // The import gave every student a tidy ENG-0001 code and kept what they
  // actually typed in external_code. This sheet uses the typed one, and not
  // consistently cased - "MUNHBUYN" here against "Munhbuyn" there - so the
  // lookup folds case and accepts either column.
  const students = new Map<string, number>();
  for (const row of await readRows<{
    id: number;
    studentCode: string;
    externalCode: string | null;
  }>(
    `SELECT id::int, student_code AS "studentCode", external_code AS "externalCode"
     FROM core.students WHERE is_active`,
  )) {
    students.set(row.studentCode.toLowerCase(), row.id);
    if (row.externalCode) students.set(row.externalCode.toLowerCase(), row.id);
  }

  // --- lessons -------------------------------------------------------------
  const lessonIdByPlan = new Map<string, number>();
  let lessonsWritten = 0;
  const unmatchedSkills = new Set<string>();

  for (const plan of payload.plans) {
    const focus = (plan["Focus Skills"] ?? "").trim();
    const domain = focus.toUpperCase().startsWith("INTEGRATED")
      ? "REVIEW"
      : focus.split("+")[0].trim().toUpperCase();
    const skillCode = `ENG-${plan.level}-${domain}`;
    const skillId = skills.get(skillCode);
    if (!skillId) {
      unmatchedSkills.add(skillCode);
      continue;
    }

    const weekNumber = Number(plan.week.replace(/\D/g, "")) || 1;
    const adaptive = (plan["Student Task"] ?? "").includes("ADAPTIVE PRIORITY");
    const lessonCode =
      `ENG-${plan.level}-W${weekNumber}-${plan.day.slice(0, 3).toUpperCase()}` +
      (adaptive ? `-R${plan.planId.slice(0, 4)}` : "");

    const result = await db.execute(sql`
      INSERT INTO learning.daily_lessons
        (lesson_code, core_skill_id, lesson_type, learning_goal_mn, remember_mn,
         guided_practice_mn, independent_practice_mn, student_message_mn,
         estimated_minutes, status, web_ready, print_ready)
      VALUES (${lessonCode}, ${skillId}, ${adaptive ? "RECOVERY" : "CORE"},
        ${plan["Unit / Focus"]}, ${plan["Book / Source"]},
        ${plan["Student Task"]}, ${plan.Pages},
        ${plan.Target ? `Зорилт: ${plan.Target}` : null},
        40, 'APPROVED', true, false)
      ON CONFLICT (lesson_code) DO UPDATE SET
        core_skill_id = EXCLUDED.core_skill_id,
        lesson_type = EXCLUDED.lesson_type,
        learning_goal_mn = EXCLUDED.learning_goal_mn,
        remember_mn = EXCLUDED.remember_mn,
        guided_practice_mn = EXCLUDED.guided_practice_mn,
        independent_practice_mn = EXCLUDED.independent_practice_mn,
        student_message_mn = EXCLUDED.student_message_mn
      RETURNING id`);

    const id = (result.rows[0] as { id: string | number } | undefined)?.id;
    if (id !== undefined) {
      lessonIdByPlan.set(plan.planId, Number(id));
      lessonsWritten += 1;
    }
  }

  // --- assignments ---------------------------------------------------------
  let booked = 0;
  let heldByTeacher = 0;
  const unknownStudents = new Set<string>();

  for (const entry of payload.entries) {
    const studentId = students.get(entry.studentCode.trim().toLowerCase());
    const lessonId = lessonIdByPlan.get(entry.planId);
    if (!studentId) {
      unknownStudents.add(entry.studentCode);
      continue;
    }
    if (lessonId === undefined) continue;

    const weekNumber = Number(entry.week.replace(/\D/g, "")) || 1;
    const dayOffset = DAY_INDEX[entry.day];
    if (dayOffset === undefined) continue;
    const assignedOn = isoDate(start, (weekNumber - 1) * 7 + dayOffset);

    const result = await db.execute(sql`
      INSERT INTO learning.student_assignments
        (student_id, daily_lesson_id, assigned_on, source, reason)
      VALUES (${studentId}, ${lessonId}, ${assignedOn}::date, 'AUTO',
        ${`${entry.level} түвшний ${entry.week}, ${entry.day} — байршуулалтын хуваарь.`})
      ON CONFLICT ON CONSTRAINT student_assignments_student_day_key DO UPDATE SET
        daily_lesson_id = EXCLUDED.daily_lesson_id,
        reason = EXCLUDED.reason
      WHERE student_assignments.source = 'AUTO'`);

    if ((result.rowCount ?? 0) > 0) booked += 1;
    else heldByTeacher += 1;
  }

  const scored = payload.entries.filter((e) => e.score && e.score !== "None").length;
  const assessed = payload.entries.filter(
    (e) => e.status && !["NOT ASSESSED", "PLANNED"].includes(e.status),
  ).length;

  console.log(`Timetable starts ${isoDate(start, 0)} and runs to ${isoDate(start, 3 * 7 + 4)}.`);
  console.log(`  lessons written      ${lessonsWritten} of ${payload.plans.length} plans`);
  console.log(`  assignments booked   ${booked}`);
  if (heldByTeacher > 0) {
    console.log(`  left alone           ${heldByTeacher} (a teacher had set that day)`);
  }
  if (unmatchedSkills.size > 0) {
    console.log(`  no such skill        ${[...unmatchedSkills].join(", ")}`);
  }
  if (unknownStudents.size > 0) {
    console.log(`  students not found   ${unknownStudents.size} (${[...unknownStudents].slice(0, 5).join(", ")}…)`);
  }
  console.log(
    `Not imported: ${scored} rows carry a score and ${assessed} a status other than NOT ASSESSED.`,
  );
  console.log("They are one system's opinion of a day, not evidence this one collected.");
} catch (error) {
  const cause = (error as { cause?: { message?: string; detail?: string } }).cause;
  console.error(`Failed: ${error instanceof Error ? error.message : String(error)}`);
  if (cause?.message) console.error(`  ${cause.message}`);
  if (cause?.detail) console.error(`  ${cause.detail}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
