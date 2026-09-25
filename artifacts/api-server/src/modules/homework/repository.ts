import { pool, readRows } from "@workspace/db";

/**
 * The work set for one class, newest first, with how it is going.
 *
 * Two counts, not one. "Given to 28, handed in by 9" is the sentence a teacher
 * needs, and a single percentage hides which half of it moved.
 */
export const forClass = (classId: number, subjectIds: number[] | null) =>
  readRows<{
    homeworkId: number;
    title: string;
    instructions: string | null;
    subjectId: number;
    subjectName: string;
    assignedOn: string;
    dueOn: string | null;
    wholeClass: boolean;
    isActive: boolean;
    teacherName: string | null;
    given: number;
    handedIn: number;
    late: number;
  }>(
    `SELECT h.id::int AS "homeworkId", h.title, h.instructions,
       h.subject_id::int AS "subjectId", sub.name_mn AS "subjectName",
       h.assigned_on::text AS "assignedOn", h.due_on::text AS "dueOn",
       h.whole_class AS "wholeClass", h.is_active AS "isActive",
       u.display_name AS "teacherName",
       CASE WHEN h.whole_class
            THEN (SELECT count(*)::int FROM core.student_enrollments e
                   JOIN core.students s ON s.id = e.student_id AND s.is_active
                  WHERE e.class_id = h.class_id AND e.is_active)
            ELSE (SELECT count(*)::int FROM learning.homework_students hs
                   WHERE hs.homework_id = h.id)
       END AS given,
       (SELECT count(DISTINCT sm.student_id)::int FROM learning.homework_submissions sm
         WHERE sm.homework_id = h.id) AS "handedIn",
       (SELECT count(DISTINCT sm.student_id)::int FROM learning.homework_submissions sm
         WHERE sm.homework_id = h.id AND sm.is_late) AS late
     FROM learning.homework h
     JOIN core.subjects sub ON sub.id = h.subject_id
     LEFT JOIN core.teachers t ON t.id = h.teacher_id
     LEFT JOIN core.users u ON u.id = t.user_id
     WHERE h.class_id = $1::bigint
       AND ($2::bigint[] IS NULL OR h.subject_id = ANY($2::bigint[]))
     ORDER BY h.assigned_on DESC, h.id DESC`,
    [classId, subjectIds],
  );

export const one = (homeworkId: number) =>
  readRows<{
    homeworkId: number;
    classId: number;
    subjectId: number;
    title: string;
    instructions: string | null;
    assignedOn: string;
    dueOn: string | null;
    wholeClass: boolean;
    isActive: boolean;
  }>(
    `SELECT id::int AS "homeworkId", class_id::int AS "classId",
       subject_id::int AS "subjectId", title, instructions,
       assigned_on::text AS "assignedOn", due_on::text AS "dueOn",
       whole_class AS "wholeClass", is_active AS "isActive"
     FROM learning.homework WHERE id = $1::bigint`,
    [homeworkId],
  );

/**
 * The register for one piece of work: everybody it was set for, and every go
 * they have had at it.
 *
 * Every go. A child who redid the work has done it twice, and which of the two
 * counts is the teacher's judgement to make from seeing both - returning only
 * the newest would make that judgement for them, silently, in favour of
 * whichever was typed last.
 */
export const submissions = (homeworkId: number) =>
  readRows<{
    studentId: number;
    studentName: string;
    studentCode: string;
    submissionId: number | null;
    attemptNo: number | null;
    body: string | null;
    minutes: number | null;
    isLate: boolean | null;
    submittedAt: string | null;
  }>(
    `SELECT s.id::int AS "studentId", s.display_name AS "studentName",
       s.student_code AS "studentCode",
       sm.id::int AS "submissionId", sm.attempt_no::int AS "attemptNo",
       sm.body, sm.minutes::int AS minutes, sm.is_late AS "isLate",
       to_json(sm.submitted_at) #>> '{}' AS "submittedAt"
     FROM learning.homework h
     JOIN core.student_enrollments e ON e.class_id = h.class_id AND e.is_active
     JOIN core.students s ON s.id = e.student_id AND s.is_active
     LEFT JOIN learning.homework_students hs
       ON hs.homework_id = h.id AND hs.student_id = s.id
     LEFT JOIN learning.homework_submissions sm
       ON sm.homework_id = h.id AND sm.student_id = s.id
     WHERE h.id = $1::bigint AND (h.whole_class OR hs.student_id IS NOT NULL)
     ORDER BY s.display_name, sm.attempt_no`,
    [homeworkId],
  );

