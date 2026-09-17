import { useGetTeacherReviewQueue } from '@workspace/api-client-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export default function TeacherReviews() {
  const {data:queue,isLoading,isError}=useGetTeacherReviewQueue();
  if(isLoading) return <Skeleton className="h-64 w-full"/>;
  if(isError || !queue) return <p role="alert">Шалгах хариултуудыг уншиж чадсангүй.</p>;
  return <div className="space-y-6 pb-10"><header><h1 className="text-2xl font-bold">Шалгах хариултууд</h1>
    <p className="text-muted-foreground mt-2">Илгээсэн оношилгооны асуулт тус бүрийн хариу. Зөвхөн харах горимд үнэлгээ хадгалахгүй.</p></header>
    <p>{queue.length} хариулт</p>
    {queue.map(item=><Card key={item.attemptId}><CardContent className="p-6 space-y-4">
      <h2 className="font-bold">{item.studentName} · {item.className}</h2>
      <p className="font-medium">{item.topic}</p><p className="text-sm text-muted-foreground">{item.skill} · Дээд оноо: {item.maxScore ?? 'Заагаагүй'}</p>
      <p className="whitespace-pre-wrap bg-muted p-4 rounded">{item.answer || 'Хоосон хариулт'}</p>
      {item.rubric.length>0 && <section><h3 className="font-semibold">Үнэлгээний рубрик</h3>{item.rubric.map((line,index)=><p key={index} className="whitespace-pre-wrap mt-2">{line}</p>)}</section>}
      <p className="text-xs text-muted-foreground">{new Date(item.submittedAt).toLocaleString('mn-MN')}</p>
    </CardContent></Card>)}
    {!queue.length && <p>Шалгах хариулт алга байна.</p>}
  </div>;
}
