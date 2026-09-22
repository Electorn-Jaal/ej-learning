/**
 * Records the children who left, and where they went.
 *
 * Dry-run (default): pnpm --filter @workspace/api-server import-student-transfers
 * Apply:             pnpm --filter @workspace/api-server import-student-transfers -- --apply --yes
 *
 * Forty-five children moved school, and the register says for each one which
 * school, why, when the personal file was handed over and to whom, and when
 * the removal was processed. None of it was in the system, which is why last
 * year's roll of 239 and this year's 247 could not be reconciled: the 46 who
 * are on one and not the other were simply absent rather than accounted for.
 *
 * Each of them gets a core.students row with is_active false, not a row
 * deleted. A register that forgets who has been through it cannot issue a
 * leaving certificate, and a child who comes back should come back to their
 * own record rather than to a new one.
 *
 * They are matched to the current roll first, in case the sheets disagree
 * about who is still here. They should not overlap - checked, and they do not -
 * but a child appearing on both is the one error in this data that would
 * matter, so it is refused rather than resolved.
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
 * "2026.09.07" into a date, and anything else into nothing.
 *
 * A third of the removal cells say "Хийсэн" - done - with no date. That is a
 * fact about the process, not a date, and turning it into one would invent a
 * day the registrar never wrote.
 */
function parseDate(value: string) {
  const match = /^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})$/.exec(value.trim());
  if (!match) return null;
  const [, year, month, day] = match;
  const iso = `${year}-${month!.padStart(2, "0")}-${day!.padStart(2, "0")}`;
  return Number.isNaN(Date.parse(`${iso}T00:00:00Z`)) ? null : iso;
}

const roster = JSON.parse(readFileSync(ROSTER, "utf8")) as {
  views: { roll: Row[]; transferredOut: Row[] };
};

const onTheRoll = new Set(
  roster.views.roll.map((row) => text(row, "Регистр").toUpperCase()).filter(Boolean));

type Leaver = {
  registration: string; familyName: string; givenName: string;
  leftClass: string | null; destination: string | null; reason: string | null;
  fileHandover: string | null; removedOn: string | null; removedNote: string | null;
};

const leavers: Leaver[] = [];
const stillOnTheRoll: string[] = [];
const unusable: string[] = [];

for (const row of roster.views.transferredOut) {
  const registration = text(row, "РД").toUpperCase();
  const familyName = text(row, "Овог");
  const givenName = text(row, "Нэр");
  if (!registration || !givenName) {
    if (familyName || givenName || registration) {
      unusable.push(`${familyName} ${givenName}`.trim() || registration);
    }
    continue;
  }
  if (onTheRoll.has(registration)) { stillOnTheRoll.push(`${familyName} ${givenName}`); continue; }

  const removal = text(row, "Хасалт");
  const removedOn = parseDate(removal);
  leavers.push({
    registration,
    familyName,
    givenName,
    leftClass: text(row, "Бүлэг") || null,
    destination: text(row, "Шилжих сургууль") || null,
    reason: text(row, "Шалтгаан") || null,
    fileHandover: text(row, "Хувийн хэрэг") || null,
    removedOn,
    removedNote: removedOn ? null : removal || null,
  });
}

console.log(JSON.stringify({
  transferSheetRows: roster.views.transferredOut.length,
  toRecord: leavers.length,
  withDestination: leavers.filter((row) => row.destination).length,
  withReason: leavers.filter((row) => row.reason).length,
  withRemovalDate: leavers.filter((row) => row.removedOn).length,
  removalNotedWithoutADate: leavers.filter((row) => row.removedNote).length,
  byReason: leavers.reduce<Record<string, number>>(
    (acc, row) => ({ ...acc, [row.reason ?? "(бичигдээгүй)"]: (acc[row.reason ?? "(бичигдээгүй)"] ?? 0) + 1 }), {}),
  alsoOnTheCurrentRoll: stillOnTheRoll,
  rowsWithoutANameOrNumber: unusable.length,
}, null, 2));

if (stillOnTheRoll.length) {
  throw new Error(
    "Refusing to import: these children are on the current roll and the transfer"
    + " sheet at once, so one of the two sheets is wrong about them.");
}

const client = await pool.connect();
try {
  const { rows: existing } = await client.query<{ id: string; externalCode: string }>(
    "SELECT id::text AS id, external_code AS \"externalCode\" FROM core.students WHERE external_code IS NOT NULL");
  const byRegistration = new Map(
    existing.map((row) => [row.externalCode.trim().toUpperCase(), row.id]));

  const { rows: [seq] } = await client.query<{ next: string }>(
    `SELECT COALESCE(max(substring(student_code from 'S(\\d+)$')::int), 0) + 1 AS next
     FROM core.students WHERE student_code LIKE 'EJ-2627-S%'`);
  let nextNumber = Number(seq.next);

  console.log(`\n${leavers.filter((row) => byRegistration.has(row.registration)).length}`
    + ` already have a record; the rest would be created from EJ-2627-S`
    + `${String(nextNumber).padStart(4, "0")}.`);

  if (!apply) {
    console.log("\nDry run. Re-run with --apply --yes to write.");
  } else {
    await client.query("BEGIN");
    try {
      for (const leaver of leavers) {
        let studentId = byRegistration.get(leaver.registration);
        if (!studentId) {
          const { rows: [created] } = await client.query<{ id: string }>(`
            INSERT INTO core.students
              (student_code, external_code, display_name, family_name, given_name,
               is_active, data_origin)
            VALUES ($1, $2, $3, $4, $5, false, 'REAL')
            RETURNING id::text AS id`,
            [`EJ-2627-S${String(nextNumber).padStart(4, "0")}`, leaver.registration,
             `${leaver.familyName} ${leaver.givenName}`.trim(),
             leaver.familyName || null, leaver.givenName]);
          studentId = created.id;
          nextNumber += 1;
        } else {
          // Already known - a child the roll import created. Leaving them
          // active would keep them in class lists they have left.
          await client.query(
            "UPDATE core.students SET is_active = false WHERE id = $1::bigint", [studentId]);
        }

        await client.query(`
          INSERT INTO core.student_transfers
            (student_id, left_class_mn, destination_mn, reason_mn,
             file_handover_mn, removed_on, removed_note_mn)
          VALUES ($1::bigint, $2, $3, $4, $5, $6::date, $7)
          ON CONFLICT (student_id) DO UPDATE SET
            left_class_mn = EXCLUDED.left_class_mn,
            destination_mn = EXCLUDED.destination_mn,
            reason_mn = EXCLUDED.reason_mn,
            file_handover_mn = EXCLUDED.file_handover_mn,
            removed_on = EXCLUDED.removed_on,
            removed_note_mn = EXCLUDED.removed_note_mn`,
          [studentId, leaver.leftClass, leaver.destination, leaver.reason,
           leaver.fileHandover, leaver.removedOn, leaver.removedNote]);
      }
      await client.query("COMMIT");

      const { rows: [count] } = await client.query<Record<string, string>>(`
        SELECT (SELECT count(*)::text FROM core.student_transfers) AS transfers,
               (SELECT count(*)::text FROM core.students WHERE is_active) AS active,
               (SELECT count(*)::text FROM core.students WHERE NOT is_active) AS former`);
      console.log(`\nWritten. Transfers: ${count.transfers}.`
        + ` Students: ${count.active} active, ${count.former} former.`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
} finally {
  client.release();
  await pool.end();
}
