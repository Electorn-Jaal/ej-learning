import { and, eq } from "drizzle-orm";
import {
  classScheduleInLearning,
  db,
  quizAttemptsInLearning,
  readRows,
  studentAssignmentsInLearning,
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
    studentId: number;
    studentName: string;
    studentCode: string;
    lessonCode: string;
    skillName: string;
    score: number;
    maxScore: number;
    submittedAt: string;
    answers: QuizAnswer[];
  }>(
    `SELECT qa.id::int AS id, st.id::int AS "studentId", st.display_name AS "studentName",
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
 * The classes a teacher holds, each with the subject it is taught for.
 *
 * A teacher is not one subject. This one teaches Mongolian to one class and
 * maths to another, so the subject belongs to the pairing, not the person.
 */
export const teacherClasses = (teacherId: number | null, isAdmin: boolean) =>
  isAdmin
    ? readRows<{
        classId: number;
        className: string;
        gradeLevel: number;
        subjectId: number | null;
        subjectName: string;
      }>(
        `SELECT c.id::int AS "classId", c.name_mn AS "className",
           g.grade_number::int AS "gradeLevel", NULL::int AS "subjectId",
           '' AS "subjectName"
         FROM core.classes c
         JOIN core.grade_levels g ON g.id = c.grade_level_id
         WHERE c.is_active ORDER BY g.grade_number, c.class_code`,
      )
    : readRows<{
        classId: number;
        className: string;
        gradeLevel: number;
        subjectId: number | null;
        subjectName: string;
      }>(
        `SELECT c.id::int AS "classId", c.name_mn AS "className",
           g.grade_number::int AS "gradeLevel",
           COALESCE(ct.subject_id, t.subject_id)::int AS "subjectId",
           COALESCE(sub.name_mn, '') AS "subjectName"
         FROM core.class_teachers ct
         JOIN core.classes c ON c.id = ct.class_id AND c.is_active
         JOIN core.grade_levels g ON g.id = c.grade_level_id
         JOIN core.teachers t ON t.id = ct.teacher_id
         LEFT JOIN core.subjects sub ON sub.id = COALESCE(ct.subject_id, t.subject_id)
         WHERE ct.teacher_id = $1::bigint AND ct.is_active
         ORDER BY g.grade_number, c.class_code`,
        [teacherId ?? 0],
      );

/**
 * The framework a subject is levelled on, or null where it uses none.
 *
 * English runs on CEFR; maths and Mongolian run on school grades. Showing a
 * placement level to a maths teacher is showing them a measurement that does
 * not exist for their subject.
 */
export const frameworkOfSubject = (subjectId: number | null) =>
  subjectId === null
    ? Promise.resolve([])
    : readRows<{ framework: string | null }>(
        `SELECT (SELECT p.framework FROM content.skills k
                 JOIN content.proficiency_levels p ON p.id = k.proficiency_level_id
                 WHERE k.subject_id = $1::bigint LIMIT 1) AS framework`,
        [subjectId],
      );

/** Today's scheduled lesson for one class, with the pages it covers. */
export const classLessonToday = (classId: number, onDate: string) =>
  readRows<{
    lessonCode: string;
    skillName: string;
    pageFrom: number | null;
    pageTo: number | null;
  }>(
    `SELECT dl.lesson_code AS "lessonCode", sk.name_mn AS "skillName",
       a.page_from::int AS "pageFrom", a.page_to::int AS "pageTo"
     FROM learning.class_schedule cs
     JOIN learning.daily_lessons dl ON dl.id = cs.daily_lesson_id
     JOIN content.skills sk ON sk.id = dl.core_skill_id
     LEFT JOIN LATERAL (
       SELECT al.page_from, al.page_to
       FROM content.content_skill_maps m
       JOIN content.content_source_alignments al ON al.content_node_id = m.content_node_id
       WHERE m.skill_id = sk.id AND m.status = 'APPROVED'
       ORDER BY m.is_primary DESC LIMIT 1
     ) a ON true
     WHERE cs.class_id = $1::bigint AND cs.scheduled_on = $2::date`,
    [classId, onDate],
  );

export const classCounts = (classId: number, onDate: string) =>
  readRows<{ studentCount: number; answeredToday: number }>(
    `WITH roll AS (
       SELECT DISTINCT e.student_id FROM core.student_enrollments e
       WHERE e.is_active AND e.class_id = $1::bigint
     )
     SELECT (SELECT count(*)::int FROM roll) AS "studentCount",
       (SELECT count(DISTINCT q.student_id)::int FROM learning.quiz_attempts q
        JOIN roll ON roll.student_id = q.student_id
        WHERE q.submitted_at >= $2::date) AS "answeredToday"`,
    [classId, onDate],
  );

/**
 * Students in one class worth a second look.
 *
 * `levelled` decides whether a missing placement is even a finding. For a
 * subject that never places anyone it is not, and emitting it would fill the
 * list with a row per student and bury the ones that matter.
 */
export const classAttention = (classId: number, onDate: string, levelled: boolean) =>
  readRows<{
    studentId: number;
    studentCode: string;
    studentName: string;
    level: string | null;
    reason: string;
    detail: string;
  }>(
    `WITH roll AS (
       SELECT DISTINCT e.student_id FROM core.student_enrollments e
       WHERE e.is_active AND e.class_id = $1::bigint
     ), latest_placement AS (
       SELECT DISTINCT ON (a.student_id) a.student_id, p.code
       FROM assessment.placement_attempts a
       LEFT JOIN content.proficiency_levels p ON p.id = a.proficiency_level_id
       ORDER BY a.student_id, a.id DESC
     ), latest_quiz AS (
       SELECT DISTINCT ON (q.student_id) q.student_id, q.score, q.max_score
       FROM learning.quiz_attempts q ORDER BY q.student_id, q.submitted_at DESC
     ), assigned AS (
       SELECT DISTINCT student_id FROM learning.student_assignments
       WHERE assigned_on = $2::date
       UNION
       SELECT roll.student_id FROM roll
       WHERE EXISTS (SELECT 1 FROM learning.class_schedule cs
                     WHERE cs.class_id = $1::bigint AND cs.scheduled_on = $2::date)
     )
     SELECT s.id::int AS "studentId", s.student_code AS "studentCode",
       s.display_name AS "studentName", lp.code AS level,
       CASE WHEN $3::boolean AND lp.code IS NULL THEN 'NO_PLACEMENT'
            WHEN lq.student_id IS NOT NULL AND lq.score::float / lq.max_score < 0.5 THEN 'LOW_SCORE'
            ELSE 'NOT_ANSWERED' END AS reason,
       CASE WHEN $3::boolean AND lp.code IS NULL THEN 'Түвшин тогтоогоогүй'
            WHEN lq.student_id IS NOT NULL AND lq.score::float / lq.max_score < 0.5
              THEN 'Сүүлийн шалгалт: ' || lq.score || '/' || lq.max_score
            ELSE 'Өнөөдрийн ажилдаа хариулаагүй' END AS detail
     FROM roll
     JOIN core.students s ON s.id = roll.student_id AND s.is_active
     LEFT JOIN latest_placement lp ON lp.student_id = s.id
     LEFT JOIN latest_quiz lq ON lq.student_id = s.id
     WHERE ($3::boolean AND lp.code IS NULL)
        OR (lq.student_id IS NOT NULL AND lq.score::float / lq.max_score < 0.5)
        OR (s.id IN (SELECT student_id FROM assigned)
            AND NOT EXISTS (SELECT 1 FROM learning.quiz_attempts q2
                            WHERE q2.student_id = s.id AND q2.submitted_at >= $2::date))
     ORDER BY s.student_code
     LIMIT 30`,
    [classId, onDate, levelled],
  );

/** A lesson row shaped like todayLesson's, for one lesson id. */
export const lessonById = (lessonId: number) =>
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
     FROM learning.daily_lessons dl
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
     WHERE dl.id = $1::bigint AND dl.status = 'APPROVED'`,
    [lessonId],
  );

