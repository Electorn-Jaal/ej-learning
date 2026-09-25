import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

test('guardian page says a request failed, offers a retry, and does not confuse it with no data', async () => {
  const server = await createServer({
    configFile: false, root: fileURLToPath(new URL('../', import.meta.url)), cacheDir: 'node_modules/.vite-guardian-tests',
    server: { middlewareMode: true, watch: null, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] },
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } }, esbuild: { jsx: 'automatic' },
  })
  try {
    const { renderGuardianChild } = await server.ssrLoadModule('/tests/guardian-child.fixture.tsx')

    const day = renderGuardianChild('day-failed')
    assert.ok(day.includes('role="alert"'), 'a failed day read is announced')
    assert.ok(day.includes('Хүүхдийн өдрийн мэдээллийг уншиж чадсангүй.'))
    assert.ok(day.includes('Дахин оролдох'))
    assert.ok(!day.includes('animate-pulse'), 'the skeleton must not stay up after a failure')
    assert.ok(day.includes('Test child'), 'the child switcher stays on screen')

    const children = renderGuardianChild('children-failed')
    assert.ok(children.includes('Хүүхдийн мэдээллийг уншиж чадсангүй.'))
    assert.ok(children.includes('Дахин оролдох'))
    assert.ok(!children.includes('холбогдоогүй'), 'a failed request is not "no child linked"')

    const none = renderGuardianChild('no-children')
    assert.ok(none.includes('Таны бүртгэлд хүүхэд холбогдоогүй байна.'))
    assert.ok(!none.includes('role="alert"'), 'an empty list is not an error')
  } finally { await server.close() }
})
