-- A school day is more than one lesson, and falling behind in maths says
-- nothing about English. Both tables allowed exactly one row per day, so a
-- student could only ever be shown a single subject.
--
-- The generated migration added subject_id NOT NULL in one statement, which
-- cannot work against rows that already exist. The column is added nullable,
-- filled from the subject each row's lesson already teaches, and only then
-- made required.

ALTER TABLE "learning"."class_schedule" DROP CONSTRAINT "class_schedule_class_day_key";--> statement-breakpoint
ALTER TABLE "learning"."student_assignments" DROP CONSTRAINT "student_assignments_student_day_key";--> statement-breakpoint

ALTER TABLE "learning"."class_schedule" ADD COLUMN "subject_id" bigint;--> statement-breakpoint
ALTER TABLE "learning"."student_assignments" ADD COLUMN "subject_id" bigint;--> statement-breakpoint

UPDATE "learning"."class_schedule" cs
SET "subject_id" = sk."subject_id"
FROM "learning"."daily_lessons" dl
JOIN "content"."skills" sk ON sk."id" = dl."core_skill_id"
WHERE dl."id" = cs."daily_lesson_id";--> statement-breakpoint

UPDATE "learning"."student_assignments" sa
SET "subject_id" = sk."subject_id"
FROM "learning"."daily_lessons" dl
JOIN "content"."skills" sk ON sk."id" = dl."core_skill_id"
WHERE dl."id" = sa."daily_lesson_id";--> statement-breakpoint

ALTER TABLE "learning"."class_schedule" ALTER COLUMN "subject_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "learning"."student_assignments" ALTER COLUMN "subject_id" SET NOT NULL;--> statement-breakpoint

ALTER TABLE "learning"."class_schedule" ADD CONSTRAINT "class_schedule_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "core"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning"."student_assignments" ADD CONSTRAINT "student_assignments_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "core"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "learning"."class_schedule" ADD CONSTRAINT "class_schedule_class_day_key" UNIQUE("class_id","subject_id","scheduled_on");--> statement-breakpoint
ALTER TABLE "learning"."student_assignments" ADD CONSTRAINT "student_assignments_student_day_key" UNIQUE("student_id","subject_id","assigned_on");
