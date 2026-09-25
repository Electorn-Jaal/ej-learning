import { pool, readRows } from "@workspace/db";

/**
 * Every club the school runs this year, with when it meets and how many are in
 * it.
 *
 * The member count is on the list because it is the one number that says
 * whether a club is real. A club with sessions and no members is on nobody's
 * timetable, which looks from the staff room exactly like a club that is
 * running fine.
 */
export const clubs = (schoolYear: string) =>
  readRows<{
    clubId: number;
    nameMn: string;
    subjectId: number | null;
    subjectName: string | null;
    teacherId: number | null;
    teacherName: string | null;
    note: string | null;
    isActive: boolean;
    memberCount: number;
    sessions: Array<{ weekdayNo: number; periodNo: number }> | null;
  }>(
    `SELECT cl.id::int AS "clubId", cl.name_mn AS "nameMn",
       cl.subject_id::int AS "subjectId", sub.name_mn AS "subjectName",
       cl.teacher_id::int AS "teacherId", u.display_name AS "teacherName",
       cl.note, cl.is_active AS "isActive",
       (SELECT count(*)::int FROM learning.club_members m
         WHERE m.club_id = cl.id AND m.is_active) AS "memberCount",
       (SELECT json_agg(json_build_object(
                 'weekdayNo', s.weekday_no::int, 'periodNo', s.period_no::int)
                 ORDER BY s.weekday_no, s.period_no)
          FROM learning.club_sessions s WHERE s.club_id = cl.id) AS sessions
     FROM learning.clubs cl
     LEFT JOIN core.subjects sub ON sub.id = cl.subject_id
     LEFT JOIN core.teachers t ON t.id = cl.teacher_id
     LEFT JOIN core.users u ON u.id = t.user_id
     WHERE cl.school_year = $1
     ORDER BY cl.is_active DESC, cl.name_mn`,
    [schoolYear],
  );

export const club = (clubId: number) =>
  readRows<{
    clubId: number;
    nameMn: string;
    teacherId: number | null;
    schoolYear: string;
    isActive: boolean;
  }>(
    `SELECT id::int AS "clubId", name_mn AS "nameMn", teacher_id::int AS "teacherId",
       school_year AS "schoolYear", is_active AS "isActive"
     FROM learning.clubs WHERE id = $1::bigint`,
    [clubId],
  );

/** Who is in one club, and which class each of them comes from. */
export const members = (clubId: number) =>
  readRows<{
    studentId: number;
    displayName: string;
    studentCode: string;
    className: string | null;
  }>(
    `SELECT s.id::int AS "studentId", s.display_name AS "displayName",
       s.student_code AS "studentCode", c.name_mn AS "className"
     FROM learning.club_members m
     JOIN core.students s ON s.id = m.student_id AND s.is_active
     LEFT JOIN core.student_enrollments e ON e.student_id = s.id AND e.is_active
     LEFT JOIN core.classes c ON c.id = e.class_id
     WHERE m.club_id = $1::bigint AND m.is_active
     ORDER BY c.name_mn, s.display_name`,
    [clubId],
  );

/**
 * Create a club and its hours together.
 *
 * Together because a club with no hours cannot appear anywhere, and a teacher
 * who made one and then lost the tab would have left a row that shows on the
 * list, counts as a club, and meets never.
 */
