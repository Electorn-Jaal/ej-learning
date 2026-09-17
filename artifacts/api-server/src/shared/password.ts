import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  type ScryptOptions,
} from "node:crypto";
import { promisify } from "node:util";

// promisify resolves to the 3-argument overload, which drops the cost
// parameters, so the options form is restored explicitly.
const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;

// OWASP's scrypt floor (N=2^17, r=8, p=1). node:crypto caps memory at 32 MB by
// default, which is below what N=2^17 needs, so maxmem is raised to match.
const COST = 2 ** 17;
const BLOCK_SIZE = 8;
const PARALLELISM = 1;
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const MAXMEM = 192 * 1024 * 1024;

const options = { N: COST, r: BLOCK_SIZE, p: PARALLELISM, maxmem: MAXMEM } as const;

/**
 * NIST SP 800-63B's floor for a user-chosen secret. Length is the only rule:
 * composition requirements ("one capital, one digit") push people toward
 * predictable substitutions without adding real entropy, and these accounts
 * belong to schoolchildren who will otherwise write them down.
 */
export const MIN_PASSWORD_LENGTH = 8;

/**
 * Returns `scrypt$N$r$p$salt$key`, parameters inline, so stored hashes stay
 * verifiable after the cost is raised.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await scrypt(password, salt, KEY_LENGTH, options);
  return [
    "scrypt",
    COST,
    BLOCK_SIZE,
    PARALLELISM,
    salt.toString("base64"),
    key.toString("base64"),
  ].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const [, costRaw, blockRaw, parallelRaw, saltRaw, keyRaw] = parts;
  const cost = Number(costRaw);
  const blockSize = Number(blockRaw);
  const parallelism = Number(parallelRaw);
  if (
    !Number.isInteger(cost) ||
    !Number.isInteger(blockSize) ||
    !Number.isInteger(parallelism)
  ) {
    return false;
  }

  const salt = Buffer.from(saltRaw, "base64");
  const expected = Buffer.from(keyRaw, "base64");
  if (salt.length === 0 || expected.length === 0) return false;

  let actual: Buffer;
  try {
    actual = await scrypt(password, salt, expected.length, {
      N: cost,
      r: blockSize,
      p: parallelism,
      maxmem: MAXMEM,
    });
  } catch {
    // Unreadable cost parameters must not crash a login attempt.
    return false;
  }

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
