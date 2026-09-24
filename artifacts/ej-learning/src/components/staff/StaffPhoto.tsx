import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Camera } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { appPath } from '@/lib/app-path'

/** Same rule as the shell's avatar, so the two never disagree. */
function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase('mn') ?? '')
    .join('')
}

/**
 * The photograph, and the one control that replaces it.
 *
 * Sent as the raw image rather than as a form: the server takes the bytes and
 * reads the type off the Content-Type header, which is the part it can
 * actually check. A filename from the browser tells it nothing.
 *
 * The cache is busted with the time of the upload. The URL never changes -
 * one file per person, replaced in place - so without it the browser goes on
 * showing the old face until it feels like asking again.
 */
export function StaffPhoto({ teacherId, name, photoUrl, editable }: {
  teacherId: number
  name: string
  photoUrl: string | null
  editable: boolean
}) {
  const queryClient = useQueryClient()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stamp, setStamp] = useState(0)

  const send = async (file: File) => {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(appPath(`/api/staff/${teacherId}/photo`), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': file.type },
        body: file,
      })
      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(body?.error ?? 'Зураг хадгалж чадсангүй.')
      }
      setStamp(Date.now())
      await queryClient.invalidateQueries({
        predicate: (query) => typeof query.queryKey[0] === 'string'
          && query.queryKey[0].includes('/staff'),
      })
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Зураг хадгалж чадсангүй.')
    } finally {
      setBusy(false)
    }
  }

  const source = photoUrl ? appPath(photoUrl) + (stamp ? `?v=${stamp}` : '') : null

  return (
    <div className="flex flex-col items-center gap-2">
      <Avatar className="h-24 w-24">
        {source ? <AvatarImage src={source} alt={name} /> : null}
        <AvatarFallback className="text-xl font-semibold">{initialsOf(name)}</AvatarFallback>
      </Avatar>

      {editable ? (
        <>
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              // Cleared so that choosing the same file twice still fires.
              event.target.value = ''
              if (file) void send(file)
            }}
          />
          <Button
            type="button" variant="outline" size="sm"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            <Camera className="h-3.5 w-3.5" />
            {busy ? 'Хадгалж байна…' : photoUrl ? 'Зураг солих' : 'Зураг оруулах'}
          </Button>
          {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
        </>
      ) : null}
    </div>
  )
}
