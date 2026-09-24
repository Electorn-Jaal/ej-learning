-- What a staff profile is made of, as rows a school can change.
--
-- The previous migration gave core.teachers the columns the register actually
-- carries: job title, speciality, department, telephone, address. Those are
-- the right shape for data that arrives in every import and gets read by the
-- timetable and the class screens - typed, constrained, joinable.
--
-- They are the wrong shape for the school's next question, which is always
-- "can we also record X". A column per question means a migration per
-- question, and a school that has to ask a developer to add "боловсрол" will
-- keep it in a spreadsheet instead.
--
-- So the columns stay, and this adds the two tables that let a school work
-- with them: one that says what a field is CALLED and in what order it
-- appears, and one that holds the values of the fields nobody built a column
-- for. A single list on screen, two homes underneath.
--
-- A built-in field carries column_name and its values live in that column of
-- core.teachers, which is why the import, the class screens and the timetable
-- keep working unchanged. A field the school adds has column_name null and
-- its values live in staff_field_values. The screen cannot tell them apart;
-- the database can, and that is the point - a telephone number stays a column
-- with a length limit rather than becoming an untyped string in a bag.
CREATE TABLE core.staff_fields (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  -- Stable across renames: the label is what the school edits, this is what
  -- the code and the values table refer to.
  field_key varchar(60) NOT NULL,
  label_mn varchar(120) NOT NULL,
  -- Non-null only for the fields that have a real column behind them.
  column_name varchar(60),
  -- How the value is entered and shown. Not a promise about storage - a DATE
  -- field's value is still text in staff_field_values - but it is what lets
  -- the screen offer a date picker rather than a free-text box.
  value_kind varchar(20) NOT NULL DEFAULT 'TEXT',
  sort_order smallint NOT NULL DEFAULT 100,
  -- Whether the staff member may write it themselves. A telephone number is
  -- theirs; a job title is a decision the school made about them.
  self_editable boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_fields_field_key_key UNIQUE (field_key),
  CONSTRAINT staff_fields_value_kind_check
    CHECK (value_kind IN ('TEXT', 'LONG_TEXT', 'DATE', 'PHONE', 'EMAIL')),
  -- A built-in field is one the school may rename and reorder but not delete,
  -- because a column would be left with nothing describing it.
  CONSTRAINT staff_fields_builtin_stays_active
    CHECK (column_name IS NULL OR is_active)
);
--> statement-breakpoint

CREATE TABLE core.staff_field_values (
  teacher_id bigint NOT NULL REFERENCES core.teachers(id) ON DELETE CASCADE,
  field_id bigint NOT NULL REFERENCES core.staff_fields(id) ON DELETE CASCADE,
  value_text text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (teacher_id, field_id)
);
--> statement-breakpoint

-- The fields that already exist, named the way the school's own register names
-- them. Order follows how a person reads a staff card: what they do, where
-- they do it, how long, how to reach them.
INSERT INTO core.staff_fields
  (field_key, label_mn, column_name, value_kind, sort_order, self_editable)
VALUES
  ('job_title',   'Албан тушаал',           'job_title_mn',   'TEXT',  10, false),
  ('speciality',  'Ажлын байрны ангилал',   'speciality_mn',  'TEXT',  20, false),
  ('department',  'Газар, хэлтэс',          'department_mn',  'TEXT',  30, false),
  ('rank',        'Мэргэжлийн зэрэг',       'rank_mn',        'TEXT',  40, false),
  ('service_since', 'Ажилд орсон огноо',    'service_since',  'DATE',  50, true),
  ('phone',       'Утасны дугаар',          'phone',          'PHONE', 60, true),
  ('email',       'Имэйл хаяг',             'email',          'EMAIL', 70, true);
