import { lazy, Suspense } from 'react';
import { Show, SignIn, SignUp } from '@clerk/react';
import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import Layout from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useMe } from '@/hooks/useMe';
import { HOME_BY_ROLE } from '@/lib/roles';
import EmployeePortal from '@/pages/EmployeePortal';
import ManagerView from '@/pages/ManagerView';
import OnboardingDetail from '@/pages/OnboardingDetail';

// Recharts is large, so only the chart-heavy pages are split out.
const HRDashboard = lazy(() => import('@/pages/HRDashboard'));
const ObservabilityPage = lazy(() => import('@/pages/ObservabilityPage'));

function SignedOutScreen() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-gradient-to-b from-indigo-50 to-background p-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Onboarding Orchestrator</h1>
        <p className="mt-1 text-sm text-muted-foreground">AI-assisted onboarding with human approval</p>
      </div>
      <Routes>
        <Route path="/sign-in/*" element={<SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" />} />
        <Route path="/sign-up/*" element={<SignUp routing="path" path="/sign-up" signInUrl="/sign-in" />} />
        <Route path="*" element={<Navigate to="/sign-in" replace />} />
      </Routes>
    </div>
  );
}

function ProtectedLayout() {
  const { data: me, isLoading, error, refetch } = useMe();

  if (isLoading) {
    return (
      <div className="space-y-4 p-8">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (error || !me) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="font-medium">Could not load your profile</p>
        <p className="max-w-md text-sm text-muted-foreground">{error?.message}</p>
        <Button onClick={() => refetch()}>Try again</Button>
      </div>
    );
  }
  return (
    <Layout me={me}>
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <Outlet context={{ me }} />
      </Suspense>
    </Layout>
  );
}

function RequireRole({ roles }) {
  const { data: me } = useMe();
  if (!me) return null;
  return roles.includes(me.role) ? <Outlet /> : <Navigate to={HOME_BY_ROLE[me.role]} replace />;
}

function RoleRedirect() {
  const { data: me } = useMe();
  return <Navigate to={HOME_BY_ROLE[me?.role ?? 'employee']} replace />;
}

export default function App() {
  return (
    <>
      <Show when="signed-out">
        <SignedOutScreen />
      </Show>
      <Show when="signed-in">
        <Routes>
          <Route element={<ProtectedLayout />}>
            <Route index element={<RoleRedirect />} />
            <Route element={<RequireRole roles={['hr']} />}>
              <Route path="/hr" element={<HRDashboard />} />
              <Route path="/hr/onboarding/:planId" element={<OnboardingDetail />} />
              <Route path="/hr/observability" element={<ObservabilityPage />} />
            </Route>
            <Route element={<RequireRole roles={['manager']} />}>
              <Route path="/manager" element={<ManagerView />} />
            </Route>
            <Route element={<RequireRole roles={['employee']} />}>
              <Route path="/portal" element={<EmployeePortal />} />
            </Route>
            <Route path="*" element={<RoleRedirect />} />
          </Route>
        </Routes>
      </Show>
    </>
  );
}
