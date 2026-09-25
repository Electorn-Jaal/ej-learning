import { pool, readRows, type PoolClient } from "@workspace/db";

export const classes = () => readRows<{
  classId: number; name: string; gradeLevel: number; schoolYear: string;
  classTeacherId: number | null; classTeacherName: string | null; students: number;
}>(
  `SELECT c.id::int AS "classId", c.name_mn AS name, gl.grade_number::int AS "gradeLevel",
     c.school_year AS "schoolYear", c.class_teacher_id::int AS "classTeacherId",
     u.display_name AS "classTeacherName",
     (SELECT count(*)::int FROM core.student_enrollments e
       WHERE e.class_id = c.id AND e.is_active) AS students
   FROM core.classes c
   JOIN core.grade_levels gl ON gl.id = c.grade_level_id
   LEFT JOIN core.teachers t ON t.id = c.class_teacher_id
   LEFT JOIN core.users u ON u.id = t.user_id
   WHERE c.is_active
   ORDER BY c.school_year DESC, gl.grade_number, c.name_mn`,
);

export const teachers = () => readRows<{ teacherId: number; name: string }>(
  `SELECT t.id::int AS "teacherId", u.display_name AS name
   FROM core.teachers t JOIN core.users u ON u.id = t.user_id
   WHERE t.is_active AND u.is_active ORDER BY u.display_name`,
);

export const teacher = (teacherId: number) => readRows<{ id: number }>(
  `SELECT t.id::int AS id FROM core.teachers t JOIN core.users u ON u.id = t.user_id
   WHERE t.id = $1 AND t.is_active AND u.is_active`, [teacherId]);

export const activeClass = (classId: number) => readRows<{
  id: number; name: string; schoolYear: string; classTeacherId: number | null;
}>(
  `SELECT id::int AS id, name_mn AS name, school_year AS "schoolYear",
     class_teacher_id::int AS "classTeacherId"
   FROM core.classes WHERE id = $1 AND is_active`, [classId]);

export const searchStudents = (q: string) => readRows<{
  studentId: number; studentCode: string; name: string; classId: number | null; className: string | null;
}>(
  `SELECT s.id::int AS "studentId", s.student_code AS "studentCode", s.display_name AS name,
     cur.class_id::int AS "classId", cur.name_mn AS "className"
   FROM core.students s
   LEFT JOIN LATERAL (
     SELECT e.class_id, c.name_mn FROM core.student_enrollments e
     JOIN core.classes c ON c.id = e.class_id
     WHERE e.student_id = s.id AND e.is_active ORDER BY e.enrolled_at DESC LIMIT 1
   ) cur ON true
   WHERE s.is_active AND (s.display_name ILIKE '%' || $1 || '%' OR s.student_code ILIKE '%' || $1 || '%')
   ORDER BY s.display_name LIMIT 30`, [q]);

export const activeStudent = (studentId: number) => readRows<{ id: number }>(
  `SELECT id::int AS id FROM core.students WHERE id = $1 AND is_active`, [studentId]);

const changeFields = `ch.id::int AS id, ch.kind, ch.student_id::int AS "studentId",
  s.display_name AS "studentName", fc.name_mn || ' (' || fc.school_year || ')' AS "fromClass",
  tc.name_mn || ' (' || tc.school_year || ')' AS "toClass",
  to_char(ch.effective_on, 'YYYY-MM-DD') AS "effectiveOn", ch.reason,
  u.display_name AS "changedBy", to_json(ch.changed_at)#>>'{}' AS "changedAt"`;
const changeJoins = `JOIN core.students s ON s.id = ch.student_id
  LEFT JOIN core.classes fc ON fc.id = ch.from_class_id
  LEFT JOIN core.classes tc ON tc.id = ch.to_class_id
  LEFT JOIN core.users u ON u.id = ch.changed_by`;
export type ChangeRow = {
  id: number; kind: "TRANSFER" | "PROMOTE" | "REPEAT" | "GRADUATE"; studentId: number; studentName: string;
  fromClass: string | null; toClass: string | null; effectiveOn: string; reason: string;
  changedBy: string | null; changedAt: string;
};

