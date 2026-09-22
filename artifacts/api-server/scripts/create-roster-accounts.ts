/** Create missing login accounts for every imported REAL student and verify
 * one student and one active teacher through the production login service. */
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pool } from "@workspace/db";
import { hashPassword } from "../src/shared/password";
import { login, logout } from "../src/modules/identity/service";

console.log("Roster account creation started.");

if (!process.argv.includes("--yes")) {
  console.error("Refusing to create accounts without --yes.");
  await pool.end();
  process.exit(2);
}

type SavedAccount = {
  studentCode: string;
  displayName: string;
  username: string;
  password: string;
};

const generatedDir = path.resolve(process.cwd(), "../../local-data/generated");
const studentFile = path.join(generatedDir, "real-student-accounts.json");
const staffFile = path.join(generatedDir, "real-staff-accounts.json");

let previouslySaved: SavedAccount[] = [];
try {
  const saved = JSON.parse(await readFile(studentFile, "utf8")) as { accounts?: SavedAccount[] };
  previouslySaved = saved.accounts ?? [];
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

const savedByCode = new Map(previouslySaved.map((account) => [account.studentCode, account]));
const client = await pool.connect();
const created: SavedAccount[] = [];

try {
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(182027)");
  const rows = await client.query<{
    id: string;
    student_code: string;
    display_name: string;
    user_id: string | null;
    username: string | null;
  }>(`
    SELECT s.id, s.student_code, s.display_name, u.id AS user_id, u.username
      FROM core.students s
      LEFT JOIN core.users u ON u.student_id = s.id
     WHERE s.data_origin = 'REAL'
     ORDER BY s.student_code`);

  for (const student of rows.rows) {
    const saved = savedByCode.get(student.student_code);
    if (student.user_id && saved) continue;
    const username = student.username ?? student.student_code.toLowerCase();
    const password = randomBytes(12).toString("base64url");
    const passwordHash = await hashPassword(password);
    const user = student.user_id
      ? await client.query(
          `UPDATE core.users SET password_hash=$1, is_active=true, updated_at=now()
            WHERE id=$2 RETURNING id`,
          [passwordHash, student.user_id],
        )
      : await client.query(
          `INSERT INTO core.users (username, password_hash, display_name, student_id)
           VALUES ($1,$2,$3,$4) RETURNING id`,
          [username, passwordHash, student.display_name, student.id],
        );
    await client.query(
      `INSERT INTO core.user_roles (user_id, role) VALUES ($1,'STUDENT') ON CONFLICT DO NOTHING`,
      [user.rows[0].id],
    );
    created.push({
      studentCode: student.student_code,
      displayName: student.display_name,
      username,
      password,
    });
  }
  await client.query("COMMIT");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
}

for (const account of created) savedByCode.set(account.studentCode, account);
const allAccounts = [...savedByCode.values()].sort((a, b) => a.studentCode.localeCompare(b.studentCode));
await mkdir(generatedDir, { recursive: true });
await writeFile(studentFile, JSON.stringify({ accounts: allAccounts }, null, 2) + "\n", { mode: 0o600 });

const studentSample = allAccounts[0];
if (!studentSample) throw new Error("No saved student credential is available for login verification.");
const studentSession = await login(studentSample.username, studentSample.password);
if (!studentSession.user.roles.includes("STUDENT") || !studentSession.user.studentId) {
  throw new Error("Student login succeeded without the expected STUDENT identity.");
}
await logout(studentSession.token);

const staffPayload = JSON.parse(await readFile(staffFile, "utf8")) as {
  accounts: { role: string; active: boolean; username: string; password: string }[];
};
const teacherSample = staffPayload.accounts.find((account) => account.role === "TEACHER" && account.active);
if (!teacherSample) throw new Error("No active teacher credential is available for login verification.");
const teacherSession = await login(teacherSample.username, teacherSample.password);
if (!teacherSession.user.roles.includes("TEACHER") || !teacherSession.user.teacherId) {
  throw new Error("Teacher login succeeded without the expected TEACHER identity.");
}
await logout(teacherSession.token);

const counts = await pool.query(`
  SELECT
    (SELECT count(*)::int FROM core.students s JOIN core.users u ON u.student_id=s.id WHERE s.data_origin='REAL') AS student_accounts,
    (SELECT count(*)::int FROM core.teachers t JOIN core.users u ON u.id=t.user_id WHERE t.data_origin='REAL') AS teacher_accounts`);

console.log(`Created ${created.length} missing student accounts.`);
console.log("Account verification", counts.rows[0]);
console.log("Student login: PASS");
console.log("Teacher login: PASS");
console.log(`Student credentials written to ${studentFile}`);
await pool.end();
