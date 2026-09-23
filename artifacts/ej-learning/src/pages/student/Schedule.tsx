import { useState } from 'react'
import {
  useGetSchoolPeriods,
  useStudentScheduleDays,
  type SchoolPeriod,
  type StudentToday,
  type SubjectDay,
} from '@workspace/api-client-react'
import { DayNavigation } from '@/components/DayNavigation'
import { Card, CardContent } from '@/components/ui/card'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'
import { dayName, isWeekend, schoolToday, scheduleWindow } from '@/lib/schedule-window'
import { cn } from '@/lib/utils'

const DAY = new Intl.DateTimeFormat('mn-MN', { month: 'short', day: 'numeric', timeZone: 'UTC' })

/** The clock down the side, then one equal column per school day. */
const columnsFor = (dates: string[]) =>
  `3.75rem repeat(${dates.length}, minmax(0, 1fr))`

/** What a cell shows, and what opening it asks about. */
type Slot = {
  subjectCode: string
  subjectName: string
  teacher: string | null
  topic: string | null
  personal: boolean
  groupLabel: string | null
  book: NonNullable<SubjectDay["lesson"]>["book"]
  selectionPending: boolean
}

/**
 * A cell from a timetable slot.
 *
 * A period with no prepared lesson is still a period. This used to return
 * nothing without lesson content, which was fine while the only timetable was
 * seeded demonstration data and wrong the moment a real one arrived: the whole
 * grid would have drawn empty. The subject and the teacher are what the school
 * published; the topic appears when somebody writes it.
 */
function slotOf(entry: SubjectDay | undefined): Slot | null {
  if (!entry) return null
  const lesson = entry.lesson ?? entry.extra?.lesson ?? null
  return {
    subjectCode: entry.subjectCode,
    subjectName: entry.subjectName,
    // The two are kept apart rather than one falling back to the other. The
    // grid carries the teacher, the card carries the topic, and a cell that
    // printed whichever it had left a child unable to tell which they were
    // reading.
    teacher: entry.teacherName ?? null,
    topic: lesson?.skillName ?? null,
    personal: !entry.lesson && Boolean(entry.extra),
    groupLabel: entry.groupLabel ?? null,
    book: lesson?.book ?? null,
    selectionPending: entry.selectionPending ?? false,
  }
}

/**
 * Anything the timetable cannot place: a lesson whose row carries no period,
 * and every piece of personal work, which answers to no bell. Dropping these
 * would make the page quietly incomplete.
 */
function unplaced(days: { data?: StudentToday }[]) {
  return days.map((day) =>
    (day.data?.slots ?? [])
      .filter((entry) => entry.periodNo === null && (entry.lesson || entry.extra))
      .map(slotOf)
      .filter((slot): slot is Slot => slot !== null),
  )
}

/**
 * One lesson in the grid, and the card that opens beside it.
 *
 * The cell can only ever show a clipped title - the columns are narrow and
 * every row has to keep its height - so the whole point of tapping one is to
 * read the name in full. It opens next to the lesson rather than at the foot
 * of the page: the child is looking at Wednesday's second period, and an
 * answer that appears below eight rows of timetable is an answer somewhere
 * else.
 *
 * The popover mounts its contents only while open, so the fetch inside it
 * does not happen until a lesson is actually tapped.
 */
