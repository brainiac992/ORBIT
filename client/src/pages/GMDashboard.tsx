import { useState } from 'react';
import { trpc } from '../lib/trpc.js';
import { HealthDot, StatusBadge, ProgressRing, formatAED } from '../components/StatusBadge.js';
import { Button } from '../components/Modal.js';

export function GMDashboard() {
  const { data, isLoading, error } = trpc.dashboard.gm.useQuery();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (isLoading) return <Loading />;
  if (error) return <div className="p-8 text-center text-red-400">Unable to load portfolio data.</div>;
  if (!data || data.ventures.length === 0) {
    return (
      <div className="p-12 text-center">
        <div className="text-4xl mb-4">🏗</div>
        <h2 className="text-lg font-semibold text-[var(--text-0)] mb-2">No Active Ventures</h2>
        <p className="text-sm text-[var(--text-3)]">Ventures will appear here once created by PMO.</p>
      </div>
    );
  }

  const { summary, ventures } = data;
  const selected = ventures.find(v => v.id === selectedId);
  const total = summary.totalActive;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h2 className="text-2xl font-bold text-[var(--text-0)] mb-6">Portfolio Health</h2>

      {/* KPI strip — larger numbers */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        {[
          { label: 'Active',    value: summary.totalActive,               color: 'text-[var(--text-0)]' },
          { label: 'On Track',  value: summary.onTrack,                   color: 'text-emerald-400'      },
          { label: 'At Risk',   value: summary.atRisk,                    color: 'text-amber-400'        },
          { label: 'Off Track', value: summary.offTrack,                  color: 'text-red-400'          },
          { label: 'Budget',    value: formatAED(summary.totalApprovedBudget), color: 'text-[var(--text-0)]', sub: `Forecast ${formatAED(summary.totalForecast)}` },
        ].map(card => (
          <div key={card.label} className="bg-[var(--surface-0)] rounded-2xl border border-[var(--border)] p-5">
            <div className={`text-2xl font-bold ltr-num mb-1 ${card.color}`}>{card.value}</div>
            <div className="text-[10px] font-semibold text-[var(--text-3)] uppercase tracking-wider">{card.label}</div>
            {card.sub && <div className="text-[10px] text-[var(--text-3)] mt-0.5">{card.sub}</div>}
          </div>
        ))}
      </div>

      {/* Portfolio health bar */}
      {total > 0 && (
        <div className="bg-[var(--surface-0)] rounded-2xl border border-[var(--border)] px-5 py-4 mb-6">
          <div className="text-[10px] font-semibold text-[var(--text-3)] uppercase tracking-widest mb-3">Health Distribution</div>
          <div className="flex h-2.5 rounded-full overflow-hidden gap-px">
            {summary.onTrack  > 0 && <div className="bg-emerald-500" style={{ width: `${(summary.onTrack  / total) * 100}%` }} />}
            {summary.atRisk   > 0 && <div className="bg-amber-500"   style={{ width: `${(summary.atRisk   / total) * 100}%` }} />}
            {summary.offTrack > 0 && <div className="bg-red-500"     style={{ width: `${(summary.offTrack / total) * 100}%` }} />}
            {summary.complete > 0 && <div className="bg-[var(--accent)]" style={{ width: `${(summary.complete / total) * 100}%` }} />}
          </div>
          <div className="flex flex-wrap gap-5 mt-3 text-xs text-[var(--text-3)]">
            {summary.onTrack  > 0 && <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" />On Track — {summary.onTrack}</span>}
            {summary.atRisk   > 0 && <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500" />At Risk — {summary.atRisk}</span>}
            {summary.offTrack > 0 && <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500" />Off Track — {summary.offTrack}</span>}
            {summary.complete > 0 && <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[var(--accent)]" />Complete — {summary.complete}</span>}
          </div>
        </div>
      )}

      {/* Venture cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {ventures.map((v, i) => (
          <button
            key={v.id}
            onClick={() => setSelectedId(v.id === selectedId ? null : v.id)}
            className={`group text-start rounded-2xl border p-6 transition-all animate-in hover:shadow-lg hover:shadow-black/20 ${
              v.id === selectedId
                ? 'border-[var(--accent)] bg-[var(--accent-dim)]'
                : 'border-[var(--border)] bg-[var(--surface-0)] hover:border-[var(--border-hover)]'
            }`}
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="text-base font-semibold text-[var(--text-0)]">{v.name}</div>
                <div className="text-xs text-[var(--text-3)] mt-0.5">{v.pmName}</div>
              </div>
              <ProgressRing value={v.completionPct} size={48} stroke={4} />
            </div>

            <div className="flex items-center gap-3 mb-3">
              <HealthDot health={v.health} size="sm" />
              <span className="text-xs text-[var(--text-3)] ltr-num">{v.completionPct}%</span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <StatusBadge status={v.budgetStatus} size="xs" />
              {v.escalationCount > 0 && (
                <span className="bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full font-medium pulse-warn">
                  {v.escalationCount} escalation{v.escalationCount > 1 ? 's' : ''}
                </span>
              )}
            </div>
          </button>
        ))}
      </div>

      {/* Drawer */}
      {selected && <VentureDrawer venture={selected} onClose={() => setSelectedId(null)} />}
    </div>
  );
}

function VentureDrawer({ venture, onClose }: { venture: any; onClose: () => void }) {
  const { data: latest } = trpc.progress.latest.useQuery({ ventureId: venture.id });
  const { data: budget } = trpc.budget.summary.useQuery({ ventureId: venture.id });
  const { data: risks } = trpc.risks.listRisks.useQuery({ ventureId: venture.id });

  const openRisks = risks?.filter((r: any) => r.status === 'open').length ?? 0;
  const escalations = risks?.filter((r: any) => r.escalated).length ?? 0;

  return (
    <div className="fixed inset-y-0 end-0 w-full max-w-md bg-[var(--surface-0)] border-s border-[var(--border)] z-50 overflow-y-auto shadow-2xl animate-slide">
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-bold text-[var(--text-0)]">{venture.name}</h3>
            <div className="text-xs text-[var(--text-3)] mt-0.5">{venture.pmName}</div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-[var(--surface-1)] flex items-center justify-center text-[var(--text-3)] hover:text-[var(--text-0)] transition-colors">&times;</button>
        </div>

        {/* Health + Progress */}
        <div className="flex items-center gap-6 mb-6 p-4 rounded-xl bg-[var(--surface-1)]">
          <ProgressRing value={venture.completionPct} size={72} stroke={5} />
          <div>
            <div className="text-2xl font-bold text-[var(--text-0)] ltr-num">{venture.completionPct}%</div>
            <HealthDot health={venture.health} size="sm" />
          </div>
        </div>

        <DrawerSection title="Latest Update">
          {latest ? (
            <>
              <div className="text-[10px] text-[var(--text-3)] uppercase tracking-wider mb-1">{latest.weekLabel}</div>
              <p className="text-sm text-[var(--text-1)]">{latest.narrative}</p>
            </>
          ) : (
            <p className="text-sm text-[var(--text-3)]">No updates yet.</p>
          )}
        </DrawerSection>

        <DrawerSection title="Budget">
          {budget ? (
            <div className="space-y-2 text-sm">
              <Row label="Approved" value={formatAED(budget.approvedBudget)} />
              <Row label="Forecast" value={formatAED(budget.forecastAtCompletion)} />
              <Row label="Status" value={<StatusBadge status={budget.budgetStatus} size="xs" />} />
            </div>
          ) : <p className="text-sm text-[var(--text-3)]">Loading...</p>}
        </DrawerSection>

        <DrawerSection title="Risks">
          <div className="flex gap-6 text-sm">
            <span className="text-[var(--text-2)]">Open: <strong className="text-[var(--text-0)]">{openRisks}</strong></span>
            <span className="text-[var(--text-2)]">Escalated: <strong className="text-red-400">{escalations}</strong></span>
          </div>
        </DrawerSection>
      </div>
    </div>
  );
}

function DrawerSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5 pb-5 border-b border-[var(--border)] last:border-0">
      <h4 className="text-[10px] font-semibold text-[var(--text-3)] uppercase tracking-widest mb-3">{title}</h4>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-[var(--text-2)]">{label}</span>
      <span className="text-[var(--text-0)] font-medium ltr-num">{value}</span>
    </div>
  );
}

function Loading() {
  return (
    <div className="p-8">
      <div className="h-8 w-48 bg-[var(--surface-1)] rounded-xl mb-8 animate-pulse" />
      <div className="grid grid-cols-5 gap-4 mb-10">
        {[...Array(5)].map((_, i) => <div key={i} className="h-24 bg-[var(--surface-0)] rounded-2xl animate-pulse" />)}
      </div>
      <div className="grid grid-cols-3 gap-5">
        {[...Array(3)].map((_, i) => <div key={i} className="h-40 bg-[var(--surface-0)] rounded-2xl animate-pulse" />)}
      </div>
    </div>
  );
}
