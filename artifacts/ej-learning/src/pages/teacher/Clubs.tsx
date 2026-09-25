import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  useGetClubs,
  useCreateClub,
  useGetClubMembers,
  useSetClubMembers,
  useSetClubActive,
  type Club,
  type ClubSession,
} from '@workspace/api-client-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { NATIVE_INPUT, NATIVE_SELECT } from '@/components/ui/native-select'
import { cn } from '@/lib/utils'

const WEEKDAYS = ['Даваа', 'Мягмар', 'Лхагва', 'Пүрэв', 'Баасан']

const when = (sessions: ClubSession[] | null) => {
  if (!sessions?.length) return 'Цаг оруулаагүй'
  const byDay = new Map<number, number[]>()
  for (const row of sessions) {
    byDay.set(row.weekdayNo, [...(byDay.get(row.weekdayNo) ?? []), row.periodNo])
  }
  return [...byDay.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([day, periods]) =>
      `${WEEKDAYS[day - 1] ?? day} ${periods.sort((a, b) => a - b).join(', ')}-р цаг`)
    .join(' · ')
}

/**
 * Picking the members.
 *
 * The whole school in one list, grouped by class, because that is what a club
 * is: four children from 9а and two from 12а. A screen that asked for a class
 * first would be asking the wrong question, and a teacher would have to visit
 * fourteen of them to build one club.
 */
