-- What a teacher is qualified to teach. Not their timetable: core.class_teachers
-- answers "who takes 6a's maths", this answers "who is a maths teacher".
--
-- A table rather than a column, because the staff register is full of paired
-- specialties ("монгол хэл, уран зохиолын", "хими-биологи", "англи-орос") and a
-- single column would silently drop one half of each.
CREATE TABLE IF NOT EXISTS "core"."teacher_subjects" (
	"teacher_id" bigint NOT NULL,
	"subject_id" bigint NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"source_title" varchar(300),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teacher_subjects_pkey" PRIMARY KEY("teacher_id","subject_id")
);
--> statement-breakpoint
ALTER TABLE "core"."teacher_subjects" ADD CONSTRAINT "teacher_subjects_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "core"."teachers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."teacher_subjects" ADD CONSTRAINT "teacher_subjects_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "core"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_teacher_subjects_subject" ON "core"."teacher_subjects" USING btree ("subject_id" int8_ops);
