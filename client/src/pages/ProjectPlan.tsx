import { useParams, useNavigate } from 'react-router-dom';
import { trpc } from '../lib/trpc.js';
import { StatusBadge, SectionHeader } from '../components/StatusBadge.js';
import { Modal, FormField, Input, Select, Button } from '../components/Modal.js';
import { useAuth } from '../lib/auth.js';
import { formatDate } from '../lib/format.js';
import { useState, useMemo } from 'react';

export function ProjectPlanPage() {
  const { ventureId } = useParams<{ ventureId: string }>();
  const { user } = useAuth();
  const { data: workstreams, isLoading } = trpc.workstreams.list.useQuery({ ventureId: ventureId! });
  const { data: raciAssignments } = trpc.raci.listForVenture.useQuery({ ventureId: ventureId! });
  const [showAddWs, setShowAddWs] = useState(false);
  const isGM = user?.role === 'gm';

  // Build RACI lookup: workstreamId -> role -> resourceName[]
  const raciByWs = useMemo(() => {
    const map = new Map<string, Map<string, string[]>>();
    if (raciAssignments) {
      for (const a of raciAssignments as any[]) {
        if (!map.has(a.workstreamId)) map.set(a.workstreamId, new Map());
        const roleMap = map.get(a.workstreamId)!;
        if (!roleMap.has(a.raciRole)) roleMap.set(a.raciRole, []);
        roleMap.get(a.raciRole)!.push(a.resourceName);
      }
    }
    return map;
  }, [raciAssignments]);

  if (isLoading) return <div className="p-8 text-[var(--text-3)]">Loading plan...</div>;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <SectionHeader
        title="Project Plan"
        action={!isGM ? <Button onClick={() => setShowAddWs(true)}>Add Workstream</Button> : undefined}
      />

      {(!workstreams || workstreams.length === 0) ? (
        <div className="text-center py-12">
          <div className="text-4xl mb-4">📋</div>
          <p className="text-[var(--text-3)] mb-4">No workstreams defined yet.</p>
          {!isGM && <Button onClick={() => setShowAddWs(true)}>Add Your First Workstream</Button>}
        </div>
      ) : (
        <div className="space-y-4">
          {workstreams.map(ws => <WorkstreamRow key={ws.id} workstream={ws} ventureId={ventureId!} isGM={isGM} raciMap={raciByWs.get(ws.id)} />)}
        </div>
      )}

      <AddWorkstreamForm open={showAddWs} onClose={() => setShowAddWs(false)} ventureId={ventureId!} />
    </div>
  );
}

