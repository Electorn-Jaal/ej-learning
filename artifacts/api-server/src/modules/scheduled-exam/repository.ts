import { pool, readRows } from "@workspace/db";

/**
 * Questions a class could be asked, for a teacher building a paper.
 *
 * Scoped to the subject and the year, because a question bank is written per
 * grade and a physics question has no business on a maths paper. Approved
 * only: a draft question is one somebody is still arguing about.
 */
export const itemBank = (subjectId: number, gradeLevelId: number) =>
  readRows<{
    itemId: number;
    itemCode: string;
    title: string;
    domain: string | null;
    maxScore: number;
    skillId: number | null;
    skillName: string | null;
    optionCount: number;
  }>(
    `SELECT i.id::int AS "itemId", i.item_code AS "itemCode", i.title_mn AS title,
       i.domain_mn AS domain, i.max_score::float8 AS "maxScore",
       i.skill_id::int AS "skillId", sk.name_mn AS "skillName",
       (SELECT count(*)::int FROM assessment.diagnostic_item_options o
         WHERE o.diagnostic_item_id = i.id) AS "optionCount"
     FROM assessment.diagnostic_items i
     LEFT JOIN content.skills sk ON sk.id = i.skill_id
     WHERE i.subject_id = $1::bigint AND i.grade_level_id = $2::smallint
       AND i.status = 'APPROVED'
     ORDER BY i.item_order, i.id`,
    [subjectId, gradeLevelId],
  );

/**
 * Write a paper and its questions, then the sitting that gives it to a class.
 *
 * All of it or none of it. A paper with no questions, or a sitting with no
 * paper, is not a half-finished exam that a teacher can go back and fix - it
 * is a row that looks like an exam on every screen that lists them.
 */
