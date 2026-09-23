import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import {
  getGetTeacherClassTopicsQueryKey,
  useGetTeacherClassTopics,
  useGetTeacherOutlineChoices,
  useSetClassTopic,
} from "@workspace/api-client-react"
import type { ClassTopic } from "@workspace/api-client-react"
import { BookOpen, Check, Users } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { PageHeader } from "@/components/ui/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

const ROMAN = ["", "I", "II", "III", "IV"]

const periodLabel = (periodNo: number | null) =>
  periodNo ? `${ROMAN[periodNo] ?? periodNo} улирал` : null

const pageRange = (from: number | null, to: number | null) =>
  from && to ? (from === to ? `${from}-р хуудас` : `${from}–${to}-р хуудас`) : null

/** Book order, so one subject's classes read as one block. */
function bySubject(rows: ClassTopic[]) {
  const groups: { code: string; name: string; rows: ClassTopic[] }[] = []
  for (const row of rows) {
    const found = groups.find((group) => group.code === row.subjectCode)
    if (found) found.rows.push(row)
    else groups.push({ code: row.subjectCode, name: row.subjectName, rows: [row] })
  }
  return groups.sort((a, b) => b.rows.length - a.rows.length)
}

/**
 * The picker for one class and subject, opened from its row.
 *
 * Fetched only when opened: a book runs to seventy-odd sections and a teacher
 * looks at one class at a time, so loading every book's outline to render a
 * closed list would be most of the page's weight for none of its use.
 */
