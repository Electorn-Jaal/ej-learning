import { and, eq, gt, isNotNull, isNull, lt, or } from "drizzle-orm";
import {
  db,
  sessionsInCore,
  teachersInCore,
  userRolesInCore,
  usersInCore,
} from "@workspace/db";

export type UserRole = "STUDENT" | "TEACHER" | "ADMIN";

export type AuthenticatedUser = {
  id: number;
  username: string;
  displayName: string;
  studentId: number | null;
  roles: UserRole[];
  teacherId: number | null;
};

async function decorate(row: {
  id: number;
  username: string;
  displayName: string;
  studentId: number | null;
}): Promise<AuthenticatedUser> {
  const [roles, teacher] = await Promise.all([
    db
      .select({ role: userRolesInCore.role })
      .from(userRolesInCore)
      .where(eq(userRolesInCore.userId, row.id)),
    db
      .select({ id: teachersInCore.id })
      .from(teachersInCore)
      .where(
        and(eq(teachersInCore.userId, row.id), eq(teachersInCore.isActive, true)),
      )
      .limit(1),
  ]);

  return {
    ...row,
    roles: roles.map((entry) => entry.role),
    teacherId: teacher[0]?.id ?? null,
  };
}

/** Returns the stored hash too, so only the service compares passwords. */
export async function findCredentialsByUsername(username: string) {
  const [row] = await db
    .select({
      id: usersInCore.id,
      username: usersInCore.username,
      displayName: usersInCore.displayName,
      studentId: usersInCore.studentId,
      passwordHash: usersInCore.passwordHash,
      isActive: usersInCore.isActive,
    })
    .from(usersInCore)
    .where(eq(usersInCore.username, username))
    .limit(1);
  return row ?? null;
}

export async function loadUser(id: number): Promise<AuthenticatedUser | null> {
  const [row] = await db
    .select({
      id: usersInCore.id,
      username: usersInCore.username,
      displayName: usersInCore.displayName,
      studentId: usersInCore.studentId,
    })
    .from(usersInCore)
    .where(and(eq(usersInCore.id, id), eq(usersInCore.isActive, true)))
    .limit(1);
  return row ? decorate(row) : null;
}

export async function insertSession(
  userId: number,
  tokenHash: string,
  expiresAt: Date,
) {
  await db.insert(sessionsInCore).values({
    userId,
    tokenHash,
    expiresAt: expiresAt.toISOString(),
  });
}

/**
 * Resolves a session token to its user in one query, rejecting sessions that
 * are revoked, expired, or whose account has since been deactivated.
 */
export async function findLiveSession(tokenHash: string) {
  const [row] = await db
    .select({
      sessionId: sessionsInCore.id,
      expiresAt: sessionsInCore.expiresAt,
      id: usersInCore.id,
      username: usersInCore.username,
      displayName: usersInCore.displayName,
      studentId: usersInCore.studentId,
    })
    .from(sessionsInCore)
    .innerJoin(usersInCore, eq(usersInCore.id, sessionsInCore.userId))
    .where(
      and(
        eq(sessionsInCore.tokenHash, tokenHash),
        isNull(sessionsInCore.revokedAt),
        gt(sessionsInCore.expiresAt, new Date().toISOString()),
        eq(usersInCore.isActive, true),
      ),
    )
    .limit(1);
  if (!row) return null;

  const { sessionId, expiresAt, ...user } = row;
  return { sessionId, expiresAt, user: await decorate(user) };
}

export async function revokeSession(tokenHash: string) {
  await db
    .update(sessionsInCore)
    .set({ revokedAt: new Date().toISOString() })
    .where(
      and(
        eq(sessionsInCore.tokenHash, tokenHash),
        isNull(sessionsInCore.revokedAt),
      ),
    );
}

/** Housekeeping: drops rows that can no longer authenticate anyone. */
export async function deleteDeadSessions() {
  const now = new Date().toISOString();
  await db
    .delete(sessionsInCore)
    .where(
      or(lt(sessionsInCore.expiresAt, now), isNotNull(sessionsInCore.revokedAt)),
    );
}
