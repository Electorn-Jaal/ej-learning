import { useState } from 'react'
import {
  useGetMyChildren,
  useGetChildDay,
  useGetChildRecord,
  type GuardianChild,
} from '@workspace/api-client-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { NATIVE_SELECT } from '@/components/ui/native-select'
import { schoolToday } from '@/lib/schedule-window'
import { cn } from '@/lib/utils'

const DAY = new Intl.DateTimeFormat('mn-MN', {
  month: 'numeric',
  day: 'numeric',
  weekday: 'short',
  timeZone: 'Asia/Ulaanbaatar',
})
const readable = (iso: string) => DAY.format(new Date(iso + 'T00:00:00Z'))

const ATTENDANCE: Record<string, string> = {
  PRESENT: 'Ирсэн',
  LATE: 'Хоцорсон',
  ABSENT: 'Ирээгүй',
  EXCUSED: 'Чөлөөтэй',
}
const NOTEBOOK: Record<string, string> = {
  DONE: 'хийсэн',
  PARTIAL: 'дутуу',
  NOT_DONE: 'хийгээгүй',
}
const PARTICIPATION: Record<string, string> = {
  HIGH: 'маш сайн',
  GOOD: 'сайн',
  WATCH: 'анхаарах',
}

/** What the child is doing today, read from the child's own day. */
function Today({ studentId }: { studentId: number }) {
  const [date, setDate] = useState(schoolToday)
  const { data, isLoading, error, refetch } = useGetChildDay({ studentId, on: date })

  if (isLoading) return <Skeleton className="h-64 w-full" />
  if (!data || error) return <div role="alert" className="space-y-2 text-sm"><p>Хүүхдийн өдрийн мэдээллийг уншиж чадсангүй.</p><button className="underline" onClick={() => void refetch()}>Дахин оролдох</button></div>

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm" variant="outline"
          onClick={() => setDate(shift(date, -1))}
        >
          Өмнөх
        </Button>
        <span className="text-sm font-medium">{data.dateLabel}</span>
        <Button
          size="sm" variant="outline"
          disabled={date >= schoolToday()}
          onClick={() => setDate(shift(date, 1))}
        >
          Дараах
        </Button>
      </div>

      {data.slots.length === 0 ? (
        <p className="rounded-[2px] border border-border bg-card p-6 text-sm text-muted-foreground">
          Энэ өдөр хичээл алга.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-[2px] border border-border bg-card">
          {data.slots.map((slot, index) => (
            <li key={index} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2">
              <span className="w-12 shrink-0 text-xs tabular-nums text-muted-foreground">
                {slot.startsAt ?? '—'}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{slot.subjectName}</span>
                {slot.held === false ? (
                  <span className="block text-xs text-muted-foreground">
                    Хичээл болоогүй{slot.notHeldReason ? ' — ' + slot.notHeldReason : ''}
                  </span>
                ) : slot.lesson ? (
                  <span className="block text-xs text-muted-foreground">
                    {slot.isContinuation ? 'Үргэлжлэл · ' : ''}{slot.lesson.skillName}
                  </span>
                ) : null}
                {/* The teacher's own line for the day, which is the thing a
                    parent can actually act on at the kitchen table. */}
                {slot.lesson?.teacherNote ? (
                  <span className="block text-xs">{slot.lesson.teacherNote}</span>
                ) : null}
                {slot.notebook ? (
                  <span className="block text-[11px] text-muted-foreground">
                    Дэвтэр: {NOTEBOOK[slot.notebook.state] ?? slot.notebook.state}
                    {slot.notebook.comment ? ' — ' + slot.notebook.comment : ''}
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function shift(iso: string, days: number) {
  const date = new Date(iso + 'T00:00:00Z')
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/**
 * The fortnight behind.
 *
 * Attendance first, because it is the question a parent came to ask, and
 * because a register that says nothing about a day says nothing - an empty
 * row is not an absence.
 */
function Record({ studentId }: { studentId: number }) {
  const { data, isLoading, error, refetch } = useGetChildRecord({ studentId })
  if (isLoading) return <Skeleton className="h-64 w-full" />
  if (!data || error) return <div role="alert" className="space-y-2 text-sm"><p>Сүүлийн хоёр долоо хоногийн мэдээллийг уншиж чадсангүй.</p><button className="underline" onClick={() => void refetch()}>Дахин оролдох</button></div>

  return (
    <div className="space-y-4">
      <section className="space-y-1">
        <h2 className="text-sm font-semibold">Ирц</h2>
        {data.attendance.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Сүүлийн хоёр долоо хоногт бүртгэсэн ирц алга.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-[2px] border border-border bg-card">
            {data.attendance.map((row, index) => (
              <li key={index} className="flex flex-wrap items-baseline gap-x-2 px-4 py-1.5 text-xs">
                <span className="w-24 shrink-0 tabular-nums text-muted-foreground">
                  {readable(row.onDate)}
                  {row.periodNo ? ' · ' + row.periodNo + '-р' : ''}
                </span>
                <span className="w-24 shrink-0 text-muted-foreground">{row.subjectName ?? 'Өдрөөр'}</span>
                <span className={cn('font-medium', row.state === 'ABSENT' && 'text-destructive')}>
                  {ATTENDANCE[row.state] ?? row.state}
                </span>
                {row.participation ? (
                  <span className="text-muted-foreground">
                    · оролцоо {PARTICIPATION[row.participation] ?? row.participation}
                  </span>
                ) : null}
                {row.note ? <span className="text-muted-foreground">· {row.note}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-1">
        <h2 className="text-sm font-semibold">Дэвтрийн ажил</h2>
        {data.notebook.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Сүүлийн хоёр долоо хоногт шалгасан дэвтэр алга.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-[2px] border border-border bg-card">
            {data.notebook.map((row, index) => (
              <li key={index} className="flex flex-wrap items-baseline gap-x-2 px-4 py-1.5 text-xs">
                <span className="w-24 shrink-0 tabular-nums text-muted-foreground">
                  {readable(row.onDate)}
                </span>
                <span className="w-24 shrink-0 text-muted-foreground">{row.subjectName ?? ''}</span>
                <span className="font-medium">{NOTEBOOK[row.state] ?? row.state}</span>
                {row.comment ? <span className="text-muted-foreground">· {row.comment}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-1">
        <h2 className="text-sm font-semibold">Шалгалтын дүн</h2>
        {data.exams.length === 0 ? (
          <p className="text-xs text-muted-foreground">Өгсөн шалгалт алга.</p>
        ) : (
          <ul className="divide-y divide-border rounded-[2px] border border-border bg-card">
            {data.exams.map((row) => (
              <li key={row.sittingId} className="flex flex-wrap items-baseline gap-x-2 px-4 py-1.5 text-xs">
                <span className="min-w-0 flex-1 truncate">
                  {row.title}
                  <span className="ml-2 text-muted-foreground">{row.subjectName}</span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums">
                  {row.score}/{row.maxScore}
                </span>
              </li>
            ))}
          </ul>
        )}
        {/* Said once, plainly, so nobody goes looking for a page that does not
            exist: the questions are the child's to see, not the parent's. */}
        <p className="text-[11px] text-muted-foreground">
          Шалгалтын асуулт, зөв хариултыг хүүхэд өөрийн хуудаснаас харна.
        </p>
      </section>

      <section className="space-y-1">
        <h2 className="text-sm font-semibold">Багш нар</h2>
        <ul className="divide-y divide-border rounded-[2px] border border-border bg-card">
          {data.teachers.map((row, index) => (
            <li key={index} className="flex flex-wrap items-baseline gap-x-2 px-4 py-1.5 text-xs">
              <span className="w-28 shrink-0 text-muted-foreground">
                {row.isClassTeacher ? 'Ангийн багш' : row.subjectName}
              </span>
              <span>{row.teacherName}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

/**
 * A parent's page.
 *
 * One child goes straight through; several get a switcher, and the switcher
 * stays on screen so it is always clear whose day is being read. A parent of
 * three who has to remember which tab they are on will eventually tell the
 * wrong child off.
 */
export default function GuardianChild() {
  const { data: children, isLoading, error, refetch } = useGetMyChildren()
  const [chosen, setChosen] = useState<number | null>(null)
  const [view, setView] = useState<'day' | 'record'>('day')

  if (isLoading) return <Skeleton className="h-64 w-full" />
  // A failed request is not "no child linked": that message sends a parent to
  // the school office over what may only be a dropped connection.
  if (error) return <div role="alert" className="space-y-2 text-sm"><p>Хүүхдийн мэдээллийг уншиж чадсангүй.</p><button className="underline" onClick={() => void refetch()}>Дахин оролдох</button></div>
  if (!children?.length) {
    return (
      <p className="rounded-[2px] border border-border bg-card p-6 text-sm text-muted-foreground">
        Таны бүртгэлд хүүхэд холбогдоогүй байна. Сургуулийн админд хандана уу.
      </p>
    )
  }

  const child: GuardianChild =
    children.find((row) => row.studentId === chosen) ?? children[0]!

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {children.length > 1 ? (
          <select
            className={cn(NATIVE_SELECT, 'w-auto')}
            aria-label="Хүүхэд"
            value={String(child.studentId)}
            onChange={(event) => setChosen(Number(event.target.value))}
          >
            {children.map((row) => (
              <option key={row.studentId} value={String(row.studentId)}>
                {row.displayName}{row.className ? ' · ' + row.className : ''}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-sm font-semibold">
            {child.displayName}
            {child.className ? (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {child.className}
              </span>
            ) : null}
          </span>
        )}

        <div className="ml-auto flex items-stretch [&>*+*]:border-l [&>*+*]:border-border">
          <Button
            type="button" size="sm" variant={view === 'day' ? 'default' : 'outline'}
            aria-pressed={view === 'day'} onClick={() => setView('day')}
          >
            Өнөөдөр
          </Button>
          <Button
            type="button" size="sm" variant={view === 'record' ? 'default' : 'outline'}
            aria-pressed={view === 'record'} onClick={() => setView('record')}
          >
            Сүүлийн 2 долоо хоног
          </Button>
        </div>
      </div>

      {view === 'day'
        ? <Today key={child.studentId} studentId={child.studentId} />
        : <Record key={child.studentId} studentId={child.studentId} />}
    </div>
  )
}
