/**
 * Seeds one textbook's worth of MOCK curriculum so the daily-lesson flow has
 * something to show. Replace all of it when the real content arrives - every
 * row it writes carries a MOCK- code prefix so it can be found and removed.
 *
 *   node scripts/run-ts.mjs scripts/seed-content.ts
 *
 * Content is written APPROVED. The reader queries filter on APPROVED, so DRAFT
 * rows are invisible to students, and the approval workflow that would move
 * them there is a later block.
 *
 * Grade-8 skills and the dependencies pointing at them are seeded even though
 * the diagnostic that would use them is deferred: they are what the
 * remediation walk reads, and seeding them now keeps that design visible and
 * testable rather than theoretical.
 */
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import {
  classScheduleInLearning,
  classesInCore,
  contentNodesInContent,
  contentSkillMapsInContent,
  contentSourceAlignmentsInContent,
  dailyLessonsInLearning,
  db,
  gradeLevelsInCore,
  pool,
  skillDependenciesInContent,
  skillsInContent,
  sourceMaterialGradesInContent,
  sourceMaterialsInContent,
  sourceOutlineNodesInContent,
  sourceVersionsInContent,
  subjectsInCore,
  termsInLearning,
  usersInCore,
} from "@workspace/db";

const STORAGE_KEY = "content/mock-mgl-9.pdf";
const storageRoot =
  process.env.EJ_STORAGE_DIR ?? path.resolve(process.cwd(), "../../storage");

const SCHOOL_YEAR = "2026-2027";
const TERMS = [
  { termNumber: 1, nameMn: "I улирал", startsOn: "2026-09-01", endsOn: "2026-12-30" },
  { termNumber: 2, nameMn: "II улирал", startsOn: "2027-01-05", endsOn: "2027-03-20" },
  { termNumber: 3, nameMn: "III улирал", startsOn: "2027-03-25", endsOn: "2027-06-05" },
];

/** Grade 9 skills, each paired with the grade 8 skill it builds on. */
const SKILLS = [
  {
    code: "MOCK-MGL09-TEXT-STRUCT",
    name: "Эхийн бүтцийг таних",
    outcome: "Эхийг оршил, гол хэсэг, төгсгөл болгон ялган тайлбарлана.",
    prerequisite: {
      code: "MOCK-MGL08-TEXT-STRUCT",
      name: "Цогцолборыг таних",
      outcome: "Догол мөрийг цогцолбор болгон ялгана.",
    },
    reason: "Цогцолбор таних → бүтцийн хэсэгт ангилах",
  },
  {
    code: "MOCK-MGL09-MAIN-IDEA",
    name: "Гол санааг ялгах",
    outcome: "Догол мөр бүрийн түлхүүр өгүүлбэрийг олж, гол санааг нэгтгэнэ.",
    prerequisite: {
      code: "MOCK-MGL08-MAIN-IDEA",
      name: "Түлхүүр үг олох",
      outcome: "Өгүүлбэрээс түлхүүр үгийг ялгана.",
    },
    reason: "Түлхүүр үг олох → түлхүүр өгүүлбэр ялгах",
  },
  {
    code: "MOCK-MGL09-SENT-CORE",
    name: "Өгүүлбэрийн гол гишүүд",
    outcome: "Өгүүлэгдэхүүн, өгүүлэхүүнийг тодорхойлно.",
    prerequisite: null,
    reason: null,
  },
  {
    code: "MOCK-MGL09-COH-LINK",
    name: "Холбоос үг хэрэглэх",
    outcome: "Утгын холбоог холбоос үгээр зөв илэрхийлнэ.",
    prerequisite: null,
    reason: null,
  },
];

/** Book chapters, with the page ranges the generated PDF actually has. */
const CHAPTERS = [
  { code: "MOCK-OUT-01", number: "I", title: "Эхийн бүтэц", pageFrom: 2, pageTo: 4 },
  { code: "MOCK-OUT-02", number: "II", title: "Найруулга", pageFrom: 5, pageTo: 7 },
  { code: "MOCK-OUT-03", number: "III", title: "Үг зүй", pageFrom: 8, pageTo: 8 },
];

const TOPICS = [
  { code: "MOCK-MGL-TOP-01", name: "Эхийн бүтэц", chapter: 0, skills: [0, 1] },
  { code: "MOCK-MGL-TOP-02", name: "Найруулга", chapter: 1, skills: [2, 3] },
  { code: "MOCK-MGL-TOP-03", name: "Үг зүй", chapter: 2, skills: [] },
];

const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Ulaanbaatar",
}).format(new Date());

