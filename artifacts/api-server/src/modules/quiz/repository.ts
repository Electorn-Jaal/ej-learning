import { db, pool, quizAttemptsInLearning, readRows } from "@workspace/db";

export type QuizAnswer = {
  questionId: string;
  prompt: string;
  chosenOptionId: string;
  chosenText: string;
  correct: boolean;
};

export type QuizItemRow = {
  itemId: number;
  skillId: number;
  prompt: string;
  optionId: number;
  optionText: string;
  isCorrect: boolean;
  explanation: string | null;
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
  return { ...attempt, submittedAt: new Date(attempt.submittedAt).toISOString() };
}

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
    kind: string;
    answers: QuizAnswer[];
  }>(
    `SELECT qa.id::int AS id, st.id::int AS "studentId", st.display_name AS "studentName",
       st.student_code AS "studentCode", qa.lesson_code AS "lessonCode",
       sk.name_mn AS "skillName", dl.assessment_kind::text AS kind,
       qa.score::int AS score, qa.max_score::int AS "maxScore",
       to_json(qa.submitted_at) #>> '{}' AS "submittedAt", qa.answers
     FROM learning.quiz_attempts qa
     JOIN core.students st ON st.id = qa.student_id
     JOIN core.student_enrollments e ON e.student_id = qa.student_id AND e.is_active
     JOIN learning.daily_lessons dl ON dl.id = qa.daily_lesson_id
     JOIN content.skills sk ON sk.id = dl.core_skill_id
     WHERE e.class_id = $1::bigint
       AND ($3::bigint[] IS NULL OR sk.subject_id = ANY($3::bigint[]))
       AND ($4::date IS NULL OR (qa.submitted_at AT TIME ZONE 'Asia/Ulaanbaatar')::date >= $4::date)
       AND ($5::date IS NULL OR (qa.submitted_at AT TIME ZONE 'Asia/Ulaanbaatar')::date <= $5::date)
     ORDER BY qa.submitted_at DESC
     LIMIT $2`,
    [classId, limit, subjectIds, from, to],
  );

export const quizItemsForLesson = (lessonId: number) =>
  readRows<QuizItemRow>(
    `SELECT i.id::int AS "itemId", i.skill_id::int AS "skillId", i.title_mn AS prompt,
       o.id::int AS "optionId", o.option_text AS "optionText",
       o.is_correct AS "isCorrect", i.rubric_mn AS explanation
     FROM learning.daily_lessons dl
     JOIN assessment.diagnostic_items i ON i.skill_id = dl.core_skill_id
       AND i.status = 'APPROVED'
       AND (dl.source_outline_node_id IS NULL
            OR i.source_outline_node_id IS NULL
            OR i.source_outline_node_id = dl.source_outline_node_id)
     JOIN assessment.diagnostic_item_options o ON o.diagnostic_item_id = i.id
     WHERE dl.id = $1::bigint
     ORDER BY i.item_order, i.id, o.sequence_no`,
    [lessonId],
  );

export const lessonReachableByStudent = async (lessonId: number, studentId: number) =>
  (
    await readRows<{ ok: number }>(
      `SELECT 1 AS ok FROM learning.daily_lessons dl
       WHERE dl.id = $2::bigint AND dl.status = 'APPROVED' AND (
         EXISTS (SELECT 1 FROM core.student_enrollments e
                 JOIN learning.class_schedule cs ON cs.class_id = e.class_id
                 WHERE e.student_id = $1::bigint AND e.is_active AND cs.daily_lesson_id = dl.id
                   -- A period struck off the register reaches nobody. There is
                   -- nothing to be checked on in an hour that did not happen,
                   -- and the section will come round again on its own day.
                   AND cs.held
                   AND NOT EXISTS (
                     SELECT 1 FROM learning.timetable_slots ts
                     WHERE ts.id = cs.timetable_slot_id AND ts.audience_assigned
                       AND NOT EXISTS (SELECT 1 FROM learning.timetable_slot_students m
                         WHERE m.timetable_slot_id = ts.id AND m.student_id = $1)))
         OR EXISTS (SELECT 1 FROM learning.student_assignments sa
                    WHERE sa.student_id = $1::bigint AND sa.daily_lesson_id = dl.id))
       LIMIT 1`,
      [studentId, lessonId],
    )
  ).length > 0;

export const lessonHeader = (lessonId: number) =>
  readRows<{
    lessonCode: string;
    skillName: string;
    assessmentKind: string;
    subjectId: number;
    subjectName: string;
  }>(
    `SELECT dl.lesson_code AS "lessonCode", sk.name_mn AS "skillName",
       dl.assessment_kind::text AS "assessmentKind",
       sk.subject_id::int AS "subjectId", sub.name_mn AS "subjectName"
     FROM learning.daily_lessons dl
     JOIN content.skills sk ON sk.id = dl.core_skill_id
     JOIN core.subjects sub ON sub.id = sk.subject_id
     WHERE dl.id = $1::bigint`,
    [lessonId],
  );

