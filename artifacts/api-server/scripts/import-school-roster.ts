/**
 * Imports the school's real classes, students and staff from the audited
 * roster extraction. Teacher/class/subject links intentionally stay empty.
 *
 * Dry-run (default):
 *   node scripts/run-ts.mjs scripts/import-school-roster.ts
 *
 * Apply, replacing only MOCK people/classes:
 *   node scripts/run-ts.mjs scripts/import-school-roster.ts --apply --replace-mock --yes
 */
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pool } from "@workspace/db";
import { hashPassword } from "../src/shared/password";

type CellRow = Record<string, string | number> & { _row: number };
type Roster = {
  raw: {
    teachers: { sha256: string };
    students: { sha256: string };
  };
  views: {
    staff: CellRow[];
    roll: CellRow[];
  };
};

const SCHOOL_YEAR = "2026-2027";
const CODE_YEAR = "2627";
const apply = process.argv.includes("--apply");
const verifyDb = process.argv.includes("--verify-db");
const confirmed = process.argv.includes("--yes");
const replaceMock = process.argv.includes("--replace-mock");

const text = (value: unknown) => String(value ?? "").normalize("NFKC").trim();
const identity = (value: unknown) => text(value).replace(/\s+/g, "").toUpperCase();
const isActive = (value: unknown) => text(value).toLowerCase() === "идэвхтэй";

function staffRole(titleValue: unknown): "TEACHER" | "ADMIN" | null {
  const title = text(titleValue).toLowerCase();
  if (title.includes("багш")) return "TEACHER";
  if (title.includes("захирал") || title.includes("менежер")) return "ADMIN";
  return null;
}

function classInfo(value: unknown) {
  const label = text(value).toLowerCase().replace(/\s+/g, "");
  const match = /^(\d{1,2})([а-яөү])$/u.exec(label);
  if (!match) return null;
  const letterMap: Record<string, string> = {
    а: "A", б: "B", в: "V", г: "G", д: "D", е: "E",
  };
  return {
    label,
    grade: Number(match[1]),
    code: `EJ-${CODE_YEAR}-${match[1]}${letterMap[match[2]] ?? match[2].toUpperCase()}`,
  };
}

function firstEmail(value: unknown) {
  const candidate = text(value).split(",")[0]?.trim().toLowerCase() ?? "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate) ? candidate : null;
}

const extracted = path.resolve(process.cwd(), "../../local-data/extracted/roster.json");
const payload = JSON.parse(await readFile(extracted, "utf8")) as Roster;

const issues: string[] = [];
const seenRegisters = new Map<string, number>();
const seenClasses = new Map<string, ReturnType<typeof classInfo>>();
const students = payload.views.roll.flatMap((row, index) => {
  const surname = text(row["Овог нэр"]);
  const givenName = text(row["Нэр"]);
  const klass = classInfo(row["Бүлэг"]);
  const register = text(row["Регистр"]);

  // Excel contains two number-only remnants. They are not people.
  if (!surname && !givenName && !klass && !register) return [];
  if (!givenName) {
    issues.push(`CRITICAL student row ${row._row}: name is missing`);
    return [];
  }
  if (!klass || klass.grade < 1 || klass.grade > 12) {
    issues.push(`CRITICAL student row ${row._row}: class is missing or invalid`);
    return [];
  }
  seenClasses.set(klass.code, klass);
  const registerKey = identity(register);
  if (registerKey) {
    const prior = seenRegisters.get(registerKey);
    if (prior) issues.push(`CRITICAL student rows ${prior}/${row._row}: duplicate register`);
    seenRegisters.set(registerKey, row._row);
  }
  return [{
    sourceRow: row._row,
    studentCode: `EJ-${CODE_YEAR}-S${String(index + 1).padStart(4, "0")}`,
    displayName: [surname, givenName].filter(Boolean).join(" "),
    externalCode: register || null,
    identityPending: !register,
    classCode: klass.code,
  }];
});

