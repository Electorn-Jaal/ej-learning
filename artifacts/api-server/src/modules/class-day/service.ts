import { authorisedClass, editableSubjects, viewableSubjects } from "../class-access/service";
import { badRequest } from "../../shared/http-error";
import type { AuthenticatedUser } from "../identity/service";
import { isIsoDate, todayInUlaanbaatar, validIsoDate } from "../../shared/school-date";
import * as repository from "./repository";

/**
 * One class, one day: what is set, and who has done it.
 *
 * The board used to answer both of these in a strip under a row - a lesson
 * name with no lesson in it, and the eight children who had not answered - and
 * a teacher wanting either had nowhere to go. They are the same question asked
 * from two ends, so they are one page and one request.
 *
 * Scoped the way everything teacher-side is: the class establishes the right
 * to look, and within it only the subjects this member of staff holds. A class
 * teacher and an administrator see the whole day.
 */
export async function classDay(
  user: AuthenticatedUser,
  query: { classId: number; subjectId: number | null; on?: unknown },
) {
  const klass = await authorisedClass(user, query.classId);
  const subjectIds = await viewableSubjects(user, klass.classId, query.subjectId);
  // The date now comes from the address bar, so a hand-edited 2026-13-45 is a
  // bad request, not a database error.
  if (query.on !== undefined && !validIsoDate(query.on)) {
    throw badRequest("Огноо буруу байна.", "INVALID_DATE");
  }
  const date = validIsoDate(query.on) ? query.on : todayInUlaanbaatar();

  const [lessonRows, answerRows, coverageRows, markRows, registerRows, [year]] =
    await Promise.all([
      repository.lessonsForClassDay(klass.classId, subjectIds, date),
      repository.answersForClassDay(klass.classId, subjectIds, date),
      repository.coverageForClassDay(klass.classId, subjectIds, date),
      repository.notebookMarksForClassDay(klass.classId, subjectIds, date),
      repository.attendanceForClassDay(klass.classId, date),
      repository.classGradeLevel(klass.classId),
    ]);

  // The school's own rule, which the screen has to know before it can draw a
  // register: up to year 5 a class is with one teacher all day and the
  // register is taken once; from year 6 the children move between teachers
  // and it is taken per lesson.
  const perLesson = registerPerLesson(year?.gradeLevel ?? 12);

  const register = new Map<number, Array<{
    timetableSlotId: number | null;
    state: string;
    participation: string | null;
    note: string | null;
  }>>();
  for (const row of registerRows) {
    register.set(row.studentId, [...(register.get(row.studentId) ?? []), {
      timetableSlotId: row.timetableSlotId,
      state: row.state,
      participation: row.participation,
      note: row.note,
    }]);
  }

  // What a teacher said each period got through, so the screen can show their
  // own answer back rather than asking it again from scratch. Keyed by period
  // rather than by slot: where a class splits into two groups the register
  // holds two rows for one period and both halves were taught the same thing.
  const covered = new Map<string, number[]>();
  for (const row of coverageRows) {
    const key = `${row.subjectId}:${row.timetableSlotId ?? ""}`;
    covered.set(key, [...(covered.get(key) ?? []), row.dailyLessonId]);
  }

  const lessons = lessonRows.map((row) => ({
    timetableSlotId: row.timetableSlotId,
    periodNo: row.periodNo,
    startsAt: row.startsAt,
    note: row.note,
    subjectId: row.subjectId,
    subjectName: row.subjectName,
    lessonId: row.lessonId,
    lessonCode: row.lessonCode,
    skillName: row.skillName,
    learningGoal: row.learningGoal,
    remember: row.remember,
    workedExample: row.workedExample,
    guidedPractice: row.guidedPractice,
    independentPractice: row.independentPractice,
    studentMessage: row.studentMessage,
    estimatedMinutes: row.estimatedMinutes,
    coveredLessonIds: covered.get(`${row.subjectId}:${row.timetableSlotId ?? ""}`) ?? [],
    held: row.held,
    notHeldReason: row.notHeldReason,
    isContinuation: row.isContinuation,
    quizOpensAt: row.quizOpensAt,
    quizQuestionCount: row.quizQuestionCount,
    quizAttempts: row.quizAttempts,
    answersOpenAt: row.answersOpenAt,
    book:
      row.materialId === null
        ? null
        : {
            materialId: row.materialId,
            title: row.materialTitle,
            pageFrom: row.pageFrom,
            pageTo: row.pageTo,
            bookPageFrom: row.bookPageFrom,
            bookPageTo: row.bookPageTo,
            // Where the printed number and the file's own page disagree.
            filePage: row.pageFrom === null ? null : row.pageFrom + row.pageOffset,
            fileUrl: `/api/content/materials/${row.materialId}/file`,
          },
  }));

  // What was found in each child's book, by period. Absent where nobody
  // looked, which the screen shows as unchecked rather than as nothing done.
  const notebook = new Map<number, Array<{
    subjectId: number;
    timetableSlotId: number | null;
    state: string;
    comment: string | null;
  }>>();
  for (const row of markRows) {
    notebook.set(row.studentId, [...(notebook.get(row.studentId) ?? []), {
      subjectId: row.subjectId,
      timetableSlotId: row.timetableSlotId,
      state: row.state,
      comment: row.comment,
    }]);
  }

  // One row per child, with their attempts gathered under them: the query
  // returns a row per attempt, and a child who sat two quizzes is still one
  // child on the register.
  const byStudent = new Map<number, {
    studentId: number;
    studentName: string;
    studentCode: string;
    attempts: Array<{
      attemptId: number;
      lessonCode: string | null;
      skillName: string | null;
      score: number;
      maxScore: number;
      submittedAt: string;
      answers: Array<{ questionId: string; prompt: string; chosenText: string; correct: boolean }>;
    }>;
  }>();
  for (const row of answerRows) {
    let student = byStudent.get(row.studentId);
    if (!student) {
      student = {
        studentId: row.studentId,
        studentName: row.studentName,
        studentCode: row.studentCode,
        attempts: [],
      };
      byStudent.set(row.studentId, student);
    }
    if (row.attemptId !== null) {
      student.attempts.push({
        attemptId: row.attemptId,
        lessonCode: row.lessonCode,
        skillName: row.skillName,
        score: row.score ?? 0,
        maxScore: row.maxScore ?? 0,
        submittedAt: row.submittedAt ?? "",
        answers: (row.answers ?? []).map((answer) => ({
          questionId: answer.questionId,
          prompt: answer.prompt,
          chosenText: answer.chosenText,
          correct: answer.correct,
        })),
      });
    }
  }

  return {
    classId: klass.classId,
    className: klass.className,
    date,
    lessons,
    attendancePerLesson: perLesson,
    students: [...byStudent.values()].map((student) => ({
      ...student,
      notebook: notebook.get(student.studentId) ?? [],
      attendance: register.get(student.studentId) ?? [],
    })),
  };
}

