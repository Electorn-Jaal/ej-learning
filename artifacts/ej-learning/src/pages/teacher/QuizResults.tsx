import { useState } from 'react'
import {
  getGetTeacherLessonsQueryKey,
  useAssignExtraWork,
  useGetTeacherClasses,
  useGetTeacherLessons,
  useGetTeacherQuizAttempts,
  type SchedulableLesson,
  type TeacherQuizAttemptRow,
} from '@workspace/api-client-react'
import { Check, ChevronDown, ChevronUp, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/DatePicker'
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
import { useLinkedSelection } from '@/lib/linked-selection'
import { subjectParam } from '@/lib/teacher-class'

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

/**
 * A calendar day as the date pieces the viewer sees, not as UTC.
 *
 * toISOString would shift the day across midnight for anyone east of
 * Greenwich, which is everyone using this.
 */
const isoDay = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`

/** Marks out of marks available, as a whole percent. */
const percent = (rows: { score: number; maxScore: number }[]) => {
  const possible = rows.reduce((sum, row) => sum + row.maxScore, 0)
  if (possible === 0) return 0
  return Math.round((rows.reduce((sum, row) => sum + row.score, 0) / possible) * 100)
}

/** Three bands, the same everywhere: good, shaky, needs the teacher. */
const band = (share: number) =>
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
          className={`block h-full rounded-full ${band(value)}`}
          style={{ width: `${value}%` }}
        />
      </span>
      <span className="w-10 text-right text-sm font-semibold tabular-nums">{value}%</span>
    </span>
  )
}

type Range = { from: string | null; to: string | null }


function OptionalDetails({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <section className="space-y-3">
      <Button variant="outline" onClick={() => setOpen(!open)} aria-expanded={open}>
        {title}
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </Button>
      {open ? children : null}
    </section>
  )
}

/** All detail panels use the same filtered attempts as the summary. */
function FilteredAnalysis({ attempts }: { attempts: TeacherQuizAttemptRow[] }) {
  const questions = new Map<string, { prompt: string; skillName: string; correct: number; total: number }>()
  const skills = new Map<string, TeacherQuizAttemptRow[]>()
  for (const attempt of attempts) {
    skills.set(attempt.skillName, [...(skills.get(attempt.skillName) ?? []), attempt])
    for (const answer of attempt.answers) {
      const key = attempt.lessonCode + ':' + answer.questionId
      const row = questions.get(key) ?? { prompt: answer.prompt, skillName: attempt.skillName, correct: 0, total: 0 }
      row.total += 1
      row.correct += answer.correct ? 1 : 0
      questions.set(key, row)
    }
  }
  return (
    <div className="space-y-3 border-t pt-4">
      <OptionalDetails title="Асуулт бүрээр харах">
        <ul className="divide-y">
          {[...questions.entries()].map(([key, row], index) => (
            <li key={key} className="flex items-center gap-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{index + 1}. {row.prompt}</p>
                <p className="text-xs text-muted-foreground">{row.skillName} · {row.correct}/{row.total} зөв</p>
              </div>
              <Share value={Math.round(row.correct / row.total * 100)} />
            </li>
          ))}
        </ul>
      </OptionalDetails>
      <OptionalDetails title="Чадвараар харах">
        <ul className="divide-y">
          {[...skills.entries()].map(([name, rows]) => (
            <li key={name} className="flex items-center gap-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{name}</p>
                <p className="text-xs text-muted-foreground">{rows.length} хариулт</p>
              </div>
              <Share value={percent(rows)} />
            </li>
          ))}
        </ul>
      </OptionalDetails>
    </div>
  )
}

/**
 * How many children sit in each band, as one bar.
 *
 * The average says how the class did; this says how many of them it is true
 * of. A class at 70% made of halves at 95 and 45 needs a different lesson
 * tomorrow from one where everybody scored 70.
 */
function BandSpread({ attempts }: { attempts: TeacherQuizAttemptRow[] }) {
  const shares = attempts.map((attempt) =>
    attempt.maxScore === 0 ? 0 : (attempt.score / attempt.maxScore) * 100,
  )
  const groups = [
    { label: 'Эзэмшсэн (80%+)', tone: 'bg-success', n: shares.filter((s) => s >= 80).length },
    {
      label: 'Сайжирч байна (50–79%)',
      tone: 'bg-pending',
      n: shares.filter((s) => s >= 50 && s < 80).length,
    },
    {
      label: 'Дэмжлэг хэрэгтэй (<50%)',
      tone: 'bg-destructive',
      n: shares.filter((s) => s < 50).length,
    },
  ]
  if (shares.length === 0) return null

  return (
    <div>
      <p className="mb-2 text-sm font-medium">Хариултын түвшин</p>
      <div className="flex h-3 overflow-hidden rounded-full bg-secondary">
        {groups.map((group) =>
          group.n === 0 ? null : (
            <span
              key={group.label}
              className={group.tone}
              style={{ width: `${(group.n / shares.length) * 100}%` }}
              title={`${group.label}: ${group.n}`}
            />
          ),
        )}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {groups.map((group) => (
          <li key={group.label} className="inline-flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${group.tone}`} />
            {group.label}: <span className="font-medium tabular-nums">{group.n}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

