import { useState } from 'react'
import {
  useAddStaffField,
  useGetStaffFields,
  useGetStaffList,
  useSaveStaffProfile,
  useUpdateStaffField,
  type StaffField,
  type StaffProfile,
} from '@workspace/api-client-react'
import { ChevronDown, ChevronUp, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NATIVE_INPUT, NATIVE_SELECT } from '@/components/ui/native-select'
import { PageHeader } from '@/components/ui/page-header'
import { Skeleton } from '@/components/ui/skeleton'
import { StaffFields } from '@/components/staff/StaffFields'
import { StaffPhoto } from '@/components/staff/StaffPhoto'
import { cn } from '@/lib/utils'

const KIND_LABEL: Record<string, string> = {
  TEXT: 'Богино бичвэр',
  LONG_TEXT: 'Урт бичвэр',
  DATE: 'Огноо',
  PHONE: 'Утас',
  EMAIL: 'Имэйл',
}

/**
 * One member of staff, opened from the register.
 *
 * Closed it is a line: the name, what they teach, and whether their record has
 * been filled in. Opened it is the same profile the person sees, with every
 * field writable - which is the difference between the two screens, and the
 * only one.
 */
function StaffRow({ person }: { person: StaffProfile }) {
  const [open, setOpen] = useState(false)
  const { mutate: save, isPending: saving, error } = useSaveStaffProfile()
  const filled = person.fields.filter((field) => field.value).length

  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-sidebar-active/60"
      >
        <span className="w-44 shrink-0 truncate text-sm font-semibold">{person.displayName}</span>
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {person.fields.find((field) => field.fieldKey === 'job_title')?.value
            ?? person.subjects.join(', ')}
        </span>
        <span className="w-24 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
          {filled}/{person.fields.length} бөглөсөн
        </span>
        <span className="w-16 shrink-0 text-right text-xs text-muted-foreground">
          {person.photoUrl ? 'зурагтай' : '—'}
        </span>
        {open ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
      </button>

      {open ? (
        <div className="flex flex-wrap gap-6 border-t border-border bg-muted/20 px-4 py-4">
          <StaffPhoto
            teacherId={person.teacherId}
            name={person.displayName}
            photoUrl={person.photoUrl}
            editable
          />
          <div className="min-w-[280px] flex-1 space-y-3">
            <p className="text-xs text-muted-foreground">
              {[person.teacherCode, person.username, person.classes.join(', ')]
                .filter(Boolean).join(' · ')}
            </p>
            <StaffFields
              profile={person}
              canEditAll
              saving={saving}
              error={error?.data?.error ?? null}
              onSave={(fields) => save({ teacherId: person.teacherId, data: { fields } })}
            />
          </div>
        </div>
      ) : null}
    </li>
  )
}

/**
 * The fields themselves: what a staff record is made of.
 *
 * A school asks for "can we also record X" more often than anything else, and
 * the answer used to be a migration. Here they rename what exists and add what
 * does not, and every profile page follows immediately.
 *
 * The fields that came from the register can be renamed and reordered but not
 * removed: each has a real column behind it that the import and the timetable
 * still read, and hiding the description would leave the column unexplained
 * rather than gone.
 */
