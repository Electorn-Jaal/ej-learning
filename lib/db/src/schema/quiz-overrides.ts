import { bigint, date, primaryKey, smallint, timestamp } from 'drizzle-orm/pg-core';
import { dailyLessonsInLearning, learning, studentsInCore } from './database';
import { usersInCore } from './identity';

/**
 * The questions a teacher chose for one child's next go at a daily check
 * (UC08, FR13).
 *
 * The paper is normally worked out when the child opens it - unseen questions
 * first - and never stored. A teacher who looks ahead and swaps a question
 * writes it here, for one attempt number on one day; the attempt after that
 * goes back to the ordinary rule, so a choice made for Monday's first go does
 * not quietly become every paper that child ever sees.
 */
export const quizQuestionOverrides = learning.table('quiz_question_overrides', {
  dailyLessonId: bigint('daily_lesson_id', { mode: 'number' }).notNull().references(() => dailyLessonsInLearning.id),
  studentId: bigint('student_id', { mode: 'number' }).notNull().references(() => studentsInCore.id),
  onDate: date('on_date').notNull(),
  attemptNo: smallint('attempt_no').notNull(),
  itemIds: bigint('item_ids', { mode: 'number' }).array().notNull(),
  setBy: bigint('set_by', { mode: 'number' }).notNull().references(() => usersInCore.id),
  setAt: timestamp('set_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (t) => [primaryKey({ columns: [t.dailyLessonId, t.studentId, t.onDate] })]);
