import {
  useGetMyStaffProfile,
  useSaveMyStaffProfile,
} from '@workspace/api-client-react'
import { BackLink } from '@/components/BackLink'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { StaffFields } from '@/components/staff/StaffFields'
import { StaffPhoto } from '@/components/staff/StaffPhoto'
import { hasRole, useSession } from '@/lib/session'

/**
 * A member of staff's own record.
 *
 * Built the same way the child's profile is - a header card, then plain
 * label-and-value blocks - so the two sides of the school do not look like two
 * products. What it shows is not written here: the server says what a staff
 * record consists of, and this renders that list.
 *
 * A teacher writes the parts that are theirs: their photograph, their
 * telephone number, when they started. Their job title and department came
 * from the school's register and are the administrator's to change, which the
 * fields say for themselves rather than being enforced silently.
 */
export default function TeacherProfile() {
  const { user } = useSession()
  const { data: profile, isLoading, isError } = useGetMyStaffProfile()
  const { mutate: save, isPending: saving, error } = useSaveMyStaffProfile()

  if (isLoading) return <Skeleton className="h-96 w-full" />
  if (isError || !profile) {
    return (
      <div className="space-y-3">
        <BackLink />
        <p role="alert" className="text-sm text-muted-foreground">
          Таны бүртгэл олдсонгүй. Сургуулийн админд хандана уу.
        </p>
      </div>
    )
  }

  const admin = hasRole(user, 'ADMIN')

  return (
    <div className="space-y-4 pb-10">
      <BackLink />

      <Card>
        <CardContent className="flex flex-wrap items-center gap-6 p-6">
          <StaffPhoto
            teacherId={profile.teacherId}
            name={profile.displayName}
            photoUrl={profile.photoUrl}
            editable
          />
          <div className="flex min-w-[220px] grow flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="text-xl font-bold">{profile.displayName}</span>
              <Badge variant="secondary" className="font-normal">
                {admin ? 'Админ' : 'Багш'}
              </Badge>
            </div>
            <span className="text-sm text-muted-foreground">
              {[profile.teacherCode, profile.username].filter(Boolean).join(' · ')}
            </span>
            {profile.subjects.length > 0 ? (
              <span className="text-sm">{profile.subjects.join(', ')}</span>
            ) : null}
            {profile.classes.length > 0 ? (
              <span className="text-sm text-muted-foreground">
                {profile.classes.join(', ')}
              </span>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-6">
          <h2 className="font-bold">Ерөнхий мэдээлэл</h2>
          <StaffFields
            profile={profile}
            canEditAll={admin}
            saving={saving}
            error={error?.data?.error ?? null}
            onSave={(fields) => save({ data: { fields } })}
          />
        </CardContent>
      </Card>
    </div>
  )
}
