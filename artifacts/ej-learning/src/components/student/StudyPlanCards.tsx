import type {
  PlacementStep,
  StudentPlacement,
  StudyPlanWeek,
} from '@workspace/api-client-react'
import { BookOpen, CalendarDays, Target } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

/**
 * The two cards that describe a child's own plan in a subject.
 *
 * They live here rather than on a page because two pages want them and a page
 * is not a component library: Plan.tsx used to import them from
 * SubjectDetail.tsx, which pulled that whole screen in to render a card.
 */

/**
 * How urgent the school said each step is.
 *
 * The words are the school's own. FOUNDATION means the child is missing
 * something the level assumes; EXTEND means they have the level and are being
 * stretched. Rendering all four the same would flatten the one distinction the
 * sheet was careful to draw.
 */
const PRIORITY_MN: Record<string, string> = {
  FOUNDATION: 'Суурь нөхөх',
  DEVELOP: 'Хөгжүүлэх',
  EXTEND: 'Тэлэх',
  'HIGH PRIORITY IF GAP': 'Дутагдалтай бол нэн тэргүүнд',
}

function PlanStep({ step }: { step: PlacementStep }) {
  return (
    <li className="flex gap-3 px-3 py-2.5">
      <span className="w-5 shrink-0 pt-0.5 text-xs font-semibold tabular-nums text-muted-foreground">
        {step.sequenceNo}
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <h4 className="text-sm font-semibold">{step.domain}</h4>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {PRIORITY_MN[step.priority] ?? step.priority}
          </span>
        </div>
        <p className="flex items-start gap-1.5 text-xs">
          <BookOpen className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span>
            {step.sourceLabel}
            {step.unitFocus ? (
              <span className="text-muted-foreground"> · {step.unitFocus}</span>
            ) : null}
            {step.pages ? <span className="text-muted-foreground"> · {step.pages}</span> : null}
          </span>
        </p>
        <p className="text-xs leading-snug text-muted-foreground">{step.task}</p>
      </div>
      {step.verification ? (
        <span className="hidden shrink-0 self-start text-[10px] uppercase tracking-wide text-muted-foreground sm:block">
          {step.verification}
        </span>
      ) : null}
    </li>
  )
}

/**
 * The plan a placement level prescribes, in the school's own six parts.
 *
 * This is the whole argument for having sat the test. A score on its own tells
 * a parent nothing they can act on; six named books with six named tasks is a
 * term's work. Nothing on this card is computed - the level came from a real
 * sitting and the steps came from the school's resource map - so it reports a
 * decision the school made rather than advice the system invented.
 */
