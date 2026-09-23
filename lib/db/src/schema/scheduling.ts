import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  numeric,
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
    // Nullable: a timetable slot exists before anyone has prepared what
    // goes in it. The slot is the container and the lesson is its content,
    // and the school has a full timetable with almost no lesson content.
    dailyLessonId: bigint("daily_lesson_id", { mode: "number" }),
    scheduledOn: date("scheduled_on").notNull(),
    // A school day is not one lesson. Which subject a row belongs to is
    // derivable from the lesson's skill, but the rule worth enforcing - one
    // lesson per subject per day - cannot be written as a constraint across a
    // join, so the subject is carried here and set from the lesson on write.
    subjectId: bigint("subject_id", { mode: "number" }).notNull(),
    periodNo: smallint("period_no"),
    timetableSlotId: bigint("timetable_slot_id", { mode: "number" }),
    // The pages this class actually covered, when they are not the book's own.
    // Null means the printed range the alignment carries, which is what nearly
    // every row says; a teacher who went further sets it here rather than
    // moving the pages for every school that shares the book.
    pageFrom: integer("page_from"),
    pageTo: integer("page_to"),
    note: text(),
    createdBy: bigint("created_by", { mode: "number" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("class_schedule_class_day_key").on(
      table.classId, table.subjectId, table.scheduledOn, table.timetableSlotId,
    ).nullsNotDistinct(),
    check("class_schedule_page_from_check", sql`${table.pageFrom} > 0`),
    check("class_schedule_page_to_check", sql`${table.pageTo} > 0`),
    check(
      "class_schedule_page_range_check",
      sql`${table.pageFrom} IS NULL OR ${table.pageTo} IS NULL OR ${table.pageTo} >= ${table.pageFrom}`,
    ),
    foreignKey({
      columns: [table.timetableSlotId],
      foreignColumns: [timetableSlotsInLearning.id],
      name: "class_schedule_timetable_slot_id_fkey",
    }).onDelete("cascade"),
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

/**
 * One week of a child's placement plan, per skill.
 *
 * content.placement_pathways holds the RULE - what A2 means in general. This
 * holds what the school generated from that rule for a named child: four
 * weeks, six skills a week, each with its own book, unit, task and mastery
 * target.
 *
 * subjectId is carried even though every row today is English, because the
 * shape is not English-specific: a maths placement would produce the same
 * table, and a plan keyed only on a student would silently merge the two.
 */
export const studyPlanWeeksInLearning = learning.table(
  "study_plan_weeks",
  {
    id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    studentId: bigint("student_id", { mode: "number" }).notNull(),
    subjectId: bigint("subject_id", { mode: "number" }).notNull(),
    weekNo: smallint("week_no").notNull(),
    domainMn: varchar("domain_mn", { length: 200 }).notNull(),
    levelCode: varchar("level_code", { length: 20 }),
    priority: varchar({ length: 40 }),
    sourceLabel: varchar("source_label", { length: 300 }),
    unitFocusMn: varchar("unit_focus_mn", { length: 500 }),
    pagesMn: varchar("pages_mn", { length: 200 }),
    taskMn: text("task_mn"),
    masteryTargetMn: varchar("mastery_target_mn", { length: 60 }),
    teacherCheckMn: varchar("teacher_check_mn", { length: 120 }),
    status: varchar({ length: 40 }).notNull(),
  },
  (table) => [
    unique("study_plan_weeks_key").on(
      table.studentId, table.subjectId, table.weekNo, table.domainMn,
    ),
    check("study_plan_weeks_week_check", sql`week_no > 0`),
    foreignKey({
      columns: [table.studentId],
      foreignColumns: [studentsInCore.id],
      name: "study_plan_weeks_student_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.subjectId],
      foreignColumns: [subjectsInCore.id],
      name: "study_plan_weeks_subject_id_fkey",
    }),
  ],
);

/**
 * One day of that plan, and how it went.
 *
 * score and status are where the loop closes: a teacher marks a day, the
 * status becomes MASTERED, DEVELOPING or NEEDS SUPPORT, and what the child
 * does next follows from it. Both are nullable and almost entirely empty
 * today - four scores out of 1880 - which is the honest state. The plan is
 * written; the term has not been taught.
 *
 * weekdayNo is 1 for Monday. The workbook schedules five weekdays and nothing
 * at the weekend, but the check allows 7 so a school that teaches Saturday
 * does not need a migration.
 */
export const studyPlanDaysInLearning = learning.table(
  "study_plan_days",
  {
    id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    studentId: bigint("student_id", { mode: "number" }).notNull(),
    subjectId: bigint("subject_id", { mode: "number" }).notNull(),
    weekNo: smallint("week_no").notNull(),
    weekdayNo: smallint("weekday_no").notNull(),
    focusMn: varchar("focus_mn", { length: 200 }),
    levelCode: varchar("level_code", { length: 20 }),
    sourceLabel: text("source_label"),
    unitFocusMn: text("unit_focus_mn"),
    pagesMn: text("pages_mn"),
    taskMn: text("task_mn"),
    teacherCheckMn: varchar("teacher_check_mn", { length: 120 }),
    targetMn: varchar("target_mn", { length: 60 }),
    score: numeric("score", { precision: 5, scale: 2 }),
    status: varchar({ length: 40 }).notNull(),
  },
  (table) => [
    unique("study_plan_days_key").on(
      table.studentId, table.subjectId, table.weekNo, table.weekdayNo,
    ),
    check("study_plan_days_week_check", sql`week_no > 0`),
    check("study_plan_days_weekday_check", sql`weekday_no BETWEEN 1 AND 7`),
    check("study_plan_days_score_check", sql`score IS NULL OR (score >= 0 AND score <= 100)`),
    index("idx_study_plan_days_student_week").using(
      "btree",
      table.studentId.asc().nullsLast().op("int8_ops"),
      table.weekNo.asc().nullsLast(),
      table.weekdayNo.asc().nullsLast(),
    ),
    foreignKey({
      columns: [table.studentId],
      foreignColumns: [studentsInCore.id],
      name: "study_plan_days_student_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.subjectId],
      foreignColumns: [subjectsInCore.id],
      name: "study_plan_days_subject_id_fkey",
    }),
  ],
);

/**
 * The school's weekly timetable: which lesson a class has in which period.
 *
 * A repeating pattern rather than a row per date. The school publishes one
 * grid headed "from 21 September" and it holds until it is replaced, so
 * expanding it into some seven thousand dated rows per term would store the
 * same fact hundreds of times and make correcting it a migration.
 *
 * More than one lesson may occupy one class's period, and that is not a
 * double booking: 12a splits between social science and chemistry, the middle
 * years split between physical education and jiu-jitsu, and 6a splits into two
 * halves for design and IT. The key therefore includes the subject and the
 * teacher, and groupLabel carries the school's own name for the half ("6а-1")
 * where it wrote one.
 *
 * teacherId is nullable so a slot can be recorded before it is known who will
 * take it - a timetable published with a vacancy is still a timetable.
 */
export const timetableSlotsInLearning = learning.table(
  "timetable_slots",
  {
    id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    classId: bigint("class_id", { mode: "number" }).notNull(),
    subjectId: bigint("subject_id", { mode: "number" }).notNull(),
    teacherId: bigint("teacher_id", { mode: "number" }),
    // 1 is Monday. Five days are taught; the check allows seven so a Saturday
    // programme needs no migration.
    weekdayNo: smallint("weekday_no").notNull(),
    periodNo: smallint("period_no").notNull(),
    groupLabel: varchar("group_label", { length: 40 }),
    audienceAssigned: boolean("audience_assigned").default(false).notNull(),
    validFrom: date("valid_from").notNull(),
    validTo: date("valid_to"),
    sourceNote: varchar("source_note", { length: 200 }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("timetable_slots_key")
      .on(table.classId, table.weekdayNo, table.periodNo, table.subjectId,
          table.teacherId, table.validFrom)
      .nullsNotDistinct(),
    check("timetable_slots_weekday_check", sql`weekday_no BETWEEN 1 AND 7`),
    check("timetable_slots_period_check", sql`period_no > 0`),
    check("timetable_slots_range_check", sql`valid_to IS NULL OR valid_to >= valid_from`),
    index("idx_timetable_slots_class_day").using(
      "btree",
      table.classId.asc().nullsLast().op("int8_ops"),
      table.weekdayNo.asc().nullsLast(),
      table.periodNo.asc().nullsLast(),
    ),
    index("idx_timetable_slots_teacher").using(
      "btree",
      table.teacherId.asc().nullsLast().op("int8_ops"),
      table.weekdayNo.asc().nullsLast(),
      table.periodNo.asc().nullsLast(),
    ),
    foreignKey({
      columns: [table.classId],
      foreignColumns: [classesInCore.id],
      name: "timetable_slots_class_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.subjectId],
      foreignColumns: [subjectsInCore.id],
      name: "timetable_slots_subject_id_fkey",
    }),
  ],
);

export const timetableSlotStudentsInLearning = learning.table("timetable_slot_students", {
  timetableSlotId: bigint("timetable_slot_id", { mode: "number" }).notNull()
    .references(() => timetableSlotsInLearning.id, { onDelete: "cascade" }),
  studentId: bigint("student_id", { mode: "number" }).notNull()
    .references(() => studentsInCore.id, { onDelete: "cascade" }),
}, (table) => [primaryKey({ columns: [table.timetableSlotId, table.studentId] })]);
