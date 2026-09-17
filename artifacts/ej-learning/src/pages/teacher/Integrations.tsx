import { useQueryClient } from '@tanstack/react-query';
import { 
  useGetWorkspaceIntegrationDashboard, 
  getGetWorkspaceIntegrationDashboardQueryKey, 
  useSimulateWorkspaceIntegration 
} from '@workspace/api-client-react';
import { format } from 'date-fns';
import { 
  Database, RefreshCw, FileSpreadsheet, HardDrive, Share, 
  Info, Server, ShieldCheck, ListChecks, Link as LinkIcon, CheckCircle2
} from 'lucide-react';

import { 
  Card, CardContent, CardDescription, CardHeader, CardTitle 
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';

export default function TeacherIntegrations() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const { data: dashboard, isLoading, isError } = useGetWorkspaceIntegrationDashboard();
  const simulateMutation = useSimulateWorkspaceIntegration();

  const handleSimulate = (action: 'sync_classroom' | 'import_sheet' | 'import_drive' | 'publish_coursework') => {
    const idempotencyKey = crypto.randomUUID();
    simulateMutation.mutate({ data: { action, idempotencyKey } }, {
      onSuccess: () => {
        toast({
          title: "Үйлдэл амжилттай (MOCK)",
          description: "Симуляци хийгдэж өгөгдөл шинэчлэгдлээ.",
        });
        queryClient.invalidateQueries({ queryKey: getGetWorkspaceIntegrationDashboardQueryKey() });
      },
      onError: () => {
        toast({
          title: "Алдаа гарлаа",
          description: "Симуляци хийх үед алдаа гарлаа.",
          variant: "destructive",
        });
      }
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-10 w-1/3 mb-2" />
          <Skeleton className="h-5 w-1/2" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
        </div>
        <Skeleton className="h-[400px] w-full rounded-xl" />
      </div>
    );
  }

  if (isError || !dashboard) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Алдаа</AlertTitle>
        <AlertDescription>Мэдээлэл татахад алдаа гарлаа. Дахин оролдоно уу.</AlertDescription>
      </Alert>
    );
  }

  const getSourceIcon = (source: string) => {
    switch(source) {
      case 'classroom': return <Server className="h-4 w-4 text-primary" />;
      case 'sheets': return <FileSpreadsheet className="h-4 w-4 text-emerald-600" />;
      case 'drive': return <HardDrive className="h-4 w-4 text-blue-600" />;
      case 'forms': return <ListChecks className="h-4 w-4 text-indigo-600" />;
      default: return <Database className="h-4 w-4" />;
    }
  };

  const getOwnershipBadge = (ownership: string) => {
    return ownership === 'postgresql' 
      ? <Badge variant="default" className="bg-primary/10 text-primary hover:bg-primary/20">PostgreSQL (Дотоод)</Badge>
      : <Badge variant="outline" className="text-muted-foreground">Гадаад холбоос (External)</Badge>;
  };

  const getBatchStatusBadge = (status: string) => {
    switch(status) {
      case 'validated': return <Badge variant="default" className="bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200">Шалгагдсан</Badge>;
      case 'approved': return <Badge variant="default" className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200">Баталгаажсан</Badge>;
      case 'rejected': return <Badge variant="destructive">Буцаагдсан</Badge>;
      default: return <Badge variant="secondary">Ноорог</Badge>;
    }
  };

  return (
    <div className="space-y-8 pb-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
          Google Workspace Холболт
          <Badge variant="outline" className="text-xs uppercase bg-muted border-muted-foreground/30 text-muted-foreground px-2 py-0.5">
            {dashboard.mode === 'mock' ? 'MOCK MODE' : 'ХОЛБОГДООГҮЙ'}
          </Badge>
        </h1>
        <p className="text-muted-foreground mt-2 text-lg">
          Сургуулийн дотоод өгөгдлийн сан болон Google Workspace хоорондын мэдээлэл солилцоо, эзэмшлийн байдал.
        </p>
      </div>

      <Alert className="bg-primary/5 border-primary/20 text-primary">
        <Info className="h-5 w-5 text-primary" />
        <AlertTitle className="font-semibold mb-1">Мэдээлэл</AlertTitle>
        <AlertDescription className="text-primary/90">
          {dashboard.dataNotice}
        </AlertDescription>
      </Alert>

      <section aria-labelledby="architecture-decision-title" className="space-y-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-primary">
            Баталсан чиглэл
          </p>
          <h2 id="architecture-decision-title" className="text-xl font-bold text-foreground mt-1">
            EJ Learning + Google Workspace архитектур
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Google-ийн хэрэгсэл бүр тодорхой үүрэгтэй. Суралцах шийдвэр, нотолгоо, хувилбарыг EJ Learning өөрөө удирдана.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[
            {
              title: "Google Sheets",
              decision: "Эхний хэрэгжүүлэх integration",
              detail: "Асуултын санг бөөнөөр импортолж, draft → validation → approval урсгалд оруулна.",
              icon: FileSpreadsheet,
              emphasis: true,
            },
            {
              title: "Google Classroom",
              decision: "Өндөр ач холбогдолтой",
              detail: "Анги, roster, assignment түгээлт болон coursework холбоосыг удирдана.",
              icon: Server,
            },
            {
              title: "Google Drive",
              decision: "Хамгаалалттай эх сурвалж",
              detail: "Файл бүр revision, version, permission болон approval metadata-тай байна.",
              icon: HardDrive,
            },
            {
              title: "Google Forms",
              decision: "Нэмэлт bridge",
              detail: "Legacy quiz response импортлоход ашиглана. Үндсэн assessment engine биш.",
              icon: ListChecks,
            },
            {
              title: "PostgreSQL",
              decision: "Үндсэн system of record",
              detail: "Identity mapping, content version, assignment, attempt, review, audit энд хадгалагдана.",
              icon: Database,
            },
            {
              title: "EJ Learning",
              decision: "Үндсэн learning engine",
              detail: "Assessment, adaptation, mastery evidence болон дараагийн ажлыг тооцно.",
              icon: ShieldCheck,
              emphasis: true,
            },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className={
                  item.emphasis
                    ? "rounded-lg border-2 border-primary/30 bg-primary/5 p-4"
                    : "rounded-lg border border-border bg-card p-4"
                }
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 rounded-md bg-background border border-border p-2 text-primary">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-foreground">{item.title}</h3>
                    <div className="flex items-center gap-1.5 mt-1 text-xs font-bold text-primary">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {item.decision}
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed mt-2">
                      {item.detail}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="shadow-sm border-border/50">
          <CardHeader className="pb-3">
            <CardDescription className="text-xs font-medium uppercase tracking-wider">Бүртгэлийн систем</CardDescription>
            <CardTitle className="text-xl flex items-center gap-2">
              <Database className="h-5 w-5 text-muted-foreground" />
              {dashboard.systemOfRecord}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Үндсэн өгөгдлүүд дотоод баазад (PostgreSQL) хадгалагдаж, гадаад системүүд зөвхөн унших, эсвэл түр зуурын эх үүсвэрээр ашиглагдана.
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border/50">
          <CardHeader className="pb-3">
            <CardDescription className="text-xs font-medium uppercase tracking-wider">Архитектурын зарчим</CardDescription>
            <CardTitle className="text-xl flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-muted-foreground" />
              {dashboard.principle}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Өгөгдлийн эх сурвалжийн маргаан гарахгүй байх үүднээс мэдээллийн нэг чиглэлт урсгал эсвэл хатуу заагласан эзэмшлийг мөрдөнө.
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border/50 bg-muted/30">
          <CardHeader className="pb-3">
            <CardDescription className="text-xs font-medium uppercase tracking-wider">Холболтын үйлдлүүд (идэвхгүй)</CardDescription>
            <CardTitle className="text-lg">Гараар ажиллуулах</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              className="text-xs justify-start h-9"
              onClick={() => handleSimulate('sync_classroom')}
              disabled={dashboard.mode !== 'mock' || simulateMutation.isPending}
            >
              <RefreshCw className="mr-2 h-3.5 w-3.5" />
              Classroom
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              className="text-xs justify-start h-9"
              onClick={() => handleSimulate('import_sheet')}
              disabled={dashboard.mode !== 'mock' || simulateMutation.isPending}
            >
              <FileSpreadsheet className="mr-2 h-3.5 w-3.5" />
              Sheets
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              className="text-xs justify-start h-9"
              onClick={() => handleSimulate('import_drive')}
              disabled={dashboard.mode !== 'mock' || simulateMutation.isPending}
            >
              <HardDrive className="mr-2 h-3.5 w-3.5" />
              Drive
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              className="text-xs justify-start h-9"
              onClick={() => handleSimulate('publish_coursework')}
              disabled={dashboard.mode !== 'mock' || simulateMutation.isPending}
            >
              <Share className="mr-2 h-3.5 w-3.5" />
              Даалгавар
            </Button>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="sources" className="w-full">
        <TabsList className="grid grid-cols-5 bg-muted/50 p-1 rounded-lg h-auto">
          <TabsTrigger value="sources" className="rounded-md py-2">Эх үүсвэрүүд</TabsTrigger>
          <TabsTrigger value="entities" className="rounded-md py-2">Өгөгдлийн бүтэц</TabsTrigger>
          <TabsTrigger value="courses" className="rounded-md py-2">Ангиуд</TabsTrigger>
          <TabsTrigger value="batches" className="rounded-md py-2">Импортын багцууд</TabsTrigger>
          <TabsTrigger value="audit" className="rounded-md py-2">Үйлдлийн түүх</TabsTrigger>
        </TabsList>

        <div className="mt-6">
          <TabsContent value="sources" className="m-0 focus-visible:outline-none focus-visible:ring-0">
            <Card className="shadow-sm">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead>Систем</TableHead>
                    <TableHead>Үүрэг (Role)</TableHead>
                    <TableHead>Төлөв</TableHead>
                    <TableHead className="text-right">Бичлэгийн тоо</TableHead>
                    <TableHead className="text-right">Сүүлд синк хийсэн</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dashboard.sources.map((source, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium flex items-center gap-2">
                        {getSourceIcon(source.source)}
                        <span className="capitalize">{source.source}</span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{source.role}</TableCell>
                      <TableCell>
                        <Badge variant={source.status === 'mock_ready' ? 'default' : 'secondary'} className={source.status === 'mock_ready' ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' : ''}>
                          {source.status === 'mock_ready' ? 'Бэлэн (Mock)' : source.status === 'not_connected' ? 'Холбогдоогүй' : 'Нэмэлт'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">{source.recordCount}</TableCell>
                      <TableCell className="text-right text-muted-foreground text-sm">
                        {source.lastSyncAt ? format(new Date(source.lastSyncAt), 'yyyy-MM-dd HH:mm') : '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          <TabsContent value="entities" className="m-0 focus-visible:outline-none focus-visible:ring-0 space-y-6">
            <div className="flex flex-wrap gap-2 mb-4">
              <Badge variant="outline" className="px-3 py-1.5 bg-background text-sm font-normal text-muted-foreground">
                <span className="font-semibold text-foreground mr-2">Дараалал (Pipeline):</span> 
                {dashboard.pipeline.join(" → ")}
              </Badge>
            </div>
            <Card className="shadow-sm">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead>Объект (Entity)</TableHead>
                    <TableHead>Эзэмшил (Ownership)</TableHead>
                    <TableHead>Талбарууд</TableHead>
                    <TableHead>Холбоос</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dashboard.entities.map((entity, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">{entity.name}</TableCell>
                      <TableCell>{getOwnershipBadge(entity.ownership)}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {entity.fields.map(f => (
                            <span key={f} className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-sm font-mono border border-border/50">{f}</span>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <LinkIcon className="h-3.5 w-3.5" />
                          {entity.relation}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          <TabsContent value="courses" className="m-0 focus-visible:outline-none focus-visible:ring-0">
            <Card className="shadow-sm">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead>Ангийн нэр</TableHead>
                    <TableHead>Багш</TableHead>
                    <TableHead>Гадаад ID (Classroom)</TableHead>
                    <TableHead>Дотоод ID</TableHead>
                    <TableHead className="text-right">Сурагчид</TableHead>
                    <TableHead>Синк төлөв</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dashboard.courses.map((course, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">{course.name}</TableCell>
                      <TableCell>{course.teacher}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{course.externalCourseId}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{course.internalClassId}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{course.studentCount}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                          {course.syncStatus}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          <TabsContent value="batches" className="m-0 focus-visible:outline-none focus-visible:ring-0">
            <Card className="shadow-sm">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead>Багцын ID</TableHead>
                    <TableHead>Эх үүсвэр</TableHead>
                    <TableHead>Файлын нэр</TableHead>
                    <TableHead>Төлөв</TableHead>
                    <TableHead className="text-right">Нийт мөр</TableHead>
                    <TableHead className="text-right">Зөвшөөрөгдсөн</TableHead>
                    <TableHead className="text-right">Алдаатай</TableHead>
                    <TableHead className="text-right">Хувилбар</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dashboard.importBatches.map((batch, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-mono text-xs text-muted-foreground">{batch.id.substring(0, 8)}...</TableCell>
                      <TableCell className="capitalize text-sm">{batch.source}</TableCell>
                      <TableCell className="font-medium text-sm flex items-center gap-2">
                        <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                        {batch.fileName}
                      </TableCell>
                      <TableCell>{getBatchStatusBadge(batch.status)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{batch.rowCount}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-emerald-600 font-medium">{batch.validCount}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-destructive">{batch.errorCount > 0 ? batch.errorCount : '-'}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-muted-foreground">v{batch.version}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          <TabsContent value="audit" className="m-0 focus-visible:outline-none focus-visible:ring-0">
            <Card className="shadow-sm">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead>Огноо</TableHead>
                    <TableHead>Үйлдэл</TableHead>
                    <TableHead>Эх үүсвэр</TableHead>
                    <TableHead>Дэлгэрэнгүй</TableHead>
                    <TableHead className="text-right">Idempotency Key</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dashboard.auditEvents.map((event, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {format(new Date(event.createdAt), 'yyyy-MM-dd HH:mm:ss')}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-xs bg-muted/50">
                          {event.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="capitalize text-sm">{event.source}</TableCell>
                      <TableCell className="text-sm">{event.summary}</TableCell>
                      <TableCell className="text-right font-mono text-xs text-muted-foreground">
                        {event.idempotencyKey.substring(0, 8)}...
                      </TableCell>
                    </TableRow>
                  ))}
                  {dashboard.auditEvents.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        Одоогоор түүх алга байна
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
