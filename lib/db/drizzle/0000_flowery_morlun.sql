-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations
/*
CREATE SCHEMA "content";
--> statement-breakpoint
CREATE SCHEMA "assessment";
--> statement-breakpoint
CREATE SCHEMA "learning";
--> statement-breakpoint
CREATE SCHEMA "core";
--> statement-breakpoint
CREATE SCHEMA "staging";
--> statement-breakpoint
CREATE SCHEMA "audit";
--> statement-breakpoint
CREATE TYPE "content"."content_level_type" AS ENUM('DOMAIN', 'UNIT', 'TOPIC', 'SUBTOPIC', 'SEGMENT');--> statement-breakpoint
CREATE TYPE "content"."data_quality_status" AS ENUM('INCOMPLETE', 'COMPLETE', 'VERIFIED');--> statement-breakpoint
CREATE TYPE "content"."dependency_type" AS ENUM('REQUIRED', 'RECOMMENDED', 'RELATED');--> statement-breakpoint
CREATE TYPE "content"."importance_level" AS ENUM('HIGH', 'MEDIUM', 'LOW');--> statement-breakpoint
CREATE TYPE "content"."outline_node_type" AS ENUM('CHAPTER', 'SECTION', 'SUBSECTION', 'EXAMPLE_SET', 'EXERCISE_SET', 'REVIEW', 'ASSESSMENT', 'OTHER');--> statement-breakpoint
CREATE TYPE "content"."review_status" AS ENUM('DRAFT', 'IN_REVIEW', 'APPROVED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "content"."source_relation_type" AS ENUM('PRIMARY', 'CURRICULUM', 'EXPLAINS', 'PRACTICES', 'ASSESSES', 'RELATED');--> statement-breakpoint
CREATE TYPE "staging"."import_status" AS ENUM('UPLOADED', 'VALIDATING', 'INVALID', 'READY', 'APPROVED', 'IMPORTED', 'FAILED');--> statement-breakpoint
CREATE TABLE "core"."subjects" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "core"."core.subjects_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"code" varchar(30) NOT NULL,
	"name_mn" varchar(100) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "subjects_code_key" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "core"."grade_levels" (
	"id" smallint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "core"."core.grade_levels_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 32767 START WITH 1 CACHE 1),
	"grade_number" smallint NOT NULL,
	"name_mn" varchar(50) NOT NULL,
	CONSTRAINT "grade_levels_grade_number_key" UNIQUE("grade_number"),
	CONSTRAINT "grade_levels_grade_number_check" CHECK ((grade_number >= 1) AND (grade_number <= 11))
);
--> statement-breakpoint
CREATE TABLE "content"."source_materials" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "content"."content.source_materials_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"source_code" varchar(100) NOT NULL,
	"subject_id" bigint NOT NULL,
	"title" varchar(500),
	"material_type" varchar(50) NOT NULL,
	"authors" text,
	"publisher" varchar(300),
	"published_year" smallint,
	"edition" varchar(100),
	"total_pages" integer,
	"status" "content"."review_status" DEFAULT 'DRAFT' NOT NULL,
	"data_quality_status" "content"."data_quality_status" DEFAULT 'INCOMPLETE' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_materials_source_code_key" UNIQUE("source_code"),
	CONSTRAINT "source_materials_published_year_check" CHECK ((published_year >= 1900) AND (published_year <= 2200)),
	CONSTRAINT "source_materials_total_pages_check" CHECK (total_pages > 0)
);
--> statement-breakpoint
CREATE TABLE "content"."source_outline_nodes" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "content"."content.source_outline_nodes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"source_material_id" bigint NOT NULL,
	"parent_id" bigint,
	"outline_code" varchar(100) NOT NULL,
	"printed_number" varchar(50),
	"node_type" "content"."outline_node_type" NOT NULL,
	"title" text NOT NULL,
	"page_from" integer,
	"page_to" integer,
	"sequence_no" integer NOT NULL,
	"status" "content"."review_status" DEFAULT 'DRAFT' NOT NULL,
	"data_quality_status" "content"."data_quality_status" DEFAULT 'INCOMPLETE' NOT NULL,
	"notes" text,
	CONSTRAINT "source_outline_nodes_source_material_id_outline_code_key" UNIQUE("outline_code","source_material_id"),
	CONSTRAINT "source_outline_nodes_source_material_id_sequence_no_key" UNIQUE("sequence_no","source_material_id"),
	CONSTRAINT "source_outline_nodes_page_from_check" CHECK (page_from > 0),
	CONSTRAINT "source_outline_nodes_page_to_check" CHECK (page_to > 0),
	CONSTRAINT "source_outline_nodes_sequence_no_check" CHECK (sequence_no > 0),
	CONSTRAINT "source_outline_nodes_check" CHECK ((parent_id IS NULL) OR (parent_id <> id)),
	CONSTRAINT "source_outline_nodes_check1" CHECK ((page_from IS NULL) OR (page_to IS NULL) OR (page_from <= page_to))
);
--> statement-breakpoint
CREATE TABLE "content"."content_nodes" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "content"."content.content_nodes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"subject_id" bigint NOT NULL,
	"parent_id" bigint,
	"content_code" varchar(100) NOT NULL,
	"level_type" "content"."content_level_type" NOT NULL,
	"name_mn" varchar(500) NOT NULL,
	"description_mn" text,
	"grade_from_id" smallint,
	"grade_to_id" smallint,
	"sequence_no" integer NOT NULL,
	"status" "content"."review_status" DEFAULT 'DRAFT' NOT NULL,
	"data_quality_status" "content"."data_quality_status" DEFAULT 'INCOMPLETE' NOT NULL,
	"notes" text,
	CONSTRAINT "content_nodes_content_code_key" UNIQUE("content_code"),
	CONSTRAINT "content_nodes_sequence_no_check" CHECK (sequence_no > 0),
	CONSTRAINT "content_nodes_check" CHECK ((parent_id IS NULL) OR (parent_id <> id))
);
--> statement-breakpoint
CREATE TABLE "content"."content_source_alignments" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "content"."content.content_source_alignments_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"alignment_code" varchar(100) NOT NULL,
	"content_node_id" bigint NOT NULL,
	"source_material_id" bigint NOT NULL,
	"source_outline_node_id" bigint,
	"page_from" integer,
	"page_to" integer,
	"relation_type" "content"."source_relation_type" NOT NULL,
	"evidence_note" text,
	"status" "content"."review_status" DEFAULT 'DRAFT' NOT NULL,
	"notes" text,
	CONSTRAINT "content_source_alignments_alignment_code_key" UNIQUE("alignment_code"),
	CONSTRAINT "content_source_alignments_page_from_check" CHECK (page_from > 0),
	CONSTRAINT "content_source_alignments_page_to_check" CHECK (page_to > 0),
	CONSTRAINT "content_source_alignments_check" CHECK ((page_from IS NULL) OR (page_to IS NULL) OR (page_from <= page_to))
);
--> statement-breakpoint
CREATE TABLE "content"."skills" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "content"."content.skills_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"skill_code" varchar(120) NOT NULL,
	"subject_id" bigint NOT NULL,
	"grade_level_id" smallint,
	"name_mn" varchar(500) NOT NULL,
	"description_mn" text,
	"learning_outcome_mn" text,
	"difficulty" smallint,
	"status" "content"."review_status" DEFAULT 'DRAFT' NOT NULL,
	"data_quality_status" "content"."data_quality_status" DEFAULT 'INCOMPLETE' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "skills_skill_code_key" UNIQUE("skill_code"),
	CONSTRAINT "skills_difficulty_check" CHECK ((difficulty >= 1) AND (difficulty <= 5)),
	CONSTRAINT "skills_version_check" CHECK (version > 0)
);
--> statement-breakpoint
CREATE TABLE "content"."source_versions" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "content"."content.source_versions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"source_material_id" bigint NOT NULL,
	"version_no" integer NOT NULL,
	"original_filename" text,
	"storage_key" text,
	"mime_type" varchar(100),
	"file_size_bytes" bigint,
	"checksum_sha256" char(64),
	"status" "content"."review_status" DEFAULT 'DRAFT' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_versions_source_material_id_version_no_key" UNIQUE("source_material_id","version_no"),
	CONSTRAINT "source_versions_checksum_sha256_key" UNIQUE("checksum_sha256"),
	CONSTRAINT "source_versions_version_no_check" CHECK (version_no > 0),
	CONSTRAINT "source_versions_file_size_bytes_check" CHECK (file_size_bytes >= 0)
);
--> statement-breakpoint
CREATE TABLE "content"."content_skill_maps" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "content"."content.content_skill_maps_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"map_code" varchar(100) NOT NULL,
	"content_node_id" bigint NOT NULL,
	"skill_id" bigint NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"evidence_note" text,
	"status" "content"."review_status" DEFAULT 'DRAFT' NOT NULL,
	"notes" text,
	CONSTRAINT "content_skill_maps_map_code_key" UNIQUE("map_code"),
	CONSTRAINT "content_skill_maps_content_node_id_skill_id_key" UNIQUE("content_node_id","skill_id")
);
--> statement-breakpoint
CREATE TABLE "content"."skill_dependencies" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "content"."content.skill_dependencies_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"dependency_code" varchar(100) NOT NULL,
	"skill_id" bigint NOT NULL,
	"prerequisite_skill_id" bigint NOT NULL,
	"relation_type" "content"."dependency_type" DEFAULT 'REQUIRED' NOT NULL,
	"importance" "content"."importance_level" DEFAULT 'HIGH' NOT NULL,
	"reason_mn" text NOT NULL,
	"evidence_source_material_id" bigint,
	"status" "content"."review_status" DEFAULT 'DRAFT' NOT NULL,
	"notes" text,
	CONSTRAINT "skill_dependencies_dependency_code_key" UNIQUE("dependency_code"),
	CONSTRAINT "skill_dependencies_skill_id_prerequisite_skill_id_key" UNIQUE("prerequisite_skill_id","skill_id"),
	CONSTRAINT "skill_dependencies_check" CHECK (skill_id <> prerequisite_skill_id)
);
--> statement-breakpoint
CREATE TABLE "learning"."tasks" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "learning"."learning.tasks_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"task_code" varchar(150) NOT NULL,
	"skill_id" bigint NOT NULL,
	"prerequisite_skill_id" bigint,
	"level_code" varchar(30) NOT NULL,
	"difficulty" smallint,
	"task_type" varchar(100),
	"instruction_mn" text,
	"question_mn" text NOT NULL,
	"material_mn" text,
	"answer_guide_mn" text,
	"max_score" numeric(8, 2),
	"estimated_minutes" smallint,
	"retry_task_code" varchar(150),
	"next_task_code" varchar(150),
	"source_material_id" bigint,
	"status" "content"."review_status" DEFAULT 'DRAFT' NOT NULL,
	CONSTRAINT "tasks_task_code_key" UNIQUE("task_code"),
	CONSTRAINT "tasks_difficulty_check" CHECK ((difficulty >= 1) AND (difficulty <= 5)),
	CONSTRAINT "tasks_max_score_check" CHECK (max_score > (0)::numeric),
	CONSTRAINT "tasks_estimated_minutes_check" CHECK (estimated_minutes > 0)
);
--> statement-breakpoint
CREATE TABLE "audit"."change_logs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit"."audit.change_logs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"schema_name" varchar(100) NOT NULL,
	"table_name" varchar(100) NOT NULL,
	"record_pk" text NOT NULL,
	"action" varchar(20) NOT NULL,
	"changed_by" varchar(200),
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"old_data" jsonb,
	"new_data" jsonb,
	"import_job_id" uuid
);
--> statement-breakpoint
CREATE TABLE "staging"."import_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"import_type" varchar(50) NOT NULL,
	"original_filename" text NOT NULL,
	"status" "staging"."import_status" DEFAULT 'UPLOADED' NOT NULL,
	"total_rows" integer DEFAULT 0 NOT NULL,
	"valid_rows" integer DEFAULT 0 NOT NULL,
	"invalid_rows" integer DEFAULT 0 NOT NULL,
	"created_by" varchar(200),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_by" varchar(200),
	"approved_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "import_jobs_total_rows_check" CHECK (total_rows >= 0),
	CONSTRAINT "import_jobs_valid_rows_check" CHECK (valid_rows >= 0),
	CONSTRAINT "import_jobs_invalid_rows_check" CHECK (invalid_rows >= 0)
);
--> statement-breakpoint
CREATE TABLE "staging"."import_rows" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "staging"."staging.import_rows_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"import_job_id" uuid NOT NULL,
	"sheet_name" varchar(100) NOT NULL,
	"row_number" integer NOT NULL,
	"row_data" jsonb NOT NULL,
	"validation_status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"validation_errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "import_rows_import_job_id_sheet_name_row_number_key" UNIQUE("import_job_id","row_number","sheet_name"),
	CONSTRAINT "import_rows_row_number_check" CHECK (row_number > 0)
);
--> statement-breakpoint
CREATE TABLE "core"."classes" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "core"."core.classes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"class_code" varchar(50) NOT NULL,
	"grade_level_id" smallint NOT NULL,
	"name_mn" varchar(100) NOT NULL,
	"school_year" varchar(20) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "classes_class_code_key" UNIQUE("class_code")
);
--> statement-breakpoint
CREATE TABLE "core"."students" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "core"."core.students_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"student_code" varchar(100) NOT NULL,
	"display_name" varchar(300) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "students_student_code_key" UNIQUE("student_code")
);
--> statement-breakpoint
CREATE TABLE "assessment"."diagnostic_items" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "assessment"."assessment.diagnostic_items_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"item_code" varchar(100) NOT NULL,
	"subject_id" bigint NOT NULL,
	"grade_level_id" smallint NOT NULL,
	"skill_id" bigint NOT NULL,
	"item_order" smallint NOT NULL,
	"title_mn" varchar(500) NOT NULL,
	"domain_mn" varchar(200),
	"max_score" numeric(8, 2) NOT NULL,
	"rubric_mn" text,
	"status" "content"."review_status" DEFAULT 'DRAFT' NOT NULL,
	CONSTRAINT "diagnostic_items_item_code_key" UNIQUE("item_code"),
	CONSTRAINT "diagnostic_items_item_order_check" CHECK (item_order > 0),
	CONSTRAINT "diagnostic_items_max_score_check" CHECK (max_score > (0)::numeric)
);
--> statement-breakpoint
CREATE TABLE "assessment"."diagnostic_attempts" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "assessment"."assessment.diagnostic_attempts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"attempt_code" varchar(150) NOT NULL,
	"student_id" bigint NOT NULL,
	"subject_id" bigint NOT NULL,
	"grade_level_id" smallint NOT NULL,
	"source_material_id" bigint,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" varchar(30) DEFAULT 'SUBMITTED' NOT NULL,
	"total_score" numeric(10, 2),
	"total_max_score" numeric(10, 2),
	"score_percent" numeric(5, 2),
	CONSTRAINT "diagnostic_attempts_attempt_code_key" UNIQUE("attempt_code"),
	CONSTRAINT "diagnostic_attempts_score_percent_check" CHECK ((score_percent >= (0)::numeric) AND (score_percent <= (100)::numeric))
);
--> statement-breakpoint
CREATE TABLE "learning"."mastery_checks" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "learning"."learning.mastery_checks_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"check_code" varchar(150) NOT NULL,
	"skill_id" bigint NOT NULL,
	"item_no" smallint NOT NULL,
	"item_type" varchar(100),
	"question_mn" text NOT NULL,
	"material_mn" text,
	"answer_guide_mn" text,
	"max_score" numeric(8, 2) NOT NULL,
	"pass_rule_mn" varchar(200),
	"action_if_pass_mn" text,
	"action_if_partial_mn" text,
	"action_if_fail_mn" text,
	"source_material_id" bigint,
	"status" "content"."review_status" DEFAULT 'DRAFT' NOT NULL,
	CONSTRAINT "mastery_checks_check_code_key" UNIQUE("check_code"),
	CONSTRAINT "mastery_checks_item_no_check" CHECK (item_no > 0),
	CONSTRAINT "mastery_checks_max_score_check" CHECK (max_score > (0)::numeric)
);
--> statement-breakpoint
CREATE TABLE "learning"."daily_lessons" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "learning"."learning.daily_lessons_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"lesson_code" varchar(180) NOT NULL,
	"core_skill_id" bigint NOT NULL,
	"recovery_skill_id" bigint,
	"lesson_type" varchar(30) NOT NULL,
	"learning_goal_mn" text,
	"remember_mn" text,
	"worked_example_mn" text,
	"guided_practice_mn" text,
	"independent_practice_mn" text,
	"mastery_check_reference" varchar(200),
	"estimated_minutes" smallint,
	"student_message_mn" text,
	"next_if_pass" varchar(180),
	"next_if_partial" varchar(180),
	"next_if_fail" varchar(180),
	"print_ready" boolean DEFAULT false NOT NULL,
	"web_ready" boolean DEFAULT false NOT NULL,
	"source_material_id" bigint,
	"status" "content"."review_status" DEFAULT 'DRAFT' NOT NULL,
	CONSTRAINT "daily_lessons_lesson_code_key" UNIQUE("lesson_code"),
	CONSTRAINT "daily_lessons_estimated_minutes_check" CHECK (estimated_minutes > 0)
);
--> statement-breakpoint
CREATE TABLE "assessment"."web_diagnostic_submissions" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "assessment"."assessment.web_diagnostic_submissions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"submission_code" uuid NOT NULL,
	"student_id" bigint NOT NULL,
	"subject_id" bigint NOT NULL,
	"grade_level_id" smallint NOT NULL,
	"status" varchar(30) DEFAULT 'PENDING_REVIEW' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" varchar(200),
	CONSTRAINT "web_diagnostic_submissions_submission_code_key" UNIQUE("submission_code"),
	CONSTRAINT "web_diagnostic_submissions_status_check" CHECK ((status)::text = ANY ((ARRAY['IN_PROGRESS'::character varying, 'PENDING_REVIEW'::character varying, 'REVIEWED'::character varying, 'CANCELLED'::character varying])::text[]))
);
--> statement-breakpoint
CREATE TABLE "content"."source_material_grades" (
	"source_material_id" bigint NOT NULL,
	"grade_level_id" smallint NOT NULL,
	CONSTRAINT "source_material_grades_pkey" PRIMARY KEY("grade_level_id","source_material_id")
);
--> statement-breakpoint
CREATE TABLE "core"."student_enrollments" (
	"student_id" bigint NOT NULL,
	"class_id" bigint NOT NULL,
	"enrolled_at" date DEFAULT CURRENT_DATE NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "student_enrollments_pkey" PRIMARY KEY("class_id","student_id")
);
--> statement-breakpoint
CREATE TABLE "assessment"."diagnostic_responses" (
	"attempt_id" bigint NOT NULL,
	"diagnostic_item_id" bigint NOT NULL,
	"awarded_score" numeric(8, 2) NOT NULL,
	"max_score" numeric(8, 2) NOT NULL,
	"score_percent" numeric(5, 2) NOT NULL,
	CONSTRAINT "diagnostic_responses_pkey" PRIMARY KEY("attempt_id","diagnostic_item_id"),
	CONSTRAINT "diagnostic_responses_awarded_score_check" CHECK (awarded_score >= (0)::numeric),
	CONSTRAINT "diagnostic_responses_max_score_check" CHECK (max_score > (0)::numeric),
	CONSTRAINT "diagnostic_responses_score_percent_check" CHECK ((score_percent >= (0)::numeric) AND (score_percent <= (100)::numeric))
);
--> statement-breakpoint
CREATE TABLE "assessment"."web_diagnostic_answers" (
	"submission_id" bigint NOT NULL,
	"diagnostic_item_id" bigint NOT NULL,
	"response_text" text NOT NULL,
	"awarded_score" numeric(8, 2),
	"reviewer_note" text,
	CONSTRAINT "web_diagnostic_answers_pkey" PRIMARY KEY("diagnostic_item_id","submission_id"),
	CONSTRAINT "web_diagnostic_answers_awarded_score_check" CHECK ((awarded_score IS NULL) OR (awarded_score >= (0)::numeric))
);
--> statement-breakpoint
CREATE TABLE "learning"."student_skill_mastery" (
	"student_id" bigint NOT NULL,
	"skill_id" bigint NOT NULL,
	"mastery_status" varchar(30) NOT NULL,
	"mastery_score" numeric(5, 2),
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_assessed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_skill_mastery_pkey" PRIMARY KEY("skill_id","student_id"),
	CONSTRAINT "student_skill_mastery_mastery_status_check" CHECK ((mastery_status)::text = ANY ((ARRAY['NOT_ASSESSED'::character varying, 'GAP'::character varying, 'DEVELOPING'::character varying, 'MASTERED'::character varying])::text[])),
	CONSTRAINT "student_skill_mastery_mastery_score_check" CHECK ((mastery_score >= (0)::numeric) AND (mastery_score <= (100)::numeric)),
	CONSTRAINT "student_skill_mastery_attempt_count_check" CHECK (attempt_count >= 0)
);
--> statement-breakpoint
ALTER TABLE "content"."source_materials" ADD CONSTRAINT "source_materials_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "core"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content"."source_outline_nodes" ADD CONSTRAINT "source_outline_nodes_source_material_id_fkey" FOREIGN KEY ("source_material_id") REFERENCES "content"."source_materials"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content"."source_outline_nodes" ADD CONSTRAINT "source_outline_nodes_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "content"."source_outline_nodes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content"."content_nodes" ADD CONSTRAINT "content_nodes_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "core"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content"."content_nodes" ADD CONSTRAINT "content_nodes_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "content"."content_nodes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content"."content_nodes" ADD CONSTRAINT "content_nodes_grade_from_id_fkey" FOREIGN KEY ("grade_from_id") REFERENCES "core"."grade_levels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content"."content_nodes" ADD CONSTRAINT "content_nodes_grade_to_id_fkey" FOREIGN KEY ("grade_to_id") REFERENCES "core"."grade_levels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content"."content_source_alignments" ADD CONSTRAINT "content_source_alignments_content_node_id_fkey" FOREIGN KEY ("content_node_id") REFERENCES "content"."content_nodes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content"."content_source_alignments" ADD CONSTRAINT "content_source_alignments_source_material_id_fkey" FOREIGN KEY ("source_material_id") REFERENCES "content"."source_materials"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content"."content_source_alignments" ADD CONSTRAINT "content_source_alignments_source_outline_node_id_fkey" FOREIGN KEY ("source_outline_node_id") REFERENCES "content"."source_outline_nodes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content"."skills" ADD CONSTRAINT "skills_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "core"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content"."skills" ADD CONSTRAINT "skills_grade_level_id_fkey" FOREIGN KEY ("grade_level_id") REFERENCES "core"."grade_levels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content"."source_versions" ADD CONSTRAINT "source_versions_source_material_id_fkey" FOREIGN KEY ("source_material_id") REFERENCES "content"."source_materials"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content"."content_skill_maps" ADD CONSTRAINT "content_skill_maps_content_node_id_fkey" FOREIGN KEY ("content_node_id") REFERENCES "content"."content_nodes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content"."content_skill_maps" ADD CONSTRAINT "content_skill_maps_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "content"."skills"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content"."skill_dependencies" ADD CONSTRAINT "skill_dependencies_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "content"."skills"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content"."skill_dependencies" ADD CONSTRAINT "skill_dependencies_prerequisite_skill_id_fkey" FOREIGN KEY ("prerequisite_skill_id") REFERENCES "content"."skills"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content"."skill_dependencies" ADD CONSTRAINT "skill_dependencies_evidence_source_material_id_fkey" FOREIGN KEY ("evidence_source_material_id") REFERENCES "content"."source_materials"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning"."tasks" ADD CONSTRAINT "tasks_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "content"."skills"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning"."tasks" ADD CONSTRAINT "tasks_prerequisite_skill_id_fkey" FOREIGN KEY ("prerequisite_skill_id") REFERENCES "content"."skills"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning"."tasks" ADD CONSTRAINT "tasks_source_material_id_fkey" FOREIGN KEY ("source_material_id") REFERENCES "content"."source_materials"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit"."change_logs" ADD CONSTRAINT "change_logs_import_job_id_fkey" FOREIGN KEY ("import_job_id") REFERENCES "staging"."import_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staging"."import_rows" ADD CONSTRAINT "import_rows_import_job_id_fkey" FOREIGN KEY ("import_job_id") REFERENCES "staging"."import_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."classes" ADD CONSTRAINT "classes_grade_level_id_fkey" FOREIGN KEY ("grade_level_id") REFERENCES "core"."grade_levels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment"."diagnostic_items" ADD CONSTRAINT "diagnostic_items_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "core"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment"."diagnostic_items" ADD CONSTRAINT "diagnostic_items_grade_level_id_fkey" FOREIGN KEY ("grade_level_id") REFERENCES "core"."grade_levels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment"."diagnostic_items" ADD CONSTRAINT "diagnostic_items_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "content"."skills"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment"."diagnostic_attempts" ADD CONSTRAINT "diagnostic_attempts_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "core"."students"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment"."diagnostic_attempts" ADD CONSTRAINT "diagnostic_attempts_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "core"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment"."diagnostic_attempts" ADD CONSTRAINT "diagnostic_attempts_grade_level_id_fkey" FOREIGN KEY ("grade_level_id") REFERENCES "core"."grade_levels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment"."diagnostic_attempts" ADD CONSTRAINT "diagnostic_attempts_source_material_id_fkey" FOREIGN KEY ("source_material_id") REFERENCES "content"."source_materials"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning"."mastery_checks" ADD CONSTRAINT "mastery_checks_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "content"."skills"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning"."mastery_checks" ADD CONSTRAINT "mastery_checks_source_material_id_fkey" FOREIGN KEY ("source_material_id") REFERENCES "content"."source_materials"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning"."daily_lessons" ADD CONSTRAINT "daily_lessons_core_skill_id_fkey" FOREIGN KEY ("core_skill_id") REFERENCES "content"."skills"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning"."daily_lessons" ADD CONSTRAINT "daily_lessons_recovery_skill_id_fkey" FOREIGN KEY ("recovery_skill_id") REFERENCES "content"."skills"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning"."daily_lessons" ADD CONSTRAINT "daily_lessons_source_material_id_fkey" FOREIGN KEY ("source_material_id") REFERENCES "content"."source_materials"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment"."web_diagnostic_submissions" ADD CONSTRAINT "web_diagnostic_submissions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "core"."students"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment"."web_diagnostic_submissions" ADD CONSTRAINT "web_diagnostic_submissions_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "core"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment"."web_diagnostic_submissions" ADD CONSTRAINT "web_diagnostic_submissions_grade_level_id_fkey" FOREIGN KEY ("grade_level_id") REFERENCES "core"."grade_levels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content"."source_material_grades" ADD CONSTRAINT "source_material_grades_source_material_id_fkey" FOREIGN KEY ("source_material_id") REFERENCES "content"."source_materials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content"."source_material_grades" ADD CONSTRAINT "source_material_grades_grade_level_id_fkey" FOREIGN KEY ("grade_level_id") REFERENCES "core"."grade_levels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."student_enrollments" ADD CONSTRAINT "student_enrollments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "core"."students"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."student_enrollments" ADD CONSTRAINT "student_enrollments_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "core"."classes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment"."diagnostic_responses" ADD CONSTRAINT "diagnostic_responses_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "assessment"."diagnostic_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment"."diagnostic_responses" ADD CONSTRAINT "diagnostic_responses_diagnostic_item_id_fkey" FOREIGN KEY ("diagnostic_item_id") REFERENCES "assessment"."diagnostic_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment"."web_diagnostic_answers" ADD CONSTRAINT "web_diagnostic_answers_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "assessment"."web_diagnostic_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment"."web_diagnostic_answers" ADD CONSTRAINT "web_diagnostic_answers_diagnostic_item_id_fkey" FOREIGN KEY ("diagnostic_item_id") REFERENCES "assessment"."diagnostic_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning"."student_skill_mastery" ADD CONSTRAINT "student_skill_mastery_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "core"."students"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning"."student_skill_mastery" ADD CONSTRAINT "student_skill_mastery_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "content"."skills"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_source_material_subject" ON "content"."source_materials" USING btree ("subject_id" int8_ops,"status" int8_ops);--> statement-breakpoint
CREATE INDEX "idx_source_outline_parent" ON "content"."source_outline_nodes" USING btree ("parent_id" int8_ops);--> statement-breakpoint
CREATE INDEX "idx_source_outline_source" ON "content"."source_outline_nodes" USING btree ("source_material_id" int4_ops,"sequence_no" int8_ops);--> statement-breakpoint
CREATE INDEX "idx_content_parent" ON "content"."content_nodes" USING btree ("parent_id" int8_ops);--> statement-breakpoint
CREATE INDEX "idx_alignment_content" ON "content"."content_source_alignments" USING btree ("content_node_id" int8_ops);--> statement-breakpoint
CREATE INDEX "idx_alignment_source" ON "content"."content_source_alignments" USING btree ("source_material_id" int8_ops,"source_outline_node_id" int8_ops);--> statement-breakpoint
CREATE INDEX "idx_skills_subject_grade" ON "content"."skills" USING btree ("subject_id" int2_ops,"grade_level_id" int8_ops,"status" enum_ops);--> statement-breakpoint
CREATE INDEX "idx_content_skill_skill" ON "content"."content_skill_maps" USING btree ("skill_id" int8_ops);--> statement-breakpoint
CREATE INDEX "idx_dependency_prerequisite" ON "content"."skill_dependencies" USING btree ("prerequisite_skill_id" int8_ops);--> statement-breakpoint
CREATE INDEX "idx_learning_tasks_skill_level" ON "learning"."tasks" USING btree ("skill_id" int8_ops,"level_code" int8_ops);--> statement-breakpoint
CREATE INDEX "idx_audit_record" ON "audit"."change_logs" USING btree ("schema_name" text_ops,"table_name" text_ops,"record_pk" text_ops,"changed_at" text_ops);--> statement-breakpoint
CREATE INDEX "idx_import_rows_job_status" ON "staging"."import_rows" USING btree ("import_job_id" uuid_ops,"validation_status" text_ops);--> statement-breakpoint
CREATE INDEX "idx_diagnostic_attempt_student" ON "assessment"."diagnostic_attempts" USING btree ("student_id" int8_ops,"attempted_at" int8_ops);--> statement-breakpoint
CREATE INDEX "idx_mastery_checks_skill" ON "learning"."mastery_checks" USING btree ("skill_id" int2_ops,"item_no" int2_ops);--> statement-breakpoint
CREATE INDEX "idx_daily_lessons_skill_type" ON "learning"."daily_lessons" USING btree ("core_skill_id" int8_ops,"lesson_type" int8_ops);--> statement-breakpoint
CREATE INDEX "idx_web_diagnostic_student" ON "assessment"."web_diagnostic_submissions" USING btree ("student_id" int8_ops,"submitted_at" int8_ops);--> statement-breakpoint
CREATE INDEX "idx_enrollments_class" ON "core"."student_enrollments" USING btree ("class_id" int8_ops);--> statement-breakpoint
CREATE INDEX "idx_diagnostic_response_item" ON "assessment"."diagnostic_responses" USING btree ("diagnostic_item_id" int8_ops);--> statement-breakpoint
CREATE INDEX "idx_student_mastery_status" ON "learning"."student_skill_mastery" USING btree ("student_id" int8_ops,"mastery_status" int8_ops);--> statement-breakpoint
CREATE VIEW "content"."v_content_skill_map" AS (SELECT cn.content_code, cn.name_mn AS content_name, sk.skill_code, sk.name_mn AS skill_name, csm.is_primary, csm.status, csm.evidence_note FROM content.content_skill_maps csm JOIN content.content_nodes cn ON cn.id = csm.content_node_id JOIN content.skills sk ON sk.id = csm.skill_id);--> statement-breakpoint
CREATE VIEW "content"."v_source_outline" AS (SELECT sm.source_code, sm.title AS source_title, s.code AS subject_code, son.outline_code, p.outline_code AS parent_outline_code, son.printed_number, son.node_type, son.title, son.page_from, son.page_to, son.sequence_no, son.status, son.data_quality_status, son.notes FROM content.source_outline_nodes son JOIN content.source_materials sm ON sm.id = son.source_material_id JOIN core.subjects s ON s.id = sm.subject_id LEFT JOIN content.source_outline_nodes p ON p.id = son.parent_id);--> statement-breakpoint
CREATE VIEW "content"."v_skill_dependencies" AS (SELECT sk.skill_code AS current_skill_code, sk.name_mn AS current_skill_name, pre.skill_code AS prerequisite_skill_code, pre.name_mn AS prerequisite_skill_name, sd.relation_type, sd.importance, sd.reason_mn, sd.status FROM content.skill_dependencies sd JOIN content.skills sk ON sk.id = sd.skill_id JOIN content.skills pre ON pre.id = sd.prerequisite_skill_id);--> statement-breakpoint
CREATE VIEW "learning"."v_student_skill_status" AS (SELECT st.student_code, st.display_name, su.code AS subject_code, gl.grade_number, sk.skill_code, sk.name_mn AS skill_name, ssm.mastery_status, ssm.mastery_score, ssm.last_assessed_at FROM learning.student_skill_mastery ssm JOIN core.students st ON st.id = ssm.student_id JOIN content.skills sk ON sk.id = ssm.skill_id JOIN core.subjects su ON su.id = sk.subject_id LEFT JOIN core.grade_levels gl ON gl.id = sk.grade_level_id);--> statement-breakpoint
CREATE VIEW "learning"."v_mongolian_grade9_catalog" AS (SELECT sk.skill_code, sk.name_mn AS skill_name, sk.learning_outcome_mn, pre.skill_code AS prerequisite_code, pre.name_mn AS prerequisite_name, count(DISTINCT t.id)::integer AS task_count, count(DISTINCT mc.id)::integer AS mastery_check_count, count(DISTINCT dl.id)::integer AS lesson_count, sk.status FROM content.skills sk JOIN core.subjects su ON su.id = sk.subject_id AND su.code::text = 'MGL'::text JOIN core.grade_levels gl ON gl.id = sk.grade_level_id AND gl.grade_number = 9 LEFT JOIN content.skill_dependencies sd ON sd.skill_id = sk.id LEFT JOIN content.skills pre ON pre.id = sd.prerequisite_skill_id LEFT JOIN learning.tasks t ON t.skill_id = sk.id LEFT JOIN learning.mastery_checks mc ON mc.skill_id = sk.id LEFT JOIN learning.daily_lessons dl ON dl.core_skill_id = sk.id GROUP BY sk.skill_code, sk.name_mn, sk.learning_outcome_mn, pre.skill_code, pre.name_mn, sk.status);
*/