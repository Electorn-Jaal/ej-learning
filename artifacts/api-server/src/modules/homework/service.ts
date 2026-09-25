import { badRequest, conflict, forbidden, notFound } from "../../shared/http-error";
import { isIsoDate, todayInUlaanbaatar } from "../../shared/school-date";
import { authorisedClass, editableSubjects } from "../class-access/service";
import type { AuthenticatedUser } from "../identity/service";
import * as repository from "./repository";

/**
 * Extra work a teacher hands out.
 *
 * Distinct from the personal work on a child's day, which is one thing per
 * subject per date and is replaced when it is set again. That shape suits
 * "today's maths" and suits nothing a teacher actually gives out: it cannot go
 * to a class, it has no deadline, and doing it twice erases the first go.
 *
 * Three rules the school asked for, and the reasons they are rules:
 *
 *   A whole class, a named few, or one child. Remediation for one and reading
 *   for twenty-eight are the same gesture and belong on the same screen.
 *
 *   A deadline, or none, and late is allowed either way. A door that locks
 *   turns "I did it at the weekend" into "I did not do it" - the same child,
 *   a worse record. Lateness is written down instead.
 *
 *   Every go is kept. Which one counts is the teacher's judgement, made from
 *   seeing both; keeping only the newest makes that judgement for them.
 */

const MAX_TITLE = 300;
const MAX_INSTRUCTIONS = 4000;
const MAX_BODY = 20000;
/** A school day is not longer than this; anything more is a page left open. */
const MAX_MINUTES = 600;

export async function listForClass(
  user: AuthenticatedUser,
  classId: number,
  subjectId: number | null,
) {
  const klass = await authorisedClass(user, classId);
  const subjectIds = await editableSubjects(user, klass.classId, subjectId);
  return repository.forClass(klass.classId, subjectIds);
}

export async function createHomework(
  user: AuthenticatedUser,
  input: {
    classId: number;
    subjectId: number;
    title: string;
    instructions?: string | null;
    dailyLessonId?: number | null;
    assignedOn?: string | null;
    dueOn?: string | null;
    studentIds?: number[] | null;
  },
) {
  const klass = await authorisedClass(user, input.classId);
  await editableSubjects(user, klass.classId, input.subjectId);

  const title = input.title.trim();
  if (title === "" || title.length > MAX_TITLE) {
    throw badRequest("Ажлын нэрээ бичнэ үү.", "INVALID_TITLE");
  }
  const instructions = typeof input.instructions === "string"
    ? input.instructions.trim()
    : null;
  if (instructions !== null && instructions.length > MAX_INSTRUCTIONS) {
    throw badRequest(`Заавар ${MAX_INSTRUCTIONS} тэмдэгтээс урт байна.`, "TOO_LONG");
  }

  const assignedOn = isIsoDate(input.assignedOn) ? input.assignedOn : todayInUlaanbaatar();
  const dueOn = isIsoDate(input.dueOn) ? input.dueOn : null;
  if (input.dueOn && dueOn === null) {
    throw badRequest("Хугацаа буруу байна.", "INVALID_DATE");
  }
  if (dueOn !== null && dueOn < assignedOn) {
    throw badRequest("Хугацаа өгсөн өдрөөс өмнө байж болохгүй.", "INVALID_DUE_DATE");
  }

  // Naming nobody means everybody, which is the ordinary case: a teacher
  // setting reading for the class should not have to tick twenty-eight boxes.
  const studentIds = [...new Set(input.studentIds ?? [])];
  const wholeClass = studentIds.length === 0;
  if (!wholeClass) {
    const roster = new Set(await repository.rosterIds(klass.classId));
    if (studentIds.some((id) => !roster.has(id))) {
      throw badRequest("Энэ ангид бүртгэлгүй сурагч байна.", "STUDENT_NOT_IN_CLASS");
    }
  }

  const homeworkId = await repository.create({
    classId: klass.classId,
    subjectId: input.subjectId,
    dailyLessonId: input.dailyLessonId ?? null,
    title,
    instructions: instructions === "" ? null : instructions,
    assignedOn,
    dueOn,
    wholeClass,
    teacherId: user.teacherId,
    createdBy: user.id,
    studentIds,
  });
  return { homeworkId, given: wholeClass ? null : studentIds.length };
}

/**
 * One piece of work and every go at it, grouped by child.
 *
 * A child with no submission is still a row: the question a teacher opens this
 * for is usually "who has not handed it in", and a list of the ones who have
 * cannot answer it.
 */
