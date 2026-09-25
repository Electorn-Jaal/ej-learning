import { useGetStudentDiagnosticPlans } from '@workspace/api-client-react'
import { DiagnosticPlanList } from '@/components/DiagnosticPlanList'
import { Skeleton } from '@/components/ui/skeleton'

export default function StudentDiagnosticPlans() {
  const { data, isLoading, error, refetch } = useGetStudentDiagnosticPlans()
  if (isLoading) return <Skeleton className="h-64" />
  if (!data || error) return <div role="alert" className="space-y-2">
    <p>Төлөвлөгөөг уншиж чадсангүй.</p>
    <button className="underline" onClick={() => void refetch()}>Дахин оролдох</button>
  </div>
  return <div className="space-y-4">
    <header className="space-y-1">
      <h2 className="text-lg font-semibold">Багшийн төлөвлөгөө</h2>
      <p className="text-sm text-muted-foreground">Оношлогооны шалгалтын дараа багш танд зориулж гаргасан судлах ажил.</p>
    </header>
    <DiagnosticPlanList plans={data} linkBooks />
  </div>
}
