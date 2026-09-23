import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Router } from 'wouter'
import {
  getGetStudentTodayQueryKey, getGetStudentSubjectsQueryKey,
  getGetStudentPlacementsQueryKey, getGetStudentStudyPlanQueryKey,
} from '@workspace/api-client-react'
import Today from '../src/pages/student/Today'
import Plan from '../src/pages/student/Plan'
import SubjectView from '../src/pages/student/SubjectView'

export function renderStudentPage(page: 'today' | 'plan' | 'lesson') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  client.setQueryData(getGetStudentTodayQueryKey(), {
    date: '2026-09-23', dateLabel: '2026-09-23', className: '6A', notice: '',
    slots: [1, 2].map((periodNo) => ({
      subjectCode: 'MATH', subjectName: 'Mathematics', periodNo, timetableSlotId: periodNo,
      startsAt: periodNo === 1 ? '08:00' : '08:45', endsAt: '09:25',
      teacherName: 'Teacher', groupLabel: null, extra: null,
      // The first period carries a lesson with no book behind it, which is
      // what the school's own data looks like: the sections are authored from
      // the textbook outline and no PDF is attached to them.
      lesson: periodNo === 1 ? {
        id: 61, lessonCode: 'DEMO-TT-MATH-8', lessonType: 'CORE',
        skillName: 'Square roots', learningGoal: 'Understand square roots',
        remember: 'Read the section.', workedExample: 'Worked example here.',
        guidedPractice: null, independentPractice: 'Do the exercises.',
        studentMessage: 'Follow the book.', teacherNote: null,
        estimatedMinutes: 40, book: null,
      } : null,
    })),
  })
  client.setQueryData(getGetStudentSubjectsQueryKey(), [{ code: 'MATH', name: 'Mathematics' }])
  client.setQueryData(getGetStudentPlacementsQueryKey(), [])
  client.setQueryData(getGetStudentStudyPlanQueryKey(), [{
    subjectCode: 'MATH', weekNo: 1, days: [{ weekdayNo: 1, focus: 'Fractions',
      task: 'Practise equivalent fractions', status: 'NOT ASSESSED', score: null, target: null }],
  }, {
    subjectCode: 'ENG', weekNo: 1, days: [{ weekdayNo: 1, task: 'English-only work', score: null }],
  }])
  const html = renderToStaticMarkup(<QueryClientProvider client={client}>
    <Router
      ssrPath={page === 'today' ? '/' : page === 'plan' ? '/subjects/MATH/plan' : '/subject/MATH/lesson'}
      ssrSearch={page === 'lesson' ? 'slotId=1' : ''}
    >
      {page === 'today' ? <Today /> : page === 'plan' ? <Plan /> : <SubjectView />}
    </Router>
  </QueryClientProvider>)
  client.clear()
  return html
}
