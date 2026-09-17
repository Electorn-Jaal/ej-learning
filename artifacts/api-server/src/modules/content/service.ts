import path from "node:path";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { recordChange } from "../../shared/audit";
import { badRequest } from "../../shared/http-error";
import * as repository from "./repository";

/**
 * Where uploaded books live. Shared with the read path in the learning module,
 * which resolves every served file against this same root and refuses anything
 * that escapes it.
 */
const storageRoot = () =>
  path.resolve(process.env.EJ_STORAGE_DIR ?? path.resolve(process.cwd(), "storage"));

export const listMaterials = () => repository.adminMaterials();

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
    sections: await repository.outlineSections(materialId),
  };
}

export async function saveOutline(
  materialId: number,
  input: { pageOffset: number; sections: repository.OutlineInput[] },
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
