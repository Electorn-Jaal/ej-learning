import { renderToStaticMarkup } from 'react-dom/server'
import { DiagnosticPlanList } from '../src/components/DiagnosticPlanList'

const plans = [{
  attemptId: 7, title: 'Оношлогоо 1', subjectName: 'Математик', teacherName: 'Багш А',
  publishedAt: '2026-09-25T02:00:00Z', note: 'Бутархайг давтана.',
  entries: [
    { title: 'Номын дасгал', instructions: '24-р хуудас, 1–5', topicName: 'Бутархай', skillName: 'Хуваах',
      resourceTitle: 'Математик 5', sourceMaterialId: 3 },
    { title: 'Өөрийн дасгал', instructions: 'Дэвтэрт 10 жишээ', topicName: null, skillName: null,
      resourceTitle: null, sourceMaterialId: null },
  ],
}]

export const renderPlans = (linkBooks: boolean) =>
  renderToStaticMarkup(<DiagnosticPlanList plans={plans} linkBooks={linkBooks} />)
export const renderEmpty = () => renderToStaticMarkup(<DiagnosticPlanList plans={[]} linkBooks />)
