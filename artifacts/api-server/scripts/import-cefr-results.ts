/**
 * Loads the CEFR placement results onto real students, and parks the rest.
 *
 * Dry-run (default): pnpm --filter @workspace/api-server import-cefr-results
 * Apply:             pnpm --filter @workspace/api-server import-cefr-results -- --apply --yes
 *
 * Reads local-data/generated/cefr-student-matches.csv, which
 * match-cefr-students.ts writes and a teacher edits. The only column this
 * script trusts for identity is STUDENT_CODE. Everything else on the row -
 * the candidates, the confidence, how clever the matcher was - is working
 * out that has already happened; a row either names a child or it does not.
 *
 * Two destinations, and nothing is thrown away:
 *
 *   assessment.placement_attempts - rows that name a student. The score, the
 *       level and the date of the sitting, against that child's real record.
 *   staging.import_rows           - every row that does not. The raw entry is
 *       kept verbatim with the reason it could not be placed, so the day a
 *       teacher works out that "SHINEE" in 8а was Энхжин, the row is still
 *       here to re-run rather than gone.
 *
 * That is what the staging schema is for. A result dropped on the floor
 * because nobody could read a name is a result the school paid for and lost.
 *
 * Re-running is safe: this import's attempts are identified by external_key
 * and replaced, and the staging job is rewritten.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";

const apply = process.argv.includes("--apply");
if (apply && !process.argv.includes("--yes")) throw new Error("Refusing apply without --yes.");

const SHEET = resolve(process.cwd(), "../../local-data/generated/cefr-student-matches.csv");
const EXTRACT = resolve(process.cwd(), "../../local-data/extracted/cefr-extract.json");

/** Everything this import wrote, so a re-run can find and replace it. */
const KEY_PREFIX = "cefr-placement:";
const IMPORT_TYPE = "CEFR_PLACEMENT";

/** A CSV reader that understands quoted fields, which is all this file needs. */
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

const raw = readFileSync(SHEET, "utf8").replace(/^﻿/, "");
const [header, ...body] = parseCsv(raw);
if (!header) throw new Error(`${SHEET} is empty. Run match-cefr-students first.`);
const columnOf = new Map(header.map((name, index) => [name, index]));
for (const required of ["row", "raw_name", "final_cefr", "score", "confidence", "STUDENT_CODE"]) {
  if (!columnOf.has(required)) throw new Error(`${SHEET} has no "${required}" column.`);
}
const cell = (line: string[], name: string) => (line[columnOf.get(name)!] ?? "").trim();

// The sitting's date lives in the extract, not in the sheet the teacher edits.
const extract = JSON.parse(readFileSync(EXTRACT, "utf8")) as {
  cefrResults: Record<string, string | null>[];
};
const timestampOf = (rowNumber: number) =>
  String(extract.cefrResults[rowNumber - 1]?.["Timestamp"] ?? "").slice(0, 10) || null;

type Placed = {
  rowNumber: number; studentCode: string; level: string;
  score: number | null; maxScore: number | null; attemptedOn: string | null;
  rawName: string; confidence: string;
};
type Parked = { rowNumber: number; reason: string; data: Record<string, string> };

const placed: Placed[] = [];
const parked: Parked[] = [];

for (const line of body) {
  const rowNumber = Number(cell(line, "row"));
  const code = cell(line, "STUDENT_CODE").toUpperCase();
  const data = Object.fromEntries(header.map((name, index) => [name, line[index] ?? ""]));

  if (!code || code === "SKIP") {
    parked.push({
      rowNumber,
      reason: code === "SKIP"
        ? "Багш SKIP гэж тэмдэглэсэн."
        : `Сурагч тогтоогдоогүй (${cell(line, "confidence")}).`,
      data,
    });
    continue;
  }

  // "44 / 60" is how the sheet carries a score.
  const score = /(\d+)\s*\/\s*(\d+)/.exec(cell(line, "score"));
  placed.push({
    rowNumber,
    studentCode: code,
    level: cell(line, "final_cefr").toUpperCase(),
    score: score ? Number(score[1]) : null,
    maxScore: score ? Number(score[2]) : null,
    attemptedOn: timestampOf(rowNumber),
    rawName: cell(line, "raw_name"),
    confidence: cell(line, "confidence"),
  });
}

