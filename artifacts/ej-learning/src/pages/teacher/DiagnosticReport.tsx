import { useState } from 'react'
import { useGetDiagnosticReport,useSaveDiagnosticReview,type DiagnosticReport as Report,type DiagnosticPlanEntry } from '@workspace/api-client-react'
import { Button } from '@/components/ui/button'
import { NATIVE_INPUT } from '@/components/ui/native-select'

export default function DiagnosticReport({attemptId,onBack}:{attemptId:number;onBack:()=>void}) {
  const query=useGetDiagnosticReport(attemptId)
  if(query.isLoading) return <p>Оношлогооны үр дүнг ачаалж байна…</p>
  if(!query.data) return <div role="alert">Үр дүнг ачаалж чадсангүй. <Button onClick={onBack}>Буцах</Button></div>
  return <Editor key={`${attemptId}:${query.data.revision}`} report={query.data} onBack={onBack} onSaved={()=>{void query.refetch()}}/>
}

function Editor({report,onBack,onSaved}:{report:Report;onBack:()=>void;onSaved:()=>void}) {
  const [entries,setEntries]=useState<DiagnosticPlanEntry[]>(report.entries)
  const [note,setNote]=useState(report.note)
  const [dirty,setDirty]=useState(false)
  const save=useSaveDiagnosticReview()
  const targets=[...new Map(report.evidence.flatMap(e=>e.targets).map(t=>[t.mapId,t])).values()]
  const update=(index:number,patch:Partial<DiagnosticPlanEntry>)=>{setDirty(true);setEntries(rows=>rows.map((r,i)=>i===index?{...r,...patch}:r))}
  return <div className="space-y-5">
    <Button variant="outline" disabled={dirty||save.isPending} onClick={onBack}>Шалгалт руу буцах</Button>
    {dirty && <p className="text-sm">Хадгалаагүй өөрчлөлт байна. <button className="underline" onClick={()=>{setEntries(report.entries);setNote(report.note);setDirty(false)}}>Өөрчлөлтийг болих</button></p>}
    <h2 className="text-lg font-semibold">{report.studentName} — {report.title}</h2>
    <p className="text-sm text-muted-foreground">Асуулт бүрийн нотолгоог хянаж, шаардлагатай чадварт сурах ажил сонгоно. Олон чадвартай асуултын оноо аль чадварт алдсаныг дангаар тогтоохгүй.</p>
    <section className="space-y-3"><h3 className="font-semibold">Асуулт бүрийн үр дүн</h3>
      {report.evidence.map(e=><article key={e.itemId} className="rounded border bg-card p-3 text-sm">
        <p className="font-medium">{e.title} — {e.awarded}/{e.maxScore}</p>
        {!e.targets.length && <p className="text-destructive">Сэдэв–чадварын холбоос дутуу. Таамгаар дүгнэхгүй.</p>}
        {new Set(e.targets.map(t=>t.skillId)).size>1 && <p className="text-muted-foreground">Олон чадвар: багшийн нэмэлт хяналт шаардлагатай.</p>}
        <ul>{e.targets.map(t=><li key={t.mapId}>{t.topicName} → {t.skillName}</li>)}</ul>
      </article>)}
    </section>
    <section className="space-y-4"><h3 className="font-semibold">Чадварт тохирох материал</h3>
      {targets.map(t=>{
        const candidates=report.resources.filter(r=>r.mapIds.includes(t.mapId))
        return <article key={t.mapId} className="space-y-2 rounded border bg-card p-3">
          <p className="font-medium">{t.topicName} → {t.skillName}</p>
          {!candidates.length && <p className="text-sm text-muted-foreground">Энэ сэдэв–чадварт тохирох материал бүртгэгдээгүй.</p>}
          {candidates.map(r=><div key={r.id} className="flex flex-wrap items-start justify-between gap-2 border-t pt-2">
            <div className="min-w-0 flex-1 text-sm"><p>{r.title} · {r.kind==='CORE'?'Үндсэн':'Нэмэлт'}</p><p>{r.sourceTitle} {r.reference}</p><p className="whitespace-pre-wrap text-muted-foreground">{r.instructions}</p></div>
            <Button variant="outline" size="sm" disabled={entries.some(e=>e.mapId===t.mapId&&e.resourceId===r.id)} onClick={()=>{setDirty(true);setEntries([...entries,{mapId:t.mapId,resourceId:r.id,title:r.title,instructions:[r.sourceTitle,r.reference,r.instructions].filter(Boolean).join('\n')}])}}>Төлөвлөгөөнд нэмэх</Button>
          </div>)}
          <Button size="sm" variant="outline" onClick={()=>{setDirty(true);setEntries([...entries,{mapId:t.mapId,resourceId:null,title:'',instructions:''}])}}>Өөрийн ажил нэмэх</Button>
        </article>
      })}
    </section>
    <section className="space-y-3"><h3 className="font-semibold">Багшийн төлөвлөгөө</h3>
      {!entries.length && <p className="text-sm">Дээрх материалаас сонгох эсвэл өөрийн ажил нэмнэ үү.</p>}
      {entries.map((entry,index)=><article key={index} className="space-y-2 rounded border bg-card p-3">
        <p className="text-sm">{targets.find(t=>t.mapId===entry.mapId)?.topicName} → {targets.find(t=>t.mapId===entry.mapId)?.skillName}</p>
        <input className={NATIVE_INPUT} aria-label={`Ажил ${index+1} нэр`} maxLength={500} value={entry.title} onChange={e=>update(index,{title:e.target.value})}/>
        <textarea className="min-h-24 w-full rounded border bg-background p-2" aria-label={`Ажил ${index+1} заавар`} maxLength={10000} value={entry.instructions} onChange={e=>update(index,{instructions:e.target.value})}/>
        <Button size="sm" variant="outline" onClick={()=>{setDirty(true);setEntries(entries.filter((_,i)=>i!==index))}}>Жагсаалтаас хасах</Button>
      </article>)}
      <textarea className="min-h-24 w-full rounded border bg-background p-2" aria-label="Багшийн дүгнэлт" placeholder="Багшийн дүгнэлт, сонголтын тайлбар" maxLength={10000} value={note} onChange={e=>{setDirty(true);setNote(e.target.value)}}/>
      <Button disabled={save.isPending||entries.some(e=>!e.title.trim()||!e.instructions.trim())} onClick={()=>save.mutate({attemptId:report.attemptId,data:{revision:report.revision,entries,note}},{onSuccess:()=>{setDirty(false);onSaved()}})}>{save.isPending?'Хадгалж байна…':'Багшийн ноорог хадгалах'}</Button>
      {report.updatedAt && <p className="text-xs text-muted-foreground">Хадгалсан: {new Date(report.updatedAt).toLocaleString('mn-MN',{timeZone:'Asia/Ulaanbaatar'})}</p>}
      {save.error && <p role="alert" className="text-destructive">{save.error.data?.error??'Хадгалж чадсангүй.'}</p>}
    </section>
  </div>
}
