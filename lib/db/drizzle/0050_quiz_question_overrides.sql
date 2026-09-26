CREATE TABLE "learning"."quiz_question_overrides" (
	"daily_lesson_id" bigint NOT NULL,
	"student_id" bigint NOT NULL,
	"on_date" date NOT NULL,
	"attempt_no" smallint NOT NULL,
	"item_ids" bigint[] NOT NULL,
	"set_by" bigint NOT NULL,
	"set_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quiz_question_overrides_daily_lesson_id_student_id_on_date_pk" PRIMARY KEY("daily_lesson_id","student_id","on_date")
);
--> statement-breakpoint
ALTER TABLE "learning"."quiz_question_overrides" ADD CONSTRAINT "quiz_question_overrides_daily_lesson_id_daily_lessons_id_fk" FOREIGN KEY ("daily_lesson_id") REFERENCES "learning"."daily_lessons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning"."quiz_question_overrides" ADD CONSTRAINT "quiz_question_overrides_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "core"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning"."quiz_question_overrides" ADD CONSTRAINT "quiz_question_overrides_set_by_users_id_fk" FOREIGN KEY ("set_by") REFERENCES "core"."users"("id") ON DELETE no action ON UPDATE no action;