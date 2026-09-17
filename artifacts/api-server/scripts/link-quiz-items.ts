/**
 * Puts the quiz questions in the database and attaches them to skills.
 *
 *   node scripts/run-ts.mjs scripts/link-quiz-items.ts --yes
 *
 * Two jobs, because the two subjects arrived by different routes.
 *
 * English already has 60 imported items carrying a CEFR level and a domain,
 * but nothing tying them to a skill. The Resource Map produced exactly one
 * skill per (level, domain), so the join is deterministic: a B1 Grammar item
 * belongs to the B1 Grammar skill.
 *
 * Algebra has no items at all - its questions were written straight into the
 * frontend. They move here so the server can mark them, which the client
 * cannot be trusted to do the moment a score counts for anything.
 */
import { eq, like, sql } from "drizzle-orm";
import {
  db,
  diagnosticItemOptionsInAssessment,
  diagnosticItemsInAssessment,
  pool,
  skillsInContent,
  subjectsInCore,
} from "@workspace/db";

if (!process.argv.includes("--yes")) {
  console.error("Refusing to run without --yes.");
  process.exit(1);
}

type Written = { prompt: string; options: string[]; correct: string; explanation: string };

/** Mirrors the six algebra sections seeded from the textbook's chapter 1. */
const ALGEBRA: Record<string, Written[]> = {
  "ALG10-SK-1-1-1": [
    {
      prompt: "2ˣ > 8 тэнцэтгэл бишийн шийд аль нь вэ?",
      options: ["x > 3", "x < 3", "x > 4", "x > 8"],
      correct: "x > 3",
      explanation:
        "8 = 2³ тул 2ˣ > 2³. Суурь 2 > 1 учраас тэнцэтгэл бишийн чиглэл хадгалагдаж x > 3 болно.",
    },
    {
      prompt: "(1/3)ˣ > 1/9 тэнцэтгэл бишийн шийд аль нь вэ?",
      options: ["x > 2", "x < 2", "x > 1/9", "x < −2"],
      correct: "x < 2",
      explanation:
        "1/9 = (1/3)². Суурь 1/3 нь 0 < a < 1 тул тэнцэтгэл бишийн тэмдэг эргэж x < 2 болно.",
    },
    {
      prompt: "5ˣ⁻¹ ≤ 25 бол x ямар утга авах вэ?",
      options: ["x ≤ 2", "x ≤ 3", "x ≥ 3", "x ≤ 26"],
      correct: "x ≤ 3",
      explanation: "25 = 5² тул x − 1 ≤ 2, эндээс x ≤ 3.",
    },
  ],
  "ALG10-SK-1-1-2": [
    {
      prompt: "4ˣ − 5·2ˣ + 4 < 0 бодоход ямар орлуулга хийх вэ?",
      options: ["t = 2ˣ", "t = 4ˣ", "t = x²", "t = 5ˣ"],
      correct: "t = 2ˣ",
      explanation: "4ˣ = (2ˣ)² тул t = 2ˣ орлуулбал t² − 5t + 4 < 0 болно.",
    },
    {
      prompt: "t = 2ˣ орлуулсны дараа t-д ямар нөхцөл тавих вэ?",
      options: ["Нөхцөл шаардлагагүй", "t > 0", "t ≥ 1", "t ≠ 0"],
      correct: "t > 0",
      explanation:
        "Илтгэгч функц ямагт эерэг тул t > 0. Мартвал гажиг шийд орж ирнэ.",
    },
    {
      prompt: "4ˣ − 5·2ˣ + 4 < 0 тэнцэтгэл бишийн эцсийн шийд аль нь вэ?",
      options: ["0 < x < 2", "1 < x < 4", "x < 0 эсвэл x > 2", "0 < x < 4"],
      correct: "0 < x < 2",
      explanation: "1 < t < 4 → 2⁰ < 2ˣ < 2² → 0 < x < 2.",
    },
  ],
  "ALG10-SK-1-1-3": [
    {
      prompt: "Суурьт нь хувьсагч агуулсан тэнцэтгэл бишийг яаж бодох вэ?",
      options: [
        "Шууд илтгэгчүүдийг жишнэ",
        "a > 1 ба 0 < a < 1 гэсэн хоёр тохиолдолд хуваан бодно",
        "Зөвхөн a > 0 гэж үзнэ",
        "Хоёр талыг квадрат зэрэгт дэвшүүлнэ",
      ],
      correct: "a > 1 ба 0 < a < 1 гэсэн хоёр тохиолдолд хуваан бодно",
      explanation:
        "Суурь 1-ээс их үед чиглэл хадгалагдаж, 0-1-ийн хооронд байвал эргэнэ. Суурь нь хувьсагчаас хамаарвал хоёуланг нь шалгана.",
    },
    {
      prompt: "(x − 2)ˣ⁺¹ илэрхийлэл утгатай байх нөхцөл аль нь вэ?",
      options: ["x > 2", "x ≥ 2", "x ≠ 2", "x > −1"],
      correct: "x > 2",
      explanation: "Илтгэгч функцийн суурь эерэг байх ёстой: x − 2 > 0.",
    },
    {
      prompt: "Суурь нь яг 1 болох цэг дээр юу болох вэ?",
      options: [
        "Тэнцэтгэл биш үргэлж биелнэ",
        "Илтгэгчээс үл хамаарч утга нь 1 тул тусад нь шалгана",
        "Илэрхийлэл утгагүй болно",
        "Тэмдэг эргэнэ",
      ],
      correct: "Илтгэгчээс үл хамаарч утга нь 1 тул тусад нь шалгана",
      explanation: "1 ямар ч зэрэгт 1 хэвээр тул тэр цэгийг тусад нь шалгана.",
    },
  ],
  "ALG10-SK-1-1-4": [
    {
      prompt: "2ˣ²⁻³ˣ < 16 тэнцэтгэл бишийн шийд аль нь вэ?",
      options: ["−1 < x < 4", "x < 4", "0 < x < 3", "x < −1 эсвэл x > 4"],
      correct: "−1 < x < 4",
      explanation: "x² − 3x < 4 → (x − 4)(x + 1) < 0 → −1 < x < 4.",
    },
    {
      prompt: "|2ˣ − 3| < 1 тэнцэтгэл бишийн шийд аль нь вэ?",
      options: ["1 < x < 2", "2 < x < 4", "0 < x < 2", "x > 1"],
      correct: "1 < x < 2",
      explanation: "−1 < 2ˣ − 3 < 1 → 2 < 2ˣ < 4 → 1 < x < 2.",
    },
    {
      prompt: "3ˣ > 0 тэнцэтгэл бишийн шийд аль нь вэ?",
      options: ["x > 0", "x > 1", "Бүх бодит x", "Шийдгүй"],
      correct: "Бүх бодит x",
      explanation: "Илтгэгч функц ямагт эерэг тул бүх бодит x-д биелнэ.",
    },
  ],
  "ALG10-SK-1-2-1": [
    {
      prompt: "log₂x > 3 тэнцэтгэл бишийн шийд аль нь вэ?",
      options: ["x > 8", "x > 6", "0 < x < 8", "x > 3"],
      correct: "x > 8",
      explanation: "Суурь 2 > 1 тул x > 2³ = 8.",
    },
    {
      prompt: "log₁⁄₂x > 1 тэнцэтгэл бишийн шийд аль нь вэ?",
      options: ["x > 1/2", "0 < x < 1/2", "x < 1/2", "x > 2"],
      correct: "0 < x < 1/2",
      explanation:
        "Суурь 1-ээс бага тул тэмдэг эргэнэ: x < 1/2. Тодорхойлогдох муж x > 0-г нэмнэ.",
    },
    {
      prompt: "log₃(x − 2) илэрхийлэл утгатай байх нөхцөл аль нь вэ?",
      options: ["x ≥ 2", "x > 2", "x > 3", "x ≠ 2"],
      correct: "x > 2",
      explanation: "Логарифм дор байгаа илэрхийлэл заавал эерэг: x − 2 > 0.",
    },
  ],
  "ALG10-SK-1-2-2": [
    {
      prompt: "log₂²x − 3log₂x + 2 < 0 бодоход ямар орлуулга хийх вэ?",
      options: ["t = log₂x", "t = 2ˣ", "t = x²", "t = log₂(x²)"],
      correct: "t = log₂x",
      explanation: "t = log₂x орлуулбал t² − 3t + 2 < 0 болно.",
    },
    {
      prompt: "t = log₂x орлуулсны дараа t-д нөхцөл тавих шаардлагатай юу?",
      options: [
        "Тийм, t > 0 байх ёстой",
        "Үгүй, t бүх бодит утга авна",
        "Тийм, t ≥ 1 байх ёстой",
        "Тийм, t ≠ 0 байх ёстой",
      ],
      correct: "Үгүй, t бүх бодит утга авна",
      explanation:
        "Логарифм сөрөг ч, тэг ч утга авна — илтгэгчээс ялгаатай. Харин x > 0 нөхцөл хэвээр.",
    },
    {
      prompt: "log₂²x − 3log₂x + 2 < 0 тэнцэтгэл бишийн эцсийн шийд аль нь вэ?",
      options: ["1 < x < 2", "2 < x < 4", "0 < x < 2", "x > 4"],
      correct: "2 < x < 4",
      explanation: "1 < t < 2 → 2¹ < x < 2² → 2 < x < 4.",
    },
  ],
};

