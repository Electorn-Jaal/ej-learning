import { useMemo, useState, type ReactNode } from "react"
import {
  useGetSkillChain,
  useGetSkillMap,
  type SkillChain,
  type SkillMap,
} from "@workspace/api-client-react"
import { Search } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { PageHeader, type Stat } from "@/components/ui/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

const LEVEL_LABEL: Record<string, string> = {
  DOMAIN: "Салбар",
  UNIT: "Бүлэг",
  TOPIC: "Сэдэв",
  SUBTOPIC: "Дэд сэдэв",
  SEGMENT: "Хэсэг",
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Ноорог",
  IN_REVIEW: "Хянагдаж буй",
  APPROVED: "Баталгаажсан",
  ARCHIVED: "Архивласан",
}

const RELATION_LABEL: Record<string, string> = {
  REQUIRED: "Заавал",
  RECOMMENDED: "Зөвлөмж",
}

function Tag({ tone, children }: { tone: "fault" | "muted" | "ok"; children: ReactNode }) {
  return (
    <span
      className={cn(
        "rounded-sm px-1.5 py-0.5 text-xs font-medium",
        tone === "fault" && "bg-destructive/10 text-destructive",
        tone === "muted" && "bg-secondary text-muted-foreground",
        tone === "ok" && "bg-success/10 text-success",
      )}
    >
      {children}
    </span>
  )
}

function SearchBox({
  value,
  onChange,
  placeholder,
  children,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  children?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative w-full flex-1 sm:min-w-56">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder={placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-label="Хайх"
        />
      </div>
      {children}
    </div>
  )
}

/* ---------------------------------------------------------------- topics -- */

type Fault = "no-skill" | "no-primary" | "many-primary" | "unapproved"

const FAULT_LABEL: Record<Fault, string> = {
  "no-skill": "Чадваргүй сэдэв",
  "no-primary": "Гол чадваргүй",
  "many-primary": "Гол чадвар олон",
  unapproved: "Батлагдаагүй холбоос",
}

const FAULT_NOTE: Partial<Record<Fault, string>> = {
  "no-skill": "Эдгээр сэдвийн хичээл заагдана, гэхдээ юу ч хэмжигдэхгүй",
  "many-primary": "Аль номын хуудас нээгдэх нь тодорхойгүй болно",
  unapproved: "Сурагчид харагдахгүй",
}

/**
 * A link left at anything but APPROVED is invisible to a student, whatever
 * state the skill it names is in - they are two separate gates, and a screen
 * that shows only one of them sends somebody hunting in the wrong table.
 */
const faultsOf = (skills: { isPrimary: boolean; mapStatus: string }[]): Fault[] => {
  if (skills.length === 0) return ["no-skill"]
  const primaries = skills.filter((skill) => skill.isPrimary).length
  const faults: Fault[] = []
  if (primaries === 0) faults.push("no-primary")
  if (primaries > 1) faults.push("many-primary")
  if (skills.some((skill) => skill.mapStatus !== "APPROVED")) faults.push("unapproved")
  return faults
}

