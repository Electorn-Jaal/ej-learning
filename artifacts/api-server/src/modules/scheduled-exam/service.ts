import { badRequest, conflict, forbidden, notFound } from "../../shared/http-error";
import { authorisedClass, editableSubjects } from "../class-access/service";
import type { AuthenticatedUser } from "../identity/service";
import { recordSkillEvidence } from "../mastery/service";
import * as repository from "./repository";

/**
 * Exams a teacher sets, as opposed to the check at the end of a lesson.
 *
 * The difference is not the questions - it is that this one is sat once, in a
 * window everybody shares, and that its result is evidence. The daily check
 * stopped feeding skill progress precisely so that something else could: a
 * figure built from five questions and three tries on a Tuesday afternoon said
 * nothing, and one built from a paper the whole class sat says a great deal.
 *
 * So this is the other half of that change. Progress moves here.
 */

const KINDS = ["UNIT", "TERM", "YEAR", "DIAGNOSTIC"];
const MAX_TITLE = 300;
const MAX_QUESTIONS = 100;

const iso = (raw: unknown): string | null =>
  typeof raw === "string" && !Number.isNaN(Date.parse(raw)) ? raw : null;

/** A short, unique-enough code; the column is unique and the class scopes it. */
const codeFor = (prefix: string, classId: number) =>
  `${prefix}-${classId}-${Date.now().toString(36).toUpperCase()}`;

/**
 * Pick the questions: some named, some drawn, or both.
 *
 * Drawing at random is not a shortcut for a lazy teacher - it is what makes
 * two children sitting side by side answer different papers, and what stops a
 * paper set once being the same paper next year. But a teacher who has a
 * question they want asked must be able to name it, so the two combine rather
 * than compete: what is named is asked, and the draw fills what is left.
 */
function chooseItems(
  bank: Array<{ itemId: number; optionCount: number }>,
  named: number[],
  drawCount: number,
) {
  const answerable = new Set(
    bank.filter((row) => row.optionCount > 1).map((row) => row.itemId),
  );
  const chosen: number[] = [];
  for (const itemId of named) {
    if (!answerable.has(itemId)) {
      throw badRequest(
        "Энэ асуултыг тухайн анги, хичээлд өгөх боломжгүй эсвэл сонголтгүй байна.",
        "ITEM_NOT_AVAILABLE",
      );
    }
    if (!chosen.includes(itemId)) chosen.push(itemId);
  }
  if (drawCount > 0) {
    const pool = [...answerable].filter((itemId) => !chosen.includes(itemId));
    // Fisher-Yates over the remainder, so the draw is even rather than
    // sort-by-random, which favours whatever the bank happens to list first.
    for (let at = pool.length - 1; at > 0; at -= 1) {
      const swap = Math.floor(Math.random() * (at + 1));
      [pool[at], pool[swap]] = [pool[swap]!, pool[at]!];
    }
    chosen.push(...pool.slice(0, drawCount));
  }
  return chosen;
}

