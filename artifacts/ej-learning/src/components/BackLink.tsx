import { Link } from 'wouter'
import { ArrowLeft } from 'lucide-react'
import { hasRole, useSession } from '@/lib/session'

/**
 * The way out of a page the navigation does not list.
 *
 * The profile and the password are reached from the account menu, so they
 * have no entry in the column on the left and nothing on them is marked as
 * current. Without this a child's only way back is the browser's own button,
 * and on a phone installed as an app there is not one.
 *
 * It points at the role's home rather than calling history.back(): a link
 * that goes somewhere named is predictable, and back() lands wherever the
 * visitor happened to come from - including outside the app.
 */
export function BackLink() {
  const { user } = useSession()
  const staff = hasRole(user, 'TEACHER', 'ADMIN')
  return (
    <Link
      href={staff ? '/teacher' : '/'}
      className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" />
      {staff ? 'Хяналтын самбар' : 'Өнөөдрийн хичээл'}
    </Link>
  )
}
