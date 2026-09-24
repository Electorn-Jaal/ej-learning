import { pool, readRows } from "@workspace/db";

export type ClassDayLessonRow = {
  timetableSlotId: number | null;
  periodNo: number | null;
  startsAt: string | null;
  note: string | null;
  held: boolean;
  notHeldReason: string | null;
  isContinuation: boolean;
  quizOpensAt: string | null;
  quizQuestionCount: number | null;
  quizAttempts: number | null;
  answersOpenAt: string | null;
  subjectId: number;
  subjectName: string;
  lessonId: number | null;
  lessonCode: string | null;
  skillName: string | null;
  learningGoal: string | null;
  remember: string | null;
  workedExample: string | null;
  guidedPractice: string | null;
  independentPractice: string | null;
  studentMessage: string | null;
  estimatedMinutes: number | null;
  materialId: number | null;
  materialTitle: string | null;
  pageFrom: number | null;
  pageTo: number | null;
  bookPageFrom: number | null;
  bookPageTo: number | null;
  pageOffset: number;
};

/**
 * What this class has on, on this date, and everything written behind it.
 *
 * The timetable is the spine - a period exists whether or not anybody has
 * written a lesson for it - and the content hangs off the schedule row where
 * one has been chosen. The same shape the child is served, so a teacher
 * looking at this is looking at what their class is looking at, rather than
 * at a separate teacher's-eye summary that can drift from it.
 */
export const lessonsForClassDay = (
  classId: number,
  subjectIds: number[] | null,
  onDate: string,
) =>
  readRows<ClassDayLessonRow>(
    `WITH pattern AS (
       SELECT ts.id AS slot_id, ts.period_no, ts.subject_id
         FROM learning.timetable_slots ts
        WHERE ts.class_id = $1::bigint
          AND ts.weekday_no = EXTRACT(ISODOW FROM $3::date)
          AND ts.valid_from <= $3::date
          AND (ts.valid_to IS NULL OR ts.valid_to >= $3::date)
          AND ($2::bigint[] IS NULL OR ts.subject_id = ANY($2::bigint[]))
     ), combined AS (
       SELECT p.slot_id, p.period_no, p.subject_id, cs.daily_lesson_id, cs.note,
              cs.page_from, cs.page_to, COALESCE(cs.held, true) AS held,
              cs.not_held_reason, COALESCE(cs.is_continuation, false) AS is_continuation,
              cs.quiz_opens_at, cs.quiz_question_count, cs.quiz_attempts, cs.answers_open_at
         FROM pattern p
         LEFT JOIN learning.class_schedule cs
           ON cs.class_id = $1::bigint AND cs.scheduled_on = $3::date
          AND cs.subject_id = p.subject_id
          AND (cs.timetable_slot_id = p.slot_id
               OR (cs.timetable_slot_id IS NULL AND cs.period_no IS NOT DISTINCT FROM p.period_no))
       UNION ALL
       -- A lesson put on a day that the timetable does not carry: a makeup
       -- lesson, or one moved. It belongs on the page as much as the rest.
       SELECT NULL::bigint, cs.period_no, cs.subject_id, cs.daily_lesson_id, cs.note,
              cs.page_from, cs.page_to, cs.held, cs.not_held_reason, cs.is_continuation,
              cs.quiz_opens_at, cs.quiz_question_count, cs.quiz_attempts, cs.answers_open_at
         FROM learning.class_schedule cs
        WHERE cs.class_id = $1::bigint AND cs.scheduled_on = $3::date
          AND ($2::bigint[] IS NULL OR cs.subject_id = ANY($2::bigint[]))
          AND NOT EXISTS (
                SELECT 1 FROM pattern p
                 WHERE p.subject_id = cs.subject_id
                   AND (cs.timetable_slot_id = p.slot_id
                        OR (cs.timetable_slot_id IS NULL
                            AND p.period_no IS NOT DISTINCT FROM cs.period_no)))
     )
     SELECT combined.slot_id::int AS "timetableSlotId", combined.period_no::int AS "periodNo",
       to_char(p.starts_at, 'HH24:MI') AS "startsAt", combined.note,
       sub.id::int AS "subjectId", sub.name_mn AS "subjectName",
       dl.id::int AS "lessonId", dl.lesson_code AS "lessonCode", sk.name_mn AS "skillName",
       dl.learning_goal_mn AS "learningGoal", dl.remember_mn AS remember,
       dl.worked_example_mn AS "workedExample", dl.guided_practice_mn AS "guidedPractice",
       dl.independent_practice_mn AS "independentPractice",
       dl.student_message_mn AS "studentMessage", dl.estimated_minutes::int AS "estimatedMinutes",
       book.material_id::int AS "materialId", book.material_title AS "materialTitle",
       -- What is in force, and what the book prints. A teacher needs both: one
       -- to check, the other to go back to.
       COALESCE(combined.page_from, book.page_from)::int AS "pageFrom",
       COALESCE(combined.page_to, book.page_to)::int AS "pageTo",
       book.page_from::int AS "bookPageFrom", book.page_to::int AS "bookPageTo",
       COALESCE(book.page_offset, 0)::int AS "pageOffset",
       combined.held, combined.not_held_reason AS "notHeldReason",
       combined.is_continuation AS "isContinuation",
       to_char(combined.quiz_opens_at, 'HH24:MI') AS "quizOpensAt",
       combined.quiz_question_count::int AS "quizQuestionCount",
       combined.quiz_attempts::int AS "quizAttempts",
       to_json(combined.answers_open_at) #>> '{}' AS "answersOpenAt"
     FROM combined
     JOIN core.classes c ON c.id = $1::bigint
     JOIN core.subjects sub ON sub.id = combined.subject_id
     LEFT JOIN learning.class_periods p
       ON p.period_no = combined.period_no AND p.school_year = c.school_year
     LEFT JOIN learning.daily_lessons dl
       ON dl.id = combined.daily_lesson_id AND dl.status = 'APPROVED'
     LEFT JOIN content.skills sk ON sk.id = dl.core_skill_id
     LEFT JOIN LATERAL (
       SELECT material_id, material_title, page_from, page_to, page_offset
         FROM (
           (SELECT sm.id AS material_id, sm.title AS material_title, a.page_from, a.page_to,
                  (SELECT sv.page_offset FROM content.source_versions sv
                    WHERE sv.source_material_id = sm.id AND sv.status = 'APPROVED'
                    ORDER BY sv.version_no DESC LIMIT 1) AS page_offset,
                  1 AS rank
             FROM content.content_skill_maps m
             JOIN content.content_nodes cn ON cn.id = m.content_node_id AND cn.status = 'APPROVED'
             JOIN content.content_source_alignments a ON a.content_node_id = cn.id AND a.status = 'APPROVED'
             JOIN content.source_materials sm ON sm.id = a.source_material_id AND sm.status = 'APPROVED'
            WHERE m.skill_id = sk.id AND m.status = 'APPROVED'
            ORDER BY m.is_primary DESC, a.page_from
            LIMIT 1)
           UNION ALL
           -- The section the lesson itself names, for content authored from a
           -- book outline: it carries source_outline_node_id and no skill map,
           -- and without this every imported lesson looks bookless.
           (SELECT sm.id, sm.title, son.page_from, son.page_to,
                  (SELECT sv.page_offset FROM content.source_versions sv
                    WHERE sv.source_material_id = sm.id AND sv.status = 'APPROVED'
                    ORDER BY sv.version_no DESC LIMIT 1), 2
             FROM content.source_outline_nodes son
             JOIN content.source_materials sm ON sm.id = son.source_material_id
              AND sm.status = 'APPROVED'
            WHERE son.id = dl.source_outline_node_id)
         ) found ORDER BY rank LIMIT 1
     ) book ON true
     ORDER BY combined.period_no NULLS LAST, sub.name_mn`,
    [classId, subjectIds, onDate],
  );

