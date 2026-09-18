/**
 * Builds a whole small school out of invented data, so the system can be
 * looked at and exercised before any real data exists.
 *
 *   corepack pnpm db:demo
 *
 * db:setup seeds the smallest world that makes the tests provable - one class,
 * one lesson, one question. That is the wrong shape for answering "does this
 * hang together": nothing there has a prerequisite to walk back to, no skill
 * has enough sittings to reach MASTERED, and one scheduled day cannot show a
 * timetable. This builds the other thing: three classes, two subjects, a
 * teacher holding both in one room, twenty-four children, a textbook with
 * front matter so printed pages and file pages genuinely differ, a chain of
 * skills that depend on each other, and a term of work with results spread
 * across all three mastery bands.
 *
 * The activity is produced through the same functions the live server uses -
 * recordSkillEvidence for marking, recommendationsFor for catch-up work - so
 * what comes out is what the running system would have produced, not a
 * hand-written imitation of it.
 *
 * It refuses any database not named ej_learning_local or ej_learning_test.
 * Real student data is not something to seed demo rows on top of.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { db, pool, readRows } from "@workspace/db";
import { sql } from "drizzle-orm";
import { hashPassword } from "../src/shared/password";
import { recordSkillEvidence, recordTeacherMastery } from "../src/modules/learning/mastery";
import { assignRemediation, recommendationsFor } from "../src/modules/learning/remediation";

if (!process.argv.includes("--yes")) {
  console.error("Refusing to run without --yes.");
  process.exit(1);
}

const one = async <T extends Record<string, unknown>>(query: ReturnType<typeof sql>) =>
  (await db.execute(query)).rows[0] as T;

const ulaanbaatarToday = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ulaanbaatar" }).format(new Date());

const shiftDays = (isoDate: string, days: number) => {
  const date = new Date(isoDate + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const isWeekday = (isoDate: string) => {
  const day = new Date(isoDate + "T00:00:00Z").getUTCDay();
  return day >= 1 && day <= 5;
};

/**
 * A textbook with a cover and contents in front of chapter 1, which is the
 * whole point: printed page 1 is file page 7, so page_offset has something
 * real to be right or wrong about. Every page prints its own printed number.
 */
function textbookPdf(frontMatter: number, printedPages: number) {
  const pages: string[] = [];
  for (let i = 0; i < frontMatter; i += 1) {
    pages.push(i === 0 ? "MATEMATIK 9 - joroo nom (demo)" : "Urid ugsun heseg " + i);
  }
  for (let printed = 1; printed <= printedPages; printed += 1) {
    pages.push("Hevlegdsen huudas " + printed);
  }

  const objects: string[] = [];
  const pageIds: number[] = [];
  // 1 catalog, 2 pages tree, 3 font, then two objects per page.
  const firstPageObject = 4;
  pages.forEach((_, index) => pageIds.push(firstPageObject + index * 2));

  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push(
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`,
  );
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  pages.forEach((text, index) => {
    const contentId = pageIds[index] + 1;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] ` +
        `/Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`,
    );
    const stream = `BT /F1 20 Tf 60 700 Td (${text}) Tj ET`;
    objects.push(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
  });

  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.map((offset) => String(offset).padStart(10, "0") + " 00000 n \n").join("");
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body);
}

/** Skills, in dependency order. Each one gets a lesson, a book section, items. */
const SKILLS = [
  { code: "D-M1", subject: "MATH", name: "Натурал тоо нэмэх", outcome: "Хоёр оронтой тоог нэмнэ", needs: [] as string[] },
  { code: "D-M2", subject: "MATH", name: "Натурал тоо хасах", outcome: "Хоёр оронтой тоог хасна", needs: ["D-M1"] },
  { code: "D-M3", subject: "MATH", name: "Үржвэр олох", outcome: "Нэг оронтой тоогоор үржүүлнэ", needs: ["D-M2"] },
  { code: "D-M4", subject: "MATH", name: "Энгийн тэгшитгэл", outcome: "x + a = b хэлбэрийн тэгшитгэл бодно", needs: ["D-M3"] },
  { code: "D-P1", subject: "PHYS", name: "Хэмжих нэгж", outcome: "Урт, массын нэгжийг хөрвүүлнэ", needs: [] },
  { code: "D-P2", subject: "PHYS", name: "Хурд бодох", outcome: "Зам, хугацаанаас хурдыг олно", needs: ["D-P1", "D-M3"] },
];

