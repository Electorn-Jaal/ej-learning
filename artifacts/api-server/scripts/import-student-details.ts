/**
 * Fills in the rest of each child's record from the school register.
 *
 * Dry-run (default): pnpm --filter @workspace/api-server import-student-details
 * Apply:             pnpm --filter @workspace/api-server import-student-details -- --apply --yes
 *
 * The first import took a name and a class and left six columns behind, so
 * core.students held a code and a display name and nothing a registrar would
 * recognise as a record. This reads the rest:
 *
 *   roll       - family name and given name separately, whether the personal
 *                file has arrived, whether the child turned up, and the
 *                registrar's own notes.
 *   admissions - the parent telephone numbers, which the system had nowhere
 *                to put at all.
 *
 * Matching is by registration number for the roll, which is exact, and by
 * initial plus given name for admissions, which is not: that sheet writes
 * "Г. Цэцбилэг" and some of the children on it never enrolled. Rows that do
 * not match are reported and skipped rather than guessed at - a telephone
 * number attached to the wrong family is worse than a missing one.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pool } from "@workspace/db";

const apply = process.argv.includes("--apply");
if (apply && !process.argv.includes("--yes")) throw new Error("Refusing apply without --yes.");

const ROSTER = resolve(process.cwd(), "../../local-data/extracted/roster.json");

type Row = Record<string, string | number | null>;
const text = (row: Row, key: string) => String(row[key] ?? "").trim();

/**
 * "88111672-аав, 80111672-ээж" into numbers and who each belongs to.
 *
 * A third of the cells name a parent and the rest are bare numbers. The role
 * is kept when it is written and left null when it is not, because "Аав" on
 * an unlabelled number is a fact the sheet does not contain.
 */
const RELATION_MN: Record<string, string> = {
  аав: "Аав", ааав: "Аав", эцэг: "Аав",
  ээж: "Ээж", эх: "Ээж",
  авга: "Асран хамгаалагч", асрагч: "Асран хамгаалагч", "асран хамгаалагч": "Асран хамгаалагч",
  эмээ: "Эмээ", өвөө: "Өвөө", ах: "Ах", эгч: "Эгч",
};

function parsePhones(cell: string) {
  const parts: { phone: string; relationMn: string | null }[] = [];
  for (const chunk of cell.split(/[,;/]+/)) {
    const digits = chunk.replace(/\D/g, "");
    if (digits.length < 6) continue;
    const word = chunk.toLowerCase().replace(/[^а-яөүё\s]/g, " ").trim();
    const relation = Object.entries(RELATION_MN).find(([key]) => word.includes(key));
    parts.push({ phone: digits, relationMn: relation?.[1] ?? null });
  }
  // Two identical numbers in one cell are one number written twice.
  return parts.filter(
    (part, index) => parts.findIndex((other) => other.phone === part.phone) === index);
}

const roster = JSON.parse(readFileSync(ROSTER, "utf8")) as {
  views: { roll: Row[]; admissions: Row[] };
};