export type ClassDayAnswerRow = {
  studentId: number;
  studentName: string;
  studentCode: string;
  attemptId: number | null;
  lessonCode: string | null;
  skillName: string | null;
  score: number | null;
  maxScore: number | null;
  submittedAt: string | null;
  answers: Array<{
    questionId: string;
    prompt: string;
    chosenText: string;
    correct: boolean;
  }> | null;
};

/**
 * Every child on the register, and what each of them answered that day.
 *
 * A LEFT JOIN, deliberately. The list of children who answered is the easy
 * half and the useless one: the teacher's question is who has not, and a
 * child who did nothing is invisible in a table built from attempts.
 */
export const answersForClassDay = (
  classId: number,
  subjectIds: number[] | null,
  onDate: string,
) =>
  readRows<ClassDayAnswerRow>(
    `SELECT st.id::int AS "studentId", st.display_name AS "studentName",
       st.student_code AS "studentCode",
       qa.id::int AS "attemptId", qa.lesson_code AS "lessonCode", sk.name_mn AS "skillName",
       qa.score::int AS score, qa.max_score::int AS "maxScore",
       to_json(qa.submitted_at) #>> '{}' AS "submittedAt", qa.answers
     FROM core.students st
     JOIN core.student_enrollments e ON e.student_id = st.id AND e.is_active
     LEFT JOIN learning.quiz_attempts qa
       ON qa.student_id = st.id
      AND (qa.submitted_at AT TIME ZONE 'Asia/Ulaanbaatar')::date = $3::date
     LEFT JOIN learning.daily_lessons dl ON dl.id = qa.daily_lesson_id
     LEFT JOIN content.skills sk ON sk.id = dl.core_skill_id
     WHERE e.class_id = $1::bigint AND st.is_active
       AND (qa.id IS NULL OR $2::bigint[] IS NULL OR sk.subject_id = ANY($2::bigint[]))
     ORDER BY st.display_name, qa.submitted_at`,
    [classId, subjectIds, onDate],
  );

