import { useEffect } from 'react'
import {
  getGetTeacherLessonsQueryKey,
  useGetTeacherLessons,
  useGetTeacherQuizPaper,
} from '@workspace/api-client-react'
import { Check } from 'lucide-react'
import { NATIVE_SELECT } from '@/components/ui/native-select'
import { Skeleton } from '@/components/ui/skeleton'
import { subjectParam } from '@/lib/teacher-class'
import { cn } from '@/lib/utils'

/**
 * Which section's paper to read, as one cell of the screen's own toolbar.
 *
 * It sits up there with the class and the subject rather than above the paper,
 * so that the three things being chosen are chosen in one place and every box
 * is the same width whichever half of the screen is open.
 */
export function LessonSelect({ classId, subjectId, value, onChange }: {
  classId: number
  subjectId: number | null
  value: number | null
  onChange: (lessonId: number | null) => void
}) {
  const params = { classId, ...subjectParam(subjectId) }
  const { data: lessons, isLoading } = useGetTeacherLessons(params, {
    query: { queryKey: getGetTeacherLessonsQueryKey(params) },
  })

  // The first lesson, until somebody picks another. Announced upwards rather
  // than kept here, because the paper below is fetched by the page.
  useEffect(() => {
    if (!isLoading && lessons?.length && (value === null || !lessons.some((row) => row.id === value))) {
      onChange(lessons[0]!.id)
    }
  }, [isLoading, lessons, value, onChange])

  return (
    <div className="space-y-2">
      <label htmlFor="paper-lesson" className="block text-sm font-medium">Сэдэв</label>
      <select
        id="paper-lesson"
        className={NATIVE_SELECT}
        disabled={isLoading || !lessons?.length}
        value={value === null ? '' : String(value)}
        onChange={(event) => onChange(event.target.value ? Number(event.target.value) : null)}
      >
        {lessons?.length ? null : <option value="">Сэдэв алга</option>}
        {(lessons ?? []).map((lesson) => (
          <option key={lesson.id} value={String(lesson.id)}>
            {lesson.skillName}{lesson.chapterTitle ? ' · ' + lesson.chapterTitle : ''}
          </option>
        ))}
      </select>
    </div>
  )
}

/**
 * The paper itself: what the class is asked, and which answer is the right
 * one.
 *
 * The results screen answers "how did they do". This answers "what were they
 * asked", which is the question a teacher has first and which nothing in the
 * product could answer before - the questions existed only inside the child's
 * quiz, and only while it was being taken. A percentage nobody can trace back
 * to a question is a number, not a judgement.
 *
 * The key is shown. The child's copy leaves it on the server on purpose, so a
 * score means something; a teacher is the person deciding whether the question
 * is fair, and cannot do that blind.
 */
export function QuizPaperView({ classId, lessonId }: { classId: number; lessonId: number | null }) {
  if (lessonId === null) {
    return (
      <p className="rounded-[2px] border border-border bg-card p-6 text-sm text-muted-foreground">
        Энэ анги, хичээлд батлагдсан хичээлийн агуулга алга байна.
      </p>
    )
  }
  return <Paper classId={classId} lessonId={lessonId} />
}

function Paper({ classId, lessonId }: { classId: number; lessonId: number }) {
  const { data, isLoading, isError, error } = useGetTeacherQuizPaper({ classId, lessonId })

  if (isLoading) return <Skeleton className="h-80 w-full" />
  if (isError || !data) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {error?.data?.error ?? 'Шалгалтын материалыг уншиж чадсангүй.'}
      </p>
    )
  }

  if (data.questions.length === 0) {
    // Not an error and not an empty page: the lesson is real, nobody has
    // written questions for it. Saying which lesson makes that actionable.
    return (
      <div className="rounded-[2px] border border-border bg-card p-6">
        <p className="text-sm font-semibold">{data.skillName}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Энэ сэдэвт шалгах асуулт хараахан бичигдээгүй байна.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-[2px] border border-border bg-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-4 py-2">
        <p className="text-sm font-semibold">{data.skillName}</p>
        <p className="text-xs text-muted-foreground">
          {data.subjectName} · {data.questions.length} асуулт
        </p>
      </div>

      <ol className="divide-y divide-border">
        {data.questions.map((question, index) => (
          <li key={question.itemId} className="space-y-2 px-4 py-3">
            <p className="flex gap-2 text-sm">
              <span className="shrink-0 tabular-nums text-muted-foreground">{index + 1}.</span>
              <span className="min-w-0">{question.prompt}</span>
            </p>

            <ul className="space-y-1 pl-6">
              {question.options.map((option) => (
                <li
                  key={option.optionId}
                  className={cn(
                    'flex items-start gap-2 text-sm',
                    option.isCorrect ? 'font-medium' : 'text-muted-foreground',
                  )}
                >
                  {/* A tick, not a colour alone: the right answer has to be
                      findable by somebody who cannot tell the two apart. */}
                  <span className="w-4 shrink-0 pt-0.5">
                    {option.isCorrect ? <Check className="h-3.5 w-3.5 text-success" /> : null}
                  </span>
                  <span className="min-w-0">{option.text}</span>
                </li>
              ))}
            </ul>

            {question.explanation ? (
              <p className="pl-6 text-xs text-muted-foreground">{question.explanation}</p>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  )
}
