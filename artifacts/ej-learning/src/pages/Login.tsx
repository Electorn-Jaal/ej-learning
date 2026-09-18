import { useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useLogin } from '@workspace/api-client-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function Login() {
  const queryClient = useQueryClient()
  const { mutate, isPending } = useLogin()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    mutate(
      { data: { username, password } },
      {
        // The session query is the single source of truth; refetching it is
        // what actually signs the app in.
        //
        // Everything else in the cache has to go with it. Invalidating the
        // session key alone left every page the previous account had opened
        // sitting in the cache, so signing in as somebody else showed their
        // predecessor's classes and results until each of those queries
        // happened to refetch. Nothing cached belongs to the account that
        // just arrived.
        onSuccess: () => {
          void queryClient.resetQueries()
        },
        onError: (cause) =>
          setError(
            cause?.data?.error ??
              'Нэвтэрч чадсангүй. Сүлжээгээ шалгаад дахин оролдоно уу.',
          ),
      },
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">EJ Learning</CardTitle>
          <p className="text-sm text-muted-foreground">Системд нэвтрэх</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Нэвтрэх нэр</Label>
              <Input
                id="username"
                name="username"
                autoComplete="username"
                required
                autoFocus
                value={username}
                onChange={(event) => setUsername(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Нууц үг</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>

            {error ? (
              <p
                role="alert"
                className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {error}
              </p>
            ) : null}

            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? 'Нэвтэрч байна…' : 'Нэвтрэх'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
