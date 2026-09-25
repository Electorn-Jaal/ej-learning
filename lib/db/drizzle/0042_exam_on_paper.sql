-- A sitting held on paper, in the room, with the teacher entering afterwards
-- what each child wrote.
--
-- The questions come from the same bank and carry the same numbers, which is
-- the point: a paper sitting the system cannot line up question for question
-- produces marks nobody can trace back to anything.
--
-- A paper sitting is never offered to a child online. It has already happened
-- by the time anybody types it in.
ALTER TABLE assessment.exam_sittings
  ADD COLUMN IF NOT EXISTS on_paper boolean DEFAULT false NOT NULL;
