import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  useGetEnrollmentOverview,
  useSearchEnrollmentStudents,
  useTransferStudent,
  useSetClassTeacher,
  useGetEnrollmentHistory,
  useGetPromotionPreview,
  useApplyPromotion,
  getSearchEnrollmentStudentsQueryKey,
  getGetPromotionPreviewQueryKey,
  type EnrollmentClass,
  type EnrollmentStudent,
  type PromotionPreview,
  type PromotionResult,
} from '@workspace/api-client-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { NATIVE_INPUT, NATIVE_SELECT } from '@/components/ui/native-select'
import { schoolToday } from '@/lib/schedule-window'

/**
 * Moving children between classes (FR28) and a year up (FR29).
 *
 * Every move writes a history row, and a child's answers, marks and register
 * are keyed to the child, so nothing here can lose them. What the school has
 * not decided yet is deliberately not done: unfinished work is not carried
 * over (D07, D08) and a graduate's login is left alone (D09).
 */

const KIND: Record<string, string> = { TRANSFER: 'Шилжсэн', PROMOTE: 'Дэвшсэн', REPEAT: 'Давтан суусан', GRADUATE: 'Төгссөн' }
const classLabel = (c: EnrollmentClass) => `${c.name} · ${c.schoolYear}`

function useInvalidate() {
  const client = useQueryClient()
  return () => void client.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).includes('/admin/') })
}

function History({ studentId }: { studentId?: number }) {
  const { data, isLoading, error } = useGetEnrollmentHistory(studentId ? { studentId } : {})
  if (isLoading) return <Skeleton className="h-24" />
  if (!data || error) return <p role="alert">Түүхийг уншиж чадсангүй.</p>
  if (!data.length) return <p className="text-sm text-muted-foreground">Шилжилт бүртгэгдээгүй байна.</p>
  return <ul className="divide-y rounded border bg-card text-sm">{data.map((row) => <li key={row.id} className="space-y-0.5 p-3">
    <p><span className="font-medium">{row.studentName}</span> · {KIND[row.kind] ?? row.kind} · {row.effectiveOn}</p>
    <p className="text-muted-foreground">{row.fromClass ?? '—'} → {row.toClass ?? (row.kind === 'GRADUATE' ? 'төгссөн' : '—')}</p>
    {row.reason && <p>{row.reason}</p>}
    <p className="text-xs text-muted-foreground">{row.changedBy ?? ''}</p>
  </li>)}</ul>
}

