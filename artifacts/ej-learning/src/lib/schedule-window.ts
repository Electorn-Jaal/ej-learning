export const schoolToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ulaanbaatar' }).format(new Date())

export function shiftDay(day: string, offset: number) {
  const date = new Date(day + 'T00:00:00Z')
  date.setUTCDate(date.getUTCDate() + offset)
  return date.toISOString().slice(0, 10)
}

/** Monday is 0 here, Sunday 6 - the school week's own order, not getUTCDay's. */
const weekIndex = (day: string) => (new Date(day + 'T00:00:00Z').getUTCDay() + 6) % 7

export function isWeekend(day: string) {
  return weekIndex(day) >= 5
}

/**
 * What the day is called, Monday first.
 *
 * Mongolian counts the working week rather than naming it - Monday is the
 * first day, Tuesday the second - and the ordinal suffix follows vowel
 * harmony, which is why these are written out rather than built from the
 * number. The two days off have names of their own instead: the half day and
 * the whole day. Intl was asked for this before and answered "Mon", "Tue":
 * the runtime has no Mongolian weekday data and falls back to English.
 */
const DAY_NAME = ['1 дэх', '2 дахь', '3 дахь', '4 дэх', '5 дахь', 'Хагас сайн', 'Бүтэн сайн']

export const dayName = (day: string) => DAY_NAME[weekIndex(day)]!

/** One subject: a whole week. Every subject at once: the one day. */
export const WEEK_LENGTH = 7
export const COMBINED_LENGTH = 1

/**
 * The stretch of days on screen.
 *
 * One subject shows the calendar week the chosen day falls in, Monday through
 * Sunday. It used to be a sliding run of nine days starting two before
 * whatever was selected, which put the weekend wherever the arithmetic
 * happened to land: a page might carry one Saturday, two, or none, and the
 * same date sat in a different row depending on how you arrived at it. A week
 * is the unit a timetable is kept in, so the rows mean the same thing every
 * time - five school days, then the two days off, always at the bottom.
 *
 * Every subject at once is a single day, because that page is the day's
 * timetable read down the clock: period one at the top, the last lesson at the
 * bottom. Two days side by side would be two timetables, and the arrows move a
 * day at a time, which is how anyone reads a timetable anyway. It was three
 * days before, which put the chosen day in the middle of a list and made the
 * clock run backwards twice on the way down the page.
 */
export function scheduleWindow(selectedDay: string, combined = false) {
  const count = combined ? COMBINED_LENGTH : WEEK_LENGTH
  const from = combined ? selectedDay : shiftDay(selectedDay, -weekIndex(selectedDay))
  const dates = Array.from({ length: count }, (_, index) => shiftDay(from, index))
  return { from, to: dates[count - 1]!, dates, count }
}

/**
 * Every subject in the response gets a row. The first demo happened to have
 * three subjects, but that is sample data rather than a timetable limit.
 */
export function subjectSlots<T>(subjects: T[]): T[] {
  return subjects
}
