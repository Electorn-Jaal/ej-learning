-- When the day's check opens, how long it is, how many goes it allows, and
-- when its key becomes the child's to see.
--
-- The first three are null nearly always, and null means the rule the system
-- runs on: open all day, five questions, three attempts. A teacher who wants
-- the check held back until the practice is done sets a time; one whose
-- section carries three questions rather than five says so.
--
-- answers_open_at is null until the teacher releases the key. A child on their
-- second go must not have been handed the answer on their first - that is what
-- three goes are for - and a parent reading over their shoulder is exactly the
-- route by which it would happen. Whether each answer was right is told at
-- once; which option was right, and why, waits.
ALTER TABLE learning.class_schedule
  ADD COLUMN IF NOT EXISTS quiz_opens_at time without time zone;
--> statement-breakpoint
ALTER TABLE learning.class_schedule
  ADD COLUMN IF NOT EXISTS quiz_question_count smallint;
--> statement-breakpoint
ALTER TABLE learning.class_schedule
  ADD COLUMN IF NOT EXISTS quiz_attempts smallint;
--> statement-breakpoint
ALTER TABLE learning.class_schedule
  ADD COLUMN IF NOT EXISTS answers_open_at timestamp with time zone;
--> statement-breakpoint
ALTER TABLE learning.class_schedule
  DROP CONSTRAINT IF EXISTS class_schedule_quiz_question_count_check;
--> statement-breakpoint
ALTER TABLE learning.class_schedule
  ADD CONSTRAINT class_schedule_quiz_question_count_check
  CHECK (quiz_question_count IS NULL OR quiz_question_count BETWEEN 1 AND 50);
--> statement-breakpoint
ALTER TABLE learning.class_schedule
  DROP CONSTRAINT IF EXISTS class_schedule_quiz_attempts_check;
--> statement-breakpoint
ALTER TABLE learning.class_schedule
  ADD CONSTRAINT class_schedule_quiz_attempts_check
  CHECK (quiz_attempts IS NULL OR quiz_attempts BETWEEN 1 AND 10);
