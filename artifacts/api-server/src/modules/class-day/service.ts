import { authorisedClass, viewableSubjects } from "../class-access/service";
import type { AuthenticatedUser } from "../identity/service";
import { isIsoDate, todayInUlaanbaatar } from "../../shared/school-date";
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
  const date = isIsoDate(query.on) ? query.on : todayInUlaanbaatar();

  const [lessonRows, answerRows, coverageRows] = await Promise.all([
    repository.lessonsForClassDay(klass.classId, subjectIds, date),
    repository.answersForClassDay(klass.classId, subjectIds, date),
    repository.coverageForClassDay(klass.classId, subjectIds, date),
  ]);

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
    students: [...byStudent.values()],
  };
}
