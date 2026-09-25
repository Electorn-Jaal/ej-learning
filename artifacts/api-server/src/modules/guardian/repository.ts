import { pool, readRows } from "@workspace/db";

/**
 * The children this account reads, with enough to name them on a switcher.
 *
 * Active links only. A second parent is added by making the first inactive,
 * and an inactive link is history rather than access.
 */
export const children = (userId: number) =>
  readRows<{
    studentId: number;
    displayName: string;
    studentCode: string;
    className: string | null;
    gradeLevel: number | null;
    relation: string | null;
  }>(
    `SELECT s.id::int AS "studentId", s.display_name AS "displayName",
       s.student_code AS "studentCode", c.name_mn AS "className",
       g.grade_number::int AS "gradeLevel", gs.relation_mn AS relation
     FROM core.guardian_students gs
     JOIN core.students s ON s.id = gs.student_id AND s.is_active
     LEFT JOIN core.student_enrollments e ON e.student_id = s.id AND e.is_active
     LEFT JOIN core.classes c ON c.id = e.class_id
     LEFT JOIN core.grade_levels g ON g.id = c.grade_level_id
     WHERE gs.user_id = $1::bigint AND gs.is_active
     ORDER BY s.display_name`,
    [userId],
  );

/**
 * One child's register over a span of days.
 *
 * Both shapes at once: up to year 5 a row is the day and timetableSlotId is
 * null, from year 6 it is a period. The caller shows whichever it gets rather
 * than asking the year first, because a child who moved up a year mid-span
 * legitimately has both.
 */
export const attendance = (studentId: number, from: string, to: string) =>
  readRows<{
    onDate: string;
    timetableSlotId: number | null;
    periodNo: number | null;
    subjectName: string | null;
    state: string;
    participation: string | null;
    note: string | null;
  }>(
    `SELECT a.on_date::text AS "onDate", a.timetable_slot_id::int AS "timetableSlotId",
       ts.period_no::int AS "periodNo", sub.name_mn AS "subjectName",
       a.state, a.participation, a.note
     FROM learning.attendance_marks a
     LEFT JOIN learning.timetable_slots ts ON ts.id = a.timetable_slot_id
     LEFT JOIN core.subjects sub ON sub.id = a.subject_id
     WHERE a.student_id = $1::bigint AND a.on_date BETWEEN $2::date AND $3::date
     ORDER BY a.on_date DESC, ts.period_no NULLS FIRST`,
    [studentId, from, to],
  );

/** What the teachers wrote about this child's exercise books over a span. */
export const notebook = (studentId: number, from: string, to: string) =>
  readRows<{
    onDate: string;
    subjectName: string | null;
    state: string;
    comment: string | null;
  }>(
    `SELECT nm.scheduled_on::text AS "onDate", sub.name_mn AS "subjectName",
       nm.state, nm.comment
     FROM learning.notebook_marks nm
     LEFT JOIN core.subjects sub ON sub.id = nm.subject_id
     WHERE nm.student_id = $1::bigint AND nm.scheduled_on BETWEEN $2::date AND $3::date
     ORDER BY nm.scheduled_on DESC`,
    [studentId, from, to],
  );

/**
 * The papers this child has sat, and what they scored.
 *
 * The key is never here, released or not. A parent reading the answers over a
 * child's shoulder is exactly the route by which a paper still being sat by
 * the rest of the class leaks - so this is scores and dates, and the questions
 * stay on the child's own screen.
 */
export const exams = (studentId: number) =>
  readRows<{
    sittingId: number;
    title: string;
    examKind: string;
    subjectName: string;
    satAt: string | null;
    score: number | null;
    maxScore: number | null;
  }>(
    `SELECT s.id::int AS "sittingId", p.title_mn AS title, p.exam_kind::text AS "examKind",
       sub.name_mn AS "subjectName",
       to_json(a.attempted_at) #>> '{}' AS "satAt",
       a.total_score::float8 AS score, a.total_max_score::float8 AS "maxScore"
     FROM assessment.diagnostic_attempts a
     JOIN assessment.exam_sittings s ON s.id = a.exam_sitting_id
     JOIN assessment.exam_papers p ON p.id = s.exam_paper_id
     JOIN core.subjects sub ON sub.id = s.subject_id
     WHERE a.student_id = $1::bigint
     ORDER BY a.attempted_at DESC
     LIMIT 50`,
    [studentId],
  );

