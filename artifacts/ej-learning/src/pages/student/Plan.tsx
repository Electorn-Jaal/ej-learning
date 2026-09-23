import { Link, useRoute } from 'wouter'
import { useGetStudentSubjects, useGetStudentToday, useGetStudentPlacements, useGetStudentStudyPlan } from '@workspace/api-client-react'
import { ArrowLeft } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { LessonBody } from '@/components/student/LessonBody'
import { PlacementPlan, StudyPlan } from '@/components/student/StudyPlanCards'

/**
 * A plan belongs to one student and one subject.
 *
 * Read the imported placement pathway and study plan for this subject.
 * Keep the student's private daily notes separate from assigned school work.
 */
export default function StudentPlan() {
  const [, params] = useRoute('/subjects/:code/plan')
  const code = params?.code ?? ''
  const subjects = useGetStudentSubjects()
  const today = useGetStudentToday()
  const placements = useGetStudentPlacements()
  const plan = useGetStudentStudyPlan()

  if (subjects.isLoading || today.isLoading || placements.isLoading || plan.isLoading) return <Skeleton className="h-96 w-full" />

  const subject = subjects.data?.find((item) => item.code === code)
  const todaySubject = today.data?.slots.find((item) => item.subjectCode === code)
  const subjectName = subject?.name ?? todaySubject?.subjectName
  const placement = placements.data?.find((row) => row.subjectCode === code)
  const weeks = plan.data?.filter((row) => row.subjectCode === code) ?? []
  const extra = today.data?.slots.find((row) => row.subjectCode === code && row.extra)?.extra

  const back = (
    <Link
      href="/subjects"
      className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" />
      Миний хичээлүүд
    </Link>
  )

  if (subjects.isError && today.isError) {
    return (
      <div className="space-y-4">
        {back}
        <p role="alert">Хичээлийн мэдээллийг уншиж чадсангүй.</p>
      </div>
    )
  }

  if (!subjectName) {
    return (
      <div className="space-y-4">
        {back}
        <p role="alert" className="text-sm text-muted-foreground">
          Энэ хичээл сурагчийн бүртгэлээс олдсонгүй.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-10">
      <header className="space-y-2">
        {back}
        <div>
          <p className="text-sm text-muted-foreground">{subjectName}</p>
          <h1 className="text-2xl font-bold">Хувийн төлөвлөгөө</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Энэ хичээлээр өөрийгөө сайжруулах нэмэлт ажил, материал энд байна.
            Үндсэн хичээлийн агуулгаас тусдаа боловч холбогдох сэдэвтэйгээ хамт харагдана.
          </p>
        </div>
      </header>

      {placements.isError || plan.isError ? <p role="alert" className="text-sm text-destructive">Төлөвлөгөөний мэдээллийг бүрэн уншиж чадсангүй.</p> : null}
      {placement ? <PlacementPlan placement={placement} /> : null}
      {weeks.length ? <StudyPlan weeks={weeks} /> : null}
      {extra ? <section className="space-y-3"><h2 className="font-semibold">Өнөөдрийн нэмэлт бэлтгэл</h2><LessonBody lesson={extra.lesson} banner={extra.reason} /></section> : null}
      {!placements.isError && !plan.isError && !placement && weeks.length === 0 && !extra ? (
        <p className="text-sm text-muted-foreground">Энэ хичээлийн хувийн төлөвлөгөө хараахан оноогдоогүй байна.</p>
      ) : null}
      <Link href={`/subjects/${encodeURIComponent(code)}`} className="inline-block text-sm text-primary underline">Хичээлийн ном, сэдвийг үзэх</Link>

    </div>
  )
}