const tomorrow = () => {
  const date = new Date()
  date.setDate(date.getDate() + 1)
  return isoDay(date)
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
const KIND_LABEL: Record<string, string> = {
  LESSON: 'Хичээлийн',
  UNIT: 'Бүлгийн',
  MONTHLY: 'Сарын',
  DIAGNOSTIC: 'Оношилгооны',
}

function Attempts({
  classId,
  subjectId,
  range,
  today,
  kind,
}: {
  classId: number
  subjectId: number | null
  range: Range
  today: string
  kind: string
}) {
  const { data, isLoading, isError, error } = useGetTeacherQuizAttempts({
    classId,
    ...subjectParam(subjectId),
    ...(range.from ? { from: range.from } : {}),
    ...(range.to ? { to: range.to } : {}),
    // The ceiling the endpoint allows. A class of thirty sitting a quiz a day
    // passes the default fifty inside a week, and a truncated list makes the
    // averages above it quietly wrong; the range is what keeps this bounded.
    limit: 200,
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
    return <p className="text-sm text-muted-foreground">Сонгосон өдөр энэ хичээлийн шалгалтын үр дүн алга. Өөр өдөр сонгоно уу.</p>
  }

  const attempts = kind === 'all' ? data.attempts : data.attempts.filter((row) => row.kind === kind)
  if (attempts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Сонгосон өдөр {(KIND_LABEL[kind] ?? kind).toLocaleLowerCase('mn')} шалгалт өгөгдөөгүй байна.
      </p>
    )
  }

  const byDay = new Map<string, TeacherQuizAttemptRow[]>()
  for (const attempt of attempts) {
    const day = dayOf(attempt.submittedAt)
    byDay.set(day, [...(byDay.get(day) ?? []), attempt])
  }
  const days = [...byDay.entries()].sort(([a], [b]) => b.localeCompare(a))


  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">
          {data.className} — {kind === 'all' ? 'бүх шалгалт' : (KIND_LABEL[kind] ?? kind).toLocaleLowerCase('mn') + ' шалгалт'}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {data.attempts.length} хариулт, {days.length} өдөрт · дундаж{' '}
          {percent(data.attempts)}%. Огноо, дараа нь сэдвээр. Сэдэв дээр дарж хэн хэрхэн
          хариулсныг, сурагч дээр дарж асуулт бүрийг харна.
        </p>
        {data.truncated ? (
          <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            Хамгийн сүүлийн {data.attempts.length} хариулт харагдаж байна. Дээрх
            хувь нь зөвхөн эдгээрийнх — бүтэн дүр зургийг харахын тулд богино
            хугацаа сонгоно уу.
          </p>
        ) : null}
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="space-y-5 rounded-md border border-border p-4">
          <BandSpread attempts={data.attempts} />
        </div>

        {days.map(([day, dayAttempts]) => {
          // One topic is one lesson: lessonCode is the thing that is the same
          // between two children who sat the same quiz, where the name is only
          // what it is called.
          const byTopic = new Map<string, TeacherQuizAttemptRow[]>()
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

                        <Share value={percent(attempts)} />

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
                                      className={`h-1.5 w-1.5 rounded-full ${band(
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
        <FilteredAnalysis attempts={data.attempts} />
      </CardContent>
    </Card>
  )
}

export default function TeacherQuizResults() {
  const { data: classes, isLoading } = useGetTeacherClasses()
  const [selectedClass, setSelectedClass] = useState<string | null>(null)
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null)
  const linked = useLinkedSelection()
  const today = dayOf(new Date().toISOString())
  const [day, setDay] = useState(today)
  const [kind, setKind] = useState('all')

  if (isLoading) return <Skeleton className="h-64 w-full" />
  if (!classes?.length) {
    return <p className="text-sm text-muted-foreground">Анги олдсонгүй.</p>
  }

  const uniqueClasses = [...new Map(classes.map((entry) => [entry.id, entry])).values()]
  const chosenClass = selectedClass ?? linked.classId
  const classId = Number(uniqueClasses.find((entry) => String(entry.id) === chosenClass)?.id ?? uniqueClasses[0]!.id)
  const subjects = classes.filter((entry) => Number(entry.id) === classId && entry.subjectId != null)
  const chosenSubject = selectedSubject ?? linked.subjectId
  const subjectId = subjects.find((entry) => String(entry.subjectId) === chosenSubject)?.subjectId ?? subjects[0]?.subjectId ?? null
  const selectionKey = classId + ':' + subjectId + ':' + day

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Шалгалт</h1>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-2">
          <label htmlFor="results-class" className="block text-sm font-medium">Анги</label>
          <select id="results-class" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring" value={String(classId)} onChange={(event) => {
            setSelectedClass(event.target.value)
            setSelectedSubject(null)
          }}>
            {uniqueClasses.map((klass) => <option key={klass.id} value={String(klass.id)}>{klass.name}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <label htmlFor="results-subject" className="block text-sm font-medium">Хичээл</label>
          <select id="results-subject" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring" value={subjectId === null ? 'all' : String(subjectId)} onChange={(event) => setSelectedSubject(event.target.value)}>
            {subjects.length ? subjects.map((subject) => <option key={subject.subjectId} value={String(subject.subjectId)}>{subject.subject}</option>) : <option value="all">Бүх хичээл</option>}
          </select>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">Өдөр</p>
          <DatePicker value={day} onChange={setDay} />
        </div>
        <div className="space-y-2">
          <label htmlFor="results-kind" className="block text-sm font-medium">Төрөл</label>
          <select id="results-kind" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring" value={kind} onChange={(event) => setKind(event.target.value)}>
            <option value="all">Бүх төрөл</option>
            {Object.entries(KIND_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
      </div>

      <Attempts key={selectionKey} classId={classId} subjectId={subjectId} range={{ from: day, to: day }} today={today} kind={kind} />

    </div>
  )
}
