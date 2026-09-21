import { Link, useLocation } from "wouter"
import { useGetCurrentTerm } from "@workspace/api-client-react"
import {
  LayoutDashboard, BookOpen, TrendingUp, User, Database, LogOut,
  CalendarDays, Sun, KeyRound, ClipboardCheck, Library, PenLine, Network, BarChart3,
} from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { hasRole, useSession } from "@/lib/session"

// "Хичээлийн сан" is not here. It listed every approved lesson in the school
// for a child to browse, which is not what a school day asks of them: the work
// they have been set is on Өнөөдрийн хичээл, and what they have covered is on
// Миний хичээлүүд. The page and its endpoint stay in the tree.
const STUDENT_NAV = [
  { href: "/", label: "Өнөөдрийн хичээл", icon: Sun },
  { href: "/schedule", label: "Хуваарь", icon: CalendarDays },
  { href: "/subjects", label: "Миний хичээлүүд", icon: BookOpen },
  { href: "/progress", label: "Миний ахиц", icon: TrendingUp },
  { href: "/profile", label: "Миний бүртгэл", icon: User },
]

// What every teacher gets. Looking at a class is not the same as taking one
// of its lessons, so a class teacher who takes none of theirs still belongs
// here: they read the timetable and the results, they just cannot change them.
const TEACHER_NAV = [
  { href: "/teacher", label: "Хяналтын самбар", icon: LayoutDashboard },
  { href: "/teacher/schedule", label: "Хуваарь", icon: CalendarDays },
  { href: "/teacher/results", label: "Шалгалт", icon: ClipboardCheck },
  { href: "/teacher/analytics", label: "Дүн шинжилгээ", icon: BarChart3 },
  { href: "/teacher/catalog", label: "Хичээлийн материал", icon: BookOpen },
]

// Screens for entering things. An account that takes no lesson has nothing to
// enter, and offering a page that answers 403 is worse than not offering it.
//
// "Шалгах ажлууд" is not here on purpose. It lists written answers waiting to
// be marked and says on its own face that a mark entered there is not saved -
// a screen that takes a teacher's judgement and drops it. It comes back when
// marking is finished; the page and its endpoint are still in the tree.
const TEACHING_ONLY = [
  { href: "/teacher/assessment", label: "Дэвтрийн үнэлгээ", icon: PenLine },
]

// Only an administrator configures the books, or looks at an integration that
// is not connected to anything.
const ADMIN_ONLY = [
  { href: "/teacher/books", label: "Ном ба бүтэц", icon: Library },
  { href: "/teacher/content-links", label: "Агуулгын холбоо", icon: Network },
  { href: "/teacher/integrations", label: "Холболтууд", icon: Database },
]

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Админ",
  TEACHER: "Багш",
  STUDENT: "Сурагч",
}

/**
 * The account, top right, where a signed-in site puts it.
 *
 * The sidebar used to end with the name and a Гарах button, which put the one
 * irreversible action on the screen next to the navigation and gave the
 * account's own pages - the profile, the password - places in the middle of a
 * list of school work. They belong together, behind the name.
 */
