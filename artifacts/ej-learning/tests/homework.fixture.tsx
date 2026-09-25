import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Router } from 'wouter'
import { getGetHomeworkDetailQueryKey, getGetMyHomeworkDetailQueryKey } from '@workspace/api-client-react'
import { TeacherHomeworkDetail } from '../src/pages/teacher/Homework'
import { StudentHomeworkDetail } from '../src/pages/student/Homework'

export function renderHomework(role: 'teacher' | 'student', closed = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  const attempts = [1, 2].map((attemptNo) => ({ attemptNo, submissionId: attemptNo, body: `Answer version ${attemptNo}`,
    minutes: null, isLate: attemptNo === 2, submittedAt: '2026-09-25T08:00:00Z' }))
  const shared = { homeworkId: 4, title: 'Reading homework', instructions: 'Read and explain.', assignedOn: '2026-09-01', dueOn: '2026-09-02' }
  client.setQueryData(getGetHomeworkDetailQueryKey(4), { ...shared, classId: 1, subjectId: 2, wholeClass: true, isActive: true,
    students: [{ studentId: 1, studentName: 'No submission child', studentCode: 'S1', attempts: [] },
      { studentId: 2, studentName: 'Submitted child', studentCode: 'S2', attempts }] })
  client.setQueryData(getGetMyHomeworkDetailQueryKey(4), { ...shared, attempts })
  const html = renderToStaticMarkup(<QueryClientProvider client={client}><Router ssrPath="/homework">
    {role === 'teacher' ? <TeacherHomeworkDetail id={4} /> : <StudentHomeworkDetail id={4} closed={closed} />}
  </Router></QueryClientProvider>)
  client.clear()
  return html
}