const client = await pool.connect();
try {
  const { rows: [subject] } = await client.query<{ id: string }>(
    "SELECT id::text AS id FROM core.subjects WHERE code = 'ENG'");
  if (!subject) throw new Error("core.subjects has no ENG row.");

  const { rows: levelRows } = await client.query<{ id: string; code: string }>(
    "SELECT id::text AS id, code FROM content.proficiency_levels WHERE framework = 'CEFR'");
  const levelId = new Map(levelRows.map((level) => [level.code, level.id]));

  const { rows: studentRows } = await client.query<{ id: string; code: string; name: string }>(
    "SELECT id::text AS id, student_code AS code, display_name AS name FROM core.students WHERE is_active");
  const studentId = new Map(studentRows.map((student) => [student.code, student]));

  // A code the teacher typed that is not on the roll, or a level that is not
  // a CEFR rung, is a mistake in the sheet rather than in the data. It moves
  // to the parked pile instead of failing the whole import.
  const ready: Placed[] = [];
  for (const entry of placed) {
    const problem = !studentId.has(entry.studentCode)
      ? `STUDENT_CODE "${entry.studentCode}" бүртгэлд алга.`
      : !levelId.has(entry.level)
        ? `Түвшин "${entry.level}" CEFR-т байхгүй.`
        : null;
    if (problem) {
      parked.push({ rowNumber: entry.rowNumber, reason: problem, data: { raw_name: entry.rawName } });
    } else {
      ready.push(entry);
    }
  }

  const distinct = new Set(ready.map((entry) => entry.studentCode));
  const twice = [...distinct].filter(
    (code) => ready.filter((entry) => entry.studentCode === code).length > 1);

  console.log(JSON.stringify({
    sheetRows: body.length,
    toImport: ready.length,
    distinctStudents: distinct.size,
    studentsWithTwoSittings: twice.length,
    toPark: parked.length,
    byLevel: ready.reduce<Record<string, number>>(
      (acc, entry) => ({ ...acc, [entry.level]: (acc[entry.level] ?? 0) + 1 }), {}),
    parkedReasons: parked.reduce<Record<string, number>>(
      (acc, entry) => ({ ...acc, [entry.reason]: (acc[entry.reason] ?? 0) + 1 }), {}),
  }, null, 2));

  if (!apply) {
    console.log("\nDry run. Re-run with --apply --yes to write.");
  } else {
    await client.query("BEGIN");
    try {
      await client.query(
        "DELETE FROM assessment.placement_attempts WHERE external_key LIKE $1",
        [`${KEY_PREFIX}%`]);

      for (const entry of ready) {
        await client.query(`
          INSERT INTO assessment.placement_attempts
            (student_id, subject_id, proficiency_level_id, total_score, total_max_score,
             external_key, answer_source, attempted_on, notes)
          VALUES ($1::bigint, $2::bigint, $3::smallint, $4, $5, $6, 'RECONSTRUCTED', $7::date, $8)`,
          [studentId.get(entry.studentCode)!.id, subject.id, levelId.get(entry.level),
           entry.score, entry.maxScore, `${KEY_PREFIX}${entry.rowNumber}`, entry.attemptedOn,
           `Google Form-д «${entry.rawName}» гэж бичсэн; ${entry.confidence} байдлаар тогтоов.`
           + " Бичих, ярих чадвар шалгагдаагүй тул түвшин нь түр зэрэглэл."]);
      }

      // One job per run, replacing the last: the sheet is the source of truth
      // and a stale half of an earlier run would read as unfinished work.
      await client.query(
        "DELETE FROM staging.import_jobs WHERE import_type = $1", [IMPORT_TYPE]);
      if (parked.length) {
        const jobId = randomUUID();
        await client.query(`
          INSERT INTO staging.import_jobs
            (id, import_type, original_filename, status, total_rows, valid_rows, invalid_rows, summary)
          VALUES ($1::uuid, $2, $3, 'READY', $4, $5, $6, $7::jsonb)`,
          [jobId, IMPORT_TYPE, "cefr-student-matches.csv", body.length, ready.length, parked.length,
           JSON.stringify({
             note: "Сурагч нь тогтоогдоогүй CEFR-ийн үр дүн. Хасаагүй, энд хадгалав.",
             sheet: "local-data/generated/cefr-student-matches.csv",
             howToResolve: "STUDENT_CODE баганыг бөглөөд import-cefr-results-ийг дахин ажиллуулна.",
           })]);
        for (const entry of parked) {
          await client.query(`
            INSERT INTO staging.import_rows
              (import_job_id, sheet_name, row_number, row_data, validation_status, validation_errors)
            VALUES ($1::uuid, 'cefrResults', $2, $3::jsonb, 'INVALID', $4::jsonb)`,
            [jobId, entry.rowNumber, JSON.stringify(entry.data),
             JSON.stringify([{ field: "STUDENT_CODE", message: entry.reason }])]);
        }
      }

      await client.query("COMMIT");

      const { rows: [count] } = await client.query<Record<string, string>>(`
        SELECT (SELECT count(*)::text FROM assessment.placement_attempts) AS attempts,
               (SELECT count(DISTINCT student_id)::text FROM assessment.placement_attempts) AS students,
               (SELECT count(*)::text FROM staging.import_rows) AS parked`);
      console.log(`\nWritten. placement_attempts: ${count.attempts} for ${count.students} students.`
        + ` Parked in staging: ${count.parked}.`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
} finally {
  client.release();
  await pool.end();
}
