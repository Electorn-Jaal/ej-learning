/**
 * Loads each child's four-week study plan onto their record.
 *
 * Dry-run (default): pnpm --filter @workspace/api-server import-study-plans
 * Apply:             pnpm --filter @workspace/api-server import-study-plans -- --apply --yes
 *
 * content.placement_pathways holds the rule - what A2 means in general. This
 * loads what the school actually generated from it for named children: four
 * weeks, six skills a week from `Balanced Weekly Plan`, and five days a week
 * from `Daily Learning Schedule`. Both sheets were invisible until the
 * extractor stopped reading five sheets by name out of eighteen.
 *
 * Identity comes from cefr-student-matches.csv, the same sheet the results
 * import reads, so a child is one child across the placement and the plan. A
 * plan whose code nobody could place is skipped rather than guessed at.
 *
 * TWO SHEETS ARE DELIBERATELY NOT IMPORTED, and both for the same reason -
 * they look like per-child data and are not:
 *
 *   Weekly Learning Plan - all 420 rows name Listening as the priority skill
 *       and carry four distinct goals between them. The generator had no
 *       per-child Priority Gap to work from (that column is filled for one
 *       student out of 106), so it fell back to one child's profile and
 *       copied it. Importing it would tell ninety-odd families their child's
 *       weakest skill is listening on no evidence at all.
 *   Student Scores - the per-domain percentages and Strongest Domain are
 *       likewise filled for exactly one row. There is nothing to load.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pool } from "@workspace/db";

const apply = process.argv.includes("--apply");
if (apply && !process.argv.includes("--yes")) throw new Error("Refusing apply without --yes.");

const EXTRACT = resolve(process.cwd(), "../../local-data/extracted/cefr-extract.json");
const MATCHES = resolve(process.cwd(), "../../local-data/generated/cefr-student-matches.csv");

const DOMAIN_MN: Record<string, string> = {
  Grammar: "Дүрэм", Vocabulary: "Үгийн сан", Reading: "Унших",
  Listening: "Сонсох", Writing: "Бичих", Speaking: "Ярих",
};
const WEEKDAY: Record<string, number> = {
  Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5,
  Saturday: 6, Sunday: 7,
};

/** Same reader as the results import: quoted fields, nothing else. */
function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else field += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (char !== "\r") field += char;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((entry) => entry.some((cell) => cell !== ""));
}

type Sheet = Record<string, string | null>[];
const extract = JSON.parse(readFileSync(EXTRACT, "utf8")) as { sheets: Record<string, Sheet> };
const weekly = extract.sheets["Balanced Weekly Plan"] ?? [];
const daily = extract.sheets["Daily Learning Schedule"] ?? [];

const text = (row: Record<string, string | null>, key: string) =>
  String(row[key] ?? "").trim();

const weekNo = (value: string) => {
  const match = /(\d+)/.exec(value);
  return match ? Number(match[1]) : null;
};

// ---- who each typed code belongs to -------------------------------------
const matches = parseCsv(readFileSync(MATCHES, "utf8").replace(/^﻿/, ""));
const [header, ...body] = matches;
if (!header) throw new Error(`${MATCHES} is empty. Run match-cefr-students first.`);
const column = new Map(header.map((name, index) => [name, index]));
const codeFor = new Map<string, string>();
for (const line of body) {
  const raw = (line[column.get("raw_name")!] ?? "").trim().toUpperCase();
  const student = (line[column.get("STUDENT_CODE")!] ?? "").trim().toUpperCase();
  if (!raw || !student || student === "SKIP") continue;
  // A typed name that two different rows resolved to two different children
  // cannot identify either of them.
  if (codeFor.has(raw) && codeFor.get(raw) !== student) codeFor.set(raw, "");
  else if (!codeFor.has(raw)) codeFor.set(raw, student);
}

