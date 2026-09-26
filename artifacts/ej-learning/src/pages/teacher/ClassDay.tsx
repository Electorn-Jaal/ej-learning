import { useState } from 'react'
import { Link, useRoute, useSearch, useLocation } from 'wouter'
import { useQueryClient } from '@tanstack/react-query'
import {
  getGetTeacherLessonsQueryKey,
  useGetClassDay,
  useGetTeacherLessons,
  useSetScheduleDay,
  useMarkNotebooks,
  useMarkAttendance,
  type ClassDayLesson,
  type ClassDayStudent,
  type ReplanProposal,
  type ClassDayLesson as ClassDayLessonType,
  type NotebookState,
  type AttendanceState,
} from '@workspace/api-client-react'
import { ArrowLeft, Check, ChevronDown, ChevronUp, ClipboardList, Users, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NATIVE_INPUT, NATIVE_SELECT } from '@/components/ui/native-select'
import { BookViewer } from '@/components/book/BookViewer'
import { ReplanPrompt } from '@/components/schedule/ReplanPrompt'
import { Skeleton } from '@/components/ui/skeleton'
import { subjectParam } from '@/lib/teacher-class'
import { hasRole, useSession } from '@/lib/session'
import { calendarDate, schoolToday } from '@/lib/schedule-window'
import { QuizPreviewPanel } from '@/components/teacher/QuizPreviewPanel'
import { cn } from '@/lib/utils'

const TIME = new Intl.DateTimeFormat('mn-MN', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Ulaanbaatar',
})

/**
 * One block of the lesson, printed only where it has been written.
 *
 * Empty headings are worse than absent ones: a teacher scanning for the
 * practice reads four titles with nothing under them and concludes the page
 * is broken rather than that the lesson is thin.
 */
function Block({ title, body }: { title: string; body: string | null }) {
  if (!body) return null
  return (
    <div className="space-y-0.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <p className="whitespace-pre-line text-sm">{body}</p>
    </div>
  )
}

/**
 * One period: what the class is given, and the three things a teacher changes
 * about it - which section it is, which pages it actually took, and what they
 * want said about it today.
 *
 * One Хадгалах for all three. The topic used to save the moment it changed and
 * the note the moment the box lost focus, which is invisible: a teacher who
 * picks a section, corrects the pages and types an instruction has made one
 * decision, and is entitled to see it saved once, deliberately.
 *
 * The pages are prefilled from the book and are an override, not a record. The
 * printed range is right nearly always; a class that went further did that,
 * and their children should be sent to the pages their own teacher taught
 * from - without moving the pages for every other school using the book.
 */
