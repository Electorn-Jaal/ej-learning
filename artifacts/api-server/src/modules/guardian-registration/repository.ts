import { pool, readRows } from "@workspace/db";

export const activeStudent = (studentId: number) =>
  readRows<{ id: number }>("SELECT id::int AS id FROM core.students WHERE id = $1 AND is_active", [studentId]);

/** A new code for a child; any earlier unused one stops working. */
export async function createInvite(studentId: number, codeHash: string, userId: number, expiresAt: string) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE core.guardian_invites SET revoked_at = now()
       WHERE student_id = $1 AND used_at IS NULL AND revoked_at IS NULL`, [studentId]);
    await client.query(
      `INSERT INTO core.guardian_invites (student_id, code_hash, created_by, expires_at)
       VALUES ($1, $2, $3, $4::timestamptz)`, [studentId, codeHash, userId, expiresAt]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export const usernameInUse = (username: string) =>
  readRows<{ n: number }>(
    `SELECT (SELECT count(*) FROM core.users WHERE lower(username) = lower($1))
          + (SELECT count(*) FROM core.guardian_requests WHERE lower(username) = lower($1) AND status = 'PENDING') AS n`,
    [username]);

/**
 * Uses the code and files the request in one step. The UPDATE ... RETURNING is
 * what spends the code, so two people racing with the same code cannot both
 * get a request in.
 */
export async function submitRequest(input: {
  codeHash: string; username: string; displayName: string; relation: string | null; passwordHash: string;
}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: [invite] } = await client.query<{ id: number; studentId: number }>(
      `UPDATE core.guardian_invites SET used_at = now()
       WHERE code_hash = $1 AND used_at IS NULL AND revoked_at IS NULL AND expires_at > now()
       RETURNING id::int AS id, student_id::int AS "studentId"`, [input.codeHash]);
    if (!invite) {
      await client.query("ROLLBACK");
      return null;
    }
    await client.query(
      `INSERT INTO core.guardian_requests (invite_id, student_id, username, display_name, relation_mn, password_hash)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [invite.id, invite.studentId, input.username, input.displayName, input.relation, input.passwordHash]);
    await client.query("COMMIT");
    return invite.studentId;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

const requestFields = `r.id::int AS id, r.student_id::int AS "studentId", s.display_name AS "studentName",
  (SELECT c.name_mn FROM core.student_enrollments e JOIN core.classes c ON c.id = e.class_id
    WHERE e.student_id = r.student_id AND e.is_active ORDER BY e.enrolled_at DESC LIMIT 1) AS "className",
  r.username, r.display_name AS "displayName", r.relation_mn AS relation, r.status,
  to_json(r.created_at)#>>'{}' AS "createdAt",
  (SELECT u.display_name || ' (' || u.username || ')' FROM core.guardian_students g JOIN core.users u ON u.id = g.user_id
    WHERE g.student_id = r.student_id AND g.is_active LIMIT 1) AS "currentGuardian",
  r.decision_note AS "decisionNote"`;
export type RequestRow = {
  id: number; studentId: number; studentName: string; className: string | null; username: string;
  displayName: string; relation: string | null; status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: string; currentGuardian: string | null; decisionNote: string;
};

export const pendingRequests = () => readRows<RequestRow>(
  `SELECT ${requestFields} FROM core.guardian_requests r JOIN core.students s ON s.id = r.student_id
   WHERE r.status = 'PENDING' ORDER BY r.created_at, r.id`);

export const request = (id: number) => readRows<RequestRow>(
  `SELECT ${requestFields} FROM core.guardian_requests r JOIN core.students s ON s.id = r.student_id WHERE r.id = $1`, [id]);

/**
 * Approve: the account, its role and the link, together. An existing active
 * guardian is replaced only when the administrator said so - the database
 * allows one live account per child and would otherwise refuse.
 */
export async function approve(id: number, decidedBy: number, replaceExisting: boolean, note: string) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: [r] } = await client.query<{
      studentId: number; username: string; displayName: string; relation: string | null; passwordHash: string;
    }>(`SELECT student_id::int AS "studentId", username, display_name AS "displayName", relation_mn AS relation,
          password_hash AS "passwordHash" FROM core.guardian_requests WHERE id = $1 AND status = 'PENDING' FOR UPDATE`, [id]);
    if (!r) { await client.query("ROLLBACK"); return "NOT_PENDING" as const; }
    const { rows: [existing] } = await client.query(
      "SELECT 1 FROM core.guardian_students WHERE student_id = $1 AND is_active", [r.studentId]);
    if (existing && !replaceExisting) { await client.query("ROLLBACK"); return "HAS_GUARDIAN" as const; }
    const { rows: [taken] } = await client.query(
      "SELECT 1 FROM core.users WHERE lower(username) = lower($1)", [r.username]);
    if (taken) { await client.query("ROLLBACK"); return "USERNAME_TAKEN" as const; }
    const { rows: [user] } = await client.query<{ id: number }>(
      `INSERT INTO core.users (username, display_name, password_hash, is_active) VALUES ($1, $2, $3, true)
       RETURNING id::int AS id`, [r.username, r.displayName, r.passwordHash]);
    await client.query("INSERT INTO core.user_roles (user_id, role) VALUES ($1, 'GUARDIAN')", [user!.id]);
    await client.query("UPDATE core.guardian_students SET is_active = false WHERE student_id = $1 AND is_active", [r.studentId]);
    await client.query(
      `INSERT INTO core.guardian_students (user_id, student_id, relation_mn, linked_by) VALUES ($1, $2, $3, $4)`,
      [user!.id, r.studentId, r.relation, decidedBy]);
    await client.query(
      `UPDATE core.guardian_requests SET status = 'APPROVED', decided_by = $2, decided_at = now(),
         decision_note = $3, user_id = $4, password_hash = '' WHERE id = $1`, [id, decidedBy, note, user!.id]);
    await client.query("COMMIT");
    return "APPROVED" as const;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export const reject = (id: number, decidedBy: number, note: string) =>
  pool.query(
    `UPDATE core.guardian_requests SET status = 'REJECTED', decided_by = $2, decided_at = now(),
       decision_note = $3, password_hash = '' WHERE id = $1 AND status = 'PENDING'`, [id, decidedBy, note])
    .then((r) => r.rowCount === 1);
