import { useState } from 'react'
import { Link, useSearch, useLocation } from 'wouter'
import { useQueryClient } from '@tanstack/react-query'
import { useGetTeacherClasses, useGetClassDay, useGetClassHomework, useGetHomeworkDetail, useCreateHomework, useSetHomeworkActive } from '@workspace/api-client-react'
import { HomeworkInfo, HomeworkAttempts } from '@/components/homework'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { NATIVE_INPUT, NATIVE_SELECT } from '@/components/ui/native-select'
import { schoolToday } from '@/lib/schedule-window'

function Recipients({ classId, subjectId, selected, onChange }: {
  classId: number; subjectId: number; selected: number[]; onChange: (ids: number[]) => void
}) {
  const { data, isLoading, error } = useGetClassDay({ classId, subjectId })
  if (isLoading) return <p>Сурагчдыг уншиж байна…</p>
  if (!data || error) return <p role="alert">Сурагчдыг уншиж чадсангүй.</p>
  return <fieldset className="max-h-64 space-y-2 overflow-auto rounded border p-3">
    <legend className="text-sm">Сурагчид · {selected.length} сонгосон</legend>
    {!data.students.length && <p className="text-sm">Энэ ангид сурагч алга байна.</p>}
    {data.students.map((student) => <label key={student.studentId} className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={selected.includes(student.studentId)} onChange={(e) => onChange(e.target.checked
        ? [...selected, student.studentId] : selected.filter((id) => id !== student.studentId))} />
      {student.studentName}
    </label>)}
  </fieldset>
}

function NewHomework({ classId, subjectId, onDone, onCancel }: {
  classId: number; subjectId: number; onDone: () => void; onCancel: () => void
}) {
  const create = useCreateHomework()
  const [title, setTitle] = useState('')
  const [instructions, setInstructions] = useState('')
  const [dueOn, setDueOn] = useState('')
  const [audience, setAudience] = useState('all')
  const [students, setStudents] = useState<number[]>([])
  const today = schoolToday()
  const valid = title.trim() && (audience === 'all' || students.length > 0) && (!dueOn || dueOn >= today)
  return <form className="space-y-3 rounded border bg-card p-4" onSubmit={(e) => {
    e.preventDefault()
    if (!valid || create.isPending) return
    create.mutate({ data: { classId, subjectId, title: title.trim(), instructions: instructions.trim() || null,
      dueOn: dueOn || null, studentIds: audience === 'all' ? [] : students } }, { onSuccess: onDone })
  }}>
    <h3 className="font-semibold">Шинэ нэмэлт ажил</h3>
    <fieldset disabled={create.isPending} className="space-y-3">
      <label className="block space-y-1 text-sm"><span>Ажлын нэр</span><input className={NATIVE_INPUT} required maxLength={300} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
      <label className="block space-y-1 text-sm"><span>Заавар</span><textarea rows={4} maxLength={4000} className="w-full rounded border bg-transparent p-2" value={instructions} onChange={(e) => setInstructions(e.target.value)} /></label>
      <label className="block max-w-xs space-y-1 text-sm"><span>Хүлээлгэх өдөр · сонголттой</span><input type="date" min={today} className={NATIVE_INPUT} value={dueOn} onChange={(e) => setDueOn(e.target.value)} /></label>
      <p className="text-xs text-muted-foreground">Хоосон бол хугацаагүй. Хугацаа өнгөрсөн ч сурагч илгээж болно.</p>
      <label className="block max-w-xs space-y-1 text-sm"><span>Хэнд өгөх</span><select className={NATIVE_SELECT} value={audience} onChange={(e) => setAudience(e.target.value)}>
        <option value="all">Бүх ангид</option><option value="selected">Сонгосон сурагчдад</option>
      </select></label>
      {audience === 'selected' && <Recipients classId={classId} subjectId={subjectId} selected={students} onChange={setStudents} />}
      {audience === 'selected' && !students.length && <p className="text-sm">Дор хаяж нэг сурагч сонгоно уу.</p>}
      <div className="flex gap-2"><Button type="submit" disabled={!valid || create.isPending}>{create.isPending ? 'Үүсгэж байна…' : 'Ажил өгөх'}</Button>
        <Button type="button" variant="outline" onClick={onCancel}>Болих</Button></div>
    </fieldset>
    {create.error && <p role="alert" className="text-sm text-destructive">{create.error.data?.error ?? 'Үүсгэж чадсангүй.'}</p>}
  </form>
}

