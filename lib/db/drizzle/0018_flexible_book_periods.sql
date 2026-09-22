ALTER TABLE "content"."source_materials"
  ADD COLUMN "planning_period_count" smallint;
--> statement-breakpoint
ALTER TABLE "content"."source_materials"
  ADD CONSTRAINT "source_materials_planning_period_count_check"
  CHECK (planning_period_count IS NULL OR planning_period_count BETWEEN 1 AND 12);
--> statement-breakpoint
ALTER TABLE "content"."source_outline_nodes"
  ADD COLUMN "planning_period_no" smallint;
--> statement-breakpoint
ALTER TABLE "content"."source_outline_nodes"
  ADD CONSTRAINT "source_outline_nodes_planning_period_no_check"
  CHECK (planning_period_no IS NULL OR planning_period_no BETWEEN 1 AND 12);
