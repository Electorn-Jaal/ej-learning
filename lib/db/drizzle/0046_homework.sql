-- Extra work a teacher sets: a task, with a deadline it may outlive.
--
-- Distinct from student_assignments, which is the one personal thing a child
-- has in a subject on a day - one row per student per subject per date, and
-- setting it again replaces it. That shape is right for "today's maths" and
-- wrong for everything a teacher actually hands out: it cannot be given to a
-- class, it has no deadline, and a second go overwrites the first.
--
-- due_on is nullable on purpose and lateness is recorded rather than refused.
-- A deadline that locks the door turns "I did it at the weekend" into "I did
-- not do it", which is a worse record of the same child.
CREATE TABLE IF NOT EXISTS learning.homework (
  id bigint GENERATED ALWAYS AS IDENTITY (SEQUENCE NAME learning.homework_id_seq
    START WITH 1 INCREMENT BY 1 MINVALUE 1 CACHE 1) PRIMARY KEY,
  class_id bigint NOT NULL,
  subject_id bigint NOT NULL,
  daily_lesson_id bigint,
  title varchar(300) NOT NULL,
  instructions text,
  assigned_on date NOT NULL,
  due_on date,
  whole_class boolean DEFAULT true NOT NULL,
  teacher_id bigint,
  is_active boolean DEFAULT true NOT NULL,
  created_by bigint,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT homework_due_check CHECK (due_on IS NULL OR due_on >= assigned_on),
  CONSTRAINT homework_class_id_fkey
    FOREIGN KEY (class_id) REFERENCES core.classes(id) ON DELETE CASCADE,
  CONSTRAINT homework_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES core.subjects(id),
  CONSTRAINT homework_daily_lesson_id_fkey
    FOREIGN KEY (daily_lesson_id) REFERENCES learning.daily_lessons(id),
  CONSTRAINT homework_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES core.teachers(id),
  CONSTRAINT homework_created_by_fkey FOREIGN KEY (created_by) REFERENCES core.users(id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_homework_class
  ON learning.homework USING btree (class_id, assigned_on DESC);
--> statement-breakpoint
-- Who it was set for, when it was not set for the whole class.
CREATE TABLE IF NOT EXISTS learning.homework_students (
  homework_id bigint NOT NULL,
  student_id bigint NOT NULL,
  CONSTRAINT homework_students_pkey PRIMARY KEY (homework_id, student_id),
  CONSTRAINT homework_students_homework_id_fkey
    FOREIGN KEY (homework_id) REFERENCES learning.homework(id) ON DELETE CASCADE,
  CONSTRAINT homework_students_student_id_fkey
    FOREIGN KEY (student_id) REFERENCES core.students(id) ON DELETE CASCADE
);
--> statement-breakpoint
-- Every go a child has had at a task. Every one, not the last: which attempt
-- counts is a judgement the teacher makes from seeing both, and a table that
-- keeps only the newest has already made it for them, silently, in favour of
-- whichever was typed last.
--
-- is_late is worked out at submission and stored rather than compared against
-- due_on afterwards: a deadline the teacher later moves must not retroactively
-- make a child punctual or tardy.
CREATE TABLE IF NOT EXISTS learning.homework_submissions (
  id bigint GENERATED ALWAYS AS IDENTITY (SEQUENCE NAME learning.homework_submissions_id_seq
    START WITH 1 INCREMENT BY 1 MINVALUE 1 CACHE 1) PRIMARY KEY,
  homework_id bigint NOT NULL,
  student_id bigint NOT NULL,
  attempt_no smallint NOT NULL,
  body text,
  minutes smallint,
  is_late boolean DEFAULT false NOT NULL,
  submitted_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT homework_submissions_attempt_key UNIQUE (homework_id, student_id, attempt_no),
  CONSTRAINT homework_submissions_attempt_check CHECK (attempt_no > 0),
  CONSTRAINT homework_submissions_homework_id_fkey
    FOREIGN KEY (homework_id) REFERENCES learning.homework(id) ON DELETE CASCADE,
  CONSTRAINT homework_submissions_student_id_fkey
    FOREIGN KEY (student_id) REFERENCES core.students(id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_homework_submissions_task
  ON learning.homework_submissions USING btree (homework_id, student_id);
