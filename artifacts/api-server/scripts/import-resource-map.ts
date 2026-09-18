/**
 * Turns the workbook's Resource Map into lessons, then assigns them.
 *
 *   node scripts/run-ts.mjs scripts/import-resource-map.ts --yes [--assign]
 *
 * The map is 6 CEFR levels x 6 skills. Each cell names a book, a unit focus, a
 * page hint and a task, which is exactly a lesson: one content.skills row per
 * cell, one learning.daily_lessons row teaching it.
 *
 * With --assign it also lays those lessons out for every placed student. That
 * is per student, not per class, because a class here holds students from
 * PRE-A1 to C2 - the whole point of placing them. class_schedule stays for
 * subjects where a class does work through one book together.
 *
 * Idempotent: everything it writes carries an ENG- prefix and is cleared first.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { and, eq, like, sql } from "drizzle-orm";
import {
  dailyLessonsInLearning,
  db,
  pool,
  proficiencyLevelsInContent,
  skillsInContent,
  sourceMaterialsInContent,
  studentAssignmentsInLearning,
  studentsInCore,
  subjectsInCore,
} from "@workspace/db";

if (!process.argv.includes("--yes")) {
  console.error("Refusing to run without --yes.");
  process.exit(1);
}
const assign = process.argv.includes("--assign");

const repoRoot = path.resolve(process.cwd(), "../..");
const extract = JSON.parse(
  await readFile(path.join(repoRoot, "local-data/extracted/cefr-extract.json"), "utf8"),
) as { resourceMap: Record<string, string | null>[] };

const SKILL_MN: Record<string, string> = {
  Grammar: "Хэл зүй",
  Vocabulary: "Үгийн сан",
  Reading: "Унших",
  Listening: "Сонсох",
  Writing: "Бичих",
  Speaking: "Ярих",
};

const slug = (value: string) => value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "");

/** "CEFR-061 / CEFR-062" is a pair of productive tasks, not a book. */
const isBook = (source: string | null) =>
  Boolean(source && !/^CEFR-\d+/.test(source.trim()));