function WorkstreamRow({ workstream, ventureId, isGM, raciMap }: { workstream: any; ventureId: string; isGM: boolean; raciMap?: Map<string, string[]> }) {
  const [expanded, setExpanded] = useState(false);
  const [showAddMs, setShowAddMs] = useState(false);
  const [editing, setEditing] = useState(false);
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const { data: milestones } = trpc.milestones.list.useQuery({ workstreamId: workstream.id }, { enabled: expanded });
  const updateWs = trpc.workstreams.update.useMutation({ onSuccess: () => { utils.workstreams.list.invalidate({ ventureId }); setEditing(false); } });

  const [editForm, setEditForm] = useState({
    status: workstream.status,
    completionPct: workstream.completionPct,
    actualStart: workstream.actualStart ?? '',
    actualEnd: workstream.actualEnd ?? '',
  });

  const raciColors: Record<string, string> = {
    responsible: 'text-indigo-400',
    accountable: 'text-red-400',
    consulted: 'text-amber-400',
    informed: 'text-gray-400',
  };
  const raciShort: Record<string, string> = { responsible: 'R', accountable: 'A', consulted: 'C', informed: 'I' };

  const hasRaci = raciMap && raciMap.size > 0;

  return (
    <div className="bg-[var(--surface-0)] rounded-2xl border border-[var(--border)] overflow-hidden hover:border-[var(--border-hover)] transition-all">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-start px-5 py-4 flex items-center gap-4 hover:bg-[var(--surface-1)] transition-colors"
      >
        <span className="text-xs text-[var(--text-3)]">{expanded ? '▼' : '▶'}</span>
        <div className="flex-1">
          <div className="font-medium text-[var(--text-0)]">{workstream.name}</div>
          <div className="text-xs text-[var(--text-3)] mt-0.5">
            Baseline: {formatDate(workstream.baselineStart)} → {formatDate(workstream.baselineEnd)}
            {workstream.actualStart && <span className="ms-3">Actual: {formatDate(workstream.actualStart)} → {workstream.actualEnd ? formatDate(workstream.actualEnd) : 'ongoing'}</span>}
          </div>
          {hasRaci && (
            <div className="flex flex-wrap gap-2 mt-1">
              {['responsible', 'accountable', 'consulted', 'informed'].map(role => {
                const names = raciMap!.get(role);
                if (!names || names.length === 0) return null;
                const display = names.length <= 2 ? names.join(', ') : `${names.slice(0, 2).join(', ')} +${names.length - 2}`;
                return (
                  <span key={role} className={`text-[10px] ${raciColors[role]}`}>
                    <span className="font-bold">{raciShort[role]}:</span> {display}
                  </span>
                );
              })}
              <button
                onClick={e => { e.stopPropagation(); navigate(`/venture/${ventureId}/raci`); }}
                className="text-[10px] text-[var(--accent-hover)] hover:underline cursor-pointer"
              >
                RACI
              </button>
            </div>
          )}
        </div>
        <StatusBadge status={workstream.status} />
        <div className="flex items-center gap-2 min-w-[80px]">
          <span className="text-sm text-[var(--text-1)] ltr-num">{workstream.completionPct}%</span>
          <div className="w-12 bg-[var(--surface-2)] rounded-full h-1.5">
            <div className="h-1.5 rounded-full bg-[var(--accent)]" style={{ width: `${workstream.completionPct}%` }} />
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-[var(--border)]">
          {!isGM && (
            <div className="px-5 py-3 bg-[var(--surface-1)] border-b border-[var(--border)]">
              {editing ? (
                <div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <FormField label="Status">
                      <Select value={editForm.status} onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}>
                        <option value="not_started">Not Started</option>
                        <option value="in_progress">In Progress</option>
                        <option value="complete">Complete</option>
                        <option value="on_hold">On Hold</option>
                      </Select>
                    </FormField>
                    <FormField label="Completion %">
                      <Input type="number" min={0} max={100} value={editForm.completionPct || ''} onChange={e => setEditForm(f => ({ ...f, completionPct: Number(e.target.value) }))} />
                    </FormField>
                    <FormField label="Actual Start">
                      <Input type="date" value={editForm.actualStart} onChange={e => setEditForm(f => ({ ...f, actualStart: e.target.value }))} />
                    </FormField>
                    <FormField label="Actual End">
                      <Input type="date" value={editForm.actualEnd} onChange={e => setEditForm(f => ({ ...f, actualEnd: e.target.value }))} />
                    </FormField>
                  </div>
                  <div className="flex justify-end gap-2 mt-3">
                    <Button variant="secondary" onClick={() => setEditing(false)}>Cancel</Button>
                    <Button onClick={() => updateWs.mutate({ id: workstream.id, status: editForm.status as any, completionPct: editForm.completionPct, actualStart: editForm.actualStart || null, actualEnd: editForm.actualEnd || null })} disabled={updateWs.isPending}>Save</Button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => setEditing(true)}>Edit Workstream</Button>
                  <Button variant="secondary" onClick={() => setShowAddMs(true)}>Add Milestone</Button>
                </div>
              )}
            </div>
          )}

          <div className="px-5 py-3">
            {milestones && milestones.length > 0 ? (
              <div className="space-y-2">
                {milestones.map((ms: any) => <MilestoneRow key={ms.id} milestone={ms} isGM={isGM} />)}
              </div>
            ) : (
              <p className="text-xs text-[var(--text-3)]">No milestones defined.</p>
            )}
          </div>
        </div>
      )}

      <AddMilestoneForm open={showAddMs} onClose={() => setShowAddMs(false)} workstreamId={workstream.id} />
    </div>
  );
}

