import { useEffect, useState } from 'react'
import { Link } from 'wouter'
import {
  getGetStudentPlanQueryKey,
  useGetStudentPlan,
  useSaveStudentPlan,
} from '@workspace/api-client-react'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

const MAX = 2000

/**
 * The child's own plan for today.
 *
 * Everything else on the day comes from somewhere: the timetable, the level,
 * the teacher. This is the one part a child writes themselves, so it is a box
 * and nothing more - no skill to attach it to, no score, no approval. The
 * school's work is already measured; this is what they meant to do besides it.
 *
 * Saved on a button rather than as they type. A plan is a sentence somebody
 * composes, and a request per keystroke would store every half-written version
 * of it.
 */
export default function StudentPlan() {
  const queryClient = useQueryClient()
  const { data, isLoading, isError } = useGetStudentPlan()
  const { mutate, isPending } = useSaveStudentPlan()

  const [draft, setDraft] = useState('')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Re-seed whenever the server answers, and never while the person is typing:
  // the effect depends on what arrived, not on the draft.
  useEffect(() => {
    if (data) setDraft(data.body)
  }, [data])

  const back = (
    <Link
      href="/"
      className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" />
      Өнөөдрийн хичээл
    </Link>
  )

  if (isLoading) return <Skeleton className="h-64 w-full" />
  if (isError || !data) {
    return (
      <div className="space-y-4">
        {back}
        <p role="alert">Төлөвлөгөөг уншиж чадсангүй.</p>
      </div>
    )
  }

  const changed = draft.trim() !== data.body.trim()

  return (
    <div className="space-y-6 pb-10">
      <div className="space-y-2">
        {back}
        <div>
          <h1 className="text-2xl font-bold">Миний төлөвлөгөө</h1>
          <p className="text-sm text-muted-foreground">
            Сургуулийн хичээлээс гадна өнөөдөр юу хийхээ өөрөө бичнэ. Зөвхөн та харна.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="plan" className="block text-sm font-medium">
          Өнөөдөр
        </label>
        <textarea
          id="plan"
          className="min-h-40 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          placeholder="Жишээ нь: 20 минут ном унших, үржүүлэхийн хүрд давтах…"
          maxLength={MAX}
          value={draft}
          disabled={isPending}
          onChange={(event) => {
            setDraft(event.target.value)
            setSaved(false)
          }}
        />
        <p className="text-xs text-muted-foreground">
          {draft.length}/{MAX}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          disabled={isPending || !changed}
          onClick={() => {
            setError(null)
            mutate(
              { data: { date: data.date, body: draft } },
              {
                onSuccess: () => {
                  setSaved(true)
                  void queryClient.invalidateQueries({ queryKey: getGetStudentPlanQueryKey() })
                },
                onError: (cause) =>
                  setError(cause?.data?.error ?? 'Хадгалж чадсангүй.'),
              },
            )
          }}
        >
          {isPending ? 'Хадгалж байна…' : 'Хадгалах'}
        </Button>
        {saved && !changed ? (
          <span role="status" className="text-sm text-muted-foreground">
            Хадгаллаа.
          </span>
        ) : null}
        {error ? (
          <span role="alert" className="text-sm text-destructive">
            {error}
          </span>
        ) : null}
      </div>
    </div>
  )
}