const usedUsernames = new Set<string>();
const staff = payload.views.staff.flatMap((row, index) => {
  const role = staffRole(row["Албан тушаал"]);
  if (!role) return [];
  const displayName = text(row["Нэр"]);
  const email = firstEmail(row["Имэйл хаяг"]);
  let username = email ?? `${role === "TEACHER" ? "bagsh" : "admin"}-${String(index + 1).padStart(3, "0")}`;
  if (usedUsernames.has(username)) username = `${username}-${index + 1}`;
  usedUsernames.add(username);
  return [{
    sourceRow: row._row,
    role,
    displayName,
    username,
    teacherCode: role === "TEACHER" ? `EJ-${CODE_YEAR}-T${String(index + 1).padStart(3, "0")}` : null,
    active: isActive(row["Төлөв"]),
  }];
});

const omittedStaff = payload.views.staff.filter((row) => !staffRole(row["Албан тушаал"]));
const classes = [...seenClasses.values()].filter(Boolean).sort((a, b) =>
  a!.grade - b!.grade || a!.label.localeCompare(b!.label, "mn"),
) as NonNullable<ReturnType<typeof classInfo>>[];
const critical = issues.filter((issue) => issue.startsWith("CRITICAL"));

console.log("Roster import plan");
console.log(`  source fingerprints  teachers=${payload.raw.teachers.sha256.slice(0, 12)} students=${payload.raw.students.sha256.slice(0, 12)}`);
console.log(`  classes              ${classes.length}`);
console.log(`  students             ${students.length} (${students.filter((s) => s.identityPending).length} identity pending)`);
console.log(`  teachers             ${staff.filter((s) => s.role === "TEACHER").length}`);
console.log(`  admins               ${staff.filter((s) => s.role === "ADMIN").length}`);
console.log(`  other staff omitted  ${omittedStaff.length}`);
console.log("  teacher links        0 (deferred by design)");
for (const issue of issues) console.log(`  ${issue}`);

if (!apply) {
  if (verifyDb) {
    const verified = await pool.query(`
      SELECT
        (SELECT count(*)::int FROM core.classes WHERE data_origin = 'MOCK') AS mock_classes,
        (SELECT count(*)::int FROM core.students WHERE data_origin = 'MOCK') AS mock_students,
        (SELECT count(*)::int FROM core.teachers WHERE data_origin = 'MOCK') AS mock_teachers,
        (SELECT count(*)::int FROM core.classes WHERE data_origin = 'REAL') AS real_classes,
        (SELECT count(*)::int FROM core.students WHERE data_origin = 'REAL') AS real_students,
        (SELECT count(*)::int FROM core.teachers WHERE data_origin = 'REAL') AS real_teachers,
        (SELECT count(*)::int FROM core.student_enrollments e JOIN core.students s ON s.id=e.student_id WHERE s.data_origin='REAL' AND e.is_active) AS real_enrollments,
        (SELECT count(*)::int FROM core.students WHERE data_origin='REAL' AND external_code IS NULL) AS identity_pending,
        (SELECT count(*)::int FROM core.class_teachers ct JOIN core.teachers t ON t.id=ct.teacher_id WHERE t.data_origin='REAL') AS teacher_links`);
    console.log("\nDatabase verification", verified.rows[0]);
  }
  console.log("\nDRY RUN only. Database was not changed.");
  await pool.end();
  process.exit(critical.length ? 1 : 0);
}
if (!confirmed || !replaceMock) {
  console.error("Apply requires --apply --replace-mock --yes.");
  await pool.end();
  process.exit(2);
}
if (critical.length) {
  console.error("Refusing to apply while critical validation issues remain.");
  await pool.end();
  process.exit(1);
}

const accounts = await Promise.all(staff.map(async (person) => {
  const password = randomBytes(12).toString("base64url");
  return { ...person, password, passwordHash: await hashPassword(password) };
}));