try {
  const [{ database }] = (await db.execute(sql`SELECT current_database() AS database`))
    .rows as { database: string }[];
  if (database !== "ej_learning_dev") {
    console.error(`Connected to "${database}". No change.`);
    process.exit(1);
  }

  // 1. English: attach the imported CEFR items to the skill of the same
  // (level, domain). Both came from the same workbook, so the pairing is exact.
  const linked = await db.execute(sql`
    UPDATE assessment.diagnostic_items i
    SET skill_id = k.id
    FROM content.skills k
    WHERE i.item_code LIKE 'CEFR-%'
      AND i.skill_id IS NULL
      AND k.proficiency_level_id = i.proficiency_level_id
      AND k.skill_code = 'ENG-' || (
        SELECT p.code FROM content.proficiency_levels p WHERE p.id = i.proficiency_level_id
      ) || '-' || upper(i.domain_mn)`);

  // 2. Algebra: move the hand-written questions into the item bank.
  const [maths] = await db
    .select({ id: subjectsInCore.id })
    .from(subjectsInCore)
    .where(eq(subjectsInCore.code, "MATH"))
    .limit(1);

  await db.execute(sql`
    DELETE FROM assessment.diagnostic_items WHERE item_code LIKE 'ALG10-Q-%'`);

  let written = 0;
  for (const [skillCode, questions] of Object.entries(ALGEBRA)) {
    const [skill] = await db
      .select({ id: skillsInContent.id })
      .from(skillsInContent)
      .where(eq(skillsInContent.skillCode, skillCode))
      .limit(1);
    if (!skill) {
      console.warn(`  no skill ${skillCode}, skipped`);
      continue;
    }

    for (const [index, question] of questions.entries()) {
      const [item] = await db
        .insert(diagnosticItemsInAssessment)
        .values({
          itemCode: `ALG10-Q-${skillCode.replace("ALG10-SK-", "")}-${index + 1}`,
          subjectId: maths.id,
          skillId: skill.id,
          gradeLevelId: 10,
          itemOrder: index + 1,
          titleMn: question.prompt,
          domainMn: "Алгебр",
          maxScore: "1",
          rubricMn: question.explanation,
          // Written for these lessons rather than recovered from scores, so
          // the key here is the real one.
          answerSource: "AUTHORITATIVE",
          status: "APPROVED",
        })
        .returning({ id: diagnosticItemsInAssessment.id });

      for (const [position, text] of question.options.entries()) {
        await db.insert(diagnosticItemOptionsInAssessment).values({
          diagnosticItemId: item.id,
          optionText: text,
          isCorrect: text === question.correct,
          sequenceNo: position + 1,
        });
      }
      written += 1;
    }
  }

  const [counts] = (
    await db.execute(sql`
      SELECT
        (SELECT count(*)::int FROM assessment.diagnostic_items WHERE skill_id IS NOT NULL) AS linked,
        (SELECT count(*)::int FROM assessment.diagnostic_items) AS total,
        (SELECT count(*)::int FROM assessment.diagnostic_item_options WHERE is_correct) AS keys`)
  ).rows as { linked: number; total: number; keys: number }[];

  console.log(`English items linked to skills: ${linked.rowCount ?? 0}`);
  console.log(`Algebra items written: ${written}`);
  console.log(
    `Bank now: ${counts.total} items, ${counts.linked} attached to a skill, ${counts.keys} keyed.`,
  );
} catch (error) {
  const cause = (error as { cause?: { message?: string; detail?: string } }).cause;
  console.error(`Failed: ${error instanceof Error ? error.message : String(error)}`);
  if (cause?.message) console.error(`  ${cause.message}`);
  if (cause?.detail) console.error(`  ${cause.detail}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
