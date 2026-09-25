-- One occasion on which a class sits a paper.
--
-- A paper is a set of questions; a sitting is a class, a window and an
-- audience. They are separate because the same term paper is given to 9a on
-- Tuesday morning and to 9b on Wednesday afternoon, and a window written on
-- the paper itself would make those the same event.
--
-- The window has both ends. An exam that opens and never closes is not an exam
-- but homework, and the closing time is what makes "sat it" mean the same
-- thing for every child in the room.
CREATE TABLE IF NOT EXISTS assessment.exam_sittings (
  id bigint GENERATED ALWAYS AS IDENTITY (SEQUENCE NAME assessment.exam_sittings_id_seq
    START WITH 1 INCREMENT BY 1 MINVALUE 1 CACHE 1) PRIMARY KEY,
  exam_paper_id bigint NOT NULL,
  class_id bigint NOT NULL,
  subject_id bigint NOT NULL,
  opens_at timestamp with time zone NOT NULL,
  closes_at timestamp with time zone NOT NULL,
  answers_open_at timestamp with time zone,
  whole_class boolean DEFAULT true NOT NULL,
  created_by bigint,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT exam_sittings_window_check CHECK (closes_at > opens_at),
  CONSTRAINT exam_sittings_exam_paper_id_fkey
    FOREIGN KEY (exam_paper_id) REFERENCES assessment.exam_papers(id) ON DELETE CASCADE,
  CONSTRAINT exam_sittings_class_id_fkey
    FOREIGN KEY (class_id) REFERENCES core.classes(id) ON DELETE CASCADE,
  CONSTRAINT exam_sittings_subject_id_fkey
    FOREIGN KEY (subject_id) REFERENCES core.subjects(id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_exam_sittings_class
  ON assessment.exam_sittings USING btree (class_id, opens_at DESC);
--> statement-breakpoint
-- Who sits it, and who has been let in again. extra_attempts is how "the
-- teacher may set it again" is written: a child cannot sit a paper twice on
-- their own, so the only way to a second go is a teacher deciding, recorded
-- next to the child it was decided for.
CREATE TABLE IF NOT EXISTS assessment.exam_sitting_students (
  sitting_id bigint NOT NULL,
  student_id bigint NOT NULL,
  invited boolean DEFAULT true NOT NULL,
  extra_attempts smallint DEFAULT 0 NOT NULL,
  CONSTRAINT exam_sitting_students_pkey PRIMARY KEY (sitting_id, student_id),
  CONSTRAINT exam_sitting_students_extra_attempts_check CHECK (extra_attempts >= 0),
  CONSTRAINT exam_sitting_students_sitting_id_fkey
    FOREIGN KEY (sitting_id) REFERENCES assessment.exam_sittings(id) ON DELETE CASCADE,
  CONSTRAINT exam_sitting_students_student_id_fkey
    FOREIGN KEY (student_id) REFERENCES core.students(id) ON DELETE CASCADE
);
--> statement-breakpoint
-- Which sitting an attempt belongs to. Nullable: the imported diagnostic
-- history predates sittings entirely, and a null there means "unknown", not
-- "none".
ALTER TABLE assessment.diagnostic_attempts
  ADD COLUMN IF NOT EXISTS exam_sitting_id bigint;
--> statement-breakpoint
ALTER TABLE assessment.diagnostic_attempts
  DROP CONSTRAINT IF EXISTS diagnostic_attempts_exam_sitting_id_fkey;
--> statement-breakpoint
ALTER TABLE assessment.diagnostic_attempts
  ADD CONSTRAINT diagnostic_attempts_exam_sitting_id_fkey
  FOREIGN KEY (exam_sitting_id) REFERENCES assessment.exam_sittings(id) ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_diagnostic_attempts_sitting
  ON assessment.diagnostic_attempts USING btree (exam_sitting_id, student_id);