export async function createExam(
  user: AuthenticatedUser,
  input: {
    classId: number;
    subjectId: number;
    examKind: string;
    title: string;
    instructions?: string | null;
    opensAt: string;
    closesAt: string;
    itemIds?: number[] | null;
    drawCount?: number | null;
    studentIds?: number[] | null;
    onPaper?: boolean | null;
  },
) {
  const klass = await authorisedClass(user, input.classId);
  await editableSubjects(user, klass.classId, input.subjectId);

  if (!KINDS.includes(input.examKind)) {
    throw badRequest("Шалгалтын төрөл буруу байна.", "INVALID_KIND");
  }
  const title = input.title.trim();
  if (title === "" || title.length > MAX_TITLE) {
    throw badRequest("Шалгалтын нэрээ бичнэ үү.", "INVALID_TITLE");
  }
  const opensAt = iso(input.opensAt);
  const closesAt = iso(input.closesAt);
  if (opensAt === null || closesAt === null) {
    throw badRequest("Нээх, хаах хугацаа буруу байна.", "INVALID_WINDOW");
  }
  // Both ends, and in that order. An exam that never closes is homework, and
  // the closing time is what makes "sat it" mean the same for every child.
  if (Date.parse(closesAt) <= Date.parse(opensAt)) {
    throw badRequest("Хаах хугацаа нээхээс хойш байх ёстой.", "INVALID_WINDOW");
  }

  const [grade] = await repository.classGrade(klass.classId);
  if (!grade) throw notFound("Анги олдсонгүй.", "CLASS_NOT_FOUND");

  const bank = await repository.itemBank(input.subjectId, grade.gradeLevelId);
  const drawCount = input.drawCount ?? 0;
  if (drawCount < 0 || drawCount > MAX_QUESTIONS) {
    throw badRequest(`Асуултын тоо ${MAX_QUESTIONS}-аас ихгүй байна.`, "TOO_MANY_QUESTIONS");
  }
  const itemIds = chooseItems(bank, input.itemIds ?? [], drawCount);
  if (itemIds.length === 0) {
    throw badRequest("Шалгалтад нэг ч асуулт сонгогдсонгүй.", "NO_QUESTIONS");
  }
  if (itemIds.length > MAX_QUESTIONS) {
    throw badRequest(`Асуултын тоо ${MAX_QUESTIONS}-аас ихгүй байна.`, "TOO_MANY_QUESTIONS");
  }

  // Named children, or the whole register. An empty list is the whole class:
  // a teacher who names nobody means everybody, which is the ordinary case.
  const studentIds = input.studentIds ?? [];
  const wholeClass = studentIds.length === 0;
  if (!wholeClass) {
    const roster = new Set(await repository.rosterIds(klass.classId));
    if (studentIds.some((id) => !roster.has(id))) {
      throw badRequest("Энэ ангид бүртгэлгүй сурагч байна.", "STUDENT_NOT_IN_CLASS");
    }
  }

  const { sittingId } = await repository.createSitting({
    paperCode: codeFor(input.examKind, klass.classId),
    subjectId: input.subjectId,
    gradeLevelId: grade.gradeLevelId,
    classId: klass.classId,
    examKind: input.examKind,
    title,
    instructions: input.instructions?.trim() || null,
    createdBy: user.id,
    itemIds,
    opensAt,
    closesAt,
    wholeClass,
    onPaper: input.onPaper ?? false,
    studentIds: [...new Set(studentIds)],
  });
  return { sittingId, questionCount: itemIds.length };
}

export async function teacherExams(
  user: AuthenticatedUser,
  classId: number,
  subjectId: number | null,
) {
  const klass = await authorisedClass(user, classId);
  const subjectIds = await editableSubjects(user, klass.classId, subjectId);
  return repository.sittingsForClass(klass.classId, subjectIds);
}

/** The teacher's copy: every question with the key, and who has sat it. */
export async function teacherExam(user: AuthenticatedUser, sittingId: number) {
  const [row] = await repository.sitting(sittingId);
  if (!row) throw notFound("Шалгалт олдсонгүй.", "EXAM_NOT_FOUND");
  const klass = await authorisedClass(user, row.classId);
  await editableSubjects(user, klass.classId, row.subjectId);

  const [items, results] = await Promise.all([
    repository.paperItems(row.paperId),
    repository.resultsForSitting(sittingId),
  ]);
  return { ...row, questions: groupItems(items, true), results };
}

/**
 * Turn the flat question-and-option rows into questions.
 *
 * withKey is the whole difference between the teacher's copy and the child's.
 * It is done here, once, rather than in each caller, because "remember to
 * strip the answers" is the kind of instruction that is followed four times
 * and forgotten the fifth.
 */
