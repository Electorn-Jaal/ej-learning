import { and, eq, sql } from "drizzle-orm";
import {
  db,
  readRows,
  sourceOutlineNodesInContent,
  sourceVersionsInContent,
} from "@workspace/db";

export const adminMaterials = () =>
  readRows<{
    id: number;
    sourceCode: string;
    title: string | null;
    subjectName: string;
    status: string;
    hasFile: boolean;
    filePages: number | null;
    pageOffset: number;
    sectionCount: number;
  }>(
    `SELECT sm.id::int AS id, sm.source_code AS "sourceCode", sm.title,
       sub.name_mn AS "subjectName", sm.status::text AS status,
       (v.storage_key IS NOT NULL) AS "hasFile",
       sm.total_pages::int AS "filePages",
       COALESCE(v.page_offset, 0)::int AS "pageOffset",
       (SELECT count(*)::int FROM content.source_outline_nodes o
        WHERE o.source_material_id = sm.id) AS "sectionCount"
     FROM content.source_materials sm
     JOIN core.subjects sub ON sub.id = sm.subject_id
     LEFT JOIN LATERAL (
       SELECT sv.storage_key, sv.page_offset FROM content.source_versions sv
       WHERE sv.source_material_id = sm.id
       ORDER BY sv.version_no DESC LIMIT 1
     ) v ON true
     ORDER BY (v.storage_key IS NULL), sm.source_code`,
  );

export const materialHeader = (materialId: number) =>
  readRows<{ title: string | null; pageOffset: number; filePages: number | null }>(
    `SELECT sm.title, COALESCE(v.page_offset, 0)::int AS "pageOffset",
       sm.total_pages::int AS "filePages"
     FROM content.source_materials sm
     LEFT JOIN LATERAL (
       SELECT sv.page_offset FROM content.source_versions sv
       WHERE sv.source_material_id = sm.id ORDER BY sv.version_no DESC LIMIT 1
     ) v ON true
     WHERE sm.id = $1::bigint`,
    [materialId],
  );

/**
 * Sections with a count of the lessons that reach them.
 *
 * The count is what turns an edit from a typo fix into a change that moves
 * real work, so the screen shows it rather than leaving an administrator to
 * guess whether a section is in use.
 */
export const outlineSections = (materialId: number) =>
  readRows<{
    id: number;
    outlineCode: string;
    printedNumber: string | null;
    title: string;
    pageFrom: number | null;
    pageTo: number | null;
    sequenceNo: number;
    usedByLessons: number;
  }>(
    `SELECT o.id::int AS id, o.outline_code AS "outlineCode",
       o.printed_number AS "printedNumber", o.title,
       o.page_from::int AS "pageFrom", o.page_to::int AS "pageTo",
       o.sequence_no::int AS "sequenceNo",
       (SELECT count(DISTINCT dl.id)::int
        FROM content.content_source_alignments a
        JOIN content.content_skill_maps m ON m.content_node_id = a.content_node_id
        JOIN learning.daily_lessons dl ON dl.core_skill_id = m.skill_id
        WHERE a.source_outline_node_id = o.id) AS "usedByLessons"
     FROM content.source_outline_nodes o
     WHERE o.source_material_id = $1::bigint
     ORDER BY o.sequence_no, o.outline_code`,
    [materialId],
  );

/**
 * Moves the page offset on the newest version only.
 *
 * The offset describes one scan: a re-scanned book has its own front matter
 * and its own gap between printed and file pages. Setting it across every
 * version would make an older file's page references wrong the moment a new
 * one is uploaded.
 *
 * Returns false when there is no file to correct.
 */
export async function setPageOffset(materialId: number, pageOffset: number) {
  const result = await db.execute(sql`
    UPDATE content.source_versions SET page_offset = ${pageOffset}
    WHERE source_material_id = ${materialId}
      AND version_no = (SELECT max(version_no) FROM content.source_versions
                        WHERE source_material_id = ${materialId})`);
  return (result.rowCount ?? 0) > 0;
}

export type OutlineInput = {
  outlineCode: string;
  printedNumber: string | null;
  title: string;
  pageFrom: number | null;
  pageTo: number | null;
  sequenceNo: number;
};

/**
 * Upserts by outline code. Nothing is deleted: a section may already be
 * aligned to content and reached by lessons, and dropping it silently would
 * leave those pointing at a row that is gone.
 */
