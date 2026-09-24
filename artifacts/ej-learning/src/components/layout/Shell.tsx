import { Link, useLocation } from "wouter"
import { useGetCurrentTerm } from "@workspace/api-client-react"
import {
  LayoutDashboard, BookOpen, TrendingUp, User, Database, LogOut,
  CalendarDays, Sun, KeyRound, ClipboardCheck, Library, PenLine, Network, BarChart3,
  BookMarked, Bell, Users,
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
]

// What every teacher gets. Looking at a class is not the same as taking one
// of its lessons, so a class teacher who takes none of theirs still belongs
// here: they read the timetable and the results, they just cannot change them.
const TEACHER_NAV = [
  { href: "/teacher", label: "Хяналтын самбар", icon: LayoutDashboard },
  { href: "/teacher/schedule", label: "Хуваарь", icon: CalendarDays },
  { href: "/teacher/results", label: "Шалгалт", icon: ClipboardCheck },
  { href: "/teacher/analytics", label: "Дүн шинжилгээ", icon: BarChart3 },
  { href: "/teacher/productive", label: "Бичих, ярих дүгнэлт", icon: PenLine },
  { href: "/teacher/catalog", label: "Хичээлийн агуулга", icon: BookOpen },
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
  { href: "/teacher/staff", label: "Ажилтны бүртгэл", icon: Users },
  { href: "/teacher/books", label: "Ном ба сэдэв", icon: Library },
  { href: "/teacher/content-links", label: "Сэдвийн холбоо", icon: Network },
  { href: "/teacher/integrations", label: "Холболтууд", icon: Database },
]

/**
 * Pages the navigation does not name: detail screens reached from a link, and
 * the account's own pages. Longest prefix wins, so /subjects/x/plan beats the
 * /subjects nav entry.
 */
const EXTRA_TITLES: [string, string][] = [
  ["/teacher/profile", "Миний бүртгэл"],
  ["/subjects/", "Хувийн төлөвлөгөө"],
  ["/subject/", "Хичээл"],
  ["/assignment/", "Хичээл"],
  ["/password", "Нууц үг солих"],
  ["/teacher/password", "Нууц үг солих"],
]

/** What the bar calls the screen the address is on. */
function pageTitle(location: string, items: { href: string; label: string }[]) {
  const best = (pairs: [string, string][]) =>
    pairs
      .filter(([href]) => location === href || location.startsWith(href))
      .sort((a, b) => b[0].length - a[0].length)[0]?.[1]
  const exact = items.find((item) => item.href === location)?.label
  return (
    exact ??
    best(EXTRA_TITLES) ??
    best(items.filter((i) => i.href !== "/" && i.href !== "/teacher").map((i) => [i.href, i.label])) ??
    items.find((item) => item.href === location)?.label ??
    ""
  )
}

/**
 * Today, in Ulaanbaatar, written out.
 *
 * The bar says it once for the whole product rather than each page printing
 * its own line of it. Built here rather than read from a response: it is the
 * clock, not data, and a page that has not loaded yet still knows the date.
 */
const TODAY = new Intl.DateTimeFormat("mn-MN", {
  dateStyle: "long",
  timeZone: "Asia/Ulaanbaatar",
})

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Админ",
  TEACHER: "Багш",
  STUDENT: "Сурагч",
}

/**
 * Мэдэгдэл: the box, with nothing in it.
 *
 * Deliberately empty. There is no notifications table, no writer and no
 * endpoint, so anything printed here would be invented - which is what the
 * hand-written list that used to sit on the child's day was, and why it came
 * out. The box exists so both sides of the school have the one place a message
 * will arrive in, and it says plainly that none has.
 *
 * It sits in the header rather than on a page because it belongs to the
 * person, not to the screen they happen to be on, and the header is the one
 * thing a teacher and a child share.
 */
