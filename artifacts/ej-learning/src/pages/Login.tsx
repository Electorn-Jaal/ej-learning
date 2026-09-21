import { useState, type FormEvent } from 'react'
import { Eye, EyeOff, Lock, User } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useLogin } from '@workspace/api-client-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function Login() {
  const queryClient = useQueryClient()
  const { mutate, isPending } = useLogin()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [revealed, setRevealed] = useState(false)
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
    /*
     * Two panels: the form on the left, the school's own artwork on the right.
     *
     * The artwork is a mark on white, not a photograph, so it is fitted whole
     * rather than cropped to fill - a crop would cut the birds off one edge and
     * the school's name off the other. Its panel is white for the same reason:
     * the image's own background is #ffffff, and any other colour would show
     * as a rectangle around it.
     *
     * On a phone there is no room for two columns, so the artwork becomes a
     * shorter band above the form rather than being dropped.
     */
    <div className="flex min-h-screen flex-col md:flex-row-reverse">
      <div className="flex shrink-0 items-center justify-center bg-white px-6 py-8 md:w-1/2 md:py-12">
        <img
          src={import.meta.env.BASE_URL + 'login-art.png'}
          alt="Электрон Жаал бүрэн дунд сургууль"
          width={405}
          height={533}
          className="h-48 w-auto max-w-full md:h-auto md:w-full md:max-w-[405px]"
        />
      </div>

      <div className="flex flex-1 items-center justify-center bg-white p-4">
        <div className="w-full max-w-md">
          <div className="space-y-1.5 pb-9">
            <h1 className="text-3xl font-semibold tracking-tight">Нэвтрэх</h1>
            <p className="text-base text-muted-foreground">Сургуулийн нэгдсэн систем</p>
          </div>

          {/*
            * No card around the form. On a page that holds nothing else a
            * border says only "these two fields are a group", which the
            * spacing already says. The fields are what a person aims at, so
            * they are the part given the height.
            *
            * The text inside them stays 16px on a phone even though it is
            * smaller on a desktop: iOS zooms the whole page in when a field
            * it focuses carries type under 16px, and a child signing in on a
            * phone should not have to pinch the page back out.
            */}
          <form onSubmit={submit} className="space-y-8">
            <div className="space-y-3">
              <Label htmlFor="username" className="text-base font-semibold">
                Нэвтрэх нэр
              </Label>
              <div className="relative">
                <User
                  aria-hidden="true"
                  className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  id="username"
                  name="username"
                  className="h-14 border-brand-wash-border bg-brand-wash pl-12"
                  autoComplete="username"
                  required
                  autoFocus
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                />
              </div>
            </div>
            <div className="space-y-3">
              <Label htmlFor="password" className="text-base font-semibold">
                Нууц үг
              </Label>
              <div className="relative">
                <Lock
                  aria-hidden="true"
                  className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  id="password"
                  name="password"
                  className="h-14 border-brand-wash-border bg-brand-wash pl-12 pr-14"
                  type={revealed ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                {/*
                  * type="button" matters: inside a form a bare button submits
                  * it, so peeking at the password would try to sign in.
                  */}
                <button
                  type="button"
                  onClick={() => setRevealed((shown) => !shown)}
                  aria-label={revealed ? 'Нууц үгийг нуух' : 'Нууц үгийг харах'}
                  aria-pressed={revealed}
                  className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {revealed ? (
                    <EyeOff aria-hidden="true" className="h-5 w-5" />
                  ) : (
                    <Eye aria-hidden="true" className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>

            {error ? (
              <p
                role="alert"
                className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-base text-destructive"
              >
                {error}
              </p>
            ) : null}

            {/*
              * The column's amber rather than the navy: it is the school's
              * colour, and ink on it reads 9.62:1.
              *
              * No outline. Amber is a light colour, so against anything light
              * the slab itself lands between 1.3:1 and 1.6:1 whatever the page
              * behind it is - a drawn edge does not fix that, it only looks
              * drawn. What identifies the button is its size and the ink on it.
              */}
            <Button
              type="submit"
              className="h-14 w-full bg-sidebar text-lg text-foreground hover:bg-sidebar/85"
              disabled={isPending}
            >
              {isPending ? 'Нэвтэрч байна…' : 'Нэвтрэх'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
