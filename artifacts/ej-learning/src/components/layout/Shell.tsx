import { Link, useLocation } from "wouter"
import { useGetCurrentUser, useGetPreviewStudents, getGetCurrentUserQueryKey, getGetPreviewStudentsQueryKey } from "@workspace/api-client-react"
import { LayoutDashboard, BookOpen, TrendingUp, User, CheckSquare, Database } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

export function Shell({ children }: { children: React.ReactNode }) {
  const { data: user, isLoading } = useGetCurrentUser({query:{queryKey:getGetCurrentUserQueryKey(),retry:false}})
  const { data: students, isLoading: studentsLoading, isError } = useGetPreviewStudents({query:{queryKey:getGetPreviewStudentsQueryKey(),retry:false}})
  const [location] = useLocation()

  if (isLoading || studentsLoading) {
    return (
      <div className="flex min-h-screen">
        <div className="w-64 border-r bg-card p-4 space-y-4 hidden md:block">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
        <div className="flex-1 p-8"><Skeleton className="h-full w-full" /></div>
      </div>
    )
  }

  if (isError) {
    return <div className="p-8 text-destructive font-medium">Өгөгдөл харах горим ажиллахгүй байна. API болон локал тохиргоог шалгана уу.</div>
  }

  const isTeacher = location.startsWith("/teacher")

  const navItems = isTeacher
    ? [
        { href: "/teacher", label: "Хяналтын самбар", icon: LayoutDashboard },
        { href: "/teacher/reviews", label: "Шалгах ажлууд", icon: CheckSquare },
        { href: "/teacher/catalog", label: "Сургалтын сан", icon: BookOpen },
        { href: "/teacher/integrations", label: "Холболтууд", icon: Database },
      ]
    : [
        { href: "/", label: "Сургалтын тойм", icon: LayoutDashboard },
        { href: "/subjects", label: "Миний хичээлүүд", icon: BookOpen },
        { href: "/progress", label: "Миний ахиц", icon: TrendingUp },
        { href: "/profile", label: "Миний бүртгэл", icon: User },
      ]

  return (
    <div className="flex min-h-screen bg-background text-foreground font-sans">
      <aside className="w-64 border-r border-border bg-card flex-col hidden md:flex">
        <div className="p-6 border-b border-border">
          <div className="block text-xl font-bold text-foreground cursor-default">
            EJ Learning
          </div>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon
            const active = location === item.href || (item.href !== "/" && location.startsWith(item.href))
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </Link>
            )
          })}
        </nav>
        <div className="p-4 border-t border-border bg-card">
          <div className="text-sm font-bold text-foreground">{user?.displayName ?? 'Сурагч сонгоогүй'}</div>
          <div className="text-xs text-muted-foreground">
            {isTeacher ? "Багшийн мэдээлэл харах орчин" : user?.className || "Сурагч"}
          </div>
        </div>
      </aside>
      
      <main className="flex-1 flex flex-col h-screen overflow-hidden bg-background">
        <div className="border-b bg-muted/40 p-3 flex flex-wrap items-center gap-3 text-sm">
          <span className="font-medium">Бодит өгөгдөл · Зөвхөн харах</span>
          <label htmlFor="preview-student">Сурагч:</label>
          <select id="preview-student" className="border rounded bg-background p-2 max-w-full"
            value={user?.id ?? ''} onChange={event => {
              try { localStorage.setItem('ej-preview-student',event.target.value); } catch { return; }
              window.location.reload();
            }}>
            <option value="">Сурагч сонгоно уу</option>
            {students?.map(student=><option key={student.id} value={student.id}>{student.code} · {student.displayName} · {student.className}</option>)}
          </select>
          <Link href={isTeacher ? '/' : '/teacher'} className="underline">{isTeacher ? 'Сурагчийн орчин' : 'Багшийн орчин'}</Link>
        </div>
        <div className="md:hidden p-4 border-b bg-card flex items-center justify-between flex-shrink-0">
          <div className="text-lg font-bold text-foreground">
            EJ Learning
          </div>
        </div>
        
        {/* Mobile Navigation */}
        <nav className="md:hidden flex overflow-x-auto border-b border-border bg-card flex-shrink-0 hide-scrollbar scroll-smooth" aria-label="Mobile Navigation">
           {navItems.map((item) => {
            const Icon = item.icon
            const active = location === item.href || (item.href !== "/" && location.startsWith(item.href))
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                  active
                    ? "border-b-2 border-primary text-primary"
                    : "text-muted-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </Link>
            )
          })}
        </nav>

        <div className="flex-1 overflow-auto p-4 md:p-8 lg:p-10">
          <div className="max-w-4xl mx-auto">
            {!user && !isTeacher ? <p className="p-6 border rounded">Дээрх жагсаалтаас сурагч сонгож мэдээллийг нь харна уу. Энэ сонголт нь нэвтрэлт биш.</p> : children}
          </div>
        </div>
      </main>
    </div>
  )
}
