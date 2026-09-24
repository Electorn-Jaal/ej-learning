import { useState } from 'react'
import { useGetTeacherCard, type SubjectTeacher } from '@workspace/api-client-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'
import { appPath } from '@/lib/app-path'

/** Same rule as the shell's avatar, so the two never disagree. */
const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase('mn') ?? '')
    .join('')

/**
 * Who teaches this, with a face, and what opens when a child taps it.
 *
 * The card is narrower than the staff record on purpose: a name, a
 * photograph, what the school employs them as, and what else they teach. The
 * telephone number and the rest of the register stay on the staff side, where
 * the audience is the people who need to ring each other.
 *
 * It is fetched only when opened. A subject page carries one or two of these
 * and most children never tap either.
 */
function Card({ teacherId }: { teacherId: number }) {
  const { data, isLoading, isError } = useGetTeacherCard(teacherId)

  if (isLoading) return <Skeleton className="h-24 w-full" />
  if (isError || !data) {
    return <p className="text-sm text-muted-foreground">Багшийн мэдээлэл алга байна.</p>
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Avatar className="h-12 w-12">
          {data.photoUrl ? <AvatarImage src={appPath(data.photoUrl)} alt={data.displayName} /> : null}
          <AvatarFallback className="text-sm font-semibold">
            {initialsOf(data.displayName)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{data.displayName}</p>
          {data.subjects.length ? (
            <p className="truncate text-xs text-muted-foreground">{data.subjects.join(', ')}</p>
          ) : null}
        </div>
      </div>

      {data.fields.length ? (
        <dl className="space-y-1.5">
          {data.fields.map((field) => (
            <div key={field.labelMn} className="flex flex-col gap-0.5">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {field.labelMn}
              </dt>
              <dd className="text-sm">{field.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {data.classes.length ? (
        <p className="text-xs text-muted-foreground">
          Ангиуд: {data.classes.join(', ')}
        </p>
      ) : null}
    </div>
  )
}

export function TeacherCard({ teacher }: { teacher: SubjectTeacher }) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 rounded-[2px] px-1.5 py-1 text-left transition-colors hover:bg-sidebar-active/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <Avatar className="h-7 w-7">
            {teacher.photoUrl ? (
              <AvatarImage src={appPath(teacher.photoUrl)} alt={teacher.name} />
            ) : null}
            <AvatarFallback className="text-[10px] font-semibold">
              {initialsOf(teacher.name)}
            </AvatarFallback>
          </Avatar>
          <span className="truncate text-xs">{teacher.name}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 rounded-[2px] p-3">
        {/* Mounted only while open, so the fetch waits for the tap. */}
        {open ? <Card teacherId={teacher.teacherId} /> : null}
      </PopoverContent>
    </Popover>
  )
}
