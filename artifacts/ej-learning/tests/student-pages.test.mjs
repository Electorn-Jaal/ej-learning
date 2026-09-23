import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

test('student pages render empty-content periods and the actual subject study plan', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url))
  const server = await createServer({
    configFile: false, root, cacheDir: 'node_modules/.vite-tests',
    server: { middlewareMode: true, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
    esbuild: { jsx: 'automatic' },
  })
  try {
    const { renderStudentPage } = await server.ssrLoadModule('/tests/student-pages.fixture.tsx')
    const today = renderStudentPage('today')
    assert.equal((today.match(/Mathematics/g) ?? []).length, 2)
    assert.ok(today.includes('08:00') && today.includes('08:45'))
    assert.ok(!today.includes('Эцэг эхийн хурал'))
    const plan = renderStudentPage('plan')
    assert.ok(plan.includes('Practise equivalent fractions'))
    assert.ok(!plan.includes('English-only work'))
    assert.ok(!plan.includes('хараахан оноогдоогүй'))

    // Pressing Хичээл has to arrive somewhere. The button appears only where
    // the period carries a lesson, and the page it opens reads that lesson
    // back out of the same answer by the slot in the address.
    const lesson = renderStudentPage('lesson')
    assert.ok(lesson.includes('Understand square roots'), 'the lesson page states its goal')
    assert.ok(lesson.includes('Do the exercises.'), 'and prints its work')
    assert.ok(!lesson.includes('өнөөдрийн жагсаалтад алга'), 'and finds the slot')
  } finally { await server.close() }
})
