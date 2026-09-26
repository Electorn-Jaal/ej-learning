import { badRequest, conflict, forbidden } from "../../shared/http-error";
import { isIsoDate, todayInUlaanbaatar } from "../../shared/school-date";
import { authorisedClass, editableSubjects, viewableSubjects } from "../class-access/service";
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

/**
 * What this class has done with the defaults, for today.
 *
 * The three numbers belong to the period rather than to the section: the same
 * section taught to two classes is two different afternoons. Null anywhere
 * means the rule above, which is what nearly every period will say.
 *
 * answersOpen is the one with teeth. Until the teacher releases it, a child is
 * told whether each answer was right and nothing more - which option was
 * right, and why, is withheld. That is not secrecy for its own sake: three
 * goes at a check are pointless if the first one hands over the key, and a
 * parent reading over a shoulder is exactly how the key would travel.
 */
async function quizSettings(studentId: number, lessonId: number) {
  const [row] = await repository.quizSettingsForStudent(
    studentId,
    lessonId,
    todayInUlaanbaatar(),
  );
  return {
    opensAt: row?.quizOpensAt ?? null,
    questionCount: row?.quizQuestionCount ?? QUESTIONS_PER_QUIZ,
    attemptsAllowed: row?.quizAttempts ?? ATTEMPTS_PER_DAY,
    answersOpen: row?.answersOpen ?? false,
  };
}

/** HH:MM in Ulaanbaatar, to compare against a period's opening time. */
const clockInUlaanbaatar = () =>
  new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Ulaanbaatar",
  }).format(new Date());

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
function chooseQuestions(all: QuizQuestion[], seen: Set<number>, count: number) {
  const fresh = all.filter((question) => !seen.has(question.itemId));
  const rest = all.filter((question) => seen.has(question.itemId));
  return [...fresh, ...rest].slice(0, count);
}

/**
 * The questions this child gets on their next go today: the teacher's choice
 * when one was made for exactly this attempt, the ordinary rule otherwise.
 * A chosen question that has since left the lesson's pool is dropped rather
 * than shown broken.
 */
async function nextPaper(studentId: number, lessonId: number, pool: QuizQuestion[]) {
  const today = todayInUlaanbaatar();
  const [attempts, settings, [override]] = await Promise.all([
    repository.attemptsOnDate(studentId, lessonId, today),
    quizSettings(studentId, lessonId),
    repository.questionOverride(studentId, lessonId, today),
  ]);
  const seen = new Set<number>();
  for (const attempt of attempts) {
    for (const answer of attempt.answers ?? []) seen.add(Number(answer.questionId));
  }
  const byId = new Map(pool.map((q) => [q.itemId, q]));
  const chosen = override && override.attemptNo === attempts.length + 1
    ? override.itemIds.flatMap((id) => byId.get(id) ?? [])
    : null;
  return {
    attempts,
    settings,
    overridden: chosen !== null && chosen.length > 0,
    questions: chosen && chosen.length ? chosen : chooseQuestions(pool, seen, settings.questionCount),
  };
}

export async function quizPaper(user: AuthenticatedUser, lessonId: number) {
  const studentId = requireStudentId(user);
  await requireReachableLesson(studentId, lessonId);

  const [header] = await repository.lessonHeader(lessonId);
  const rows = await repository.quizItemsForLesson(lessonId);
  const { attempts, settings, questions } = await nextPaper(studentId, lessonId, groupQuestions(rows));

  const [latest] = attempts;
  // Held back rather than hidden: the child is told the check exists and when
  // it opens, because a page that simply has nothing on it reads as broken.
  const isOpen = settings.opensAt === null || clockInUlaanbaatar() >= settings.opensAt;
  return {
    lessonId,
    lessonCode: header?.lessonCode ?? "",
    skillName: header?.skillName ?? "",
    questions: isOpen ? questions : [],
    kind: header?.assessmentKind ?? "LESSON",
    attemptsUsed: attempts.length,
    attemptsAllowed: settings.attemptsAllowed,
    lastScore: latest?.score ?? null,
    lastMaxScore: latest?.maxScore ?? null,
    opensAt: settings.opensAt,
    isOpen,
    answersOpen: settings.answersOpen,
  };
}

