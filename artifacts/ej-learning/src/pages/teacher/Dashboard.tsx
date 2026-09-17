import { useState } from "react"
import { Link } from "wouter"
import { useGetTeacherDashboard, type TeacherClassToday } from "@workspace/api-client-react"
import { BookOpen, ChevronDown, ChevronUp } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

const REASON_DOT: Record<string, string> = {
  NO_PLACEMENT: "bg-destructive",
  LOW_SCORE: "bg-pending",
  NOT_ANSWERED: "bg-muted-foreground/50",
}

/**
 * One class, closed by default.
 *
 * A teacher with ten classes needs the list to fit on a screen before it needs
 * the detail: the summary row carries what is decided at a glance - today's
 * topic, how many have answered, how many need looking at - and the breakdown
 * waits until it is asked for.
 */
function ClassRow({
  klass,
  open,
  onToggle,
}: {
  klass: TeacherClassToday
  open: boolean
  onToggle: () => void
}) {
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
    <li className={cn("border-l-2", open ? "border-primary" : "border-transparent")}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary/50"
      >
        <span className="w-20 shrink-0">
          <span className="block text-sm font-semibold">{klass.className}</span>
          <span className="block text-xs text-muted-foreground">
            {klass.gradeLevel}-р анги
          </span>
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm">
            {klass.skillName ?? (
              <span className="text-muted-foreground">
                {klass.levelFramework ? "Сурагч бүр өөрийн ажилтай" : "Хичээл алга"}
              </span>
            )}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {klass.subjectName}
            {klass.levelFramework ? ` · ${klass.levelFramework}` : ""}
            {pages ? ` · ${pages}` : ""}
          </span>
        </span>

        <span className="shrink-0 text-right">
          <span className="block text-sm font-semibold tabular-nums">
            {klass.answeredToday}
            <span className="font-normal text-muted-foreground">/{klass.studentCount}</span>
          </span>
          <span className="block text-xs text-muted-foreground">хариулсан</span>
        </span>

        {klass.attention.length > 0 ? (
          <span className="flex w-24 shrink-0 items-center justify-end gap-2 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-pending" />
            {klass.attention.length} анхаарах
          </span>
        ) : (
          <span className="w-24 shrink-0 text-right text-xs text-muted-foreground">
            бүгд хийсэн
          </span>
        )}

        {open ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
      </button>

      {open ? (
      <div className="space-y-4 border-t border-border px-4 py-4">
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
      </div>
      ) : null}
    </li>
  )
}

export default function TeacherDashboard() {
  const { data, isLoading, isError } = useGetTeacherDashboard()
  // One class opens at a time: this is a list to scan, not a set of panels to
  // leave hanging open.
  const [openId, setOpenId] = useState<number | null>(null)

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
        <ul className="divide-y rounded-md border border-border bg-card">
          {data.classes.map((klass) => (
            <ClassRow
              key={klass.classId}
              klass={klass}
              open={openId === klass.classId}
              onToggle={() => setOpenId(openId === klass.classId ? null : klass.classId)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
