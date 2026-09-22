import { Link, useRoute } from 'wouter'
import { useGetStudentSubjects, useGetStudentToday } from '@workspace/api-client-react'
import { ArrowLeft, BookOpen, ClipboardList, Library } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * A plan belongs to one student and one subject.
 *
 * The subject-aware API and imported plan/material rows do not exist yet, so
 * this screen deliberately renders an honest empty state. It must not reuse
 * the old date-only endpoint: doing that would show and overwrite the same
 * free-text plan from Mathematics, Mongolian and every other subject.
 */
export default function StudentPlan() {
  const [, params] = useRoute('/subjects/:code/plan')
  const code = params?.code ?? ''
  const subjects = useGetStudentSubjects()
  const today = useGetStudentToday()

  if (subjects.isLoading || today.isLoading) return <Skeleton className="h-96 w-full" />

  const subject = subjects.data?.find((item) => item.code === code)
  const todaySubject = today.data?.subjects.find((item) => item.subjectCode === code)
  const subjectName = subject?.name ?? todaySubject?.subjectName

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

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardList className="h-4 w-4" />
              Миний зорилго
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Энэ хичээлийн хувийн төлөвлөгөө хараахан ирээгүй байна.
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Library className="h-4 w-4" />
              Нэмэлт бэлтгэл
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Бэлтгэх материал оноогдоогүй байна.
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <BookOpen className="h-4 w-4" />
              Холбогдох сэдэв
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Материалтай холбогдох номын сэдэв одоогоор байхгүй.
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
