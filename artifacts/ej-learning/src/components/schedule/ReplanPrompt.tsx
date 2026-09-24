import { useApplyReplan, type ReplanProposal } from '@workspace/api-client-react'
import { Button } from '@/components/ui/button'

const DAY = new Intl.DateTimeFormat('mn-MN', {
  month: 'numeric',
  day: 'numeric',
  weekday: 'short',
  timeZone: 'Asia/Ulaanbaatar',
})

const readable = (iso: string) => DAY.format(new Date(iso + 'T00:00:00Z'))

/**
 * The question a topic change raises, asked instead of answered.
 *
 * The book is divided across the term by arithmetic, and a teacher who moves
 * the class on - or back - makes every later day of that arithmetic wrong by
 * the same amount. The system used to act on that immediately: the moment a
 * section was chosen, the rest of the term was rewritten underneath. A teacher
 * opening a topic to see whether it fitted had already changed their plan
 * before they read the screen, and nothing said so.
 *
 * So it is offered. The days that would move are listed, each saying what
 * stands there now and what would replace it, and until Батлах is pressed the
 * old plan is what the school has. Хэвээр үлдээх is not a cancel: the day the
 * teacher chose is already saved either way. It says only that the days after
 * it stay as they are.
 */
export function ReplanPrompt({
  proposal,
  onDone,
}: {
  proposal: ReplanProposal
  onDone: () => void
}) {
  const { mutate: apply, isPending, error } = useApplyReplan()

  const confirm = () => {
    apply(
      {
        data: {
          classId: proposal.classId,
          subjectId: proposal.subjectId,
          fromDate: proposal.fromDate,
        },
      },
      { onSuccess: onDone },
    )
  }

  return (
    <div role="group" aria-label="Улирлын үлдсэн хэсгийг дахин хуваарилах"
      className="space-y-2 rounded-[2px] border border-border bg-sidebar-active/40 p-3">
      <p className="text-sm font-medium">
        Улирлын үлдсэн {proposal.days.length} цаг шилжинэ
      </p>
      <p className="text-xs text-muted-foreground">
        Өдрийн сэдэв хадгалагдлаа. Дараагийн өдрүүд хуучин хуваариараа хэвээр
        байгаа — батлавал доорх байдлаар өөрчлөгдөнө.
      </p>

      {/* Long terms make long lists; the box scrolls rather than pushing the
          Батлах button off the screen, which would leave a teacher reading a
          list with no way to answer it. */}
      <ul className="max-h-60 divide-y overflow-y-auto border-y">
        {proposal.days.map((day) => (
          <li key={day.scheduledOn + ':' + (day.periodNo ?? '')}
            className="flex flex-wrap items-baseline gap-x-2 py-1.5 text-xs">
            <span className="w-24 shrink-0 tabular-nums text-muted-foreground">
              {readable(day.scheduledOn)}
              {day.periodNo ? ' · ' + day.periodNo + '-р' : ''}
            </span>
            <span className="text-muted-foreground line-through">
              {day.currentSkillName ?? 'Хоосон'}
            </span>
            <span className="text-muted-foreground">&#8594;</span>
            <span className="font-medium">{day.skillName}</span>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" disabled={isPending} onClick={confirm}>
          {isPending ? 'Хадгалж байна…' : 'Батлах'}
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={onDone}>
          Хэвээр үлдээх
        </Button>
        {error ? (
          <span role="alert" className="text-xs text-destructive">
            {error?.data?.error ?? 'Хуваарийг дахин хуваарилж чадсангүй.'}
          </span>
        ) : null}
      </div>
    </div>
  )
}
