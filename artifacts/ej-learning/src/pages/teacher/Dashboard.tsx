import { Link } from "wouter"
import { useGetTeacherDashboard, type TeacherClassToday } from "@workspace/api-client-react"
import { BookOpen } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

const REASON_DOT: Record<string, string> = {
  NO_PLACEMENT: "bg-destructive",
  LOW_SCORE: "bg-pending",
  NOT_ANSWERED: "bg-muted-foreground/50",
}

function ClassCard({ klass }: { klass: TeacherClassToday }) {
  const pages =
    klass.pageFrom === null
      ? null
      : klass.pageTo && klass.pageTo !== klass.pageFrom
        ? `${klass.pageFrom}–${klass.pageTo} х.`
        : `${klass.pageFrom} х.`

  // A levelled subject gives each student their own work, so an empty class
  // schedule is the normal state there rather than a gap in the timetable.
  const perStudent = klass.levelFramework !== null

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <CardTitle className="text-lg">{klass.className}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {klass.subjectName} · {klass.gradeLevel}-р анги
            {klass.levelFramework ? ` · ${klass.levelFramework}` : ""}
          </p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-semibold tabular-nums">
            {klass.answeredToday}
            <span className="text-base font-normal text-muted-foreground">
              /{klass.studentCount}
            </span>
          </div>
          <div className="text-xs text-muted-foreground">өнөөдөр хариулсан</div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex items-start gap-3 border-l-2 border-primary py-1 pl-4">
          <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            {klass.skillName ? (
              <>
                <p className="text-sm font-medium">{klass.skillName}</p>
                <p className="text-xs text-muted-foreground">
                  {klass.lessonCode}
                  {pages ? ` · ${pages}` : ""}
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                {perStudent
                  ? "Сурагч бүр өөрийн түвшний ажилтай."
                  : "Өнөөдөр хуваарьт хичээл алга."}
              </p>
            )}
          </div>
        </div>

        {klass.attention.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Анхаарах — {klass.attention.length}
            </p>
            <ul className="divide-y">
              {klass.attention.slice(0, 8).map((row) => (
                <li
                  key={row.studentId}
                  className="flex flex-wrap items-center gap-3 py-1.5 text-sm"
                >
                  <span className="min-w-0 flex-1 truncate">
                    {row.studentName}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {row.studentCode}
                    </span>
                  </span>
                  {row.level ? (
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {row.level}
                    </span>
                  ) : null}
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span
                      className={cn(
                        "h-1.5 w-1.5 shrink-0 rounded-full",
                        REASON_DOT[row.reason] ?? REASON_DOT.NOT_ANSWERED,
                      )}
                    />
                    {row.detail}
                  </span>
                </li>
              ))}
            </ul>
            {klass.attention.length > 8 ? (
              <p className="text-xs text-muted-foreground">
                … бас {klass.attention.length - 8} сурагч
              </p>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Бүгд хийсэн байна.</p>
        )}

        <div className="flex flex-wrap gap-4 border-t pt-3 text-sm">
          <Link href="/teacher/results" className="underline underline-offset-4">
            Үр дүн
          </Link>
          <Link href="/teacher/schedule" className="underline underline-offset-4">
            Хуваарь
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}

export default function TeacherDashboard() {
  const { data, isLoading, isError } = useGetTeacherDashboard()

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }
  if (isError || !data) {
    return <p role="alert">Хяналтын самбарыг уншиж чадсангүй.</p>
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-sm text-muted-foreground">{data.dateLabel}</p>
        <h1 className="text-2xl font-bold">Өнөөдрийн хичээл</h1>
        <p className="text-sm text-muted-foreground">
          {data.teacherName} · {data.classes.length} анги
        </p>
      </header>

      {data.classes.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Танд оногдсон анги алга. Админаас анги холбуулна уу.
          </CardContent>
        </Card>
      ) : (
        data.classes.map((klass) => <ClassCard key={klass.classId} klass={klass} />)
      )}
    </div>
  )
}
