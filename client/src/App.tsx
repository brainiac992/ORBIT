import { useState, useMemo } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { trpc, getTrpcClient } from './lib/trpc.js';
import { AuthProvider, useAuth } from './lib/auth.js';
import { Shell } from './components/Shell.js';
import { LoginPage } from './pages/Login.js';
import { GMDashboard } from './pages/GMDashboard.js';
import { PMODashboard } from './pages/PMODashboard.js';
import { PMDashboard } from './pages/PMDashboard.js';
import { ProjectPlanPage } from './pages/ProjectPlan.js';
import { BudgetPage } from './pages/BudgetPage.js';
import { ProgressPage } from './pages/ProgressPage.js';
import { RisksPage } from './pages/RisksPage.js';
import { ResourcesPage } from './pages/ResourcesPage.js';
import { WeeklyUpdatePage } from './pages/WeeklyUpdate.js';

const roleHome: Record<string, string> = {
  gm: '/dashboard/gm',
  pmo: '/dashboard/pmo',
  pm: '/dashboard/pm',
};

function AppInner() {
  const { user, isLoading } = useAuth();

  if (isLoading) return <div className="min-h-screen flex items-center justify-center text-[var(--text-secondary)]">Loading...</div>;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={roleHome[user.role]} /> : <LoginPage />} />
      <Route element={user ? <Shell /> : <Navigate to="/login" />}>
        <Route path="/dashboard/gm" element={user?.role === 'gm' ? <GMDashboard /> : <RoleRedirect />} />
        <Route path="/dashboard/pmo" element={user?.role === 'pmo' ? <PMODashboard /> : <RoleRedirect />} />
        <Route path="/dashboard/pm" element={user?.role === 'pm' ? <PMDashboard /> : <RoleRedirect />} />
        <Route path="/venture/:ventureId/plan" element={<ProjectPlanPage />} />
        <Route path="/venture/:ventureId/budget" element={<BudgetPage />} />
        <Route path="/venture/:ventureId/progress" element={<ProgressPage />} />
        <Route path="/venture/:ventureId/risks" element={<RisksPage />} />
        <Route path="/venture/:ventureId/resources" element={<ResourcesPage />} />
        <Route path="/venture/:ventureId/update" element={<WeeklyUpdatePage />} />
      </Route>
      <Route path="*" element={<Navigate to={user ? roleHome[user.role] : '/login'} />} />
    </Routes>
  );
}

function RoleRedirect() {
  const { user } = useAuth();
  return <Navigate to={user ? roleHome[user.role] : '/login'} replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <TrpcWrapper>
        <BrowserRouter>
          <AppInner />
        </BrowserRouter>
      </TrpcWrapper>
    </AuthProvider>
  );
}

function TrpcWrapper({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  // Recreate client when user changes — fixes stale auth after login/switch
  const queryClient = useMemo(() => new QueryClient({
    defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
  }), [user?.azureOid]);

  const trpcClient = useMemo(
    () => getTrpcClient(user?.azureOid ?? ''),
    [user?.azureOid]
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </trpc.Provider>
  );
}
