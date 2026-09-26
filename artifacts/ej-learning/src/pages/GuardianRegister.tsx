import { useState, type FormEvent } from 'react'
import { Link } from 'wouter'
import { useRegisterGuardian } from '@workspace/api-client-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/**
 * A parent asking for an account with the code the school gave them (FR27).
 *
 * Reached without signing in. Sending it makes nothing yet: an administrator
 * checks the request and approves it, and only then does the login work -
 * which the page says, so a parent does not try to sign in straight away and
 * decide the system is broken.
 */
export default function GuardianRegister() {
  const register = useRegisterGuardian()
  const [form, setForm] = useState({ code: '', username: '', displayName: '', relation: '', password: '', again: '' })
  const [sent, setSent] = useState(false)
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value })
  const mismatch = form.again !== '' && form.password !== form.again
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (mismatch || register.isPending) return
    register.mutate({ data: { code: form.code, username: form.username, displayName: form.displayName,
      relation: form.relation || null, password: form.password } }, { onSuccess: () => setSent(true) })
  }
  return <div className="flex min-h-dvh items-start justify-center bg-background p-4 md:items-center">
    <div className="w-full max-w-md space-y-5 rounded-[2px] border bg-card p-6">
      <header className="space-y-1">
        <h1 className="text-xl font-bold">Эцэг эхийн бүртгэл</h1>
        <p className="text-sm text-muted-foreground">Сургуулиас өгсөн урилгын кодоор бүртгүүлэх хүсэлт илгээнэ. Админ шалгаж баталсны дараа нэвтэрнэ.</p>
      </header>
      {sent ? <div role="status" className="space-y-3 text-sm">
        <p>Хүсэлт илгээгдлээ. Сургууль баталсны дараа <span className="font-semibold">{form.username.trim().toLowerCase()}</span> нэрээр нэвтэрнэ.</p>
        <Link href="/" className="underline">Нэвтрэх хуудас руу</Link>
      </div> : <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5"><Label htmlFor="code">Урилгын код</Label>
          <Input id="code" required autoComplete="off" placeholder="xxxx-xxxx-xxxx" value={form.code} onChange={set('code')} /></div>
        <div className="space-y-1.5"><Label htmlFor="displayName">Таны нэр</Label>
          <Input id="displayName" required maxLength={300} value={form.displayName} onChange={set('displayName')} /></div>
        <div className="space-y-1.5"><Label htmlFor="relation">Хүүхдэд хэн болох (ээж, аав…)</Label>
          <Input id="relation" maxLength={40} value={form.relation} onChange={set('relation')} /></div>
        <div className="space-y-1.5"><Label htmlFor="username">Нэвтрэх нэр</Label>
          <Input id="username" required minLength={3} maxLength={50} autoComplete="username" value={form.username} onChange={set('username')} />
          <p className="text-xs text-muted-foreground">Латин үсэг, тоо, . _ - (3–50 тэмдэгт)</p></div>
        <div className="space-y-1.5"><Label htmlFor="password">Нууц үг</Label>
          <Input id="password" type="password" required minLength={8} autoComplete="new-password" value={form.password} onChange={set('password')} /></div>
        <div className="space-y-1.5"><Label htmlFor="again">Нууц үг давтах</Label>
          <Input id="again" type="password" required autoComplete="new-password" value={form.again} onChange={set('again')} />
          {mismatch && <p className="text-xs text-destructive">Нууц үг таарахгүй байна.</p>}</div>
        {register.error && <p role="alert" className="text-sm text-destructive">{register.error.data?.error ?? 'Илгээж чадсангүй.'}</p>}
        <Button type="submit" className="w-full" disabled={register.isPending || mismatch}>{register.isPending ? 'Илгээж байна…' : 'Хүсэлт илгээх'}</Button>
        <p className="text-center text-sm"><Link href="/" className="underline">Нэвтрэх хуудас руу буцах</Link></p>
      </form>}
    </div>
  </div>
}
