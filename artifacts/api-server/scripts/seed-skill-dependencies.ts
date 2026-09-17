/**
 * Writes the prerequisite graph the remediation walk follows.
 *
 *   node scripts/run-ts.mjs scripts/seed-skill-dependencies.ts --yes
 *
 * content.skill_dependencies was empty, so "a student who is behind repeats
 * the lower work" had nothing to walk. This fills it for the two subjects that
 * have content, and it is idempotent - running it twice changes nothing.
 *
 * The two subjects get their graph from different places, because they are
 * shaped differently:
 *
 *   English is a ladder. Six domains, six levels, and B1 Grammar plainly sits
 *   on A2 Grammar. That is 30 links and none of them is a judgement call.
 *
 *   Algebra is a chapter. The links come from what a section actually needs,
 *   not merely from the page it appears on - so this is a small graph rather
 *   than a line. Section 1.1.4 ("various problems") needs both methods before
 *   it, and 1.2.2 needs simple logarithms and the substitution technique.
 *
 * Every row records where it came from in reason_mn. That matters: a teacher
 * reading this later should be able to tell a claim about mathematics from a
 * claim about the order of a book.
 */
import { sql } from "drizzle-orm";
import { db, pool, readRows } from "@workspace/db";

if (!process.argv.includes("--yes")) {
  console.error("Refusing to run without --yes.");
  process.exit(1);
}

type Link = {
  skill: string;
  requires: string;
  relation: "REQUIRED" | "RECOMMENDED" | "RELATED";
  importance: "HIGH" | "MEDIUM" | "LOW";
  reason: string;
};

const ALGEBRA: Link[] = [
  {
    skill: "ALG10-SK-1-1-2",
    requires: "ALG10-SK-1-1-1",
    relation: "REQUIRED",
    importance: "HIGH",
    reason:
      "Хувьсагч солих арга нь хялбар илтгэгч тэнцэтгэл бишийг бодож чаддаг байхыг шаарддаг: орлуулсны дараа үлдэх бодлого нь яг тэр хэлбэр.",
  },
  {
    skill: "ALG10-SK-1-1-3",
    requires: "ALG10-SK-1-1-1",
    relation: "REQUIRED",
    importance: "HIGH",
    reason:
      "Суурь болон илтгэгчдээ хувьсагчтай бодлого нь хялбар илтгэгч тэнцэтгэл бишийн суурь дээр тавигддаг.",
  },
  {
    skill: "ALG10-SK-1-1-4",
    requires: "ALG10-SK-1-1-2",
    relation: "REQUIRED",
    importance: "HIGH",
    reason:
      "Холимог бодлогууд аль аргыг сонгохыг шаарддаг тул орлуулах аргыг эзэмшсэн байх ёстой.",
  },
  {
    skill: "ALG10-SK-1-1-4",
    requires: "ALG10-SK-1-1-3",
    relation: "REQUIRED",
    importance: "HIGH",
    reason:
      "Холимог бодлогуудад суурь болон илтгэгчдээ хувьсагчтай хэлбэр байнга тохиолддог.",
  },
  {
    skill: "ALG10-SK-1-2-1",
    requires: "ALG10-SK-1-1-1",
    relation: "REQUIRED",
    importance: "MEDIUM",
    reason:
      "Логарифм тэнцэтгэл бишийг илтгэгч хэлбэрт шилжүүлж боддог тул илтгэгч тэнцэтгэл биш нь урьдач нөхцөл болно.",
  },
  {
    skill: "ALG10-SK-1-2-2",
    requires: "ALG10-SK-1-2-1",
    relation: "REQUIRED",
    importance: "HIGH",
    reason: "Орлуулах аргыг хэрэглэхийн өмнө хялбар логарифм тэнцэтгэл бишийг бодож чаддаг байх ёстой.",
  },
  {
    skill: "ALG10-SK-1-2-2",
    requires: "ALG10-SK-1-1-2",
    relation: "REQUIRED",
    importance: "MEDIUM",
    reason:
      "Орлуулах техник нь илтгэгч хэсэгт сурсан тэр л арга — логарифм дээр дахин хэрэглэгдэж байна.",
  },
];

const CEFR_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2"];

try {
  const skills = await readRows<{ id: number; code: string }>(
    `SELECT id::int, skill_code AS code FROM content.skills`,
  );
  const byCode = new Map(skills.map((row) => [row.code, row.id]));

  // The English ladder is generated rather than typed out: one step per level
  // per domain, and the domains are whatever the import actually produced.
  const domains = [
    ...new Set(
      skills
        .filter((row) => row.code.startsWith("ENG-"))
        .map((row) => row.code.split("-")[2]),
    ),
  ].sort();

  const english: Link[] = [];
  for (const domain of domains) {
    for (let i = 1; i < CEFR_ORDER.length; i += 1) {
      const skill = `ENG-${CEFR_ORDER[i]}-${domain}`;
      const requires = `ENG-${CEFR_ORDER[i - 1]}-${domain}`;
      if (!byCode.has(skill) || !byCode.has(requires)) continue;
      english.push({
        skill,
        requires,
        relation: "REQUIRED",
        importance: "HIGH",
        reason: `CEFR шат: ${CEFR_ORDER[i]} түвшний ${domain} нь ${CEFR_ORDER[i - 1]} түвшний мөн чиглэлийн суурь дээр тогтдог.`,
      });
    }
  }

  const links = [...ALGEBRA, ...english];
  let written = 0;
  const missing: string[] = [];

  for (const link of links) {
    const skillId = byCode.get(link.skill);
    const prerequisiteId = byCode.get(link.requires);
    if (!skillId || !prerequisiteId) {
      missing.push(`${link.skill} <- ${link.requires}`);
      continue;
    }

    const result = await db.execute(sql`
      INSERT INTO content.skill_dependencies
        (dependency_code, skill_id, prerequisite_skill_id, relation_type,
         importance, reason_mn, status)
      VALUES (${`DEP-${link.skill}-${link.requires}`}, ${skillId}, ${prerequisiteId},
        ${link.relation}::content.dependency_type, ${link.importance}::content.importance_level,
        ${link.reason}, 'APPROVED')
      ON CONFLICT ON CONSTRAINT skill_dependencies_skill_id_prerequisite_skill_id_key
      DO NOTHING`);
    written += result.rowCount ?? 0;
  }

  const counts = (
    await db.execute(sql`
      SELECT sub.code AS subject, count(*)::int AS links
      FROM content.skill_dependencies d
      JOIN content.skills s ON s.id = d.skill_id
      JOIN core.subjects sub ON sub.id = s.subject_id
      GROUP BY sub.code ORDER BY sub.code`)
  ).rows as { subject: string; links: number }[];

  console.log(`Wrote ${written} new link(s) of ${links.length} considered.`);
  for (const row of counts) console.log(`  ${row.subject.padEnd(6)} ${row.links} links`);
  if (missing.length > 0) {
    console.log(`Skipped, skill not in the database: ${missing.join(", ")}`);
  }
} catch (error) {
  const cause = (error as { cause?: { message?: string; detail?: string } }).cause;
  console.error(`Failed: ${error instanceof Error ? error.message : String(error)}`);
  if (cause?.message) console.error(`  ${cause.message}`);
  if (cause?.detail) console.error(`  ${cause.detail}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
