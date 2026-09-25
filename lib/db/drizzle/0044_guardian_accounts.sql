-- A parent's own login, and the child it reads.
--
-- GUARDIAN is added to the role enum in its own statement, because Postgres
-- will not let a value be added and used in the same transaction.
ALTER TYPE core.user_role ADD VALUE IF NOT EXISTS 'GUARDIAN';
--> statement-breakpoint
-- Separate from student_guardians, which is the phone book the admissions
-- sheet fills in: a number to ring, sometimes a name, and usually no account
-- at all. This is somebody who signs in.
--
-- One active account per child, which is the school's rule: a parents' evening
-- arranged twice because two people both had the password is worse than one
-- arranged badly. A second parent is added by making the first inactive, and
-- the history stays.
CREATE TABLE IF NOT EXISTS core.guardian_students (
  id bigint GENERATED ALWAYS AS IDENTITY (SEQUENCE NAME core.guardian_students_id_seq
    START WITH 1 INCREMENT BY 1 MINVALUE 1 CACHE 1) PRIMARY KEY,
  user_id bigint NOT NULL,
  student_id bigint NOT NULL,
  relation_mn varchar(40),
  is_active boolean DEFAULT true NOT NULL,
  linked_by bigint,
  linked_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT guardian_students_user_student_key UNIQUE (user_id, student_id),
  CONSTRAINT guardian_students_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES core.users(id) ON DELETE CASCADE,
  CONSTRAINT guardian_students_student_id_fkey
    FOREIGN KEY (student_id) REFERENCES core.students(id) ON DELETE CASCADE,
  CONSTRAINT guardian_students_linked_by_fkey
    FOREIGN KEY (linked_by) REFERENCES core.users(id)
);
--> statement-breakpoint
-- The rule itself, held by the database rather than by whoever remembers to
-- check it: at most one live account per child.
CREATE UNIQUE INDEX IF NOT EXISTS guardian_students_one_active_per_student
  ON core.guardian_students (student_id) WHERE is_active;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_guardian_students_student
  ON core.guardian_students USING btree (student_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_guardian_students_user
  ON core.guardian_students USING btree (user_id);
