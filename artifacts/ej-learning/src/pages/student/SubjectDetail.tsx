import { Link, useRoute } from 'wouter'
import {
  useGetStudentPlacements,
  useGetStudentStudyPlan,
  useGetStudentSubjectOutline,
  type SubjectOutlineSection,
} from '@workspace/api-client-react'
import { useStudentScheduleDays } from '@workspace/api-client-react'
import { ArrowLeft, ArrowRight, BookOpen, Check, ExternalLink } from 'lucide-react'
import { dayName, schoolToday, scheduleWindow } from '@/lib/schedule-window'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { TeacherCard } from '@/components/student/TeacherCard'
import { cn } from '@/lib/utils'

const ROMAN = ['', 'I', 'II', 'III', 'IV']

const periodLabel = (n: number | null) =>
  n ? `${ROMAN[n] ?? n} улирал` : 'Улирал заагаагүй'

const pages = (from: number | null, to: number | null) =>
  from && to ? (from === to ? `${from}-р хуудас` : `${from}–${to}-р хуудас`) : null

/**
 * The book, opened at a printed page.
 *
 * A plain href rather than a fetch: the endpoint streams the PDF inline and
 * the browser's own viewer takes the #page fragment, so the child gets their
 * reader's search, zoom and bookmarks instead of one we would have to build.
 * The offset is what turns the number printed on the page into the page the
 * viewer has to be sent to.
 */
function bookHref(materialId: string, printedPage: number, offset: number) {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '')
  return `${base}/api/content/materials/${materialId}/file#page=${printedPage + offset}`
}

/** Book order, broken at each change of term, so the year has a shape. */
function byPeriod(sections: SubjectOutlineSection[]) {
  const groups: { periodNo: number | null; rows: SubjectOutlineSection[] }[] = []
  for (const section of sections) {
    const last = groups[groups.length - 1]
    if (last && last.periodNo === section.periodNo) last.rows.push(section)
    else groups.push({ periodNo: section.periodNo, rows: [section] })
  }
  return groups
}

function SectionRow({
  section,
  materialId,
  pageOffset,
}: {
  section: SubjectOutlineSection
  materialId: string | null
  pageOffset: number
}) {
  const range = pages(section.pageFrom, section.pageTo)
  return (
    <li
      className={cn(
        'flex items-start gap-2.5 px-3 py-1.5',
        section.isCurrent && 'bg-sidebar-active',
      )}
    >
      <span className="w-4 shrink-0 pt-0.5 text-muted-foreground">
        {section.isCurrent ? (
          <ArrowRight className="h-3.5 w-3.5 text-foreground" />
        ) : section.isPast ? (
          <Check className="h-3.5 w-3.5" />
        ) : null}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            'block text-xs leading-snug',
            section.isCurrent && 'font-semibold',
            // Done, not gone: a child revising wants to find it, so it stays
            // legible rather than being greyed out of the way.
            section.isPast && 'text-muted-foreground',
          )}
        >
          {section.printedNumber ? `${section.printedNumber}. ` : ''}
          {section.title}
        </span>
      </span>
      {range ? (
        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{range}</span>
      ) : null}
      {materialId && section.pageFrom ? (
        <a
          href={bookHref(materialId, section.pageFrom, pageOffset)}
          target="_blank"
          rel="noreferrer"
          title="Номыг энэ хуудаснаас нээх"
          className="shrink-0 rounded-[2px] p-0.5 text-muted-foreground hover:bg-sidebar-active hover:text-foreground"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          <span className="sr-only">Номоос нээх</span>
        </a>
      ) : null}
    </li>
  )
}

/**
 * When this subject falls in the week, read off the timetable.
 *
 * The same week the schedule page asks for, so react-query serves both from
 * one set of responses rather than fetching the days twice.
 */
function WeekSlots({ code }: { code: string }) {
  const week = scheduleWindow(schoolToday())
  const days = useStudentScheduleDays(week.dates)
  const slots = week.dates
    .flatMap((date, index) => (days[index]?.data?.slots ?? [])
      .filter((row) => row.subjectCode === code && row.periodNo !== null)
      .map((entry) => ({ date, entry })))

  if (days.some((day) => day.isLoading)) return <Skeleton className="h-10 w-full" />
  if (slots.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Энэ долоо хоногт хуваарьт ороогүй байна.
      </p>
    )
  }
  return (
    <ul className="space-y-1">
      {slots.map(({ date, entry }, index) => (
        <li key={`${date}:${entry.periodNo}:${index}`} className="flex items-baseline justify-between gap-2 text-xs">
          <span className={cn(date === schoolToday() && 'font-semibold text-primary')}>
            {dayName(date)} өдөр
          </span>
          <span className="tabular-nums text-muted-foreground">{entry!.periodNo}-р цаг</span>
        </li>
      ))}
    </ul>
  )
}

