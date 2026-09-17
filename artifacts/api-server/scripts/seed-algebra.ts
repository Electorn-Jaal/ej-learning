/**
 * Seeds the grade 10 algebra textbook: the book, its outline, a class of ten
 * students with accounts, lessons and a schedule.
 *
 *   node scripts/run-ts.mjs scripts/seed-algebra.ts --yes
 *
 * This is the Mongolian model, and the opposite of the English one: a class
 * works through one textbook together, so the lesson hangs off the class
 * schedule rather than off each student's measured level. Students who are
 * behind get extra recovery work on top, which is what student_assignments
 * carries.
 *
 * The PDF has no text layer, so the outline below was read off the book's
 * contents page by eye rather than extracted. It is a first cut meant to be
 * corrected in the admin screen, not a claim to be right.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { eq, like, sql } from "drizzle-orm";
import {
  classScheduleInLearning,
  classTeachersInCore,
  classesInCore,
  contentNodesInContent,
  contentSkillMapsInContent,
  contentSourceAlignmentsInContent,
  dailyLessonsInLearning,
  db,
  gradeLevelsInCore,
  pool,
  skillsInContent,
  sourceMaterialGradesInContent,
  sourceMaterialsInContent,
  sourceOutlineNodesInContent,
  sourceVersionsInContent,
  studentEnrollmentsInCore,
  studentsInCore,
  subjectsInCore,
  teachersInCore,
  termsInLearning,
  userRolesInCore,
  usersInCore,
} from "@workspace/db";
import { hashPassword } from "../src/shared/password";

if (!process.argv.includes("--yes")) {
  console.error("Refusing to run without --yes.");
  process.exit(1);
}

const STORAGE_KEY = "content/algebr-10.pdf";
const storageRoot = process.env.EJ_STORAGE_DIR ?? path.resolve(process.cwd(), "../../storage");

/**
 * Printed page numbers, straight off the book's contents page.
 *
 * The excerpt runs from printed page 1 to 18, which is chapter 1 up to part of
 * 1.2.2. PAGE_OFFSET maps those onto the file: printed page 3 is file page 9.
 */
const PAGE_OFFSET = 6;
const OUTLINE = [
  { code: "ALG10-1-1-1", number: "1.1.1", title: "Хялбар илтгэгч тэнцэтгэл биш", from: 1, to: 2 },
  { code: "ALG10-1-1-2", number: "1.1.2", title: "Хувьсагч солих замаар рационал тэнцэтгэл бишид шилжүүлэх", from: 3, to: 5 },
  { code: "ALG10-1-1-3", number: "1.1.3", title: "Суурь болон зэргийн илтгэгчдээ хувьсагч агуулсан тэнцэтгэл биш", from: 6, to: 7 },
  { code: "ALG10-1-1-4", number: "1.1.4", title: "Илтгэгч тэнцэтгэл биш — янз бүрийн бодлогууд", from: 8, to: 11 },
  { code: "ALG10-1-2-1", number: "1.2.1", title: "Хялбар логарифм тэнцэтгэл биш", from: 12, to: 16 },
  { code: "ALG10-1-2-2", number: "1.2.2", title: "Логарифм тэнцэтгэл биш — орлуулах арга", from: 17, to: 18 },
];

const STUDENTS = [
  "Б. Анхбаяр", "Д. Оюунчимэг", "Г. Тэмүүлэн", "С. Номин", "Ж. Батбаяр",
  "Х. Сарнай", "Э. Мөнх-Оргил", "Т. Ариунаа", "Н. Батзориг", "П. Уянга",
];

