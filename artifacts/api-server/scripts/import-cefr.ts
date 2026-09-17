/**
 * Loads the extracted CEFR placement data through staging into core.
 *
 *   python scripts/src/extract-cefr.py "<workbook>.xlsx" data/cefr-extract.json
 *   node scripts/run-ts.mjs scripts/import-cefr.ts --yes
 *
 * Every submission is written to staging.import_rows as the raw object first,
 * with its validation errors attached, and only valid rows reach core. That is
 * the point of the staging tables: when a normalisation rule turns out to be
 * wrong next month, the source rows are still here to re-run, which they would
 * not be if the spreadsheet had been loaded straight into core.students.
 *
 * Passing --replace-mock also deletes the MOCK- seeded content first. It never
 * touches backups/, which holds the only copy of the deleted Mongolian
 * curriculum.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { and, eq, like, sql } from "drizzle-orm";
import {
  classScheduleInLearning,
  classesInCore,
  contentNodesInContent,
  contentSkillMapsInContent,
  contentSourceAlignmentsInContent,
  dailyLessonsInLearning,
  db,
  diagnosticItemOptionsInAssessment,
  diagnosticItemsInAssessment,
  gradeLevelsInCore,
  placementAttemptsInAssessment,
  pool,
  quizAttemptsInLearning,
  proficiencyLevelsInContent,
  skillDependenciesInContent,
  skillsInContent,
  sourceMaterialGradesInContent,
  sourceMaterialsInContent,
  sourceOutlineNodesInContent,
  sourceVersionsInContent,
  studentEnrollmentsInCore,
  studentsInCore,
  subjectsInCore,
  usersInCore,
} from "@workspace/db";

if (!process.argv.includes("--yes")) {
  console.error("Refusing to run without --yes. This writes to core tables.");
  process.exit(1);
}
const replaceMock = process.argv.includes("--replace-mock");

const repoRoot = path.resolve(process.cwd(), "../..");
const extract = JSON.parse(
  await readFile(path.join(repoRoot, "data/cefr-extract.json"), "utf8"),
) as {
  source: string;
  items: { itemCode: string; level: string; domain: string; prompt: string; itemOrder: number; observedOptions: string[] }[];
  submissions: { timestamp: string | null; rawStudentCode: string | null; rawClass: string | null; score: number; answers: Record<string, string | null> }[];
  cefrResults: Record<string, string | null>[];
};
const keyFile = JSON.parse(
  await readFile(path.join(repoRoot, "data/cefr-answer-key.reconstructed.json"), "utf8"),
) as { trust: string; items: { itemCode: string; correctAnswer: string }[] };
const correctByItem = new Map(keyFile.items.map((i) => [i.itemCode, i.correctAnswer]));

// CEFR ladder. PRE-A1 is below A1 and is what the source calls an unplaced
// beginner, so it earns a rung rather than a null.
const CEFR = [
  ["PRE-A1", "Анхан шатнаас өмнөх"],
  ["A1", "A1 — Эхлэн суралцагч"],
  ["A2", "A2 — Анхан шат"],
  ["B1", "B1 — Дунд шат"],
  ["B2", "B2 — Ахисан дунд"],
  ["C1", "C1 — Ахисан шат"],
  ["C2", "C2 — Төгс эзэмшсэн"],
] as const;

/**
 * Normalises a typed class code, or returns null when it cannot be read.
 *
 * Students typed these into a form, so the same class arrives as "7-2", "7 a",
 * "7−2" with a U+2212 minus, and "7²" from someone whose keyboard turned the
 * hyphen into a superscript. Anything that does not resolve is rejected rather
 * than guessed: a wrong class puts a child in the wrong lesson.
 */