function NotificationBox() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Мэдэгдэл"
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-sidebar-active hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Bell className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="py-1 text-xs font-semibold">Мэдэгдэл</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <p className="px-2 py-3 text-xs text-muted-foreground">Мэдэгдэл алга байна.</p>
      </DropdownMenuContent>
    </DropdownMenu>
  )
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
          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-sidebar-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Avatar className="h-7 w-7">
            <AvatarFallback className="text-[10px] font-semibold">{initials}</AvatarFallback>
          </Avatar>
          <span className="hidden sm:block">
            <span className="block text-xs font-semibold leading-tight">{name}</span>
            <span className="block text-[11px] leading-tight text-muted-foreground">
              {roleLabel}
            </span>
          </span>
        </button>
      </DropdownMenuTrigger>

      {/* The icon size is set from here rather than on each icon: the item
          carries [&>svg]:size-4 on itself, and that descendant selector
          outranks a plain size utility sitting on the svg. */}
      <DropdownMenuContent align="end" className="w-48 [&>*_svg]:size-3.5">
        <DropdownMenuLabel className="py-1 font-normal">
          <span className="block text-xs font-semibold leading-tight">{name}</span>
          <span className="block text-[11px] leading-tight text-muted-foreground">
            {roleLabel}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {profileHref ? (
          <DropdownMenuItem asChild className="py-1 text-xs">
            <Link href={profileHref}>
              <User />
              Миний бүртгэл
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem asChild className="py-1 text-xs">
          <Link href={passwordHref}>
            <KeyRound />
            Нууц үг солих
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onSignOut} disabled={signingOut} className="py-1 text-xs">
          <LogOut />
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

  const title = pageTitle(location, navItems)

  const isActive = (href: string) =>
    location === href || (href !== "/" && href !== "/teacher" && location.startsWith(href))

  return (
    // A fixed frame, not a page that grows. It used to be min-h-screen while
    // <main> inside it was h-screen: any column taller than the viewport - an
    // admin's ten-item sidebar on a short window - pushed this div past 100vh
    // and the whole browser window scrolled, while the content area stayed
    // pinned at 100vh with its own scrollbar. Two scrollbars, and the header
    // sliding away. dvh rather than vh so a phone's collapsing address bar
    // does not leave a strip of empty page below the frame.
    <div className="flex h-dvh overflow-hidden bg-background text-foreground font-sans">
      {/* shrink-0 so a wide table in the content area cannot squeeze the
          column narrower than its 16rem. */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-sidebar md:flex">
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
        {/* min-h-0 so this can actually shrink inside the column, and its own
            scrollbar for the case it cannot: an admin holds ten entries, and
            on a short window the list has to scroll here rather than make the
            sidebar taller than the screen. */}
        <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto py-4">
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
                  "flex items-center gap-3 border-l-2 py-2 pl-3 pr-4 text-sm transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring",
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

      {/* min-h-0, not h-screen: the frame above already fixes the height, and
          this is what lets the content area below scroll instead of growing. */}
      <main className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden bg-background">
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
          <div className="hidden min-w-0 md:block">
            <h1 className="truncate text-base font-bold leading-tight">{title}</h1>
            {term ? (
              <p className="truncate text-xs leading-tight text-muted-foreground">
                {term.schoolYear} · {term.name}
              </p>
            ) : null}
          </div>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-xs text-muted-foreground lg:block">
              {TODAY.format(new Date())}
            </span>
            <NotificationBox />
            <AccountMenu
              name={user.displayName}
              roleLabel={roleLabel}
              profileHref={staff ? "/teacher/profile" : "/profile"}
              passwordHref={staff ? "/teacher/password" : "/password"}
              onSignOut={signOut}
              signingOut={signingOut}
            />
          </div>
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
        {/* overscroll-contain so reaching the end of a long page does not
            hand the scroll on to the document behind it. */}
        <div className="flex-1 overflow-auto overscroll-contain p-4 md:p-5 lg:p-6 [scrollbar-gutter:stable]">
          {/* Left-aligned, and capped well above the old 1152px.
              Centring put the surplus on both sides, which left a gap by the
              navigation column wider than the column itself; left-aligning
              moved all of it to the right, where 472px of nothing looked
              like an unfinished page. At 1600 the surplus is 16px at 1920
              and none at all below that, so on every screen this school
              actually uses the page simply fills its width. The cap remains
              for the monitors beyond it, where a full-width line of text
              stops being readable. */}
          <div className="max-w-[1600px]">{children}</div>
        </div>
      </main>
    </div>
  )
}
