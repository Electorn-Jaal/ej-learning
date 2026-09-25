import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

test('library shows cross-grade books and only links readable files', async () => {
  const server = await createServer({
    configFile: false, root: fileURLToPath(new URL('../', import.meta.url)), cacheDir: 'node_modules/.vite-library-tests',
    server: { middlewareMode: true, watch: null, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] },
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } }, esbuild: { jsx: 'automatic' },
  })
  try {
    const { renderLibrary } = await server.ssrLoadModule('/tests/library.fixture.tsx')
    const html = renderLibrary()
    assert.ok(html.includes('Primary mathematics') && html.includes('Senior physics'))
    assert.ok(html.includes('id="grade-8"') && html.includes('id="grade-9"'))
    assert.ok(html.indexOf('id="grade-3"') < html.indexOf('id="grade-12"'))
    assert.equal((html.match(/alt="Shared music — эхний хуудас"/g) ?? []).length, 2, 'a two-grade book appears under both grades')
    assert.ok(/<p[^>]*>Senior physics<\/p>/.test(html), 'a book without a cover shows its title instead')
    assert.ok(html.includes('/api/content/materials/1/cover'))
    assert.ok(!html.includes('/api/content/materials/2/cover'))
    assert.ok(html.includes('/api/content/materials/1/file'))
    assert.ok(!html.includes('/api/content/materials/2/file'), 'missing files have no dead links')
    assert.ok(html.includes('/api/content/materials/3/file'))
    assert.ok(html.includes('Унших файл одоогоор бэлэн биш байна.'))
  } finally { await server.close() }
})