function Transfer({ classes }: { classes: EnrollmentClass[] }) {
  const [q, setQ] = useState('')
  const [chosen, setChosen] = useState<EnrollmentStudent | null>(null)
  const [toClassId, setToClassId] = useState('')
  const [effectiveOn, setEffectiveOn] = useState(schoolToday())
  const [reason, setReason] = useState('')
  const [notice, setNotice] = useState('')
  const params = { q: q.trim() }
  const search = useSearchEnrollmentStudents(params, { query: { enabled: params.q.length >= 2, queryKey: getSearchEnrollmentStudentsQueryKey(params) } })
  const transfer = useTransferStudent()
  const invalidate = useInvalidate()
  return <div className="space-y-4">
    <label className="block max-w-md space-y-1 text-sm"><span>Сурагч хайх (нэр эсвэл код)</span>
      <input className={NATIVE_INPUT} value={q} onChange={(e) => { setQ(e.target.value); setChosen(null); setNotice('') }} />
    </label>
    {!chosen && q.trim().length >= 2 && (search.isLoading ? <Skeleton className="h-16" />
      : search.error ? <p role="alert">Хайж чадсангүй.</p>
      : !search.data?.length ? <p className="text-sm text-muted-foreground">Олдсонгүй.</p>
      : <ul className="divide-y rounded border bg-card">{search.data.map((s) => <li key={s.studentId}>
        <button className="w-full p-3 text-left text-sm hover:bg-sidebar-active/40" onClick={() => setChosen(s)}>
          <span className="font-medium">{s.name}</span> · {s.studentCode} · {s.className ?? 'ангигүй'}
        </button>
      </li>)}</ul>)}
    {chosen && <form className="space-y-3 rounded border bg-card p-4" onSubmit={(e) => {
      e.preventDefault()
      if (!toClassId) return
      transfer.mutate({ data: { studentId: chosen.studentId, toClassId: Number(toClassId), effectiveOn, reason } }, {
        onSuccess: (row) => { setNotice(`${row.studentName}: ${row.fromClass ?? '—'} → ${row.toClass}`); setChosen(null); setQ(''); setReason(''); invalidate() },
      })
    }}>
      <p className="text-sm"><span className="font-medium">{chosen.name}</span> · одоо: {chosen.className ?? 'ангигүй'}</p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-sm"><span>Шилжих анги</span>
          <select required className={NATIVE_SELECT} value={toClassId} onChange={(e) => setToClassId(e.target.value)}>
            <option value="">Сонгох</option>
            {classes.filter((c) => c.classId !== chosen.classId).map((c) => <option key={c.classId} value={c.classId}>{classLabel(c)}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-sm"><span>Огноо</span>
          <input type="date" required max={schoolToday()} className={NATIVE_INPUT} value={effectiveOn} onChange={(e) => setEffectiveOn(e.target.value)} />
        </label>
      </div>
      <label className="block space-y-1 text-sm"><span>Шалтгаан</span>
        <input className={NATIVE_INPUT} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      <p className="text-xs text-muted-foreground">Өмнөх хариулт, дүн, ирц сурагчид хэвээр үлдэнэ. Дуусаагүй ажил шинэ ангид автоматаар шилжихгүй.</p>
      <div className="flex gap-2">
        <Button type="submit" disabled={!toClassId || transfer.isPending}>{transfer.isPending ? 'Шилжүүлж байна…' : 'Шилжүүлэх'}</Button>
        <Button type="button" variant="ghost" onClick={() => setChosen(null)}>Болих</Button>
      </div>
      {transfer.error && <p role="alert" className="text-sm text-destructive">{transfer.error.data?.error ?? 'Шилжүүлж чадсангүй.'}</p>}
    </form>}
    {notice && <p role="status" className="text-sm">{notice}</p>}
    <h3 className="font-semibold">Сүүлийн шилжилтүүд</h3>
    <History />
  </div>
}

function ClassTeachers({ classes, teachers }: { classes: EnrollmentClass[]; teachers: { teacherId: number; name: string }[] }) {
  const [year, setYear] = useState(classes[0]?.schoolYear ?? '')
  const [effectiveOn, setEffectiveOn] = useState(schoolToday())
  const set = useSetClassTeacher()
  const invalidate = useInvalidate()
  const years = [...new Set(classes.map((c) => c.schoolYear))]
  return <div className="space-y-3">
    <div className="flex flex-wrap items-end gap-3">
      <label className="space-y-1 text-sm"><span>Хичээлийн жил</span>
        <select className={NATIVE_SELECT} value={year} onChange={(e) => setYear(e.target.value)}>{years.map((y) => <option key={y}>{y}</option>)}</select>
      </label>
      <label className="space-y-1 text-sm"><span>Өөрчлөлтийн огноо</span>
        <input type="date" className={NATIVE_INPUT} value={effectiveOn} onChange={(e) => setEffectiveOn(e.target.value)} />
      </label>
    </div>
    <ul className="divide-y rounded border bg-card">{classes.filter((c) => c.schoolYear === year).map((c) => <li key={c.classId} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
      <span><span className="font-medium">{c.name}</span> · {c.students} сурагч</span>
      <select aria-label={`${c.name} ангийн багш`} className={`${NATIVE_SELECT} w-64`} disabled={set.isPending} value={c.classTeacherId ?? ''}
        onChange={(e) => set.mutate({ data: { classId: c.classId, teacherId: e.target.value ? Number(e.target.value) : null, effectiveOn } }, { onSuccess: invalidate })}>
        <option value="">Ангийн багшгүй</option>
        {teachers.map((t) => <option key={t.teacherId} value={t.teacherId}>{t.name}</option>)}
      </select>
    </li>)}</ul>
    {set.error && <p role="alert" className="text-sm text-destructive">{set.error.data?.error ?? 'Хадгалж чадсангүй.'}</p>}
  </div>
}

type Action = 'PROMOTE' | 'REPEAT' | 'GRADUATE' | 'SKIP'
const ACTIONS: Record<Action, string> = { PROMOTE: 'Дэвших', REPEAT: 'Давтан суух', GRADUATE: 'Төгсөх', SKIP: 'Хөндөхгүй' }

function PromotionTable({ preview, onDone }: { preview: PromotionPreview; onDone: (r: PromotionResult) => void }) {
  const initial = (proposed: string): Action => proposed === 'PROMOTE' ? 'PROMOTE' : proposed === 'GRADUATE' ? 'GRADUATE' : 'SKIP'
  const [actions, setActions] = useState<Record<number, Action>>(() => Object.fromEntries(preview.rows.map((r) => [r.studentId, initial(r.proposed)])))
  const [effectiveOn, setEffectiveOn] = useState(schoolToday())
  const [confirming, setConfirming] = useState(false)
  const apply = useApplyPromotion()
  const count = (a: Action) => Object.values(actions).filter((x) => x === a).length
  const allowed = (grade: number, proposed: string): Action[] =>
    grade >= 12 ? ['GRADUATE', 'REPEAT', 'SKIP'] : proposed === 'MANUAL' ? ['SKIP'] : ['PROMOTE', 'REPEAT', 'SKIP']
  return <div className="space-y-3">
    <p className="text-sm">{preview.fromYear} → {preview.toYear}. Дэвших {count('PROMOTE')}, давтан суух {count('REPEAT')}, төгсөх {count('GRADUATE')}, хөндөхгүй {count('SKIP')}.</p>
    {preview.newClasses.length > 0 && <p className="text-sm text-muted-foreground">Шинээр үүсэх анги: {preview.newClasses.join(', ')}</p>}
    {preview.rows.some((r) => r.proposed === 'MANUAL') && <p className="text-sm">Нэр нь ангийн тоогоор эхлээгүй бүлгийн сурагчдыг автоматаар шилжүүлэхгүй — «Сурагч шилжүүлэх»-ээр гараар шийднэ.</p>}
    <div className="overflow-x-auto rounded border bg-card"><table className="w-full text-sm">
      <thead><tr className="border-b text-left"><th className="p-2">Сурагч</th><th className="p-2">Одоо</th><th className="p-2">Дараа жил</th><th className="p-2">Шийдвэр</th></tr></thead>
      <tbody>{preview.rows.map((r) => <tr key={r.studentId} className="border-b last:border-0">
        <td className="p-2">{r.name}</td><td className="p-2">{r.fromClass}</td>
        <td className="p-2 text-muted-foreground">{actions[r.studentId] === 'PROMOTE' ? r.toClass : actions[r.studentId] === 'REPEAT' ? r.fromClass : actions[r.studentId] === 'GRADUATE' ? 'төгссөн' : '—'}</td>
        <td className="p-2"><select aria-label={`${r.name} шийдвэр`} className={NATIVE_SELECT} value={actions[r.studentId]}
          onChange={(e) => { setConfirming(false); setActions({ ...actions, [r.studentId]: e.target.value as Action }) }}>
          {allowed(r.gradeLevel, r.proposed).map((a) => <option key={a} value={a}>{ACTIONS[a]}</option>)}
        </select></td>
      </tr>)}</tbody>
    </table></div>
    <label className="space-y-1 text-sm"><span>Хүчинтэй огноо</span>
      <input type="date" className={NATIVE_INPUT} value={effectiveOn} onChange={(e) => { setConfirming(false); setEffectiveOn(e.target.value) }} />
    </label>
    <p className="text-xs text-muted-foreground">Бүгд нэг дор хийгдэнэ: алдаа гарвал хэн ч шилжихгүй. Дахин ажиллуулахад аль хэдийн шилжсэн сурагчийг алгасна. Төгсөгчийн нэвтрэх бүртгэлийг хөндөхгүй.</p>
    {!confirming
      ? <Button disabled={!preview.rows.length} onClick={() => setConfirming(true)}>Батлах…</Button>
      : <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm">{count('PROMOTE') + count('REPEAT') + count('GRADUATE')} сурагчийг шилжүүлэх үү?</span>
        <Button disabled={apply.isPending} onClick={() => apply.mutate({ data: { fromYear: preview.fromYear, effectiveOn,
          decisions: preview.rows.map((r) => ({ studentId: r.studentId, action: actions[r.studentId] })) } }, { onSuccess: onDone })}>
          {apply.isPending ? 'Шилжүүлж байна…' : 'Тийм, батлах'}
        </Button>
        <Button variant="ghost" onClick={() => setConfirming(false)}>Болих</Button>
      </div>}
    {apply.error && <p role="alert" className="text-sm text-destructive">{apply.error.data?.error ?? 'Батлаж чадсангүй. Хэн ч шилжээгүй.'}</p>}
  </div>
}

function Promotion({ years }: { years: string[] }) {
  const [fromYear, setFromYear] = useState(years[0] ?? '')
  const [result, setResult] = useState<PromotionResult | null>(null)
  const preview = useGetPromotionPreview({ fromYear }, { query: { enabled: !!fromYear, queryKey: getGetPromotionPreviewQueryKey({ fromYear }) } })
  const invalidate = useInvalidate()
  return <div className="space-y-3">
    <label className="space-y-1 text-sm"><span>Аль жилийг дэвшүүлэх</span>
      <select className={NATIVE_SELECT} value={fromYear} onChange={(e) => { setFromYear(e.target.value); setResult(null) }}>{years.map((y) => <option key={y}>{y}</option>)}</select>
    </label>
    {result && <p role="status" className="rounded border bg-card p-3 text-sm">
      {result.toYear}: дэвшсэн {result.promoted}, давтан {result.repeated}, төгссөн {result.graduated}, хөндөөгүй {result.skipped}.
      {result.createdClasses.length ? ` Шинэ анги: ${result.createdClasses.join(', ')}.` : ''}
    </p>}
    {preview.isLoading ? <Skeleton className="h-40" />
      : preview.error || !preview.data ? <p role="alert">Урьдчилсан харагдацыг уншиж чадсангүй.</p>
      : !preview.data.rows.length ? <p className="text-sm text-muted-foreground">Энэ жилийн идэвхтэй ангид сурагч алга.</p>
      : <PromotionTable key={fromYear + preview.dataUpdatedAt} preview={preview.data} onDone={(r) => { setResult(r); invalidate(); void preview.refetch() }} />}
  </div>
}

export default function AdminEnrollment() {
  const { data, isLoading, error, refetch } = useGetEnrollmentOverview()
  const [tab, setTab] = useState<'transfer' | 'teachers' | 'promotion'>('transfer')
  if (isLoading) return <Skeleton className="h-64" />
  if (!data || error) return <div role="alert" className="space-y-2"><p>Ангийн мэдээллийг уншиж чадсангүй.</p>
    <button className="underline" onClick={() => void refetch()}>Дахин оролдох</button></div>
  return <div className="space-y-4">
    <div className="flex flex-wrap gap-2" role="tablist">
      {([['transfer', 'Сурагч шилжүүлэх'], ['teachers', 'Ангийн багш'], ['promotion', 'Жилийн дэвшилт']] as const).map(([key, label]) =>
        <Button key={key} role="tab" aria-selected={tab === key} variant={tab === key ? 'default' : 'outline'} onClick={() => setTab(key)}>{label}</Button>)}
    </div>
    {tab === 'transfer' && <Transfer classes={data.classes} />}
    {tab === 'teachers' && <ClassTeachers classes={data.classes} teachers={data.teachers} />}
    {tab === 'promotion' && <Promotion years={data.schoolYears} />}
  </div>
}
