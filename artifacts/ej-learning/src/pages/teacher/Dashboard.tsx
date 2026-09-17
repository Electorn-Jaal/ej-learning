import { Link } from "wouter"
import { useGetTeacherDashboard } from "@workspace/api-client-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PageHeader } from "@/components/ui/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

const REASON: Record<string, { label: string; dot: string }> = {
  NO_PLACEMENT: { label: "Түвшин тогтоогоогүй", dot: "bg-destructive" },
  LOW_SCORE: { label: "Оноо бага", dot: "bg-pending" },
  NOT_ANSWERED: { label: "Хариулаагүй", dot: "bg-muted-foreground/50" },
}

export default function TeacherDashboard() {
  const { data, isLoading, isError } = useGetTeacherDashboard()

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }
  if (isError || !data) {
    return <p role="alert">Хяналтын самбарыг уншиж чадсангүй.</p>
  }

  const placedShare = data.studentCount
    ? Math.round((data.placedCount / data.studentCount) * 100)
    : 0
  const peak = Math.max(1, ...data.levels.map((level) => level.studentCount))

  return (
    <div className="space-y-8">
      <PageHeader
        title="Хяналтын самбар"
        description={`${data.teacherName} · ${data.classCount} анги`}
        stats={[
          { label: "Сурагч", value: data.studentCount },
          {
            label: "Түвшин тогтоосон",
            value: data.placedCount,
            hint: `${placedShare}%`,
          },
          { label: "Өнөөдөр оногдсон", value: data.assignedToday },
          {
            label: "Өнөөдөр хариулсан",
            value: data.answeredToday,
            hint:
              data.assignedToday > 0
                ? `${data.assignedToday - data.answeredToday} хүлээгдэж байна`
                : undefined,
          },
        ]}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Түвшний тархалт</CardTitle>
          <p className="text-sm text-muted-foreground">
            Байршуулалтын шалгалтаар тогтоосон CEFR түвшин.
          </p>
        </CardHeader>
        <CardContent>
          {data.levels.every((level) => level.studentCount === 0) ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Хараахан хэний ч түвшинг тогтоогоогүй байна.
            </p>
          ) : (
            <ul className="space-y-2">
              {data.levels.map((level) => (
                <li key={level.code} className="flex items-center gap-3">
                  <span className="w-16 shrink-0 text-sm font-medium tabular-nums">
                    {level.code}
                  </span>
                  <span className="h-5 flex-1 overflow-hidden rounded-sm bg-secondary">
                    <span
                      className="block h-full bg-primary"
                      style={{ width: `${(level.studentCount / peak) * 100}%` }}
                    />
                  </span>
                  <span className="w-10 shrink-0 text-right text-sm tabular-nums text-muted-foreground">
                    {level.studentCount}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-lg">Анхаарах сурагчид</CardTitle>
            <p className="text-sm text-muted-foreground">
              Түвшингүй, оноо бага, эсвэл өнөөдөр хариулаагүй.
            </p>
          </div>
          <Link
            href="/teacher/results"
            className="text-sm font-medium underline underline-offset-4"
          >
            Бүх үр дүн
          </Link>
        </CardHeader>
        <CardContent>
          {data.attention.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Одоогоор анхаарах зүйл алга.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Сурагч</th>
                    <th className="py-2 pr-3 font-medium">Анги</th>
                    <th className="py-2 pr-3 font-medium">Түвшин</th>
                    <th className="py-2 font-medium">Шалтгаан</th>
                  </tr>
                </thead>
                <tbody>
                  {data.attention.map((row) => {
                    const reason = REASON[row.reason] ?? REASON.NOT_ANSWERED
                    return (
                      <tr key={row.studentId} className="border-b last:border-0">
                        <td className="py-2 pr-3">
                          <span className="font-medium">{row.studentName}</span>
                          <span className="ml-2 text-xs text-muted-foreground">
                            {row.studentCode}
                          </span>
                        </td>
                        <td className="py-2 pr-3 text-muted-foreground">{row.className}</td>
                        <td className="py-2 pr-3 tabular-nums">{row.level ?? "—"}</td>
                        <td className="py-2">
                          <span className="flex items-center gap-2">
                            <span
                              className={cn("h-1.5 w-1.5 shrink-0 rounded-full", reason.dot)}
                            />
                            <span>{row.detail}</span>
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
