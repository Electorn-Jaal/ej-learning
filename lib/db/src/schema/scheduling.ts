import {
  bigint,
  check,
  date,
  foreignKey,
  index,
  smallint,
  text,
  timestamp,
  unique,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import {
  classesInCore,
  dailyLessonsInLearning,
  learning,
  studentsInCore,
} from "./database";
import { usersInCore } from "./identity";

/**
 * The three terms of a school year.
 *
 * A book is divided across them per grade, so the term is what a schedule
 * hangs off. Kept as rows rather than a computed date range because term
 * boundaries move: they are set by the school each year, not by a formula.
 */
export const termsInLearning = learning.table(
  "terms",
  {
    id: smallint()
      .primaryKey()
      .generatedAlwaysAsIdentity({
        name: "learning.terms_id_seq",
        startWith: 1,
        increment: 1,
        minValue: 1,
        maxValue: 32767,
        cache: 1,
      }),
    schoolYear: varchar("school_year", { length: 20 }).notNull(),
    termNumber: smallint("term_number").notNull(),
    nameMn: varchar("name_mn", { length: 50 }).notNull(),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on").notNull(),
  },
  (table) => [
    unique("terms_year_number_key").on(table.schoolYear, table.termNumber),
    check("terms_term_number_check", sql`term_number BETWEEN 1 AND 3`),
    check("terms_range_check", sql`ends_on >= starts_on`),
  ],
);

/**
 * What a class studies on a given day.
 *
 * One lesson per class per day, enforced by the unique key: the product gives
 * a student "today's lesson", so two rows for one day would have no defined
 * answer. A day with no row is a day with no lesson, which is what holidays
 * and exam days are.
 *
 * createdBy records who put it there - the admin seeding a default plan or the
 * teacher overriding it for their own class. It is the first column in the
 * schema to actually point at core.users rather than hold a name as text.
 */
export const classScheduleInLearning = learning.table(
  "class_schedule",
  {
    id: bigint({ mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity({
        name: "learning.class_schedule_id_seq",
        startWith: 1,
        increment: 1,
        minValue: 1,
        cache: 1,
      }),
    classId: bigint("class_id", { mode: "number" }).notNull(),
    termId: smallint("term_id").notNull(),
    dailyLessonId: bigint("daily_lesson_id", { mode: "number" }).notNull(),
    scheduledOn: date("scheduled_on").notNull(),
    note: text(),
    createdBy: bigint("created_by", { mode: "number" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("class_schedule_class_day_key").on(table.classId, table.scheduledOn),
    index("idx_class_schedule_day").using(
      "btree",
      table.scheduledOn.asc().nullsLast(),
    ),
    index("idx_class_schedule_term").using("btree", table.termId.asc().nullsLast()),
    foreignKey({
      columns: [table.classId],
      foreignColumns: [classesInCore.id],
      name: "class_schedule_class_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.termId],
      foreignColumns: [termsInLearning.id],
      name: "class_schedule_term_id_fkey",
    }),
    foreignKey({
      columns: [table.dailyLessonId],
      foreignColumns: [dailyLessonsInLearning.id],
      name: "class_schedule_daily_lesson_id_fkey",
    }),
    foreignKey({
      columns: [table.createdBy],
      foreignColumns: [usersInCore.id],
      name: "class_schedule_created_by_fkey",
    }),
  ],
);

/**
 * Work assigned to one student on one day.
 *
 * class_schedule answers "what is this class studying today", which is the
 * right question for a textbook everyone works through together. It is the
 * wrong question for English: a single class here holds students from PRE-A1
 * to C2, so the lesson has to follow the student's measured level rather than
 * the room they sit in.
 *
 * `source` is what keeps the two apart as the system learns to place work
 * itself. AUTO rows come from a student's level or, later, from the
 * remediation walk; TEACHER rows are a person overriding it. A teacher can
 * always see which is which, and the algorithm can be told not to touch what a
 * teacher put there.
 */
export const assignmentSourceInLearning = learning.enum("assignment_source", [
  "AUTO",
  "TEACHER",
]);

export const studentAssignmentsInLearning = learning.table(
  "student_assignments",
  {
    id: bigint({ mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity({
        name: "learning.student_assignments_id_seq",
        startWith: 1,
        increment: 1,
        minValue: 1,
        cache: 1,
      }),
    studentId: bigint("student_id", { mode: "number" }).notNull(),
    dailyLessonId: bigint("daily_lesson_id", { mode: "number" }).notNull(),
    assignedOn: date("assigned_on").notNull(),
    source: assignmentSourceInLearning().default("AUTO").notNull(),
    assignedBy: bigint("assigned_by", { mode: "number" }),
    reason: text(),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "string" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    // One lesson per student per day, so "today's work" has one answer. A
    // teacher replacing the automatic pick updates the row rather than adding.
    unique("student_assignments_student_day_key").on(table.studentId, table.assignedOn),
    index("idx_student_assignments_day").using(
      "btree",
      table.assignedOn.asc().nullsLast(),
    ),
    foreignKey({
      columns: [table.studentId],
      foreignColumns: [studentsInCore.id],
      name: "student_assignments_student_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.dailyLessonId],
      foreignColumns: [dailyLessonsInLearning.id],
      name: "student_assignments_daily_lesson_id_fkey",
    }),
    foreignKey({
      columns: [table.assignedBy],
      foreignColumns: [usersInCore.id],
      name: "student_assignments_assigned_by_fkey",
    }),
  ],
);
