import { useEffect, useState, useRef, useMemo } from "react"
import { useLocation, useRoute } from "wouter"
import { 
  useGetStudentAssignment, 
  useStartStudentAssignment, 
  useSubmitStudentAssignment,
  useSaveStudentAssignmentStep,
  getGetStudentDashboardQueryKey,
  getGetStudentProgressQueryKey,
  getGetStudentAssignmentQueryKey
} from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Check, ArrowLeft, ArrowRight, Loader2 } from "lucide-react"
import { Link } from "wouter"

type MaterialStep = {
  isQuestion: false
  label: string
  stepType: "read" | "example" | "practice"
  title: string
  body: string
  available: boolean
  kind: "explanation" | "example" | "pdf" | "practice"
}

type QuestionStep = {
  isQuestion: true
  label: string
  question: {
    id: string
    prompt: string
    type: "single_choice" | "written"
    options: string[]
    maxScore: number
  }
}

type LearningStep = MaterialStep | QuestionStep

export default function StudentAssignment() {
  const [, params] = useRoute("/assignment/:id")
  const [, setLocation] = useLocation()
  const id = params?.id || ""
  
  const { data: assignment, isLoading } = useGetStudentAssignment(id, { query: { enabled: !!id, queryKey: getGetStudentAssignmentQueryKey(id) } })
  const startMutation = useStartStudentAssignment()
  const saveStepMutation = useSaveStudentAssignmentStep()
  const submitMutation = useSubmitStudentAssignment()
  const queryClient = useQueryClient()
  
  const [answer, setAnswer] = useState("")
  const [submittedResult, setSubmittedResult] = useState<any>(null)
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [saveNotice, setSaveNotice] = useState("")
  const idempotencyKeyRef = useRef(crypto.randomUUID())

  const startedRef = useRef(false)
  const startFnRef = useRef(startMutation.mutate)
  startFnRef.current = startMutation.mutate
  
  useEffect(() => {
    if (
      id &&
      assignment &&
      !assignment.readOnly &&
      assignment.status !== "pending_review" &&
      assignment.status !== "completed" &&
      !startedRef.current
    ) {
      startedRef.current = true
      startFnRef.current({ assignmentId: id })
    }
  }, [assignment, id])

  const steps = useMemo<LearningStep[]>(() => {
    if (!assignment) return []
    const materialSteps: MaterialStep[] = assignment.materialBlocks.map(b => {
      let stepType: 'read' | 'example' | 'practice' = 'read'
      let label = 'Тайлбар'
      if (b.kind === 'example') { stepType = 'example'; label = 'Жишээ' }
      else if (b.kind === 'practice') { stepType = 'practice'; label = 'Дасгал' }
      else if (b.kind === 'pdf') { stepType = 'read'; label = 'Материал' }

      return { ...b, stepType, label, isQuestion: false as const }
    })

    if (assignment.question) {
      return [...materialSteps, { 
        isQuestion: true as const, 
        label: 'Шалгах', 
        question: assignment.question 
      }]
    }
    return materialSteps
  }, [assignment])

  useEffect(() => {
    if (!assignment || steps.length === 0) return
    const firstIncomplete = steps.findIndex(
      (step) =>
        step.isQuestion ||
        !assignment.completedSteps.includes(step.stepType),
    )
    setCurrentStepIndex(firstIncomplete < 0 ? steps.length - 1 : firstIncomplete)
  }, [assignment, steps])
  
  if (isLoading) {
    return <div className="space-y-6"><Skeleton className="h-32 w-full" /><Skeleton className="h-64 w-full" /></div>
  }
  
  if (!assignment) return <div className="p-8 text-destructive font-bold">Материал олдсонгүй</div>

  if (assignment.status === 'unavailable') {
     return (
       <div className="max-w-2xl mx-auto py-12 animate-in fade-in">
         <Link href="/" className="inline-flex items-center text-sm font-bold text-muted-foreground hover:text-foreground mb-6">
           <ArrowLeft className="w-4 h-4 mr-1" /> Буцах
         </Link>
         <Card className="shadow-sm">
           <CardContent className="p-8 text-center">
             <h2 className="text-xl font-bold mb-2">Мэдээлэл хаалттай байна</h2>
             <p className="text-muted-foreground font-medium">Энэхүү даалгавар одоогоор нээгдээгүй эсвэл боломжгүй байна.</p>
           </CardContent>
         </Card>
       </div>
     )
  }

  if (assignment.status === 'pending_review') {
     return (
       <div className="max-w-2xl mx-auto py-12 animate-in fade-in">
         <Link href="/" className="inline-flex items-center text-sm font-bold text-muted-foreground hover:text-foreground mb-6">
           <ArrowLeft className="w-4 h-4 mr-1" /> Буцах
         </Link>
         <Card className="border-pending/50 bg-pending/5 shadow-sm">
           <CardContent className="p-8 text-center space-y-5">
             <div className="mx-auto w-16 h-16 bg-pending/20 text-pending rounded-full flex items-center justify-center mb-2">
                <Loader2 className="w-8 h-8 animate-spin" />
             </div>
             <h2 className="text-2xl font-bold text-foreground">Шалгагдаж байна</h2>
             <p className="text-muted-foreground font-medium text-base">Таны хариултыг багш шалгаж байна. Дүн гартал хүлээнэ үү.</p>
             <div className="pt-4">
               <Button onClick={() => setLocation('/')} className="font-bold px-8">Нүүр хуудас руу буцах</Button>
             </div>
           </CardContent>
         </Card>
       </div>
     )
  }

  if (assignment.status === "completed" && !submittedResult) {
    return (
      <div className="max-w-2xl mx-auto py-12 animate-in fade-in">
        <Link href="/" className="inline-flex items-center text-sm font-bold text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="w-4 h-4 mr-1" /> Буцах
        </Link>
        <Card className="border-2 border-success bg-card shadow-sm">
          <CardContent className="p-8 text-center space-y-5">
            <div className="mx-auto w-16 h-16 bg-success text-success-foreground rounded-full flex items-center justify-center">
              <Check className="w-8 h-8" strokeWidth={3} />
            </div>
            <h2 className="text-2xl font-bold text-foreground">Шалгалт дууссан</h2>
            <p className="text-foreground font-medium">
              Таны үнэлэгдсэн хариу, нотолгоо хадгалагдсан байна.
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-3 pt-2">
              <Button onClick={() => setLocation("/progress")} className="font-bold px-8">
                Ахиц харах
              </Button>
              <Button variant="outline" onClick={() => setLocation("/")} className="font-bold px-8">
                Өнөөдрийн ажил
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const currentStep = steps[currentStepIndex]

  const handleNextStep = () => {
    if (assignment.readOnly) {
      if (currentStepIndex === steps.length - 1) { setLocation('/'); return }
      setCurrentStepIndex(prev => Math.min(prev + 1, steps.length - 1))
      return
    }
    if (!currentStep.isQuestion) {
      saveStepMutation.mutate({
        assignmentId: id,
        data: { step: currentStep.stepType, completed: true }
      }, {
        onSuccess: () => {
          setSaveNotice("Алхам хадгалагдлаа.")
          setCurrentStepIndex(prev => Math.min(prev + 1, steps.length - 1))
          window.setTimeout(() => setSaveNotice(""), 1600)
        }
      })
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!answer) return
    submitMutation.mutate({
      assignmentId: id,
      data: { answer, idempotencyKey: idempotencyKeyRef.current }
    }, {
      onSuccess: (result) => {
        setSubmittedResult(result)
        queryClient.invalidateQueries({ queryKey: getGetStudentDashboardQueryKey() })
        queryClient.invalidateQueries({ queryKey: getGetStudentProgressQueryKey() })
        queryClient.invalidateQueries({ queryKey: getGetStudentAssignmentQueryKey(id) })
        idempotencyKeyRef.current = crypto.randomUUID()
      }
    })
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-20">
      <div className="flex items-center justify-between">
        <Link href="/" className="inline-flex items-center text-sm font-bold text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
          <ArrowLeft className="w-4 h-4 mr-1" />
          Буцах
        </Link>
        <div className="text-sm font-bold text-muted-foreground bg-muted px-3 py-1 rounded-sm">
          Алхам {currentStepIndex + 1} / {steps.length}
        </div>
      </div>
      
      <div className="space-y-2 pb-6 border-b">
        <span className="text-xs font-bold bg-muted text-muted-foreground px-2 py-1 rounded-sm uppercase tracking-wider">{assignment.subject}</span>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground leading-tight">{assignment.topic}</h1>
        <p className="text-muted-foreground text-sm font-medium">{assignment.targetSkill}</p>
        {assignment.readOnly && <p className="text-sm border rounded p-3 bg-muted/40">{assignment.dataNotice}</p>}
      </div>
      
      {!submittedResult && currentStep && (
        <div key={currentStepIndex} className="animate-in fade-in slide-in-from-right-4 duration-300">
          <h2 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
            <span className="bg-primary text-primary-foreground w-6 h-6 rounded-full inline-flex items-center justify-center text-sm">{currentStepIndex + 1}</span>
            {currentStep.label}
          </h2>
          
          {!currentStep.isQuestion ? (
            <Card className="border-border shadow-sm mb-6 bg-card">
              {currentStep.title && (
                <div className="px-6 py-4 border-b bg-muted/30">
                  <h3 className="font-bold text-foreground">{currentStep.title}</h3>
                </div>
              )}
              <CardContent className="p-6 md:p-8 text-foreground/90 leading-relaxed text-base">
                {currentStep.available ? (
                  <p className="whitespace-pre-wrap font-serif text-lg">{currentStep.body}</p>
                ) : (
                  <div className="text-center py-8 text-muted-foreground font-bold">Материал одоогоор хаалттай байна.</div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card className="border-primary/20 bg-card shadow-sm mb-6">
              <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                <h3 className="font-bold text-foreground flex items-center gap-2">
                  Ойлгосноо шалгах
                </h3>
                <span className="text-sm font-bold bg-muted text-muted-foreground px-2 py-1 rounded-sm border">
                  {currentStep.question.maxScore} оноо
                </span>
              </div>
              <CardContent className="p-6 md:p-8">
                <form onSubmit={handleSubmit} className="space-y-6">
                  <p className="text-lg font-bold text-foreground mb-6 font-serif">{currentStep.question.prompt}</p>
                  
                  {currentStep.question.type === "single_choice" ? (
                    <div className="space-y-3">
                      {currentStep.question.options.map((opt: string, i: number) => (
                        <label key={i} className={`flex items-start gap-4 p-4 rounded-md border-2 cursor-pointer transition-colors ${
                          answer === opt 
                            ? 'border-primary bg-primary/5' 
                            : 'border-border bg-card hover:border-primary/30'
                        }`}>
                          <div className="flex items-center h-6">
                            <input 
                              type="radio" 
                              name="answer" 
                              value={opt} 
                              checked={answer === opt} 
                              onChange={(e) => setAnswer(e.target.value)}
                              className="w-4 h-4 text-primary border-border focus:ring-primary focus:ring-2 focus:ring-offset-2"
                            />
                          </div>
                          <span className="text-base font-medium">{opt}</span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <textarea 
                      className="w-full h-32 p-4 rounded-md border-2 border-border bg-card focus:border-primary focus:ring-0 outline-none resize-none text-base font-medium"
                      placeholder="Хариултаа бичнэ үү..."
                      value={answer}
                      onChange={(e) => setAnswer(e.target.value)}
                    />
                  )}
                  
                  <div className="pt-4">
                    <Button 
                      type="submit" 
                      disabled={!answer || submitMutation.isPending}
                      className="w-full sm:w-auto font-bold px-8 h-12"
                    >
                      {submitMutation.isPending ? "Илгээж байна..." : "Хариуг илгээх"}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {!currentStep.isQuestion && (
            <div className="flex items-center justify-between gap-4 pt-2">
              <p className="text-sm font-bold text-success" role="status" aria-live="polite">
                {saveNotice}
              </p>
              <Button 
                onClick={handleNextStep} 
                disabled={saveStepMutation.isPending}
                className="font-bold px-6 h-12"
              >
                {assignment.readOnly && currentStepIndex === steps.length - 1 ? 'Тойм руу буцах' : saveStepMutation.isPending ? "Хадгалж байна..." : "Дараагийн алхам"}
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </div>
          )}
        </div>
      )}
      
      {submittedResult && (
        <Card className="border-2 border-success bg-card shadow-sm mt-8 animate-in fade-in zoom-in duration-300">
          <CardContent className="p-8 text-center space-y-5">
            <div className="mx-auto w-16 h-16 bg-success/20 rounded-full flex items-center justify-center text-success mb-2">
              <Check className="w-8 h-8" strokeWidth={3} />
            </div>
            <h3 className="text-2xl font-bold text-foreground">Амжилттай илгээгдлээ</h3>
            <p className="text-base font-medium text-foreground/80">{submittedResult.message}</p>
            
            <div className="pt-4 pb-4">
              <div className="bg-card rounded-md p-5 inline-block text-left shadow-sm border border-border w-full max-w-md mx-auto">
                <p className="text-xs font-bold text-muted-foreground uppercase mb-1 tracking-wider">Дараагийн алхам</p>
                <p className="text-base font-bold text-foreground mb-1">{submittedResult.nextAction.label}</p>
                <p className="text-sm font-medium text-muted-foreground">{submittedResult.nextAction.description}</p>
              </div>
            </div>
            
            <div className="pt-2">
              <Button
                onClick={() => {
                  if (submittedResult.nextAction.kind === "reinforce") {
                    window.location.reload()
                    return
                  }
                  setLocation("/")
                }}
                className="font-bold px-8 h-12"
              >
                {submittedResult.nextAction.label}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
