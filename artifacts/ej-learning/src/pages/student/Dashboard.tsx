import { useGetStudentDashboard } from '@workspace/api-client-react'
import { Link } from 'wouter'
import { BookOpen, Clock } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * Everything approved for this student, grouped by subject.
 *
 * It used to be one flat run of cards. A child looking for today's maths had
 * to read past the Mongolian to find it, and the longer the catalogue grew the
 * worse that got - so the subject is the outer structure now, and each one
 * says how many lessons it holds before the list starts.
 */
export default function StudentDashboard() {
  const { data, isLoading, isError } = useGetStudentDashboard()

  if (isLoading) return <Skeleton className="h-64 w-full" />
  if (isError || !data) {
    return <p role="alert">Сургалтын мэдээлэл уншихад алдаа гарлаа.</p>
  }

  const bySubject = new Map<string, typeof data.activities>()
  for (const item of data.activities) {
    const subject = item.subject || 'Бусад'
    bySubject.set(subject, [...(bySubject.get(subject) ?? []), item])
  }
  const subjects = [...bySubject.entries()].sort(([a], [b]) => a.localeCompare(b, 'mn'))

  return (
    <div className="space-y-6 pb-10">
      <header>
        <h1 className="text-2xl font-bold">Хичээлийн сан</h1>
        <p className="mt-1 text-muted-foreground">
          {data.displayName} · {data.dateLabel}
        </p>
      </header>

      <div className="flex flex-wrap gap-4 text-sm">
        <Link href="/" className="text-primary underline">
          Өнөөдрийн хичээл
        </Link>
        <Link href="/progress" className="text-primary underline">
          Миний ахиц
        </Link>
        <Link href="/subjects" className="text-primary underline">
          Миний хичээлүүд
        </Link>
      </div>

      {data.activities.length === 0 ? (
        <div className="rounded-md border border-border bg-card p-6 text-sm text-muted-foreground">
          Одоогоор таны ангид тохирох баталгаажсан хичээл алга. Ноорог материал
          сурагчид харагдахгүй.
        </div>
      ) : (
        <div className="space-y-8">
          {subjects.map(([subject, items]) => (
            <section key={subject} className="space-y-3">
              <h2 className="flex items-baseline gap-2 border-b border-border pb-2">
                <BookOpen className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="text-lg font-bold">{subject}</span>
                <span className="text-sm font-normal text-muted-foreground">
                  {items.length} хичээл
                </span>
              </h2>

              <ul className="divide-y divide-border rounded-md border border-border bg-card">
                {items.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={item.actionPath}
                      className="flex flex-wrap items-start gap-3 px-4 py-3 transition-colors hover:bg-secondary/50"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{item.topic}</span>
                        <span className="block text-sm text-muted-foreground">{item.goal}</span>
                      </span>
                      {item.estimatedMinutes > 0 ? (
                        <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3.5 w-3.5" aria-hidden />
                          {item.estimatedMinutes} мин
                        </span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <p className="rounded-md border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
        {data.dataNotice}
      </p>
    </div>
  )
}
