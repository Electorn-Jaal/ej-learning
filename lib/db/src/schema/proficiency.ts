import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  numeric,
  smallint,
  text,
  unique,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import {
  answerSourceInAssessment,
  assessment,
  content,
  diagnosticItemsInAssessment,
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
