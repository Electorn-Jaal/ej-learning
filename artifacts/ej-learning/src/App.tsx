import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

import { Shell } from '@/components/layout/Shell';
import StudentDashboard from '@/pages/student/Dashboard';
import StudentSubjects from '@/pages/student/Subjects';
import StudentProgress from '@/pages/student/Progress';
import StudentProfile from '@/pages/student/Profile';
import StudentAssignment from '@/pages/student/Assignment';
import TeacherDashboard from '@/pages/teacher/Dashboard';
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

function Router() {
  return (
    <Shell>
      <RoutedErrorBoundary>
        <Switch>
          <Route path="/" component={StudentDashboard} />
          <Route path="/subjects" component={StudentSubjects} />
          <Route path="/progress" component={StudentProgress} />
          <Route path="/profile" component={StudentProfile} />
          <Route path="/assignment/:id" component={StudentAssignment} />
          <Route path="/teacher" component={TeacherDashboard} />
          <Route path="/teacher/reviews" component={TeacherReviews} />
          <Route path="/teacher/catalog" component={TeacherCatalog} />
          <Route path="/teacher/integrations" component={TeacherIntegrations} />
          <Route component={NotFound} />
        </Switch>
      </RoutedErrorBoundary>
    </Shell>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
