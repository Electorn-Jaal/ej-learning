-- A teacher's judgement of one writing or speaking task.
--
-- The placement paper has two halves. Sixty questions are marked against a
-- key and the system can do that alone; twenty-four are judged by a person
-- reading what a child wrote or listening to what they said, against a can-do
-- statement. Only the first half has ever been recorded, which is why a
-- hundred of the hundred and five children who sat the test still carry a
-- provisional level.
--
-- Separate from assessment.diagnostic_responses, which records a score and
-- nothing else. A judged task needs three more facts: what the teacher
-- thought, who the teacher was, and when - because unlike a marked answer, a
-- judgement can be disagreed with and has to be attributable.
--
-- score is 0 or 1 against a rubric that asks whether the child can do the
-- thing, which is the question the school's own sheet asks. The column is
-- numeric rather than boolean so a school that later wants half marks is not
-- blocked by a migration.
CREATE TABLE IF NOT EXISTS "assessment"."productive_ratings" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
	"student_id" bigint NOT NULL,
	"diagnostic_item_id" bigint NOT NULL,
	"score" numeric(5,2) NOT NULL,
	"max_score" numeric(5,2) NOT NULL,
	"comment_mn" text,
	"rated_by" bigint NOT NULL,
	"rated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "productive_ratings_student_item_key" UNIQUE("student_id","diagnostic_item_id"),
	CONSTRAINT "productive_ratings_score_check" CHECK ("score" >= 0 AND "score" <= "max_score")
);
--> statement-breakpoint
ALTER TABLE "assessment"."productive_ratings" ADD CONSTRAINT "productive_ratings_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "core"."students"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "assessment"."productive_ratings" ADD CONSTRAINT "productive_ratings_item_id_fkey" FOREIGN KEY ("diagnostic_item_id") REFERENCES "assessment"."diagnostic_items"("id");--> statement-breakpoint
ALTER TABLE "assessment"."productive_ratings" ADD CONSTRAINT "productive_ratings_rated_by_fkey" FOREIGN KEY ("rated_by") REFERENCES "core"."users"("id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_productive_ratings_student" ON "assessment"."productive_ratings" USING btree ("student_id" int8_ops);
