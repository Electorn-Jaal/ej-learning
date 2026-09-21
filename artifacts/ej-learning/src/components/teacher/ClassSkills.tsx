import { useState } from 'react'
import { useGetClassSkills, type ClassSkill } from '@workspace/api-client-react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { SKILL_STATUS, type SkillStatus } from '@/components/charts/status-palette'
import { cn } from '@/lib/utils'
import { subjectParam } from '@/lib/teacher-class'

/**
 * A bar that reads as gap, developing, mastered.
 *
 * Proportions rather than numbers, because the question a teacher asks of this
 * list is which row to look at first, and that is answered faster by a shape
 * than by three figures to subtract from each other. The figures are underneath
 * for when the shape is not enough.
 *
 * It used to paint itself from the theme's own status tokens, which measure 10.7
 * apart in normal vision - under the 15 a colour needs to be told from its
 * neighbour, before colour blindness is considered at all. It now draws on the
 * one status palette the charts share.
 */
function Spread({ skill }: { skill: ClassSkill }) {
  const share = (n: number) => (n / skill.assessed) * 100
  const segment = (status: SkillStatus, n: number) => (
    <span
      title={`${SKILL_STATUS[status].label}: ${n}`}
      style={{ width: `${share(n)}%`, backgroundColor: SKILL_STATUS[status].color }}
    />
  )
  return (
    <span className="flex h-1.5 w-28 shrink-0 overflow-hidden rounded-full bg-muted">
      {segment('needs_support', skill.gap)}
      {segment('developing', skill.developing)}
      {segment('mastered', skill.mastered)}
    </span>
  )
}

function SkillRow({ skill }: { skill: ClassSkill }) {
  const [open, setOpen] = useState(false)

  return (
    <li className={cn('border-l-2', open ? 'border-primary' : 'border-transparent')}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full flex-wrap items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-secondary/50"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm">{skill.skillName}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {skill.skillCode}
            {skill.gradeLevel ? ` · ${skill.gradeLevel}-р анги` : ''}
            {` · ${skill.assessed} сурагч хэмжигдсэн`}
          </span>
        </span>

        <Spread skill={skill} />

        <span className="w-16 shrink-0 text-right text-sm font-semibold tabular-nums">
          {skill.averageScore}%
        </span>

        {open ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
      </button>

      {open ? (
        <div className="space-y-3 border-t border-border px-4 py-3">
          <p className="text-xs text-muted-foreground">
            <span className="mr-3 inline-flex items-center gap-1.5">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: SKILL_STATUS.needs_support.color }}
              />
              {skill.gap} дутуу
            </span>
            <span className="mr-3 inline-flex items-center gap-1.5">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: SKILL_STATUS.developing.color }}
              />
              {skill.developing} хөгжиж буй
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: SKILL_STATUS.mastered.color }}
              />
              {skill.mastered} эзэмшсэн
            </span>
          </p>

          {skill.weakest.length > 0 ? (
            <ul className="divide-y">
              {skill.weakest.map((student) => (
                <li
                  key={student.studentId}
                  className="flex items-center justify-between gap-3 py-1.5 text-sm"
                >
                  <span className="min-w-0 truncate">{student.studentName}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {student.score}%
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Бүгд эзэмшсэн байна.</p>
          )}

          {skill.weakestTotal > skill.weakest.length ? (
            <p className="text-xs text-muted-foreground">
              … бас {skill.weakestTotal - skill.weakest.length} сурагч
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  )
}

/**
 * The class's standing skill by skill, weakest first.
 *
 * This is not a second exam: it is what the quizzes students have already
 * answered add up to. A skill nobody has answered on yet simply does not
 * appear, which is why an empty list means no evidence rather than no problem.
 */
export function ClassSkills({
  classId,
  subjectId,
}: {
  classId: number
  subjectId: number | null
}) {
  const { data, isLoading } = useGetClassSkills({ classId, ...subjectParam(subjectId) })

  if (isLoading) return <Skeleton className="h-48 w-full" />
  if (!data || data.skills.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Чадварын түвшин</CardTitle>
        </CardHeader>
        <CardContent className="pb-6 text-sm text-muted-foreground">
          Хараахан хэмжилт алга. Сурагчид шалгах асуултад хариулсны дараа энд
          чадвар бүрээр харагдана.
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Чадварын түвшин</CardTitle>
        <p className="text-sm text-muted-foreground">
          Хариултуудаас гарсан дүгнэлт. Дутуу сурагч олонтой чадвар эхэндээ.
        </p>
      </CardHeader>
      <CardContent className="px-0 pb-2">
        <ul className="divide-y">
          {data.skills.map((skill) => (
            <SkillRow key={skill.skillId} skill={skill} />
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
