CREATE TABLE "learning"."quiz_attempts" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "learning"."learning.quiz_attempts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"student_id" bigint NOT NULL,
	"daily_lesson_id" bigint NOT NULL,
	"lesson_code" varchar(100) NOT NULL,
	"answers" jsonb NOT NULL,
	"score" integer NOT NULL,
	"max_score" integer NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quiz_attempts_score_check" CHECK (score >= 0 AND score <= max_score),
	CONSTRAINT "quiz_attempts_max_score_check" CHECK (max_score > 0)
);
--> statement-breakpoint
ALTER TABLE "learning"."quiz_attempts" ADD CONSTRAINT "quiz_attempts_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "core"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning"."quiz_attempts" ADD CONSTRAINT "quiz_attempts_daily_lesson_id_fkey" FOREIGN KEY ("daily_lesson_id") REFERENCES "learning"."daily_lessons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_quiz_attempts_student" ON "learning"."quiz_attempts" USING btree ("student_id" int8_ops);--> statement-breakpoint
CREATE INDEX "idx_quiz_attempts_lesson" ON "learning"."quiz_attempts" USING btree ("daily_lesson_id" int8_ops);--> statement-breakpoint
CREATE INDEX "idx_quiz_attempts_submitted" ON "learning"."quiz_attempts" USING btree ("submitted_at" DESC NULLS LAST);