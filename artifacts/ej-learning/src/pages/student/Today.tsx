import { Link } from 'wouter'
import {
  useGetStudentToday,
  type DailyLessonView,
  type SubjectDay,
} from '@workspace/api-client-react'
import { Clock } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

/**
 * The day's buttons, paler than the rest of the product's.
 *
 * A subject line offers three or four of these at once, so the full amber
 * slab repeated across a row shouts. Here they rest at the pale amber the
 * navigation marks its active row with and take the full colour when reached
 * for. Ink reads 13.1:1 on the pale and 9.6:1 on the full, so both clear AA.
 *
 * Local to this page on purpose: every other screen keeps the one slab.
 */
const DAY_BUTTON = 'h-auto self-stretch rounded-none bg-sidebar-active hover:bg-sidebar'

/** One of the small buttons a subject offers. */
function Choice({ code, view, children }: { code: string; view: string; children: string }) {
  return (
    <Link
      href={`/subject/${encodeURIComponent(code)}/${view}`}
      className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), DAY_BUTTON)}
    >
      {children}
    </Link>
  )
}

/**
 * One subject's line in the day.
 *
 * It says what the subject is and what today's topic is called, and then
 * offers the three places a child can go from it. Nothing opens here: the
 * lesson, the child's own work and the questions each fill a page of their
 * own, so the day stays a short list however much work is in it.
 *
 * A button appears only where there is something behind it. A subject with no
 * class lesson - which is the normal state where students are placed by level
 * - offers the personal work and the questions, and does not offer a lesson
 * that is not there.
 */
function SubjectRow({ day }: { day: SubjectDay }) {
  const personalOnly = !day.lesson && Boolean(day.extra)
  const lessons = [day.lesson, day.extra?.lesson].filter(Boolean) as DailyLessonView[]
  const minutes = lessons.reduce((total, lesson) => total + (lesson.estimatedMinutes ?? 0), 0)
  const lead = day.lesson?.skillName ?? day.extra?.lesson.skillName ?? null

  return (
    <li className="flex flex-wrap items-stretch gap-x-3 gap-y-2 pl-3">
      <div className="flex min-w-0 flex-1 flex-col justify-center py-2.5">
        <p className="text-sm font-semibold">{day.subjectName}</p>
        <p className="truncate text-xs text-muted-foreground">{lead ?? 'Хичээл алга'}</p>
      </div>

      {day.extra && !personalOnly ? (
        <span className="flex shrink-0 items-center gap-1.5 self-center text-xs text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-pending" />
          Нэмэлттэй
        </span>
      ) : null}

      {minutes > 0 ? (
        <span className="flex shrink-0 items-center gap-1 self-center text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          {minutes} мин
        </span>
      ) : null}

      {/* The list's own divider colour, so one line runs through the whole
          thing. It reads 1.15:1 on the amber against 1.34:1 between the
          rows - fainter there than here, because the fill behind it is
          darker. Matching was the ask; this is the cost of it. */}
      <div className="flex flex-wrap items-stretch [&>*+*]:border-l [&>*+*]:border-border">
        {day.lesson ? (
          <Choice code={day.subjectCode} view="lesson">
            Хичээл
          </Choice>
        ) : null}
        {day.extra ? (
          <Choice code={day.subjectCode} view="personal">
            Нэмэлт бэлтгэл
          </Choice>
        ) : null}
        <Link
          href={`/subjects/${encodeURIComponent(day.subjectCode)}/plan`}
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), DAY_BUTTON)}
        >
          Хувийн төлөвлөгөө
        </Link>
        {day.lesson || day.extra ? (
          <Choice code={day.subjectCode} view="quiz">
            Шалгалт
          </Choice>
        ) : null}
      </div>
    </li>
  )
}

export default function StudentToday() {
  const { data, isLoading, isError } = useGetStudentToday()

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    )
  }

  if (isError || !data) {
    return <p role="alert">Өнөөдрийн хичээлийг уншиж чадсангүй.</p>
  }

  return (
    <div className="space-y-4">
      {/* The date is in the top bar and the class is on the account menu,
          so the page opens on the lessons themselves. */}
      {data.subjects.length === 0 ? (
        // Plain text, not a card. A card frames something; an empty day has
        // nothing to frame, and boxing the sentence makes the absence look
        // like a broken component.
        <p className="py-6 text-sm text-muted-foreground">{data.notice}</p>
      ) : (
        // The list narrows and holds the left; the panel beside it is
        // reserved and deliberately empty. Below `lg` the two stack, and the
        // list takes the width back.
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <ul className="divide-y overflow-hidden rounded-sm border border-border bg-card">
            {data.subjects.map((day) => (
              <SubjectRow key={day.subjectCode} day={day} />
            ))}
          </ul>
          <aside
            aria-label="Мэдэгдэл"
            className="hidden rounded-sm border border-border bg-card p-3 lg:block"
          >
            <h2 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Мэдэгдэл
            </h2>
            {/* Written here, not read from anywhere: the database has no
                notifications table and no endpoint to fill one. The tag says
                so on the notice itself, because a school notice nobody sent
                is worse than an empty panel. */}
            <div className="mt-2 border-l-2 border-pending pl-2.5">
              <div className="flex items-center gap-2">
                <p className="text-xs font-semibold">Эцэг эхийн хурал</p>
                <span className="rounded-[2px] bg-muted px-1 text-[9px] font-medium text-muted-foreground">
                  Жишээ
                </span>
              </div>
              <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                Баасан гаригт 18:00 цагт, 6а ангийн танхимд.
              </p>
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}
