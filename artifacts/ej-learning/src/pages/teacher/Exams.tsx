import { useState } from 'react'
import {
  useGetTeacherClasses,
  useGetTeacherExams,
  useGetTeacherExam,
  useCreateExam,
  useReopenExam,
  useReleaseExamAnswers,
  useEnterPaperAnswers,
  type ExamSummary,
  type ExamKind,
  type ExamQuestion,
  type ExamStudentResult,
} from '@workspace/api-client-react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { NATIVE_INPUT, NATIVE_SELECT } from '@/components/ui/native-select'
import { hasRole, useSession } from '@/lib/session'
import { cn } from '@/lib/utils'

const WHEN = new Intl.DateTimeFormat('mn-MN', {
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Ulaanbaatar',
})
const at = (iso: string) => WHEN.format(new Date(iso))

const KINDS: Array<{ value: ExamKind; label: string }> = [
  { value: 'UNIT', label: 'Сарын шалгалт' },
  { value: 'TERM', label: 'Улирлын шалгалт' },
  { value: 'YEAR', label: 'Жилийн шалгалт' },
  { value: 'DIAGNOSTIC', label: 'Оношилгоо' },
]

/** A datetime-local value for an input, in the school's own clock. */
function localValue(offsetHours: number) {
  const now = new Date(Date.now() + offsetHours * 3600 * 1000)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
    + `T${pad(now.getHours())}:${pad(now.getMinutes())}`
}

/**
 * Setting a paper.
 *
 * Both ends of the window are asked for, because an exam that opens and never
 * closes is homework, and the closing time is what makes "sat it" mean the
 * same thing for every child in the room.
 *
 * The question count draws from the year's bank. A teacher who wants to choose
 * each question by hand can still do it through the API; this screen covers the
 * case the school actually has, which is a teacher who wants twenty questions
 * on Thursday and does not want to pick them one at a time.
 */
