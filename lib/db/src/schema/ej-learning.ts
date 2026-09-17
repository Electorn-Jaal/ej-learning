import {
  boolean,
  date,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export type ActivityStepRecord = {
  kind: "read" | "example" | "practice" | "check";
  label: string;
};

export type MaterialBlockRecord = {
  kind: "explanation" | "example" | "pdf" | "practice";
  title: string;
  body: string;
  pageLabel: string | null;
  available: boolean;
  url?: string;
};

export type QuestionRecord = {
  id: string;
  prompt: string;
  type: "single_choice" | "written";
  options: string[];
  maxScore: number;
};

export const learningUsersTable = pgTable("ej_learning_users", {
  id: text("id").primaryKey(),
  displayName: text("display_name").notNull(),
  role: text("role").notNull(),
  gradeLevel: integer("grade_level").notNull(),
  className: text("class_name").notNull(),
  isDemo: boolean("is_demo").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const learningAssignmentsTable = pgTable(
  "ej_learning_assignments",
  {
    id: text("id").primaryKey(),
    studentId: text("student_id").notNull(),
    assignedDate: date("assigned_date", { mode: "string" }).notNull(),
    subject: text("subject").notNull(),
    subjectCode: text("subject_code").notNull(),
    activityType: text("activity_type").notNull(),
    topic: text("topic").notNull(),
    targetSkill: text("target_skill").notNull(),
    targetSkillCode: text("target_skill_code").notNull(),
    goal: text("goal").notNull(),
    reason: text("reason").notNull(),
    estimatedMinutes: integer("estimated_minutes").notNull(),
    gradeLevel: integer("grade_level").notNull(),
    priority: integer("priority").notNull().default(100),
    status: text("status").notNull().default("available"),
    approved: boolean("approved").notNull().default(false),
    actionLabel: text("action_label").notNull(),
    materialVersion: text("material_version"),
    steps: jsonb("steps").$type<ActivityStepRecord[]>().notNull(),
    materialBlocks:
      jsonb("material_blocks").$type<MaterialBlockRecord[]>().notNull(),
    question: jsonb("question").$type<QuestionRecord | null>(),
    rubric: jsonb("rubric").$type<string[] | null>(),
    answerKey: text("answer_key"),
    dataNotice: text("data_notice").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("ej_learning_assignment_daily_idx").on(
      table.studentId,
      table.assignedDate,
      table.id,
    ),
  ],
);

export const learningAttemptsTable = pgTable(
  "ej_learning_attempts",
  {
    id: text("id").primaryKey(),
    assignmentId: text("assignment_id").notNull(),
    studentId: text("student_id").notNull(),
    studentName: text("student_name").notNull(),
    className: text("class_name").notNull(),
    answer: text("answer"),
    status: text("status").notNull().default("in_progress"),
    score: integer("score"),
    maxScore: integer("max_score").notNull().default(4),
    feedback: text("feedback"),
    reviewer: text("reviewer"),
    rubricNotes: text("rubric_notes"),
    submissionKey: text("submission_key"),
    reviewKey: text("review_key"),
    completedSteps: text("completed_steps").array().notNull().default([]),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("ej_learning_attempt_submission_key_idx").on(
      table.submissionKey,
    ),
    uniqueIndex("ej_learning_attempt_review_key_idx").on(table.reviewKey),
    uniqueIndex("ej_learning_one_active_attempt_idx")
      .on(table.studentId, table.assignmentId)
      .where(sql`${table.status} = 'in_progress'`),
  ],
);

export const currentTopicsTable = pgTable(
  "ej_current_topics",
  {
    id: text("id").primaryKey(),
    classId: text("class_id").notNull(),
    subjectCode: text("subject_code").notNull(),
    topic: text("topic").notNull(),
    topicCode: text("topic_code").notNull(),
    effectiveDate: timestamp("effective_date", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("ej_current_topics_class_subject_idx").on(
      table.classId,
      table.subjectCode,
    ),
  ],
);

export const insertLearningAttemptSchema = createInsertSchema(
  learningAttemptsTable,
).omit({ startedAt: true, updatedAt: true });
export type InsertLearningAttempt = z.infer<
  typeof insertLearningAttemptSchema
>;
export type LearningAttempt = typeof learningAttemptsTable.$inferSelect;

export const insertLearningAssignmentSchema = createInsertSchema(
  learningAssignmentsTable,
).omit({ createdAt: true, updatedAt: true });
export type InsertLearningAssignment = z.infer<
  typeof insertLearningAssignmentSchema
>;
export type LearningAssignment =
  typeof learningAssignmentsTable.$inferSelect;

export const insertCurrentTopicSchema = createInsertSchema(
  currentTopicsTable,
).omit({ effectiveDate: true, updatedAt: true });
export type InsertCurrentTopic = z.infer<typeof insertCurrentTopicSchema>;
export type CurrentTopicRecord = typeof currentTopicsTable.$inferSelect;