const shiftDays = (isoDate: string, days: number) => {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

try {
  const filePath = path.join(storageRoot, STORAGE_KEY);
  let fileBytes: Buffer;
  try {
    fileBytes = await readFile(filePath);
    await stat(filePath);
  } catch {
    console.error(
      `Missing ${filePath}.\nGenerate it first:\n  python scripts/src/make-mock-pdf.py storage/${STORAGE_KEY}`,
    );
    process.exit(1);
  }

  const [subject] = await db
    .select({ id: subjectsInCore.id })
    .from(subjectsInCore)
    .where(eq(subjectsInCore.code, "MGL"))
    .limit(1);
  if (!subject) {
    console.error('No subject "MGL". Run reset-dev first.');
    process.exit(1);
  }

  const grades = await db
    .select({ id: gradeLevelsInCore.id, gradeNumber: gradeLevelsInCore.gradeNumber })
    .from(gradeLevelsInCore);
  const gradeId = (n: number) => grades.find((g) => g.gradeNumber === n)!.id;

  const [klass] = await db
    .select({ id: classesInCore.id })
    .from(classesInCore)
    .where(eq(classesInCore.classCode, "EJ-G09-A"))
    .limit(1);

  const [admin] = await db
    .select({ id: usersInCore.id })
    .from(usersInCore)
    .where(eq(usersInCore.username, "admin"))
    .limit(1);

  await db.transaction(async (tx) => {
    const [material] = await tx
      .insert(sourceMaterialsInContent)
      .values({
        sourceCode: "MOCK-MGL-G09-TB",
        subjectId: subject.id,
        title: "Монгол хэл 9 (mock)",
        materialType: "TEXTBOOK",
        totalPages: 8,
        status: "APPROVED",
        dataQualityStatus: "COMPLETE",
        notes: "Mock textbook. Replace with the real book.",
      })
      .returning({ id: sourceMaterialsInContent.id });

    await tx.insert(sourceVersionsInContent).values({
      sourceMaterialId: material.id,
      versionNo: 1,
      originalFilename: "mock-mgl-9.pdf",
      storageKey: STORAGE_KEY,
      mimeType: "application/pdf",
      fileSizeBytes: fileBytes.byteLength,
      checksumSha256: createHash("sha256").update(fileBytes).digest("hex"),
      status: "APPROVED",
    });

    await tx
      .insert(sourceMaterialGradesInContent)
      .values({ sourceMaterialId: material.id, gradeLevelId: gradeId(9) });

    const chapters = [];
    for (const [index, chapter] of CHAPTERS.entries()) {
      const [row] = await tx
        .insert(sourceOutlineNodesInContent)
        .values({
          sourceMaterialId: material.id,
          outlineCode: chapter.code,
          printedNumber: chapter.number,
          nodeType: "CHAPTER",
          title: chapter.title,
          pageFrom: chapter.pageFrom,
          pageTo: chapter.pageTo,
          sequenceNo: index + 1,
          status: "APPROVED",
          dataQualityStatus: "COMPLETE",
        })
        .returning({ id: sourceOutlineNodesInContent.id });
      chapters.push(row);
    }

    const [domain] = await tx
      .insert(contentNodesInContent)
      .values({
        subjectId: subject.id,
        contentCode: "MOCK-MGL-DOM-01",
        levelType: "DOMAIN",
        nameMn: "Эх ба найруулга",
        gradeFromId: gradeId(9),
        gradeToId: gradeId(9),
        sequenceNo: 1,
        status: "APPROVED",
        dataQualityStatus: "COMPLETE",
      })
      .returning({ id: contentNodesInContent.id });

    // Grade 8 prerequisites first: the grade 9 rows reference them.
    const skillIdByCode = new Map<string, number>();
    for (const skill of SKILLS) {
      if (!skill.prerequisite) continue;
      const [row] = await tx
        .insert(skillsInContent)
        .values({
          skillCode: skill.prerequisite.code,
          subjectId: subject.id,
          gradeLevelId: gradeId(8),
          nameMn: skill.prerequisite.name,
          learningOutcomeMn: skill.prerequisite.outcome,
          status: "APPROVED",
          dataQualityStatus: "COMPLETE",
        })
        .returning({ id: skillsInContent.id });
      skillIdByCode.set(skill.prerequisite.code, row.id);
    }

    for (const skill of SKILLS) {
      const [row] = await tx
        .insert(skillsInContent)
        .values({
          skillCode: skill.code,
          subjectId: subject.id,
          gradeLevelId: gradeId(9),
          nameMn: skill.name,
          learningOutcomeMn: skill.outcome,
          status: "APPROVED",
          dataQualityStatus: "COMPLETE",
        })
        .returning({ id: skillsInContent.id });
      skillIdByCode.set(skill.code, row.id);
    }

    for (const skill of SKILLS) {
      if (!skill.prerequisite) continue;
      await tx.insert(skillDependenciesInContent).values({
        dependencyCode: `DEP-${skill.code}`,
        skillId: skillIdByCode.get(skill.code)!,
        prerequisiteSkillId: skillIdByCode.get(skill.prerequisite.code)!,
        relationType: "REQUIRED",
        importance: "HIGH",
        reasonMn: skill.reason!,
        status: "APPROVED",
      });
    }

    for (const [index, topic] of TOPICS.entries()) {
      const [node] = await tx
        .insert(contentNodesInContent)
        .values({
          subjectId: subject.id,
          parentId: domain.id,
          contentCode: topic.code,
          levelType: "TOPIC",
          nameMn: topic.name,
          gradeFromId: gradeId(9),
          gradeToId: gradeId(9),
          sequenceNo: index + 1,
          status: "APPROVED",
          dataQualityStatus: "COMPLETE",
        })
        .returning({ id: contentNodesInContent.id });

      const chapter = CHAPTERS[topic.chapter];
      await tx.insert(contentSourceAlignmentsInContent).values({
        alignmentCode: `ALIGN-${topic.code}`,
        contentNodeId: node.id,
        sourceMaterialId: material.id,
        sourceOutlineNodeId: chapters[topic.chapter].id,
        pageFrom: chapter.pageFrom,
        pageTo: chapter.pageTo,
        relationType: "PRIMARY",
        status: "APPROVED",
      });

      for (const [position, skillIndex] of topic.skills.entries()) {
        await tx.insert(contentSkillMapsInContent).values({
          mapCode: `MAP-${topic.code}-${position + 1}`,
          contentNodeId: node.id,
          skillId: skillIdByCode.get(SKILLS[skillIndex].code)!,
          isPrimary: position === 0,
          status: "APPROVED",
        });
      }
    }

    const lessons = [];
    for (const [index, skill] of SKILLS.entries()) {
      const chapter = CHAPTERS[Math.min(index < 2 ? 0 : 1, CHAPTERS.length - 1)];
      const [lesson] = await tx
        .insert(dailyLessonsInLearning)
        .values({
          lessonCode: `MOCK-LSN-${String(index + 1).padStart(2, "0")}`,
          coreSkillId: skillIdByCode.get(skill.code)!,
          lessonType: "CORE",
          learningGoalMn: skill.outcome,
          rememberMn: `${skill.name}: үндсэн ойлголтыг сэргээн санана.`,
          workedExampleMn: `Жишээ: ${skill.name} сэдвээр задлан шинжилсэн нэгэн жишээг алхам алхмаар үзнэ.`,
          guidedPracticeMn: `Багштай хамт ${chapter.pageFrom}-${chapter.pageTo} хуудасны дасгалыг гүйцэтгэнэ.`,
          independentPracticeMn: `Дэвтэр дээрээ ${chapter.title} сэдвийн дасгалыг бие даан хийнэ.`,
          estimatedMinutes: 35,
          studentMessageMn: `Өнөөдөр "${skill.name}" сэдвийг үзнэ. Дэвтэртээ хийгээд дараа нь шалгах асуултад хариулаарай.`,
          printReady: true,
          webReady: true,
          sourceMaterialId: material.id,
          status: "APPROVED",
        })
        .returning({ id: dailyLessonsInLearning.id });
      lessons.push(lesson);
    }

    const terms = [];
    for (const term of TERMS) {
      const [row] = await tx
        .insert(termsInLearning)
        .values({ schoolYear: SCHOOL_YEAR, ...term })
        .returning({ id: termsInLearning.id, startsOn: termsInLearning.startsOn, endsOn: termsInLearning.endsOn });
      terms.push(row);
    }

    if (!klass) {
      console.warn("No class EJ-G09-A; skipping the schedule.");
      return;
    }

    // Yesterday, today and the next two days, so "today's lesson" resolves and
    // the surrounding days are visible to the teacher.
    const term = terms.find((t) => today >= t.startsOn && today <= t.endsOn) ?? terms[0];
    for (const [index, offset] of [-1, 0, 1, 2].entries()) {
      await tx.insert(classScheduleInLearning).values({
        classId: klass.id,
        termId: term.id,
        dailyLessonId: lessons[index % lessons.length].id,
        scheduledOn: shiftDays(today, offset),
        createdBy: admin?.id ?? null,
      });
    }
  });

  const [{ count }] = await db
    .select({ count: dailyLessonsInLearning.id })
    .from(dailyLessonsInLearning)
    .limit(1);
  console.log("Seeded mock content:");
  console.log("  1 textbook (8-page PDF), 3 chapters, 1 domain, 3 topics");
  console.log("  6 skills (4 grade 9 + 2 grade 8), 2 prerequisite links");
  console.log("  4 daily lessons, 3 terms, 4 scheduled days around today");
  console.log(`  first lesson id: ${count}`);
  console.log("All APPROVED. Every code is prefixed MOCK- for removal later.");
} catch (error) {
  const detail = error instanceof Error ? error.message : String(error);
  console.error(`Failed: ${detail}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
