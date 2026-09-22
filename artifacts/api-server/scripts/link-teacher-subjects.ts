/**
 * Reads each teacher's specialty out of the staff register and records it.
 *
 * Dry-run (default): pnpm --filter @workspace/api-server link-teacher-subjects
 * Apply:             pnpm --filter @workspace/api-server link-teacher-subjects -- --apply --yes
 *
 * The school never sent a class-to-teacher assignment, so nothing could say
 * who takes 6a's maths. But the register it DID send names every teacher's
 * post - "Багш, математикийн /ЕБС/", "Багш, монгол хэл, уран зохиолын" - and
 * that is a different, weaker, still useful fact: not who teaches this class,
 * but who teaches this subject at all. With it a maths teacher can be shown
 * every class that studies maths. Wider than "my classes", never wrong.
 *
 * The mapping is made by keyword rather than by a list of names on purpose.
 * A name list would have to be re-edited by hand every time the school hires
 * someone; a keyword rule re-runs against the new register and reports what
 * it could not place, which is the part a person needs to look at.
 *
 * What it writes:
 *   core.teacher_subjects    - one row per (teacher, subject), is_primary on
 *                              the first match, source_title carrying the
 *                              register's own words so the guess is auditable.
 *   core.teachers.subject_id - the primary, for screens with room for one label.
 *
 * Re-running is safe: rows are upserted, and subjects that disappear from a
 * teacher's title are deactivated rather than deleted, so a mis-parse never
 * silently loses the evidence that it happened.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pool } from "@workspace/db";

const apply = process.argv.includes("--apply");
if (apply && !process.argv.includes("--yes")) throw new Error("Refusing apply without --yes.");

const ROSTER = resolve(process.cwd(), "../../local-data/extracted/roster.json");

/**
 * Job-title keyword to subject code, in the order they are tested.
 *
 * Order is load-bearing twice over. "мэдээллийн технологи" has to be tried
 * before bare "технологи", or the IT teacher becomes a design teacher. And
 * the first rule that matches a title becomes that teacher's primary subject,
 * so within a paired title the leading half is listed first.
 *
 * A null code means the post is recognised as teaching but the subject has no
 * core.subjects row - physical education and music are not in the curriculum
 * this database holds. Recognising them is what keeps them out of the "could
 * not place" list, which is reserved for titles nobody has read yet.
 */
const SUBJECT_RULES: { match: string; code: string | null }[] = [
  { match: "мэдээллийн технологи", code: "ICT" },
  { match: "математик", code: "MATH" },
  { match: "монгол хэл", code: "MGL" },
  { match: "уран зохиол", code: "LIT" },
  { match: "англи", code: "ENG" },
  { match: "хими", code: "SCI" },
  { match: "биологи", code: "SCI" },
  { match: "байгалийн ухаан", code: "SCI" },
  { match: "физик", code: "PHYS" },
  { match: "түүх", code: "HIST" },
  { match: "нийгэм", code: "SOC" },
  { match: "ёс зүй", code: "ETHICS" },
  { match: "үндэсний бичиг", code: "SCRIPT" },
  { match: "дүрслэх урлаг", code: "ART" },
  { match: "зураг", code: "ART" },
  { match: "технологи", code: "DTECH" },
  { match: "биеийн тамир", code: null },
  { match: "дуу хөгжим", code: null },
  { match: "газар", code: null },
  { match: "орос", code: null },
];

/** Teachers of every subject at once. An absence of rows is the honest record. */
const PRIMARY_GRADE = "бага ангийн";

type StaffRow = Record<string, string | number | null>;

const text = (row: StaffRow, key: string) => String(row[key] ?? "").trim();

/**
 * The post comes first and the job classification second.
 *
 * They disagree, and when they do the post is the narrower, more current
 * answer: Б.Буянзаяа is classified "математик-физикийн" but posted "Багш,
 * математик", and maths is what she is actually standing in front of.
 */
function titleFor(row: StaffRow) {
  const post = text(row, "Албан тушаал");
  return post || text(row, "Ажлын байрны ангилал");
}

function subjectsFrom(title: string) {
  const haystack = title.toLowerCase();
  if (haystack.includes(PRIMARY_GRADE)) {
    return { primaryGrade: true, codes: [] as string[], recognised: true };
  }
  const codes: string[] = [];
  let recognised = false;
  for (const rule of SUBJECT_RULES) {
    if (!haystack.includes(rule.match)) continue;
    recognised = true;
    if (rule.code && !codes.includes(rule.code)) codes.push(rule.code);
  }
  return { primaryGrade: false, codes, recognised };
}

const roster = JSON.parse(readFileSync(ROSTER, "utf8")) as { views: { staff: StaffRow[] } };

