import { useState } from 'react';
import { useGetTeacherCatalog } from '@workspace/api-client-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

const names = {lesson:'Хичээл',task:'Даалгавар',check:'Шалгах асуулт'};
const statuses: Record<string,string> = {DRAFT:'Ноорог',IN_REVIEW:'Хянагдаж буй',APPROVED:'Баталгаажсан',ARCHIVED:'Архивласан'};

export default function Catalog() {
  const {data:items,isLoading,isError} = useGetTeacherCatalog();
  const [kind,setKind] = useState('all');
  const [search,setSearch] = useState('');
  if (isLoading) return <Skeleton className="h-64 w-full"/>;
  if (isError || !items) return <p role="alert">Сургалтын санг уншиж чадсангүй.</p>;
  const visible=items.filter(item=>(kind==='all'||item.kind===kind) &&
    `${item.code} ${item.skill} ${item.subject} ${item.title}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  return <div className="space-y-6 pb-10">
    <header><h1 className="text-2xl font-bold">Сургалтын сан</h1>
      <p className="text-muted-foreground mt-2">Ноорог материалыг хянаж харах орчин. Эндээс материал баталгаажуулах эсвэл сурагчид оноохгүй.</p></header>
    <div className="grid grid-cols-3 gap-3">{Object.entries(names).map(([key,label])=><Card key={key}><CardContent className="p-4">
      <p className="text-sm">{label}</p><p className="text-2xl font-bold">{items.filter(item=>item.kind===key).length}</p>
    </CardContent></Card>)}</div>
    <div className="flex flex-wrap gap-3">
      <label>Төрөл <select className="border p-2 rounded bg-background" value={kind} onChange={e=>setKind(e.target.value)}>
        <option value="all">Бүгд</option>{Object.entries(names).map(([key,label])=><option key={key} value={key}>{label}</option>)}
      </select></label>
      <label className="flex-1">Хайх <input className="border p-2 rounded bg-background w-full" placeholder="Код, чадвар, хичээл…" value={search} onChange={e=>setSearch(e.target.value)}/></label>
    </div>
    <p className="text-sm text-muted-foreground">{visible.length} материал</p>
    {visible.map(item=><details key={item.id} className="border rounded-lg bg-card p-4">
      <summary className="cursor-pointer"><span className="font-semibold">{item.skill}</span> · {names[item.kind]}
        <span className="ml-2 text-sm text-muted-foreground">{statuses[item.status]??item.status}</span>
        <div className="mt-1 text-xs text-muted-foreground">{item.code} · {item.subject} · {item.gradeLevel ? `${item.gradeLevel}-р анги` : 'Анги заагаагүй'}</div>
      </summary>
      <div className="space-y-4 mt-4 border-t pt-4">
        <p className="font-medium whitespace-pre-wrap">{item.title}</p>
        <p className="text-sm text-muted-foreground">Чадвар: {item.skillCode} · {statuses[item.skillStatus]??item.skillStatus}
          {item.estimatedMinutes!==null && ` · ${item.estimatedMinutes} минут`}
          {item.maxScore!==null && ` · Дээд оноо ${item.maxScore}`}</p>
        {item.materialBlocks.map((block,index)=><section key={index}><h3 className="font-semibold">{block.title}</h3><p className="whitespace-pre-wrap mt-1 leading-relaxed">{block.body}</p></section>)}
        {item.sourceTitle && <p className="text-sm text-muted-foreground">Эх сурвалж: {item.sourceTitle}</p>}
      </div>
    </details>)}
    {!visible.length && <p>Тохирох материал олдсонгүй.</p>}
  </div>;
}
