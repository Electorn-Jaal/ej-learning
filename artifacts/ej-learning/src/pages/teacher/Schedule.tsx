import { useState } from 'react'
import { Link, useLocation, useSearch } from 'wouter'
import { useQueryClient } from '@tanstack/react-query'
import {
  getGetTeacherLessonsQueryKey,
  useGetTeacherClasses,
  useGetTeacherLessons,
  useGetTeacherSchedule,
  useSetScheduleDay,
  type ScheduledDay,
  type SchedulableLesson,
  type ReplanProposal,
} from '@workspace/api-client-react'
import { CalendarRange, List, X } from 'lucide-react'
import { DatePicker } from '@/components/DatePicker'
import { NATIVE_SELECT } from '@/components/ui/native-select'
import { TimetableStudents } from '@/components/TimetableStudents'
import { TeacherWeek } from '@/components/teacher/TeacherWeek'
import { ReplanPrompt } from '@/components/schedule/ReplanPrompt'
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
const SELECT_STYLE = NATIVE_SELECT

/**
 * The teacher's note, shown but not written here.
 *
 * It used to be an input on every row of the week. The same note is written on
 * the day's own page, where the lesson it belongs to is on screen in full -
 * and a note is about how one lesson is to be taught, which is not a thing
 * anybody decides seven days ahead in a list. The week keeps it visible so
 * that a teacher scanning the days can see which ones carry instructions.
 */
function DayNote({ day }: { day: ScheduledDay }) {
  if (!day.note) return null
  return <p className="text-xs text-muted-foreground">{day.note}</p>
}

function ScheduleRow({ day, firstOfDay, combined, timetabled, classId, admin, canEdit, lessons, saving, onChange }: {
  day: ScheduledDay
  firstOfDay: boolean
  combined: boolean
  timetabled: boolean
  classId: number
  admin: boolean
  canEdit: boolean
  lessons: SchedulableLesson[]
  saving: boolean
  onChange: (day: ScheduledDay, lessonId: number | null) => void
}) {
  const [adding, setAdding] = useState(false)
  const weekend = isWeekend(day.scheduledOn)
  // A day this class does not have this subject on. Once a class is
  // timetabled, a row with no period behind it is not a lesson anybody
  // teaches, so the picker does not open rather than opening and being
  // refused. An administrator still may: that is what a makeup lesson is.
  const offTimetable = timetabled && day.timetableSlotId === null
  // A day already taught: the class worked from it and their answers are
  // recorded against it, so it is read back rather than rewritten. Days ahead
  // stay open - checking the planned section and leaving an instruction for it
  // is the point of looking forward.
  const taught = day.scheduledOn < schoolToday()
  const editable = day.subjectId !== null
    && (weekend || offTimetable || taught ? admin : canEdit && !combined)
  const params = { classId, ...subjectParam(day.subjectId) }
  const { data: weekendLessons, isLoading: loadingLessons } = useGetTeacherLessons(params, {
    query: { queryKey: getGetTeacherLessonsQueryKey(params), enabled: admin && weekend && combined && (adding || day.lessonId !== null) && day.subjectId !== null },
  })
  const options = combined ? weekendLessons ?? [] : lessons
  const date = new Date(day.scheduledOn + 'T00:00:00Z')

  return (
    <li className={cn('flex min-h-12 items-center gap-2.5 border-l-2 px-3 py-1.5',
      weekend && 'bg-muted/40',
      day.isToday ? 'border-sidebar-line bg-sidebar-active/40' : 'border-transparent')}>
      <div className="w-20 shrink-0">
        {firstOfDay ? <>
          <div className="text-xs font-medium">{DAY.format(date)}</div>
          <div className="text-xs text-muted-foreground">{dayName(day.scheduledOn)} өдөр</div>
          {day.isToday ? <span className="text-[11px] font-medium">Өнөөдөр</span> : null}
        </> : <span className="text-muted-foreground" aria-hidden>↳</span>}
      </div>
      {/* Only where there is a period behind the row. A day this class does
          not have the subject on has no day page worth opening, and the row
          is already visible as the empty thing it is. It sits at the foot of
          the row so that it lines up with the picker beside it rather than
          floating in the middle of the line. */}
      {day.timetableSlotId !== null ? (
        <Link
          href={`/teacher/class/${classId}?subject=${day.subjectId ?? ''}&on=${day.scheduledOn}&view=lesson`}
          className="order-last h-8 shrink-0 self-end rounded-[2px] px-2 py-1.5 text-xs text-muted-foreground hover:bg-sidebar-active hover:text-foreground"
          title="Энэ өдрийн хуудас"
        >
          Өдөр →
        </Link>
      ) : null}
      <div className="min-w-0 flex-1 space-y-0.5">
        {day.periodNo ? <p className="text-xs font-medium">{day.periodNo}-р цаг · {day.startsAt} {day.groupLabel ? `· ${day.groupLabel}` : ''}</p> : null}
        {day.teacherName ? <p className="text-xs text-muted-foreground">{day.teacherName}</p> : null}
        {combined && day.subject ? <p className="text-xs text-muted-foreground">{day.subject}</p> : null}
        {weekend && !day.timetableSlotId && day.lessonId === null && !adding ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">Амралтын өдөр</span>
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
        ) : <p className="min-h-5 text-xs">{day.skillName ?? ''}</p>}
        {weekend && day.lessonId !== null ? <span className="text-xs text-primary">Нөхөх хичээл</span> : null}
        {editable && day.groupLabel && day.timetableSlotId ? <TimetableStudents slotId={day.timetableSlotId} /> : null}
        <DayNote day={day} />
      </div>
    </li>
  )
}