const CLASSES = [
  { code: "DEMO-9A", name: "9А" },
  { code: "DEMO-9B", name: "9Б" },
  { code: "DEMO-9V", name: "9В" },
];

const FIRST_NAMES = [
  "Ариунаа", "Батбаяр", "Ганзориг", "Дэлгэрмаа", "Энхжин", "Жавхлан",
  "Зоригт", "Ирээдүй", "Лхагвасүрэн", "Мөнхзул", "Наранцэцэг", "Оюунбилэг",
  "Пүрэвдорж", "Сайханбилэг", "Тэмүүлэн", "Ундрам", "Хулан", "Цэнгэл",
  "Чинбат", "Шинэбаяр", "Эрдэнэбат", "Юмжав", "Яруу", "Амгалан",
];

/**
 * One password for every demo account. They are demo accounts on a database
 * this script refuses to run against unless it is named ej_learning_local or
 * ej_learning_test, so nothing here ever guards anything real - and twenty-four
 * random strings only made the school tedious to walk through.
 */
const DEMO_PASSWORD = "demo1234";

const PER_CLASS = 8;
const FRONT_MATTER = 6;
const PRINTED_PAGES = 38;
const PAGES_PER_SKILL = 6;

try {
  const [{ name: database }] = await readRows<{ name: string }>(
    "SELECT current_database() AS name",
  );
  if (!/^ej_learning_(local|test)(_[a-z0-9]+)*$/.test(database)) {
    throw new Error(
      `Refusing to seed demo rows into "${database}". Point DATABASE_URL at an ` +
        `ej_learning_local database; see the README.`,
    );
  }

  const [{ n: alreadyThere }] = await readRows<{ n: number }>(
    `SELECT count(*)::int AS n FROM core.classes WHERE class_code LIKE 'DEMO-%'`,
  );
  if (alreadyThere > 0) {
    throw new Error(
      "This database already holds a demo school. Recreate it and run db:setup " +
        "again before seeding a second one.",
    );
  }

  const today = ulaanbaatarToday();
  const year = Number(today.slice(0, 4));
  const schoolYear = `${year}-${year + 1}`;

  // ---- calendar, subjects, classes -------------------------------------
  // This runs on top of db:setup, which has already made the grade levels and
  // the two subjects. Reuse them rather than inserting a second Математик.
  const [existingGrade] = await readRows<{ id: number }>(
    `SELECT id::int FROM core.grade_levels WHERE grade_number = 9`,
  );
  const grade = existingGrade ?? (await one<{ id: number }>(sql`
    INSERT INTO core.grade_levels (grade_number, name_mn) VALUES (9, '9-р анги') RETURNING id`));

  const subjectIds = new Map<string, number>();
  for (const [code, name] of [["MATH", "Математик"], ["PHYS", "Физик"]]) {
    const [found] = await readRows<{ id: number }>(
      `SELECT id::int FROM core.subjects WHERE code = $1`,
      [code],
    );
    const row = found ?? (await one<{ id: number }>(sql`
      INSERT INTO core.subjects (code, name_mn) VALUES (${code}, ${name}) RETURNING id`));
    subjectIds.set(code, row.id);
  }

  // db:setup already opened term 1 for this school year; the timetable hangs
  // off whichever term is there rather than a second one with the same number.
  const [existingTerm] = await readRows<{ id: number }>(
    `SELECT id::int FROM learning.terms WHERE school_year = $1 AND term_number = 1`,
    [schoolYear],
  );
  const term = existingTerm ?? (await one<{ id: number }>(sql`
    INSERT INTO learning.terms (school_year, term_number, name_mn, starts_on, ends_on)
    VALUES (${schoolYear}, 1, 'I улирал', ${shiftDays(today, -60)}, ${shiftDays(today, 60)})
    RETURNING id`));
  // Widen it if it does not already cover the window the demo schedules into.
  await db.execute(sql`
    UPDATE learning.terms
       SET starts_on = LEAST(starts_on, ${shiftDays(today, -30)}::date),
           ends_on = GREATEST(ends_on, ${shiftDays(today, 30)}::date)
     WHERE id = ${term.id}`);

  const classIds = new Map<string, number>();
  for (const klass of CLASSES) {
    const row = await one<{ id: number }>(sql`
      INSERT INTO core.classes (class_code, grade_level_id, name_mn, school_year, data_origin)
      VALUES (${klass.code}, ${grade.id}, ${klass.name}, ${schoolYear}, 'MOCK')
      RETURNING id`);
    classIds.set(klass.code, row.id);
  }

  // ---- people ----------------------------------------------------------
  const accounts: { username: string; password: string; role: string; note: string }[] = [];

  const makeAccount = async (username: string, role: string, displayName: string, studentId: number | null) => {
    const password = DEMO_PASSWORD;
    const user = await one<{ id: number }>(sql`
      INSERT INTO core.users (username, password_hash, display_name, student_id)
      VALUES (${username}, ${await hashPassword(password)}, ${displayName}, ${studentId})
      RETURNING id`);
    await db.execute(sql`
      INSERT INTO core.user_roles (user_id, role) VALUES (${user.id}, ${role})`);
    return { userId: user.id, password };
  };

  // Not "demo-admin": db:setup already owns that name in the same database.
  const admin = await makeAccount("demo-director", "ADMIN", "Жишиг сургалтын менежер", null);
  accounts.push({
    username: "demo-director",
    password: admin.password,
    role: "ADMIN",
    note: "бүх анги",
  });

  // One teacher takes both subjects in 9А - the case the old key could not hold.
  const teacherPlan = [
    {
      username: "demo-bagsh-a",
      name: "Багш А (математик, физик)",
      code: "DEMO-T-A",
      holds: [
        { klass: "DEMO-9A", subject: "MATH" },
        { klass: "DEMO-9A", subject: "PHYS" },
        { klass: "DEMO-9B", subject: "MATH" },
      ],
    },
    {
      username: "demo-bagsh-b",
      name: "Багш Б (математик, физик)",
      code: "DEMO-T-B",
      holds: [
        { klass: "DEMO-9V", subject: "MATH" },
        { klass: "DEMO-9B", subject: "PHYS" },
        { klass: "DEMO-9V", subject: "PHYS" },
      ],
    },
  ];

  for (const plan of teacherPlan) {
    const account = await makeAccount(plan.username, "TEACHER", plan.name, null);
    const teacher = await one<{ id: number }>(sql`
      INSERT INTO core.teachers (user_id, teacher_code, subject_id, data_origin)
      VALUES (${account.userId}, ${plan.code}, ${subjectIds.get(plan.holds[0].subject)!}, 'MOCK')
      RETURNING id`);
    for (const hold of plan.holds) {
      await db.execute(sql`
        INSERT INTO core.class_teachers (class_id, teacher_id, subject_id)
        VALUES (${classIds.get(hold.klass)!}, ${teacher.id}, ${subjectIds.get(hold.subject)!})`);
    }
    accounts.push({
      username: plan.username,
      password: account.password,
      role: "TEACHER",
      note: plan.holds.map((h) => `${h.klass.replace("DEMO-", "")}/${h.subject}`).join(" "),
    });
  }

  const students: { id: number; name: string; klass: string; username: string; password: string }[] = [];
  let studentIndex = 0;
  for (const klass of CLASSES) {
    for (let i = 0; i < PER_CLASS; i += 1) {
      const name = FIRST_NAMES[studentIndex];
      const code = `DEMO-S-${String(studentIndex + 1).padStart(2, "0")}`;
      const username = `demo-suragch-${String(studentIndex + 1).padStart(2, "0")}`;
      const row = await one<{ id: number }>(sql`
        INSERT INTO core.students (student_code, display_name, data_origin)
        VALUES (${code}, ${name}, 'MOCK') RETURNING id`);
      await db.execute(sql`
        INSERT INTO core.student_enrollments (student_id, class_id)
        VALUES (${row.id}, ${classIds.get(klass.code)!})`);
      const account = await makeAccount(username, "STUDENT", name, row.id);
      students.push({ id: row.id, name, klass: klass.code, username, password: account.password });
      studentIndex += 1;
    }
  }
  // ---- the book --------------------------------------------------------
  const storageRoot = path.resolve(
    process.env.EJ_STORAGE_DIR ?? path.resolve(process.cwd(), "../../storage"),
  );
  const storageKey = "content/demo-matematik-9.pdf";
  const pdf = textbookPdf(FRONT_MATTER, PRINTED_PAGES);
  await mkdir(path.dirname(path.join(storageRoot, storageKey)), { recursive: true });
  await writeFile(path.join(storageRoot, storageKey), pdf);

  const material = await one<{ id: number }>(sql`
    INSERT INTO content.source_materials
      (source_code, subject_id, title, material_type, total_pages, status,
       data_quality_status, notes)
    VALUES ('DEMO-BOOK', ${subjectIds.get("MATH")!}, 'Математик 9 — жишиг ном',
      'TEXTBOOK', ${FRONT_MATTER + PRINTED_PAGES}, 'APPROVED', 'COMPLETE',
      'Зохиомол демо ном. Бодит сургалтын материал биш.')
    RETURNING id`);

  await db.execute(sql`
    INSERT INTO content.source_versions
      (source_material_id, version_no, original_filename, storage_key, mime_type,
       file_size_bytes, checksum_sha256, status, page_offset)
    VALUES (${material.id}, 1, 'demo-matematik-9.pdf', ${storageKey}, 'application/pdf',
      ${pdf.length}, ${randomBytes(32).toString("hex")}, 'APPROVED', ${FRONT_MATTER})`);
  await db.execute(sql`
    INSERT INTO content.source_material_grades (source_material_id, grade_level_id)
    VALUES (${material.id}, ${grade.id})`);

  // ---- skills, lessons, book sections, questions ------------------------
  const skillIds = new Map<string, number>();
  const lessonIds = new Map<string, number>();
  const itemIds = new Map<string, { id: number; correctOptionId: number; prompt: string }[]>();

  for (const [index, skill] of SKILLS.entries()) {
    const printedFrom = 1 + index * PAGES_PER_SKILL;
    const printedTo = printedFrom + PAGES_PER_SKILL - 1;

    const skillRow = await one<{ id: number }>(sql`
      INSERT INTO content.skills
        (skill_code, subject_id, grade_level_id, name_mn, learning_outcome_mn,
         status, data_quality_status)
      VALUES (${skill.code}, ${subjectIds.get(skill.subject)!}, ${grade.id},
        ${skill.name}, ${skill.outcome}, 'APPROVED', 'COMPLETE')
      RETURNING id`);
    skillIds.set(skill.code, skillRow.id);

    const outline = await one<{ id: number }>(sql`
      INSERT INTO content.source_outline_nodes
        (source_material_id, outline_code, node_type, title, page_from, page_to,
         sequence_no, status)
      VALUES (${material.id}, ${skill.code + "-SEC"}, 'SECTION', ${skill.name},
        ${printedFrom}, ${printedTo}, ${index + 1}, 'APPROVED')
      RETURNING id`);

    const topic = await one<{ id: number }>(sql`
      INSERT INTO content.content_nodes
        (subject_id, content_code, level_type, name_mn, grade_from_id, grade_to_id,
         sequence_no, status)
      VALUES (${subjectIds.get(skill.subject)!}, ${skill.code + "-TOPIC"}, 'TOPIC',
        ${skill.name}, ${grade.id}, ${grade.id}, ${index + 1}, 'APPROVED')
      RETURNING id`);

    await db.execute(sql`
      INSERT INTO content.content_skill_maps (map_code, content_node_id, skill_id, is_primary, status)
      VALUES (${skill.code + "-MAP"}, ${topic.id}, ${skillRow.id}, true, 'APPROVED')`);
    await db.execute(sql`
      INSERT INTO content.content_source_alignments
        (alignment_code, content_node_id, source_material_id, source_outline_node_id,
         page_from, page_to, relation_type, status)
      VALUES (${skill.code + "-ALIGN"}, ${topic.id}, ${material.id}, ${outline.id},
        ${printedFrom}, ${printedTo}, 'PRIMARY', 'APPROVED')`);

    const lesson = await one<{ id: number }>(sql`
      INSERT INTO learning.daily_lessons
        (lesson_code, core_skill_id, lesson_type, learning_goal_mn, remember_mn,
         worked_example_mn, independent_practice_mn, estimated_minutes,
         student_message_mn, print_ready, web_ready, source_material_id, status)
      VALUES (${skill.code + "-LESSON"}, ${skillRow.id}, 'CORE', ${skill.outcome},
        ${"Гол санаа: " + skill.name + ". Энэ бол зохиомол демо агуулга."},
        ${"Жишээ: " + skill.name + " дээрх нэг бодлогыг алхам алхмаар бодов."},
        ${"Номын " + printedFrom + "-" + printedTo + " хуудасны дасгалыг гүйцэтгэ."},
        25, ${"Өнөөдөр " + skill.name + " сэдвийг үзнэ."}, true, true,
        ${material.id}, 'APPROVED')
      RETURNING id`);
    lessonIds.set(skill.code, lesson.id);

    const items: { id: number; correctOptionId: number; prompt: string }[] = [];
    for (let q = 1; q <= 4; q += 1) {
      const prompt = `${skill.name} — жишиг асуулт ${q}`;
      const item = await one<{ id: number }>(sql`
        INSERT INTO assessment.diagnostic_items
          (item_code, subject_id, grade_level_id, skill_id, item_order, title_mn,
           max_score, rubric_mn, status, answer_source)
        VALUES (${`${skill.code}-Q${q}`}, ${subjectIds.get(skill.subject)!}, ${grade.id},
          ${skillRow.id}, ${q}, ${prompt}, 1,
          ${"Зөв хариултын тайлбар: " + skill.outcome}, 'APPROVED', 'AUTHORITATIVE')
        RETURNING id`);
      let correctOptionId = 0;
      for (const [optionIndex, label] of ["А", "Б", "В", "Г"].entries()) {
        const isCorrect = optionIndex === (q - 1) % 4;
        const option = await one<{ id: number }>(sql`
          INSERT INTO assessment.diagnostic_item_options
            (diagnostic_item_id, option_label, option_text, is_correct, sequence_no)
          VALUES (${item.id}, ${label}, ${`Сонголт ${label}`}, ${isCorrect}, ${optionIndex + 1})
          RETURNING id`);
        if (isCorrect) correctOptionId = option.id;
      }
      items.push({ id: item.id, correctOptionId, prompt });
    }
    itemIds.set(skill.code, items);
  }

  for (const skill of SKILLS) {
    for (const need of skill.needs) {
      await db.execute(sql`
        INSERT INTO content.skill_dependencies
          (dependency_code, skill_id, prerequisite_skill_id, relation_type, importance,
           reason_mn, status)
        VALUES (${`${skill.code}-NEEDS-${need}`}, ${skillIds.get(skill.code)!},
          ${skillIds.get(need)!}, 'REQUIRED', 'HIGH',
          ${`${skill.name} нь ${SKILLS.find((s) => s.code === need)!.name} дээр тулгуурлана.`},
          'APPROVED')`);
    }
  }

  // ---- a term of timetable --------------------------------------------
  let scheduled = 0;
  const classSubjects: { klass: string; subject: string }[] = [];
  for (const plan of teacherPlan) for (const hold of plan.holds) classSubjects.push(hold);

  for (const { klass, subject } of classSubjects) {
    const subjectSkills = SKILLS.filter((s) => s.subject === subject);
    let lessonCursor = 0;
    for (let offset = -14; offset <= 7; offset += 1) {
      const day = shiftDays(today, offset);
      if (!isWeekday(day)) continue;
      const skill = subjectSkills[lessonCursor % subjectSkills.length];
      lessonCursor += 1;
      await db.execute(sql`
        INSERT INTO learning.class_schedule
          (class_id, term_id, daily_lesson_id, scheduled_on, subject_id, created_by)
        VALUES (${classIds.get(klass)!}, ${term.id}, ${lessonIds.get(skill.code)!},
          ${day}, ${subjectIds.get(subject)!}, ${admin.userId})
        ON CONFLICT DO NOTHING`);
      scheduled += 1;
    }
  }

  // ---- what the children actually did ----------------------------------
  // Three bands on purpose: a third comfortable, a third mid, a third behind,
  // so every mastery state and the catch-up walk all have something to act on.
  const band = (index: number) => (index % 3 === 0 ? "strong" : index % 3 === 1 ? "middling" : "behind");
  const correctCountFor = (kind: string, sitting: number) => {
    if (kind === "strong") return 4;
    if (kind === "middling") return sitting === 0 ? 2 : 3;
    return 1;
  };

  let attempts = 0;
  for (const [index, student] of students.entries()) {
    const kind = band(index);
    // Everyone works through maths; the behind ones stall at D-M4.
    const sequence = ["D-M1", "D-M2", "D-M3", "D-M4"];
    for (const skillCode of sequence) {
      const items = itemIds.get(skillCode)!;
      const lessonId = lessonIds.get(skillCode)!;
      const sittings = kind === "strong" ? 2 : kind === "middling" ? 2 : 1;
      for (let sitting = 0; sitting < sittings; sitting += 1) {
        // The behind students answer the last skill badly and the earlier ones
        // only moderately, which is what puts a real gap at the end of a chain.
        const isStall = kind === "behind" && skillCode === "D-M4";
        const correctCount = isStall ? 0 : correctCountFor(kind, sitting);
        const stored = items.map((item, itemIndex) => ({
          questionId: String(item.id),
          prompt: item.prompt,
          chosenOptionId: String(item.correctOptionId),
          chosenText: "Сонголт",
          correct: itemIndex < correctCount,
        }));
        const submittedAt = shiftDays(today, -10 + sitting * 3) + "T04:00:00.000Z";
        await db.execute(sql`
          INSERT INTO learning.quiz_attempts
            (student_id, daily_lesson_id, lesson_code, answers, score, max_score, submitted_at)
          VALUES (${student.id}, ${lessonId}, ${skillCode + "-LESSON"},
            ${JSON.stringify(stored)}::jsonb, ${correctCount}, ${items.length}, ${submittedAt})`);
        await recordSkillEvidence(
          student.id,
          [{ skillId: skillIds.get(skillCode)!, correct: correctCount, total: items.length }],
          submittedAt,
        );
        attempts += 1;
      }
    }
  }

  // One teacher judgement, so the TEACHER source is represented and the
  // "rebuild keeps it" rule has something to protect here too.
  await recordTeacherMastery({
    studentId: students[1].id,
    skillId: skillIds.get("D-P1")!,
    status: "DEVELOPING",
    score: 62,
    teacherUsername: "demo-bagsh-a",
  });

  // ---- today's work, and catch-up for whoever needs it ------------------
  // source is AUTO with no reason for the timetable's own work; the enum only
  // knows AUTO and TEACHER, and a reason is what marks a row as catch-up.
  let assigned = 0;
  for (const student of students) {
    const klassSubjects = classSubjects.filter((cs) => cs.klass === student.klass);
    for (const { subject } of klassSubjects) {
      const [row] = await readRows<{ lessonId: number; subjectId: number }>(
        `SELECT cs.daily_lesson_id::int AS "lessonId", cs.subject_id::int AS "subjectId"
         FROM learning.class_schedule cs
         WHERE cs.class_id = $1::bigint AND cs.scheduled_on = $2::date
           AND cs.subject_id = $3::bigint
         LIMIT 1`,
        [classIds.get(student.klass)!, today, subjectIds.get(subject)!],
      );
      if (!row) continue;
      await db.execute(sql`
        INSERT INTO learning.student_assignments
          (student_id, daily_lesson_id, assigned_on, source, assigned_by, subject_id)
        VALUES (${student.id}, ${row.lessonId}, ${today}, 'AUTO', ${admin.userId}, ${row.subjectId})
        ON CONFLICT ON CONSTRAINT student_assignments_student_day_key DO NOTHING`);
      assigned += 1;
    }
  }

  // The live path's own function, so the catch-up work is chosen and written
  // exactly as a real submission would have done it - including that it
  // replaces the day's row rather than sitting beside it.
  const recommendations = await recommendationsFor(null);
  let remediated = 0;
  for (const student of students) {
    const result = await assignRemediation(student.id, today);
    if (result?.written) remediated += 1;
  }

  // ---- what got built, and whether the links hold ----------------------
  const check = async (label: string, query: string, expect: (n: number) => boolean) => {
    const [row] = await readRows<{ n: number }>(query);
    const ok = expect(row.n);
    console.log(`  ${ok ? "OK  " : "FAIL"} ${label.padEnd(52)} ${row.n}`);
    return ok;
  };

  console.log(`\nDemo school seeded into ${database}.`);
  console.log(`  ${CLASSES.length} classes, ${students.length} students, ${SKILLS.length} skills,`);
  console.log(`  ${scheduled} scheduled days, ${attempts} quiz attempts, ${assigned} assignments,`);
  console.log(`  ${remediated} catch-up assignments from ${recommendations.length} recommendations.`);

  console.log("");
  console.log("Chain check - each link needs rows on both sides:");
  // Every count is scoped to the rows this script made. db:setup's fixture is
  // in the same database, and a total that quietly included it would pass
  // whether or not the demo school itself hangs together.
  const results = [
    await check("student -> class enrolment",
      `SELECT count(*)::int AS n FROM core.student_enrollments e
       JOIN core.classes c ON c.id = e.class_id WHERE c.class_code LIKE 'DEMO-%'`,
      (n) => n === students.length),
    await check("teacher -> class x subject",
      `SELECT count(*)::int AS n FROM core.class_teachers ct
       JOIN core.classes c ON c.id = ct.class_id WHERE c.class_code LIKE 'DEMO-%'`,
      (n) => n === classSubjects.length),
    await check("one teacher, two subjects, same class",
      `SELECT count(*)::int AS n FROM (
         SELECT ct.class_id, ct.teacher_id FROM core.class_teachers ct
         JOIN core.classes c ON c.id = ct.class_id WHERE c.class_code LIKE 'DEMO-%'
         GROUP BY 1,2 HAVING count(*) > 1) t`,
      (n) => n >= 1),
    await check("class -> scheduled day -> lesson",
      `SELECT count(*)::int AS n FROM learning.class_schedule cs
       JOIN learning.daily_lessons dl ON dl.id = cs.daily_lesson_id
       JOIN core.classes c ON c.id = cs.class_id WHERE c.class_code LIKE 'DEMO-%'`,
      (n) => n === scheduled),
    await check("lesson -> skill -> book section with pages",
      `SELECT count(*)::int AS n FROM learning.daily_lessons dl
       JOIN content.skills s ON s.id = dl.core_skill_id
       JOIN content.content_skill_maps m ON m.skill_id = s.id
       JOIN content.content_source_alignments a ON a.content_node_id = m.content_node_id
       WHERE s.skill_code LIKE 'D-%' AND a.page_from IS NOT NULL`,
      (n) => n === SKILLS.length),
    await check("book version carries the page offset",
      `SELECT count(*)::int AS n FROM content.source_versions v
       JOIN content.source_materials sm ON sm.id = v.source_material_id
       WHERE sm.source_code = 'DEMO-BOOK' AND v.page_offset = ${FRONT_MATTER}`,
      (n) => n === 1),
    await check("skill -> questions -> exactly one right option",
      `SELECT count(*)::int AS n FROM assessment.diagnostic_items i
       WHERE i.item_code LIKE 'D-%' AND (
         SELECT count(*) FROM assessment.diagnostic_item_options o
         WHERE o.diagnostic_item_id = i.id AND o.is_correct) = 1`,
      (n) => n === SKILLS.length * 4),
    await check("prerequisite links, approved and required",
      `SELECT count(*)::int AS n FROM content.skill_dependencies
       WHERE dependency_code LIKE 'D-%' AND status = 'APPROVED' AND relation_type = 'REQUIRED'`,
      (n) => n === SKILLS.reduce((total, skill) => total + skill.needs.length, 0)),
    await check("attempt -> item -> skill (countable evidence)",
      `SELECT count(DISTINCT qa.id)::int AS n FROM learning.quiz_attempts qa
       JOIN core.students st ON st.id = qa.student_id AND st.student_code LIKE 'DEMO-%'
       CROSS JOIN LATERAL jsonb_array_elements(qa.answers) AS a
       JOIN assessment.diagnostic_items i ON a->>'questionId' ~ '^[0-9]+$'
         AND i.id = (a->>'questionId')::bigint WHERE i.skill_id IS NOT NULL`,
      (n) => n === attempts),
    await check("mastery reached all three bands",
      `SELECT count(DISTINCT m.mastery_status)::int AS n FROM learning.student_skill_mastery m
       JOIN core.students st ON st.id = m.student_id AND st.student_code LIKE 'DEMO-%'`,
      (n) => n === 3),
    await check("a teacher judgement is on record",
      `SELECT count(*)::int AS n FROM learning.student_skill_mastery m
       JOIN core.students st ON st.id = m.student_id AND st.student_code LIKE 'DEMO-%'
       WHERE m.source = 'TEACHER'`,
      (n) => n >= 1),
    await check("gaps produced catch-up work",
      `SELECT count(*)::int AS n FROM learning.student_assignments sa
       JOIN core.students st ON st.id = sa.student_id AND st.student_code LIKE 'DEMO-%'
       WHERE sa.reason IS NOT NULL`,
      (n) => n >= 1),
    await check("catch-up points further back than the skill that failed",
      `SELECT count(*)::int AS n FROM learning.student_assignments sa
       JOIN core.students st ON st.id = sa.student_id AND st.student_code LIKE 'DEMO-%'
       JOIN learning.daily_lessons dl ON dl.id = sa.daily_lesson_id
       WHERE sa.reason IS NOT NULL AND dl.lesson_code <> 'D-M4-LESSON'`,
      (n) => n >= 1),
    await check("every student has work today",
      `SELECT count(DISTINCT sa.student_id)::int AS n FROM learning.student_assignments sa
       JOIN core.students st ON st.id = sa.student_id AND st.student_code LIKE 'DEMO-%'
       WHERE sa.assigned_on = CURRENT_DATE`,
      (n) => n === students.length),
  ];

  const failed = results.filter((ok) => !ok).length;
  console.log(`\n${results.length - failed}/${results.length} links hold.`);

  console.log("\nSign in with (passwords are local only):");
  for (const account of accounts) {
    console.log(`  ${account.username.padEnd(16)} ${account.role.padEnd(8)} ${account.password}  ${account.note}`);
  }
  const sample = students[0];
  console.log(`  ${sample.username.padEnd(16)} STUDENT  ${sample.password}  ${sample.klass.replace("DEMO-", "")} (${sample.name})`);
  console.log(`  ...and ${students.length - 1} more students in the account file.`);

  const studentAccounts = students.map((s) => ({
    username: s.username, password: s.password, klass: s.klass, name: s.name,
  }));
  const accountsFile = path.resolve(process.cwd(), "../../local-data/generated", `${database}-demo-accounts.json`);
  await mkdir(path.dirname(accountsFile), { recursive: true });
  await writeFile(accountsFile, JSON.stringify({ staff: accounts, students: studentAccounts }, null, 2) + "\n", { mode: 0o600 });
  console.log(`\nAccount list written to local-data/generated/${database}-demo-accounts.json`);

  if (failed > 0) process.exitCode = 1;
} catch (error) {
  console.error(`Failed: ${error instanceof Error ? error.message : String(error)}`);
  const cause = (error as { cause?: { message?: string; detail?: string } }).cause;
  if (cause?.message) console.error(`  ${cause.message}`);
  if (cause?.detail) console.error(`  ${cause.detail}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