function LessonCard({ classId, date, lesson, editable, onSaved }: {
  classId: number
  date: string
  lesson: ClassDayLesson
  editable: boolean
  onSaved: () => void
}) {
  const params = { classId, ...subjectParam(lesson.subjectId) }
  const { data: lessons } = useGetTeacherLessons(params, {
    query: { queryKey: getGetTeacherLessonsQueryKey(params) },
  })
  const { mutate: setDay, isPending: saving, error } = useSetScheduleDay()

  const server = {
    lessonId: lesson.lessonId === null ? '' : String(lesson.lessonId),
    pageFrom: lesson.book?.pageFrom == null ? '' : String(lesson.book.pageFrom),
    pageTo: lesson.book?.pageTo == null ? '' : String(lesson.book.pageTo),
    note: lesson.note ?? '',
    // The sections beyond this one the teacher has said were also covered,
    // as a sorted, comma-joined string so the dirty check compares by value.
    alsoCovered: lesson.coveredLessonIds
      .filter((id) => id !== lesson.lessonId)
      .sort((a, b) => a - b)
      .join(','),
    held: lesson.held ? '1' : '',
    notHeldReason: lesson.notHeldReason ?? '',
    isContinuation: lesson.isContinuation ? '1' : '',
    quizOpensAt: lesson.quizOpensAt ?? '',
    quizQuestionCount: lesson.quizQuestionCount == null ? '' : String(lesson.quizQuestionCount),
    quizAttempts: lesson.quizAttempts == null ? '' : String(lesson.quizAttempts),
    answersOpenAt: lesson.answersOpenAt ?? '',
  }
  const [draft, setDraft] = useState(server)
  const [saved, setSaved] = useState(false)
  // Raised by a save that would move later days, and answered before it does.
  const [replan, setReplan] = useState<ReplanProposal | null>(null)

  // Re-seeded whenever the day comes back different, so a save elsewhere or a
  // replan does not leave the boxes showing something no longer true.
  const key = [
    server.lessonId, server.pageFrom, server.pageTo, server.note, server.alsoCovered,
    server.held, server.notHeldReason, server.isContinuation,
    server.quizOpensAt, server.quizQuestionCount, server.quizAttempts, server.answersOpenAt,
  ].join('\u0000')
  const [seed, setSeed] = useState(key)
  if (seed !== key) {
    setSeed(key)
    setDraft(server)
  }

  const dirty = (Object.keys(server) as Array<keyof typeof server>)
    .some((field) => draft[field] !== server[field])

  const save = () => {
    setDay({
      data: {
        classId,
        scheduledOn: date,
        timetableSlotId: lesson.timetableSlotId,
        subjectId: lesson.subjectId,
        lessonId: draft.lessonId ? Number(draft.lessonId) : null,
        coveredLessonIds: draft.lessonId
          ? [Number(draft.lessonId), ...alsoCovered]
          : null,
        note: draft.note.trim() === '' ? null : draft.note,
        held: draft.held !== '',
        notHeldReason: draft.notHeldReason.trim() === '' ? null : draft.notHeldReason,
        isContinuation: draft.isContinuation !== '',
        quizOpensAt: draft.quizOpensAt === '' ? null : draft.quizOpensAt,
        quizQuestionCount: draft.quizQuestionCount === '' ? null : Number(draft.quizQuestionCount),
        quizAttempts: draft.quizAttempts === '' ? null : Number(draft.quizAttempts),
        answersOpenAt: draft.answersOpenAt === '' ? null : draft.answersOpenAt,
        // A range needs both ends or neither; the server says so too.
        pageFrom: draft.pageFrom === '' ? null : Number(draft.pageFrom),
        pageTo: draft.pageTo === '' ? null : Number(draft.pageTo),
      },
    }, {
      onSuccess: (result) => {
        setSaved(true)
        setReplan(result.replan)
        onSaved()
      },
    })
  }

  const alsoCovered = draft.alsoCovered === ''
    ? []
    : draft.alsoCovered.split(',').map(Number)

  // The sections the class has gone past but not been marked as having done.
  //
  // A teacher who moves the day on from section 4 to section 5 means one of
  // two things, and the day alone cannot tell them apart: we did 4 and started
  // 5, or we skipped 4 and will come back to it. The system assumes the
  // second, because a section wrongly thought untaught comes back round while
  // one wrongly thought taught is never seen again - so this is where they say
  // otherwise. Only what lies between the day's own section and the chosen one
  // is offered; going back in the book asks nothing.
  const ordered = lessons ?? []
  const chosenAt = ordered.findIndex((row) => String(row.id) === draft.lessonId)
  const wasAt = ordered.findIndex((row) => row.id === lesson.lessonId)
  const held = draft.held !== ''
  const skipped = held && chosenAt > 0 && wasAt >= 0 && chosenAt > wasAt
    ? ordered.slice(wasAt, chosenAt)
    : []

  const toggle = (id: number) => {
    const next = alsoCovered.includes(id)
      ? alsoCovered.filter((row) => row !== id)
      : [...alsoCovered, id]
    setDraft({ ...draft, alsoCovered: next.sort((a, b) => a - b).join(',') })
  }

  const printed = lesson.book && lesson.book.bookPageFrom !== null
    ? String(lesson.book.bookPageFrom)
      + (lesson.book.bookPageTo && lesson.book.bookPageTo !== lesson.book.bookPageFrom
        ? '–' + lesson.book.bookPageTo : '')
    : null

  return (
    <li className="space-y-3 px-4 py-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-xs tabular-nums text-muted-foreground">
          {lesson.periodNo ? lesson.periodNo + '-р цаг' : 'Цаг заагаагүй'}
          {lesson.startsAt ? ' · ' + lesson.startsAt : ''}
        </span>
        <span className="text-sm font-semibold">{lesson.subjectName}</span>
        {lesson.estimatedMinutes ? (
          <span className="text-xs text-muted-foreground">{lesson.estimatedMinutes} мин</span>
        ) : null}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 space-y-0.5 sm:max-w-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Сэдэв
          </p>
          <select
            className={NATIVE_SELECT}
            aria-label={lesson.subjectName + ' — өнөөдрийн сэдэв'}
            disabled={saving || !editable}
            value={draft.lessonId}
            onChange={(event) => setDraft({ ...draft, lessonId: event.target.value })}
          >
            <option value="">Сэдэв сонгох</option>
            {(lessons ?? []).map((row) => (
              <option key={row.id} value={String(row.id)}>
                {row.skillName}{row.chapterTitle ? ' · ' + row.chapterTitle : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Disabled where no book is linked to the section: a page number
            that refers to nothing would be stored and never shown to
            anybody. */}
        <div className="space-y-0.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Хуудас{printed ? ' · номд ' + printed : lesson.book ? '' : ' · ном алга'}
          </p>
          <div className="flex items-center gap-1.5">
            <input
              type="number" min={1} inputMode="numeric"
              className={cn(NATIVE_INPUT, 'w-20')}
              aria-label="Хуудас — эхлэл"
              disabled={saving || !editable || !lesson.book}
              value={draft.pageFrom}
              onChange={(event) => setDraft({ ...draft, pageFrom: event.target.value })}
            />
            <span className="text-xs text-muted-foreground">&#8211;</span>
            <input
              type="number" min={1} inputMode="numeric"
              className={cn(NATIVE_INPUT, 'w-20')}
              aria-label="Хуудас — төгсгөл"
              disabled={saving || !editable || !lesson.book}
              value={draft.pageTo}
              onChange={(event) => setDraft({ ...draft, pageTo: event.target.value })}
            />
          </div>
        </div>
      </div>

      {editable ? (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {/* Struck off, with a reason. The default is that the lesson
              happened, and it stays that way unless a teacher says otherwise -
              a register that read silence as cancellation would empty itself
              of every day nobody got round to marking. */}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-3.5 w-3.5"
              disabled={saving}
              checked={!held}
              onChange={(event) => setDraft({
                ...draft,
                held: event.target.checked ? '' : '1',
                isContinuation: event.target.checked ? '' : draft.isContinuation,
              })}
            />
            <span>Хичээл болоогүй</span>
          </label>
          {held ? (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-3.5 w-3.5"
                disabled={saving}
                checked={draft.isContinuation !== ''}
                onChange={(event) =>
                  setDraft({ ...draft, isContinuation: event.target.checked ? '1' : '' })}
              />
              <span>Өмнөх сэдвийн үргэлжлэл</span>
            </label>
          ) : null}
        </div>
      ) : null}

      {editable && !held ? (
        <div className="max-w-3xl space-y-0.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Шалтгаан
          </p>
          <input
            type="text"
            className={NATIVE_INPUT}
            placeholder="Яагаад болоогүй — сурагч, эцэг эх харна"
            aria-label="Хичээл болоогүй шалтгаан"
            maxLength={2000}
            disabled={saving}
            value={draft.notHeldReason}
            onChange={(event) => setDraft({ ...draft, notHeldReason: event.target.value })}
          />
          <p className="text-xs text-muted-foreground">
            Энэ цагийн сэдэв үзэгдээгүйд тооцогдож улирлын үлдсэн хэсэгт эргэж орно.
          </p>
        </div>
      ) : null}

      {!editable && !lesson.held ? (
        <p className="text-sm text-muted-foreground">
          Хичээл болоогүй{lesson.notHeldReason ? ' — ' + lesson.notHeldReason : ''}
        </p>
      ) : null}

      {editable && skipped.length > 0 ? (
        <div className="max-w-3xl space-y-1 rounded-[2px] border border-border bg-sidebar-active/40 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Эдгээрийг өнөөдөр бас үзсэн үү?
          </p>
          <p className="text-xs text-muted-foreground">
            Тэмдэглээгүй сэдэв улирлын дараагийн өдрүүдэд эргэж орно.
          </p>
          {skipped.map((row) => (
            <label key={row.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-3.5 w-3.5"
                disabled={saving}
                checked={alsoCovered.includes(row.id)}
                onChange={() => toggle(row.id)}
              />
              <span>{row.skillName}{row.chapterTitle ? ' · ' + row.chapterTitle : ''}</span>
            </label>
          ))}
        </div>
      ) : null}

      {editable && held ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-0.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Сорил нээгдэх
              </p>
              <input
                type="time"
                className={cn(NATIVE_INPUT, 'w-28')}
                aria-label="Сорил нээгдэх цаг"
                disabled={saving}
                value={draft.quizOpensAt}
                onChange={(event) => setDraft({ ...draft, quizOpensAt: event.target.value })}
              />
            </div>
            {/* Blank is not "none": it is the school's own rule, five and
                three, which is what almost every period wants. The
                placeholder says so rather than leaving a teacher to guess
                what an empty box does. */}
            <div className="space-y-0.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Асуулт
              </p>
              <input
                type="number" min={1} max={50} inputMode="numeric"
                className={cn(NATIVE_INPUT, 'w-20')}
                placeholder="5"
                aria-label="Сорилын асуултын тоо"
                disabled={saving}
                value={draft.quizQuestionCount}
                onChange={(event) => setDraft({ ...draft, quizQuestionCount: event.target.value })}
              />
            </div>
            <div className="space-y-0.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Оролдлого
              </p>
              <input
                type="number" min={1} max={10} inputMode="numeric"
                className={cn(NATIVE_INPUT, 'w-20')}
                placeholder="3"
                aria-label="Сорилын оролдлогын тоо"
                disabled={saving}
                value={draft.quizAttempts}
                onChange={(event) => setDraft({ ...draft, quizAttempts: event.target.value })}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-3.5 w-3.5"
              disabled={saving}
              checked={draft.answersOpenAt !== ''}
              onChange={(event) => setDraft({
                ...draft,
                answersOpenAt: event.target.checked ? new Date().toISOString() : '',
              })}
            />
            <span>Зөв хариулт, тайлбарыг сурагчид нээх</span>
          </label>
          <p className="text-xs text-muted-foreground">
            Нээх хүртэл сурагч зөвхөн зөв бурууг нь мэдэнэ, аль нь зөв болохыг мэдэхгүй.
          </p>
        </div>
      ) : null}

      {editable && lesson.lessonId !== null && date === schoolToday() ? (
        <QuizPreviewPanel classId={classId} lessonId={lesson.lessonId} />
      ) : null}

      <div className="max-w-3xl space-y-0.5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Тайлбар
        </p>
        {editable ? (
          <input
            type="text"
            className={NATIVE_INPUT}
            placeholder="Өнөөдрийн заавар — сурагч харна"
            aria-label="Өнөөдрийн заавар"
            maxLength={2000}
            disabled={saving}
            value={draft.note}
            onChange={(event) => setDraft({ ...draft, note: event.target.value })}
          />
        ) : (
          <p className="text-sm">{lesson.note || '—'}</p>
        )}
      </div>

      {editable ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" size="sm" disabled={saving || !dirty} onClick={save}>
            {saving ? 'Хадгалж байна…' : 'Хадгалах'}
          </Button>
          {/* Said once, and only after something was actually written. */}
          {!dirty && saved ? (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Check className="h-3.5 w-3.5 text-success" />
              Хадгалагдлаа
            </span>
          ) : null}
          {error ? (
            <span role="alert" className="text-xs text-destructive">
              {error?.data?.error ?? 'Хадгалж чадсангүй.'}
            </span>
          ) : null}
        </div>
      ) : null}

      {replan ? (
        <ReplanPrompt
          proposal={replan}
          onDone={() => {
            setReplan(null)
            onSaved()
          }}
        />
      ) : null}

      {lesson.lessonId === null ? (
        <p className="text-xs text-muted-foreground">
          Сэдэв сонгоогүй тул сурагчид энэ цагт нээх материалгүй байна.
        </p>
      ) : (
        // Exactly what the class is served, in the order they are served it.
        <div className="space-y-3 border-l-2 border-primary pl-3">
          <div>
            <p className="text-sm font-medium">{lesson.skillName}</p>
            {lesson.learningGoal ? (
              <p className="text-xs text-muted-foreground">{lesson.learningGoal}</p>
            ) : null}
          </div>
          {lesson.book ? (
            <BookViewer
              book={{
                materialId: lesson.book.materialId,
                title: lesson.book.title,
                chapterTitle: null,
                pageFrom: lesson.book.pageFrom,
                pageTo: lesson.book.pageTo,
                filePage: lesson.book.filePage,
                fileUrl: lesson.book.fileUrl,
              }}
            />
          ) : null}
          <Block title="Сануулах" body={lesson.remember} />
          <Block title="Жишээ" body={lesson.workedExample} />
          <Block title="Хамтдаа" body={lesson.guidedPractice} />
          <Block title="Бие даан хийх" body={lesson.independentPractice} />
          <Block title="Сурагчид хэлэх" body={lesson.studentMessage} />
        </div>
      )}
    </li>
  )
}

/**
 * The three verdicts, and the fourth that is the absence of one.
 *
 * Unchecked is not a button of its own: pressing the verdict that is already
 * set takes it off again, which is how a teacher undoes a slip without having
 * to find a fourth control for "actually, I did not look".
 */
/**
 * The register, and the fifth state that is the absence of a mark.
 *
 * Pressing the state already set takes it off again - the same gesture as the
 * exercise books - because "nobody took the register" needs to be reachable
 * after a slip, and giving it a button of its own would invite a teacher to
 * press it deliberately, which means nothing.
 */
const ATTENDANCE: Array<{ state: AttendanceState; label: string; short: string }> = [
  { state: 'PRESENT', label: 'Ирсэн', short: '+' },
  { state: 'LATE', label: 'Хоцорсон', short: 'Х' },
  { state: 'ABSENT', label: 'Ирээгүй', short: '−' },
  { state: 'EXCUSED', label: 'Чөлөөтэй', short: 'Ч' },
]

const MARKS: Array<{ state: NotebookState; label: string; short: string }> = [
  { state: 'DONE', label: 'Хийсэн', short: 'Х' },
  { state: 'PARTIAL', label: 'Дутуу', short: 'Д' },
  { state: 'NOT_DONE', label: 'Хийгээгүй', short: '—' },
]

/** One child, and how they answered - opened one at a time. */
function StudentRow({
  student, mark, comment, onMark, onComment, editable, attendance, onAttendance,
}: {
  student: ClassDayStudent
  mark: NotebookState | null
  comment: string
  onMark: (state: NotebookState | null) => void
  onComment: (text: string) => void
  editable: boolean
  attendance: AttendanceState | null
  onAttendance: (state: AttendanceState | null) => void
}) {
  const [open, setOpen] = useState(false)
  const answered = student.attempts.length > 0
  const score = student.attempts.reduce((sum, row) => sum + row.score, 0)
  const outOf = student.attempts.reduce((sum, row) => sum + row.maxScore, 0)

  return (
    <li>
      <div className="flex items-stretch">
      <button
        type="button"
        onClick={() => answered && setOpen(!open)}
        aria-expanded={answered ? open : undefined}
        disabled={!answered}
        className={cn(
          'flex w-full items-center gap-3 px-4 py-2 text-left transition-colors',
          answered && 'hover:bg-sidebar-active/60',
        )}
      >
        <span className="min-w-0 flex-1 truncate text-sm">
          {student.studentName}
          <span className="ml-2 text-xs text-muted-foreground">{student.studentCode}</span>
        </span>

        {answered ? (
          <>
            <span className="shrink-0 text-sm font-semibold tabular-nums">{score}/{outOf}</span>
            <span className="w-14 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
              {TIME.format(new Date(student.attempts[0]!.submittedAt))}
            </span>
            {open ? (
              <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
          </>
        ) : (
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-pending" />
            Хариулаагүй
          </span>
        )}
      </button>

      {/* Ирц, then the exercise book. The register comes first because it is
          taken first, at the start of the hour, and a teacher working down the
          class should not have to cross the row to do the two things. */}
      {editable ? (
        <div className="flex shrink-0 items-stretch self-stretch border-l border-border">
          {ATTENDANCE.map((option) => (
            <button
              key={option.state}
              type="button"
              aria-pressed={attendance === option.state}
              title={option.label}
              onClick={() => onAttendance(attendance === option.state ? null : option.state)}
              className={cn(
                'w-8 text-xs transition-colors hover:bg-sidebar-active',
                attendance === option.state && 'bg-sidebar font-semibold',
              )}
            >
              {option.short}
            </button>
          ))}
        </div>
      ) : attendance ? (
        <span className="flex shrink-0 items-center px-3 text-xs text-muted-foreground">
          {ATTENDANCE.find((option) => option.state === attendance)?.label}
        </span>
      ) : null}

      {/* Дэвтэр. Three presses wide and no wider: a register is marked by
          looking at a book and tapping once, thirty times over, and anything
          that asks for a second gesture per child does not get used. */}
      {editable ? (
        <div className="flex shrink-0 items-stretch self-stretch border-l border-border">
          {MARKS.map((option) => (
            <button
              key={option.state}
              type="button"
              aria-pressed={mark === option.state}
              title={option.label}
              onClick={() => onMark(mark === option.state ? null : option.state)}
              className={cn(
                'w-9 text-xs transition-colors hover:bg-sidebar-active',
                mark === option.state && 'bg-sidebar font-semibold',
              )}
            >
              {option.short}
            </button>
          ))}
        </div>
      ) : mark ? (
        <span className="flex shrink-0 items-center px-3 text-xs text-muted-foreground">
          {MARKS.find((option) => option.state === mark)?.label}
        </span>
      ) : null}
      </div>

      {editable && mark ? (
        <div className="px-4 pb-2">
          <input
            type="text"
            className={NATIVE_INPUT}
            placeholder="Тайлбар — сурагч харна"
            aria-label={student.studentName + ' — дэвтрийн тайлбар'}
            maxLength={500}
            value={comment}
            onChange={(event) => onComment(event.target.value)}
          />
        </div>
      ) : !editable && comment ? (
        <p className="px-4 pb-2 text-xs text-muted-foreground">{comment}</p>
      ) : null}

      {open ? (
        <div className="space-y-3 border-t border-border bg-muted/30 px-4 py-3">
          {student.attempts.map((attempt) => (
            <div key={attempt.attemptId} className="space-y-1.5">
              <p className="text-xs font-semibold">
                {attempt.skillName ?? attempt.lessonCode}
                <span className="ml-2 font-normal text-muted-foreground">
                  {attempt.score}/{attempt.maxScore}
                </span>
              </p>
              <ul className="space-y-1">
                {attempt.answers.map((answer) => (
                  <li key={answer.questionId} className="flex items-start gap-2 text-xs">
                    <span className="w-4 shrink-0 pt-0.5">
                      {answer.correct ? (
                        <Check className="h-3.5 w-3.5 text-success" />
                      ) : (
                        <X className="h-3.5 w-3.5 text-destructive" />
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block">{answer.prompt}</span>
                      <span className="block text-muted-foreground">
                        {answer.chosenText || 'Хариулаагүй'}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
    </li>
  )
}

/**
 * The register: every child, what they answered, and what was in their book.
 *
 * Marked a period at a time, because a mark belongs to a period - a child can
 * have done the maths and not the physics - and saved once, because that is
 * how the work is actually done: down the class, book by book, then away.
 *
 * Children left untouched are not sent. A teacher who looked at five books has
 * said nothing about the other twenty-five, and the difference between "not
 * done" and "not checked" is the whole reason this screen is worth having.
 */
function NotebookRegister({
  classId, date, lessons, students, editable, perLesson, onSaved,
}: {
  classId: number
  date: string
  lessons: ClassDayLessonType[]
  students: ClassDayStudent[]
  editable: boolean
  perLesson: boolean
  onSaved: () => void
}) {
  const [chosen, setChosen] = useState(0)
  const lesson = lessons[chosen] ?? lessons[0] ?? null
  const { mutate: save, isPending, error } = useMarkNotebooks()
  const { mutate: register, isPending: registering, error: registerError } = useMarkAttendance()

  const markOf = (student: ClassDayStudent) =>
    lesson === null
      ? null
      : student.notebook.find((row) =>
          row.subjectId === lesson.subjectId
          && row.timetableSlotId === lesson.timetableSlotId,
        ) ?? null

  const server = new Map(students.map((student) => {
    const found = markOf(student)
    return [student.studentId, {
      state: (found?.state ?? null) as NotebookState | null,
      comment: found?.comment ?? '',
    }]
  }))

  // The register. Up to year 5 it belongs to the day and the period selector
  // does not touch it; from year 6 it belongs to the period, like the books.
  const slotForRegister = perLesson ? lesson?.timetableSlotId ?? null : null
  const attendanceOf = (student: ClassDayStudent) =>
    student.attendance.find((row) =>
      perLesson ? row.timetableSlotId === slotForRegister : row.timetableSlotId === null,
    ) ?? null

  const savedRegister = new Map(students.map((student) =>
    [student.studentId, (attendanceOf(student)?.state ?? null) as AttendanceState | null]))
  const [here, setHere] = useState(savedRegister)

  const [draft, setDraft] = useState(server)
  // Re-seeded when the day, the period or the saved marks change underneath.
  const key = [date, lesson?.timetableSlotId, lesson?.subjectId, perLesson,
    ...students.map((student) => {
      const found = markOf(student)
      return `${student.studentId}:${found?.state ?? ''}:${found?.comment ?? ''}`
        + `:${attendanceOf(student)?.state ?? ''}`
    })].join('\u0000')
  const [seed, setSeed] = useState(key)
  if (seed !== key) {
    setSeed(key)
    setDraft(server)
    setHere(savedRegister)
  }

  const changed = students.filter((student) => {
    const was = server.get(student.studentId)!
    const now = draft.get(student.studentId)!
    return was.state !== now.state || (now.state !== null && was.comment !== now.comment)
  })

  const set = (studentId: number, patch: { state?: NotebookState | null; comment?: string }) => {
    const next = new Map(draft)
    next.set(studentId, { ...next.get(studentId)!, ...patch })
    setDraft(next)
  }

  const changedRegister = students.filter((student) =>
    savedRegister.get(student.studentId) !== here.get(student.studentId))

  const takeRegister = () => {
    register({
      data: {
        classId,
        onDate: date,
        ...(perLesson ? { timetableSlotId: slotForRegister } : {}),
        marks: changedRegister.map((student) => ({
          studentId: student.studentId,
          // Taking a mark off says nobody registered this child, which is the
          // absence of a row rather than a fifth verdict.
          state: (here.get(student.studentId) ?? 'UNREGISTERED') as AttendanceState,
        })),
      },
    }, { onSuccess: onSaved })
  }

  const submit = () => {
    if (lesson === null) return
    save({
      data: {
        classId,
        subjectId: lesson.subjectId,
        scheduledOn: date,
        timetableSlotId: lesson.timetableSlotId,
        marks: changed.map((student) => {
          const now = draft.get(student.studentId)!
          return {
            studentId: student.studentId,
            // Taking a mark off is not a fourth verdict: it is saying nobody
            // looked, which is what the row's absence means.
            state: (now.state ?? 'UNCHECKED') as NotebookState,
            comment: now.state === null || now.comment.trim() === '' ? null : now.comment,
          }
        }),
      },
    }, { onSuccess: onSaved })
  }

  return (
    <div className="space-y-3">
      {editable && lessons.length > 1 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Дэвтэр шалгах цаг</span>
          <select
            className={cn(NATIVE_SELECT, 'w-auto')}
            aria-label="Дэвтэр шалгах цаг"
            value={String(chosen)}
            onChange={(event) => setChosen(Number(event.target.value))}
          >
            {lessons.map((row, index) => (
              <option key={index} value={String(index)}>
                {row.periodNo ? row.periodNo + '-р цаг · ' : ''}{row.subjectName}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <ul className="divide-y divide-border rounded-[2px] border border-border bg-card">
        {students.map((student) => (
          <StudentRow
            key={student.studentId}
            student={student}
            editable={editable && lesson !== null}
            mark={draft.get(student.studentId)?.state ?? null}
            comment={draft.get(student.studentId)?.comment ?? ''}
            onMark={(state) => set(student.studentId, { state })}
            onComment={(comment) => set(student.studentId, { comment })}
            attendance={here.get(student.studentId) ?? null}
            onAttendance={(state) => {
              const next = new Map(here)
              next.set(student.studentId, state)
              setHere(next)
            }}
          />
        ))}
      </ul>

      {editable ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button" size="sm"
            disabled={registering || changedRegister.length === 0 || (perLesson && lesson === null)}
            onClick={takeRegister}
          >
            {registering ? 'Хадгалж байна…' : `Ирц хадгалах (${changedRegister.length})`}
          </Button>
          <span className="text-xs text-muted-foreground">
            {perLesson ? 'Хичээл бүрээр' : 'Өдрөөр нь нэг удаа'}
          </span>
          {registerError ? (
            <span role="alert" className="text-xs text-destructive">
              {registerError?.data?.error ?? 'Ирцийг хадгалж чадсангүй.'}
            </span>
          ) : null}
        </div>
      ) : null}

      {editable && lesson !== null ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" size="sm" disabled={isPending || changed.length === 0} onClick={submit}>
            {isPending ? 'Хадгалж байна…' : `Дэвтэр хадгалах (${changed.length})`}
          </Button>
          <span className="text-xs text-muted-foreground">
            Тэмдэглээгүй сурагч «шалгаагүй» хэвээр үлдэнэ.
          </span>
          {error ? (
            <span role="alert" className="text-xs text-destructive">
              {error?.data?.error ?? 'Хадгалж чадсангүй.'}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

/**
 * One class, one day, from both ends.
 *
 * The board's two buttons used to open two strips underneath a row: a lesson
 * name with no lesson in it, and a list of the children who had not answered.
 * Neither could be acted on where it stood. They arrive here instead - the
 * material as the class receives it, editable, and the whole register with
 * every answer behind each name.
 */
export default function TeacherClassDay() {
  const { user } = useSession()
  const [, params] = useRoute('/teacher/class/:classId')
  const search = new URLSearchParams(useSearch())
  const classId = Number(params?.classId ?? 0)
  const on = calendarDate(search.get('on'))
  const rawSubject = search.get('subject')
  const subjectId = rawSubject === null || rawSubject === '' ? null : Number(rawSubject)
  const [, navigate] = useLocation()
  const view = search.get('view') === 'students' ? 'students' : 'lesson'
  const setView = (view: string) => {
    const next = new URLSearchParams(search)
    next.set('view', view)
    navigate('/teacher/class/' + classId + '?' + next.toString(), { replace: true })
  }

  const queryClient = useQueryClient()
  const query = { classId, ...subjectParam(subjectId), ...(on ? { on } : {}) }
  const { data, isLoading, isError, error } = useGetClassDay(query)

  const refresh = () => queryClient.invalidateQueries({
    predicate: (entry) => typeof entry.queryKey[0] === 'string' && (
      entry.queryKey[0].includes('/teacher/class-day')
      || entry.queryKey[0].includes('/teacher/dashboard')
      || entry.queryKey[0].includes('/teacher/schedule')
      || entry.queryKey[0].includes('/student/today')
    ),
  })

  const back = (
    <Link href={`/teacher/schedule?classId=${classId}&subjectId=${subjectId ?? 'all'}&on=${on ?? schoolToday()}`} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="h-4 w-4" />
      Журнал · Хичээл ба төлөвлөгөө
    </Link>
  )

  if (isLoading) return <Skeleton className="h-96 w-full" />
  if (isError || !data) {
    return (
      <div className="space-y-3">
        {back}
        <p role="alert" className="text-sm text-destructive">
          {error?.data?.error ?? 'Ангийн өдрийг уншиж чадсангүй.'}
        </p>
      </div>
    )
  }


  return (
    <div className="space-y-3">
      {back}

      {/* One row: what is being looked at on the left, the switch on the
          right. The week does it this way and every screen that offers a
          choice of view now does the same. */}
      <header className="flex flex-wrap items-center gap-2">
        <span className="flex min-w-0 items-baseline gap-x-3">
          <h1 className="truncate text-lg font-bold">{data.className}</h1>
          <span className="shrink-0 text-xs text-muted-foreground">{data.date}</span>
        </span>

        <span className="ml-auto flex shrink-0" role="group" aria-label="Юу харах">
          <Button
            type="button" size="sm" variant={view === 'lesson' ? 'default' : 'outline'}
            aria-pressed={view === 'lesson'} onClick={() => setView('lesson')}
          >
            <ClipboardList className="h-3.5 w-3.5" />
            Хичээл
          </Button>
          <Button
            type="button" size="sm" variant={view === 'students' ? 'default' : 'outline'}
            aria-pressed={view === 'students'} onClick={() => setView('students')}
            className="border-l border-border"
          >
            <Users className="h-3.5 w-3.5" />
            Ирц ба дэвтэр · {data.students.length}
          </Button>
        </span>
      </header>

      {view === 'lesson' ? (
        data.lessons.length === 0 ? (
          <p className="rounded-[2px] border border-border bg-card p-6 text-sm text-muted-foreground">
            Энэ өдөр хуваарьт цаг алга байна.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-[2px] border border-border bg-card">
            {data.lessons.map((lesson, index) => (
              <LessonCard
                key={`${lesson.timetableSlotId ?? 'x'}:${lesson.subjectId}:${index}`}
                classId={data.classId}
                date={data.date}
                lesson={lesson}
                editable={data.date >= schoolToday() || hasRole(user, 'ADMIN')}
                onSaved={refresh}
              />
            ))}
          </ul>
        )
      ) : data.students.length === 0 ? (
        <p className="rounded-[2px] border border-border bg-card p-6 text-sm text-muted-foreground">
          Энэ ангид бүртгэлтэй сурагч алга байна.
        </p>
      ) : (
        <NotebookRegister
          classId={classId}
          date={data.date}
          lessons={data.lessons}
          students={data.students}
          editable={data.date <= schoolToday()}
          perLesson={data.attendancePerLesson}
          onSaved={refresh}
        />
      )}
    </div>
  )
}