export async function upsertOutline(materialId: number, sections: OutlineInput[]) {
  // sequence_no is unique per material, so reordering collides mid-update:
  // moving section 3 into slot 2 while 2 still holds it fails. Park the
  // existing rows out of range first, then write the intended positions.
  await db.execute(sql`
    UPDATE content.source_outline_nodes
    SET sequence_no = sequence_no + 1000
    WHERE source_material_id = ${materialId} AND sequence_no < 1000`);

  for (const section of sections) {
    await db
      .insert(sourceOutlineNodesInContent)
      .values({
        sourceMaterialId: materialId,
        outlineCode: section.outlineCode,
        printedNumber: section.printedNumber,
        nodeType: "SECTION",
        title: section.title,
        pageFrom: section.pageFrom,
        pageTo: section.pageTo,
        sequenceNo: section.sequenceNo,
        status: "APPROVED",
        dataQualityStatus: "COMPLETE",
      })
      .onConflictDoUpdate({
        target: [
          sourceOutlineNodesInContent.sourceMaterialId,
          sourceOutlineNodesInContent.outlineCode,
        ],
        set: {
          printedNumber: section.printedNumber,
          title: section.title,
          pageFrom: section.pageFrom,
          pageTo: section.pageTo,
          sequenceNo: section.sequenceNo,
        },
      });
  }

  // Alignments carry their own copy of the range so a lesson can cite pages
  // without walking back to the outline. Keep them in step.
  await db.execute(sql`
    UPDATE content.content_source_alignments a
    SET page_from = o.page_from, page_to = o.page_to
    FROM content.source_outline_nodes o
    WHERE a.source_outline_node_id = o.id
      AND o.source_material_id = ${materialId}`);
}

export const outlineCodeExists = (materialId: number, code: string) =>
  db
    .select({ id: sourceOutlineNodesInContent.id })
    .from(sourceOutlineNodesInContent)
    .where(
      and(
        eq(sourceOutlineNodesInContent.sourceMaterialId, materialId),
        eq(sourceOutlineNodesInContent.outlineCode, code),
      ),
    )
    .limit(1);

/** The material already holding this exact file, if any. */
export const materialWithChecksum = (checksum: string) =>
  readRows<{ sourceCode: string; title: string | null; versionNo: number }>(
    `SELECT sm.source_code AS "sourceCode", sm.title, sv.version_no::int AS "versionNo"
     FROM content.source_versions sv
     JOIN content.source_materials sm ON sm.id = sv.source_material_id
     WHERE sv.checksum_sha256 = $1
     LIMIT 1`,
    [checksum],
  );

/** The identity a stored file is named after, and where the next version sits. */
export const materialForUpload = (materialId: number) =>
  readRows<{ sourceCode: string; title: string | null; nextVersion: number }>(
    `SELECT sm.source_code AS "sourceCode", sm.title,
       COALESCE(max(sv.version_no), 0)::int + 1 AS "nextVersion"
     FROM content.source_materials sm
     LEFT JOIN content.source_versions sv ON sv.source_material_id = sm.id
     WHERE sm.id = $1::bigint
     GROUP BY sm.source_code, sm.title`,
    [materialId],
  );

/**
 * Records an uploaded file as a new version.
 *
 * Versions are added, never replaced. A book that has been re-scanned leaves
 * the old file in place because outline rows and lesson alignments were made
 * against its page numbers, and overwriting would silently move every page
 * reference in the database.
 */
export async function insertSourceVersion(row: {
  materialId: number;
  versionNo: number;
  storageKey: string;
  originalFilename: string;
  sizeBytes: number;
  checksum: string;
  pageOffset: number;
  totalPages: number | null;
}) {
  await db.execute(sql`
    INSERT INTO content.source_versions
      (source_material_id, version_no, original_filename, storage_key, mime_type,
       file_size_bytes, checksum_sha256, status, page_offset)
    VALUES (${row.materialId}, ${row.versionNo}, ${row.originalFilename},
      ${row.storageKey}, 'application/pdf', ${row.sizeBytes}, ${row.checksum},
      'APPROVED', ${row.pageOffset})`);

  if (row.totalPages !== null) {
    await db.execute(sql`
      UPDATE content.source_materials
      SET total_pages = ${row.totalPages}, updated_at = now()
      WHERE id = ${row.materialId}`);
  }
}

