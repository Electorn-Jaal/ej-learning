import { and, eq, gt, isNotNull, isNull, lt, ne, or } from "drizzle-orm";
import {
  classTeachersInCore,
  db,
  readRows,
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
  /** Whether this account takes any lesson at all. See the API description. */
  takesLessons: boolean;
  /** Where to fetch this person's own photograph, or null when they have none. */
  photoUrl: string | null;
};

async function decorate(row: {
  id: number;
  username: string;
  displayName: string;
  studentId: number | null;
  photoKey: string | null;
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

  const teacherId = teacher[0]?.id ?? null;
  const takesLessons =
    teacherId === null
      ? false
      : (
          await db
            .select({ classId: classTeachersInCore.classId })
            .from(classTeachersInCore)
            .where(
              and(
                eq(classTeachersInCore.teacherId, teacherId),
                eq(classTeachersInCore.isActive, true),
                isNotNull(classTeachersInCore.subjectId),
              ),
            )
            .limit(1)
        ).length > 0;

  // A URL rather than the storage key. The shell draws the avatar from the
  // session it already has, so carrying it here saves every screen a second
  // request for a picture that never changes between page loads.
  const { photoKey, ...rest } = row;
  return {
    ...rest,
    roles: roles.map((entry) => entry.role),
    teacherId,
    takesLessons,
    photoUrl: photoKey === null ? null : "/api/me/photo",
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
      photoKey: usersInCore.photoKey,
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
      photoKey: usersInCore.photoKey,
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

export async function updatePasswordHash(userId: number, passwordHash: string) {
  await db
    .update(usersInCore)
    .set({ passwordHash, updatedAt: new Date().toISOString() })
    .where(eq(usersInCore.id, userId));
}

/**
 * Revokes every live session for a user except the one presenting `keepHash`.
 *
 * A password is usually changed because someone else may know it, so leaving
 * their session running would defeat the change. The caller's own session is
 * kept so the change does not sign them out of the tab they are in.
 */
export async function revokeOtherSessions(userId: number, keepHash: string) {
  await db
    .update(sessionsInCore)
    .set({ revokedAt: new Date().toISOString() })
    .where(
      and(
        eq(sessionsInCore.userId, userId),
        ne(sessionsInCore.tokenHash, keepHash),
        isNull(sessionsInCore.revokedAt),
      ),
    );
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

/**
 * The school context of one student, for the session read.
 *
 * Narrower than the student listings on purpose: "who am I" needs the class,
 * the grade and the year printed beside a name, and nothing else. The
 * national registration number is not selected anywhere near a session
 * response.
 */
export const studentContext = (studentId: number) =>
  readRows<{ code: string; className: string; gradeLevel: number; schoolYear: string | null }>(
    `SELECT s.student_code AS code,
       COALESCE(string_agg(DISTINCT c.name_mn, ', ' ORDER BY c.name_mn), '') AS "className",
       COALESCE(max(g.grade_number), 0)::int AS "gradeLevel",
       max(c.school_year) AS "schoolYear"
     FROM core.students s
     LEFT JOIN core.student_enrollments e ON e.student_id = s.id AND e.is_active
     LEFT JOIN core.classes c ON c.id = e.class_id AND c.is_active
     LEFT JOIN core.grade_levels g ON g.id = c.grade_level_id
     WHERE s.is_active AND s.id = $1::bigint
     GROUP BY s.id`,
    [studentId],
  );