/** Create the work and its audience together, so neither can exist alone. */
export async function create(input: {
  classId: number;
  subjectId: number;
  dailyLessonId: number | null;
  title: string;
  instructions: string | null;
  assignedOn: string;
  dueOn: string | null;
  wholeClass: boolean;
  teacherId: number | null;
  createdBy: number;
  studentIds: number[];
}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const created = await client.query<{ id: number }>(
      `INSERT INTO learning.homework
         (class_id, subject_id, daily_lesson_id, title, instructions,
          assigned_on, due_on, whole_class, teacher_id, created_by)
       VALUES ($1::bigint, $2::bigint, $3::bigint, $4, $5, $6::date, $7::date,
               $8, $9::bigint, $10::bigint)
       RETURNING id::int AS id`,
      [input.classId, input.subjectId, input.dailyLessonId, input.title,
       input.instructions, input.assignedOn, input.dueOn, input.wholeClass,
       input.teacherId, input.createdBy],
    );
    const homeworkId = created.rows[0]!.id;
    if (!input.wholeClass && input.studentIds.length > 0) {
      await client.query(
        `INSERT INTO learning.homework_students (homework_id, student_id)
         SELECT $1::bigint, x.student_id FROM unnest($2::bigint[]) AS x(student_id)
         ON CONFLICT ON CONSTRAINT homework_students_pkey DO NOTHING`,
        [homeworkId, input.studentIds],
      );
    }
    await client.query("COMMIT");
    return homeworkId;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export const setActive = (homeworkId: number, isActive: boolean) =>
  pool.query("UPDATE learning.homework SET is_active = $2 WHERE id = $1::bigint",
    [homeworkId, isActive]);

/**
 * The work open to one child, with what they have already handed in.
 *
 * Work set before today and not withdrawn stays on the list whether or not its
 * day has passed: the deadline is a date the teacher wanted it by, not a door
 * that closes. A child finishing at the weekend still has somewhere to put it.
 */
export const forStudent = (studentId: number) =>
  readRows<{
    homeworkId: number;
    title: string;
    instructions: string | null;
    subjectName: string;
    assignedOn: string;
    dueOn: string | null;
    teacherName: string | null;
    attempts: number;
    lastSubmittedAt: string | null;
  }>(
    `SELECT h.id::int AS "homeworkId", h.title, h.instructions,
       sub.name_mn AS "subjectName", h.assigned_on::text AS "assignedOn",
       h.due_on::text AS "dueOn", u.display_name AS "teacherName",
       (SELECT count(*)::int FROM learning.homework_submissions sm
         WHERE sm.homework_id = h.id AND sm.student_id = $1::bigint) AS attempts,
       (SELECT to_json(max(sm.submitted_at)) #>> '{}' FROM learning.homework_submissions sm
         WHERE sm.homework_id = h.id AND sm.student_id = $1::bigint) AS "lastSubmittedAt"
     FROM learning.homework h
     JOIN core.student_enrollments e ON e.class_id = h.class_id AND e.is_active
       AND e.student_id = $1::bigint
     JOIN core.subjects sub ON sub.id = h.subject_id
     LEFT JOIN core.teachers t ON t.id = h.teacher_id
     LEFT JOIN core.users u ON u.id = t.user_id
     LEFT JOIN learning.homework_students hs
       ON hs.homework_id = h.id AND hs.student_id = $1::bigint
     WHERE h.is_active AND (h.whole_class OR hs.student_id IS NOT NULL)
     ORDER BY h.assigned_on DESC, h.id DESC`,
    [studentId],
  );

/** This child's own goes at one piece of work, oldest first. */
export const ownSubmissions = (homeworkId: number, studentId: number) =>
  readRows<{
    attemptNo: number;
    body: string | null;
    minutes: number | null;
    isLate: boolean;
    submittedAt: string;
  }>(
    `SELECT attempt_no::int AS "attemptNo", body, minutes::int AS minutes,
       is_late AS "isLate", to_json(submitted_at) #>> '{}' AS "submittedAt"
     FROM learning.homework_submissions
     WHERE homework_id = $1::bigint AND student_id = $2::bigint
     ORDER BY attempt_no`,
    [homeworkId, studentId],
  );

/**
 * Store one more go.
 *
 * The attempt number is taken inside the transaction, under a lock on the
 * work, so two tabs cannot both decide they are attempt three.
 */
export async function submit(input: {
  homeworkId: number;
  studentId: number;
  body: string | null;
  minutes: number | null;
  isLate: boolean;
}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1::bigint)", [input.homeworkId]);
    const { rows } = await client.query<{ next: number }>(
      `SELECT COALESCE(max(attempt_no), 0)::int + 1 AS next
         FROM learning.homework_submissions
        WHERE homework_id = $1::bigint AND student_id = $2::bigint`,
      [input.homeworkId, input.studentId],
    );
    const attemptNo = rows[0]!.next;
    const stored = await client.query<{ id: number }>(
      `INSERT INTO learning.homework_submissions
         (homework_id, student_id, attempt_no, body, minutes, is_late)
       VALUES ($1::bigint, $2::bigint, $3::smallint, $4, $5::smallint, $6)
       RETURNING id::int AS id`,
      [input.homeworkId, input.studentId, attemptNo, input.body,
       input.minutes, input.isLate],
    );
    await client.query("COMMIT");
    return { submissionId: stored.rows[0]!.id, attemptNo };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Whether this child is in the audience for this piece of work.
 *
 * Audience only - not whether it is still open. Folding the two together made
 * a withdrawn task read as "this was never yours", which is a different and
 * more alarming thing to tell a child than "your teacher took it back". The
 * caller checks openness separately and says so.
 */
export const isFor = (homeworkId: number, studentId: number) =>
  readRows<{ ok: boolean }>(
    `SELECT true AS ok
       FROM learning.homework h
       JOIN core.student_enrollments e ON e.class_id = h.class_id AND e.is_active
        AND e.student_id = $2::bigint
       LEFT JOIN learning.homework_students hs
         ON hs.homework_id = h.id AND hs.student_id = $2::bigint
      WHERE h.id = $1::bigint
        AND (h.whole_class OR hs.student_id IS NOT NULL)
      LIMIT 1`,
    [homeworkId, studentId],
  ).then((rows) => rows.length > 0);

export const rosterIds = (classId: number) =>
  readRows<{ id: number }>(
    `SELECT s.id::int AS id FROM core.students s
      JOIN core.student_enrollments e ON e.student_id = s.id AND e.is_active
     WHERE e.class_id = $1::bigint AND s.is_active`,
    [classId],
  ).then((rows) => rows.map((row) => row.id));
