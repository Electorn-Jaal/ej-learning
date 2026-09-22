/**
 * Links every class to the subjects it studies, and grade 6 to its textbooks.
 *
 * Dry-run (default): pnpm --filter @workspace/api-server link-class-subjects
 * Apply:             pnpm --filter @workspace/api-server link-class-subjects -- --apply --yes
 *
 * Two kinds of row come out of this, and they are not equally trustworthy:
 *
 *   ROSTER     - grade 6. The school supplied eleven grade-6 textbooks, so the
 *                subject list is not a guess: it is read off the books that
 *                were actually delivered, and each row carries its book.
 *   CURRICULUM - every other grade. No document the school gave us says what
 *                1a or 11a studies, so this is the national subject list for
 *                the grade, written down so those classes stop rendering an
 *                empty page. No book is attached, because none was supplied.
 *                These are the rows a school is expected to correct.
 *
 * That distinction is the whole point of class_subjects.origin. Grade 6 is a
 * fact; the rest is a plausible default standing in for one, and a screen that
 * cannot tell them apart will present both with the same confidence.
 *
 * Re-running is safe: rows are upserted on (class_id, subject_id) and a
 * CURRICULUM pass never blanks a book that is already attached.
 */
import { pool } from "@workspace/db";

const apply = process.argv.includes("--apply");
if (apply && !process.argv.includes("--yes")) throw new Error("Refusing apply without --yes.");

/**
 * The national subject list by grade, restricted to subjects this database
 * actually holds. The grade 1-2 lists are short by construction rather than by
 * omission: primary "Хүн ба орчин" has no core.subjects row at all, so there is
 * nothing here to point at.
 */
const curriculumByGrade: Record<number, string[]> = {
  1: ["MGL", "MATH", "ART", "DTECH"],
  2: ["MGL", "MATH", "ART", "DTECH"],
  3: ["MGL", "MATH", "SCI", "ART", "DTECH", "ENG"],
  4: ["MGL", "MATH", "SCI", "ART", "DTECH", "ENG"],
  5: ["MGL", "MATH", "SCI", "ART", "DTECH", "ENG"],
  6: ["MGL", "LIT", "MATH", "SCI", "HIST", "ETHICS", "ICT", "ART", "DTECH", "SCRIPT", "ENG"],
  7: ["MGL", "LIT", "MATH", "SCI", "HIST", "ETHICS", "ICT", "ART", "DTECH", "SCRIPT", "ENG"],
  8: ["MGL", "LIT", "MATH", "SCI", "HIST", "ETHICS", "ICT", "ART", "DTECH", "SCRIPT", "ENG"],
  9: ["MGL", "LIT", "MATH", "SCI", "HIST", "ETHICS", "ICT", "ART", "DTECH", "SCRIPT", "ENG"],
  10: ["MGL", "LIT", "MATH", "SCI", "HIST", "ETHICS", "ICT", "SCRIPT", "ENG"],
  11: ["MGL", "LIT", "MATH", "SCI", "HIST", "ETHICS", "ICT", "SCRIPT", "ENG"],
  12: ["MGL", "LIT", "MATH", "SCI", "HIST", "ETHICS", "ICT", "SCRIPT", "ENG"],
};

/**
 * The grade-6 core book per subject, by source_code.
 *
 * SCI is the one subject with a choice to make: the school supplied both the
 * Mongolian Байгалийн ухаан VI and Oxford International Primary Science 6. The
 * Mongolian book is the core one every child works from; the Oxford book stays
 * in the library as supplementary material and is deliberately absent here.
 * ENG has no entry because no English textbook was supplied - the subject
 * still gets a row, with no book.
 */
const grade6Books: Record<string, string> = {
  MGL: "G06-MGL-MN",
  LIT: "G06-LIT-MN",
  MATH: "G06-MATH-MN",
  SCI: "G06-SCI-MN",
  HIST: "G06-HIST-MN",
  ETHICS: "G06-ETHICS-MN",
  ICT: "G06-ICT-MN",
  ART: "G06-ART-MN",
  DTECH: "G06-DTECH-MN",
  SCRIPT: "G06-SCRIPT-MN",
};

type ClassRow = { id: string; class_code: string; name_mn: string; grade_number: number };
type SubjectRow = { id: string; code: string };
type MaterialRow = { id: string; source_code: string; subject_code: string };
type Planned = {
  classId: string; classCode: string; subjectId: string; subjectCode: string;
  materialId: string | null; sourceCode: string | null; origin: "ROSTER" | "CURRICULUM";
};

