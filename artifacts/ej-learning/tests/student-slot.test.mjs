import assert from 'node:assert/strict'
import { test } from 'node:test'
import { selectStudentSlot, studentSlotLink } from '../src/lib/student-slot.ts'

const slots = [
  { subjectCode: 'math', periodNo: 1, lesson: null, extra: null },
  { subjectCode: 'math', periodNo: 2, lesson: { id: 12 }, extra: null },
  { subjectCode: 'math', periodNo: 3, lesson: { id: 13 }, extra: { lesson: { id: 20 } } },
]

test('opening a repeated subject keeps the selected lesson through the quiz link', () => {
  for (const view of ['lesson', 'quiz']) {
    const link = studentSlotLink(slots[2], view)
    assert.equal(selectStudentSlot(slots, 'math', link.split('?')[1]), slots[2])
  }
  assert.equal(selectStudentSlot(slots, 'math', 'lessonId=12'), slots[1])
})

test('personal work resolves its slot and stale links do not open another lesson', () => {
  assert.equal(selectStudentSlot(slots, 'math', 'lessonId=20'), slots[2])
  assert.equal(selectStudentSlot(slots, 'math', 'lessonId=99'), undefined)
  assert.equal(selectStudentSlot(slots, 'other', 'lessonId=13'), undefined)
  assert.equal(selectStudentSlot(slots, 'math', ''), slots[0])
})

test('the same lesson in two periods keeps each periods own teacher note', () => {
  const repeated = [
    { subjectCode: 'math', timetableSlotId: 1, lesson: { id: 12, teacherNote: 'first' } },
    { subjectCode: 'math', timetableSlotId: 2, lesson: { id: 12, teacherNote: 'second' } },
  ]
  const link = studentSlotLink(repeated[1], 'lesson')
  assert.equal(selectStudentSlot(repeated, 'math', link.split('?')[1]).lesson.teacherNote, 'second')
})
