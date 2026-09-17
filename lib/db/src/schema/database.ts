import { pgTable, pgSchema, unique, bigint, varchar, boolean, check, smallint, index, foreignKey, text, integer, timestamp, char, numeric, jsonb, uuid, primaryKey, date } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { proficiencyLevelsInContent } from "./proficiency"

export const content = pgSchema("content");
export const assessment = pgSchema("assessment");
export const learning = pgSchema("learning");
export const core = pgSchema("core");
export const staging = pgSchema("staging");
export const audit = pgSchema("audit");
export const contentLevelTypeInContent = content.enum("content_level_type", ['DOMAIN', 'UNIT', 'TOPIC', 'SUBTOPIC', 'SEGMENT'])
export const dataQualityStatusInContent = content.enum("data_quality_status", ['INCOMPLETE', 'COMPLETE', 'VERIFIED'])
export const dependencyTypeInContent = content.enum("dependency_type", ['REQUIRED', 'RECOMMENDED', 'RELATED'])
export const importanceLevelInContent = content.enum("importance_level", ['HIGH', 'MEDIUM', 'LOW'])
export const outlineNodeTypeInContent = content.enum("outline_node_type", ['CHAPTER', 'SECTION', 'SUBSECTION', 'EXAMPLE_SET', 'EXERCISE_SET', 'REVIEW', 'ASSESSMENT', 'OTHER'])
export const reviewStatusInContent = content.enum("review_status", ['DRAFT', 'IN_REVIEW', 'APPROVED', 'ARCHIVED'])
export const sourceRelationTypeInContent = content.enum("source_relation_type", ['PRIMARY', 'CURRICULUM', 'EXPLAINS', 'PRACTICES', 'ASSESSES', 'RELATED'])
/**
 * Where an item's correct answer came from. The CEFR bank's key was solved
 * from recorded scores rather than exported from the form that holds it, and a
 * score computed against a reconstruction must not be indistinguishable from
 * one computed against the real key.
 */
export const answerSourceInAssessment = assessment.enum("answer_source", ['AUTHORITATIVE', 'RECONSTRUCTED', 'UNKNOWN'])
export const importStatusInStaging = staging.enum("import_status", ['UPLOADED', 'VALIDATING', 'INVALID', 'READY', 'APPROVED', 'IMPORTED', 'FAILED'])


export const subjectsInCore = core.table("subjects", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity({ name: "core.subjects_id_seq", startWith: 1, increment: 1, minValue: 1, cache: 1 }),
	code: varchar({ length: 30 }).notNull(),
	nameMn: varchar("name_mn", { length: 100 }).notNull(),
	isActive: boolean("is_active").default(true).notNull(),
}, (table) => [
	unique("subjects_code_key").on(table.code),
]);

export const gradeLevelsInCore = core.table("grade_levels", {
	id: smallint().primaryKey().generatedAlwaysAsIdentity({ name: "core.grade_levels_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 32767, cache: 1 }),
	gradeNumber: smallint("grade_number").notNull(),
	nameMn: varchar("name_mn", { length: 50 }).notNull(),
}, (table) => [
	unique("grade_levels_grade_number_key").on(table.gradeNumber),
	// Mongolian general education runs to 12. The original bound of 11 came from
	// the first draft of the requirements and would have refused a whole year
	// group - the imported workbook already contained a 12А that no import
	// could have accepted.
	check("grade_levels_grade_number_check", sql`(grade_number >= 1) AND (grade_number <= 12)`),
]);

export const sourceMaterialsInContent = content.table("source_materials", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity({ name: "content.source_materials_id_seq", startWith: 1, increment: 1, minValue: 1, cache: 1 }),
	sourceCode: varchar("source_code", { length: 100 }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	subjectId: bigint("subject_id", { mode: "number" }).notNull(),
	title: varchar({ length: 500 }),
	materialType: varchar("material_type", { length: 50 }).notNull(),
	authors: text(),
	publisher: varchar({ length: 300 }),
	publishedYear: smallint("published_year"),
	edition: varchar({ length: 100 }),
	totalPages: integer("total_pages"),
	status: reviewStatusInContent().default('DRAFT').notNull(),
	dataQualityStatus: dataQualityStatusInContent("data_quality_status").default('INCOMPLETE').notNull(),
	notes: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_source_material_subject").using("btree", table.subjectId.asc().nullsLast().op("int8_ops"), table.status.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.subjectId],
			foreignColumns: [subjectsInCore.id],
			name: "source_materials_subject_id_fkey"
		}),
	unique("source_materials_source_code_key").on(table.sourceCode),
	check("source_materials_published_year_check", sql`(published_year >= 1900) AND (published_year <= 2200)`),
	check("source_materials_total_pages_check", sql`total_pages > 0`),
]);

export const sourceOutlineNodesInContent = content.table("source_outline_nodes", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity({ name: "content.source_outline_nodes_id_seq", startWith: 1, increment: 1, minValue: 1, cache: 1 }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	sourceMaterialId: bigint("source_material_id", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	parentId: bigint("parent_id", { mode: "number" }),
	outlineCode: varchar("outline_code", { length: 100 }).notNull(),
	printedNumber: varchar("printed_number", { length: 50 }),
	nodeType: outlineNodeTypeInContent("node_type").notNull(),
	title: text().notNull(),
	pageFrom: integer("page_from"),
	pageTo: integer("page_to"),
	sequenceNo: integer("sequence_no").notNull(),
	status: reviewStatusInContent().default('DRAFT').notNull(),
	dataQualityStatus: dataQualityStatusInContent("data_quality_status").default('INCOMPLETE').notNull(),
	notes: text(),
}, (table) => [
	index("idx_source_outline_parent").using("btree", table.parentId.asc().nullsLast().op("int8_ops")),
	index("idx_source_outline_source").using("btree", table.sourceMaterialId.asc().nullsLast().op("int4_ops"), table.sequenceNo.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.sourceMaterialId],
			foreignColumns: [sourceMaterialsInContent.id],
			name: "source_outline_nodes_source_material_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.parentId],
			foreignColumns: [table.id],
			name: "source_outline_nodes_parent_id_fkey"
		}).onDelete("restrict"),
	unique("source_outline_nodes_source_material_id_outline_code_key").on(table.outlineCode, table.sourceMaterialId),
	unique("source_outline_nodes_source_material_id_sequence_no_key").on(table.sequenceNo, table.sourceMaterialId),
	check("source_outline_nodes_page_from_check", sql`page_from > 0`),
	check("source_outline_nodes_page_to_check", sql`page_to > 0`),
	check("source_outline_nodes_sequence_no_check", sql`sequence_no > 0`),
	check("source_outline_nodes_check", sql`(parent_id IS NULL) OR (parent_id <> id)`),
	check("source_outline_nodes_check1", sql`(page_from IS NULL) OR (page_to IS NULL) OR (page_from <= page_to)`),
]);

