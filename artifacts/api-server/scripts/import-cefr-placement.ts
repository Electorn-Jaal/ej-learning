/**
 * Loads the English CEFR placement test itself - the paper, not the results.
 *
 * The paper is 84 questions, not 60. Sixty are multiple choice and carry a
 * reconstructed answer key; twelve of those sixty are listening items whose
 * question means nothing without the line a teacher reads aloud. The other
 * twenty-four are writing and speaking tasks judged against a rubric rather
 * than a key, and they are the reason a hundred of the hundred and five
 * children who sat this test still have no confirmed level.
 *
 * Dry-run (default): pnpm --filter @workspace/api-server import-cefr-placement
 * Apply:             pnpm --filter @workspace/api-server import-cefr-placement -- --apply --yes
 *
 * The school ran a real A1-C2 placement test through a Google Form. Two
 * separable things came out of it, and this script deliberately loads only
 * the first:
 *
 *   THE PAPER   - sixty questions, their options, their CEFR level and the
 *                 answer key. Nothing about it depends on knowing which child
 *                 sat it, so it imports with no human in the loop.
 *   THE RESULTS - 105 children's scores and levels. Those are keyed on
 *                 whatever name each child typed into the Form ("T",
 *                 "SHINEE", "123.0"), which no rule can turn into a student
 *                 id. They need a teacher to confirm each one, and they are
 *                 imported by a separate script once that has happened.
 *
 * Loading the paper on its own is worth doing before the matching is solved,
 * because from here on the test can be sat inside the system, where who is
 * answering is never in doubt. The identity problem is a property of the 105
 * historical rows, not of the test.
 *
 * The answer key is the one real caveat and it is recorded rather than
 * hidden. It was never exported from the Form; it was solved backwards from
 * the 108 recorded scores, and it is the only assignment under which every
 * one of those scores comes out right (108/108, zero total error). That is
 * strong evidence and it is not proof, so every item is written with
 * answer_source = RECONSTRUCTED. Replace it with AUTHORITATIVE the day the
 * Form's own key is exported.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pool } from "@workspace/db";

const apply = process.argv.includes("--apply");
if (apply && !process.argv.includes("--yes")) throw new Error("Refusing apply without --yes.");

const EXTRACT = resolve(process.cwd(), "../../local-data/extracted/cefr-extract.json");
const KEY = resolve(process.cwd(), "../../local-data/extracted/cefr-answer-key.reconstructed.json");

const PAPER_CODE = "CEFR-PLACEMENT-A1C2";

/**
 * The CEFR ladder, including the rung below its bottom.
 *
 * PRE-A1 is not a CEFR level - the framework starts at A1 - but four children
 * scored below what A1 describes, and the results sheet says PRE-A1 for them.
 * Recording it is the honest reading of "has not reached A1 yet"; leaving it
 * out would force those four to be rounded up into A1.
 *
 * sequence starts at 1 because the column is checked > 0.
 */
const LEVELS: { code: string; nameMn: string }[] = [
  { code: "PRE-A1", nameMn: "Анхан шатанд хүрээгүй" },
  { code: "A1", nameMn: "Анхан шат: эхлэл" },
  { code: "A2", nameMn: "Анхан шат: ахиц" },
  { code: "B1", nameMn: "Бие даасан: босго" },
  { code: "B2", nameMn: "Бие даасан: ахисан" },
  { code: "C1", nameMn: "Чадварлаг: бүрэн эзэмшсэн" },
  { code: "C2", nameMn: "Чадварлаг: төгс" },
];

/** The question's own domain, as the sheet words it. */
const DOMAIN_MN: Record<string, string> = {
  Grammar: "Дүрэм",
  Vocabulary: "Үгийн сан",
  Reading: "Унших",
  Listening: "Сонсох",
  Writing: "Бичих",
  Speaking: "Ярих",
};

type Script = { "Item ID": string; "Teacher Script": string };
type Rubric = {
  "Item ID": string; CEFR: string; Domain: string; Prompt: string; Rubric: string;
};

