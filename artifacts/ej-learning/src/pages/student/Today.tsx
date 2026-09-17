import { useGetStudentToday } from '@workspace/api-client-react'
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
                <span className="inline-flex items-center gap-2 text-xs font-medium text-foreground">
                  <span className={cn('h-1.5 w-1.5 rounded-full', type.dot)} />
                  {type.label}
                </span>
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
              <p className="border-l-2 border-primary/50 py-1 pl-4 text-sm italic text-foreground">
                {lesson.studentMessage}
              </p>
            ) : null}

            {lesson.book ? <BookViewer book={lesson.book} /> : null}

            <Section title="Сануулах" body={lesson.remember} />
            <Section title="Жишээ" body={lesson.workedExample} />
            <Section title="Хамтдаа хийх дасгал" body={lesson.guidedPractice} />
            <Section title="Бие даан хийх" body={lesson.independentPractice} />

            <p className="border-t pt-4 text-xs text-muted-foreground">{data.notice}</p>
          </CardContent>
        </Card>
      )}

      {lesson ? (
        <LessonQuiz lessonId={lesson.id} lessonCode={lesson.lessonCode} />
      ) : null}
    </div>
  )
}