export const contentNodesInContent = content.table("content_nodes", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity({ name: "content.content_nodes_id_seq", startWith: 1, increment: 1, minValue: 1, cache: 1 }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	subjectId: bigint("subject_id", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	parentId: bigint("parent_id", { mode: "number" }),
	contentCode: varchar("content_code", { length: 100 }).notNull(),
	levelType: contentLevelTypeInContent("level_type").notNull(),
	nameMn: varchar("name_mn", { length: 500 }).notNull(),
	descriptionMn: text("description_mn"),
	gradeFromId: smallint("grade_from_id"),
	gradeToId: smallint("grade_to_id"),
	sequenceNo: integer("sequence_no").notNull(),
	status: reviewStatusInContent().default('DRAFT').notNull(),
	dataQualityStatus: dataQualityStatusInContent("data_quality_status").default('INCOMPLETE').notNull(),
	notes: text(),
}, (table) => [
	index("idx_content_parent").using("btree", table.parentId.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.subjectId],
			foreignColumns: [subjectsInCore.id],
			name: "content_nodes_subject_id_fkey"
		}),
	foreignKey({
			columns: [table.parentId],
			foreignColumns: [table.id],
			name: "content_nodes_parent_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.gradeFromId],
			foreignColumns: [gradeLevelsInCore.id],
			name: "content_nodes_grade_from_id_fkey"
		}),
	foreignKey({
			columns: [table.gradeToId],
			foreignColumns: [gradeLevelsInCore.id],
			name: "content_nodes_grade_to_id_fkey"
		}),
	unique("content_nodes_content_code_key").on(table.contentCode),
	check("content_nodes_sequence_no_check", sql`sequence_no > 0`),
	check("content_nodes_check", sql`(parent_id IS NULL) OR (parent_id <> id)`),
]);

export const contentSourceAlignmentsInContent = content.table("content_source_alignments", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity({ name: "content.content_source_alignments_id_seq", startWith: 1, increment: 1, minValue: 1, cache: 1 }),
	alignmentCode: varchar("alignment_code", { length: 100 }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	contentNodeId: bigint("content_node_id", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	sourceMaterialId: bigint("source_material_id", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	sourceOutlineNodeId: bigint("source_outline_node_id", { mode: "number" }),
	pageFrom: integer("page_from"),
	pageTo: integer("page_to"),
	relationType: sourceRelationTypeInContent("relation_type").notNull(),
	evidenceNote: text("evidence_note"),
	status: reviewStatusInContent().default('DRAFT').notNull(),
	notes: text(),
}, (table) => [
	index("idx_alignment_content").using("btree", table.contentNodeId.asc().nullsLast().op("int8_ops")),
	index("idx_alignment_source").using("btree", table.sourceMaterialId.asc().nullsLast().op("int8_ops"), table.sourceOutlineNodeId.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.contentNodeId],
			foreignColumns: [contentNodesInContent.id],
			name: "content_source_alignments_content_node_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.sourceMaterialId],
			foreignColumns: [sourceMaterialsInContent.id],
			name: "content_source_alignments_source_material_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.sourceOutlineNodeId],
			foreignColumns: [sourceOutlineNodesInContent.id],
			name: "content_source_alignments_source_outline_node_id_fkey"
		}).onDelete("restrict"),
	unique("content_source_alignments_alignment_code_key").on(table.alignmentCode),
	check("content_source_alignments_page_from_check", sql`page_from > 0`),
	check("content_source_alignments_page_to_check", sql`page_to > 0`),
	check("content_source_alignments_check", sql`(page_from IS NULL) OR (page_to IS NULL) OR (page_from <= page_to)`),
]);

export const skillsInContent = content.table("skills", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity({ name: "content.skills_id_seq", startWith: 1, increment: 1, minValue: 1, cache: 1 }),
	skillCode: varchar("skill_code", { length: 120 }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	subjectId: bigint("subject_id", { mode: "number" }).notNull(),
	gradeLevelId: smallint("grade_level_id"),
	// A skill sits on a school grade or on a proficiency level. English CEFR
	// skills use the latter: "Grammar at B1" is a competence, not a school year.
	proficiencyLevelId: smallint("proficiency_level_id"),
	nameMn: varchar("name_mn", { length: 500 }).notNull(),
	descriptionMn: text("description_mn"),
	learningOutcomeMn: text("learning_outcome_mn"),
	difficulty: smallint(),
	status: reviewStatusInContent().default('DRAFT').notNull(),
	dataQualityStatus: dataQualityStatusInContent("data_quality_status").default('INCOMPLETE').notNull(),
	version: integer().default(1).notNull(),
	notes: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_skills_subject_grade").using("btree", table.subjectId.asc().nullsLast().op("int2_ops"), table.gradeLevelId.asc().nullsLast().op("int8_ops"), table.status.asc().nullsLast().op("enum_ops")),
	foreignKey({
			columns: [table.subjectId],
			foreignColumns: [subjectsInCore.id],
			name: "skills_subject_id_fkey"
		}),
	foreignKey({
			columns: [table.gradeLevelId],
			foreignColumns: [gradeLevelsInCore.id],
			name: "skills_grade_level_id_fkey"
		}),
	foreignKey({
			columns: [table.proficiencyLevelId],
			foreignColumns: [proficiencyLevelsInContent.id],
			name: "skills_proficiency_level_id_fkey"
		}),
	unique("skills_skill_code_key").on(table.skillCode),
	check("skills_difficulty_check", sql`(difficulty >= 1) AND (difficulty <= 5)`),
	check("skills_version_check", sql`version > 0`),
]);

