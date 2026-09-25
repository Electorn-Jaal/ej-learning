import type { PublishedDiagnosticPlan } from '@workspace/api-client-react'
import { appPath } from '@/lib/app-path'

const when = (iso: string) => new Date(iso).toLocaleDateString('mn-MN', { timeZone: 'Asia/Ulaanbaatar' })

/**
 * The personal plans a teacher made from a diagnostic and chose to show.
 *
 * One list for the child and their guardian, so the two never read different
 * versions of the same plan. Only the child gets a link into the book: the
 * library is closed to guardians (FR21), and a link that answers 403 is worse
 * than the book's name alone.
 */
export function DiagnosticPlanList({ plans, linkBooks }: { plans: PublishedDiagnosticPlan[]; linkBooks: boolean }) {
  if (!plans.length) return <p className="text-sm text-muted-foreground">Багш одоогоор хувийн төлөвлөгөө өгөөгүй байна.</p>
  return <div className="space-y-4">{plans.map((plan) => <article key={plan.attemptId} className="space-y-3 rounded border bg-card p-4">
    <header className="space-y-1">
      <h3 className="font-semibold">{plan.subjectName} · {plan.title}</h3>
      <p className="text-xs text-muted-foreground">{plan.teacherName ? `${plan.teacherName} · ` : ''}{when(plan.publishedAt)}</p>
    </header>
    {plan.note.trim() && <p className="whitespace-pre-wrap text-sm">{plan.note}</p>}
    <ol className="space-y-3">{plan.entries.map((entry, index) => <li key={index} className="space-y-1 border-t pt-3 text-sm">
      <p className="font-medium">{index + 1}. {entry.title}</p>
      {(entry.topicName || entry.skillName) && <p className="text-xs text-muted-foreground">{[entry.topicName, entry.skillName].filter(Boolean).join(' → ')}</p>}
      <p className="whitespace-pre-wrap">{entry.instructions}</p>
      {entry.resourceTitle && <p className="text-xs text-muted-foreground">
        Материал: {linkBooks && entry.sourceMaterialId
          ? <a className="underline" href={appPath(`/api/content/materials/${entry.sourceMaterialId}/file`)} target="_blank" rel="noopener noreferrer">{entry.resourceTitle}</a>
          : entry.resourceTitle}
      </p>}
    </li>)}</ol>
  </article>)}</div>
}
