CREATE TYPE "assessment"."exam_kind" AS ENUM('QUIZ', 'UNIT', 'TERM', 'YEAR', 'DIAGNOSTIC');
--> statement-breakpoint
CREATE TABLE "assessment"."exam_papers" (
  "id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "assessment"."exam_papers_id_seq" INCREMENT BY 1 MINVALUE 1 START WITH 1 CACHE 1),
  "paper_code" varchar(100) NOT NULL,
  "subject_id" bigint NOT NULL,
  "grade_level_id" smallint,
  "proficiency_level_id" smallint,
  "class_id" bigint,
  "exam_kind" "assessment"."exam_kind" NOT NULL,
  "title_mn" varchar(300) NOT NULL,
  "scheduled_on" date,
  "pass_percent" numeric(5, 2),
  "instructions_mn" text,
  "created_by" bigint,
  "status" "content"."review_status" DEFAULT 'DRAFT' NOT NULL,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "exam_papers_paper_code_key" UNIQUE("paper_code"),
  CONSTRAINT "exam_papers_level_present_check" CHECK (grade_level_id IS NOT NULL OR proficiency_level_id IS NOT NULL),
  CONSTRAINT "exam_papers_pass_percent_check" CHECK (pass_percent IS NULL OR (pass_percent >= (0)::numeric AND pass_percent <= (100)::numeric))
);
--> statement-breakpoint
CREATE TABLE "assessment"."exam_paper_items" (
  "paper_id" bigint NOT NULL,
  "diagnostic_item_id" bigint NOT NULL,
  "item_order" smallint NOT NULL,
  "max_score" numeric(8, 2),
  CONSTRAINT "exam_paper_items_pkey" PRIMARY KEY("paper_id","diagnostic_item_id"),
  CONSTRAINT "exam_paper_items_paper_order_key" UNIQUE("paper_id","item_order"),
  CONSTRAINT "exam_paper_items_item_order_check" CHECK (item_order > 0),
  CONSTRAINT "exam_paper_items_max_score_check" CHECK (max_score IS NULL OR max_score > (0)::numeric)
);
--> statement-breakpoint
ALTER TABLE "assessment"."exam_papers" ADD CONSTRAINT "exam_papers_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "core"."subjects"("id");
--> statement-breakpoint
ALTER TABLE "assessment"."exam_papers" ADD CONSTRAINT "exam_papers_grade_level_id_fkey" FOREIGN KEY ("grade_level_id") REFERENCES "core"."grade_levels"("id");
--> statement-breakpoint
ALTER TABLE "assessment"."exam_papers" ADD CONSTRAINT "exam_papers_proficiency_level_id_fkey" FOREIGN KEY ("proficiency_level_id") REFERENCES "content"."proficiency_levels"("id");
--> statement-breakpoint
ALTER TABLE "assessment"."exam_papers" ADD CONSTRAINT "exam_papers_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "core"."classes"("id") ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "assessment"."exam_paper_items" ADD CONSTRAINT "exam_paper_items_paper_id_fkey" FOREIGN KEY ("paper_id") REFERENCES "assessment"."exam_papers"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "assessment"."exam_paper_items" ADD CONSTRAINT "exam_paper_items_diagnostic_item_id_fkey" FOREIGN KEY ("diagnostic_item_id") REFERENCES "assessment"."diagnostic_items"("id") ON DELETE restrict;
--> statement-breakpoint
CREATE INDEX "idx_exam_papers_subject" ON "assessment"."exam_papers" USING btree ("subject_id" int8_ops,"scheduled_on");
--> statement-breakpoint
CREATE INDEX "idx_exam_papers_class" ON "assessment"."exam_papers" USING btree ("class_id" int8_ops);
--> statement-breakpoint
CREATE INDEX "idx_exam_paper_items_item" ON "assessment"."exam_paper_items" USING btree ("diagnostic_item_id" int8_ops);
--> statement-breakpoint
ALTER TABLE "assessment"."diagnostic_attempts" ADD COLUMN "exam_paper_id" bigint;
--> statement-breakpoint
ALTER TABLE "assessment"."diagnostic_attempts" ADD CONSTRAINT "diagnostic_attempts_exam_paper_id_fkey" FOREIGN KEY ("exam_paper_id") REFERENCES "assessment"."exam_papers"("id") ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "assessment"."web_diagnostic_submissions" ADD COLUMN "exam_paper_id" bigint;
--> statement-breakpoint
ALTER TABLE "assessment"."web_diagnostic_submissions" ADD CONSTRAINT "web_diagnostic_submissions_exam_paper_id_fkey" FOREIGN KEY ("exam_paper_id") REFERENCES "assessment"."exam_papers"("id") ON DELETE restrict;