/**
 * Whether this year's register is taken per lesson or once a day.
 *
 * The school's answer, not a guess: up to year 5 the class is with one teacher
 * all day, so one register is the truth and six would be five copies of it.
 * From year 6 the children move between teachers, and a register taken once in
 * the morning says nothing about who was in physics after lunch.
 */
export const registerPerLesson = (gradeLevel: number) => gradeLevel > 5;

const ATTENDANCE_STATES = ["PRESENT", "LATE", "ABSENT", "EXCUSED", "UNREGISTERED"];
const PARTICIPATION = ["HIGH", "GOOD", "WATCH"];

/**
 * Take the register.
 *
 * The whole period at once, like the exercise books, because that is how it is
 * done: down the class, then away. Children left out of the list are left
 * alone - unregistered is a fact about the teacher's afternoon, not a verdict
 * on a child, and inventing one to fill the grid would turn every unmarked
 * lesson into a truancy.
 */
export async function markAttendance(
  user: AuthenticatedUser,
  input: {
    classId: number;
    onDate: string;
    timetableSlotId?: number | null;
    marks: Array<{
      studentId: number;
      state: string;
      participation?: string | null;
      note?: string | null;
    }>;
  },
) {
  const klass = await authorisedClass(user, input.classId);
  if (!isIsoDate(input.onDate)) throw badRequest("Огноо буруу байна.", "INVALID_DATE");
  if (input.onDate > todayInUlaanbaatar()) {
    throw badRequest("Ирээдүйн өдрийн ирц бүртгэх боломжгүй.", "FUTURE_DAY");
  }

  const [year] = await repository.classGradeLevel(klass.classId);
  const perLesson = registerPerLesson(year?.gradeLevel ?? 12);
  const slotId = input.timetableSlotId ?? null;
  // The rule is the school's and the system holds it: a whole-day register in
  // year 9 would claim a child who left at lunch sat through physics, and six
  // registers in year 2 would be five copies of one fact for a teacher to
  // keep in step.
  if (perLesson && slotId === null) {
    throw badRequest("Энэ ангийн ирцийг хичээл бүрээр бүртгэнэ.", "SLOT_REQUIRED");
  }
  if (!perLesson && slotId !== null) {
    throw badRequest("Энэ ангийн ирцийг өдрөөр нь нэг удаа бүртгэнэ.", "WHOLE_DAY_ONLY");
  }

  let subjectId: number | null = null;
  if (slotId !== null) {
    const [slot] = await repository.slotForClass(slotId, klass.classId);
    if (!slot) throw badRequest("Хуваарийн цаг энэ ангид тохирохгүй байна.", "INVALID_SLOT");
    await editableSubjects(user, klass.classId, slot.subjectId);
    subjectId = slot.subjectId;
  }

  const roster = new Set(await repository.rosterIds(klass.classId));
  const marks = input.marks.map((mark) => {
    if (!roster.has(mark.studentId)) {
      throw badRequest("Энэ ангид бүртгэлгүй сурагч байна.", "STUDENT_NOT_IN_CLASS");
    }
    if (!ATTENDANCE_STATES.includes(mark.state)) {
      throw badRequest("Ирцийн тэмдэглэгээ буруу байна.", "INVALID_STATE");
    }
    const participation = mark.participation ?? null;
    if (participation !== null && !PARTICIPATION.includes(participation)) {
      throw badRequest("Оролцооны тэмдэглэгээ буруу байна.", "INVALID_PARTICIPATION");
    }
    const note = typeof mark.note === "string" ? mark.note.trim() : null;
    if (note !== null && note.length > MAX_COMMENT) {
      throw badRequest(`Тайлбар ${MAX_COMMENT} тэмдэгтээс урт байна.`, "COMMENT_TOO_LONG");
    }
    return {
      studentId: mark.studentId,
      state: mark.state,
      // Participation is an observation about a lesson, so it goes with the
      // attendance state and leaves with it.
      participation: mark.state === "UNREGISTERED" ? null : participation,
      note: note === "" ? null : note,
    };
  });

  await repository.setAttendance(
    klass.classId, input.onDate, slotId, subjectId, user.id, marks,
  );
  return { marked: marks.length };
}

