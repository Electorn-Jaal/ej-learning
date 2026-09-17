import { useState } from 'react'
import {
  getGetTeacherLessonsQueryKey,
  useAssignExtraWork,
  useGetTeacherClasses,
  useGetTeacherLessons,
  useGetTeacherQuizAttempts,
  type SchedulableLesson,
} from '@workspace/api-client-react'
import { Check, ChevronDown, ChevronUp, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const WHEN = new Intl.DateTimeFormat('mn-MN', {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Ulaanbaatar',
})

const tomorrow = () => {
  const date = new Date()
  date.setDate(date.getDate() + 1)
  return date.toISOString().slice(0, 10)
}

/**
 * Give one student extra work off the back of a weak attempt.
 *
 * The lesson list is the same one the schedule draws from, so a teacher can
 * only send a child back to something their class could actually be taught.
 * It defaults to tomorrow: today's work is already in front of them.
 */
function AssignExtra({
  studentId,
  studentName,
  lessons,
  suggestReason,
}: {
  studentId: number
  studentName: string
  lessons: SchedulableLesson[]
  suggestReason: string
}) {
  const { mutate, isPending } = useAssignExtraWork()
  const [open, setOpen] = useState(false)
  const [lessonId, setLessonId] = useState<string>('')
  const [reason, setReason] = useState(suggestReason)
  const [done, setDone] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (done) {
    return (
      <p className="border-l-2 border-success py-1 pl-3 text-sm text-foreground">{done}</p>
    )
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Нэмэлт даалгавар өгөх
      </Button>
    )
  }

  const assign = () => {
    setError(null)
    if (!lessonId) {
      setError('Хичээл сонгоно уу.')
      return
    }
    mutate(
      {
        data: {
          studentId,
          lessonId: Number(lessonId),
          assignedOn: tomorrow(),
          reason: reason.trim() || null,
        },
      },
      {
        onSuccess: (result) =>
          setDone(
            `${result.studentName} — "${result.skillName}" ${result.assignedOn}-нд оноогдлоо.`,
          ),
        onError: (cause) => setError(cause?.data?.error ?? 'Оноож чадсангүй.'),
      },
    )
  }

  return (
    <div className="space-y-3 rounded-md border border-border p-3">
      <p className="text-sm font-medium">{studentName} — нэмэлт даалгавар</p>
      <Select value={lessonId} onValueChange={setLessonId}>
        <SelectTrigger aria-label="Хичээл">
          <SelectValue placeholder="Давтах хичээлээ сонгоно уу" />
        </SelectTrigger>
        <SelectContent>
          {lessons.map((lesson) => (
            <SelectItem key={lesson.id} value={String(lesson.id)}>
              {lesson.skillName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Шалтгаан — сурагчид харагдана"
        aria-label="Шалтгаан"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={assign} disabled={isPending}>
          {isPending ? 'Оноож байна…' : `Маргааш (${tomorrow()}) оноох`}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Болих
        </Button>
        {error ? (
          <span role="alert" className="text-sm text-destructive">
            {error}
          </span>
        ) : null}
      </div>
    </div>
  )
}

function Attempts({ classId }: { classId: number }) {
  const { data, isLoading, isError, error } = useGetTeacherQuizAttempts({ classId })
  const { data: lessons } = useGetTeacherLessons(
    { classId },
    { query: { queryKey: getGetTeacherLessonsQueryKey({ classId }) } },
  )
  const [openId, setOpenId] = useState<number | null>(null)

  if (isLoading) return <Skeleton className="h-64 w-full" />
  if (isError || !data) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {error?.data?.error ?? 'Үр дүнг уншиж чадсангүй.'}
      </p>
    )
  }

  if (data.attempts.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          {data.className} ангид хараахан хариулсан сурагч алга.
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{data.className} — шалгах асуултын үр дүн</CardTitle>
        <p className="text-sm text-muted-foreground">
          {data.attempts.length} хариулт. Мөр дээр дарж хариулт бүрийг харна.
        </p>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {data.attempts.map((attempt) => {
            const open = openId === attempt.id
            const ratio = attempt.score / attempt.maxScore
            return (
              <li key={attempt.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : attempt.id)}
                  aria-expanded={open}
                  className="flex w-full flex-wrap items-center gap-3 py-3 text-left transition-colors hover:bg-secondary/50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {attempt.studentName}
                      <span className="ml-2 font-normal text-muted-foreground">
                        {attempt.studentCode}
                      </span>
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {attempt.skillName} · {WHEN.format(new Date(attempt.submittedAt))}
                    </div>
                  </div>

                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        ratio === 1
                          ? 'bg-success'
                          : ratio >= 0.5
                            ? 'bg-pending'
                            : 'bg-destructive'
                      }`}
                    />
                    {attempt.score}/{attempt.maxScore}
                  </span>

                  {open ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>

                {open ? (
                  <ol className="space-y-3 pb-4 pl-1">
                    {attempt.answers.map((answer, index) => (
                      <li key={answer.questionId} className="text-sm">
                        <p className="font-medium">
                          {index + 1}. {answer.prompt}
                        </p>
                        <p className="mt-0.5 flex items-start gap-2 text-muted-foreground">
                          {answer.correct ? (
                            <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                          ) : (
                            <X className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                          )}
                          <span>{answer.chosenText || '(хариулаагүй)'}</span>
                        </p>
                      </li>
                    ))}
                    {lessons?.length ? (
                      <li className="pt-2">
                        <AssignExtra
                          studentId={attempt.studentId}
                          studentName={attempt.studentName}
                          lessons={lessons}
                          suggestReason={`${attempt.skillName}: ${attempt.score}/${attempt.maxScore}. Суурь сэдвээ давтъя.`}
                        />
                      </li>
                    ) : null}
                  </ol>
                ) : null}
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}

export default function TeacherQuizResults() {
  const { data: classes, isLoading } = useGetTeacherClasses()
  const [selected, setSelected] = useState<string | null>(null)

  if (isLoading) return <Skeleton className="h-64 w-full" />
  if (!classes?.length) {
    return <p className="text-sm text-muted-foreground">Анги олдсонгүй.</p>
  }

  const classId = selected ?? classes[0].id

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Шалгах асуултын үр дүн</h1>
        <p className="text-sm text-muted-foreground">
          Сурагчид өдрийн хичээлийн дараа хариулсан асуултууд, шинэ нь эхэндээ.
        </p>
      </header>

      {classes.length > 1 ? (
        <Select value={classId} onValueChange={setSelected}>
          <SelectTrigger className="w-full sm:w-64">
            <SelectValue placeholder="Анги сонгох" />
          </SelectTrigger>
          <SelectContent>
            {classes.map((klass) => (
              <SelectItem key={klass.id} value={klass.id}>
                {klass.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}

      <Attempts classId={Number(classId)} />
    </div>
  )
}
