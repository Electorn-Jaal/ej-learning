import { lazy, Suspense, useEffect, type ComponentType, type ReactNode } from 'react';
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

/**
 * One page's code, fetched the first time the page is opened.
 *
 * Every build renames these files. A browser left open on the previous build
 * asks for a name that no longer exists, the import is rejected, and pressing
 * a button in the navigation appears to do nothing whatsoever - the page that
 * is already on screen keeps working, so it does not look like a failure, it
 * looks like a dead button. There is nothing wrong with the page; the tab is
 * simply out of date, so it reloads itself and arrives on the new build.
 *
 * Once, and only once, marked in sessionStorage: a chunk that is genuinely
 * broken must reach the error boundary rather than reload the browser in a
 * loop. A tab that refuses site data skips straight to the boundary.
 */
const RELOADED = 'ej.chunk-reload';

function page(load: () => Promise<{ default: ComponentType<never> }>) {
  return lazy(() => load().catch((error: unknown) => {
    try {
      if (sessionStorage.getItem(RELOADED) === null) {
        sessionStorage.setItem(RELOADED, new Date().toISOString());
        location.reload();
        // The reload takes over; resolving would render against dead code.
        return new Promise<{ default: ComponentType<never> }>(() => {});
      }
    } catch {
      // No session storage: fall through and report the error honestly.
    }
    throw error;
  }));
}

const Password = page(() => import('@/pages/Password'));
const StudentToday = page(() => import('@/pages/student/Today'));
const StudentSchedule = page(() => import('@/pages/student/Schedule'));
const StudentSubjects = page(() => import('@/pages/student/Subjects'));
const StudentSubjectDetail = page(() => import('@/pages/student/SubjectDetail'));
const StudentProgress = page(() => import('@/pages/student/Progress'));
const StudentProfile = page(() => import('@/pages/student/Profile'));
const StudentAssignment = page(() => import('@/pages/student/Assignment'));
const StudentSubjectView = page(() => import('@/pages/student/SubjectView'));
const StudentPlan = page(() => import('@/pages/student/Plan'));
const StudentExams = page(() => import('@/pages/student/Exams'));
const StudentHomework = page(() => import('@/pages/student/Homework'));
const Library = page(() => import('@/pages/Library'));
const TeacherHomework = page(() => import('@/pages/teacher/Homework'));
const TeacherDashboard = page(() => import('@/pages/teacher/Dashboard'));
const TeacherSchedule = page(() => import('@/pages/teacher/Schedule'));
const TeacherQuizResults = page(() => import('@/pages/teacher/QuizResults'));
const TeacherExams = page(() => import('@/pages/teacher/Exams'));
const TeacherClubs = page(() => import('@/pages/teacher/Clubs'));
const TeacherAnalytics = page(() => import('@/pages/teacher/Analytics'));
const TeacherAssessment = page(() => import('@/pages/teacher/Assessment'));
const AdminBooks = page(() => import('@/pages/admin/Books'));
const AdminContentLinks = page(() => import('@/pages/admin/ContentLinks'));
const TeacherIntegrations = page(() => import('@/pages/teacher/Integrations'));
const TeacherCatalog = page(() => import('@/pages/teacher/Catalog'));
const TeacherClassDay = page(() => import('@/pages/teacher/ClassDay'));
const TeacherProfile = page(() => import('@/pages/teacher/Profile'));
const AdminStaff = page(() => import('@/pages/admin/Staff'));
const AdminGuardians = page(() => import('@/pages/admin/Guardians'));
const TeacherProductive = page(() => import('@/pages/teacher/Productive'));
const GuardianChild = page(() => import('@/pages/guardian/Child'));

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
      <Route path="/exams" component={StudentExams} />
      <Route path="/homework" component={StudentHomework} />
      <Route path="/library" component={Library} />
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
      <Route path="/teacher/exams" component={TeacherExams} />
      <Route path="/teacher/homework" component={TeacherHomework} />
      <Route path="/teacher/library" component={Library} />
      <Route path="/teacher/clubs" component={TeacherClubs} />
      <Route path="/teacher/results" component={TeacherQuizResults} />
      <Route path="/teacher/analytics" component={TeacherAnalytics} />
      {takesLessons || admin ? (
        <Route path="/teacher/assessment" component={TeacherAssessment} />
      ) : null}
      <Route path="/teacher/class/:classId" component={TeacherClassDay} />
      <Route path="/teacher/productive" component={TeacherProductive} />
      <Route path="/teacher/catalog" component={TeacherCatalog} />
      <Route path="/teacher/profile" component={TeacherProfile} />
      {admin ? <Route path="/teacher/staff" component={AdminStaff} /> : null}
      {admin ? <Route path="/teacher/guardians" component={AdminGuardians} /> : null}
      <Route path="/teacher/password" component={Password} />
      <Route component={NotFound} />
    </Switch>
  );
}

/**
 * A parent reads and never writes, so their routes are a short list of their
 * own rather than the student's with pieces taken out: a screen that has to
 * remember to hide its buttons is a screen that will one day forget.
 */
function GuardianRoutes() {
  return (
    <Switch>
      <Route path="/" component={GuardianChild} />
      <Route path="/password" component={Password} />
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
  // Staff first: an administrator who is also somebody's parent is at work
  // when they sign in here, and their child's page is reachable through the
  // register like any other.
  const guardian = !staff && hasRole(user, 'GUARDIAN');

  useEffect(() => {
    if (staff && !location.startsWith('/teacher')) navigate('/teacher', { replace: true });
    if (guardian && location.startsWith('/teacher')) navigate('/', { replace: true });
  }, [staff, guardian, location, navigate]);

  if (staff) {
    return <StaffRoutes admin={hasRole(user, 'ADMIN')} takesLessons={user.takesLessons} />;
  }
  return guardian ? <GuardianRoutes /> : <StudentRoutes />;
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
