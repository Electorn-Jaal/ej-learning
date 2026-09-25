import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

test('a published plan links the book for the child and never for the guardian', async () => {
  const server = await createServer({
    configFile: false, root: fileURLToPath(new URL('../', import.meta.url)), cacheDir: 'node_modules/.vite-diagnostic-plan-tests',
    server: { middlewareMode: true, watch: null, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] },
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } }, esbuild: { jsx: 'automatic' },
  })
  try {
    const { renderPlans, renderEmpty } = await server.ssrLoadModule('/tests/diagnostic-plans.fixture.tsx')
    const child = renderPlans(true)
    assert.ok(child.includes('Номын дасгал') && child.includes('Өөрийн дасгал'))
    assert.ok(child.includes('Бутархай → Хуваах'))
    assert.ok(child.includes('/api/content/materials/3/file'), 'the child opens the book')
    const guardian = renderPlans(false)
    assert.ok(guardian.includes('Математик 5'), 'the guardian still reads which book')
    assert.ok(!guardian.includes('/api/content/materials/'), 'FR21: no book link for a guardian')
    assert.ok(renderEmpty().includes('хувийн төлөвлөгөө өгөөгүй'))
  } finally { await server.close() }
})
