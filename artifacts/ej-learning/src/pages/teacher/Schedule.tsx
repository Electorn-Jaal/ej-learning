import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  getGetTeacherLessonsQueryKey,
  getGetTeacherScheduleQueryKey,
  useGenerateSchedule,
  useGetTeacherClasses,
  useGetTeacherLessons,
  useGetTeacherSchedule,
  useSetScheduleDay,
  type SchedulableLesson,
} from '@workspace/api-client-react'
import { Sparkles, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { currentSelection, entryKey, subjectParam } from '@/lib/teacher-class'

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

function ScheduleTable({
  classId,
  subjectId,
  lessons,
}: {
  classId: number
  subjectId: number | null
  lessons: SchedulableLesson[]
}) {
  const queryClient = useQueryClient()
  const params = { classId, ...subjectParam(subjectId) }
  const { data, isLoading, isError, error } = useGetTeacherSchedule(params)
  const { mutate: setDay, isPending: saving } = useSetScheduleDay()
  const { mutate: generate, isPending: generating } = useGenerateSchedule()
  const [notice, setNotice] = useState<string | null>(null)

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: getGetTeacherScheduleQueryKey(params) })

  const change = (scheduledOn: string, lessonId: number | null) =>
    setDay({ data: { classId, scheduledOn, lessonId } }, { onSuccess: refresh })

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
        <div>
          <CardTitle className="text-lg">{data.className} — хуваарь</CardTitle>
          <p className="text-sm text-muted-foreground">
            Дараалал номоор тогтоно. Та зөвхөн засна.
          </p>
        </div>
        <Badge variant="outline">
          {STAGE_LABEL[data.stage] ?? data.stage} · {data.gradeLevel}-р анги
        </Badge>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3 border-b pb-4">
          <Button
            variant="outline"
            size="sm"
            disabled={generating}
            onClick={() =>
              generate(
                { data: { classId, termId: 1 } },
                {
                  onSuccess: (result) => {
                    setNotice(result.notice)
                    refresh()
                  },
                },
              )
            }
          >
            <Sparkles className="h-4 w-4" />
            {generating ? 'Үүсгэж байна…' : 'Хоосон өдрүүдийг бөглөх'}
          </Button>
          <span className="text-xs text-muted-foreground">
            Хичээлтэй өдрүүд хөндөгдөхгүй.
          </span>
        </div>

        {notice ? (
          <p className="border-l-2 border-primary py-1 pl-3 text-sm text-foreground">
            {notice}
          </p>
        ) : null}

        {data.days.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Энэ хугацаанд хуваарь алга.
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
                    <Select
                      value={day.lessonId === null ? '' : String(day.lessonId)}
                      disabled={saving}
                      onValueChange={(value) => change(day.scheduledOn, Number(value))}
                    >
                      <SelectTrigger
                        className={cn('w-full', day.lessonId === null && 'text-muted-foreground')}
                      >
                        <SelectValue placeholder="Хичээл сонгох" />
                      </SelectTrigger>
                      <SelectContent>
                        {lessons.map((lesson) => (
                          <SelectItem key={lesson.id} value={String(lesson.id)}>
                            {lesson.skillName}
                            {lesson.chapterTitle ? ` · ${lesson.chapterTitle}` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {day.isToday ? <Badge>Өнөөдөр</Badge> : null}

                  {/* Nothing to clear on a day that holds nothing; an enabled
                      button that does nothing is worse than none. */}
                  {day.lessonId === null ? (
                    <span className="w-9 shrink-0" aria-hidden />
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={saving}
                      title="Энэ өдрийг хоослох"
                      onClick={() => change(day.scheduledOn, null)}
                    >
                      <X className="h-4 w-4" />
                      <span className="sr-only">Хоослох</span>
                    </Button>
                  )}
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
  const { key, classId, subjectId } = currentSelection(classes, selected)
  const lessonParams = { classId, ...subjectParam(subjectId) }
  const { data: lessons } = useGetTeacherLessons(lessonParams, {
    query: {
      queryKey: getGetTeacherLessonsQueryKey(lessonParams),
      enabled: classId > 0,
    },
  })

  if (isLoading) return <Skeleton className="h-64 w-full" />
  if (!classes?.length) {
    return <p className="text-sm text-muted-foreground">Анги олдсонгүй.</p>
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Хичээлийн хуваарь</h1>
        <p className="text-sm text-muted-foreground">
          Сурах бичгийн дараалал автоматаар байрлана. Амралт, өөрчлөлт гарвал
          та тухайн өдрийг засна.
        </p>
      </header>

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

      {lessons ? (
        <ScheduleTable classId={classId} subjectId={subjectId} lessons={lessons} />
      ) : (
        <Skeleton className="h-64 w-full" />
      )}
    </div>
  )
}
