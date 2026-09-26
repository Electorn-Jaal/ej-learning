import { useState } from 'react'
import {
  useGetQuizPreview,
  useSetQuizQuestions,
  getGetQuizPreviewQueryKey,
  type QuizPreview,
  type QuizPreviewStudent,
} from '@workspace/api-client-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { NATIVE_SELECT } from '@/components/ui/native-select'

/**
 * Each child's questions for their next go at today's check (UC08, FR13).
 *
 * Closed until opened, so the class day does not ask for a paper per child
 * every time it loads. A choice holds for that child's next attempt only;
 * after it the ordinary rule - unseen questions first - takes over again.
 */
export function QuizPreviewPanel({ classId, lessonId }: { classId: number; lessonId: number }) {
  const [open, setOpen] = useState(false)
  return <details className="max-w-3xl rounded border bg-card" onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
    <summary className="cursor-pointer px-3 py-2 text-sm font-medium">Сурагч бүрийн асуулт (дараагийн оролдлого)</summary>
    {open && <Preview classId={classId} lessonId={lessonId} />}
  </details>
}

function Preview({ classId, lessonId }: { classId: number; lessonId: number }) {
  const params = { classId, lessonId }
  const { data, isLoading, error, refetch } = useGetQuizPreview(params, { query: { queryKey: getGetQuizPreviewQueryKey(params) } })
  if (isLoading) return <Skeleton className="m-3 h-24" />
  if (!data || error) return <div role="alert" className="space-y-1 p-3 text-sm">
    <p>{error?.data?.error ?? 'Асуултыг уншиж чадсангүй.'}</p>
    <button className="underline" onClick={() => void refetch()}>Дахин оролдох</button>
  </div>
  if (!data.pool.length) return <p className="p-3 text-sm text-muted-foreground">Энэ хичээлд шалгах асуулт алга.</p>
  if (!data.students.length) return <p className="p-3 text-sm text-muted-foreground">Энэ хичээл өнөөдөр оногдсон сурагч алга.</p>
  return <ul className="divide-y border-t">{data.students.map((s) =>
    <StudentRow key={s.studentId} classId={classId} lessonId={lessonId} preview={data} row={s} onChanged={() => void refetch()} />)}</ul>
}

function StudentRow({ classId, lessonId, preview, row, onChanged }: {
  classId: number; lessonId: number; preview: QuizPreview; row: QuizPreviewStudent; onChanged: () => void
}) {
  const set = useSetQuizQuestions()
  const prompt = new Map(preview.pool.map((q) => [q.itemId, q.prompt]))
  const send = (data: { mode: 'SET' | 'RESHUFFLE' | 'CLEAR'; itemIds?: number[] }) =>
    set.mutate({ data: { classId, lessonId, studentId: row.studentId, ...data } }, { onSuccess: onChanged })
  const spent = row.attemptsUsed >= row.attemptsAllowed
  return <li className="space-y-2 p-3 text-sm">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <p><span className="font-medium">{row.name}</span>
        <span className="ml-2 text-xs text-muted-foreground">{row.attemptsUsed}/{row.attemptsAllowed} оролдлого{row.overridden ? ' · багш сонгосон' : ''}</span></p>
      {!spent && <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={set.isPending} onClick={() => send({ mode: 'RESHUFFLE' })}>Дахин сонгох</Button>
        {row.overridden && <Button size="sm" variant="ghost" disabled={set.isPending} onClick={() => send({ mode: 'CLEAR' })}>Анхны журмаар</Button>}
      </div>}
    </div>
    {spent ? <p className="text-xs text-muted-foreground">Өнөөдрийн оролдлого дууссан.</p>
      : <ol className="space-y-1">{row.itemIds.map((id, index) => <li key={`${index}-${id}`} className="flex items-center gap-2">
        <span className="w-5 text-xs text-muted-foreground">{index + 1}.</span>
        <select aria-label={`${row.name}: ${index + 1}-р асуулт`} className={NATIVE_SELECT} disabled={set.isPending} value={id}
          onChange={(e) => {
            const next = [...row.itemIds]
            next[index] = Number(e.target.value)
            send({ mode: 'SET', itemIds: [...new Set(next)] })
          }}>
          {preview.pool.map((q) => <option key={q.itemId} value={q.itemId} disabled={q.itemId !== id && row.itemIds.includes(q.itemId)}>{prompt.get(q.itemId)}</option>)}
        </select>
      </li>)}</ol>}
    {set.error && <p role="alert" className="text-xs text-destructive">{set.error.data?.error ?? 'Хадгалж чадсангүй.'}</p>}
  </li>
}