function SlotCell({ slot }: { slot: Slot }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            // No radius and no cell padding: the subject's colour is a rule
            // down the edge of its slot, and a rounded, inset bar reads as a
            // chip floating in the cell rather than as the slot being marked.
            // h-full only while a cell holds one lesson; a split cell stacks
            // two and each has to give the other room.
            'flex w-full min-w-0 flex-1 flex-col justify-center gap-0.5 overflow-hidden',
            'border-l-[3px] px-2 py-1 text-left transition-colors',
            // The pale amber, and only three quarters of it. The menu
            // uses the full strength; a grid of forty cells cannot.
            'hover:bg-sidebar-active/70 data-[state=open]:bg-sidebar-active',
            slot.personal ? 'border-pending' : 'border-primary',
          )}
        >
          <span className="flex min-w-0 items-baseline gap-1">
            <span className="min-w-0 truncate text-[13px] font-semibold leading-snug">
              {slot.subjectName}
            </span>
            {/* Which half of a split class, in the school's own words. */}
            {slot.groupLabel ? (
              <span className="shrink-0 text-[9px] uppercase tracking-wide text-muted-foreground">
                {slot.groupLabel}
              </span>
            ) : null}
          </span>
          {slot.teacher ? (
            <span className="block truncate text-[11px] leading-tight text-muted-foreground">
              {slot.teacher}
            </span>
          ) : null}
          {slot.personal ? (
            <span className="block text-[11px] leading-tight text-pending">Хувийн ажил</span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" side="right" className="w-72 rounded-sm p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {slot.subjectName}
        </p>
        {/* The whole reason the card exists. The grid has room for the
            subject and the teacher and no more, so the topic - the one thing
            that changes from week to week - waits here until it is asked
            for. */}
        <p className="mt-1 text-sm font-semibold leading-snug">
          {slot.topic ?? 'Сэдэв заагаагүй'}
        </p>
        {slot.groupLabel ? <p className="mt-1 text-xs">{slot.groupLabel}</p> : null}
        {slot.selectionPending ? <p className="mt-1 text-xs text-muted-foreground">Бүлгийн хуваарилалт тодруулаагүй</p> : null}
        {slot.personal ? (
          <p className="mt-1 text-xs text-pending">Зөвхөн танд өгсөн хувийн ажил</p>
        ) : null}
        <SlotPages slot={slot} />
      </PopoverContent>
    </Popover>
  )
}

/**
 * The pages this section occupies, looked up from the book.
 *
 * Only the title reaches the grid, so the page numbers have to be fetched -
 * and a child holding a textbook wants them more than anything else on the
 * card.
 */
