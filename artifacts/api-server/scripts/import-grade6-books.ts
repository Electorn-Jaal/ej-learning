/**
 * Imports the audited grade-6 PDFs from 01_СУРГАЛТЫН_МАТЕРИАЛ.
 *
 * Dry-run (default): pnpm --filter @workspace/api-server import-grade6-books
 * Apply:             pnpm --filter @workspace/api-server import-grade6-books -- --apply --yes
 *
 * This deliberately imports only books, file versions and grade links. The
 * teacher-supplied outline/topic data is a separate import and is not guessed.
 */
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { pool } from "@workspace/db";

type Book = {
  filename: string;
  sourceCode: string;
  subjectCode: string;
  subjectName: string;
  title: string;
  authors?: string;
  year?: number;
  edition?: string;
  pages: number;
};

const books: Book[] = [
  { filename: "6-р анги Байгалийн ухаан.pdf", sourceCode: "G06-SCI-MN", subjectCode: "SCI", subjectName: "Байгалийн ухаан", title: "Байгалийн ухаан VI", authors: "С.Гэндэнжамц, Д.Батболд, Ц.Амартайван, Ж.Дөлгөөн, Б.Бадам, А.Энхтогтох, С.Цогбадрах, Х.Тэрбиш, М.Мөнхбаатар, Г.Баярмаа, Д.Сарангэрэл, Н.Оюунцэцэг, Н.Наранцогт", year: 2023, edition: "Долоо дахь хэвлэл", pages: 136 },
  { filename: "6-р анги Дизайн технологи.pdf", sourceCode: "G06-DTECH-MN", subjectCode: "DTECH", subjectName: "Дизайн технологи", title: "Дизайн технологи VI", authors: "А.Алтантуул, Ч.Алтанчимэг, М.Баасанбаяр, В.Баяржаргал, Р.Гоцбаяр, С.Нямсүрэн, Д.Сэрээтэрдорж, Г.Чулуун", year: 2023, edition: "Тав дахь хэвлэл", pages: 108 },
  { filename: "6-р анги Дүрслэх урлаг.pdf", sourceCode: "G06-ART-MN", subjectCode: "ART", subjectName: "Дүрслэх урлаг", title: "Дүрслэх урлаг VI–VII", authors: "О.Нацагдорж, С.Батчулуун, Б.Баттулга, Г.Мэндээ, Ж.Өнөржаргал, Н.Хүдэрчулуун", year: 2023, edition: "Тав дахь хэвлэл", pages: 116 },
  { filename: "6-р анги Иргэний ёс зүйн боловсрол.pdf", sourceCode: "G06-ETHICS-MN", subjectCode: "ETHICS", subjectName: "Иргэний ёс зүйн боловсрол", title: "Иргэний ёс зүйн боловсрол VI", authors: "Б.Цасанчимэг, Ө.Цэндсүрэн, Ж.Гэрэлмаа", year: 2023, edition: "Хоёр дахь хэвлэл", pages: 88 },
  { filename: "6-р анги Математик.pdf", sourceCode: "G06-MATH-MN", subjectCode: "MATH", subjectName: "Математик", title: "Математик VI", authors: "Д.Түвшинжаргал, Ж.Батболд, Д.Даваасүрэн, Э.Чойсүрэн, Т.Батчимэг, Н.Баянбилэг, Н.Гэндэнсүрэн, Б.Равданжамц, Н.Цогзолмаа, Б.Энхболд, Д.Энхцэцэг, Б.Эрдэнэсувд, Б.Ариунтунгалаг", year: 2022, edition: "Долоо дахь хэвлэл", pages: 168 },
  { filename: "6-р анги Монгол хэл.pdf", sourceCode: "G06-MGL-MN", subjectCode: "MGL", subjectName: "Монгол хэл", title: "Монгол хэл VI", authors: "Ш.Оюунцэцэг, Б.Мөнгөнцэцэг, Л.Олзвой, Ц.Оюун, Ц.Туул", year: 2023, edition: "Долоо дахь хэвлэл", pages: 152 },
  { filename: "6-р анги Мэдээллийн технологи.pdf", sourceCode: "G06-ICT-MN", subjectCode: "ICT", subjectName: "Мэдээллийн технологи", title: "Мэдээллийн технологи VI", authors: "Д.Цэдэвсүрэн, С.Уянга, Л.Мөнхтуяа, Э.Оюунбилэг, Ш.Отгонцэцэг, П.Дэлгэржав", year: 2023, edition: "Долоо дахь хэвлэл", pages: 56 },
  { filename: "6-р анги Түүх.pdf", sourceCode: "G06-HIST-MN", subjectCode: "HIST", subjectName: "Түүх", title: "Түүх VI", authors: "П.Дэлгэржаргал, У.Туяа, Б.Чинзориг, Д.Янжинжав", year: 2023, edition: "Долоо дахь хэвлэл", pages: 84 },
  { filename: "6-р анги Уран зохиол.pdf", sourceCode: "G06-LIT-MN", subjectCode: "LIT", subjectName: "Уран зохиол", title: "Уран зохиол VI", authors: "П.Одсүрэн, С.Амарсайхан, Ч.Жачин, Т.Мөнхнаран, Г.Нандинбилиг, Д.Цогзолмаа", year: 2023, edition: "Долоо дахь хэвлэл", pages: 96 },
  { filename: "6-р анги Үндэсний бичиг.pdf", sourceCode: "G06-SCRIPT-MN", subjectCode: "SCRIPT", subjectName: "Үндэсний бичиг", title: "Үндэсний бичиг VI", authors: "Ш.Чоймаа, Д.Хишигсүрэн, Д.Эрдэнэсанаа, Л.Жумдаан, Р.Өлзийхүү, Н.Золжаргал, Э.Эрдэнэзуу", year: 2023, edition: "Долоо дахь хэвлэл", pages: 96 },
  { filename: "Scince-Oxford6.pdf", sourceCode: "G06-SCI-OXFORD", subjectCode: "SCI", subjectName: "Байгалийн ухаан", title: "Oxford International Primary Science 6", pages: 153 },
];

