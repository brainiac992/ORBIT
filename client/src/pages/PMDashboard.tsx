import { useNavigate } from 'react-router-dom';
import { trpc } from '../lib/trpc.js';
import { HealthDot, StatusBadge, formatAED } from '../components/StatusBadge.js';

export function PMDashboard() {
  const { data, isLoading, error } = trpc.dashboard.pm.useQuery();
  const navigate = useNavigate();

  if (isLoading) return <div className="p-8 text-center text-[var(--text-secondary)]">Loading venture...</div>;
  if (error) return <div className="p-8 text-center text-[var(--text-secondary)]">No venture assigned to you. Contact PMO.</div>;
  if (!data) return null;

  const { venture, latestUpdate, openBlockersCount, openRisksCount } = data;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">{venture.name}</h2>
        <HealthDot health={venture.health} />
      </div>

      {/* Tabs */}
      <VentureTabs ventureId={venture.id} active="overview" />

      {/* KPI tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KpiTile label="Health" value={<HealthDot health={venture.health} />} />
        <KpiTile label="Completion" value={<span className="ltr-num text-lg font-semibold">{venture.completionPct}%</span>} />
        <KpiTile
          label="Budget"
          value={<BudgetQuick ventureId={venture.id} />}
        />
        <KpiTile label="Open Risks" value={<span className="text-lg font-semibold">{openRisksCount}</span>} />
      </div>

      {/* Latest blocker */}
      {openBlockersCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
          <div className="text-xs font-medium text-amber-700 uppercase tracking-wide mb-1">Open Blockers: {openBlockersCount}</div>
        </div>
      )}

      {/* Latest update narrative */}
      <div className="bg-white rounded-xl border border-[var(--border)] p-5 mb-6">
        <h3 className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide mb-2">Latest Update</h3>
        {latestUpdate ? (
          <>
            <p className="text-sm text-[var(--text-secondary)] mb-1">{latestUpdate.weekLabel}</p>
            <p className="text-sm">{latestUpdate.narrative}</p>
          </>
        ) : (
          <p className="text-sm text-[var(--text-secondary)]">No updates logged yet.</p>
        )}
      </div>

      {/* CTA */}
      <button
        onClick={() => navigate(`/venture/${venture.id}/update`)}
        className="w-full bg-[var(--accent)] text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors"
      >
        Log This Week's Update
      </button>
    </div>
  );
}

function BudgetQuick({ ventureId }: { ventureId: string }) {
  const { data } = trpc.budget.summary.useQuery({ ventureId });
  if (!data) return <span className="text-sm text-[var(--text-secondary)]">—</span>;
  return <StatusBadge status={data.budgetStatus} />;
}

function KpiTile({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-[var(--border)] p-4">
      <div className="text-xs text-[var(--text-secondary)] mb-2">{label}</div>
      {value}
    </div>
  );
}

export function VentureTabs({ ventureId, active }: { ventureId: string; active: string }) {
  const navigate = useNavigate();
  const tabs = [
    { id: 'overview', label: 'Overview', path: '/dashboard/pm' },
    { id: 'plan', label: 'Project Plan', path: `/venture/${ventureId}/plan` },
    { id: 'resources', label: 'Resources', path: `/venture/${ventureId}/resources` },
    { id: 'budget', label: 'Budget', path: `/venture/${ventureId}/budget` },
    { id: 'progress', label: 'Progress', path: `/venture/${ventureId}/progress` },
    { id: 'risks', label: 'Risks & Issues', path: `/venture/${ventureId}/risks` },
  ];

  return (
    <div className="flex gap-1 mb-6 border-b border-[var(--border)] overflow-x-auto">
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => navigate(tab.path)}
          className={`px-4 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
            active === tab.id
              ? 'border-[var(--accent)] text-[var(--accent)]'
              : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