export const assignmentForDay = (studentId: number, onDate: string) =>
  readRows<{ dailyLessonId: number; source: string; reason: string | null }>(
    `SELECT daily_lesson_id::int AS "dailyLessonId", source::text AS source, reason
     FROM learning.student_assignments
     WHERE student_id = $1::bigint AND assigned_on = $2::date`,
    [studentId, onDate],
  );

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

export async function upsertStudentAssignment(row: {
  studentId: number;
  dailyLessonId: number;
  assignedOn: string;
  assignedBy: number;
  reason: string | null;
}) {
  await db
    .insert(studentAssignmentsInLearning)
    .values({ ...row, source: "TEACHER" })
    .onConflictDoUpdate({
      target: [
        studentAssignmentsInLearning.studentId,
        studentAssignmentsInLearning.assignedOn,
      ],
      set: {
        dailyLessonId: row.dailyLessonId,
        source: "TEACHER",
        assignedBy: row.assignedBy,
        reason: row.reason,
      },
    });
}

export type QuizItemRow = {
  itemId: number;
  skillId: number;
  prompt: string;
  optionId: number;
  optionText: string;
  isCorrect: boolean;
  explanation: string | null;
};

/**
 * The item bank for a lesson, options included.
 *
 * Items hang off the skill a lesson teaches, so a lesson inherits its
 * questions rather than owning them - which is what lets the same question
 * serve the lesson and, later, a diagnostic covering that skill.
 */
