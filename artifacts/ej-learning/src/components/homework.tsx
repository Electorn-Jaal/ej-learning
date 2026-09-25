import type { StudentHomeworkAttempt } from '@workspace/api-client-react'

const when = new Intl.DateTimeFormat('mn-MN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Ulaanbaatar' })

export function HomeworkInfo({ title, instructions, assignedOn, dueOn }: {
  title: string; instructions: string | null; assignedOn: string; dueOn: string | null
}) {
  return <header className="space-y-2">
    <h2 className="break-words text-lg font-semibold">{title}</h2>
    <p className="text-sm text-muted-foreground">Өгсөн: {assignedOn} · {dueOn ? `Хугацаа: ${dueOn}` : 'Хугацаагүй'}</p>
    {instructions && <p className="whitespace-pre-wrap break-words text-sm">{instructions}</p>}
  </header>
}

export function HomeworkAttempts({ attempts }: { attempts: StudentHomeworkAttempt[] }) {
  return <div className="space-y-2">{attempts.map((attempt) => <details key={attempt.attemptNo} className="rounded border bg-card p-3">
    <summary className="cursor-pointer text-sm font-medium">
      {attempt.attemptNo}-р оролдлого · {when.format(new Date(attempt.submittedAt))} · {attempt.isLate ? 'Хоцорч илгээсэн' : 'Хугацаандаа'}
    </summary>
    <p className="mt-3 whitespace-pre-wrap break-words text-sm">{attempt.body ?? 'Хариултын текст алга.'}</p>
  </details>)}</div>
}