type ExtractItem = {
  itemCode: string; level: string; domain: string; prompt: string;
  itemOrder: number; observedOptions: string[];
};
type KeyItem = {
  itemCode: string; level: string; domain: string; prompt: string;
  options: string[]; correctAnswer: string;
};

const extract = JSON.parse(readFileSync(EXTRACT, "utf8")) as {
  items: ExtractItem[];
  submissions: unknown[];
  teacherScripts: Script[];
  rubrics: Rubric[];
};
const key = JSON.parse(readFileSync(KEY, "utf8")) as {
  items: KeyItem[];
  trust: string;
  method: string;
  caveat: string;
  verification: { studentsChecked: number; studentsMatchingExactly: number; totalError: number };
};

const orderOf = new Map(extract.items.map((item) => [item.itemCode, item.itemOrder]));

/** The line a teacher reads aloud, per listening item. */
const scriptOf = new Map(
  extract.teacherScripts.map((row) => [row["Item ID"], row["Teacher Script"]]));

/**
 * The writing and speaking half of the paper.
 *
 * Judged rather than marked: there is no key, only a can-do statement ("Can
 * convey a very simple practical message"). max_score is 1 because that is
 * what the rubric actually asks - whether the child can do the thing - and
 * inventing a five-point scale the school never wrote down would be putting
 * a number on work nobody graded that way.
 *
 * answer_source is AUTHORITATIVE here, unlike the sixty. Their key had to be
 * solved backwards; these rubrics came from the school's own sheet.
 */
const PRODUCTIVE_DOMAIN: Record<string, string> = { Writing: "Бичих", Speaking: "Ярих" };
const productive = extract.rubrics.filter((row) => PRODUCTIVE_DOMAIN[row.Domain]);

// Every option that appears is one somebody actually chose, so a distractor
// nobody picked is simply absent. Five questions come back with fewer than
// four options for that reason, which is worth saying in the paper's notes
// rather than presenting a three-option question as the whole question.
const thinOptions = key.items.filter((item) => item.options.length < 4);
const missingOrder = key.items.filter((item) => !orderOf.has(item.itemCode));
const badKey = key.items.filter((item) => !item.options.includes(item.correctAnswer));

console.log(JSON.stringify({
  multipleChoice: key.items.length,
  productiveTasks: productive.length,
  listeningScripts: scriptOf.size,
  paperTotal: key.items.length + productive.length,
  byLevel: key.items.reduce<Record<string, number>>(
    (acc, item) => ({ ...acc, [item.level]: (acc[item.level] ?? 0) + 1 }), {}),
  byDomain: key.items.reduce<Record<string, number>>(
    (acc, item) => ({ ...acc, [item.domain]: (acc[item.domain] ?? 0) + 1 }), {}),
  options: key.items.reduce((sum, item) => sum + item.options.length, 0),
  answerKey: {
    trust: key.trust,
    ...key.verification,
  },
  itemsWithFewerThanFourOptions: thinOptions.map((item) => item.itemCode),
  itemsWithNoOrder: missingOrder.map((item) => item.itemCode),
  itemsWhoseKeyIsNotAnOption: badKey.map((item) => item.itemCode),
  listeningItemsWithoutAScript: key.items
    .filter((item) => item.domain === "Listening" && !scriptOf.has(item.itemCode))
    .map((item) => item.itemCode),
  submissionsInFile: extract.submissions.length,
  note: "Submissions are NOT imported here. They need the name matching first.",
}, null, 2));

if (missingOrder.length || badKey.length) {
  throw new Error("Refusing to import: the extract and the key disagree.");
}

