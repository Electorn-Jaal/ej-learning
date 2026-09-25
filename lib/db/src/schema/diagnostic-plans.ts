import { bigint, integer, jsonb, primaryKey, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import { assessment, content, contentSkillMapsInContent, diagnosticItemsInAssessment,
  diagnosticAttemptsInAssessment, sourceMaterialsInContent } from './database';
import { usersInCore } from './identity';

// An explicit topic/skill pair, never the Cartesian product of two tag lists.
export const diagnosticItemTargets = assessment.table('diagnostic_item_targets', {
  itemId: bigint('item_id', { mode: 'number' }).notNull().references(() => diagnosticItemsInAssessment.id),
  mapId: bigint('map_id', { mode: 'number' }).notNull().references(() => contentSkillMapsInContent.id),
}, (t) => [primaryKey({ columns: [t.itemId, t.mapId] })]);

// A precise reading reference or a self-contained exercise/question. Existing
// books are referenced, never copied or reclassified by an automatic rule.
export const diagnosticResources = content.table('diagnostic_resources', {
  id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  title: varchar({ length: 500 }).notNull(),
  kind: varchar({ length: 30 }).notNull(),
  instructions: text().notNull(),
  sourceMaterialId: bigint('source_material_id', { mode: 'number' }).references(() => sourceMaterialsInContent.id),
  reference: varchar({ length: 500 }),
  createdBy: bigint('created_by', { mode: 'number' }).notNull().references(() => usersInCore.id),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});
export const diagnosticResourceTargets = content.table('diagnostic_resource_targets', {
  resourceId: bigint('resource_id', { mode: 'number' }).notNull().references(() => diagnosticResources.id),
  mapId: bigint('map_id', { mode: 'number' }).notNull().references(() => contentSkillMapsInContent.id),
}, (t) => [primaryKey({ columns: [t.resourceId, t.mapId] })]);

// Snapshot both evidence and recommendations. Reading/recomputing a report
// must never overwrite a teacher's work; revision protects simultaneous edits.
export const diagnosticPlanReviews = assessment.table('diagnostic_plan_reviews', {
  attemptId: bigint('attempt_id', { mode: 'number' }).primaryKey().references(() => diagnosticAttemptsInAssessment.id),
  revision: integer().default(1).notNull(),
  evidence: jsonb().notNull(),
  entries: jsonb().notNull(),
  note: text().default('').notNull(),
  updatedBy: bigint('updated_by', { mode: 'number' }).notNull().references(() => usersInCore.id),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});
