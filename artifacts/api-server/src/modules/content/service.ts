import { badRequest } from "../../shared/http-error";
import * as repository from "./repository";

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
