import {
  bigint,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { dailyLessonsInLearning, learning, studentsInCore } from "./database";

export type QuizAnswerRecord = {
  questionId: string;
  prompt: string;
  chosenOptionId: string;
  chosenText: string;
  correct: boolean;
};

/**
 * A student's run at a lesson's practice check.
 *
 * The questions themselves still live in the frontend, so this stores the
 * answers as jsonb rather than pointing at question rows. That is the whole
 * reason this is one table instead of four: a prototype needs the teacher to
 * see what a student answered, not a modelled question bank.
 *
 * The cost is that nothing here can be aggregated by skill - "which skill is
 * this class weakest at" needs real question rows, and arrives with the
 * diagnostic block. `prompt` and `chosenText` are copied in rather than
 * referenced so an answer still reads correctly after the mock questions are
 * edited or replaced.
 *
 * Attempts are not unique per student and lesson: retaking is allowed and the
 * history is worth keeping.
 */
export const quizAttemptsInLearning = learning.table(
  "quiz_attempts",
  {
    id: bigint({ mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity({
        name: "learning.quiz_attempts_id_seq",
        startWith: 1,
        increment: 1,
        minValue: 1,
        cache: 1,
      }),
    studentId: bigint("student_id", { mode: "number" }).notNull(),
    dailyLessonId: bigint("daily_lesson_id", { mode: "number" }).notNull(),
    // Kept alongside the id so an attempt still identifies its question set
    // after the frontend bank is reorganised.
    lessonCode: varchar("lesson_code", { length: 100 }).notNull(),
    answers: jsonb().$type<QuizAnswerRecord[]>().notNull(),
    score: integer().notNull(),
    maxScore: integer("max_score").notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_quiz_attempts_student").using(
      "btree",
      table.studentId.asc().nullsLast().op("int8_ops"),
    ),
    index("idx_quiz_attempts_lesson").using(
      "btree",
      table.dailyLessonId.asc().nullsLast().op("int8_ops"),
    ),
    index("idx_quiz_attempts_submitted").using(
      "btree",
      table.submittedAt.desc().nullsLast(),
    ),
    check("quiz_attempts_score_check", sql`score >= 0 AND score <= max_score`),
    check("quiz_attempts_max_score_check", sql`max_score > 0`),
    foreignKey({
      columns: [table.studentId],
      foreignColumns: [studentsInCore.id],
      name: "quiz_attempts_student_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.dailyLessonId],
      foreignColumns: [dailyLessonsInLearning.id],
      name: "quiz_attempts_daily_lesson_id_fkey",
    }),
  ],
);
