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
     * On a phone the artwork is dropped rather than shrunk. At that width it
     * had to be small enough that its lettering stopped reading, and it still
     * pushed the form down the screen; the school's badge alone says the same
     * thing in a fraction of the room.
     */
    <div className="flex min-h-dvh flex-col justify-center bg-white pb-24 md:flex-row-reverse md:justify-normal md:pb-0">
      <div className="hidden shrink-0 items-center justify-center bg-white px-6 md:flex md:w-1/2 md:py-12">
        <img
          src={import.meta.env.BASE_URL + 'login-art.png'}
          alt="Электрон Жаал бүрэн дунд сургууль"
          width={405}
          height={533}
          className="h-32 w-auto max-w-full md:h-auto md:w-full md:max-w-[405px]"
        />
      </div>

      <div className="flex items-start justify-center bg-white p-4 md:flex-1 md:items-center md:pt-4">
        <div className="w-full max-w-md">
          <img
            src={import.meta.env.BASE_URL + 'logo.png'}
            alt="Электрон Жаал"
            width={104}
            height={104}
            className="mx-auto mb-20 h-[104px] w-[104px] md:hidden"
          />

          {/*
            * On a phone the badge does this job on its own, so neither line is
            * drawn. The heading is hidden rather than removed: a page still
            * needs one for anything reading it aloud, and "Нэвтрэх" is the
            * only thing here that says what the page is.
            */}
          <div className="md:space-y-1.5 md:pb-9 md:text-left">
            <h1 className="sr-only font-semibold tracking-tight md:not-sr-only md:text-3xl">
              Нэвтрэх
            </h1>
            <p className="hidden text-muted-foreground md:block md:text-base">
              Сургуулийн нэгдсэн систем
            </p>
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
          <form onSubmit={submit} className="space-y-5 md:space-y-8">
            <div className="space-y-2 md:space-y-3">
              <Label htmlFor="username" className="text-[13px] font-semibold md:text-base">
                Нэвтрэх нэр
              </Label>
              <div className="relative">
                <User
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground md:left-4 md:h-5 md:w-5"
                />
                <Input
                  id="username"
                  name="username"
                  className="h-11 border-brand-wash-border bg-brand-wash pl-10 md:h-14 md:pl-12"
                  autoComplete="username"
                  required
                  autoFocus
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2 md:space-y-3">
              <Label htmlFor="password" className="text-[13px] font-semibold md:text-base">
                Нууц үг
              </Label>
              <div className="relative">
                <Lock
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground md:left-4 md:h-5 md:w-5"
                />
                <Input
                  id="password"
                  name="password"
                  className="h-11 border-brand-wash-border bg-brand-wash pl-10 pr-11 md:h-14 md:pl-12 md:pr-14"
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
                  className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:right-2 md:h-10 md:w-10"
                >
                  {revealed ? (
                    <EyeOff aria-hidden="true" className="h-4 w-4 md:h-5 md:w-5" />
                  ) : (
                    <Eye aria-hidden="true" className="h-4 w-4 md:h-5 md:w-5" />
                  )}
                </button>
              </div>
            </div>

            {error ? (
              <p
                role="alert"
                className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive md:px-4 md:py-2.5 md:text-base"
              >
                {error}
              </p>
            ) : null}

            {/* The colour lives in the Button's default variant now - this
                slab is what every other button in the product copies - so only
                the size is set here. */}
            <Button
              type="submit"
              className="h-11 w-full text-sm md:h-14 md:text-lg"
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
