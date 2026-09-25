import { useState } from 'react'
import { useGetLibraryBooks, type LibraryBook } from '@workspace/api-client-react'
import { BookOpen } from 'lucide-react'
import { NATIVE_INPUT, NATIVE_SELECT } from '@/components/ui/native-select'
import { Skeleton } from '@/components/ui/skeleton'
import { appPath } from '@/lib/app-path'

function BookCover({ book }: { book: LibraryBook }) {
  const [failed, setFailed] = useState(false)
  return <div className="flex aspect-[3/4] items-center justify-center overflow-hidden rounded-sm border bg-muted/30">
    {book.hasCover && !failed ? <img
      src={appPath(`/api/content/materials/${book.id}/cover`)} alt={`${book.title} — эхний хуудас`}
      loading="lazy" decoding="async" width={360} height={480} onError={() => setFailed(true)}
      className="h-full w-full object-contain transition-transform duration-200 group-hover:scale-[1.02]"
    /> : <div className="space-y-3 p-4 text-center">
      {/* The card shows the cover alone, so without one the title stands in
          for it; otherwise the book would be an empty box. */}
      <BookOpen aria-hidden className="mx-auto h-8 w-8 text-muted-foreground" />
      <p className="text-sm font-semibold">{book.title}</p>
      <p className="text-xs text-muted-foreground">{book.subjectName}</p>
    </div>}
  </div>
}

function BookCard({ book }: { book: LibraryBook }) {
  const content = <>
    <BookCover book={book} />
    <p className="mt-1 text-xs text-muted-foreground">{book.filePages ? ` ${book.filePages} хуудас` : ''}</p>
  </>
  return <li className="min-w-0">
    {book.hasFile ? <a href={appPath(`/api/content/materials/${book.id}/file`)} target="_blank" rel="noopener noreferrer"
      className="group block rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4">
      {content}<span className="sr-only"> — шинэ цонхонд</span>
    </a> : <div>{content}<p className="mt-2 text-xs text-muted-foreground">Унших файл одоогоор бэлэн биш байна.</p></div>}
  </li>
}

export default function Library() {
  const { data, isLoading, error, refetch } = useGetLibraryBooks()
  const [grade, setGrade] = useState('all')
  const [subject, setSubject] = useState('all')
  const [search, setSearch] = useState('')
  if (isLoading) return <Skeleton className="h-64" />
  if (!data || error) return <div role="alert" className="space-y-2"><p>Номын санг уншиж чадсангүй.</p><button className="underline" onClick={() => void refetch()}>Дахин оролдох</button></div>
  const grades = [...new Set(data.flatMap((book) => book.grades))].sort((a, b) => a - b)
  const subjects = [...new Set(data.map((book) => book.subjectName))].sort((a, b) => a.localeCompare(b, 'mn'))
  const needle = search.trim().normalize('NFKC').toLocaleLowerCase('mn')
  const books = data.filter((book) => (grade === 'all' || book.grades.includes(Number(grade)))
    && (subject === 'all' || book.subjectName === subject)
    && `${book.title} ${book.subjectName}`.normalize('NFKC').toLocaleLowerCase('mn').includes(needle))
    .sort((a, b) => (a.grades[0] ?? 99) - (b.grades[0] ?? 99) || a.title.localeCompare(b.title, 'mn'))
  const sections = (grade === 'all' ? grades : [Number(grade)]).map((g) => ({
    key: String(g), title: `${g}-р анги`, books: books.filter((book) => book.grades.includes(g)),
  }))
  if (grade === 'all') sections.push({ key: 'other', title: 'Анги заагаагүй', books: books.filter((book) => !book.grades.length) })
  return <div className="space-y-4">
    <header className="space-y-1"><h2 className="text-lg font-semibold">Номын сан</h2>
      <p className="text-sm text-muted-foreground">Бүх ангийн номоос сонгон уншаарай. Өөрөө уншсан ном багшийн өгсөн ажилд тооцогдохгүй.</p>
    </header>
    <div className="flex flex-wrap items-end gap-3">
      <label className="min-w-48 flex-1 space-y-1 text-sm"><span>Ном хайх</span><input type="search" className={NATIVE_INPUT} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ном эсвэл хичээлийн нэр" /></label>
      <label className="space-y-1 text-sm"><span>Анги</span><select className={NATIVE_SELECT} value={grade} onChange={(e) => setGrade(e.target.value)}><option value="all">Бүх анги</option>{grades.map((g) => <option key={g} value={g}>{g}-р анги</option>)}</select></label>
      <label className="space-y-1 text-sm"><span>Хичээл</span><select className={NATIVE_SELECT} value={subject} onChange={(e) => setSubject(e.target.value)}><option value="all">Бүх хичээл</option>{subjects.map((s) => <option key={s}>{s}</option>)}</select></label>
    </div>
    <p role="status" className="text-sm text-muted-foreground">{books.length} ном</p>
    {!books.length && <div className="space-y-2 rounded border p-6"><p>Энэ сонголтод ном олдсонгүй.</p>
      {(grade !== 'all' || subject !== 'all' || search) && <button className="text-sm underline" onClick={() => { setGrade('all'); setSubject('all'); setSearch('') }}>Шүүлтүүр арилгах</button>}
    </div>}
    <div className="space-y-10">{sections.filter((section) => section.books.length).map((section) => <section key={section.key} aria-labelledby={`grade-${section.key}`}>
      <div className="mb-4 flex items-baseline gap-3 border-b pb-2">
        <h3 id={`grade-${section.key}`} className="text-lg font-semibold">{section.title}</h3>
        <span className="text-xs text-muted-foreground">{section.books.length} ном</span>
      </div>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
        {section.books.map((book) => <BookCard key={book.id} book={book} />)}
      </ul>
    </section>)}</div>
  </div>
}