if (!apply) {
  console.log("\nDry run. Re-run with --apply --yes to write.");
} else {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: [subject] } = await client.query<{ id: string }>(
      "SELECT id::text AS id FROM core.subjects WHERE code = 'ENG'");
    if (!subject) throw new Error("core.subjects has no ENG row.");

    const levelId = new Map<string, string>();
    for (const [index, level] of LEVELS.entries()) {
      const { rows: [row] } = await client.query<{ id: string }>(`
        INSERT INTO content.proficiency_levels (framework, code, name_mn, sequence)
        VALUES ('CEFR', $1, $2, $3)
        ON CONFLICT (framework, code) DO UPDATE SET name_mn = EXCLUDED.name_mn
        RETURNING id::text AS id`,
        [level.code, level.nameMn, index + 1]);
      levelId.set(level.code, row.id);
    }

    const itemId = new Map<string, string>();
    for (const item of key.items) {
      const { rows: [row] } = await client.query<{ id: string }>(`
        INSERT INTO assessment.diagnostic_items
          (item_code, subject_id, item_order, title_mn, domain_mn, max_score,
           proficiency_level_id, answer_source, status, stimulus_mn)
        VALUES ($1, $2::bigint, $3, $4, $5, 1, $6::smallint, 'RECONSTRUCTED', 'APPROVED', $7)
        ON CONFLICT (item_code) DO UPDATE SET
          subject_id = EXCLUDED.subject_id, item_order = EXCLUDED.item_order,
          title_mn = EXCLUDED.title_mn, domain_mn = EXCLUDED.domain_mn,
          max_score = EXCLUDED.max_score,
          proficiency_level_id = EXCLUDED.proficiency_level_id,
          answer_source = EXCLUDED.answer_source, status = EXCLUDED.status,
          stimulus_mn = EXCLUDED.stimulus_mn
        RETURNING id::text AS id`,
        [item.itemCode, subject.id, orderOf.get(item.itemCode), item.prompt,
         DOMAIN_MN[item.domain] ?? item.domain, levelId.get(item.level),
         scriptOf.get(item.itemCode) ?? null]);
      itemId.set(item.itemCode, row.id);

      // Replaced wholesale rather than upserted: the options have no stable
      // key of their own, and a re-run after the real key arrives has to be
      // able to move which one is correct.
      await client.query(
        "DELETE FROM assessment.diagnostic_item_options WHERE diagnostic_item_id = $1::bigint",
        [row.id]);
      for (const [index, option] of item.options.entries()) {
        await client.query(`
          INSERT INTO assessment.diagnostic_item_options
            (diagnostic_item_id, option_label, option_text, is_correct, sequence_no)
          VALUES ($1::bigint, $2, $3, $4, $5)`,
          [row.id, String.fromCharCode(65 + index), option,
           option === item.correctAnswer, index + 1]);
      }
    }

    // The judged half. No options, because there is nothing to choose; the
    // rubric is what a teacher reads while deciding, and it is carried on the
    // item rather than left in a spreadsheet nobody opens during a lesson.
    const productiveOrder = new Map<string, number>();
    for (const [index, task] of productive.entries()) {
      const order = key.items.length + index + 1;
      productiveOrder.set(task["Item ID"], order);
      const { rows: [row] } = await client.query<{ id: string }>(`
        INSERT INTO assessment.diagnostic_items
          (item_code, subject_id, item_order, title_mn, domain_mn, max_score,
           proficiency_level_id, answer_source, status, rubric_mn)
        VALUES ($1, $2::bigint, $3, $4, $5, 1, $6::smallint, 'AUTHORITATIVE', 'APPROVED', $7)
        ON CONFLICT (item_code) DO UPDATE SET
          subject_id = EXCLUDED.subject_id, item_order = EXCLUDED.item_order,
          title_mn = EXCLUDED.title_mn, domain_mn = EXCLUDED.domain_mn,
          max_score = EXCLUDED.max_score,
          proficiency_level_id = EXCLUDED.proficiency_level_id,
          answer_source = EXCLUDED.answer_source, status = EXCLUDED.status,
          rubric_mn = EXCLUDED.rubric_mn
        RETURNING id::text AS id`,
        [task["Item ID"], subject.id, order, task.Prompt,
         PRODUCTIVE_DOMAIN[task.Domain], levelId.get(task.CEFR), task.Rubric]);
      itemId.set(task["Item ID"], row.id);
    }

    const notes = [
      `Эх сурвалж: EJ English CEFR A1-C2 Placement - Results.xlsx (Google Form).`,
      `Хариултын түлхүүр Form-оос экспортлогдоогүй. ${key.verification.studentsChecked} сурагчийн`,
      `онооноос буцаан бодож гаргасан бөгөөд ${key.verification.studentsMatchingExactly} нь яг таарсан`,
      `(нийт зөрүү ${key.verification.totalError}). Иймд бүх асуулт answer_source = RECONSTRUCTED.`,
      `Form-оос жинхэнэ түлхүүр гармагц AUTHORITATIVE болгож дахин ачаална.`,
      `
Бичих, ярих 24 даалгаврын шалгуур нь сургуулийн эх хуудсаас ирсэн тул`,
      `AUTHORITATIVE. Тэдгээрт зөв хариулт байхгүй - багш шалгуураар дүгнэнэ.`,
      thinOptions.length
        ? `\nСонголтууд нь хариултаас сэргээгдсэн тул хэн ч сонгоогүй сонголт дутуу байна:`
          + ` ${thinOptions.map((item) => item.itemCode).join(", ")}.`
        : "",
    ].join(" ");

    const { rows: [paper] } = await client.query<{ id: string }>(`
      INSERT INTO assessment.exam_papers
        (paper_code, subject_id, exam_kind, title_mn, status, instructions_mn, notes)
      VALUES ($1, $2::bigint, 'DIAGNOSTIC', $3, 'APPROVED', $4, $5)
      ON CONFLICT (paper_code) DO UPDATE SET
        title_mn = EXCLUDED.title_mn, status = EXCLUDED.status,
        instructions_mn = EXCLUDED.instructions_mn, notes = EXCLUDED.notes,
        updated_at = now()
      RETURNING id::text AS id`,
      [PAPER_CODE, subject.id, "Англи хэлний түвшин тогтоох шалгалт (CEFR A1-C2)",
       "84 даалгавар: сонголттой 60 (түвшин тус бүр 10) ба бичих, ярих 24."
       + " Сонсохын 12 асуултыг багш эхийг нь чангаар уншиж өгнө."
       + " Бичих, ярих даалгаврыг шалгуураар нь дүгнэнэ.", notes]);

    await client.query("DELETE FROM assessment.exam_paper_items WHERE paper_id = $1::bigint",
      [paper.id]);
    const onPaper = [
      ...key.items.map((item) => ({ code: item.itemCode, order: orderOf.get(item.itemCode)! })),
      ...productive.map((task) => ({ code: task["Item ID"], order: productiveOrder.get(task["Item ID"])! })),
    ];
    for (const entry of onPaper) {
      await client.query(`
        INSERT INTO assessment.exam_paper_items (paper_id, diagnostic_item_id, item_order, max_score)
        VALUES ($1::bigint, $2::bigint, $3, 1)`,
        [paper.id, itemId.get(entry.code), entry.order]);
    }

    await client.query("COMMIT");

    const { rows: [count] } = await client.query<Record<string, string>>(`
      SELECT (SELECT count(*)::text FROM content.proficiency_levels WHERE framework = 'CEFR') AS levels,
             (SELECT count(*)::text FROM assessment.diagnostic_items) AS items,
             (SELECT count(*)::text FROM assessment.diagnostic_items WHERE stimulus_mn IS NOT NULL) AS scripts,
             (SELECT count(*)::text FROM assessment.diagnostic_items WHERE rubric_mn IS NOT NULL) AS rubrics,
             (SELECT count(*)::text FROM assessment.diagnostic_item_options) AS options,
             (SELECT count(*)::text FROM assessment.diagnostic_item_options WHERE is_correct) AS keyed,
             (SELECT count(*)::text FROM assessment.exam_paper_items) AS "paperItems"`);
    console.log(`\nWritten. CEFR levels: ${count.levels}, items: ${count.items},`
      + ` options: ${count.options} (${count.keyed} marked correct),`
      + ` on the paper: ${count.paperItems}.`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

await pool.end();