const client = await pool.connect();
try {
  const { rows: [subject] } = await client.query<{ id: string }>(
    "SELECT id::text AS id FROM core.subjects WHERE code = 'ENG'");
  if (!subject) throw new Error("core.subjects has no ENG row.");

  const { rows: students } = await client.query<{ id: string; code: string }>(
    "SELECT id::text AS id, student_code AS code FROM core.students WHERE is_active");
  const idFor = new Map(students.map((row) => [row.code.toUpperCase(), row.id]));

  const resolve_ = (typed: string) => {
    const student = codeFor.get(typed.trim().toUpperCase());
    return student ? idFor.get(student) ?? null : null;
  };

  // ---- weeks ------------------------------------------------------------
  const weeks = new Map<string, Record<string, string | number | null>>();
  const skippedWeeks = new Set<string>();
  for (const row of weekly) {
    const studentId = resolve_(text(row, "Student Code"));
    const week = weekNo(text(row, "Week"));
    const domain = DOMAIN_MN[text(row, "Skill")];
    if (!studentId || !week || !domain) { skippedWeeks.add(text(row, "Student Code")); continue; }
    // Duplicate rows are byte-identical copies made when one child's typed
    // code appeared twice, so the last one wins and nothing is lost.
    weeks.set(`${studentId}|${week}|${domain}`, {
      studentId, week, domain,
      levelCode: text(row, "Final CEFR") || null,
      priority: text(row, "Priority") || null,
      sourceLabel: text(row, "Book / Source") || null,
      unitFocus: text(row, "Unit / Focus") || null,
      pages: text(row, "Pages") || null,
      task: text(row, "Weekly Task") || null,
      masteryTarget: text(row, "Mastery Target") || null,
      teacherCheck: text(row, "Teacher Check") || null,
      status: text(row, "Status") || "PLANNED",
    });
  }

  // ---- days -------------------------------------------------------------
  const days = new Map<string, Record<string, string | number | null>>();
  const skippedDays = new Set<string>();
  for (const row of daily) {
    const studentId = resolve_(text(row, "Student Code"));
    const week = weekNo(text(row, "Week"));
    const weekday = WEEKDAY[text(row, "Day")];
    if (!studentId || !week || !weekday) { skippedDays.add(text(row, "Student Code")); continue; }
    const score = Number(text(row, "Score"));
    days.set(`${studentId}|${week}|${weekday}`, {
      studentId, week, weekday,
      focus: text(row, "Focus Skills") || null,
      levelCode: text(row, "CEFR") || null,
      sourceLabel: text(row, "Book / Source") || null,
      unitFocus: text(row, "Unit / Focus") || null,
      pages: text(row, "Pages") || null,
      task: text(row, "Student Task") || null,
      teacherCheck: text(row, "Teacher Check") || null,
      target: text(row, "Target") || null,
      score: text(row, "Score") && Number.isFinite(score) ? score : null,
      status: text(row, "Status") || "NOT ASSESSED",
    });
  }

  const dayRows = [...days.values()];
  console.log(JSON.stringify({
    weeklySheetRows: weekly.length,
    dailySheetRows: daily.length,
    weeksToWrite: weeks.size,
    daysToWrite: days.size,
    childrenWithAPlan: new Set([...weeks.values()].map((row) => row.studentId)).size,
    weeksCovered: [...new Set([...weeks.values()].map((row) => row.week))].sort(),
    daysWithAScore: dayRows.filter((row) => row.score !== null).length,
    dayStatus: dayRows.reduce<Record<string, number>>(
      (acc, row) => ({ ...acc, [String(row.status)]: (acc[String(row.status)] ?? 0) + 1 }), {}),
    codesWithNoStudent: [...skippedWeeks].filter(Boolean).slice(0, 12),
    codesWithNoStudentCount: skippedWeeks.size,
    notImported: {
      "Weekly Learning Plan": "Priority Skill is Listening on all 420 rows - a template, not per-child data.",
      "Student Scores": "Per-domain percentages are filled for 1 row of 106.",
    },
  }, null, 2));

  if (!apply) {
    console.log("\nDry run. Re-run with --apply --yes to write.");
  } else {
    await client.query("BEGIN");
    try {
      await client.query("DELETE FROM learning.study_plan_weeks WHERE subject_id = $1::bigint",
        [subject.id]);
      await client.query("DELETE FROM learning.study_plan_days WHERE subject_id = $1::bigint",
        [subject.id]);

      for (const row of weeks.values()) {
        await client.query(`
          INSERT INTO learning.study_plan_weeks
            (student_id, subject_id, week_no, domain_mn, level_code, priority,
             source_label, unit_focus_mn, pages_mn, task_mn, mastery_target_mn,
             teacher_check_mn, status)
          VALUES ($1::bigint, $2::bigint, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [row.studentId, subject.id, row.week, row.domain, row.levelCode, row.priority,
           row.sourceLabel, row.unitFocus, row.pages, row.task, row.masteryTarget,
           row.teacherCheck, row.status]);
      }
      for (const row of days.values()) {
        await client.query(`
          INSERT INTO learning.study_plan_days
            (student_id, subject_id, week_no, weekday_no, focus_mn, level_code,
             source_label, unit_focus_mn, pages_mn, task_mn, teacher_check_mn,
             target_mn, score, status)
          VALUES ($1::bigint, $2::bigint, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
          [row.studentId, subject.id, row.week, row.weekday, row.focus, row.levelCode,
           row.sourceLabel, row.unitFocus, row.pages, row.task, row.teacherCheck,
           row.target, row.score, row.status]);
      }
      await client.query("COMMIT");

      const { rows: [count] } = await client.query<Record<string, string>>(`
        SELECT (SELECT count(*)::text FROM learning.study_plan_weeks) AS weeks,
               (SELECT count(*)::text FROM learning.study_plan_days) AS days,
               (SELECT count(DISTINCT student_id)::text FROM learning.study_plan_days) AS children,
               (SELECT count(*)::text FROM learning.study_plan_days WHERE score IS NOT NULL) AS scored`);
      console.log(`\nWritten. Weeks: ${count.weeks}, days: ${count.days}`
        + ` for ${count.children} children (${count.scored} days marked so far).`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
} finally {
  client.release();
  await pool.end();
}
