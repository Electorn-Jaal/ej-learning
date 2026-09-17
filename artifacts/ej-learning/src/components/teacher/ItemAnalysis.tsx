import { useGetItemAnalysis, type ItemAnalysisRow } from '@workspace/api-client-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

/**
 * The share of the class that got a question right, as a bar.
 *
 * Read left to right: the filled part is who has it. A teacher scanning a list
 * of twenty questions is looking for where the bars stop being full, and a
 * column of numbers makes that a reading exercise rather than a glance.
 */
function Share({ row }: { row: ItemAnalysisRow }) {
  const tone =
    row.percentCorrect >= 80
      ? 'bg-success'
      : row.percentCorrect >= 50
        ? 'bg-pending'
        : 'bg-destructive'

  return (
    <span className="flex h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-muted">
      <span className={tone} style={{ width: `${row.percentCorrect}%` }} />
    </span>
  )
}

/**
 * Question-by-question results, worst first.
 *
 * The per-skill panel answers "what is this class weak at". This answers "what
 * should I put on the board tomorrow", which is a different and usually more
 * useful question - and the answer was already sitting in the recorded
 * answers, unread.
 */
export function ItemAnalysis({ classId }: { classId: number }) {
  const { data, isLoading } = useGetItemAnalysis({ classId })

  if (isLoading) return <Skeleton className="h-48 w-full" />
  if (!data || data.items.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Асуулт бүрээр</CardTitle>
        </CardHeader>
        <CardContent className="pb-6 text-sm text-muted-foreground">
          Хараахан хариулт алга. Сурагчид шалгах асуултад хариулсны дараа аль
          асуулт дээр хэд алдсан нь энд харагдана.
        </CardContent>
      </Card>
    )
  }

  const weakest = data.items.filter((row) => row.percentCorrect < 50).length

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Асуулт бүрээр</CardTitle>
        <p className="text-sm text-muted-foreground">
          {data.items.length} асуулт, хамгийн муу нь эхэндээ.
          {weakest > 0 ? ` ${weakest} асуултад хагасаас цөөн нь зөв хариулсан.` : ''}
        </p>
      </CardHeader>
      <CardContent className="px-0 pb-2">
        <ul className="divide-y">
          {data.items.map((row, index) => (
            <li key={row.itemId} className="px-4 py-3">
              <div className="flex flex-wrap items-start gap-3">
                <span className="w-6 shrink-0 pt-0.5 text-xs tabular-nums text-muted-foreground">
                  {index + 1}.
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block text-sm">{row.prompt}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {row.skillName}
                  </span>
                </span>

                <Share row={row} />

                <span className="w-20 shrink-0 text-right text-sm font-semibold tabular-nums">
                  {row.correct}
                  <span className="font-normal text-muted-foreground">/{row.answered}</span>
                </span>
              </div>

              {row.commonWrongAnswer ? (
                <p
                  className={cn(
                    'mt-1.5 border-l-2 border-destructive py-0.5 pl-3 text-xs text-muted-foreground',
                    'ml-9',
                  )}
                >
                  {row.commonWrongCount} сурагч «{row.commonWrongAnswer}» гэж хариулсан
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