function SlotPages({ slot }: { slot: Slot }) {
  const book = slot.book
  if (!book || book.pageFrom === null) return null
  const base = import.meta.env.BASE_URL.replace(/\/$/, '')
  const text = `${book.title ?? ''} · ${book.pageFrom}${book.pageTo !== null && book.pageTo !== book.pageFrom ? `–${book.pageTo}` : ''}-р хуудас`
  return book.fileUrl ? (
    <a className="mt-2 block text-xs text-primary underline" target="_blank" rel="noreferrer"
      href={`${base}${book.fileUrl}${book.filePage !== null ? `#page=${book.filePage}` : ''}`}>{text}</a>
  ) : <p className="mt-2 text-xs text-muted-foreground">{text}</p>
}

/**
 * The week's timetable: the clock down the side, the days across the top.
 *
 * One view, no pickers. A timetable is a week - that is the unit it is kept
 * in and the unit a child thinks in - and the arrows below move a week at a
 * time. Choosing a subject used to be a dropdown; it is now what tapping a
 * lesson does, which is the same choice made where the child is already
 * looking.
 */
export default function StudentSchedule() {
  const [day, setDay] = useState(schoolToday)
  const window = scheduleWindow(day)
  // Saturday and Sunday are off the child's timetable. They held a lesson
  // only where somebody scheduled a makeup one, which is the teacher's
  // business; the two columns were empty every other week and took width the
  // five real days needed. The arrows below still move a whole week.
  const dates = window.dates.filter((date) => !isWeekend(date))

  const periodsQuery = useGetSchoolPeriods()
  const days = useStudentScheduleDays(dates)

  const loading = periodsQuery.isLoading || days.some((result) => result.isLoading)
  const failed = periodsQuery.isError || days.some((result) => result.isError)
  if (loading) return <Skeleton className="h-[34rem] w-full" />
  if (failed) return <p role="alert" className="text-sm text-destructive">Хуваарийг уншиж чадсангүй.</p>

  const periods = periodsQuery.data ?? []
  const leftovers = unplaced(days)
  const className = days[0]?.data?.className ?? ''

  // Every lesson in the period, not the first. A split class has two, and
  // showing one told half the class the wrong room.
  const cellsFor = (dayIndex: number, periodNo: number) =>
    (days[dayIndex]?.data?.slots ?? [])
      .filter((entry) => entry.periodNo === periodNo)
      .map(slotOf)
      .filter((slot): slot is Slot => slot !== null)

  // A period nobody in the school has a lesson in still needs its row - the
  // bell rings - but it does not need a lesson's worth of height.
  const emptyPeriods = new Set(
    periods
      .filter((period: SchoolPeriod) =>
        dates.every((_, index) => cellsFor(index, period.periodNo).length === 0))
      .map((period: SchoolPeriod) => period.periodNo),
  )

  return (
    <div className="space-y-1">
      {/* The shell's bar names the page. What is left is the class and one
          line saying what tapping a lesson does. */}
      <header className="flex flex-wrap items-baseline gap-x-2 text-[11px] text-muted-foreground">
        {className ? <span className="font-medium text-foreground">{className}</span> : null}
        <span>· Хичээл дээр дарвал сэдвийн бүтэн нэр харагдана</span>
      </header>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {periods.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              Хонхны цаг бүртгэгдээгүй тул цагийн хуваарь зурах боломжгүй байна.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <div
                className="grid min-w-[46rem] gap-px bg-border"
                style={{ gridTemplateColumns: columnsFor(dates) }}
                role="table"
                aria-label="Долоо хоногийн хуваарь"
              >
                <div className="bg-card" />
                {/* Today is the deep blue, not the pale amber it was. Amber
                    is what this product marks the thing under the cursor
                    with, so today wore the hover colour and read as nothing
                    at all. Blue is used nowhere else in the grid, so the
                    column is unmistakable, and the white on it reads 9.9:1. */}
                {dates.map((date) => {
                  const today = date === schoolToday()
                  return (
                    <div
                      key={date}
                      className={cn(
                        'bg-card px-1 py-1 text-center leading-tight',
                        today && 'bg-primary text-primary-foreground',
                      )}
                      title={today ? 'Өнөөдөр' : undefined}
                    >
                      <p className="truncate text-xs font-semibold">
                        <span
                          className={cn(
                            'uppercase tracking-wide',
                            today ? 'text-primary-foreground/80' : 'text-muted-foreground',
                          )}
                        >
                          {dayName(date)}
                        </span>
                        {' · '}
                        {DAY.format(new Date(date + 'T00:00:00Z'))}
                      </p>
                    </div>
                  )
                })}

                {periods.flatMap((period: SchoolPeriod) => [
                  <div
                    key={`t:${period.periodNo}`}
                    className="flex flex-col items-center justify-center bg-card px-1 py-1 leading-tight"
                  >
                    <span className="text-[13px] font-semibold tabular-nums">{period.startsAt}</span>
                    <span className="text-[10px] tabular-nums text-muted-foreground">{period.endsAt}</span>
                  </div>,
                  ...dates.map((date, index) => {
                    const slots = cellsFor(index, period.periodNo)
                    const today = date === schoolToday()
                    return (
                      <div
                        key={`${period.periodNo}:${date}`}
                        className={cn(
                          'flex flex-col bg-card',
                          // An empty row across the whole week collapses to a
                          // rule with a time on it, which is what an empty
                          // period is. Giving it a lesson's height was what
                          // pushed the week off the screen.
                          emptyPeriods.has(period.periodNo) ? 'min-h-[1.5rem]' : 'min-h-[3.5rem]',
                          // The faintest wash of the header's blue, so the
                          // column reads as one and the amber hover still
                          // shows through it.
                          today && 'bg-primary/[0.06]',
                        )}
                      >
                        {slots.length ? (
                          slots.map((slot, n) => (
                            <SlotCell key={`${slot.subjectCode}:${n}`} slot={slot} />
                          ))
                        ) : (
                          <span className="flex h-full items-center px-2 text-xs text-muted-foreground/40">
                            {emptyPeriods.has(period.periodNo) ? '' : '—'}
                          </span>
                        )}
                      </div>
                    )
                  }),
                ])}
              </div>
            </div>
          )}

          {leftovers.some((list) => list.length > 0) ? (
            <div className="border-t p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Цаг заагаагүй
              </p>
              <div className="mt-2 space-y-3">
                {dates.map((date, index) =>
                  leftovers[index]?.length ? (
                    <div key={date}>
                      <p className="mb-1 text-xs text-muted-foreground">
                        {DAY.format(new Date(date + 'T00:00:00Z'))}
                      </p>
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {leftovers[index]!.map((slot, slotIndex) => (
                          <div key={`${date}:${slotIndex}`} className="rounded-[2px] border p-1">
                            <SlotCell slot={slot} />
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null,
                )}
              </div>
            </div>
          ) : null}

          <DayNavigation day={day} onChange={setDay} pageSize={window.count} from={window.from} to={window.to} />
        </CardContent>
      </Card>
    </div>
  )
}