export const sourceVersionsInContent = content.table("source_versions", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity({ name: "content.source_versions_id_seq", startWith: 1, increment: 1, minValue: 1, cache: 1 }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	sourceMaterialId: bigint("source_material_id", { mode: "number" }).notNull(),
	versionNo: integer("version_no").notNull(),
	originalFilename: text("original_filename"),
	storageKey: text("storage_key"),
	mimeType: varchar("mime_type", { length: 100 }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	fileSizeBytes: bigint("file_size_bytes", { mode: "number" }),
	checksumSha256: char("checksum_sha256", { length: 64 }),
	// File page = printed page + offset. A scanned textbook carries covers and
	// front matter the printed numbering does not count, so an outline entry
	// saying "page 3" is not page 3 of the file. Belongs on the version rather
	// than the work: re-scan the book and the offset changes, the outline does
	// not.
	pageOffset: integer("page_offset").default(0).notNull(),
	status: reviewStatusInContent().default('DRAFT').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.sourceMaterialId],
			foreignColumns: [sourceMaterialsInContent.id],
			name: "source_versions_source_material_id_fkey"
		}).onDelete("restrict"),
	unique("source_versions_source_material_id_version_no_key").on(table.sourceMaterialId, table.versionNo),
	unique("source_versions_checksum_sha256_key").on(table.checksumSha256),
	check("source_versions_version_no_check", sql`version_no > 0`),
	check("source_versions_file_size_bytes_check", sql`file_size_bytes >= 0`),
]);

export const contentSkillMapsInContent = content.table("content_skill_maps", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity({ name: "content.content_skill_maps_id_seq", startWith: 1, increment: 1, minValue: 1, cache: 1 }),
	mapCode: varchar("map_code", { length: 100 }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	contentNodeId: bigint("content_node_id", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	skillId: bigint("skill_id", { mode: "number" }).notNull(),
	isPrimary: boolean("is_primary").default(false).notNull(),
	evidenceNote: text("evidence_note"),
	status: reviewStatusInContent().default('DRAFT').notNull(),
	notes: text(),
}, (table) => [
	index("idx_content_skill_skill").using("btree", table.skillId.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.contentNodeId],
			foreignColumns: [contentNodesInContent.id],
			name: "content_skill_maps_content_node_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.skillId],
			foreignColumns: [skillsInContent.id],
			name: "content_skill_maps_skill_id_fkey"
		}).onDelete("restrict"),
	unique("content_skill_maps_map_code_key").on(table.mapCode),
	unique("content_skill_maps_content_node_id_skill_id_key").on(table.contentNodeId, table.skillId),
]);

export const skillDependenciesInContent = content.table("skill_dependencies", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity({ name: "content.skill_dependencies_id_seq", startWith: 1, increment: 1, minValue: 1, cache: 1 }),
	dependencyCode: varchar("dependency_code", { length: 100 }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	skillId: bigint("skill_id", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	prerequisiteSkillId: bigint("prerequisite_skill_id", { mode: "number" }).notNull(),
	relationType: dependencyTypeInContent("relation_type").default('REQUIRED').notNull(),
	importance: importanceLevelInContent().default('HIGH').notNull(),
	reasonMn: text("reason_mn").notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	evidenceSourceMaterialId: bigint("evidence_source_material_id", { mode: "number" }),
	status: reviewStatusInContent().default('DRAFT').notNull(),
	notes: text(),
}, (table) => [
	index("idx_dependency_prerequisite").using("btree", table.prerequisiteSkillId.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.skillId],
			foreignColumns: [skillsInContent.id],
			name: "skill_dependencies_skill_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.prerequisiteSkillId],
			foreignColumns: [skillsInContent.id],
			name: "skill_dependencies_prerequisite_skill_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.evidenceSourceMaterialId],
			foreignColumns: [sourceMaterialsInContent.id],
			name: "skill_dependencies_evidence_source_material_id_fkey"
		}).onDelete("restrict"),
	unique("skill_dependencies_dependency_code_key").on(table.dependencyCode),
	unique("skill_dependencies_skill_id_prerequisite_skill_id_key").on(table.prerequisiteSkillId, table.skillId),
	check("skill_dependencies_check", sql`skill_id <> prerequisite_skill_id`),
]);

