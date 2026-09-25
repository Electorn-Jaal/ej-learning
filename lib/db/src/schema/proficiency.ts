import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  numeric,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import {
  answerSourceInAssessment,
  assessment,
  classesInCore,
  content,
  diagnosticItemsInAssessment,
  examPapersInAssessment,
  studentsInCore,
  subjectsInCore,
} from "./database";

/**
 * Ordered ladders of difficulty, with the framework naming which ladder.
 *
 * core.grade_levels is the Mongolian school years and is checked to 1..11, so
 * CEFR cannot live there. It is also not the same kind of thing: a first-year
 * student in this placement data sits at C1, because a school year says how
 * long someone has attended and a CEFR level says what they can do.
 *
 * Keeping the framework in the row means the next ladder - a maths strand, a
 * reading band - is a few inserts rather than another table.
 */
export const proficiencyLevelsInContent = content.table(
  "proficiency_levels",
  {
    id: smallint()
      .primaryKey()
      .generatedAlwaysAsIdentity({
        name: "content.proficiency_levels_id_seq",
        startWith: 1,
        increment: 1,
        minValue: 1,
        maxValue: 32767,
        cache: 1,
      }),
    framework: varchar({ length: 30 }).notNull(),
    code: varchar({ length: 20 }).notNull(),
    nameMn: varchar("name_mn", { length: 80 }).notNull(),
    // Position on the ladder. Comparisons use this, never the code, because
    // "A2" < "B1" only sorts correctly by accident.
    sequence: smallint().notNull(),
  },
  (table) => [
    unique("proficiency_levels_framework_code_key").on(table.framework, table.code),
    unique("proficiency_levels_framework_sequence_key").on(
      table.framework,
      table.sequence,
    ),
    check("proficiency_levels_sequence_check", sql`sequence > 0`),
  ],
);

/**
 * The options a multiple-choice item offers.
 *
 * Nothing stored options before this: every question in the schema was
 * open-response with a teacher-facing rubric. Answers arrive from the source
 * as the chosen text, so `optionText` is what a response matches on, and
 * `isCorrect` is what turns a response into a score.
 */
