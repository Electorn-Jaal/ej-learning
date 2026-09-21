CREATE TABLE "learning"."student_day_plans" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "learning"."learning.student_day_plans_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"student_id" bigint NOT NULL,
	"plan_on" date NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_day_plans_student_day_key" UNIQUE("student_id","plan_on"),
	CONSTRAINT "student_day_plans_body_check" CHECK (char_length(body) <= 2000)
);
--> statement-breakpoint
ALTER TABLE "learning"."student_day_plans" ADD CONSTRAINT "student_day_plans_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "core"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_student_day_plans_day" ON "learning"."student_day_plans" USING btree ("plan_on");