export async function createSitting(input: {
  paperCode: string;
  subjectId: number;
  gradeLevelId: number;
  classId: number;
  examKind: string;
  title: string;
  instructions: string | null;
  createdBy: number;
  itemIds: number[];
  opensAt: string;
  closesAt: string;
  wholeClass: boolean;
  onPaper: boolean;
  studentIds: number[];
}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const paper = await client.query<{ id: number }>(
      `INSERT INTO assessment.exam_papers
         (paper_code, subject_id, grade_level_id, class_id, exam_kind, title_mn,
          scheduled_on, instructions_mn, created_by, status)
       VALUES ($1, $2::bigint, $3::smallint, $4::bigint, $5::assessment.exam_kind, $6,
               ($7::timestamptz AT TIME ZONE 'Asia/Ulaanbaatar')::date, $8, $9::bigint, 'APPROVED')
       RETURNING id::int AS id`,
      [
        input.paperCode, input.subjectId, input.gradeLevelId, input.classId,
        input.examKind, input.title, input.opensAt, input.instructions, input.createdBy,
      ],
    );
    const paperId = paper.rows[0]!.id;

    await client.query(
      `INSERT INTO assessment.exam_paper_items (paper_id, diagnostic_item_id, item_order)
       SELECT $1::bigint, x.item_id, x.ord
         FROM unnest($2::bigint[]) WITH ORDINALITY AS x(item_id, ord)`,
      [paperId, input.itemIds],
    );

    const sitting = await client.query<{ id: number }>(
      `INSERT INTO assessment.exam_sittings
         (exam_paper_id, class_id, subject_id, opens_at, closes_at, whole_class,
          on_paper, created_by)
       VALUES ($1::bigint, $2::bigint, $3::bigint, $4::timestamptz, $5::timestamptz,
               $6, $7, $8::bigint)
       RETURNING id::int AS id`,
      [
        paperId, input.classId, input.subjectId, input.opensAt, input.closesAt,
        input.wholeClass, input.onPaper, input.createdBy,
      ],
    );
    const sittingId = sitting.rows[0]!.id;

    if (!input.wholeClass && input.studentIds.length > 0) {
      await client.query(
        `INSERT INTO assessment.exam_sitting_students (sitting_id, student_id)
         SELECT $1::bigint, x.student_id FROM unnest($2::bigint[]) AS x(student_id)`,
        [sittingId, input.studentIds],
      );
    }
    await client.query("COMMIT");
    return { sittingId, paperId };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/** The sittings a class has, newest window first, with how many have sat. */
export const sittingsForClass = (classId: number, subjectIds: number[] | null) =>
  readRows<{
    sittingId: number;
    paperId: number;
    title: string;
    examKind: string;
    subjectId: number;
    subjectName: string;
    opensAt: string;
    closesAt: string;
    answersOpen: boolean;
    wholeClass: boolean;
    onPaper: boolean;
    questionCount: number;
    invited: number;
    sat: number;
  }>(
    `SELECT s.id::int AS "sittingId", p.id::int AS "paperId", p.title_mn AS title,
       p.exam_kind::text AS "examKind", s.subject_id::int AS "subjectId",
       sub.name_mn AS "subjectName",
       to_json(s.opens_at) #>> '{}' AS "opensAt",
       to_json(s.closes_at) #>> '{}' AS "closesAt",
       (s.answers_open_at IS NOT NULL AND s.answers_open_at <= now()) AS "answersOpen",
       s.whole_class AS "wholeClass", s.on_paper AS "onPaper",
       (SELECT count(*)::int FROM assessment.exam_paper_items i WHERE i.paper_id = p.id)
         AS "questionCount",
       CASE WHEN s.whole_class
            THEN (SELECT count(*)::int FROM core.student_enrollments e
                   JOIN core.students st ON st.id = e.student_id AND st.is_active
                  WHERE e.class_id = s.class_id AND e.is_active)
            ELSE (SELECT count(*)::int FROM assessment.exam_sitting_students ss
                   WHERE ss.sitting_id = s.id AND ss.invited)
       END AS invited,
       (SELECT count(DISTINCT a.student_id)::int FROM assessment.diagnostic_attempts a
         WHERE a.exam_sitting_id = s.id) AS sat
     FROM assessment.exam_sittings s
     JOIN assessment.exam_papers p ON p.id = s.exam_paper_id
     JOIN core.subjects sub ON sub.id = s.subject_id
     WHERE s.class_id = $1::bigint
       AND ($2::bigint[] IS NULL OR s.subject_id = ANY($2::bigint[]))
     ORDER BY s.opens_at DESC`,
    [classId, subjectIds],
  );

export const sitting = (sittingId: number) =>
  readRows<{
    sittingId: number;
    paperId: number;
    classId: number;
    subjectId: number;
    title: string;
    examKind: string;
    instructions: string | null;
    gradeLevelId: number | null;
    opensAt: string;
    closesAt: string;
    answersOpen: boolean;
    wholeClass: boolean;
    onPaper: boolean;
  }>(
    `SELECT s.id::int AS "sittingId", p.id::int AS "paperId", s.class_id::int AS "classId",
       s.subject_id::int AS "subjectId", p.title_mn AS title, p.exam_kind::text AS "examKind",
       p.instructions_mn AS instructions, p.grade_level_id::int AS "gradeLevelId",
       to_json(s.opens_at) #>> '{}' AS "opensAt",
       to_json(s.closes_at) #>> '{}' AS "closesAt",
       (s.answers_open_at IS NOT NULL AND s.answers_open_at <= now()) AS "answersOpen",
       s.whole_class AS "wholeClass", s.on_paper AS "onPaper"
     FROM assessment.exam_sittings s
     JOIN assessment.exam_papers p ON p.id = s.exam_paper_id
     WHERE s.id = $1::bigint`,
    [sittingId],
  );

/** The paper's questions with their options, key included; the caller strips it. */
export const paperItems = (paperId: number) =>
  readRows<{
    itemId: number;
    itemOrder: number;
    title: string;
    stimulus: string | null;
    maxScore: number;
    skillId: number | null;
    optionId: number | null;
    optionText: string | null;
    isCorrect: boolean | null;
  }>(
    `SELECT i.id::int AS "itemId", pi.item_order::int AS "itemOrder", i.title_mn AS title,
       i.stimulus_mn AS stimulus,
       COALESCE(pi.max_score, i.max_score)::float8 AS "maxScore",
       i.skill_id::int AS "skillId",
       o.id::int AS "optionId", o.option_text AS "optionText", o.is_correct AS "isCorrect"
     FROM assessment.exam_paper_items pi
     JOIN assessment.diagnostic_items i ON i.id = pi.diagnostic_item_id
     LEFT JOIN assessment.diagnostic_item_options o ON o.diagnostic_item_id = i.id
     WHERE pi.paper_id = $1::bigint
     ORDER BY pi.item_order, o.sequence_no`,
    [paperId],
  );

/** Whether this child is in the audience, and how many goes they have. */
export const standing = (sittingId: number, studentId: number) =>
  readRows<{ invited: boolean; attemptsAllowed: number; attemptsUsed: number }>(
    `SELECT
       CASE WHEN s.whole_class
            THEN EXISTS (SELECT 1 FROM core.student_enrollments e
                          WHERE e.class_id = s.class_id AND e.student_id = $2::bigint
                            AND e.is_active)
            ELSE COALESCE(ss.invited, false)
       END AS invited,
       1 + COALESCE(ss.extra_attempts, 0)::int AS "attemptsAllowed",
       (SELECT count(*)::int FROM assessment.diagnostic_attempts a
         WHERE a.exam_sitting_id = s.id AND a.student_id = $2::bigint) AS "attemptsUsed"
     FROM assessment.exam_sittings s
     LEFT JOIN assessment.exam_sitting_students ss
       ON ss.sitting_id = s.id AND ss.student_id = $2::bigint
     WHERE s.id = $1::bigint`,
    [sittingId, studentId],
  );

/** The sittings open to this child now, and the ones they have already sat. */
export const sittingsForStudent = (studentId: number) =>
  readRows<{
    sittingId: number;
    title: string;
    examKind: string;
    subjectName: string;
    opensAt: string;
    closesAt: string;
    questionCount: number;
    attemptsUsed: number;
    attemptsAllowed: number;
    score: number | null;
    maxScore: number | null;
    answersOpen: boolean;
  }>(
    `SELECT s.id::int AS "sittingId", p.title_mn AS title, p.exam_kind::text AS "examKind",
       sub.name_mn AS "subjectName",
       to_json(s.opens_at) #>> '{}' AS "opensAt",
       to_json(s.closes_at) #>> '{}' AS "closesAt",
       (SELECT count(*)::int FROM assessment.exam_paper_items i WHERE i.paper_id = p.id)
         AS "questionCount",
       (SELECT count(*)::int FROM assessment.diagnostic_attempts a
         WHERE a.exam_sitting_id = s.id AND a.student_id = $1::bigint) AS "attemptsUsed",
       1 + COALESCE(ss.extra_attempts, 0)::int AS "attemptsAllowed",
       (SELECT a.total_score::float8 FROM assessment.diagnostic_attempts a
         WHERE a.exam_sitting_id = s.id AND a.student_id = $1::bigint
         ORDER BY a.attempted_at DESC LIMIT 1) AS score,
       (SELECT a.total_max_score::float8 FROM assessment.diagnostic_attempts a
         WHERE a.exam_sitting_id = s.id AND a.student_id = $1::bigint
         ORDER BY a.attempted_at DESC LIMIT 1) AS "maxScore",
       (s.answers_open_at IS NOT NULL AND s.answers_open_at <= now()) AS "answersOpen"
     FROM assessment.exam_sittings s
     JOIN assessment.exam_papers p ON p.id = s.exam_paper_id
     JOIN core.subjects sub ON sub.id = s.subject_id
     JOIN core.student_enrollments e ON e.class_id = s.class_id AND e.is_active
       AND e.student_id = $1::bigint
     LEFT JOIN assessment.exam_sitting_students ss
       ON ss.sitting_id = s.id AND ss.student_id = $1::bigint
     WHERE (s.whole_class OR COALESCE(ss.invited, false))
       AND NOT s.on_paper
       AND s.closes_at > now() - interval '30 days'
     ORDER BY s.opens_at DESC`,
    [studentId],
  );

/** Who has sat, and what they scored, for the teacher's list. */
export const resultsForSitting = (sittingId: number) =>
  readRows<{
    studentId: number;
    studentName: string;
    studentCode: string;
    attemptId: number | null;
    score: number | null;
    maxScore: number | null;
    attemptedAt: string | null;
    extraAttempts: number;
  }>(
    `SELECT st.id::int AS "studentId", st.display_name AS "studentName",
       st.student_code AS "studentCode",
       a.id::int AS "attemptId", a.total_score::float8 AS score,
       a.total_max_score::float8 AS "maxScore",
       to_json(a.attempted_at) #>> '{}' AS "attemptedAt",
       COALESCE(ss.extra_attempts, 0)::int AS "extraAttempts"
     FROM assessment.exam_sittings s
     JOIN core.student_enrollments e ON e.class_id = s.class_id AND e.is_active
     JOIN core.students st ON st.id = e.student_id AND st.is_active
     LEFT JOIN assessment.exam_sitting_students ss
       ON ss.sitting_id = s.id AND ss.student_id = st.id
     LEFT JOIN LATERAL (
       SELECT id, total_score, total_max_score, attempted_at
         FROM assessment.diagnostic_attempts
        WHERE exam_sitting_id = s.id AND student_id = st.id
        ORDER BY attempted_at DESC LIMIT 1
     ) a ON true
     WHERE s.id = $1::bigint
       AND (s.whole_class OR COALESCE(ss.invited, false))
     ORDER BY st.display_name`,
    [sittingId],
  );

/**
 * Store one sitting of a paper: the attempt, then the mark on every question.
 *
 * One transaction, because a total with no breakdown behind it is a number
 * nobody can check, and a breakdown with no total is invisible on every screen
 * that lists results.
 */
export async function storeAttempt(input: {
  sittingId: number;
  paperId: number;
  studentId: number;
  subjectId: number;
  gradeLevelId: number;
  attemptCode: string;
  rows: Array<{ itemId: number; awarded: number; max: number }>;
}) {
  const total = input.rows.reduce((sum, row) => sum + row.awarded, 0);
  const outOf = input.rows.reduce((sum, row) => sum + row.max, 0);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const attempt = await client.query<{ id: number }>(
      `INSERT INTO assessment.diagnostic_attempts
         (attempt_code, exam_paper_id, exam_sitting_id, student_id, subject_id,
          grade_level_id, status, total_score, total_max_score, score_percent)
       VALUES ($1, $2::bigint, $3::bigint, $4::bigint, $5::bigint, $6::smallint,
               'SUBMITTED', $7, $8, $9)
       RETURNING id::int AS id`,
      [
        input.attemptCode, input.paperId, input.sittingId, input.studentId,
        input.subjectId, input.gradeLevelId, total, outOf,
        outOf > 0 ? Math.round((total / outOf) * 10000) / 100 : 0,
      ],
    );
    const attemptId = attempt.rows[0]!.id;
    if (input.rows.length > 0) {
      await client.query(
        `INSERT INTO assessment.diagnostic_responses
           (attempt_id, diagnostic_item_id, awarded_score, max_score, score_percent)
         SELECT $1::bigint, x.item_id, x.awarded, x.max_score,
                CASE WHEN x.max_score > 0 THEN round((x.awarded / x.max_score) * 100, 2) ELSE 0 END
           FROM unnest($2::bigint[], $3::numeric[], $4::numeric[])
                  AS x(item_id, awarded, max_score)`,
        [
          attemptId,
          input.rows.map((row) => row.itemId),
          input.rows.map((row) => row.awarded),
          input.rows.map((row) => row.max),
        ],
      );
    }
    await client.query("COMMIT");
    return { attemptId, total, outOf };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/** Let named children sit again, and release the key when the teacher says. */
export const grantExtraAttempt = (sittingId: number, studentIds: number[]) =>
  pool.query(
    `INSERT INTO assessment.exam_sitting_students (sitting_id, student_id, invited, extra_attempts)
     SELECT $1::bigint, x.student_id, true, 1 FROM unnest($2::bigint[]) AS x(student_id)
     ON CONFLICT ON CONSTRAINT exam_sitting_students_pkey DO UPDATE SET
       invited = true,
       extra_attempts = assessment.exam_sitting_students.extra_attempts + 1`,
    [sittingId, studentIds],
  );

export const setAnswersOpen = (sittingId: number, at: string | null) =>
  pool.query(
    `UPDATE assessment.exam_sittings SET answers_open_at = $2::timestamptz WHERE id = $1::bigint`,
    [sittingId, at],
  );

export const classGrade = (classId: number) =>
  readRows<{ gradeLevelId: number }>(
    `SELECT grade_level_id::int AS "gradeLevelId" FROM core.classes WHERE id = $1::bigint`,
    [classId],
  );

export const rosterIds = (classId: number) =>
  readRows<{ id: number }>(
    `SELECT s.id::int AS id FROM core.students s
      JOIN core.student_enrollments e ON e.student_id = s.id AND e.is_active
     WHERE e.class_id = $1::bigint AND s.is_active`,
    [classId],
  ).then((rows) => rows.map((row) => row.id));
