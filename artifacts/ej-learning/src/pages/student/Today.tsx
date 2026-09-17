import { useState } from 'react'
import {
  useGetStudentToday,
  type DailyLessonView,
  type SubjectDay,
} from '@workspace/api-client-react'
import { ChevronDown, ChevronUp, Clock } from 'lucide-react'
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
          <p className="whitespace-pre-line text-sm text-muted-foreground">
            {lesson.learningGoal}
          </p>
        ) : null}
      </CardHeader>

      <CardContent className="space-y-6">
        {banner ? (
          <p className="border-l-2 border-pending py-1 pl-4 text-sm text-foreground">{banner}</p>
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
 * One subject's work for the day, closed until it is opened.
 *
 * A child with four subjects has four lessons, four sets of book pages and four
 * quizzes. All of that expanded is a page nobody reads to the end of, and it
 * buries the thing that matters most: what is still left to do. Closed, the
 * whole day fits on a screen and each row says what it is.
 *
 * The heading is the subject, because that is how a child thinks about a day -
 * first maths, then English - rather than a flat list of topics whose subject
 * has to be worked out from the title.
 *
 * Where a subject places students by level there is no class lesson at all and
 * the personal one is the whole of it, so the "extra work" heading only appears
 * when there is something for it to be extra to.
 */
function SubjectBlock({
  day,
  open,
  onToggle,
}: {
  day: SubjectDay
  open: boolean
  onToggle: () => void
}) {
  const personalOnly = !day.lesson && Boolean(day.extra)
  const lessons = [day.lesson, day.extra?.lesson].filter(Boolean) as DailyLessonView[]
  const minutes = lessons.reduce((total, lesson) => total + (lesson.estimatedMinutes ?? 0), 0)
  const lead = day.lesson?.skillName ?? day.extra?.lesson.skillName ?? null

  return (
    <li className={cn('border-l-2', open ? 'border-primary' : 'border-transparent')}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary/50"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{day.subjectName}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {lead ?? 'Хичээл алга'}
          </span>
        </span>

        {day.extra && !personalOnly ? (
          <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-pending" />
            Нэмэлттэй
          </span>
        ) : null}

        {minutes > 0 ? (
          <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            {minutes} мин
          </span>
        ) : null}

        {open ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
      </button>

      {open ? (
        <div className="space-y-4 border-t border-border px-4 py-4">
          {personalOnly ? (
            <p className="text-xs text-muted-foreground">Таны түвшинд тохируулсан</p>
          ) : null}

          {day.lesson ? (
            <>
              <LessonCard lesson={day.lesson} />
              <LessonQuiz lessonId={day.lesson.id} />
            </>
          ) : null}

          {day.extra ? (
            <div className="space-y-4">
              {!personalOnly ? (
                <div className="flex flex-wrap items-baseline gap-2 border-t pt-4">
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
        </div>
      ) : null}
    </li>
  )
}

export default function StudentToday() {
  const { data, isLoading, isError } = useGetStudentToday()
  // One subject open at a time: a day is worked through, not a set of panels
  // left hanging open.
  const [openSubject, setOpenSubject] = useState<string | null>(null)

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
    <div className="space-y-6">
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
        <ul className="divide-y rounded-md border border-border bg-card">
          {data.subjects.map((day) => (
            <SubjectBlock
              key={day.subjectCode}
              day={day}
              open={openSubject === day.subjectCode}
              onToggle={() =>
                setOpenSubject(openSubject === day.subjectCode ? null : day.subjectCode)
              }
            />
          ))}
        </ul>
      )}

      {data.subjects.length > 0 ? (
        <p className="border-t pt-4 text-xs text-muted-foreground">{data.notice}</p>
      ) : null}
    </div>
  )
}
