-- The rest of what the school's register actually says about a child.
--
-- core.students held a code, a display name and an active flag. The register
-- it was imported from carries six more columns per child, and they were
-- dropped on the way in - so the system could show a name and nothing a
-- registrar would recognise as a student record.
--
-- The name is split because it arrives split. Gluing "Баттулга" and "Энхлэн"
-- into one string and keeping only that makes sorting by family name, or
-- addressing a child by their own name, an exercise in guessing where the
-- space was.
--
-- personal_file_mn, attendance_mn and notes keep the school's own words rather
-- than being mapped onto booleans. "Тамга дутуу буцаасан" is not "false"; it
-- is a specific thing a registrar needs to read back.
ALTER TABLE "core"."students" ADD COLUMN IF NOT EXISTS "family_name" varchar(150);--> statement-breakpoint
ALTER TABLE "core"."students" ADD COLUMN IF NOT EXISTS "given_name" varchar(150);--> statement-breakpoint
ALTER TABLE "core"."students" ADD COLUMN IF NOT EXISTS "personal_file_mn" varchar(120);--> statement-breakpoint
ALTER TABLE "core"."students" ADD COLUMN IF NOT EXISTS "attendance_mn" varchar(60);--> statement-breakpoint
ALTER TABLE "core"."students" ADD COLUMN IF NOT EXISTS "notes" text;--> statement-breakpoint

-- Who to ring about this child.
--
-- The admissions sheet carries "88111672-аав, 80111672-ээж" - two numbers and
-- which parent each belongs to - and the system had nowhere to put either. A
-- school that cannot reach a parent cannot run a parents' evening.
--
-- relation_mn is nullable because two thirds of the numbers arrive without
-- one. Inventing "Аав" for an unlabelled number would put a name to a person
-- the sheet never named.
CREATE TABLE IF NOT EXISTS "core"."student_guardians" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
	"student_id" bigint NOT NULL,
	"relation_mn" varchar(40),
	"full_name" varchar(300),
	"phone" varchar(40) NOT NULL,
	"sequence_no" smallint NOT NULL,
	"source_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_guardians_student_phone_key" UNIQUE("student_id","phone"),
	CONSTRAINT "student_guardians_sequence_check" CHECK ("sequence_no" > 0)
);
--> statement-breakpoint
ALTER TABLE "core"."student_guardians" ADD CONSTRAINT "student_guardians_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "core"."students"("id") ON DELETE cascade;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_student_guardians_student" ON "core"."student_guardians" USING btree ("student_id" int8_ops);
