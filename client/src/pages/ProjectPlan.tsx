import { useParams } from 'react-router-dom';
import { trpc } from '../lib/trpc.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { Modal, FormField, Input, Select, Button } from '../components/Modal.js';
import { VentureTabs } from './PMDashboard.js';
import { useAuth } from '../lib/auth.js';
import { useState } from 'react';

export function ProjectPlanPage() {
  const { ventureId } = useParams<{ ventureId: string }>();
  const { user } = useAuth();
  const { data: workstreams, isLoading } = trpc.workstreams.list.useQuery({ ventureId: ventureId! });
  const [showAddWs, setShowAddWs] = useState(false);

  const isGM = user?.role === 'gm';

  if (isLoading) return <div className="p-8 text-center text-[var(--text-secondary)]">Loading plan...</div>;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <VentureTabs ventureId={ventureId!} active="plan" />

      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Project Plan</h3>
        {!isGM && <Button onClick={() => setShowAddWs(true)}>Add Workstream</Button>}
      </div>

      {(!workstreams || workstreams.length === 0) ? (
        <div className="text-center py-12">
          <p className="text-[var(--text-secondary)] mb-4">No workstreams defined yet.</p>
          {!isGM && <Button onClick={() => setShowAddWs(true)}>Add Your First Workstream</Button>}
        </div>
      ) : (
        <div className="space-y-4">
          {workstreams.map(ws => (
            <WorkstreamRow key={ws.id} workstream={ws} ventureId={ventureId!} isGM={isGM} />
          ))}
        </div>
      )}

      <AddWorkstreamForm open={showAddWs} onClose={() => setShowAddWs(false)} ventureId={ventureId!} />
    </div>
  );
}

