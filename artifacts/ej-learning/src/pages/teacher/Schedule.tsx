import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  getGetTeacherLessonsQueryKey,
  useGenerateSchedule,
  useGetTeacherClasses,
  useGetTeacherLessons,
  useGetTeacherSchedule,
  useSetScheduleDay,
  type ScheduledDay,
  type SchedulableLesson,
} from '@workspace/api-client-react'
import { Sparkles, X } from 'lucide-react'
import { DatePicker } from '@/components/DatePicker'
import { DayNavigation } from '@/components/DayNavigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useLinkedSelection } from '@/lib/linked-selection'
import { subjectParam } from '@/lib/teacher-class'
import { hasRole, useSession } from '@/lib/session'
import { dayName, isWeekend, schoolToday, scheduleWindow, subjectSlots } from '@/lib/schedule-window'
import { cn } from '@/lib/utils'

const DAY = new Intl.DateTimeFormat('mn-MN', { month: 'short', day: 'numeric', timeZone: 'UTC' })
const SELECT_STYLE = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50'

/**
 * The note the teacher leaves on one day of the timetable.
 *
 * Saved when the box loses focus rather than on every keystroke: the endpoint
 * that takes it also carries the lesson, and a request per character would
 * rewrite the schedule row thirty times while somebody types a sentence. The
 * draft is kept locally so the box does not fight the person typing in it, and
 * it is re-seeded whenever a different note arrives from the server.
 */
function DayNote({ day, editable, saving, onSave }: {
  day: ScheduledDay
  editable: boolean
  saving: boolean
  onSave: (note: string) => void
}) {
  const [draft, setDraft] = useState(day.note ?? '')
  useEffect(() => { setDraft(day.note ?? '') }, [day.note])

  if (!editable) {
    return day.note ? <p className="text-xs text-muted-foreground">{day.note}</p> : null
  }

  return (
    <input
      type="text"
      className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
      placeholder="Тайлбар — сурагч харна"
      aria-label={day.scheduledOn + ' ' + (day.subject ?? '') + ' тайлбар'}
      maxLength={2000}
      value={draft}
      disabled={saving}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => { if (draft.trim() !== (day.note ?? '').trim()) onSave(draft) }}
    />
  )
}

function ScheduleRow({ day, firstOfDay, combined, classId, admin, canEdit, lessons, saving, onChange, onNote }: {
  day: ScheduledDay
  firstOfDay: boolean
  combined: boolean
  classId: number
  admin: boolean
  canEdit: boolean
  lessons: SchedulableLesson[]
  saving: boolean
  onChange: (day: ScheduledDay, lessonId: number | null) => void
  onNote: (day: ScheduledDay, note: string) => void
}) {
  const [adding, setAdding] = useState(false)
  const weekend = isWeekend(day.scheduledOn)
  const editable = day.subjectId !== null && (weekend ? admin : canEdit && !combined)
  const params = { classId, ...subjectParam(day.subjectId) }
  const { data: weekendLessons, isLoading: loadingLessons } = useGetTeacherLessons(params, {
    query: { queryKey: getGetTeacherLessonsQueryKey(params), enabled: admin && weekend && combined && (adding || day.lessonId !== null) && day.subjectId !== null },
  })
  const options = combined ? weekendLessons ?? [] : lessons
  const date = new Date(day.scheduledOn + 'T00:00:00Z')

  return (
    <li className={cn('flex min-h-16 items-center gap-3 border-l-2 px-4 py-2',
      weekend && 'bg-muted/40',
      day.isToday ? 'border-primary bg-primary/5' : 'border-transparent')}>
      <div className="w-24 shrink-0">
        {firstOfDay ? <>
          <div className="text-sm font-medium">{DAY.format(date)}</div>
          <div className="text-xs text-muted-foreground">{dayName(day.scheduledOn)} өдөр</div>
          {day.isToday ? <span className="text-xs font-medium text-primary">Өнөөдөр</span> : null}
        </> : <span className="text-muted-foreground" aria-hidden>↳</span>}
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        {combined && day.subject ? <p className="text-xs text-muted-foreground">{day.subject}</p> : null}
        {weekend && day.lessonId === null && !adding ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">Амралтын өдөр</span>
            {editable ? <Button variant="outline" size="sm" onClick={() => setAdding(true)}>Нөхөх хичээл оруулах</Button> : null}
          </div>
        ) : editable ? (
          <div className="flex items-center gap-2">
            <select aria-label={day.scheduledOn + ' ' + (day.subject ?? '') + ' хичээл'} className={SELECT_STYLE}
              disabled={saving || loadingLessons} value={day.lessonId === null ? '' : String(day.lessonId)}
              onChange={(event) => { if (event.target.value) onChange(day, Number(event.target.value)) }}>
              <option value="">{adding ? 'Нөхөх хичээл сонгох' : ''}</option>
              {day.lessonId !== null && !options.some((lesson) => lesson.id === day.lessonId) ? <option value={String(day.lessonId)}>{day.skillName}</option> : null}
              {options.map((lesson) => <option key={lesson.id} value={String(lesson.id)}>{lesson.skillName}{lesson.chapterTitle ? ' · ' + lesson.chapterTitle : ''}</option>)}
            </select>
            {day.lessonId !== null || adding ? <Button variant="ghost" size="icon" disabled={saving} aria-label={day.lessonId === null ? 'Болих' : 'Энэ өдрийн хичээлийг хоослох'} onClick={() => {
              if (day.lessonId !== null) onChange(day, null)
              setAdding(false)
            }}><X className="h-4 w-4" /></Button> : null}
          </div>
        ) : <p className="min-h-6 text-sm">{day.skillName ?? ''}</p>}
        {weekend && day.lessonId !== null ? <span className="text-xs text-primary">Нөхөх хичээл</span> : null}
        {day.lessonId !== null ? <DayNote day={day} editable={editable} saving={saving} onSave={(note) => onNote(day, note)} /> : null}
      </div>
    </li>
  )
}

