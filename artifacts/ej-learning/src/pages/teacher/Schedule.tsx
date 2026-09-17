import { useState } from 'react'
import {
  useGetTeacherClasses,
  useGetTeacherSchedule,
} from '@workspace/api-client-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const STAGE_LABEL: Record<string, string> = {
  PRIMARY: 'Бага анги',
  SECONDARY: 'Дунд/ахлах анги',
}

const WEEKDAY = new Intl.DateTimeFormat('mn-MN', { weekday: 'short', timeZone: 'UTC' })
const DAY = new Intl.DateTimeFormat('mn-MN', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
})

function ScheduleTable({ classId }: { classId: number }) {
  const { data, isLoading, isError, error } = useGetTeacherSchedule({ classId })

  if (isLoading) return <Skeleton className="h-64 w-full" />
  if (isError || !data) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {error?.data?.error ?? 'Хуваарийг уншиж чадсангүй.'}
      </p>
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="text-lg">{data.className} — хуваарь</CardTitle>
        <Badge variant="outline">
          {STAGE_LABEL[data.stage] ?? data.stage} · {data.gradeLevel}-р анги
        </Badge>
      </CardHeader>
      <CardContent>
        {data.days.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Энэ хугацаанд хуваарь оруулаагүй байна.
          </p>
        ) : (
          <ul className="divide-y">
            {data.days.map((day) => {
              const date = new Date(`${day.scheduledOn}T00:00:00Z`)
              return (
                <li
                  key={day.scheduledOn}
                  className={`flex flex-wrap items-center gap-3 border-l-2 py-3 pl-3 ${
                    day.isToday ? 'border-primary' : 'border-transparent'
                  }`}
                >
                  <div className="w-24 shrink-0">
                    <div className="text-sm font-medium">{DAY.format(date)}</div>
                    <div className="text-xs text-muted-foreground">
                      {WEEKDAY.format(date)}
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{day.skillName}</div>
                    <div className="text-xs text-muted-foreground">{day.lessonCode}</div>
                  </div>
                  {day.isToday ? <Badge>Өнөөдөр</Badge> : null}
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

export default function TeacherSchedule() {
  const { data: classes, isLoading } = useGetTeacherClasses()
  const [selected, setSelected] = useState<string | null>(null)

  if (isLoading) return <Skeleton className="h-64 w-full" />
  if (!classes?.length) {
    return <p className="text-sm text-muted-foreground">Анги олдсонгүй.</p>
  }

  const classId = selected ?? classes[0].id

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Хичээлийн хуваарь</h1>
        <p className="text-sm text-muted-foreground">
          Анги бүрт өдөр бүр нэг хичээл. Хоосон өдөр бол хичээлгүй өдөр.
        </p>
      </header>

      {classes.length > 1 ? (
        <Select value={classId} onValueChange={setSelected}>
          <SelectTrigger className="w-full sm:w-64">
            <SelectValue placeholder="Анги сонгох" />
          </SelectTrigger>
          <SelectContent>
            {classes.map((klass) => (
              <SelectItem key={klass.id} value={klass.id}>
                {klass.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}

      <ScheduleTable classId={Number(classId)} />
    </div>
  )
}
