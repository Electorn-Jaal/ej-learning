import { useState } from 'react'
import { Link } from 'wouter'
import { useGetStudentSubjects, useStudentScheduleDays } from '@workspace/api-client-react'
import { DatePicker } from '@/components/DatePicker'
import { DayNavigation } from '@/components/DayNavigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { dayName, isWeekend, schoolToday, scheduleWindow, subjectSlots } from '@/lib/schedule-window'
import { cn } from '@/lib/utils'

const DAY = new Intl.DateTimeFormat('mn-MN', { month: 'short', day: 'numeric', timeZone: 'UTC' })

export default function StudentSchedule() {
  const [day, setDay] = useState(schoolToday)
  const [subject, setSubject] = useState('all')
  const combined = subject === 'all'
  const window = scheduleWindow(day, combined)
  const subjectsQuery = useGetStudentSubjects()
  const days = useStudentScheduleDays(window.dates)
  const loading = subjectsQuery.isLoading || days.some((result) => result.isLoading)
  const failed = subjectsQuery.isError || days.some((result) => result.isError)
  const subjects = subjectsQuery.data ?? []
  const slots = combined ? subjectSlots(subjects) : [subjects.find((entry) => entry.code === subject) ?? null]

  return (
    <div className="space-y-5">
      <header><h1 className="text-2xl font-bold">Хичээлийн хуваарь</h1></header>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="student-schedule-subject" className="block text-sm font-medium">Хичээл</label>
          <select id="student-schedule-subject" value={subject} onChange={(event) => setSubject(event.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring">
            <option value="all">Бүх хичээл</option>
            {subjects.map((entry) => <option key={entry.code} value={entry.code}>{entry.name}</option>)}
          </select>
        </div>
        <div className="space-y-2"><p className="text-sm font-medium">Өдөр</p><DatePicker value={day} onChange={setDay} /></div>
      </div>
      {loading ? <Skeleton className="h-[36rem] w-full" /> : failed ? (
        <p role="alert" className="text-sm text-destructive">Хуваарийг уншиж чадсангүй.</p>
      ) : (
        <Card className="overflow-hidden">
          <CardHeader className="p-4 pb-3"><CardTitle className="text-lg">{days[0]?.data?.className}</CardTitle></CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y border-t">
              {window.dates.flatMap((date, index) => slots.map((slot, slotIndex) => {
                const entry = days[index]?.data?.subjects.find((row) => row.subjectCode === slot?.code)
                const weekend = isWeekend(date)
                const isToday = date === schoolToday()
                const hasWork = Boolean(entry?.lesson || entry?.extra)
                const dateValue = new Date(date + 'T00:00:00Z')
                return (
                  <li key={date + ':' + (slot?.code ?? slotIndex)} className={cn('flex min-h-16 items-center gap-3 border-l-2 px-4 py-2',
                    weekend && 'bg-muted/40',
                    isToday ? 'border-primary bg-primary/5' : 'border-transparent')}>
                    <div className="w-24 shrink-0">
                      {slotIndex === 0 ? <>
                        <div className="text-sm font-medium">{DAY.format(dateValue)}</div>
                        <div className="text-xs text-muted-foreground">{dayName(date)} өдөр</div>
                        {isToday ? <span className="text-xs font-medium text-primary">Өнөөдөр</span> : null}
                      </> : <span aria-hidden className="text-muted-foreground">↳</span>}
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      {combined && slot ? <p className="text-xs text-muted-foreground">{slot.name}</p> : null}
                      {weekend && !hasWork ? <p className="text-sm text-muted-foreground">Амралтын өдөр</p> : <>
                        <p className="min-h-6 text-sm">{entry?.lesson?.skillName ?? entry?.extra?.lesson.skillName ?? ''}</p>
                        {entry?.lesson && entry.extra ? <p className="text-xs text-muted-foreground">Нэмэлт ажил: {entry.extra.lesson.skillName}</p> : null}
                        {weekend && hasWork ? <p className="text-xs text-primary">Нөхөх хичээл</p> : null}
                      </>}
                    </div>
                    {isToday && hasWork ? <Link href="/" className="text-xs text-primary underline underline-offset-4">Нээх</Link> : null}
                  </li>
                )
              }))}
            </ul>
            <DayNavigation day={day} onChange={setDay} pageSize={window.count} from={window.from} to={window.to} />
          </CardContent>
        </Card>
      )}
    </div>
  )
}