const client = await pool.connect();
try {
  const { rows: teachers } = await client.query<{ id: string; code: string; name: string }>(
    `SELECT t.id::text AS id, t.teacher_code AS code, u.display_name AS name
     FROM core.teachers t JOIN core.users u ON u.id = t.user_id`);
  const { rows: subjects } = await client.query<{ id: string; code: string }>(
    `SELECT id::text AS id, code FROM core.subjects WHERE is_active`);

  const subjectByCode = new Map(subjects.map((s) => [s.code, s]));
  // teacher_code is EJ-2627-Tnnn where nnn is the register's own row number,
  // which is how a teacher row is tied back to the line it came from.
  const teacherByRegisterNo = new Map(
    teachers.map((t) => [Number(t.code.replace(/^.*-T/, "")), t]));

  type Planned = {
    teacherId: string; teacherName: string; title: string; active: boolean;
    entries: { subjectId: string; code: string; primary: boolean }[];
  };
  const planned: Planned[] = [];
  const primaryGrade: string[] = [];
  const noSubjectRow: string[] = [];
  const unplaced: string[] = [];
  const notInDatabase = new Set<string>();

  for (const row of roster.views.staff) {
    const teacher = teacherByRegisterNo.get(Number(row["No"]));
    // Non-teaching staff - the director, the accountant, the doctor - have no
    // core.teachers row at all, so they drop out here rather than having to be
    // filtered by job title.
    if (!teacher) continue;

    const title = titleFor(row);
    const { primaryGrade: isPrimaryGrade, codes, recognised } = subjectsFrom(title);

    if (isPrimaryGrade) {
      primaryGrade.push(`${teacher.name} — ${title}`);
      continue;
    }
    if (codes.length === 0) {
      (recognised ? noSubjectRow : unplaced).push(`${teacher.name} — ${title}`);
      continue;
    }

    const entries: Planned["entries"] = [];
    for (const [index, code] of codes.entries()) {
      const subject = subjectByCode.get(code);
      if (!subject) { notInDatabase.add(code); continue; }
      entries.push({ subjectId: subject.id, code, primary: index === 0 });
    }
    if (entries.length === 0) continue;

    planned.push({
      teacherId: teacher.id,
      teacherName: teacher.name,
      title,
      // "Түр чөлөөлсөн" is on leave, not gone: the specialty stays recorded and
      // the row is simply inactive, so the screens skip them while the register
      // still matches the database when they come back.
      active: text(row, "Төлөв") === "Идэвхтэй",
      entries,
    });
  }

  console.log(JSON.stringify({
    registerRows: roster.views.staff.length,
    teacherAccounts: teachers.length,
    mappedTeachers: planned.length,
    rows: planned.reduce((n, p) => n + p.entries.length, 0),
    twoSubjects: planned.filter((p) => p.entries.length > 1).length,
    onLeave: planned.filter((p) => !p.active).map((p) => p.teacherName),
    bySubject: Object.fromEntries(
      [...subjectByCode.keys()]
        .map((code) => [code, planned.filter((p) => p.entries.some((e) => e.code === code)).length] as const)
        .filter(([, n]) => n > 0)),
    primaryGradeTeachers: primaryGrade,
    recognisedButNoSubjectRow: noSubjectRow,
    couldNotPlace: unplaced,
    subjectCodesMissingFromDatabase: [...notInDatabase],
  }, null, 2));

  console.log("\n" + planned
    .map((p) => `  ${p.active ? " " : "·"} ${p.teacherName.padEnd(16)}`
      + ` ${p.entries.map((e) => e.code).join(", ").padEnd(12)} ${p.title}`)
    .join("\n"));

  if (!apply) {
    console.log("\nDry run. Re-run with --apply --yes to write.");
  } else {
    await client.query("BEGIN");
    try {
      // Deactivate first, then upsert: a teacher whose title changed keeps the
      // old row as evidence of the earlier reading instead of losing it.
      await client.query(
        `UPDATE core.teacher_subjects SET is_active = false
         WHERE teacher_id = ANY($1::bigint[])`,
        [planned.map((p) => p.teacherId)]);

      for (const person of planned) {
        for (const entry of person.entries) {
          await client.query(`
            INSERT INTO core.teacher_subjects (teacher_id, subject_id, is_primary, is_active, source_title)
            VALUES ($1::bigint, $2::bigint, $3, $4, $5)
            ON CONFLICT (teacher_id, subject_id) DO UPDATE SET
              is_primary = EXCLUDED.is_primary,
              is_active = EXCLUDED.is_active,
              source_title = EXCLUDED.source_title`,
            [person.teacherId, entry.subjectId, entry.primary, person.active, person.title]);
        }
        const primary = person.entries.find((e) => e.primary);
        await client.query(
          `UPDATE core.teachers SET subject_id = $2::bigint WHERE id = $1::bigint`,
          [person.teacherId, primary?.subjectId ?? null]);
      }
      await client.query("COMMIT");

      const { rows: [count] } = await client.query<{ n: string; active: string; teachers: string }>(
        `SELECT count(*)::text AS n, count(*) FILTER (WHERE is_active)::text AS active,
                count(DISTINCT teacher_id)::text AS teachers
         FROM core.teacher_subjects`);
      console.log(`\nWritten. teacher_subjects: ${count.n} rows`
        + ` (${count.active} active) across ${count.teachers} teachers.`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
} finally {
  client.release();
  await pool.end();
}
