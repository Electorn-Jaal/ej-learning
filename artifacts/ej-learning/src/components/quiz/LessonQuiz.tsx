import { useMemo, useState } from 'react'
import { Check, RotateCcw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { cn } from '@/lib/utils'
import { questionsForLesson, type MockQuestion } from '@/lib/mock-quiz'

/**
 * Practice check for a lesson.
 *
 * Deliberately storage-free: answers stay in component state, so nothing is
 * recorded and no teacher can review them. That is the agreed scope for this
 * stage - the flow and the look, not the evidence. Said plainly in the notice
 * below rather than only in a comment, because a student who answers questions
 * will otherwise assume their teacher sees the result.
 */
export function LessonQuiz({ lessonCode }: { lessonCode: string }) {
  const questions = useMemo(() => questionsForLesson(lessonCode), [lessonCode])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [checked, setChecked] = useState(false)

  const answeredCount = Object.keys(answers).length
  const allAnswered = answeredCount === questions.length
  const score = questions.filter((q) => answers[q.id] === q.correctOptionId).length

  const reset = () => {
    setAnswers({})
    setChecked(false)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Шалгах асуулт</CardTitle>
        <p className="text-sm text-muted-foreground">
          {questions.length} асуулт. Дэвтрийн ажлаа хийсний дараа хариулаарай.
        </p>
      </CardHeader>

      <CardContent className="space-y-6">
        {questions.map((question, index) => (
          <Question
            key={question.id}
            index={index}
            question={question}
            selected={answers[question.id]}
            checked={checked}
            onSelect={(optionId) =>
              setAnswers((prev) => ({ ...prev, [question.id]: optionId }))
            }
          />
        ))}

        <div className="flex flex-wrap items-center gap-3 border-t pt-4">
          {!checked ? (
            <>
              <Button onClick={() => setChecked(true)} disabled={!allAnswered}>
                Шалгах
              </Button>
              <span className="text-sm text-muted-foreground">
                {answeredCount}/{questions.length} хариулсан
              </span>
            </>
          ) : (
            <>
              <p className="text-sm font-medium">
                {questions.length} асуултаас <strong>{score}</strong> зөв.
                {score === questions.length
                  ? ' Маш сайн!'
                  : ' Буруу хариултын тайлбарыг уншаарай.'}
              </p>
              <Button variant="outline" size="sm" onClick={reset}>
                <RotateCcw className="h-4 w-4" />
                Дахин
              </Button>
            </>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          Энэ бол туршилтын асуултууд. Хариулт хадгалагдахгүй бөгөөд багшид
          харагдахгүй.
        </p>
      </CardContent>
    </Card>
  )
}

function Question({
  index,
  question,
  selected,
  checked,
  onSelect,
}: {
  index: number
  question: MockQuestion
  selected: string | undefined
  checked: boolean
  onSelect: (optionId: string) => void
}) {
  const isCorrect = selected === question.correctOptionId

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium">
        {index + 1}. {question.prompt}
      </legend>

      <RadioGroup
        value={selected ?? ''}
        onValueChange={onSelect}
        disabled={checked}
        className="gap-2"
      >
        {question.options.map((option) => {
          const inputId = `${question.id}-${option.id}`
          const isAnswer = option.id === question.correctOptionId
          const isChosen = option.id === selected

          return (
            <div
              key={option.id}
              className={cn(
                'flex items-center gap-3 rounded-md border px-3 py-2 transition-colors',
                !checked && 'hover:bg-muted/50',
                checked && isAnswer && 'border-success bg-success/5',
                checked && isChosen && !isAnswer && 'border-destructive bg-destructive/5',
              )}
            >
              <RadioGroupItem value={option.id} id={inputId} />
              <Label htmlFor={inputId} className="flex-1 cursor-pointer font-normal">
                {option.text}
              </Label>
              {checked && isAnswer ? (
                <Check className="h-4 w-4 shrink-0 text-success" />
              ) : null}
              {checked && isChosen && !isAnswer ? (
                <X className="h-4 w-4 shrink-0 text-destructive" />
              ) : null}
            </div>
          )
        })}
      </RadioGroup>

      {checked ? (
        <p
          className={cn(
            // A rule in the semantic colour, with the explanation left legible
            // in ordinary text - not a tinted block printing its own hue back.
            'border-l-2 py-1 pl-3 text-sm text-muted-foreground',
            isCorrect ? 'border-success' : 'border-destructive',
          )}
        >
          {isCorrect ? 'Зөв. ' : 'Дахин үзье. '}
          {question.explanation}
        </p>
      ) : null}
    </fieldset>
  )
}
