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

test('every subject at once: the chosen day alone, and every subject on it', () => {
  // The timetable page is one day read down the clock, so the window is that
  // day and nothing either side of it. Every subject the API returns is still
  // present - the page is bounded by the day, never by a subject count.
  const page = scheduleWindow('2026-09-18', true)
  assert.equal(page.dates.length, 1)
  assert.equal(page.dates[0], '2026-09-18')
  assert.equal(page.from, '2026-09-18')
  assert.equal(page.to, '2026-09-18')

  const subjects = ['math', 'english', 'mongolian', 'physics', 'chemistry']
  const rows = page.dates.flatMap((date) =>
    subjectSlots(subjects).map((subject) => ({ date, subject })),
  )
  // One day, so the row count is the subject count: no cap, no multiplier.
  assert.equal(rows.length, 5)
  assert.deepEqual(subjectSlots(subjects), subjects)
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
