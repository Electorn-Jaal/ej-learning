import { and, eq } from "drizzle-orm";
import {
  classScheduleInLearning,
  db,
  quizAttemptsInLearning,
  readRows,
} from "@workspace/db";

export type LessonRow = {
  id: number;
  lessonCode: string;
  lessonType: string;
  skillName: string;
  learningGoal: string | null;
  remember: string | null;
  workedExample: string | null;
  guidedPractice: string | null;
  independentPractice: string | null;
  studentMessage: string | null;
  estimatedMinutes: number | null;
  materialId: number | null;
  materialTitle: string | null;
  chapterTitle: string | null;
  pageFrom: number | null;
  pageTo: number | null;
};

/**
 * The lesson a student's class is scheduled for on one day.
 *
 * The class comes from the student's own enrolment, so the student id decides
 * what is returned and nothing else can be asked for.
 *
 * The book reference is a LEFT JOIN: a lesson without an aligned chapter is
 * still a lesson. It walks skill -> content_skill_maps -> content_nodes ->
 * content_source_alignments, preferring the primary mapping, which is the same
 * path the remediation walk will use once diagnostics exist.
 */
export const todayLesson = (studentId: number, onDate: string) =>
  readRows<LessonRow>(
    `SELECT dl.id::int AS id, dl.lesson_code AS "lessonCode", dl.lesson_type AS "lessonType",
       sk.name_mn AS "skillName", dl.learning_goal_mn AS "learningGoal",
       dl.remember_mn AS remember, dl.worked_example_mn AS "workedExample",
       dl.guided_practice_mn AS "guidedPractice",
       dl.independent_practice_mn AS "independentPractice",
       dl.student_message_mn AS "studentMessage",
       dl.estimated_minutes::int AS "estimatedMinutes",
       book.material_id::int AS "materialId", book.material_title AS "materialTitle",
       book.chapter_title AS "chapterTitle",
       book.page_from::int AS "pageFrom", book.page_to::int AS "pageTo"
     FROM core.student_enrollments e
     JOIN core.classes c ON c.id = e.class_id AND c.is_active
     JOIN learning.class_schedule cs ON cs.class_id = c.id AND cs.scheduled_on = $2::date
     JOIN learning.daily_lessons dl ON dl.id = cs.daily_lesson_id AND dl.status = 'APPROVED'
     JOIN content.skills sk ON sk.id = dl.core_skill_id
     LEFT JOIN LATERAL (
       SELECT sm.id AS material_id, sm.title AS material_title,
              son.title AS chapter_title, a.page_from, a.page_to
       FROM content.content_skill_maps m
       JOIN content.content_nodes cn ON cn.id = m.content_node_id AND cn.status = 'APPROVED'
       JOIN content.content_source_alignments a ON a.content_node_id = cn.id AND a.status = 'APPROVED'
       JOIN content.source_materials sm ON sm.id = a.source_material_id AND sm.status = 'APPROVED'
       LEFT JOIN content.source_outline_nodes son ON son.id = a.source_outline_node_id
       WHERE m.skill_id = sk.id AND m.status = 'APPROVED'
       ORDER BY m.is_primary DESC, a.page_from
       LIMIT 1
     ) book ON true
     WHERE e.student_id = $1::bigint AND e.is_active
     LIMIT 1`,
    [studentId, onDate],
  );

export const studentClass = (studentId: number) =>
  readRows<{ classId: number; className: string; gradeLevel: number }>(
    `SELECT c.id::int AS "classId", c.name_mn AS "className",
       g.grade_number::int AS "gradeLevel"
     FROM core.student_enrollments e
     JOIN core.classes c ON c.id = e.class_id AND c.is_active
     JOIN core.grade_levels g ON g.id = c.grade_level_id
     WHERE e.student_id = $1::bigint AND e.is_active
     ORDER BY c.class_code
     LIMIT 1`,
    [studentId],
  );

/** Empty unless this teacher is assigned to this class; admins bypass it. */
export const teacherClass = (teacherId: number, classId: number) =>
  readRows<{ classId: number; className: string; gradeLevel: number }>(
    `SELECT c.id::int AS "classId", c.name_mn AS "className",
       g.grade_number::int AS "gradeLevel"
     FROM core.class_teachers ct
     JOIN core.classes c ON c.id = ct.class_id AND c.is_active
     JOIN core.grade_levels g ON g.id = c.grade_level_id
     WHERE ct.teacher_id = $1::bigint AND ct.class_id = $2::bigint AND ct.is_active`,
    [teacherId, classId],
  );