function TopicSkillTab({ data }: { data: SkillMap }) {
  const [search, setSearch] = useState("")
  const [faultsOnly, setFaultsOnly] = useState(false)

  const nodes = useMemo(
    () => data.nodes.map((node) => ({ ...node, faults: faultsOf(node.skills) })),
    [data],
  )

  const orphans = data.unmappedSkills
  const orphansWithLessons = orphans.filter((skill) => skill.lessonCount > 0)
  const faultyNodes = nodes.filter((node) => node.faults.length > 0)

  const needle = search.trim().toLocaleLowerCase()
  const visible = nodes.filter(
    (node) =>
      (!faultsOnly || node.faults.length > 0) &&
      (needle === "" ||
        [
          node.contentCode,
          node.name,
          node.subjectName,
          ...node.skills.flatMap((skill) => [skill.skillCode, skill.name]),
        ].some((value) => value.toLocaleLowerCase().includes(needle))),
  )

  const grouped = new Map<string, typeof visible>()
  for (const node of visible) {
    grouped.set(node.subjectName, [...(grouped.get(node.subjectName) ?? []), node])
  }
  const sections = [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b, "mn"))

  return (
    <div className="space-y-6">
      {faultyNodes.length > 0 || orphansWithLessons.length > 0 ? (
        <Card>
          <CardContent className="space-y-2 py-4 text-sm">
            <p className="font-semibold">Шалгах зүйлс</p>
            <ul className="space-y-1 text-muted-foreground">
              {(Object.keys(FAULT_LABEL) as Fault[]).map((fault) => {
                const count = faultyNodes.filter((node) => node.faults.includes(fault)).length
                if (count === 0) return null
                const note = FAULT_NOTE[fault]
                return (
                  <li key={fault}>
                    <span className="font-medium text-foreground">{count}</span> сэдэв —{" "}
                    {FAULT_LABEL[fault].toLocaleLowerCase()}
                    {note ? `. ${note}` : null}
                  </li>
                )
              })}
              {orphansWithLessons.length > 0 ? (
                <li>
                  <span className="font-medium text-foreground">{orphansWithLessons.length}</span>{" "}
                  чадвар нэг ч сэдэвт холбогдоогүй атлаа хичээлтэй. Хичээл нь заагдана, харин номын
                  хуудас олдохгүй
                </li>
              ) : null}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <SearchBox value={search} onChange={setSearch} placeholder="Сэдэв, чадвар, кодоор хайх…">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={faultsOnly}
            onChange={(event) => setFaultsOnly(event.target.checked)}
          />
          Зөвхөн анхаарах сэдэв
        </label>
      </SearchBox>

      <p className="text-sm text-muted-foreground">
        {visible.length} сэдэв
        {visible.length !== nodes.length ? ` (${nodes.length}-аас)` : ""}
      </p>

      {sections.length === 0 ? (
        <p className="py-6 text-sm text-muted-foreground">Тохирох сэдэв олдсонгүй.</p>
      ) : (
        <div className="space-y-8">
          {sections.map(([subjectName, entries]) => (
            <section key={subjectName} className="space-y-3">
              <h2 className="flex items-baseline gap-2 border-b border-border pb-2">
                <span className="text-lg font-bold">{subjectName}</span>
                <span className="text-sm font-normal text-muted-foreground">
                  {entries.length} сэдэв
                </span>
              </h2>

              <ul className="divide-y rounded-[2px] border border-border bg-card">
                {entries.map((node) => (
                  <li key={node.contentCode} className="px-4 py-3">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {node.contentCode}
                      </span>
                      <span className="font-medium">{node.name}</span>
                      <Tag tone="muted">{LEVEL_LABEL[node.levelType] ?? node.levelType}</Tag>
                      {node.faults.map((fault) => (
                        <Tag key={fault} tone="fault">
                          {FAULT_LABEL[fault]}
                        </Tag>
                      ))}
                    </div>

                    {node.skills.length > 0 ? (
                      <ul className="mt-2 space-y-1 border-l-2 border-border pl-3">
                        {node.skills.map((skill) => (
                          <li
                            key={skill.skillCode}
                            className="flex flex-wrap items-baseline gap-2 text-sm"
                          >
                            {skill.isPrimary ? <Tag tone="ok">Гол</Tag> : null}
                            <span>{skill.name}</span>
                            <span className="text-xs tabular-nums text-muted-foreground">
                              {skill.skillCode}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {skill.lessonCount} хичээл
                            </span>
                            {skill.mapStatus !== "APPROVED" ? (
                              <Tag tone="fault">
                                Холбоос: {STATUS_LABEL[skill.mapStatus] ?? skill.mapStatus}
                              </Tag>
                            ) : null}
                            {skill.status !== "APPROVED" ? (
                              <Tag tone="fault">
                                Чадвар: {STATUS_LABEL[skill.status] ?? skill.status}
                              </Tag>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {orphans.length > 0 ? (
        <section className="space-y-3">
          <h2 className="flex items-baseline gap-2 border-b border-border pb-2">
            <span className="text-lg font-bold">Сэдэвт холбогдоогүй чадвар</span>
            <span className="text-sm font-normal text-muted-foreground">{orphans.length}</span>
          </h2>
          <ul className="divide-y rounded-[2px] border border-border bg-card">
            {orphans.map((skill) => (
              <li
                key={skill.skillCode}
                className="flex flex-wrap items-baseline gap-2 px-4 py-2 text-sm"
              >
                <span className="text-xs tabular-nums text-muted-foreground">
                  {skill.skillCode}
                </span>
                <span>{skill.name}</span>
                <Tag tone="muted">{skill.subjectName}</Tag>
                <span className="text-xs text-muted-foreground">{skill.lessonCount} хичээл</span>
                {skill.lessonCount > 0 ? <Tag tone="fault">Номын хуудас олдохгүй</Tag> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}

/* ----------------------------------------------------------------- chain -- */

function ChainTab({ data }: { data: SkillChain }) {
  const [search, setSearch] = useState("")
  const [faultsOnly, setFaultsOnly] = useState(false)

  const links = data.links
  const ignored = links.filter((link) => !link.followed)
  const deadEnds = links.filter((link) => link.followed && !link.prerequisiteHasLesson)

  const needle = search.trim().toLocaleLowerCase()
  const visible = links.filter(
    (link) =>
      (!faultsOnly || !link.followed || !link.prerequisiteHasLesson) &&
      (needle === "" ||
        [
          link.skillCode,
          link.skillName,
          link.prerequisiteCode,
          link.prerequisiteName,
          link.subjectName,
        ].some((value) => value.toLocaleLowerCase().includes(needle))),
  )

  // Grouped by the skill that depends, so a chain reads downwards: this skill
  // rests on these ones.
  type Group = { subjectName: string; name: string; links: typeof visible }
  const grouped = new Map<string, Group>()
  for (const link of visible) {
    const entry: Group = grouped.get(link.skillCode) ?? {
      subjectName: link.subjectName,
      name: link.skillName,
      links: [],
    }
    entry.links.push(link)
    grouped.set(link.skillCode, entry)
  }
  const bySubject = new Map<string, [string, Group][]>()
  for (const [code, entry] of grouped) {
    bySubject.set(entry.subjectName, [...(bySubject.get(entry.subjectName) ?? []), [code, entry]])
  }
  const sections = [...bySubject.entries()].sort(([a], [b]) => a.localeCompare(b, "mn"))

  return (
    <div className="space-y-6">
      {data.cycles.length > 0 ? (
        <Card className="border-destructive">
          <CardContent className="space-y-2 py-4 text-sm">
            <p className="font-semibold text-destructive">Тойрог холбоос</p>
            <p className="text-muted-foreground">
              Дараах чадварууд эргэлдэж байна. Нөхөх сургалт эдгээр дээр 5 давхар ухраад зогсох ч
              утгагүй санал гаргана. Өгөгдлийн сан зөвхөн «өөрөө өөр рүүгээ» заахыг хориглодог тул
              үүнийг гараар засах шаардлагатай.
            </p>
            <ul className="space-y-1">
              {data.cycles.map((cycle) => (
                <li key={cycle.join(">")} className="font-mono text-xs">
                  {cycle.join(" → ")} → {cycle[0]}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {ignored.length > 0 || deadEnds.length > 0 ? (
        <Card>
          <CardContent className="space-y-2 py-4 text-sm">
            <p className="font-semibold">Шалгах зүйлс</p>
            <ul className="space-y-1 text-muted-foreground">
              {ignored.length > 0 ? (
                <li>
                  <span className="font-medium text-foreground">{ignored.length}</span> холбоосыг
                  нөхөх сургалт дагадаггүй — «Заавал» биш эсвэл батлагдаагүй учраас. Жагсаалтад
                  харагдана, хүүхдийг хөдөлгөхгүй
                </li>
              ) : null}
              {deadEnds.length > 0 ? (
                <li>
                  <span className="font-medium text-foreground">{deadEnds.length}</span> урьдач
                  чадварт батлагдсан, вэбд бэлэн хичээл алга. Гинж тэнд тасарч, улам цааш ухарна
                </li>
              ) : null}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <SearchBox value={search} onChange={setSearch} placeholder="Чадвар, кодоор хайх…">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={faultsOnly}
            onChange={(event) => setFaultsOnly(event.target.checked)}
          />
          Зөвхөн анхаарах холбоос
        </label>
      </SearchBox>

      <p className="text-sm text-muted-foreground">
        {visible.length} холбоос
        {visible.length !== links.length ? ` (${links.length}-аас)` : ""}
      </p>

      {sections.length === 0 ? (
        <p className="py-6 text-sm text-muted-foreground">
          {links.length === 0
            ? "Урьдач нөхцөлийн холбоос алга. Нөхөх сургалт ямар ч сурагчийг хөдөлгөхгүй."
            : "Тохирох холбоос олдсонгүй."}
        </p>
      ) : (
        <div className="space-y-8">
          {sections.map(([subjectName, entries]) => (
            <section key={subjectName} className="space-y-3">
              <h2 className="flex items-baseline gap-2 border-b border-border pb-2">
                <span className="text-lg font-bold">{subjectName}</span>
                <span className="text-sm font-normal text-muted-foreground">
                  {entries.length} чадвар
                </span>
              </h2>

              <ul className="divide-y rounded-[2px] border border-border bg-card">
                {entries.map(([code, entry]) => (
                  <li key={code} className="px-4 py-3">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="font-medium">{entry.name}</span>
                      <span className="text-xs tabular-nums text-muted-foreground">{code}</span>
                      <span className="text-xs text-muted-foreground">
                        {entry.links.length} урьдач нөхцөл
                      </span>
                    </div>

                    <ul className="mt-2 space-y-2 border-l-2 border-border pl-3">
                      {entry.links.map((link) => (
                        <li key={link.dependencyCode} className="space-y-0.5 text-sm">
                          <div className="flex flex-wrap items-baseline gap-2">
                            <span className="text-muted-foreground">←</span>
                            <span>{link.prerequisiteName}</span>
                            <span className="text-xs tabular-nums text-muted-foreground">
                              {link.prerequisiteCode}
                            </span>
                            <Tag tone={link.relationType === "REQUIRED" ? "ok" : "muted"}>
                              {RELATION_LABEL[link.relationType] ?? link.relationType}
                            </Tag>
                            {link.status !== "APPROVED" ? (
                              <Tag tone="fault">
                                {STATUS_LABEL[link.status] ?? link.status}
                              </Tag>
                            ) : null}
                            {!link.followed ? <Tag tone="fault">Дагадаггүй</Tag> : null}
                            {link.followed && !link.prerequisiteHasLesson ? (
                              <Tag tone="fault">Хичээлгүй</Tag>
                            ) : null}
                          </div>
                          <p className="text-xs text-muted-foreground">{link.reason}</p>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ page -- */

/**
 * The two links that hold the content together, side by side and read-only.
 *
 * Both are invisible in the product and both are only ever written by a
 * script: a topic-to-skill map that decides what a lesson measures and which
 * pages open with it, and a prerequisite chain that decides where remediation
 * sends a child who is stuck. Neither could be inspected without SQL until
 * now, so what an import actually produced - and what it quietly failed to
 * produce - was nobody's to see.
 */
export default function AdminContentLinks() {
  const [tab, setTab] = useState("topics")
  const map = useGetSkillMap()
  const chain = useGetSkillChain()

  if (map.isLoading || chain.isLoading) return <Skeleton className="h-64 w-full" />
  if (map.isError || chain.isError || !map.data || !chain.data) {
    return <p role="alert">Агуулгын холбоог уншиж чадсангүй.</p>
  }

  const nodes = map.data.nodes
  const faultyNodes = nodes.filter((node) => faultsOf(node.skills).length > 0)
  const followed = chain.data.links.filter((link) => link.followed)

  const stats: Stat[] =
    tab === "topics"
      ? [
          { label: "Сэдэв", value: nodes.length },
          {
            label: "Холбоос",
            value: nodes.reduce((total, node) => total + node.skills.length, 0),
          },
          { label: "Сэдэвгүй чадвар", value: map.data.unmappedSkills.length },
          {
            label: "Анхаарах сэдэв",
            value: faultyNodes.length,
            hint: faultyNodes.length > 0 ? "Доор жагсаав" : "Асуудал алга",
          },
        ]
      : [
          { label: "Холбоос", value: chain.data.links.length },
          {
            label: "Дагадаг",
            value: followed.length,
            hint: "Заавал, батлагдсан",
          },
          {
            label: "Хичээлгүй урьдач",
            value: followed.filter((link) => !link.prerequisiteHasLesson).length,
          },
          {
            label: "Тойрог",
            value: chain.data.cycles.length,
            hint: chain.data.cycles.length > 0 ? "Засах шаардлагатай" : "Алга",
          },
        ]

  return (
    <div className="space-y-6 pb-10">
      <PageHeader
        title="Сэдвийн холбоо"
        description="Сэдэв, чадвар, урьдач нөхцөл хоорондоо яаж холбогдсоныг харуулна. Энэ хуудас юу ч өөрчилдөггүй."
        stats={stats}
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="topics">Сэдэв ↔ чадвар</TabsTrigger>
          <TabsTrigger value="chain">Гинжин холбоо</TabsTrigger>
        </TabsList>

        <TabsContent value="topics" className="mt-6">
          <TopicSkillTab data={map.data} />
        </TabsContent>
        <TabsContent value="chain" className="mt-6">
          <ChainTab data={chain.data} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
