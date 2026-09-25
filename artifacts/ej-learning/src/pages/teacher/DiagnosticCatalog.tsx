import { useState } from 'react'
import { useGetDiagnosticCatalog, useSetDiagnosticItemTargets, useCreateDiagnosticResource,
  type DiagnosticTarget, type DiagnosticResourceInput } from '@workspace/api-client-react'
import { Button } from '@/components/ui/button'
import { NATIVE_INPUT, NATIVE_SELECT } from '@/components/ui/native-select'
import { hasRole, useSession } from '@/lib/session'

const kinds = { CORE: 'Үндсэн материал', SUPPLEMENT: 'Нэмэлт материал', EXERCISE: 'Дасгал', QUESTION: 'Асуулт' }

function TargetPicker({targets,selected,onChange}:{targets:DiagnosticTarget[];selected:number[];onChange:(ids:number[])=>void}) {
  return <div className="max-h-56 space-y-1 overflow-auto rounded border p-2">
    {targets.length===0 && <p>Батлагдсан сэдэв–чадварын холбоос алга.</p>}
    {targets.map(t=><label key={t.mapId} className="flex items-start gap-2 text-sm">
      <input type="checkbox" checked={selected.includes(t.mapId)} onChange={e=>onChange(e.target.checked?[...selected,t.mapId]:selected.filter(id=>id!==t.mapId))}/>
      <span>{t.topicName} → {t.skillName}</span>
    </label>)}
  </div>
}

export default function DiagnosticCatalog({classId,subjectId,onBack}:{classId:number;subjectId:number;onBack:()=>void}) {
  const {user}=useSession()
  const admin=hasRole(user,'ADMIN')
  const query=useGetDiagnosticCatalog({classId,subjectId})
  const mapping=useSetDiagnosticItemTargets()
  const create=useCreateDiagnosticResource()
  const [itemId,setItemId]=useState('')
  const [itemTargets,setItemTargets]=useState<number[]>([])
  const [title,setTitle]=useState('')
  const [instructions,setInstructions]=useState('')
  const [kind,setKind]=useState<DiagnosticResourceInput['kind']>('SUPPLEMENT')
  const [source,setSource]=useState('')
  const [reference,setReference]=useState('')
  const [resourceTargets,setResourceTargets]=useState<number[]>([])
  const [message,setMessage]=useState('')
  const data=query.data
  if(query.isLoading) return <p>Холбоосуудыг ачаалж байна…</p>
  if(!data) return <div role="alert">Холбоосуудыг ачаалж чадсангүй. <Button onClick={onBack}>Буцах</Button></div>
  const refresh=()=>{void query.refetch()}
  return <div className="space-y-5">
    <Button variant="outline" onClick={onBack}>Шалгалт руу буцах</Button>
    <h2 className="text-lg font-semibold">Оношлогооны асуулт ба сурах материал</h2>
    <p className="text-sm text-muted-foreground">Асуулт болон материалын холбоос бүр сэдэв, тодорхой чадварын хос байна. Зөвхөн сэдэв ижил байх нь хангалтгүй.</p>
    {!admin && <p className="text-sm">Сангийн холбоосыг админ бүртгэнэ. Сурагчийн төлөвлөгөөнд багш өөрийн ажил нэмж болно.</p>}
    <section className="space-y-3 rounded border bg-card p-4">
      <h3 className="font-semibold">Асуултын холбоос</h3>
      <select aria-label="Холбох асуулт" className={NATIVE_SELECT} value={itemId} onChange={e=>{
        setItemId(e.target.value);setItemTargets(data.items.find(i=>i.id===Number(e.target.value))?.mapIds??[]);setMessage('')
      }}><option value="">Асуулт сонгох</option>{data.items.map(i=><option key={i.id} value={i.id}>{i.title} ({i.mapIds.length} холбоос)</option>)}</select>
      {itemId && (admin ? <>
        <TargetPicker targets={data.targets} selected={itemTargets} onChange={setItemTargets}/>
        <Button disabled={mapping.isPending} onClick={()=>mapping.mutate({itemId:Number(itemId),data:{mapIds:itemTargets}},{onSuccess:()=>{refresh();setMessage('Асуултын холбоос хадгалагдлаа.')}})}>Холбоос хадгалах</Button>
      </> : <ul>{data.targets.filter(t=>itemTargets.includes(t.mapId)).map(t=><li key={t.mapId}>{t.topicName} → {t.skillName}</li>)}</ul>)}
      {mapping.error && <p role="alert" className="text-destructive">{mapping.error.data?.error ?? 'Холбоос хадгалж чадсангүй.'}</p>}
    </section>
    {admin && <section className="space-y-3 rounded border bg-card p-4">
      <h3 className="font-semibold">Материал, дасгал, асуулт нэмэх</h3>
      <input aria-label="Материалын нэр" className={NATIVE_INPUT} placeholder="Нэр" maxLength={500} value={title} onChange={e=>setTitle(e.target.value)}/>
      <select aria-label="Материалын төрөл" className={NATIVE_SELECT} value={kind} onChange={e=>setKind(e.target.value as typeof kind)}>{Object.entries(kinds).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select>
      <select aria-label="Эх ном" className={NATIVE_SELECT} value={source} onChange={e=>setSource(e.target.value)}><option value="">Тусдаа дасгал / номгүй материал</option>{data.sources.map(s=><option key={s.id} value={s.id}>{s.title}</option>)}</select>
      <input aria-label="Бүлэг хуудас дасгалын заалт" className={NATIVE_INPUT} placeholder="Бүлэг, хуудас, дасгалын дугаар" value={reference} maxLength={500} onChange={e=>setReference(e.target.value)}/>
      <textarea aria-label="Судлах заавар эсвэл асуулт" className="min-h-28 w-full rounded border bg-background p-2" placeholder="Сурагч юу уншиж, ямар дасгал хийх вэ? Эсвэл асуултаа бүрэн бичнэ үү." maxLength={10000} value={instructions} onChange={e=>setInstructions(e.target.value)}/>
      <TargetPicker targets={data.targets} selected={resourceTargets} onChange={setResourceTargets}/>
      <Button disabled={create.isPending||!title.trim()||!instructions.trim()||!resourceTargets.length} onClick={()=>create.mutate({data:{title,kind,instructions,mapIds:resourceTargets,sourceMaterialId:source?Number(source):null,reference:reference||null}},{onSuccess:()=>{setTitle('');setInstructions('');setReference('');setResourceTargets([]);refresh();setMessage('Материал хадгалагдлаа.')}})}>Материал хадгалах</Button>
      {create.error && <p role="alert" className="text-destructive">{create.error.data?.error??'Материал хадгалж чадсангүй.'}</p>}
    </section>}
    {message && <p role="status">{message}</p>}
    <section className="space-y-3"><h3 className="font-semibold">Сурах материалын сан ({data.resources.length})</h3>
      {data.resources.length===0 && <p>Материалын холбоос бүртгэгдээгүй байна.</p>}
      {data.resources.map(r=><article key={r.id} className="space-y-1 rounded border bg-card p-3">
        <p className="font-medium">{r.title} <span className="text-xs text-muted-foreground">{kinds[r.kind]}</span></p>
        <p className="text-sm">{r.sourceTitle} {r.reference}</p><p className="whitespace-pre-wrap text-sm">{r.instructions}</p>
        <ul className="text-xs text-muted-foreground">{data.targets.filter(t=>r.mapIds.includes(t.mapId)).map(t=><li key={t.mapId}>{t.topicName} → {t.skillName}</li>)}</ul>
      </article>)}
    </section>
  </div>
}
