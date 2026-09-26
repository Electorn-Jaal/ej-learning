import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  useGetTeacherClasses,
  useGetClassChildren,
  getGetClassChildrenQueryKey,
  useCreateGuardianInvite,
  useGetGuardianRequests,
  useDecideGuardianRequest,
  type GuardianInvite,
  type GuardianRequest,
} from '@workspace/api-client-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { NATIVE_INPUT, NATIVE_SELECT } from '@/components/ui/native-select'

/**
 * Parents signing themselves up (FR27): a one-time code for a child, then the
 * requests that come back with it. The code is shown once, like a password;
 * a new code for the same child retires the old one.
 */
export function GuardianInvites() {
  const { data: classes } = useGetTeacherClasses()
  const unique = [...new Map((classes ?? []).map((row) => [row.id, row])).values()]
  const [classId, setClassId] = useState('')
  const [studentId, setStudentId] = useState('')
  const [made, setMade] = useState<GuardianInvite | null>(null)
  const chosenClass = Number(classId || unique[0]?.id || 0)
  const params = { classId: chosenClass }
  const children = useGetClassChildren(params, { query: { enabled: chosenClass > 0, queryKey: getGetClassChildrenQueryKey(params) } })
  const create = useCreateGuardianInvite()
  return <section className="space-y-3 rounded-[2px] border bg-card p-4">
    <h3 className="font-semibold">Урилгын код</h3>
    <p className="text-sm text-muted-foreground">Эцэг эх энэ кодоор «Бүртгүүлэх» хуудсаас хүсэлт илгээнэ. Код 14 хоног хүчинтэй, нэг удаа ашиглагдана.</p>
    <div className="flex flex-wrap items-end gap-3">
      <label className="space-y-1 text-sm"><span>Анги</span>
        <select className={NATIVE_SELECT} value={String(chosenClass)} onChange={(e) => { setClassId(e.target.value); setStudentId(''); setMade(null) }}>
          {unique.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select></label>
      <label className="space-y-1 text-sm"><span>Сурагч</span>
        <select className={NATIVE_SELECT} value={studentId} onChange={(e) => { setStudentId(e.target.value); setMade(null) }}>
          <option value="">Сонгох</option>
          {(children.data ?? []).map((c) => <option key={c.studentId} value={c.studentId}>{c.displayName}{c.linked ? ' · холбоотой' : ''}</option>)}
        </select></label>
      <Button disabled={!studentId || create.isPending} onClick={() => create.mutate({ data: { studentId: Number(studentId) } }, { onSuccess: setMade })}>Код гаргах</Button>
    </div>
    {made && <p role="status" className="text-sm">Код: <span className="select-all font-mono text-base font-semibold">{made.code}</span>
      <span className="ml-2 text-xs text-muted-foreground">{new Date(made.expiresAt).toLocaleDateString('mn-MN')} хүртэл. Энэ дэлгэцээс гарвал дахин харагдахгүй.</span></p>}
    {create.error && <p role="alert" className="text-sm text-destructive">{create.error.data?.error ?? 'Код гаргаж чадсангүй.'}</p>}
  </section>
}

export function GuardianRequests({ onDecided }: { onDecided: () => void }) {
  const { data, isLoading, error, refetch } = useGetGuardianRequests()
  if (isLoading) return <Skeleton className="h-24" />
  if (!data || error) return <div role="alert" className="text-sm">Хүсэлтүүдийг уншиж чадсангүй. <button className="underline" onClick={() => void refetch()}>Дахин оролдох</button></div>
  return <section className="space-y-3">
    <h3 className="font-semibold">Бүртгүүлэх хүсэлт · {data.length}</h3>
    {!data.length ? <p className="text-sm text-muted-foreground">Шийдэх хүсэлт алга.</p>
      : <ul className="divide-y rounded-[2px] border bg-card">{data.map((r) =>
        <RequestRow key={r.id} row={r} onDone={() => { void refetch(); onDecided() }} />)}</ul>}
  </section>
}

function RequestRow({ row, onDone }: { row: GuardianRequest; onDone: () => void }) {
  const decide = useDecideGuardianRequest()
  const client = useQueryClient()
  const [replace, setReplace] = useState(false)
  const [note, setNote] = useState('')
  const send = (approve: boolean) => decide.mutate({ requestId: row.id, data: { approve, replaceExisting: replace, note } }, {
    onSuccess: () => { void client.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).includes('/admin/guardian') }); onDone() },
  })
  return <li className="space-y-2 p-3 text-sm">
    <p><span className="font-medium">{row.displayName}</span> ({row.username}){row.relation ? ` · ${row.relation}` : ''}</p>
    <p>Хүүхэд: {row.studentName}{row.className ? ` · ${row.className}` : ''}</p>
    <p className="text-xs text-muted-foreground">{new Date(row.createdAt).toLocaleString('mn-MN', { timeZone: 'Asia/Ulaanbaatar' })}</p>
    {row.currentGuardian && <label className="flex items-start gap-2">
      <input type="checkbox" className="mt-1" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
      <span>Одоогийн эцэг эх <span className="font-medium">{row.currentGuardian}</span>-ийг энэ хүсэлтээр солих</span>
    </label>}
    <input className={NATIVE_INPUT} maxLength={1000} placeholder="Тэмдэглэл (заавал биш)" value={note} onChange={(e) => setNote(e.target.value)} />
    <div className="flex gap-2">
      <Button size="sm" disabled={decide.isPending || (!!row.currentGuardian && !replace)} onClick={() => send(true)}>Батлах</Button>
      <Button size="sm" variant="destructive" disabled={decide.isPending} onClick={() => send(false)}>Татгалзах</Button>
    </div>
    {decide.error && <p role="alert" className="text-xs text-destructive">{decide.error.data?.error ?? 'Шийдвэрлэж чадсангүй.'}</p>}
  </li>
}
