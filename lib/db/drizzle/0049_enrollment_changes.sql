CREATE TABLE "core"."class_teacher_changes" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "core"."class_teacher_changes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"class_id" bigint NOT NULL,
	"from_teacher_id" bigint,
	"to_teacher_id" bigint,
	"effective_on" date NOT NULL,
	"changed_by" bigint NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."enrollment_changes" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "core"."enrollment_changes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"student_id" bigint NOT NULL,
	"kind" varchar(20) NOT NULL,
	"from_class_id" bigint,
	"to_class_id" bigint,
	"effective_on" date NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"changed_by" bigint NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "enrollment_changes_kind_check" CHECK (kind IN ('TRANSFER','PROMOTE','REPEAT','GRADUATE'))
);
--> statement-breakpoint
ALTER TABLE "core"."student_enrollments" ADD COLUMN "left_on" date;--> statement-breakpoint
ALTER TABLE "core"."class_teacher_changes" ADD CONSTRAINT "class_teacher_changes_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "core"."classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."class_teacher_changes" ADD CONSTRAINT "class_teacher_changes_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "core"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."enrollment_changes" ADD CONSTRAINT "enrollment_changes_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "core"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."enrollment_changes" ADD CONSTRAINT "enrollment_changes_from_class_id_classes_id_fk" FOREIGN KEY ("from_class_id") REFERENCES "core"."classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."enrollment_changes" ADD CONSTRAINT "enrollment_changes_to_class_id_classes_id_fk" FOREIGN KEY ("to_class_id") REFERENCES "core"."classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."enrollment_changes" ADD CONSTRAINT "enrollment_changes_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "core"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_class_teacher_changes_class" ON "core"."class_teacher_changes" USING btree ("class_id");--> statement-breakpoint
CREATE INDEX "idx_enrollment_changes_student" ON "core"."enrollment_changes" USING btree ("student_id");