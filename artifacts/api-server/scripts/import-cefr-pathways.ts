/**
 * Loads what a child studies next at each CEFR level.
 *
 * Dry-run (default): pnpm --filter @workspace/api-server import-cefr-pathways
 * Apply:             pnpm --filter @workspace/api-server import-cefr-pathways -- --apply --yes
 *
 * The placement test produces a level. On its own that is a label. This is the
 * sheet that turns it into work: for each of the six CEFR levels and each of
 * six skills, which book, which unit, what the task is, and how a teacher
 * confirms it was done. Thirty-six rows, and the school wrote every one.
 *
 * It is imported as a rule rather than as a plan per child. A child's plan is
 * their current level read through this table, which means a child who moves
 * from A2 to B1 gets the B1 plan the moment their level changes, and nobody
 * maintains 247 copies of the same six rows.
 *
 * The writing and speaking rows name CEFR task codes rather than a book -
 * "CEFR-065 / CEFR-066" - and those are real questions on the placement paper,
 * imported by import-cefr-placement. The chain closes: a level points at a
 * task, and the task exists.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pool } from "@workspace/db";

const apply = process.argv.includes("--apply");
if (apply && !process.argv.includes("--yes")) throw new Error("Refusing apply without --yes.");

const EXTRACT = resolve(process.cwd(), "../../local-data/extracted/cefr-extract.json");

/** The same words the questions use, so a plan and a paper read as one thing. */
const DOMAIN_MN: Record<string, string> = {
  Grammar: "Дүрэм",
  Vocabulary: "Үгийн сан",
  Reading: "Унших",
  Listening: "Сонсох",
  Writing: "Бичих",
  Speaking: "Ярих",
};

/** Reading order within a level: receptive first, then what the child produces. */
const ORDER = ["Grammar", "Vocabulary", "Reading", "Listening", "Writing", "Speaking"];

const PRIORITY = new Set(["FOUNDATION", "DEVELOP", "EXTEND", "HIGH PRIORITY IF GAP"]);

type Row = {
  CEFR: string; Skill: string; "Book / Source": string;
  "Unit / Focus": string | null; Pages: string | null; Task: string;
  "Priority Use": string; Verification: string | null;
};

const extract = JSON.parse(readFileSync(EXTRACT, "utf8")) as { resourceMap: Row[] };
const rows = extract.resourceMap;

const text = (value: string | null | undefined) => {
  const trimmed = String(value ?? "").trim();
  return trimmed === "" ? null : trimmed;
};

const badDomain = rows.filter((row) => !DOMAIN_MN[row.Skill]);
const badPriority = rows.filter((row) => !PRIORITY.has(String(row["Priority Use"] ?? "").trim()));
const missingTask = rows.filter((row) => !text(row.Task));

console.log(JSON.stringify({
  rows: rows.length,
  levels: [...new Set(rows.map((row) => row.CEFR))].sort(),
  skills: [...new Set(rows.map((row) => row.Skill))],
  byPriority: rows.reduce<Record<string, number>>(
    (acc, row) => ({ ...acc, [row["Priority Use"]]: (acc[row["Priority Use"]] ?? 0) + 1 }), {}),
  // The rows whose "book" is a pair of questions on the placement paper.
  pointingAtCefrTasks: rows.filter((row) => row["Book / Source"].startsWith("CEFR-")).length,
  withoutPages: rows.filter((row) => !text(row.Pages)).length,
  unknownSkills: badDomain.map((row) => row.Skill),
  unknownPriorities: badPriority.map((row) => row["Priority Use"]),
  rowsWithNoTask: missingTask.length,
}, null, 2));

if (badDomain.length || badPriority.length || missingTask.length) {
  throw new Error("Refusing to import: the sheet has rows this script cannot read.");
}

const client = await pool.connect();
try {
  const { rows: levels } = await client.query<{ id: string; code: string }>(
    "SELECT id::text AS id, code FROM content.proficiency_levels WHERE framework = 'CEFR'");
  const levelId = new Map(levels.map((level) => [level.code, level.id]));

  const unknownLevels = [...new Set(rows.map((row) => row.CEFR))].filter(
    (code) => !levelId.has(code));
  if (unknownLevels.length) {
    throw new Error(
      `content.proficiency_levels has no CEFR row for ${unknownLevels.join(", ")}.`
      + " Run import-cefr-placement first.");
  }

  // A level with fewer than six rows would render a plan with a hole in it,
  // and a hole reads as "this skill needs nothing" rather than as missing data.
  const perLevel = new Map<string, number>();
  for (const row of rows) perLevel.set(row.CEFR, (perLevel.get(row.CEFR) ?? 0) + 1);
  const thin = [...perLevel].filter(([, count]) => count !== ORDER.length);
  if (thin.length) {
    throw new Error(
      `Every level needs one row per skill. Short: ${thin.map(([code, count]) => `${code}=${count}`).join(", ")}.`);
  }

  if (!apply) {
    console.log("\nDry run. Re-run with --apply --yes to write.");
  } else {
    await client.query("BEGIN");
    try {
      for (const row of rows) {
        await client.query(`
          INSERT INTO content.placement_pathways
            (proficiency_level_id, domain_mn, sequence_no, source_label,
             unit_focus_mn, pages_mn, task_mn, priority, verification_mn)
          VALUES ($1::smallint, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (proficiency_level_id, domain_mn) DO UPDATE SET
            sequence_no = EXCLUDED.sequence_no,
            source_label = EXCLUDED.source_label,
            unit_focus_mn = EXCLUDED.unit_focus_mn,
            pages_mn = EXCLUDED.pages_mn,
            task_mn = EXCLUDED.task_mn,
            priority = EXCLUDED.priority,
            verification_mn = EXCLUDED.verification_mn`,
          [levelId.get(row.CEFR), DOMAIN_MN[row.Skill], ORDER.indexOf(row.Skill) + 1,
           row["Book / Source"].trim(), text(row["Unit / Focus"]), text(row.Pages),
           text(row.Task), String(row["Priority Use"]).trim(), text(row.Verification)]);
      }
      await client.query("COMMIT");

      const { rows: summary } = await client.query<{ code: string; steps: string; books: string }>(`
        SELECT p.code, count(*)::text AS steps,
               count(DISTINCT w.source_label)::text AS books
        FROM content.placement_pathways w
        JOIN content.proficiency_levels p ON p.id = w.proficiency_level_id
        GROUP BY p.code, p.sequence ORDER BY p.sequence`);
      console.log("\nWritten.");
      for (const level of summary) {
        console.log(`  ${level.code.padEnd(7)} ${level.steps} алхам, ${level.books} эх сурвалж`);
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