export async function homeworkDetail(user: AuthenticatedUser, homeworkId: number) {
  const [found] = await repository.one(homeworkId);
  if (!found) throw notFound("Ажил олдсонгүй.", "HOMEWORK_NOT_FOUND");
  const klass = await authorisedClass(user, found.classId);
  await editableSubjects(user, klass.classId, found.subjectId);

  const rows = await repository.submissions(homeworkId);
  const byStudent = new Map<number, {
    studentId: number;
    studentName: string;
    studentCode: string;
    attempts: Array<{
      submissionId: number;
      attemptNo: number;
      body: string | null;
      minutes: number | null;
      isLate: boolean;
      submittedAt: string;
    }>;
  }>();
  for (const row of rows) {
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
    if (row.submissionId !== null) {
      student.attempts.push({
        submissionId: row.submissionId,
        attemptNo: row.attemptNo ?? 1,
        body: row.body,
        minutes: row.minutes,
        isLate: row.isLate ?? false,
        submittedAt: row.submittedAt ?? "",
      });
    }
  }
  return { ...found, students: [...byStudent.values()] };
}

export async function setActive(
  user: AuthenticatedUser,
  homeworkId: number,
  isActive: boolean,
) {
  const [found] = await repository.one(homeworkId);
  if (!found) throw notFound("Ажил олдсонгүй.", "HOMEWORK_NOT_FOUND");
  const klass = await authorisedClass(user, found.classId);
  await editableSubjects(user, klass.classId, found.subjectId);
  await repository.setActive(homeworkId, isActive);
  return { isActive };
}

// --------------------------------------------------------------- the child

function requireStudentId(user: AuthenticatedUser) {
  if (user.studentId === null) {
    throw forbidden("Энэ бүртгэл сурагчийн бүртгэлтэй холбогдоогүй байна.", "NO_STUDENT_LINK");
  }
  return user.studentId;
}

export async function myHomework(user: AuthenticatedUser) {
  const studentId = requireStudentId(user);
  const today = todayInUlaanbaatar();
  return (await repository.forStudent(studentId)).map((row) => ({
    ...row,
    // Said plainly rather than left for the child to work out from two dates.
    isOverdue: row.dueOn !== null && row.dueOn < today && row.attempts === 0,
  }));
}

export async function myHomeworkDetail(user: AuthenticatedUser, homeworkId: number) {
  const studentId = requireStudentId(user);
  if (!(await repository.isFor(homeworkId, studentId))) {
    throw forbidden("Энэ ажил танд оногдоогүй байна.", "NOT_YOUR_HOMEWORK");
  }
  const [found] = await repository.one(homeworkId);
  if (!found) throw notFound("Ажил олдсонгүй.", "HOMEWORK_NOT_FOUND");
  return {
    homeworkId,
    title: found.title,
    instructions: found.instructions,
    assignedOn: found.assignedOn,
    dueOn: found.dueOn,
    attempts: await repository.ownSubmissions(homeworkId, studentId),
  };
}

export async function submitHomework(
  user: AuthenticatedUser,
  homeworkId: number,
  input: { body?: string | null; minutes?: number | null },
) {
  const studentId = requireStudentId(user);
  if (!(await repository.isFor(homeworkId, studentId))) {
    throw forbidden("Энэ ажил танд оногдоогүй байна.", "NOT_YOUR_HOMEWORK");
  }
  const [found] = await repository.one(homeworkId);
  if (!found) throw notFound("Ажил олдсонгүй.", "HOMEWORK_NOT_FOUND");
  if (!found.isActive) {
    // Withdrawn, which is different from overdue: the teacher took it back.
    throw conflict("Энэ ажлыг багш хаасан байна.", "HOMEWORK_CLOSED");
  }

  const body = typeof input.body === "string" ? input.body.trim() : null;
  if (body !== null && body.length > MAX_BODY) {
    throw badRequest("Хариулт хэт урт байна.", "TOO_LONG");
  }
  if (body === null || body === "") {
    throw badRequest("Хариултаа бичнэ үү.", "EMPTY_SUBMISSION");
  }
  const minutes = typeof input.minutes === "number"
    ? Math.min(Math.max(Math.round(input.minutes), 0), MAX_MINUTES)
    : null;

  // Worked out now and stored, not compared against the deadline later: a
  // teacher who moves the date must not thereby make a child punctual, or
  // tardy, after the fact.
  const isLate = found.dueOn !== null && todayInUlaanbaatar() > found.dueOn;

  const stored = await repository.submit({
    homeworkId, studentId, body, minutes, isLate,
  });
  return { ...stored, isLate };
}
