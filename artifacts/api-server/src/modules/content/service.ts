import path from "node:path";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { recordChange } from "../../shared/audit";
import { badRequest } from "../../shared/http-error";
import * as repository from "./repository";

/**
 * Where uploaded books live. Both halves of the path resolve against it - the
 * upload below writes here, materialFile at the foot of this file reads from
 * here - and anything that escapes it is refused.
 */
const storageRoot = () =>
  path.resolve(process.env.EJ_STORAGE_DIR ?? path.resolve(process.cwd(), "storage"));

export const listMaterials = () => repository.adminMaterials();

export async function libraryBooks() {
  const books = await repository.libraryBooks();
  return Promise.all(books.map(async (book) => {
    const file = await materialFile(book.id);
    const cover = file ? await stat(file.filePath + '.cover.jpg').catch(() => null) : null;
    return { ...book, hasFile: file !== null, hasCover: !!cover?.isFile() && cover.size > 0 };
  }));
}

export async function materialCover(materialId: number) {
  const file = await materialFile(materialId);
  if (!file) return null;
  const coverPath = file.filePath + '.cover.jpg';
  const cover = await stat(coverPath).catch(() => null);
  return cover?.isFile() && cover.size > 0 ? coverPath : null;
}

/**
 * The topic-to-skill mapping, assembled for a screen that only reads it.
 *
 * The rows arrive flat because one query answers the whole question; the
 * grouping happens here rather than in SQL so that a topic with no skill keeps
 * its place in the list instead of disappearing into an empty aggregate.
 */
export async function skillMap() {
  const rows = await repository.skillMapRows();
  const nodes: {
    contentCode: string;
    name: string;
    levelType: string;
    subjectName: string;
    status: string;
    skills: {
      skillCode: string;
      name: string;
      status: string;
      isPrimary: boolean;
      mapStatus: string;
      lessonCount: number;
    }[];
  }[] = [];
  const byNode = new Map<number, (typeof nodes)[number]>();

  for (const row of rows) {
    let node = byNode.get(row.nodeId);
    if (!node) {
      node = {
        contentCode: row.contentCode,
        name: row.nodeName,
        levelType: row.levelType,
        subjectName: row.subjectName,
        status: row.nodeStatus,
        skills: [],
      };
      byNode.set(row.nodeId, node);
      nodes.push(node);
    }
    // The LEFT JOIN leaves these null for a topic nothing maps to.
    if (row.skillCode === null) continue;
    node.skills.push({
      skillCode: row.skillCode,
      name: row.skillName ?? row.skillCode,
      status: row.skillStatus ?? "DRAFT",
      isPrimary: row.isPrimary ?? false,
      mapStatus: row.mapStatus ?? "DRAFT",
      lessonCount: row.lessonCount ?? 0,
    });
  }

  return { nodes, unmappedSkills: await repository.unmappedSkills() };
}

/**
 * The prerequisite chain, plus any loops in the part of it that is actually
 * walked.
 *
 * The database forbids a skill naming itself and nothing else, and the
 * remediation walk is a recursive query stopped only by its depth limit - it
 * keeps no record of where it has been. A two-step loop therefore costs
 * nothing at query time and quietly produces a recommendation that sends a
 * child round in a circle, so the loops are found here and named, which is the
 * one thing a screen can do about them today.
 */
export async function skillChain() {
  const rows = await repository.skillChainLinks();
  const links = rows.map((row) => ({
    ...row,
    followed: row.status === "APPROVED" && row.relationType === "REQUIRED",
  }));

  // Only the followed links can trap the walk; the rest are documentation.
  const edges = new Map<string, string[]>();
  for (const link of links) {
    if (!link.followed) continue;
    edges.set(link.skillCode, [...(edges.get(link.skillCode) ?? []), link.prerequisiteCode]);
  }

  const cycles: string[][] = [];
  const seen = new Set<string>();
  const found = new Set<string>();
  const path: string[] = [];
  const onPath = new Set<string>();

  const walk = (code: string) => {
    if (onPath.has(code)) {
      const cycle = path.slice(path.indexOf(code));
      // One loop is reachable from every skill on it; keep the first spelling.
      const key = [...cycle].sort().join(">");
      if (!found.has(key)) {
        found.add(key);
        cycles.push(cycle);
      }
      return;
    }
    if (seen.has(code)) return;

    seen.add(code);
    path.push(code);
    onPath.add(code);
    for (const next of edges.get(code) ?? []) walk(next);
    onPath.delete(code);
    path.pop();
  };

  for (const code of edges.keys()) walk(code);

  return { links, cycles };
}