function MilestoneRow({ milestone, isGM }: { milestone: any; isGM: boolean }) {
  const utils = trpc.useUtils();
  const update = trpc.milestones.update.useMutation({
    onSuccess: () => utils.milestones.list.invalidate({ workstreamId: milestone.workstreamId }),
  });

  const icon = milestone.status === 'achieved' ? '✅' : milestone.status === 'overdue' ? '⚠️' : '◯';

  return (
    <div className="flex items-center gap-3 text-sm py-2 px-3 rounded-xl hover:bg-[var(--surface-1)] transition-colors">
      <span className="text-xs">{icon}</span>
      <span className="flex-1 text-[var(--text-1)]">{milestone.name}</span>
      <span className="text-xs text-[var(--text-3)] ltr-num">{formatDate(milestone.dueDate)}</span>
      {milestone.actualCompletionDate && (
        <span className="text-xs text-emerald-400 ltr-num">Done: {formatDate(milestone.actualCompletionDate)}</span>
      )}
      <StatusBadge status={milestone.status} size="xs" />
      {!isGM && milestone.status !== 'achieved' && (
        <Button variant="ghost" className="!py-1 !px-2 !text-xs" onClick={() => update.mutate({ id: milestone.id, status: 'achieved', actualCompletionDate: new Date().toISOString().split('T')[0] })}>Complete</Button>
      )}
      {!isGM && milestone.status !== 'deferred' && milestone.status !== 'achieved' && (
        <Button variant="ghost" className="!py-1 !px-2 !text-xs" onClick={() => update.mutate({ id: milestone.id, status: 'deferred' })}>Defer</Button>
      )}
    </div>
  );
}

function AddWorkstreamForm({ open, onClose, ventureId }: { open: boolean; onClose: () => void; ventureId: string }) {
  const utils = trpc.useUtils();
  const create = trpc.workstreams.create.useMutation({ onSuccess: () => { utils.workstreams.list.invalidate({ ventureId }); onClose(); } });
  const [form, setForm] = useState({ name: '', baselineStart: '', baselineEnd: '' });

  return (
    <Modal open={open} onClose={onClose} title="Add Workstream">
      <FormField label="Name" required><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Customer Migration" /></FormField>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Baseline Start"><Input type="date" value={form.baselineStart} onChange={e => setForm(f => ({ ...f, baselineStart: e.target.value }))} /></FormField>
        <FormField label="Baseline End"><Input type="date" value={form.baselineEnd} onChange={e => setForm(f => ({ ...f, baselineEnd: e.target.value }))} /></FormField>
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={() => { if (form.name.trim()) { create.mutate({ ventureId, ...form, baselineStart: form.baselineStart || undefined, baselineEnd: form.baselineEnd || undefined }); setForm({ name: '', baselineStart: '', baselineEnd: '' }); } }} disabled={create.isPending || !form.name.trim()}>{create.isPending ? 'Saving...' : 'Add Workstream'}</Button>
      </div>
    </Modal>
  );
}

function AddMilestoneForm({ open, onClose, workstreamId }: { open: boolean; onClose: () => void; workstreamId: string }) {
  const utils = trpc.useUtils();
  const create = trpc.milestones.create.useMutation({ onSuccess: () => { utils.milestones.list.invalidate({ workstreamId }); onClose(); } });
  const [form, setForm] = useState({ name: '', dueDate: '', notes: '' });

  return (
    <Modal open={open} onClose={onClose} title="Add Milestone">
      <FormField label="Name" required><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. UAT Complete" /></FormField>
      <FormField label="Due Date" required><Input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} /></FormField>
      <FormField label="Notes"><Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes" /></FormField>
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={() => { if (form.name.trim() && form.dueDate) { create.mutate({ workstreamId, ...form, notes: form.notes || undefined }); setForm({ name: '', dueDate: '', notes: '' }); } }} disabled={create.isPending || !form.name.trim() || !form.dueDate}>{create.isPending ? 'Saving...' : 'Add Milestone'}</Button>
      </div>
    </Modal>
  );
}
