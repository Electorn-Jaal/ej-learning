import { useGetTeacherWeek, type TeacherWeekSlot } from '@workspace/api-client-react'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

const DAYS = ['Даваа', 'Мягмар', 'Лхагва', 'Пүрэв', 'Баасан']

/**
 * A teacher's week: rows are times, columns are days, and a cell names the
 * class.
 *
 * The same shape the children see, because it answers the same question from
 * the other side. The previous version put one class across the top and a row
 * per subject, which answers "what does 9a do" - a question the class list
 * already answers - and could not show a teacher where they are at half past
 * eleven on Wednesday, which is the only thing a week is good for.
 *
 * Two lessons in one cell is a split, not a clash: 6a divides between design
 * and IT, the middle years between PE and jiu-jitsu, so both are drawn.
 */
export function TeacherWeek({ subjectId }: { subjectId: number | null }) {
  const { data, isLoading, isError } = useGetTeacherWeek()

  if (isLoading) return <Skeleton className="m-4 h-[26rem]" />
  if (isError || !data) {
    return <p role="alert" className="p-4 text-sm text-destructive">Хуваарийг уншиж чадсангүй.</p>
  }

  const slots = subjectId === null ? data : data.filter((slot) => slot.subjectId === subjectId)
  if (slots.length === 0) {
    return (
      <p className="p-6 text-sm text-muted-foreground">
        Энэ сонголтод хуваарьт цаг алга байна.
      </p>
    )
  }

  // Only the periods something actually falls in. A teacher with nothing
  // before the third period does not need two empty rows above their week.
  const periods = [...new Set(slots.map((slot) => slot.periodNo))].sort((a, b) => a - b)
  const timeOf = new Map(
    slots.map((slot) => [slot.periodNo, slot.startsAt] as const),
  )

  const cellsFor = (weekday: number, period: number) =>
    slots.filter((slot) => slot.weekdayNo === weekday && slot.periodNo === period)

  return (
    <div className="overflow-x-auto border-t">
      <div
        className="grid min-w-[44rem] gap-px bg-border"
        style={{ gridTemplateColumns: `4rem repeat(${DAYS.length}, minmax(0, 1fr))` }}
        role="table"
        aria-label="Миний 7 хоногийн хуваарь"
      >
        <div className="bg-card" />
        {DAYS.map((day) => (
          <div key={day} className="bg-card px-1 py-1 text-center">
            <p className="truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {day}
            </p>
          </div>
        ))}

        {periods.flatMap((period) => [
          <div
            key={`t:${period}`}
            className="flex flex-col items-center justify-center bg-card px-1 py-1 leading-tight"
          >
            <span className="text-xs font-semibold tabular-nums">{timeOf.get(period) ?? period}</span>
            <span className="text-[10px] tabular-nums text-muted-foreground">{period}-р</span>
          </div>,
          ...DAYS.map((_, index) => {
            const cells = cellsFor(index + 1, period)
            return (
              <div
                key={`${period}:${index}`}
                className={cn('flex min-h-[3.25rem] flex-col bg-card', cells.length === 0 && 'bg-muted/30')}
              >
                {cells.map((slot: TeacherWeekSlot) => (
                  <div
                    key={slot.slotId}
                    className="flex min-w-0 flex-1 flex-col justify-center border-l-[3px] border-primary px-2 py-1"
                  >
                    <span className="flex min-w-0 items-baseline gap-1">
                      <span className="truncate text-[13px] font-semibold leading-snug">
                        {slot.className}
                      </span>
                      {slot.groupLabel ? (
                        <span className="shrink-0 text-[9px] uppercase tracking-wide text-muted-foreground">
                          {slot.groupLabel}
                        </span>
                      ) : null}
                    </span>
                    <span className="truncate text-[11px] leading-tight text-muted-foreground">
                      {slot.subject}
                    </span>
                  </div>
                ))}
              </div>
            )
          }),
        ])}
      </div>
    </div>
  )
}
