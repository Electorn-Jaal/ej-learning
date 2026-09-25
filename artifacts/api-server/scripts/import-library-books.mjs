/** Import school-provided PDFs without changing existing editions or lesson links.
 * From artifacts/api-server:
 * node --env-file=../../.env scripts/import-library-books.mjs [--apply]
 * Defaults to a read-only plan. Apply is restricted to the local database/storage.
 */
import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const input = path.join(root, 'local-data', 'Book', 'ЕБС ном')
const storage = path.resolve(process.env.EJ_STORAGE_DIR ?? path.join(root, 'local-data', 'storage'))
const apply = process.argv.includes('--apply')
const within = (base, candidate) => {
  const relative = path.relative(base, candidate)
  return relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative)
}
if (!within(root, storage)) throw new Error('Local import storage must stay inside the workspace.')
const subjects = {
  'Англи хэл': ['ENG', 'Англи хэл'], 'Байгалийн ухаан': ['SCI', 'Байгалийн ухаан'],
  'Биологи': ['БИОЛОГИ', 'Биологи'], 'Газар зүй': ['GEO', 'Газар зүй'],
  'Дизайн технологи': ['DTECH', 'Дизайн технологи'], 'Дизайн зураг зүй, технологи': ['DTECH', 'Дизайн технологи'],
  'Дүрслэх урлаг': ['ART', 'Дүрслэх урлаг'], 'Дүрслэх урлаг, Технологи': ['ART-TECH', 'Дүрслэх урлаг, технологи'],
  'Иргэний ёс зүйн боловсрол': ['ETHICS', 'Иргэний ёс зүйн боловсрол'], 'Монгол ёс хүмүүжил': ['MGL-TRAD', 'Монгол ёс хүмүүжил'],
  'Математик': ['MATH', 'Математик'], 'Монгол хэл': ['MGL', 'Монгол хэл'],
  'Монголын түүх': ['HIST', 'Түүх'], 'Түүх': ['HIST', 'Түүх'],
  'Мэдээллийн технологи': ['ICT', 'Мэдээллийн технологи'], 'Нийгэм судлал': ['SOC', 'Нийгэм судлал'],
  'Уран зохиол': ['LIT', 'Уран зохиол'], 'Үндэсний бичиг': ['SCRIPT', 'Үндэсний бичиг'],
  'Физик': ['PHYS', 'Физик'], 'Хими': ['ХИМИ', 'Хими'], 'Хөгжим': ['MUSIC', 'Дуу хөгжим'],
  'Хүн ба байгаль': ['HUMAN-NATURE', 'Хүн ба байгаль'], 'Хүн ба нийгэм': ['HUMAN-SOC', 'Хүн ба нийгэм'],
  'Хүн ба Орчин': ['HUMAN-ENV', 'Хүн ба орчин'], 'Эрүүл мэнд': ['HEALTH', 'Эрүүл мэнд'],
}
const books = []
for (const filename of (await readdir(input)).sort()) {
  if (!filename.toLowerCase().endsWith('.pdf')) continue
  const title = filename.normalize('NFKC').replace(/\.pdf$/i, '')
  const match = /^(\d{1,2})-р (?:анги )?(.+)$/.exec(title)
  if (!match || Number(match[1]) < 1 || Number(match[1]) > 12 || !subjects[match[2]]) throw new Error(`Unmapped book: ${filename}`)
  const bytes = await readFile(path.join(input, filename))
  if (bytes.subarray(0, 5).toString('ascii') !== '%PDF-') throw new Error(`Invalid PDF signature: ${filename}`)
  const checksum = createHash('sha256').update(bytes).digest('hex')
  const [subjectCode, subjectName] = subjects[match[2]]
  books.push({ filename, title, grade: Number(match[1]), subjectCode, subjectName, checksum,
    sourceCode: `LIB-G${match[1].padStart(2, '0')}-${subjectCode}`, bytes: bytes.length,
    storageKey: `content/library/${checksum}.pdf` })
}
const url = new URL(process.env.DATABASE_URL)
if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.pathname !== '/ej_learning_local') {
  throw new Error('This import only applies to ej_learning_local on localhost.')
}
const client = new pg.Client({ connectionString: url.href })
await client.connect()
try {
  await client.query('BEGIN')
  if (apply) await client.query("SELECT pg_advisory_xact_lock(hashtext('import-library-books'))")
  const existing = (await client.query(`SELECT sm.id, sm.source_code, sv.checksum_sha256
    FROM content.source_materials sm LEFT JOIN content.source_versions sv ON sv.source_material_id=sm.id`)).rows
  const hashes = new Map(existing.filter((r) => r.checksum_sha256).map((r) => [r.checksum_sha256, r.id]))
  const codes = new Set(existing.map((r) => r.source_code))
  const grades = new Map((await client.query('SELECT id, grade_number FROM core.grade_levels')).rows.map((g) => [g.grade_number, g.id]))
  const plan = []
  for (const book of books) {
    if (!grades.has(book.grade)) throw new Error(`Missing grade ${book.grade}`)
    let id = hashes.get(book.checksum)
    const reused = id !== undefined
    if (!reused && codes.has(book.sourceCode)) throw new Error(`Existing edition differs: ${book.sourceCode}; review manually.`)
    plan.push({ filename: book.filename, grade: book.grade, action: reused ? 'reuse' : 'import' })
    if (apply) {
      if (!reused) {
        const destination = path.resolve(storage, book.storageKey)
        if (!within(storage, destination)) throw new Error('Invalid storage destination')
        await mkdir(path.dirname(destination), { recursive: true })
        try {
          await stat(destination)
          const actual = createHash('sha256').update(await readFile(destination)).digest('hex')
          if (actual !== book.checksum) throw new Error('Storage checksum mismatch')
        } catch (error) {
          if (error.code !== 'ENOENT') throw error
          await copyFile(path.join(input, book.filename), destination)
        }
        const subject = (await client.query(`INSERT INTO core.subjects (code,name_mn) VALUES ($1,$2)
          ON CONFLICT (code) DO UPDATE SET code=EXCLUDED.code RETURNING id`, [book.subjectCode, book.subjectName])).rows[0]
        id = (await client.query(`INSERT INTO content.source_materials
          (source_code,subject_id,title,material_type,status,data_quality_status,notes)
          VALUES ($1,$2,$3,'TEXTBOOK','APPROVED','INCOMPLETE',$4) RETURNING id`,
        [book.sourceCode, subject.id, book.title, 'School-provided local-data/Book PDF. Grade/title from filename; outline, edition and printed page offset not verified.'])).rows[0].id
        await client.query(`INSERT INTO content.source_versions
          (source_material_id,version_no,original_filename,storage_key,mime_type,file_size_bytes,checksum_sha256,page_offset,status)
          VALUES ($1,1,$2,$3,'application/pdf',$4,$5,0,'APPROVED')`, [id, book.filename, book.storageKey, book.bytes, book.checksum])
      }
      await client.query(`INSERT INTO content.source_material_grades (source_material_id,grade_level_id)
        VALUES ($1,$2) ON CONFLICT DO NOTHING`, [id, grades.get(book.grade)])
    }
    hashes.set(book.checksum, id ?? 'planned')
    codes.add(book.sourceCode)
  }
  await client.query(apply ? 'COMMIT' : 'ROLLBACK')
  console.log(JSON.stringify({ mode: apply ? 'APPLIED' : 'DRY_RUN', files: books.length,
    imported: plan.filter((b) => b.action === 'import').length, reused: plan.filter((b) => b.action === 'reuse').length,
    grades: [...new Set(books.map((b) => b.grade))].sort((a,b) => a-b),
    ...(process.argv.includes('--verbose') ? { plan } : {}) }, null, 2))
} catch (error) {
  await client.query('ROLLBACK')
  throw error
} finally { await client.end() }