function NewExam({ classId, subjectId, onDone }: {
  classId: number
  subjectId: number
  onDone: () => void
}) {
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<ExamKind>('UNIT')
  const [opensAt, setOpensAt] = useState(() => localValue(0))
  const [closesAt, setClosesAt] = useState(() => localValue(24))
  const [count, setCount] = useState('10')
  const [onPaper, setOnPaper] = useState(false)
  const { mutate: create, isPending, error } = useCreateExam()

  return (
    <div className="space-y-3 rounded-[2px] border border-border bg-card p-4">
      <p className="text-sm font-semibold">Шинэ шалгалт</p>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 space-y-0.5 sm:max-w-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Нэр</p>
          <input
            type="text" className={NATIVE_INPUT} maxLength={300}
            aria-label="Шалгалтын нэр" placeholder="1-р улирлын шалгалт"
            value={title} onChange={(event) => setTitle(event.target.value)}
          />
        </div>
        <div className="space-y-0.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Төрөл</p>
          <select
            className={cn(NATIVE_SELECT, 'w-auto')} aria-label="Шалгалтын төрөл"
            value={kind} onChange={(event) => setKind(event.target.value as ExamKind)}
          >
            {KINDS.map((row) => (
              <option key={row.value} value={row.value}>{row.label}</option>
            ))}
          </select>
        </div>
        <div className="space-y-0.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Асуулт</p>
          <input
            type="number" min={1} max={100} inputMode="numeric"
            className={cn(NATIVE_INPUT, 'w-20')} aria-label="Асуултын тоо"
            value={count} onChange={(event) => setCount(event.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-0.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Нээх</p>
          <input
            type="datetime-local" className={cn(NATIVE_INPUT, 'w-52')}
            aria-label="Нээх хугацаа"
            value={opensAt} onChange={(event) => setOpensAt(event.target.value)}
          />
        </div>
        <div className="space-y-0.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Хаах</p>
          <input
            type="datetime-local" className={cn(NATIVE_INPUT, 'w-52')}
            aria-label="Хаах хугацаа"
            value={closesAt} onChange={(event) => setClosesAt(event.target.value)}
          />
        </div>
      </div>

      {/* Цаасаар. The questions still come from the bank and keep their
          numbers, which is what lets the marks be traced afterwards - and what
          makes a paper exam comparable with an online one instead of a
          separate system. */}
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox" className="h-3.5 w-3.5" disabled={isPending}
          checked={onPaper} onChange={(event) => setOnPaper(event.target.checked)}
        />
        <span>Цаасаар авна — хариултыг багш оруулна</span>
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          size="sm"
          disabled={isPending || title.trim() === '' || opensAt === '' || closesAt === ''}
          onClick={() => create({
            data: {
              classId, subjectId, examKind: kind, title,
              opensAt: new Date(opensAt).toISOString(),
              closesAt: new Date(closesAt).toISOString(),
              drawCount: Number(count) || 0,
              onPaper,
            },
          }, { onSuccess: onDone })}
        >
          {isPending ? 'Үүсгэж байна…' : 'Үүсгэх'}
        </Button>
        <span className="text-xs text-muted-foreground">
          Асуултууд энэ ангийн сангаас санамсаргүй сонгогдоно.
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

/**
 * Typing in what one child wrote on paper.
 *
 * Question by question, in the printed order, because that is how the sheet in
 * front of the teacher is laid out. A total box would be quicker and would
 * throw away the only thing an exam is useful for afterwards: which questions
 * the class got wrong.
 *
 * A question with options is answered by picking one. A question without -
 * the ones with a rubric rather than four boxes - takes a score, because
 * nothing but the teacher reading the page can settle it.
 */
function PaperEntry({ sittingId, student, questions, onDone }: {
  sittingId: number
  student: ExamStudentResult
  questions: ExamQuestion[]
  onDone: () => void
}) {
  const [given, setGiven] = useState<Record<number, string>>({})
  const { mutate: enter, isPending, error } = useEnterPaperAnswers()

  return (
    <div className="space-y-3 border-t border-border bg-muted/30 px-4 py-3">
      <p className="text-xs font-semibold">{student.studentName} — цаасан хариулт</p>
      <ol className="space-y-2">
        {questions.map((question, index) => (
          <li key={question.itemId} className="flex flex-wrap items-center gap-2 text-xs">
            <span className="w-6 shrink-0 tabular-nums text-muted-foreground">{index + 1}.</span>
            {question.options.length > 0 ? (
              <select
                className={cn(NATIVE_SELECT, 'w-auto min-w-40')}
                aria-label={`${index + 1}-р асуултын хариулт`}
                disabled={isPending}
                value={given[question.itemId] ?? ''}
                onChange={(event) =>
                  setGiven((prev) => ({ ...prev, [question.itemId]: event.target.value }))}
              >
                <option value="">Хариулаагүй</option>
                {question.options.map((option, at) => (
                  <option key={option.optionId} value={String(option.optionId)}>
                    {String.fromCharCode(65 + at)}. {option.text}
                  </option>
                ))}
              </select>
            ) : (
              <>
                <input
                  type="number" min={0} max={question.maxScore} step="0.5" inputMode="decimal"
                  className={cn(NATIVE_INPUT, 'w-20')}
                  aria-label={`${index + 1}-р асуултын оноо`}
                  disabled={isPending}
                  value={given[question.itemId] ?? ''}
                  onChange={(event) =>
                    setGiven((prev) => ({ ...prev, [question.itemId]: event.target.value }))}
                />
                <span className="text-muted-foreground">/ {question.maxScore}</span>
              </>
            )}
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{question.title}</span>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          size="sm"
          disabled={isPending}
          onClick={() => enter({
            sittingId,
            data: {
              studentId: student.studentId,
              answers: questions.map((question) => {
                const raw = given[question.itemId] ?? ''
                if (question.options.length > 0) {
                  return { itemId: question.itemId, optionId: raw === '' ? null : Number(raw) }
                }
                return { itemId: question.itemId, awarded: raw === '' ? 0 : Number(raw) }
              }),
            },
          }, { onSuccess: onDone })}
        >
          {isPending ? 'Хадгалж байна…' : 'Хадгалах'}
        </Button>
        <Button size="sm" variant="outline" disabled={isPending} onClick={onDone}>Болих</Button>
        {error ? (
          <span role="alert" className="text-xs text-destructive">
            {error?.data?.error ?? 'Хадгалж чадсангүй.'}
          </span>
        ) : null}
      </div>
    </div>
  )
}

/** One exam opened: the key, and who has sat it. */
function ExamDetail({ sittingId, onBack }: { sittingId: number; onBack: () => void }) {
  const queryClient = useQueryClient()
  const { data, isLoading } = useGetTeacherExam(sittingId)
  const { mutate: reopen } = useReopenExam()
  const { mutate: release, isPending: releasing } = useReleaseExamAnswers()
  const [entering, setEntering] = useState<number | null>(null)
  const refresh = () => queryClient.invalidateQueries({
    predicate: (query) => typeof query.queryKey[0] === 'string'
      && query.queryKey[0].includes('/teacher/exams'),
  })

  if (isLoading || !data) return <Skeleton className="h-96 w-full" />

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" variant="outline" onClick={onBack}>Буцах</Button>
        <span className="text-sm font-semibold">{data.title}</span>
        <span className="text-xs text-muted-foreground">
          {at(data.opensAt)} — {at(data.closesAt)}
          {data.onPaper ? ' · цаасаар' : ''}
        </span>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox" className="h-3.5 w-3.5" disabled={releasing}
            checked={data.answersOpen}
            onChange={(event) =>
              release({ sittingId, data: { open: event.target.checked } }, { onSuccess: refresh })}
          />
          <span>Зөв хариултыг нээх</span>
        </label>
      </div>

      <ul className="divide-y divide-border rounded-[2px] border border-border bg-card">
        {data.results.map((row) => (
          <li key={row.studentId}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2">
              <span className="min-w-0 flex-1 truncate text-sm">
                {row.studentName}
                <span className="ml-2 text-xs text-muted-foreground">{row.studentCode}</span>
              </span>
              {row.attemptId ? (
                <>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">
                    {row.score}/{row.maxScore}
                  </span>
                  <Button
                    size="sm" variant="outline"
                    onClick={() => reopen(
                      { sittingId, data: { studentIds: [row.studentId] } },
                      { onSuccess: refresh },
                    )}
                  >
                    Дахин өгүүлэх
                  </Button>
                </>
              ) : data.onPaper ? (
                <Button
                  size="sm"
                  onClick={() => setEntering(entering === row.studentId ? null : row.studentId)}
                >
                  {entering === row.studentId ? 'Хаах' : 'Хариулт оруулах'}
                </Button>
              ) : (
                <span className="text-xs text-muted-foreground">Өгөөгүй</span>
              )}
            </div>
            {data.onPaper && entering === row.studentId ? (
              <PaperEntry
                sittingId={sittingId}
                student={row}
                questions={data.questions}
                onDone={() => { setEntering(null); refresh() }}
              />
            ) : null}
          </li>
        ))}
      </ul>

      {/* The key, for the person who has to judge whether a question is any
          good - which cannot be done without seeing which option is meant to
          be right. */}
      <ol className="space-y-3 rounded-[2px] border border-border bg-card p-4">
        {data.questions.map((question, index) => (
          <li key={question.itemId} className="space-y-1">
            <p className="text-sm">{index + 1}. {question.title}</p>
            <ul className="space-y-0.5 pl-4">
              {question.options.map((option) => (
                <li
                  key={option.optionId}
                  className={cn('text-xs', option.isCorrect ? 'font-semibold text-success' : 'text-muted-foreground')}
                >
                  {option.text}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  )
}

function Row({ exam, onOpen }: { exam: ExamSummary; onOpen: () => void }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{exam.title}</span>
        <span className="block text-xs text-muted-foreground">
          {exam.subjectName} · {exam.questionCount} асуулт · {at(exam.opensAt)} — {at(exam.closesAt)}
          {exam.wholeClass ? '' : ' · сонгосон сурагчид'}
          {exam.onPaper ? ' · цаасаар' : ''}
        </span>
      </span>
      <span className="shrink-0 text-sm tabular-nums">{exam.sat}/{exam.invited}</span>
      <Button size="sm" variant="outline" onClick={onOpen}>Нээх</Button>
    </li>
  )
}

/**
 * Exams a teacher sets, as opposed to the check at the end of a lesson.
 *
 * The daily check stopped feeding skill progress because five questions and
 * three tries on a Tuesday afternoon said nothing about what a child can do.
 * This is what replaced it, so it has its own screen rather than a tab on the
 * quiz results.
 */
export default function TeacherExams() {
  const { user } = useSession()
  const admin = hasRole(user, 'ADMIN')
  const queryClient = useQueryClient()
  const { data: classes, isLoading } = useGetTeacherClasses()
  const [chosenClass, setChosenClass] = useState<string | null>(null)
  const [chosenSubject, setChosenSubject] = useState<string | null>(null)
  const [open, setOpen] = useState<number | null>(null)
  const [adding, setAdding] = useState(false)

  if (isLoading) return <Skeleton className="h-64 w-full" />
  if (!classes?.length) {
    return <p className="text-sm text-muted-foreground">Анги олдсонгүй.</p>
  }

  const uniqueClasses = [...new Map(classes.map((entry) => [entry.id, entry])).values()]
  const classId = Number(
    uniqueClasses.find((entry) => String(entry.id) === chosenClass)?.id ?? uniqueClasses[0]!.id,
  )
  const entries = classes.filter((entry) => Number(entry.id) === classId)
  const subjects = entries
    .filter((entry) => entry.subjectId !== null)
    .map((entry) => ({ subjectId: entry.subjectId!, subject: entry.subject }))
  const subjectId = subjects.find((entry) => String(entry.subjectId) === chosenSubject)?.subjectId
    ?? subjects[0]?.subjectId
    ?? null
  const canEdit = entries.find((entry) => entry.subjectId === subjectId)?.canEdit ?? admin

  if (open !== null) {
    return <ExamDetail sittingId={open} onBack={() => setOpen(null)} />
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select
          className={cn(NATIVE_SELECT, 'w-auto')} aria-label="Анги"
          value={String(classId)}
          onChange={(event) => { setChosenClass(event.target.value); setChosenSubject(null) }}
        >
          {uniqueClasses.map((entry) => (
            <option key={entry.id} value={String(entry.id)}>{entry.name}</option>
          ))}
        </select>
        {subjects.length > 0 ? (
          <select
            className={cn(NATIVE_SELECT, 'w-auto')} aria-label="Хичээл"
            value={String(subjectId ?? '')}
            onChange={(event) => setChosenSubject(event.target.value)}
          >
            {subjects.map((entry) => (
              <option key={entry.subjectId} value={String(entry.subjectId)}>{entry.subject}</option>
            ))}
          </select>
        ) : null}
        {canEdit && subjectId !== null ? (
          <Button size="sm" variant={adding ? 'outline' : 'default'} onClick={() => setAdding(!adding)}>
            {adding ? 'Болих' : 'Шалгалт үүсгэх'}
          </Button>
        ) : null}
      </div>

      {adding && subjectId !== null ? (
        <NewExam
          classId={classId}
          subjectId={subjectId}
          onDone={() => {
            setAdding(false)
            void queryClient.invalidateQueries({
              predicate: (query) => typeof query.queryKey[0] === 'string'
                && query.queryKey[0].includes('/teacher/exams'),
            })
          }}
        />
      ) : null}

      <ExamList classId={classId} subjectId={subjectId} onOpen={setOpen} />
    </div>
  )
}

function ExamList({ classId, subjectId, onOpen }: {
  classId: number
  subjectId: number | null
  onOpen: (id: number) => void
}) {
  const { data, isLoading } = useGetTeacherExams({
    classId,
    ...(subjectId === null ? {} : { subjectId }),
  })
  if (isLoading) return <Skeleton className="h-48 w-full" />
  if (!data?.length) {
    return (
      <p className="rounded-[2px] border border-border bg-card p-6 text-sm text-muted-foreground">
        Энэ ангид шалгалт үүсгээгүй байна.
      </p>
    )
  }
  return (
    <ul className="divide-y divide-border rounded-[2px] border border-border bg-card">
      {data.map((exam) => (
        <Row key={exam.sittingId} exam={exam} onOpen={() => onOpen(exam.sittingId)} />
      ))}
    </ul>
  )
}
