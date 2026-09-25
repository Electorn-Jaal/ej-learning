import { Link } from 'wouter'
import { ChevronDown, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export type NavItem = { href: string; label: string; icon: LucideIcon }
export type NavGroup = { label: string; items: NavItem[] }

export function Navigation({ groups, activeHref, mobile = false }: {
  groups: NavGroup[]
  activeHref: string | undefined
  mobile?: boolean
}) {
  const links = (items: NavItem[]) => items.map(({ href, label, icon: Icon }) => (
    <Link key={href} href={href} aria-current={href === activeHref ? 'page' : undefined}
      className={cn('flex items-center gap-3 border-l-2 px-4 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring',
        href === activeHref ? 'border-primary bg-sidebar-active font-semibold' : 'border-transparent hover:bg-sidebar-active/60')}>
      <Icon className="h-4 w-4 shrink-0" /><span>{label}</span>
    </Link>
  ))
  const content = groups.map((group) => group.label ? (
    <section key={group.label} aria-label={group.label} className="mt-4 first:mt-0">
      <h2 className="px-4 pb-1 text-xs font-semibold text-muted-foreground">{group.label}</h2>
      {links(group.items)}
    </section>
  ) : <div key="home">{links(group.items)}</div>)

  return mobile ? (
    <details className="border-b bg-card md:hidden" key={activeHref}>
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold">
        {groups.flatMap((g) => g.items).find((i) => i.href === activeHref)?.label ?? 'Цэс'}
        <span className="flex items-center gap-2 text-muted-foreground">Цэс <ChevronDown className="h-4 w-4" /></span>
      </summary>
      <nav aria-label="Үндсэн цэс" className="max-h-[60dvh] overflow-y-auto pb-4">{content}</nav>
    </details>
  ) : <nav aria-label="Үндсэн цэс" className="min-h-0 flex-1 overflow-y-auto py-4">{content}</nav>
}
