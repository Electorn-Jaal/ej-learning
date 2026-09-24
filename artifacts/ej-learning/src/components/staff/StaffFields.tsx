import { useState } from 'react'
import type { StaffProfile } from '@workspace/api-client-react'
import { Button } from '@/components/ui/button'
import { NATIVE_INPUT } from '@/components/ui/native-select'
import { cn } from '@/lib/utils'

/**
 * The fields of a staff record, read or written.
 *
 * Nothing here knows what a staff record contains. The list arrives from the
 * server, each entry carrying its own label, how its value is entered and who
 * is allowed to write it, so a school that renames a field or adds one sees
 * the change without a release. That is the whole reason the definitions live
 * in a table.
 *
 * A reader sees only the fields that have something in them. Somebody editing
 * sees all of them, including the empty ones, because an empty field is what
 * they came to fill in.
 */
export function StaffFields({ profile, canEditAll, onSave, saving, error }: {
  profile: StaffProfile
  canEditAll: boolean
  onSave: (fields: Record<string, string | null>) => void
  saving: boolean
  error: string | null
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Record<string, string>>({})

  const writable = profile.fields.filter((field) => canEditAll || field.selfEditable)
  const start = () => {
    setDraft(Object.fromEntries(profile.fields.map((field) => [field.fieldKey, field.value ?? ''])))
    setEditing(true)
  }

  if (!editing) {
    const filled = profile.fields.filter((field) => field.value)
    return (
      <div className="space-y-4">
        {filled.length === 0 ? (
          <p className="text-sm text-muted-foreground">Мэдээлэл бөглөгдөөгүй байна.</p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filled.map((field) => (
              <div key={field.fieldKey} className="flex flex-col gap-0.5">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {field.labelMn}
                </span>
                <span className="text-sm">{field.value}</span>
              </div>
            ))}
          </div>
        )}
        {writable.length > 0 ? (
          <Button type="button" variant="outline" size="sm" onClick={start}>
            Засах
          </Button>
        ) : null}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {profile.fields.map((field) => {
          const mine = canEditAll || field.selfEditable
          return (
            <label key={field.fieldKey} className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {field.labelMn}
                {/* Said once, beside the box, rather than as a rule nobody
                    reads: a teacher who cannot change their own job title is
                    entitled to know that before they try. */}
                {!mine ? <span className="ml-1.5 font-normal normal-case">· админ засна</span> : null}
              </span>
              <input
                className={cn(NATIVE_INPUT, !mine && 'bg-muted/40')}
                type={field.valueKind === 'DATE' ? 'date'
                  : field.valueKind === 'EMAIL' ? 'email'
                  : field.valueKind === 'PHONE' ? 'tel' : 'text'}
                disabled={!mine || saving}
                value={draft[field.fieldKey] ?? ''}
                onChange={(event) => setDraft({ ...draft, [field.fieldKey]: event.target.value })}
              />
            </label>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button" size="sm" disabled={saving}
          onClick={() => onSave(Object.fromEntries(
            writable.map((field) => [field.fieldKey, draft[field.fieldKey] ?? null]),
          ))}
        >
          {saving ? 'Хадгалж байна…' : 'Хадгалах'}
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={saving} onClick={() => setEditing(false)}>
          Болих
        </Button>
        {error ? <span role="alert" className="text-xs text-destructive">{error}</span> : null}
      </div>
    </div>
  )
}
