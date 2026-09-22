import { useGetStudentProgress } from "@workspace/api-client-react"
import {
  SkillStandingChart,
  StandingTable,
  type StandingRow,
} from "@/components/charts/SkillStandingChart"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

/**
 * What a child has got hold of, subject by subject.
 *
 * It used to be one run of identical cards - every skill of every subject in
 * grade order, each carrying its code and its grade number - followed by one
 * run of every attempt ever made. Nine rows that all look the same do not say
 * how anybody is doing. The subject is the structure now, each one opening
 * with a count of where its skills stand, and the history is grouped by the
 * day the work was done.
 */

const STATUS_LABEL: Record<string, string> = {
  mastered: "Эзэмшсэн",
  developing: "Сайжирч байна",
  needs_support: "Дэмжлэг хэрэгтэй",
  unassessed: "Хараахан үнэлэгдээгүй",
}

const STATUS_DOT: Record<string, string> = {
  mastered: "bg-success",
  developing: "bg-primary",
  needs_support: "bg-pending",
  unassessed: "bg-muted-foreground/40",
}

/** The order a child reads them in: what needs work first, done last. */
const STATUS_ORDER = ["needs_support", "developing", "mastered", "unassessed"]

const DAY = new Intl.DateTimeFormat("mn-MN", {
  month: "long",
  day: "numeric",
  weekday: "long",
  timeZone: "Asia/Ulaanbaatar",
})
const TIME = new Intl.DateTimeFormat("mn-MN", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Ulaanbaatar",
})
const dayOf = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ulaanbaatar" }).format(new Date(iso))

export default function StudentProgress() {
  const { data: progress, isLoading } = useGetStudentProgress()

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }
  if (!progress) return <p role="alert">Ахицын мэдээллийг уншиж чадсангүй.</p>

  const bySubject = new Map<string, typeof progress.skills>()
  for (const skill of progress.skills) {
    const name = skill.subject || "Бусад"
    bySubject.set(name, [...(bySubject.get(name) ?? []), skill])
  }
  const subjects = [...bySubject.entries()].sort(([a], [b]) => a.localeCompare(b, "mn"))

  const byDay = new Map<string, typeof progress.attempts>()
  for (const attempt of progress.attempts) {
    const day = dayOf(attempt.submittedAt)
    byDay.set(day, [...(byDay.get(day) ?? []), attempt])
  }
  const days = [...byDay.entries()].sort(([a], [b]) => b.localeCompare(a))

  const measured = progress.skills.filter((s) => s.status !== "unassessed")
  const mastered = progress.skills.filter((s) => s.status === "mastered")

  // One bar per subject. The sections below say which skills; this says how
  // each subject is going, which is what a child and a parent actually ask -
  // and it is the one place the subjects can be compared with each other.
  const standing: StandingRow[] = subjects.map(([subject, skills]) => ({
    key: subject,
    label: subject,
    mastered: skills.filter((s) => s.status === "mastered").length,
    developing: skills.filter((s) => s.status === "developing").length,
    needs_support: skills.filter((s) => s.status === "needs_support").length,
    unassessed: skills.filter((s) => s.status === "unassessed").length,
  }))

  return (
    <div className="space-y-8 pb-10">
      <header className="space-y-1">
        <p className="text-muted-foreground">
          {measured.length === 0
            ? "Хараахан үнэлэгдсэн чадвар алга. Сорил бөглөсний дараа энд харагдана."
            : `${measured.length} чадвар үнэлэгдсэн, ${mastered.length} нь эзэмшсэн.`}
        </p>
      </header>

      {standing.length > 0 ? (
        <section className="space-y-3 rounded-md border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">Хичээл тус бүрээр</h2>
          <SkillStandingChart rows={standing} unit="чадвар" />
          <details>
            <summary className="cursor-pointer text-sm text-muted-foreground">
              Хүснэгтээр харах
            </summary>
            <div className="mt-2">
              <StandingTable rows={standing} head="Хичээл" />
            </div>
          </details>
        </section>
      ) : null}

      {subjects.map(([subject, skills]) => {
        const counts = STATUS_ORDER.map((status) => ({
          status,
          n: skills.filter((s) => s.status === status).length,
        })).filter((entry) => entry.n > 0)
        const ordered = [...skills].sort(
          (a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status),
        )

        return (
          <section key={subject} className="space-y-3">
            <h2 className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border pb-2">
              <span className="text-lg font-bold">{subject}</span>
              <span className="flex flex-wrap gap-x-3 text-sm font-normal text-muted-foreground">
                {counts.map((entry) => (
                  <span key={entry.status} className="inline-flex items-center gap-1.5">
                    <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[entry.status])} />
                    {entry.n} {STATUS_LABEL[entry.status].toLocaleLowerCase("mn")}
                  </span>
                ))}
              </span>
            </h2>

            <ul className="divide-y divide-border rounded-md border border-border bg-card">
              {ordered.map((skill) => (
                <li
                  key={skill.code}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{skill.skill}</span>
                    <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                      <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[skill.status])} />
                      {STATUS_LABEL[skill.status]}
                      {skill.lastEvidenceDate
                        ? ` · ${dayOf(skill.lastEvidenceDate)}`
                        : ""}
                    </span>
                  </span>

                  {skill.status === "unassessed" ? null : (
                    <span className="shrink-0 text-right">
                      <span className="block text-lg font-semibold tabular-nums">
                        {skill.percentage ?? "—"}%
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {skill.evidenceCount} удаа хариулсан
                      </span>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )
      })}

      {progress.skills.length === 0 ? (
        <p className="rounded-md border border-border bg-card p-6 text-sm text-muted-foreground">
          Чадварын мэдээлэл алга байна.
        </p>
      ) : null}

      <section className="space-y-4">
        <h2 className="border-b border-border pb-2 text-lg font-bold">Хариулсан түүх</h2>

        {days.length === 0 ? (
          <p className="text-sm text-muted-foreground">Хараахан хариулт алга байна.</p>
        ) : (
          days.map(([day, attempts]) => (
            <div key={day} className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground">
                {DAY.format(new Date(day + "T00:00:00Z"))}
              </h3>
              <ul className="divide-y divide-border rounded-md border border-border bg-card">
                {attempts.map((attempt) => (
                  <li
                    key={attempt.id}
                    className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{attempt.assignment}</span>
                      <span className="block text-xs text-muted-foreground">
                        {TIME.format(new Date(attempt.submittedAt))} · {attempt.status}
                        {attempt.reviewer ? ` · шалгасан: ${attempt.reviewer}` : ""}
                      </span>
                    </span>
                    {attempt.score !== null ? (
                      <span className="shrink-0 text-sm font-semibold tabular-nums">
                        {attempt.score} / {attempt.maxScore ?? "?"}
                      </span>
                    ) : (
                      <span className="shrink-0 text-sm text-pending">Хүлээгдэж байна</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>

      {/* How the number is arrived at, where somebody who wants it will look
          for it - not competing with the title. */}
      {progress.dataNotice ? (
        <p className="rounded-md border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
          {progress.dataNotice}
        </p>
      ) : null}
    </div>
  )
}
