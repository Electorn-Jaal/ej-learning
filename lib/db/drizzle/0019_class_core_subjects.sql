CREATE TABLE "core"."class_subjects" (
  "class_id" bigint NOT NULL,
  "subject_id" bigint NOT NULL,
  "source_material_id" bigint,
  "is_active" boolean DEFAULT true NOT NULL,
  "origin" varchar(12) DEFAULT 'CURRICULUM' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "class_subjects_pkey" PRIMARY KEY("class_id","subject_id"),
  CONSTRAINT "class_subjects_origin_check" CHECK ((origin)::text = ANY ((ARRAY['ROSTER'::character varying, 'CURRICULUM'::character varying])::text[]))
);
--> statement-breakpoint
ALTER TABLE "core"."class_subjects"
  ADD CONSTRAINT "class_subjects_class_id_fkey"
  FOREIGN KEY ("class_id") REFERENCES "core"."classes"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "core"."class_subjects"
  ADD CONSTRAINT "class_subjects_subject_id_fkey"
  FOREIGN KEY ("subject_id") REFERENCES "core"."subjects"("id");
--> statement-breakpoint
ALTER TABLE "core"."class_subjects"
  ADD CONSTRAINT "class_subjects_source_material_id_fkey"
  FOREIGN KEY ("source_material_id") REFERENCES "content"."source_materials"("id") ON DELETE restrict;
--> statement-breakpoint
CREATE INDEX "idx_class_subjects_subject" ON "core"."class_subjects" USING btree ("subject_id" int8_ops);
--> statement-breakpoint
CREATE INDEX "idx_class_subjects_material" ON "core"."class_subjects" USING btree ("source_material_id" int8_ops);
