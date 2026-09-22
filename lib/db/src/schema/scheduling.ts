import {
  bigint,
  check,
  date,
  foreignKey,
  index,
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
  unique,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import {
  classesInCore,
  dailyLessonsInLearning,
  learning,
  sourceOutlineNodesInContent,
  studentsInCore,
  subjectsInCore,
} from "./database";
import { usersInCore } from "./identity";

/**
 * The four terms of a school year.
 *
 * A book is divided across them per grade, so the term is what a schedule
 * hangs off. Kept as rows rather than a computed date range because term
 * boundaries move: they are set by the school each year, not by a formula.
 *
 * Four, not three: the school year has four terms and the content is what gets
 * squeezed into three of them. The check used to say three, which would have
 * refused the fourth term outright.
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
    check("terms_term_number_check", sql`term_number BETWEEN 1 AND 4`),
    check("terms_range_check", sql`ends_on >= starts_on`),
  ],
);

/**
 * The school's bell times: period 1 starts at this hour and runs to that one.
 *
 * Kept per school year rather than as a constant, because bell times are the
 * school's to set and they move - a winter timetable, a shortened day. The
 * timetable grid draws one row per row of this table, so a period with no
 * lesson anywhere still appears: an empty slot in the middle of the day is
 * information, and a grid that omits it silently closes the gap.
 *
 * Times only, no date. A period is a shape the day has, not an event.
 */
export const classPeriodsInLearning = learning.table(
  "class_periods",
  {
    schoolYear: varchar("school_year", { length: 20 }).notNull(),
    periodNo: smallint("period_no").notNull(),
    nameMn: varchar("name_mn", { length: 50 }),
    startsAt: time("starts_at").notNull(),
    endsAt: time("ends_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.schoolYear, table.periodNo], name: "class_periods_pkey" }),
    check("class_periods_period_no_check", sql`period_no BETWEEN 1 AND 12`),
    check("class_periods_range_check", sql`ends_at > starts_at`),
  ],
);

/**
 * What a class studies on a given day.
 *
 * One lesson per class per subject per day, enforced by the unique key: the
 * product gives a student "today's lesson", so two rows for one subject in one
 * day would have no defined answer. A day with no row is a day with no lesson,
 * which is what holidays and exam days are.
 *
 * periodNo says WHEN in the day, and a second unique key stops two subjects
 * claiming the same slot - a class cannot be in two rooms at once. It is
 * nullable because the school has not supplied a timetable yet: a row without
 * it is a lesson known to happen that day at an unknown hour, which is what
 * every row imported so far would be.
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
    // A school day is not one lesson. Which subject a row belongs to is
    // derivable from the lesson's skill, but the rule worth enforcing - one
    // lesson per subject per day - cannot be written as a constraint across a
    // join, so the subject is carried here and set from the lesson on write.
    subjectId: bigint("subject_id", { mode: "number" }).notNull(),
    periodNo: smallint("period_no"),
    note: text(),
    createdBy: bigint("created_by", { mode: "number" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("class_schedule_class_day_key").on(
      table.classId,
      table.subjectId,
      table.scheduledOn,
    ),
    // One class, one slot. Nulls do not collide in a unique index, so days
    // with no timetable yet are unaffected.
    unique("class_schedule_class_slot_key").on(
      table.classId,
      table.scheduledOn,
      table.periodNo,
    ),
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
    foreignKey({
      columns: [table.subjectId],
      foreignColumns: [subjectsInCore.id],
      name: "class_schedule_subject_id_fkey",
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
    // Extra work is per subject too: falling behind in maths says
    // nothing about English. Same reasoning as class_schedule - one
    // lesson per subject per day - cannot be written as a constraint across a
    // join, so the subject is carried here and set from the lesson on write.
    subjectId: bigint("subject_id", { mode: "number" }).notNull(),
    source: assignmentSourceInLearning().default("AUTO").notNull(),
    assignedBy: bigint("assigned_by", { mode: "number" }),
    reason: text(),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "string" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    // One lesson per student per subject per day, so "today's maths" has one
    // answer. A teacher replacing the automatic pick updates the row rather
    // than adding.
    unique("student_assignments_student_day_key").on(
      table.studentId,
      table.subjectId,
      table.assignedOn,
    ),
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
      columns: [table.subjectId],
      foreignColumns: [subjectsInCore.id],
      name: "student_assignments_subject_id_fkey",
    }),
    foreignKey({
      columns: [table.assignedBy],
      foreignColumns: [usersInCore.id],
      name: "student_assignments_assigned_by_fkey",
    }),
  ],
);

/**
 * What a child means to do with their own day.
 *
 * Not the school's work: the lessons, the personal assignment and the quiz all
 * come from somewhere else and are already recorded. This is the line a child
 * writes for themselves - "read twenty minutes", "finish the model" - and it
 * is deliberately free text. Tying it to a skill would make it a fifth kind of
 * assignment and put the child's own plan under the same approval and scoring
 * machinery as the school's, which is not what was asked for.
 *
 * One row per student per day, so "today's plan" has one answer and editing it
 * rewrites rather than accumulates.
 */
export const studentDayPlansInLearning = learning.table(
  "student_day_plans",
  {
    id: bigint({ mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity({
        name: "learning.student_day_plans_id_seq",
        startWith: 1,
        increment: 1,
        minValue: 1,
        cache: 1,
      }),
    studentId: bigint("student_id", { mode: "number" }).notNull(),
    planOn: date("plan_on").notNull(),
    body: text().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("student_day_plans_student_day_key").on(table.studentId, table.planOn),
    index("idx_student_day_plans_day").using(
      "btree",
      table.planOn.asc().nullsLast(),
    ),
    foreignKey({
      columns: [table.studentId],
      foreignColumns: [studentsInCore.id],
      name: "student_day_plans_student_id_fkey",
    }).onDelete("cascade"),
    check("student_day_plans_body_check", sql`char_length(body) <= 2000`),
  ],
);

/**
 * Where a class has actually reached in its core textbook.
 *
 * The term calendar says which chapters a term is meant to cover; it does not
 * say which one the class is on, and no amount of arithmetic over dates will
 * tell you - classes fall behind, skip ahead, and spend a fortnight on one
 * section. Only the teacher knows, so only the teacher writes this.
 *
 * One row per class and subject: a pointer, not a history. It answers "what is
 * 6a doing in maths right now" for every screen that asks, and a child reading
 * it is reading what their teacher put there rather than a calculation dressed
 * up as a fact.
 *
 * The node must belong to the book core.class_subjects names for this class
 * and subject. That is two joins away and so cannot be a CHECK; the route
 * verifies it before writing and refuses a section from another book.
 */
export const classTopicsInLearning = learning.table(
  "class_topics",
  {
    classId: bigint("class_id", { mode: "number" }).notNull(),
    subjectId: bigint("subject_id", { mode: "number" }).notNull(),
    sourceOutlineNodeId: bigint("source_outline_node_id", { mode: "number" }).notNull(),
    // The day the class arrived here, which is not the day the row was
    // written: a teacher catching up on Friday still marks Monday.
    effectiveOn: date("effective_on").default(sql`CURRENT_DATE`).notNull(),
    note: text(),
    // Who moved the pointer. Null only for rows an import made.
    setBy: bigint("set_by", { mode: "number" }),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_class_topics_node").using(
      "btree",
      table.sourceOutlineNodeId.asc().nullsLast().op("int8_ops"),
    ),
    foreignKey({
      columns: [table.classId],
      foreignColumns: [classesInCore.id],
      name: "class_topics_class_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.subjectId],
      foreignColumns: [subjectsInCore.id],
      name: "class_topics_subject_id_fkey",
    }),
    // Restrict: a section a class is sitting on is not a safe thing to delete
    // out from under it while reorganising an outline.
    foreignKey({
      columns: [table.sourceOutlineNodeId],
      foreignColumns: [sourceOutlineNodesInContent.id],
      name: "class_topics_source_outline_node_id_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.setBy],
      foreignColumns: [usersInCore.id],
      name: "class_topics_set_by_fkey",
    }),
    primaryKey({ columns: [table.classId, table.subjectId], name: "class_topics_pkey" }),
    check("class_topics_note_check", sql`note IS NULL OR char_length(note) <= 500`),
  ],
);
