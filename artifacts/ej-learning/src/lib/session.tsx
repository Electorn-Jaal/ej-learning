import { createContext, useContext, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  useGetSession,
  useLogout,
  getGetSessionQueryKey,
  type AuthenticatedUser,
  type UserRole,
} from '@workspace/api-client-react'

type SessionValue = {
  user: AuthenticatedUser
  signOut: () => void
  signingOut: boolean
}

const SessionContext = createContext<SessionValue | null>(null)

/**
 * The session lives in one query, so signing in or out is an invalidation
 * rather than a page reload: the cookie is httpOnly and the browser attaches
 * it on its own, leaving nothing for the app to hold or refresh.
 */
export function SessionProvider({
  user,
  children,
}: {
  user: AuthenticatedUser
  children: ReactNode
}) {
  const queryClient = useQueryClient()
  const { mutate, isPending } = useLogout()

  const signOut = () =>
    mutate(undefined, {
      // Reset on settle, not on success: if the request failed because the
      // session was already gone, staying signed in is the wrong outcome.
      //
      // resetQueries rather than clear. clear() removes every query from the
      // cache without asking for any of them again, and the observer watching
      // the session keeps hold of the query object it already had - so the app
      // went on rendering the account that had just left until something
      // unrelated re-rendered it and a fresh query was built. That is the
      // "nothing happened, then it suddenly signed out" the button showed.
      // reset() empties the cache too, but refetches whatever is still on
      // screen, and the session answering 401 is what signs the app out.
      //
      // clear() also emptied the mutation cache, which held this very mutation
      // while it was still settling, leaving the button stuck on "Гарч байна…".
      onSettled: () => {
        void queryClient.resetQueries()
      },
    })

  return (
    <SessionContext.Provider value={{ user, signOut, signingOut: isPending }}>
      {children}
    </SessionContext.Provider>
  )
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext)
  if (!value) throw new Error('useSession must be used inside SessionProvider')
  return value
}

export const hasRole = (user: AuthenticatedUser, ...roles: UserRole[]) =>
  roles.some((role) => user.roles.includes(role))

/**
 * Reads the session. A 401 is the signed-out answer, not a failure, so it is
 * never retried - retrying would stall the login screen behind three round
 * trips.
 */
export function useSessionQuery() {
  return useGetSession({
    query: {
      queryKey: getGetSessionQueryKey(),
      retry: false,
      staleTime: 30_000,
    },
  })
}

export const sessionQueryKey = getGetSessionQueryKey