/**
 * One subject, end to end: the book it is taught from and every section in it,
 * with the class's place marked.
 *
 * Two things, kept apart on purpose. Үндсэн хичээл is what the whole class
 * works through together; the personal plan is what this child alone has been
 * given, and it has a page of its own. This screen says whether one exists and
 * links to it rather than printing it again - both pages used to render the
 * same two cards and link to each other, so a child could press back and
 * forth between them and never find anything new.
 *
 * There is no block for skills. content_skill_maps and student_skill_mastery
 * are both empty, so every figure it could show would be zero, and a panel of
 * zeroes reads as a broken page rather than as an honest "not measured yet".
 */
export default function StudentSubjectDetail() {
  const [, params] = useRoute('/subjects/:code')
  const code = params?.code ?? ''
  const { data, isLoading, isError } = useGetStudentSubjectOutline({ subject: code })
  const { data: placements } = useGetStudentPlacements()
  const { data: plan } = useGetStudentStudyPlan()
  const placement = placements?.find((row) => row.subjectCode === code)
  const planWeeks = plan?.filter((week) => week.subjectCode === code) ?? []

  const back = (
    <Link
      href="/subjects"
      className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" />
      Миний хичээлүүд
    </Link>
  )

  if (isLoading) return <Skeleton className="h-[30rem] w-full" />
  if (isError || !data) {
    return (
      <div className="space-y-3">
        {back}
        <p role="alert" className="text-sm text-destructive">Хичээлийн мэдээллийг уншиж чадсангүй.</p>
      </div>
    )
  }

  const done = data.currentPosition ? data.currentPosition - 1 : 0
  const percent = data.totalSections ? Math.round((done / data.totalSections) * 100) : 0

  return (
    <div className="space-y-3 pb-10">
      {back}

      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-xl font-bold">{data.subjectName || code}</h1>
        {data.bookTitle ? (
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <BookOpen className="h-3.5 w-3.5" />
            {data.bookTitle}
          </span>
        ) : null}
      </header>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Card>
          <CardContent className="p-0">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b px-3 py-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Үндсэн хичээл
              </h2>
              {data.currentPosition ? (
                <p className="text-[11px] text-muted-foreground">
                  Ангиараа: {data.totalSections} сэдвийн {data.currentPosition} дэх
                </p>
              ) : null}
            </div>

            {data.sections.length === 0 ? (
              <p className="px-3 py-6 text-sm text-muted-foreground">
                {data.bookTitle
                  ? 'Энэ номын сэдвийн задаргаа хараахан ороогүй байна.'
                  : 'Энэ хичээлд үндсэн ном холбогдоогүй байна.'}
              </p>
            ) : (
              <>
                {data.currentPosition ? (
                  <div className="px-3 pt-2">
                    <div className="h-1 w-full overflow-hidden rounded-[2px] bg-muted">
                      <div className="h-full bg-sidebar" style={{ width: `${percent}%` }} />
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {done} сэдэв үзэж дууссан · {percent}%
                    </p>
                  </div>
                ) : null}
                {byPeriod(data.sections).map((group) => (
                  <section key={`${group.periodNo}`}>
                    <h3 className="bg-muted/50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {periodLabel(group.periodNo)}
                    </h3>
                    <ul className="divide-y">
                      {group.rows.map((section) => (
                        <SectionRow
                          key={section.nodeId}
                          section={section}
                          materialId={data.materialId}
                          pageOffset={data.pageOffset}
                        />
                      ))}
                    </ul>
                  </section>
                ))}
              </>
            )}
          </CardContent>
        </Card>

        <div className="space-y-3">
          {/* Who takes it, before when it falls: a child looking up a
              subject is at least as likely to be asking whose lesson it is. */}
          {data.teachers.length > 0 ? (
            <Card>
              <CardContent className="space-y-1 p-3">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Багш
                </h2>
                <div className="flex flex-col gap-0.5">
                  {data.teachers.map((teacher) => (
                    <TeacherCard key={teacher.teacherId} teacher={teacher} />
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardContent className="space-y-2 p-3">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Хуваарь
              </h2>
              <WeekSlots code={code} />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-2 p-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Миний бэлтгэл
            </h2>
            {placement || planWeeks.length ? (
              // A summary and a way through, not the plan itself. The plan has
              // a page; printing it here as well was the duplication.
              <p className="text-xs text-muted-foreground">
                {[
                  placement ? `${placement.levelCode} түвшин` : null,
                  placement ? `${placement.steps.length} алхам` : null,
                  planWeeks.length ? `${planWeeks.length} долоо хоногийн хуваарь` : null,
                ].filter(Boolean).join(' · ')}
              </p>
            ) : (
              /* learning.student_assignments is empty and no placement has been
                 recorded for this subject. Saying so is the whole content of
                 the block until one of those changes. */
              <p className="text-xs text-muted-foreground">
                Энэ хичээлд танд өгсөн хувийн ажил одоогоор алга байна.
              </p>
            )}
            {placement || planWeeks.length ? (
              <Link
                href={`/subjects/${encodeURIComponent(code)}/plan`}
                className={cn(buttonVariants({ size: 'sm' }))}
              >
                Хувийн төлөвлөгөө үзэх
              </Link>
            ) : null}
            </CardContent>
          </Card>
        </div>
      </div>

    </div>
  )
}
