CREATE TABLE "core"."class_teachers" (
	"class_id" bigint NOT NULL,
	"teacher_id" bigint NOT NULL,
	"subject_id" bigint,
	"is_active" boolean DEFAULT true NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "class_teachers_pkey" PRIMARY KEY("class_id","teacher_id")
);
--> statement-breakpoint
ALTER TABLE "core"."class_teachers" ADD CONSTRAINT "class_teachers_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "core"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."class_teachers" ADD CONSTRAINT "class_teachers_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "core"."teachers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."class_teachers" ADD CONSTRAINT "class_teachers_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "core"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_class_teachers_teacher" ON "core"."class_teachers" USING btree ("teacher_id" int8_ops);