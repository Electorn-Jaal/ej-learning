import { sql } from "drizzle-orm";
import { db, readRows } from "@workspace/db";

// Where a class has reached in its core book.
//
// The term calendar says what a term is meant to cover; only the teacher
// knows where the class actually is. These four read and move that pointer.

export type ClassTopicRow = {
  classId: string; className: string; gradeLevel: number;
  subjectCode: string; subjectName: string;
  materialId: string | null; bookTitle: string | null;
  nodeId: string | null; printedNumber: string | null; topicTitle: string | null;
  pageFrom: number | null; pageTo: number | null; periodNo: number | null;
  effectiveOn: string | null; sectionCount: number; canEdit: boolean;
  editBasis: 'ADMIN' | 'ASSIGNED' | 'SUBJECT' | null;
  setByName: string | null;
};

/**
 * Every class and subject this teacher may look at, with the topic each one is
 * currently on.
 *
 * Visibility and editability are separate, the same way core.class_teachers
 * has always treated them: a class teacher sees the English their colleague
 * takes but has no business moving its pointer. An admin may do both.
 *
 * There is a third standing, between those two, and it is the one almost every
 * teacher in this school currently has. The register named their specialty but
 * nobody has yet said which classes are theirs, so core.teacher_subjects can
 * tell us that Б.Чингүнбаяр teaches maths without telling us that 6a's maths
 * is his. Refusing him the board entirely would leave the screen empty for
 * fifteen of the twenty-four teachers; handing him a silent write over all
 * fourteen maths classes would let three maths teachers overwrite each other
 * without ever seeing it happen.
 *
 * So he gets both, and the row says which it is. editBasis is ASSIGNED when
 * core.class_teachers actually names him, SUBJECT when only the specialty
 * does, and setByName carries whoever last moved the pointer. A shared
 * pointer stays shared, but it stops being invisible, and the day the class
 * assignments arrive every SUBJECT row becomes an ASSIGNED one with no code
 * change at all.
 */
export const classTopics = (teacherId: number | null, isAdmin: boolean) =>
  readRows<ClassTopicRow>(`
    SELECT c.id::text AS "classId", c.name_mn AS "className",
      g.grade_number::int AS "gradeLevel",
      sub.code AS "subjectCode", sub.name_mn AS "subjectName",
      bk.id::text AS "materialId", bk.title AS "bookTitle",
      n.id::text AS "nodeId", n.printed_number AS "printedNumber",
      n.title AS "topicTitle", n.page_from::int AS "pageFrom", n.page_to::int AS "pageTo",
      n.planning_period_no::int AS "periodNo",
      ct.effective_on::text AS "effectiveOn",
      (SELECT count(*)::int FROM content.source_outline_nodes o
        WHERE o.source_material_id = bk.id) AS "sectionCount",
      setter.display_name AS "setByName",
      (assigned.ok OR specialty.ok OR $2::boolean) AS "canEdit",
      CASE
        WHEN assigned.ok THEN 'ASSIGNED'
        WHEN specialty.ok THEN 'SUBJECT'
        WHEN $2::boolean THEN 'ADMIN'
      END AS "editBasis"
    FROM core.class_subjects cs
    JOIN core.classes c ON c.id = cs.class_id AND c.is_active
    JOIN core.grade_levels g ON g.id = c.grade_level_id
    JOIN core.subjects sub ON sub.id = cs.subject_id AND sub.is_active
    LEFT JOIN content.source_materials bk ON bk.id = cs.source_material_id
    LEFT JOIN learning.class_topics ct
      ON ct.class_id = cs.class_id AND ct.subject_id = cs.subject_id
    LEFT JOIN content.source_outline_nodes n ON n.id = ct.source_outline_node_id
    LEFT JOIN core.users setter ON setter.id = ct.set_by
    -- Both standings are computed per row rather than filtered on, because
    -- the WHERE below and the editBasis above need the same two answers and
    -- a CROSS JOIN LATERAL keeps them from being written out twice.
    CROSS JOIN LATERAL (SELECT EXISTS (
      SELECT 1 FROM core.class_teachers t
      WHERE t.class_id = c.id AND t.teacher_id = $1::bigint AND t.is_active
        AND (t.subject_id IS NULL OR t.subject_id = sub.id)) AS ok) assigned
    CROSS JOIN LATERAL (SELECT EXISTS (
      SELECT 1 FROM core.teacher_subjects ts
      WHERE ts.teacher_id = $1::bigint AND ts.subject_id = sub.id
        AND ts.is_active) AS ok) specialty
    WHERE cs.is_active AND (
      $2::boolean OR assigned.ok OR specialty.ok
      -- The homeroom teacher sees their class whole, every subject of it,
      -- whether or not they take any of them.
      OR c.class_teacher_id = $1::bigint)
    ORDER BY g.grade_number, c.class_code, sub.code`,
    [teacherId ?? 0, isAdmin]);

