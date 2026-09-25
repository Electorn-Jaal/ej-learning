import { sql } from 'drizzle-orm';
import { bigint, check, date, index, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import { classesInCore, core, studentsInCore } from './database';
import { usersInCore } from './identity';

/**
 * Every move a child makes between classes, and why (FR28, FR29).
 *
 * student_enrollments says where a child is; this says how they got there.
 * A row is written in the same transaction as the enrolment change it
 * describes, so the history cannot say one thing and the register another.
 * Past answers, attendance and marks are keyed to the student, not the
 * enrolment, which is why moving a child here never touches them.
 */
export const enrollmentChanges = core.table('enrollment_changes', {
  id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  studentId: bigint('student_id', { mode: 'number' }).notNull().references(() => studentsInCore.id),
  kind: varchar({ length: 20 }).notNull(),
  fromClassId: bigint('from_class_id', { mode: 'number' }).references(() => classesInCore.id),
  toClassId: bigint('to_class_id', { mode: 'number' }).references(() => classesInCore.id),
  effectiveOn: date('effective_on').notNull(),
  reason: text().default('').notNull(),
  changedBy: bigint('changed_by', { mode: 'number' }).notNull().references(() => usersInCore.id),
  changedAt: timestamp('changed_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (t) => [
  index('idx_enrollment_changes_student').on(t.studentId),
  check('enrollment_changes_kind_check', sql`kind IN ('TRANSFER','PROMOTE','REPEAT','GRADUATE')`),
]);

/** Who answered for a class, from when. classes.class_teacher_id is the current value. */
export const classTeacherChanges = core.table('class_teacher_changes', {
  id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  classId: bigint('class_id', { mode: 'number' }).notNull().references(() => classesInCore.id),
  fromTeacherId: bigint('from_teacher_id', { mode: 'number' }),
  toTeacherId: bigint('to_teacher_id', { mode: 'number' }),
  effectiveOn: date('effective_on').notNull(),
  changedBy: bigint('changed_by', { mode: 'number' }).notNull().references(() => usersInCore.id),
  changedAt: timestamp('changed_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (t) => [index('idx_class_teacher_changes_class').on(t.classId)]);
