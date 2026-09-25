-- Who was in the room.
--
-- Four states are written down - PRESENT, LATE, ABSENT, EXCUSED - and a fifth
-- is the absence of a row. The fifth is why this is a table and not a column
-- with a default: "not registered" and "did not come" are different facts
-- about a child, and a school that collapses them tells a parent their child
-- truanted when the truth is that nobody took the register.
--
-- timetable_slot_id is how the school's own rule is written down. Up to year 5
-- a class is with one teacher all day and the register is taken once, so the
-- slot is null and the row is the day. From year 6 the children move between
-- teachers and the register is taken per lesson, so the slot is the period.
--
-- Participation is a separate axis and deliberately toothless: three words a
-- teacher may leave unsaid, worth no marks, and not a second attendance state.
CREATE TABLE IF NOT EXISTS learning.attendance_marks (
  id bigint GENERATED ALWAYS AS IDENTITY (SEQUENCE NAME learning.attendance_marks_id_seq
    START WITH 1 INCREMENT BY 1 MINVALUE 1 CACHE 1) PRIMARY KEY,
  class_id bigint NOT NULL,
  student_id bigint NOT NULL,
  on_date date NOT NULL,
  timetable_slot_id bigint,
  subject_id bigint,
  state varchar(16) NOT NULL,
  participation varchar(16),
  note text,
  marked_by bigint,
  marked_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT attendance_marks_key
    UNIQUE NULLS NOT DISTINCT (student_id, on_date, timetable_slot_id),
  CONSTRAINT attendance_marks_state_check
    CHECK (state IN ('PRESENT', 'LATE', 'ABSENT', 'EXCUSED')),
  CONSTRAINT attendance_marks_participation_check
    CHECK (participation IS NULL OR participation IN ('HIGH', 'GOOD', 'WATCH')),
  CONSTRAINT attendance_marks_class_id_fkey
    FOREIGN KEY (class_id) REFERENCES core.classes(id) ON DELETE CASCADE,
  CONSTRAINT attendance_marks_student_id_fkey
    FOREIGN KEY (student_id) REFERENCES core.students(id) ON DELETE CASCADE,
  CONSTRAINT attendance_marks_timetable_slot_id_fkey
    FOREIGN KEY (timetable_slot_id) REFERENCES learning.timetable_slots(id) ON DELETE CASCADE,
  CONSTRAINT attendance_marks_subject_id_fkey
    FOREIGN KEY (subject_id) REFERENCES core.subjects(id),
  CONSTRAINT attendance_marks_marked_by_fkey
    FOREIGN KEY (marked_by) REFERENCES core.users(id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_attendance_marks_day
  ON learning.attendance_marks USING btree (class_id, on_date);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_attendance_marks_student
  ON learning.attendance_marks USING btree (student_id, on_date DESC);
