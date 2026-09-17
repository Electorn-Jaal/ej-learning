CREATE TABLE "learning"."class_schedule" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "learning"."learning.class_schedule_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"class_id" bigint NOT NULL,
	"term_id" smallint NOT NULL,
	"daily_lesson_id" bigint NOT NULL,
	"scheduled_on" date NOT NULL,
	"note" text,
	"created_by" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "class_schedule_class_day_key" UNIQUE("class_id","scheduled_on")
);
--> statement-breakpoint
CREATE TABLE "learning"."terms" (
	"id" smallint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "learning"."learning.terms_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 32767 START WITH 1 CACHE 1),
	"school_year" varchar(20) NOT NULL,
	"term_number" smallint NOT NULL,
	"name_mn" varchar(50) NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	CONSTRAINT "terms_year_number_key" UNIQUE("school_year","term_number"),
	CONSTRAINT "terms_term_number_check" CHECK (term_number BETWEEN 1 AND 3),
	CONSTRAINT "terms_range_check" CHECK (ends_on >= starts_on)
);
--> statement-breakpoint
ALTER TABLE "learning"."class_schedule" ADD CONSTRAINT "class_schedule_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "core"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning"."class_schedule" ADD CONSTRAINT "class_schedule_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "learning"."terms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning"."class_schedule" ADD CONSTRAINT "class_schedule_daily_lesson_id_fkey" FOREIGN KEY ("daily_lesson_id") REFERENCES "learning"."daily_lessons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning"."class_schedule" ADD CONSTRAINT "class_schedule_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_class_schedule_day" ON "learning"."class_schedule" USING btree ("scheduled_on");--> statement-breakpoint
CREATE INDEX "idx_class_schedule_term" ON "learning"."class_schedule" USING btree ("term_id");