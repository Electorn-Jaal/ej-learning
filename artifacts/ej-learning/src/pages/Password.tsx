import { useState, type FormEvent } from 'react'
import { useChangePassword } from '@workspace/api-client-react'
import { BackLink } from '@/components/BackLink'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const MIN_LENGTH = 8

export default function Password() {
  const { mutate, isPending } = useChangePassword()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [repeated, setRepeated] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setDone(false)

    // Checked here only to avoid a pointless round trip; the server applies
    // the same rules and is what actually enforces them.
    if (newPassword.length < MIN_LENGTH) {
      setError(`Шинэ нууц үг дор хаяж ${MIN_LENGTH} тэмдэгттэй байх ёстой.`)
      return
    }
    if (newPassword !== repeated) {
      setError('Шинэ нууц үг хоёр удаа адил бичигдээгүй байна.')
      return
    }

    mutate(
      { data: { currentPassword, newPassword } },
      {
        onSuccess: () => {
          setDone(true)
          setCurrentPassword('')
          setNewPassword('')
          setRepeated('')
        },
        onError: (cause) =>
          setError(cause?.data?.error ?? 'Нууц үг солиж чадсангүй.'),
      },
    )
  }

  return (
    <div className="space-y-6">
      <BackLink />

      <Card className="max-w-md">
        <CardHeader>
          <CardTitle className="text-lg">Шинэ нууц үг</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="current">Одоогийн нууц үг</Label>
              <Input
                id="current"
                type="password"
                autoComplete="current-password"
                required
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="next">Шинэ нууц үг</Label>
              <Input
                id="next"
                type="password"
                autoComplete="new-password"
                required
                minLength={MIN_LENGTH}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Дор хаяж {MIN_LENGTH} тэмдэгт. Урт байх нь нийлмэл байхаас чухал.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="repeat">Шинэ нууц үг дахин</Label>
              <Input
                id="repeat"
                type="password"
                autoComplete="new-password"
                required
                value={repeated}
                onChange={(event) => setRepeated(event.target.value)}
              />
            </div>

            {error ? (
              <p
                role="alert"
                className="border-l-2 border-destructive py-1 pl-3 text-sm text-foreground"
              >
                {error}
              </p>
            ) : null}

            {done ? (
              <p
                role="status"
                className="border-l-2 border-success py-1 pl-3 text-sm text-foreground"
              >
                Нууц үг солигдлоо. Бусад төхөөрөмж дээрх нэвтрэлт хаагдсан.
              </p>
            ) : null}

            <Button type="submit" disabled={isPending}>
              {isPending ? 'Солиж байна…' : 'Нууц үг солих'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
