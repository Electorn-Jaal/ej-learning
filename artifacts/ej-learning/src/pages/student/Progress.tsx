import { useGetStudentProgress } from "@workspace/api-client-react"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { format } from "date-fns"
import { mn } from "date-fns/locale"

export default function StudentProgress() {
  const { data: progress, isLoading } = useGetStudentProgress()

  if (isLoading) {
    return <div className="space-y-4"><Skeleton className="h-32 w-full" /><Skeleton className="h-64 w-full" /></div>
  }

  if (!progress) return <p role="alert">Ахицын мэдээллийг уншиж чадсангүй.</p>

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'mastered': return 'Сайн эзэмшсэн'
      case 'developing': return 'Хөгжиж буй'
      case 'needs_support': return 'Дэмжлэг хэрэгтэй'
      case 'unassessed': return 'Үнэлэгдээгүй'
      default: return 'Тодорхойгүй'
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'mastered': return 'text-success bg-success/10 border-success/20'
      case 'developing': return 'text-primary bg-primary/10 border-primary/20'
      case 'needs_support': return 'text-pending bg-pending/10 border-pending/20'
      case 'unassessed': return 'text-muted-foreground bg-muted border-border'
      default: return 'text-muted-foreground bg-muted border-border'
    }
  }

  return (
    <div className="space-y-8 pb-10 animate-in fade-in duration-500">
      <header>
        <h1 className="text-2xl font-bold text-foreground mb-1">Миний ахиц</h1>
        <p className="text-muted-foreground font-medium">Ур чадварын түвшин болон оролдлогуудын түүх</p>
        {progress.dataNotice && (
          <p className="text-sm mt-2 text-muted-foreground bg-muted p-2 rounded inline-block">{progress.dataNotice}</p>
        )}
      </header>

      <section>
        <h2 className="text-lg font-bold text-foreground border-b pb-2 mb-4">Ур чадвар</h2>
        <div className="grid gap-3">
          {progress.skills.map(skill => (
            <Card key={skill.code} className="border-border shadow-sm bg-card">
              <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                <div>
                  <div className="text-xs font-bold text-muted-foreground mb-1 tracking-wider">{skill.code} (Анги {skill.gradeLevel})</div>
                  <h3 className="text-base font-bold text-foreground leading-tight">{skill.skill}</h3>
                  {skill.lastEvidenceDate && (
                     <div className="text-xs text-muted-foreground font-medium mt-1.5">
                       Сүүлд үнэлэгдсэн: {format(new Date(skill.lastEvidenceDate), "yyyy-MM-dd", { locale: mn })}
                     </div>
                  )}
                </div>
                <div className="flex flex-col items-start sm:items-end gap-2 flex-shrink-0">
                   <span className={`px-3 py-1 rounded-sm text-xs font-bold border ${getStatusColor(skill.status)}`}>
                     {getStatusLabel(skill.status)}
                   </span>
                   <span className="text-sm font-bold text-foreground">
                     {skill.status === 'unassessed' ? 'Тодорхойлох боломжгүй' : `Оноо: ${skill.percentage === null ? 'Бүртгээгүй' : `${skill.percentage}%`} (Баталгаа: ${skill.evidenceCount})`}
                   </span>
                </div>
              </CardContent>
            </Card>
          ))}
          {progress.skills.length === 0 && (
            <p className="text-sm text-muted-foreground font-medium">Ур чадварын мэдээлэл алга байна.</p>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-bold text-foreground border-b pb-2 mb-4">Оролдлогуудын түүх</h2>
        <div className="space-y-3">
          {progress.attempts.map(attempt => (
            <div key={attempt.id} className="p-4 sm:p-5 bg-card border border-border rounded-md flex flex-col sm:flex-row justify-between gap-3 sm:items-center shadow-sm">
              <div>
                <h4 className="font-bold text-sm text-foreground mb-1">{attempt.assignment}</h4>
                <p className="text-xs font-medium text-muted-foreground">
                  {format(new Date(attempt.submittedAt), "yyyy-MM-dd HH:mm", { locale: mn })}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-muted-foreground">
                  {attempt.status === 'reviewed' ? 'Шалгагдсан' : attempt.status === 'pending_review' ? 'Шалгагдаж байна' : attempt.status}
                </span>
                {attempt.score !== null ? (
                  <span className="font-bold text-foreground bg-muted border border-border/50 px-3 py-1 rounded-sm text-sm">
                    {attempt.score} / {attempt.maxScore ?? "?"}
                  </span>
                ) : (
                  <span className="text-sm text-pending font-bold bg-pending/10 px-3 py-1 rounded-sm border border-pending/20">Хүлээгдэж байна</span>
                )}
                 {attempt.reviewer && (
                   <span className="text-xs font-bold text-muted-foreground">
                     Шалгасан: {attempt.reviewer}
                   </span>
                 )}
              </div>
            </div>
          ))}
          {progress.attempts.length === 0 && (
            <p className="text-sm text-muted-foreground font-medium">Түүх алга байна.</p>
          )}
        </div>
      </section>
    </div>
  )
}
