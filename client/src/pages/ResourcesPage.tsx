import { useParams } from 'react-router-dom';
import { trpc } from '../lib/trpc.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { VentureTabs } from './PMDashboard.js';

export function ResourcesPage() {
  const { ventureId } = useParams<{ ventureId: string }>();
  const { data, isLoading } = trpc.resources.listForVenture.useQuery({ ventureId: ventureId! });

  if (isLoading) return <div className="p-8 text-center text-[var(--text-secondary)]">Loading resources...</div>;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <VentureTabs ventureId={ventureId!} active="resources" />

      <h3 className="text-lg font-semibold mb-4">Resources</h3>

      {(!data || data.length === 0) ? (
        <p className="text-[var(--text-secondary)]">No resources assigned to this venture.</p>
      ) : (
        <div className="bg-white rounded-xl border border-[var(--border)] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[var(--surface-muted)] text-[var(--text-secondary)] text-xs uppercase tracking-wide">
                <th className="text-start px-4 py-3">Name</th>
                <th className="text-start px-4 py-3">Type</th>
                <th className="text-start px-4 py-3">Role</th>
                <th className="text-start px-4 py-3">HpW</th>
                <th className="text-start px-4 py-3">Start</th>
                <th className="text-start px-4 py-3">End</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r: any) => (
                r.assignments.map((a: any) => (
                  <tr key={a.id} className="border-t border-[var(--border)]">
                    <td className="px-4 py-3 font-medium">{r.name}</td>
                    <td className="px-4 py-3"><StatusBadge status={r.type} /></td>
                    <td className="px-4 py-3">{r.roleTitle ?? '—'}</td>
                    <td className="px-4 py-3 ltr-num">{a.hoursPerWeek}h</td>
                    <td className="px-4 py-3 ltr-num">{a.startDate}</td>
                    <td className="px-4 py-3 ltr-num">{a.endDate ?? 'Ongoing'}</td>
                  </tr>
                ))
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