function ScheduleTable({ classId, subjectId, canEdit, admin, date, onDateChange, subjects, view }: {
  classId: number
  subjectId: number | null
  canEdit: boolean
  admin: boolean
  date: string
  onDateChange: (day: string) => void
  subjects: { subjectId: number; subject: string | null }[]
  view: 'list' | 'week'
}) {
  const queryClient = useQueryClient()
  const combined = subjectId === null
  const window = scheduleWindow(date, view === 'week' ? false : combined)
  const params = { classId, ...subjectParam(subjectId), from: window.from, to: window.to }
  const { data, isLoading, isError, error } = useGetTeacherSchedule(params)
  const lessonParams = { classId, ...subjectParam(subjectId) }
  const { data: lessons } = useGetTeacherLessons(lessonParams, {
    query: { queryKey: getGetTeacherLessonsQueryKey(lessonParams), enabled: !combined && canEdit },
  })
  const { mutate: setDay, isPending: saving, error: saveError } = useSetScheduleDay()
  const [notice, setNotice] = useState<string | null>(null)
  // The rest of the term, proposed rather than written. One at a time: a
  // teacher correcting two days in a row answers the first question before
  // the second is asked, because the second one's answer depends on it.
  const [replan, setReplan] = useState<ReplanProposal | null>(null)
  const refresh = () => queryClient.invalidateQueries({ predicate: (query) => typeof query.queryKey[0] === 'string' && (
    query.queryKey[0].includes('/teacher/schedule') || query.queryKey[0].includes('/student/schedule') || query.queryKey[0].includes('/student/today')
  ) })

  if (isLoading) return <Skeleton className="h-[36rem] w-full" />
  if (isError || !data) return <p role="alert" className="text-sm text-destructive">{error?.data?.error ?? 'Хуваарийг уншиж чадсангүй.'}</p>

  // Whether this class has a timetable at all. A school that has not loaded
  // one yet has no slots anywhere, and locking every row there would stop a
  // teacher using the product; one slot in the week is enough to know.
  const timetabled = data.days.some((row) => row.timetableSlotId !== null)

  const slots = combined ? subjectSlots(subjects) : [{ subjectId, subject: subjects.find((s) => s.subjectId === subjectId)?.subject ?? null }]
  const rows = window.dates.flatMap((scheduledOn) => slots.flatMap((slot): ScheduledDay[] => {
    const matching = data.days.filter((row) => row.scheduledOn === scheduledOn && row.subjectId === slot?.subjectId)
    return matching.length ? matching : [{
      scheduledOn, isToday: scheduledOn === schoolToday(), subjectId: slot?.subjectId ?? null, subject: slot?.subject ?? null,
      lessonId: null, lessonCode: null, lessonType: null, skillName: null, note: null,
    }]
  }))

  return (
    <Card className="overflow-hidden">
      {view === 'week' ? null : (
        <CardHeader className="flex flex-row items-center justify-between gap-2 px-3 py-2">
          <CardTitle className="text-base">{data.className}</CardTitle>
          <Badge variant="outline">{data.gradeLevel}-р анги</Badge>
        </CardHeader>
      )}
      <CardContent className="p-0">
        {/* The fill-the-empty-days button is gone. It assigned whatever lesson
            content happened to exist to whatever period happened to be blank,
            which is a guess dressed as a schedule; a teacher choosing the
            lesson for a period is the only version of this that is true. */}
        {notice ? <p role="status" className="px-3 pb-2 text-xs text-muted-foreground">{notice}</p> : null}
        {saveError ? <p role="alert" className="px-3 pb-2 text-xs text-destructive">{saveError?.data?.error ?? 'Хадгалж чадсангүй.'}</p> : null}
        {replan ? (
          <div className="px-3 pb-3">
            <ReplanPrompt proposal={replan} onDone={() => { setReplan(null); refresh() }} />
          </div>
        ) : null}
        {view === 'week' ? (
          <TeacherWeek subjectId={subjectId} />
        ) : (
          <ul className="divide-y border-t">
            {rows.map((day, index) => <ScheduleRow key={day.scheduledOn + ':' + (day.timetableSlotId ?? 'row-' + index)}
              day={day} firstOfDay={index === 0 || rows[index - 1]!.scheduledOn !== day.scheduledOn}
              combined={combined} timetabled={timetabled} classId={classId} admin={admin} canEdit={canEdit}
              lessons={lessons ?? []} saving={saving} onChange={(row, lessonId) => {
                setDay({ data: { classId, scheduledOn: row.scheduledOn, timetableSlotId: row.timetableSlotId, lessonId, ...subjectParam(row.subjectId) } }, {
                  onSuccess: (result) => { setReplan(result.replan); refresh() },
                })
              }} />)}
          </ul>
        )}
        {view === 'week' ? null : (
          <DayNavigation day={date} onChange={onDateChange} pageSize={window.count} from={window.from} to={window.to} />
        )}
      </CardContent>
    </Card>
  )
}

