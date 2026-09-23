-- Ties a day's lesson content to the timetable period it belongs to.
--
-- learning.class_schedule keyed content on (class, subject, date) and on
-- (class, date, period). Both were written when a class could have a subject
-- once a day in a period of its own, and the school's real timetable is not
-- shaped like that: 6a has Mongolian in the first period and again in the
-- second, and one period can hold two lessons at once where the class splits
-- between design and IT or between physical education and jiu-jitsu.
--
-- So content now points at the slot it fills. The key becomes (class, subject,
-- date, slot): two periods of the same subject on one day are two rows, and a
-- teacher's note on the first no longer follows the child into the second.
--
-- NULLS NOT DISTINCT keeps the old behaviour available for content that
-- belongs to no timetable slot - a makeup lesson, a one-off - which would
-- otherwise be unconstrained.
ALTER TABLE learning.class_schedule ADD COLUMN timetable_slot_id bigint
  REFERENCES learning.timetable_slots(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE learning.class_schedule DROP CONSTRAINT class_schedule_class_day_key;
--> statement-breakpoint
-- (class_id, scheduled_on, period_no): one lesson per class per period per
-- day. A split class has two, so this rule now forbids what the school
-- actually does. The slot-based key above replaces it.
ALTER TABLE learning.class_schedule DROP CONSTRAINT class_schedule_class_slot_key;
--> statement-breakpoint
ALTER TABLE learning.class_schedule ADD CONSTRAINT class_schedule_class_day_key
  UNIQUE NULLS NOT DISTINCT (class_id, subject_id, scheduled_on, timetable_slot_id);
--> statement-breakpoint

-- Whether anybody has said which children attend a split period.
--
-- A slot labelled "6а-1" is half of 6a, and until a teacher picks the half the
-- system does not know which children it is. False means unanswered, not
-- empty: every child in the class is shown the slot with a note saying the
-- split has not been decided, which is the truth. Once it is true the roster
-- below is authoritative, and an empty roster means nobody - not everybody.
ALTER TABLE learning.timetable_slots ADD COLUMN audience_assigned boolean NOT NULL DEFAULT false;
--> statement-breakpoint

-- Which children attend a split period.
--
-- Only meaningful for a slot whose audience_assigned is true. No columns
-- beyond the pair: a child either attends or does not, and a row that carried
-- a status would invite a third state nobody has defined.
CREATE TABLE learning.timetable_slot_students (
  timetable_slot_id bigint NOT NULL REFERENCES learning.timetable_slots(id) ON DELETE CASCADE,
  student_id bigint NOT NULL REFERENCES core.students(id) ON DELETE CASCADE,
  PRIMARY KEY (timetable_slot_id, student_id)
);
