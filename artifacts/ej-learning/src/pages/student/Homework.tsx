import { useState } from 'react'
import { Link, useSearch } from 'wouter'
import { useQueryClient } from '@tanstack/react-query'
import { useGetMyHomework, useGetMyHomeworkDetail, useSubmitHomework } from '@workspace/api-client-react'
import { HomeworkInfo, HomeworkAttempts } from '@/components/homework'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

export function StudentHomeworkDetail({ id, closed }: { id: number; closed: boolean }) {
  const { data, isLoading, error } = useGetMyHomeworkDetail(id)
  const submit = useSubmitHomework()
  const client = useQueryClient()
  const [body, setBody] = useState('')
  const [notice, setNotice] = useState('')
  if (isLoading) return <Skeleton className="h-48" />
  if (!data || error) return <p role="alert">{error?.data?.error ?? 'Ажлыг уншиж чадсангүй.'}</p>
  return <div className="space-y-4">
    <HomeworkInfo {...data} />
    {closed ? <p role="status">Энэ ажлыг багш хаасан байна. Өмнөх оролдлогууд хадгалагдсан.</p> : <form className="space-y-3" onSubmit={(event) => {
      event.preventDefault()
      if (!body.trim() || submit.isPending) return
      submit.mutate({ homeworkId: id, data: { body: body.trim() } }, { onSuccess: (result) => {
        setBody('')
        setNotice(`${result.attemptNo}-р оролдлогыг илгээлээ.${result.isLate ? ' Хоцорч илгээсэн гэж бүртгэгдлээ.' : ''}`)
        void client.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).includes('/homework') })
      } })
    }}>
      <label className="block space-y-2 text-sm"><span>Таны хариулт</span>
        <textarea required maxLength={20000} rows={8} disabled={submit.isPending} value={body}
          onChange={(e) => { setBody(e.target.value); setNotice('') }} className="w-full rounded border bg-card p-3" />
      </label>
      <p className="text-xs text-muted-foreground">Хугацаа өнгөрсөн ч илгээж болно. Дахин илгээхэд өмнөх оролдлого хадгалагдана.</p>
      <Button disabled={submit.isPending || !body.trim()} type="submit">{submit.isPending ? 'Илгээж байна…' : 'Хариулт илгээх'}</Button>
      {submit.error && <p role="alert" className="text-sm text-destructive">{submit.error.data?.error ?? 'Илгээж чадсангүй. Хариулт тань хэвээр байна.'}</p>}
    </form>}
    {notice && <p role="status" className="text-sm">{notice}</p>}
    <h3 className="font-semibold">Өмнөх оролдлогууд · {data.attempts.length}</h3>
    {data.attempts.length ? <HomeworkAttempts attempts={data.attempts} /> : <p className="text-sm text-muted-foreground">Хариулт илгээгээгүй байна.</p>}
  </div>
}

export default function StudentHomework() {
  const { data, isLoading, error } = useGetMyHomework()
  const id = Number(new URLSearchParams(useSearch()).get('id'))
  const [filter, setFilter] = useState('all')
  if (isLoading) return <Skeleton className="h-64" />
  if (!data || error) return <p role="alert">{error?.data?.error ?? 'Ажлуудыг уншиж чадсангүй.'}</p>
  if (Number.isInteger(id) && id > 0) return <div className="space-y-4">
    <Link href="/homework" className="text-sm underline">← Нэмэлт ажлууд</Link>
    <StudentHomeworkDetail key={id} id={id} closed={!data.some((item) => item.homeworkId === id)} />
  </div>
  const rows = data.filter((row) => filter === 'all' || (filter === 'pending' ? row.attempts === 0 : row.attempts > 0))
  return <div className="space-y-4">
    <h2 className="text-lg font-semibold">Нэмэлт ажил</h2>
    <div className="flex flex-wrap gap-2" role="group" aria-label="Ажлын төлөв">
      {[['all', 'Бүгд'], ['pending', 'Илгээгээгүй'], ['submitted', 'Илгээсэн']].map(([value, label]) =>
        <Button key={value} variant={filter === value ? 'default' : 'outline'} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</Button>)}
    </div>
    {!rows.length && <p className="text-sm text-muted-foreground">Энэ төлөвтэй нэмэлт ажил алга байна.</p>}
    <ul className="divide-y rounded border bg-card">{rows.map((row) => <li key={row.homeworkId}>
      <Link href={`/homework?id=${row.homeworkId}`} className="block space-y-1 p-4 hover:bg-sidebar-active/40">
        <p className="break-words font-semibold">{row.title}</p>
        <p className="text-sm">{row.subjectName}{row.teacherName ? ` · ${row.teacherName}` : ''}</p>
        <p className="text-sm text-muted-foreground">{row.dueOn ? `Хугацаа: ${row.dueOn}` : 'Хугацаагүй'} · {row.attempts ? `${row.attempts} оролдлого илгээсэн` : 'Илгээгээгүй'}</p>
        {row.isOverdue && <p className="text-sm">Хугацаа өнгөрсөн — илгээх боломжтой.</p>}
      </Link>
    </li>)}</ul>
  </div>
}
