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
import { GanttPage } from './pages/GanttPage.js';
import { BudgetPage } from './pages/BudgetPage.js';
import { ProgressPage } from './pages/ProgressPage.js';
import { RisksPage } from './pages/RisksPage.js';
import { RaciPage } from './pages/RaciPage.js';
import { IssuesPage } from './pages/IssuesPage.js';
import { ResourcesPage } from './pages/ResourcesPage.js';
import { WeeklyUpdatePage } from './pages/WeeklyUpdate.js';
import { ActivityPage } from './pages/ActivityPage.js';
import { ApprovalsPage } from './pages/ApprovalsPage.js';
import { ConfigPage } from './pages/ConfigPage.js';
import { AIPlanPage } from './pages/AIPlanPage.js';
import { ArtifactsPage } from './pages/ArtifactsPage.js';
import { VentureLayout } from './components/VentureLayout.js';
import { JiraSettingsPage } from './pages/JiraSettingsPage.js';
import { JiraImportPage } from './pages/JiraImportPage.js';
import { JiraSyncDashboard } from './pages/JiraSyncDashboard.js';
import { JiraStatusMappingsPage } from './pages/JiraStatusMappingsPage.js';

const roleHome: Record<string, string> = {
  gm: '/dashboard/gm',
  pmo: '/dashboard/pmo',
  pm: '/dashboard/pm',
};

function AppInner() {
  const { user, isLoading } = useAuth();

  if (isLoading) return <div className="min-h-screen flex items-center justify-center text-[var(--text-3)]">Loading...</div>;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={roleHome[user.role]} /> : <LoginPage />} />
      <Route element={user ? <Shell /> : <Navigate to="/login" />}>
        <Route path="/dashboard/gm" element={user?.role === 'gm' ? <GMDashboard /> : <RoleRedirect />} />
        <Route path="/dashboard/pmo" element={user?.role === 'pmo' ? <PMODashboard /> : <RoleRedirect />} />
        <Route path="/dashboard/pm" element={user?.role === 'pm' ? <PMDashboard /> : <RoleRedirect />} />
        <Route path="/venture/:ventureId" element={<VentureLayout />}>
          <Route path="plan" element={<ProjectPlanPage />} />
          <Route path="gantt" element={<GanttPage />} />
          <Route path="budget" element={<BudgetPage />} />
          <Route path="progress" element={<ProgressPage />} />
          <Route path="risks" element={<RisksPage />} />
          <Route path="issues" element={<IssuesPage />} />
          <Route path="raci" element={<RaciPage />} />
          <Route path="resources" element={<ResourcesPage />} />
          <Route path="update" element={<WeeklyUpdatePage />} />
          <Route path="setup/plan" element={<AIPlanPage />} />
          <Route path="artifacts" element={<ArtifactsPage />} />
        </Route>
        <Route path="/activity" element={user?.role !== 'gm' ? <ActivityPage /> : <RoleRedirect />} />
        <Route path="/approvals" element={user?.role === 'pmo' ? <ApprovalsPage /> : <RoleRedirect />} />
        <Route path="/admin/config" element={user?.role === 'pmo' ? <ConfigPage /> : <RoleRedirect />}>
          <Route path="jira" element={<JiraSettingsPage />} />
          <Route path="jira/import" element={<JiraImportPage />} />
          <Route path="jira/sync" element={<JiraSyncDashboard />} />
          <Route path="jira/mappings" element={<JiraStatusMappingsPage />} />
        </Route>
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
