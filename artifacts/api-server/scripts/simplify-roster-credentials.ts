/** Replace generated roster credentials with predictable temporary ones. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pool } from "@workspace/db";
import { hashPassword } from "../src/shared/password";
import { login, logout } from "../src/modules/identity/service";

if (!process.argv.includes("--yes")) {
  console.error("Refusing to reset roster credentials without --yes.");
  await pool.end();
  process.exit(2);
}

const generatedDir = path.resolve(process.cwd(), "../../local-data/generated");
const studentFile = path.join(generatedDir, "real-student-accounts.json");
const staffFile = path.join(generatedDir, "real-staff-accounts.json");

const students = (await pool.query<{
  user_id: string;
  student_code: string;
  display_name: string;
}>(`
  SELECT u.id AS user_id, s.student_code, s.display_name
    FROM core.students s
    JOIN core.users u ON u.student_id=s.id
   WHERE s.data_origin='REAL'
   ORDER BY s.student_code`)).rows;

const teachers = (await pool.query<{
  user_id: string;
  teacher_code: string;
  display_name: string;
}>(`
  SELECT u.id AS user_id, t.teacher_code, u.display_name
    FROM core.teachers t
    JOIN core.users u ON u.id=t.user_id
   WHERE t.data_origin='REAL'
   ORDER BY t.teacher_code`)).rows;

const studentCredentials = await Promise.all(students.map(async (student, index) => {
  const serial = String(index + 1).padStart(4, "0");
  const username = `ej26s${serial}`;
  const password = `Ej26S${serial}!`;
  return { ...student, username, password, passwordHash: await hashPassword(password) };
}));

const teacherCredentials = await Promise.all(teachers.map(async (teacher, index) => {
  const serial = String(index + 1).padStart(3, "0");
  const username = `ej26t${serial}`;
  const password = `Ej26T${serial}!`;
  return { ...teacher, username, password, passwordHash: await hashPassword(password) };
}));

const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(182028)");

  // Temporary unique names make this safe to rerun even if numbering changes.
  for (const [index, account] of [...studentCredentials, ...teacherCredentials].entries()) {
    await client.query(`UPDATE core.users SET username=$1 WHERE id=$2`, [
      `credential-reset-${Date.now()}-${index}`,
      account.user_id,
    ]);
  }
  for (const account of [...studentCredentials, ...teacherCredentials]) {
    await client.query(
      `UPDATE core.users SET username=$1, password_hash=$2, updated_at=now() WHERE id=$3`,
      [account.username, account.passwordHash, account.user_id],
    );
  }
  await client.query("COMMIT");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
}

const priorStaff = JSON.parse(await readFile(staffFile, "utf8")) as {
  schoolYear: string;
  sourceFingerprints: Record<string, string>;
  accounts: Record<string, unknown>[];
};
const teacherByCode = new Map(teacherCredentials.map((account) => [account.teacher_code, account]));
const updatedStaff = priorStaff.accounts.map((account) => {
  if (account.role !== "TEACHER") return account;
  const replacement = teacherByCode.get(String(account.teacherCode));
  if (!replacement) throw new Error(`No imported teacher matches ${String(account.teacherCode)}`);
  return { ...account, username: replacement.username, password: replacement.password };
});

await mkdir(generatedDir, { recursive: true });
await writeFile(studentFile, JSON.stringify({
  accounts: studentCredentials.map(({ passwordHash: _hash, user_id: _id, ...account }) => ({
    studentCode: account.student_code,
    displayName: account.display_name,
    username: account.username,
    password: account.password,
  })),
}, null, 2) + "\n", { mode: 0o600 });
await writeFile(staffFile, JSON.stringify({ ...priorStaff, accounts: updatedStaff }, null, 2) + "\n", { mode: 0o600 });

const studentSession = await login(studentCredentials[0].username, studentCredentials[0].password);
if (!studentSession.user.roles.includes("STUDENT") || !studentSession.user.studentId) {
  throw new Error("Student credential verification failed.");
}
await logout(studentSession.token);
const teacherSession = await login(teacherCredentials[0].username, teacherCredentials[0].password);
if (!teacherSession.user.roles.includes("TEACHER") || !teacherSession.user.teacherId) {
  throw new Error("Teacher credential verification failed.");
}
await logout(teacherSession.token);

console.log(`Reset ${studentCredentials.length} student credentials (ej26s0001...).`);
console.log(`Reset ${teacherCredentials.length} teacher credentials (ej26t001...).`);
console.log("Student login: PASS");
console.log("Teacher login: PASS");
await pool.end();
