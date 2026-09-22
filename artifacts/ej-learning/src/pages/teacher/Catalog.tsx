import { useMemo, useState } from "react"
import { useGetTeacherCatalog } from "@workspace/api-client-react"
import { Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { PageHeader } from "@/components/ui/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

const KIND_LABEL: Record<string, string> = {
  lesson: "Үндсэн хичээл",
  task: "Дасгал",
  check: "Асуулт",
}

const STATUS: Record<string, { label: string; dot: string }> = {
  DRAFT: { label: "Ноорог", dot: "bg-muted-foreground/40" },
  IN_REVIEW: { label: "Хянагдаж буй", dot: "bg-pending" },
  APPROVED: { label: "Баталгаажсан", dot: "bg-success" },
  ARCHIVED: { label: "Архивласан", dot: "bg-muted-foreground/40" },
}

/**
 * "Хэл зүй — A1" carries its level in the name; show it as its own column.
 * Only the English skills are named that way, so most subjects have none and
 * the column stays empty rather than inventing something.
 */
const levelOf = (skill: string) => {
  const parts = skill.split("—")
  return parts.length > 1 ? (parts.pop()?.trim() ?? "") : ""
}

export default function Catalog() {
  const { data: items, isLoading, isError } = useGetTeacherCatalog()
  const [kind, setKind] = useState("all")
  const [level, setLevel] = useState("all")
  const [subject, setSubject] = useState("all")
  const [search, setSearch] = useState("")

  const levels = useMemo(
    () => [...new Set((items ?? []).map((item) => levelOf(item.skill)).filter(Boolean))].sort(),
    [items],
  )
  const subjects = useMemo(
    () =>
      [...new Set((items ?? []).map((item) => item.subject).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, "mn"),
      ),
    [items],
  )

  if (isLoading) return <Skeleton className="h-64 w-full" />
  if (isError || !items) return <p role="alert">Хичээлийн материалыг уншиж чадсангүй.</p>

  const needle = search.toLocaleLowerCase()
  const visible = items.filter(
    (item) =>
      (kind === "all" || item.kind === kind) &&
      (level === "all" || levelOf(item.skill) === level) &&
      (subject === "all" || item.subject === subject) &&
      `${item.code} ${item.skill} ${item.subject} ${item.title}`
        .toLocaleLowerCase()
        .includes(needle),
  )

  // Grouped by subject: a flat run of every lesson in the school is a list to
  // search, not one to read, and a teacher arrives knowing which subject they
  // came for.
  const grouped = new Map<string, typeof visible>()
  for (const item of visible) {
    const name = item.subject || "Бусад"
    grouped.set(name, [...(grouped.get(name) ?? []), item])
  }
  const sections = [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b, "mn"))

  return (
    <div className="space-y-6 pb-10">
      <PageHeader
        title="Хичээлийн агуулга"
        description="Номын сэдэвтэй холбогдсон үндсэн хичээл, асуулт, дасгалыг хичээл тус бүрээр харна."
        stats={[
          { label: "Нийт", value: items.length },
          { label: "Үндсэн хичээл", value: items.filter((i) => i.kind === "lesson").length },
          { label: "Дасгал", value: items.filter((i) => i.kind === "task").length },
          { label: "Асуулт", value: items.filter((i) => i.kind === "check").length },
        ]}
      />

      <div className="flex flex-wrap items-end gap-3">
        <Select value={subject} onValueChange={setSubject}>
          <SelectTrigger className="w-full sm:w-44" aria-label="Хичээл">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Бүх хичээл</SelectItem>
            {subjects.map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative w-full flex-1 sm:min-w-56">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Код, чадвар, хичээлээр хайх…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Хайх"
          />
        </div>

        <Select value={kind} onValueChange={setKind}>
          <SelectTrigger className="w-full sm:w-40" aria-label="Төрөл">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Бүх төрөл</SelectItem>
            {Object.entries(KIND_LABEL).map(([key, label]) => (
              <SelectItem key={key} value={key}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {levels.length > 1 ? (
          <Select value={level} onValueChange={setLevel}>
            <SelectTrigger className="w-full sm:w-36" aria-label="Түвшин">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Бүх түвшин</SelectItem>
              {levels.map((code) => (
                <SelectItem key={code} value={code}>
                  {code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>

      <p className="text-sm text-muted-foreground">
        {visible.length} материал
        {visible.length !== items.length ? ` (${items.length}-аас)` : ""}
      </p>

      {sections.length === 0 ? (
        <p className="py-6 text-sm text-muted-foreground">
          Агуулга хараахан ороогүй байна. Ном, сэдэв, асуулт, дасгал импортлогдсоны дараа энд
          хичээл тус бүрээр харагдана.
        </p>
      ) : (
        <div className="space-y-3">
          {sections.map(([name, entries]) => (
            <details
              key={name}
              // A search or a filter has already narrowed things down, so what
              // is left is worth showing; otherwise the subject stays shut.
              open={sections.length === 1 || needle !== "" || kind !== "all" || level !== "all"}
              className="overflow-hidden rounded-md border border-border bg-card"
            >
              <summary className="flex cursor-pointer flex-wrap items-baseline gap-2 px-4 py-3 transition-colors hover:bg-secondary/50">
                <span className="text-base font-bold">{name}</span>
                <span className="text-sm font-normal text-muted-foreground">
                  {entries.length} материал ·{" "}
                  {entries.filter((entry) => entry.kind === "lesson").length} хичээл
                </span>
              </summary>

              <ul className="divide-y border-t border-border">
                {entries.map((item) => {
                  const status = STATUS[item.status] ?? STATUS.DRAFT
                  const level = levelOf(item.skill)
                  return (
                    <li key={item.id}>
                      <details className="group">
                        <summary className="flex cursor-pointer flex-wrap items-center gap-3 px-4 py-3 transition-colors hover:bg-secondary/50">
                          {level ? (
                            <span className="w-12 shrink-0 text-sm font-semibold tabular-nums">
                              {level}
                            </span>
                          ) : null}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{item.skill}</span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {item.code} · {KIND_LABEL[item.kind] ?? item.kind}
                            </span>
                          </span>
                          <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                            <span className={cn("h-1.5 w-1.5 rounded-full", status.dot)} />
                            {status.label}
                          </span>
                        </summary>

                        <div className="space-y-4 border-t border-border px-4 py-4">
                          <p className="whitespace-pre-wrap text-sm font-medium">{item.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {item.skillCode}
                            {item.estimatedMinutes !== null
                              ? ` · ${item.estimatedMinutes} минут`
                              : ""}
                            {item.maxScore !== null ? ` · Дээд оноо ${item.maxScore}` : ""}
                          </p>
                          {item.materialBlocks.map((block, index) => (
                            <section key={index} className="space-y-1">
                              <h3 className="text-sm font-semibold">{block.title}</h3>
                              <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                                {block.body}
                              </p>
                            </section>
                          ))}
                          {item.sourceTitle ? (
                            <p className="border-l-2 border-border pl-3 text-xs text-muted-foreground">
                              Эх сурвалж: {item.sourceTitle}
                            </p>
                          ) : null}
                        </div>
                      </details>
                    </li>
                  )
                })}
              </ul>
            </details>
          ))}
        </div>
      )}

    </div>
  )
}
