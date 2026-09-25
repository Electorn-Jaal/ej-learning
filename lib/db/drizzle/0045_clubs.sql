-- A club: something the school runs that is not a class.
--
-- Speaking club, БС, ДС-1. On the school's own timetable these are written in
-- the box where a class name goes, which is the only place there was to put
-- them - and it makes them unreadable, because that box means "who is in the
-- room" and a club's answer is "whoever signed up, from anywhere".
--
-- So a club has no class. It has a teacher, an hour, and a list of children
-- drawn from across the school, and the list IS the club. That is the
-- difference from a split class: an unassigned half of 6а is still half of 6а,
-- but a club with nobody in it is a club nobody joined. Hence a club with no
-- members appears on nobody's timetable, where a group slot with no members
-- appears on everybody's, marked unassigned.
CREATE TABLE IF NOT EXISTS learning.clubs (
  id bigint GENERATED ALWAYS AS IDENTITY (SEQUENCE NAME learning.clubs_id_seq
    START WITH 1 INCREMENT BY 1 MINVALUE 1 CACHE 1) PRIMARY KEY,
  name_mn varchar(200) NOT NULL,
  subject_id bigint,
  teacher_id bigint,
  school_year varchar(20) NOT NULL,
  note text,
  is_active boolean DEFAULT true NOT NULL,
  created_by bigint,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT clubs_name_year_key UNIQUE (name_mn, school_year),
  CONSTRAINT clubs_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES core.subjects(id),
  CONSTRAINT clubs_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES core.teachers(id),
  CONSTRAINT clubs_created_by_fkey FOREIGN KEY (created_by) REFERENCES core.users(id)
);
--> statement-breakpoint
-- When it meets. The same weekday-and-period the timetable uses, so a club
-- sits in a child's day beside their lessons rather than in a list of its own.
CREATE TABLE IF NOT EXISTS learning.club_sessions (
  id bigint GENERATED ALWAYS AS IDENTITY (SEQUENCE NAME learning.club_sessions_id_seq
    START WITH 1 INCREMENT BY 1 MINVALUE 1 CACHE 1) PRIMARY KEY,
  club_id bigint NOT NULL,
  weekday_no smallint NOT NULL,
  period_no smallint NOT NULL,
  valid_from date NOT NULL,
  valid_to date,
  CONSTRAINT club_sessions_key UNIQUE (club_id, weekday_no, period_no),
  CONSTRAINT club_sessions_weekday_check CHECK (weekday_no BETWEEN 1 AND 7),
  CONSTRAINT club_sessions_period_check CHECK (period_no BETWEEN 1 AND 12),
  CONSTRAINT club_sessions_club_id_fkey
    FOREIGN KEY (club_id) REFERENCES learning.clubs(id) ON DELETE CASCADE
);
--> statement-breakpoint
-- Who is in it, from anywhere. Leaving is recorded rather than deleted: a
-- child who stopped coming in November was in the club in October, and their
-- attendance that month should still make sense.
CREATE TABLE IF NOT EXISTS learning.club_members (
  club_id bigint NOT NULL,
  student_id bigint NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  joined_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT club_members_pkey PRIMARY KEY (club_id, student_id),
  CONSTRAINT club_members_club_id_fkey
    FOREIGN KEY (club_id) REFERENCES learning.clubs(id) ON DELETE CASCADE,
  CONSTRAINT club_members_student_id_fkey
    FOREIGN KEY (student_id) REFERENCES core.students(id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_club_members_student
  ON learning.club_members USING btree (student_id);
