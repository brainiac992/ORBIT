import { trpc } from '../lib/trpc.js';
import { useAuth } from '../lib/auth.js';

const actionIcons: Record<string, string> = {
  created: '➕', updated: '✏️', deleted: '🗑', escalated: '🔺', resolved: '✅', approved: '👍', rejected: '❌',
};

const actionColors: Record<string, string> = {
  created: 'text-emerald-400', updated: 'text-blue-400', deleted: 'text-red-400',
  escalated: 'text-red-400', resolved: 'text-emerald-400', approved: 'text-emerald-400', rejected: 'text-red-400',
};

export function ActivityPage() {
  const { user } = useAuth();

  // For PM, we need their venture ID — get it from dashboard
  const { data: pmData } = trpc.dashboard.pm.useQuery(undefined, { enabled: user?.role === 'pm' });
  const ventureId = pmData?.venture?.id;

  // PMO sees all activity — use first venture as proxy (or we'd need a cross-venture audit endpoint)
  // For now show a message if no ventureId
  const { data: ventures } = trpc.ventures.list.useQuery(undefined, { enabled: user?.role === 'pmo' });
  const allVentureIds = ventures?.map((v: any) => v.id) ?? [];

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <h2 className="text-2xl font-bold text-[var(--text-0)] mb-8">Activity Feed</h2>

      {user?.role === 'pm' && ventureId && <VentureActivity ventureId={ventureId} />}
      {user?.role === 'pmo' && allVentureIds.map((vid: string) => (
        <div key={vid} className="mb-8">
          <VentureActivity ventureId={vid} />
        </div>
      ))}
      {user?.role === 'gm' && <p className="text-[var(--text-3)]">Activity feed is not available for GM role.</p>}
    </div>
  );
}

function VentureActivity({ ventureId }: { ventureId: string }) {
  const { data, isLoading } = trpc.audit.list.useQuery({ ventureId });

  if (isLoading) return <div className="text-[var(--text-3)]">Loading activity...</div>;
  if (!data || data.length === 0) return <p className="text-[var(--text-3)]">No activity recorded yet.</p>;

  // Group by date
  const grouped: Record<string, typeof data> = {};
  data.forEach((entry: any) => {
    const date = new Date(entry.changedAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    (grouped[date] ??= []).push(entry);
  });

  return (
    <div>
      {Object.entries(grouped).map(([date, entries]) => (
        <div key={date} className="mb-6">
          <div className="text-[10px] font-semibold text-[var(--text-3)] uppercase tracking-widest mb-3">{date}</div>
          <div className="space-y-1">
            {(entries as any[]).map((entry: any, i: number) => (
              <div
                key={entry.id}
                className="flex items-start gap-3 px-4 py-3 rounded-xl hover:bg-[var(--surface-0)] transition-colors animate-in"
                style={{ animationDelay: `${i * 30}ms` }}
              >
                <span className="text-base mt-0.5">{actionIcons[entry.action] ?? '📝'}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-[var(--text-1)]">
                    <span className={`font-medium ${actionColors[entry.action] ?? ''}`}>{entry.action}</span>
                    {' '}
                    <span className="text-[var(--text-2)]">{entry.entityType}</span>
                    {entry.fieldName && (
                      <span className="text-[var(--text-3)]"> — {entry.fieldName}</span>
                    )}
                  </div>
                  {(entry.oldValue || entry.newValue) && (
                    <div className="text-xs text-[var(--text-3)] mt-1 font-mono">
                      {entry.oldValue && <span className="line-through me-2">{entry.oldValue}</span>}
                      {entry.newValue && <span className="text-[var(--text-2)]">{entry.newValue}</span>}
                    </div>
                  )}
                </div>
                <span className="text-[10px] text-[var(--text-3)] whitespace-nowrap">
                  {new Date(entry.changedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
