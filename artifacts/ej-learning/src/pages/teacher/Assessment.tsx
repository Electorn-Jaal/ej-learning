import { useState } from 'react'
import {
  getGetAssessmentSheetQueryKey,
  useGetAssessmentSheet,
  useGetTeacherClasses,
  useSubmitAssessment,
  type MasteryStatus,
  type RosterEntry,
} from '@workspace/api-client-react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { currentSelection, entryKey, subjectParam } from '@/lib/teacher-class'

const LEVELS: { value: MasteryStatus; label: string; dot: string }[] = [
  { value: 'GAP', label: 'Дутуу', dot: 'bg-destructive' },
  { value: 'DEVELOPING', label: 'Хөгжиж буй', dot: 'bg-pending' },
  { value: 'MASTERED', label: 'Эзэмшсэн', dot: 'bg-success' },
]

const WHEN = new Intl.DateTimeFormat('mn-MN', {
  month: 'short',
  day: 'numeric',
  timeZone: 'Asia/Ulaanbaatar',
})

type Draft = { status: MasteryStatus | null; score: string }

/**
 * One student's row in the register.
 *
 * The three levels are buttons rather than a dropdown: a teacher marking
 * thirty notebooks is making the same small choice thirty times, and a menu
 * that has to be opened for each one turns a minute into ten. The score is
 * optional and sits to the side, because the requirement is that a teacher may
 * state a level without inventing a percentage for it.
 */
function StudentRow({
  student,
  draft,
  onChange,
}: {
  student: RosterEntry
  draft: Draft
  onChange: (draft: Draft) => void
}) {
  const existing = LEVELS.find((level) => level.value === student.masteryStatus)

  return (
    <li className="flex flex-wrap items-center gap-3 py-2.5">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{student.studentName}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {student.studentCode}
          {existing ? (
            <>
              {' · одоо: '}
              {existing.label}
              {student.masteryScore !== null ? ` ${student.masteryScore}%` : ''}
              {student.source === 'TEACHER'
                ? ` · ${student.assessedBy ?? 'багш'} оруулсан`
                : ' · системийн тооцоо'}
              {student.lastAssessedAt
                ? ` · ${WHEN.format(new Date(student.lastAssessedAt))}`
                : ''}
            </>
          ) : (
            ' · үнэлгээгүй'
          )}
        </span>
      </span>

      <span className="flex shrink-0 rounded-md border border-border">
        {LEVELS.map((level, index) => {
          const active = draft.status === level.value
          return (
            <button
              key={level.value}
              type="button"
              aria-pressed={active}
              onClick={() =>
                onChange({ ...draft, status: active ? null : level.value })
              }
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors',
                index > 0 && 'border-l border-border',
                active ? 'bg-secondary font-semibold' : 'hover:bg-secondary/50',
              )}
            >
              <span className={cn('h-1.5 w-1.5 rounded-full', level.dot)} />
              {level.label}
            </button>
          )
        })}
      </span>

      <Input
        value={draft.score}
        onChange={(event) => onChange({ ...draft, score: event.target.value })}
        placeholder="%"
        inputMode="numeric"
        aria-label={`${student.studentName} — хувь`}
        className="w-16 shrink-0 text-center"
      />
    </li>
  )
}

