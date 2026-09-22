import { badRequest, forbidden } from '../../shared/http-error';
import { todayInUlaanbaatar, validIsoDate } from '../../shared/school-date';
import type { AuthenticatedUser } from '../identity/service';
import * as repository from './repository';

const MAX_PLAN_LENGTH = 2000;

const studentIdOf = (user: AuthenticatedUser) => {
  if (user.studentId === null) {
    throw forbidden('Сурагчийн бүртгэлгүй байна.', 'NO_STUDENT_LINK');
  }
  return user.studentId;
};

const planDate = (raw: unknown) => {
  if (raw === undefined || raw === null || raw === '') return todayInUlaanbaatar();
  if (!validIsoDate(raw)) throw badRequest('Огноо буруу байна.', 'INVALID_DATE');
  return raw;
};

export async function studentPlan(user: AuthenticatedUser, rawDate?: unknown) {
  const date = planDate(rawDate);
  const [row] = await repository.findDayPlan(studentIdOf(user), date);
  return { date, body: row?.body ?? '' };
}

export async function saveStudentPlan(
  user: AuthenticatedUser,
  input: { date: string; body: string },
) {
  const date = planDate(input.date);
  const trimmed = input.body.trim();
  if (trimmed.length > MAX_PLAN_LENGTH) {
    throw badRequest(
      `Төлөвлөгөө ${MAX_PLAN_LENGTH} тэмдэгтээс урт байна.`,
      'PLAN_TOO_LONG',
    );
  }
  await repository.saveDayPlan(studentIdOf(user), date, trimmed === '' ? null : trimmed);
  return { date, body: trimmed };
}
