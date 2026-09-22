import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  MIN_PASSWORD_LENGTH,
  hashPassword,
  verifyPassword,
} from "../../shared/password";
import { badRequest, unauthorized } from "../../shared/http-error";
import * as repository from "./repository";
import type { AuthenticatedUser, UserRole } from "./repository";

export type { AuthenticatedUser, UserRole };

export const SESSION_COOKIE = "ej_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

/**
 * A wrong username and a wrong password must cost the same, or the response
 * time tells an attacker which usernames exist. This hash is verified against
 * whenever the account is missing or inactive.
 */
const ABSENT_ACCOUNT_HASH = await hashPassword(randomBytes(32).toString("hex"));

const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export type Session = {
  token: string;
  expiresAt: Date;
  user: AuthenticatedUser;
};

export async function login(
  username: string,
  password: string,
): Promise<Session> {
  const credentials = await repository.findCredentialsByUsername(username);
  const stored = credentials?.isActive
    ? credentials.passwordHash
    : ABSENT_ACCOUNT_HASH;
  const matches = await verifyPassword(password, stored);

  if (!credentials || !credentials.isActive || !matches) {
    // One message for every failure: never reveal which half was wrong.
    throw unauthorized(
      "Нэвтрэх нэр эсвэл нууц үг буруу байна.",
      "INVALID_CREDENTIALS",
    );
  }

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await repository.insertSession(credentials.id, tokenHash(token), expiresAt);

  const user = await repository.loadUser(credentials.id);
  if (!user) {
    throw unauthorized("Бүртгэл идэвхгүй байна.", "INACTIVE_ACCOUNT");
  }

  return { token, expiresAt, user };
}

export async function resolve(token: string): Promise<AuthenticatedUser | null> {
  if (!token) return null;
  const live = await repository.findLiveSession(tokenHash(token));
  return live?.user ?? null;
}

export async function logout(token: string): Promise<void> {
  if (token) await repository.revokeSession(tokenHash(token));
}

/**
 * Verifies the current password before changing it, then drops the account's
 * other sessions. The token of the caller is needed, not just the user id, so
 * the session doing the work can be the one that survives.
 */
export async function changePassword(
  user: AuthenticatedUser,
  token: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    throw badRequest(
      `Шинэ нууц үг дор хаяж ${MIN_PASSWORD_LENGTH} тэмдэгттэй байх ёстой.`,
      "PASSWORD_TOO_SHORT",
    );
  }
  if (newPassword === currentPassword) {
    throw badRequest(
      "Шинэ нууц үг хуучнаасаа өөр байх ёстой.",
      "PASSWORD_UNCHANGED",
    );
  }

  const credentials = await repository.findCredentialsByUsername(user.username);
  if (!credentials || !(await verifyPassword(currentPassword, credentials.passwordHash))) {
    throw unauthorized("Одоогийн нууц үг буруу байна.", "INVALID_CREDENTIALS");
  }

  await repository.updatePasswordHash(user.id, await hashPassword(newPassword));
  await repository.revokeOtherSessions(user.id, tokenHash(token));
}

export const hasRole = (user: AuthenticatedUser, role: UserRole) =>
  user.roles.includes(role);

/** Constant-time compare for the seed script's confirmation prompt. */
export function sameSecret(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export { hashPassword };

/**
 * Who is signed in, with the school context their screens print.
 *
 * Distinct from /auth/me, which answers the narrow question the router asks
 * on every page load. This one carries the class, grade and student code a
 * profile page shows, so it reads one extra row and only for a student.
 */
export async function currentSession(user?: AuthenticatedUser) {
  if (!user) throw unauthorized("Нэвтэрнэ үү.", "NOT_AUTHENTICATED");
  const isStudent = user.roles.includes("STUDENT");
  const [student] = isStudent && user.studentId !== null && user.studentId !== undefined
    ? await repository.studentContext(user.studentId)
    : [];
  return {
    id: String(user.id),
    displayName: user.displayName,
    role: isStudent ? "student" : user.roles.includes("ADMIN") ? "admin" : "teacher",
    gradeLevel: student?.gradeLevel ?? 0,
    className: student?.className ?? "",
    isDemo: false,
    authConfigured: true,
    username: user.username,
    studentCode: student?.code ?? null,
    schoolYear: student?.schoolYear ?? null,
  };
}