export async function recordQuizAttemptScored(
  user: AuthenticatedUser,
  input: { lessonId: number; answers: Array<{ itemId: number; optionId: number | null }> },
) {
  const studentId = requireStudentId(user);
  await requireReachableLesson(studentId, input.lessonId);

  const today = todayInUlaanbaatar();
  const settings = await quizSettings(studentId, input.lessonId);
  if (settings.opensAt !== null && clockInUlaanbaatar() < settings.opensAt) {
    throw conflict(
      `Энэ сорил ${settings.opensAt}-аас нээгдэнэ.`,
      "QUIZ_NOT_OPEN",
    );
  }
  const attempts = await repository.attemptsOnDate(studentId, input.lessonId, today);
  if (attempts.length >= settings.attemptsAllowed) {
    throw conflict(
      `Энэ сорилыг өнөөдөр ${settings.attemptsAllowed} удаа өгсөн байна.`,
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
      // Whether they were right is theirs at once; which option was right, and
      // the note explaining it, is the teacher's to release.
      correctOptionId: settings.answersOpen ? key?.optionId ?? null : null,
      explanation: settings.answersOpen ? itemRows[0].explanation : null,
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
    attemptsAllowed: settings.attemptsAllowed,
    answersOpen: settings.answersOpen,
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

/**
 * The teacher's look ahead at each child's next paper (UC08, FR13).
 *
 * Marking rights, not just viewing ones: choosing what a child is asked is
 * teaching the subject, so a class teacher who does not take it can read the
 * results elsewhere but not set the questions here.
 */
async function previewScope(user: AuthenticatedUser, classId: number, lessonId: number) {
  const klass = await authorisedClass(user, classId);
  const [header] = await repository.lessonHeader(lessonId);
  if (!header) throw badRequest("Ийм хичээл алга байна.", "NO_SUCH_LESSON");
  await editableSubjects(user, klass.classId, header.subjectId);
  const pool = groupQuestions(await repository.quizItemsForLesson(lessonId));
  const students = [];
  for (const s of await repository.classStudents(klass.classId)) {
    if (await repository.lessonReachableByStudent(lessonId, s.studentId)) students.push(s);
  }
  return { pool, students };
}

async function previewRow(studentId: number, name: string, lessonId: number, pool: QuizQuestion[]) {
  const { attempts, settings, overridden, questions } = await nextPaper(studentId, lessonId, pool);
  const left = attempts.length < settings.attemptsAllowed;
  return {
    studentId, name,
    attemptsUsed: attempts.length,
    attemptsAllowed: settings.attemptsAllowed,
    overridden: left && overridden,
    itemIds: left ? questions.map((q) => q.itemId) : [],
  };
}

export async function quizPreview(user: AuthenticatedUser, classId: number, lessonId: number) {
  const { pool, students } = await previewScope(user, classId, lessonId);
  const rows = [];
  for (const s of students) rows.push(await previewRow(s.studentId, s.name, lessonId, pool));
  const counts = rows.length ? rows[0]!.itemIds.length : QUESTIONS_PER_QUIZ;
  return {
    lessonId,
    onDate: todayInUlaanbaatar(),
    questionCount: counts || QUESTIONS_PER_QUIZ,
    pool: pool.map((q) => ({ itemId: q.itemId, prompt: q.prompt })),
    students: rows,
  };
}

export async function setQuizQuestions(
  user: AuthenticatedUser,
  input: { classId: number; lessonId: number; studentId: number; mode: "SET" | "RESHUFFLE" | "CLEAR"; itemIds?: number[] },
) {
  const { pool, students } = await previewScope(user, input.classId, input.lessonId);
  const child = students.find((s) => s.studentId === input.studentId);
  if (!child) throw forbidden("Энэ сурагчид энэ хичээл оногдоогүй байна.", "STUDENT_NOT_IN_LESSON");
  const today = todayInUlaanbaatar();
  if (input.mode === "CLEAR") {
    await repository.clearQuestionOverride(child.studentId, input.lessonId, today);
    return previewRow(child.studentId, child.name, input.lessonId, pool);
  }
  const [attempts, settings] = await Promise.all([
    repository.attemptsOnDate(child.studentId, input.lessonId, today),
    quizSettings(child.studentId, input.lessonId),
  ]);
  if (attempts.length >= settings.attemptsAllowed) {
    throw conflict("Энэ сурагч өнөөдрийн оролдлогоо дуусгасан.", "QUIZ_ATTEMPTS_SPENT");
  }
  let itemIds: number[];
  if (input.mode === "SET") {
    itemIds = [...new Set(input.itemIds ?? [])];
    const inPool = new Set(pool.map((q) => q.itemId));
    if (!itemIds.length || itemIds.some((id) => !inPool.has(id))) {
      throw badRequest("Энэ хичээлийн сангаас асуулт сонгоно уу.", "ITEM_NOT_IN_LESSON");
    }
  } else {
    // A fresh random draw, still preferring what this child has not seen today.
    const seen = new Set(attempts.flatMap((a) => (a.answers ?? []).map((x) => Number(x.questionId))));
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    itemIds = chooseQuestions(shuffled, seen, settings.questionCount).map((q) => q.itemId);
    if (!itemIds.length) throw badRequest("Энэ хичээлд шалгах асуулт алга.", "NO_QUESTIONS");
  }
  await repository.saveQuestionOverride({
    studentId: child.studentId, lessonId: input.lessonId, onDate: today,
    attemptNo: attempts.length + 1, itemIds, setBy: user.id,
  });
  return previewRow(child.studentId, child.name, input.lessonId, pool);
}
