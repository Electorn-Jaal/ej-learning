-- The school's weekly timetable: which lesson a class has in which period.
--
-- A repeating pattern rather than a row per date. The school publishes one
-- grid headed "from 21 September" and it holds until it is replaced, so
-- expanding it into some seven thousand dated rows per term would store the
-- same fact hundreds of times and make correcting it a migration.
--
-- More than one lesson may occupy one class's period, and that is not a
-- double booking: 12a splits between social science and chemistry, the middle
-- years split between physical education and jiu-jitsu, and 6a splits into
-- two halves for design and IT. The key therefore includes the subject and
-- the teacher, and group_label carries the school's own name for the half
-- ("6а-1") where it wrote one.
--
-- teacher_id is nullable so a slot can be recorded before it is known who
-- will take it - a timetable published with a vacancy is still a timetable.
CREATE TABLE IF NOT EXISTS "learning"."timetable_slots" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
	"class_id" bigint NOT NULL,
	"subject_id" bigint NOT NULL,
	"teacher_id" bigint,
	-- 1 is Monday. The school teaches five days; the check allows seven so a
	-- Saturday programme needs no migration.
	"weekday_no" smallint NOT NULL,
	"period_no" smallint NOT NULL,
	"group_label" varchar(40),
	"valid_from" date NOT NULL,
	"valid_to" date,
	"source_note" varchar(200),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "timetable_slots_weekday_check" CHECK ("weekday_no" BETWEEN 1 AND 7),
	CONSTRAINT "timetable_slots_period_check" CHECK ("period_no" > 0),
	CONSTRAINT "timetable_slots_range_check" CHECK ("valid_to" IS NULL OR "valid_to" >= "valid_from")
);
--> statement-breakpoint
ALTER TABLE "learning"."timetable_slots" ADD CONSTRAINT "timetable_slots_key"
	UNIQUE NULLS NOT DISTINCT ("class_id","weekday_no","period_no","subject_id","teacher_id","valid_from");--> statement-breakpoint
ALTER TABLE "learning"."timetable_slots" ADD CONSTRAINT "timetable_slots_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "core"."classes"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "learning"."timetable_slots" ADD CONSTRAINT "timetable_slots_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "core"."subjects"("id");--> statement-breakpoint
ALTER TABLE "learning"."timetable_slots" ADD CONSTRAINT "timetable_slots_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "core"."teachers"("id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_timetable_slots_class_day" ON "learning"."timetable_slots" USING btree ("class_id" int8_ops,"weekday_no","period_no");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_timetable_slots_teacher" ON "learning"."timetable_slots" USING btree ("teacher_id" int8_ops,"weekday_no","period_no");--> statement-breakpoint

-- A timetable slot exists before anyone has prepared what goes in it.
--
-- class_schedule.daily_lesson_id was NOT NULL, which meant a period could not
-- be recorded until a lesson had been written for it. The school has a full
-- timetable and thirty-one lessons, all of them demonstration content: under
-- the old rule none of the real timetable could be stored at all. The slot is
-- the container and the lesson is what goes in it, so the container may be
-- empty.
ALTER TABLE "learning"."class_schedule" ALTER COLUMN "daily_lesson_id" DROP NOT NULL;