export async function materialOutline(materialId: number) {
  const [header] = await repository.materialHeader(materialId);
  if (!header) {
    throw Object.assign(new Error("Материал олдсонгүй."), { status: 404 });
  }
  return {
    materialId,
    title: header.title,
    pageOffset: header.pageOffset,
    filePages: header.filePages,
    planningPeriodCount: header.planningPeriodCount,
    sections: await repository.outlineSections(materialId),
  };
}

export async function saveOutline(
  materialId: number,
  input: { pageOffset: number; planningPeriodCount: number | null; sections: repository.OutlineInput[] },
) {
  const [header] = await repository.materialHeader(materialId);
  if (!header) {
    throw Object.assign(new Error("Материал олдсонгүй."), { status: 404 });
  }

  const codes = new Set<string>();
  const sequences = new Set<number>();
  for (const section of input.sections) {
    if (codes.has(section.outlineCode)) {
      throw badRequest(
        `Код давхардсан: ${section.outlineCode}`,
        "DUPLICATE_OUTLINE_CODE",
      );
    }
    codes.add(section.outlineCode);

    if (sequences.has(section.sequenceNo)) {
      throw badRequest(
        `Дараалал давхардсан: ${section.sequenceNo}`,
        "DUPLICATE_SEQUENCE",
      );
    }
    sequences.add(section.sequenceNo);

    if (
      section.planningPeriodNo !== null &&
      (input.planningPeriodCount === null || section.planningPeriodNo > input.planningPeriodCount)
    ) {
      throw badRequest(
        `${section.outlineCode}: төлөвлөлтийн үе ${section.planningPeriodNo} нь нийт үеийн тооноос их байна.`,
        "PLANNING_PERIOD_OUT_OF_RANGE",
      );
    }

    const { pageFrom, pageTo } = section;
    if (pageFrom !== null && pageFrom < 1) {
      throw badRequest("Хуудас 1-ээс бага байж болохгүй.", "PAGE_OUT_OF_RANGE");
    }
    if (pageFrom !== null && pageTo !== null && pageFrom > pageTo) {
      throw badRequest(
        `${section.outlineCode}: эхлэх хуудас төгсөхөөсөө хойно байна.`,
        "PAGE_RANGE_INVERTED",
      );
    }
    // The offset maps a printed page onto a file page, so the last printed
    // page the file can hold is filePages - offset. Catching it here beats a
    // viewer that silently opens a blank page.
    if (
      pageTo !== null &&
      header.filePages !== null &&
      pageTo + input.pageOffset > header.filePages
    ) {
      throw badRequest(
        `${section.outlineCode}: ${pageTo}-р хуудас файлд байхгүй ` +
          `(файл ${header.filePages} хуудастай, офсет ${input.pageOffset}).`,
        "PAGE_BEYOND_FILE",
      );
    }
  }

  await repository.setPageOffset(materialId, input.pageOffset);
  await repository.setPlanningPeriodCount(materialId, input.planningPeriodCount);
  await repository.upsertOutline(materialId, input.sections);
  return materialOutline(materialId);
}

/**
 * Stores an uploaded textbook as a new version of a material.
 *
 * The bytes are checked rather than the filename: a file is accepted because
 * it starts with %PDF-, not because it was called one. The viewer hands the
 * file to the browser's own PDF renderer, and feeding it something else is
 * both useless and a way to get arbitrary content served from our origin.
 *
 * The stored name comes from the material's own source_code, so nothing a
 * caller typed becomes part of a path. The original filename is kept as a
 * column, which is where it belongs.
 */