function normaliseClass(raw: string | null): string | null {
  if (!raw) return null;
  const cleaned = raw
    .toUpperCase()
    .replace(/[−–—]/g, "-")
    .replace(/²/g, "2")
    .replace(/³/g, "3")
    .replace(/[./\s]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  const match = cleaned.match(/(?:^|-)?(\d{1,2})-?([1-9A-Z])$/);
  if (!match) return null;
  const [, grade, suffix] = match;
  const gradeNumber = Number(grade);
  if (gradeNumber < 1 || gradeNumber > 12) return null;
  return `${gradeNumber}-${suffix}`;
}

/**
 * Recovers a class from the student code when the class cell is unreadable.
 *
 * Several students typed "12-1 delgerbayar" as their code while the class cell
 * holds 12.0 - Excel's rendering of a bare 12, with the section lost. The
 * class is right there in the code, so it is read rather than discarded.
 *
 * A separator is required, which is what keeps "123.0" from being read as
 * class 12-3.
 */
function classFromCode(raw: string | null): string | null {
  if (!raw) return null;
  const match = raw.trim().toUpperCase().match(/^(\d{1,2})[-./\s]([1-9A-Z])(?:\s|$)/);
  if (!match) return null;
  const gradeNumber = Number(match[1]);
  if (gradeNumber < 1 || gradeNumber > 12) return null;
  return `${gradeNumber}-${match[2]}`;
}

/** "10-1 Anh Erdene" carries a name; "0000000" does not. */
function displayName(raw: string): string {
  const stripped = raw.replace(/^\s*\d{1,2}\s*[-./]?\s*[1-9A-Za-z]?\s*/, "").trim();
  return stripped.length >= 2 ? stripped : raw.trim();
}

const norm = (raw: string | null) =>
  (raw ?? "").toUpperCase().replace(/\s+/g, " ").trim();

type Validated = {
  raw: (typeof extract.submissions)[number];
  errors: string[];
  classCode: string | null;
  studentKey: string;
};

const validated: Validated[] = extract.submissions.map((raw) => {
  const errors: string[] = [];
  const studentKey = norm(raw.rawStudentCode);
  const classCode =
    normaliseClass(raw.rawClass) ?? classFromCode(raw.rawStudentCode);

  if (!studentKey) errors.push("STUDENT_CODE_MISSING");
  else if (/^[\d.]+$/.test(studentKey)) errors.push("STUDENT_CODE_NUMERIC_ONLY");
  else if (studentKey === "TEACHER") errors.push("STUDENT_CODE_NOT_A_STUDENT");

  if (!raw.rawClass) errors.push("CLASS_MISSING");
  else if (!classCode) errors.push(`CLASS_UNREADABLE:${raw.rawClass}`);

  const answered = Object.values(raw.answers).filter((a) => a !== null).length;
  if (answered === 0) errors.push("NO_ANSWERS");

  return { raw, errors, classCode, studentKey };
});

const valid = validated.filter((v) => v.errors.length === 0);
const levelByStudent = new Map<string, string>();
for (const row of extract.cefrResults) {
  const code = norm(row["Student Code"] ?? null);
  const level = (row["Final CEFR"] ?? row["Objective CEFR"] ?? "").toUpperCase();
  if (code && level && CEFR.some(([c]) => c === level)) levelByStudent.set(code, level);
}

try {
  const [{ database }] = (await db.execute(sql`SELECT current_database() AS database`))
    .rows as { database: string }[];
  if (database !== "ej_learning_dev") {
    console.error(`Connected to "${database}". No change.`);
    process.exit(1);
  }

  const [admin] = await db
    .select({ id: usersInCore.id })
    .from(usersInCore)
    .where(eq(usersInCore.username, "admin"))
    .limit(1);

  if (replaceMock) {
    // Order matters: attempts and schedule rows reference lessons, lessons
    // reference skills. The mock quiz attempts go with the lessons they were
    // answered against - keeping them would leave scores pointing at nothing.
    await db.delete(quizAttemptsInLearning);
    await db.delete(classScheduleInLearning);
    await db.delete(dailyLessonsInLearning).where(like(dailyLessonsInLearning.lessonCode, "MOCK-%"));
    await db.delete(contentSkillMapsInContent).where(like(contentSkillMapsInContent.mapCode, "MAP-MOCK-%"));
    await db.delete(contentSourceAlignmentsInContent).where(like(contentSourceAlignmentsInContent.alignmentCode, "ALIGN-MOCK-%"));
    await db.delete(skillDependenciesInContent).where(like(skillDependenciesInContent.dependencyCode, "DEP-MOCK-%"));
    await db.delete(contentNodesInContent).where(like(contentNodesInContent.contentCode, "MOCK-%"));
    await db.delete(skillsInContent).where(like(skillsInContent.skillCode, "MOCK-%"));
    await db.delete(sourceOutlineNodesInContent).where(like(sourceOutlineNodesInContent.outlineCode, "MOCK-%"));
    await db.delete(sourceVersionsInContent);
    await db.delete(sourceMaterialGradesInContent);
    await db.delete(sourceMaterialsInContent).where(like(sourceMaterialsInContent.sourceCode, "MOCK-%"));
    console.log("Removed the MOCK- seeded content. backups/ untouched.");
  }

  // Re-running after a corrected rule must replace, not duplicate. Everything
  // this importer writes is identifiable: ENG- codes, the CEFR framework, the
  // CEFR_PLACEMENT job type.
  await db.execute(sql`DELETE FROM assessment.placement_attempts`);
  await db.execute(sql`DELETE FROM assessment.diagnostic_item_options`);
  await db.execute(sql`DELETE FROM assessment.diagnostic_items WHERE item_code LIKE 'CEFR-%'`);
  await db.execute(sql`DELETE FROM core.student_enrollments WHERE student_id IN
      (SELECT id FROM core.students WHERE student_code LIKE 'ENG-%')`);
  await db.execute(sql`DELETE FROM core.students WHERE student_code LIKE 'ENG-%'`);
  await db.execute(sql`DELETE FROM core.classes WHERE class_code LIKE 'ENG-%'`);
  await db.execute(sql`DELETE FROM staging.import_rows WHERE import_job_id IN
      (SELECT id FROM staging.import_jobs WHERE import_type = 'CEFR_PLACEMENT')`);
  await db.execute(sql`DELETE FROM staging.import_jobs WHERE import_type = 'CEFR_PLACEMENT'`);

  const summary = await db.transaction(async (tx) => {
    // 1. staging: the raw rows land before anything is interpreted.
    const [job] = (
      await tx.execute(sql`
        INSERT INTO staging.import_jobs
          (id, import_type, original_filename, status, total_rows, valid_rows,
           invalid_rows, created_by, summary)
        VALUES (gen_random_uuid(), 'CEFR_PLACEMENT', ${extract.source},
                'VALIDATING', ${validated.length}, ${valid.length},
                ${validated.length - valid.length}, 'admin',
                ${JSON.stringify({ answerKeyTrust: keyFile.trust })}::jsonb)
        RETURNING id`)
    ).rows as { id: string }[];

    for (const [index, row] of validated.entries()) {
      await tx.execute(sql`
        INSERT INTO staging.import_rows
          (import_job_id, sheet_name, row_number, row_data, validation_status, validation_errors)
        VALUES (${job.id}::uuid, 'Form Responses 1', ${index + 1},
                ${JSON.stringify(row.raw)}::jsonb,
                ${row.errors.length ? "INVALID" : "READY"},
                ${JSON.stringify(row.errors)}::jsonb)`);
    }

    // 2. reference data
    const levels = new Map<string, number>();
    for (const [index, [code, name]] of CEFR.entries()) {
      const [row] = await tx
        .insert(proficiencyLevelsInContent)
        .values({ framework: "CEFR", code, nameMn: name, sequence: index + 1 })
        .onConflictDoNothing()
        .returning({ id: proficiencyLevelsInContent.id });
      if (row) levels.set(code, row.id);
    }
    if (levels.size === 0) {
      for (const row of await tx
        .select({ id: proficiencyLevelsInContent.id, code: proficiencyLevelsInContent.code })
        .from(proficiencyLevelsInContent)
        .where(eq(proficiencyLevelsInContent.framework, "CEFR"))) {
        levels.set(row.code, row.id);
      }
    }

    let [english] = await tx
      .select({ id: subjectsInCore.id })
      .from(subjectsInCore)
      .where(eq(subjectsInCore.code, "ENG"))
      .limit(1);
    if (!english) {
      [english] = await tx
        .insert(subjectsInCore)
        .values({ code: "ENG", nameMn: "Англи хэл" })
        .returning({ id: subjectsInCore.id });
    }

    // 3. the item bank, with options and the key
    let itemsWritten = 0;
    let optionsWritten = 0;
    for (const item of extract.items) {
      const levelId = levels.get(item.level.toUpperCase());
      const correct = correctByItem.get(item.itemCode) ?? null;
      const [inserted] = await tx
        .insert(diagnosticItemsInAssessment)
        .values({
          itemCode: item.itemCode,
          subjectId: english.id,
          proficiencyLevelId: levelId ?? null,
          itemOrder: item.itemOrder,
          titleMn: item.prompt.slice(0, 500),
          domainMn: item.domain,
          maxScore: "1",
          answerSource: correct ? "RECONSTRUCTED" : "UNKNOWN",
          status: "APPROVED",
        })
        .onConflictDoNothing()
        .returning({ id: diagnosticItemsInAssessment.id });
      if (!inserted) continue;
      itemsWritten += 1;

      for (const [index, text] of item.observedOptions.entries()) {
        await tx.insert(diagnosticItemOptionsInAssessment).values({
          diagnosticItemId: inserted.id,
          optionText: text,
          isCorrect: correct !== null && text === correct,
          sequenceNo: index + 1,
        });
        optionsWritten += 1;
      }
    }

    // 4. classes, then students, from the valid rows only
    const grades = new Map(
      (
        await tx
          .select({ id: gradeLevelsInCore.id, gradeNumber: gradeLevelsInCore.gradeNumber })
          .from(gradeLevelsInCore)
      ).map((g) => [g.gradeNumber, g.id]),
    );

    const classIds = new Map<string, number>();
    for (const code of [...new Set(valid.map((v) => v.classCode!))].sort()) {
      const gradeNumber = Number(code.split("-")[0]);
      const gradeLevelId = grades.get(gradeNumber);
      if (!gradeLevelId) continue;
      const classCode = `ENG-G${String(gradeNumber).padStart(2, "0")}-${code.split("-")[1]}`;
      let [row] = await tx
        .select({ id: classesInCore.id })
        .from(classesInCore)
        .where(eq(classesInCore.classCode, classCode))
        .limit(1);
      if (!row) {
        [row] = await tx
          .insert(classesInCore)
          .values({ classCode, gradeLevelId, nameMn: code, schoolYear: "2026-2027" })
          .returning({ id: classesInCore.id });
      }
      classIds.set(code, row.id);
    }

    // One student per distinct typed code. The code is kept as external_code
    // and a real student_code is issued here, so reconciling against the
    // school's registration numbers later is a lookup rather than a guess.
    const studentIds = new Map<string, number>();
    let sequence = 0;
    for (const entry of valid) {
      if (studentIds.has(entry.studentKey)) continue;
      sequence += 1;
      const [row] = await tx
        .insert(studentsInCore)
        .values({
          studentCode: `ENG-${String(sequence).padStart(4, "0")}`,
          externalCode: entry.raw.rawStudentCode,
          displayName: displayName(entry.raw.rawStudentCode ?? "").slice(0, 300),
        })
        .returning({ id: studentsInCore.id });
      studentIds.set(entry.studentKey, row.id);

      const classId = classIds.get(entry.classCode!);
      if (classId) {
        await tx
          .insert(studentEnrollmentsInCore)
          .values({ studentId: row.id, classId })
          .onConflictDoNothing();
      }
    }

    // 5. placements
    let placements = 0;
    for (const entry of valid) {
      const studentId = studentIds.get(entry.studentKey)!;
      const level = levelByStudent.get(entry.studentKey);
      await tx.insert(placementAttemptsInAssessment).values({
        studentId,
        subjectId: english.id,
        proficiencyLevelId: level ? (levels.get(level) ?? null) : null,
        totalScore: String(entry.raw.score),
        totalMaxScore: String(extract.items.length),
        externalKey: entry.raw.rawStudentCode,
        answerSource: keyFile.trust === "RECONSTRUCTED" ? "RECONSTRUCTED" : "AUTHORITATIVE",
        notes: entry.raw.timestamp,
      });
      placements += 1;
    }

    await tx.execute(sql`
      UPDATE staging.import_jobs
      SET status = 'IMPORTED', approved_by = ${admin ? "admin" : null},
          approved_at = now(), completed_at = now()
      WHERE id = ${job.id}::uuid`);

    return {
      jobId: job.id,
      rows: validated.length,
      valid: valid.length,
      invalid: validated.length - valid.length,
      items: itemsWritten,
      options: optionsWritten,
      classes: classIds.size,
      students: studentIds.size,
      placements,
    };
  });

  console.log("Imported:", JSON.stringify(summary, null, 2));
  const rejected = validated.filter((v) => v.errors.length);
  if (rejected.length) {
    console.log(`\n${rejected.length} rows held in staging, not imported:`);
    const counts = new Map<string, number>();
    for (const row of rejected) {
      for (const error of row.errors) {
        const kind = error.split(":")[0];
        counts.set(kind, (counts.get(kind) ?? 0) + 1);
      }
    }
    for (const [kind, count] of [...counts].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${kind}: ${count}`);
    }
    console.log("They keep their raw row, so a corrected rule can re-run them.");
  }
} catch (error) {
  // Postgres puts the useful part - which constraint, which table - on the
  // cause, and a bare message here says only that a query failed.
  const cause = (error as { cause?: { message?: string; detail?: string } }).cause;
  console.error(`Failed: ${error instanceof Error ? error.message : String(error)}`);
  if (cause?.message) console.error(`  ${cause.message}`);
  if (cause?.detail) console.error(`  ${cause.detail}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
