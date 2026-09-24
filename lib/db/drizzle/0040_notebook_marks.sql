-- What a teacher found in a child's exercise book.
--
-- Three states are written down - DONE, PARTIAL, NOT_DONE - and a fourth is
-- the absence of a row. That fourth is why this is a table rather than a
-- column with a default: "not checked" and "not done" are different facts
-- about a child, and a school that cannot tell them apart will sooner or later
-- tell a parent their child did nothing when the truth is that nobody looked.
-- Thirty children and six periods a day means most of this grid is never
-- filled in, and that has to read as silence.
--
-- Keyed by the period, not the day: a child can have done the maths and not
-- the physics, and the two are marked by two different people.
CREATE TABLE IF NOT EXISTS learning.notebook_marks (
  id bigint GENERATED ALWAYS AS IDENTITY (SEQUENCE NAME learning.notebook_marks_id_seq
    START WITH 1 INCREMENT BY 1 MINVALUE 1 CACHE 1) PRIMARY KEY,
  class_id bigint NOT NULL,
  subject_id bigint NOT NULL,
  scheduled_on date NOT NULL,
  timetable_slot_id bigint,
  student_id bigint NOT NULL,
  state varchar(16) NOT NULL,
  comment text,
  marked_by bigint,
  marked_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT notebook_marks_key
    UNIQUE NULLS NOT DISTINCT (student_id, scheduled_on, timetable_slot_id, subject_id),
  CONSTRAINT notebook_marks_state_check
    CHECK (state IN ('DONE', 'PARTIAL', 'NOT_DONE')),
  CONSTRAINT notebook_marks_class_id_fkey
    FOREIGN KEY (class_id) REFERENCES core.classes(id) ON DELETE CASCADE,
  CONSTRAINT notebook_marks_subject_id_fkey
    FOREIGN KEY (subject_id) REFERENCES core.subjects(id),
  CONSTRAINT notebook_marks_student_id_fkey
    FOREIGN KEY (student_id) REFERENCES core.students(id) ON DELETE CASCADE,
  CONSTRAINT notebook_marks_timetable_slot_id_fkey
    FOREIGN KEY (timetable_slot_id) REFERENCES learning.timetable_slots(id) ON DELETE CASCADE,
  CONSTRAINT notebook_marks_marked_by_fkey
    FOREIGN KEY (marked_by) REFERENCES core.users(id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_notebook_marks_day
  ON learning.notebook_marks USING btree (class_id, scheduled_on);
