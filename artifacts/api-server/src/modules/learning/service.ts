import path from "node:path";
import { stat } from "node:fs/promises";
import { badRequest, forbidden } from "../../shared/http-error";
import type { AuthenticatedUser } from "../identity/service";
import * as repository from "./repository";
import { recordSkillEvidence, recordTeacherMastery } from "./mastery";
import { assignRemediation } from "./remediation";

/** Mongolian schooling splits at grade 6; the two teacher workflows follow it. */
export const stageForGrade = (gradeLevel: number): "PRIMARY" | "SECONDARY" =>
  gradeLevel <= 5 ? "PRIMARY" : "SECONDARY";

export const todayInUlaanbaatar = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ulaanbaatar" }).format(new Date());

const longDate = (isoDate: string) =>
  new Intl.DateTimeFormat("mn-MN", { dateStyle: "long", timeZone: "UTC" }).format(
    new Date(`${isoDate}T00:00:00Z`),
  );

export const shiftDays = (isoDate: string, days: number) => {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const isDate = (value: unknown): value is string =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

/** One place that turns a lesson row into the shape the contract promises. */
function toLessonView(row: repository.LessonRow) {
  return {
    id: row.id,
    lessonCode: row.lessonCode,
    lessonType: row.lessonType,
    skillName: row.skillName,
    learningGoal: row.learningGoal,
    remember: row.remember,
    workedExample: row.workedExample,
    guidedPractice: row.guidedPractice,
    independentPractice: row.independentPractice,
    studentMessage: row.studentMessage,
    estimatedMinutes: row.estimatedMinutes,
    book:
      row.materialId === null
        ? null
        : {
            materialId: row.materialId,
            title: row.materialTitle,
            chapterTitle: row.chapterTitle,
            pageFrom: row.pageFrom,
            pageTo: row.pageTo,
            filePage: row.pageFrom === null ? null : row.pageFrom + row.pageOffset,
            fileUrl: `/api/content/materials/${row.materialId}/file`,
          },
  };
}

export async function studentToday(user: AuthenticatedUser) {
  if (user.studentId === null) {
    throw forbidden(
      "Энэ бүртгэл сурагчийн бүртгэлтэй холбогдоогүй байна.",
      "NO_STUDENT_LINK",
    );
  }
  const date = todayInUlaanbaatar();
  const [enrolment] = await repository.studentClass(user.studentId);
  const [classRow] = await repository.todayLesson(user.studentId, date);
  const [assignment] = await repository.assignmentForDay(user.studentId, date);

  // A day is the class lesson plus whatever this student personally owes.
  // Where a subject places students by level there is no class lesson at all
  // and the personal one is the whole of it, so both are returned and the
  // client decides what to lead with.
  const [extraRow] = assignment
    ? await repository.lessonById(assignment.dailyLessonId)
    : [];

  return {
    date,
    dateLabel: longDate(date),
    className: enrolment?.className ?? "",
    lesson: classRow ? toLessonView(classRow) : null,
    extra:
      extraRow && assignment
        ? {
            lesson: toLessonView(extraRow),
            source: assignment.source as "AUTO" | "TEACHER",
            reason: assignment.reason,
          }
        : null,
    notice: classRow || extraRow
      ? "Хичээлээ дэвтэртээ гүйцэтгээд шалгах асуултад хариулна."
      : !enrolment
        ? "Та ангид бүртгэгдээгүй байна. Багштайгаа холбогдоно уу."
        : "Өнөөдөр хуваарьт хичээл алга.",
  };
}

/**
 * Assigns extra work to one student.
 *
 * The teacher must teach that student's class, and the lesson must be one the
 * class could be taught - the endpoint takes ids, and without both checks any
 * lesson could be pushed onto any child.
 */
export async function assignExtraWork(
  user: AuthenticatedUser,
  input: { studentId: number; lessonId: number; assignedOn: string; reason: string | null },
) {
  const [enrolment] = await repository.classOfStudent(input.studentId);
  if (!enrolment) {
    throw badRequest("Сурагч ангид бүртгэгдээгүй байна.", "STUDENT_NOT_ENROLLED");
  }
  const klass = await authorisedClass(user, enrolment.classId);

  const lessons = await repository.schedulableLessons(klass.classId);
  if (!lessons.some((lesson) => lesson.id === input.lessonId)) {
    throw badRequest(
      "Энэ хичээлийг тухайн сурагчид оноох боломжгүй.",
      "LESSON_NOT_SCHEDULABLE",
    );
  }

  await repository.upsertStudentAssignment({
    studentId: input.studentId,
    dailyLessonId: input.lessonId,
    assignedOn: input.assignedOn,
    assignedBy: user.id,
    reason: input.reason,
  });

  const [lesson] = await repository.lessonById(input.lessonId);
  return {
    studentName: enrolment.studentName,
    lessonCode: lesson.lessonCode,
    skillName: lesson.skillName,
    assignedOn: input.assignedOn,
  };
}

export async function teacherSchedule(
  user: AuthenticatedUser,
  query: { classId: number; from?: unknown; to?: unknown },
) {
  const today = todayInUlaanbaatar();
  const from = isDate(query.from) ? query.from : shiftDays(today, -7);
  const to = isDate(query.to) ? query.to : shiftDays(today, 14);
  if (from > to) {
    throw forbidden("Огнооны муж буруу байна.", "INVALID_RANGE");
  }

  // An admin may look at any class; a teacher only at their own.
  const isAdmin = user.roles.includes("ADMIN");
  const [klass] = isAdmin
    ? await repository.anyClass(query.classId)
    : user.teacherId === null
      ? []
      : await repository.teacherClass(user.teacherId, query.classId);

  if (!klass) {
    throw forbidden("Энэ ангийн хуваарийг харах эрхгүй байна.", "NOT_YOUR_CLASS");
  }

  const days = await repository.scheduleForClass(klass.classId, from, to);
  return {
    classId: klass.classId,
    className: klass.className,
    gradeLevel: klass.gradeLevel,
    stage: stageForGrade(klass.gradeLevel),
    days: days.map((day) => ({ ...day, isToday: day.scheduledOn === today })),
  };
}

const storageRoot = () =>
  path.resolve(process.env.EJ_STORAGE_DIR ?? path.resolve(process.cwd(), "storage"));

/**
 * Resolves a stored file, refusing anything that escapes the storage root.
 *
 * storage_key is a database value rather than user input, but a bad import or
 * a later upload path could put "../" in it, and serving arbitrary files off
 * the host is not a failure worth risking on trust alone.
 */
export async function materialFile(materialId: number) {
  const [version] = await repository.approvedVersion(materialId);
  if (!version?.storageKey) return null;

  const root = storageRoot();
  const resolved = path.resolve(root, version.storageKey);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null;

  try {
    const info = await stat(resolved);
    if (!info.isFile()) return null;
  } catch {
    return null;
  }

  return {
    filePath: resolved,
    mimeType: version.mimeType ?? "application/octet-stream",
    filename: version.filename ?? path.basename(resolved),
  };
}

/**
 * Records a practice attempt.
 *
 * The lesson must be one actually scheduled for the student's own class, so a
 * student cannot post attempts against arbitrary lesson ids. The marking comes
 * from the client, because the questions are still there; what the server owns
 * is who the attempt belongs to and which lesson it may name.
 */
export async function recordQuizAttempt(
  user: AuthenticatedUser,
  input: {
    lessonId: number;
    lessonCode: string;
    answers: repository.QuizAnswer[];
  },
) {
  if (user.studentId === null) {
    throw forbidden(
      "Энэ бүртгэл сурагчийн бүртгэлтэй холбогдоогүй байна.",
      "NO_STUDENT_LINK",
    );
  }
  if (!(await repository.lessonBelongsToClass(input.lessonId, user.studentId))) {
    throw forbidden(
      "Энэ хичээл таны ангид оноогдоогүй байна.",
      "LESSON_NOT_ASSIGNED",
    );
  }

  return repository.insertQuizAttempt({
    studentId: user.studentId,
    dailyLessonId: input.lessonId,
    lessonCode: input.lessonCode,
    answers: input.answers,
    score: input.answers.filter((answer) => answer.correct).length,
    maxScore: input.answers.length,
  });
}

export async function quizAttemptsForTeacher(
  user: AuthenticatedUser,
  classId: number,
  limit: number,
) {
  const isAdmin = user.roles.includes("ADMIN");
  const [klass] = isAdmin
    ? await repository.anyClass(classId)
    : user.teacherId === null
      ? []
      : await repository.teacherClass(user.teacherId, classId);

  if (!klass) {
    throw forbidden("Энэ ангийн үр дүнг харах эрхгүй байна.", "NOT_YOUR_CLASS");
  }

  return {
    classId: klass.classId,
    className: klass.className,
    attempts: await repository.attemptsForClass(klass.classId, limit),
  };
}

/**
 * What a class has and has not got hold of, skill by skill.
 *
 * The named students are capped: a teacher needs to see who to sit with, and a
 * list of thirty names is a report rather than an instruction. The counts
 * above them are complete, so nothing is hidden by the cap.
 */
export async function classSkillsForTeacher(user: AuthenticatedUser, classId: number) {
  const klass = await authorisedClass(user, classId);
  const skills = await repository.classSkillMastery(klass.classId);

  return {
    classId: klass.classId,
    className: klass.className,
    skills: skills.map((skill) => ({
      ...skill,
      weakest: skill.weakest.slice(0, 5),
      weakestTotal: skill.weakest.length,
    })),
  };
}

/**
 * The register a teacher fills in for a paper assessment.
 *
 * Primary grades do the monthly assessment in a notebook, so nothing reaches
 * the system until a teacher has marked it. This is that screen's data: the
 * skills this class may be marked against, and where every student currently
 * stands on the one chosen.
 */
export async function assessmentSheet(
  user: AuthenticatedUser,
  classId: number,
  skillId: number | null,
) {
  const klass = await authorisedClass(user, classId);
  const skills = await repository.assessableSkills(klass.classId);
  const chosen = skillId ?? skills[0]?.skillId ?? null;

  return {
    classId: klass.classId,
    className: klass.className,
    gradeLevel: klass.gradeLevel,
    // Primary grades are the reason this screen exists; upper grades may still
    // use it, for a child who was absent for the web assessment.
    stage: stageForGrade(klass.gradeLevel),
    skills,
    skillId: chosen,
    students: chosen === null ? [] : await repository.classRosterForSkill(klass.classId, chosen),
  };
}

/**
 * Writes a teacher's marking of a paper assessment.
 *
 * Entries naming a student who is not in this class are refused rather than
 * ignored: a register that silently drops a row would have the teacher
 * believing a child was recorded when they were not.
 */
export async function submitAssessment(
  user: AuthenticatedUser,
  input: {
    classId: number;
    skillId: number;
    entries: { studentId: number; status: "MASTERED" | "DEVELOPING" | "GAP"; score: number | null }[];
  },
) {
  const klass = await authorisedClass(user, input.classId);

  if (!(await repository.skillAssessableForClass(klass.classId, input.skillId))) {
    throw badRequest("Энэ чадвар тухайн ангид тохирохгүй байна.", "SKILL_NOT_FOR_CLASS");
  }

  const enrolled = await repository.enrolledStudentIds(klass.classId);
  const stranger = input.entries.find((entry) => !enrolled.has(entry.studentId));
  if (stranger) {
    throw badRequest("Энэ ангид харьяалагдахгүй сурагч байна.", "STUDENT_NOT_IN_CLASS");
  }

  for (const entry of input.entries) {
    await recordTeacherMastery({
      studentId: entry.studentId,
      skillId: input.skillId,
      status: entry.status,
      score: entry.score,
      teacherUsername: user.username,
    });
  }

  return {
    classId: klass.classId,
    skillId: input.skillId,
    recorded: input.entries.length,
  };
}

/**
 * Question-by-question results for a class, worst first.
 *
 * Deliberately not filtered to a threshold: a teacher scanning this wants to
 * see where the cliff is, and a list that has already decided what counts as
 * bad hides the judgement it made.
 */
export async function itemAnalysis(user: AuthenticatedUser, classId: number) {
  const klass = await authorisedClass(user, classId);
  return {
    classId: klass.classId,
    className: klass.className,
    items: await repository.itemAnalysisForClass(klass.classId),
  };
}

/** Resolves the class a teacher may act on, or refuses. Admins bypass. */
async function authorisedClass(user: AuthenticatedUser, classId: number) {
  const isAdmin = user.roles.includes("ADMIN");
  const [klass] = isAdmin
    ? await repository.anyClass(classId)
    : user.teacherId === null
      ? []
      : await repository.teacherClass(user.teacherId, classId);
  if (!klass) {
    throw forbidden("Энэ ангид өөрчлөлт хийх эрхгүй байна.", "NOT_YOUR_CLASS");
  }
  return klass;
}

export async function schedulableLessons(user: AuthenticatedUser, classId: number) {
  const klass = await authorisedClass(user, classId);
  return repository.schedulableLessons(klass.classId);
}

/** Weekdays between two dates. Holidays are not modelled; a teacher clears those. */
function schoolDays(from: string, to: string): string[] {
  const days: string[] = [];
  for (let day = from; day <= to; day = shiftDays(day, 1)) {
    const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
    if (weekday !== 0 && weekday !== 6) days.push(day);
  }
  return days;
}

export async function generateSchedule(
  user: AuthenticatedUser,
  input: { classId: number; termId: number },
) {
  const klass = await authorisedClass(user, input.classId);
  const [term] = await repository.termById(input.termId);
  if (!term) throw badRequest("Улирал олдсонгүй.", "TERM_NOT_FOUND");

  const lessons = await repository.schedulableLessons(klass.classId);
  if (lessons.length === 0) {
    return {
      created: 0,
      skipped: 0,
      lessonsAvailable: 0,
      firstDay: null,
      lastDay: null,
      notice:
        "Энэ ангид баталгаажсан хичээл алга. Эхлээд сургалтын агуулгыг оруулна уу.",
    };
  }

  const taken = new Set(
    (await repository.scheduledDates(klass.classId, term.startsOn, term.endsOn)).map(
      (row) => row.scheduledOn,
    ),
  );
  const days = schoolDays(term.startsOn, term.endsOn);
  const free = days.filter((day) => !taken.has(day));

  // The book runs out long before the term does, so it repeats from the start
  // rather than leaving the rest of the term blank. With a real book this
  // wraps rarely; with three mock chapters it wraps often, and saying so is
  // better than silently producing a term of duplicates.
  const rows = free.map((day, index) => ({
    classId: klass.classId,
    termId: term.id,
    dailyLessonId: lessons[index % lessons.length].id,
    scheduledOn: day,
    createdBy: user.id,
  }));
  await repository.insertScheduleDays(rows);

  const wrapped = free.length > lessons.length;
  return {
    created: rows.length,
    skipped: days.length - free.length,
    lessonsAvailable: lessons.length,
    firstDay: free[0] ?? null,
    lastDay: free[free.length - 1] ?? null,
    notice: wrapped
      ? `${term.nameMn}: ${lessons.length} хичээл ${free.length} өдөрт хүрэлцэхгүй тул давтагдсан. Агуулга нэмэгдэхэд дахин үүсгэнэ үү.`
      : `${term.nameMn}: ${rows.length} өдөр хуваарилагдлаа.`,
  };
}

export async function setScheduleDay(
  user: AuthenticatedUser,
  input: { classId: number; scheduledOn: string; lessonId: number | null },
) {
  const klass = await authorisedClass(user, input.classId);

  if (input.lessonId === null) {
    await repository.clearScheduleDay(klass.classId, input.scheduledOn);
    return;
  }

  // Only a lesson this class could be taught: the endpoint takes an id, and
  // without this any approved lesson from any grade would be assignable.
  const lessons = await repository.schedulableLessons(klass.classId);
  if (!lessons.some((lesson) => lesson.id === input.lessonId)) {
    throw badRequest(
      "Энэ хичээлийг тухайн ангид оноох боломжгүй.",
      "LESSON_NOT_SCHEDULABLE",
    );
  }

  const [term] = await repository.termCovering(input.scheduledOn);
  if (!term) {
    throw badRequest(
      "Энэ огноо ямар ч улиралд хамаарахгүй байна.",
      "OUTSIDE_TERM",
    );
  }

  await repository.setScheduleDay({
    classId: klass.classId,
    termId: term.id,
    dailyLessonId: input.lessonId,
    scheduledOn: input.scheduledOn,
    createdBy: user.id,
  });
}

/**
 * What a teacher is teaching today, class by class.
 *
 * Organised by class rather than by teacher, because a teacher holds several
 * and often more than one subject: totalling students across a Mongolian class
 * and a maths class answers no question anybody asks, and labelling the lot
 * with whichever subject came first is simply wrong.
 */
export async function teacherDashboard(user: AuthenticatedUser) {
  const isAdmin = user.roles.includes("ADMIN");
  const classes = await repository.teacherClasses(user.teacherId, isAdmin);
  const onDate = todayInUlaanbaatar();

  const rows = await Promise.all(
    classes.map(async (klass) => {
      const [framework] = await repository.frameworkOfSubject(klass.subjectId);
      const levelled = Boolean(framework?.framework);

      const [[lesson], [counts], attention] = await Promise.all([
        repository.classLessonToday(klass.classId, onDate),
        repository.classCounts(klass.classId, onDate),
        repository.classAttention(klass.classId, onDate, levelled),
      ]);

      return {
        classId: klass.classId,
        className: klass.className,
        gradeLevel: klass.gradeLevel,
        subjectName: klass.subjectName,
        levelFramework: framework?.framework ?? null,
        lessonCode: lesson?.lessonCode ?? null,
        skillName: lesson?.skillName ?? null,
        pageFrom: lesson?.pageFrom ?? null,
        pageTo: lesson?.pageTo ?? null,
        studentCount: counts?.studentCount ?? 0,
        answeredToday: counts?.answeredToday ?? 0,
        attention,
      };
    }),
  );

  return {
    teacherName: user.displayName,
    dateLabel: new Intl.DateTimeFormat("mn-MN", {
      dateStyle: "long",
      timeZone: "Asia/Ulaanbaatar",
    }).format(new Date(`${onDate}T00:00:00Z`)),
    classes: rows,
  };
}

export type QuizQuestion = {
  itemId: number;
  prompt: string;
  options: { optionId: number; text: string }[];
};

/** Groups the flat option rows into questions, dropping isCorrect on the way. */
function groupQuestions(rows: repository.QuizItemRow[]): QuizQuestion[] {
  const byItem = new Map<number, QuizQuestion>();
  for (const row of rows) {
    let question = byItem.get(row.itemId);
    if (!question) {
      question = { itemId: row.itemId, prompt: row.prompt, options: [] };
      byItem.set(row.itemId, question);
    }
    question.options.push({ optionId: row.optionId, text: row.optionText });
  }
  return [...byItem.values()];
}

export async function quizPaper(user: AuthenticatedUser, lessonId: number) {
  if (user.studentId === null) {
    throw forbidden("Сурагчийн бүртгэлгүй байна.", "NO_STUDENT_LINK");
  }
  if (!(await repository.lessonReachableByStudent(lessonId, user.studentId))) {
    throw forbidden("Энэ хичээл танд оногдоогүй байна.", "LESSON_NOT_ASSIGNED");
  }

  const [header] = await repository.lessonHeader(lessonId);
  const rows = await repository.quizItemsForLesson(lessonId);
  return {
    lessonId,
    lessonCode: header?.lessonCode ?? "",
    skillName: header?.skillName ?? "",
    questions: groupQuestions(rows),
  };
}

/**
 * Marks an attempt on the server.
 *
 * The client sends which option it chose and nothing else. Previously it sent
 * whether each answer was right, which was fine while a quiz was practice a
 * student checked themselves and is not fine for anything that counts.
 */
export async function recordQuizAttemptScored(
  user: AuthenticatedUser,
  input: { lessonId: number; answers: { itemId: number; optionId: number | null }[] },
) {
  if (user.studentId === null) {
    throw forbidden("Сурагчийн бүртгэлгүй байна.", "NO_STUDENT_LINK");
  }
  if (!(await repository.lessonReachableByStudent(input.lessonId, user.studentId))) {
    throw forbidden("Энэ хичээл танд оногдоогүй байна.", "LESSON_NOT_ASSIGNED");
  }

  const rows = await repository.quizItemsForLesson(input.lessonId);
  if (rows.length === 0) {
    throw badRequest("Энэ хичээлд шалгах асуулт алга.", "NO_QUESTIONS");
  }

  const options = new Map(rows.map((row) => [row.optionId, row]));
  const items = new Map<number, repository.QuizItemRow[]>();
  for (const row of rows) {
    items.set(row.itemId, [...(items.get(row.itemId) ?? []), row]);
  }

  const chosen = new Map(input.answers.map((answer) => [answer.itemId, answer.optionId]));
  const stored: repository.QuizAnswer[] = [];
  const results = [];

  for (const [itemId, itemRows] of items) {
    const optionId = chosen.get(itemId) ?? null;
    const picked = optionId === null ? null : options.get(optionId);
    // An option id belonging to a different question is treated as unanswered
    // rather than accepted, so a crafted request cannot score a point.
    const valid = picked && picked.itemId === itemId ? picked : null;
    const correct = valid?.isCorrect ?? false;
    const key = itemRows.find((row) => row.isCorrect) ?? null;

    stored.push({
      questionId: String(itemId),
      prompt: itemRows[0].prompt,
      chosenOptionId: valid ? String(valid.optionId) : "",
      chosenText: valid?.optionText ?? "",
      correct,
    });
    results.push({
      itemId,
      correct,
      correctOptionId: key?.optionId ?? null,
      explanation: itemRows[0].explanation,
    });
  }

  const attempt = await repository.insertQuizAttempt({
    studentId: user.studentId,
    dailyLessonId: input.lessonId,
    lessonCode: (await repository.lessonHeader(input.lessonId))[0]?.lessonCode ?? "",
    answers: stored,
    score: stored.filter((answer) => answer.correct).length,
    maxScore: stored.length,
  });

  // The attempt is the record of one sitting; this is what the sitting says
  // about the student. Grouped by the skill each question tests rather than by
  // the lesson, so a quiz that draws on two skills is not averaged into one
  // meaningless number - today every item hangs off the lesson's core skill,
  // but a diagnostic will not.
  const perSkill = new Map<number, { correct: number; total: number }>();
  for (const [itemId, itemRows] of items) {
    const skillId = itemRows[0].skillId;
    if (!skillId) continue;
    const tally = perSkill.get(skillId) ?? { correct: 0, total: 0 };
    tally.total += 1;
    if (results.find((result) => result.itemId === itemId)?.correct) tally.correct += 1;
    perSkill.set(skillId, tally);
  }
  await recordSkillEvidence(
    user.studentId,
    [...perSkill].map(([skillId, tally]) => ({ skillId, ...tally })),
  );

  // A measurement that changes nothing is just a number. If the answers have
  // left the student with a gap, tomorrow's extra work is booked now, walking
  // back through what the skill stands on to find where they actually fell
  // behind. Today's work is already in front of them, so it lands tomorrow.
  await assignRemediation(user.studentId, shiftDays(todayInUlaanbaatar(), 1));

  return { ...attempt, results };
}
