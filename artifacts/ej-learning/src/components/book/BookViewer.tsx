import { useState } from 'react'
import { ChevronDown, ChevronUp, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { appPath } from '@/lib/app-path'

type Book = {
  materialId: number
  title: string | null
  chapterTitle: string | null
  pageFrom: number | null
  pageTo: number | null
  filePage: number | null
  fileUrl: string | null
}

/**
 * Shows the lesson's pages inline, in the browser's own PDF viewer.
 *
 * An iframe over the served file, rather than pdf.js: the file is already
 * streamed with an inline Content-Disposition, every target browser renders
 * PDF natively, and #page=N lands on the right page. That is the whole
 * feature, with no dependency, no worker bundle and nothing to keep in sync
 * with the file format.
 *
 * It starts closed. The lesson text is the thing to read first, and an iframe
 * that loads a document nobody asked for costs a request on every page view.
 */
export function BookViewer({ book }: { book: Book }) {
  const [open, setOpen] = useState(false)
  if (!book.fileUrl) return null

  // The printed number is what the student is told; the file page is where the
  // viewer has to open, and on a scanned book they differ.
  const src = `${appPath(book.fileUrl)}#page=${book.filePage ?? book.pageFrom ?? 1}&view=FitH`
  const pages =
    book.pageFrom === null
      ? null
      : book.pageTo && book.pageTo !== book.pageFrom
        ? `${book.pageFrom}–${book.pageTo} хуудас`
        : `${book.pageFrom} хуудас`

  return (
    <section className="rounded-md border border-border">
      <div className="flex flex-wrap items-center gap-3 p-4">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold">
            {book.chapterTitle ?? book.title ?? 'Сурах бичиг'}
          </h3>
          <p className="truncate text-xs text-muted-foreground">
            {book.title}
            {pages ? ` · ${pages}` : null}
          </p>
        </div>

        <Button variant="outline" size="sm" onClick={() => setOpen((v) => !v)}>
          {open ? (
            <>
              <ChevronUp className="h-4 w-4" />
              Хаах
            </>
          ) : (
            <>
              <ChevronDown className="h-4 w-4" />
              Ном нээх
            </>
          )}
        </Button>

        <Button variant="ghost" size="sm" asChild>
          <a href={src} target="_blank" rel="noreferrer">
            <ExternalLink className="h-4 w-4" />
            <span className="sr-only sm:not-sr-only">Шинэ цонхонд</span>
          </a>
        </Button>
      </div>

      {open ? (
        <div className="border-t border-border">
          <iframe
            src={src}
            title={`${book.title ?? 'Сурах бичиг'} — ${pages ?? ''}`}
            className="h-[70vh] w-full bg-muted"
          />
          <p className="px-4 py-2 text-xs text-muted-foreground">
            Хэрэв ном харагдахгүй бол «Шинэ цонхонд» товчийг дарна уу.
          </p>
        </div>
      ) : null}
    </section>
  )
}
