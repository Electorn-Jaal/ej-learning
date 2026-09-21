import type { TeacherClass } from '@workspace/api-client-react'

/**
 * A picker entry is a class *and* a subject, not a class on its own.
 *
 * A teacher who takes maths and physics in 9А gets three entries for it: one
 * per subject and one for both. They all carry the same class id, so the id
 * cannot be the select's value or React's key - the register rendered "9А9А"
 * when it was, and choosing either subject asked for the same thing.
 */
export const entryKey = (entry: Pick<TeacherClass, 'id' | 'subjectId'>) =>
  `${entry.id}:${entry.subjectId ?? 'all'}`

export type TeacherSelection = { classId: number; subjectId: number | null }

export function parseEntryKey(key: string): TeacherSelection {
  const [id, subject] = key.split(':')
  return {
    classId: Number(id),
    subjectId: subject === undefined || subject === 'all' ? null : Number(subject),
  }
}

/** What the screen is pointed at: the chosen entry, or the first one offered. */
export function currentSelection(
  classes: TeacherClass[] | undefined,
  selected: string | null,
): TeacherSelection & { key: string | null } {
  const fallback = classes?.[0]
  const key = selected ?? (fallback ? entryKey(fallback) : null)
  if (!key) return { key: null, classId: 0, subjectId: null }
  return { key, ...parseEntryKey(key) }
}

/** Query parameters, leaving subjectId out when every subject is meant. */
export const subjectParam = (subjectId: number | null) =>
  subjectId === null ? {} : { subjectId }

/**
 * The address of `path` for one class, and one subject where there is one.
 *
 * A screen opened from a card that already knew its class should not ask for
 * it again; `useLinkedSelection` reads these back on the other side.
 */
export function linkedHref(
  path: string,
  classId: number,
  subjectId: number | null,
): string {
  const params = new URLSearchParams({ classId: String(classId) })
  if (subjectId !== null) params.set('subjectId', String(subjectId))
  return `${path}?${params.toString()}`
}
