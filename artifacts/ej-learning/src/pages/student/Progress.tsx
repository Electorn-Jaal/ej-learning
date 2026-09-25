import { useGetStudentProgress } from "@workspace/api-client-react"
import {
  SkillStandingChart,
  StandingTable,
  type StandingRow,
} from "@/components/charts/SkillStandingChart"
import { Skeleton } from "@/components/ui/skeleton"

/**
 * What a child has got hold of.
 *
 * The page used to open with every skill of every subject, one row each, in a
 * list the length of the curriculum. Nothing has been measured - no skill is
 * mapped to a section of a book and no child has been assessed against one -
 * so every one of those rows said "хараахан үнэлэгдээгүй", and a child
 * scrolling through eighty of them learnt only that the system had nothing to
 * tell them. A catalogue of the unmeasured is not progress.
 *
 * What is left is the frame: the three things this page will say, each showing
 * what it has and saying plainly when it has nothing. A row appears when there
 * is a measurement behind it, and not before.
 */

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

/** A section that is here, named, and empty until there is something in it. */
function Empty({ children }: { children: string }) {
  return <p className="px-4 py-6 text-sm text-muted-foreground">{children}</p>
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[2px] border border-border bg-card">
      <h2 className="border-b border-border px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  )
}

export default function StudentProgress() {
  const { data: progress, isLoading, refetch } = useGetStudentProgress()

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }
  if (!progress) return <div role="alert" className="space-y-2"><p>Ахицын мэдээллийг уншиж чадсангүй.</p><button className="underline" onClick={() => void refetch()}>Дахин оролдох</button></div>

  // Only what has actually been assessed. A subject whose skills are all
  // unmeasured contributes no bar, because a bar of nothing is a claim.
  const measured = progress.skills.filter((skill) => skill.status !== "unassessed")
  const bySubject = new Map<string, typeof measured>()
  for (const skill of measured) {
    const name = skill.subject || "Бусад"
    bySubject.set(name, [...(bySubject.get(name) ?? []), skill])
  }
  const standing: StandingRow[] = [...bySubject.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "mn"))
    .map(([subject, skills]) => ({
      key: subject,
      label: subject,
      mastered: skills.filter((s) => s.status === "mastered").length,
      developing: skills.filter((s) => s.status === "developing").length,
      needs_support: skills.filter((s) => s.status === "needs_support").length,
      unassessed: 0,
    }))

  const byDay = new Map<string, typeof progress.attempts>()
  for (const attempt of progress.attempts) {
    const day = dayOf(attempt.submittedAt)
    byDay.set(day, [...(byDay.get(day) ?? []), attempt])
  }
  const days = [...byDay.entries()].sort(([a], [b]) => b.localeCompare(a))

  const mastered = measured.filter((skill) => skill.status === "mastered").length

  return (
    <div className="space-y-3 pb-10">
      <Section title="Хичээл тус бүрээр">
        {standing.length === 0 ? (
          <Empty>Хараахан үнэлэгдсэн чадвар алга байна. Шалгалт өгсний дараа энд харагдана.</Empty>
        ) : (
          <div className="space-y-3 p-4">
            <p className="text-sm text-muted-foreground">
              {measured.length} чадвар үнэлэгдсэн, {mastered} нь эзэмшсэн.
            </p>
            <SkillStandingChart rows={standing} unit="чадвар" />
            <details>
              <summary className="cursor-pointer text-sm text-muted-foreground">
                Хүснэгтээр харах
              </summary>
              <div className="mt-2">
                <StandingTable rows={standing} head="Хичээл" />
              </div>
            </details>
          </div>
        )}
      </Section>

      <Section title="Хариулсан түүх">
        {days.length === 0 ? (
          <Empty>Хараахан хариулт алга байна.</Empty>
        ) : (
          <div className="divide-y divide-border">
            {days.map(([day, attempts]) => (
              <div key={day}>
                <h3 className="px-4 pt-2 text-xs font-semibold text-muted-foreground">
                  {DAY.format(new Date(day + "T00:00:00Z"))}
                </h3>
                <ul className="divide-y divide-border">
                  {attempts.map((attempt) => (
                    <li
                      key={attempt.id}
                      className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm">{attempt.assignment}</span>
                        <span className="block text-xs text-muted-foreground">
                          {TIME.format(new Date(attempt.submittedAt))}
                          {attempt.reviewer ? ` · шалгасан: ${attempt.reviewer}` : ""}
                        </span>
                      </span>
                      {attempt.score !== null ? (
                        <span className="shrink-0 text-sm font-semibold tabular-nums">
                          {attempt.score} / {attempt.maxScore ?? "?"}
                        </span>
                      ) : (
                        <span className="shrink-0 text-xs text-pending">Хүлээгдэж байна</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* How the numbers above are arrived at, where somebody who wants it
          will look for it rather than competing with them. */}
      {progress.dataNotice ? (
        <p className="rounded-[2px] border border-border bg-muted/40 p-4 text-xs text-muted-foreground">
          {progress.dataNotice}
        </p>
      ) : null}
    </div>
  )
}