export const diagnosticItemOptionsInAssessment = assessment.table(
  "diagnostic_item_options",
  {
    id: bigint({ mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity({
        name: "assessment.diagnostic_item_options_id_seq",
        startWith: 1,
        increment: 1,
        minValue: 1,
        cache: 1,
      }),
    diagnosticItemId: bigint("diagnostic_item_id", { mode: "number" }).notNull(),
    optionLabel: varchar("option_label", { length: 8 }),
    optionText: text("option_text").notNull(),
    isCorrect: boolean("is_correct").default(false).notNull(),
    sequenceNo: smallint("sequence_no").notNull(),
  },
  (table) => [
    // One row per distinct answer text, so a response maps to exactly one option.
    unique("diagnostic_item_options_item_text_key").on(
      table.diagnosticItemId,
      table.optionText,
    ),
    unique("diagnostic_item_options_item_sequence_key").on(
      table.diagnosticItemId,
      table.sequenceNo,
    ),
    index("idx_diagnostic_item_options_item").using(
      "btree",
      table.diagnosticItemId.asc().nullsLast().op("int8_ops"),
    ),
    foreignKey({
      columns: [table.diagnosticItemId],
      foreignColumns: [diagnosticItemsInAssessment.id],
      name: "diagnostic_item_options_item_id_fkey",
    }).onDelete("cascade"),
  ],
);

/**
 * One occasion on which a class sits a paper.
 *
 * A paper is a set of questions; a sitting is a class, a window, and an
 * audience. The two are separate because the same term paper is given to 9а on
 * Tuesday morning and to 9б on Wednesday afternoon, and a window written on the
 * paper would make those the same event.
 *
 * The window has both ends. An exam that opens and never closes is not an
 * exam - it is homework - and the closing time is what makes "sat it" mean the
 * same thing for every child in the room.
 *
 * answersOpenAt is the same rule the daily check follows: the key waits for the
 * teacher. Here it matters more, because a paper is sat once and a child who
 * sees the answers before their classmate has finished has been handed the
 * marks.
 */
export const examSittingsInAssessment = assessment.table(
  "exam_sittings",
  {
    id: bigint({ mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity({
        name: "assessment.exam_sittings_id_seq",
        startWith: 1,
        increment: 1,
        minValue: 1,
        cache: 1,
      }),
    examPaperId: bigint("exam_paper_id", { mode: "number" }).notNull(),
    classId: bigint("class_id", { mode: "number" }).notNull(),
    subjectId: bigint("subject_id", { mode: "number" }).notNull(),
    opensAt: timestamp("opens_at", { withTimezone: true, mode: "string" }).notNull(),
    closesAt: timestamp("closes_at", { withTimezone: true, mode: "string" }).notNull(),
    answersOpenAt: timestamp("answers_open_at", { withTimezone: true, mode: "string" }),
    // True: everybody on the register. False: only the children named in
    // exam_sitting_students. Kept as a flag rather than inferred from an empty
    // list, because "the whole class" and "nobody yet" are different
    // intentions and a teacher building a sitting passes through both.
    wholeClass: boolean("whole_class").default(true).notNull(),
    // Sat on paper, in the room, with the teacher entering what each child
    // wrote afterwards. The questions come from the same bank and are numbered
    // the same way, which is the whole point: a paper sitting that the system
    // cannot line up question for question produces marks nobody can trace.
    //
    // A paper sitting is never offered to a child online. It has already
    // happened by the time anybody types it in.
    onPaper: boolean("on_paper").default(false).notNull(),
    // Who set it. No foreign key, for the reason exam_papers.created_by has
    // none: core.users is declared in identity.ts, which already imports this
    // side of the graph, and pointing back at it would make the two modules
    // circular. The column is set from the application, which has the user row
    // in hand when it writes it.
    createdBy: bigint("created_by", { mode: "number" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check("exam_sittings_window_check", sql`closes_at > opens_at`),
    index("idx_exam_sittings_class").using(
      "btree",
      table.classId.asc().nullsLast(),
      table.opensAt.desc().nullsLast(),
    ),
    foreignKey({
      columns: [table.examPaperId],
      foreignColumns: [examPapersInAssessment.id],
      name: "exam_sittings_exam_paper_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.classId],
      foreignColumns: [classesInCore.id],
      name: "exam_sittings_class_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.subjectId],
      foreignColumns: [subjectsInCore.id],
      name: "exam_sittings_subject_id_fkey",
    }),
  ],
);

/**
 * Who sits it, and who has been let in again.
 *
 * Two jobs in one table because they are the same fact seen twice: this child,
 * on this sitting, is entitled to a go. When the sitting is for named children
 * the row says they are one of them; when it is for the whole class the row
 * appears only to record that a teacher gave somebody another chance.
 *
 * extraAttempts is how "the teacher may set it again" is written. A child
 * cannot sit a paper twice on their own - that is what makes it a paper rather
 * than practice - so the only way to a second go is a teacher deciding, and
 * the decision is recorded next to the child it was made for.
 */
export const examSittingStudentsInAssessment = assessment.table(
  "exam_sitting_students",
  {
    sittingId: bigint("sitting_id", { mode: "number" }).notNull(),
    studentId: bigint("student_id", { mode: "number" }).notNull(),
    invited: boolean().default(true).notNull(),
    extraAttempts: smallint("extra_attempts").default(0).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.sittingId, table.studentId], name: "exam_sitting_students_pkey" }),
    check("exam_sitting_students_extra_attempts_check", sql`extra_attempts >= 0`),
    foreignKey({
      columns: [table.sittingId],
      foreignColumns: [examSittingsInAssessment.id],
      name: "exam_sitting_students_sitting_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.studentId],
      foreignColumns: [studentsInCore.id],
      name: "exam_sitting_students_student_id_fkey",
    }).onDelete("cascade"),
  ],
);

export type ImportedScoreRow = {
  itemCode: string;
  answerText: string | null;
  correct: boolean;
};

export const placementAttemptsInAssessment = assessment.table(
  "placement_attempts",
  {
    id: bigint({ mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity({
        name: "assessment.placement_attempts_id_seq",
        startWith: 1,
        increment: 1,
        minValue: 1,
        cache: 1,
      }),
    studentId: bigint("student_id", { mode: "number" }).notNull(),
    subjectId: bigint("subject_id", { mode: "number" }).notNull(),
    proficiencyLevelId: smallint("proficiency_level_id"),
    totalScore: numeric("total_score"),
    totalMaxScore: numeric("total_max_score"),
    // Carried through from the source so a reimport can be matched to a row.
    externalKey: text("external_key"),
    answerSource: answerSourceInAssessment("answer_source")
      .default("UNKNOWN")
      .notNull(),
    notes: text(),
    // Which sitting this was. A child may be placed more than once - four
    // were in the first CEFR import - and without a date the two levels
    // cannot be ordered, so neither can be called the current one.
    attemptedOn: date("attempted_on"),
  },
  (table) => [
    index("idx_placement_attempts_student").using(
      "btree",
      table.studentId.asc().nullsLast().op("int8_ops"),
    ),
    index("idx_placement_attempts_student_date").using(
      "btree",
      table.studentId.asc().nullsLast().op("int8_ops"),
      table.attemptedOn.desc().nullsLast(),
    ),
    foreignKey({
      columns: [table.proficiencyLevelId],
      foreignColumns: [proficiencyLevelsInContent.id],
      name: "placement_attempts_level_id_fkey",
    }),
  ],
);

/**
 * What a child studies next, given the level they placed at.
 *
 * The half of a placement test that makes it worth sitting. The score says A2;
 * this says what A2 means on Monday morning - which book, which unit, what the
 * task is, and how a teacher confirms it was done.
 *
 * Keyed on (level, skill) rather than on a student, because that is what the
 * school wrote down: a rule, not one plan per child. A child's plan is their
 * current level read through this table, so moving up a level changes the plan
 * with nobody rewriting anything, and changing a textbook changes it once.
 *
 * sourceMaterialId is nullable and mostly null. The English titles named here
 * are not in the library yet, so the label carries the plan on paper today and
 * the foreign key waits for the day those books are uploaded.
 */
export const placementPathwaysInContent = content.table(
  "placement_pathways",
  {
    id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    proficiencyLevelId: smallint("proficiency_level_id").notNull(),
    domainMn: varchar("domain_mn", { length: 200 }).notNull(),
    sequenceNo: smallint("sequence_no").notNull(),
    sourceLabel: varchar("source_label", { length: 300 }).notNull(),
    sourceMaterialId: bigint("source_material_id", { mode: "number" }),
    unitFocusMn: varchar("unit_focus_mn", { length: 500 }),
    pagesMn: varchar("pages_mn", { length: 200 }),
    taskMn: text("task_mn").notNull(),
    priority: varchar({ length: 40 }).notNull(),
    verificationMn: varchar("verification_mn", { length: 120 }),
  },
  (table) => [
    unique("placement_pathways_level_domain_key").on(
      table.proficiencyLevelId,
      table.domainMn,
    ),
    check("placement_pathways_sequence_check", sql`sequence_no > 0`),
    check(
      "placement_pathways_priority_check",
      sql`priority IN ('FOUNDATION', 'DEVELOP', 'EXTEND', 'HIGH PRIORITY IF GAP')`,
    ),
    foreignKey({
      columns: [table.proficiencyLevelId],
      foreignColumns: [proficiencyLevelsInContent.id],
      name: "placement_pathways_level_id_fkey",
    }),
  ],
);

/**
 * A teacher's judgement of one writing or speaking task.
 *
 * The placement paper has two halves. Sixty questions are marked against a key
 * and the system can do that alone; twenty-four are judged by a person reading
 * what a child wrote or listening to what they said, against a can-do
 * statement. Only the first half had ever been recorded, which is why a
 * hundred of the hundred and five children who sat the test carry a level
 * their screens have to call provisional.
 *
 * Separate from assessment.diagnostic_responses, which records a score and
 * nothing else. A judged task needs three more facts - what the teacher
 * thought, who the teacher was, and when - because unlike a marked answer a
 * judgement can be disagreed with, and then somebody has to be asked.
 *
 * score is numeric rather than boolean although the rubric asks a yes-or-no
 * question, so a school that later wants half marks is not blocked by a
 * migration.
 */
export const productiveRatingsInAssessment = assessment.table(
  "productive_ratings",
  {
    id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    studentId: bigint("student_id", { mode: "number" }).notNull(),
    diagnosticItemId: bigint("diagnostic_item_id", { mode: "number" }).notNull(),
    score: numeric("score", { precision: 5, scale: 2 }).notNull(),
    maxScore: numeric("max_score", { precision: 5, scale: 2 }).notNull(),
    commentMn: text("comment_mn"),
    ratedBy: bigint("rated_by", { mode: "number" }).notNull(),
    ratedAt: timestamp("rated_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("productive_ratings_student_item_key").on(
      table.studentId, table.diagnosticItemId,
    ),
    check("productive_ratings_score_check", sql`score >= 0 AND score <= max_score`),
    index("idx_productive_ratings_student").using(
      "btree",
      table.studentId.asc().nullsLast().op("int8_ops"),
    ),
    foreignKey({
      columns: [table.studentId],
      foreignColumns: [studentsInCore.id],
      name: "productive_ratings_student_id_fkey",
    }).onDelete("cascade"),
  ],
);
