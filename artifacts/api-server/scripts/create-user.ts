/**
 * Creates an account. Run it once to get the first ADMIN, since there is no
 * self-registration and every later account is created through a signed-in
 * admin.
 *
 *   node scripts/create-user.ts --username admin --role ADMIN \
 *     --display-name "Н. Нурлан" [--password "..."] [--teacher-code T-01] \
 *     [--subject-code MGL] [--student-code S-0001]
 *
 * Without --password a strong one is generated and printed once.
 */
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  db,
  pool,
  studentsInCore,
  subjectsInCore,
  teachersInCore,
  userRolesInCore,
  usersInCore,
} from "@workspace/db";
import { hashPassword } from "../src/shared/password";

const ROLES = ["STUDENT", "TEACHER", "ADMIN"] as const;
type Role = (typeof ROLES)[number];

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const username = flag("username")?.trim();
const displayName = flag("display-name")?.trim();
const role = flag("role")?.toUpperCase() as Role | undefined;
const studentCode = flag("student-code")?.trim();
const teacherCode = flag("teacher-code")?.trim();
const subjectCode = flag("subject-code")?.trim();

if (!username) fail("--username is required.");
if (!displayName) fail("--display-name is required.");
if (!role || !ROLES.includes(role)) {
  fail(`--role must be one of ${ROLES.join(", ")}.`);
}
if (role === "TEACHER" && !teacherCode) {
  fail("--teacher-code is required for a TEACHER.");
}

const password = flag("password") ?? randomBytes(12).toString("base64url");
const generated = !flag("password");
if (password.length < 12) fail("Password must be at least 12 characters.");

try {
  const existing = await db
    .select({ id: usersInCore.id })
    .from(usersInCore)
    .where(eq(usersInCore.username, username))
    .limit(1);
  if (existing.length) fail(`Username "${username}" already exists. No change.`);

  let studentId: number | null = null;
  if (studentCode) {
    const [student] = await db
      .select({ id: studentsInCore.id })
      .from(studentsInCore)
      .where(eq(studentsInCore.studentCode, studentCode))
      .limit(1);
    if (!student) fail(`No student with code "${studentCode}".`);
    studentId = student.id;
  }

  let subjectId: number | null = null;
  if (subjectCode) {
    const [subject] = await db
      .select({ id: subjectsInCore.id })
      .from(subjectsInCore)
      .where(eq(subjectsInCore.code, subjectCode))
      .limit(1);
    if (!subject) fail(`No subject with code "${subjectCode}".`);
    subjectId = subject.id;
  }

  const passwordHash = await hashPassword(password);

  // One transaction: an account without its role would be able to sign in and
  // do nothing, and a teacher row without its account cannot be reached.
  await db.transaction(async (tx) => {
    const [user] = await tx
      .insert(usersInCore)
      .values({ username, passwordHash, displayName, studentId })
      .returning({ id: usersInCore.id });

    await tx.insert(userRolesInCore).values({ userId: user.id, role });

    if (role === "TEACHER") {
      await tx
        .insert(teachersInCore)
        .values({ userId: user.id, teacherCode: teacherCode!, subjectId });
    }
  });

  console.log(`Created ${role} "${username}" (${displayName}).`);
  if (generated) {
    console.log(`Password: ${password}`);
    console.log("Shown once. Store it now and change it after first sign-in.");
  }
} catch (error) {
  const detail = error instanceof Error ? error.message : String(error);
  console.error(`Failed: ${detail}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
