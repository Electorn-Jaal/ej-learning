import { useMemo, useState } from "react"
import { useGetTeacherCatalog } from "@workspace/api-client-react"
import { Search } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
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
  lesson: "Хичээл",
  task: "Даалгавар",
  check: "Шалгах асуулт",
}

const STATUS: Record<string, { label: string; dot: string }> = {
  DRAFT: { label: "Ноорог", dot: "bg-muted-foreground/40" },
  IN_REVIEW: { label: "Хянагдаж буй", dot: "bg-pending" },
  APPROVED: { label: "Баталгаажсан", dot: "bg-success" },
  ARCHIVED: { label: "Архивласан", dot: "bg-muted-foreground/40" },
}

/** "Хэл зүй — A1" carries its level in the name; show it as its own column. */
const levelOf = (skill: string) => skill.split("—").pop()?.trim() ?? ""

export default function Catalog() {
  const { data: items, isLoading, isError } = useGetTeacherCatalog()
  const [kind, setKind] = useState("all")
  const [level, setLevel] = useState("all")
  const [search, setSearch] = useState("")

  const levels = useMemo(
    () => [...new Set((items ?? []).map((item) => levelOf(item.skill)).filter(Boolean))].sort(),
    [items],
  )

  if (isLoading) return <Skeleton className="h-64 w-full" />
  if (isError || !items) return <p role="alert">Сургалтын санг уншиж чадсангүй.</p>

  const needle = search.toLocaleLowerCase()
  const visible = items.filter(
    (item) =>
      (kind === "all" || item.kind === kind) &&
      (level === "all" || levelOf(item.skill) === level) &&
      `${item.code} ${item.skill} ${item.subject} ${item.title}`
        .toLocaleLowerCase()
        .includes(needle),
  )

  return (
    <div className="space-y-6 pb-10">
      <PageHeader
        title="Сургалтын сан"
        description="Сурагчид оноогддог материалын бүрэн жагсаалт."
        stats={[
          { label: "Нийт", value: items.length },
          { label: "Хичээл", value: items.filter((i) => i.kind === "lesson").length },
          { label: "Даалгавар", value: items.filter((i) => i.kind === "task").length },
          { label: "Шалгах асуулт", value: items.filter((i) => i.kind === "check").length },
        ]}
      />

      <div className="flex flex-wrap items-end gap-3">
        <div className="relative min-w-56 flex-1">
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
          <SelectTrigger className="w-40" aria-label="Төрөл">
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
            <SelectTrigger className="w-36" aria-label="Түвшин">
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

      <ul className="divide-y rounded-md border border-border bg-card">
        {visible.map((item) => {
          const status = STATUS[item.status] ?? STATUS.DRAFT
          return (
            <li key={item.id}>
              <details className="group">
                <summary className="flex cursor-pointer flex-wrap items-center gap-3 px-4 py-3 transition-colors hover:bg-secondary/50">
                  <span className="w-14 shrink-0 text-sm font-semibold tabular-nums">
                    {levelOf(item.skill) || "—"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{item.skill}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {item.code} · {item.subject} · {KIND_LABEL[item.kind] ?? item.kind}
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
                    {item.estimatedMinutes !== null ? ` · ${item.estimatedMinutes} минут` : ""}
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
        {visible.length === 0 ? (
          <li>
            <Card className="border-0 shadow-none">
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                Тохирох материал олдсонгүй.
              </CardContent>
            </Card>
          </li>
        ) : null}
      </ul>
    </div>
  )
}
