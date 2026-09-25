import { Link } from 'wouter'
import {
  useGetStudentPlacements,
  useGetStudentStudyPlan,
  useGetStudentToday,
  type DailyLessonView,
  type SubjectDay,
} from '@workspace/api-client-react'
import { studentSlotLink } from '@/lib/student-slot'
import { Clock } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { InfoBox } from '@/components/InfoBox'
import { ROW_ACTION, ROW_ACTION_GROUP } from '@/components/ui/row-action'
import { cn } from '@/lib/utils'


/** One of the small buttons a subject offers. */
function Choice({ day, view, children }: { day: SubjectDay; view: string; children: string }) {
  return (
    <Link
      href={studentSlotLink(day, view)}
      className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), ROW_ACTION)}
    >
      {children}
    </Link>
  )
}

/** Anything a child can actually open: content, personal work, questions. */
const hasWork = (slot: SubjectDay) => Boolean(slot.lesson || slot.extra)

const NOTEBOOK: Record<string, string> = {
  DONE: 'хийсэн',
  PARTIAL: 'дутуу',
  NOT_DONE: 'хийгээгүй',
}

/**
 * One period of the day.
 *
 * A period can hold more than one lesson - half of 6a is in design while the
 * other half is in IT, and the middle years choose between physical education
 * and jiu-jitsu - so a row is a time, not a subject, and parallel options sit
 * on it side by side. Rendering them as separate rows made the same Wednesday
 * afternoon appear six times.
 */
type Period = { periodNo: number | null; startsAt: string | null; endsAt: string | null; slots: SubjectDay[] }

function byPeriod(slots: SubjectDay[]): Period[] {
  const periods: Period[] = []
  for (const slot of slots) {
    const found = slot.periodNo === null
      ? undefined
      : periods.find((row) => row.periodNo === slot.periodNo)
    if (found) found.slots.push(slot)
    else periods.push({
      periodNo: slot.periodNo,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      slots: [slot],
    })
  }
  return periods
}

/**
 * One period of the day, and what the child can open on it.
 *
 * A row is a TIME, not a subject. A period can hold more than one lesson -
 * half of 6a is in design while the other half is in IT, and the middle years
 * choose between physical education and jiu-jitsu - and drawing each as its
 * own row made one Wednesday afternoon of PE appear six times. They share a
 * line now, and the label says a choice is involved.
 *
 * A button appears only where there is something behind it. Most periods have
 * no written lesson, so most rows offer the personal plan and nothing else;
 * printing four buttons on every row led to four empty pages.
 */