export const tasksInLearning = learning.table("tasks", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity({ name: "learning.tasks_id_seq", startWith: 1, increment: 1, minValue: 1, cache: 1 }),
	taskCode: varchar("task_code", { length: 150 }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	skillId: bigint("skill_id", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	prerequisiteSkillId: bigint("prerequisite_skill_id", { mode: "number" }),
	levelCode: varchar("level_code", { length: 30 }).notNull(),
	difficulty: smallint(),
	taskType: varchar("task_type", { length: 100 }),
	instructionMn: text("instruction_mn"),
	questionMn: text("question_mn").notNull(),
	materialMn: text("material_mn"),
	answerGuideMn: text("answer_guide_mn"),
	maxScore: numeric("max_score", { precision: 8, scale:  2 }),
	estimatedMinutes: smallint("estimated_minutes"),
	retryTaskCode: varchar("retry_task_code", { length: 150 }),
	nextTaskCode: varchar("next_task_code", { length: 150 }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	sourceMaterialId: bigint("source_material_id", { mode: "number" }),
	status: reviewStatusInContent().default('DRAFT').notNull(),
}, (table) => [
	index("idx_learning_tasks_skill_level").using("btree", table.skillId.asc().nullsLast().op("int8_ops"), table.levelCode.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.skillId],
			foreignColumns: [skillsInContent.id],
			name: "tasks_skill_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.prerequisiteSkillId],
			foreignColumns: [skillsInContent.id],
			name: "tasks_prerequisite_skill_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.sourceMaterialId],
			foreignColumns: [sourceMaterialsInContent.id],
			name: "tasks_source_material_id_fkey"
		}).onDelete("restrict"),
	unique("tasks_task_code_key").on(table.taskCode),
	check("tasks_difficulty_check", sql`(difficulty >= 1) AND (difficulty <= 5)`),
	check("tasks_max_score_check", sql`max_score > (0)::numeric`),
	check("tasks_estimated_minutes_check", sql`estimated_minutes > 0`),
]);

export const changeLogsInAudit = audit.table("change_logs", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity({ name: "audit.change_logs_id_seq", startWith: 1, increment: 1, minValue: 1, cache: 1 }),
	schemaName: varchar("schema_name", { length: 100 }).notNull(),
	tableName: varchar("table_name", { length: 100 }).notNull(),
	recordPk: text("record_pk").notNull(),
	action: varchar({ length: 20 }).notNull(),
	changedBy: varchar("changed_by", { length: 200 }),
	changedAt: timestamp("changed_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	oldData: jsonb("old_data"),
	newData: jsonb("new_data"),
	importJobId: uuid("import_job_id"),
}, (table) => [
	index("idx_audit_record").using("btree", table.schemaName.asc().nullsLast().op("text_ops"), table.tableName.asc().nullsLast().op("text_ops"), table.recordPk.asc().nullsLast().op("text_ops"), table.changedAt.desc().nullsFirst().op("text_ops")),
	foreignKey({
			columns: [table.importJobId],
			foreignColumns: [importJobsInStaging.id],
			name: "change_logs_import_job_id_fkey"
		}).onDelete("set null"),
]);

export const importJobsInStaging = staging.table("import_jobs", {
	id: uuid().primaryKey().notNull(),
	importType: varchar("import_type", { length: 50 }).notNull(),
	originalFilename: text("original_filename").notNull(),
	status: importStatusInStaging().default('UPLOADED').notNull(),
	totalRows: integer("total_rows").default(0).notNull(),
	validRows: integer("valid_rows").default(0).notNull(),
	invalidRows: integer("invalid_rows").default(0).notNull(),
	createdBy: varchar("created_by", { length: 200 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	approvedBy: varchar("approved_by", { length: 200 }),
	approvedAt: timestamp("approved_at", { withTimezone: true, mode: 'string' }),
	completedAt: timestamp("completed_at", { withTimezone: true, mode: 'string' }),
	summary: jsonb().default({}).notNull(),
}, (table) => [
	check("import_jobs_total_rows_check", sql`total_rows >= 0`),
	check("import_jobs_valid_rows_check", sql`valid_rows >= 0`),
	check("import_jobs_invalid_rows_check", sql`invalid_rows >= 0`),
]);

export const importRowsInStaging = staging.table("import_rows", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity({ name: "staging.import_rows_id_seq", startWith: 1, increment: 1, minValue: 1, cache: 1 }),
	importJobId: uuid("import_job_id").notNull(),
	sheetName: varchar("sheet_name", { length: 100 }).notNull(),
	rowNumber: integer("row_number").notNull(),
	rowData: jsonb("row_data").notNull(),
	validationStatus: varchar("validation_status", { length: 20 }).default('PENDING').notNull(),
	validationErrors: jsonb("validation_errors").default([]).notNull(),
}, (table) => [
	index("idx_import_rows_job_status").using("btree", table.importJobId.asc().nullsLast().op("uuid_ops"), table.validationStatus.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.importJobId],
			foreignColumns: [importJobsInStaging.id],
			name: "import_rows_import_job_id_fkey"
		}).onDelete("cascade"),
	unique("import_rows_import_job_id_sheet_name_row_number_key").on(table.importJobId, table.rowNumber, table.sheetName),
	check("import_rows_row_number_check", sql`row_number > 0`),
]);

export const classesInCore = core.table("classes", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity({ name: "core.classes_id_seq", startWith: 1, increment: 1, minValue: 1, cache: 1 }),
	classCode: varchar("class_code", { length: 50 }).notNull(),
	gradeLevelId: smallint("grade_level_id").notNull(),
	nameMn: varchar("name_mn", { length: 100 }).notNull(),
	schoolYear: varchar("school_year", { length: 20 }).notNull(),
	isActive: boolean("is_active").default(true).notNull(),
	// Whether this row describes a real person or one invented to make the
	// system demonstrable. Mock rows are going to sit beside real ones for a
	// while, and a demo that cannot be told from a register is how invented
	// children end up in a report. Everything imported or entered is REAL
	// unless something says otherwise.
	dataOrigin: varchar("data_origin", { length: 10 }).default('REAL').notNull(),
}, (table) => [
	foreignKey({
			columns: [table.gradeLevelId],
			foreignColumns: [gradeLevelsInCore.id],
			name: "classes_grade_level_id_fkey"
		}),
	unique("classes_class_code_key").on(table.classCode),
	check("classes_data_origin_check",
		sql`(data_origin)::text = ANY ((ARRAY['REAL'::character varying, 'MOCK'::character varying])::text[])`),
]);

