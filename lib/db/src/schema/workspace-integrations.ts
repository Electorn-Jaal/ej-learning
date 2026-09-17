import {
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const workspaceCoursesTable = pgTable(
  "ej_workspace_courses",
  {
    externalCourseId: text("external_course_id").primaryKey(),
    internalClassId: text("internal_class_id").notNull(),
    name: text("name").notNull(),
    teacher: text("teacher").notNull(),
    studentCount: integer("student_count").notNull(),
    syncStatus: text("sync_status").notNull(),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);

export const workspaceImportBatchesTable = pgTable(
  "ej_workspace_import_batches",
  {
    id: text("id").primaryKey(),
    source: text("source").notNull(),
    fileName: text("file_name").notNull(),
    status: text("status").notNull(),
    rowCount: integer("row_count").notNull(),
    validCount: integer("valid_count").notNull(),
    errorCount: integer("error_count").notNull(),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);

export const workspaceAuditEventsTable = pgTable(
  "ej_workspace_audit_events",
  {
    id: text("id").primaryKey(),
    action: text("action").notNull(),
    source: text("source").notNull(),
    summary: text("summary").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("ej_workspace_audit_idempotency_idx").on(
      table.idempotencyKey,
    ),
    uniqueIndex("ej_workspace_audit_action_idx").on(table.action),
  ],
);

export const insertWorkspaceCourseSchema =
  createInsertSchema(workspaceCoursesTable);
export const insertWorkspaceImportBatchSchema = createInsertSchema(
  workspaceImportBatchesTable,
).omit({ createdAt: true });
export const insertWorkspaceAuditEventSchema = createInsertSchema(
  workspaceAuditEventsTable,
).omit({ createdAt: true });

export type WorkspaceCourseRecord =
  typeof workspaceCoursesTable.$inferSelect;
export type WorkspaceImportBatchRecord =
  typeof workspaceImportBatchesTable.$inferSelect;
export type WorkspaceAuditEventRecord =
  typeof workspaceAuditEventsTable.$inferSelect;
export type InsertWorkspaceCourse = z.infer<
  typeof insertWorkspaceCourseSchema
>;