function PeriodRow({ period, hasPlan }: { period: Period; hasPlan: (code: string) => boolean }) {
  // Where a period splits, the work is whichever half has any. Neither half
  // has any today, so this is the first subject - and pointing at a plan that
  // is empty for both is harmless in a way that guessing the child's group
  // would not be.
  const day = period.slots.find(hasWork) ?? period.slots[0]!
  const personalOnly = !day.lesson && Boolean(day.extra)
  const lessons = [day.lesson, day.extra?.lesson].filter(Boolean) as DailyLessonView[]
  const minutes = lessons.reduce((total, lesson) => total + (lesson.estimatedMinutes ?? 0), 0)
  // The topic, and nothing in its place. The teacher belongs on the weekly
  // timetable, where a child is working out where to go; on the day they are
  // working out what to do, and a name standing where the topic should be
  // reads as though that were the work.
  const topic = day.lesson?.skillName ?? day.extra?.lesson.skillName ?? null

  return (
    <li className="flex flex-wrap items-stretch gap-x-3 gap-y-2 pl-3">
      <div className="flex w-12 shrink-0 flex-col justify-center py-2.5 text-xs tabular-nums text-muted-foreground">
        {period.startsAt ?? '—'}
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-center py-2.5">
        <p className="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold">
          {period.slots.map((slot) => slot.subjectName).join(' / ')}
          {period.slots.length > 1 ? null : day.groupLabel ? (
            <span className="text-[10px] font-normal uppercase tracking-wide text-muted-foreground">
              {day.groupLabel}
            </span>
          ) : null}
        </p>
        {day.held === false ? (
          // Said plainly, with the reason. A child whose period simply went
          // blank would think the system had lost it; the one thing they - and
          // whoever asks them about it at home - need is that it did not
          // happen, and why.
          <p className="text-xs text-muted-foreground">
            Хичээл болоогүй{day.notHeldReason ? ' — ' + day.notHeldReason : ''}
          </p>
        ) : topic ? (
          <p className="truncate text-xs text-muted-foreground">
            {day.isContinuation ? 'Үргэлжлэл · ' : ''}{topic}
          </p>
        ) : null}
        {day.selectionPending ? (
          <p className="text-[11px] text-muted-foreground">Бүлгийн хуваарилалт тодруулаагүй</p>
        ) : null}
        {/* Only when a teacher actually looked. A period nobody marked says
            nothing here, because silence is what it is - not a verdict. */}
        {/* A club is not a lesson and should not read like one: no topic, no
            check, just what it is and who runs it. */}
        {day.club ? (
          <p className="text-xs text-muted-foreground">
            Дугуйлан: {day.club.nameMn}
            {day.club.teacherName ? ' · ' + day.club.teacherName : ''}
          </p>
        ) : null}
        {day.notebook ? (
          <p className="text-[11px] text-muted-foreground">
            Дэвтэр: {NOTEBOOK[day.notebook.state] ?? day.notebook.state}
            {day.notebook.comment ? ' — ' + day.notebook.comment : ''}
          </p>
        ) : null}
      </div>

      {day.extra && !personalOnly ? (
        <span className="flex shrink-0 items-center gap-1.5 self-center text-xs text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-pending" />
          Нэмэлттэй
        </span>
      ) : null}

      {minutes > 0 ? (
        <span className="flex shrink-0 items-center gap-1 self-center text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          {minutes} мин
        </span>
      ) : null}

      {/* A button only where something is behind it. Бие даалт used to be
          printed on every row, and on most of them it opened a page saying
          the child had been given nothing - eleven subjects, eleven empty
          pages. It appears now only for a subject this child actually has a
          plan or a placement in. */}
      <div className={ROW_ACTION_GROUP}>
        {day.lesson ? <Choice day={day} view="lesson">Хичээл</Choice> : null}
        {day.extra ? <Choice day={day} view="personal">Нэмэлт бэлтгэл</Choice> : null}
        {hasPlan(day.subjectCode) ? (
          <Link
            href={`/subjects/${encodeURIComponent(day.subjectCode)}/plan`}
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), ROW_ACTION)}
          >
            Бие даалт
          </Link>
        ) : null}
        {day.lesson || day.extra ? <Choice day={day} view="quiz">Шалгалт</Choice> : null}
      </div>
    </li>
  )
}

/**
 * The child's day, in bell order.
 *
 * One list and no headings: the page is short enough that naming its parts
 * costs more height than it saves confusion. What each row offers is what
 * that period actually has, so a subject earns its buttons rather than being
 * listed in a fixed set of four.
 */
export default function StudentToday() {
  const { data, isLoading, isError } = useGetStudentToday()
  // What the child has of their own, by subject. Both are small lists the
  // subject pages already ask for, so react-query serves this from the same
  // answers rather than fetching anything extra.
  const { data: plan } = useGetStudentStudyPlan()
  const { data: placements } = useGetStudentPlacements()
  const planned = new Set([
    ...(plan ?? []).map((week) => week.subjectCode),
    ...(placements ?? []).map((row) => row.subjectCode),
  ])

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

  const periods = byPeriod(data.slots)

  // The day on the left, the school's notice beside it. On a phone the box
  // drops under the day, where a notice nobody has written yet costs nothing.
  return (
    <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_15rem]">
      {data.slots.length === 0 ? (
        // Plain text, not a card. A card frames something; an empty day has
        // nothing to frame, and boxing the sentence makes the absence look
        // like a broken component.
        <p className="py-6 text-sm text-muted-foreground">{data.notice}</p>
      ) : (
        <ul className="divide-y overflow-hidden rounded-[2px] border border-border bg-card">
          {periods.map((period, index) => (
            <PeriodRow
              key={`${period.periodNo ?? 'x'}:${index}`}
              period={period}
              hasPlan={(code) => planned.has(code)}
            />
          ))}
        </ul>
      )}
      <InfoBox className={data.className} />
    </div>
  )
}
