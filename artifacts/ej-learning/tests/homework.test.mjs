import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

test('homework keeps non-submitters and every attempt visible; late work stays submittable, closed work does not', async () => {
  const server = await createServer({
    configFile: false, root: fileURLToPath(new URL('../', import.meta.url)), cacheDir: 'node_modules/.vite-homework-tests',
    server: { middlewareMode: true, watch: null, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] },
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } }, esbuild: { jsx: 'automatic' },
  })
  try {
    const { renderHomework } = await server.ssrLoadModule('/tests/homework.fixture.tsx')
    const teacher = renderHomework('teacher')
    assert.ok(teacher.includes('No submission child'))
    assert.ok(teacher.includes('Answer version 1') && teacher.includes('Answer version 2'))
    assert.ok(teacher.includes('Хоцорч илгээсэн'))
    const student = renderHomework('student')
    assert.ok(student.includes('<textarea'), 'past deadline must not hide the submission form')
    assert.ok(student.includes('Answer version 1') && student.includes('Answer version 2'))
    const closed = renderHomework('student', true)
    assert.ok(!closed.includes('<textarea'))
    assert.ok(closed.includes('Answer version 1') && closed.includes('Answer version 2'))
  } finally { await server.close() }
})
