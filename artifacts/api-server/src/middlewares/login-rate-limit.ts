import { HttpError } from '../shared/http-error';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;
const MAX_KEYS = 10_000;

type Attempt = { failures: number; resetAt: number };
const attempts = new Map<string, Attempt>();

const keyFor = (ip: string, username: string) =>
  `${ip}|${username.trim().toLocaleLowerCase('en-US')}`;

function liveAttempt(key: string, now: number) {
  const attempt = attempts.get(key);
  if (attempt && attempt.resetAt > now) return attempt;
  if (attempt) attempts.delete(key);
  return undefined;
}

function prune(now: number) {
  for (const [key, attempt] of attempts) {
    if (attempt.resetAt <= now) attempts.delete(key);
  }
  while (attempts.size >= MAX_KEYS) {
    const oldest = attempts.keys().next().value;
    if (oldest === undefined) break;
    attempts.delete(oldest);
  }
}

export function checkLoginLimit(ip: string, username: string) {
  const now = Date.now();
  const attempt = liveAttempt(keyFor(ip, username), now);
  if (!attempt || attempt.failures < MAX_FAILURES) return;
  const error = new HttpError(
    429,
    'Олон удаа буруу оролдлоо. Түр хүлээгээд дахин оролдоно уу.',
    'LOGIN_RATE_LIMITED',
  ) as HttpError & { retryAfter: number };
  error.retryAfter = Math.max(1, Math.ceil((attempt.resetAt - now) / 1000));
  throw error;
}

export function recordLoginFailure(ip: string, username: string) {
  const now = Date.now();
  prune(now);
  const key = keyFor(ip, username);
  const current = liveAttempt(key, now);
  attempts.set(key, current
    ? { ...current, failures: current.failures + 1 }
    : { failures: 1, resetAt: now + WINDOW_MS });
}

export function clearLoginFailures(ip: string, username: string) {
  attempts.delete(keyFor(ip, username));
}
