import type { ReactNode } from "react"
import { useGetCurrentUser, useGetStudentRecord } from "@workspace/api-client-react"
import { Phone } from "lucide-react"
import { BackLink } from "@/components/BackLink"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

/**
 * One block of general information, laid out the way the Erdem portal lays
 * out a student profile: a header card, then a plain label-and-value grid.
 *
 * Deliberately not tabbed. The portal's design splits the page into Ерөнхий
 * мэдээлэл / Хичээлүүд / Дүн / Батламж, but three of those four tabs would be
 * empty here and the subjects already have a page of their own. A tab strip
 * that hides nothing is a row of buttons that teaches a child the page is
 * broken.
 *
 * The portal's row of figures - attendance, average mark, certificates - is
 * gone for the same reason. Nothing here records attendance or certificates,
 * and the skill counts it was showing instead were three zeroes: a figure
 * that is always zero is not a measurement, it is furniture.
 *
 * So the page shows what the system actually holds and nothing else, and it
 * grows as the register does: the name in two parts, the file and attendance
 * status, and the family's telephone numbers all arrived from the school's own
 * workbook and each has a block of its own. What the register still leaves
 * blank - birth date, address - is simply absent rather than listed as
 * missing, because which records exist is a question for the school's data
 * review, not something to put in front of a child.
 */

/** Same rule as the shell's avatar, so the two never disagree. */
function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase("mn") ?? "")
    .join("")
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="text-sm">{value || "—"}</span>
    </div>
  )
}

/**
 * A block of the record, shown only when the register filled it in.
 *
 * The page is built out of these rather than one long grid so that a child
 * whose family never left a telephone number sees a shorter page, not a
 * section of dashes. Which parts of the register are blank is the school's
 * own data question; it does not belong on a child's screen.
 */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <h2 className="font-bold">{title}</h2>
        {children}
      </CardContent>
    </Card>
  )
}

const ROLE_LABEL: Record<string, string> = {
  student: "Сурагч",
  teacher: "Багш",
  admin: "Админ",
}

export default function StudentProfile() {
  const { data: user, isLoading, refetch } = useGetCurrentUser()
  const { data: record, error: recordError, refetch: refetchRecord } = useGetStudentRecord()

  if (isLoading) return <Skeleton className="h-96 w-full" />
  if (!user) return <div role="alert" className="space-y-2"><p>Хувийн мэдээллийг уншиж чадсангүй.</p><button className="underline" onClick={() => void refetch()}>Дахин оролдох</button></div>

  return (
    <div className="space-y-4 pb-10">
      <BackLink />

      {/* Without this a failed register read looks like a blank register:
          the surname and the parents simply vanish from the page. */}
      {recordError ? (
        <div role="alert" className="space-y-2">
          <p>Бүртгэлийн мэдээллийг уншиж чадсангүй.</p>
          <button className="underline" onClick={() => void refetchRecord()}>Дахин оролдох</button>
        </div>
      ) : null}

      <Card>
        <CardContent className="flex flex-wrap items-center gap-5 p-6">
          <Avatar className="h-16 w-16">
            <AvatarFallback className="text-lg font-semibold">
              {initialsOf(user.displayName)}
            </AvatarFallback>
          </Avatar>
          <div className="flex min-w-[220px] grow flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="text-xl font-bold">{user.displayName}</span>
              <Badge variant="secondary" className="font-normal">
                {ROLE_LABEL[user.role] ?? user.role}
              </Badge>
            </div>
            <span className="text-sm text-muted-foreground">
              {[
                user.className ? `${user.gradeLevel}-р анги, ${user.className}` : null,
                user.studentCode ? `Сурагчийн код: ${user.studentCode}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </div>
        </CardContent>
      </Card>

      <Section title="Ерөнхий мэдээлэл">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {/* The register supplies the name in two parts, so the page shows
              both rather than only the two glued together. */}
          <Field label="Овог" value={record?.familyName ?? null} />
          <Field label="Нэр" value={record?.givenName ?? user.displayName} />
          <Field label="Сурагчийн код" value={user.studentCode} />
          <Field label="Анги" value={user.className ? `${user.gradeLevel}-р анги, ${user.className}` : null} />
          <Field label="Хичээлийн жил" value={user.schoolYear} />
          <Field label="Нэвтрэх нэр" value={user.username} />
          <Field label="Эрх" value={ROLE_LABEL[user.role] ?? user.role} />
        </div>
      </Section>

      {/* "Бүртгэлийн байдал" is gone. It printed two words off the school's
          register - Хувийн хэрэг: Байгаа, Ирц: Ирсэн - which say the same
          thing about every child on the roll and so distinguish nobody. A
          block that reads identically on 292 pages is furniture. The columns
          remain; when the register starts recording something that varies,
          the block can come back. */}

      {record && record.guardians.length > 0 ? (
        <Section title="Холбоо барих">
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {record.guardians.map((guardian) => (
              <li key={guardian.phone} className="flex items-center gap-2.5">
                <Phone className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm tabular-nums">{guardian.phone}</span>
                  {/* Two thirds of the numbers arrive with no role written
                      against them; naming one would be inventing it. */}
                  {guardian.relationMn ? (
                    <span className="text-[11px] text-muted-foreground">
                      {guardian.relationMn}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {!user.authConfigured ? (
        <Card>
          <CardContent className="p-6 text-sm">
            <p className="font-bold">Нэвтрэх тохиргоо хийгдээгүй байна</p>
            <p className="mt-1 text-muted-foreground">
              Систем туршилтын горимд ажиллаж байна; хэрэглэгчийн баталгаажуулалт холбогдоогүй.
            </p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