const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ulaanbaatar" }).format(new Date());
const shiftDays = (iso: string, days: number) => {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

try {
  const [{ database }] = (await db.execute(sql`SELECT current_database() AS database`))
    .rows as { database: string }[];
  if (database !== "ej_learning_dev") {
    console.error(`Connected to "${database}". No change.`);
    process.exit(1);
  }

  const fileBytes = await readFile(path.join(storageRoot, STORAGE_KEY));

  // Idempotent: everything here carries an ALG10 prefix.
  await db.execute(sql`DELETE FROM learning.quiz_attempts WHERE daily_lesson_id IN
    (SELECT id FROM learning.daily_lessons WHERE lesson_code LIKE 'ALG10-%')`);
  await db.execute(sql`DELETE FROM learning.class_schedule WHERE class_id IN
    (SELECT id FROM core.classes WHERE class_code LIKE 'ALG10-%')`);
  await db.delete(dailyLessonsInLearning).where(like(dailyLessonsInLearning.lessonCode, "ALG10-%"));
  await db.delete(contentSkillMapsInContent).where(like(contentSkillMapsInContent.mapCode, "ALG10-%"));
  await db.delete(contentSourceAlignmentsInContent).where(like(contentSourceAlignmentsInContent.alignmentCode, "ALG10-%"));
  await db.delete(contentNodesInContent).where(like(contentNodesInContent.contentCode, "ALG10-%"));
  await db.delete(skillsInContent).where(like(skillsInContent.skillCode, "ALG10-%"));
  await db.delete(sourceOutlineNodesInContent).where(like(sourceOutlineNodesInContent.outlineCode, "ALG10-%"));
  await db.execute(sql`DELETE FROM content.source_versions WHERE source_material_id IN
    (SELECT id FROM content.source_materials WHERE source_code LIKE 'ALG10-%')`);
  await db.execute(sql`DELETE FROM content.source_material_grades WHERE source_material_id IN
    (SELECT id FROM content.source_materials WHERE source_code LIKE 'ALG10-%')`);
  await db.delete(sourceMaterialsInContent).where(like(sourceMaterialsInContent.sourceCode, "ALG10-%"));
  await db.execute(sql`DELETE FROM core.student_enrollments WHERE student_id IN
    (SELECT id FROM core.students WHERE student_code LIKE 'ALG10-%')`);
  await db.execute(sql`DELETE FROM core.users WHERE student_id IN
    (SELECT id FROM core.students WHERE student_code LIKE 'ALG10-%')`);
  await db.delete(studentsInCore).where(like(studentsInCore.studentCode, "ALG10-%"));
  await db.execute(sql`DELETE FROM core.class_teachers WHERE class_id IN
    (SELECT id FROM core.classes WHERE class_code LIKE 'ALG10-%')`);
  await db.delete(classesInCore).where(like(classesInCore.classCode, "ALG10-%"));

  const summary = await db.transaction(async (tx) => {
    let [maths] = await tx
      .select({ id: subjectsInCore.id })
      .from(subjectsInCore)
      .where(eq(subjectsInCore.code, "MATH"))
      .limit(1);
    if (!maths) {
      [maths] = await tx
        .insert(subjectsInCore)
        .values({ code: "MATH", nameMn: "Математик" })
        .returning({ id: subjectsInCore.id });
    }

    const [grade10] = await tx
      .select({ id: gradeLevelsInCore.id })
      .from(gradeLevelsInCore)
      .where(eq(gradeLevelsInCore.gradeNumber, 10))
      .limit(1);

    const [material] = await tx
      .insert(sourceMaterialsInContent)
      .values({
        sourceCode: "ALG10-TB",
        subjectId: maths.id,
        title: "Алгебр ба математик анализ 10 (В. Адъяасүрэн, 2023)",
        materialType: "TEXTBOOK",
        authors: "В. Адъяасүрэн",
        publishedYear: 2023,
        edition: "Шинэчилсэн хоёр дахь хэвлэл",
        totalPages: 24,
        status: "APPROVED",
        dataQualityStatus: "COMPLETE",
        notes: "24 хуудасны хэсэг. 1-р бүлэг: илтгэгч ба логарифм тэнцэтгэл биш.",
      })
      .returning({ id: sourceMaterialsInContent.id });

    await tx.insert(sourceVersionsInContent).values({
      sourceMaterialId: material.id,
      versionNo: 1,
      originalFilename: "algebr-10.pdf",
      storageKey: STORAGE_KEY,
      mimeType: "application/pdf",
      fileSizeBytes: fileBytes.byteLength,
      checksumSha256: createHash("sha256").update(fileBytes).digest("hex"),
      pageOffset: PAGE_OFFSET,
      status: "APPROVED",
    });
    await tx
      .insert(sourceMaterialGradesInContent)
      .values({ sourceMaterialId: material.id, gradeLevelId: grade10.id });

    const [domain] = await tx
      .insert(contentNodesInContent)
      .values({
        subjectId: maths.id,
        contentCode: "ALG10-DOM-01",
        levelType: "DOMAIN",
        nameMn: "Илтгэгч ба логарифм тэнцэтгэл биш",
        gradeFromId: grade10.id,
        gradeToId: grade10.id,
        sequenceNo: 1,
        status: "APPROVED",
        dataQualityStatus: "COMPLETE",
      })
      .returning({ id: contentNodesInContent.id });

    const lessons: number[] = [];
    for (const [index, section] of OUTLINE.entries()) {
      const [outline] = await tx
        .insert(sourceOutlineNodesInContent)
        .values({
          sourceMaterialId: material.id,
          outlineCode: section.code,
          printedNumber: section.number,
          nodeType: "SECTION",
          title: section.title,
          pageFrom: section.from,
          pageTo: section.to,
          sequenceNo: index + 1,
          status: "APPROVED",
          dataQualityStatus: "COMPLETE",
        })
        .returning({ id: sourceOutlineNodesInContent.id });

      const [skill] = await tx
        .insert(skillsInContent)
        .values({
          skillCode: `ALG10-SK-${section.number.replace(/\./g, "-")}`,
          subjectId: maths.id,
          gradeLevelId: grade10.id,
          nameMn: section.title,
          status: "APPROVED",
          dataQualityStatus: "COMPLETE",
        })
        .returning({ id: skillsInContent.id });

      const [node] = await tx
        .insert(contentNodesInContent)
        .values({
          subjectId: maths.id,
          parentId: domain.id,
          contentCode: `ALG10-TOP-${index + 1}`,
          levelType: "TOPIC",
          nameMn: section.title,
          gradeFromId: grade10.id,
          gradeToId: grade10.id,
          sequenceNo: index + 1,
          status: "APPROVED",
          dataQualityStatus: "COMPLETE",
        })
        .returning({ id: contentNodesInContent.id });

      await tx.insert(contentSkillMapsInContent).values({
        mapCode: `ALG10-MAP-${index + 1}`,
        contentNodeId: node.id,
        skillId: skill.id,
        isPrimary: true,
        status: "APPROVED",
      });

      await tx.insert(contentSourceAlignmentsInContent).values({
        alignmentCode: `ALG10-ALIGN-${index + 1}`,
        contentNodeId: node.id,
        sourceMaterialId: material.id,
        sourceOutlineNodeId: outline.id,
        pageFrom: section.from,
        pageTo: section.to,
        relationType: "PRIMARY",
        status: "APPROVED",
      });

      const [lesson] = await tx
        .insert(dailyLessonsInLearning)
        .values({
          lessonCode: `ALG10-LSN-${String(index + 1).padStart(2, "0")}`,
          coreSkillId: skill.id,
          lessonType: "CORE",
          learningGoalMn: `${section.number}. ${section.title}`,
          rememberMn: "Өмнөх хичээлийн үндсэн дүрмээ сэргээн санана.",
          workedExampleMn: `Сурах бичгийн ${section.from}-${section.to} хуудасны бодсон жишээг алхам алхмаар үзнэ.`,
          guidedPracticeMn: `${section.from}-${section.to} хуудасны бодлогуудыг багштай хамт эхлүүлнэ.`,
          independentPracticeMn: "Үлдсэн бодлогуудыг дэвтэртээ бие даан бодно.",
          studentMessageMn: `Өнөөдөр "${section.title}" сэдвийг үзнэ. Номоо нээгээд дэвтэртээ бодоорой.`,
          estimatedMinutes: 40,
          printReady: true,
          webReady: true,
          sourceMaterialId: material.id,
          status: "APPROVED",
        })
        .returning({ id: dailyLessonsInLearning.id });
      lessons.push(lesson.id);
    }

    const [klass] = await tx
      .insert(classesInCore)
      .values({
        classCode: "ALG10-G10-A",
        gradeLevelId: grade10.id,
        nameMn: "10А",
        schoolYear: "2026-2027",
      })
      .returning({ id: classesInCore.id });

    const [teacher] = await tx
      .select({ id: teachersInCore.id })
      .from(teachersInCore)
      .innerJoin(usersInCore, eq(usersInCore.id, teachersInCore.userId))
      .where(eq(usersInCore.username, "bagsh"))
      .limit(1);
    if (teacher) {
      await tx
        .insert(classTeachersInCore)
        .values({ classId: klass.id, teacherId: teacher.id, subjectId: maths.id })
        .onConflictDoNothing();
    }

    const accounts: string[] = [];
    for (const [index, name] of STUDENTS.entries()) {
      const code = `ALG10-${String(index + 1).padStart(2, "0")}`;
      const [student] = await tx
        .insert(studentsInCore)
        .values({ studentCode: code, displayName: name })
        .returning({ id: studentsInCore.id });
      await tx
        .insert(studentEnrollmentsInCore)
        .values({ studentId: student.id, classId: klass.id });

      const username = `suragch${index + 1}`;
      const [user] = await tx
        .insert(usersInCore)
        .values({
          username,
          passwordHash: await hashPassword(`${username}-2026-dev`),
          displayName: name,
          studentId: student.id,
        })
        .returning({ id: usersInCore.id });
      await tx.insert(userRolesInCore).values({ userId: user.id, role: "STUDENT" });
      accounts.push(username);
    }

    const [term] = await tx
      .select({ id: termsInLearning.id })
      .from(termsInLearning)
      .where(sql`${today}::date BETWEEN ${termsInLearning.startsOn} AND ${termsInLearning.endsOn}`)
      .limit(1);

    let scheduled = 0;
    if (term) {
      // Yesterday through three days out, so today resolves and the teacher has
      // something either side of it to correct.
      for (const [index, offset] of [-1, 0, 1, 2, 3].entries()) {
        await tx
          .insert(classScheduleInLearning)
          .values({
            classId: klass.id,
            termId: term.id,
            dailyLessonId: lessons[index % lessons.length],
            scheduledOn: shiftDays(today, offset),
          })
          .onConflictDoNothing();
        scheduled += 1;
      }
    }

    return { outline: OUTLINE.length, lessons: lessons.length, students: accounts.length, scheduled };
  });

  console.log("Seeded:", JSON.stringify(summary, null, 2));
  console.log("Accounts: suragch1 .. suragch10, password <username>-2026-dev");
} catch (error) {
  const cause = (error as { cause?: { message?: string; detail?: string } }).cause;
  console.error(`Failed: ${error instanceof Error ? error.message : String(error)}`);
  if (cause?.message) console.error(`  ${cause.message}`);
  if (cause?.detail) console.error(`  ${cause.detail}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
