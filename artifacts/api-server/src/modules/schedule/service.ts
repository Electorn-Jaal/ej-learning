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

  const weekly = (await repository.scheduleForClass(klass.classId, term.startsOn, term.endsOn, subjectIds))
    .filter((row) => row.timetableSlotId !== null);
  if (weekly.length) {
    const nextBySubject = new Map<number, number>();
    const rows = weekly.flatMap((slot) => {
      if (slot.lessonId !== null || slot.subjectId === null) return [];
      const choices = lessons.filter((lesson) => lesson.subjectId === slot.subjectId);
      if (!choices.length) return [];
      const index = nextBySubject.get(slot.subjectId) ?? 0;
      nextBySubject.set(slot.subjectId, index + 1);
      return [{ classId: klass.classId, termId: term.id, dailyLessonId: choices[index % choices.length].id,
        scheduledOn: slot.scheduledOn, createdBy: user.id,
        timetableSlotId: slot.timetableSlotId, periodNo: slot.periodNo }];
    });
    await repository.insertScheduleDays(rows);
    return { created: rows.length, skipped: weekly.length - rows.length, lessonsAvailable: lessons.length,
      firstDay: rows[0]?.scheduledOn ?? null, lastDay: rows.at(-1)?.scheduledOn ?? null,
      notice: `${term.nameMn}: хуваарийн ${rows.length} цагт агуулга оноолоо. Хүрэлцэхгүй агуулгыг давтаж оноосон тул шалгана уу.` };
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

/** Monday 1 ... Sunday 7, the numbering timetable_slots.weekday_no uses. */
const isoWeekday = (day: string) => ((new Date(day + "T00:00:00Z").getUTCDay() + 6) % 7) + 1;

const shiftDay = (day: string, offset: number) => {
  const date = new Date(day + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
};

export type ReplanDay = {
  scheduledOn: string;
  periodNo: number | null;
  lessonId: number;
  lessonCode: string;
  skillName: string;
  chapterTitle: string | null;
  currentLessonCode: string | null;
  currentSkillName: string | null;
};

export type ReplanProposal = {
  classId: number;
  subjectId: number;
  fromDate: string;
  days: ReplanDay[];
};

/**
 * What the rest of the term would become, from where the teacher just said the
 * class is. Computed, not written.
 *
 * The plan the class starts the year with is arithmetic: the sections of the
 * book, one per period, in printed order. Teaching is not arithmetic. A
 * section meant for three days is covered in one, a class spends an extra week
 * on fractions, and from that moment every later day of the automatic plan is
 * wrong by the same amount. So the teacher's correction is not just a change
 * to one day - it is the new truth about where the class is, and the days
 * after it follow from it.
 *
 * But they follow from it only once the teacher says so. This used to run the
 * moment a day was saved, which meant a teacher trying a topic to see whether
 * it fitted had already rewritten their term by the time they read the screen.
 * So the two halves are separate: this one works out the rows, and
 * applyReplan writes them after the teacher has seen which days move.
 *
 * Days a teacher chose themselves are stepped around, never over: those are
 * decisions, not arithmetic. Rows the plan wrote before are replaced, because
 * that is all they ever were. Nothing before the corrected day is touched -
 * what has been taught has been taught.
 */
async function planForward(
  classId: number,
  subjectId: number,
  fromDate: string,
  termEndsOn: string,
) {
  const lessons = await repository.schedulableLessons(classId, [subjectId]);
  const ordered = lessons.filter((lesson) => lesson.sequenceNo !== null);
  // A subject whose lessons carry no place in a book has no order to lay out,
  // and shuffling them would be inventing one the school never chose.
  if (ordered.length === 0) return null;

  const slots = await repository.subjectSlots(classId, subjectId);
  if (slots.length === 0) return null;

  // What is left to teach. Not "the sections after the one chosen today":
  // that reading cannot tell a class which covered two sections in an hour
  // from one which skipped a section and means to come back, because both end
  // the day on the same section. Everything the class has been through is
  // subtracted, and what remains is laid out in the book's order - so a
  // skipped section falls back into the term instead of vanishing from it.
  const done = new Set(await repository.coveredLessonIds(classId, subjectId, fromDate));

  const pinnedRows = await repository.pinnedScheduleDays(classId, subjectId, fromDate, termEndsOn);
  const pinned = new Set(
    pinnedRows.map((row) => `${row.scheduledOn}:${row.timetableSlotId ?? ""}`),
  );
  // A section a teacher has already put on a later day is spoken for. Without
  // this it would be dealt out again earlier and taught twice.
  for (const row of pinnedRows) {
    if (row.dailyLessonId !== null) done.add(row.dailyLessonId);
  }

  const queue = ordered.filter((lesson) => !done.has(lesson.id));
  // Nothing left: the class has been through everything the school has content
  // for. Leaving the calendar alone matters here - laying out an empty plan
  // would clear the rest of the term, and a teacher who reaches the end of the
  // book has not asked for every day after it to be emptied.
  if (queue.length === 0) return null;

  const rows: Array<{ lessonId: number; onDate: string; slotId: number | null; periodNo: number | null }> = [];
  let next = 0;
  for (
    let date = shiftDay(fromDate, 1);
    date <= termEndsOn && next < queue.length;
    date = shiftDay(date, 1)
  ) {
    const weekday = isoWeekday(date);
    const today = slots.filter(
      (slot) =>
        slot.weekdayNo === weekday &&
        slot.validFrom <= date &&
        (slot.validTo === null || slot.validTo >= date),
    );
    // One lesson per period, not per slot: where a class splits into two
    // groups the register writes two rows for the same period and both halves
    // are taught the same section.
    const periods = [...new Set(today.map((slot) => slot.periodNo))].sort((a, b) => a - b);
    for (const periodNo of periods) {
      if (next >= queue.length) break;
      const here = today.filter((slot) => slot.periodNo === periodNo);
      if (here.some((slot) => pinned.has(`${date}:${slot.id}`))) continue;
      for (const slot of here) {
        rows.push({ lessonId: queue[next]!.id, onDate: date, slotId: slot.id, periodNo });
      }
      next += 1;
    }
  }

  return rows;
}

/**
 * The same plan, written out for a person to approve: only the days that would
 * actually change, each saying what is there now and what would replace it.
 *
 * One line per period, not per timetable slot. Where a class splits into two
 * groups the register holds two rows for the same period and both halves are
 * taught the same section - showing it twice would read as two different
 * lessons.
 */
async function proposeReplan(
  classId: number,
  subjectId: number,
  fromDate: string,
  termEndsOn: string,
): Promise<ReplanProposal> {
  const rows = await planForward(classId, subjectId, fromDate, termEndsOn);
  if (rows === null || rows.length === 0) {
    return { classId, subjectId, fromDate, days: [] };
  }

  const lessons = new Map(
    (await repository.schedulableLessons(classId, [subjectId])).map((lesson) => [lesson.id, lesson]),
  );
  const current = new Map<
    string,
    { lessonId: number | null; lessonCode: string | null; skillName: string | null }
  >();
  for (const day of await repository.scheduleForClass(
    classId,
    shiftDay(fromDate, 1),
    termEndsOn,
    [subjectId],
  )) {
    current.set(`${day.scheduledOn}:${day.periodNo ?? ""}`, {
      lessonId: day.lessonId,
      lessonCode: day.lessonCode,
      skillName: day.skillName,
    });
  }

  const days: ReplanDay[] = [];
  const shown = new Set<string>();
  for (const row of rows) {
    const key = `${row.onDate}:${row.periodNo ?? ""}`;
    if (shown.has(key)) continue;
    shown.add(key);
    const was = current.get(key);
    // Unchanged days are not news. A teacher who moves the class on by one
    // section wants to see the handful of days that shift, not every remaining
    // period of the term restated.
    if (was && was.lessonId === row.lessonId) continue;
    const lesson = lessons.get(row.lessonId);
    days.push({
      scheduledOn: row.onDate,
      periodNo: row.periodNo,
      lessonId: row.lessonId,
      lessonCode: lesson?.lessonCode ?? "",
      skillName: lesson?.skillName ?? "",
      chapterTitle: lesson?.chapterTitle ?? null,
      currentLessonCode: was?.lessonCode ?? null,
      currentSkillName: was?.skillName ?? null,
    });
  }
  return { classId, subjectId, fromDate, days };
}

/**
 * Approval. Recomputed here rather than taken from the browser: the proposal
 * the teacher read is a picture of a calculation, and the calculation is what
 * should reach the calendar. A stale tab then writes the plan that follows from
 * the day as it stands, not the one that followed from it an hour ago.
 */
export async function applyReplan(
  user: AuthenticatedUser,
  input: { classId: number; subjectId: number; fromDate: string },
) {
  const klass = await authorisedClass(user, input.classId);
  await editableSubjects(user, klass.classId, input.subjectId);
  if (!isIsoDate(input.fromDate)) throw badRequest("Огноо буруу байна.", "INVALID_DATE");
  if (input.fromDate < todayInUlaanbaatar() && !user.roles.includes("ADMIN")) {
    throw forbidden("Өнгөрсөн өдрөөс хуваарь дахин хуваарилах боломжгүй.", "PAST_DAY");
  }

  const [term] = await repository.termCovering(input.fromDate);
  if (!term) throw badRequest("Энэ огноо ямар ч улиралд хамаарахгүй байна.", "OUTSIDE_TERM");
  const [termRow] = await repository.termById(term.id);
  if (!termRow) throw badRequest("Улирал олдсонгүй.", "OUTSIDE_TERM");

  const rows = await planForward(
    klass.classId,
    input.subjectId,
    input.fromDate,
    termRow.endsOn,
  );
  // Null is "there is nothing to lay out", which is not the same as "lay out
  // nothing": writing an empty plan would clear the rest of the term.
  if (rows === null) return { days: 0 };
  await repository.replanScheduleDays(
    klass.classId,
    input.subjectId,
    input.fromDate,
    termRow.endsOn,
    rows,
  );
  return { days: rows.length };
}

export async function setScheduleDay(
  user: AuthenticatedUser,
  input: {
    classId: number;
    scheduledOn: string;
    lessonId: number | null;
    subjectId?: number | null;
    note?: string | null;
    pageFrom?: number | null;
    pageTo?: number | null;
    timetableSlotId?: number | null;
    coveredLessonIds?: number[] | null;
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
  // A day that has already been taught. A teacher looking back at last week
  // can read what the class was given and cannot rewrite it: the children
  // worked from it, their answers are recorded against it, and a topic that
  // changes afterwards makes a nonsense of both. Ahead of today is the
  // opposite - checking that the planned section is the right one, and
  // leaving an instruction for it, is exactly what the screen is for.
  if (input.scheduledOn < todayInUlaanbaatar() && !user.roles.includes("ADMIN")) {
    throw forbidden(
      "Өнгөрсөн өдрийн хичээлийг өөрчлөх боломжгүй.",
      "PAST_DAY",
    );
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

  // Both or neither: half a range is not a range, and a teacher who means
  // "one page" sends the same number twice.
  const replacePages = input.pageFrom !== undefined || input.pageTo !== undefined;
  const pageFrom = input.pageFrom ?? null;
  const pageTo = input.pageTo ?? null;
  if (replacePages) {
    if ((pageFrom === null) !== (pageTo === null)) {
      throw badRequest("Хуудасны эхлэл, төгсгөлийг хоёуланг нь оруулна уу.", "INCOMPLETE_PAGE_RANGE");
    }
    if (pageFrom !== null && pageTo !== null && pageTo < pageFrom) {
      throw badRequest("Хуудасны муж буруу байна.", "INVALID_PAGE_RANGE");
    }
  }

  // A day this class does not have this subject on. Without a slot to hang it
  // from, content here would be shown to a class that is in another lesson -
  // and nobody could later say which period it was meant for. An administrator
  // still may: that is what a makeup lesson is.
  if (input.timetableSlotId == null && !user.roles.includes("ADMIN")) {
    const [coverage] = await repository.timetableCoverage(
      klass.classId,
      subjectIds,
      input.scheduledOn,
    );
    if (coverage && coverage.total > 0 && coverage.onDay === 0) {
      throw forbidden(
        "Энэ өдөр тухайн анги танай хичээлийн хуваарьт байхгүй байна.",
        "NOT_A_TEACHING_DAY",
      );
    }
  }

  let slotId = input.timetableSlotId ?? null;
  let periodNo: number | null = null;
  if (slotId !== null) {
    const [slot] = await repository.timetableSlot(slotId);
    if (!slot || slot.classId !== klass.classId ||
        (input.subjectId != null && slot.subjectId !== input.subjectId) ||
        slot.weekdayNo !== (date.getUTCDay() || 7) ||
        slot.validFrom > input.scheduledOn || (slot.validTo !== null && slot.validTo < input.scheduledOn)) {
      throw badRequest("Хуваарийн цаг энэ анги, өдөрт тохирохгүй байна.", "INVALID_TIMETABLE_SLOT");
    }
    await editableSubjects(user, klass.classId, slot.subjectId);
    periodNo = slot.periodNo;
  }

  if (input.lessonId === null) {
    await repository.clearScheduleDay(klass.classId, input.scheduledOn, subjectIds, slotId);
    await repository.clearDayCoverage(klass.classId, subjectIds, input.scheduledOn, slotId);
    return { replan: null };
  }

  const lessons = await repository.schedulableLessons(klass.classId, subjectIds);
  const lesson = lessons.find((lesson) => lesson.id === input.lessonId);
  if (!lesson) {
    throw badRequest("Энэ хичээлийг тухайн ангид оноох боломжгүй.", "LESSON_NOT_SCHEDULABLE");
  }
  if (slotId !== null) {
    const [slot] = await repository.timetableSlot(slotId);
    if (slot.subjectId !== lesson.subjectId) {
      throw badRequest("Өөр хичээлийн агуулгыг энэ цагт оноох боломжгүй.", "SUBJECT_MISMATCH");
    }
  } else {
    const matches = (await repository.scheduleForClass(klass.classId, input.scheduledOn, input.scheduledOn, [lesson.subjectId]))
      .filter((row) => row.timetableSlotId !== null);
    if (matches.length > 1) {
      throw badRequest("Агуулга оруулах хуваарийн цагаа сонгоно уу.", "TIMETABLE_SLOT_REQUIRED");
    }
    if (matches.length === 1) { slotId = matches[0].timetableSlotId; periodNo = matches[0].periodNo; }
  }
  const [term] = await repository.termCovering(input.scheduledOn);
  if (!term) {
    throw badRequest("Энэ огноо ямар ч улиралд хамаарахгүй байна.", "OUTSIDE_TERM");
  }

  const [existing] = await repository.scheduledLessonOn(
    klass.classId,
    lesson.subjectId,
    input.scheduledOn,
    slotId,
  );
  const previousLessonId = existing?.dailyLessonId ?? null;

  await repository.setScheduleDay({
    classId: klass.classId,
    termId: term.id,
    dailyLessonId: input.lessonId,
    scheduledOn: input.scheduledOn,
    createdBy: user.id,
    note,
    replaceNote: input.note !== undefined,
    pageFrom,
    pageTo,
    replacePages,
    timetableSlotId: slotId,
    periodNo,
  });

  // What the period actually got through.
  //
  // A teacher who moves the class on from section 4 to section 5 is saying one
  // of two things, and the day alone cannot tell them apart: we did 4 and
  // started 5, or we skipped 4 and will come back to it. So they are asked,
  // and what they tick is recorded here.
  //
  // Left out, the answer is "just this one". That is the safe reading: a
  // section is only counted as taught when it was on a day or a teacher said
  // so, and a section wrongly thought untaught comes back round, while one
  // wrongly thought taught is never seen again.
  const covered = [...new Set([
    input.lessonId,
    ...(input.coveredLessonIds ?? []),
  ])];
  if (covered.some((id) => !lessons.some((row) => row.id === id))) {
    throw badRequest("Үзсэн гэж тэмдэглэсэн сэдэв энэ ангид байхгүй байна.", "LESSON_NOT_SCHEDULABLE");
  }
  await repository.setDayCoverage(
    klass.classId,
    lesson.subjectId,
    input.scheduledOn,
    slotId,
    covered,
    user.id,
  );

  // The day is saved; the rest of the term is offered, not taken. Only when
  // where the class stands changed - writing a note says nothing about that,
  // and proposing to re-lay the term every time somebody edits a sentence
  // would train teachers to dismiss the question without reading it.
  const moved =
    input.lessonId !== previousLessonId ||
    (input.coveredLessonIds !== undefined && input.coveredLessonIds !== null);
  if (moved) {
    const [termRow] = await repository.termById(term.id);
    if (termRow) {
      const proposal = await proposeReplan(
        klass.classId,
        lesson.subjectId,
        input.scheduledOn,
        termRow.endsOn,
      );
      if (proposal.days.length > 0) return { replan: proposal };
    }
  }
  return { replan: null };
}

async function editableSlot(user: AuthenticatedUser, slotId: number) {
  const [slot] = await repository.timetableSlot(slotId);
  if (!slot) throw badRequest("Хуваарийн цаг олдсонгүй.", "SLOT_NOT_FOUND");
  await authorisedClass(user, slot.classId);
  await editableSubjects(user, slot.classId, slot.subjectId);
  if (!slot.groupLabel) throw badRequest("Энэ нь нийт ангийн цаг байна.", "NOT_A_GROUP_SLOT");
  return slot;
}

export async function timetableStudents(user: AuthenticatedUser, slotId: number) {
  const slot = await editableSlot(user, slotId);
  return { assigned: slot.assigned, students: await repository.slotStudents(slotId, slot.classId) };
}

export async function setTimetableStudents(user: AuthenticatedUser, slotId: number, studentIds: number[]) {
  const slot = await editableSlot(user, slotId);
  const roster = await repository.slotStudents(slotId, slot.classId);
  if (studentIds.some((id) => !roster.some((student) => student.id === id))) {
    throw badRequest("Тухайн ангид бүртгэлтэй сурагчийг сонгоно уу.", "STUDENT_NOT_IN_CLASS");
  }
  await repository.setSlotStudents(slotId, [...new Set(studentIds)]);
}

/**
 * The signed-in teacher's own week.
 *
 * An admin sees every slot in the school, which is the same answer the rest
 * of the admin surface gives and is what makes the screen usable for someone
 * checking the timetable rather than teaching from it.
 */
export const teacherWeek = (user: AuthenticatedUser) =>
  repository.teacherWeek(user.teacherId, user.roles.includes("ADMIN"));