export const anyClass = (classId: number) =>
  readRows<{ classId: number; className: string; gradeLevel: number }>(
    `SELECT c.id::int AS "classId", c.name_mn AS "className",
       g.grade_number::int AS "gradeLevel"
     FROM core.classes c
     JOIN core.grade_levels g ON g.id = c.grade_level_id
     WHERE c.id = $1::bigint AND c.is_active`,
    [classId],
  );

export const scheduleForClass = (classId: number, from: string, to: string) =>
  readRows<{
    scheduledOn: string;
    lessonId: number;
    lessonCode: string;
    lessonType: string;
    skillName: string;
    note: string | null;
  }>(
    `SELECT cs.scheduled_on::text AS "scheduledOn", dl.id::int AS "lessonId",
       dl.lesson_code AS "lessonCode", dl.lesson_type AS "lessonType",
       sk.name_mn AS "skillName", cs.note
     FROM learning.class_schedule cs
     JOIN learning.daily_lessons dl ON dl.id = cs.daily_lesson_id
     JOIN content.skills sk ON sk.id = dl.core_skill_id
     WHERE cs.class_id = $1::bigint AND cs.scheduled_on BETWEEN $2::date AND $3::date
     ORDER BY cs.scheduled_on`,
    [classId, from, to],
  );

/** The newest approved version of a material, which is what gets served. */
export const approvedVersion = (materialId: number) =>
  readRows<{ storageKey: string | null; mimeType: string | null; filename: string | null }>(
    `SELECT sv.storage_key AS "storageKey", sv.mime_type AS "mimeType",
       sv.original_filename AS filename
     FROM content.source_versions sv
     JOIN content.source_materials sm ON sm.id = sv.source_material_id
     WHERE sv.source_material_id = $1::bigint
       AND sv.status = 'APPROVED' AND sm.status = 'APPROVED'
     ORDER BY sv.version_no DESC
     LIMIT 1`,
    [materialId],
  );

export type QuizAnswer = {
  questionId: string;
  prompt: string;
  chosenOptionId: string;
  chosenText: string;
  correct: boolean;
};

export async function insertQuizAttempt(row: {
  studentId: number;
  dailyLessonId: number;
  lessonCode: string;
  answers: QuizAnswer[];
  score: number;
  maxScore: number;
}) {
  const [attempt] = await db
    .insert(quizAttemptsInLearning)
    .values(row)
    .returning({
      id: quizAttemptsInLearning.id,
      lessonCode: quizAttemptsInLearning.lessonCode,
      score: quizAttemptsInLearning.score,
      maxScore: quizAttemptsInLearning.maxScore,
      submittedAt: quizAttemptsInLearning.submittedAt,
    });
  // Drizzle's string mode returns Postgres's own rendering, which separates
  // date and time with a space. The read path emits ISO 8601, and one API
  // should not return two shapes for one column.
  return { ...attempt, submittedAt: new Date(attempt.submittedAt).toISOString() };
}

/** True when the lesson is approved and actually scheduled for that class. */
export const lessonBelongsToClass = async (lessonId: number, studentId: number) =>
  (
    await readRows<{ ok: number }>(
      `SELECT 1 AS ok
       FROM core.student_enrollments e
       JOIN learning.class_schedule cs ON cs.class_id = e.class_id
       JOIN learning.daily_lessons dl ON dl.id = cs.daily_lesson_id AND dl.status = 'APPROVED'
       WHERE e.student_id = $1::bigint AND e.is_active AND dl.id = $2::bigint
       LIMIT 1`,
      [studentId, lessonId],
    )
  ).length > 0;

export const attemptsForClass = (classId: number, limit: number) =>
  readRows<{
    id: number;
    studentName: string;
    studentCode: string;
    lessonCode: string;
    skillName: string;
    score: number;
    maxScore: number;
    submittedAt: string;
    answers: QuizAnswer[];
  }>(
    `SELECT qa.id::int AS id, st.display_name AS "studentName",
       st.student_code AS "studentCode", qa.lesson_code AS "lessonCode",
       sk.name_mn AS "skillName", qa.score::int AS score,
       qa.max_score::int AS "maxScore",
       -- node-postgres hands back a JS Date for timestamptz, which the string
       -- contract rejects. to_json gives ISO 8601; ::text gives a space in
       -- place of the T, which Date.parse is not required to accept.
       to_json(qa.submitted_at) #>> '{}' AS "submittedAt",
       qa.answers
     FROM learning.quiz_attempts qa
     JOIN core.students st ON st.id = qa.student_id
     JOIN core.student_enrollments e ON e.student_id = qa.student_id AND e.is_active
     JOIN learning.daily_lessons dl ON dl.id = qa.daily_lesson_id
     JOIN content.skills sk ON sk.id = dl.core_skill_id
     WHERE e.class_id = $1::bigint
     ORDER BY qa.submitted_at DESC
     LIMIT $2`,
    [classId, limit],
  );