function WorkstreamRow({ workstream, ventureId, isGM }: { workstream: any; ventureId: string; isGM: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [showAddMs, setShowAddMs] = useState(false);
  const [editing, setEditing] = useState(false);
  const utils = trpc.useUtils();
  const { data: milestones } = trpc.milestones.list.useQuery({ workstreamId: workstream.id }, { enabled: expanded });
  const updateWs = trpc.workstreams.update.useMutation({ onSuccess: () => { utils.workstreams.list.invalidate({ ventureId }); setEditing(false); } });

  const [editForm, setEditForm] = useState({
    status: workstream.status,
    completionPct: workstream.completionPct,
    actualStart: workstream.actualStart ?? '',
    actualEnd: workstream.actualEnd ?? '',
  });

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
        <div className="border-t border-[var(--border)]">
          {/* Edit workstream */}
          {!isGM && (
            <div className="px-5 py-3 bg-blue-50 border-b border-[var(--border)]">
              {editing ? (
                <div className="flex items-end gap-3 flex-wrap">
                  <FormField label="Status">
                    <Select value={editForm.status} onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}>
                      <option value="not_started">Not Started</option>
                      <option value="in_progress">In Progress</option>
                      <option value="complete">Complete</option>
                      <option value="on_hold">On Hold</option>
                    </Select>
                  </FormField>
                  <FormField label="Completion %">
                    <Input type="number" min={0} max={100} value={editForm.completionPct} onChange={e => setEditForm(f => ({ ...f, completionPct: Number(e.target.value) }))} />
                  </FormField>
                  <FormField label="Actual Start">
                    <Input type="date" value={editForm.actualStart} onChange={e => setEditForm(f => ({ ...f, actualStart: e.target.value }))} />
                  </FormField>
                  <FormField label="Actual End">
                    <Input type="date" value={editForm.actualEnd} onChange={e => setEditForm(f => ({ ...f, actualEnd: e.target.value }))} />
                  </FormField>
                  <div className="flex gap-2 mb-4">
                    <Button onClick={() => updateWs.mutate({ id: workstream.id, ...editForm, completionPct: editForm.completionPct, status: editForm.status as any, actualStart: editForm.actualStart || null, actualEnd: editForm.actualEnd || null })} disabled={updateWs.isPending}>Save</Button>
                    <Button variant="secondary" onClick={() => setEditing(false)}>Cancel</Button>
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

          {/* Milestones */}
          <div className="px-5 py-3 bg-[var(--surface-muted)]">
            {milestones && milestones.length > 0 ? (
              <div className="space-y-2">
                {milestones.map((ms: any) => (
                  <MilestoneRow key={ms.id} milestone={ms} ventureId={ventureId} isGM={isGM} />
                ))}
              </div>
            ) : (
              <p className="text-xs text-[var(--text-secondary)]">No milestones defined for this workstream.</p>
            )}
          </div>
        </div>
      )}

      <AddMilestoneForm open={showAddMs} onClose={() => setShowAddMs(false)} workstreamId={workstream.id} />
    </div>
  );
}

function MilestoneRow({ milestone, ventureId, isGM }: { milestone: any; ventureId: string; isGM: boolean }) {
  const utils = trpc.useUtils();
  const update = trpc.milestones.update.useMutation({
    onSuccess: () => utils.milestones.list.invalidate({ workstreamId: milestone.workstreamId }),
  });

  return (
    <div className="flex items-center gap-3 text-sm py-2 px-2 rounded hover:bg-white transition-colors">
      <span className="text-xs">
        {milestone.status === 'achieved' ? '✅' : milestone.status === 'overdue' ? '⚠️' : '◯'}
      </span>
      <span className="flex-1">{milestone.name}</span>
      <span className="text-xs text-[var(--text-secondary)] ltr-num">{milestone.dueDate}</span>
      {milestone.actualCompletionDate && (
        <span className="text-xs text-green-600 ltr-num">Done: {milestone.actualCompletionDate}</span>
      )}
      <StatusBadge status={milestone.status} />
      {!isGM && milestone.status !== 'achieved' && (
        <Button variant="secondary" className="!py-1 !px-2 !text-xs" onClick={() => update.mutate({
          id: milestone.id,
          status: 'achieved',
          actualCompletionDate: new Date().toISOString().split('T')[0],
        })}>
          Complete
        </Button>
      )}
      {!isGM && milestone.status !== 'deferred' && milestone.status !== 'achieved' && (
        <Button variant="secondary" className="!py-1 !px-2 !text-xs" onClick={() => update.mutate({ id: milestone.id, status: 'deferred' })}>
          Defer
        </Button>
      )}
    </div>
  );
}

function AddWorkstreamForm({ open, onClose, ventureId }: { open: boolean; onClose: () => void; ventureId: string }) {
  const utils = trpc.useUtils();
  const create = trpc.workstreams.create.useMutation({
    onSuccess: () => { utils.workstreams.list.invalidate({ ventureId }); onClose(); },
  });
  const [form, setForm] = useState({ name: '', baselineStart: '', baselineEnd: '' });

  const handleSubmit = () => {
    if (!form.name.trim()) return;
    create.mutate({ ventureId, ...form, baselineStart: form.baselineStart || undefined, baselineEnd: form.baselineEnd || undefined });
    setForm({ name: '', baselineStart: '', baselineEnd: '' });
  };

  return (
    <Modal open={open} onClose={onClose} title="Add Workstream">
      <FormField label="Name" required><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Customer Migration" /></FormField>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Baseline Start"><Input type="date" value={form.baselineStart} onChange={e => setForm(f => ({ ...f, baselineStart: e.target.value }))} /></FormField>
        <FormField label="Baseline End"><Input type="date" value={form.baselineEnd} onChange={e => setForm(f => ({ ...f, baselineEnd: e.target.value }))} /></FormField>
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSubmit} disabled={create.isPending || !form.name.trim()}>{create.isPending ? 'Saving...' : 'Add Workstream'}</Button>
      </div>
    </Modal>
  );
}

function AddMilestoneForm({ open, onClose, workstreamId }: { open: boolean; onClose: () => void; workstreamId: string }) {
  const utils = trpc.useUtils();
  const create = trpc.milestones.create.useMutation({
    onSuccess: () => { utils.milestones.list.invalidate({ workstreamId }); onClose(); },
  });
  const [form, setForm] = useState({ name: '', dueDate: '', notes: '' });

  const handleSubmit = () => {
    if (!form.name.trim() || !form.dueDate) return;
    create.mutate({ workstreamId, ...form, notes: form.notes || undefined });
    setForm({ name: '', dueDate: '', notes: '' });
  };

  return (
    <Modal open={open} onClose={onClose} title="Add Milestone">
      <FormField label="Name" required><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. UAT Complete" /></FormField>
      <FormField label="Due Date" required><Input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} /></FormField>
      <FormField label="Notes"><Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes" /></FormField>
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSubmit} disabled={create.isPending || !form.name.trim() || !form.dueDate}>{create.isPending ? 'Saving...' : 'Add Milestone'}</Button>
      </div>
    </Modal>
  );
}
