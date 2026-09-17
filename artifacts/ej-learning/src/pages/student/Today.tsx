import { useGetStudentToday, type DailyLessonView, type SubjectDay } from '@workspace/api-client-react'
import { Clock } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { LessonQuiz } from '@/components/quiz/LessonQuiz'
import { BookViewer } from '@/components/book/BookViewer'
import { cn } from '@/lib/utils'

/**
 * The type is carried by a small solid dot, with the label left in the normal
 * text colour. A tinted pill printing its own hue back as text is the pattern
 * that makes an interface look auto-generated, and it costs legibility too.
 */
const LESSON_TYPE: Record<string, { label: string; dot: string }> = {
  CORE: { label: 'Үндсэн хичээл', dot: 'bg-primary' },
  RECOVERY: { label: 'Нөхөх хичээл', dot: 'bg-pending' },
  REINFORCE: { label: 'Бататгах', dot: 'bg-success' },
}

function Section({ title, body }: { title: string; body: string | null }) {
  if (!body?.trim()) return null
  return (
    <section className="space-y-1.5">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{body}</p>
    </section>
  )
}

function LessonCard({
  lesson,
  banner,
}: {
  lesson: DailyLessonView
  banner?: string | null
}) {
  const type = LESSON_TYPE[lesson.lessonType] ?? LESSON_TYPE.CORE

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-2 text-xs font-medium text-foreground">
            <span className={cn('h-1.5 w-1.5 rounded-full', type.dot)} />
            {type.label}
          </span>
          {lesson.estimatedMinutes ? (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              {lesson.estimatedMinutes} минут
            </span>
          ) : null}
        </div>
        <CardTitle className="text-xl">{lesson.skillName}</CardTitle>
        {lesson.learningGoal ? (
          <p className="whitespace-pre-line text-sm text-muted-foreground">{lesson.learningGoal}</p>
        ) : null}
      </CardHeader>

      <CardContent className="space-y-6">
        {banner ? (
          <p className="border-l-2 border-pending py-1 pl-4 text-sm text-foreground">
            {banner}
          </p>
        ) : null}

        {lesson.studentMessage ? (
          <p className="border-l-2 border-primary/50 py-1 pl-4 text-sm italic text-foreground">
            {lesson.studentMessage}
          </p>
        ) : null}

        {lesson.book ? <BookViewer book={lesson.book} /> : null}

        <Section title="Сануулах" body={lesson.remember} />
        <Section title="Жишээ" body={lesson.workedExample} />
        <Section title="Хамтдаа хийх дасгал" body={lesson.guidedPractice} />
        <Section title="Бие даан хийх" body={lesson.independentPractice} />
      </CardContent>
    </Card>
  )
}

/**
 * One subject's work for the day.
 *
 * The heading is the subject, because that is how a child thinks about their
 * day - first maths, then English - rather than a flat list of lessons whose
 * subject has to be inferred from the topic.
 *
 * Where a subject places students by level there is no class lesson at all and
 * the personal one is the whole of it, so the "extra work" heading only appears
 * when there is something for it to be extra to.
 */
function SubjectBlock({ day }: { day: SubjectDay }) {
  const personalOnly = !day.lesson && Boolean(day.extra)

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-baseline gap-3 border-b pb-2">
        <h2 className="text-lg font-bold">{day.subjectName}</h2>
        {personalOnly ? (
          <span className="text-xs text-muted-foreground">Таны түвшинд тохируулсан</span>
        ) : null}
      </div>

      {day.lesson ? (
        <>
          <LessonCard lesson={day.lesson} />
          <LessonQuiz lessonId={day.lesson.id} />
        </>
      ) : null}

      {day.extra ? (
        <div className="space-y-4">
          {!personalOnly ? (
            <div className="flex flex-wrap items-baseline gap-2 pt-2">
              <h3 className="text-base font-semibold">Нэмэлт ажил</h3>
              <span className="text-sm text-muted-foreground">
                {day.extra.source === 'TEACHER'
                  ? 'Багш тань тусгайлан өгсөн'
                  : 'Таны түвшинд тохируулсан'}
              </span>
            </div>
          ) : null}

          <LessonCard lesson={day.extra.lesson} banner={day.extra.reason} />
          <LessonQuiz lessonId={day.extra.lesson.id} />
        </div>
      ) : null}
    </section>
  )
}

export default function StudentToday() {
  const { data, isLoading, isError } = useGetStudentToday()

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    )
  }

  if (isError || !data) {
    return <p role="alert">Өнөөдрийн хичээлийг уншиж чадсангүй.</p>
  }

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <p className="text-sm text-muted-foreground">{data.dateLabel}</p>
        <h1 className="text-2xl font-bold">Өнөөдрийн хичээл</h1>
        <p className="text-sm text-muted-foreground">
          {data.className}
          {data.subjects.length > 0 ? ` · ${data.subjects.length} хичээл` : ''}
        </p>
      </header>

      {data.subjects.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            {data.notice}
          </CardContent>
        </Card>
      ) : (
        data.subjects.map((day) => <SubjectBlock key={day.subjectCode} day={day} />)
      )}

      {data.subjects.length > 0 ? (
        <p className="border-t pt-4 text-xs text-muted-foreground">{data.notice}</p>
      ) : null}
    </div>
  )
}