/**
 * What each period of this day was said to have covered.
 *
 * Only a teacher's own answer is here. A period nobody has spoken for comes
 * back with nothing, and the screen then shows the day's own lesson - which
 * is all that is known about it.
 */
export const coverageForClassDay = (
  classId: number,
  subjectIds: number[] | null,
  onDate: string,
) =>
  readRows<{ subjectId: number; timetableSlotId: number | null; dailyLessonId: number }>(
    `SELECT subject_id::int AS "subjectId", timetable_slot_id::int AS "timetableSlotId",
       daily_lesson_id::int AS "dailyLessonId"
     FROM learning.class_lesson_coverage
     WHERE class_id = $1::bigint AND scheduled_on = $3::date
       AND ($2::bigint[] IS NULL OR subject_id = ANY($2::bigint[]))
     ORDER BY daily_lesson_id`,
    [classId, subjectIds, onDate],
  );


/**
 * The notebook marks written for one class on one day.
 *
 * Absence is a value here: a period nobody looked at has no rows, and the
 * screen shows those children as unchecked rather than as having done
 * nothing. Nothing is invented to fill the grid.
 */
export const notebookMarksForClassDay = (
  classId: number,
  subjectIds: number[] | null,
  onDate: string,
) =>
  readRows<{
    studentId: number;
    subjectId: number;
    timetableSlotId: number | null;
    state: string;
    comment: string | null;
  }>(
    `SELECT student_id::int AS "studentId", subject_id::int AS "subjectId",
       timetable_slot_id::int AS "timetableSlotId", state, comment
     FROM learning.notebook_marks
     WHERE class_id = $1::bigint AND scheduled_on = $3::date
       AND ($2::bigint[] IS NULL OR subject_id = ANY($2::bigint[]))`,
    [classId, subjectIds, onDate],
  );

/** The class's active roster, to check a mark is for a child who is in it. */
export const rosterIds = (classId: number) =>
  readRows<{ id: number }>(
    `SELECT s.id::int AS id
       FROM core.students s
       JOIN core.student_enrollments e ON e.student_id = s.id AND e.is_active
      WHERE e.class_id = $1::bigint AND s.is_active`,
    [classId],
  ).then((rows) => rows.map((row) => row.id));

/**
 * Write one period's marks, all together.
 *
 * A teacher marking a class works down the register and presses save once, so
 * the whole set arrives at once and lands at once. Children left out of the
 * list are left alone - a teacher who marked five books has said nothing
 * about the other twenty-five.
 *
 * An UNCHECKED state removes the row rather than storing a fourth value,
 * because "not checked" is exactly the absence of a mark: if it were stored,
 * a teacher undoing a mistake would leave behind a record saying somebody
 * looked.
 */
export async function setNotebookMarks(
  classId: number,
  subjectId: number,
  scheduledOn: string,
  slotId: number | null,
  markedBy: number,
  marks: Array<{ studentId: number; state: string; comment: string | null }>,
) {
  const clearing = marks.filter((mark) => mark.state === "UNCHECKED");
  const writing = marks.filter((mark) => mark.state !== "UNCHECKED");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (clearing.length > 0) {
      await client.query(
        `DELETE FROM learning.notebook_marks
          WHERE class_id = $1::bigint AND subject_id = $2::bigint
            AND scheduled_on = $3::date AND timetable_slot_id IS NOT DISTINCT FROM $4::bigint
            AND student_id = ANY($5::bigint[])`,
        [classId, subjectId, scheduledOn, slotId, clearing.map((mark) => mark.studentId)],
      );
    }
    if (writing.length > 0) {
      await client.query(
        `INSERT INTO learning.notebook_marks
           (class_id, subject_id, scheduled_on, timetable_slot_id, student_id, state,
            comment, marked_by, marked_at)
         SELECT $1::bigint, $2::bigint, $3::date, $4::bigint, x.student_id, x.state,
                x.comment, $8::bigint, now()
           FROM unnest($5::bigint[], $6::text[], $7::text[])
                  AS x(student_id, state, comment)
         ON CONFLICT ON CONSTRAINT notebook_marks_key DO UPDATE SET
           state = EXCLUDED.state,
           comment = EXCLUDED.comment,
           marked_by = EXCLUDED.marked_by,
           marked_at = EXCLUDED.marked_at`,
        [
          classId, subjectId, scheduledOn, slotId,
          writing.map((mark) => mark.studentId),
          writing.map((mark) => mark.state),
          writing.map((mark) => mark.comment),
          markedBy,
        ],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
