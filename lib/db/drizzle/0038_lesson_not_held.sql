-- A day the lesson did not happen, and a day that carried the last one on.
--
-- held is true by default, and that default is the point: a teacher who marks
-- nothing has not said the class was cancelled. A system that read silence as
-- cancellation would strike off every day nobody got round to entering. Only
-- an explicit "it did not happen" counts, and it carries a reason, because a
-- day taken off the record is one a parent will ask about.
--
-- is_continuation says the period carried the previous section on rather than
-- opening a new one. It consumes no section from the plan.
ALTER TABLE learning.class_schedule
  ADD COLUMN IF NOT EXISTS held boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE learning.class_schedule
  ADD COLUMN IF NOT EXISTS not_held_reason text;
--> statement-breakpoint
ALTER TABLE learning.class_schedule
  ADD COLUMN IF NOT EXISTS is_continuation boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE learning.class_schedule
  DROP CONSTRAINT IF EXISTS class_schedule_not_held_reason_check;
--> statement-breakpoint
ALTER TABLE learning.class_schedule
  ADD CONSTRAINT class_schedule_not_held_reason_check
  CHECK (held OR not_held_reason IS NOT NULL);
