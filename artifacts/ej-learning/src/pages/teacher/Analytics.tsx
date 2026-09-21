import { useState } from 'react'
import {
  useGetClassSkills,
  useGetTeacherClasses,
  useGetTeacherQuizAttempts,
} from '@workspace/api-client-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { Skeleton } from '@/components/ui/skeleton'
import { ScoreBands } from '@/components/charts/ScoreBands'
import {
  SkillStandingChart,
  StandingTable,
  type StandingRow,
} from '@/components/charts/SkillStandingChart'
import { useLinkedSelection } from '@/lib/linked-selection'
import { subjectParam } from '@/lib/teacher-class'

const SELECT_STYLE =
  'h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring'

/** How much of the measured class is behind on a skill. */
const share = (skill: { gap: number; assessed: number }) =>
  skill.assessed === 0 ? 0 : skill.gap / skill.assessed

const today = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ulaanbaatar' }).format(new Date())

/**
 * Where a class stands, skill by skill, and how today's answers fell.
 *
 * Two questions a teacher asks about a class, and neither is answerable from a
 * list of scores: which skills the class is behind on, and whether today's
 * lesson landed. The figures behind both were already in the product - they
 * were only ever printed as numbers.
 *
 * Both charts read the same class and subject, chosen once at the top, and the
 * choice can be carried in from elsewhere in the address.
 */
export default function TeacherAnalytics() {
  const { data: classes, isLoading } = useGetTeacherClasses()
  const [selectedClass, setSelectedClass] = useState<string | null>(null)
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null)
  const linked = useLinkedSelection()

  if (isLoading) return <Skeleton className="h-64 w-full" />
  if (!classes?.length) return <p className="text-sm text-muted-foreground">Анги олдсонгүй.</p>

  const uniqueClasses = [...new Map(classes.map((entry) => [entry.id, entry])).values()]
  const chosenClass = selectedClass ?? linked.classId
  const classId = Number(
    uniqueClasses.find((entry) => String(entry.id) === chosenClass)?.id ?? uniqueClasses[0]!.id,
  )
  const subjects = classes.filter((entry) => Number(entry.id) === classId && entry.subjectId != null)
  const chosenSubject = selectedSubject ?? linked.subjectId
  const subjectId =
    subjects.find((entry) => String(entry.subjectId) === chosenSubject)?.subjectId ??
    subjects[0]?.subjectId ??
    null

  return (
    <div className="space-y-6 pb-10">
      <PageHeader
        title="Дүн шинжилгээ"
        description="Анги ямар чадвар дээр хаана байгаа, өнөөдрийн хариулт хэрхэн тархсаныг харуулна."
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="analytics-class" className="block text-sm font-medium">
            Анги
          </label>
          <select
            id="analytics-class"
            className={SELECT_STYLE}
            value={String(classId)}
            onChange={(event) => {
              setSelectedClass(event.target.value)
              setSelectedSubject(null)
            }}
          >
            {uniqueClasses.map((entry) => (
              <option key={entry.id} value={String(entry.id)}>
                {entry.name}
              </option>
            ))}
          </select>
        </div>

        {subjects.length > 0 ? (
          <div className="space-y-2">
            <label htmlFor="analytics-subject" className="block text-sm font-medium">
              Хичээл
            </label>
            <select
              id="analytics-subject"
              className={SELECT_STYLE}
              value={String(subjectId ?? '')}
              onChange={(event) => setSelectedSubject(event.target.value)}
            >
              {subjects.map((entry) => (
                <option key={entry.subjectId} value={String(entry.subjectId)}>
                  {entry.subject}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      <SkillStanding classId={classId} subjectId={subjectId} />
      <TodayScores classId={classId} subjectId={subjectId} />
    </div>
  )
}

function SkillStanding({ classId, subjectId }: { classId: number; subjectId: number | null }) {
  const { data, isLoading } = useGetClassSkills({ classId, ...subjectParam(subjectId) })
  const skills = data?.skills ?? []

  // Worst first: the reason to open this page is to find what needs teaching
  // again, not to read an alphabetical list. The share, not the count, so a
  // skill two children were measured on cannot outrank one the whole class is
  // behind on. Reversed for the chart, whose first row is drawn at the bottom.
  const rows: StandingRow[] = [...skills]
    .sort((a, b) => share(a) - share(b))
    .map((skill) => ({
      key: String(skill.skillId),
      label: skill.skillName,
      mastered: skill.mastered,
      developing: skill.developing,
      needs_support: skill.gap,
    }))

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Чадвар бүрээр анги хаана байна</CardTitle>
        <p className="text-sm text-muted-foreground">
          Зөвхөн нотолгоотой сурагчид тоологдоно. Дэмжлэг хэрэгтэй нь эхэнд.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : skills.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Энэ ангид хэмжигдсэн чадвар одоогоор алга.
          </p>
        ) : (
          <>
            <SkillStandingChart rows={rows} />

            {/*
              * The table is not a duplicate: amber on the light surface falls
              * below the contrast a colour needs to carry meaning, so the same
              * figures have to be readable without it.
              */}
            <details className="pt-2">
              <summary className="cursor-pointer text-sm text-muted-foreground">
                Хүснэгтээр харах
              </summary>
              <div className="mt-2">
                <StandingTable rows={[...rows].reverse()} head="Чадвар" />
              </div>
            </details>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function TodayScores({ classId, subjectId }: { classId: number; subjectId: number | null }) {
  const day = today()
  const { data, isLoading } = useGetTeacherQuizAttempts({
    classId,
    ...subjectParam(subjectId),
    from: day,
    to: day,
  })

  const percentages = (data?.attempts ?? [])
    .filter((attempt) => attempt.maxScore > 0)
    .map((attempt) => Math.round((attempt.score / attempt.maxScore) * 100))

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Өнөөдрийн хариултын тархалт</CardTitle>
        <p className="text-sm text-muted-foreground">
          {percentages.length} сурагч хариулсан. Босго нь чадварын үнэлгээний 80 ба 50.
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="h-40 w-full" /> : <ScoreBands percentages={percentages} />}
      </CardContent>
    </Card>
  )
}
