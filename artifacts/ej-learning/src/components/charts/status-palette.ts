/**
 * The four states a skill can be in for a child, and the colour each wears.
 *
 * These are status colours, not series colours: they mean a state, they are
 * the same in both themes, and they are never reused to stand for "the fourth
 * thing on the chart". The hues are separated for colour-blind readers - the
 * amber and the green sit 27.6 apart in normal vision and 11.3 under protanopia
 * - but separation alone is not the mitigation. Every segment carries its own
 * number, and the table underneath says the same thing in words, so nothing
 * here is readable by colour alone.
 *
 * Amber on a light surface falls below 3:1 against the card; that is what the
 * printed number on each segment is there for.
 */
export const SKILL_STATUS = {
  mastered: { label: 'Эзэмшсэн', color: '#0ca30c' },
  developing: { label: 'Сайжирч байна', color: '#fab219' },
  needs_support: { label: 'Дэмжлэг хэрэгтэй', color: '#d03b3b' },
  unassessed: { label: 'Үнэлэгдээгүй', color: 'var(--color-muted-foreground)' },
} as const

export type SkillStatus = keyof typeof SKILL_STATUS