/** Who takes this child's class, for a parent who needs to reach somebody. */
export const teachers = (studentId: number) =>
  readRows<{ subjectName: string | null; teacherName: string; isClassTeacher: boolean }>(
    `SELECT sub.name_mn AS "subjectName", u.display_name AS "teacherName",
       ct.subject_id IS NULL AS "isClassTeacher"
     FROM core.student_enrollments e
     JOIN core.class_teachers ct ON ct.class_id = e.class_id AND ct.is_active
     JOIN core.teachers t ON t.id = ct.teacher_id
     JOIN core.users u ON u.id = t.user_id
     LEFT JOIN core.subjects sub ON sub.id = ct.subject_id
     WHERE e.student_id = $1::bigint AND e.is_active
     ORDER BY ct.subject_id IS NULL DESC, sub.name_mn`,
    [studentId],
  );

// ------------------------------------------------------------------- admin

/** Every account with a guardian role, and the children it reads. */
export const guardianAccounts = () =>
  readRows<{
    userId: number;
    username: string;
    displayName: string;
    isActive: boolean;
    studentId: number | null;
    studentName: string | null;
    relation: string | null;
  }>(
    `SELECT u.id::int AS "userId", u.username, u.display_name AS "displayName",
       u.is_active AS "isActive", gs.student_id::int AS "studentId",
       s.display_name AS "studentName", gs.relation_mn AS relation
     FROM core.users u
     JOIN core.user_roles r ON r.user_id = u.id AND r.role = 'GUARDIAN'
     LEFT JOIN core.guardian_students gs ON gs.user_id = u.id AND gs.is_active
     LEFT JOIN core.students s ON s.id = gs.student_id
     ORDER BY u.display_name, s.display_name`,
  );

/**
 * Link an account to a child, retiring whatever link the child had.
 *
 * One live account per child is the school's rule and the database holds it
 * with a partial unique index, so the old link has to go in the same
 * transaction as the new one arrives - otherwise the write fails on a rule
 * nobody on the screen asked about.
 */
export async function linkGuardian(
  userId: number,
  studentId: number,
  relation: string | null,
  linkedBy: number,
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE core.guardian_students SET is_active = false
        WHERE student_id = $1::bigint AND is_active AND user_id <> $2::bigint`,
      [studentId, userId],
    );
    await client.query(
      `INSERT INTO core.guardian_students (user_id, student_id, relation_mn, linked_by)
       VALUES ($1::bigint, $2::bigint, $3, $4::bigint)
       ON CONFLICT ON CONSTRAINT guardian_students_user_student_key DO UPDATE SET
         is_active = true,
         relation_mn = EXCLUDED.relation_mn,
         linked_by = EXCLUDED.linked_by,
         linked_at = now()`,
      [userId, studentId, relation, linkedBy],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export const unlinkGuardian = (userId: number, studentId: number) =>
  pool.query(
    `UPDATE core.guardian_students SET is_active = false
      WHERE user_id = $1::bigint AND student_id = $2::bigint`,
    [userId, studentId],
  );

export const studentExists = (studentId: number) =>
  readRows<{ id: number }>(
    "SELECT id::int AS id FROM core.students WHERE id = $1::bigint AND is_active",
    [studentId],
  );

/**
 * Make a parent's login, with the guardian role and nothing else.
 *
 * One transaction: an account with no role can sign in and see a blank
 * product, which looks to the person holding it exactly like the school
 * getting their details wrong.
 *
 * studentId stays null. That column is what makes an account a child - it is
 * what every student screen reads - and a parent must never be one.
 */
export async function createGuardianAccount(input: {
  username: string;
  displayName: string;
  passwordHash: string;
}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const created = await client.query<{ id: number }>(
      `INSERT INTO core.users (username, display_name, password_hash, is_active)
       VALUES ($1, $2, $3, true)
       RETURNING id::int AS id`,
      [input.username, input.displayName, input.passwordHash],
    );
    const userId = created.rows[0]!.id;
    await client.query(
      "INSERT INTO core.user_roles (user_id, role) VALUES ($1::bigint, 'GUARDIAN')",
      [userId],
    );
    await client.query("COMMIT");
    return userId;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export const usernameTaken = (username: string) =>
  readRows<{ id: number }>(
    "SELECT id::int AS id FROM core.users WHERE lower(username) = lower($1)",
    [username],
  );

/**
 * Children who have no live guardian account, for the screen that makes them.
 *
 * Scoped to a class, because an administrator works through a register rather
 * than through a list of every child in the school.
 */
export const childrenWithoutGuardian = (classId: number) =>
  readRows<{ studentId: number; displayName: string; studentCode: string; linked: boolean }>(
    `SELECT s.id::int AS "studentId", s.display_name AS "displayName",
       s.student_code AS "studentCode",
       EXISTS (SELECT 1 FROM core.guardian_students gs
                WHERE gs.student_id = s.id AND gs.is_active) AS linked
     FROM core.students s
     JOIN core.student_enrollments e ON e.student_id = s.id AND e.is_active
     WHERE e.class_id = $1::bigint AND s.is_active
     ORDER BY s.display_name`,
    [classId],
  );
