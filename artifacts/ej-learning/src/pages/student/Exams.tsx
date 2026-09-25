import { useState } from 'react'
import {
  useGetStudentExams,
  useGetStudentExam,
  useSubmitExam,
  type StudentExamSummary,
} from '@workspace/api-client-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

const WHEN = new Intl.DateTimeFormat('mn-MN', {
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Ulaanbaatar',
})

const at = (iso: string) => WHEN.format(new Date(iso))

const KIND: Record<string, string> = {
  UNIT: 'Сарын шалгалт',
  TERM: 'Улирлын шалгалт',
  YEAR: 'Жилийн шалгалт',
  DIAGNOSTIC: 'Оношилгоо',
}

/**
 * One paper, sat in one go.
 *
 * Nothing is saved until Илгээх, and there is no second chance after it: that
 * is the difference between this and the check at the end of a lesson, and the
 * screen says so before the child starts rather than after they find out.
 */
function Sitting({ sittingId, onDone }: { sittingId: number; onDone: () => void }) {
  const { data, isLoading } = useGetStudentExam(sittingId)
  const { mutate: submit, isPending, error } = useSubmitExam()
  const [chosen, setChosen] = useState<Record<number, number>>({})
  const [done, setDone] = useState<{ score: number; max: number } | null>(null)

  if (isLoading || !data) return <Skeleton className="h-96 w-full" />

  if (done) {
    return (
      <div className="space-y-3 rounded-[2px] border border-border bg-card p-6">
        <p className="text-sm font-medium">
          {data.title}: {done.max} оноогоос <strong>{done.score}</strong>.
        </p>
        <p className="text-xs text-muted-foreground">
          Зөв хариултыг багш нээхэд харагдана.
        </p>
        <Button size="sm" variant="outline" onClick={onDone}>Буцах</Button>
      </div>
    )
  }

  if (!data.isOpen || data.questions.length === 0) {
    return (
      <div className="space-y-2 rounded-[2px] border border-border bg-card p-6">
        <p className="text-sm font-medium">{data.title}</p>
        <p className="text-sm text-muted-foreground">
          {data.attemptsUsed >= data.attemptsAllowed
            ? 'Энэ шалгалтыг өгсөн байна.'
            : `${at(data.opensAt)} — ${at(data.closesAt)} хооронд өгнө.`}
        </p>
        <Button size="sm" variant="outline" onClick={onDone}>Буцах</Button>
      </div>
    )
  }

  const answered = data.questions.filter((row) => chosen[row.itemId] !== undefined).length

  return (
    <div className="space-y-5 rounded-[2px] border border-border bg-card p-6">
      <div className="space-y-1">
        <p className="text-sm font-semibold">{data.title}</p>
        <p className="text-xs text-muted-foreground">
          {data.questions.length} асуулт · {at(data.closesAt)}-д хаагдана · нэг удаа өгнө
        </p>
        {data.instructions ? (
          <p className="whitespace-pre-line text-sm">{data.instructions}</p>
        ) : null}
      </div>

      {data.questions.map((question, index) => (
        <fieldset key={question.itemId} className="space-y-3">
          <legend className="text-sm font-medium">
            {index + 1}. {question.title}
          </legend>
          {question.stimulus ? (
            <p className="whitespace-pre-line border-l-2 border-border pl-3 text-sm text-muted-foreground">
              {question.stimulus}
            </p>
          ) : null}
          <RadioGroup
            value={String(chosen[question.itemId] ?? '')}
            onValueChange={(value) =>
              setChosen((prev) => ({ ...prev, [question.itemId]: Number(value) }))}
            disabled={isPending}
            className="grid grid-cols-1 gap-2 sm:grid-cols-2"
          >
            {question.options.map((option) => {
              const inputId = `e${question.itemId}-${option.optionId}`
              return (
                <div
                  key={option.optionId}
                  className={cn(
                    'flex items-center gap-3 rounded-md border px-3 py-2 transition-colors',
                    'hover:bg-muted/50',
                  )}
                >
                  <RadioGroupItem value={String(option.optionId)} id={inputId} />
                  <Label htmlFor={inputId} className="flex-1 cursor-pointer font-normal">
                    {option.text}
                  </Label>
                </div>
              )
            })}
          </RadioGroup>
        </fieldset>
      ))}

      <div className="flex flex-wrap items-center gap-3 border-t pt-4">
        <Button
          disabled={isPending}
          onClick={() => submit({
            sittingId,
            data: {
              answers: data.questions.map((question) => ({
                itemId: question.itemId,
                optionId: chosen[question.itemId] ?? null,
              })),
            },
          }, {
            onSuccess: (result) => setDone({ score: result.score, max: result.maxScore }),
          })}
        >
          {isPending ? 'Илгээж байна…' : 'Илгээх'}
        </Button>
        <span className="text-sm text-muted-foreground">
          {answered}/{data.questions.length} хариулсан
        </span>
        {error ? (
          <span role="alert" className="text-xs text-destructive">
            {error?.data?.error ?? 'Илгээж чадсангүй.'}
          </span>
        ) : null}
      </div>
    </div>
  )
}

function Row({ exam, onOpen }: { exam: StudentExamSummary; onOpen: () => void }) {
  const sat = exam.attemptsUsed > 0
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{exam.title}</span>
        <span className="block text-xs text-muted-foreground">
          {exam.subjectName} · {KIND[exam.examKind] ?? exam.examKind} ·{' '}
          {at(exam.opensAt)} — {at(exam.closesAt)}
        </span>
      </span>

      {sat && exam.maxScore ? (
        <span className="shrink-0 text-sm font-semibold tabular-nums">
          {exam.score}/{exam.maxScore}
        </span>
      ) : null}

      {exam.isOpen ? (
        <Button size="sm" onClick={onOpen}>{sat ? 'Дахин өгөх' : 'Өгөх'}</Button>
      ) : (
        <span className="text-xs text-muted-foreground">
          {sat ? 'Өгсөн' : Date.parse(exam.opensAt) > Date.now() ? 'Хараахан нээгээгүй' : 'Хаагдсан'}
        </span>
      )}
    </li>
  )
}

/**
 * The exams set for this child.
 *
 * Separate from the daily check on purpose. One is practice with three goes
 * and no consequence; the other is sat once, in a window the whole class
 * shares, and is what the child's progress is actually built from. Putting
 * them on one screen would teach a child they are the same thing.
 */
export default function StudentExams() {
  const { data, isLoading, isError } = useGetStudentExams()
  const [open, setOpen] = useState<number | null>(null)

  if (isLoading) return <Skeleton className="h-64 w-full" />
  if (isError) {
    return <p role="alert" className="text-sm text-destructive">Шалгалтуудыг уншиж чадсангүй.</p>
  }
  if (open !== null) {
    return <Sitting sittingId={open} onDone={() => setOpen(null)} />
  }
  if (!data?.length) {
    return (
      <p className="rounded-[2px] border border-border bg-card p-6 text-sm text-muted-foreground">
        Одоогоор танд оногдсон шалгалт алга байна.
      </p>
    )
  }

  return (
    <ul className="divide-y divide-border rounded-[2px] border border-border bg-card">
      {data.map((exam) => (
        <Row key={exam.sittingId} exam={exam} onOpen={() => setOpen(exam.sittingId)} />
      ))}
    </ul>
  )
}
