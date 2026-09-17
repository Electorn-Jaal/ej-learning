import { useGetStudentSubjects } from '@workspace/api-client-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export default function StudentSubjects() {
  const {data,isLoading,isError}=useGetStudentSubjects();
  if(isLoading) return <Skeleton className="h-48 w-full"/>;
  if(isError || !data) return <p role="alert">Хичээлийн мэдээллийг уншиж чадсангүй.</p>;
  return <div className="space-y-6">
    <header><h1 className="text-2xl font-bold">Миний хичээлүүд</h1><p className="text-muted-foreground mt-2">Хадгалагдсан чадварын үнэлгээтэй хичээлүүд.</p></header>
    <div className="grid sm:grid-cols-2 gap-4">{data.map(subject=><Card key={subject.code}><CardContent className="p-6 space-y-3">
      <h2 className="text-lg font-bold">{subject.name}</h2>
      <p>Үнэлэгдсэн чадвар: {subject.assessedSkills}</p><p>Эзэмшсэн чадвар: {subject.masteredSkills}</p>
      <p className="text-sm text-muted-foreground">Унших боломжтой баталгаажсан хичээл: {subject.approvedLessons}</p>
    </CardContent></Card>)}</div>
    {!data.length && <p>Энэ сурагчид хадгалагдсан хичээлийн үнэлгээ алга.</p>}
  </div>;
}
