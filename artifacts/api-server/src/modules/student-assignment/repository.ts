import { sql } from "drizzle-orm";
import { db, readRows } from "@workspace/db";

/** The class a student is enrolled in, for checking a teacher may act on them. */
export const classOfStudent = (studentId: number) =>
  readRows<{ classId: number; className: string; studentName: string }>(
    `SELECT c.id::int AS "classId", c.name_mn AS "className", s.display_name AS "studentName"
     FROM core.students s
     JOIN core.student_enrollments e ON e.student_id = s.id AND e.is_active
     JOIN core.classes c ON c.id = e.class_id AND c.is_active
     WHERE s.id = $1::bigint
     LIMIT 1`,
    [studentId],
  );

/**
 * Just enough of a lesson to name it back to the teacher who assigned it.
 *
 * The full lesson row - teaching text, book alignment, page offsets - is what
 * the child's own screens need; a confirmation only has to say which lesson
 * was set, so it asks for two columns rather than twenty.
 */
export const lessonSummary = (lessonId: number) =>
  readRows<{ lessonCode: string; skillName: string }>(
    `SELECT dl.lesson_code AS "lessonCode", sk.name_mn AS "skillName"
     FROM learning.daily_lessons dl
     JOIN content.skills sk ON sk.id = dl.core_skill_id
     WHERE dl.id = $1::bigint`,
    [lessonId],
  );

/** A teacher's own pick, replacing whatever that subject held that day. */
export async function upsertStudentAssignment(row: {
  studentId: number;
  dailyLessonId: number;
  assignedOn: string;
  assignedBy: number;
  reason: string | null;
}) {
  await db.execute(sql`
    INSERT INTO learning.student_assignments
      (student_id, daily_lesson_id, assigned_on, subject_id, source, assigned_by, reason)
    SELECT ${row.studentId}, ${row.dailyLessonId}, ${row.assignedOn}::date,
      sk.subject_id, 'TEACHER', ${row.assignedBy}, ${row.reason}
    FROM learning.daily_lessons dl
    JOIN content.skills sk ON sk.id = dl.core_skill_id
    WHERE dl.id = ${row.dailyLessonId}
    ON CONFLICT ON CONSTRAINT student_assignments_student_day_key DO UPDATE SET
      daily_lesson_id = EXCLUDED.daily_lesson_id,
      source = 'TEACHER',
      assigned_by = EXCLUDED.assigned_by,
      reason = EXCLUDED.reason`);
}
