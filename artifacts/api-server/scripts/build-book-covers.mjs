/** First-page thumbnails beside each approved PDF; requires Poppler pdftoppm.
 * node --env-file=../../.env scripts/build-book-covers.mjs
 * Copy the complete storage directory, including *.cover.jpg, when deploying.
 */
import path from 'node:path'
import { stat, rename, rm } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import pg from 'pg'

const run = promisify(execFile)
const root = path.resolve(process.env.EJ_STORAGE_DIR ?? 'storage')
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
try {
  const rows = (await pool.query(`SELECT sm.id, v.storage_key FROM content.source_materials sm
    JOIN LATERAL (SELECT storage_key FROM content.source_versions WHERE source_material_id=sm.id
      AND status='APPROVED' ORDER BY version_no DESC LIMIT 1) v ON true
    WHERE sm.status='APPROVED' AND sm.material_type='TEXTBOOK' ORDER BY sm.id`)).rows
  let generated = 0, existing = 0
  const failed = []
  for (const row of rows) {
    if (!row.storage_key) continue
    const pdf = path.resolve(root, row.storage_key)
    const relative = path.relative(root, pdf)
    if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) throw new Error('PDF path outside storage')
    const cover = pdf + '.cover.jpg'
    const temporary = pdf + `.cover-${process.pid}`
    try {
      const source = await stat(pdf)
      const cached = await stat(cover).catch(() => null)
      if (cached?.isFile() && cached.size > 0 && cached.mtimeMs >= source.mtimeMs) { existing++; continue }
      await run(process.env.PDFTOPPM ?? 'pdftoppm', ['-f', '1', '-l', '1', '-scale-to', '480', '-singlefile',
        '-jpeg', '-jpegopt', 'quality=85', pdf, temporary], { timeout: 60000, windowsHide: true })
      await rename(temporary + '.jpg', cover)
      generated++
    } catch (error) {
      failed.push({ id: Number(row.id), error: error.message })
    } finally {
      // Only this process's exact temporary thumbnail, never the source PDF.
      await rm(temporary + '.jpg', { force: true })
    }
    if ((generated + failed.length) % 20 === 0) console.log(JSON.stringify({ generated, existing, failed: failed.length }))
  }
  console.log(JSON.stringify({ books: rows.length, generated, existing, failed }))
  if (failed.length) process.exitCode = 1
} finally { await pool.end() }