function FieldAdmin({ fields }: { fields: StaffField[] }) {
  const { mutate: update, isPending: updating } = useUpdateStaffField()
  const { mutate: add, isPending: adding, error: addError } = useAddStaffField()
  const [label, setLabel] = useState('')
  const [kind, setKind] = useState('TEXT')
  const [selfEditable, setSelfEditable] = useState(false)
  const [renaming, setRenaming] = useState<Record<number, string>>({})

  return (
    <section className="space-y-3 rounded-[2px] border border-border bg-card">
      <h2 className="border-b border-border px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Бүртгэлийн талбарууд
      </h2>

      <ul className="divide-y divide-border">
        {fields.map((field) => {
          const draft = renaming[field.id]
          return (
            <li key={field.id} className="flex flex-wrap items-center gap-3 px-4 py-2">
              <input
                className={cn(NATIVE_INPUT, 'w-56')}
                value={draft ?? field.labelMn}
                disabled={updating}
                onChange={(event) => setRenaming({ ...renaming, [field.id]: event.target.value })}
              />
              <span className="w-28 shrink-0 text-xs text-muted-foreground">
                {KIND_LABEL[field.valueKind] ?? field.valueKind}
              </span>
              <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={field.selfEditable}
                  disabled={updating}
                  onChange={(event) =>
                    update({ fieldId: field.id, data: { selfEditable: event.target.checked } })}
                />
                Багш өөрөө засна
              </label>
              <span className="min-w-0 flex-1" />
              {draft !== undefined && draft.trim() !== field.labelMn ? (
                <Button
                  type="button" size="sm" disabled={updating}
                  onClick={() => {
                    update({ fieldId: field.id, data: { labelMn: draft.trim() } })
                    setRenaming({ ...renaming, [field.id]: undefined as unknown as string })
                  }}
                >
                  Нэрийг хадгалах
                </Button>
              ) : null}
              {field.columnName === null ? (
                <Button
                  type="button" variant="outline" size="sm" disabled={updating}
                  onClick={() => update({ fieldId: field.id, data: { isActive: !field.isActive } })}
                >
                  {field.isActive ? 'Нуух' : 'Сэргээх'}
                </Button>
              ) : (
                <span className="text-[11px] text-muted-foreground">бүртгэлийн үндсэн</span>
              )}
            </li>
          )
        })}
      </ul>

      <div className="flex flex-wrap items-end gap-3 border-t border-border px-4 py-3">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Шинэ талбарын нэр
          </span>
          <input
            className={cn(NATIVE_INPUT, 'w-56')}
            placeholder="Жишээ нь: Боловсрол"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Төрөл
          </span>
          <select
            className={cn(NATIVE_SELECT, 'w-40')}
            value={kind}
            onChange={(event) => setKind(event.target.value)}
          >
            {Object.entries(KIND_LABEL).map(([value, text]) => (
              <option key={value} value={value}>{text}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 pb-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={selfEditable}
            onChange={(event) => setSelfEditable(event.target.checked)}
          />
          Багш өөрөө засна
        </label>
        <Button
          type="button" size="sm" className="mb-1"
          disabled={adding || label.trim() === ''}
          onClick={() => add({ data: { labelMn: label.trim(), valueKind: kind as never, selfEditable } },
            { onSuccess: () => setLabel('') })}
        >
          <Plus className="h-3.5 w-3.5" />
          Талбар нэмэх
        </Button>
        {addError ? (
          <span role="alert" className="pb-2 text-xs text-destructive">
            {addError?.data?.error ?? 'Нэмж чадсангүй.'}
          </span>
        ) : null}
      </div>
    </section>
  )
}

/**
 * The staff register: everybody, their record, and the shape of the record.
 *
 * Two things on one page because they are the same job. An administrator
 * filling in thirty profiles is the person who discovers that a field is
 * missing or badly named, and sending them somewhere else to fix it is how
 * neither gets done.
 */
export default function AdminStaff() {
  const { data: staff, isLoading } = useGetStaffList()
  const { data: fields } = useGetStaffFields()
  const [showFields, setShowFields] = useState(false)

  if (isLoading) return <Skeleton className="h-96 w-full" />
  if (!staff?.length) {
    return <p className="text-sm text-muted-foreground">Ажилтны бүртгэл алга байна.</p>
  }

  const withPhoto = staff.filter((person) => person.photoUrl).length

  return (
    <div className="space-y-3 pb-10">
      <PageHeader
        title="Ажилтны бүртгэл"
        description={`${staff.length} ажилтан · ${withPhoto} зурагтай`}
      />

      <div className="flex">
        <Button
          type="button" size="sm" variant={showFields ? 'default' : 'outline'}
          aria-pressed={showFields}
          onClick={() => setShowFields(!showFields)}
        >
          Талбар тохируулах
        </Button>
      </div>

      {showFields && fields ? <FieldAdmin fields={fields} /> : null}

      <ul className="divide-y divide-border rounded-[2px] border border-border bg-card">
        {staff.map((person) => (
          <StaffRow key={person.teacherId} person={person} />
        ))}
      </ul>
    </div>
  )
}