export default function TeacherAssessment() {
  const queryClient = useQueryClient()
  const { data: classes, isLoading: loadingClasses } = useGetTeacherClasses()
  const [selectedClass, setSelectedClass] = useState<string | null>(null)
  const [selectedSkill, setSelectedSkill] = useState<number | null>(null)
  const [drafts, setDrafts] = useState<Record<number, Draft>>({})
  const [done, setDone] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { key, classId, subjectId } = currentSelection(classes, selectedClass)
  const params = {
    classId,
    ...subjectParam(subjectId),
    ...(selectedSkill ? { skillId: selectedSkill } : {}),
  }
  const { data: sheet, isLoading } = useGetAssessmentSheet(params, {
    query: { queryKey: getGetAssessmentSheetQueryKey(params), enabled: classId > 0 },
  })
  const { mutate, isPending } = useSubmitAssessment()

  if (loadingClasses) return <Skeleton className="h-64 w-full" />
  if (!classes?.length) {
    return <p className="text-sm text-muted-foreground">Анги олдсонгүй.</p>
  }

  const draftFor = (id: number) => drafts[id] ?? { status: null, score: '' }
  const marked = Object.values(drafts).filter((draft) => draft.status !== null).length

  const reset = () => {
    setDrafts({})
    setError(null)
  }

  const save = () => {
    setError(null)
    setDone(null)
    if (!sheet?.skillId) return

    const entries = Object.entries(drafts)
      .filter(([, draft]) => draft.status !== null)
      .map(([studentId, draft]) => {
        const score = draft.score.trim() === '' ? null : Number(draft.score)
        return {
          studentId: Number(studentId),
          status: draft.status as MasteryStatus,
          // A blank or unreadable box means "no percentage", not zero. A
          // student who was told nothing about a score should not be recorded
          // as having got none of it right.
          score: score !== null && Number.isFinite(score) && score >= 0 && score <= 100
            ? Math.round(score)
            : null,
        }
      })

    if (entries.length === 0) {
      setError('Дор хаяж нэг сурагчид түвшин өгнө үү.')
      return
    }

    mutate(
      { data: { classId: sheet.classId, skillId: sheet.skillId, entries } },
      {
        onSuccess: (result) => {
          setDone(`${result.recorded} сурагчийн үнэлгээ хадгалагдлаа.`)
          setDrafts({})
          queryClient.invalidateQueries({ queryKey: getGetAssessmentSheetQueryKey(params) })
        },
        onError: (cause) => setError(cause?.data?.error ?? 'Хадгалж чадсангүй.'),
      },
    )
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Дэвтрийн үнэлгээ оруулах</h1>
        <p className="text-sm text-muted-foreground">
          Сурагчид дэвтэр дээрээ гүйцэтгэсэн ажлыг шалгаад түвшинг нь энд тэмдэглэнэ.
          Хувь заавал биш — зөвхөн түвшин өгч болно.
        </p>
      </header>

      <div className="flex flex-wrap gap-3">
        <Select
          value={String(classId)}
          onValueChange={(value) => {
            setSelectedClass(value)
            setSelectedSkill(null)
            reset()
          }}
        >
          <SelectTrigger className="w-full sm:w-44" aria-label="Анги">
            <SelectValue placeholder="Анги" />
          </SelectTrigger>
          <SelectContent>
            {classes.map((klass) => (
              <SelectItem key={entryKey(klass)} value={entryKey(klass)}>
                {klass.name}
                {klass.subject ? ` · ${klass.subject}` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {sheet?.skills.length ? (
          <Select
            value={String(sheet.skillId ?? '')}
            onValueChange={(value) => {
              setSelectedSkill(Number(value))
              reset()
            }}
          >
            <SelectTrigger className="w-full sm:w-96" aria-label="Чадвар">
              <SelectValue placeholder="Чадвар сонгох" />
            </SelectTrigger>
            <SelectContent>
              {sheet.skills.map((skill) => (
                <SelectItem key={skill.skillId} value={String(skill.skillId)}>
                  {skill.skillName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>

      {isLoading ? <Skeleton className="h-64 w-full" /> : null}

      {sheet && !isLoading ? (
        sheet.skills.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              {sheet.className} ангид үнэлэх чадвар олдсонгүй. Админаас хичээлийн
              агуулгыг холбуулна уу.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                {sheet.className} · {sheet.students.length} сурагч
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {sheet.skills.find((skill) => skill.skillId === sheet.skillId)?.skillName}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="divide-y">
                {sheet.students.map((student) => (
                  <StudentRow
                    key={student.studentId}
                    student={student}
                    draft={draftFor(student.studentId)}
                    onChange={(draft) =>
                      setDrafts((prev) => ({ ...prev, [student.studentId]: draft }))
                    }
                  />
                ))}
              </ul>

              <div className="flex flex-wrap items-center gap-3 border-t pt-4">
                <Button onClick={save} disabled={isPending || marked === 0}>
                  {isPending ? 'Хадгалж байна…' : `${marked} сурагчийг хадгалах`}
                </Button>
                {marked > 0 ? (
                  <Button variant="ghost" size="sm" onClick={reset}>
                    Цэвэрлэх
                  </Button>
                ) : null}
                {done ? (
                  <span className="border-l-2 border-success py-1 pl-3 text-sm">{done}</span>
                ) : null}
                {error ? (
                  <span role="alert" className="text-sm text-destructive">
                    {error}
                  </span>
                ) : null}
              </div>

              <p className="text-xs text-muted-foreground">
                Таны оруулсан түвшин хэн, хэзээ оруулсан тэмдэглэлтэйгээр хадгалагдана.
              </p>
            </CardContent>
          </Card>
        )
      ) : null}
    </div>
  )
}
