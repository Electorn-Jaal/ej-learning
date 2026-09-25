import { badRequest, forbidden, notFound } from "../../shared/http-error";
import { todayInUlaanbaatar } from "../../shared/school-date";
import type { AuthenticatedUser } from "../identity/service";
import * as repository from "./repository";

/**
 * Clubs: what the school runs that is not a class.
 *
 * The school's timetable writes Speaking club, БС and ДС-1 into the box where
 * a class name goes, because that was the only box there was. It makes them
 * unreadable - the box means "who is in the room", and a club's answer is
 * "whoever signed up, from anywhere" - and it is why the system could not hold
 * them until now.
 *
 * Staff-wide rather than per-teacher: a club is a school-level thing, and the
 * person who enters it is as often the manager as the teacher who runs it.
 * Changing one is limited to staff, which is the same bar the timetable keeps.
 */

const MAX_NAME = 200;
const MAX_NOTE = 1000;

function requireStaff(user: AuthenticatedUser) {
  if (!user.roles.includes("TEACHER") && !user.roles.includes("ADMIN")) {
    throw forbidden("Зөвхөн багш, админ дугуйлан бүртгэнэ.", "STAFF_ONLY");
  }
}

async function schoolYear() {
  const [row] = await repository.currentSchoolYear();
  if (!row) throw badRequest("Хичээлийн жил тодорхойгүй байна.", "NO_SCHOOL_YEAR");
  return row.schoolYear;
}

export async function listClubs(user: AuthenticatedUser) {
  requireStaff(user);
  return repository.clubs(await schoolYear());
}

export async function createClub(
  user: AuthenticatedUser,
  input: {
    nameMn: string;
    subjectId?: number | null;
    teacherId?: number | null;
    note?: string | null;
    sessions: Array<{ weekdayNo: number; periodNo: number }>;
  },
) {
  requireStaff(user);
  const nameMn = input.nameMn.trim();
  if (nameMn === "" || nameMn.length > MAX_NAME) {
    throw badRequest("Дугуйлангийн нэрээ бичнэ үү.", "INVALID_NAME");
  }
  const note = typeof input.note === "string" ? input.note.trim() : null;
  if (note !== null && note.length > MAX_NOTE) {
    throw badRequest(`Тайлбар ${MAX_NOTE} тэмдэгтээс урт байна.`, "NOTE_TOO_LONG");
  }
  // An hour is what makes a club appear anywhere. Without one it is a row on a
  // list that meets never, and the list would say it is running.
  if (input.sessions.length === 0) {
    throw badRequest("Хэзээ хуралдахаа оруулна уу.", "NO_SESSIONS");
  }
  for (const session of input.sessions) {
    if (session.weekdayNo < 1 || session.weekdayNo > 7) {
      throw badRequest("Гараг буруу байна.", "INVALID_WEEKDAY");
    }
    if (session.periodNo < 1 || session.periodNo > 12) {
      throw badRequest("Цаг буруу байна.", "INVALID_PERIOD");
    }
  }

  const clubId = await repository.createClub({
    nameMn,
    subjectId: input.subjectId ?? null,
    teacherId: input.teacherId ?? null,
    schoolYear: await schoolYear(),
    note: note === "" ? null : note,
    createdBy: user.id,
    sessions: input.sessions,
    validFrom: todayInUlaanbaatar(),
  });
  return { clubId };
}

export async function clubMembers(user: AuthenticatedUser, clubId: number) {
  requireStaff(user);
  const [found] = await repository.club(clubId);
  if (!found) throw notFound("Дугуйлан олдсонгүй.", "CLUB_NOT_FOUND");
  const [members, roster] = await Promise.all([
    repository.members(clubId),
    repository.everyStudent(),
  ]);
  // The whole school, not one class: that is the point of a club, and a screen
  // that asked for a class first would be asking the wrong question.
  return { clubId, nameMn: found.nameMn, members, roster };
}

export async function setMembers(
  user: AuthenticatedUser,
  clubId: number,
  studentIds: number[],
) {
  requireStaff(user);
  const [found] = await repository.club(clubId);
  if (!found) throw notFound("Дугуйлан олдсонгүй.", "CLUB_NOT_FOUND");

  const roster = new Set((await repository.everyStudent()).map((row) => row.studentId));
  const wanted = [...new Set(studentIds)];
  if (wanted.some((id) => !roster.has(id))) {
    throw badRequest("Сургуульд бүртгэлгүй сурагч байна.", "STUDENT_NOT_FOUND");
  }
  await repository.setMembers(clubId, wanted);
  return { members: wanted.length };
}

export async function setActive(
  user: AuthenticatedUser,
  clubId: number,
  isActive: boolean,
) {
  requireStaff(user);
  const [found] = await repository.club(clubId);
  if (!found) throw notFound("Дугуйлан олдсонгүй.", "CLUB_NOT_FOUND");
  await repository.setActive(clubId, isActive);
  return { isActive };
}

/**
 * The clubs a child has on a given day.
 *
 * Called by the child's own day rather than by a screen of its own, because a
 * club at the ninth period is part of that child's Tuesday and putting it on a
 * separate page would be the system insisting on a distinction the child does
 * not have.
 */
export const clubsForStudent = (studentId: number, onDate: string) =>
  repository.forStudent(studentId, onDate);
