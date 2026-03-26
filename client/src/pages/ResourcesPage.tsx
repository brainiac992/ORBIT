import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { trpc } from '../lib/trpc.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { Modal, FormField, Input, Select, Button } from '../components/Modal.js';
import { VentureTabs } from './PMDashboard.js';
import { useAuth } from '../lib/auth.js';

export function ResourcesPage() {
  const { ventureId } = useParams<{ ventureId: string }>();
  const { user } = useAuth();
  const { data, isLoading } = trpc.resources.listForVenture.useQuery({ ventureId: ventureId! });
  const [showAssign, setShowAssign] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const isPMO = user?.role === 'pmo';

  if (isLoading) return <div className="p-8 text-center text-[var(--text-secondary)]">Loading resources...</div>;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <VentureTabs ventureId={ventureId!} active="resources" />

      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Resources</h3>
        {isPMO && (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setShowCreate(true)}>New Resource</Button>
            <Button onClick={() => setShowAssign(true)}>Assign Resource</Button>
          </div>
        )}
      </div>

      {(!data || data.length === 0) ? (
        <div className="text-center py-12">
          <p className="text-[var(--text-secondary)] mb-4">No resources assigned to this venture.</p>
          {isPMO && <Button onClick={() => setShowAssign(true)}>Assign First Resource</Button>}
        </div>
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
              {data.map((r: any) =>
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
              )}
            </tbody>
          </table>
        </div>
      )}

      <CreateResourceForm open={showCreate} onClose={() => setShowCreate(false)} />
      <AssignResourceForm open={showAssign} onClose={() => setShowAssign(false)} ventureId={ventureId!} />
    </div>
  );
}

function CreateResourceForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const utils = trpc.useUtils();
  const create = trpc.resources.create.useMutation({ onSuccess: () => { utils.resources.list.invalidate(); onClose(); } });
  const [form, setForm] = useState({ name: '', type: 'internal', roleTitle: '', department: '', company: '' });

  const handleSubmit = () => {
    if (!form.name.trim()) return;
    create.mutate({ ...form, type: form.type as any, department: form.type === 'internal' ? form.department || undefined : undefined, company: form.type === 'external' ? form.company || undefined : undefined, roleTitle: form.roleTitle || undefined });
    setForm({ name: '', type: 'internal', roleTitle: '', department: '', company: '' });
  };

  return (
    <Modal open={open} onClose={onClose} title="New Resource">
      <FormField label="Name" required><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Full name" /></FormField>
      <FormField label="Type">
        <Select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
          <option value="internal">Internal</option>
          <option value="external">External</option>
        </Select>
      </FormField>
      <FormField label="Role / Title"><Input value={form.roleTitle} onChange={e => setForm(f => ({ ...f, roleTitle: e.target.value }))} placeholder="e.g. Senior Developer" /></FormField>
      {form.type === 'internal' && (
        <FormField label="Department"><Input value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))} placeholder="e.g. Engineering" /></FormField>
      )}
      {form.type === 'external' && (
        <FormField label="Company"><Input value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} placeholder="e.g. Acme Consulting" /></FormField>
      )}
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSubmit} disabled={create.isPending || !form.name.trim()}>{create.isPending ? 'Saving...' : 'Create Resource'}</Button>
      </div>
    </Modal>
  );
}

function AssignResourceForm({ open, onClose, ventureId }: { open: boolean; onClose: () => void; ventureId: string }) {
  const utils = trpc.useUtils();
  const { data: allResources } = trpc.resources.list.useQuery(undefined, { enabled: open });
  const assign = trpc.resources.assign.useMutation({ onSuccess: () => { utils.resources.listForVenture.invalidate({ ventureId }); onClose(); } });
  const [form, setForm] = useState({ resourceId: '', hoursPerWeek: '20', startDate: new Date().toISOString().split('T')[0], endDate: '' });

  const handleSubmit = () => {
    if (!form.resourceId || !form.hoursPerWeek) return;
    assign.mutate({ ...form, ventureId, endDate: form.endDate || undefined });
    setForm({ resourceId: '', hoursPerWeek: '20', startDate: new Date().toISOString().split('T')[0], endDate: '' });
  };

  return (
    <Modal open={open} onClose={onClose} title="Assign Resource to Venture">
      <FormField label="Resource" required>
        <Select value={form.resourceId} onChange={e => setForm(f => ({ ...f, resourceId: e.target.value }))}>
          <option value="">Select a resource</option>
          {allResources?.map(r => (
            <option key={r.id} value={r.id}>{r.name} ({r.type} — {r.roleTitle ?? 'No title'})</option>
          ))}
        </Select>
      </FormField>
      <FormField label="Hours per Week" required>
        <Input type="number" step="0.5" value={form.hoursPerWeek} onChange={e => setForm(f => ({ ...f, hoursPerWeek: e.target.value }))} />
      </FormField>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Start Date" required><Input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} /></FormField>
        <FormField label="End Date"><Input type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} placeholder="Leave empty for ongoing" /></FormField>
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSubmit} disabled={assign.isPending || !form.resourceId}>{assign.isPending ? 'Saving...' : 'Assign'}</Button>
      </div>
    </Modal>
  );
}
