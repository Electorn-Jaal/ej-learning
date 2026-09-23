import { useEffect, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import {
  getGetMaterialOutlineQueryKey,
  useGetAdminMaterials,
  useGetMaterialOutline,
  useSaveMaterialOutline,
  type OutlineSection,
} from "@workspace/api-client-react"
import { FileText, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PageHeader } from "@/components/ui/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { BookUpload } from "@/components/admin/BookUpload"

type Draft = {
  outlineCode: string
  printedNumber: string
  title: string
  pageFrom: string
  pageTo: string
  sequenceNo: number
  planningPeriodNo: string
}

const toDraft = (section: OutlineSection): Draft => ({
  outlineCode: section.outlineCode,
  printedNumber: section.printedNumber ?? "",
  title: section.title,
  pageFrom: section.pageFrom === null ? "" : String(section.pageFrom),
  pageTo: section.pageTo === null ? "" : String(section.pageTo),
  sequenceNo: section.sequenceNo,
  planningPeriodNo: section.planningPeriodNo === null ? "" : String(section.planningPeriodNo),
})

const toNumber = (value: string) => {
  const trimmed = value.trim()
  if (trimmed === "") return null
  const parsed = Number(trimmed)
  return Number.isInteger(parsed) ? parsed : null
}

function OutlineEditor({ materialId }: { materialId: number }) {
  const queryClient = useQueryClient()
  const { data, isLoading } = useGetMaterialOutline(materialId, {
    query: { queryKey: getGetMaterialOutlineQueryKey(materialId) },
  })
  const { mutate, isPending } = useSaveMaterialOutline()

  const [rows, setRows] = useState<Draft[]>([])
  const [offset, setOffset] = useState("0")
  const [periodCount, setPeriodCount] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  // Reload the form whenever a different book is chosen or the server answers.
  useEffect(() => {
    if (!data) return
    setRows(data.sections.map(toDraft))
    setOffset(String(data.pageOffset))
    setPeriodCount(data.planningPeriodCount === null ? "" : String(data.planningPeriodCount))
    setError(null)
    setSaved(false)
  }, [data])

  if (isLoading || !data) return <Skeleton className="h-64 w-full" />

  const update = (index: number, patch: Partial<Draft>) =>
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)))

  const add = () =>
    setRows((prev) => [
      ...prev,
      {
        outlineCode: "",
        printedNumber: "",
        title: "",
        pageFrom: "",
        pageTo: "",
        sequenceNo: Math.max(0, ...prev.map((row) => row.sequenceNo)) + 1,
        planningPeriodNo: periodCount ? "1" : "",
      },
    ])

  const save = () => {
    setError(null)
    setSaved(false)
    if (rows.some((row) => !row.outlineCode.trim() || !row.title.trim())) {
      setError("Код болон гарчиг заавал бөглөнө.")
      return
    }
    const parsedPeriodCount = toNumber(periodCount)
    if (parsedPeriodCount !== null && (parsedPeriodCount < 1 || parsedPeriodCount > 12)) {
      setError("Төлөвлөлтийн үеийн тоо 1–12 байна.")
      return
    }
    if (rows.some((row) => {
      const period = toNumber(row.planningPeriodNo)
      return period !== null && (parsedPeriodCount === null || period > parsedPeriodCount)
    })) {
      setError("Сэдвийн үе нийт төлөвлөлтийн үеийн хүрээнд байх ёстой.")
      return
    }
    mutate(
      {
        materialId,
        data: {
          pageOffset: Number(offset) || 0,
          planningPeriodCount: parsedPeriodCount,
          sections: rows.map((row) => ({
            outlineCode: row.outlineCode.trim(),
            printedNumber: row.printedNumber.trim() || null,
            title: row.title.trim(),
            pageFrom: toNumber(row.pageFrom),
            pageTo: toNumber(row.pageTo),
            sequenceNo: row.sequenceNo,
            planningPeriodNo: toNumber(row.planningPeriodNo),
          })),
        },
      },
      {
        onSuccess: () => {
          setSaved(true)
          queryClient.invalidateQueries({
            queryKey: getGetMaterialOutlineQueryKey(materialId),
          })
        },
        onError: (cause) => setError(cause?.data?.error ?? "Хадгалж чадсангүй."),
      },
    )
  }

  const offsetNumber = Number(offset) || 0
  const sample = rows.find((row) => toNumber(row.pageFrom) !== null)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{data.title}</CardTitle>
        <p className="text-sm text-muted-foreground">
          Бүтцийг гараар оруулсан. Хуудасны дугаар буруу бол энд засна.
        </p>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-end gap-4 border-b pb-4">
          <div className="space-y-1.5">
            <Label htmlFor="offset">Хуудасны офсет</Label>
            <Input
              id="offset"
              type="number"
              min={0}
              className="w-28"
              value={offset}
              onChange={(event) => setOffset(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="period-count">Төлөвлөлтийн үе</Label>
            <Input
              id="period-count"
              type="number"
              min={1}
              max={12}
              className="w-32"
              value={periodCount}
              onChange={(event) => setPeriodCount(event.target.value)}
              placeholder="3 эсвэл 4"
            />
          </div>
          <p className="pb-2 text-xs text-muted-foreground">
            Файл {data.filePages ?? "?"} хуудастай. Хавтас, гарчиг зэрэг номын
            дугаарлалтад ороогүй хуудсыг тооцно.
            {sample ? (
              <>
                {" "}Жишээ: номын {toNumber(sample.pageFrom)}-р хуудас →{" "}
                <strong>файлын {(toNumber(sample.pageFrom) ?? 0) + offsetNumber}</strong>.
              </>
            ) : null}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="w-14 py-2 pr-2 font-medium">№</th>
                <th className="w-28 py-2 pr-2 font-medium sm:w-36">Код</th>
                <th className="w-20 py-2 pr-2 font-medium">Дугаар</th>
                <th className="py-2 pr-2 font-medium">Гарчиг</th>
                <th className="w-20 py-2 pr-2 font-medium">Эхлэх</th>
                <th className="w-20 py-2 pr-2 font-medium">Дуусах</th>
                <th className="w-24 py-2 font-medium">Хичээл</th>
                <th className="w-20 py-2 pl-2 font-medium">Үе</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const used = data.sections.find(
                  (section) => section.outlineCode === row.outlineCode,
                )?.usedByLessons
                return (
                  <tr key={index} className="border-b last:border-0">
                    <td className="py-1.5 pr-2">
                      <Input
                        type="number"
                        min={1}
                        value={row.sequenceNo}
                        onChange={(event) =>
                          update(index, { sequenceNo: Number(event.target.value) || 1 })
                        }
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <Input
                        value={row.outlineCode}
                        onChange={(event) => update(index, { outlineCode: event.target.value })}
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <Input
                        value={row.printedNumber}
                        onChange={(event) =>
                          update(index, { printedNumber: event.target.value })
                        }
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <Input
                        value={row.title}
                        onChange={(event) => update(index, { title: event.target.value })}
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <Input
                        type="number"
                        min={1}
                        value={row.pageFrom}
                        onChange={(event) => update(index, { pageFrom: event.target.value })}
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <Input
                        type="number"
                        min={1}
                        value={row.pageTo}
                        onChange={(event) => update(index, { pageTo: event.target.value })}
                      />
                    </td>
                    <td className="py-1.5 text-xs text-muted-foreground">
                      {used ? `${used} хичээл` : "—"}
                    </td>
                    <td className="py-1.5 pl-2">
                      <Input
                        type="number"
                        min={1}
                        max={toNumber(periodCount) ?? 12}
                        value={row.planningPeriodNo}
                        onChange={(event) =>
                          update(index, { planningPeriodNo: event.target.value })
                        }
                        aria-label={`${row.title} төлөвлөлтийн үе`}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t pt-4">
          <Button onClick={save} disabled={isPending}>
            {isPending ? "Хадгалж байна…" : "Хадгалах"}
          </Button>
          <Button variant="outline" onClick={add}>
            <Plus className="h-4 w-4" />
            Бүлэг нэмэх
          </Button>
          {error ? (
            <p role="alert" className="border-l-2 border-destructive py-1 pl-3 text-sm">
              {error}
            </p>
          ) : null}
          {saved ? (
            <p role="status" className="border-l-2 border-success py-1 pl-3 text-sm">
              Хадгалагдлаа. Хичээлүүдийн хуудасны муж шинэчлэгдсэн.
            </p>
          ) : null}
        </div>

        <p className="text-xs text-muted-foreground">
          Бүлэг устгах боломж энд байхгүй. Бүлэг нь агуулга, хичээлтэй холбогдсон
          байж болох тул устгахад тэдгээр нь хоосон зүйл рүү заана.
        </p>
      </CardContent>
    </Card>
  )
}

export default function AdminBooks() {
  const { data: materials, isLoading } = useGetAdminMaterials()
  const [selected, setSelected] = useState<number | null>(null)

  if (isLoading) return <Skeleton className="h-64 w-full" />
  if (!materials?.length) {
    return <p className="text-sm text-muted-foreground">Материал алга.</p>
  }

  const withFile = materials.filter((material) => material.hasFile)
  const current = selected ?? withFile[0]?.id ?? materials[0].id

  return (
    <div className="space-y-6 pb-10">
      <PageHeader
        title="Ном ба сэдэв"
        description="Хичээл бүрийн ном, номын сэдэв, хуудасны мужийг тохируулна."
        stats={[
          { label: "Материал", value: materials.length },
          { label: "Файлтай", value: withFile.length },
          {
            label: "Бүлэг",
            value: materials.reduce((total, material) => total + material.sectionCount, 0),
          },
        ]}
      />

      <ul className="divide-y rounded-[2px] border border-border bg-card">
        {materials.map((material) => (
          <li key={material.id}>
            <button
              type="button"
              onClick={() => setSelected(material.id)}
              className={cn(
                "flex w-full flex-wrap items-center gap-3 border-l-2 px-4 py-3 text-left transition-colors",
                material.id === current
                  ? "border-primary bg-secondary"
                  : "border-transparent hover:bg-secondary/50",
              )}
            >
              <FileText
                className={cn(
                  "h-4 w-4 shrink-0",
                  material.hasFile ? "text-primary" : "text-muted-foreground/40",
                )}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {material.title ?? material.sourceCode}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {material.subjectName} · {material.sectionCount} бүлэг
                  {material.hasFile ? ` · ${material.filePages ?? "?"} хуудас` : " · файлгүй"}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      {materials.find((material) => material.id === current) ? (
        <BookUpload material={materials.find((material) => material.id === current)!} />
      ) : null}

      <OutlineEditor materialId={current} />
    </div>
  )
}
