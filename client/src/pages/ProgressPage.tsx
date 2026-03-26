import { useParams } from 'react-router-dom';
import { trpc } from '../lib/trpc.js';
import { HealthDot } from '../components/StatusBadge.js';
import { VentureTabs } from './PMDashboard.js';

export function ProgressPage() {
  const { ventureId } = useParams<{ ventureId: string }>();
  const { data: updates, isLoading } = trpc.progress.list.useQuery({ ventureId: ventureId! });

  if (isLoading) return <div className="p-8 text-center text-[var(--text-secondary)]">Loading progress...</div>;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <VentureTabs ventureId={ventureId!} active="progress" />

      <h3 className="text-lg font-semibold mb-4">Progress History</h3>

      {(!updates || updates.length === 0) ? (
        <p className="text-[var(--text-secondary)]">No updates logged yet.</p>
      ) : (
        <div className="space-y-4">
          {updates.map((u: any) => (
            <div key={u.id} className="bg-white rounded-xl border border-[var(--border)] p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium">{u.weekLabel ?? 'Update'}</span>
                  <HealthDot health={u.overallStatus} />
                  <span className="text-sm ltr-num">{u.completionPct}%</span>
                </div>
                <span className="text-xs text-[var(--text-secondary)]">
                  {new Date(u.submittedAt).toLocaleDateString()}
                </span>
              </div>
              <p className="text-sm mb-2">{u.narrative}</p>
              {u.nextActions && (
                <div className="text-xs text-[var(--text-secondary)] border-t border-[var(--border)] pt-2 mt-2">
                  <strong>Next:</strong> {u.nextActions}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
