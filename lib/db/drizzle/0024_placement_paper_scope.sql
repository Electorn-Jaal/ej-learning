-- A placement paper is aimed at no single level, which is the point of it.
--
-- exam_papers_level_present_check demanded a grade or a proficiency level on
-- every paper, so that a unit test says who it is for. A CEFR placement test
-- spans A1 to C2 and is sat by a child whose level is precisely what is not
-- yet known: filling either column in would be inventing an answer the paper
-- exists to find. Diagnostics are therefore allowed to leave both empty, and
-- every other kind of paper still has to say.
ALTER TABLE "assessment"."exam_papers" DROP CONSTRAINT IF EXISTS "exam_papers_level_present_check";--> statement-breakpoint
ALTER TABLE "assessment"."exam_papers" ADD CONSTRAINT "exam_papers_level_present_check" CHECK (
	"exam_kind" = 'DIAGNOSTIC'
	OR "grade_level_id" IS NOT NULL
	OR "proficiency_level_id" IS NOT NULL
);
