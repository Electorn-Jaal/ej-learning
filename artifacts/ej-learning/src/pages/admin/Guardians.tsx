import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  useGetGuardianAccounts,
  useGetTeacherClasses,
  useGetClassChildren,
  getGetClassChildrenQueryKey,
  useCreateGuardian,
  useUnlinkChild,
} from '@workspace/api-client-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { NATIVE_INPUT, NATIVE_SELECT } from '@/components/ui/native-select'
import { cn } from '@/lib/utils'
import { GuardianInvites, GuardianRequests } from '@/components/admin/GuardianRequests'

/**
 * Making a parent an account, with the child attached in the same breath.
 *
 * Two steps - make the login, then find it again to link it - is how a school
 * ends up with accounts that read nothing, held by parents who were told the
 * system was ready. So the child is chosen here, and the account is not made
 * without one.
 *
 * The password is typed by the administrator sitting with the parent, because
 * this school hands credentials over in person. It is shown once on this
 * screen and never again: nothing can fetch it back.
 */
function NewGuardian({ onDone }: { onDone: () => void }) {
  const { data: classes } = useGetTeacherClasses()
  const [classId, setClassId] = useState<string>('')
  const [studentId, setStudentId] = useState<string>('')
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [made, setMade] = useState<{ username: string; password: string } | null>(null)
  const { mutate: create, isPending, error } = useCreateGuardian()

  const uniqueClasses = [...new Map((classes ?? []).map((row) => [row.id, row])).values()]
  const chosenClass = Number(classId || uniqueClasses[0]?.id || 0)
  const childParams = { classId: chosenClass }
  const { data: children } = useGetClassChildren(childParams, {
    query: {
      queryKey: getGetClassChildrenQueryKey(childParams),
      enabled: chosenClass > 0,
    },
  })

  if (made) {
    return (
      <div className="space-y-2 rounded-[2px] border border-border bg-card p-4">
        <p className="text-sm font-medium">Бүртгэл үүслээ</p>
        {/* Said once. Nothing can fetch it back, so it is written down now or
            it is reset later. */}
        <p className="text-sm">
          Нэвтрэх нэр: <strong>{made.username}</strong>
          <span className="mx-2 text-muted-foreground">·</span>
          Нууц үг: <strong>{made.password}</strong>
        </p>
        <p className="text-xs text-muted-foreground">
          Нууц үгийг дахин харах боломжгүй. Эцэг эхэд нь өгсний дараа энэ цонхыг хаана уу.
        </p>
        <Button size="sm" onClick={() => { setMade(null); onDone() }}>Хаах</Button>
      </div>
    )
  }

  return (
    <div className="space-y-3 rounded-[2px] border border-border bg-card p-4">
      <p className="text-sm font-semibold">Шинэ эцэг эхийн бүртгэл</p>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-0.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Анги</p>
          <select
            className={cn(NATIVE_SELECT, 'w-auto')} aria-label="Анги"
            value={String(chosenClass)}
            onChange={(event) => { setClassId(event.target.value); setStudentId('') }}
          >
            {uniqueClasses.map((row) => (
              <option key={row.id} value={String(row.id)}>{row.name}</option>
            ))}
          </select>
        </div>
        <div className="min-w-0 flex-1 space-y-0.5 sm:max-w-xs">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Хүүхэд</p>
          <select
            className={NATIVE_SELECT} aria-label="Хүүхэд"
            value={studentId}
            onChange={(event) => setStudentId(event.target.value)}
          >
            <option value="">Сонгох</option>
            {(children ?? []).map((row) => (
              <option key={row.studentId} value={String(row.studentId)}>
                {row.displayName}{row.linked ? ' — бүртгэлтэй' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-0.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Нэр</p>
          <input
            type="text" className={cn(NATIVE_INPUT, 'w-56')} maxLength={300}
            aria-label="Эцэг эхийн нэр" placeholder="Овог нэр"
            value={displayName} onChange={(event) => setDisplayName(event.target.value)}
          />
        </div>
        <div className="space-y-0.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Нэвтрэх нэр</p>
          <input
            type="text" className={cn(NATIVE_INPUT, 'w-44')} maxLength={50}
            aria-label="Нэвтрэх нэр" placeholder="parent-batbold"
            value={username} onChange={(event) => setUsername(event.target.value)}
          />
        </div>
        <div className="space-y-0.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Нууц үг</p>
          <input
            type="text" className={cn(NATIVE_INPUT, 'w-44')} minLength={8}
            aria-label="Нууц үг"
            value={password} onChange={(event) => setPassword(event.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          size="sm"
          disabled={
            isPending || studentId === '' || username.trim() === ''
            || displayName.trim() === '' || password.length < 8
          }
          onClick={() => create({
            data: {
              username: username.trim(),
              displayName: displayName.trim(),
              password,
              studentId: Number(studentId),
            },
          }, {
            onSuccess: (result) => setMade({ username: result.username, password }),
          })}
        >
          {isPending ? 'Үүсгэж байна…' : 'Үүсгэх'}
        </Button>
        <span className="text-xs text-muted-foreground">
          Нэг хүүхдэд нэг идэвхтэй бүртгэл. Хуучныг нь автоматаар хаана.
        </span>
        {error ? (
          <span role="alert" className="text-xs text-destructive">
            {error?.data?.error ?? 'Үүсгэж чадсангүй.'}
          </span>
        ) : null}
      </div>
    </div>
  )
}

/**
 * Parent accounts, and the children they read.
 *
 * An account with no child is listed with the rest rather than hidden, because
 * it is the thing most likely to be wrong: somebody was given a password and
 * sees an empty product.
 */
export default function AdminGuardians() {
  const queryClient = useQueryClient()
  const { data, isLoading, isError } = useGetGuardianAccounts()
  const { mutate: unlink } = useUnlinkChild()
  const [adding, setAdding] = useState(false)

  const refresh = () => queryClient.invalidateQueries({
    predicate: (query) => typeof query.queryKey[0] === 'string'
      && query.queryKey[0].includes('/admin/guardians'),
  })

  if (isLoading) return <Skeleton className="h-64 w-full" />
  if (isError) {
    return <p role="alert" className="text-sm text-destructive">Бүртгэлийг уншиж чадсангүй.</p>
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant={adding ? 'outline' : 'default'} onClick={() => setAdding(!adding)}>
          {adding ? 'Болих' : 'Эцэг эх нэмэх'}
        </Button>
        <span className="text-xs text-muted-foreground">
          {data?.length ?? 0} бүртгэл
        </span>
      </div>

      {adding ? <NewGuardian onDone={() => { setAdding(false); refresh() }} /> : null}

      <GuardianRequests onDecided={refresh} />
      <GuardianInvites />

      {!data?.length ? (
        <p className="rounded-[2px] border border-border bg-card p-6 text-sm text-muted-foreground">
          Эцэг эхийн бүртгэл хараахан үүсгээгүй байна.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-[2px] border border-border bg-card">
          {data.map((account) => (
            <li key={account.userId} className="space-y-1 px-4 py-2">
              <div className="flex flex-wrap items-baseline gap-x-3">
                <span className="text-sm font-medium">{account.displayName}</span>
                <span className="text-xs text-muted-foreground">{account.username}</span>
                {account.isActive ? null : (
                  <span className="text-xs text-destructive">хаагдсан</span>
                )}
              </div>
              {account.children.length === 0 ? (
                <p className="text-xs text-destructive">
                  Хүүхэд холбоогүй — нэвтэрвэл хоосон харагдана.
                </p>
              ) : (
                <ul className="space-y-0.5">
                  {account.children.map((row) => (
                    <li key={row.studentId} className="flex flex-wrap items-center gap-2 text-xs">
                      <span>{row.studentName}</span>
                      {row.relation ? (
                        <span className="text-muted-foreground">{row.relation}</span>
                      ) : null}
                      <Button
                        size="sm" variant="outline"
                        onClick={() => unlink(
                          { data: { userId: account.userId, studentId: row.studentId } },
                          { onSuccess: refresh },
                        )}
                      >
                        Салгах
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