export default function TeacherSchedule() {
  const { user } = useSession()
  const admin = hasRole(user, 'ADMIN')
  const { data: classes, isLoading } = useGetTeacherClasses()
  const [, navigate] = useLocation()
  const search = new URLSearchParams(useSearch())
  const date = /^\d{4}-\d{2}-\d{2}$/.test(search.get('on') ?? '') ? search.get('on')! : schoolToday()
  const selectedClass = search.get('classId')
  const selectedSubject = search.get('subjectId')
  const view = search.get('view') === 'week' ? 'week' : 'list'
  const update = (values: Record<string, string>) => {
    const next = new URLSearchParams(search)
    for (const [key, value] of Object.entries(values)) next.set(key, value)
    navigate('/teacher/schedule?' + next.toString(), { replace: true })
  }
  const setDate = (on: string) => update({ on })
  const setView = (view: string) => update({ view })
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
    <div className="space-y-2">
      <nav aria-label="Журналын хэсгүүд" className="flex flex-wrap gap-2 pb-2 text-sm">
        <span className="rounded bg-sidebar-active px-3 py-2 font-semibold" aria-current="page">Хичээл ба төлөвлөгөө</span>
        <Link className="rounded px-3 py-2 hover:bg-sidebar-active" href={`/teacher/class/${classId}?subject=${subjectId ?? ''}&on=${date}&view=lesson`}>Өдрийн хичээл</Link>
        <Link className="rounded px-3 py-2 hover:bg-sidebar-active" href={`/teacher/class/${classId}?subject=${subjectId ?? ''}&on=${date}&view=students`}>Ирц ба дэвтэр</Link>
      </nav>
      {/* One row, and it stays one row: the pickers run along the left, the
          view sits on the right. It used to wrap, so on a narrower window the
          two view buttons dropped under the pickers and the toolbar read as a
          column. Nothing wraps now - the selects shrink instead, which is why
          they carry min-w-0. */}
      <header className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <select id="schedule-class" aria-label="Анги" className={SELECT_STYLE + ' w-auto min-w-0'}
            value={String(classId)} onChange={(event) => {
              update({ classId: event.target.value, subjectId: 'all' })
            }}>
            {uniqueClasses.map((klass) => <option key={klass.id} value={String(klass.id)}>{klass.name}</option>)}
          </select>
          <select id="schedule-subject" aria-label="Хичээл" className={SELECT_STYLE + ' w-auto min-w-[10rem]'}
            value={subjectId === null ? 'all' : String(subjectId)}
            onChange={(event) => update({ classId: String(classId), subjectId: event.target.value })}>
            {hasAll || subjects.length === 0 ? <option value="all">Бүх хичээл</option> : null}
            {subjects.map((entry) => <option key={entry.subjectId} value={String(entry.subjectId)}>{entry.subject}</option>)}
          </select>
          <DatePicker value={date} onChange={setDate} />
        </div>

        <div className="ml-auto flex shrink-0" role="group" aria-label="Хуваарийн харагдац">
          <Button type="button" size="sm" variant={view === 'list' ? 'default' : 'outline'}
            aria-pressed={view === 'list'} onClick={() => setView('list')}>
            <List className="h-3.5 w-3.5" />Сургалтын төлөвлөгөө
          </Button>
          <Button type="button" size="sm" variant={view === 'week' ? 'default' : 'outline'}
            aria-pressed={view === 'week'} onClick={() => setView('week')} className="border-l border-border">
            <CalendarRange className="h-3.5 w-3.5" />Цагийн хуваарь
          </Button>
        </div>
      </header>
      <ScheduleTable key={key + window.from} classId={classId} subjectId={subjectId} canEdit={canEdit}
        admin={admin} date={date} onDateChange={setDate} subjects={subjects} view={view} />
    </div>
  )
}