export const studentsInCore = core.table("students", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity({ name: "core.students_id_seq", startWith: 1, increment: 1, minValue: 1, cache: 1 }),
	studentCode: varchar("student_code", { length: 100 }).notNull(),
	// What the source system called this student, kept verbatim. The imported
	// codes are free text a student typed, so they cannot be an identity - but
	// without them a later reconciliation against real registration numbers is
	// guesswork rather than a lookup.
	externalCode: varchar("external_code", { length: 200 }),
	displayName: varchar("display_name", { length: 300 }).notNull(),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	// Whether this row describes a real person or one invented to make the
	// system demonstrable. Mock rows are going to sit beside real ones for a
	// while, and a demo that cannot be told from a register is how invented
	// children end up in a report. Everything imported or entered is REAL
	// unless something says otherwise.
	dataOrigin: varchar("data_origin", { length: 10 }).default('REAL').notNull(),
}, (table) => [
	unique("students_student_code_key").on(table.studentCode),
	check("students_data_origin_check",
		sql`(data_origin)::text = ANY ((ARRAY['REAL'::character varying, 'MOCK'::character varying])::text[])`),
]);

export const diagnosticItemsInAssessment = assessment.table("diagnostic_items", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity({ name: "assessment.diagnostic_items_id_seq", startWith: 1, increment: 1, minValue: 1, cache: 1 }),
	itemCode: varchar("item_code", { length: 100 }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	subjectId: bigint("subject_id", { mode: "number" }).notNull(),
	// Nullable since the CEFR bank: an item sits on a school grade or on a
	// proficiency level, never necessarily both. The check below requires one.
	gradeLevelId: smallint("grade_level_id"),
	proficiencyLevelId: smallint("proficiency_level_id"),
	// Nullable too: the imported bank names a domain (Grammar, Listening)
	// before anyone has mapped it onto content.skills.
	skillId: bigint("skill_id", { mode: "number" }),
	itemOrder: smallint("item_order").notNull(),
	titleMn: varchar("title_mn", { length: 500 }).notNull(),
	domainMn: varchar("domain_mn", { length: 200 }),
	maxScore: numeric("max_score", { precision: 8, scale:  2 }).notNull(),
	rubricMn: text("rubric_mn"),
	answerSource: answerSourceInAssessment("answer_source").default('UNKNOWN').notNull(),
	status: reviewStatusInContent().default('DRAFT').notNull(),
}, (table) => [
	check("diagnostic_items_level_present_check",
		sql`grade_level_id IS NOT NULL OR proficiency_level_id IS NOT NULL`),
	foreignKey({
			columns: [table.proficiencyLevelId],
			foreignColumns: [proficiencyLevelsInContent.id],
			name: "diagnostic_items_proficiency_level_id_fkey"
		}),
	foreignKey({
			columns: [table.subjectId],
			foreignColumns: [subjectsInCore.id],
			name: "diagnostic_items_subject_id_fkey"
		}),
	foreignKey({
			columns: [table.gradeLevelId],
			foreignColumns: [gradeLevelsInCore.id],
			name: "diagnostic_items_grade_level_id_fkey"
		}),
	foreignKey({
			columns: [table.skillId],
			foreignColumns: [skillsInContent.id],
			name: "diagnostic_items_skill_id_fkey"
		}).onDelete("restrict"),
	unique("diagnostic_items_item_code_key").on(table.itemCode),
	check("diagnostic_items_item_order_check", sql`item_order > 0`),
	check("diagnostic_items_max_score_check", sql`max_score > (0)::numeric`),
]);

