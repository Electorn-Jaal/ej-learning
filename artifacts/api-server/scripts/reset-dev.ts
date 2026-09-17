/**
 * Empties every application table and seeds one account per role.
 *
 * DESTRUCTIVE. Take a dump first:
 *   pg_dump -U postgres -d ej_learning_dev -F c -f backups/<stamp>.dump
 *
 *   node scripts/run-ts.mjs scripts/reset-dev.ts --yes
 *
 * Two guards, because this is unrecoverable without that dump: it refuses to
 * run against a database not named ej_learning_dev, and it refuses without
 * --yes. drizzle.__drizzle_migrations is left alone - it records which
 * migrations have run, not application data, and clearing it would make the
 * next `migrate` replay everything.
 */
import { sql } from "drizzle-orm";
import {
  classTeachersInCore,
  classesInCore,
  db,
  gradeLevelsInCore,
  pool,
  studentEnrollmentsInCore,
  studentsInCore,
  subjectsInCore,
  teachersInCore,
  userRolesInCore,
  usersInCore,
} from "@workspace/db";
import { hashPassword } from "../src/shared/password";

const EXPECTED_DATABASE = "ej_learning_dev";
const APP_SCHEMAS = [
  "core",
  "content",
  "learning",
  "assessment",
  "staging",
  "audit",
];

if (!process.argv.includes("--yes")) {
  console.error("Refusing to run without --yes. This deletes every row.");
  process.exit(1);
}

const [{ database }] = (
  await db.execute(sql`SELECT current_database() AS database`)
).rows as { database: string }[];

if (database !== EXPECTED_DATABASE) {
  console.error(
    `Connected to "${database}", expected "${EXPECTED_DATABASE}". No change.`,
  );
  process.exit(1);
}

try {
  const { rows: tables } = await db.execute(sql`
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_type = 'BASE TABLE'
      AND table_schema = ANY(${sql.raw(
        `ARRAY[${APP_SCHEMAS.map((name) => `'${name}'`).join(",")}]`,
      )})
    ORDER BY table_schema, table_name
  `);

  const qualified = (tables as { table_schema: string; table_name: string }[])
    .map((row) => `"${row.table_schema}"."${row.table_name}"`)
    .join(", ");

  if (!qualified) {
    console.error("No application tables found. No change.");
    process.exit(1);
  }

  // One statement: CASCADE crosses the foreign keys, RESTART IDENTITY puts the
  // sequences back to 1 so seeded ids are predictable.
  await db.execute(
    sql.raw(`TRUNCATE TABLE ${qualified} RESTART IDENTITY CASCADE`),
  );
  console.log(`Truncated ${(tables as unknown[]).length} tables.`);

  await db.transaction(async (tx) => {
    // Reference data, not mock: the grade numbers are fixed by the curriculum
    // and content rows cannot be loaded without them.
    const grades = await tx
      .insert(gradeLevelsInCore)
      .values(
        Array.from({ length: 11 }, (_, index) => ({
          gradeNumber: index + 1,
          nameMn: `${index + 1}-р анги`,
        })),
      )
      .returning({ id: gradeLevelsInCore.id, gradeNumber: gradeLevelsInCore.gradeNumber });

    const grade9 = grades.find((grade) => grade.gradeNumber === 9)!;

    const [subject] = await tx
      .insert(subjectsInCore)
      .values({ code: "MGL", nameMn: "Монгол хэл" })
      .returning({ id: subjectsInCore.id });

    const [klass] = await tx
      .insert(classesInCore)
      .values({
        classCode: "EJ-G09-A",
        gradeLevelId: grade9.id,
        nameMn: "9А",
        schoolYear: "2026-2027",
      })
      .returning({ id: classesInCore.id });

    const [student] = await tx
      .insert(studentsInCore)
      .values({ studentCode: "S-0001", displayName: "Б. Болд" })
      .returning({ id: studentsInCore.id });

    await tx
      .insert(studentEnrollmentsInCore)
      .values({ studentId: student.id, classId: klass.id });

    const accounts = [
      { username: "admin", displayName: "Системийн админ", role: "ADMIN" as const },
      { username: "bagsh", displayName: "Б. Энхтуяа", role: "TEACHER" as const },
      {
        username: "suragch",
        displayName: "Б. Болд",
        role: "STUDENT" as const,
        studentId: student.id,
      },
    ];

    for (const account of accounts) {
      const [user] = await tx
        .insert(usersInCore)
        .values({
          username: account.username,
          passwordHash: await hashPassword(`${account.username}-2026-dev`),
          displayName: account.displayName,
          studentId: account.studentId ?? null,
        })
        .returning({ id: usersInCore.id });

      await tx
        .insert(userRolesInCore)
        .values({ userId: user.id, role: account.role });

      if (account.role === "TEACHER") {
        const [teacher] = await tx
          .insert(teachersInCore)
          .values({
            userId: user.id,
            teacherCode: "T-001",
            subjectId: subject.id,
          })
          .returning({ id: teachersInCore.id });

        await tx.insert(classTeachersInCore).values({
          classId: klass.id,
          teacherId: teacher.id,
          subjectId: subject.id,
        });
      }
    }
  });

  console.log("Seeded: 11 grade levels, 1 subject, 1 class, 1 student.");
  console.log("Accounts (password is <username>-2026-dev):");
  console.log("  admin    ADMIN     admin-2026-dev");
  console.log("  bagsh    TEACHER   bagsh-2026-dev");
  console.log("  suragch  STUDENT   suragch-2026-dev");
  console.log("Development passwords. Change them before this reaches anyone.");
} catch (error) {
  const detail = error instanceof Error ? error.message : String(error);
  console.error(`Failed: ${detail}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