function groupItems(
  rows: Awaited<ReturnType<typeof repository.paperItems>>,
  withKey: boolean,
) {
  const byItem = new Map<number, {
    itemId: number;
    itemOrder: number;
    title: string;
    stimulus: string | null;
    maxScore: number;
    options: Array<{ optionId: number; text: string; isCorrect?: boolean }>;
  }>();
  for (const row of rows) {
    let item = byItem.get(row.itemId);
    if (!item) {
      item = {
        itemId: row.itemId,
        itemOrder: row.itemOrder,
        title: row.title,
        stimulus: row.stimulus,
        maxScore: row.maxScore,
        options: [],
      };
      byItem.set(row.itemId, item);
    }
    if (row.optionId !== null) {
      item.options.push({
        optionId: row.optionId,
        text: row.optionText ?? "",
        ...(withKey ? { isCorrect: row.isCorrect ?? false } : {}),
      });
    }
  }
  return [...byItem.values()].sort((left, right) => left.itemOrder - right.itemOrder);
}

export async function reopenFor(
  user: AuthenticatedUser,
  sittingId: number,
  studentIds: number[],
) {
  const [row] = await repository.sitting(sittingId);
  if (!row) throw notFound("Шалгалт олдсонгүй.", "EXAM_NOT_FOUND");
  const klass = await authorisedClass(user, row.classId);
  await editableSubjects(user, klass.classId, row.subjectId);
  if (studentIds.length === 0) throw badRequest("Сурагчаа сонгоно уу.", "NO_STUDENTS");

  const roster = new Set(await repository.rosterIds(klass.classId));
  if (studentIds.some((id) => !roster.has(id))) {
    throw badRequest("Энэ ангид бүртгэлгүй сурагч байна.", "STUDENT_NOT_IN_CLASS");
  }
  await repository.grantExtraAttempt(sittingId, [...new Set(studentIds)]);
  return { reopened: new Set(studentIds).size };
}

export async function releaseAnswers(
  user: AuthenticatedUser,
  sittingId: number,
  open: boolean,
) {
  const [row] = await repository.sitting(sittingId);
  if (!row) throw notFound("Шалгалт олдсонгүй.", "EXAM_NOT_FOUND");
  const klass = await authorisedClass(user, row.classId);
  await editableSubjects(user, klass.classId, row.subjectId);
  await repository.setAnswersOpen(sittingId, open ? new Date().toISOString() : null);
  return { answersOpen: open };
}

// --------------------------------------------------------------- the child

function requireStudentId(user: AuthenticatedUser) {
  if (user.studentId === null) {
    throw forbidden("Энэ бүртгэл сурагчийн бүртгэлтэй холбогдоогүй байна.", "NO_STUDENT_LINK");
  }
  return user.studentId;
}

export async function studentExams(user: AuthenticatedUser) {
  const studentId = requireStudentId(user);
  const now = Date.now();
  return (await repository.sittingsForStudent(studentId)).map((row) => ({
    ...row,
    // Worked out here rather than in SQL so that "open" means the same thing
    // on the list and on the paper itself.
    isOpen:
      Date.parse(row.opensAt) <= now
      && now < Date.parse(row.closesAt)
      && row.attemptsUsed < row.attemptsAllowed,
  }));
}

export async function studentExam(user: AuthenticatedUser, sittingId: number) {
  const studentId = requireStudentId(user);
  const [row] = await repository.sitting(sittingId);
  if (!row) throw notFound("Шалгалт олдсонгүй.", "EXAM_NOT_FOUND");
  const [standing] = await repository.standing(sittingId, studentId);
  if (!standing?.invited) {
    throw forbidden("Энэ шалгалт танд оногдоогүй байна.", "EXAM_NOT_ASSIGNED");
  }

  const now = Date.now();
  const isOpen = Date.parse(row.opensAt) <= now && now < Date.parse(row.closesAt);
  const spent = standing.attemptsUsed >= standing.attemptsAllowed;
  return {
    sittingId,
    title: row.title,
    examKind: row.examKind,
    instructions: row.instructions,
    opensAt: row.opensAt,
    closesAt: row.closesAt,
    isOpen,
    attemptsUsed: standing.attemptsUsed,
    attemptsAllowed: standing.attemptsAllowed,
    answersOpen: row.answersOpen,
    // Nothing to read before it opens, and nothing to read again after it has
    // been sat: a paper left on screen afterwards is a paper that leaves the
    // room.
    questions: isOpen && !spent
      ? groupItems(await repository.paperItems(row.paperId), false)
      : [],
  };
}

