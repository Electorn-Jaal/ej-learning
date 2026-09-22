-- What a child studies next, given the level they placed at.
--
-- This is the half of the placement test that makes it worth sitting. The
-- score says A2; this says what A2 means on Monday morning - which book, which
-- unit, what the task is, and how a teacher confirms it was done. Six rows per
-- level, one per skill, for all six CEFR levels.
--
-- Keyed on (level, skill) rather than on a student, because that is what the
-- school actually wrote down: a rule, not thirty-six separate plans. A child's
-- plan is their current level read through this table, so a child who moves up
-- gets the new plan without anybody rewriting anything, and a school that
-- changes a textbook changes it once.
--
-- source_material_id is nullable and mostly null: the English titles named here
-- (Essential Grammar in Use, English Vocabulary in Use) are not in the library
-- yet. The label is kept as text so the plan is usable on paper today, and the
-- foreign key is there for the day the books are uploaded.
CREATE TABLE IF NOT EXISTS "content"."placement_pathways" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
	"proficiency_level_id" smallint NOT NULL,
	"domain_mn" varchar(200) NOT NULL,
	"sequence_no" smallint NOT NULL,
	"source_label" varchar(300) NOT NULL,
	"source_material_id" bigint,
	"unit_focus_mn" varchar(500),
	"pages_mn" varchar(200),
	"task_mn" text NOT NULL,
	"priority" varchar(40) NOT NULL,
	"verification_mn" varchar(120),
	CONSTRAINT "placement_pathways_level_domain_key" UNIQUE("proficiency_level_id","domain_mn"),
	CONSTRAINT "placement_pathways_sequence_check" CHECK ("sequence_no" > 0),
	CONSTRAINT "placement_pathways_priority_check" CHECK (
		"priority" IN ('FOUNDATION', 'DEVELOP', 'EXTEND', 'HIGH PRIORITY IF GAP')
	)
);
--> statement-breakpoint
ALTER TABLE "content"."placement_pathways" ADD CONSTRAINT "placement_pathways_level_id_fkey" FOREIGN KEY ("proficiency_level_id") REFERENCES "content"."proficiency_levels"("id");--> statement-breakpoint
ALTER TABLE "content"."placement_pathways" ADD CONSTRAINT "placement_pathways_material_id_fkey" FOREIGN KEY ("source_material_id") REFERENCES "content"."source_materials"("id");