export type OutlineChoiceRow = {
  nodeId: string; printedNumber: string | null; title: string;
  pageFrom: number | null; pageTo: number | null; periodNo: number | null;
  sequenceNo: number; isCurrent: boolean;
};

/**
 * The sections of the book a class works from, in book order, for a teacher
 * choosing one. Returns nothing when the class has no core book yet, which is
 * the honest answer rather than the whole library.
 */
export const outlineChoices = (classId: string, subjectCode: string) =>
  readRows<OutlineChoiceRow>(`
    SELECT n.id::text AS "nodeId", n.printed_number AS "printedNumber", n.title,
      n.page_from::int AS "pageFrom", n.page_to::int AS "pageTo",
      n.planning_period_no::int AS "periodNo", n.sequence_no::int AS "sequenceNo",
      -- COALESCE, not a bare comparison: with no pointer set the left join
      -- leaves ct null, and comparing null to n.id yields null rather than
      -- false, which reaches the caller as a missing boolean instead of
      -- "not this one".
      COALESCE(ct.source_outline_node_id = n.id, false) AS "isCurrent"
    FROM core.class_subjects cs
    JOIN core.subjects sub ON sub.id = cs.subject_id AND sub.code = $2
    JOIN content.source_outline_nodes n ON n.source_material_id = cs.source_material_id
    LEFT JOIN learning.class_topics ct
      ON ct.class_id = cs.class_id AND ct.subject_id = cs.subject_id
    WHERE cs.class_id = $1::bigint AND cs.is_active
    ORDER BY n.sequence_no`,
    [classId, subjectCode]);

/**
 * Whether this section really belongs to the book this class studies for this
 * subject, and whether this teacher may move the pointer.
 *
 * Both halves matter. Without the first, a teacher could park 6a's maths on a
 * chapter of the history book - the foreign key only says the node exists, not
 * that it is theirs. Without the second, any teacher could rewrite any class.
 */
export const topicWriteCheck = (
  classId: string, subjectCode: string, nodeId: string | null,
  teacherId: number | null, isAdmin: boolean,
) =>
  readRows<{ subjectId: string; hasBook: boolean; nodeBelongs: boolean; canEdit: boolean }>(`
    SELECT cs.subject_id::text AS "subjectId",
      (cs.source_material_id IS NOT NULL) AS "hasBook",
      ($3::bigint IS NULL OR EXISTS (
        SELECT 1 FROM content.source_outline_nodes n
        WHERE n.id = $3::bigint AND n.source_material_id = cs.source_material_id)) AS "nodeBelongs",
      ($5::boolean
        OR EXISTS (
          SELECT 1 FROM core.class_teachers mine
          WHERE mine.class_id = cs.class_id AND mine.teacher_id = $4::bigint
            AND mine.is_active AND mine.subject_id = cs.subject_id)
        -- The specialty standing, matching the board: a maths teacher not yet
        -- assigned to this class may still move its maths pointer, and
        -- learning.class_topics.set_by records that it was them.
        OR EXISTS (
          SELECT 1 FROM core.teacher_subjects ts
          WHERE ts.teacher_id = $4::bigint AND ts.subject_id = cs.subject_id
            AND ts.is_active)) AS "canEdit"
    FROM core.class_subjects cs
    JOIN core.subjects sub ON sub.id = cs.subject_id AND sub.code = $2
    WHERE cs.class_id = $1::bigint AND cs.is_active`,
    [classId, subjectCode, nodeId, teacherId ?? 0, isAdmin]);

/**
 * Moves a class's pointer, or clears it when nodeId is null.
 *
 * Clearing matters: a teacher who picked the wrong section needs a way back to
 * "not started" rather than being stuck naming some other wrong one. The route
 * has already checked that the node belongs to this class's book.
 */
export async function writeClassTopic(
  classId: string, subjectId: string, nodeId: string | null,
  note: string | null, setBy: number,
) {
  if (nodeId === null) {
    await db.execute(sql`
      DELETE FROM learning.class_topics
      WHERE class_id = ${classId}::bigint AND subject_id = ${subjectId}::bigint`);
    return;
  }
  await db.execute(sql`
    INSERT INTO learning.class_topics
      (class_id, subject_id, source_outline_node_id, effective_on, note, set_by)
    VALUES (${classId}::bigint, ${subjectId}::bigint, ${nodeId}::bigint,
            CURRENT_DATE, ${note}, ${setBy}::bigint)
    ON CONFLICT (class_id, subject_id) DO UPDATE SET
      source_outline_node_id = EXCLUDED.source_outline_node_id,
      effective_on = EXCLUDED.effective_on,
      note = EXCLUDED.note,
      set_by = EXCLUDED.set_by,
      updated_at = now()`);
}
