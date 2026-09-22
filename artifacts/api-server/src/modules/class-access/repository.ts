import { readRows } from "@workspace/db";

export type AccessibleClass = { classId: number; className: string; gradeLevel: number };

export const teacherClass = (teacherId: number, classId: number) =>
  readRows<AccessibleClass>(
    `SELECT c.id::int AS "classId", c.name_mn AS "className", g.grade_number::int AS "gradeLevel"
     FROM core.classes c JOIN core.grade_levels g ON g.id = c.grade_level_id
     WHERE c.id = $2::bigint AND c.is_active
       AND (c.class_teacher_id = $1::bigint OR EXISTS (
         SELECT 1 FROM core.class_teachers ct
         WHERE ct.teacher_id = $1::bigint AND ct.class_id = c.id AND ct.is_active))`,
    [teacherId, classId],
  );

export const anyClass = (classId: number) =>
  readRows<AccessibleClass>(
    `SELECT c.id::int AS "classId", c.name_mn AS "className", g.grade_number::int AS "gradeLevel"
     FROM core.classes c JOIN core.grade_levels g ON g.id = c.grade_level_id
     WHERE c.id = $1::bigint AND c.is_active`,
    [classId],
  );

export const isClassTeacher = async (teacherId: number | null, classId: number) => {
  if (teacherId === null) return false;
  const [row] = await readRows<{ n: number }>(
    `SELECT count(*)::int AS n FROM core.classes
     WHERE id = $2::bigint AND is_active AND class_teacher_id = $1::bigint`,
    [teacherId, classId],
  );
  return row.n > 0;
};

export const subjectsTaughtBy = async (teacherId: number | null, classId: number) => {
  if (teacherId === null) return [] as number[];
  const rows = await readRows<{ subjectId: number }>(
    `SELECT ct.subject_id::int AS "subjectId" FROM core.class_teachers ct
     WHERE ct.teacher_id = $1::bigint AND ct.class_id = $2::bigint
       AND ct.is_active AND ct.subject_id IS NOT NULL`,
    [teacherId, classId],
  );
  return rows.map((row) => row.subjectId);
};

export type TeacherClassRow = {
  id: string;
  name: string;
  gradeLevel: number;
  subjectId: number | null;
  canEdit: boolean;
  subject: string;
  studentCount: number;
  currentTopic: string;
  needsReview: number;
};


/**
 * The entries in a teacher's class picker: one per subject they may look at in
 * a class, plus one standing for all of them where there is more than one.
 *
 * What a teacher may look at is not the same as what they take. A subject
 * teacher gets their own subjects. A class teacher gets every subject the
 * class runs, because that is what being answerable for a class means - the
 * English lessons of a primary class belong to somebody else and the class
 * teacher still has to see them. What may be *changed* is narrower, and lives
 * in editableSubjects.
 *
 * An entry is the pair (id, subjectId): the id alone repeats, which is what
 * once made the register render "9А9А" and the two entries indistinguishable.
 */
export const teacherClassOptions = (teacherId: number | null, isAdmin: boolean) =>
  readRows<TeacherClassRow>(
    `WITH visible AS (
       SELECT c.id AS class_id, ct.subject_id
         FROM core.classes c
         JOIN core.class_teachers ct
           ON ct.class_id = c.id AND ct.is_active AND ct.subject_id IS NOT NULL
        WHERE c.is_active
          AND ($2::boolean OR c.class_teacher_id = $1::bigint OR ct.teacher_id = $1::bigint)
        GROUP BY c.id, ct.subject_id
     ),
     entries AS (
       SELECT class_id, subject_id FROM visible
       UNION ALL
       -- One entry standing for all of them, worth offering only when there
       -- is more than one to stand for.
       SELECT class_id, NULL::bigint
         FROM visible
        GROUP BY class_id
       HAVING count(DISTINCT subject_id) > 1
     )
     SELECT c.id::text AS id, c.name_mn AS name,
       g.grade_number::int AS "gradeLevel",
       e.subject_id::int AS "subjectId",
       -- Seeing a subject and being able to change it are different things:
       -- a class teacher sees the English their colleague takes.
       ($2::boolean OR EXISTS (
          SELECT 1 FROM core.class_teachers mine
           WHERE mine.class_id = c.id AND mine.teacher_id = $1::bigint
             AND mine.is_active AND mine.subject_id IS NOT NULL
             AND (e.subject_id IS NULL OR mine.subject_id = e.subject_id)
        )) AS "canEdit",
       COALESCE(sub.name_mn, 'Бүх хичээл') AS subject,
       (SELECT count(DISTINCT en.student_id)::int
        FROM core.student_enrollments en
        JOIN core.students s ON s.id = en.student_id AND s.is_active
        WHERE en.class_id = c.id AND en.is_active) AS "studentCount",
       COALESCE(
         (SELECT sk.name_mn FROM learning.class_schedule cs
          JOIN learning.daily_lessons dl ON dl.id = cs.daily_lesson_id
          JOIN content.skills sk ON sk.id = dl.core_skill_id
          WHERE cs.class_id = c.id
            AND cs.scheduled_on = (now() AT TIME ZONE 'Asia/Ulaanbaatar')::date
            AND CASE
                  WHEN e.subject_id IS NOT NULL THEN cs.subject_id = e.subject_id
                  ELSE EXISTS (
                    SELECT 1 FROM visible v
                     WHERE v.class_id = c.id AND v.subject_id = cs.subject_id)
                END
          LIMIT 1),
         'Өнөөдөр хуваарьт хичээл алга') AS "currentTopic",
       0 AS "needsReview"
     FROM entries e
     JOIN core.classes c ON c.id = e.class_id AND c.is_active
     JOIN core.grade_levels g ON g.id = c.grade_level_id
     LEFT JOIN core.subjects sub ON sub.id = e.subject_id
     ORDER BY g.grade_number, c.class_code, (e.subject_id IS NOT NULL), sub.name_mn`,
    [teacherId ?? 0, isAdmin],
  );

/**
 * The roll a teacher may read: the children in the classes they are assigned
 * to teach. An admin sees everybody.
 *
 * Its own SELECT rather than the one the child's own screens use. This is a
 * listing handed to somebody else about other people's children, so the
 * columns are chosen here deliberately and s.external_code - the national
 * registration number - is not among them.
 */
export const studentsForTeacher = (teacherId: number | null, isAdmin: boolean) =>
  readRows<{
    id: string; code: string; displayName: string;
    className: string; gradeLevel: number; schoolYear: string | null;
  }>(
    `SELECT s.id::text AS id, s.student_code AS code,
       s.display_name AS "displayName",
       COALESCE(string_agg(DISTINCT c.name_mn, ', ' ORDER BY c.name_mn), '') AS "className",
       COALESCE(max(g.grade_number), 0)::int AS "gradeLevel",
       max(c.school_year) AS "schoolYear"
     FROM core.students s
     LEFT JOIN core.student_enrollments e ON e.student_id = s.id AND e.is_active
     LEFT JOIN core.classes c ON c.id = e.class_id AND c.is_active
     LEFT JOIN core.grade_levels g ON g.id = c.grade_level_id
     WHERE s.is_active AND ($2::boolean OR EXISTS (
         SELECT 1 FROM core.student_enrollments se
         JOIN core.class_teachers ct ON ct.class_id = se.class_id AND ct.is_active
         WHERE se.student_id = s.id AND se.is_active AND ct.teacher_id = $1::bigint))
     GROUP BY s.id ORDER BY s.student_code`,
    [teacherId ?? 0, isAdmin],
  );