export type SchedulableLesson = {
  id: number;
  lessonCode: string;
  lessonType: string;
  skillName: string;
  chapterTitle: string | null;
  pageFrom: number | null;
};

/**
 * Approved lessons for a class's grade and subject, in the order the book
 * teaches them: outline sequence first, then page.
 *
 * DISTINCT ON collapses a lesson that reaches the book through more than one
 * content node; the ORDER BY inside decides which alignment wins, so the
 * earliest one in the book is the one that positions it.
 */
export const schedulableLessons = (classId: number) =>
  readRows<SchedulableLesson>(
    `SELECT DISTINCT ON (dl.id)
       dl.id::int AS id, dl.lesson_code AS "lessonCode",
       dl.lesson_type AS "lessonType", sk.name_mn AS "skillName",
       son.title AS "chapterTitle", a.page_from::int AS "pageFrom",
       son.sequence_no, a.page_from AS ord_page
     FROM core.classes c
     JOIN content.skills sk ON sk.grade_level_id = c.grade_level_id
     JOIN learning.daily_lessons dl ON dl.core_skill_id = sk.id AND dl.status = 'APPROVED'
     LEFT JOIN content.content_skill_maps m ON m.skill_id = sk.id AND m.status = 'APPROVED'
     LEFT JOIN content.content_nodes cn ON cn.id = m.content_node_id AND cn.status = 'APPROVED'
     LEFT JOIN content.content_source_alignments a ON a.content_node_id = cn.id AND a.status = 'APPROVED'
     LEFT JOIN content.source_outline_nodes son ON son.id = a.source_outline_node_id
     WHERE c.id = $1::bigint AND sk.status = 'APPROVED'
     ORDER BY dl.id, son.sequence_no NULLS LAST, a.page_from NULLS LAST`,
    [classId],
  ).then((rows) =>
    // Re-sort in book order: DISTINCT ON forces its own ORDER BY to lead with
    // the distinct key, so the shape the caller wants is applied here.
    [...rows].sort((a, b) => {
      const left = a as SchedulableLesson & { sequence_no: number | null; ord_page: number | null };
      const right = b as SchedulableLesson & { sequence_no: number | null; ord_page: number | null };
      return (
        (left.sequence_no ?? 9e9) - (right.sequence_no ?? 9e9) ||
        (left.ord_page ?? 9e9) - (right.ord_page ?? 9e9) ||
        left.lessonCode.localeCompare(right.lessonCode)
      );
    }),
  );

export const termById = (termId: number) =>
  readRows<{ id: number; nameMn: string; startsOn: string; endsOn: string }>(
    `SELECT id::int AS id, name_mn AS "nameMn",
       starts_on::text AS "startsOn", ends_on::text AS "endsOn"
     FROM learning.terms WHERE id = $1::smallint`,
    [termId],
  );

export const scheduledDates = (classId: number, from: string, to: string) =>
  readRows<{ scheduledOn: string }>(
    `SELECT scheduled_on::text AS "scheduledOn" FROM learning.class_schedule
     WHERE class_id = $1::bigint AND scheduled_on BETWEEN $2::date AND $3::date`,
    [classId, from, to],
  );

export async function insertScheduleDays(
  rows: {
    classId: number;
    termId: number;
    dailyLessonId: number;
    scheduledOn: string;
    createdBy: number | null;
  }[],
) {
  if (rows.length === 0) return;
  await db.insert(classScheduleInLearning).values(rows);
}

export async function clearScheduleDay(classId: number, scheduledOn: string) {
  await db
    .delete(classScheduleInLearning)
    .where(
      and(
        eq(classScheduleInLearning.classId, classId),
        eq(classScheduleInLearning.scheduledOn, scheduledOn),
      ),
    );
}

/** Replaces whatever the day held; the unique key is (class, day). */
export async function setScheduleDay(row: {
  classId: number;
  termId: number;
  dailyLessonId: number;
  scheduledOn: string;
  createdBy: number | null;
}) {
  await db
    .insert(classScheduleInLearning)
    .values(row)
    .onConflictDoUpdate({
      target: [classScheduleInLearning.classId, classScheduleInLearning.scheduledOn],
      set: {
        dailyLessonId: row.dailyLessonId,
        termId: row.termId,
        createdBy: row.createdBy,
      },
    });
}

export const termCovering = (isoDate: string) =>
  readRows<{ id: number }>(
    `SELECT id::int AS id FROM learning.terms
     WHERE $1::date BETWEEN starts_on AND ends_on ORDER BY term_number LIMIT 1`,
    [isoDate],
  );