export const diagnosticAttemptsInAssessment = assessment.table("diagnostic_attempts", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity({ name: "assessment.diagnostic_attempts_id_seq", startWith: 1, increment: 1, minValue: 1, cache: 1 }),
	attemptCode: varchar("attempt_code", { length: 150 }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	studentId: bigint("student_id", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	subjectId: bigint("subject_id", { mode: "number" }).notNull(),
	gradeLevelId: smallint("grade_level_id").notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	sourceMaterialId: bigint("source_material_id", { mode: "number" }),
	attemptedAt: timestamp("attempted_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	status: varchar({ length: 30 }).default('SUBMITTED').notNull(),
	totalScore: numeric("total_score", { precision: 10, scale:  2 }),
	totalMaxScore: numeric("total_max_score", { precision: 10, scale:  2 }),
	scorePercent: numeric("score_percent", { precision: 5, scale:  2 }),
}, (table) => [
	index("idx_diagnostic_attempt_student").using("btree", table.studentId.asc().nullsLast().op("int8_ops"), table.attemptedAt.desc().nullsFirst().op("int8_ops")),
	foreignKey({
			columns: [table.studentId],
			foreignColumns: [studentsInCore.id],
			name: "diagnostic_attempts_student_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.subjectId],
			foreignColumns: [subjectsInCore.id],
			name: "diagnostic_attempts_subject_id_fkey"
		}),
	foreignKey({
			columns: [table.gradeLevelId],
			foreignColumns: [gradeLevelsInCore.id],
			name: "diagnostic_attempts_grade_level_id_fkey"
		}),
	foreignKey({
			columns: [table.sourceMaterialId],
			foreignColumns: [sourceMaterialsInContent.id],
			name: "diagnostic_attempts_source_material_id_fkey"
		}).onDelete("restrict"),
	unique("diagnostic_attempts_attempt_code_key").on(table.attemptCode),
	check("diagnostic_attempts_score_percent_check", sql`(score_percent >= (0)::numeric) AND (score_percent <= (100)::numeric)`),
]);

export const masteryChecksInLearning = learning.table("mastery_checks", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity({ name: "learning.mastery_checks_id_seq", startWith: 1, increment: 1, minValue: 1, cache: 1 }),
	checkCode: varchar("check_code", { length: 150 }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	skillId: bigint("skill_id", { mode: "number" }).notNull(),
	itemNo: smallint("item_no").notNull(),
	itemType: varchar("item_type", { length: 100 }),
	questionMn: text("question_mn").notNull(),
	materialMn: text("material_mn"),
	answerGuideMn: text("answer_guide_mn"),
	maxScore: numeric("max_score", { precision: 8, scale:  2 }).notNull(),
	passRuleMn: varchar("pass_rule_mn", { length: 200 }),
	actionIfPassMn: text("action_if_pass_mn"),
	actionIfPartialMn: text("action_if_partial_mn"),
	actionIfFailMn: text("action_if_fail_mn"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	sourceMaterialId: bigint("source_material_id", { mode: "number" }),
	status: reviewStatusInContent().default('DRAFT').notNull(),
}, (table) => [
	index("idx_mastery_checks_skill").using("btree", table.skillId.asc().nullsLast().op("int2_ops"), table.itemNo.asc().nullsLast().op("int2_ops")),
	foreignKey({
			columns: [table.skillId],
			foreignColumns: [skillsInContent.id],
			name: "mastery_checks_skill_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.sourceMaterialId],
			foreignColumns: [sourceMaterialsInContent.id],
			name: "mastery_checks_source_material_id_fkey"
		}).onDelete("restrict"),
	unique("mastery_checks_check_code_key").on(table.checkCode),
	check("mastery_checks_item_no_check", sql`item_no > 0`),
	check("mastery_checks_max_score_check", sql`max_score > (0)::numeric`),
]);

export const dailyLessonsInLearning = learning.table("daily_lessons", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity({ name: "learning.daily_lessons_id_seq", startWith: 1, increment: 1, minValue: 1, cache: 1 }),
	lessonCode: varchar("lesson_code", { length: 180 }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	coreSkillId: bigint("core_skill_id", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	recoverySkillId: bigint("recovery_skill_id", { mode: "number" }),
	lessonType: varchar("lesson_type", { length: 30 }).notNull(),
	learningGoalMn: text("learning_goal_mn"),
	rememberMn: text("remember_mn"),
	workedExampleMn: text("worked_example_mn"),
	guidedPracticeMn: text("guided_practice_mn"),
	independentPracticeMn: text("independent_practice_mn"),
	masteryCheckReference: varchar("mastery_check_reference", { length: 200 }),
	estimatedMinutes: smallint("estimated_minutes"),
	studentMessageMn: text("student_message_mn"),
	nextIfPass: varchar("next_if_pass", { length: 180 }),
	nextIfPartial: varchar("next_if_partial", { length: 180 }),
	nextIfFail: varchar("next_if_fail", { length: 180 }),
	printReady: boolean("print_ready").default(false).notNull(),
	webReady: boolean("web_ready").default(false).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	sourceMaterialId: bigint("source_material_id", { mode: "number" }),
	status: reviewStatusInContent().default('DRAFT').notNull(),
}, (table) => [
	index("idx_daily_lessons_skill_type").using("btree", table.coreSkillId.asc().nullsLast().op("int8_ops"), table.lessonType.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.coreSkillId],
			foreignColumns: [skillsInContent.id],
			name: "daily_lessons_core_skill_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.recoverySkillId],
			foreignColumns: [skillsInContent.id],
			name: "daily_lessons_recovery_skill_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.sourceMaterialId],
			foreignColumns: [sourceMaterialsInContent.id],
			name: "daily_lessons_source_material_id_fkey"
		}).onDelete("restrict"),
	unique("daily_lessons_lesson_code_key").on(table.lessonCode),
	check("daily_lessons_estimated_minutes_check", sql`estimated_minutes > 0`),
]);

export const webDiagnosticSubmissionsInAssessment = assessment.table("web_diagnostic_submissions", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity({ name: "assessment.web_diagnostic_submissions_id_seq", startWith: 1, increment: 1, minValue: 1, cache: 1 }),
	submissionCode: uuid("submission_code").notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	studentId: bigint("student_id", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	subjectId: bigint("subject_id", { mode: "number" }).notNull(),
	gradeLevelId: smallint("grade_level_id").notNull(),
	status: varchar({ length: 30 }).default('PENDING_REVIEW').notNull(),
	startedAt: timestamp("started_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	submittedAt: timestamp("submitted_at", { withTimezone: true, mode: 'string' }),
	reviewedAt: timestamp("reviewed_at", { withTimezone: true, mode: 'string' }),
	reviewedBy: varchar("reviewed_by", { length: 200 }),
}, (table) => [
	index("idx_web_diagnostic_student").using("btree", table.studentId.asc().nullsLast().op("int8_ops"), table.submittedAt.desc().nullsFirst().op("int8_ops")),
	foreignKey({
			columns: [table.studentId],
			foreignColumns: [studentsInCore.id],
			name: "web_diagnostic_submissions_student_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.subjectId],
			foreignColumns: [subjectsInCore.id],
			name: "web_diagnostic_submissions_subject_id_fkey"
		}),
	foreignKey({
			columns: [table.gradeLevelId],
			foreignColumns: [gradeLevelsInCore.id],
			name: "web_diagnostic_submissions_grade_level_id_fkey"
		}),
	unique("web_diagnostic_submissions_submission_code_key").on(table.submissionCode),
	check("web_diagnostic_submissions_status_check", sql`(status)::text = ANY ((ARRAY['IN_PROGRESS'::character varying, 'PENDING_REVIEW'::character varying, 'REVIEWED'::character varying, 'CANCELLED'::character varying])::text[])`),
]);

export const sourceMaterialGradesInContent = content.table("source_material_grades", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	sourceMaterialId: bigint("source_material_id", { mode: "number" }).notNull(),
	gradeLevelId: smallint("grade_level_id").notNull(),
}, (table) => [
	foreignKey({
			columns: [table.sourceMaterialId],
			foreignColumns: [sourceMaterialsInContent.id],
			name: "source_material_grades_source_material_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.gradeLevelId],
			foreignColumns: [gradeLevelsInCore.id],
			name: "source_material_grades_grade_level_id_fkey"
		}),
	primaryKey({ columns: [table.gradeLevelId, table.sourceMaterialId], name: "source_material_grades_pkey"}),
]);

export const studentEnrollmentsInCore = core.table("student_enrollments", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	studentId: bigint("student_id", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	classId: bigint("class_id", { mode: "number" }).notNull(),
	enrolledAt: date("enrolled_at").default(sql`CURRENT_DATE`).notNull(),
	isActive: boolean("is_active").default(true).notNull(),
}, (table) => [
	index("idx_enrollments_class").using("btree", table.classId.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.studentId],
			foreignColumns: [studentsInCore.id],
			name: "student_enrollments_student_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.classId],
			foreignColumns: [classesInCore.id],
			name: "student_enrollments_class_id_fkey"
		}).onDelete("restrict"),
	primaryKey({ columns: [table.classId, table.studentId], name: "student_enrollments_pkey"}),
]);

