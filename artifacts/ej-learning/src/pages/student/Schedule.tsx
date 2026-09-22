import { useState } from 'react'
import {
  useGetSchoolPeriods,
  useGetStudentSubjectOutline,
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

/**
 * Five school days share the width; the two days off take a fixed sliver.
 *
 * They are empty almost every week - a makeup lesson is the exception - and
 * giving them an equal seventh of the table was taking a fifth of the space
 * the real days needed to print a subject without truncating it.
 */
const columnsFor = (dates: string[]) =>
  `3.75rem ${dates.map((date) => (isWeekend(date) ? '3.25rem' : 'minmax(0, 1fr)')).join(' ')}`

/** The days off carry their date alone; only school days are numbered. */
const headingName = (date: string) => (isWeekend(date) ? '' : dayName(date))

/** What a cell shows, and what opening it asks about. */
type Slot = { subjectCode: string; subjectName: string; title: string | null; personal: boolean }

function slotOf(entry: SubjectDay | undefined): Slot | null {
  if (!entry) return null
  const lesson = entry.lesson ?? entry.extra?.lesson ?? null
  if (!lesson) return null
  return {
    subjectCode: entry.subjectCode,
    subjectName: entry.subjectName,
    title: lesson.skillName,
    personal: !entry.lesson,
  }
}

/**
 * Anything the timetable cannot place: a lesson whose row carries no period,
 * and every piece of personal work, which answers to no bell. Dropping these
 * would make the page quietly incomplete.
 */
function unplaced(days: { data?: StudentToday }[]) {
  return days.map((day) =>
    (day.data?.subjects ?? [])
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
            'flex h-full w-full min-w-0 flex-col justify-center gap-0.5 overflow-hidden',
            'border-l-[3px] px-2 py-1 text-left transition-colors',
            // The pale amber, and only three quarters of it. The menu
            // uses the full strength; a grid of forty cells cannot.
            'hover:bg-sidebar-active/70 data-[state=open]:bg-sidebar-active',
            slot.personal ? 'border-pending' : 'border-primary',
          )}
        >
          <span className="block truncate text-[13px] font-semibold leading-snug">
            {slot.subjectName}
          </span>
          {slot.title ? (
            <span className="block truncate text-[11px] leading-tight text-muted-foreground">
              {slot.title}
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
        {/* The whole reason the card exists: the name the cell had to clip. */}
        <p className="mt-1 text-sm font-semibold leading-snug">
          {slot.title ?? 'Сэдэв заагаагүй'}
        </p>
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
  const { data, isLoading } = useGetStudentSubjectOutline({ subject: slot.subjectCode })
  if (isLoading) return <Skeleton className="mt-2 h-4 w-24" />
  const here = data?.sections.find((section) => section.title === slot.title)
  if (!here?.pageFrom || !here.pageTo) return null
  return (
    <p className="mt-2 text-xs text-muted-foreground">
      {data?.bookTitle ? `${data.bookTitle} · ` : ''}
      {here.pageFrom}–{here.pageTo}-р хуудас
    </p>
  )
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

  const periodsQuery = useGetSchoolPeriods()
  const days = useStudentScheduleDays(window.dates)

  const loading = periodsQuery.isLoading || days.some((result) => result.isLoading)
  const failed = periodsQuery.isError || days.some((result) => result.isError)
  if (loading) return <Skeleton className="h-[34rem] w-full" />
  if (failed) return <p role="alert" className="text-sm text-destructive">Хуваарийг уншиж чадсангүй.</p>

  const periods = periodsQuery.data ?? []
  const leftovers = unplaced(days)
  const className = days[0]?.data?.className ?? ''

  const cellFor = (dayIndex: number, periodNo: number) =>
    slotOf((days[dayIndex]?.data?.subjects ?? []).find((entry) => entry.periodNo === periodNo))

  return (
    <div className="space-y-2">
      {/* The shell's bar names the page. What is left is the class and one
          line saying what tapping a lesson does. */}
      <header className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
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
                style={{ gridTemplateColumns: columnsFor(window.dates) }}
                role="table"
                aria-label="Долоо хоногийн хуваарь"
              >
                <div className="bg-card" />
                {window.dates.map((date) => {
                  const today = date === schoolToday()
                  return (
                    <div
                      key={date}
                      className={cn('bg-card px-1 py-1 text-center leading-tight', today && 'bg-primary/10')}
                      title={today ? 'Өнөөдөр' : undefined}
                    >
                      <p className={cn('truncate text-xs font-semibold', today && 'text-primary')}>
                        {headingName(date) ? (
                          <>
                            <span className="uppercase tracking-wide text-muted-foreground">
                              {headingName(date)}
                            </span>
                            {' · '}
                          </>
                        ) : null}
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
                  ...window.dates.map((date, index) => {
                    const slot = cellFor(index, period.periodNo)
                    const today = date === schoolToday()
                    return (
                      <div
                        key={`${period.periodNo}:${date}`}
                        className={cn(
                          'min-h-[4.25rem] bg-card',
                          isWeekend(date) && 'bg-muted/40',
                          today && 'bg-primary/5',
                        )}
                      >
                        {slot ? (
                          <SlotCell slot={slot} />
                        ) : (
                          <span className="flex h-full items-center px-2 text-sm text-muted-foreground/40">—</span>
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
                {window.dates.map((date, index) =>
                  leftovers[index]?.length ? (
                    <div key={date}>
                      <p className="mb-1 text-xs text-muted-foreground">
                        {DAY.format(new Date(date + 'T00:00:00Z'))}
                      </p>
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {leftovers[index]!.map((slot, slotIndex) => (
                          <div key={`${date}:${slotIndex}`} className="rounded-md border p-1">
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
