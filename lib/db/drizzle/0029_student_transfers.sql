-- Children who left, and where they went.
--
-- The register's transfer sheet carries forty-five of them with the school
-- they moved to, why, when the personal file was handed over and to whom, and
-- when the removal was processed. None of it was imported, so the system could
-- not answer "how many left this term" or "where did 6a's children go", and
-- last year's roll of 239 simply did not reconcile with this year's 247.
--
-- leftClassMn is text rather than a class id on purpose. Four of these
-- children were in 8б, and 8б is not a class this year: pointing a foreign key
-- at a row that no longer exists would either fail the import or quietly drop
-- the only record of which class they left.
CREATE TABLE IF NOT EXISTS "core"."student_transfers" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
	"student_id" bigint NOT NULL,
	"left_class_mn" varchar(40),
	"destination_mn" varchar(300),
	"reason_mn" varchar(200),
	-- "2026.08.27 аав" - the date the file went and who collected it.
	"file_handover_mn" varchar(120),
	"removed_on" date,
	-- The removal column holds a date for most rows and the word "Хийсэн" for
	-- the rest. Both are kept: one is when, the other is only that it happened.
	"removed_note_mn" varchar(60),
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_transfers_student_key" UNIQUE("student_id")
);
--> statement-breakpoint
ALTER TABLE "core"."student_transfers" ADD CONSTRAINT "student_transfers_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "core"."students"("id") ON DELETE cascade;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_student_transfers_removed" ON "core"."student_transfers" USING btree ("removed_on" DESC NULLS LAST);
