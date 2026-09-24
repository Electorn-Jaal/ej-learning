import { useState } from 'react'
import {
  getGetQuizPaperQueryKey,
  useGetQuizPaper,
  useSubmitQuizAttempt,
  type QuizResult,
} from '@workspace/api-client-react'
import { Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

/**
 * A school runs more than one kind of assessment, and a child sitting the
 * monthly one should not be told it is the end-of-lesson check.
 */
const KIND_LABEL: Record<string, string> = {
  LESSON: 'Шалгах асуулт',
  UNIT: 'Бүлгийн шалгалт',
  MONTHLY: 'Сарын шалгалт',
  DIAGNOSTIC: 'Оношилгооны шалгалт',
}

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
  const { data: paper, isLoading, refetch } = useGetQuizPaper(lessonId, {
    query: { queryKey: getGetQuizPaperQueryKey(lessonId), retry: false },
  })
  const { mutate, isPending } = useSubmitQuizAttempt()

  const [chosen, setChosen] = useState<Record<number, number>>({})
  const [results, setResults] = useState<QuizResult[] | null>(null)
  const [score, setScore] = useState<{ score: number; max: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [usedAfter, setUsedAfter] = useState(0)
  const [allowedAfter, setAllowedAfter] = useState(0)

  if (isLoading) return <Skeleton className="h-64 w-full" />
  // A lesson with no questions yet simply has no check; that is not an error
  // worth putting in front of a student.
  if (!paper || paper.questions.length === 0) return null

  // Three goes a day, and the paper says which one this is. Showing it again
  // when there are none left would invite a child to answer five questions and
  // be refused at the end, so what they get instead is the score they have.
  const spent = paper.attemptsUsed >= paper.attemptsAllowed
  if (spent && results === null) {
    return (
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">{KIND_LABEL[paper.kind] ?? KIND_LABEL.LESSON}</h3>
        <p className="text-sm">
          Өнөөдрийн сорилыг {paper.attemptsAllowed} удаа өгсөн байна.
          {paper.lastMaxScore ? (
            <>
              {' '}
              Сүүлийн оноо{' '}
              <strong>
                {paper.lastScore}/{paper.lastMaxScore}
              </strong>
              .
            </>
          ) : null}
        </p>
        <p className="text-sm text-muted-foreground">Маргааш дахин өгч болно.</p>
      </div>
    )
  }

  const answeredCount = Object.keys(chosen).length
  const allAnswered = answeredCount === paper.questions.length
  const resultFor = (itemId: number) => results?.find((row) => row.itemId === itemId)

  // How many goes are left after the one just marked. Read from the attempt
  // the server returned rather than counted here, because the server is what
  // decides the rule and a second tab would otherwise disagree.
  const left = results === null
    ? paper.attemptsAllowed - paper.attemptsUsed
    : Math.max(0, allowedAfter - usedAfter)

  const retry = () => {
    setResults(null)
    setScore(null)
    setChosen({})
    setError(null)
    // A fresh paper: the questions are chosen per sitting, so asking again is
    // what produces the ones this child has not seen.
    void refetch()
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
          setUsedAfter(attempt.attemptsUsed)
          setAllowedAfter(attempt.attemptsAllowed)
        },
        onError: (cause) => setError(cause?.data?.error ?? 'Хариултыг хадгалж чадсангүй.'),
      },
    )
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h3 className="text-lg font-semibold">{KIND_LABEL[paper.kind] ?? KIND_LABEL.LESSON}</h3>
        <p className="text-sm text-muted-foreground">
          {paper.questions.length} асуулт. Дэвтрийн ажлаа хийсний дараа хариулаарай.
          {' '}
          {paper.attemptsUsed > 0
            ? `${paper.attemptsUsed + 1} дэх оролдлого.`
            : `${paper.attemptsAllowed} удаа өгч болно.`}
        </p>
      </div>

      <div className="space-y-6">
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
                className="grid grid-cols-1 gap-2 sm:grid-cols-2"
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
              {left > 0 ? (
                <Button variant="outline" onClick={retry}>
                  Дахин өгөх ({left} үлдсэн)
                </Button>
              ) : (
                <span className="text-sm text-muted-foreground">Маргааш дахин өгч болно.</span>
              )}
            </>
          )}
          {error ? (
            <span role="alert" className="text-sm text-destructive">
              {error}
            </span>
          ) : null}
        </div>

        <p className="text-xs text-muted-foreground">Хариулт тань багшид харагдана.</p>
      </div>
    </div>
  )
}
