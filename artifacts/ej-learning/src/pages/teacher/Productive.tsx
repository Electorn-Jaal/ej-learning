import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  getGetProductiveMarkSheetQueryKey,
  useGetMarkableClasses,
  useGetProductiveMarkSheet,
  useSaveProductiveRating,
  type ProductiveStudent,
  type ProductiveTask,
} from '@workspace/api-client-react'
import { Check, PenLine, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

/**
 * The judged half of the placement paper.
 *
 * Sixty of the paper's eighty-four questions are marked against a key and the
 * system does that alone. The other twenty-four ask a child to write eighty
 * words or speak for two minutes, and a person has to read or listen. Nobody
 * ever has, which is why a hundred of the hundred and five children who sat
 * the test carry a level their own screens have to call provisional.
 *
 * This is the screen that fixes that, and it is deliberately small: a class,
 * its children, four tasks each, two buttons per task. Marking a child's last
 * task confirms their level on the spot - the server re-derives it rather
 * than being told - and their plan stops being labelled a guess.
 */

/** The rubric asks whether the child can do the thing. So does the screen. */
function TaskRow({
  task,
  onRate,
  pending,
}: {
  task: ProductiveTask
  onRate: (score: number, comment: string | null) => void
  pending: boolean
}) {
  const [open, setOpen] = useState(false)
  const [comment, setComment] = useState(task.comment ?? '')
  const marked = task.score !== null

  return (
    <li className="space-y-2 px-3 py-2.5">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <span className="w-16 shrink-0 text-xs font-semibold">{task.domain}</span>

        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-xs leading-snug">{task.prompt}</p>
          {task.rubric ? (
            // The standard the school wrote, kept in front of the person
            // applying it rather than in a spreadsheet nobody opens mid-lesson.
            <p className="text-[11px] leading-snug text-muted-foreground">
              Шалгуур: {task.rubric}
            </p>
          ) : null}
          {task.ratedByName ? (
            <p className="text-[11px] text-muted-foreground">
              {task.ratedByName}
              {task.ratedAt ? ` · ${task.ratedAt.slice(0, 10)}` : ''}
              {task.comment ? ` · «${task.comment}»` : ''}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            size="sm"
            variant={task.score === task.maxScore ? 'default' : 'outline'}
            aria-pressed={task.score === task.maxScore}
            disabled={pending}
            onClick={() => onRate(task.maxScore, comment.trim() || null)}
          >
            <Check className="h-3.5 w-3.5" />
            Чадсан
          </Button>
          <Button
            size="sm"
            variant={task.score === 0 ? 'default' : 'outline'}
            aria-pressed={task.score === 0}
            disabled={pending}
            onClick={() => onRate(0, comment.trim() || null)}
          >
            <X className="h-3.5 w-3.5" />
            Чадаагүй
          </Button>
          <Button
            size="sm"
            variant="ghost"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            <PenLine className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {open ? (
        <div className="space-y-1.5 pl-16">
          <Textarea
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            rows={2}
            placeholder="Тэмдэглэл — юуг сайн хийсэн, юуг давтах вэ"
            className="text-xs"
          />
          <p className="text-[11px] text-muted-foreground">
            Тэмдэглэл бичээд дээрх хоёр товчны аль нэгийг дарахад хамт хадгалагдана.
          </p>
        </div>
      ) : null}

      {!marked && !open ? null : null}
    </li>
  )
}

function StudentCard({
  student,
  classId,
  onRate,
  pending,
}: {
  student: ProductiveStudent
  classId: string
  onRate: (input: { studentId: string; itemId: string; score: number; comment: string | null }) => void
  pending: boolean
}) {
  const done = student.tasks.filter((task) => task.score !== null).length
  const confirmed = done === student.tasks.length && student.tasks.length > 0

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-3 py-2">
          <span className="text-sm font-semibold">{student.studentName}</span>
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {student.studentCode}
          </span>
          <span className="ml-auto flex items-center gap-2">
            <span className="text-sm font-bold">{student.levelCode}</span>
            {student.objectiveScore !== null ? (
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {student.objectiveScore}/60
              </span>
            ) : null}
            <Badge
              variant="outline"
              className={cn(
                'text-[10px] font-normal',
                confirmed && 'border-success text-success',
              )}
            >
              {confirmed ? 'Баталгаажсан' : `${done}/${student.tasks.length} дүгнэсэн`}
            </Badge>
          </span>
        </div>
        <ul className="divide-y">
          {student.tasks.map((task) => (
            <TaskRow
              key={task.itemId}
              task={task}
              pending={pending}
              onRate={(score, comment) =>
                onRate({ studentId: student.studentId, itemId: task.itemId, score, comment })
              }
            />
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

function MarkSheet({ classId }: { classId: string }) {
  const queryClient = useQueryClient()
  const { data, isLoading, isError } = useGetProductiveMarkSheet(classId)
  const save = useSaveProductiveRating({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: getGetProductiveMarkSheetQueryKey(classId),
        })
      },
    },
  })

  if (isLoading) return <Skeleton className="h-96 w-full" />
  if (isError || !data) return <p role="alert">Дүгнэх жагсаалтыг уншиж чадсангүй.</p>

  if (data.students.length === 0) {
    return (
      <p className="py-6 text-sm text-muted-foreground">
        Энэ ангид түвшин тогтоосон сурагч алга байна. Түвшин тогтоох шалгалт өгсөн
        хүүхэд л энд гарна.
      </p>
    )
  }

  const confirmed = data.students.filter(
    (student) => student.tasks.length > 0
      && student.tasks.every((task) => task.score !== null),
  ).length

  return (
    <div className="space-y-3">
      <p className="rounded-[2px] border border-dashed p-2 text-xs text-muted-foreground">
        {data.students.length} сурагчаас {confirmed} нь бүрэн дүгнэгдсэн. Сурагчийн бүх
        даалгаврыг дүгнэмэгц түвшин нь «түр зэрэглэл» байхаа болино.
      </p>
      {save.isError ? (
        <p role="alert" className="text-xs text-destructive">Дүгнэлтийг хадгалж чадсангүй.</p>
      ) : null}
      {data.students.map((student) => (
        <StudentCard
          key={student.studentId}
          student={student}
          classId={classId}
          pending={save.isPending}
          onRate={(input) => save.mutate({ data: { classId, ...input } })}
        />
      ))}
    </div>
  )
}

export default function TeacherProductive() {
  const { data: classes, isLoading } = useGetMarkableClasses()
  const [classId, setClassId] = useState<string | null>(null)

  if (isLoading) return <Skeleton className="h-64 w-full" />

  const chosen = classId ?? classes?.[0]?.classId ?? null

  return (
    <div className="space-y-4">
      <PageHeader
        title="Бичих, ярих дүгнэлт"
        description="Түвшин тогтоох шалгалтын дүгнэлт шаардсан хэсэг. Хүүхдийн бичсэнийг уншиж, ярианыг нь сонсоод шалгуурын дагуу дүгнэнэ."
      />

      {!classes?.length ? (
        <p className="py-6 text-sm text-muted-foreground">
          Танд дүгнэх анги алга байна. Англи хэлний багш нар энэ дэлгэцийг хардаг.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {classes.map((klass) => (
              <Button
                key={klass.classId}
                size="sm"
                variant={klass.classId === chosen ? 'default' : 'outline'}
                aria-pressed={klass.classId === chosen}
                onClick={() => setClassId(klass.classId)}
              >
                {klass.className}
                <span className="ml-1 text-[10px] opacity-70">{klass.students}</span>
              </Button>
            ))}
          </div>
          {chosen ? <MarkSheet key={chosen} classId={chosen} /> : null}
        </>
      )}
    </div>
  )
}
