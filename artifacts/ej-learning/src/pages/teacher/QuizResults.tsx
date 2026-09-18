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
import { Calendar as CalendarIcon, Check, ChevronDown, ChevronUp, X } from 'lucide-react'
import type { DateRange } from 'react-day-picker'
import { ClassSkills } from '@/components/teacher/ClassSkills'
import { ItemAnalysis } from '@/components/teacher/ItemAnalysis'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
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

const SHORT_DAY = new Intl.DateTimeFormat('mn-MN', {
  month: 'numeric',
  day: 'numeric',
  timeZone: 'UTC',
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

const fromIsoDay = (day: string) => new Date(`${day}T00:00:00`)

const shiftDays = (day: string, by: number) => {
  const date = fromIsoDay(day)
  date.setDate(date.getDate() + by)
  return isoDay(date)
}

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

const PRESETS: { label: string; of: (today: string) => Range }[] = [
  { label: 'Өнөөдөр', of: (today) => ({ from: today, to: today }) },
  { label: '7 хоног', of: (today) => ({ from: shiftDays(today, -6), to: today }) },
  { label: '30 хоног', of: (today) => ({ from: shiftDays(today, -29), to: today }) },
  { label: 'Бүгд', of: () => ({ from: null, to: null }) },
]

const sameRange = (a: Range, b: Range) => a.from === b.from && a.to === b.to

/**
 * Which stretch of days the screen is looking at.
 *
 * The four buttons come first because they are what a teacher actually wants:
 * today's lesson, this week, this month. The calendar is for the case they do
 * not cover - a parents' evening about last term - and stays folded away until
 * it is asked for, rather than taking up the top of the page every day.
 */
function RangePicker({
  today,
  value,
  onChange,
}: {
  today: string
  value: Range
  onChange: (range: Range) => void
}) {
  const [open, setOpen] = useState(false)
  const custom = !PRESETS.some((preset) => sameRange(preset.of(today), value))

  const selected: DateRange | undefined =
    value.from === null
      ? undefined
      : { from: fromIsoDay(value.from), to: value.to ? fromIsoDay(value.to) : undefined }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {PRESETS.map((preset) => {
        const range = preset.of(today)
        return (
          <Button
            key={preset.label}
            size="sm"
            variant={sameRange(range, value) ? 'default' : 'outline'}
            onClick={() => onChange(range)}
          >
            {preset.label}
          </Button>
        )
      })}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button size="sm" variant={custom ? 'default' : 'outline'}>
            <CalendarIcon className="h-4 w-4" />
            {custom && value.from
              ? `${value.from} — ${value.to ?? '…'}`
              : 'Хугацаа сонгох'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="range"
            selected={selected}
            defaultMonth={value.from ? fromIsoDay(value.from) : undefined}
            onSelect={(next) => {
              if (!next?.from) return
              const from = isoDay(next.from)
              const to = next.to ? isoDay(next.to) : from
              onChange({ from, to })
              // Folded away once both ends are in: leaving it open over the
              // results the teacher just asked for hides the answer.
              if (next.to) setOpen(false)
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}

/**
 * How the class did each day of the range, as columns.
 *
 * Deliberately CSS rather than a charting library: these are a dozen numbers
 * between nought and a hundred, and pulling in recharts for them would cost
 * more to download than every other screen in the app put together.
 *
 * Days with no work are drawn empty rather than skipped. A quiet week that
 * looks like a busy one is the kind of picture that gets acted on wrongly.
 */
function DailyTrend({
  days,
  today,
}: {
  days: { day: string; share: number; count: number }[]
  today: string
}) {
  if (days.length < 2) return null

  return (
    <div>
      <p className="mb-2 text-sm font-medium">Өдрийн дундаж</p>
      <ol className="flex items-end gap-1 overflow-x-auto pb-1">
        {days.map((entry) => (
          <li
            key={entry.day}
            className="flex min-w-0 flex-1 basis-6 flex-col items-center gap-1"
            title={
              entry.count === 0
                ? `${entry.day}: хариулт алга`
                : `${entry.day}: ${entry.count} хариулт, ${entry.share}%`
            }
          >
            <span className="text-[10px] tabular-nums text-muted-foreground">
              {entry.count === 0 ? '' : entry.share}
            </span>
            <span className="flex h-20 w-full items-end rounded-sm bg-secondary/60">
              <span
                className={cn('w-full rounded-sm', entry.count === 0 ? '' : band(entry.share))}
                style={{ height: `${entry.count === 0 ? 0 : Math.max(entry.share, 3)}%` }}
              />
            </span>
            <span
              className={cn(
                'text-[10px] whitespace-nowrap text-muted-foreground',
                entry.day === today && 'font-semibold text-foreground',
              )}
            >
              {SHORT_DAY.format(fromIsoDay(entry.day))}
            </span>
          </li>
        ))}
      </ol>
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
function Attempts({
  classId,
  subjectId,
  range,
  today,
}: {
  classId: number
  subjectId: number | null
  range: Range
  today: string
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
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          {range.from === null
            ? `${data.className} ангид хараахан хариулсан сурагч алга.`
            : 'Энэ хугацаанд хариулт алга. Өөр хугацаа сонгож үзнэ үү.'}
        </CardContent>
      </Card>
    )
  }

  const byDay = new Map<string, TeacherQuizAttemptRow[]>()
  for (const attempt of data.attempts) {
    const day = dayOf(attempt.submittedAt)
    byDay.set(day, [...(byDay.get(day) ?? []), attempt])
  }
  const days = [...byDay.entries()].sort(([a], [b]) => b.localeCompare(a))

  // The trend runs over the range that was asked for, so a day nobody answered
  // on is a gap in the line rather than missing from it. With no range asked
  // for there is nothing to fill between, so only the days that exist are
  // drawn. Capped at a month: past that the columns are too thin to read.
  const trendDays: string[] = []
  if (range.from && range.to) {
    for (let day = range.from; day <= range.to; day = shiftDays(day, 1)) trendDays.push(day)
  } else {
    trendDays.push(...[...byDay.keys()].sort())
  }
  const trend = (trendDays.length > 31 ? trendDays.slice(-31) : trendDays).map((day) => {
    const rows = byDay.get(day) ?? []
    return { day, share: percent(rows), count: rows.length }
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{data.className} — шалгах асуултын үр дүн</CardTitle>
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
          <DailyTrend days={trend} today={today} />
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
      </CardContent>
    </Card>
  )
}

export default function TeacherQuizResults() {
  const { data: classes, isLoading } = useGetTeacherClasses()
  const [selected, setSelected] = useState<string | null>(null)
  const today = dayOf(new Date().toISOString())
  // A month back by default: enough for a trend to have a shape, short enough
  // that the figures are about the class as it is now.
  const [range, setRange] = useState<Range>({ from: shiftDays(today, -29), to: today })

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

      <div className="flex flex-wrap items-center gap-3">
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

        <RangePicker today={today} value={range} onChange={setRange} />
      </div>

      <ItemAnalysis classId={classId} />
      <ClassSkills classId={classId} subjectId={subjectId} />
      <Attempts classId={classId} subjectId={subjectId} range={range} today={today} />
    </div>
  )
}