export function TeacherHomeworkDetail({ id }: { id: number }) {
  const { data, isLoading, error } = useGetHomeworkDetail(id)
  const active = useSetHomeworkActive()
  const client = useQueryClient()
  const [pendingOnly, setPendingOnly] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)
  if (isLoading) return <Skeleton className="h-64" />
  if (!data || error) return <p role="alert">{error?.data?.error ?? 'Ажлыг уншиж чадсангүй.'}</p>
  const students = data.students.filter((s) => !pendingOnly || !s.attempts.length)
  const changeActive = () => active.mutate({ homeworkId: id, data: { isActive: !data.isActive } }, { onSuccess: () => {
    setConfirmClose(false)
    void client.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).includes('/homework') })
  } })
  return <div className="space-y-4">
    <Link href={`/teacher/homework?classId=${data.classId}&subjectId=${data.subjectId}`} className="text-sm underline">← Нэмэлт ажлууд</Link>
    <HomeworkInfo {...data} />
    <p className="text-sm">{data.isActive ? 'Нээлттэй' : 'Буцааж авсан'} · {data.wholeClass ? 'Бүх анги' : 'Сонгосон сурагчид'} · {data.students.filter((s) => s.attempts.length).length}/{data.students.length} сурагч илгээсэн</p>
    {confirmClose ? <div className="space-y-2 rounded border p-3">
      <p className="text-sm">Буцааж авбал сурагч шинэ хариулт илгээх боломжгүй болно. Өмнөх оролдлогууд хадгалагдана.</p>
      <div className="flex gap-2"><Button disabled={active.isPending} onClick={changeActive}>Буцааж авах</Button><Button variant="outline" disabled={active.isPending} onClick={() => setConfirmClose(false)}>Болих</Button></div>
    </div> : <Button variant="outline" disabled={active.isPending} onClick={() => data.isActive ? setConfirmClose(true) : changeActive()}>
      {active.isPending ? 'Хадгалж байна…' : data.isActive ? 'Ажлыг буцааж авах' : 'Дахин нээх'}
    </Button>}
    {active.error && <p role="alert">{active.error.data?.error ?? 'Төлөвийг өөрчилж чадсангүй.'}</p>}
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={pendingOnly} onChange={(e) => setPendingOnly(e.target.checked)} />Зөвхөн илгээгээгүй сурагчид</label>
    {!students.length && <p className="text-sm text-muted-foreground">Энэ сонголтод сурагч алга байна.</p>}
    <ul className="space-y-3">{students.map((student) => <li key={student.studentId} className="space-y-2 rounded border bg-card p-3">
      <h3 className="font-semibold">{student.studentName} <span className="text-xs font-normal text-muted-foreground">{student.studentCode}</span></h3>
      {student.attempts.length ? <HomeworkAttempts attempts={student.attempts} /> : <p className="text-sm text-muted-foreground">Хариулт илгээгээгүй</p>}
    </li>)}</ul>
  </div>
}

function ClassHomework({ classId, subjectId }: { classId: number; subjectId: number }) {
  const { data, isLoading, error } = useGetClassHomework({ classId, subjectId })
  const client = useQueryClient()
  const [creating, setCreating] = useState(false)
  return <div className="space-y-4">
    {creating ? <NewHomework classId={classId} subjectId={subjectId} onCancel={() => setCreating(false)} onDone={() => {
      setCreating(false)
      void client.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).includes('/homework') })
    }} /> : <Button onClick={() => setCreating(true)}>Нэмэлт ажил өгөх</Button>}
    {isLoading ? <Skeleton className="h-48" /> : error ? <p role="alert">{error.data?.error ?? 'Жагсаалтыг уншиж чадсангүй.'}</p> : <>
      {!data?.length && <p className="text-sm text-muted-foreground">Энэ хичээлд нэмэлт ажил өгөөгүй байна.</p>}
      <ul className="divide-y rounded border bg-card">{data?.map((item) => <li key={item.homeworkId}>
        <Link href={`/teacher/homework?id=${item.homeworkId}`} className="block space-y-1 p-4 hover:bg-sidebar-active/40">
          <p className="break-words font-semibold">{item.title}</p>
          <p className="text-sm">{item.isActive ? 'Нээлттэй' : 'Буцааж авсан'} · {item.handedIn}/{item.given} илгээсэн · {Math.max(0, item.given - item.handedIn)} илгээгээгүй</p>
          <p className="text-sm text-muted-foreground">{item.dueOn ? `Хугацаа: ${item.dueOn}` : 'Хугацаагүй'}</p>
        </Link>
      </li>)}</ul>
    </>}
  </div>
}

export default function TeacherHomework() {
  const { data: classes, isLoading, error } = useGetTeacherClasses()
  const search = new URLSearchParams(useSearch())
  const id = Number(search.get('id'))
  const [, navigate] = useLocation()
  if (Number.isInteger(id) && id > 0) return <TeacherHomeworkDetail key={id} id={id} />
  if (isLoading) return <Skeleton className="h-64" />
  if (error) return <p role="alert">Ангиудыг уншиж чадсангүй.</p>
  const choices = classes?.filter((c) => c.canEdit && c.subjectId !== null) ?? []
  if (!choices.length) return <p>Нэмэлт ажил өгөх эрхтэй хичээл бүртгэгдээгүй байна.</p>
  const chosen = choices.find((c) => `${c.id}:${c.subjectId}` === `${search.get('classId')}:${search.get('subjectId')}`) ?? choices[0]!
  const key = `${chosen.id}:${chosen.subjectId}`
  return <div className="space-y-4">
    <h2 className="text-lg font-semibold">Нэмэлт ажил</h2>
    <label className="block max-w-sm space-y-1 text-sm"><span>Анги, хичээл</span><select className={NATIVE_SELECT} value={key} onChange={(e) => {
      const [classId, subjectId] = e.target.value.split(':')
      navigate(`/teacher/homework?classId=${classId}&subjectId=${subjectId}`, { replace: true })
    }}>
      {choices.map((c) => <option key={`${c.id}:${c.subjectId}`} value={`${c.id}:${c.subjectId}`}>{c.name} · {c.subject}</option>)}
    </select></label>
    <ClassHomework key={key} classId={Number(chosen.id)} subjectId={chosen.subjectId!} />
  </div>
}
