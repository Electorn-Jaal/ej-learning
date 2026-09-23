/**
 * Gives every child and teacher a password nobody can guess.
 *
 * Dry-run (default): pnpm --filter @workspace/api-server reset-roster-passwords
 * Apply:             pnpm --filter @workspace/api-server reset-roster-passwords -- --apply --yes
 *
 * The roster was set up with passwords derived from the account number -
 * ej26s0106 had Ej26S0106! - which is fine on a laptop nobody else can reach
 * and unacceptable the moment the school is on the internet. Anyone who can
 * read one child's login can read all 292, including their names, their
 * placement level and every answer they have given.
 *
 * Usernames are left alone. A username is not a secret, changing them would
 * invalidate every list the school has already printed, and the numbering is
 * how staff find a child in the register.
 *
 * Passwords are random and typed by children, so the alphabet leaves out the
 * characters that look alike on paper - no O or 0, no l, I or 1 - and the
 * groups are separated by dashes, which is how people read a code aloud
 * without losing their place.
 *
 * Nothing is printed. The new passwords are written to two files in
 * local-data/generated, readable only by the person who ran this, for the
 * school to print and hand out. They are the only copy: the database keeps a
 * hash, so a lost file means resetting again, not recovering.
 */
import { randomInt } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pool } from "@workspace/db";
import { hashPassword } from "../src/shared/password";
import { login, logout } from "../src/modules/identity/service";

const apply = process.argv.includes("--apply");
if (apply && !process.argv.includes("--yes")) throw new Error("Refusing apply without --yes.");

/** No character that can be mistaken for another when read off a printed slip. */
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

/** Twelve characters in three groups: 59 bits, and still readable aloud. */
function newPassword() {
  const pick = () => ALPHABET[randomInt(ALPHABET.length)];
  const group = () => Array.from({ length: 4 }, pick).join("");
  return `${group()}-${group()}-${group()}`;
}

const csv = (rows: string[][]) =>
  rows
    .map((row) =>
      row
        .map((cell) => (/[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell))
        .join(","),
    )
    .join("\n") + "\n";

type Account = { userId: string; username: string; displayName: string; extra: string };

const students = (await pool.query<Account>(`
  SELECT u.id AS "userId", u.username, s.display_name AS "displayName",
         COALESCE(c.name_mn, '') AS extra
    FROM core.students s
    JOIN core.users u ON u.student_id = s.id
    LEFT JOIN core.student_enrollments e ON e.student_id = s.id AND e.is_active
    LEFT JOIN core.classes c ON c.id = e.class_id
   WHERE s.data_origin = 'REAL' AND u.is_active
   ORDER BY c.name_mn, s.display_name`)).rows;

const staff = (await pool.query<Account>(`
  SELECT u.id AS "userId", u.username, u.display_name AS "displayName",
         t.teacher_code AS extra
    FROM core.teachers t
    JOIN core.users u ON u.id = t.user_id
   WHERE t.data_origin = 'REAL' AND u.is_active
   ORDER BY t.teacher_code`)).rows;

console.log(`Сурагч ${students.length}, багш ${staff.length}.`);

// Administrators are deliberately absent: their accounts are held by named
// people who chose their own passwords, and resetting those from a script
// would lock out whoever is holding the school together this week.
if (!apply) {
  console.log("\nТуршилт. Жишээ нууц үг:", newPassword());
  console.log("Хэрэгжүүлэхдээ --apply --yes нэм.");
  await pool.end();
  process.exit(0);
}

const issued = await Promise.all(
  [...students, ...staff].map(async (account) => {
    const password = newPassword();
    return { ...account, password, passwordHash: await hashPassword(password) };
  }),
);

const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(182029)");
  for (const account of issued) {
    await client.query(
      "UPDATE core.users SET password_hash = $1, updated_at = now() WHERE id = $2",
      [account.passwordHash, account.userId],
    );
  }
  await client.query("COMMIT");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
}

const generatedDir = path.resolve(process.cwd(), "../../local-data/generated");
await mkdir(generatedDir, { recursive: true });
const stamp = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ulaanbaatar" }).format(new Date());

const studentRows = issued.slice(0, students.length);
const staffRows = issued.slice(students.length);

await writeFile(
  path.join(generatedDir, `student-passwords-${stamp}.csv`),
  csv([["Анги", "Нэр", "Нэвтрэх нэр", "Нууц үг"],
    ...studentRows.map((a) => [a.extra, a.displayName, a.username, a.password])]),
  { mode: 0o600 },
);
await writeFile(
  path.join(generatedDir, `staff-passwords-${stamp}.csv`),
  csv([["Багшийн код", "Нэр", "Нэвтрэх нэр", "Нууц үг"],
    ...staffRows.map((a) => [a.extra, a.displayName, a.username, a.password])]),
  { mode: 0o600 },
);

// Proof that what was written to the files is what the database will accept.
// A reset that silently hashed something else is otherwise discovered by a
// child who cannot log in on the first morning.
for (const sample of [studentRows[0], staffRows[0]]) {
  if (!sample) continue;
  const session = await login(sample.username, sample.password);
  if (!session.user) throw new Error(`Verification failed for ${sample.username}`);
  await logout(session.token);
}

console.log(`\nШинэчиллээ: ${issued.length} бүртгэл.`);
console.log(`local-data/generated/student-passwords-${stamp}.csv`);
console.log(`local-data/generated/staff-passwords-${stamp}.csv`);
console.log("Нэвтрэлт шалгагдсан. Файлууд нь цорын ганц хувь — хэвлээд хадгал.");
await pool.end();
