import { useParams } from 'react-router-dom';
import { trpc } from '../lib/trpc.js';
import { HealthDot } from '../components/StatusBadge.js';
import { formatDate } from '../lib/format.js';

export function ProgressPage() {
  const { ventureId } = useParams<{ ventureId: string }>();
  const { data: updates, isLoading } = trpc.progress.list.useQuery({ ventureId: ventureId! });

  if (isLoading) return <div className="p-8 text-[var(--text-3)]">Loading progress...</div>;

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <h3 className="text-lg font-bold text-[var(--text-0)] mb-6">Progress History</h3>

      {(!updates || updates.length === 0) ? (
        <div className="text-center py-12">
          <div className="text-4xl mb-4">📈</div>
          <p className="text-[var(--text-3)]">No updates logged yet.</p>
        </div>
      ) : (
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute start-5 top-2 bottom-2 w-px bg-[var(--border)]" />

          <div className="space-y-6">
            {updates.map((u: any, i: number) => (
              <div key={u.id} className="relative ps-14 animate-in" style={{ animationDelay: `${i * 40}ms` }}>
                {/* Dot on timeline */}
                <div className="absolute start-3.5 top-5 w-3 h-3 rounded-full bg-[var(--accent)] border-2 border-[var(--bg)]" />

                <div className="bg-[var(--surface-0)] rounded-2xl border border-[var(--border)] p-5 hover:border-[var(--border-hover)] transition-all">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-[var(--text-0)]">{u.weekLabel ?? 'Update'}</span>
                      <HealthDot health={u.overallStatus} size="sm" />
                      <span className="text-xs text-[var(--text-2)] ltr-num bg-[var(--surface-1)] px-2 py-0.5 rounded-lg">{u.completionPct}%</span>
                    </div>
                    <span className="text-xs text-[var(--text-3)]">
                      {formatDate(u.submittedAt)}
                    </span>
                  </div>
                  <p className="text-sm text-[var(--text-1)] leading-relaxed">{u.narrative}</p>
                  {u.nextActions && (
                    <div className="text-xs text-[var(--text-3)] border-t border-[var(--border)] pt-3 mt-3">
                      <strong className="text-[var(--text-2)]">Next:</strong> {u.nextActions}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
