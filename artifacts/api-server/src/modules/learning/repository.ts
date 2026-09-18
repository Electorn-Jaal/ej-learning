import { and, eq, inArray, sql } from "drizzle-orm";
import {
  classScheduleInLearning,
  db,
  quizAttemptsInLearning,
  readRows,
  studentAssignmentsInLearning,
} from "@workspace/db";

export type LessonRow = {
  id: number;
  subjectCode: string;
  subjectName: string;
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
       subj.code AS "subjectCode", subj.name_mn AS "subjectName",
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
     JOIN core.subjects subj ON subj.id = sk.subject_id
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
     ORDER BY subj.code`,
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
/**
 * The class, if this teacher may open it at all: either they teach something
 * in it, or they are the class teacher, who is answerable for it whether or
 * not any of its subjects is theirs.
 */
export const teacherClass = (teacherId: number, classId: number) =>
  readRows<{ classId: number; className: string; gradeLevel: number }>(
    `SELECT c.id::int AS "classId", c.name_mn AS "className",
       g.grade_number::int AS "gradeLevel"
     FROM core.classes c
     JOIN core.grade_levels g ON g.id = c.grade_level_id
     WHERE c.id = $2::bigint AND c.is_active
       AND (c.class_teacher_id = $1::bigint OR EXISTS (
             SELECT 1 FROM core.class_teachers ct
              WHERE ct.teacher_id = $1::bigint AND ct.class_id = c.id AND ct.is_active))`,
    [teacherId, classId],
  );

/** Whether this teacher carries the class as a whole. */
export const isClassTeacher = async (teacherId: number | null, classId: number) => {
  if (teacherId === null) return false;
  const rows = await readRows<{ n: number }>(
    `SELECT count(*)::int AS n FROM core.classes
      WHERE id = $2::bigint AND is_active AND class_teacher_id = $1::bigint`,
    [teacherId, classId],
  );
  return rows[0].n > 0;
};

export const anyClass = (classId: number) =>
  readRows<{ classId: number; className: string; gradeLevel: number }>(
    `SELECT c.id::int AS "classId", c.name_mn AS "className",
       g.grade_number::int AS "gradeLevel"
     FROM core.classes c
     JOIN core.grade_levels g ON g.id = c.grade_level_id
     WHERE c.id = $1::bigint AND c.is_active`,
    [classId],
  );

/**
 * Every teaching day in the range, whether or not it has a lesson yet.
 *
 * It used to return only the rows that existed, which meant an empty day was
 * not on the screen and so could not be filled: a teacher wanting Friday's
 * lesson moved had nowhere to click. The days are generated and the schedule
 * joined onto them, so an empty day is a row with a null lesson - something to
 * choose, rather than an absence to wonder about.
 *
 * Weekends are left out. They are not school days, and listing them invites
 * scheduling work nobody will be there to do.
 *
 * Scoped by subject because a class now studies several: editing the maths
 * timetable must not show, or offer to overwrite, Tuesday's Mongolian.
 *
 * Each row carries its own subject. A timetable row is a (day, subject) pair,
 * not a day: when several subjects are in scope one Tuesday comes back once
 * per subject taught that Tuesday. Without the subject on the row those read
 * as the same day repeated, and the screen could neither tell them apart nor
 * write to the right one.
 */
export const scheduleForClass = (
  classId: number,
  from: string,
  to: string,
  subjectIds: number[] | null,
) =>
  readRows<{
    scheduledOn: string;
    subjectId: number | null;
    subject: string | null;
    lessonId: number | null;
    lessonCode: string | null;
    lessonType: string | null;
    skillName: string | null;
    note: string | null;
  }>(
    // generate_series over an interval yields timestamps, so the cast to date
    // is what keeps this a calendar day rather than "2026-09-10 00:00:00".
    `SELECT d.day::date::text AS "scheduledOn",
       cs.subject_id::int AS "subjectId", sub.name_mn AS subject,
       dl.id::int AS "lessonId",
       dl.lesson_code AS "lessonCode", dl.lesson_type AS "lessonType",
       sk.name_mn AS "skillName", cs.note
     FROM generate_series($2::date, $3::date, interval '1 day') AS d(day)
     LEFT JOIN learning.class_schedule cs
       ON cs.class_id = $1::bigint AND cs.scheduled_on = d.day::date
      AND ($4::bigint[] IS NULL OR cs.subject_id = ANY($4::bigint[]))
     LEFT JOIN core.subjects sub ON sub.id = cs.subject_id
     LEFT JOIN learning.daily_lessons dl ON dl.id = cs.daily_lesson_id
     LEFT JOIN content.skills sk ON sk.id = dl.core_skill_id
     WHERE extract(isodow FROM d.day) <= 5
     ORDER BY d.day, sub.name_mn NULLS FIRST`,
    [classId, from, to, subjectIds],
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

/**
 * `subjectIds` null means every subject, which is what an admin and a class
 * teacher get. A subject teacher gets the subjects they hold in the class, so
 * the physics teacher's marking does not appear in the maths teacher's screen.
 *
 * `from` and `to` are inclusive calendar days in Asia/Ulaanbaatar, either of
 * them null for no bound. The comparison converts the stored instant to that
 * timezone first: an answer given at nine in the evening is that day's work to
 * the teacher who reads it, whatever UTC calls it.
 */
export const attemptsForClass = (
  classId: number,
  limit: number,
  subjectIds: number[] | null,
  from: string | null,
  to: string | null,
) =>
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
       AND ($3::bigint[] IS NULL OR sk.subject_id = ANY($3::bigint[]))
       AND ($4::date IS NULL
            OR (qa.submitted_at AT TIME ZONE 'Asia/Ulaanbaatar')::date >= $4::date)
       AND ($5::date IS NULL
            OR (qa.submitted_at AT TIME ZONE 'Asia/Ulaanbaatar')::date <= $5::date)
     ORDER BY qa.submitted_at DESC
     LIMIT $2`,
    [classId, limit, subjectIds, from, to],
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
export const schedulableLessons = (classId: number, subjectIds: number[] | null) =>
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
       AND ($2::bigint[] IS NULL OR sk.subject_id = ANY($2::bigint[]))
     ORDER BY dl.id, son.sequence_no NULLS LAST, a.page_from NULLS LAST`,
    [classId, subjectIds],
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

/**
 * Books several days at once.
 *
 * The subject is read from each lesson rather than passed in. Callers know
 * which lesson they are scheduling and would have to look the subject up the
 * same way; doing it here means no write path can forget, and the column
 * cannot disagree with the lesson it describes.
 */
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
  for (const row of rows) {
    await db.execute(sql`
      INSERT INTO learning.class_schedule
        (class_id, term_id, daily_lesson_id, scheduled_on, subject_id, created_by)
      SELECT ${row.classId}, ${row.termId}, ${row.dailyLessonId}, ${row.scheduledOn}::date,
        sk.subject_id, ${row.createdBy}
      FROM learning.daily_lessons dl
      JOIN content.skills sk ON sk.id = dl.core_skill_id
      WHERE dl.id = ${row.dailyLessonId}`);
  }
}

/**
 * Empties one day for the given subjects.
 *
 * It used to delete the day outright. setScheduleDay's own comment says
 * putting maths on Tuesday must not remove Tuesday's Mongolian - clearing it
 * did exactly that, which nothing noticed while a class ran one subject per
 * teacher. Null still clears every subject, which is what an admin or a class
 * teacher asking for the whole day means.
 */
export async function clearScheduleDay(
  classId: number,
  scheduledOn: string,
  subjectIds: number[] | null,
) {
  // Built rather than templated: an array interpolated into a sql`` fragment
  // is read as SQL chunks, not as one parameter, and the delete failed.
  const conditions = [
    eq(classScheduleInLearning.classId, classId),
    eq(classScheduleInLearning.scheduledOn, scheduledOn),
  ];
  if (subjectIds !== null) {
    conditions.push(inArray(classScheduleInLearning.subjectId, subjectIds));
  }
  await db.delete(classScheduleInLearning).where(and(...conditions));
}

/**
 * Replaces what that day held for that lesson's subject.
 *
 * The key is (class, subject, day): putting maths on Tuesday must not remove
 * Tuesday's Mongolian.
 */
export async function setScheduleDay(row: {
  classId: number;
  termId: number;
  dailyLessonId: number;
  scheduledOn: string;
  createdBy: number | null;
}) {
  await db.execute(sql`
    INSERT INTO learning.class_schedule
      (class_id, term_id, daily_lesson_id, scheduled_on, subject_id, created_by)
    SELECT ${row.classId}, ${row.termId}, ${row.dailyLessonId}, ${row.scheduledOn}::date,
      sk.subject_id, ${row.createdBy}
    FROM learning.daily_lessons dl
    JOIN content.skills sk ON sk.id = dl.core_skill_id
    WHERE dl.id = ${row.dailyLessonId}
    ON CONFLICT ON CONSTRAINT class_schedule_class_day_key DO UPDATE SET
      daily_lesson_id = EXCLUDED.daily_lesson_id,
      term_id = EXCLUDED.term_id,
      created_by = EXCLUDED.created_by`);
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
        // One card per subject this teacher may look at in the class: the
        // subjects they take, or every subject the class runs where they are
        // the class teacher. A class teacher used to get a single blank card
        // showing whichever lesson came first.
        `SELECT c.id::int AS "classId", c.name_mn AS "className",
           g.grade_number::int AS "gradeLevel",
           v.subject_id::int AS "subjectId",
           COALESCE(sub.name_mn, '') AS "subjectName"
         FROM core.classes c
         JOIN core.grade_levels g ON g.id = c.grade_level_id
         JOIN LATERAL (
           SELECT DISTINCT ct.subject_id
             FROM core.class_teachers ct
            WHERE ct.class_id = c.id AND ct.is_active AND ct.subject_id IS NOT NULL
              AND (c.class_teacher_id = $1::bigint OR ct.teacher_id = $1::bigint)
         ) v ON true
         LEFT JOIN core.subjects sub ON sub.id = v.subject_id
         WHERE c.is_active
         ORDER BY g.grade_number, c.class_code, sub.name_mn`,
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

/**
 * Today's scheduled lesson for one class in one subject, with its pages.
 *
 * Scoped by subject because a class now has a lesson in each of them, and a
 * maths teacher opening the dashboard must not be shown the Mongolian lesson
 * because it happened to sort first.
 *
 * A null subject means the viewer is not tied to one - an admin, or a teacher
 * of record. They see whichever subject sorts first rather than nothing, since
 * an empty row would read as "no lesson today" when there are several.
 */
export const classLessonToday = (
  classId: number,
  onDate: string,
  subjectId: number | null,
) =>
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
     JOIN core.subjects subj ON subj.id = sk.subject_id
     LEFT JOIN LATERAL (
       SELECT al.page_from, al.page_to
       FROM content.content_skill_maps m
       JOIN content.content_source_alignments al ON al.content_node_id = m.content_node_id
       WHERE m.skill_id = sk.id AND m.status = 'APPROVED'
       ORDER BY m.is_primary DESC LIMIT 1
     ) a ON true
     WHERE cs.class_id = $1::bigint AND cs.scheduled_on = $2::date
       AND ($3::bigint IS NULL OR cs.subject_id = $3::bigint)
     ORDER BY subj.code`,
    [classId, onDate, subjectId],
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
       subj.code AS "subjectCode", subj.name_mn AS "subjectName",
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
     JOIN core.subjects subj ON subj.id = sk.subject_id
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

/** Everything this student personally owes today, one row per subject. */
export const assignmentForDay = (studentId: number, onDate: string) =>
  readRows<{
    dailyLessonId: number;
    subjectCode: string;
    source: string;
    reason: string | null;
  }>(
    `SELECT sa.daily_lesson_id::int AS "dailyLessonId", subj.code AS "subjectCode",
       sa.source::text AS source, sa.reason
     FROM learning.student_assignments sa
     JOIN core.subjects subj ON subj.id = sa.subject_id
     WHERE sa.student_id = $1::bigint AND sa.assigned_on = $2::date
     ORDER BY subj.code`,
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
export const classSkillMastery = (classId: number, subjectIds: number[] | null) =>
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
       AND ($2::bigint[] IS NULL OR sk.subject_id = ANY($2::bigint[]))
     GROUP BY sk.id, sk.skill_code, sk.name_mn, g.grade_number
     ORDER BY gap DESC, "averageScore", sk.skill_code`,
    [classId, subjectIds],
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
export const assessableSkills = (classId: number, subjectIds: number[] | null) =>
  readRows<AssessableSkill>(
    `SELECT DISTINCT sk.id::int AS "skillId", sk.skill_code AS "skillCode",
       sk.name_mn AS "skillName"
     FROM core.classes c
     JOIN core.class_teachers ct ON ct.class_id = c.id AND ct.is_active
     JOIN content.skills sk ON sk.subject_id = ct.subject_id
       AND sk.status = 'APPROVED'
       AND (sk.grade_level_id IS NULL OR sk.grade_level_id = c.grade_level_id)
     WHERE c.id = $1::bigint
       AND ($2::bigint[] IS NULL OR sk.subject_id = ANY($2::bigint[]))
     ORDER BY sk.skill_code`,
    [classId, subjectIds],
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
export const skillAssessableForClass = async (
  classId: number,
  skillId: number,
  subjectIds: number[] | null,
) => (await assessableSkills(classId, subjectIds)).some((skill) => skill.skillId === skillId);

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

export type TeacherClassRow = {
  id: string;
  name: string;
  gradeLevel: number;
  subjectId: number | null;
  canEdit: boolean;
  subject: string;
  studentCount: number;
  currentTopic: string;
  needsReview: number;
};

/**
 * The classes a teacher may actually open, naming the subjects they teach in
 * each. One row per class.
 *
 * The listing once returned every active class in the school, so the picker
 * offered rows that answered 403 the moment they were chosen. It is scoped by
 * class_teachers now - and one row per class_teachers row was fine only while
 * a teacher could hold a single subject in a class. Once they could hold two,
 * 9А came back twice carrying the same id, and everything downstream keys on
 * that id: the select rendered its label twice ("9А9А"), and picking either
 * row asked for the same class anyway.
 *
 * So the subjects are aggregated into the row instead. A teacher who takes
 * maths and physics in 9А sees one 9А, labelled with both, and opening it
 * shows the work they are responsible for there - which is both subjects.
 * Splitting the screens per subject is a product decision, not this fix; it
 * needs the subject threaded through the schedule, the register and the
 * results, and somebody to say whether that is what a teacher wants.
 */
/**
 * The entries in a teacher's class picker: one per subject they hold in a
 * class, plus one standing for all of them where that means anything.
 *
 * The listing once returned every active class in the school, so the picker
 * offered rows that answered 403 the moment they were chosen. Then it returned
 * one row per class_teachers row, which was fine only while a teacher could
 * hold a single subject in a class - once they could hold two, 9А came back
 * twice carrying the same id, and everything downstream keys on that id.
 *
 * So an entry is now the pair (id, subjectId), and subjectId travels with the
 * choice to the schedule, the register and the results. A subject-less
 * class_teachers row - a primary-grade teacher, or a class teacher answerable
 * for the whole class - produces the "all subjects" entry on its own.
 */
/**
 * The entries in a teacher's class picker: one per subject they may look at in
 * a class, plus one standing for all of them where there is more than one.
 *
 * What a teacher may look at is not the same as what they take. A subject
 * teacher gets their own subjects. A class teacher gets every subject the
 * class runs, because that is what being answerable for a class means - the
 * English lessons of a primary class belong to somebody else and the class
 * teacher still has to see them. What may be *changed* is narrower, and lives
 * in editableSubjects.
 *
 * An entry is the pair (id, subjectId): the id alone repeats, which is what
 * once made the register render "9А9А" and the two entries indistinguishable.
 */
export const teacherClassOptions = (teacherId: number | null, isAdmin: boolean) =>
  readRows<TeacherClassRow>(
    `WITH visible AS (
       SELECT c.id AS class_id, ct.subject_id
         FROM core.classes c
         JOIN core.class_teachers ct
           ON ct.class_id = c.id AND ct.is_active AND ct.subject_id IS NOT NULL
        WHERE c.is_active
          AND ($2::boolean OR c.class_teacher_id = $1::bigint OR ct.teacher_id = $1::bigint)
        GROUP BY c.id, ct.subject_id
     ),
     entries AS (
       SELECT class_id, subject_id FROM visible
       UNION ALL
       -- One entry standing for all of them, worth offering only when there
       -- is more than one to stand for.
       SELECT class_id, NULL::bigint
         FROM visible
        GROUP BY class_id
       HAVING count(DISTINCT subject_id) > 1
     )
     SELECT c.id::text AS id, c.name_mn AS name,
       g.grade_number::int AS "gradeLevel",
       e.subject_id::int AS "subjectId",
       -- Seeing a subject and being able to change it are different things:
       -- a class teacher sees the English their colleague takes.
       ($2::boolean OR EXISTS (
          SELECT 1 FROM core.class_teachers mine
           WHERE mine.class_id = c.id AND mine.teacher_id = $1::bigint
             AND mine.is_active AND mine.subject_id IS NOT NULL
             AND (e.subject_id IS NULL OR mine.subject_id = e.subject_id)
        )) AS "canEdit",
       COALESCE(sub.name_mn, 'Бүх хичээл') AS subject,
       (SELECT count(DISTINCT en.student_id)::int
        FROM core.student_enrollments en
        JOIN core.students s ON s.id = en.student_id AND s.is_active
        WHERE en.class_id = c.id AND en.is_active) AS "studentCount",
       COALESCE(
         (SELECT sk.name_mn FROM learning.class_schedule cs
          JOIN learning.daily_lessons dl ON dl.id = cs.daily_lesson_id
          JOIN content.skills sk ON sk.id = dl.core_skill_id
          WHERE cs.class_id = c.id
            AND cs.scheduled_on = (now() AT TIME ZONE 'Asia/Ulaanbaatar')::date
            AND CASE
                  WHEN e.subject_id IS NOT NULL THEN cs.subject_id = e.subject_id
                  ELSE EXISTS (
                    SELECT 1 FROM visible v
                     WHERE v.class_id = c.id AND v.subject_id = cs.subject_id)
                END
          LIMIT 1),
         'Өнөөдөр хуваарьт хичээл алга') AS "currentTopic",
       0 AS "needsReview"
     FROM entries e
     JOIN core.classes c ON c.id = e.class_id AND c.is_active
     JOIN core.grade_levels g ON g.id = c.grade_level_id
     LEFT JOIN core.subjects sub ON sub.id = e.subject_id
     ORDER BY g.grade_number, c.class_code, (e.subject_id IS NOT NULL), sub.name_mn`,
    [teacherId ?? 0, isAdmin],
  );

/**
 * The subjects this teacher actually takes in this class.
 *
 * Only these may be timetabled and marked, whoever the teacher is: a primary
 * class teacher takes maths and Mongolian and sees the English, but the
 * English marks are not theirs to enter. Being the class teacher widens what
 * is shown, never what may be written, so it is deliberately not consulted
 * here - see isClassTeacher.
 *
 * A row with no subject grants nothing. It once meant "covers everything",
 * which turned out to describe nobody: the teacher it was meant for takes two
 * subjects of three.
 */
export const subjectsTaughtBy = async (teacherId: number | null, classId: number) => {
  if (teacherId === null) return [] as number[];
  const rows = await readRows<{ subjectId: number | null }>(
    `SELECT ct.subject_id::int AS "subjectId" FROM core.class_teachers ct
     WHERE ct.teacher_id = $1::bigint AND ct.class_id = $2::bigint
       AND ct.is_active AND ct.subject_id IS NOT NULL`,
    [teacherId, classId],
  );
  return rows.map((row) => row.subjectId as number);
};

/** Every subject a class actually runs, whoever teaches it. */
export const subjectsOfClass = (classId: number) =>
  readRows<{ subjectId: number }>(
    `SELECT DISTINCT ct.subject_id::int AS "subjectId"
       FROM core.class_teachers ct
      WHERE ct.class_id = $1::bigint AND ct.is_active AND ct.subject_id IS NOT NULL`,
    [classId],
  ).then((rows) => rows.map((row) => row.subjectId));
