import { trpc } from '../lib/trpc.js';
import { useAuth } from '../lib/auth.js';
import { formatDate } from '../lib/format.js';

const actionIcons: Record<string, string> = {
  created: '➕', updated: '✏️', deleted: '🗑', escalated: '🔺', resolved: '✅', approved: '👍', rejected: '❌',
};

const actionColors: Record<string, string> = {
  created: 'text-emerald-400', updated: 'text-blue-400', deleted: 'text-red-400',
  escalated: 'text-red-400', resolved: 'text-emerald-400', approved: 'text-emerald-400', rejected: 'text-red-400',
};

export function ActivityPage() {
  const { user } = useAuth();
  const { data: pmData } = trpc.dashboard.pm.useQuery(undefined, { enabled: user?.role === 'pm' });
  const { data: ventures } = trpc.ventures.list.useQuery(undefined, { enabled: user?.role === 'pmo' });

  const ventureIds = user?.role === 'pm'
    ? (pmData?.venture?.id ? [pmData.venture.id] : [])
    : (ventures?.map((v: any) => v.id) ?? []);

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <h2 className="text-2xl font-bold text-[var(--text-0)] mb-8">Activity Feed</h2>
      {ventureIds.length > 0 ? (
        <CombinedActivity ventureIds={ventureIds} />
      ) : (
        <EmptyActivity />
      )}
    </div>
  );
}

function CombinedActivity({ ventureIds }: { ventureIds: string[] }) {
  // Fetch all venture audit trails
  const queries = ventureIds.map(id => trpc.audit.list.useQuery({ ventureId: id }));
  const isLoading = queries.some(q => q.isLoading);

  if (isLoading) return <div className="text-[var(--text-3)]">Loading activity...</div>;

  // Combine all entries and sort by date desc
  const allEntries = queries.flatMap(q => (q.data as any[]) ?? []);
  allEntries.sort((a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime());

  if (allEntries.length === 0) return <EmptyActivity />;

  // Group by date
  const grouped: Record<string, any[]> = {};
  allEntries.forEach(entry => {
    const date = formatDate(entry.changedAt);
    (grouped[date] ??= []).push(entry);
  });

  return (
    <div>
      {Object.entries(grouped).map(([date, entries]) => (
        <div key={date} className="mb-6">
          <div className="text-[10px] font-semibold text-[var(--text-3)] uppercase tracking-widest mb-3">{date}</div>
          <div className="space-y-1">
            {entries.map((entry: any, i: number) => (
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
                    {entry.fieldName && <span className="text-[var(--text-3)]"> — {entry.fieldName}</span>}
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

function EmptyActivity() {
  return (
    <div className="text-center py-12">
      <div className="text-4xl mb-4">⏱</div>
      <h3 className="text-base font-semibold text-[var(--text-0)] mb-2">No Activity Yet</h3>
      <p className="text-sm text-[var(--text-3)]">Changes will appear here as you work on ventures.</p>
    </div>
  );
}
