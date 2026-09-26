import { createHash, randomInt } from "node:crypto";
import { HttpError, badRequest, conflict, notFound } from "../../shared/http-error";
import { MIN_PASSWORD_LENGTH } from "../../shared/password";
import { hashPassword, type AuthenticatedUser } from "../identity/service";
import * as repository from "./repository";

/**
 * Parents asking for their own account (UC18, FR27): a one-time code from the
 * school, a request, an administrator's approval.
 */

// No O/0/l/I/1, as in the roster passwords: a parent types this off paper.
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const INVITE_DAYS = 14;
const USERNAME = /^[a-z0-9][a-z0-9._-]{2,49}$/;

export const hashCode = (code: string) =>
  createHash("sha256").update(code.trim().toLowerCase().replace(/[^a-z0-9]/g, "")).digest("hex");

function newCode() {
  const pick = () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return `${pick()}-${pick()}-${pick()}`;
}

export async function createInvite(user: AuthenticatedUser, studentId: number) {
  if (!(await repository.activeStudent(studentId))[0]) throw notFound("Сурагч олдсонгүй.", "STUDENT_NOT_FOUND");
  const code = newCode();
  const expiresAt = new Date(Date.now() + INVITE_DAYS * 86_400_000).toISOString();
  await repository.createInvite(studentId, hashCode(code), user.id, expiresAt);
  return { studentId, code, expiresAt };
}

// Wrong codes from one address, per quarter hour. In memory like the login
// limit: a restart forgets it, which costs a guesser nothing they could use.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_WRONG = 10;
const wrong = new Map<string, { n: number; resetAt: number }>();

function checkLimit(ip: string) {
  const now = Date.now();
  const entry = wrong.get(ip);
  if (entry && entry.resetAt > now && entry.n >= MAX_WRONG) {
    throw new HttpError(429, "Олон удаа буруу код оруулсан. Түр хүлээгээд дахин оролдоно уу.", "REGISTER_RATE_LIMITED");
  }
}
function recordWrong(ip: string) {
  const now = Date.now();
  if (wrong.size > 10_000) wrong.clear();
  const entry = wrong.get(ip);
  wrong.set(ip, entry && entry.resetAt > now ? { ...entry, n: entry.n + 1 } : { n: 1, resetAt: now + WINDOW_MS });
}

export async function register(ip: string, input: {
  code: string; username: string; displayName: string; relation?: string | null; password: string;
}) {
  checkLimit(ip);
  const username = input.username.trim().toLowerCase();
  if (!USERNAME.test(username)) {
    throw badRequest("Нэвтрэх нэр 3-50 тэмдэгт, латин үсэг, тоо, . _ - байна.", "INVALID_USERNAME");
  }
  const displayName = input.displayName.trim();
  if (!displayName) throw badRequest("Нэрээ бичнэ үү.", "INVALID_NAME");
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    throw badRequest(`Нууц үг дор хаяж ${MIN_PASSWORD_LENGTH} тэмдэгт байна.`, "PASSWORD_TOO_SHORT");
  }
  if ((await repository.usernameInUse(username))[0]!.n > 0) {
    throw conflict("Энэ нэвтрэх нэр бүртгэлтэй байна. Өөр нэр сонгоно уу.", "USERNAME_TAKEN");
  }
  const relation = input.relation?.trim() || null;
  const studentId = await repository.submitRequest({
    codeHash: hashCode(input.code), username, displayName, relation, passwordHash: await hashPassword(input.password),
  });
  if (studentId === null) {
    recordWrong(ip);
    // One answer for wrong, used and expired: telling them apart would tell a
    // guesser which codes are real.
    throw badRequest("Код буруу эсвэл хүчингүй болсон байна. Сургуулиас шинэ код авна уу.", "INVALID_CODE");
  }
  return { status: "PENDING" as const };
}

export const pending = () => repository.pendingRequests();

export async function decide(user: AuthenticatedUser, id: number, input: { approve: boolean; replaceExisting?: boolean; note?: string }) {
  const note = (input.note ?? "").trim();
  if (!(await repository.request(id))[0]) throw notFound("Хүсэлт олдсонгүй.", "REQUEST_NOT_FOUND");
  if (input.approve) {
    const result = await repository.approve(id, user.id, input.replaceExisting === true, note);
    if (result === "NOT_PENDING") throw conflict("Энэ хүсэлтийг аль хэдийн шийдсэн.", "ALREADY_DECIDED");
    if (result === "HAS_GUARDIAN") {
      throw conflict("Энэ хүүхэд идэвхтэй эцэг эхийн бүртгэлтэй. Солих бол «солих»-ыг сонгоно уу.", "HAS_GUARDIAN");
    }
    if (result === "USERNAME_TAKEN") throw conflict("Нэвтрэх нэр хоорондоо бүртгэгдсэн байна. Хүсэлтийг татгалзана уу.", "USERNAME_TAKEN");
  } else if (!(await repository.reject(id, user.id, note))) {
    throw conflict("Энэ хүсэлтийг аль хэдийн шийдсэн.", "ALREADY_DECIDED");
  }
  return (await repository.request(id))[0]!;
}
