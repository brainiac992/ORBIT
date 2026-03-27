import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { trpc } from '../lib/trpc.js';
import { SectionHeader } from '../components/StatusBadge.js';
import { Select, Button } from '../components/Modal.js';
import { useAuth } from '../lib/auth.js';

// ── RACI role color badges ──────────────────────

const RACI_COLORS: Record<string, string> = {
  responsible: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
  accountable: 'bg-red-500/15 text-red-400 border-red-500/30',
  consulted: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  informed: 'bg-gray-500/15 text-gray-400 border-gray-500/30',
};

const RACI_SHORT: Record<string, string> = {
  responsible: 'R',
  accountable: 'A',
  consulted: 'C',
  informed: 'I',
};

function RaciBadge({ role, name, onRemove }: { role: string; name: string; onRemove?: () => void }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${RACI_COLORS[role] ?? RACI_COLORS.informed}`}>
      {name}
      {onRemove && (
        <button
          onClick={e => { e.stopPropagation(); onRemove(); }}
          className="ml-0.5 text-current opacity-60 hover:opacity-100 cursor-pointer"
          title="Remove assignment"
        >
          x
        </button>
      )}
    </span>
  );
}

// ── Main RACI Page ──────────────────────────────

export function RaciPage() {
  const { ventureId } = useParams<{ ventureId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const utils = trpc.useUtils();

  const { data: assignments, isLoading: assignmentsLoading, error: assignmentsError } = trpc.raci.listForVenture.useQuery({ ventureId: ventureId! });
  const { data: ventureResources } = trpc.raci.listVentureResources.useQuery({ ventureId: ventureId! });
  const { data: workstreams, isLoading: wsLoading, error: wsError } = trpc.workstreams.list.useQuery({ ventureId: ventureId! });

  const assignMut = trpc.raci.assign.useMutation({
    onSuccess: () => utils.raci.listForVenture.invalidate({ ventureId: ventureId! }),
  });
  const removeMut = trpc.raci.remove.useMutation({
    onSuccess: () => utils.raci.listForVenture.invalidate({ ventureId: ventureId! }),
  });

  const [addingCell, setAddingCell] = useState<{ wsId: string; role: string } | null>(null);
  const [selectedResource, setSelectedResource] = useState('');

  const isGM = user?.role === 'gm';
  const canEdit = !isGM;

  // Build matrix data: workstreamId -> role -> assignment[]
  const matrix = useMemo(() => {
    const map = new Map<string, Map<string, any[]>>();
    if (assignments) {
      for (const a of assignments) {
        if (!map.has(a.workstreamId)) map.set(a.workstreamId, new Map());
        const roleMap = map.get(a.workstreamId)!;
        if (!roleMap.has(a.raciRole)) roleMap.set(a.raciRole, []);
        roleMap.get(a.raciRole)!.push(a);
      }
    }
    return map;
  }, [assignments]);

  if (assignmentsLoading || wsLoading) {
    return <div className="p-8 text-center text-[var(--text-3)]">Loading RACI matrix...</div>;
  }
  if (assignmentsError || wsError) {
    return <div className="p-8 text-red-400">Unable to load RACI data.</div>;
  }

  if (!workstreams || workstreams.length === 0) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <SectionHeader title="RACI Matrix" />
        <div className="text-center py-12">
          <div className="text-4xl mb-4">👤</div>
          <p className="text-[var(--text-3)] mb-4">No workstreams defined. Create workstreams on the Plan page first.</p>
          <Button onClick={() => navigate(`/venture/${ventureId}/plan`)}>Go to Plan</Button>
        </div>
      </div>
    );
  }

  const roles = ['responsible', 'accountable', 'consulted', 'informed'];

  const handleAssign = (wsId: string, role: string) => {
    if (!selectedResource) return;
    assignMut.mutate({ workstreamId: wsId, resourceId: selectedResource, raciRole: role as any });
    setAddingCell(null);
    setSelectedResource('');
  };

  const handleRemove = (id: string) => {
    removeMut.mutate({ id });
  };

  // Determine which resources are already assigned for a given ws+role
  const getAssigned = (wsId: string, role: string): any[] => {
    return matrix.get(wsId)?.get(role) ?? [];
  };

  // For accountable column, check if already has one
  const hasAccountable = (wsId: string) => (getAssigned(wsId, 'accountable').length > 0);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <SectionHeader title="RACI Matrix" />

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mb-6">
        {roles.map(role => (
          <div key={role} className="flex items-center gap-2">
            <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold border ${RACI_COLORS[role]}`}>
              {RACI_SHORT[role]}
            </span>
            <span className="text-xs text-[var(--text-2)] capitalize">{role}</span>
          </div>
        ))}
      </div>

      {/* Matrix Table */}
      <div className="bg-[var(--surface-0)] rounded-2xl border border-[var(--border)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="text-left text-[10px] text-[var(--text-3)] uppercase tracking-widest px-4 py-3 min-w-[200px]">Workstream</th>
                {roles.map(role => (
                  <th key={role} className="text-center text-[10px] text-[var(--text-3)] uppercase tracking-widest px-4 py-3 min-w-[160px]">
                    <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold border ${RACI_COLORS[role]} me-1`}>
                      {RACI_SHORT[role]}
                    </span>
                    {role}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {workstreams.map((ws: any) => (
                <tr key={ws.id} className="border-b border-[var(--border)] hover:bg-[var(--surface-1)] transition-colors">
                  <td className="px-4 py-3 text-sm text-[var(--text-0)] font-medium">{ws.name}</td>
                  {roles.map(role => {
                    const cellAssignments = getAssigned(ws.id, role);
                    const isAdding = addingCell?.wsId === ws.id && addingCell?.role === role;
                    const isAccountableFull = role === 'accountable' && hasAccountable(ws.id);

                    return (
                      <td key={role} className="px-4 py-3 text-center">
                        <div className="flex flex-wrap gap-1 justify-center">
                          {cellAssignments.map((a: any) => (
                            <div key={a.id} className="inline-flex items-center gap-0.5">
                              <RaciBadge
                                role={a.raciRole}
                                name={a.resourceName}
                                onRemove={canEdit ? () => handleRemove(a.id) : undefined}
                              />
                              {!a.isVentureAssigned && (
                                <span className="text-amber-400 text-xs" title={`${a.resourceName} is no longer assigned to this venture`}>!</span>
                              )}
                            </div>
                          ))}
                        </div>

                        {canEdit && !isAdding && !(role === 'accountable' && isAccountableFull) && (
                          <button
                            onClick={() => { setAddingCell({ wsId: ws.id, role }); setSelectedResource(''); }}
                            className="mt-1 text-[10px] text-[var(--text-3)] hover:text-[var(--accent-hover)] cursor-pointer"
                            title="Add assignment"
                          >
                            + Add
                          </button>
                        )}

                        {canEdit && role === 'accountable' && isAccountableFull && cellAssignments.length > 0 && (
                          <div className="text-[9px] text-[var(--text-3)] mt-1 italic">Max 1</div>
                        )}

                        {isAdding && (
                          <div className="mt-2 flex flex-col gap-1 items-center">
                            <Select
                              value={selectedResource}
                              onChange={e => setSelectedResource(e.target.value)}
                              className="!text-xs !py-1 !px-2 max-w-[150px]"
                            >
                              <option value="">Select...</option>
                              {(ventureResources ?? [])
                                .filter((r: any) => !cellAssignments.some((a: any) => a.resourceId === r.id))
                                .map((r: any) => (
                                  <option key={r.id} value={r.id}>{r.name}</option>
                                ))
                              }
                            </Select>
                            <div className="flex gap-1">
                              <button
                                onClick={() => handleAssign(ws.id, role)}
                                disabled={!selectedResource || assignMut.isPending}
                                className="text-[10px] px-2 py-0.5 rounded bg-[var(--accent)] text-white disabled:opacity-40 cursor-pointer"
                              >
                                OK
                              </button>
                              <button
                                onClick={() => setAddingCell(null)}
                                className="text-[10px] px-2 py-0.5 rounded bg-[var(--surface-2)] text-[var(--text-2)] cursor-pointer"
                              >
                                X
                              </button>
                            </div>
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {(assignMut.error || removeMut.error) && (
        <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
          {assignMut.error?.message || removeMut.error?.message}
        </div>
      )}
    </div>
  );
}
