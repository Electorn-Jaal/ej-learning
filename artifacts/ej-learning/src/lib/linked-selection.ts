import { useMemo } from "react"
import { useSearch } from "wouter"

/**
 * The class and subject a link asked for, when a page was opened from one.
 *
 * The timetable and the results screens each keep their own class and subject
 * in local state and fall back to whichever entry happens to come first. That
 * is right for someone who arrives at the page directly, and wrong for someone
 * who clicked through from a card that already said which class and subject
 * they meant - they were landing on 9A's maths when they had asked for 9B's
 * English, and had to make the same two choices again.
 *
 * Read as a fallback rather than as initial state: a link's choice stands
 * until the reader picks something else, and their pick then wins for as long
 * as they stay on the page.
 */
export function useLinkedSelection() {
  const search = useSearch()

  return useMemo(() => {
    const params = new URLSearchParams(search)
    // Anything that is not a plain number came from a hand-edited address and
    // is ignored rather than matched against nothing.
    const digits = (name: string) => {
      const value = params.get(name)
      return value !== null && /^\d+$/.test(value) ? value : null
    }
    return { classId: digits("classId"), subjectId: digits("subjectId") }
  }, [search])
}