function ScheduleTable({ classId, subjectId, canEdit, admin, date, onDateChange, subjects }: {
  classId: number
  subjectId: number | null
  canEdit: boolean
  admin: boolean
  date: string
  onDateChange: (day: string) => void
  subjects: { subjectId: number; subject: string | null }[]
}) {
  const queryClient = useQueryClient()
  const combined = subjectId === null
  const window = scheduleWindow(date, combined)
  const params = { classId, ...subjectParam(subjectId), from: window.from, to: window.to }
  const { data, isLoading, isError, error } = useGetTeacherSchedule(params)
  const lessonParams = { classId, ...subjectParam(subjectId) }
  const { data: lessons } = useGetTeacherLessons(lessonParams, {
    query: { queryKey: getGetTeacherLessonsQueryKey(lessonParams), enabled: !combined && canEdit },
  })
  const { mutate: setDay, isPending: saving, error: saveError } = useSetScheduleDay()
  const { mutate: generate, isPending: generating, error: generateError } = useGenerateSchedule()
  const [notice, setNotice] = useState<string | null>(null)
  const refresh = () => queryClient.invalidateQueries({ predicate: (query) => typeof query.queryKey[0] === 'string' && (
    query.queryKey[0].includes('/teacher/schedule') || query.queryKey[0].includes('/student/schedule') || query.queryKey[0].includes('/student/today')
  ) })

  if (isLoading) return <Skeleton className="h-[36rem] w-full" />
  if (isError || !data) return <p role="alert" className="text-sm text-destructive">{error?.data?.error ?? 'Хуваарийг уншиж чадсангүй.'}</p>

  const slots = combined ? subjectSlots(subjects) : [{ subjectId, subject: subjects.find((s) => s.subjectId === subjectId)?.subject ?? null }]
  const rows = window.dates.flatMap((scheduledOn) => slots.map((slot): ScheduledDay =>
    data.days.find((row) => row.scheduledOn === scheduledOn && row.subjectId === slot?.subjectId) ?? {
      scheduledOn, isToday: scheduledOn === schoolToday(), subjectId: slot?.subjectId ?? null, subject: slot?.subject ?? null,
      lessonId: null, lessonCode: null, lessonType: null, skillName: null, note: null,
    },
  ))

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between gap-2 p-4 pb-3">
        <CardTitle className="text-lg">{data.className}</CardTitle>
        <Badge variant="outline">{data.gradeLevel}-р анги</Badge>
      </CardHeader>
      <CardContent className="p-0">
        {!combined && canEdit ? <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
          <Button variant="outline" size="sm" disabled={generating} onClick={() => generate({ data: { classId, ...subjectParam(subjectId) } }, {
            onSuccess: (result) => { setNotice(result.notice); void refresh() },
          })}><Sparkles className="h-4 w-4" />{generating ? 'Үүсгэж байна…' : 'Хоосон өдрүүдийг бөглөх'}</Button>
        </div> : null}
        {notice ? <p role="status" className="px-4 pb-3 text-sm text-muted-foreground">{notice}</p> : null}
        {saveError || generateError ? <p role="alert" className="px-4 pb-3 text-sm text-destructive">{saveError?.data?.error ?? generateError?.data?.error ?? 'Хадгалж чадсангүй.'}</p> : null}
        <ul className="divide-y border-t">
          {rows.map((day, index) => <ScheduleRow key={day.scheduledOn + ':' + (day.subjectId ?? 'empty-' + index)}
            day={day} firstOfDay={index === 0 || rows[index - 1]!.scheduledOn !== day.scheduledOn}
            combined={combined} classId={classId} admin={admin} canEdit={canEdit}
            lessons={lessons ?? []} saving={saving} onChange={(row, lessonId) => {
              setDay({ data: { classId, scheduledOn: row.scheduledOn, lessonId, ...subjectParam(row.subjectId) } }, { onSuccess: refresh })
            }} onNote={(row, note) => {
              // The lesson is sent unchanged: the endpoint sets the day, and
              // leaving it out would clear the lesson this note is about.
              setDay({ data: { classId, scheduledOn: row.scheduledOn, lessonId: row.lessonId, note, ...subjectParam(row.subjectId) } }, { onSuccess: refresh })
            }} />)}
        </ul>
        <DayNavigation day={date} onChange={onDateChange} pageSize={window.count} from={window.from} to={window.to} />
      </CardContent>
    </Card>
  )
}