const client = await pool.connect();
try {
  const { rows: students } = await client.query<{
    id: string; code: string; externalCode: string | null; name: string;
  }>(`SELECT id::text AS id, student_code AS code, external_code AS "externalCode",
        display_name AS name
      FROM core.students WHERE is_active`);

  const byRegistration = new Map(
    students.filter((row) => row.externalCode)
      .map((row) => [row.externalCode!.trim().toUpperCase(), row]));

  // ---- the roll: names, file status, attendance, notes --------------------
  const details: {
    id: string; familyName: string; givenName: string;
    personalFile: string | null; attendance: string | null; notes: string | null;
  }[] = [];
  const unmatchedRoll: string[] = [];

  for (const row of roster.views.roll) {
    const registration = text(row, "Регистр").toUpperCase();
    const student = registration ? byRegistration.get(registration) : undefined;
    const familyName = text(row, "Овог нэр");
    const givenName = text(row, "Нэр");
    if (!student) {
      if (familyName || givenName) unmatchedRoll.push(`${familyName} ${givenName}`.trim());
      continue;
    }

    // Two sparse admin columns folded into one note, each labelled, rather
    // than two mostly-empty columns on every student row.
    const note = [
      text(row, "Тайлбар"),
      text(row, "Системд") ? `Системд: ${text(row, "Системд")}` : "",
    ].filter(Boolean).join(" · ");

    details.push({
      id: student.id,
      familyName,
      givenName,
      personalFile: text(row, "Хувийн хэрэг") || null,
      attendance: text(row, "Бусад") || null,
      notes: note || null,
    });
  }

  // ---- admissions: parent telephone numbers -------------------------------
  //
  // Keyed on initial plus given name, which is how that sheet writes a child.
  const byInitialAndName = new Map<string, typeof students>();
  for (const row of roster.views.roll) {
    const registration = text(row, "Регистр").toUpperCase();
    const student = registration ? byRegistration.get(registration) : undefined;
    if (!student) continue;
    const family = text(row, "Овог нэр");
    const given = text(row, "Нэр");
    if (!family || !given) continue;
    const key = `${family[0]!.toUpperCase()}|${given.toUpperCase()}`;
    if (!byInitialAndName.has(key)) byInitialAndName.set(key, []);
    byInitialAndName.get(key)!.push(student);
  }

  const contacts: {
    studentId: string; phone: string; relationMn: string | null;
    sequenceNo: number; sourceNote: string;
  }[] = [];
  const unmatchedContacts: string[] = [];
  const ambiguousContacts: string[] = [];

  for (const row of roster.views.admissions) {
    const cell = text(row, "Утас");
    if (!cell) continue;
    const written = text(row, "Сурагчийн овог нэр");
    const parsed = /^([А-ЯӨҮ])\s*\.?\s*([А-Яа-яӨҮөү-]+)/u.exec(written);
    const candidates = parsed
      ? byInitialAndName.get(`${parsed[1]!.toUpperCase()}|${parsed[2]!.toUpperCase()}`)
      : undefined;

    if (!candidates) { unmatchedContacts.push(written); continue; }
    if (candidates.length > 1) { ambiguousContacts.push(written); continue; }

    for (const [index, phone] of parsePhones(cell).entries()) {
      contacts.push({
        studentId: candidates[0]!.id,
        phone: phone.phone,
        relationMn: phone.relationMn,
        sequenceNo: index + 1,
        sourceNote: cell,
      });
    }
  }

  console.log(JSON.stringify({
    activeStudents: students.length,
    rollRows: roster.views.roll.length,
    detailsToWrite: details.length,
    withPersonalFile: details.filter((row) => row.personalFile).length,
    withAttendance: details.filter((row) => row.attendance).length,
    withNotes: details.filter((row) => row.notes).length,
    rollRowsNotOnTheRegister: unmatchedRoll.length,
    admissionsWithAPhone: roster.views.admissions.filter((row) => text(row, "Утас")).length,
    contactsToWrite: contacts.length,
    childrenWithAContact: new Set(contacts.map((row) => row.studentId)).size,
    contactsWithAStatedRelation: contacts.filter((row) => row.relationMn).length,
    admissionsNotOnTheRoll: unmatchedContacts,
    admissionsMatchingTwoChildren: ambiguousContacts,
  }, null, 2));

  if (!apply) {
    console.log("\nDry run. Re-run with --apply --yes to write.");
  } else {
    await client.query("BEGIN");
    try {
      for (const row of details) {
        await client.query(`
          UPDATE core.students SET
            family_name = $2, given_name = $3,
            personal_file_mn = $4, attendance_mn = $5, notes = $6
          WHERE id = $1::bigint`,
          [row.id, row.familyName || null, row.givenName || null,
           row.personalFile, row.attendance, row.notes]);
      }

      // Replaced rather than merged: the sheet is the record, and a number
      // deleted there should not survive here.
      await client.query("DELETE FROM core.student_guardians");
      for (const contact of contacts) {
        await client.query(`
          INSERT INTO core.student_guardians
            (student_id, relation_mn, phone, sequence_no, source_note)
          VALUES ($1::bigint, $2, $3, $4, $5)
          ON CONFLICT (student_id, phone) DO NOTHING`,
          [contact.studentId, contact.relationMn, contact.phone,
           contact.sequenceNo, contact.sourceNote]);
      }
      await client.query("COMMIT");

      const { rows: [count] } = await client.query<Record<string, string>>(`
        SELECT (SELECT count(*)::text FROM core.students WHERE given_name IS NOT NULL) AS named,
               (SELECT count(*)::text FROM core.student_guardians) AS contacts,
               (SELECT count(DISTINCT student_id)::text FROM core.student_guardians) AS families`);
      console.log(`\nWritten. Named in two parts: ${count.named}.`
        + ` Contacts: ${count.contacts} across ${count.families} children.`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
} finally {
  client.release();
  await pool.end();
}