export const quizItemsForLesson = (lessonId: number) =>
  readRows<QuizItemRow>(
    `SELECT i.id::int AS "itemId", i.skill_id::int AS "skillId", i.title_mn AS prompt,
       o.id::int AS "optionId", o.option_text AS "optionText",
       o.is_correct AS "isCorrect", i.rubric_mn AS explanation
     FROM learning.daily_lessons dl
     JOIN assessment.diagnostic_items i ON i.skill_id = dl.core_skill_id
       AND i.status = 'APPROVED'
     JOIN assessment.diagnostic_item_options o ON o.diagnostic_item_id = i.id
     WHERE dl.id = $1::bigint
     ORDER BY i.item_order, i.id, o.sequence_no`,
    [lessonId],
  );

/** Is this lesson one the student is actually working on today or recently? */
export const lessonReachableByStudent = async (lessonId: number, studentId: number) =>
  (
    await readRows<{ ok: number }>(
      `SELECT 1 AS ok FROM learning.daily_lessons dl
       WHERE dl.id = $2::bigint AND dl.status = 'APPROVED' AND (
         EXISTS (SELECT 1 FROM core.student_enrollments e
                 JOIN learning.class_schedule cs ON cs.class_id = e.class_id
                 WHERE e.student_id = $1::bigint AND e.is_active AND cs.daily_lesson_id = dl.id)
         OR EXISTS (SELECT 1 FROM learning.student_assignments sa
                    WHERE sa.student_id = $1::bigint AND sa.daily_lesson_id = dl.id))
       LIMIT 1`,
      [studentId, lessonId],
    )
  ).length > 0;

export const lessonHeader = (lessonId: number) =>
  readRows<{ lessonCode: string; skillName: string }>(
    `SELECT dl.lesson_code AS "lessonCode", sk.name_mn AS "skillName"
     FROM learning.daily_lessons dl
     JOIN content.skills sk ON sk.id = dl.core_skill_id
     WHERE dl.id = $1::bigint`,
    [lessonId],
  );

export type ClassSkillRow = {
  skillId: number;
  skillCode: string;
  skillName: string;
  gradeLevel: number | null;
  assessed: number;
  gap: number;
  developing: number;
  mastered: number;
  averageScore: number;
  weakest: { studentId: number; studentName: string; score: number }[];
};

