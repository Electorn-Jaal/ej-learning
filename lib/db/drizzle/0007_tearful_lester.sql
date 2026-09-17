CREATE TYPE "learning"."assignment_source" AS ENUM('AUTO', 'TEACHER');--> statement-breakpoint
CREATE TABLE "learning"."student_assignments" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "learning"."learning.student_assignments_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"student_id" bigint NOT NULL,
	"daily_lesson_id" bigint NOT NULL,
	"assigned_on" date NOT NULL,
	"source" "learning"."assignment_source" DEFAULT 'AUTO' NOT NULL,
	"assigned_by" bigint,
	"reason" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_assignments_student_day_key" UNIQUE("student_id","assigned_on")
);
--> statement-breakpoint
ALTER TABLE "content"."skills" ADD COLUMN "proficiency_level_id" smallint;--> statement-breakpoint
ALTER TABLE "learning"."student_assignments" ADD CONSTRAINT "student_assignments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "core"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning"."student_assignments" ADD CONSTRAINT "student_assignments_daily_lesson_id_fkey" FOREIGN KEY ("daily_lesson_id") REFERENCES "learning"."daily_lessons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning"."student_assignments" ADD CONSTRAINT "student_assignments_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "core"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_student_assignments_day" ON "learning"."student_assignments" USING btree ("assigned_on");--> statement-breakpoint
ALTER TABLE "content"."skills" ADD CONSTRAINT "skills_proficiency_level_id_fkey" FOREIGN KEY ("proficiency_level_id") REFERENCES "content"."proficiency_levels"("id") ON DELETE no action ON UPDATE no action;