import { useState } from 'react'
import {
  useGetClassSkills,
  useGetTeacherClasses,
  useGetTeacherQuizAttempts,
} from '@workspace/api-client-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { NATIVE_SELECT } from '@/components/ui/native-select'
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

const SELECT_STYLE = NATIVE_SELECT

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
  const { data: classes, isLoading, error, refetch } = useGetTeacherClasses()
  const [selectedClass, setSelectedClass] = useState<string | null>(null)
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null)
  const linked = useLinkedSelection()

  if (isLoading) return <Skeleton className="h-64 w-full" />
  if (error) return <div role="alert" className="space-y-2"><p>Ангийн жагсаалтыг уншиж чадсангүй.</p><button className="underline" onClick={() => void refetch()}>Дахин оролдох</button></div>
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

  const klass = uniqueClasses.find((entry) => Number(entry.id) === classId)
  if (klass === undefined) return null

  return (
    <div className="space-y-6 pb-10">
      <PageHeader
        title="Дүн шинжилгээ"
        description="Анги ямар чадвар дээр хаана байгаа, хэнд тусламж хэрэгтэйг харуулна."
        stats={[
          { label: 'Анги', value: klass.name },
          { label: 'Сурагч', value: klass.studentCount },
        ]}
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

      <WhoNeedsHelp classId={classId} subjectId={subjectId} />
      <SkillStanding classId={classId} subjectId={subjectId} />
      <TodayScores classId={classId} subjectId={subjectId} />
    </div>
  )
}

/**
 * The answer first, in words, with names in it.
 *
 * The charts below say how the class stands; this says what to do about it.
 * A teacher does not act on a bar - they act on a name, and the endpoint has
 * been returning the names all along.
 */
function WhoNeedsHelp({ classId, subjectId }: { classId: number; subjectId: number | null }) {
  const { data, isLoading } = useGetClassSkills({ classId, ...subjectParam(subjectId) })
  const skills = data?.skills ?? []

  if (isLoading) return <Skeleton className="h-40 w-full" />
  if (skills.length === 0) return null

  const worst = [...skills]
    .filter((skill) => skill.gap > 0)
    .sort((a, b) => share(b) - share(a))
    .slice(0, 3)

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Хэн юунд дэмжлэг хэрэгтэй вэ</CardTitle>
      </CardHeader>
      <CardContent>
        {worst.length === 0 ? (
          <p className="text-sm">
            Хэмжигдсэн {skills.length} чадварын аль нь ч дутуу сурагчгүй байна.
          </p>
        ) : (
          <div className="space-y-5">
            {worst.map((skill) => (
              <div key={skill.skillId} className="space-y-1.5">
                <p className="text-sm">
                  <span className="font-semibold">{skill.skillName}</span> — хэмжигдсэн{' '}
                  {skill.assessed} сурагчийн{' '}
                  <span className="font-semibold">{skill.gap}</span> нь дутуу.
                </p>
                {skill.weakest.length > 0 ? (
                  <ul className="flex flex-wrap gap-x-4 gap-y-1">
                    {skill.weakest.map((student) => (
                      <li key={student.studentId} className="text-sm text-muted-foreground">
                        {student.studentName}
                        <span className="ml-1.5 tabular-nums">{student.score}%</span>
                      </li>
                    ))}
                    {skill.weakestTotal > skill.weakest.length ? (
                      <li className="text-sm text-muted-foreground">
                        … бас {skill.weakestTotal - skill.weakest.length}
                      </li>
                    ) : null}
                  </ul>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function SkillStanding({ classId, subjectId }: { classId: number; subjectId: number | null }) {
  const { data, isLoading, error, refetch } = useGetClassSkills({ classId, ...subjectParam(subjectId) })
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
          Мөр бүр нэг чадвар. Улаан нь дэмжлэг хэрэгтэй, шар нь сайжирч байгаа, ногоон нь
          эзэмшсэн сурагчийн тоо. Сорил өгөөгүй сурагч эндээ тоологдохгүй.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : error ? (
          // WhoNeedsHelp reads the same query and says nothing on failure,
          // so this is the one place the teacher hears about it.
          <div role="alert" className="space-y-2 text-sm">
            <p>Чадварын мэдээллийг уншиж чадсангүй.</p>
            <button className="underline" onClick={() => void refetch()}>Дахин оролдох</button>
          </div>
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
  const { data, isLoading, error, refetch } = useGetTeacherQuizAttempts({
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
        <CardTitle className="text-lg">Өнөөдөр хэр зөв хариуллаа</CardTitle>
        <p className="text-sm text-muted-foreground">
          {percentages.length === 0
            ? 'Өнөөдөр хариулсан сурагч алга.'
            : `${percentages.length} сурагч хариулсан. ${percentages.filter((value) => value >= 80).length} нь 80-аас дээш, ${percentages.filter((value) => value < 50).length} нь 50-аас доош.`}
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : error ? (
          <div role="alert" className="space-y-2 text-sm">
            <p>Өнөөдрийн сорилын дүнг уншиж чадсангүй.</p>
            <button className="underline" onClick={() => void refetch()}>Дахин оролдох</button>
          </div>
        ) : (
          <ScoreBands percentages={percentages} />
        )}
      </CardContent>
    </Card>
  )
}