export async function createClub(input: {
  nameMn: string;
  subjectId: number | null;
  teacherId: number | null;
  schoolYear: string;
  note: string | null;
  createdBy: number;
  sessions: Array<{ weekdayNo: number; periodNo: number }>;
  validFrom: string;
}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const created = await client.query<{ id: number }>(
      `INSERT INTO learning.clubs
         (name_mn, subject_id, teacher_id, school_year, note, created_by)
       VALUES ($1, $2::bigint, $3::bigint, $4, $5, $6::bigint)
       RETURNING id::int AS id`,
      [input.nameMn, input.subjectId, input.teacherId, input.schoolYear,
       input.note, input.createdBy],
    );
    const clubId = created.rows[0]!.id;
    if (input.sessions.length > 0) {
      await client.query(
        `INSERT INTO learning.club_sessions (club_id, weekday_no, period_no, valid_from)
         SELECT $1::bigint, x.weekday, x.period, $4::date
           FROM unnest($2::smallint[], $3::smallint[]) AS x(weekday, period)
         ON CONFLICT ON CONSTRAINT club_sessions_key DO NOTHING`,
        [clubId, input.sessions.map((s) => s.weekdayNo),
         input.sessions.map((s) => s.periodNo), input.validFrom],
      );
    }
    await client.query("COMMIT");
    return clubId;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Replace a club's membership with the list the teacher just ticked.
 *
 * Replace, not merge: the screen shows the whole school and the teacher's
 * answer is the whole list, so a child unticked has left. Leaving sets the row
 * inactive rather than removing it, because a child who stopped coming in
 * November was in the club in October.
 */
export async function setMembers(clubId: number, studentIds: number[]) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE learning.club_members SET is_active = false
        WHERE club_id = $1::bigint AND NOT (student_id = ANY($2::bigint[]))`,
      [clubId, studentIds],
    );
    if (studentIds.length > 0) {
      await client.query(
        `INSERT INTO learning.club_members (club_id, student_id)
         SELECT $1::bigint, x.student_id FROM unnest($2::bigint[]) AS x(student_id)
         ON CONFLICT ON CONSTRAINT club_members_pkey DO UPDATE SET is_active = true`,
        [clubId, studentIds],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export const setActive = (clubId: number, isActive: boolean) =>
  pool.query("UPDATE learning.clubs SET is_active = $2 WHERE id = $1::bigint",
    [clubId, isActive]);

/**
 * The clubs one child is in, and when they meet.
 *
 * Read by the child's own day, so it carries the same shape a lesson does:
 * a weekday, a period, a name and whoever runs it.
 */
export const forStudent = (studentId: number, onDate: string) =>
  readRows<{
    clubId: number;
    nameMn: string;
    subjectName: string | null;
    teacherName: string | null;
    periodNo: number;
    note: string | null;
  }>(
    `SELECT cl.id::int AS "clubId", cl.name_mn AS "nameMn", sub.name_mn AS "subjectName",
       u.display_name AS "teacherName", s.period_no::int AS "periodNo", cl.note
     FROM learning.club_members m
     JOIN learning.clubs cl ON cl.id = m.club_id AND cl.is_active
     JOIN learning.club_sessions s ON s.club_id = cl.id
      AND s.weekday_no = EXTRACT(ISODOW FROM $2::date)
      AND s.valid_from <= $2::date AND (s.valid_to IS NULL OR s.valid_to >= $2::date)
     LEFT JOIN core.subjects sub ON sub.id = cl.subject_id
     LEFT JOIN core.teachers t ON t.id = cl.teacher_id
     LEFT JOIN core.users u ON u.id = t.user_id
     WHERE m.student_id = $1::bigint AND m.is_active
     ORDER BY s.period_no`,
    [studentId, onDate],
  );

/** Every active child in the school, for the screen that picks members. */
export const everyStudent = () =>
  readRows<{
    studentId: number;
    displayName: string;
    studentCode: string;
    className: string | null;
    gradeNumber: number | null;
  }>(
    `SELECT s.id::int AS "studentId", s.display_name AS "displayName",
       s.student_code AS "studentCode", c.name_mn AS "className",
       g.grade_number::int AS "gradeNumber"
     FROM core.students s
     JOIN core.student_enrollments e ON e.student_id = s.id AND e.is_active
     JOIN core.classes c ON c.id = e.class_id AND c.is_active
     JOIN core.grade_levels g ON g.id = c.grade_level_id
     WHERE s.is_active
     ORDER BY g.grade_number, c.name_mn, s.display_name`,
  );

export const currentSchoolYear = () =>
  readRows<{ schoolYear: string }>(
    `SELECT school_year AS "schoolYear" FROM core.classes WHERE is_active
      GROUP BY school_year ORDER BY count(*) DESC LIMIT 1`,
  );
