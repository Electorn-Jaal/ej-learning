import path from "node:path";
import { stat } from "node:fs/promises";
import { badRequest, forbidden } from "../../shared/http-error";
import type { AuthenticatedUser } from "../identity/service";
import * as repository from "./repository";

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

export async function studentToday(user: AuthenticatedUser) {
  if (user.studentId === null) {
    throw forbidden(
      "Энэ бүртгэл сурагчийн бүртгэлтэй холбогдоогүй байна.",
      "NO_STUDENT_LINK",
    );
  }
  const date = todayInUlaanbaatar();
  const [enrolment] = await repository.studentClass(user.studentId);
  const [row] = await repository.todayLesson(user.studentId, date);

  return {
    date,
    dateLabel: longDate(date),
    className: enrolment?.className ?? "",
    lesson: row
      ? {
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
                  fileUrl: `/api/content/materials/${row.materialId}/file`,
                },
        }
      : null,
    notice: row
      ? "Хичээлээ дэвтэртээ гүйцэтгээд шалгах асуултад хариулна."
      : !enrolment
        ? "Та ангид бүртгэгдээгүй байна. Багштайгаа холбогдоно уу."
        : "Өнөөдөр хуваарьт хичээл алга.",
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

export async function teacherDashboard(user: AuthenticatedUser) {
  const isAdmin = user.roles.includes("ADMIN");
  const classes = await repository.teacherClassIds(user.teacherId, isAdmin);
  const classIds = classes.map((row) => row.id);
  const onDate = todayInUlaanbaatar();
  // A teacher teaches one subject across their classes in this data; take the
  // first non-null rather than pretending to handle several until it happens.
  const subjectId = classes.find((row) => row.subjectId !== null)?.subjectId ?? null;
  const [subject] = await repository.subjectFramework(subjectId);

  if (classIds.length === 0) {
    return {
      teacherName: user.displayName,
      subjectName: subject?.subjectName ?? null,
      levelFramework: null,
      classCount: 0,
      studentCount: 0,
      placedCount: 0,
      assignedToday: 0,
      answeredToday: 0,
      levels: [],
      attention: [],
    };
  }

  const [[counts], levels, attention] = await Promise.all([
    repository.dashboardCounts(classIds, onDate),
    repository.levelBands(classIds),
    repository.attentionRows(classIds, onDate),
  ]);

  return {
    teacherName: user.displayName,
    subjectName: subject?.subjectName ?? null,
    levelFramework: subject?.framework ?? null,
    classCount: classIds.length,
    ...counts,
    // Bands are only meaningful for a subject that is actually levelled.
    levels: subject?.framework ? levels : [],
    attention,
  };
}