const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(182026)");

  const existing = await client.query(`
    SELECT
      (SELECT count(*)::int FROM core.classes WHERE data_origin = 'REAL') AS real_classes,
      (SELECT count(*)::int FROM core.students WHERE data_origin = 'REAL') AS real_students,
      (SELECT count(*)::int FROM core.teachers WHERE data_origin = 'REAL') AS real_teachers`);
  const counts = existing.rows[0];
  if (counts.real_classes || counts.real_students || counts.real_teachers) {
    throw new Error(`REAL data already exists (classes=${counts.real_classes}, students=${counts.real_students}, teachers=${counts.real_teachers}); refusing to duplicate it`);
  }

  // Remove only rows tied to MOCK people/classes. Content and subjects are a
  // separate import domain and are intentionally untouched here.
  await client.query(`DELETE FROM core.users WHERE student_id IN (SELECT id FROM core.students WHERE data_origin = 'MOCK')`);
  await client.query(`DELETE FROM assessment.diagnostic_attempts WHERE student_id IN (SELECT id FROM core.students WHERE data_origin = 'MOCK')`);
  await client.query(`DELETE FROM assessment.web_diagnostic_submissions WHERE student_id IN (SELECT id FROM core.students WHERE data_origin = 'MOCK')`);
  await client.query(`DELETE FROM learning.student_skill_mastery WHERE student_id IN (SELECT id FROM core.students WHERE data_origin = 'MOCK')`);
  await client.query(`DELETE FROM core.student_enrollments WHERE student_id IN (SELECT id FROM core.students WHERE data_origin = 'MOCK')`);
  await client.query(`DELETE FROM core.students WHERE data_origin = 'MOCK'`);

  // Classes go before their creators' accounts: deleting a class cascades its
  // demo schedule, whose created_by key otherwise correctly protects the user.
  await client.query(`DELETE FROM core.student_enrollments WHERE class_id IN (SELECT id FROM core.classes WHERE data_origin = 'MOCK')`);
  await client.query(`DELETE FROM core.classes WHERE data_origin = 'MOCK'`);

  const mockTeacherUsers = await client.query(`SELECT user_id FROM core.teachers WHERE data_origin = 'MOCK'`);
  await client.query(`DELETE FROM core.teachers WHERE data_origin = 'MOCK'`);
  if (mockTeacherUsers.rowCount) {
    await client.query(`DELETE FROM core.users WHERE id = ANY($1::bigint[])`, [mockTeacherUsers.rows.map((r) => r.user_id)]);
  }
  await client.query(`DELETE FROM core.users WHERE username LIKE 'demo-%'`);

  const gradeRows = await client.query(`SELECT id, grade_number FROM core.grade_levels WHERE grade_number BETWEEN 1 AND 12`);
  const grades = new Map(gradeRows.rows.map((row) => [Number(row.grade_number), Number(row.id)]));
  if (grades.size !== 12) throw new Error(`Expected grade levels 1-12; found ${grades.size}`);

  const classIds = new Map<string, number>();
  for (const klass of classes) {
    const result = await client.query(
      `INSERT INTO core.classes (class_code, grade_level_id, name_mn, school_year, data_origin)
       VALUES ($1,$2,$3,$4,'REAL') RETURNING id`,
      [klass.code, grades.get(klass.grade), klass.label, SCHOOL_YEAR],
    );
    classIds.set(klass.code, Number(result.rows[0].id));
  }

  for (const student of students) {
    const result = await client.query(
      `INSERT INTO core.students (student_code, external_code, display_name, data_origin)
       VALUES ($1,$2,$3,'REAL') RETURNING id`,
      [student.studentCode, student.externalCode, student.displayName],
    );
    await client.query(
      `INSERT INTO core.student_enrollments (student_id, class_id) VALUES ($1,$2)`,
      [result.rows[0].id, classIds.get(student.classCode)],
    );
  }

  for (const person of accounts) {
    const user = await client.query(
      `INSERT INTO core.users (username, password_hash, display_name, is_active)
       VALUES ($1,$2,$3,$4) RETURNING id`,
      [person.username, person.passwordHash, person.displayName, person.active],
    );
    await client.query(`INSERT INTO core.user_roles (user_id, role) VALUES ($1,$2)`, [user.rows[0].id, person.role]);
    if (person.role === "TEACHER") {
      await client.query(
        `INSERT INTO core.teachers (user_id, teacher_code, subject_id, is_active, data_origin)
         VALUES ($1,$2,NULL,$3,'REAL')`,
        [user.rows[0].id, person.teacherCode, person.active],
      );
    }
  }

  await client.query("COMMIT");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}

const output = path.resolve(process.cwd(), "../../local-data/generated/real-staff-accounts.json");
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, JSON.stringify({
  schoolYear: SCHOOL_YEAR,
  sourceFingerprints: {
    teachers: payload.raw.teachers.sha256,
    students: payload.raw.students.sha256,
  },
  accounts: accounts.map(({ passwordHash: _passwordHash, ...account }) => account),
}, null, 2) + "\n", { mode: 0o600 });

console.log("\nImport committed.");
console.log(`Account credentials written to ${output}`);