function AccountMenu({
  name,
  roleLabel,
  profileHref,
  passwordHref,
  onSignOut,
  signingOut,
}: {
  name: string
  roleLabel: string
  profileHref: string | null
  passwordHref: string
  onSignOut: () => void
  signingOut: boolean
}) {
  // Two letters of the display name. A photo would be better and there is
  // nowhere to put one yet: no upload, no column, no file. Initials are honest
  // about that; a stock silhouette pretends there is a picture missing.
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase("mn") ?? "")
    .join("")

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Avatar className="h-8 w-8">
            <AvatarFallback className="text-xs font-semibold">{initials}</AvatarFallback>
          </Avatar>
          <span className="hidden sm:block">
            <span className="block text-sm font-semibold leading-tight">{name}</span>
            <span className="block text-xs leading-tight text-muted-foreground">{roleLabel}</span>
          </span>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="font-normal">
          <span className="block text-sm font-semibold">{name}</span>
          <span className="block text-xs text-muted-foreground">{roleLabel}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {profileHref ? (
          <DropdownMenuItem asChild>
            <Link href={profileHref}>
              <User className="h-4 w-4" />
              Миний бүртгэл
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem asChild>
          <Link href={passwordHref}>
            <KeyRound className="h-4 w-4" />
            Нууц үг солих
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onSignOut} disabled={signingOut}>
          <LogOut className="h-4 w-4" />
          {signingOut ? "Гарч байна…" : "Гарах"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function Shell({ children }: { children: React.ReactNode }) {
  const { user, signOut, signingOut } = useSession()
  const [location] = useLocation()
  const { data: term } = useGetCurrentTerm()

  const staff = hasRole(user, "TEACHER", "ADMIN")
  const admin = hasRole(user, "ADMIN")
  const navItems = staff
    ? [
        ...TEACHER_NAV,
        ...(user.takesLessons || admin ? TEACHING_ONLY : []),
        ...(admin ? ADMIN_ONLY : []),
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
      <aside className="hidden w-64 flex-col border-r border-border bg-sidebar md:flex">
        <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-sidebar-line bg-sidebar-header px-5">
          {/*
            * The school's own badge. It is a circular seal with its name
            * around the ring, so at this size the ring reads and the words do
            * not - the name beside it is what carries them.
            */}
          <img
            src={import.meta.env.BASE_URL + 'logo.png'}
            alt=""
            width={32}
            height={32}
            className="h-8 w-8 shrink-0"
          />
          <div className="min-w-0">
            <div className="truncate text-sm font-bold leading-tight text-foreground">
              Электрон Жаал
            </div>
            {/*
              * Not muted-foreground: that grey is pitched for the page, and on
              * the title block's tan it falls to 3.96:1 - under the floor, at
              * 11px. Seven tenths of the ink clears 4.5:1 in both themes.
              */}
            <div className="truncate text-[11px] leading-tight text-foreground/70">
              Сургуулийн нэгдсэн систем
            </div>
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
                  // A lighter yellow, not white: the column is meant to be one
                  // colour, and a white row would be a hole in it. That fill is
                  // only 1.36:1 on its own, so the navy rule and the weight are
                  // what actually say "you are here".
                  isActive(item.href)
                    ? "border-primary bg-sidebar-active font-semibold text-foreground"
                    : "border-transparent font-medium text-foreground hover:bg-sidebar-active/60",
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </Link>
            )
          })}
        </nav>
        {/* The school year, not the account: the corner says what everything
            above it is about. Nothing is printed when today falls outside
            every recorded term - inventing a year from the month would be a
            guess, and the school sets its own dates. */}
        {term ? (
          <div className="border-t border-sidebar-line bg-sidebar p-4">
            <div className="text-sm font-semibold text-foreground">
              {term.schoolYear} хичээлийн жил
            </div>
            <div className="text-xs text-foreground/80">{term.name}</div>
          </div>
        ) : null}
      </aside>

      <main className="flex-1 flex flex-col h-screen overflow-hidden bg-background">
        <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4">
          <div className="flex items-center gap-2 md:hidden">
            <img
              src={import.meta.env.BASE_URL + 'logo.png'}
              alt=""
              width={28}
              height={28}
              className="h-7 w-7 shrink-0"
            />
            <span className="text-base font-bold text-foreground">Электрон Жаал</span>
          </div>
          <div className="hidden text-sm text-muted-foreground md:block">
            {term ? `${term.schoolYear} · ${term.name}` : ""}
          </div>
          <AccountMenu
            name={user.displayName}
            roleLabel={roleLabel}
            profileHref={staff ? null : "/profile"}
            passwordHref={staff ? "/teacher/password" : "/password"}
            onSignOut={signOut}
            signingOut={signingOut}
          />
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

        {/* The gutter is reserved whether or not the page is long enough to
            scroll. Without it a short screen has the full width and a long one
            loses the bar's width, so the centred column below jumps sideways
            on every navigation between the two. */}
        <div className="flex-1 overflow-auto p-4 md:p-8 lg:p-10 [scrollbar-gutter:stable]">
          <div className="max-w-4xl mx-auto">{children}</div>
        </div>
      </main>
    </div>
  )
}