const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ulaanbaatar" }).format(new Date());
const shiftDays = (iso: string, days: number) => {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

try {
  const [{ database }] = (await db.execute(sql`SELECT current_database() AS database`))
    .rows as { database: string }[];
  if (database !== "ej_learning_dev") {
    console.error(`Connected to "${database}". No change.`);
    process.exit(1);
  }

  const [english] = await db
    .select({ id: subjectsInCore.id })
    .from(subjectsInCore)
    .where(eq(subjectsInCore.code, "ENG"))
    .limit(1);
  if (!english) {
    console.error('No subject "ENG". Run import-cefr first.');
    process.exit(1);
  }

  const levels = new Map(
    (
      await db
        .select({ id: proficiencyLevelsInContent.id, code: proficiencyLevelsInContent.code })
        .from(proficiencyLevelsInContent)
        .where(eq(proficiencyLevelsInContent.framework, "CEFR"))
    ).map((row) => [row.code, row.id]),
  );

  await db.delete(studentAssignmentsInLearning);
  await db.delete(dailyLessonsInLearning).where(like(dailyLessonsInLearning.lessonCode, "ENG-%"));
  await db.delete(skillsInContent).where(like(skillsInContent.skillCode, "ENG-%"));
  await db.delete(sourceMaterialsInContent).where(like(sourceMaterialsInContent.sourceCode, "ENG-SRC-%"));

  const summary = await db.transaction(async (tx) => {
    const materials = new Map<string, number>();
    for (const row of extract.resourceMap) {
      const source = row["Book / Source"];
      if (!isBook(source)) continue;
      const code = `ENG-SRC-${slug(source!).slice(0, 80)}`;
      if (materials.has(code)) continue;
      const [material] = await tx
        .insert(sourceMaterialsInContent)
        .values({
          sourceCode: code,
          subjectId: english.id,
          title: source!.slice(0, 500),
          materialType: /bank$/i.test(source!.trim()) ? "RESOURCE_BANK" : "TEXTBOOK",
          status: "APPROVED",
          dataQualityStatus: "COMPLETE",
          notes: "From the placement workbook's Resource Map.",
        })
        .returning({ id: sourceMaterialsInContent.id });
      materials.set(code, material.id);
    }

    let skills = 0;
    let lessons = 0;
    const lessonByLevel = new Map<string, number[]>();

    for (const row of extract.resourceMap) {
      const level = (row["CEFR"] ?? "").trim().toUpperCase();
      const skill = (row["Skill"] ?? "").trim();
      const levelId = levels.get(level);
      if (!levelId || !skill) continue;

      const skillCode = `ENG-${level}-${slug(skill)}`;
      const [skillRow] = await tx
        .insert(skillsInContent)
        .values({
          skillCode,
          subjectId: english.id,
          proficiencyLevelId: levelId,
          nameMn: `${SKILL_MN[skill] ?? skill} — ${level}`,
          descriptionMn: row["Unit / Focus"],
          learningOutcomeMn: row["Task"],
          status: "APPROVED",
          dataQualityStatus: "COMPLETE",
        })
        .returning({ id: skillsInContent.id });
      skills += 1;

      const source = row["Book / Source"];
      const materialId = isBook(source)
        ? (materials.get(`ENG-SRC-${slug(source!).slice(0, 80)}`) ?? null)
        : null;

      const [lesson] = await tx
        .insert(dailyLessonsInLearning)
        .values({
          lessonCode: `ENG-LSN-${level}-${slug(skill)}`,
          coreSkillId: skillRow.id,
          lessonType: "CORE",
          learningGoalMn: row["Unit / Focus"],
          // The book cell names the resource; the pages cell is a hint like
          // "Unit 1 pp.6-7", not a range, so it is kept as written.
          rememberMn: source ? `Эх сурвалж: ${source}` : null,
          guidedPracticeMn: row["Pages"] ? `Хуудас: ${row["Pages"]}` : null,
          independentPracticeMn: row["Task"],
          studentMessageMn: `${level} түвшний ${SKILL_MN[skill] ?? skill}. ${row["Priority Use"] ?? ""}`.trim(),
          estimatedMinutes: 40,
          printReady: false,
          webReady: true,
          sourceMaterialId: materialId,
          status: "APPROVED",
        })
        .returning({ id: dailyLessonsInLearning.id });
      lessons += 1;

      const bucket = lessonByLevel.get(level) ?? [];
      bucket.push(lesson.id);
      lessonByLevel.set(level, bucket);
    }

    if (!assign) return { materials: materials.size, skills, lessons, assignments: 0, placed: 0 };

    // Each placed student gets their own level's lessons across the next school
    // days. PRE-A1 has no resource rows of its own, so those students start at
    // A1 rather than receiving nothing.
    const placed = (
      await db.execute(sql`
        SELECT DISTINCT ON (a.student_id)
          a.student_id::int AS "studentId", p.code AS level
        FROM assessment.placement_attempts a
        JOIN content.proficiency_levels p ON p.id = a.proficiency_level_id
        ORDER BY a.student_id, a.id DESC`)
    ).rows as { studentId: number; level: string }[];

    let assignments = 0;
    for (const student of placed) {
      const bucket = lessonByLevel.get(student.level) ?? lessonByLevel.get("A1") ?? [];
      if (bucket.length === 0) continue;
      for (const [index, offset] of [0, 1, 2, 3, 4].entries()) {
        await tx
          .insert(studentAssignmentsInLearning)
          .values({
            studentId: student.studentId,
            dailyLessonId: bucket[index % bucket.length],
            assignedOn: shiftDays(today, offset),
            source: "AUTO",
            reason: `Байршуулалтын түвшин ${student.level}`,
          })
          .onConflictDoNothing();
        assignments += 1;
      }
    }

    return { materials: materials.size, skills, lessons, assignments, placed: placed.length };
  });

  console.log("Imported:", JSON.stringify(summary, null, 2));
} catch (error) {
  const cause = (error as { cause?: { message?: string; detail?: string } }).cause;
  console.error(`Failed: ${error instanceof Error ? error.message : String(error)}`);
  if (cause?.message) console.error(`  ${cause.message}`);
  if (cause?.detail) console.error(`  ${cause.detail}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
