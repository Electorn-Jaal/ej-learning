import { badRequest, forbidden } from "../../shared/http-error";
import { isIsoDate, shiftDays, todayInUlaanbaatar } from "../../shared/school-date";
import { stageForGrade } from "../../shared/school-stage";
import { authorisedClass, editableSubjects, viewableSubjects } from "../class-access/service";
import type { AuthenticatedUser } from "../identity/service";
import * as repository from "./repository";

export async function teacherSchedule(
  user: AuthenticatedUser,
  query: { classId: number; from?: unknown; to?: unknown; subjectId?: number | null },
) {
  const today = todayInUlaanbaatar();
  const from = isIsoDate(query.from) ? query.from : shiftDays(today, -7);
  const to = isIsoDate(query.to) ? query.to : shiftDays(today, 14);
  if (from > to) throw forbidden("Огнооны муж буруу байна.", "INVALID_RANGE");

  const klass = await authorisedClass(user, query.classId);
  const subjectIds = await viewableSubjects(user, klass.classId, query.subjectId ?? null);
  const days = await repository.scheduleForClass(klass.classId, from, to, subjectIds);
  return {
    classId: klass.classId,
    className: klass.className,
    gradeLevel: klass.gradeLevel,
    stage: stageForGrade(klass.gradeLevel),
    days: days.map((day) => ({ ...day, isToday: day.scheduledOn === today })),
  };
}

export async function schedulableLessons(
  user: AuthenticatedUser,
  classId: number,
  subjectId: number | null,
) {
  const klass = await authorisedClass(user, classId);
  const subjectIds = await editableSubjects(user, klass.classId, subjectId);
  return repository.schedulableLessons(klass.classId, subjectIds);
}

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
  input: { classId: number; termId?: number | null; subjectId?: number | null },
) {
  const klass = await authorisedClass(user, input.classId);
  const subjectIds = await editableSubjects(user, klass.classId, input.subjectId ?? null);
  const termId =
    input.termId ??
    (await repository.termCovering(todayInUlaanbaatar()))[0]?.id ??
    null;
  if (termId === null) {
    throw badRequest(
      "Өнөөдөр ямар ч улиралд хамаарахгүй байна. Улирлаа бүртгэнэ үү.",
      "NO_CURRENT_TERM",
    );
  }

  const [term] = await repository.termById(termId);
  if (!term) throw badRequest("Улирал олдсонгүй.", "TERM_NOT_FOUND");

  const lessons = await repository.schedulableLessons(klass.classId, subjectIds);
  if (lessons.length === 0) {
    return {
      created: 0,
      skipped: 0,
      lessonsAvailable: 0,
      firstDay: null,
      lastDay: null,
      notice: "Энэ ангид баталгаажсан хичээл алга. Эхлээд сургалтын агуулгыг оруулна уу.",
    };
  }

  const taken = new Set(
    (await repository.scheduledDates(klass.classId, term.startsOn, term.endsOn)).map(
      (row) => row.scheduledOn,
    ),
  );
  const days = schoolDays(term.startsOn, term.endsOn);
  const free = days.filter((day) => !taken.has(day));
  const rows = free.map((day, index) => ({
    classId: klass.classId,
    termId: term.id,
    dailyLessonId: lessons[index % lessons.length].id,
    scheduledOn: day,
    createdBy: user.id,
  }));
  await repository.insertScheduleDays(rows);

  return {
    created: rows.length,
    skipped: days.length - free.length,
    lessonsAvailable: lessons.length,
    firstDay: free[0] ?? null,
    lastDay: free[free.length - 1] ?? null,
    notice:
      free.length > lessons.length
        ? `${term.nameMn}: ${lessons.length} хичээл ${free.length} өдөрт хүрэлцэхгүй тул давтагдсан. Агуулга нэмэгдэхэд дахин үүсгэнэ үү.`
        : `${term.nameMn}: ${rows.length} өдөр хуваарилагдлаа.`,
  };
}

const MAX_NOTE_LENGTH = 2000;

export async function setScheduleDay(
  user: AuthenticatedUser,
  input: {
    classId: number;
    scheduledOn: string;
    lessonId: number | null;
    subjectId?: number | null;
    note?: string | null;
  },
) {
  const klass = await authorisedClass(user, input.classId);
  const subjectIds = await editableSubjects(user, klass.classId, input.subjectId ?? null);
  const date = new Date(`${input.scheduledOn}T00:00:00Z`);
  if (
    !isIsoDate(input.scheduledOn) ||
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== input.scheduledOn
  ) {
    throw badRequest("Огноо буруу байна.", "INVALID_DATE");
  }
  if ((date.getUTCDay() === 0 || date.getUTCDay() === 6) && !user.roles.includes("ADMIN")) {
    throw forbidden(
      "Амралтын өдрийн нөхөх хичээлийг зөвхөн админ өөрчилнө.",
      "ADMIN_REQUIRED_FOR_WEEKEND",
    );
  }

  const trimmed = typeof input.note === "string" ? input.note.trim() : null;
  if (trimmed !== null && trimmed.length > MAX_NOTE_LENGTH) {
    throw badRequest(`Тайлбар ${MAX_NOTE_LENGTH} тэмдэгтээс урт байна.`, "NOTE_TOO_LONG");
  }
  const note = trimmed === "" ? null : trimmed;

  if (input.lessonId === null) {
    await repository.clearScheduleDay(klass.classId, input.scheduledOn, subjectIds);
    return;
  }

  const lessons = await repository.schedulableLessons(klass.classId, subjectIds);
  if (!lessons.some((lesson) => lesson.id === input.lessonId)) {
    throw badRequest("Энэ хичээлийг тухайн ангид оноох боломжгүй.", "LESSON_NOT_SCHEDULABLE");
  }
  const [term] = await repository.termCovering(input.scheduledOn);
  if (!term) {
    throw badRequest("Энэ огноо ямар ч улиралд хамаарахгүй байна.", "OUTSIDE_TERM");
  }

  await repository.setScheduleDay({
    classId: klass.classId,
    termId: term.id,
    dailyLessonId: input.lessonId,
    scheduledOn: input.scheduledOn,
    createdBy: user.id,
    note,
    replaceNote: input.note !== undefined,
  });
}
