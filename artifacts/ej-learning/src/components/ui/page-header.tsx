import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export type Stat = {
  label: string
  value: string | number
  hint?: string
}

/**
 * Page banner with the figures that page is about.
 *
 * Borrowed from the NUM-TMS portal, which puts a title, a sentence and up to
 * four quick stats at the top of every major screen - the repeated shape is
 * what makes a set of pages read as one product. Rebuilt on shadcn rather than
 * copied, because that codebase is Ant Design and running two design systems
 * costs more than rewriting four components.
 *
 * The figures are typographic, not tiles: a number large enough to read across
 * a desk, its label above it, and a rule between. A coloured card behind each
 * one competes with the number it is meant to present.
 */
export function PageHeader({
  title: _title,
  description,
  stats = [],
  actions,
}: {
  /** Named for the reader of the call site; the shell renders it. */
  title?: string
  description?: string
  stats?: Stat[]
  actions?: ReactNode
}) {
  return (
    <header className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        {/* No <h1> here: the shell's top bar names the screen, and printing
            it again at the top of the scroll area was the same words twice
            and a band of height on every page. `title` is kept so the call
            sites still read as headers and so the name has one home in the
            source. */}
        <div className="space-y-1">
          {description ? (
            <p className="text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>

      {stats.length > 0 ? (
        <dl
          className={cn(
            "grid gap-px overflow-hidden rounded-md border border-border bg-border",
            stats.length >= 4 ? "sm:grid-cols-4" : "sm:grid-cols-3",
            "grid-cols-2",
          )}
        >
          {stats.map((stat) => (
            <div key={stat.label} className="bg-card px-4 py-3">
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {stat.label}
              </dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums">{stat.value}</dd>
              {stat.hint ? (
                <dd className="text-xs text-muted-foreground">{stat.hint}</dd>
              ) : null}
            </div>
          ))}
        </dl>
      ) : null}
    </header>
  )
}
