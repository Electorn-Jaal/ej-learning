/**
 * Gives the English skills a topic and something to open in the book viewer.
 *
 *   node scripts/run-ts.mjs scripts/seed-english-content.ts --yes
 *
 * English has 36 skills and 36 lessons but no textbook, so a student opening
 * today's lesson sees text and no pages. The viewer only appears when a skill
 * reaches a book through content_skill_maps -> content_nodes ->
 * content_source_alignments, and none of those rows existed.
 *
 * ## The book is a stand-in and says so
 *
 * The only PDF in the system is a grade 10 algebra textbook. It does not teach
 * English and never will. It is attached here so the page-viewing half of the
 * product can be demonstrated before the English books arrive, and every row
 * this writes carries that admission:
 *
 *   - the alignment is RELATED, not PRIMARY - PRIMARY would claim the book
 *     teaches the skill
 *   - evidence_note says in Mongolian that it is a placeholder
 *   - data_quality_status is INCOMPLETE, so it reads as unfinished rather than
 *     agreed
 *   - no outline node is linked, so the viewer shows the book's name and not
 *     an algebra chapter heading under an English lesson
 *
 * Replacing it means uploading the real books and rewriting the alignments.
 * Nothing else has to change.
 *
 * ## Which pages
 *
 * Page ranges are invented, because the source workbook has none - its Pages
 * column holds prose like "Use linked Essential Grammar unit". Each CEFR level
 * gets a three-page block of the algebra book and each domain a two-page window
 * inside it, so two different lessons open at two different places. That is the
 * whole purpose: to prove the viewer follows the lesson.
 */
import { sql } from "drizzle-orm";
import { db, pool, readRows } from "@workspace/db";

if (!process.argv.includes("--yes")) {
  console.error("Refusing to run without --yes.");
  process.exit(1);
}

/** Printed page numbers in the stand-in book, from its own outline. */
const FIRST_PAGE = 1;
const LAST_PAGE = 18;
const PAGES_PER_LEVEL = 3;

const DOMAIN_MN: Record<string, string> = {
  GRAMMAR: "Хэл зүй",
  VOCABULARY: "Үгийн сан",
  READING: "Унших",
  LISTENING: "Сонсох",
  WRITING: "Бичих",
  SPEAKING: "Ярих",
};

