import { useParams } from 'react-router-dom';
import { trpc } from '../lib/trpc.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { VentureTabs } from './PMDashboard.js';

export function RisksPage() {
  const { ventureId } = useParams<{ ventureId: string }>();
  const { data: risksList, isLoading: risksLoading } = trpc.risks.listRisks.useQuery({ ventureId: ventureId! });
  const { data: issuesList, isLoading: issuesLoading } = trpc.risks.listIssues.useQuery({ ventureId: ventureId! });

  if (risksLoading || issuesLoading) return <div className="p-8 text-center text-[var(--text-secondary)]">Loading risks...</div>;

  const openRisks = risksList?.filter(r => r.status === 'open') ?? [];
  const closedRisks = risksList?.filter(r => r.status !== 'open') ?? [];
  const openIssues = issuesList?.filter(i => i.status !== 'resolved') ?? [];
  const resolvedIssues = issuesList?.filter(i => i.status === 'resolved') ?? [];

  const ragBorder: Record<string, string> = {
    red: 'border-s-4 border-s-red-500',
    amber: 'border-s-4 border-s-amber-500',
    green: 'border-s-4 border-s-green-500',
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <VentureTabs ventureId={ventureId!} active="risks" />

      {/* Risks */}
      <h3 className="text-lg font-semibold mb-4">Risks</h3>
      {openRisks.length === 0 ? (
        <p className="text-[var(--text-secondary)] mb-6">No open risks.</p>
      ) : (
        <div className="space-y-3 mb-6">
          {openRisks.map(r => (
            <div key={r.id} className={`bg-white rounded-lg border border-[var(--border)] p-4 ${ragBorder[r.rag] ?? ''}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-sm">{r.title}</span>
                <StatusBadge status={r.status} />
              </div>
              <div className="flex gap-4 text-xs text-[var(--text-secondary)] mb-2">
                <span>Impact: {r.impact}</span>
                <span>Probability: {r.probability}</span>
                <span>Owner: {r.owner ?? '—'}</span>
              </div>
              {r.mitigationPlan && <p className="text-xs text-[var(--text-secondary)]">Mitigation: {r.mitigationPlan}</p>}
              {r.escalated && (
                <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full mt-2 inline-block">Escalated</span>
              )}
            </div>
          ))}
        </div>
      )}

      {closedRisks.length > 0 && (
        <details className="mb-8">
          <summary className="text-sm text-[var(--text-secondary)] cursor-pointer mb-2">
            Closed Risks ({closedRisks.length})
          </summary>
          <div className="space-y-2">
            {closedRisks.map(r => (
              <div key={r.id} className="bg-gray-50 rounded-lg p-3 text-sm text-[var(--text-secondary)]">
                {r.title} — <StatusBadge status={r.status} />
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Issues */}
      <h3 className="text-lg font-semibold mb-4">Issues</h3>
      {openIssues.length === 0 ? (
        <p className="text-[var(--text-secondary)] mb-6">No open issues.</p>
      ) : (
        <div className="space-y-3 mb-6">
          {openIssues.map(i => (
            <div key={i.id} className="bg-white rounded-lg border border-[var(--border)] p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-sm">{i.title}</span>
                <StatusBadge status={i.status} />
              </div>
              <div className="flex gap-4 text-xs text-[var(--text-secondary)] mb-1">
                <span>Severity: {i.severity}</span>
                <span>Owner: {i.owner ?? '—'}</span>
              </div>
              {i.resolutionPlan && <p className="text-xs text-[var(--text-secondary)]">Resolution: {i.resolutionPlan}</p>}
              {i.escalated && (
                <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full mt-2 inline-block">Escalated</span>
              )}
            </div>
          ))}
        </div>
      )}

      {resolvedIssues.length > 0 && (
        <details>
          <summary className="text-sm text-[var(--text-secondary)] cursor-pointer mb-2">
            Resolved Issues ({resolvedIssues.length})
          </summary>
          <div className="space-y-2">
            {resolvedIssues.map(i => (
              <div key={i.id} className="bg-gray-50 rounded-lg p-3 text-sm text-[var(--text-secondary)]">
                {i.title} — <StatusBadge status={i.status} />
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
