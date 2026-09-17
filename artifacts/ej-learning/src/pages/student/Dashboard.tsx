import { useGetStudentDashboard } from '@workspace/api-client-react';
import { Link } from 'wouter';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export default function StudentDashboard() {
  const {data, isLoading, isError}=useGetStudentDashboard();
  if(isLoading) return <Skeleton className="h-64 w-full"/>;
  if(isError || !data) return <p role="alert">Сургалтын мэдээлэл уншихад алдаа гарлаа.</p>;
  return <div className="space-y-6 pb-10">
    <header><h1 className="text-2xl font-bold">Сургалтын тойм</h1><p className="text-muted-foreground mt-1">{data.displayName} · {data.dateLabel}</p></header>
    <p className="text-sm rounded border bg-muted/40 p-4">{data.dataNotice}</p>
    <div className="flex gap-4 text-primary"><Link href="/progress" className="underline">Хадгалагдсан ахиц</Link><Link href="/subjects" className="underline">Хичээлүүд</Link></div>
    <h2 className="text-lg font-bold">Баталгаажсан хичээлүүд</h2>
    {data.activities.length===0 ? <div className="border rounded p-6 text-muted-foreground">Одоогоор таны ангид тохирох баталгаажсан хичээл алга. Ноорог материал сурагчид харагдахгүй.</div> : data.activities.map(item=><Card key={item.id}><CardContent className="p-5 space-y-2">
      <p className="text-xs text-muted-foreground">{item.subject}</p><h3 className="font-bold">{item.topic}</h3><p>{item.goal}</p>
      {item.estimatedMinutes>0 && <p className="text-sm text-muted-foreground">Төлөвлөсөн хугацаа: {item.estimatedMinutes} минут</p>}
      <Link className="inline-block underline text-primary" href={item.actionPath}>Унших</Link>
    </CardContent></Card>)}
  </div>;
}
