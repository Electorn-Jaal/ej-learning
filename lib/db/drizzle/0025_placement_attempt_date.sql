-- When the placement was sat.
--
-- The table recorded a level and a score but never a date, which is fine for
-- one sitting and wrong for two: four children in the CEFR import sat the
-- test twice, and without a date there is no way to say which of their two
-- levels is the current one. Nullable, because a paper placement handed in
-- later may not carry one.
ALTER TABLE "assessment"."placement_attempts" ADD COLUMN IF NOT EXISTS "attempted_on" date;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_placement_attempts_student_date" ON "assessment"."placement_attempts" USING btree ("student_id" int8_ops, "attempted_on" DESC NULLS LAST);