try {
  const [book] = await readRows<{ id: number; title: string }>(
    `SELECT sm.id::int, sm.title FROM content.source_materials sm
     WHERE sm.source_code = 'ALG10-TB' AND sm.status = 'APPROVED'`,
  );
  if (!book) throw new Error("Stand-in book ALG10-TB not found or not approved.");

  const [subject] = await readRows<{ id: number }>(
    `SELECT id::int FROM core.subjects WHERE code = 'ENG'`,
  );
  if (!subject) throw new Error("Subject ENG not found.");

  const skills = await readRows<{
    id: number;
    skillCode: string;
    nameMn: string;
    levelCode: string | null;
    levelSequence: number | null;
  }>(
    `SELECT s.id::int, s.skill_code AS "skillCode", s.name_mn AS "nameMn",
       pl.code AS "levelCode", pl.sequence::int AS "levelSequence"
     FROM content.skills s
     JOIN core.subjects sub ON sub.id = s.subject_id
     LEFT JOIN content.proficiency_levels pl ON pl.id = s.proficiency_level_id
     WHERE sub.code = 'ENG'
     ORDER BY pl.sequence, s.skill_code`,
  );

  let nodes = 0;
  let maps = 0;
  let alignments = 0;
  let sequence = 0;

  for (const skill of skills) {
    sequence += 1;
    // ENG-B1-GRAMMAR -> ["ENG", "B1", "GRAMMAR"]
    const [, level, domain] = skill.skillCode.split("-");
    const levelIndex = Math.max((skill.levelSequence ?? 1) - 1, 0);

    const blockStart = FIRST_PAGE + levelIndex * PAGES_PER_LEVEL;
    const domainIndex = Object.keys(DOMAIN_MN).indexOf(domain);
    const pageFrom = Math.min(
      blockStart + (domainIndex < 0 ? 0 : domainIndex % PAGES_PER_LEVEL),
      LAST_PAGE - 1,
    );
    const pageTo = Math.min(pageFrom + 1, LAST_PAGE);

    const contentCode = `ENG-TOPIC-${level}-${domain}`;
    const nodeName = `${DOMAIN_MN[domain] ?? domain} — ${level}`;

    const node = await db.execute(sql`
      INSERT INTO content.content_nodes
        (subject_id, content_code, level_type, name_mn, sequence_no,
         description_mn, status, data_quality_status, notes)
      VALUES (${subject.id}, ${contentCode}, 'TOPIC', ${nodeName}, ${sequence},
        ${`${level} түвшний ${DOMAIN_MN[domain] ?? domain} чиглэлийн агуулга.`},
        'APPROVED', 'INCOMPLETE',
        'Сэдвийн нэр нь чадвараас гаргасан түр нэр. Бодит хөтөлбөрийн сэдэв ирэхэд солино.')
      ON CONFLICT (content_code) DO NOTHING`);
    nodes += node.rowCount ?? 0;

    const [nodeRow] = await readRows<{ id: number }>(
      `SELECT id::int FROM content.content_nodes WHERE content_code = $1`,
      [contentCode],
    );
    if (!nodeRow) continue;

    const map = await db.execute(sql`
      INSERT INTO content.content_skill_maps
        (map_code, content_node_id, skill_id, is_primary, status, evidence_note)
      VALUES (${`MAP-${contentCode}`}, ${nodeRow.id}, ${skill.id}, true, 'APPROVED',
        'Чадвар бүрт нэг сэдэв — англи хэлний хөтөлбөр ирэх хүртэлх бүтэц.')
      ON CONFLICT (content_node_id, skill_id) DO NOTHING`);
    maps += map.rowCount ?? 0;

    const alignment = await db.execute(sql`
      INSERT INTO content.content_source_alignments
        (alignment_code, content_node_id, source_material_id, relation_type,
         source_outline_node_id, page_from, page_to, status, evidence_note, notes)
      VALUES (${`ALIGN-${contentCode}`}, ${nodeRow.id}, ${book.id}, 'RELATED',
        NULL, ${pageFrom}, ${pageTo}, 'APPROVED',
        'ТҮР ОРЛУУЛГА: энэ ном англи хэл заадаггүй. Ном харуулах хэсгийг ажиллуулж үзүүлэх зорилгоор түр холбосон.',
        'Англи хэлний бодит ном ирэхэд энэ мөрийг солино.')
      ON CONFLICT (alignment_code) DO NOTHING`);
    alignments += alignment.rowCount ?? 0;
  }

  const reachable = (
    await db.execute(sql`
      SELECT count(*)::int AS n
      FROM learning.daily_lessons dl
      JOIN content.skills sk ON sk.id = dl.core_skill_id
      JOIN core.subjects sub ON sub.id = sk.subject_id AND sub.code = 'ENG'
      WHERE EXISTS (
        SELECT 1 FROM content.content_skill_maps m
        JOIN content.content_source_alignments a ON a.content_node_id = m.content_node_id
        WHERE m.skill_id = sk.id AND a.status = 'APPROVED')`)
  ).rows as { n: number }[];

  console.log(`Skills seen: ${skills.length}`);
  console.log(`  content_nodes written              ${nodes}`);
  console.log(`  content_skill_maps written         ${maps}`);
  console.log(`  content_source_alignments written  ${alignments}`);
  console.log(`English lessons that now reach a book: ${reachable[0]?.n ?? 0}`);
  console.log(`Stand-in book: ${book.title}`);
} catch (error) {
  const cause = (error as { cause?: { message?: string; detail?: string } }).cause;
  console.error(`Failed: ${error instanceof Error ? error.message : String(error)}`);
  if (cause?.message) console.error(`  ${cause.message}`);
  if (cause?.detail) console.error(`  ${cause.detail}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
