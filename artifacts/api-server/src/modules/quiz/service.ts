import { badRequest, conflict, forbidden } from "../../shared/http-error";
import { isIsoDate, todayInUlaanbaatar } from "../../shared/school-date";
import { authorisedClass, viewableSubjects } from "../class-access/service";
import type { AuthenticatedUser } from "../identity/service";
import * as repository from "./repository";

/**
 * How the daily check is set, and what it is not.
 *
 * Five questions, three goes. The check at the end of a lesson is practice: a
 * child who gets one wrong should be able to think again and try, which one
 * sitting a day forbids and three permits without turning it into an exam.
 *
 * A retry draws questions the child has not seen today where the lesson has
 * enough of them, so the second go tests the skill rather than the memory of
 * which option was ticked.
 *
 * What this deliberately does NOT do any more: write skill progress, and
 * assign extra work. Both used to happen automatically on every submission.
 * The daily check is the thinnest evidence the system has - one child, one
 * afternoon, five questions, three tries - and a mastery figure built from it
 * moved every time a child practised. Progress is now the business of the
 * monthly, termly and diagnostic assessments, which are sat once and marked;
 * and what a child should do about a weak topic is the teacher's to decide,
 * on the screen where they can see the answers.
 */
const QUESTIONS_PER_QUIZ = 5;
const ATTEMPTS_PER_DAY = 3;

type QuizQuestion = {
  itemId: number;
  prompt: string;
  options: Array<{ optionId: number; text: string }>;
};

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

function requireStudentId(user: AuthenticatedUser) {
  if (user.studentId === null) {
    throw forbidden("Сурагчийн бүртгэлгүй байна.", "NO_STUDENT_LINK");
  }
  return user.studentId;
}

async function requireReachableLesson(studentId: number, lessonId: number) {
  if (!(await repository.lessonReachableByStudent(lessonId, studentId))) {
    throw forbidden("Энэ хичээл танд оногдоогүй байна.", "LESSON_NOT_ASSIGNED");
  }
}

/**
 * Five questions, preferring the ones this child has not answered today.
 *
 * Not shuffled at random: a lesson with exactly five questions would then hand
 * back the same five in a different order and call it a new paper. Unseen
 * first, and only when those run out does it fall back to repeating - which is
 * honest about a lesson that has five questions and a child on their third go.
 */
function chooseQuestions(all: QuizQuestion[], seen: Set<number>) {
  const fresh = all.filter((question) => !seen.has(question.itemId));
  const rest = all.filter((question) => seen.has(question.itemId));
  return [...fresh, ...rest].slice(0, QUESTIONS_PER_QUIZ);
}

export async function quizPaper(user: AuthenticatedUser, lessonId: number) {
  const studentId = requireStudentId(user);
  await requireReachableLesson(studentId, lessonId);

  const [header] = await repository.lessonHeader(lessonId);
  const rows = await repository.quizItemsForLesson(lessonId);
  const attempts = await repository.attemptsOnDate(studentId, lessonId, todayInUlaanbaatar());

  const seen = new Set<number>();
  for (const attempt of attempts) {
    for (const answer of attempt.answers ?? []) seen.add(Number(answer.questionId));
  }

  const [latest] = attempts;
  return {
    lessonId,
    lessonCode: header?.lessonCode ?? "",
    skillName: header?.skillName ?? "",
    questions: chooseQuestions(groupQuestions(rows), seen),
    kind: header?.assessmentKind ?? "LESSON",
    attemptsUsed: attempts.length,
    attemptsAllowed: ATTEMPTS_PER_DAY,
    lastScore: latest?.score ?? null,
    lastMaxScore: latest?.maxScore ?? null,
  };
}