/**
 * How a class stands on each skill anyone in it has been measured on.
 *
 * Ordered by the number of students in a gap, so the skill most in need of
 * reteaching is first - a teacher opening this wants to know what to do on
 * Monday, not to read an alphabetical table.
 *
 * Skills nobody has attempted are absent rather than listed as zero: an
 * unmeasured skill is not a weak one, and printing it as a row invites the
 * reading that it is.
 */
export const classSkillMastery = (classId: number) =>
  readRows<ClassSkillRow>(
    `SELECT sk.id::int AS "skillId", sk.skill_code AS "skillCode",
       sk.name_mn AS "skillName", g.grade_number::int AS "gradeLevel",
       count(*)::int AS assessed,
       count(*) FILTER (WHERE m.mastery_status = 'GAP')::int AS gap,
       count(*) FILTER (WHERE m.mastery_status = 'DEVELOPING')::int AS developing,
       count(*) FILTER (WHERE m.mastery_status = 'MASTERED')::int AS mastered,
       round(avg(m.mastery_score))::int AS "averageScore",
       COALESCE(
         jsonb_agg(
           jsonb_build_object(
             'studentId', m.student_id::int,
             'studentName', st.display_name,
             'score', round(m.mastery_score)::int)
           ORDER BY m.mastery_score
         ) FILTER (WHERE m.mastery_status <> 'MASTERED'),
         '[]'::jsonb) AS weakest
     FROM learning.student_skill_mastery m
     JOIN core.student_enrollments e ON e.student_id = m.student_id AND e.is_active
     JOIN core.students st ON st.id = m.student_id AND st.is_active
     JOIN content.skills sk ON sk.id = m.skill_id
     LEFT JOIN core.grade_levels g ON g.id = sk.grade_level_id
     WHERE e.class_id = $1::bigint AND m.mastery_status <> 'NOT_ASSESSED'
     GROUP BY sk.id, sk.skill_code, sk.name_mn, g.grade_number
     ORDER BY gap DESC, "averageScore", sk.skill_code`,
    [classId],
  );

export type AssessableSkill = {
  skillId: number;
  skillCode: string;
  skillName: string;
};

/**
 * The skills a class can be marked against.
 *
 * Scoped by the subjects this teacher actually teaches the class and by the
 * class's own grade, so the picker cannot offer a maths skill to a Mongolian
 * lesson or a grade 9 skill to a grade 4 class. A skill with no grade - the
 * levelled subjects - is offered too, since those are placed rather than
 * bound to a year.
 */
export const assessableSkills = (classId: number) =>
  readRows<AssessableSkill>(
    `SELECT DISTINCT sk.id::int AS "skillId", sk.skill_code AS "skillCode",
       sk.name_mn AS "skillName"
     FROM core.classes c
     JOIN core.class_teachers ct ON ct.class_id = c.id AND ct.is_active
     JOIN content.skills sk ON sk.subject_id = ct.subject_id
       AND sk.status = 'APPROVED'
       AND (sk.grade_level_id IS NULL OR sk.grade_level_id = c.grade_level_id)
     WHERE c.id = $1::bigint
     ORDER BY sk.skill_code`,
    [classId],
  );

export type RosterRow = {
  studentId: number;
  studentCode: string;
  studentName: string;
  masteryStatus: string | null;
  masteryScore: number | null;
  source: string | null;
  assessedBy: string | null;
  lastAssessedAt: string | null;
};

/**
 * Every student in the class with where they currently stand on one skill.
 *
 * A LEFT JOIN: a student nobody has assessed is a row with empty columns, not
 * a missing row. The teacher is filling in a register and needs to see who is
 * still blank.
 */
export const classRosterForSkill = (classId: number, skillId: number) =>
  readRows<RosterRow>(
    `SELECT st.id::int AS "studentId", st.student_code AS "studentCode",
       st.display_name AS "studentName",
       m.mastery_status AS "masteryStatus", round(m.mastery_score)::int AS "masteryScore",
       m.source, m.assessed_by AS "assessedBy",
       to_json(m.last_assessed_at) #>> '{}' AS "lastAssessedAt"
     FROM core.student_enrollments e
     JOIN core.students st ON st.id = e.student_id AND st.is_active
     LEFT JOIN learning.student_skill_mastery m
       ON m.student_id = st.id AND m.skill_id = $2::bigint
     WHERE e.class_id = $1::bigint AND e.is_active
     ORDER BY st.display_name`,
    [classId, skillId],
  );

