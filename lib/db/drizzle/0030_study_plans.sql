-- The plan a placement actually produced for one child, week by week and day
-- by day.
--
-- content.placement_pathways holds the RULE - what A2 means in general. This
-- holds what the school generated from that rule for a named child: four
-- weeks, six skills a week, five days a week, each with its own book, unit,
-- task and mastery target. 2424 weekly rows and 1880 daily ones were sitting
-- in the workbook unread.
--
-- The daily table carries score and status because that is where the loop
-- closes: a teacher marks a day, the status becomes MASTERED, DEVELOPING or
-- NEEDS SUPPORT, and the next action follows from it. Both are nullable and
-- almost entirely empty today - four scores out of 1880 - which is the honest
-- state: the plan is written, the term has not been taught.
CREATE TABLE IF NOT EXISTS "learning"."study_plan_weeks" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
	"student_id" bigint NOT NULL,
	"subject_id" bigint NOT NULL,
	"week_no" smallint NOT NULL,
	"domain_mn" varchar(200) NOT NULL,
	"level_code" varchar(20),
	"priority" varchar(40),
	"source_label" varchar(300),
	"unit_focus_mn" varchar(500),
	"pages_mn" varchar(200),
	"task_mn" text,
	"mastery_target_mn" varchar(60),
	"teacher_check_mn" varchar(120),
	"status" varchar(40) NOT NULL,
	CONSTRAINT "study_plan_weeks_key" UNIQUE("student_id","subject_id","week_no","domain_mn"),
	CONSTRAINT "study_plan_weeks_week_check" CHECK ("week_no" > 0)
);
--> statement-breakpoint
ALTER TABLE "learning"."study_plan_weeks" ADD CONSTRAINT "study_plan_weeks_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "core"."students"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "learning"."study_plan_weeks" ADD CONSTRAINT "study_plan_weeks_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "core"."subjects"("id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "learning"."study_plan_days" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
	"student_id" bigint NOT NULL,
	"subject_id" bigint NOT NULL,
	"week_no" smallint NOT NULL,
	-- 1 is Monday. The workbook names five weekdays and nothing at the weekend.
	"weekday_no" smallint NOT NULL,
	"focus_mn" varchar(200),
	"level_code" varchar(20),
	"source_label" text,
	"unit_focus_mn" text,
	"pages_mn" text,
	"task_mn" text,
	"teacher_check_mn" varchar(120),
	"target_mn" varchar(60),
	"score" numeric(5,2),
	"status" varchar(40) NOT NULL,
	CONSTRAINT "study_plan_days_key" UNIQUE("student_id","subject_id","week_no","weekday_no"),
	CONSTRAINT "study_plan_days_week_check" CHECK ("week_no" > 0),
	CONSTRAINT "study_plan_days_weekday_check" CHECK ("weekday_no" BETWEEN 1 AND 7),
	CONSTRAINT "study_plan_days_score_check" CHECK ("score" IS NULL OR ("score" >= 0 AND "score" <= 100))
);
--> statement-breakpoint
ALTER TABLE "learning"."study_plan_days" ADD CONSTRAINT "study_plan_days_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "core"."students"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "learning"."study_plan_days" ADD CONSTRAINT "study_plan_days_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "core"."subjects"("id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_study_plan_days_student_week" ON "learning"."study_plan_days" USING btree ("student_id" int8_ops, "week_no", "weekday_no");
