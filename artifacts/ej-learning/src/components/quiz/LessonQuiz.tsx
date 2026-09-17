import { useState } from 'react'
import {
  getGetQuizPaperQueryKey,
  useGetQuizPaper,
  useSubmitQuizAttempt,
  type QuizResult,
} from '@workspace/api-client-react'
import { Check, RotateCcw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

/**
 * Practice check for a lesson.
 *
 * The questions come from the server and the answers go back to it. The key
 * used to sit in the frontend bundle where any student could read it, and a
 * score is only worth recording once the marking happens somewhere the student
 * cannot reach. The correct options arrive with the result, which is the first
 * moment they are disclosed.
 */
export function LessonQuiz({ lessonId }: { lessonId: number }) {
  const { data: paper, isLoading } = useGetQuizPaper(lessonId, {
    query: { queryKey: getGetQuizPaperQueryKey(lessonId), retry: false },
  })
  const { mutate, isPending } = useSubmitQuizAttempt()

  const [chosen, setChosen] = useState<Record<number, number>>({})
  const [results, setResults] = useState<QuizResult[] | null>(null)
  const [score, setScore] = useState<{ score: number; max: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (isLoading) return <Skeleton className="h-64 w-full" />
  // A lesson with no questions yet simply has no check; that is not an error
  // worth putting in front of a student.
  if (!paper || paper.questions.length === 0) return null

  const answeredCount = Object.keys(chosen).length
  const allAnswered = answeredCount === paper.questions.length
  const resultFor = (itemId: number) => results?.find((row) => row.itemId === itemId)

  const reset = () => {
    setChosen({})
    setResults(null)
    setScore(null)
    setError(null)
  }

  const check = () => {
    setError(null)
    mutate(
      {
        data: {
          lessonId,
          answers: paper.questions.map((question) => ({
            itemId: question.itemId,
            optionId: chosen[question.itemId] ?? null,
          })),
        },
      },
      {
        onSuccess: (attempt) => {
          setResults(attempt.results)
          setScore({ score: attempt.score, max: attempt.maxScore })
        },
        onError: (cause) => setError(cause?.data?.error ?? 'Хариултыг хадгалж чадсангүй.'),
      },
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Шалгах асуулт</CardTitle>
        <p className="text-sm text-muted-foreground">
          {paper.questions.length} асуулт. Дэвтрийн ажлаа хийсний дараа хариулаарай.
        </p>
      </CardHeader>

      <CardContent className="space-y-6">
        {paper.questions.map((question, index) => {
          const result = resultFor(question.itemId)
          return (
            <fieldset key={question.itemId} className="space-y-3">
              <legend className="text-sm font-medium">
                {index + 1}. {question.prompt}
              </legend>

              <RadioGroup
                value={String(chosen[question.itemId] ?? '')}
                onValueChange={(value) =>
                  setChosen((prev) => ({ ...prev, [question.itemId]: Number(value) }))
                }
                disabled={Boolean(results)}
                className="gap-2"
              >
                {question.options.map((option) => {
                  const inputId = `q${question.itemId}-${option.optionId}`
                  const isAnswer = result?.correctOptionId === option.optionId
                  const isChosen = chosen[question.itemId] === option.optionId
                  return (
                    <div
                      key={option.optionId}
                      className={cn(
                        'flex items-center gap-3 rounded-md border px-3 py-2 transition-colors',
                        !results && 'hover:bg-muted/50',
                        results && isAnswer && 'border-success bg-success/5',
                        results && isChosen && !isAnswer && 'border-destructive bg-destructive/5',
                      )}
                    >
                      <RadioGroupItem value={String(option.optionId)} id={inputId} />
                      <Label htmlFor={inputId} className="flex-1 cursor-pointer font-normal">
                        {option.text}
                      </Label>
                      {results && isAnswer ? (
                        <Check className="h-4 w-4 shrink-0 text-success" />
                      ) : null}
                      {results && isChosen && !isAnswer ? (
                        <X className="h-4 w-4 shrink-0 text-destructive" />
                      ) : null}
                    </div>
                  )
                })}
              </RadioGroup>

              {result ? (
                <p
                  className={cn(
                    // A rule in the semantic colour, with the explanation left
                    // legible in ordinary text.
                    'border-l-2 py-1 pl-3 text-sm text-muted-foreground',
                    result.correct ? 'border-success' : 'border-destructive',
                  )}
                >
                  {result.correct ? 'Зөв. ' : 'Дахин үзье. '}
                  {result.explanation}
                </p>
              ) : null}
            </fieldset>
          )
        })}

        <div className="flex flex-wrap items-center gap-3 border-t pt-4">
          {!results ? (
            <>
              <Button onClick={check} disabled={!allAnswered || isPending}>
                {isPending ? 'Шалгаж байна…' : 'Шалгах'}
              </Button>
              <span className="text-sm text-muted-foreground">
                {answeredCount}/{paper.questions.length} хариулсан
              </span>
            </>
          ) : (
            <>
              <p className="text-sm font-medium">
                {score?.max} асуултаас <strong>{score?.score}</strong> зөв.
                {score && score.score === score.max
                  ? ' Маш сайн!'
                  : ' Буруу хариултын тайлбарыг уншаарай.'}
              </p>
              <Button variant="outline" size="sm" onClick={reset}>
                <RotateCcw className="h-4 w-4" />
                Дахин
              </Button>
            </>
          )}
          {error ? (
            <span role="alert" className="text-sm text-destructive">
              {error}
            </span>
          ) : null}
        </div>

        <p className="text-xs text-muted-foreground">Хариулт тань багшид харагдана.</p>
      </CardContent>
    </Card>
  )
}
