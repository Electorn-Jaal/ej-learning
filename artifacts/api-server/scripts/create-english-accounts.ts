/**
 * Gives the imported English students a way to log in.
 *
 *   node scripts/run-ts.mjs scripts/create-english-accounts.ts --yes
 *
 * 81 of them have work assigned for today and none can see it, because the
 * import brought across students without accounts. These are real children
 * from the placement workbook, not invented ones, so this creates access for
 * people who already exist rather than adding anybody.
 *
 * Usernames are sequential - eng001, eng002 - rather than derived from the
 * student code. The codes are free text a child typed into a form: some are
 * names in Cyrillic, some in Latin, one is "7a", one is "Yes". Deriving a
 * login from them would produce collisions and unusable names, and the mapping
 * from code to username is written out so a teacher can still find anyone.
 *
 * Passwords are generated per student and written to a file under backups/,
 * which is gitignored. They are not printed: a console scrollback is a worse
 * place for eighty credentials than a file somebody has to open on purpose.
 * Existing accounts are left alone, so a re-run adds only what is missing.
 */
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { sql } from "drizzle-orm";
import { db, pool, readRows, userRolesInCore, usersInCore } from "@workspace/db";
import { hashPassword } from "../src/shared/password";

if (!process.argv.includes("--yes")) {
  console.error("Refusing to run without --yes.");
  process.exit(1);
}

try {
  // Students of the English classes who have no account yet, in a stable order
  // so a re-run numbers the same person the same way.
  const pending = await readRows<{
    id: number;
    studentCode: string;
    displayName: string;
    className: string;
  }>(
    `SELECT st.id::int, st.student_code AS "studentCode",
       st.display_name AS "displayName", c.name_mn AS "className"
     FROM core.students st
     JOIN core.student_enrollments e ON e.student_id = st.id AND e.is_active
     JOIN core.classes c ON c.id = e.class_id AND c.is_active
     WHERE st.is_active
       AND NOT EXISTS (SELECT 1 FROM core.users u WHERE u.student_id = st.id)
       AND EXISTS (
         SELECT 1 FROM learning.student_assignments sa WHERE sa.student_id = st.id)
     ORDER BY st.id`,
  );

  if (pending.length === 0) {
    console.log("Every student with assigned work already has an account.");
  }

  const [existing] = await readRows<{ n: number }>(
    `SELECT count(*)::int AS n FROM core.users WHERE username ~ '^eng[0-9]+$'`,
  );
  let counter = existing.n;
  const created: { username: string; password: string; student: string; code: string; className: string }[] = [];

  for (const student of pending) {
    counter += 1;
    const username = `eng${String(counter).padStart(3, "0")}`;
    const password = randomBytes(9).toString("base64url");

    const [user] = await db
      .insert(usersInCore)
      .values({
        username,
        passwordHash: await hashPassword(password),
        displayName: student.displayName,
        studentId: student.id,
      })
      .returning({ id: usersInCore.id });

    await db.insert(userRolesInCore).values({ userId: user.id, role: "STUDENT" });

    created.push({
      username,
      password,
      student: student.displayName,
      code: student.studentCode,
      className: student.className,
    });
  }

  if (created.length > 0) {
    const target = path.resolve(process.cwd(), "../../backups/english-accounts.csv");
    await mkdir(path.dirname(target), { recursive: true });
    const header = "username,password,student_code,display_name,class\n";
    const body = created
      .map((row) =>
        [row.username, row.password, row.code, row.student, row.className]
          .map((value) => `"${String(value).replace(/"/g, '""')}"`)
          .join(","),
      )
      .join("\n");
    await writeFile(target, header + body + "\n", "utf8");
    console.log(`Created ${created.length} account(s).`);
    console.log(`Credentials written to backups/english-accounts.csv (gitignored).`);
    console.log(`First account for a smoke test: ${created[0].username}`);
  }

  const summary = (
    await db.execute(sql`
      SELECT count(*)::int AS students,
        count(*) FILTER (WHERE EXISTS (
          SELECT 1 FROM core.users u WHERE u.student_id = st.id))::int AS "withAccount"
      FROM core.students st WHERE st.is_active`)
  ).rows as { students: number; withAccount: number }[];

  console.log(
    `Students: ${summary[0]?.students ?? 0}, of which ${summary[0]?.withAccount ?? 0} can log in.`,
  );
} catch (error) {
  const cause = (error as { cause?: { message?: string; detail?: string } }).cause;
  console.error(`Failed: ${error instanceof Error ? error.message : String(error)}`);
  if (cause?.message) console.error(`  ${cause.message}`);
  if (cause?.detail) console.error(`  ${cause.detail}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
