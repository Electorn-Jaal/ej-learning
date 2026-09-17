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
  pageOffset: number;
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
       book.page_from::int AS "pageFrom", book.page_to::int AS "pageTo",
       COALESCE(book.page_offset, 0)::int AS "pageOffset"
     FROM core.student_enrollments e
     JOIN core.classes c ON c.id = e.class_id AND c.is_active
     JOIN learning.class_schedule cs ON cs.class_id = c.id AND cs.scheduled_on = $2::date
     JOIN learning.daily_lessons dl ON dl.id = cs.daily_lesson_id AND dl.status = 'APPROVED'
     JOIN content.skills sk ON sk.id = dl.core_skill_id
     LEFT JOIN LATERAL (
       SELECT sm.id AS material_id, sm.title AS material_title,
              son.title AS chapter_title, a.page_from, a.page_to,
              (SELECT sv.page_offset FROM content.source_versions sv
               WHERE sv.source_material_id = sm.id AND sv.status = 'APPROVED'
               ORDER BY sv.version_no DESC LIMIT 1) AS page_offset
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

/**
 * Dashboard aggregates for the classes a teacher is responsible for.
 *
 * One query per question rather than one joined query: these count different
 * things over different tables, and forcing them together would produce a
 * cartesian product that has to be counted back out with DISTINCT.
 */
export const teacherClassIds = (teacherId: number | null, isAdmin: boolean) =>
  isAdmin
    ? readRows<{ id: number; subjectId: number | null }>(
        `SELECT c.id::int AS id, NULL::int AS "subjectId"
         FROM core.classes c WHERE c.is_active`,
      )
    : readRows<{ id: number; subjectId: number | null }>(
        `SELECT c.id::int AS id,
           COALESCE(ct.subject_id, t.subject_id)::int AS "subjectId"
         FROM core.class_teachers ct
         JOIN core.classes c ON c.id = ct.class_id AND c.is_active
         JOIN core.teachers t ON t.id = ct.teacher_id
         WHERE ct.teacher_id = $1::bigint AND ct.is_active`,
        [teacherId ?? 0],
      );

/**
 * The framework a subject's skills are levelled on, or null when it uses none.
 *
 * English runs on CEFR; Mongolian runs on school grades and skill mastery. A
 * dashboard that shows CEFR bands to a Mongolian teacher is showing them a
 * measurement that does not exist for their subject.
 */
export const subjectFramework = (subjectId: number | null) =>
  subjectId === null
    ? Promise.resolve([])
    : readRows<{ subjectName: string; framework: string | null }>(
        `SELECT s.name_mn AS "subjectName",
           (SELECT p.framework FROM content.skills k
            JOIN content.proficiency_levels p ON p.id = k.proficiency_level_id
            WHERE k.subject_id = s.id LIMIT 1) AS framework
         FROM core.subjects s WHERE s.id = $1::bigint`,
        [subjectId],
      );

export const dashboardCounts = (classIds: number[], onDate: string) =>
  readRows<{
    studentCount: number;
    placedCount: number;
    assignedToday: number;
    answeredToday: number;
  }>(
    `WITH roll AS (
       SELECT DISTINCT e.student_id
       FROM core.student_enrollments e
       WHERE e.is_active AND e.class_id = ANY($1::bigint[])
     )
     SELECT
       (SELECT count(*)::int FROM roll) AS "studentCount",
       (SELECT count(DISTINCT a.student_id)::int FROM assessment.placement_attempts a
          JOIN roll ON roll.student_id = a.student_id
          WHERE a.proficiency_level_id IS NOT NULL) AS "placedCount",
       (SELECT count(*)::int FROM learning.student_assignments sa
          JOIN roll ON roll.student_id = sa.student_id
          WHERE sa.assigned_on = $2::date) AS "assignedToday",
       (SELECT count(DISTINCT qa.student_id)::int FROM learning.quiz_attempts qa
          JOIN roll ON roll.student_id = qa.student_id
          WHERE qa.submitted_at >= $2::date) AS "answeredToday"`,
    [classIds, onDate],
  );

export const levelBands = (classIds: number[]) =>
  readRows<{ code: string; nameMn: string; studentCount: number }>(
    `SELECT p.code, p.name_mn AS "nameMn", count(DISTINCT a.student_id)::int AS "studentCount"
     FROM content.proficiency_levels p
     LEFT JOIN assessment.placement_attempts a ON a.proficiency_level_id = p.id
       AND a.student_id IN (
         SELECT DISTINCT e.student_id FROM core.student_enrollments e
         WHERE e.is_active AND e.class_id = ANY($1::bigint[]))
     WHERE p.framework = 'CEFR'
     GROUP BY p.code, p.name_mn, p.sequence
     ORDER BY p.sequence`,
    [classIds],
  );

/**
 * Students worth a second look, newest problem first.
 *
 * Three reasons, in the order a teacher would act on them: never placed, so
 * the system has nothing to go on; scored below half on their last check; or
 * assigned work today and has not answered.
 */
export const attentionRows = (classIds: number[], onDate: string) =>
  readRows<{
    studentId: number;
    studentCode: string;
    studentName: string;
    className: string;
    level: string | null;
    reason: string;
    detail: string;
  }>(
    `WITH roll AS (
       SELECT DISTINCT ON (e.student_id) e.student_id, c.name_mn AS class_name
       FROM core.student_enrollments e
       JOIN core.classes c ON c.id = e.class_id
       WHERE e.is_active AND e.class_id = ANY($1::bigint[])
     ), latest_placement AS (
       SELECT DISTINCT ON (a.student_id) a.student_id, p.code
       FROM assessment.placement_attempts a
       LEFT JOIN content.proficiency_levels p ON p.id = a.proficiency_level_id
       ORDER BY a.student_id, a.id DESC
     ), latest_quiz AS (
       SELECT DISTINCT ON (q.student_id) q.student_id, q.score, q.max_score, q.submitted_at
       FROM learning.quiz_attempts q ORDER BY q.student_id, q.submitted_at DESC
     )
     SELECT s.id::int AS "studentId", s.student_code AS "studentCode",
       s.display_name AS "studentName", roll.class_name AS "className",
       lp.code AS level,
       CASE WHEN lp.code IS NULL THEN 'NO_PLACEMENT'
            WHEN lq.student_id IS NOT NULL AND lq.score::float / lq.max_score < 0.5 THEN 'LOW_SCORE'
            ELSE 'NOT_ANSWERED' END AS reason,
       CASE WHEN lp.code IS NULL THEN 'Түвшин тогтоогоогүй'
            WHEN lq.student_id IS NOT NULL AND lq.score::float / lq.max_score < 0.5
              THEN 'Сүүлийн шалгалт: ' || lq.score || '/' || lq.max_score
            ELSE 'Өнөөдрийн даалгаварт хариулаагүй' END AS detail
     FROM roll
     JOIN core.students s ON s.id = roll.student_id AND s.is_active
     LEFT JOIN latest_placement lp ON lp.student_id = s.id
     LEFT JOIN latest_quiz lq ON lq.student_id = s.id
     WHERE lp.code IS NULL
        OR (lq.student_id IS NOT NULL AND lq.score::float / lq.max_score < 0.5)
        OR (EXISTS (SELECT 1 FROM learning.student_assignments sa
                    WHERE sa.student_id = s.id AND sa.assigned_on = $2::date)
            AND NOT EXISTS (SELECT 1 FROM learning.quiz_attempts q2
                            WHERE q2.student_id = s.id AND q2.submitted_at >= $2::date))
     ORDER BY (lp.code IS NULL) DESC, s.student_code
     LIMIT 50`,
    [classIds, onDate],
  );
