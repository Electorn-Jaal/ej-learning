import { useGetStudentToday } from '@workspace/api-client-react'
import { BookOpen, Clock, ExternalLink } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

const LESSON_TYPE: Record<string, { label: string; className: string }> = {
  CORE: { label: 'Үндсэн хичээл', className: 'bg-primary/10 text-primary border-primary/20' },
  RECOVERY: { label: 'Нөхөх хичээл', className: 'bg-amber-500/10 text-amber-700 border-amber-500/20' },
  REINFORCE: { label: 'Бататгах', className: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20' },
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

  const { lesson } = data
  const type = lesson ? (LESSON_TYPE[lesson.lessonType] ?? LESSON_TYPE.CORE) : null

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-sm text-muted-foreground">{data.dateLabel}</p>
        <h1 className="text-2xl font-bold">Өнөөдрийн хичээл</h1>
        {data.className ? (
          <p className="text-sm text-muted-foreground">{data.className}</p>
        ) : null}
      </header>

      {!lesson ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            {data.notice}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {type ? (
                <Badge variant="outline" className={type.className}>
                  {type.label}
                </Badge>
              ) : null}
              {lesson.estimatedMinutes ? (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  {lesson.estimatedMinutes} минут
                </span>
              ) : null}
            </div>
            <CardTitle className="text-xl">{lesson.skillName}</CardTitle>
            {lesson.learningGoal ? (
              <p className="text-sm text-muted-foreground">{lesson.learningGoal}</p>
            ) : null}
          </CardHeader>

          <CardContent className="space-y-6">
            {lesson.studentMessage ? (
              <p className="rounded-md border bg-muted/40 px-4 py-3 text-sm">
                {lesson.studentMessage}
              </p>
            ) : null}

            {lesson.book ? (
              <a
                href={`${lesson.book.fileUrl}#page=${lesson.book.pageFrom ?? 1}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-3 rounded-md border p-4 transition-colors hover:bg-muted/50"
              >
                <BookOpen className="h-5 w-5 shrink-0 text-primary" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {lesson.book.chapterTitle ?? lesson.book.title ?? 'Сурах бичиг'}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {lesson.book.title}
                    {lesson.book.pageFrom
                      ? ` · ${lesson.book.pageFrom}–${lesson.book.pageTo ?? lesson.book.pageFrom} хуудас`
                      : null}
                  </span>
                </span>
                <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" />
              </a>
            ) : null}

            <Section title="Сануулах" body={lesson.remember} />
            <Section title="Жишээ" body={lesson.workedExample} />
            <Section title="Хамтдаа хийх дасгал" body={lesson.guidedPractice} />
            <Section title="Бие даан хийх" body={lesson.independentPractice} />

            <p className="border-t pt-4 text-xs text-muted-foreground">{data.notice}</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
