import { Link, useLocation } from "wouter"
import {
  LayoutDashboard, BookOpen, TrendingUp, User, CheckSquare, Database, LogOut,
  CalendarDays, Sun, KeyRound, ClipboardCheck, Library, PenLine,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { hasRole, useSession } from "@/lib/session"

const STUDENT_NAV = [
  { href: "/", label: "Өнөөдрийн хичээл", icon: Sun },
  { href: "/lessons", label: "Хичээлийн сан", icon: LayoutDashboard },
  { href: "/subjects", label: "Миний хичээлүүд", icon: BookOpen },
  { href: "/progress", label: "Миний ахиц", icon: TrendingUp },
  { href: "/profile", label: "Миний бүртгэл", icon: User },
  { href: "/password", label: "Нууц үг солих", icon: KeyRound },
]

// What every teacher gets. Looking at a class is not the same as taking one
// of its lessons, so a class teacher who takes none of theirs still belongs
// here: they read the timetable and the results, they just cannot change them.
const TEACHER_NAV = [
  { href: "/teacher", label: "Хяналтын самбар", icon: LayoutDashboard },
  { href: "/teacher/schedule", label: "Хуваарь", icon: CalendarDays },
  { href: "/teacher/results", label: "Шалгалтын үр дүн", icon: ClipboardCheck },
  { href: "/teacher/catalog", label: "Сургалтын сан", icon: BookOpen },
]

// Screens for entering things. An account that takes no lesson has nothing to
// enter, and offering a page that answers 403 is worse than not offering it.
const TEACHING_ONLY = [
  { href: "/teacher/assessment", label: "Дэвтрийн үнэлгээ", icon: PenLine },
  { href: "/teacher/reviews", label: "Шалгах ажлууд", icon: CheckSquare },
]

// Only an administrator configures the books, or looks at an integration that
// is not connected to anything.
const ADMIN_ONLY = [
  { href: "/teacher/books", label: "Ном ба бүтэц", icon: Library },
  { href: "/teacher/integrations", label: "Холболтууд", icon: Database },
]

const PASSWORD_NAV = { href: "/teacher/password", label: "Нууц үг солих", icon: KeyRound }

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Админ",
  TEACHER: "Багш",
  STUDENT: "Сурагч",
}

export function Shell({ children }: { children: React.ReactNode }) {
  const { user, signOut, signingOut } = useSession()
  const [location] = useLocation()

  const staff = hasRole(user, "TEACHER", "ADMIN")
  const admin = hasRole(user, "ADMIN")
  const navItems = staff
    ? [
        ...TEACHER_NAV,
        ...(user.takesLessons || admin ? TEACHING_ONLY : []),
        ...(admin ? ADMIN_ONLY : []),
        PASSWORD_NAV,
      ]
    : STUDENT_NAV
  // An account can hold several roles; name the most privileged one.
  const roleLabel =
    ROLE_LABEL[
      (["ADMIN", "TEACHER", "STUDENT"] as const).find((role) =>
        user.roles.includes(role),
      ) ?? "STUDENT"
    ]

  const isActive = (href: string) =>
    location === href || (href !== "/" && href !== "/teacher" && location.startsWith(href))

  return (
    <div className="flex min-h-screen bg-background text-foreground font-sans">
      <aside className="w-64 border-r border-border bg-card flex-col hidden md:flex">
        <div className="p-6 border-b border-border">
          <div className="block text-xl font-bold text-foreground cursor-default">
            EJ Learning
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 py-4 pr-4">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  // The active item is marked by a solid rule and weight, not
                  // by a wash of the accent colour under text of that same
                  // colour - that pairing is what makes a page look generated.
                  "flex items-center gap-3 border-l-2 py-2 pl-3 pr-2 text-sm transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isActive(item.href)
                    ? "border-primary bg-secondary font-semibold text-foreground"
                    : "border-transparent font-medium text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </Link>
            )
          })}
        </nav>
        <div className="p-4 border-t border-border bg-card space-y-3">
          <div>
            <div className="text-sm font-bold text-foreground">{user.displayName}</div>
            <div className="text-xs text-muted-foreground">{roleLabel}</div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={signOut}
            disabled={signingOut}
          >
            <LogOut className="h-4 w-4" />
            {signingOut ? "Гарч байна…" : "Гарах"}
          </Button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col h-screen overflow-hidden bg-background">
        <div className="md:hidden p-4 border-b bg-card flex items-center justify-between flex-shrink-0">
          <div className="text-lg font-bold text-foreground">EJ Learning</div>
          <Button variant="ghost" size="sm" onClick={signOut} disabled={signingOut}>
            <LogOut className="h-4 w-4" />
            Гарах
          </Button>
        </div>

        <nav
          className="md:hidden flex overflow-x-auto border-b border-border bg-card flex-shrink-0 hide-scrollbar scroll-smooth"
          aria-label="Mobile Navigation"
        >
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                  isActive(item.href)
                    ? "border-b-2 border-primary font-semibold text-foreground"
                    : "border-b-2 border-transparent text-muted-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </Link>
            )
          })}
        </nav>

        <div className="flex-1 overflow-auto p-4 md:p-8 lg:p-10">
          <div className="max-w-4xl mx-auto">{children}</div>
        </div>
      </main>
    </div>
  )
}
