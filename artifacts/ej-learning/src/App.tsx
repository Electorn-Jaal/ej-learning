import { useEffect, type ReactNode } from 'react';
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
import Password from '@/pages/Password';
import StudentToday from '@/pages/student/Today';
import StudentDashboard from '@/pages/student/Dashboard';
import StudentSubjects from '@/pages/student/Subjects';
import StudentProgress from '@/pages/student/Progress';
import StudentProfile from '@/pages/student/Profile';
import StudentAssignment from '@/pages/student/Assignment';
import TeacherDashboard from '@/pages/teacher/Dashboard';
import TeacherSchedule from '@/pages/teacher/Schedule';
import TeacherQuizResults from '@/pages/teacher/QuizResults';
import AdminBooks from '@/pages/admin/Books';
import TeacherReviews from '@/pages/teacher/Reviews';
import TeacherIntegrations from '@/pages/teacher/Integrations';
import TeacherCatalog from '@/pages/teacher/Catalog';

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
      <Route path="/lessons" component={StudentDashboard} />
      <Route path="/subjects" component={StudentSubjects} />
      <Route path="/progress" component={StudentProgress} />
      <Route path="/profile" component={StudentProfile} />
      <Route path="/password" component={Password} />
      <Route path="/assignment/:id" component={StudentAssignment} />
      <Route component={NotFound} />
    </Switch>
  );
}

function StaffRoutes({ admin }: { admin: boolean }) {
  return (
    <Switch>
      {admin ? <Route path="/teacher/books" component={AdminBooks} /> : null}
      <Route path="/teacher" component={TeacherDashboard} />
      <Route path="/teacher/schedule" component={TeacherSchedule} />
      <Route path="/teacher/results" component={TeacherQuizResults} />
      <Route path="/teacher/reviews" component={TeacherReviews} />
      <Route path="/teacher/catalog" component={TeacherCatalog} />
      <Route path="/teacher/integrations" component={TeacherIntegrations} />
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

  return staff ? <StaffRoutes admin={hasRole(user, 'ADMIN')} /> : <StudentRoutes />;
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function LoadingScreen() {
  return (
    <div className="flex min-h-screen">
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
          <RoleRoutes user={data.user} />
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