/**
 * Mark one sitting of a paper and store it.
 *
 * Shared by the child answering online and the teacher typing in what a child
 * wrote on paper, because the marking has to be the same or the two are not
 * comparable - and a school that cannot compare a paper exam with an online
 * one has two systems, not one.
 *
 * An answer may be an option the child picked, or a score the teacher awarded.
 * The second is for questions a key cannot settle - the ones with a rubric
 * rather than four boxes - and for the paper entry, where a teacher reading a
 * written answer is the only thing that can judge it. Where both arrive, the
 * awarded score wins: a person looked at the page.
 */
async function markAndStore(
  row: { paperId: number; subjectId: number; gradeLevelId: number | null; answersOpen: boolean },
  sittingId: number,
  studentId: number,
  answers: Array<{ itemId: number; optionId?: number | null; awarded?: number | null }>,
) {
  const itemRows = await repository.paperItems(row.paperId);
  const given = new Map(answers.map((answer) => [answer.itemId, answer]));
  const key = new Map<number, Set<number>>();
  const bySkill = new Map<number, { correct: number; total: number }>();
  const scored: Array<{ itemId: number; awarded: number; max: number }> = [];

  for (const line of itemRows) {
    if (line.optionId === null || !line.isCorrect) continue;
    key.set(line.itemId, (key.get(line.itemId) ?? new Set()).add(line.optionId));
  }
  const questions = groupItems(itemRows, false);
  const skillOf = new Map(itemRows.map((line) => [line.itemId, line.skillId]));

  for (const question of questions) {
    const answer = given.get(question.itemId);
    const hand = answer?.awarded ?? null;
    let awarded: number;
    if (hand !== null) {
      if (hand < 0 || hand > question.maxScore) {
        throw badRequest(
          `${question.itemOrder}-р асуултын оноо 0-${question.maxScore} хооронд байна.`,
          "INVALID_SCORE",
        );
      }
      awarded = hand;
    } else {
      const picked = answer?.optionId ?? null;
      awarded = picked !== null && (key.get(question.itemId)?.has(picked) ?? false)
        ? question.maxScore
        : 0;
    }
    scored.push({ itemId: question.itemId, awarded, max: question.maxScore });

    const skillId = skillOf.get(question.itemId) ?? null;
    if (skillId !== null) {
      const tally = bySkill.get(skillId) ?? { correct: 0, total: 0 };
      tally.total += 1;
      // Half marks count as half of nothing here: skill evidence is a count of
      // questions answered, and a part-marked written answer is a judgement
      // call the teacher already made. Anything over half the marks is taken
      // as the skill shown.
      if (awarded * 2 > question.maxScore) tally.correct += 1;
      bySkill.set(skillId, tally);
    }
  }

  const stored = await repository.storeAttempt({
    sittingId,
    paperId: row.paperId,
    studentId,
    subjectId: row.subjectId,
    gradeLevelId: row.gradeLevelId ?? 0,
    attemptCode: `S${sittingId}-${studentId}-${Date.now().toString(36).toUpperCase()}`,
    rows: scored,
  });

  // Evidence. This is the half of the daily-check change that gives progress
  // something to stand on: a paper the whole class sat once, under a window,
  // marked against a key nobody could see.
  await recordSkillEvidence(
    studentId,
    [...bySkill].map(([skillId, tally]) => ({ skillId, ...tally })),
  );

  return {
    attemptId: stored.attemptId,
    score: stored.total,
    maxScore: stored.outOf,
    answersOpen: row.answersOpen,
    // The key, only where the teacher has released it - the same rule the
    // daily check follows, and it bites harder here: a paper is sat once, and
    // a child who sees the answers before their classmate has finished has
    // been handed the marks.
    results: scored.map((line) => ({
      itemId: line.itemId,
      correct: line.awarded * 2 > line.max,
      correctOptionIds: row.answersOpen ? [...(key.get(line.itemId) ?? [])] : [],
    })),
  };
}