export async function storeMaterialFile(
  materialId: number,
  file: { bytes: Buffer; filename: string },
  pageOffset: number,
  uploadedBy: string,
) {
  const [material] = await repository.materialForUpload(materialId);
  if (!material) {
    throw badRequest("Ийм материал олдсонгүй.", "MATERIAL_NOT_FOUND");
  }
  if (file.bytes.length === 0) {
    throw badRequest("Хоосон файл ирлээ.", "EMPTY_FILE");
  }
  if (!file.bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
    throw badRequest("Зөвхөн PDF файл байршуулна.", "NOT_A_PDF");
  }

  // checksum_sha256 is unique across every stored version, so uploading a file
  // the system already holds is a collision rather than a crash. Saying which
  // book has it turns a refusal into an answer - usually the admin has picked
  // the wrong row, not the wrong file.
  const checksum = createHash("sha256").update(file.bytes).digest("hex");
  const [duplicate] = await repository.materialWithChecksum(checksum);
  if (duplicate) {
    throw badRequest(
      `Яг энэ файл «${duplicate.title ?? duplicate.sourceCode}» дээр хувилбар ${duplicate.versionNo} болж байршсан байна.`,
      "DUPLICATE_FILE",
    );
  }

  const storageKey = path.posix.join(
    "content",
    `${material.sourceCode}-v${material.nextVersion}.pdf`,
  );
  const target = path.resolve(storageRoot(), storageKey);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, file.bytes);

  // Counting "/Type /Page" is not a parser, and a compressed object stream can
  // hide pages from it. It is a convenience for the admin screen, so a wrong
  // answer is better than none - and the outline, which is what page numbers
  // are actually read from, is entered by hand regardless.
  const pageMatches = file.bytes.toString("latin1").match(/\/Type\s*\/Page[^s]/g);

  try {
    await repository.insertSourceVersion({
      materialId,
      versionNo: material.nextVersion,
      storageKey,
      originalFilename: file.filename,
      sizeBytes: file.bytes.length,
      checksum,
      pageOffset,
      totalPages: pageMatches ? pageMatches.length : null,
    });
  } catch (error) {
    // The row is what makes the file reachable. Without it the bytes on disk
    // are unreferenced and would only be found again by someone wondering why
    // storage keeps growing, so they go now.
    await rm(target, { force: true });
    throw error;
  }

  await recordChange({
    schemaName: "content",
    tableName: "source_versions",
    recordPk: `${materialId}:v${material.nextVersion}`,
    action: "INSERT",
    changedBy: uploadedBy,
    newData: {
      storageKey,
      originalFilename: file.filename,
      sizeBytes: file.bytes.length,
      pageOffset,
    },
  });

  return {
    materialId,
    versionNo: material.nextVersion,
    filename: file.filename,
    sizeBytes: file.bytes.length,
    totalPages: pageMatches ? pageMatches.length : null,
    pageOffset,
  };
}

/**
 * Corrects the gap between a printed page number and a file page number.
 *
 * Kept separate from the upload because it is almost always discovered
 * afterwards - an admin opens the book, finds printed page 25 is file page 37,
 * and should not have to upload a 4 MB scan again to say so.
 */
export async function updatePageOffset(
  materialId: number,
  pageOffset: number,
  changedBy: string,
) {
  if (!(await repository.setPageOffset(materialId, pageOffset))) {
    throw badRequest("Энэ материалд файл байршуулаагүй байна.", "NO_FILE");
  }
  await recordChange({
    schemaName: "content",
    tableName: "source_versions",
    recordPk: String(materialId),
    action: "UPDATE",
    changedBy,
    newData: { pageOffset },
  });
  return { materialId, pageOffset };
}

/**
 * Resolves a stored file, refusing anything that escapes the storage root.
 *
 * storage_key is a database value rather than user input, but a bad import or
 * a later upload path could put "../" in it, and serving arbitrary files off
 * the host is not a failure worth risking on trust alone.
 */
export async function materialFile(materialId: number) {
  const [version] = await repository.approvedVersion(materialId);
  if (!version?.storageKey) return null;

  const root = storageRoot();
  const resolved = path.resolve(root, version.storageKey);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null;

  try {
    const info = await stat(resolved);
    if (!info.isFile()) return null;
  } catch {
    return null;
  }

  return {
    filePath: resolved,
    mimeType: version.mimeType ?? "application/octet-stream",
    filename: version.filename ?? path.basename(resolved),
  };
}

/** Every approved lesson, task and check, for staff browsing the library. */
export const teacherCatalog = () => repository.catalog();
