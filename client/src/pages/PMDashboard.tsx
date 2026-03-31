import { useNavigate } from 'react-router-dom';
import { trpc } from '../lib/trpc.js';
import { HealthDot, StatusBadge, ProgressRing, KpiCard, formatAED, SectionHeader } from '../components/StatusBadge.js';
import { Button } from '../components/Modal.js';
import { useExportVenture } from '../hooks/useExport.js';
import { formatDate } from '../lib/format.js';

export function PMDashboard() {
  const { data, isLoading, error } = trpc.dashboard.pm.useQuery();
  const navigate = useNavigate();

  if (isLoading) return <div className="p-8 text-[var(--text-3)]">Loading venture...</div>;
  if (error) return (
    <div className="p-12 text-center">
      <div className="text-4xl mb-4">🔒</div>
      <h2 className="text-lg font-semibold text-[var(--text-0)] mb-2">No Venture Assigned</h2>
      <p className="text-sm text-[var(--text-3)]">Contact PMO to get assigned to a venture.</p>
    </div>
  );
  if (!data) return null;

  const { venture, latestUpdate, openBlockersCount, openRisksCount } = data;

  // If venture setup is not complete, redirect to first wizard step
  if (venture.setupStep < 6) {
    const STEP_ROUTES = ['resources', 'gantt', 'raci', 'risks', 'budget', 'setup/plan'];
    const route = STEP_ROUTES[venture.setupStep] ?? 'resources';
    navigate(`/venture/${venture.id}/${route}`, { replace: true });
    return null;
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-[var(--text-0)]">{venture.name}</h2>
          <div className="flex items-center gap-3 mt-1">
            <HealthDot health={venture.health} size="sm" />
            <span className="text-xs text-[var(--text-3)]">Updated {formatDate(venture.updatedAt)}</span>
          </div>
        </div>
        <ExportButtons ventureId={venture.id} />
      </div>

      {/* Hero KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-[var(--surface-0)] rounded-2xl border border-[var(--border)] p-6 flex items-center gap-4">
          <ProgressRing value={venture.completionPct} size={56} stroke={4} />
          <div>
            <div className="text-2xl font-bold text-[var(--text-0)] ltr-num">{venture.completionPct}%</div>
            <div className="text-xs text-[var(--text-3)]">Complete</div>
          </div>
        </div>
        <KpiCard label="Health" value={<HealthDot health={venture.health} />} />
        <KpiCard label="Open Risks" value={openRisksCount} accent={openRisksCount > 0 ? 'text-amber-400' : 'text-emerald-400'} />
        <KpiCard label="Blockers" value={openBlockersCount} accent={openBlockersCount > 0 ? 'text-red-400' : 'text-emerald-400'} />
      </div>

      {/* Blockers */}
      {openBlockersCount > 0 && <BlockersList ventureId={venture.id} />}

      {/* Latest update */}
      <div className="bg-[var(--surface-0)] rounded-2xl border border-[var(--border)] p-6 mb-6 animate-in">
        <SectionHeader title="Latest Update" />
        {latestUpdate ? (
          <>
            <div className="text-[10px] text-[var(--text-3)] uppercase tracking-widest mb-2">{latestUpdate.weekLabel}</div>
            <p className="text-sm text-[var(--text-1)] leading-relaxed">{latestUpdate.narrative}</p>
          </>
        ) : (
          <p className="text-sm text-[var(--text-3)]">No updates logged yet.</p>
        )}
      </div>

      {/* Quick nav */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-8">
        {[
          { label: 'Project Plan', icon: '📋', path: `/venture/${venture.id}/plan` },
          { label: 'Gantt Chart', icon: '📐', path: `/venture/${venture.id}/gantt` },
          { label: 'Budget', icon: '💰', path: `/venture/${venture.id}/budget` },
          { label: 'Resources', icon: '👥', path: `/venture/${venture.id}/resources` },
          { label: 'Risks & Issues', icon: '⚡', path: `/venture/${venture.id}/risks` },
          { label: 'Progress History', icon: '📈', path: `/venture/${venture.id}/progress` },
        ].map((item, i) => (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            className="bg-[var(--surface-0)] rounded-2xl border border-[var(--border)] p-4 text-start hover:border-[var(--border-hover)] hover:bg-[var(--surface-1)] transition-all animate-in"
            style={{ animationDelay: `${i * 40}ms` }}
          >
            <span className="text-2xl">{item.icon}</span>
            <div className="text-sm font-medium text-[var(--text-0)] mt-2">{item.label}</div>
          </button>
        ))}
      </div>

      {/* CTA */}
      <Button
        onClick={() => navigate(`/venture/${venture.id}/update`)}
        className="!w-full !py-4 !text-base !rounded-2xl"
      >
        Log This Week's Update
      </Button>
    </div>
  );
}

function BlockersList({ ventureId }: { ventureId: string }) {
  const { data } = trpc.risks.listBlockers.useQuery({ ventureId });
  const utils = trpc.useUtils();
  const resolve = trpc.risks.resolveBlocker.useMutation({ onSuccess: () => { utils.risks.listBlockers.invalidate({ ventureId }); utils.dashboard.pm.invalidate(); } });
  const openBlockers = data?.filter((b: any) => b.status === 'open') ?? [];

  if (openBlockers.length === 0) return null;

  return (
    <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-5 mb-6 pulse-warn">
      <SectionHeader
        title={`${openBlockers.length} Open Blocker${openBlockers.length > 1 ? 's' : ''}`}
      />
      <div className="space-y-3">
        {openBlockers.map((b: any) => (
          <div key={b.id} className="flex items-center justify-between gap-3">
            <div className="flex items-start gap-2">
              <span className="text-red-400 mt-0.5">●</span>
              <span className="text-sm text-[var(--text-1)]">{b.description}</span>
            </div>
            <Button variant="ghost" onClick={() => resolve.mutate({ id: b.id })} className="!text-xs">Resolve</Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ExportButtons({ ventureId }: { ventureId: string }) {
  const { exportCSV, printReport } = useExportVenture(ventureId);
  return (
    <div className="flex gap-2 no-print">
      <Button variant="ghost" onClick={exportCSV} className="!text-xs">Export CSV</Button>
      <Button variant="ghost" onClick={printReport} className="!text-xs">Print PDF</Button>
    </div>
  );
}
