import { useState } from 'react'
import { Calendar as CalendarIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

const fromIsoDay = (day: string) => new Date(day + 'T00:00:00')
const isoDay = (date: Date) => date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0')

export function DatePicker({ value, onChange }: { value: string; onChange: (day: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="h-10 w-full justify-start bg-background" aria-label="Өдөр сонгох">
          <CalendarIcon className="h-4 w-4" />
          {value}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto overflow-hidden rounded-xl p-0 shadow-xl" align="start">
        <Calendar weekStartsOn={1} formatters={{ formatCaption: (date) => `${date.getFullYear()} оны ${date.getMonth() + 1}-р сар`, formatWeekdayName: (date) => ['Ня', 'Да', 'Мя', 'Лх', 'Пү', 'Ба', 'Бя'][date.getDay()]! }} mode="single" required selected={fromIsoDay(value)} defaultMonth={fromIsoDay(value)}
          onSelect={(next) => {
            if (!next) return
            onChange(isoDay(next))
            setOpen(false)
          }} />
      </PopoverContent>
    </Popover>
  )
}