const apply = process.argv.includes("--apply");
const confirmed = process.argv.includes("--yes");
const root = path.resolve(process.cwd(), "../..");
const inputDir = path.join(root, "01_СУРГАЛТЫН_МАТЕРИАЛ-20260922T003922Z-1-001", "01_СУРГАЛТЫН_МАТЕРИАЛ");
const storageRoot = process.env.EJ_STORAGE_DIR ?? path.join(root, "storage");
const contentDir = path.join(storageRoot, "content");
const normalize = (value: string) => value.normalize("NFKC");

const diskFiles = await readdir(inputDir);
const byNormalizedName = new Map(diskFiles.map((name) => [normalize(name), name]));
const prepared = await Promise.all(books.map(async (book) => {
  const actualName = byNormalizedName.get(normalize(book.filename));
  if (!actualName) throw new Error(`Missing source PDF: ${book.filename}`);
  const sourcePath = path.join(inputDir, actualName);
  const bytes = await readFile(sourcePath);
  if (bytes.subarray(0, 5).toString("ascii") !== "%PDF-") throw new Error(`Not a PDF: ${actualName}`);
  return {
    ...book,
    actualName,
    sourcePath,
    fileSize: (await stat(sourcePath)).size,
    checksum: createHash("sha256").update(bytes).digest("hex"),
    storageKey: `content/${book.sourceCode.toLowerCase()}.pdf`,
  };
}));

const client = await pool.connect();
const copied: string[] = [];
try {
  const dbName = (await client.query<{ current_database: string }>("SELECT current_database()" )).rows[0]?.current_database;
  if (!dbName?.startsWith("ej_learning_local") && !dbName?.startsWith("ej_learning_test")) {
    throw new Error(`Refusing database ${dbName ?? "unknown"}; expected ej_learning_local/test.`);
  }
  const grade = await client.query<{ id: number }>("SELECT id FROM core.grade_levels WHERE grade_number = 6");
  if (grade.rowCount !== 1) throw new Error("Grade 6 is missing or duplicated.");

  const codes = prepared.map((book) => book.sourceCode);
  const hashes = prepared.map((book) => book.checksum);
  const existing = await client.query(
    `SELECT sm.source_code, sv.checksum_sha256 FROM content.source_materials sm
       LEFT JOIN content.source_versions sv ON sv.source_material_id = sm.id
      WHERE sm.source_code = ANY($1::text[]) OR sv.checksum_sha256 = ANY($2::text[])`,
    [codes, hashes],
  );
  if (existing.rowCount) throw new Error(`Already imported/conflicting book rows: ${JSON.stringify(existing.rows)}`);

  console.log(JSON.stringify({ database: dbName, mode: apply ? "APPLY" : "DRY_RUN", grade: 6, books: prepared.map(({ sourceCode, subjectCode, title, pages, actualName, fileSize, checksum, storageKey }) => ({ sourceCode, subjectCode, title, pages, actualName, fileSize, checksum, storageKey })) }, null, 2));
  if (!apply) process.exitCode = 0;
  else {
    if (!confirmed) throw new Error("Refusing apply without --yes.");
    await mkdir(contentDir, { recursive: true });
    for (const book of prepared) {
      const destination = path.join(storageRoot, book.storageKey);
      try { await stat(destination); throw new Error(`Storage target already exists: ${destination}`); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      await copyFile(book.sourcePath, destination);
      copied.push(destination);
    }

    await client.query("BEGIN");
    try {
      for (const book of prepared) {
        const subject = await client.query<{ id: string; name_mn: string }>(
          `INSERT INTO core.subjects (code, name_mn)
           VALUES ($1, $2)
           ON CONFLICT (code) DO UPDATE SET is_active = true
           RETURNING id, name_mn`, [book.subjectCode, book.subjectName],
        );
        if (subject.rows[0].name_mn !== book.subjectName) throw new Error(`Subject code ${book.subjectCode} has name ${subject.rows[0].name_mn}, expected ${book.subjectName}`);
        const material = await client.query<{ id: string }>(
          `INSERT INTO content.source_materials
             (source_code, subject_id, title, material_type, authors, published_year, edition, total_pages, status, data_quality_status, notes)
           VALUES ($1, $2, $3, 'TEXTBOOK', $4, $5, $6, $7, 'APPROVED', 'INCOMPLETE', $8)
           RETURNING id`,
          [book.sourceCode, subject.rows[0].id, book.title, book.authors ?? null, book.year ?? null, book.edition ?? null, book.pages, "PDF ба үндсэн метадата баталгаажсан. Багшийн сэдэв/агуулгын бүтэц дараагийн импортоор орно."],
        );
        await client.query(
          `INSERT INTO content.source_versions
             (source_material_id, version_no, original_filename, storage_key, mime_type, file_size_bytes, checksum_sha256, page_offset, status)
           VALUES ($1, 1, $2, $3, 'application/pdf', $4, $5, 0, 'APPROVED')`,
          [material.rows[0].id, book.actualName, book.storageKey, book.fileSize, book.checksum],
        );
        await client.query(
          "INSERT INTO content.source_material_grades (source_material_id, grade_level_id) VALUES ($1, $2)",
          [material.rows[0].id, grade.rows[0].id],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
    console.log(`Imported ${prepared.length} grade-6 books.`);
  }
} catch (error) {
  for (const file of copied) await rm(file, { force: true });
  throw error;
} finally {
  client.release();
  await pool.end();
}
