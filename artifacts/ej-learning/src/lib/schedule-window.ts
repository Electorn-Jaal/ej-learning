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

/** One subject: a whole week. Every subject at once: three days. */
export const WEEK_LENGTH = 7
export const COMBINED_LENGTH = 3

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
 * Every subject at once cannot afford a week: each day there is one row per
 * subject, so seven days is twenty-one rows and the day you came to look at is
 * lost in them. Three days keeps that page to nine rows, with the chosen day
 * in the middle so yesterday and tomorrow are both in view.
 */
export function scheduleWindow(selectedDay: string, combined = false) {
  const count = combined ? COMBINED_LENGTH : WEEK_LENGTH
  const from = combined ? shiftDay(selectedDay, -1) : shiftDay(selectedDay, -weekIndex(selectedDay))
  const dates = Array.from({ length: count }, (_, index) => shiftDay(from, index))
  return { from, to: dates[count - 1]!, dates, count }
}

/** Reserve three subject slots, including unfilled slots, in the combined view. */
export function subjectSlots<T>(subjects: T[]): (T | null)[] {
  return [...subjects, ...Array.from({ length: Math.max(0, 3 - subjects.length) }, () => null)]
}