export const diagnosticResponsesInAssessment = assessment.table("diagnostic_responses", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	attemptId: bigint("attempt_id", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	diagnosticItemId: bigint("diagnostic_item_id", { mode: "number" }).notNull(),
	awardedScore: numeric("awarded_score", { precision: 8, scale:  2 }).notNull(),
	maxScore: numeric("max_score", { precision: 8, scale:  2 }).notNull(),
	scorePercent: numeric("score_percent", { precision: 5, scale:  2 }).notNull(),
}, (table) => [
	index("idx_diagnostic_response_item").using("btree", table.diagnosticItemId.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.attemptId],
			foreignColumns: [diagnosticAttemptsInAssessment.id],
			name: "diagnostic_responses_attempt_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.diagnosticItemId],
			foreignColumns: [diagnosticItemsInAssessment.id],
			name: "diagnostic_responses_diagnostic_item_id_fkey"
		}).onDelete("restrict"),
	primaryKey({ columns: [table.attemptId, table.diagnosticItemId], name: "diagnostic_responses_pkey"}),
	check("diagnostic_responses_awarded_score_check", sql`awarded_score >= (0)::numeric`),
	check("diagnostic_responses_max_score_check", sql`max_score > (0)::numeric`),
	check("diagnostic_responses_score_percent_check", sql`(score_percent >= (0)::numeric) AND (score_percent <= (100)::numeric)`),
]);

export const webDiagnosticAnswersInAssessment = assessment.table("web_diagnostic_answers", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	submissionId: bigint("submission_id", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	diagnosticItemId: bigint("diagnostic_item_id", { mode: "number" }).notNull(),
	responseText: text("response_text").notNull(),
	awardedScore: numeric("awarded_score", { precision: 8, scale:  2 }),
	reviewerNote: text("reviewer_note"),
}, (table) => [
	foreignKey({
			columns: [table.submissionId],
			foreignColumns: [webDiagnosticSubmissionsInAssessment.id],
			name: "web_diagnostic_answers_submission_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.diagnosticItemId],
			foreignColumns: [diagnosticItemsInAssessment.id],
			name: "web_diagnostic_answers_diagnostic_item_id_fkey"
		}).onDelete("restrict"),
	primaryKey({ columns: [table.diagnosticItemId, table.submissionId], name: "web_diagnostic_answers_pkey"}),
	check("web_diagnostic_answers_awarded_score_check", sql`(awarded_score IS NULL) OR (awarded_score >= (0)::numeric)`),
]);

export const studentSkillMasteryInLearning = learning.table("student_skill_mastery", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	studentId: bigint("student_id", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	skillId: bigint("skill_id", { mode: "number" }).notNull(),
	masteryStatus: varchar("mastery_status", { length: 30 }).notNull(),
	masteryScore: numeric("mastery_score", { precision: 5, scale:  2 }),
	attemptCount: integer("attempt_count").default(0).notNull(),
	lastAssessedAt: timestamp("last_assessed_at", { withTimezone: true, mode: 'string' }),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	// Who decided this. A primary-grade level is a teacher's judgement about
	// work done in a notebook, and it must not be indistinguishable from a
	// figure the system computed - a teacher reading a screen is entitled to
	// know which of the two they are looking at.
	source: varchar({ length: 20 }).default('AUTO').notNull(),
	// The teacher's username rather than a foreign key, matching
	// audit.change_logs.changed_by. A record of who judged a child's work
	// should survive that teacher's account being removed, and core.teachers
	// lives in identity.ts which already imports from here - a key back the
	// other way would close an import cycle.
	assessedBy: varchar("assessed_by", { length: 200 }),
}, (table) => [
	index("idx_student_mastery_status").using("btree", table.studentId.asc().nullsLast().op("int8_ops"), table.masteryStatus.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.studentId],
			foreignColumns: [studentsInCore.id],
			name: "student_skill_mastery_student_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.skillId],
			foreignColumns: [skillsInContent.id],
			name: "student_skill_mastery_skill_id_fkey"
		}).onDelete("restrict"),
	primaryKey({ columns: [table.skillId, table.studentId], name: "student_skill_mastery_pkey"}),
	check("student_skill_mastery_source_check",
		sql`(source)::text = ANY ((ARRAY['AUTO'::character varying, 'TEACHER'::character varying])::text[])`),
	check("student_skill_mastery_mastery_status_check", sql`(mastery_status)::text = ANY ((ARRAY['NOT_ASSESSED'::character varying, 'GAP'::character varying, 'DEVELOPING'::character varying, 'MASTERED'::character varying])::text[])`),
	check("student_skill_mastery_mastery_score_check", sql`(mastery_score >= (0)::numeric) AND (mastery_score <= (100)::numeric)`),
	check("student_skill_mastery_attempt_count_check", sql`attempt_count >= 0`),
]);
export const vContentSkillMapInContent = content.view("v_content_skill_map", {	contentCode: varchar("content_code", { length: 100 }),
	contentName: varchar("content_name", { length: 500 }),
	skillCode: varchar("skill_code", { length: 120 }),
	skillName: varchar("skill_name", { length: 500 }),
	isPrimary: boolean("is_primary"),
	status: reviewStatusInContent(),
	evidenceNote: text("evidence_note"),
}).as(sql`SELECT cn.content_code, cn.name_mn AS content_name, sk.skill_code, sk.name_mn AS skill_name, csm.is_primary, csm.status, csm.evidence_note FROM content.content_skill_maps csm JOIN content.content_nodes cn ON cn.id = csm.content_node_id JOIN content.skills sk ON sk.id = csm.skill_id`);

