import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  dayName,
  isWeekend,
  scheduleWindow,
  shiftDay,
  subjectSlots,
} from '../src/lib/schedule-window.ts'

test('one subject: the week the chosen day falls in, Monday first', () => {
  // 2026-09-18 is a Friday.
  const page = scheduleWindow('2026-09-18')
  assert.equal(page.dates.length, 7)
  assert.equal(page.from, '2026-09-14')
  assert.equal(page.to, '2026-09-20')
  assert.equal(page.dates[0], '2026-09-14')
  assert.ok(page.dates.includes('2026-09-18'))
})

test('one subject: the two days off are always the last two rows', () => {
  for (const day of ['2026-09-14', '2026-09-18', '2026-09-19', '2026-09-20']) {
    const page = scheduleWindow(day)
    assert.deepEqual(
      page.dates.map(isWeekend),
      [false, false, false, false, false, true, true],
      `week of ${day}`,
    )
  }
})

test('one subject: every day of a week lands on the same page', () => {
  const week = scheduleWindow('2026-09-14')
  for (const day of week.dates) {
    assert.deepEqual(scheduleWindow(day).dates, week.dates, `${day} moved the page`)
  }
})

test('every subject at once: three days, the chosen one in the middle', () => {
  // Three subjects a day would make a week twenty-one rows deep, so this view
  // trades the week for a page you can still find the day in.
  const page = scheduleWindow('2026-09-18', true)
  assert.equal(page.dates.length, 3)
  assert.equal(page.dates[1], '2026-09-18')
  assert.equal(page.from, '2026-09-17')
  assert.equal(page.to, '2026-09-19')

  const rows = page.dates.flatMap((date) =>
    subjectSlots(['math', 'english']).map((subject) => ({ date, subject })),
  )
  assert.equal(rows.length, 9)
  assert.deepEqual(subjectSlots(['math', 'english']), ['math', 'english', null])
})

test('page navigation has no overlaps or missing dates across a year boundary', () => {
  for (const combined of [false, true]) {
    const first = scheduleWindow('2026-12-31', combined)
    const next = scheduleWindow(shiftDay('2026-12-31', first.count), combined)
    const previous = scheduleWindow(shiftDay('2026-12-31', -first.count), combined)
    assert.equal(next.from, shiftDay(first.to, 1), `combined=${combined}`)
    assert.equal(previous.to, shiftDay(first.from, -1), `combined=${combined}`)
  }
})

test('the working week is numbered and the days off are named', () => {
  assert.equal(dayName('2026-09-14'), '1 дэх')
  assert.equal(dayName('2026-09-18'), '5 дахь')
  assert.equal(dayName('2026-09-19'), 'Хагас сайн')
  assert.equal(dayName('2026-09-20'), 'Бүтэн сайн')
})
