import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { shiftDay } from '@/lib/schedule-window'

/** The card's last row: the same box the days are in, not one below it. */
export function DayNavigation({ day, onChange, pageSize, from, to }: {
  day: string
  onChange: (day: string) => void
  pageSize: number
  from: string
  to: string
}) {
  return (
    <nav aria-label="Хуваарийн хуудас" className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3">
      <Button variant="outline" size="sm" onClick={() => onChange(shiftDay(day, -pageSize))}><ChevronLeft className="h-4 w-4" />Өмнөх</Button>
      <span className="text-xs tabular-nums text-muted-foreground">{from} — {to}</span>
      <Button variant="outline" size="sm" onClick={() => onChange(shiftDay(day, pageSize))}>Дараах<ChevronRight className="h-4 w-4" /></Button>
    </nav>
  )
}