export async function recordQuizAttemptScored(
  user: AuthenticatedUser,
  input: { lessonId: number; answers: Array<{ itemId: number; optionId: number | null }> },
) {
  const studentId = requireStudentId(user);
  await requireReachableLesson(studentId, input.lessonId);

  const today = todayInUlaanbaatar();
  const attempts = await repository.attemptsOnDate(studentId, input.lessonId, today);
  if (attempts.length >= ATTEMPTS_PER_DAY) {
    throw conflict(
      `Энэ сорилыг өнөөдөр ${ATTEMPTS_PER_DAY} удаа өгсөн байна.`,
      "QUIZ_ATTEMPTS_SPENT",
    );
  }

  const rows = await repository.quizItemsForLesson(input.lessonId);
  if (rows.length === 0) throw badRequest("Энэ хичээлд шалгах асуулт алга.", "NO_QUESTIONS");

  const options = new Map(rows.map((row) => [row.optionId, row]));
  const everyItem = new Map<number, repository.QuizItemRow[]>();
  for (const row of rows) everyItem.set(row.itemId, [...(everyItem.get(row.itemId) ?? []), row]);

  // Only what was asked. The paper is five questions drawn from the lesson's
  // pool, so marking every question in the pool would score a child zero on
  // the ones they were never shown - which is what happened while the paper
  // was the whole pool and nobody noticed.
  const asked = [...new Set(input.answers.map((answer) => answer.itemId))]
    .filter((itemId) => everyItem.has(itemId));
  if (asked.length === 0) {
    throw badRequest("Хариулт ирсэнгүй.", "NO_ANSWERS");
  }
  const items = new Map(asked.map((itemId) => [itemId, everyItem.get(itemId)!]));

  const chosen = new Map(input.answers.map((answer) => [answer.itemId, answer.optionId]));
  const stored: repository.QuizAnswer[] = [];
  const results: Array<{
    itemId: number;
    correct: boolean;
    correctOptionId: number | null;
    explanation: string | null;
  }> = [];

  for (const [itemId, itemRows] of items) {
    const optionId = chosen.get(itemId) ?? null;
    const picked = optionId === null ? null : options.get(optionId);
    const valid = picked?.itemId === itemId ? picked : null;
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

  const [header] = await repository.lessonHeader(input.lessonId);
  const attempt = await repository.insertQuizAttempt({
    studentId,
    dailyLessonId: input.lessonId,
    lessonCode: header?.lessonCode ?? "",
    answers: stored,
    score: stored.filter((answer) => answer.correct).length,
    maxScore: stored.length,
  });

  // No skill evidence, and no automatic extra work. See the note at the top of
  // this file: the daily check is practice, and neither a mastery figure nor a
  // child's next fortnight should move because they had a second go at five
  // questions on a Tuesday afternoon.
  return {
    ...attempt,
    results,
    attemptsUsed: attempts.length + 1,
    attemptsAllowed: ATTEMPTS_PER_DAY,
  };
}

/**
 * The paper a teacher reads: every question, with the key and the note.
 *
 * The child's copy of this deliberately leaves the answers on the server, so
 * that a score means something. A teacher is the person who has to judge
 * whether a question is any good, which cannot be done without seeing which
 * option is meant to be right, so theirs carries the key.
 *
 * Scoped through the class the teacher chose on screen, the same way the
 * results are: it is the class that establishes whether this member of staff
 * teaches the subject at all. The lesson alone would not - a question belongs
 * to a subject, and subjects are held per class.
 */
export async function quizPaperForTeacher(
  user: AuthenticatedUser,
  classId: number,
  lessonId: number,
) {
  const klass = await authorisedClass(user, classId);
  const [header] = await repository.lessonHeader(lessonId);
  if (!header) throw badRequest("Ийм хичээл алга байна.", "NO_SUCH_LESSON");
  await viewableSubjects(user, klass.classId, header.subjectId);

  const rows = await repository.quizItemsForLesson(lessonId);
  const byItem = new Map<number, {
    itemId: number;
    prompt: string;
    explanation: string | null;
    options: Array<{ optionId: number; text: string; isCorrect: boolean }>;
  }>();
  for (const row of rows) {
    let question = byItem.get(row.itemId);
    if (!question) {
      question = { itemId: row.itemId, prompt: row.prompt, explanation: row.explanation, options: [] };
      byItem.set(row.itemId, question);
    }
    question.options.push({
      optionId: row.optionId,
      text: row.optionText,
      isCorrect: row.isCorrect,
    });
  }

  return {
    lessonId,
    lessonCode: header.lessonCode,
    skillName: header.skillName,
    subjectName: header.subjectName,
    kind: header.assessmentKind,
    questions: [...byItem.values()],
  };
}

export async function quizAttemptsForTeacher(
  user: AuthenticatedUser,
  query: {
    classId: number;
    limit: number;
    subjectId: number | null;
    from?: unknown;
    to?: unknown;
  },
) {
  const klass = await authorisedClass(user, query.classId);
  const from = isIsoDate(query.from) ? query.from : null;
  const to = isIsoDate(query.to) ? query.to : null;
  if (from !== null && to !== null && from > to) {
    throw badRequest("Огнооны муж буруу байна.", "INVALID_RANGE");
  }
  const attempts = await repository.attemptsForClass(
    klass.classId,
    query.limit,
    await viewableSubjects(user, klass.classId, query.subjectId),
    from,
    to,
  );
  return {
    classId: klass.classId,
    className: klass.className,
    from,
    to,
    truncated: attempts.length === query.limit,
    attempts,
  };
}