export async function submitExam(
  user: AuthenticatedUser,
  sittingId: number,
  answers: Array<{ itemId: number; optionId?: number | null }>,
) {
  const studentId = requireStudentId(user);
  const [row] = await repository.sitting(sittingId);
  if (!row) throw notFound("Шалгалт олдсонгүй.", "EXAM_NOT_FOUND");
  if (row.onPaper) {
    // It happened in the room. There is nothing to answer here, and offering
    // it would let a child sit twice - once on paper and once again online.
    throw conflict("Энэ шалгалтыг цаасаар өгсөн байна.", "EXAM_ON_PAPER");
  }
  const [standing] = await repository.standing(sittingId, studentId);
  if (!standing?.invited) {
    throw forbidden("Энэ шалгалт танд оногдоогүй байна.", "EXAM_NOT_ASSIGNED");
  }

  const now = Date.now();
  if (Date.parse(row.opensAt) > now) {
    throw conflict("Шалгалт хараахан нээгдээгүй байна.", "EXAM_NOT_OPEN");
  }
  if (Date.parse(row.closesAt) <= now) {
    throw conflict("Шалгалтын хугацаа дууссан байна.", "EXAM_CLOSED");
  }
  // Once. A paper a child can sit twice on their own is not a paper, and the
  // only way to another go is a teacher deciding there should be one.
  if (standing.attemptsUsed >= standing.attemptsAllowed) {
    throw conflict("Энэ шалгалтыг аль хэдийн өгсөн байна.", "EXAM_ALREADY_SAT");
  }

  return markAndStore(row, sittingId, studentId, answers);
}

/**
 * What a child wrote on paper, entered by their teacher.
 *
 * Question by question, in the order the paper was printed in, because that is
 * how the sheet in front of them is laid out. Entering a total instead would
 * be quicker and would throw away the only thing that makes an exam useful
 * afterwards: which questions the class got wrong.
 *
 * No window. The exam happened when it happened; a teacher typing it up on
 * Sunday evening is not sitting it late. Re-entering replaces nothing - a
 * second entry is a second attempt, which is what a teacher gets after
 * reopening it for that child.
 */
export async function enterPaperAnswers(
  user: AuthenticatedUser,
  sittingId: number,
  input: {
    studentId: number;
    answers: Array<{ itemId: number; optionId?: number | null; awarded?: number | null }>;
  },
) {
  const [row] = await repository.sitting(sittingId);
  if (!row) throw notFound("Шалгалт олдсонгүй.", "EXAM_NOT_FOUND");
  const klass = await authorisedClass(user, row.classId);
  await editableSubjects(user, klass.classId, row.subjectId);
  if (!row.onPaper) {
    throw badRequest("Энэ шалгалтыг цаасаар өгөөгүй байна.", "EXAM_NOT_ON_PAPER");
  }

  const [standing] = await repository.standing(sittingId, input.studentId);
  if (!standing?.invited) {
    throw badRequest("Энэ шалгалт тухайн сурагчид оногдоогүй байна.", "EXAM_NOT_ASSIGNED");
  }
  if (standing.attemptsUsed >= standing.attemptsAllowed) {
    throw conflict(
      "Энэ сурагчийн хариулт аль хэдийн оруулсан байна.",
      "EXAM_ALREADY_SAT",
    );
  }

  return markAndStore(row, sittingId, input.studentId, input.answers);
}