const NOTEBOOK_STATES = ["DONE", "PARTIAL", "NOT_DONE", "UNCHECKED"];
const MAX_COMMENT = 500;

/**
 * Mark a period's exercise books, a register at a time.
 *
 * A whole period's marks arrive together because that is how the work is
 * done - a teacher goes down the class and presses save once - and they land
 * together, so a dropped connection halfway does not leave a register half
 * marked with no sign of which half.
 *
 * Children left out of the list are left alone. A teacher who looked at five
 * books has said nothing about the other twenty-five, and filling those in
 * with anything at all would be the system inventing a judgement.
 */
export async function markNotebooks(
  user: AuthenticatedUser,
  input: {
    classId: number;
    subjectId: number;
    scheduledOn: string;
    timetableSlotId?: number | null;
    marks: Array<{ studentId: number; state: string; comment?: string | null }>;
  },
) {
  const klass = await authorisedClass(user, input.classId);
  await editableSubjects(user, klass.classId, input.subjectId);
  if (!isIsoDate(input.scheduledOn)) throw badRequest("Огноо буруу байна.", "INVALID_DATE");
  if (input.scheduledOn > todayInUlaanbaatar()) {
    // Nothing has been handed in yet. A mark on tomorrow's books is either a
    // mistake or a guess, and both read the same afterwards.
    throw badRequest("Ирээдүйн өдрийн дэвтэр шалгах боломжгүй.", "FUTURE_DAY");
  }

  const roster = new Set(await repository.rosterIds(klass.classId));
  const marks = input.marks.map((mark) => {
    if (!roster.has(mark.studentId)) {
      throw badRequest("Энэ ангид бүртгэлгүй сурагч байна.", "STUDENT_NOT_IN_CLASS");
    }
    if (!NOTEBOOK_STATES.includes(mark.state)) {
      throw badRequest("Тэмдэглэгээ буруу байна.", "INVALID_STATE");
    }
    const comment = typeof mark.comment === "string" ? mark.comment.trim() : null;
    if (comment !== null && comment.length > MAX_COMMENT) {
      throw badRequest(`Тайлбар ${MAX_COMMENT} тэмдэгтээс урт байна.`, "COMMENT_TOO_LONG");
    }
    return {
      studentId: mark.studentId,
      state: mark.state,
      comment: comment === "" ? null : comment,
    };
  });

  await repository.setNotebookMarks(
    klass.classId,
    input.subjectId,
    input.scheduledOn,
    input.timetableSlotId ?? null,
    user.id,
    marks,
  );
  return { marked: marks.length };
}
