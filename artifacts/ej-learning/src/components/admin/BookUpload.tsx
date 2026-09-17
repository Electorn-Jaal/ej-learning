import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  getGetAdminMaterialsQueryKey,
  useSetMaterialPageOffset,
  useUploadMaterialFile,
  type AdminMaterial,
} from '@workspace/api-client-react'
import { Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const MAX_BYTES = 64 * 1024 * 1024

const readable = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.round(bytes / 1024)} KB`

/**
 * Putting a textbook into the system, and saying where its pages really start.
 *
 * The two are separate because they are learned at different moments: the file
 * is chosen from a folder, while the offset is only discovered once somebody
 * opens the book and sees that printed page 25 is file page 37. Making the
 * offset part of the upload would mean re-sending a 4 MB scan to correct a
 * number.
 */
export function BookUpload({ material }: { material: AdminMaterial }) {
  const queryClient = useQueryClient()
  const fileInput = useRef<HTMLInputElement>(null)
  const { mutateAsync: upload, isPending: uploading } = useUploadMaterialFile()
  const { mutate: saveOffset, isPending: savingOffset } = useSetMaterialPageOffset()

  const [offset, setOffset] = useState(String(material.pageOffset))
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: getGetAdminMaterialsQueryKey() })

  const onFile = async (file: File | undefined) => {
    setError(null)
    setMessage(null)
    if (!file) return

    // Checked here so a wrong pick costs nothing; the server checks the bytes
    // themselves, which is the check that actually matters.
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setError('Зөвхөн PDF файл байршуулна.')
      return
    }
    if (file.size > MAX_BYTES) {
      setError(`Файл хэтэрхий том байна (${readable(file.size)}). Дээд хэмжээ 64 MB.`)
      return
    }

    try {
      const stored = await upload({
        materialId: material.id,
        filename: file.name,
        data: file,
      })
      setMessage(
        `${stored.filename} хадгалагдлаа — хувилбар ${stored.versionNo}, ` +
          `${readable(stored.sizeBytes)}` +
          (stored.totalPages ? `, ойролцоогоор ${stored.totalPages} хуудас` : ''),
      )
      refresh()
    } catch (cause) {
      const detail = (cause as { data?: { error?: string } })?.data?.error
      setError(detail ?? 'Байршуулж чадсангүй.')
    } finally {
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  const applyOffset = () => {
    setError(null)
    setMessage(null)
    const value = Number(offset.trim())
    if (!Number.isInteger(value)) {
      setError('Хуудасны зөрүү бүхэл тоо байх ёстой.')
      return
    }
    saveOffset(
      { materialId: material.id, data: { materialId: material.id, pageOffset: value } },
      {
        onSuccess: () => {
          setMessage(`Хуудасны зөрүү ${value} болж хадгалагдлаа.`)
          refresh()
        },
        onError: (cause) => setError(cause?.data?.error ?? 'Хадгалж чадсангүй.'),
      },
    )
  }

  return (
    <section className="space-y-4 rounded-md border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{material.title ?? material.sourceCode}</h3>
          <p className="text-xs text-muted-foreground">
            {material.hasFile
              ? `Файл байршуулсан${material.filePages ? ` · ~${material.filePages} хуудас` : ''}`
              : 'Файл байршуулаагүй'}
          </p>
        </div>

        <input
          ref={fileInput}
          type="file"
          accept="application/pdf,.pdf"
          hidden
          onChange={(event) => void onFile(event.target.files?.[0])}
        />
        <Button
          variant="outline"
          size="sm"
          disabled={uploading}
          onClick={() => fileInput.current?.click()}
        >
          <Upload className="h-4 w-4" />
          {uploading
            ? 'Байршуулж байна…'
            : material.hasFile
              ? 'Шинэ хувилбар'
              : 'PDF байршуулах'}
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-3 border-t pt-4">
        <div className="space-y-1.5">
          <Label htmlFor={`offset-${material.id}`} className="text-xs">
            Хуудасны зөрүү
          </Label>
          <Input
            id={`offset-${material.id}`}
            value={offset}
            onChange={(event) => setOffset(event.target.value)}
            inputMode="numeric"
            className="w-24"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={applyOffset}
          disabled={savingOffset || !material.hasFile}
        >
          Хадгалах
        </Button>
        <p className="min-w-0 flex-1 text-xs text-muted-foreground">
          Номон дээр «25» гэж хэвлэгдсэн хуудас PDF-ийн 37 дахь нь бол зөрүү нь{' '}
          <strong>12</strong>.
        </p>
      </div>

      {message ? (
        <p className="border-l-2 border-success py-1 pl-3 text-sm">{message}</p>
      ) : null}
      {error ? (
        <p role="alert" className="border-l-2 border-destructive py-1 pl-3 text-sm">
          {error}
        </p>
      ) : null}
    </section>
  )
}
