import type { SubjectDay } from '@workspace/api-client-react'

export function studentSlotLink(day: SubjectDay, view: string) {
  const lessonId = day.lesson?.id ?? day.extra?.lesson.id
  const query = day.timetableSlotId != null ? `?slotId=${day.timetableSlotId}`
    : lessonId === undefined ? '' : `?lessonId=${lessonId}`
  return `/subject/${encodeURIComponent(day.subjectCode)}/${view}${query}`
}

export function selectStudentSlot(slots: SubjectDay[], code: string, search: string) {
  const params = new URLSearchParams(search)
  const slotId = params.get('slotId')
  if (slotId !== null) return slots.find((slot) => slot.subjectCode === code && String(slot.timetableSlotId) === slotId)
  const lessonId = params.get('lessonId')
  return slots.find((slot) => slot.subjectCode === code && (
    lessonId === null || String(slot.lesson?.id) === lessonId ||
    String(slot.extra?.lesson.id) === lessonId
  ))
}
