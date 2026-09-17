import { useGetCurrentUser } from "@workspace/api-client-react"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { User } from "lucide-react"

export default function StudentProfile() {
  const { data: user, isLoading } = useGetCurrentUser()

  if (isLoading) {
     return <div className="space-y-4"><Skeleton className="h-40 w-full" /></div>
  }

  if (!user) return null

  return (
    <div className="space-y-6 max-w-2xl animate-in fade-in duration-500 pb-10">
      <header>
        <h1 className="text-2xl font-bold text-foreground mb-1">Миний бүртгэл</h1>
      </header>

      <Card className="border-border shadow-sm bg-card">
        <CardContent className="p-6 sm:p-8 space-y-6">
          <div className="flex items-center gap-5 border-b pb-6">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center text-muted-foreground flex-shrink-0">
              <User className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">{user.displayName}</h2>
              <p className="text-muted-foreground text-sm font-medium capitalize">{user.role === 'teacher' ? 'Багш' : 'Сурагч'}</p>
            </div>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 text-sm">
            <div>
              <div className="text-muted-foreground font-bold uppercase tracking-wider text-xs mb-1">Анги</div>
              <div className="font-bold text-base text-foreground">{user.gradeLevel}-р анги, {user.className}</div>
            </div>
            <div>
              <div className="text-muted-foreground font-bold uppercase tracking-wider text-xs mb-1">Бүртгэлийн төрөл</div>
              <div className="font-bold text-base text-foreground">{user.isDemo ? 'Туршилтын хэрэглэгч' : 'Энгийн хэрэглэгч'}</div>
            </div>
          </div>

          {!user.authConfigured && (
            <div className="mt-6 p-5 bg-pending/10 border border-pending/20 rounded-md text-pending-foreground text-sm">
              <p className="font-bold mb-2 text-base">Нэвтрэх тохиргоо хийгдээгүй байна</p>
              <p className="font-medium leading-relaxed">Энэхүү систем нь одоогоор туршилтын горимд (Managed sign-in is not configured) ажиллаж байна. Жинхэнэ хэрэглэгчийн баталгаажуулалт холбогдоогүй.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
