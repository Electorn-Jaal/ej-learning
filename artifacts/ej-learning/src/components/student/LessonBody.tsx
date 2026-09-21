import { type DailyLessonView } from '@workspace/api-client-react'
import { Clock } from 'lucide-react'
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

/**
 * One lesson, written out in full.
 *
 * Deliberately frameless. It fills a page of its own now, and a card drawn
 * around something that is already the whole screen is a border for its own
 * sake.
 */
export function LessonBody({
  lesson,
  banner,
}: {
  lesson: DailyLessonView
  banner?: string | null
}) {
  const type = LESSON_TYPE[lesson.lessonType] ?? LESSON_TYPE.CORE

  return (
    <div className="space-y-6">
      <div className="space-y-3">
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

        {lesson.learningGoal ? (
          <p className="whitespace-pre-line text-sm text-muted-foreground">
            {lesson.learningGoal}
          </p>
        ) : null}

        {banner ? (
          <p className="border-l-2 border-pending py-1 pl-4 text-sm text-foreground">{banner}</p>
        ) : null}

        {lesson.teacherNote ? (
          <div className="rounded-md border border-primary/30 bg-primary/5 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Багшийн тайлбар
            </p>
            <p className="mt-1 whitespace-pre-line text-sm text-foreground">{lesson.teacherNote}</p>
          </div>
        ) : null}
      </div>

      <div className="space-y-6">
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
      </div>
    </div>
  )
}
