import { useState } from 'react'
import { Link } from 'wouter'
import { useGetStudentSubjects, type SubjectOverview } from '@workspace/api-client-react'
import { BookOpen, LayoutGrid, List } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * Where the class is in this subject's book.
 *
 * Reported as a position and a percentage, and labelled as the CLASS's. The
 * system measures no individual progress at all yet - no skill is mapped to
 * a section and no child has been assessed against one - so a bar presented
 * as "yours" would be a fabrication.
 */
function progressOf(subject: SubjectOverview) {
  if (!subject.topicPosition || !subject.bookSections) return null
  const done = subject.topicPosition - 1
  return {
    total: subject.bookSections,
    position: subject.topicPosition,
    percent: Math.round((done / subject.bookSections) * 100),
  }
}

function ProgressBar({ percent }: { percent: number }) {
  return (
    <div className="h-1 w-full overflow-hidden rounded-[2px] bg-muted">
      <div className="h-full bg-sidebar" style={{ width: `${percent}%` }} />
    </div>
  )
}

function Provisional() {
  return (
    <Badge variant="outline" className="shrink-0 text-[10px] font-normal">
      Батлагдаагүй
    </Badge>
  )
}

function SubjectCard({ subject }: { subject: SubjectOverview }) {
  const progress = progressOf(subject)
  return (
    <Link
      href={`/subjects/${encodeURIComponent(subject.code)}`}
      className="block rounded-sm transition-colors hover:bg-sidebar-active/40"
    >
      <Card className="h-full">
        <CardContent className="space-y-2 p-3">
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-sm font-bold leading-snug">{subject.name}</h2>
            {subject.origin === 'CURRICULUM' ? <Provisional /> : null}
          </div>

          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <BookOpen className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{subject.bookTitle ?? 'Үндсэн ном холбогдоогүй'}</span>
          </p>

          {subject.topicTitle ? (
            <p className="line-clamp-2 text-xs leading-snug">
              {subject.topicNumber ? `${subject.topicNumber}. ` : ''}
              {subject.topicTitle}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">Багш одоогийн сэдвийг заагаагүй.</p>
          )}

          {progress ? (
            <div className="space-y-1">
              <ProgressBar percent={progress.percent} />
              <p className="text-[11px] text-muted-foreground">
                Ангиараа: {progress.total} сэдвийн {progress.position} дэх · {progress.percent}%
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </Link>
  )
}

function SubjectRow({ subject }: { subject: SubjectOverview }) {
  const progress = progressOf(subject)
  return (
    <li>
      <Link
        href={`/subjects/${encodeURIComponent(subject.code)}`}
        className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 transition-colors hover:bg-sidebar-active/40"
      >
        <span className="w-36 shrink-0 text-sm font-semibold">{subject.name}</span>
        <span className="hidden w-52 shrink-0 truncate text-xs text-muted-foreground md:block">
          {subject.bookTitle ?? 'Ном холбогдоогүй'}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs">
          {subject.topicTitle
            ? `${subject.topicNumber ? subject.topicNumber + '. ' : ''}${subject.topicTitle}`
            : '—'}
        </span>
        {progress ? (
          <span className="flex w-40 shrink-0 items-center gap-2">
            <ProgressBar percent={progress.percent} />
            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
              {progress.position}/{progress.total}
            </span>
          </span>
        ) : null}
        {subject.origin === 'CURRICULUM' ? <Provisional /> : null}
      </Link>
    </li>
  )
}

/**
 * Every subject the class studies, as cards or as rows.
 *
 * The two views answer different questions with the same data: the grid is
 * for picking one out, the list for reading eleven positions down a column
 * and seeing which subject has fallen behind. Neither hides anything the
 * other shows.
 */
export default function StudentSubjects() {
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const { data, isLoading, isError } = useGetStudentSubjects()

  if (isLoading) return <Skeleton className="h-96 w-full" />
  if (isError || !data) return <p role="alert">Хичээлийн мэдээллийг уншиж чадсангүй.</p>

  const provisional = data.filter((subject) => subject.origin === 'CURRICULUM').length

  return (
    <div className="space-y-3">
      <header className="flex flex-wrap items-center justify-end gap-2">
        <div className="flex" role="group" aria-label="Харагдац">
          <Button
            size="sm"
            variant={view === 'grid' ? 'default' : 'outline'}
            aria-pressed={view === 'grid'}
            onClick={() => setView('grid')}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            Сүлжээ
          </Button>
          <Button
            size="sm"
            variant={view === 'list' ? 'default' : 'outline'}
            aria-pressed={view === 'list'}
            onClick={() => setView('list')}
            className="border-l border-border"
          >
            <List className="h-3.5 w-3.5" />
            Жагсаалт
          </Button>
        </div>
      </header>

      {provisional > 0 ? (
        <p className="rounded-sm border border-dashed p-2 text-xs text-muted-foreground">
          «Батлагдаагүй» гэсэн {provisional} хичээл нь улсын хөтөлбөрийн жагсаалтаас түр
          бөглөгдсөн бөгөөд сургуулиас баталгаажаагүй байна.
        </p>
      ) : null}

      {!data.length ? (
        <p className="py-6 text-sm text-muted-foreground">
          Анги–хичээлийн холбоо орж ирсний дараа сурагчийн хичээлүүд энд харагдана.
        </p>
      ) : view === 'grid' ? (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {data.map((subject) => (
            <SubjectCard key={subject.code} subject={subject} />
          ))}
        </div>
      ) : (
        <ul className="divide-y overflow-hidden rounded-sm border border-border bg-card">
          {data.map((subject) => (
            <SubjectRow key={subject.code} subject={subject} />
          ))}
        </ul>
      )}
    </div>
  )
}