/** Confirms a skill is one this class may be marked against. */
export const skillAssessableForClass = async (classId: number, skillId: number) =>
  (await assessableSkills(classId)).some((skill) => skill.skillId === skillId);

/** Restricts an entry to students actually enrolled in the class. */
export const enrolledStudentIds = async (classId: number) =>
  new Set(
    (
      await readRows<{ id: number }>(
        `SELECT e.student_id::int AS id FROM core.student_enrollments e
         JOIN core.students st ON st.id = e.student_id AND st.is_active
         WHERE e.class_id = $1::bigint AND e.is_active`,
        [classId],
      )
    ).map((row) => row.id),
  );

export type ItemAnalysisRow = {
  itemId: number;
  prompt: string;
  skillName: string;
  answered: number;
  correct: number;
  percentCorrect: number;
  commonWrongAnswer: string | null;
  commonWrongCount: number;
};

/**
 * Which questions a class actually got wrong.
 *
 * The per-skill view says "B1 grammar is weak", which is true and not very
 * useful on a Monday morning. This says "eight of them chose 'have went' on
 * question 4", which is a lesson.
 *
 * One row per student per question, their most recent answer. Counting every
 * attempt would let one student who retook a quiz four times outvote four
 * students who took it once, and the question being asked is how many children
 * hold the idea, not how many times a box was ticked.
 *
 * The most-chosen wrong answer comes with it. A distractor that attracts half
 * the class is usually a specific misunderstanding rather than a gap, and the
 * two want different teaching.
 */
export const itemAnalysisForClass = (classId: number) =>
  readRows<ItemAnalysisRow>(
    `WITH latest AS (
       SELECT DISTINCT ON (qa.student_id, answer->>'questionId')
         qa.student_id,
         (answer->>'questionId')::bigint AS item_id,
         (answer->>'correct')::boolean AS correct,
         NULLIF(answer->>'chosenText', '') AS chosen
       FROM learning.quiz_attempts qa
       JOIN core.student_enrollments e
         ON e.student_id = qa.student_id AND e.is_active AND e.class_id = $1::bigint
       CROSS JOIN LATERAL jsonb_array_elements(qa.answers) AS answer
       WHERE answer->>'questionId' ~ '^[0-9]+$'
       ORDER BY qa.student_id, answer->>'questionId', qa.submitted_at DESC
     ),
     wrong AS (
       SELECT item_id, chosen, count(*)::int AS n,
         row_number() OVER (PARTITION BY item_id ORDER BY count(*) DESC, chosen) AS rank
       FROM latest WHERE NOT correct AND chosen IS NOT NULL
       GROUP BY item_id, chosen
     )
     SELECT i.id::int AS "itemId", i.title_mn AS prompt,
       COALESCE(sk.name_mn, '—') AS "skillName",
       count(*)::int AS answered,
       count(*) FILTER (WHERE l.correct)::int AS correct,
       round(100.0 * count(*) FILTER (WHERE l.correct) / count(*))::int AS "percentCorrect",
       max(w.chosen) FILTER (WHERE w.rank = 1) AS "commonWrongAnswer",
       COALESCE(max(w.n) FILTER (WHERE w.rank = 1), 0)::int AS "commonWrongCount"
     FROM latest l
     JOIN assessment.diagnostic_items i ON i.id = l.item_id
     LEFT JOIN content.skills sk ON sk.id = i.skill_id
     LEFT JOIN wrong w ON w.item_id = l.item_id AND w.rank = 1
     GROUP BY i.id, i.title_mn, sk.name_mn, i.item_order
     ORDER BY "percentCorrect", i.item_order`,
    [classId],
  );