/**
 * Every topic with the skills mapped to it, and every skill mapped to none.
 *
 * A LEFT JOIN rather than an inner one, because a topic carrying no skill at
 * all is the fault worth seeing most: lessons under it can be timetabled and
 * nothing they do will ever be measured. The map's own status comes back
 * beside the skill's, since they are separate gates and a link left at DRAFT
 * is invisible to students however approved the skill it names.
 */
export const skillMapRows = () =>
  readRows<{
    nodeId: number;
    contentCode: string;
    nodeName: string;
    levelType: string;
    nodeStatus: string;
    subjectName: string;
    skillCode: string | null;
    skillName: string | null;
    skillStatus: string | null;
    isPrimary: boolean | null;
    mapStatus: string | null;
    lessonCount: number | null;
  }>(
    `SELECT cn.id::int AS "nodeId", cn.content_code AS "contentCode",
       cn.name_mn AS "nodeName", cn.level_type::text AS "levelType",
       cn.status::text AS "nodeStatus", sub.name_mn AS "subjectName",
       s.skill_code AS "skillCode", s.name_mn AS "skillName",
       s.status::text AS "skillStatus", m.is_primary AS "isPrimary",
       m.status::text AS "mapStatus",
       (SELECT count(*)::int FROM learning.daily_lessons dl
        WHERE dl.core_skill_id = s.id) AS "lessonCount"
     FROM content.content_nodes cn
     JOIN core.subjects sub ON sub.id = cn.subject_id
     LEFT JOIN content.content_skill_maps m ON m.content_node_id = cn.id
     LEFT JOIN content.skills s ON s.id = m.skill_id
     ORDER BY sub.code, cn.sequence_no, cn.content_code,
       m.is_primary DESC NULLS LAST, s.skill_code`,
  );

/**
 * Skills no topic carries. A lesson can still be written against one, which is
 * why the lesson count matters: those lessons teach, but the walk from skill
 * to book pages runs through this mapping and will find nothing.
 */
export const unmappedSkills = () =>
  readRows<{
    skillCode: string;
    name: string;
    subjectName: string;
    status: string;
    lessonCount: number;
  }>(
    `SELECT s.skill_code AS "skillCode", s.name_mn AS name,
       sub.name_mn AS "subjectName", s.status::text AS status,
       (SELECT count(*)::int FROM learning.daily_lessons dl
        WHERE dl.core_skill_id = s.id) AS "lessonCount"
     FROM content.skills s
     JOIN core.subjects sub ON sub.id = s.subject_id
     WHERE NOT EXISTS (
       SELECT 1 FROM content.content_skill_maps m WHERE m.skill_id = s.id)
     ORDER BY sub.code, s.skill_code`,
  );

/**
 * The prerequisite chain, with the facts that decide whether each link does
 * anything.
 *
 * `followed` is the one that matters: remediation walks a link only when it is
 * both APPROVED and REQUIRED, so a link that is neither sits in the table
 * looking like a decision while changing nothing. The dead-end check mirrors
 * the walk's own condition on the lesson it would send a child to.
 */
export const skillChainLinks = () =>
  readRows<{
    dependencyCode: string;
    skillCode: string;
    skillName: string;
    prerequisiteCode: string;
    prerequisiteName: string;
    subjectName: string;
    relationType: string;
    importance: string;
    status: string;
    reason: string;
    prerequisiteHasLesson: boolean;
  }>(
    `SELECT d.dependency_code AS "dependencyCode",
       s.skill_code AS "skillCode", s.name_mn AS "skillName",
       p.skill_code AS "prerequisiteCode", p.name_mn AS "prerequisiteName",
       sub.name_mn AS "subjectName", d.relation_type::text AS "relationType",
       d.importance::text AS importance, d.status::text AS status,
       d.reason_mn AS reason,
       EXISTS (SELECT 1 FROM learning.daily_lessons dl
               WHERE dl.core_skill_id = p.id
                 AND dl.status = 'APPROVED' AND dl.web_ready)
         AS "prerequisiteHasLesson"
     FROM content.skill_dependencies d
     JOIN content.skills s ON s.id = d.skill_id
     JOIN content.skills p ON p.id = d.prerequisite_skill_id
     JOIN core.subjects sub ON sub.id = s.subject_id
     ORDER BY sub.code, s.skill_code, p.skill_code`,
  );
