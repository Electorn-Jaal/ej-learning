import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import type { AuthenticatedUser } from '@workspace/api-client-react';

import { Shell } from '@/components/layout/Shell';
import { SessionProvider, hasRole, useSessionQuery } from '@/lib/session';
import Login from '@/pages/Login';

// The shell and sign-in screen are the only eager application code. Each
// authenticated page becomes its own chunk and is fetched when its route is
// opened, rather than making every student download the admin and teacher UI.
const Password = lazy(() => import('@/pages/Password'));
const StudentToday = lazy(() => import('@/pages/student/Today'));
const StudentSchedule = lazy(() => import('@/pages/student/Schedule'));
const StudentSubjects = lazy(() => import('@/pages/student/Subjects'));
const StudentSubjectDetail = lazy(() => import('@/pages/student/SubjectDetail'));
const StudentProgress = lazy(() => import('@/pages/student/Progress'));
const StudentProfile = lazy(() => import('@/pages/student/Profile'));
const StudentAssignment = lazy(() => import('@/pages/student/Assignment'));
const StudentSubjectView = lazy(() => import('@/pages/student/SubjectView'));
const StudentPlan = lazy(() => import('@/pages/student/Plan'));
const TeacherDashboard = lazy(() => import('@/pages/teacher/Dashboard'));
const TeacherSchedule = lazy(() => import('@/pages/teacher/Schedule'));
const TeacherQuizResults = lazy(() => import('@/pages/teacher/QuizResults'));
const TeacherAnalytics = lazy(() => import('@/pages/teacher/Analytics'));
const TeacherAssessment = lazy(() => import('@/pages/teacher/Assessment'));
const AdminBooks = lazy(() => import('@/pages/admin/Books'));
const AdminContentLinks = lazy(() => import('@/pages/admin/ContentLinks'));
const TeacherIntegrations = lazy(() => import('@/pages/teacher/Integrations'));
const TeacherCatalog = lazy(() => import('@/pages/teacher/Catalog'));
const TeacherClassTopics = lazy(() => import('@/pages/teacher/ClassTopics'));

const queryClient = new QueryClient();

// Minimal fallback for missing routes
function NotFound() {
  return (
    <div className="flex h-[50vh] items-center justify-center text-muted-foreground font-bold">
      Хуудас олдсонгүй (404)
    </div>
  );
}

function StudentRoutes() {
  return (
    <Switch>
      <Route path="/" component={StudentToday} />
      <Route path="/schedule" component={StudentSchedule} />
      <Route path="/subjects" component={StudentSubjects} />
      <Route path="/progress" component={StudentProgress} />
      <Route path="/profile" component={StudentProfile} />
      <Route path="/password" component={Password} />
      <Route path="/subjects/:code/plan" component={StudentPlan} />
      <Route path="/subjects/:code" component={StudentSubjectDetail} />
      <Route path="/subject/:code/:view" component={StudentSubjectView} />
      <Route path="/assignment/:id" component={StudentAssignment} />
      <Route component={NotFound} />
    </Switch>
  );
}

/**
 * Routes are chosen, not merely hidden from the navigation, so typing an
 * address cannot reach a screen this account has no business on. The entry
 * screens need the account to take a lesson somewhere; the integrations
 * screen describes a connection nobody has made, so it is the administrator's.
 */
function StaffRoutes({ admin, takesLessons }: { admin: boolean; takesLessons: boolean }) {
  return (
    <Switch>
      {admin ? <Route path="/teacher/books" component={AdminBooks} /> : null}
      {admin ? <Route path="/teacher/content-links" component={AdminContentLinks} /> : null}
      {admin ? <Route path="/teacher/integrations" component={TeacherIntegrations} /> : null}
      <Route path="/teacher" component={TeacherDashboard} />
      <Route path="/teacher/schedule" component={TeacherSchedule} />
      <Route path="/teacher/results" component={TeacherQuizResults} />
      <Route path="/teacher/analytics" component={TeacherAnalytics} />
      {takesLessons || admin ? (
        <Route path="/teacher/assessment" component={TeacherAssessment} />
      ) : null}
      <Route path="/teacher/class-topics" component={TeacherClassTopics} />
      <Route path="/teacher/catalog" component={TeacherCatalog} />
      <Route path="/teacher/password" component={Password} />
      <Route component={NotFound} />
    </Switch>
  );
}

/**
 * Routes are chosen by role, not merely hidden from the navigation: a student
 * who types /teacher gets the student routes, so the address bar cannot reach
 * a screen the account is not entitled to. The server enforces this too.
 */
function RoleRoutes({ user }: { user: AuthenticatedUser }) {
  const [location, navigate] = useLocation();
  const staff = hasRole(user, 'TEACHER', 'ADMIN');

  useEffect(() => {
    if (staff && !location.startsWith('/teacher')) navigate('/teacher', { replace: true });
  }, [staff, location, navigate]);

  return staff ? (
    <StaffRoutes admin={hasRole(user, 'ADMIN')} takesLessons={user.takesLessons} />
  ) : (
    <StudentRoutes />
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function LoadingScreen() {
  return (
    // Matches the shell it is standing in for, so the page does not gain a
    // scrollbar for the moment before the real frame mounts.
    <div className="flex h-dvh overflow-hidden">
      <div className="hidden w-64 space-y-4 border-r bg-card p-4 md:block">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
      <div className="flex-1 p-8">
        <Skeleton className="h-full w-full" />
      </div>
    </div>
  );
}

function PageLoading() {
  return (
    <div className="space-y-4 p-4 md:p-8" aria-busy="true" aria-label="Хуудсыг ачаалж байна">
      <Skeleton className="h-9 w-48" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

/**
 * A 401 from the session read is the signed-out answer, not an error to
 * report, so it renders the login screen.
 */
function Gate() {
  const { data, isLoading } = useSessionQuery();

  if (isLoading) return <LoadingScreen />;
  if (!data) return <Login />;

  return (
    <SessionProvider user={data.user}>
      <Shell>
        <RoutedErrorBoundary>
          <Suspense fallback={<PageLoading />}>
            <RoleRoutes user={data.user} />
          </Suspense>
        </RoutedErrorBoundary>
      </Shell>
    </SessionProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Gate />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
