import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useGetTimetableStudents, useSetTimetableStudents } from '@workspace/api-client-react'
import { Button } from '@/components/ui/button'

export function TimetableStudents({ slotId }: { slotId: number }) {
  const [open, setOpen] = useState(false)
  return <div>
    <Button size="sm" variant="outline" onClick={() => setOpen(!open)}>Бүлгийн сурагчид</Button>
    {open ? <Roster slotId={slotId} onClose={() => setOpen(false)} /> : null}
  </div>
}

function Roster({ slotId, onClose }: { slotId: number; onClose: () => void }) {
  const queryClient = useQueryClient()
  const { data, isLoading, isError } = useGetTimetableStudents(slotId)
  const { mutate, isPending, error } = useSetTimetableStudents()
  const [selected, setSelected] = useState<number[]>([])
  useEffect(() => { setSelected(data?.students.filter((s) => s.selected).map((s) => s.id) ?? []) }, [data])
  if (isLoading) return <p role="status">Сурагчдыг уншиж байна…</p>
  if (isError || !data) return <p role="alert">Сурагчдыг уншиж чадсангүй.</p>
  return <div className="mt-2 space-y-2 rounded border p-3">
    <p className="text-xs text-muted-foreground">Энэ долоо хоногийн давтагдах цагт хамрагдах сурагчдыг сонгоно уу.</p>
    {!data.assigned ? <p className="text-xs">Бүлэг хараахан бүртгээгүй байна.</p> : null}
    <div className="max-h-56 space-y-1 overflow-auto">
      {data.students.map((student) => <label key={student.id} className="flex items-center gap-2 text-sm">
        <input type="checkbox" disabled={isPending} checked={selected.includes(student.id)}
          onChange={(e) => setSelected(e.target.checked ? [...selected, student.id] : selected.filter((id) => id !== student.id))} />
        {student.name}
      </label>)}
    </div>
    {error ? <p role="alert" className="text-sm text-destructive">Хадгалж чадсангүй. Сурагчдын бүртгэл болон өөрчлөх эрхээ шалгана уу.</p> : null}
    <Button size="sm" disabled={isPending} onClick={() => mutate({ slotId, data: { studentIds: selected } }, {
      onSuccess: async () => { await queryClient.invalidateQueries(); onClose() },
    })}>{isPending ? 'Хадгалж байна…' : `Хадгалах (${selected.length})`}</Button>
  </div>
}
