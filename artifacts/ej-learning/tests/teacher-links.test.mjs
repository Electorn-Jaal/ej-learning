import assert from 'node:assert/strict'
import { test } from 'node:test'
import { linkedHref } from '../src/lib/teacher-class.ts'

test('a link carries the class and the subject it was clicked on', () => {
  assert.equal(linkedHref('/teacher/results', 7, 3), '/teacher/results?classId=7&subjectId=3')
})

test('a card that stands for the whole class names no subject', () => {
  // An administrator's card covers every subject, so pinning one would be a
  // choice nobody made.
  assert.equal(linkedHref('/teacher/schedule', 7, null), '/teacher/schedule?classId=7')
})
