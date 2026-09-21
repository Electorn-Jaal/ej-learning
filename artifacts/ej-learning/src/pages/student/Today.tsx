import { Link } from 'wouter'
import {
  useGetStudentToday,
  type DailyLessonView,
  type SubjectDay,
} from '@workspace/api-client-react'
import { Clock } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

/** One of the small buttons a subject offers. */
function Choice({ code, view, children }: { code: string; view: string; children: string }) {
  return (
    <Link
      href={`/subject/${encodeURIComponent(code)}/${view}`}
      className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
    >
      {children}
    </Link>
  )
}

/**
 * One subject's line in the day.
 *
 * It says what the subject is and what today's topic is called, and then
 * offers the three places a child can go from it. Nothing opens here: the
 * lesson, the child's own work and the questions each fill a page of their
 * own, so the day stays a short list however much work is in it.
 *
 * A button appears only where there is something behind it. A subject with no
 * class lesson - which is the normal state where students are placed by level
 * - offers the personal work and the questions, and does not offer a lesson
 * that is not there.
 */
function SubjectRow({ day }: { day: SubjectDay }) {
  const personalOnly = !day.lesson && Boolean(day.extra)
  const lessons = [day.lesson, day.extra?.lesson].filter(Boolean) as DailyLessonView[]
  const minutes = lessons.reduce((total, lesson) => total + (lesson.estimatedMinutes ?? 0), 0)
  const lead = day.lesson?.skillName ?? day.extra?.lesson.skillName ?? null

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{day.subjectName}</p>
        <p className="truncate text-xs text-muted-foreground">{lead ?? 'Хичээл алга'}</p>
      </div>

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

      <div className="flex flex-wrap gap-2">
        {day.lesson ? (
          <Choice code={day.subjectCode} view="lesson">
            Хичээл
          </Choice>
        ) : null}
        {day.extra ? (
          <Choice code={day.subjectCode} view="personal">
            Хувийн хичээл
          </Choice>
        ) : null}
        {day.lesson || day.extra ? (
          <Choice code={day.subjectCode} view="quiz">
            Шалгалт
          </Choice>
        ) : null}
      </div>
    </li>
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
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-sm text-muted-foreground">{data.dateLabel}</p>
        <h1 className="text-2xl font-bold">Өнөөдрийн хичээл</h1>
        <p className="text-sm text-muted-foreground">
          {data.className}
          {data.subjects.length > 0 ? ` · ${data.subjects.length} хичээл` : ''}
        </p>
      </header>

      {/*
        * The child's own plan sits with the day's work rather than in the
        * navigation: it is something they do today, not a section of the site.
        */}
      <Link
        href="/plan"
        className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-4 py-3 transition-colors hover:bg-secondary/50"
      >
        <span>
          <span className="block text-sm font-semibold">Миний төлөвлөгөө</span>
          <span className="block text-xs text-muted-foreground">
            Сургуулийн хичээлээс гадна өнөөдөр юу хийхээ бичнэ
          </span>
        </span>
        <span className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>Нээх</span>
      </Link>

      {data.subjects.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            {data.notice}
          </CardContent>
        </Card>
      ) : (
        <ul className="divide-y rounded-md border border-border bg-card">
          {data.subjects.map((day) => (
            <SubjectRow key={day.subjectCode} day={day} />
          ))}
        </ul>
      )}
    </div>
  )
}
