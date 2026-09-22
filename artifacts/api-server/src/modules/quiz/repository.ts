import { db, quizAttemptsInLearning, readRows } from "@workspace/db";

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
                 WHERE e.student_id = $1::bigint AND e.is_active AND cs.daily_lesson_id = dl.id)
         OR EXISTS (SELECT 1 FROM learning.student_assignments sa
                    WHERE sa.student_id = $1::bigint AND sa.daily_lesson_id = dl.id))
       LIMIT 1`,
      [studentId, lessonId],
    )
  ).length > 0;

export const lessonHeader = (lessonId: number) =>
  readRows<{ lessonCode: string; skillName: string; assessmentKind: string }>(
    `SELECT dl.lesson_code AS "lessonCode", sk.name_mn AS "skillName",
       dl.assessment_kind::text AS "assessmentKind"
     FROM learning.daily_lessons dl
     JOIN content.skills sk ON sk.id = dl.core_skill_id
     WHERE dl.id = $1::bigint`,
    [lessonId],
  );

export const attemptOnDate = (studentId: number, lessonId: number, onDate: string) =>
  readRows<{ id: number; score: number; maxScore: number; submittedAt: string }>(
    `SELECT id::int AS id, score::int AS score, max_score::int AS "maxScore",
       submitted_at AS "submittedAt"
     FROM learning.quiz_attempts
     WHERE student_id = $1::bigint AND daily_lesson_id = $2::bigint
       AND (submitted_at AT TIME ZONE 'Asia/Ulaanbaatar')::date = $3::date
     ORDER BY submitted_at DESC
     LIMIT 1`,
    [studentId, lessonId, onDate],
  );
