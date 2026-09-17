CREATE TYPE "assessment"."answer_source" AS ENUM('AUTHORITATIVE', 'RECONSTRUCTED', 'UNKNOWN');--> statement-breakpoint
CREATE TABLE "assessment"."diagnostic_item_options" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "assessment"."assessment.diagnostic_item_options_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"diagnostic_item_id" bigint NOT NULL,
	"option_label" varchar(8),
	"option_text" text NOT NULL,
	"is_correct" boolean DEFAULT false NOT NULL,
	"sequence_no" smallint NOT NULL,
	CONSTRAINT "diagnostic_item_options_item_text_key" UNIQUE("diagnostic_item_id","option_text"),
	CONSTRAINT "diagnostic_item_options_item_sequence_key" UNIQUE("diagnostic_item_id","sequence_no")
);
--> statement-breakpoint
CREATE TABLE "assessment"."placement_attempts" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "assessment"."assessment.placement_attempts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"student_id" bigint NOT NULL,
	"subject_id" bigint NOT NULL,
	"proficiency_level_id" smallint,
	"total_score" numeric,
	"total_max_score" numeric,
	"external_key" text,
	"answer_source" "assessment"."answer_source" DEFAULT 'UNKNOWN' NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "content"."proficiency_levels" (
	"id" smallint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "content"."content.proficiency_levels_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 32767 START WITH 1 CACHE 1),
	"framework" varchar(30) NOT NULL,
	"code" varchar(20) NOT NULL,
	"name_mn" varchar(80) NOT NULL,
	"sequence" smallint NOT NULL,
	CONSTRAINT "proficiency_levels_framework_code_key" UNIQUE("framework","code"),
	CONSTRAINT "proficiency_levels_framework_sequence_key" UNIQUE("framework","sequence"),
	CONSTRAINT "proficiency_levels_sequence_check" CHECK (sequence > 0)
);
--> statement-breakpoint
ALTER TABLE "assessment"."diagnostic_items" ALTER COLUMN "grade_level_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "assessment"."diagnostic_items" ALTER COLUMN "skill_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "assessment"."diagnostic_items" ADD COLUMN "proficiency_level_id" smallint;--> statement-breakpoint
ALTER TABLE "assessment"."diagnostic_items" ADD COLUMN "answer_source" "assessment"."answer_source" DEFAULT 'UNKNOWN' NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."students" ADD COLUMN "external_code" varchar(200);--> statement-breakpoint
ALTER TABLE "assessment"."diagnostic_item_options" ADD CONSTRAINT "diagnostic_item_options_item_id_fkey" FOREIGN KEY ("diagnostic_item_id") REFERENCES "assessment"."diagnostic_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment"."placement_attempts" ADD CONSTRAINT "placement_attempts_level_id_fkey" FOREIGN KEY ("proficiency_level_id") REFERENCES "content"."proficiency_levels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_diagnostic_item_options_item" ON "assessment"."diagnostic_item_options" USING btree ("diagnostic_item_id" int8_ops);--> statement-breakpoint
CREATE INDEX "idx_placement_attempts_student" ON "assessment"."placement_attempts" USING btree ("student_id" int8_ops);--> statement-breakpoint
ALTER TABLE "assessment"."diagnostic_items" ADD CONSTRAINT "diagnostic_items_proficiency_level_id_fkey" FOREIGN KEY ("proficiency_level_id") REFERENCES "content"."proficiency_levels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment"."diagnostic_items" ADD CONSTRAINT "diagnostic_items_level_present_check" CHECK (grade_level_id IS NOT NULL OR proficiency_level_id IS NOT NULL);