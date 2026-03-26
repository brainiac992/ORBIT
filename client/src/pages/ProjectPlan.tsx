import { useParams } from 'react-router-dom';
import { trpc } from '../lib/trpc.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { VentureTabs } from './PMDashboard.js';
import { useState } from 'react';

export function ProjectPlanPage() {
  const { ventureId } = useParams<{ ventureId: string }>();
  const { data: workstreams, isLoading } = trpc.workstreams.list.useQuery({ ventureId: ventureId! });

  if (isLoading) return <div className="p-8 text-center text-[var(--text-secondary)]">Loading plan...</div>;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <VentureTabs ventureId={ventureId!} active="plan" />

      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Project Plan</h3>
      </div>

      {(!workstreams || workstreams.length === 0) ? (
        <p className="text-[var(--text-secondary)]">No workstreams defined. Add your first workstream.</p>
      ) : (
        <div className="space-y-4">
          {workstreams.map(ws => (
            <WorkstreamRow key={ws.id} workstream={ws} />
          ))}
        </div>
      )}
    </div>
  );
}

function WorkstreamRow({ workstream }: { workstream: any }) {
  const [expanded, setExpanded] = useState(false);
  const { data: milestones } = trpc.milestones.list.useQuery(
    { workstreamId: workstream.id },
    { enabled: expanded }
  );

  return (
    <div className="bg-white rounded-xl border border-[var(--border)] overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-start px-5 py-4 flex items-center gap-4 hover:bg-[var(--surface-muted)] transition-colors"
      >
        <span className="text-xs text-[var(--text-secondary)]">{expanded ? '▼' : '▶'}</span>
        <div className="flex-1">
          <div className="font-medium">{workstream.name}</div>
          <div className="text-xs text-[var(--text-secondary)] mt-0.5">
            Baseline: {workstream.baselineStart ?? '—'} → {workstream.baselineEnd ?? '—'}
            {workstream.actualStart && <span className="ms-3">Actual: {workstream.actualStart} → {workstream.actualEnd ?? 'ongoing'}</span>}
          </div>
        </div>
        <StatusBadge status={workstream.status} />
        <div className="flex items-center gap-2 min-w-[80px]">
          <span className="text-sm ltr-num">{workstream.completionPct}%</span>
          <div className="w-12 bg-gray-100 rounded-full h-1.5">
            <div className="h-1.5 rounded-full bg-[var(--accent)]" style={{ width: `${workstream.completionPct}%` }} />
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-[var(--border)] px-5 py-3 bg-[var(--surface-muted)]">
          {milestones && milestones.length > 0 ? (
            <div className="space-y-2">
              {milestones.map((ms: any) => (
                <div key={ms.id} className="flex items-center gap-3 text-sm py-1">
                  <span className="text-xs">
                    {ms.status === 'achieved' ? '✅' : ms.status === 'overdue' ? '⚠️' : '◯'}
                  </span>
                  <span className="flex-1">{ms.name}</span>
                  <span className="text-xs text-[var(--text-secondary)] ltr-num">{ms.dueDate}</span>
                  {ms.actualCompletionDate && (
                    <span className="text-xs text-green-600 ltr-num">Done: {ms.actualCompletionDate}</span>
                  )}
                  <StatusBadge status={ms.status} />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-[var(--text-secondary)]">No milestones defined for this workstream.</p>
          )}
        </div>
      )}
    </div>
  );
}
