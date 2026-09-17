import path from "node:path";
import { stat } from "node:fs/promises";
import { forbidden } from "../../shared/http-error";
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