const client = await pool.connect();
try {
  const dbName = (await client.query<{ current_database: string }>(
    "SELECT current_database()")).rows[0].current_database;
  if (!dbName.startsWith("ej_learning_local") && !dbName.startsWith("ej_learning_test")) {
    throw new Error(`Refusing database ${dbName}.`);
  }

  const classes = (await client.query<ClassRow>(`
    SELECT c.id, c.class_code, c.name_mn, g.grade_number
    FROM core.classes c JOIN core.grade_levels g ON g.id = c.grade_level_id
    WHERE c.is_active ORDER BY g.grade_number, c.class_code`)).rows;

  const subjects = new Map((await client.query<SubjectRow>(
    "SELECT id, code FROM core.subjects WHERE is_active")).rows.map((r) => [r.code, r.id]));

  const materials = new Map((await client.query<MaterialRow>(`
    SELECT m.id, m.source_code, s.code AS subject_code
    FROM content.source_materials m JOIN core.subjects s ON s.id = m.subject_id`))
    .rows.map((r) => [r.source_code, r]));

  // A book filed under a different subject than the row it would sit on is a
  // data error that would quietly show a whole class the wrong textbook.
  for (const [subjectCode, sourceCode] of Object.entries(grade6Books)) {
    const material = materials.get(sourceCode);
    if (!material) throw new Error(`Missing book ${sourceCode} for ${subjectCode}.`);
    if (material.subject_code !== subjectCode) {
      throw new Error(`Book ${sourceCode} is filed under ${material.subject_code}, not ${subjectCode}.`);
    }
  }

  const planned: Planned[] = [];
  const unknownSubjects = new Set<string>();

  for (const klass of classes) {
    const codes = curriculumByGrade[klass.grade_number] ?? [];
    for (const code of codes) {
      const subjectId = subjects.get(code);
      if (!subjectId) { unknownSubjects.add(code); continue; }
      const sourceCode = klass.grade_number === 6 ? grade6Books[code] ?? null : null;
      const material = sourceCode ? materials.get(sourceCode) : undefined;
      planned.push({
        classId: klass.id, classCode: klass.class_code, subjectId, subjectCode: code,
        materialId: material ? material.id : null,
        sourceCode,
        origin: klass.grade_number === 6 ? "ROSTER" : "CURRICULUM",
      });
    }
  }

  console.log(JSON.stringify({
    database: dbName,
    mode: apply ? "APPLY" : "DRY_RUN",
    classes: classes.length,
    rows: planned.length,
    withBook: planned.filter((p) => p.materialId).length,
    byOrigin: {
      ROSTER: planned.filter((p) => p.origin === "ROSTER").length,
      CURRICULUM: planned.filter((p) => p.origin === "CURRICULUM").length,
    },
    subjectsNotInDatabase: [...unknownSubjects],
    grade6: planned.filter((p) => p.origin === "ROSTER")
      .map((p) => `${p.classCode} ${p.subjectCode} -> ${p.sourceCode ?? "(no book)"}`),
  }, null, 2));

  if (!apply) {
    console.log("\nDry run. Re-run with --apply --yes to write.");
  } else {
    await client.query("BEGIN");
    try {
      for (const row of planned) {
        await client.query(`
          INSERT INTO core.class_subjects (class_id, subject_id, source_material_id, origin, is_active)
          VALUES ($1::bigint, $2::bigint, $3::bigint, $4, true)
          ON CONFLICT (class_id, subject_id) DO UPDATE SET
            source_material_id = COALESCE(EXCLUDED.source_material_id, core.class_subjects.source_material_id),
            origin = CASE WHEN EXCLUDED.origin = 'ROSTER' THEN 'ROSTER' ELSE core.class_subjects.origin END,
            is_active = true,
            updated_at = now()`,
          [row.classId, row.subjectId, row.materialId, row.origin]);
      }
      await client.query("COMMIT");
      const { rows } = await client.query<{ n: string; with_book: string }>(
        "SELECT count(*)::text AS n, count(source_material_id)::text AS with_book FROM core.class_subjects");
      console.log(`\nWritten. class_subjects rows: ${rows[0].n}, with a core book: ${rows[0].with_book}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
} finally {
  client.release();
  await pool.end();
}
