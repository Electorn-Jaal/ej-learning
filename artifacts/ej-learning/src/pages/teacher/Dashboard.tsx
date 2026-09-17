import { useGetTeacherDashboard, useGetTeacherClasses } from "@workspace/api-client-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Users, BookOpen, CheckSquare, Settings } from "lucide-react"

export default function TeacherDashboard() {
  const { data: dashboard, isLoading: dashLoading } = useGetTeacherDashboard()
  const { data: classes, isLoading: classesLoading } = useGetTeacherClasses()

  if (dashLoading || classesLoading) {
     return <div className="space-y-4"><Skeleton className="h-32 w-full" /><Skeleton className="h-64 w-full" /></div>
  }

  if (!dashboard || !classes) return <p role="alert">Ангийн мэдээллийг уншиж чадсангүй.</p>

  return (
    <div className="space-y-8 pb-10 animate-in fade-in duration-500">
      <header>
        <h1 className="text-2xl font-bold text-foreground mb-1">{dashboard.teacherName}</h1>
        <p className="text-muted-foreground font-medium">Ерөнхий мэдээлэл болон ангиудын явц</p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-card shadow-sm border-border">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="rounded-md border border-border p-3 text-muted-foreground">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-1">Нийт сурагч</p>
              <p className="text-2xl font-bold text-foreground">{dashboard.studentCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card shadow-sm border-border">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="rounded-md border border-border p-3 text-muted-foreground">
              <BookOpen className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-1">Идэвхтэй анги</p>
              <p className="text-2xl font-bold text-foreground">{dashboard.classCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card shadow-sm border-border">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="rounded-md border border-border p-3 text-muted-foreground">
              <CheckSquare className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-1">Шалгах хуудас</p>
              <p className="text-2xl font-bold text-foreground">{dashboard.awaitingReview}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card shadow-sm border-border">
         <CardContent className="p-6">
            <h3 className="font-bold text-foreground mb-2">Системийн мэдээлэл</h3>
            <p className="text-sm font-medium text-foreground/80 leading-relaxed">{dashboard.insight}</p>
         </CardContent>
      </Card>

      <section>
        <h2 className="text-lg font-bold text-foreground border-b pb-2 mb-4">Бүртгэлтэй ангиуд</h2>
        <div className="space-y-4">
          {classes.map(cls => (
            <Card key={cls.id} className="bg-card shadow-sm border-border">
              <CardContent className="p-5 flex flex-col md:flex-row justify-between md:items-center gap-4">
                <div>
                  <h3 className="text-base font-bold text-foreground mb-1">{cls.name} <span className="text-sm font-medium text-muted-foreground ml-2">({cls.gradeLevel}-р анги)</span></h3>
                  <p className="text-sm font-medium text-muted-foreground mb-3">Сурагч: {cls.studentCount} | Шалгах: <span className={cls.needsReview > 0 ? "text-pending font-bold" : ""}>{cls.needsReview}</span></p>
                  <div className="text-sm flex items-center gap-2">
                    <span className="font-bold text-foreground uppercase tracking-wider text-xs">Одоогийн сэдэв: </span>
                    <span className="bg-muted px-2 py-1 rounded-sm font-medium">{cls.currentTopic}</span>
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                   <Button variant="outline" size="sm" className="font-bold" disabled title="Сэдэв оноох урсгал хараахан холбогдоогүй">
                     <Settings className="w-4 h-4 mr-2" /> Сэдэв солих
                   </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  )
}