function SectionPicker({ row, onClose }: { row: ClassTopic; onClose: () => void }) {
  const queryClient = useQueryClient()
  const { data, isLoading, isError } = useGetTeacherOutlineChoices(row.classId, row.subjectCode)
  const setTopic = useSetClassTopic({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetTeacherClassTopicsQueryKey() })
        onClose()
      },
    },
  })

  const choose = (outlineNodeId: string | null) =>
    setTopic.mutate({
      data: { classId: row.classId, subjectCode: row.subjectCode, outlineNodeId },
    })

  return (
    <div className="space-y-2 border-t bg-muted/30 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {row.className} · сэдэв сонгох
        </p>
        <div className="flex gap-1.5">
          {row.nodeId ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={setTopic.isPending}
              onClick={() => choose(null)}
            >
              Арилгах
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" onClick={onClose}>
            Хаах
          </Button>
        </div>
      </div>

      {setTopic.isError ? (
        <p role="alert" className="text-xs text-destructive">
          Сэдвийг хадгалж чадсангүй.
        </p>
      ) : null}

      {isLoading ? <Skeleton className="h-40 w-full" /> : null}
      {isError ? (
        <p role="alert" className="text-xs text-destructive">
          Номын сэдвийг уншиж чадсангүй.
        </p>
      ) : null}

      {data ? (
        <ul className="max-h-80 divide-y overflow-y-auto rounded-[2px] border border-border bg-card">
          {data.map((section) => {
            const pages = pageRange(section.pageFrom, section.pageTo)
            const period = periodLabel(section.periodNo)
            return (
              <li key={section.nodeId}>
                <button
                  type="button"
                  disabled={setTopic.isPending}
                  onClick={() => choose(section.nodeId)}
                  className={cn(
                    "flex w-full items-start gap-2.5 px-3 py-1.5 text-left hover:bg-sidebar-active",
                    section.isCurrent && "bg-sidebar-active",
                  )}
                >
                  <span className="w-4 shrink-0 pt-0.5">
                    {section.isCurrent ? <Check className="h-3.5 w-3.5" /> : null}
                  </span>
                  <span className="min-w-0 flex-1 text-xs leading-snug">
                    <span className={cn(section.isCurrent && "font-semibold")}>
                      {section.printedNumber ? `${section.printedNumber}. ` : ""}
                      {section.title}
                    </span>
                    {pages || period ? (
                      <span className="block text-[11px] text-muted-foreground">
                        {[period, pages].filter(Boolean).join(" · ")}
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}

function TopicRow({ row }: { row: ClassTopic }) {
  const [open, setOpen] = useState(false)
  const details = [
    periodLabel(row.periodNo),
    pageRange(row.pageFrom, row.pageTo),
    row.effectiveOn ? `${row.effectiveOn}-ээс` : null,
    // Who moved it last. On a subject-based right this is the whole point:
    // three maths teachers share one pointer, and the name is what turns
    // "it changed" into "Б.Гансүх changed it".
    row.setByName ? `${row.setByName} заасан` : null,
  ].filter(Boolean)

  return (
    <li>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
        <span className="w-16 shrink-0 text-sm font-semibold">{row.className}</span>

        <span className="min-w-0 flex-1">
          {row.nodeId ? (
            <span className="block truncate text-xs">
              {row.printedNumber ? `${row.printedNumber}. ` : ""}
              {row.topicTitle}
            </span>
          ) : (
            <span className="block text-xs text-muted-foreground">
              {row.materialId
                ? `Сэдэв заагаагүй · номд ${row.sectionCount} сэдэв`
                : "Үндсэн ном холбогдоогүй"}
            </span>
          )}
          {details.length ? (
            <span className="block truncate text-[11px] text-muted-foreground">
              {details.join(" · ")}
            </span>
          ) : null}
        </span>

        {row.canEdit && row.materialId ? (
          <Button size="sm" onClick={() => setOpen((value) => !value)}>
            {row.nodeId ? "Өөрчлөх" : "Сэдэв заах"}
          </Button>
        ) : (
          <Badge variant="outline" className="shrink-0 text-[10px] font-normal">
            {row.materialId ? "Зөвхөн харах" : "Ном алга"}
          </Badge>
        )}
      </div>

      {open ? <SectionPicker row={row} onClose={() => setOpen(false)} /> : null}
    </li>
  )
}

/**
 * Where each class has reached in its core book.
 *
 * The one screen that writes learning.class_topics. Nothing computes this
 * pointer from the term calendar on a teacher's behalf: a class that spent a
 * fortnight on one section is where the teacher says it is, and the children's
 * own pages read exactly what is set here.
 *
 * Grouped by subject rather than by class, because for most teachers here the
 * subject IS the scope. No class assignment has arrived, so the server admits
 * them by their registered specialty, which means a maths teacher gets all
 * fourteen maths classes and a Mongolian teacher gets two stacks - монгол хэл
 * and уран зохиол. A flat list of twenty-three cards would bury that shape;
 * two headed blocks state it.
 */
export default function ClassTopics() {
  const { data, isLoading, isError } = useGetTeacherClassTopics()

  if (isLoading) return <Skeleton className="h-64 w-full" />
  if (isError || !data) return <p role="alert">Ангийн сэдвийг уншиж чадсангүй.</p>

  const groups = bySubject(data)
  const unset = data.filter((row) => row.materialId && !row.nodeId).length
  // Shared standing: the right to write comes from the specialty, not from an
  // assignment naming this teacher for this class.
  const shared = data.filter((row) => row.editBasis === "SUBJECT")

  return (
    <div className="space-y-4">
      <PageHeader
        title="Ангийн сэдэв"
        description="Анги бүр үндсэн номынхоо аль сэдэв дээр явж байгааг заана. Сурагчид үүнийг шууд харна."
      />

      {shared.length > 0 ? (
        <p className="flex items-start gap-2 rounded-[2px] border border-dashed p-2 text-xs text-muted-foreground">
          <Users className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Танд тодорхой анги албан ёсоор томилогдоогүй байна. Одоогоор мэргэжлээрээ{" "}
            {[...new Set(shared.map((row) => row.subjectName))].join(", ")} хичээлийн бүх
            ангийг харж, сэдэв заах боломжтой. Ижил хичээлийн бусад багш мөн адил тул хэн
            сүүлд заасныг мөр бүрт харууллаа.
          </span>
        </p>
      ) : null}

      {unset > 0 ? (
        <p className="rounded-[2px] border border-dashed p-2 text-xs text-muted-foreground">
          Номтой боловч сэдэв заагаагүй {unset} мөр байна. Заагаагүй үед сурагчид зөвхөн
          тухайн улирлын хамрах хүрээг харна.
        </p>
      ) : null}

      {groups.map((group) => (
        <Card key={group.code}>
          <CardContent className="p-0">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b px-3 py-2">
              <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <BookOpen className="h-3.5 w-3.5" />
                {group.name}
              </h2>
              <p className="text-[11px] text-muted-foreground">
                {group.rows.length} анги ·{" "}
                {group.rows.filter((row) => row.nodeId).length} сэдэв заасан
              </p>
            </div>
            <ul className="divide-y">
              {group.rows.map((row) => (
                <TopicRow key={`${row.classId}:${row.subjectCode}`} row={row} />
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}

      {!data.length ? (
        // Two different absences, and a teacher needs to know which one they
        // are looking at: nothing recorded about them, or nothing to record.
        <p className="py-6 text-sm text-muted-foreground">
          Танд харах анги алга байна. Бага ангийн багш нар бүх хичээл заадаг тул
          мэргэжлээр нь ялгах боломжгүй — анги хариуцуулах мэдээлэл ирсний дараа энэ
          хуудас ажиллана.
        </p>
      ) : null}
    </div>
  )
}