export function PlacementPlan({ placement }: { placement: StudentPlacement }) {
  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b px-3 py-2">
          <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Target className="h-3.5 w-3.5" />
            Миний хувийн төлөвлөгөө
          </h2>
          <p className="text-[11px] text-muted-foreground">
            Түвшин тогтоох шалгалтын дүнгээс гарсан
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b bg-sidebar-active px-3 py-2">
          <span className="text-sm font-bold">{placement.levelCode}</span>
          <span className="text-xs">{placement.levelName}</span>
          {placement.score !== null && placement.maxScore !== null ? (
            <span className="text-xs tabular-nums text-muted-foreground">
              {placement.score}/{placement.maxScore} оноо
            </span>
          ) : null}
          {placement.attemptedOn ? (
            <span className="text-xs tabular-nums text-muted-foreground">
              {placement.attemptedOn}
            </span>
          ) : null}
        </div>

        {placement.provisional ? (
          // The level rests on the objective half of the paper. Saying so is
          // what keeps a reading from being read as a confirmed result.
          <p className="border-b px-3 py-1.5 text-[11px] text-muted-foreground">
            Бичих, ярих даалгавар хараахан дүгнэгдээгүй тул энэ түвшин түр зэрэглэл.
          </p>
        ) : null}

        <ul className="divide-y">
          {placement.steps.map((step) => (
            <PlanStep key={step.sequenceNo} step={step} />
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

const WEEKDAY_MN = ['', 'Даваа', 'Мягмар', 'Лхагва', 'Пүрэв', 'Баасан', 'Бямба', 'Ням']

/**
 * How a marked day came out, in the school's own four states.
 *
 * NOT ASSESSED is the overwhelming majority and is deliberately the quietest:
 * it means nobody has looked yet, which is not a result and should not read
 * like one.
 */
const DAY_STATUS: Record<string, { label: string; className: string }> = {
  MASTERED: { label: 'Эзэмшсэн', className: 'text-success' },
  DEVELOPING: { label: 'Хөгжиж буй', className: 'text-pending' },
  'NEEDS SUPPORT': { label: 'Дэмжлэг хэрэгтэй', className: 'text-destructive' },
  'NOT ASSESSED': { label: 'Дүгнээгүй', className: 'text-muted-foreground' },
}

/**
 * One week of the generated plan: five days, and the skills behind them.
 *
 * The task text arrives as "Grammar: … Vocabulary: …" in one cell, which is
 * how the workbook wrote it. Splitting on the skill name would be guessing at
 * somebody else's formatting, so it is shown whole and the focus line above
 * says which skills the day covers.
 */
function PlanWeek({ week }: { week: StudyPlanWeek }) {
  const marked = week.days.filter((day) => day.score !== null).length
  return (
    <section>
      <h3 className="flex flex-wrap items-baseline justify-between gap-2 bg-muted/50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <span>{week.weekNo}-р долоо хоног</span>
        <span className="font-normal normal-case">
          {marked > 0 ? `${marked}/${week.days.length} өдөр дүгнэгдсэн` : 'Дүгнэгдээгүй'}
        </span>
      </h3>
      <ul className="divide-y">
        {week.days.map((day) => {
          const state = DAY_STATUS[day.status] ?? {
            label: day.status,
            className: 'text-muted-foreground',
          }
          return (
            <li key={day.weekdayNo} className="flex flex-wrap gap-x-3 gap-y-1 px-3 py-2">
              <span className="w-16 shrink-0 text-xs font-semibold">
                {WEEKDAY_MN[day.weekdayNo] ?? day.weekdayNo}
              </span>
              <div className="min-w-0 flex-1 space-y-0.5">
                {day.focus ? <p className="text-xs font-medium">{day.focus}</p> : null}
                {day.task ? (
                  <p className="text-[11px] leading-snug text-muted-foreground">{day.task}</p>
                ) : null}
              </div>
              <span className="shrink-0 text-right text-[11px]">
                <span className={cn('block', state.className)}>{state.label}</span>
                {day.score !== null ? (
                  <span className="block tabular-nums text-muted-foreground">{day.score}</span>
                ) : day.target ? (
                  <span className="block tabular-nums text-muted-foreground">{day.target}</span>
                ) : null}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/**
 * The plan the school generated for this child, four weeks of it.
 *
 * Distinct from the level's pathway above: that says what A2 means in
 * general, this says what this child does on Tuesday of week two. Both are
 * shown because a parent asks the first question and a child works from the
 * second.
 */
export function StudyPlan({ weeks }: { weeks: StudyPlanWeek[] }) {
  const days = weeks.reduce((sum, week) => sum + week.days.length, 0)
  const marked = weeks.reduce(
    (sum, week) => sum + week.days.filter((day) => day.score !== null).length, 0)

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b px-3 py-2">
          <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5" />
            Долоо хоног тутмын хуваарь
          </h2>
          <p className="text-[11px] text-muted-foreground">
            {weeks.length} долоо хоног · {days} өдөр
          </p>
        </div>
        {marked === 0 ? (
          // Saying it once at the top is honest; repeating "Дүгнээгүй" twenty
          // times without explanation reads as a broken page.
          <p className="border-b px-3 py-1.5 text-[11px] text-muted-foreground">
            Төлөвлөгөө бэлэн боловч хичээл хараахан эхлээгүй тул өдрүүд дүгнэгдээгүй байна.
          </p>
        ) : null}
        {weeks.map((week) => (
          <PlanWeek key={week.weekNo} week={week} />
        ))}
      </CardContent>
    </Card>
  )
}
