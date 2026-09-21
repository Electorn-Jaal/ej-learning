import { useQueries, useQuery } from '@tanstack/react-query'
import { customFetch } from './custom-fetch'
import type { StudentToday } from './generated/api.schemas'

export function useStudentSchedule(date: string) {
  return useQuery({
    queryKey: ['/api/student/schedule', date],
    queryFn: ({ signal }) => customFetch<StudentToday>('/api/student/schedule?date=' + encodeURIComponent(date), { signal }),
  })
}

export function useStudentScheduleDays(dates: string[]) {
  return useQueries({ queries: dates.map((date) => ({
    queryKey: ['/api/student/schedule', date],
    queryFn: ({ signal }: { signal: AbortSignal }) => customFetch<StudentToday>('/api/student/schedule?date=' + encodeURIComponent(date), { signal }),
  })) })
}