export const history = (studentId: number | null) => readRows<ChangeRow>(
  `SELECT ${changeFields} FROM core.enrollment_changes ch ${changeJoins}
   WHERE ($1::bigint IS NULL OR ch.student_id = $1::bigint)
   ORDER BY ch.changed_at DESC, ch.id DESC LIMIT 100`, [studentId]);

export const change = (id: number) => readRows<ChangeRow>(
  `SELECT ${changeFields} FROM core.enrollment_changes ch ${changeJoins} WHERE ch.id = $1`, [id]);

/**
 * Ends every active enrolment the child has, opens the new one, and writes the
 * history row - all or nothing. A child re-entering a class they once left
 * reuses that row (the key is class+student), with a fresh start date.
 */
export async function moveStudent(client: PoolClient, input: {
  studentId: number; toClassId: number | null; kind: ChangeRow["kind"];
  effectiveOn: string; reason: string; userId: number; fromClassId: number | null;
}) {
  await client.query(
    `UPDATE core.student_enrollments SET is_active = false, left_on = $2::date
     WHERE student_id = $1 AND is_active`, [input.studentId, input.effectiveOn]);
  if (input.toClassId !== null) {
    await client.query(
      `INSERT INTO core.student_enrollments (student_id, class_id, enrolled_at, is_active, left_on)
       VALUES ($1, $2, $3::date, true, NULL)
       ON CONFLICT (class_id, student_id) DO UPDATE
         SET is_active = true, enrolled_at = EXCLUDED.enrolled_at, left_on = NULL`,
      [input.studentId, input.toClassId, input.effectiveOn]);
  }
  const { rows: [row] } = await client.query<{ id: number }>(
    `INSERT INTO core.enrollment_changes
       (student_id, kind, from_class_id, to_class_id, effective_on, reason, changed_by)
     VALUES ($1, $2, $3, $4, $5::date, $6, $7) RETURNING id::int AS id`,
    [input.studentId, input.kind, input.fromClassId, input.toClassId, input.effectiveOn, input.reason, input.userId]);
  return row!.id;
}

export const currentClassOf = (client: PoolClient, studentId: number) =>
  client.query<{ classId: number; schoolYear: string }>(
    `SELECT e.class_id::int AS "classId", c.school_year AS "schoolYear"
     FROM core.student_enrollments e JOIN core.classes c ON c.id = e.class_id
     WHERE e.student_id = $1 AND e.is_active ORDER BY e.enrolled_at DESC LIMIT 1 FOR UPDATE OF e`,
    [studentId]).then((r) => r.rows[0] ?? null);

export async function setClassTeacher(input: {
  classId: number; teacherId: number | null; effectiveOn: string; userId: number;
}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: [before] } = await client.query<{ teacherId: number | null }>(
      `SELECT class_teacher_id::int AS "teacherId" FROM core.classes WHERE id = $1 FOR UPDATE`, [input.classId]);
    if ((before?.teacherId ?? null) !== input.teacherId) {
      await client.query(`UPDATE core.classes SET class_teacher_id = $2 WHERE id = $1`, [input.classId, input.teacherId]);
      await client.query(
        `INSERT INTO core.class_teacher_changes (class_id, from_teacher_id, to_teacher_id, effective_on, changed_by)
         VALUES ($1, $2, $3, $4::date, $5)`,
        [input.classId, before?.teacherId ?? null, input.teacherId, input.effectiveOn, input.userId]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** Every active child in a school year's active classes, with the class they are in. */
export const yearRoster = (schoolYear: string) => readRows<{
  studentId: number; name: string; classId: number; className: string; gradeLevel: number;
}>(
  `SELECT s.id::int AS "studentId", s.display_name AS name, c.id::int AS "classId",
     c.name_mn AS "className", gl.grade_number::int AS "gradeLevel"
   FROM core.student_enrollments e
   JOIN core.students s ON s.id = e.student_id AND s.is_active
   JOIN core.classes c ON c.id = e.class_id AND c.is_active
   JOIN core.grade_levels gl ON gl.id = c.grade_level_id
   WHERE e.is_active AND c.school_year = $1
   ORDER BY gl.grade_number, c.name_mn, s.display_name`, [schoolYear]);

export const classesInYear = (schoolYear: string) => readRows<{ id: number; name: string }>(
  `SELECT id::int AS id, name_mn AS name FROM core.classes WHERE school_year = $1 AND is_active`, [schoolYear]);

export { pool };
