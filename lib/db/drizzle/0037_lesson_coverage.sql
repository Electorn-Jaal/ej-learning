-- Which sections a class actually got through in one period.
--
-- class_schedule holds one lesson per period: what the child opens, what the
-- pages and the note belong to. A period is not always one section, and two
-- different things look identical in that one column - a class that covered
-- section 4 and started 5 in the same hour, and a class that skipped 4 to
-- teach 5 and means to come back. The first should carry on from 6; the
-- second still owes section 4 a day. Until now both said "the day is 5" and
-- the plan moved on as though 4 had been taught.
--
-- Rows here are only what a teacher said. A day nobody confirmed has none, and
-- is read from class_schedule as before.
CREATE TABLE IF NOT EXISTS learning.class_lesson_coverage (
  id bigint GENERATED ALWAYS AS IDENTITY (SEQUENCE NAME learning.class_lesson_coverage_id_seq
    START WITH 1 INCREMENT BY 1 MINVALUE 1 CACHE 1) PRIMARY KEY,
  class_id bigint NOT NULL,
  subject_id bigint NOT NULL,
  scheduled_on date NOT NULL,
  timetable_slot_id bigint,
  daily_lesson_id bigint NOT NULL,
  created_by bigint,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT class_lesson_coverage_key
    UNIQUE NULLS NOT DISTINCT (class_id, scheduled_on, timetable_slot_id, daily_lesson_id),
  CONSTRAINT class_lesson_coverage_class_id_fkey
    FOREIGN KEY (class_id) REFERENCES core.classes(id) ON DELETE CASCADE,
  CONSTRAINT class_lesson_coverage_subject_id_fkey
    FOREIGN KEY (subject_id) REFERENCES core.subjects(id),
  CONSTRAINT class_lesson_coverage_daily_lesson_id_fkey
    FOREIGN KEY (daily_lesson_id) REFERENCES learning.daily_lessons(id) ON DELETE CASCADE,
  CONSTRAINT class_lesson_coverage_timetable_slot_id_fkey
    FOREIGN KEY (timetable_slot_id) REFERENCES learning.timetable_slots(id) ON DELETE CASCADE,
  CONSTRAINT class_lesson_coverage_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES core.users(id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_class_lesson_coverage_day
  ON learning.class_lesson_coverage USING btree (class_id, subject_id, scheduled_on);