export const vSourceOutlineInContent = content.view("v_source_outline", {	sourceCode: varchar("source_code", { length: 100 }),
	sourceTitle: varchar("source_title", { length: 500 }),
	subjectCode: varchar("subject_code", { length: 30 }),
	outlineCode: varchar("outline_code", { length: 100 }),
	parentOutlineCode: varchar("parent_outline_code", { length: 100 }),
	printedNumber: varchar("printed_number", { length: 50 }),
	nodeType: outlineNodeTypeInContent("node_type"),
	title: text(),
	pageFrom: integer("page_from"),
	pageTo: integer("page_to"),
	sequenceNo: integer("sequence_no"),
	status: reviewStatusInContent(),
	dataQualityStatus: dataQualityStatusInContent("data_quality_status"),
	notes: text(),
}).as(sql`SELECT sm.source_code, sm.title AS source_title, s.code AS subject_code, son.outline_code, p.outline_code AS parent_outline_code, son.printed_number, son.node_type, son.title, son.page_from, son.page_to, son.sequence_no, son.status, son.data_quality_status, son.notes FROM content.source_outline_nodes son JOIN content.source_materials sm ON sm.id = son.source_material_id JOIN core.subjects s ON s.id = sm.subject_id LEFT JOIN content.source_outline_nodes p ON p.id = son.parent_id`);

export const vSkillDependenciesInContent = content.view("v_skill_dependencies", {	currentSkillCode: varchar("current_skill_code", { length: 120 }),
	currentSkillName: varchar("current_skill_name", { length: 500 }),
	prerequisiteSkillCode: varchar("prerequisite_skill_code", { length: 120 }),
	prerequisiteSkillName: varchar("prerequisite_skill_name", { length: 500 }),
	relationType: dependencyTypeInContent("relation_type"),
	importance: importanceLevelInContent(),
	reasonMn: text("reason_mn"),
	status: reviewStatusInContent(),
}).as(sql`SELECT sk.skill_code AS current_skill_code, sk.name_mn AS current_skill_name, pre.skill_code AS prerequisite_skill_code, pre.name_mn AS prerequisite_skill_name, sd.relation_type, sd.importance, sd.reason_mn, sd.status FROM content.skill_dependencies sd JOIN content.skills sk ON sk.id = sd.skill_id JOIN content.skills pre ON pre.id = sd.prerequisite_skill_id`);

export const vStudentSkillStatusInLearning = learning.view("v_student_skill_status", {	studentCode: varchar("student_code", { length: 100 }),
	displayName: varchar("display_name", { length: 300 }),
	subjectCode: varchar("subject_code", { length: 30 }),
	gradeNumber: smallint("grade_number"),
	skillCode: varchar("skill_code", { length: 120 }),
	skillName: varchar("skill_name", { length: 500 }),
	masteryStatus: varchar("mastery_status", { length: 30 }),
	masteryScore: numeric("mastery_score", { precision: 5, scale:  2 }),
	lastAssessedAt: timestamp("last_assessed_at", { withTimezone: true, mode: 'string' }),
}).as(sql`SELECT st.student_code, st.display_name, su.code AS subject_code, gl.grade_number, sk.skill_code, sk.name_mn AS skill_name, ssm.mastery_status, ssm.mastery_score, ssm.last_assessed_at FROM learning.student_skill_mastery ssm JOIN core.students st ON st.id = ssm.student_id JOIN content.skills sk ON sk.id = ssm.skill_id JOIN core.subjects su ON su.id = sk.subject_id LEFT JOIN core.grade_levels gl ON gl.id = sk.grade_level_id`);

export const vMongolianGrade9CatalogInLearning = learning.view("v_mongolian_grade9_catalog", {	skillCode: varchar("skill_code", { length: 120 }),
	skillName: varchar("skill_name", { length: 500 }),
	learningOutcomeMn: text("learning_outcome_mn"),
	prerequisiteCode: varchar("prerequisite_code", { length: 120 }),
	prerequisiteName: varchar("prerequisite_name", { length: 500 }),
	taskCount: integer("task_count"),
	masteryCheckCount: integer("mastery_check_count"),
	lessonCount: integer("lesson_count"),
	status: reviewStatusInContent(),
}).as(sql`SELECT sk.skill_code, sk.name_mn AS skill_name, sk.learning_outcome_mn, pre.skill_code AS prerequisite_code, pre.name_mn AS prerequisite_name, count(DISTINCT t.id)::integer AS task_count, count(DISTINCT mc.id)::integer AS mastery_check_count, count(DISTINCT dl.id)::integer AS lesson_count, sk.status FROM content.skills sk JOIN core.subjects su ON su.id = sk.subject_id AND su.code::text = 'MGL'::text JOIN core.grade_levels gl ON gl.id = sk.grade_level_id AND gl.grade_number = 9 LEFT JOIN content.skill_dependencies sd ON sd.skill_id = sk.id LEFT JOIN content.skills pre ON pre.id = sd.prerequisite_skill_id LEFT JOIN learning.tasks t ON t.skill_id = sk.id LEFT JOIN learning.mastery_checks mc ON mc.skill_id = sk.id LEFT JOIN learning.daily_lessons dl ON dl.core_skill_id = sk.id GROUP BY sk.skill_code, sk.name_mn, sk.learning_outcome_mn, pre.skill_code, pre.name_mn, sk.status`);