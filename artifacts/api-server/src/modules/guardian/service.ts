import { badRequest, forbidden, notFound } from "../../shared/http-error";
import { isIsoDate, shiftDays, todayInUlaanbaatar } from "../../shared/school-date";
import type { AuthenticatedUser } from "../identity/service";
import { hashPassword } from "../identity/service";
import { MIN_PASSWORD_LENGTH } from "../../shared/password";
import { dayForStudent } from "../student-learning/service";
import * as repository from "./repository";

/**
 * What a parent may read, and the one gate everything goes through.
 *
 * guardianOf is on the session, so this is a list membership rather than a
 * query - which matters, because a check that costs a round trip is a check
 * somebody eventually skips "just here". An administrator passes too: they
 * already see every child through the teacher screens, and refusing them here
 * would only mean a second way of looking.
 *
 * Everything else in this module assumes it has been called.
 */
function requireChild(user: AuthenticatedUser, studentId: number) {
  if (user.roles.includes("ADMIN")) return;
  if (!user.guardianOf.includes(studentId)) {
    throw forbidden("Энэ хүүхдийн мэдээлэл танд хамаарахгүй байна.", "NOT_YOUR_CHILD");
  }
}

export async function myChildren(user: AuthenticatedUser) {
  return repository.children(user.id);
}

/**
 * One child's day, exactly as the child sees it.
 *
 * The same assembly, not a parallel one: the day a parent is shown something
 * their child is not is the day the screen stops being worth trusting, and two
 * builders of the same page drift apart within a month.
 */
export async function childDay(
  user: AuthenticatedUser,
  studentId: number,
  on?: unknown,
) {
  requireChild(user, studentId);
  const date = isIsoDate(on) ? on : todayInUlaanbaatar();
  return dayForStudent(studentId, date);
}

/**
 * The fortnight behind: who was in the room, what was in the book.
 *
 * A fortnight rather than the term, because the question a parent actually has
 * is about this week and last. A longer view belongs on a page built for it,
 * not on the one that has to load while somebody stands in a doorway.
 */
export async function childRecord(
  user: AuthenticatedUser,
  studentId: number,
  query: { from?: unknown; to?: unknown },
) {
  requireChild(user, studentId);
  const to = isIsoDate(query.to) ? query.to : todayInUlaanbaatar();
  const from = isIsoDate(query.from) ? query.from : shiftDays(to, -13);
  if (from > to) throw badRequest("Огнооны муж буруу байна.", "INVALID_RANGE");

  const [attendance, notebook, exams, teachers] = await Promise.all([
    repository.attendance(studentId, from, to),
    repository.notebook(studentId, from, to),
    repository.exams(studentId),
    repository.teachers(studentId),
  ]);
  return { studentId, from, to, attendance, notebook, exams, teachers };
}

// ------------------------------------------------------------------- admin

export async function guardianAccounts(user: AuthenticatedUser) {
  if (!user.roles.includes("ADMIN")) {
    throw forbidden("Зөвхөн админ эцэг эхийн бүртгэлийг хардаг.", "ADMIN_REQUIRED");
  }
  const rows = await repository.guardianAccounts();
  const byUser = new Map<number, {
    userId: number;
    username: string;
    displayName: string;
    isActive: boolean;
    children: Array<{ studentId: number; studentName: string; relation: string | null }>;
  }>();
  for (const row of rows) {
    let account = byUser.get(row.userId);
    if (!account) {
      account = {
        userId: row.userId,
        username: row.username,
        displayName: row.displayName,
        isActive: row.isActive,
        children: [],
      };
      byUser.set(row.userId, account);
    }
    if (row.studentId !== null) {
      account.children.push({
        studentId: row.studentId,
        studentName: row.studentName ?? "",
        relation: row.relation,
      });
    }
  }
  return [...byUser.values()];
}

/**
 * Point a parent's account at a child.
 *
 * Whatever link the child had is retired in the same breath, because one live
 * account per child is the school's rule: a parents' evening arranged twice
 * because two people both had the password is worse than one arranged badly.
 * The retired link stays, so a question about who could see what in March has
 * an answer in June.
 */
export async function linkChild(
  user: AuthenticatedUser,
  input: { userId: number; studentId: number; relation?: string | null },
) {
  if (!user.roles.includes("ADMIN")) {
    throw forbidden("Зөвхөн админ эцэг эхийг хүүхэдтэй холбоно.", "ADMIN_REQUIRED");
  }
  const [student] = await repository.studentExists(input.studentId);
  if (!student) throw notFound("Сурагч олдсонгүй.", "STUDENT_NOT_FOUND");

  const relation = typeof input.relation === "string" ? input.relation.trim() : null;
  if (relation !== null && relation.length > 40) {
    throw badRequest("Хамаарал хэт урт байна.", "RELATION_TOO_LONG");
  }
  await repository.linkGuardian(
    input.userId,
    input.studentId,
    relation === "" ? null : relation,
    user.id,
  );
  return { linked: true };
}

export async function unlinkChild(
  user: AuthenticatedUser,
  input: { userId: number; studentId: number },
) {
  if (!user.roles.includes("ADMIN")) {
    throw forbidden("Зөвхөн админ эцэг эхийн холбоосыг салгана.", "ADMIN_REQUIRED");
  }
  await repository.unlinkGuardian(input.userId, input.studentId);
  return { linked: false };
}

const USERNAME = /^[a-z0-9][a-z0-9._-]{2,49}$/;

/**
 * Make a parent an account.
 *
 * The password is chosen by the administrator sitting with the parent and
 * shown back once, because this school hands out credentials in person. It is
 * never stored in the clear and never returned again: a screen that can
 * re-display a password is a screen somebody will leave open.
 */
export async function createGuardian(
  user: AuthenticatedUser,
  input: { username: string; displayName: string; password: string; studentId?: number | null },
) {
  if (!user.roles.includes("ADMIN")) {
    throw forbidden("Зөвхөн админ эцэг эхийн бүртгэл үүсгэнэ.", "ADMIN_REQUIRED");
  }
  const username = input.username.trim().toLowerCase();
  if (!USERNAME.test(username)) {
    throw badRequest(
      "Нэвтрэх нэр 3-50 тэмдэгт, латин үсэг, тоо, . _ - байна.",
      "INVALID_USERNAME",
    );
  }
  if ((await repository.usernameTaken(username)).length > 0) {
    throw badRequest("Энэ нэвтрэх нэр аль хэдийн бүртгэлтэй байна.", "USERNAME_TAKEN");
  }
  const displayName = input.displayName.trim();
  if (displayName === "" || displayName.length > 300) {
    throw badRequest("Нэрээ бичнэ үү.", "INVALID_NAME");
  }
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    throw badRequest(
      `Нууц үг дор хаяж ${MIN_PASSWORD_LENGTH} тэмдэгт байна.`,
      "PASSWORD_TOO_SHORT",
    );
  }

  const userId = await repository.createGuardianAccount({
    username,
    displayName,
    passwordHash: await hashPassword(input.password),
  });

  // Linking at the same time is the ordinary case - an account exists in order
  // to read a child - and doing it in one step spares an administrator the
  // half-made account they would otherwise have to remember to finish.
  if (input.studentId) {
    await linkChild(user, { userId, studentId: input.studentId });
  }
  return { userId, username };
}

export async function classChildren(user: AuthenticatedUser, classId: number) {
  if (!user.roles.includes("ADMIN")) {
    throw forbidden("Зөвхөн админ эцэг эхийн бүртгэлийг хардаг.", "ADMIN_REQUIRED");
  }
  return repository.childrenWithoutGuardian(classId);
}
