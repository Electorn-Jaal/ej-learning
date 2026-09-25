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
import { teachersInCore, usersInCore } from "./identity";

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
    // Whether the lesson actually happened.
    //
    // True by default, and that default is the whole point: a teacher who
    // marks nothing has not said the class was cancelled, and a system that
    // read silence as cancellation would empty the register of every school
    // holiday nobody got round to entering. Only an explicit "it did not
    // happen" is one, and it carries a reason, because a day struck off the
    // record is something a parent will ask about.
    held: boolean().default(true).notNull(),
    notHeldReason: text("not_held_reason"),
    // The same section, continued. A period that carries on where the last one
    // stopped is not a new section and must not consume one from the plan; it
    // also reads differently to a child, who is being told to pick the book up
    // rather than open it.
    isContinuation: boolean("is_continuation").default(false).notNull(),
    // When the day's check may be sat, how long it is, and how many goes it
    // allows. All three are null nearly always, and null means the rule the
    // system runs on: open all day, five questions, three attempts. A teacher
    // who wants the check held back until the practice is done sets a time,
    // and one whose section carries three questions rather than five says so
    // instead of having the paper silently padded.
    quizOpensAt: time("quiz_opens_at"),
    quizQuestionCount: smallint("quiz_question_count"),
    quizAttempts: smallint("quiz_attempts"),
    // When the key and the marking notes become the child's to see. Null is
    // "not yet", which is the state a check is in while it is still being
    // sat: a child on their second go must not have been handed the answer
    // on their first, and a parent reading over their shoulder is exactly the
    // route by which that happens. Whether each answer was right is told at
    // once - that is the feedback - but which option was right, and why, waits
    // for the teacher.
    answersOpenAt: timestamp("answers_open_at", { withTimezone: true, mode: "string" }),
    createdBy: bigint("created_by", { mode: "number" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("class_schedule_class_day_key").on(
      table.classId, table.subjectId, table.scheduledOn, table.timetableSlotId,
    ).nullsNotDistinct(),
    check(
      "class_schedule_not_held_reason_check",
      sql`held OR not_held_reason IS NOT NULL`,
    ),
    check(
      "class_schedule_quiz_question_count_check",
      sql`quiz_question_count IS NULL OR quiz_question_count BETWEEN 1 AND 50`,
    ),
    check(
      "class_schedule_quiz_attempts_check",
      sql`quiz_attempts IS NULL OR quiz_attempts BETWEEN 1 AND 10`,
    ),
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
 * Which sections a class actually got through in one period.
 *
 * class_schedule holds one lesson per period - what the child opens, what the
 * book pages and the note belong to. That is the right shape for the child and
 * the wrong shape for the plan, because a period is not always one section.
 *
 * Two things happen in real teaching and they look identical in a single
 * column. A class covers section 4 and starts section 5 in the same hour: the
 * term afterwards should carry on from 6. A teacher skips section 4 and
 * teaches 5 instead, meaning to come back: 4 has not been taught and must fall
 * somewhere later. Both end with "the day says 5", and until now the second
 * quietly lost section 4 - the plan moved on as though it had been covered.
 *
 * So the sections covered are recorded, all of them, and the plan for the rest
 * of the term is what remains. The row in class_schedule stays the one the
 * class ended on, because that is the one whose pages and instruction the
 * child needs.
 *
 * Only what a teacher said is here. Days nobody has confirmed carry no rows
 * and are read from class_schedule as before - the plan's own claim about what
 * was taught, which is all anybody has for a day that went unremarked.
 */
export const classLessonCoverageInLearning = learning.table(
  "class_lesson_coverage",
  {
    id: bigint({ mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity({
        name: "learning.class_lesson_coverage_id_seq",
        startWith: 1,
        increment: 1,
        minValue: 1,
        cache: 1,
      }),
    classId: bigint("class_id", { mode: "number" }).notNull(),
    subjectId: bigint("subject_id", { mode: "number" }).notNull(),
    scheduledOn: date("scheduled_on").notNull(),
    // Nullable for the same reason class_schedule's is: a school without a
    // timetable still teaches, and the day is then the only address a lesson
    // has.
    timetableSlotId: bigint("timetable_slot_id", { mode: "number" }),
    dailyLessonId: bigint("daily_lesson_id", { mode: "number" }).notNull(),
    createdBy: bigint("created_by", { mode: "number" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("class_lesson_coverage_key").on(
      table.classId, table.scheduledOn, table.timetableSlotId, table.dailyLessonId,
    ).nullsNotDistinct(),
    index("idx_class_lesson_coverage_day").using(
      "btree",
      table.classId.asc().nullsLast(),
      table.subjectId.asc().nullsLast(),
      table.scheduledOn.asc().nullsLast(),
    ),
    foreignKey({
      columns: [table.classId],
      foreignColumns: [classesInCore.id],
      name: "class_lesson_coverage_class_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.subjectId],
      foreignColumns: [subjectsInCore.id],
      name: "class_lesson_coverage_subject_id_fkey",
    }),
    foreignKey({
      columns: [table.dailyLessonId],
      foreignColumns: [dailyLessonsInLearning.id],
      name: "class_lesson_coverage_daily_lesson_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.timetableSlotId],
      foreignColumns: [timetableSlotsInLearning.id],
      name: "class_lesson_coverage_timetable_slot_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.createdBy],
      foreignColumns: [usersInCore.id],
      name: "class_lesson_coverage_created_by_fkey",
    }),
  ],
);

/**
 * What a teacher found in a child's exercise book.
 *
 * Three states are written down - done, partly done, not done - and a fourth
 * is the absence of a row. That fourth one is the reason this is a table of
 * marks rather than a column with a default: "not checked" and "not done" are
 * different facts about a child, and a school that cannot tell them apart will
 * sooner or later tell a parent their child did nothing when the truth is that
 * nobody looked. Thirty children and six periods a day means most of this grid
 * is never filled in, and that has to read as silence.
 *
 * Keyed by the period, not the day: a child can have done the maths and not
 * the physics, and the two are marked by two different people.
 *
 * The comment is the teacher's own sentence about this child's book - the one
 * thing in the system that says why, and the reason a mark is worth reading at
 * home rather than just counting.
 */
export const notebookMarksInLearning = learning.table(
  "notebook_marks",
  {
    id: bigint({ mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity({
        name: "learning.notebook_marks_id_seq",
        startWith: 1,
        increment: 1,
        minValue: 1,
        cache: 1,
      }),
    classId: bigint("class_id", { mode: "number" }).notNull(),
    subjectId: bigint("subject_id", { mode: "number" }).notNull(),
    scheduledOn: date("scheduled_on").notNull(),
    timetableSlotId: bigint("timetable_slot_id", { mode: "number" }),
    studentId: bigint("student_id", { mode: "number" }).notNull(),
    state: varchar({ length: 16 }).notNull(),
    comment: text(),
    markedBy: bigint("marked_by", { mode: "number" }),
    markedAt: timestamp("marked_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("notebook_marks_key").on(
      table.studentId, table.scheduledOn, table.timetableSlotId, table.subjectId,
    ).nullsNotDistinct(),
    check(
      "notebook_marks_state_check",
      sql`state IN ('DONE', 'PARTIAL', 'NOT_DONE')`,
    ),
    index("idx_notebook_marks_day").using(
      "btree",
      table.classId.asc().nullsLast(),
      table.scheduledOn.asc().nullsLast(),
    ),
    foreignKey({
      columns: [table.classId],
      foreignColumns: [classesInCore.id],
      name: "notebook_marks_class_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.subjectId],
      foreignColumns: [subjectsInCore.id],
      name: "notebook_marks_subject_id_fkey",
    }),
    foreignKey({
      columns: [table.studentId],
      foreignColumns: [studentsInCore.id],
      name: "notebook_marks_student_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.timetableSlotId],
      foreignColumns: [timetableSlotsInLearning.id],
      name: "notebook_marks_timetable_slot_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.markedBy],
      foreignColumns: [usersInCore.id],
      name: "notebook_marks_marked_by_fkey",
    }),
  ],
);

/**
 * Who was in the room.
 *
 * Four states are written down - present, late, absent, excused - and a fifth
 * is the absence of a row. The fifth is why this is a table of marks and not a
 * column with a default, the same reason the exercise book has one: "not
 * registered" and "did not come" are different facts about a child, and a
 * school that collapses them tells a parent their child truanted when the
 * truth is that nobody took the register.
 *
 * timetableSlotId is how the school's own rule is written down. Up to year 5
 * a class is with one teacher all day and the register is taken once, so the
 * slot is null and the row is the day. From year 6 the children move between
 * teachers and the register is taken per lesson, so the slot is the period.
 * The service decides which by the class's year; the column just records it.
 *
 * Participation is a separate axis and deliberately toothless: three words a
 * teacher may leave unsaid, worth no marks, and not a second attendance state.
 * A child who was present and quiet is present.
 */
export const attendanceMarksInLearning = learning.table(
  "attendance_marks",
  {
    id: bigint({ mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity({
        name: "learning.attendance_marks_id_seq",
        startWith: 1,
        increment: 1,
        minValue: 1,
        cache: 1,
      }),
    classId: bigint("class_id", { mode: "number" }).notNull(),
    studentId: bigint("student_id", { mode: "number" }).notNull(),
    onDate: date("on_date").notNull(),
    // Null for a whole-day register, which is what years 1 to 5 keep.
    timetableSlotId: bigint("timetable_slot_id", { mode: "number" }),
    subjectId: bigint("subject_id", { mode: "number" }),
    state: varchar({ length: 16 }).notNull(),
    participation: varchar({ length: 16 }),
    note: text(),
    markedBy: bigint("marked_by", { mode: "number" }),
    markedAt: timestamp("marked_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("attendance_marks_key").on(
      table.studentId, table.onDate, table.timetableSlotId,
    ).nullsNotDistinct(),
    check(
      "attendance_marks_state_check",
      sql`state IN ('PRESENT', 'LATE', 'ABSENT', 'EXCUSED')`,
    ),
    check(
      "attendance_marks_participation_check",
      sql`participation IS NULL OR participation IN ('HIGH', 'GOOD', 'WATCH')`,
    ),
    index("idx_attendance_marks_day").using(
      "btree",
      table.classId.asc().nullsLast(),
      table.onDate.asc().nullsLast(),
    ),
    index("idx_attendance_marks_student").using(
      "btree",
      table.studentId.asc().nullsLast(),
      table.onDate.desc().nullsLast(),
    ),
    foreignKey({
      columns: [table.classId],
      foreignColumns: [classesInCore.id],
      name: "attendance_marks_class_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.studentId],
      foreignColumns: [studentsInCore.id],
      name: "attendance_marks_student_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.timetableSlotId],
      foreignColumns: [timetableSlotsInLearning.id],
      name: "attendance_marks_timetable_slot_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.subjectId],
      foreignColumns: [subjectsInCore.id],
      name: "attendance_marks_subject_id_fkey",
    }),
    foreignKey({
      columns: [table.markedBy],
      foreignColumns: [usersInCore.id],
      name: "attendance_marks_marked_by_fkey",
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
/**
 * A club: something the school runs that is not a class.
 *
 * Speaking club, БС, ДС-1. On the school's own timetable these are written in
 * the box where a class name goes, which is the only place there was to put
 * them - and it makes them unreadable, because the box means "who is in the
 * room" and a club's answer is "whoever signed up, from anywhere".
 *
 * So a club has no class. It has a teacher, an hour, and a list of children
 * drawn from across the school, and the list is the club. That is the
 * difference from a split class, where the group exists whether or not anybody
 * has said who is in it: an unassigned half of 6а is still half of 6а, but a
 * club with nobody in it is a club nobody joined.
 *
 * The consequence is deliberate and worth stating: a club with no members
 * appears on nobody's timetable. A group slot with no members appears on
 * everybody's, marked as unassigned, because the children are known to be
 * somewhere and the school has simply not said which half. A club is opt-in,
 * so silence means empty rather than unknown.
 */
export const clubsInLearning = learning.table(
  "clubs",
  {
    id: bigint({ mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity({
        name: "learning.clubs_id_seq",
        startWith: 1,
        increment: 1,
        minValue: 1,
        cache: 1,
      }),
    nameMn: varchar("name_mn", { length: 200 }).notNull(),
    // Nullable: a club need not be a school subject. Speaking club is English
    // and ДС-1 is Japanese, but a chess club is a chess club, and forcing one
    // would mean inventing subjects nobody teaches.
    subjectId: bigint("subject_id", { mode: "number" }),
    teacherId: bigint("teacher_id", { mode: "number" }),
    schoolYear: varchar("school_year", { length: 20 }).notNull(),
    note: text(),
    isActive: boolean("is_active").default(true).notNull(),
    createdBy: bigint("created_by", { mode: "number" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("clubs_name_year_key").on(table.nameMn, table.schoolYear),
    foreignKey({
      columns: [table.subjectId],
      foreignColumns: [subjectsInCore.id],
      name: "clubs_subject_id_fkey",
    }),
    foreignKey({
      columns: [table.teacherId],
      foreignColumns: [teachersInCore.id],
      name: "clubs_teacher_id_fkey",
    }),
    foreignKey({
      columns: [table.createdBy],
      foreignColumns: [usersInCore.id],
      name: "clubs_created_by_fkey",
    }),
  ],
);

/**
 * When a club meets.
 *
 * The same weekday-and-period the timetable uses, so a club sits in a child's
 * day beside their lessons rather than in a list of its own. A club that met
 * at "Tuesday after school" would be unplaceable next to a seventh period.
 *
 * Several rows per club: Speaking club runs two hours on Tuesday and two on
 * Thursday, which is four rows, and the school's spreadsheet merges them into
 * two boxes - which is how a double session came to look like a single one.
 */
export const clubSessionsInLearning = learning.table(
  "club_sessions",
  {
    id: bigint({ mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity({
        name: "learning.club_sessions_id_seq",
        startWith: 1,
        increment: 1,
        minValue: 1,
        cache: 1,
      }),
    clubId: bigint("club_id", { mode: "number" }).notNull(),
    weekdayNo: smallint("weekday_no").notNull(),
    periodNo: smallint("period_no").notNull(),
    validFrom: date("valid_from").notNull(),
    validTo: date("valid_to"),
  },
  (table) => [
    unique("club_sessions_key").on(table.clubId, table.weekdayNo, table.periodNo),
    check("club_sessions_weekday_check", sql`weekday_no BETWEEN 1 AND 7`),
    check("club_sessions_period_check", sql`period_no BETWEEN 1 AND 12`),
    foreignKey({
      columns: [table.clubId],
      foreignColumns: [clubsInLearning.id],
      name: "club_sessions_club_id_fkey",
    }).onDelete("cascade"),
  ],
);

/**
 * Who is in the club.
 *
 * From anywhere. The point of the table is that membership crosses classes -
 * a Speaking club of four children from 9а and two from 12а is the ordinary
 * case, and there is no class row that could hold it.
 *
 * Leaving is recorded rather than deleted: a child who stopped coming in
 * November was in the club in October, and their attendance that month should
 * still make sense.
 */
export const clubMembersInLearning = learning.table(
  "club_members",
  {
    clubId: bigint("club_id", { mode: "number" }).notNull(),
    studentId: bigint("student_id", { mode: "number" }).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.clubId, table.studentId], name: "club_members_pkey" }),
    index("idx_club_members_student").using("btree", table.studentId.asc().nullsLast()),
    foreignKey({
      columns: [table.clubId],
      foreignColumns: [clubsInLearning.id],
      name: "club_members_club_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.studentId],
      foreignColumns: [studentsInCore.id],
      name: "club_members_student_id_fkey",
    }).onDelete("cascade"),
  ],
);

/**
 * Extra work a teacher sets: a task, with a deadline it may outlive.
 *
 * Distinct from student_assignments, which is the one personal thing a child
 * has in a subject on a day - one row per student per subject per date, and
 * setting it again replaces it. That shape is right for "today's maths" and
 * wrong for everything a teacher actually hands out: it cannot be given to a
 * class, it has no deadline, and a second go overwrites the first.
 *
 * A task is given to a whole class, a named few, or one child. It may have a
 * date it is wanted by, or none. And it keeps every attempt: a child who
 * redoes the work has done it twice, and the teacher is the one who decides
 * what that is worth.
 *
 * dueOn is nullable on purpose and lateness is recorded rather than refused.
 * A deadline that locks the door turns "I did it at the weekend" into "I did
 * not do it", which is a worse record of the same child.
 */
export const homeworkInLearning = learning.table(
  "homework",
  {
    id: bigint({ mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity({
        name: "learning.homework_id_seq",
        startWith: 1,
        increment: 1,
        minValue: 1,
        cache: 1,
      }),
    classId: bigint("class_id", { mode: "number" }).notNull(),
    subjectId: bigint("subject_id", { mode: "number" }).notNull(),
    // The lesson this hangs off, where it hangs off one. Null for work a
    // teacher wrote themselves, which is most of it.
    dailyLessonId: bigint("daily_lesson_id", { mode: "number" }),
    title: varchar({ length: 300 }).notNull(),
    instructions: text(),
    assignedOn: date("assigned_on").notNull(),
    dueOn: date("due_on"),
    // True: everybody on the register. False: only the children named in
    // task_students.
    wholeClass: boolean("whole_class").default(true).notNull(),
    teacherId: bigint("teacher_id", { mode: "number" }),
    isActive: boolean("is_active").default(true).notNull(),
    createdBy: bigint("created_by", { mode: "number" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check("homework_due_check", sql`due_on IS NULL OR due_on >= assigned_on`),
    index("idx_homework_class").using(
      "btree",
      table.classId.asc().nullsLast(),
      table.assignedOn.desc().nullsLast(),
    ),
    foreignKey({
      columns: [table.classId],
      foreignColumns: [classesInCore.id],
      name: "homework_class_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.subjectId],
      foreignColumns: [subjectsInCore.id],
      name: "homework_subject_id_fkey",
    }),
    foreignKey({
      columns: [table.dailyLessonId],
      foreignColumns: [dailyLessonsInLearning.id],
      name: "homework_daily_lesson_id_fkey",
    }),
    foreignKey({
      columns: [table.teacherId],
      foreignColumns: [teachersInCore.id],
      name: "homework_teacher_id_fkey",
    }),
    foreignKey({
      columns: [table.createdBy],
      foreignColumns: [usersInCore.id],
      name: "homework_created_by_fkey",
    }),
  ],
);

/** Who a task was set for, when it was not set for the whole class. */
export const homeworkStudentsInLearning = learning.table(
  "homework_students",
  {
    homeworkId: bigint("homework_id", { mode: "number" }).notNull(),
    studentId: bigint("student_id", { mode: "number" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.homeworkId, table.studentId], name: "homework_students_pkey" }),
    foreignKey({
      columns: [table.homeworkId],
      foreignColumns: [homeworkInLearning.id],
      name: "homework_students_homework_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.studentId],
      foreignColumns: [studentsInCore.id],
      name: "homework_students_student_id_fkey",
    }).onDelete("cascade"),
  ],
);

/**
 * Every go a child has had at a task.
 *
 * Every one, not the last. A child who redid the work has done it twice, and
 * which of the two counts is a judgement the teacher makes from seeing both -
 * a table that keeps only the newest has already made that judgement for them,
 * silently, in favour of whichever was typed last.
 *
 * isLate is worked out at submission and stored, rather than compared against
 * dueOn afterwards: a deadline the teacher later moves must not retroactively
 * make a child punctual or tardy.
 *
 * minutes is what the browser saw, and is approximate by nature - a page left
 * open counts, a page thought about on paper does not. It is recorded because
 * a teacher asking "did they rush it" has nothing else, and labelled
 * approximate everywhere it is shown.
 */
export const homeworkSubmissionsInLearning = learning.table(
  "homework_submissions",
  {
    id: bigint({ mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity({
        name: "learning.homework_submissions_id_seq",
        startWith: 1,
        increment: 1,
        minValue: 1,
        cache: 1,
      }),
    homeworkId: bigint("homework_id", { mode: "number" }).notNull(),
    studentId: bigint("student_id", { mode: "number" }).notNull(),
    attemptNo: smallint("attempt_no").notNull(),
    body: text(),
    minutes: smallint(),
    isLate: boolean("is_late").default(false).notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("homework_submissions_attempt_key").on(
      table.homeworkId, table.studentId, table.attemptNo,
    ),
    check("homework_submissions_attempt_check", sql`attempt_no > 0`),
    index("idx_homework_submissions_task").using(
      "btree",
      table.homeworkId.asc().nullsLast(),
      table.studentId.asc().nullsLast(),
    ),
    foreignKey({
      columns: [table.homeworkId],
      foreignColumns: [homeworkInLearning.id],
      name: "homework_submissions_homework_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.studentId],
      foreignColumns: [studentsInCore.id],
      name: "homework_submissions_student_id_fkey",
    }).onDelete("cascade"),
  ],
);

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
