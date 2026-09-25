import { pool, readRows } from '@workspace/db';
import type { DiagnosticEvidence, DiagnosticPlanEntry, DiagnosticResource, DiagnosticResourceInput,
  DiagnosticTarget } from '@workspace/api-zod';
type Row<T> = { [K in keyof T]: T[K] };

const targetFields = `m.id::int AS "mapId", n.id::int AS "topicId", n.name_mn AS "topicName",
  sk.id::int AS "skillId", sk.name_mn AS "skillName"`;
const targetJoins = `JOIN content.content_nodes n ON n.id=m.content_node_id
  JOIN content.skills sk ON sk.id=m.skill_id`;
const approved = `m.status='APPROVED' AND n.status='APPROVED' AND sk.status='APPROVED'
  AND n.subject_id=sk.subject_id`;

export const targets = (subjectId: number) => readRows<Row<DiagnosticTarget>>(
  `SELECT ${targetFields} FROM content.content_skill_maps m ${targetJoins}
   WHERE ${approved} AND sk.subject_id=$1 ORDER BY n.sequence_no, sk.skill_code`, [subjectId]);

export const items = (subjectId: number) => readRows<{id: number; title: string; mapIds: number[]}>(
  `SELECT i.id::int AS id, i.title_mn AS title,
   COALESCE((SELECT jsonb_agg(t.map_id::int ORDER BY t.map_id)
     FROM assessment.diagnostic_item_targets t WHERE t.item_id=i.id),'[]') AS "mapIds"
   FROM assessment.diagnostic_items i WHERE i.subject_id=$1 AND i.status='APPROVED'
   ORDER BY i.item_order, i.id`, [subjectId]);

export const sources = (subjectId: number) => readRows<{id: number; title: string}>(
  `SELECT id::int AS id, COALESCE(title,source_code) AS title FROM content.source_materials
   WHERE subject_id=$1 AND status='APPROVED' ORDER BY title`, [subjectId]);

export const resources = (subjectId: number) => readRows<Row<DiagnosticResource>>(
  `SELECT r.id::int AS id,r.title,r.kind,r.instructions,
     r.source_material_id::int AS "sourceMaterialId",s.title AS "sourceTitle",r.reference,
     jsonb_agg(m.id::int ORDER BY m.id) AS "mapIds"
   FROM content.diagnostic_resources r
   JOIN content.diagnostic_resource_targets rt ON rt.resource_id=r.id
   JOIN content.content_skill_maps m ON m.id=rt.map_id ${targetJoins}
   LEFT JOIN content.source_materials s ON s.id=r.source_material_id
   WHERE ${approved} AND sk.subject_id=$1 AND (s.id IS NULL OR s.status='APPROVED')
   GROUP BY r.id,s.title ORDER BY r.id`, [subjectId]);

export const itemSubject = (itemId: number) => readRows<{subjectId: number}>(
  `SELECT subject_id::int AS "subjectId" FROM assessment.diagnostic_items
   WHERE id=$1 AND status='APPROVED'`, [itemId]);

export async function setTargets(itemId: number, mapIds: number[]) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT id FROM assessment.diagnostic_items WHERE id=$1 FOR UPDATE', [itemId]);
    await client.query('DELETE FROM assessment.diagnostic_item_targets WHERE item_id=$1', [itemId]);
    await client.query(`INSERT INTO assessment.diagnostic_item_targets (item_id,map_id)
      SELECT $1,unnest($2::bigint[])`, [itemId,mapIds]);
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

export async function createResource(input: DiagnosticResourceInput, userId: number) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const {rows: [row]} = await client.query<{id: number}>(
      `INSERT INTO content.diagnostic_resources(title,kind,instructions,source_material_id,reference,created_by)
       VALUES($1,$2,$3,$4,$5,$6) RETURNING id::int AS id`,
      [input.title.trim(),input.kind,input.instructions.trim(),input.sourceMaterialId ?? null,input.reference ?? null,userId]);
    await client.query(`INSERT INTO content.diagnostic_resource_targets(resource_id,map_id)
      SELECT $1,unnest($2::bigint[])`, [row!.id,input.mapIds]);
    await client.query('COMMIT');
    return row!;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

