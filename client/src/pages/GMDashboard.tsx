import { useState } from 'react';
import { trpc } from '../lib/trpc.js';
import { HealthDot, StatusBadge, formatAED } from '../components/StatusBadge.js';

export function GMDashboard() {
  const { data, isLoading, error } = trpc.dashboard.gm.useQuery();
  const [selectedVentureId, setSelectedVentureId] = useState<string | null>(null);

  if (isLoading) return <div className="p-8 text-center text-[var(--text-secondary)]">Loading portfolio...</div>;
  if (error) return <div className="p-8 text-center text-red-600">Unable to load portfolio data. Please try again.</div>;
  if (!data || data.ventures.length === 0) {
    return <div className="p-8 text-center text-[var(--text-secondary)]">No active ventures</div>;
  }

  const { summary, ventures } = data;
  const selectedVenture = ventures.find(v => v.id === selectedVentureId);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h2 className="text-xl font-semibold mb-6">Portfolio Health</h2>

      {/* Summary bar */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <SummaryTile label="Active Ventures" value={summary.totalActive} />
        <SummaryTile label="On Track" value={summary.onTrack} color="text-green-600" />
        <SummaryTile label="At Risk" value={summary.atRisk} color="text-amber-600" />
        <SummaryTile label="Off Track" value={summary.offTrack} color="text-red-600" />
        <div className="bg-white rounded-xl border border-[var(--border)] p-4">
          <div className="text-xs text-[var(--text-secondary)] mb-1">Portfolio Budget</div>
          <div className="text-sm font-medium ltr-num">{formatAED(summary.totalApprovedBudget)}</div>
          <div className="text-xs text-[var(--text-secondary)] ltr-num">Forecast: {formatAED(summary.totalForecast)}</div>
        </div>
      </div>

      {/* Venture cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {ventures.map(v => (
          <button
            key={v.id}
            onClick={() => setSelectedVentureId(v.id === selectedVentureId ? null : v.id)}
            className={`text-start w-full bg-white rounded-xl border p-5 transition-all hover:shadow-sm ${
              v.id === selectedVentureId ? 'border-[var(--accent)] ring-1 ring-[var(--accent)]' : 'border-[var(--border)]'
            }`}
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="font-medium">{v.name}</div>
                <div className="text-sm text-[var(--text-secondary)]">{v.pmName}</div>
              </div>
              <HealthDot health={v.health} />
            </div>
            <div className="flex items-center gap-4 text-sm">
              <span className="ltr-num">{v.completionPct}%</span>
              <div className="flex-1 bg-gray-100 rounded-full h-2">
                <div
                  className="h-2 rounded-full bg-[var(--accent)]"
                  style={{ width: `${v.completionPct}%` }}
                />
              </div>
              <StatusBadge status={v.budgetStatus} />
              {v.escalationCount > 0 && (
                <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
                  {v.escalationCount} escalation{v.escalationCount > 1 ? 's' : ''}
                </span>
              )}
            </div>
          </button>
        ))}
      </div>

      {/* Venture detail drawer */}
      {selectedVenture && (
        <VentureDrawer ventureId={selectedVenture.id} name={selectedVenture.name} onClose={() => setSelectedVentureId(null)} />
      )}
    </div>
  );
}

function VentureDrawer({ ventureId, name, onClose }: { ventureId: string; name: string; onClose: () => void }) {
  const { data: latest } = trpc.progress.latest.useQuery({ ventureId });
  const { data: budgetSummary } = trpc.budget.summary.useQuery({ ventureId });
  const { data: risks } = trpc.risks.listRisks.useQuery({ ventureId });

  const openRisks = risks?.filter(r => r.status === 'open').length ?? 0;
  const escalations = risks?.filter(r => r.escalated).length ?? 0;

  return (
    <div className="fixed inset-y-0 end-0 w-full max-w-md bg-white shadow-lg border-s border-[var(--border)] z-50 overflow-y-auto">
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold">{name}</h3>
          <button onClick={onClose} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xl">&times;</button>
        </div>

        {/* Latest update */}
        <Section title="Latest Update">
          {latest ? (
            <>
              <div className="text-xs text-[var(--text-secondary)] mb-1">{latest.weekLabel}</div>
              <p className="text-sm">{latest.narrative}</p>
            </>
          ) : (
            <p className="text-sm text-[var(--text-secondary)]">No updates submitted yet.</p>
          )}
        </Section>

        {/* Budget */}
        <Section title="Budget">
          {budgetSummary ? (
            <div className="space-y-1 text-sm">
              <div className="flex justify-between"><span>Approved</span><span className="ltr-num">{formatAED(budgetSummary.approvedBudget)}</span></div>
              <div className="flex justify-between"><span>Forecast</span><span className="ltr-num">{formatAED(budgetSummary.forecastAtCompletion)}</span></div>
              <div className="flex justify-between items-center"><span>Status</span><StatusBadge status={budgetSummary.budgetStatus} /></div>
            </div>
          ) : (
            <p className="text-sm text-[var(--text-secondary)]">Loading...</p>
          )}
        </Section>

        {/* Risks */}
        <Section title="Risks">
          <div className="text-sm space-y-1">
            <div>Open risks: {openRisks}</div>
            <div>Escalations: {escalations}</div>
          </div>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5 pb-5 border-b border-[var(--border)] last:border-0">
      <h4 className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide mb-2">{title}</h4>
      {children}
    </div>
  );
}

function SummaryTile({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="bg-white rounded-xl border border-[var(--border)] p-4">
      <div className="text-xs text-[var(--text-secondary)] mb-1">{label}</div>
      <div className={`text-2xl font-semibold ${color ?? ''}`}>{value}</div>
    </div>
  );
}
