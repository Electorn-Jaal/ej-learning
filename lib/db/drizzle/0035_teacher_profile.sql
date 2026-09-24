-- What a teacher's own page has to show, and a place to put their photograph.
--
-- core.teachers held six columns, four of them plumbing: an id, a user, a code
-- and a flag. Everything a school actually knows about a member of staff -
-- what they are employed as, what they trained in, how long they have been
-- teaching, how to reach them - had nowhere to live, so the profile screen
-- could only repeat the name that was already in the header.
--
-- The register does carry a job title, but it arrived buried in
-- core.teacher_subjects.source_title, which exists to record WHY a subject was
-- attached to a teacher. A title is a fact about the person, not about one of
-- their subjects, so it gets a column of its own and is copied across below.
ALTER TABLE core.teachers
  ADD COLUMN job_title_mn varchar(200),
  -- The register calls this "Ажлын байрны ангилал": the post they are
  -- classified under, which is not always the post they are called by.
  ADD COLUMN speciality_mn varchar(200),
  -- "Газар, хэлтэс" - Сургалтын алба, Захиргаа аж ахуйн алба, and so on.
  ADD COLUMN department_mn varchar(200),
  -- The formal teaching rank - багш, арга зүйч, тэргүүлэх, зөвлөх. Free text
  -- rather than an enum: the ladder is set by the ministry and changes without
  -- asking this database, and a school that writes something unexpected should
  -- not be refused.
  ADD COLUMN rank_mn varchar(100),
  -- When they started teaching, not how many years they have taught. A count
  -- is wrong from the day after it is entered; a date is right forever and the
  -- count is arithmetic.
  ADD COLUMN service_since date,
  ADD COLUMN phone varchar(40),
  ADD COLUMN email varchar(200);
--> statement-breakpoint
ALTER TABLE core.teachers
  ADD CONSTRAINT teachers_service_since_check
    CHECK (service_since IS NULL OR service_since >= DATE '1950-01-01');
--> statement-breakpoint

-- The photograph, as a key into the same storage the textbooks use.
--
-- On the user rather than the teacher: a child has a face too, and putting it
-- here means the one upload path serves everybody rather than being rebuilt
-- the first time somebody asks for student photographs.
ALTER TABLE core.users ADD COLUMN photo_key varchar(300);
--> statement-breakpoint

-- The register's own job titles, moved to where they belong. Two of the values
-- in source_title are notes about where a link came from rather than titles -
-- "2026-2027 хичээлийн хуваариас" says a timetable supplied it - so they are
-- left behind.
UPDATE core.teachers t
   SET job_title_mn = titles.title
  FROM (
    SELECT ts.teacher_id, min(ts.source_title) AS title
      FROM core.teacher_subjects ts
     WHERE ts.source_title IS NOT NULL
       AND ts.source_title LIKE 'Багш,%'
     GROUP BY ts.teacher_id
  ) titles
 WHERE titles.teacher_id = t.id AND t.job_title_mn IS NULL;