export const mapSubjects = (mapIds: number[]) => readRows<{subjectId: number}>(
  `SELECT DISTINCT sk.subject_id::int AS "subjectId" FROM content.content_skill_maps m
   ${targetJoins} WHERE ${approved} AND m.id=ANY($1::bigint[])`,[mapIds]);

export const attempt = (attemptId: number) => readRows<{
  attemptId: number; classId: number; subjectId: number; studentName: string; title: string;
}>(`SELECT a.id::int AS "attemptId",s.class_id::int AS "classId",a.subject_id::int AS "subjectId",
    st.display_name AS "studentName",p.title_mn AS title
  FROM assessment.diagnostic_attempts a
  JOIN assessment.exam_sittings s ON s.id=a.exam_sitting_id
  JOIN assessment.exam_papers p ON p.id=a.exam_paper_id AND p.exam_kind='DIAGNOSTIC'
  JOIN core.students st ON st.id=a.student_id
  WHERE a.id=$1 AND a.status='SUBMITTED'`,[attemptId]);

export const evidence = (attemptId: number) => readRows<Row<DiagnosticEvidence>>(
  `SELECT i.id::int AS "itemId",i.title_mn AS title,r.awarded_score::float8 AS awarded,
      r.max_score::float8 AS "maxScore",
      COALESCE((SELECT jsonb_agg(jsonb_build_object('mapId',m.id::int,'topicId',n.id::int,
        'topicName',n.name_mn,'skillId',sk.id::int,'skillName',sk.name_mn) ORDER BY m.id)
        FROM assessment.diagnostic_item_targets t
        JOIN content.content_skill_maps m ON m.id=t.map_id ${targetJoins}
        WHERE t.item_id=i.id AND ${approved} AND sk.subject_id=a.subject_id),'[]') AS targets
    FROM assessment.diagnostic_responses r
    JOIN assessment.diagnostic_attempts a ON a.id=r.attempt_id
    JOIN assessment.diagnostic_items i ON i.id=r.diagnostic_item_id
    WHERE r.attempt_id=$1 ORDER BY i.item_order,i.id`,[attemptId]);

export type Review = { revision: number; evidence: DiagnosticEvidence[];
  entries: DiagnosticPlanEntry[]; note: string; updatedAt: string };
export const review = (attemptId: number) => readRows<Review>(
  `SELECT revision,evidence,entries,note,to_json(updated_at)#>>'{}' AS "updatedAt"
   FROM assessment.diagnostic_plan_reviews WHERE attempt_id=$1`,[attemptId]);

export const saveReview = async (attemptId: number, revision: number,
  snapshot: DiagnosticEvidence[], entries: DiagnosticPlanEntry[], note: string, userId: number) => {
  // The insert is permitted only with revision=0. A stale tab cannot create a
  // new copy or overwrite a more recent teacher's work.
  const result = revision === 0
    ? await pool.query(`INSERT INTO assessment.diagnostic_plan_reviews
       (attempt_id,evidence,entries,note,updated_by) VALUES($1,$2::jsonb,$3::jsonb,$4,$5)
       ON CONFLICT (attempt_id) DO NOTHING`,[attemptId,JSON.stringify(snapshot),JSON.stringify(entries),note,userId])
    : await pool.query(`UPDATE assessment.diagnostic_plan_reviews
       SET entries=$3::jsonb,note=$4,updated_by=$5,updated_at=now(),revision=revision+1
       WHERE attempt_id=$1 AND revision=$2`,[attemptId,revision,JSON.stringify(entries),note,userId]);
  return result.rowCount === 1;
};