export default function TeacherSchedule() {
  const { user } = useSession()
  const admin = hasRole(user, 'ADMIN')
  const { data: classes, isLoading } = useGetTeacherClasses()
  const [date, setDate] = useState(schoolToday)
  const [selectedClass, setSelectedClass] = useState<string | null>(null)
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null)
  const linked = useLinkedSelection()

  if (isLoading) return <Skeleton className="h-64 w-full" />
  if (!classes?.length) return <p className="text-sm text-muted-foreground">Анги олдсонгүй.</p>

  const uniqueClasses = [...new Map(classes.map((entry) => [entry.id, entry])).values()]
  const chosenClass = selectedClass ?? linked.classId
  const classId = Number(uniqueClasses.find((entry) => String(entry.id) === chosenClass)?.id ?? uniqueClasses[0]!.id)
  const entries = classes.filter((entry) => Number(entry.id) === classId)
  const subjects = entries.filter((entry) => entry.subjectId !== null).map((entry) => ({ subjectId: entry.subjectId!, subject: entry.subject }))
  const hasAll = entries.some((entry) => entry.subjectId === null)
  const chosenSubject = selectedSubject ?? linked.subjectId ?? 'all'
  const subjectId = chosenSubject === 'all' && hasAll ? null : subjects.find((entry) => String(entry.subjectId) === chosenSubject)?.subjectId ?? subjects[0]?.subjectId ?? null
  const canEdit = entries.find((entry) => entry.subjectId === subjectId)?.canEdit ?? false
  const key = classId + ':' + (subjectId ?? 'all')
  const window = scheduleWindow(date, subjectId === null)

  return (
    <div className="space-y-5">
      <header><h1 className="text-2xl font-bold">Хичээлийн хуваарь</h1></header>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-2">
          <label htmlFor="schedule-class" className="block text-sm font-medium">Анги</label>
          <select id="schedule-class" className={SELECT_STYLE} value={String(classId)} onChange={(event) => {
            setSelectedClass(event.target.value)
            setSelectedSubject('all')
          }}>
            {uniqueClasses.map((klass) => <option key={klass.id} value={String(klass.id)}>{klass.name}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <label htmlFor="schedule-subject" className="block text-sm font-medium">Хичээл</label>
          <select id="schedule-subject" className={SELECT_STYLE} value={subjectId === null ? 'all' : String(subjectId)} onChange={(event) => setSelectedSubject(event.target.value)}>
            {hasAll || subjects.length === 0 ? <option value="all">Бүх хичээл</option> : null}
            {subjects.map((entry) => <option key={entry.subjectId} value={String(entry.subjectId)}>{entry.subject}</option>)}
          </select>
        </div>
        <div className="space-y-2"><p className="text-sm font-medium">Өдөр</p><DatePicker value={date} onChange={setDate} /></div>
      </div>
      <ScheduleTable key={key + window.from} classId={classId} subjectId={subjectId} canEdit={canEdit}
        admin={admin} date={date} onDateChange={setDate} subjects={subjects} />
    </div>
  )
}
