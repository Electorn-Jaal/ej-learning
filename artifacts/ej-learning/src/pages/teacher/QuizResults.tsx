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
import { ClassSkills } from '@/components/teacher/ClassSkills'
import { ItemAnalysis } from '@/components/teacher/ItemAnalysis'
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
import { currentSelection, entryKey, subjectParam } from '@/lib/teacher-class'

/** The calendar day an attempt belongs to, in the school's own timezone. */
const dayOf = (iso: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ulaanbaatar' }).format(new Date(iso))

const DAY_LABEL = new Intl.DateTimeFormat('mn-MN', {
  month: 'long',
  day: 'numeric',
  weekday: 'long',
  timeZone: 'Asia/Ulaanbaatar',
})

const WHEN = new Intl.DateTimeFormat('mn-MN', {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Ulaanbaatar',
})

/** Marks out of marks available, as a whole percent. */
const percent = (rows: { score: number; maxScore: number }[]) => {
  const possible = rows.reduce((sum, row) => sum + row.maxScore, 0)
  if (possible === 0) return 0
  return Math.round((rows.reduce((sum, row) => sum + row.score, 0) / possible) * 100)
}

/** Three bands, the same everywhere: good, shaky, needs the teacher. */
const dot = (share: number) =>
  share >= 80 ? 'bg-success' : share >= 50 ? 'bg-pending' : 'bg-destructive'

/**
 * A percentage as a number and a length.
 *
 * A bar beside the figure is what makes a column of topics comparable at a
 * glance - which is the whole question a teacher scanning a day is asking.
 */
function Share({ value }: { value: number }) {
  return (
    <span className="flex shrink-0 items-center gap-2">
      <span className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-secondary sm:block">
        <span
          className={`block h-full rounded-full ${dot(value)}`}
          style={{ width: `${value}%` }}
        />
      </span>
      <span className="w-10 text-right text-sm font-semibold tabular-nums">{value}%</span>
    </span>
  )
}

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

/**
 * How a class did, read the way a teacher asks the question.
 *
 * The order is date, then topic, then the children - because "how did 9А go
 * on fractions on Tuesday" is one question, and a flat list of every attempt
 * ever made answers it only by reading until the dates change. The class and
 * the subject are already chosen above, so those are not repeated here.
 *
 * Nothing below a day is opened for you. Spreading every child's every answer
 * across the page buries the one number a teacher came for; the levels open
 * when asked, one at a time.
 */
function Attempts({ classId, subjectId }: { classId: number; subjectId: number | null }) {
  const { data, isLoading, isError, error } = useGetTeacherQuizAttempts({
    classId,
    ...subjectParam(subjectId),
  })
  const lessonParams = { classId, ...subjectParam(subjectId) }
  const { data: lessons } = useGetTeacherLessons(lessonParams, {
    query: { queryKey: getGetTeacherLessonsQueryKey(lessonParams) },
  })
  const [openTopic, setOpenTopic] = useState<string | null>(null)
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

  const byDay = new Map<string, typeof data.attempts>()
  for (const attempt of data.attempts) {
    const day = dayOf(attempt.submittedAt)
    byDay.set(day, [...(byDay.get(day) ?? []), attempt])
  }
  const days = [...byDay.entries()].sort(([a], [b]) => b.localeCompare(a))
  const today = dayOf(new Date().toISOString())

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{data.className} — шалгах асуултын үр дүн</CardTitle>
        <p className="text-sm text-muted-foreground">
          Огноо, дараа нь сэдвээр. Сэдэв дээр дарж хэн хэрхэн хариулсныг,
          сурагч дээр дарж асуулт бүрийг харна.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {days.map(([day, dayAttempts]) => {
          // One topic is one lesson: lessonCode is the thing that is the same
          // between two children who sat the same quiz, where the name is only
          // what it is called.
          const byTopic = new Map<string, typeof data.attempts>()
          for (const attempt of dayAttempts) {
            byTopic.set(attempt.lessonCode, [
              ...(byTopic.get(attempt.lessonCode) ?? []),
              attempt,
            ])
          }
          const topics = [...byTopic.entries()].sort(([, a], [, b]) =>
            a[0]!.skillName.localeCompare(b[0]!.skillName, 'mn'),
          )

          return (
            <section key={day} className="space-y-2">
              <h3 className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border pb-2">
                <span className="font-semibold">
                  {DAY_LABEL.format(new Date(day + 'T00:00:00Z'))}
                </span>
                {day === today ? (
                  <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
                    Өнөөдөр
                  </span>
                ) : null}
                <span className="text-sm font-normal text-muted-foreground">
                  {topics.length} сэдэв · {dayAttempts.length} хариулт ·{' '}
                  {percent(dayAttempts)}%
                </span>
              </h3>

              <ul className="divide-y">
                {topics.map(([lessonCode, attempts]) => {
                  const topicKey = `${day}:${lessonCode}`
                  const topicOpen = openTopic === topicKey
                  const share = percent(attempts)
                  return (
                    <li key={topicKey}>
                      <button
                        type="button"
                        onClick={() => {
                          setOpenTopic(topicOpen ? null : topicKey)
                          setOpenId(null)
                        }}
                        aria-expanded={topicOpen}
                        className="flex w-full flex-wrap items-center gap-3 py-3 text-left transition-colors hover:bg-secondary/50"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">
                            {attempts[0]!.skillName}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {attempts.length} сурагч хариулсан
                          </div>
                        </div>

                        <Share value={share} />

                        {topicOpen ? (
                          <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                      </button>

                      {topicOpen ? (
                        <ul className="divide-y border-l-2 border-border pb-3 pl-3">
                          {attempts.map((attempt) => {
                            const open = openId === attempt.id
                            return (
                              <li key={attempt.id}>
                                <button
                                  type="button"
                                  onClick={() => setOpenId(open ? null : attempt.id)}
                                  aria-expanded={open}
                                  className="flex w-full flex-wrap items-center gap-3 py-2.5 text-left transition-colors hover:bg-secondary/50"
                                >
                                  <div className="min-w-0 flex-1">
                                    <div className="truncate text-sm">
                                      {attempt.studentName}
                                      <span className="ml-2 text-muted-foreground">
                                        {attempt.studentCode}
                                      </span>
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      {WHEN.format(new Date(attempt.submittedAt))}
                                    </div>
                                  </div>

                                  <span className="flex items-center gap-2 text-sm font-semibold tabular-nums">
                                    <span
                                      className={`h-1.5 w-1.5 rounded-full ${dot(
                                        attempt.maxScore === 0
                                          ? 0
                                          : (attempt.score / attempt.maxScore) * 100,
                                      )}`}
                                    />
                                    {attempt.score}/{attempt.maxScore}
                                  </span>

                                  {open ? (
                                    <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
                                  ) : (
                                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
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
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        })}
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

  const { key, classId, subjectId } = currentSelection(classes, selected)

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Шалгах асуултын үр дүн</h1>
        <p className="text-sm text-muted-foreground">
          Сурагчид өдрийн хичээлийн дараа хариулсан асуултууд, шинэ нь эхэндээ.
        </p>
      </header>

      {classes.length > 1 ? (
        <Select value={key ?? ''} onValueChange={setSelected}>
          <SelectTrigger className="w-full sm:w-64">
            <SelectValue placeholder="Анги сонгох" />
          </SelectTrigger>
          <SelectContent>
            {classes.map((klass) => (
              <SelectItem key={entryKey(klass)} value={entryKey(klass)}>
                {klass.name}
                {klass.subject ? ` · ${klass.subject}` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}

      <ItemAnalysis classId={classId} />
      <ClassSkills classId={classId} subjectId={subjectId} />
      <Attempts classId={classId} subjectId={subjectId} />
    </div>
  )
}
