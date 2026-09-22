import { badRequest, conflict, forbidden } from "../../shared/http-error";
import { isIsoDate, shiftDays, todayInUlaanbaatar } from "../../shared/school-date";
import { authorisedClass, viewableSubjects } from "../class-access/service";
import type { AuthenticatedUser } from "../identity/service";
import { recordSkillEvidence } from "../mastery/service";
import { assignRemediation } from "../mastery/remediation";
import * as repository from "./repository";

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

export async function quizPaper(user: AuthenticatedUser, lessonId: number) {
  const studentId = requireStudentId(user);
  await requireReachableLesson(studentId, lessonId);

  const [header] = await repository.lessonHeader(lessonId);
  const rows = await repository.quizItemsForLesson(lessonId);
  const [taken] = await repository.attemptOnDate(studentId, lessonId, todayInUlaanbaatar());
  return {
    lessonId,
    lessonCode: header?.lessonCode ?? "",
    skillName: header?.skillName ?? "",
    questions: groupQuestions(rows),
    kind: header?.assessmentKind ?? "LESSON",
    takenToday: Boolean(taken),
    previousScore: taken?.score ?? null,
    previousMaxScore: taken?.maxScore ?? null,
  };
}

export async function recordQuizAttemptScored(
  user: AuthenticatedUser,
  input: { lessonId: number; answers: Array<{ itemId: number; optionId: number | null }> },
) {
  const studentId = requireStudentId(user);
  await requireReachableLesson(studentId, input.lessonId);

  const today = todayInUlaanbaatar();
  const [already] = await repository.attemptOnDate(studentId, input.lessonId, today);
  if (already) {
    throw conflict("Энэ сорилыг өнөөдөр аль хэдийн өгсөн байна.", "QUIZ_ALREADY_TAKEN");
  }

  const rows = await repository.quizItemsForLesson(input.lessonId);
  if (rows.length === 0) throw badRequest("Энэ хичээлд шалгах асуулт алга.", "NO_QUESTIONS");

  const options = new Map(rows.map((row) => [row.optionId, row]));
  const items = new Map<number, repository.QuizItemRow[]>();
  for (const row of rows) items.set(row.itemId, [...(items.get(row.itemId) ?? []), row]);

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
    studentId,
    [...perSkill].map(([skillId, tally]) => ({ skillId, ...tally })),
  );
  await assignRemediation(studentId, shiftDays(today, 1));
  return { ...attempt, results };
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
