/**
 * Мэдээлэл: the school's own notice, standing beside the lessons.
 *
 * Empty, and empty on purpose. Мэдэгдэл and мэдээлэл are two different things
 * and this is the second one: a notification is addressed to one person and
 * arrives in the header; this is what the school has put up for everyone
 * looking at their lessons. Neither has a table, a writer or an endpoint yet,
 * so anything printed here would be invented - which is exactly what the
 * hand-written list that used to sit on the child's day was.
 *
 * The box exists so the place is decided: when a manager can write a notice,
 * it appears here, on both sides of the school, without the screens moving.
 */
export function InfoBox({ className }: { className?: string | null }) {
  return (
    <aside
      aria-label="Мэдээлэл"
      className="rounded-[2px] border border-border bg-card"
    >
      {/* The class beside the word, so a notice is plainly addressed to a
          particular room rather than to the school at large. */}
      <h2 className="flex items-baseline gap-1.5 border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Мэдээлэл
        {className ? <span className="font-normal normal-case">· {className} анги</span> : null}
      </h2>
      <p className="px-3 py-4 text-xs text-muted-foreground">Мэдээлэл алга байна.</p>
    </aside>
  )
}