/**
 * Today's sittings of one quiz, newest first.
 *
 * A child gets more than one go at the daily check, so the question is no
 * longer "have they answered" but "how many times, and which questions have
 * they already seen". Both come out of this.
 */
export const attemptsOnDate = (studentId: number, lessonId: number, onDate: string) =>
  readRows<{
    id: number;
    score: number;
    maxScore: number;
    submittedAt: string;
    answers: QuizAnswer[] | null;
  }>(
    `SELECT id::int AS id, score::int AS score, max_score::int AS "maxScore",
       to_json(submitted_at) #>> '{}' AS "submittedAt", answers
     FROM learning.quiz_attempts
     WHERE student_id = $1::bigint AND daily_lesson_id = $2::bigint
       AND (submitted_at AT TIME ZONE 'Asia/Ulaanbaatar')::date = $3::date
     ORDER BY submitted_at DESC`,
    [studentId, lessonId, onDate],
  );


/**
 * How this child's class has this check set, for the day it falls on.
 *
 * The settings live on the period, not on the section: the same section taught
 * to two classes is two different afternoons, and a teacher who holds one back
 * until half past ten has said nothing about the other. So the row is found
 * through the child's own enrolment.
 *
 * Nothing comes back for a section the child meets some other way - personal
 * work, say - and the defaults then stand, which is the right answer for work
 * that belongs to no period.
 */
export const quizSettingsForStudent = (studentId: number, lessonId: number, onDate: string) =>
  readRows<{
    quizOpensAt: string | null;
    quizQuestionCount: number | null;
    quizAttempts: number | null;
    answersOpen: boolean;
  }>(
    `SELECT to_char(cs.quiz_opens_at, 'HH24:MI') AS "quizOpensAt",
       cs.quiz_question_count::int AS "quizQuestionCount",
       cs.quiz_attempts::int AS "quizAttempts",
       (cs.answers_open_at IS NOT NULL AND cs.answers_open_at <= now()) AS "answersOpen"
     FROM core.student_enrollments e
     JOIN learning.class_schedule cs ON cs.class_id = e.class_id
     WHERE e.student_id = $1::bigint AND e.is_active
       AND cs.daily_lesson_id = $2::bigint AND cs.scheduled_on = $3::date
     ORDER BY cs.answers_open_at NULLS LAST, cs.period_no
     LIMIT 1`,
    [studentId, lessonId, onDate],
  );

/** A child's teacher-chosen questions for today, if any, and which attempt they are for. */
export const questionOverride = (studentId: number, lessonId: number, onDate: string) =>
  readRows<{ attemptNo: number; itemIds: number[] }>(
    `SELECT attempt_no::int AS "attemptNo", item_ids::int[] AS "itemIds"
     FROM learning.quiz_question_overrides
     WHERE student_id = $1::bigint AND daily_lesson_id = $2::bigint AND on_date = $3::date`,
    [studentId, lessonId, onDate],
  );

export const saveQuestionOverride = (row: {
  studentId: number; lessonId: number; onDate: string; attemptNo: number; itemIds: number[]; setBy: number;
}) =>
  pool.query(
    `INSERT INTO learning.quiz_question_overrides
       (daily_lesson_id, student_id, on_date, attempt_no, item_ids, set_by)
     VALUES ($1, $2, $3::date, $4, $5::bigint[], $6)
     ON CONFLICT (daily_lesson_id, student_id, on_date) DO UPDATE
       SET attempt_no = EXCLUDED.attempt_no, item_ids = EXCLUDED.item_ids,
           set_by = EXCLUDED.set_by, set_at = now()`,
    [row.lessonId, row.studentId, row.onDate, row.attemptNo, row.itemIds, row.setBy],
  );

export const clearQuestionOverride = (studentId: number, lessonId: number, onDate: string) =>
  pool.query(
    `DELETE FROM learning.quiz_question_overrides
     WHERE student_id = $1::bigint AND daily_lesson_id = $2::bigint AND on_date = $3::date`,
    [studentId, lessonId, onDate],
  );

/** The active children of a class, by name. */
export const classStudents = (classId: number) =>
  readRows<{ studentId: number; name: string }>(
    `SELECT s.id::int AS "studentId", s.display_name AS name
     FROM core.student_enrollments e JOIN core.students s ON s.id = e.student_id AND s.is_active
     WHERE e.class_id = $1::bigint AND e.is_active ORDER BY s.display_name`,
    [classId],
  );