function Members({ clubId, onClose }: { clubId: number; onClose: () => void }) {
  const queryClient = useQueryClient()
  const { data, isLoading } = useGetClubMembers(clubId)
  const { mutate: save, isPending, error } = useSetClubMembers()
  const [picked, setPicked] = useState<Set<number> | null>(null)
  const [search, setSearch] = useState('')

  if (isLoading || !data) return <Skeleton className="h-96 w-full" />

  const chosen = picked ?? new Set(data.members.map((row) => row.studentId))
  const toggle = (studentId: number) => {
    const next = new Set(chosen)
    if (next.has(studentId)) next.delete(studentId)
    else next.add(studentId)
    setPicked(next)
  }

  const needle = search.trim().toLowerCase()
  const shown = needle === ''
    ? data.roster
    : data.roster.filter((row) =>
        row.displayName.toLowerCase().includes(needle)
        || (row.className ?? '').toLowerCase().includes(needle))

  const byClass = new Map<string, typeof shown>()
  for (const row of shown) {
    const key = row.className ?? '—'
    byClass.set(key, [...(byClass.get(key) ?? []), row])
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={onClose}>Буцах</Button>
        <span className="text-sm font-semibold">{data.nameMn}</span>
        <span className="text-xs text-muted-foreground">{chosen.size} сурагч</span>
        <input
          type="text" className={cn(NATIVE_INPUT, 'ml-auto w-48')}
          placeholder="Нэр, анги хайх" aria-label="Хайх"
          value={search} onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      <div className="max-h-[28rem] space-y-3 overflow-y-auto rounded-[2px] border border-border bg-card p-3">
        {[...byClass.entries()].map(([className, rows]) => (
          <div key={className} className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {className}
            </p>
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3">
              {rows.map((row) => (
                <label key={row.studentId} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox" className="h-3.5 w-3.5" disabled={isPending}
                    checked={chosen.has(row.studentId)}
                    onChange={() => toggle(row.studentId)}
                  />
                  <span className="truncate">{row.displayName}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          size="sm" disabled={isPending || picked === null}
          onClick={() => save({ clubId, data: { studentIds: [...chosen] } }, {
            onSuccess: () => {
              setPicked(null)
              void queryClient.invalidateQueries({
                predicate: (query) => typeof query.queryKey[0] === 'string'
                  && query.queryKey[0].includes('/teacher/clubs'),
              })
            },
          })}
        >
          {isPending ? 'Хадгалж байна…' : 'Хадгалах'}
        </Button>
        {/* Said plainly, because it is the one thing about a club that differs
            from a split class: nobody is in it until somebody says so. */}
        <span className="text-xs text-muted-foreground">
          Тэмдэглээгүй сурагчид дугуйланд ороогүйд тооцогдоно.
        </span>
        {error ? (
          <span role="alert" className="text-xs text-destructive">
            {error?.data?.error ?? 'Хадгалж чадсангүй.'}
          </span>
        ) : null}
      </div>
    </div>
  )
}

function NewClub({ onDone }: { onDone: () => void }) {
  const [nameMn, setNameMn] = useState('')
  const [note, setNote] = useState('')
  const [day, setDay] = useState('2')
  const [from, setFrom] = useState('9')
  const [to, setTo] = useState('9')
  const [sessions, setSessions] = useState<ClubSession[]>([])
  const { mutate: create, isPending, error } = useCreateClub()

  const add = () => {
    const first = Number(from)
    const last = Math.max(first, Number(to))
    const next = [...sessions]
    for (let period = first; period <= last; period += 1) {
      if (!next.some((row) => row.weekdayNo === Number(day) && row.periodNo === period)) {
        next.push({ weekdayNo: Number(day), periodNo: period })
      }
    }
    setSessions(next)
  }

  return (
    <div className="space-y-3 rounded-[2px] border border-border bg-card p-4">
      <p className="text-sm font-semibold">Шинэ дугуйлан</p>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 space-y-0.5 sm:max-w-xs">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Нэр</p>
          <input
            type="text" className={NATIVE_INPUT} maxLength={200}
            aria-label="Дугуйлангийн нэр" placeholder="Speaking club"
            value={nameMn} onChange={(event) => setNameMn(event.target.value)}
          />
        </div>
        <div className="min-w-0 flex-1 space-y-0.5 sm:max-w-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Тайлбар</p>
          <input
            type="text" className={NATIVE_INPUT} maxLength={1000}
            aria-label="Тайлбар" placeholder="Хэнд зориулсан, хаана"
            value={note} onChange={(event) => setNote(event.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-0.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Гараг</p>
          <select
            className={cn(NATIVE_SELECT, 'w-auto')} aria-label="Гараг"
            value={day} onChange={(event) => setDay(event.target.value)}
          >
            {WEEKDAYS.map((label, index) => (
              <option key={label} value={String(index + 1)}>{label}</option>
            ))}
          </select>
        </div>
        <div className="space-y-0.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Цаг</p>
          <div className="flex items-center gap-1.5">
            <input
              type="number" min={1} max={12} className={cn(NATIVE_INPUT, 'w-16')}
              aria-label="Эхлэх цаг" value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
            <span className="text-xs text-muted-foreground">&#8211;</span>
            <input
              type="number" min={1} max={12} className={cn(NATIVE_INPUT, 'w-16')}
              aria-label="Дуусах цаг" value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={add}>Цаг нэмэх</Button>
        {sessions.length > 0 ? (
          <span className="text-xs text-muted-foreground">{when(sessions)}</span>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          size="sm"
          disabled={isPending || nameMn.trim() === '' || sessions.length === 0}
          onClick={() => create({
            data: {
              nameMn: nameMn.trim(),
              note: note.trim() === '' ? null : note.trim(),
              sessions,
            },
          }, { onSuccess: onDone })}
        >
          {isPending ? 'Үүсгэж байна…' : 'Үүсгэх'}
        </Button>
        <span className="text-xs text-muted-foreground">
          Үүсгэсний дараа сурагчдаа сонгоно. Сурагчгүй дугуйлан хэнд ч харагдахгүй.
        </span>
        {error ? (
          <span role="alert" className="text-xs text-destructive">
            {error?.data?.error ?? 'Үүсгэж чадсангүй.'}
          </span>
        ) : null}
      </div>
    </div>
  )
}

function Row({ club, onMembers, onToggle }: {
  club: Club
  onMembers: () => void
  onToggle: () => void
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">
          {club.nameMn}
          {club.isActive ? null : (
            <span className="ml-2 text-xs font-normal text-muted-foreground">зогссон</span>
          )}
        </span>
        <span className="block text-xs text-muted-foreground">
          {club.teacherName ?? 'Багш заагаагүй'} · {when(club.sessions)}
        </span>
        {club.note ? <span className="block text-xs">{club.note}</span> : null}
      </span>

      {/* Zero is the number worth shouting about: a club with hours and no
          members is on nobody's timetable, which from here looks exactly like
          a club that is running fine. */}
      <span className={cn(
        'shrink-0 text-sm tabular-nums',
        club.memberCount === 0 && 'font-semibold text-destructive',
      )}>
        {club.memberCount} сурагч
      </span>
      <Button size="sm" onClick={onMembers}>Сурагчид</Button>
      <Button size="sm" variant="outline" onClick={onToggle}>
        {club.isActive ? 'Зогсоох' : 'Сэргээх'}
      </Button>
    </li>
  )
}

/**
 * Clubs: what the school runs that is not a class.
 *
 * Their own screen rather than a corner of the timetable, because a club has
 * no class and the timetable is organised by class. On the school's own sheet
 * they are written into the box where a class name goes, which is why nobody
 * could tell who was in one.
 */
export default function TeacherClubs() {
  const queryClient = useQueryClient()
  const { data, isLoading, isError } = useGetClubs()
  const { mutate: setActive } = useSetClubActive()
  const [adding, setAdding] = useState(false)
  const [open, setOpen] = useState<number | null>(null)

  const refresh = () => queryClient.invalidateQueries({
    predicate: (query) => typeof query.queryKey[0] === 'string'
      && query.queryKey[0].includes('/teacher/clubs'),
  })

  if (isLoading) return <Skeleton className="h-64 w-full" />
  if (isError) {
    return <p role="alert" className="text-sm text-destructive">Дугуйлангуудыг уншиж чадсангүй.</p>
  }
  if (open !== null) {
    return <Members clubId={open} onClose={() => { setOpen(null); refresh() }} />
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant={adding ? 'outline' : 'default'} onClick={() => setAdding(!adding)}>
          {adding ? 'Болих' : 'Дугуйлан нэмэх'}
        </Button>
        <span className="text-xs text-muted-foreground">{data?.length ?? 0} дугуйлан</span>
      </div>

      {adding ? <NewClub onDone={() => { setAdding(false); refresh() }} /> : null}

      {!data?.length ? (
        <p className="rounded-[2px] border border-border bg-card p-6 text-sm text-muted-foreground">
          Дугуйлан бүртгээгүй байна.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-[2px] border border-border bg-card">
          {data.map((club) => (
            <Row
              key={club.clubId}
              club={club}
              onMembers={() => setOpen(club.clubId)}
              onToggle={() => setActive(
                { clubId: club.clubId, data: { isActive: !club.isActive } },
                { onSuccess: refresh },
              )}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
