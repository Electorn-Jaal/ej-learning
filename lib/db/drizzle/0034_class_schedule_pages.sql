-- The pages this class actually covered, when they are not the book's.
--
-- Every section of a textbook carries a printed page range, and that range is
-- the right answer nearly always: it comes from the book itself, through
-- content.content_source_alignments, and it is the same for every school using
-- the book. It is not the right answer when a teacher says otherwise. A class
-- that spent the lesson on four pages instead of two did that, and the child
-- opening their day should be sent to the pages their own teacher taught from.
--
-- So the override lives here, on the class's own day, rather than on the
-- alignment: editing the alignment would move the pages for every class in
-- every school that shares the book, to record something true of one lesson in
-- one room. Null means "the book's own range", which is what almost every row
-- will say.
ALTER TABLE learning.class_schedule
  ADD COLUMN page_from integer,
  ADD COLUMN page_to integer;
--> statement-breakpoint
ALTER TABLE learning.class_schedule
  ADD CONSTRAINT class_schedule_page_from_check CHECK (page_from > 0),
  ADD CONSTRAINT class_schedule_page_to_check CHECK (page_to > 0),
  -- A range that runs backwards is a typo, not a lesson.
  ADD CONSTRAINT class_schedule_page_range_check
    CHECK (page_from IS NULL OR page_to IS NULL OR page_to >= page_from);
