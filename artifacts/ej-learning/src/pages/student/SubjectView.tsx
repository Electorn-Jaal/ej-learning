import { Link, useRoute } from 'wouter'
import { useGetStudentToday } from '@workspace/api-client-react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { LessonBody } from '@/components/student/LessonBody'
import { LessonQuiz } from '@/components/quiz/LessonQuiz'

const TITLE: Record<string, string> = {
  lesson: 'Хичээл',
  personal: 'Нэмэлт бэлтгэл',
  quiz: 'Шалгалт',
}

/**
 * One subject's lesson, personal work, or questions - on a page of its own.
 *
 * These three used to unroll underneath the day's list, which made the list
 * grow a screen and a half every time a child touched it. The day now stays a
 * short list of subjects and each of the three is somewhere to go and come
 * back from.
 *
 * It reads the same "today" query the list does, so arriving here costs no
 * request: the answer is already in hand, and the subject is found in it by
 * the code in the address.
 */
export default function StudentSubjectView() {
  const [, params] = useRoute('/subject/:code/:view')
  const { data, isLoading, isError } = useGetStudentToday()

  const code = params?.code ?? ''
  const view = params?.view ?? ''

  if (isLoading) return <Skeleton className="h-96 w-full" />
  if (isError || !data) return <p role="alert">Өнөөдрийн хичээлийг уншиж чадсангүй.</p>

  const day = data.subjects.find((subject) => subject.subjectCode === code)

  const back = (
    <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="h-4 w-4" />
      Өнөөдрийн хичээл
    </Link>
  )

  if (!day || !(view in TITLE)) {
    return (
      <div className="space-y-4">
        {back}
        <p role="alert" className="text-sm text-muted-foreground">
          Энэ хичээл өнөөдрийн жагсаалтад алга.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-10">
      <div className="space-y-2">
        {back}
        <div>
          <h1 className="text-2xl font-bold">{day.subjectName}</h1>
          <p className="text-sm text-muted-foreground">{TITLE[view]}</p>
        </div>
      </div>

      {view === 'lesson' ? (
        day.lesson ? (
          <>
            <LessonBody lesson={day.lesson} />
            <div className="border-t pt-6">
              <Link
                href={`/subject/${encodeURIComponent(code)}/quiz`}
                className={cn(buttonVariants({ size: 'sm' }))}
              >
                Шалгалт руу
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Өнөөдөр ангийн хичээл алга.</p>
        )
      ) : null}

      {view === 'personal' ? (
        day.extra ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {day.extra.source === 'TEACHER'
                ? 'Багш тань тусгайлан өгсөн'
                : 'Таны түвшинд тохируулсан'}
            </p>
            <LessonBody lesson={day.extra.lesson} banner={day.extra.reason} />
            <div className="border-t pt-6">
              <Link
                href={`/subject/${encodeURIComponent(code)}/quiz`}
                className={cn(buttonVariants({ size: 'sm' }))}
              >
                Шалгалт руу
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Өнөөдөр хувийн ажил алга.</p>
        )
      ) : null}

      {view === 'quiz' ? (
        day.lesson || day.extra ? (
          <div className="space-y-8">
            {day.lesson ? <LessonQuiz lessonId={day.lesson.id} /> : null}
            {day.extra ? (
              <div className="space-y-4">
                {day.lesson ? (
                  <h2 className="border-t pt-6 text-base font-semibold">
                    Нэмэлт бэлтгэлийн шалгалт
                  </h2>
                ) : null}
                <LessonQuiz lessonId={day.extra.lesson.id} />
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Өнөөдөр шалгах асуулт алга.</p>
        )
      ) : null}
    </div>
  )
}
