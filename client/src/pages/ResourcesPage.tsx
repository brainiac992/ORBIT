import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { trpc } from '../lib/trpc.js';
import { StatusBadge, SectionHeader } from '../components/StatusBadge.js';
import { Modal, FormField, Input, Select, Button } from '../components/Modal.js';
import { useAuth } from '../lib/auth.js';
import { formatDate } from '../lib/format.js';

export function ResourcesPage() {
  const { ventureId } = useParams<{ ventureId: string }>();
  const { user } = useAuth();
  const { data, isLoading } = trpc.resources.listForVenture.useQuery({ ventureId: ventureId! });
  const [showAssign, setShowAssign] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const isPMO = user?.role === 'pmo';

  if (isLoading) return <div className="p-8 text-[var(--text-3)]">Loading resources...</div>;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <SectionHeader
        title="Resources"
        action={isPMO ? (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setShowCreate(true)}>New Resource</Button>
            <Button onClick={() => setShowAssign(true)}>Assign Resource</Button>
          </div>
        ) : undefined}
      />

      {(!data || data.length === 0) ? (
        <div className="text-center py-12">
          <div className="text-4xl mb-4">👥</div>
          <p className="text-[var(--text-3)] mb-4">No resources assigned to this venture.</p>
          {isPMO && <Button onClick={() => setShowAssign(true)}>Assign First Resource</Button>}
        </div>
      ) : (
        <div className="bg-[var(--surface-0)] rounded-2xl border border-[var(--border)] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[var(--surface-1)] text-[var(--text-3)] text-[10px] uppercase tracking-widest">
                <th className="text-start px-5 py-3">Name</th>
                <th className="text-start px-5 py-3">Type</th>
                <th className="text-start px-5 py-3">Role</th>
                <th className="text-start px-5 py-3">HpW</th>
                <th className="text-start px-5 py-3">Start</th>
                <th className="text-start px-5 py-3">End</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r: any) =>
                r.assignments.map((a: any) => (
                  <tr key={a.id} className="border-t border-[var(--border)]">
                    <td className="px-5 py-3 font-medium text-[var(--text-0)]">{r.name}</td>
                    <td className="px-5 py-3"><StatusBadge status={r.type} size="xs" /></td>
                    <td className="px-5 py-3 text-[var(--text-2)]">{r.roleTitle ?? '—'}</td>
                    <td className="px-5 py-3 text-[var(--text-1)] ltr-num font-medium">{a.hoursPerWeek}h</td>
                    <td className="px-5 py-3 text-[var(--text-2)] ltr-num">{formatDate(a.startDate)}</td>
                    <td className="px-5 py-3 text-[var(--text-2)] ltr-num">{a.endDate ? formatDate(a.endDate) : 'Ongoing'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <CreateResourceForm open={showCreate} onClose={() => setShowCreate(false)} ventureId={ventureId!} />
      <AssignResourceForm open={showAssign} onClose={() => setShowAssign(false)} ventureId={ventureId!} />
    </div>
  );
}

function CreateResourceForm({ open, onClose, ventureId }: { open: boolean; onClose: () => void; ventureId: string }) {
  const utils = trpc.useUtils();
  const create = trpc.resources.create.useMutation({
    onSuccess: () => {
      utils.resources.list.invalidate();
      utils.resources.listForVenture.invalidate({ ventureId });
      utils.resources.allocationSummary.invalidate();
      setForm({ name: '', type: 'internal', roleTitle: '', department: '', company: '', customRole: false, customDept: false });
      onClose();
    },
  });
  const [form, setForm] = useState({ name: '', type: 'internal', roleTitle: '', department: '', company: '', customRole: false, customDept: false });
  const { data: roleTitles } = trpc.config.listByCategory.useQuery({ category: 'role_title' }, { enabled: open });
  const { data: departments } = trpc.config.listByCategory.useQuery({ category: 'department' }, { enabled: open });

  return (
    <Modal open={open} onClose={onClose} title="New Resource">
      <FormField label="Name" required><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Full name" /></FormField>
      <FormField label="Type">
        <Select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
          <option value="internal">Internal</option>
          <option value="external">External</option>
        </Select>
      </FormField>
      <FormField label="Role / Title">
        {form.customRole ? (
          <div className="flex gap-2">
            <Input value={form.roleTitle} onChange={e => setForm(f => ({ ...f, roleTitle: e.target.value }))} placeholder="e.g. Senior Developer" />
            <button onClick={() => setForm(f => ({ ...f, customRole: false, roleTitle: '' }))} className="text-xs text-[var(--text-3)] hover:text-[var(--text-0)] whitespace-nowrap">Use list</button>
          </div>
        ) : (
          <Select value={form.roleTitle} onChange={e => {
            if (e.target.value === '__custom__') {
              setForm(f => ({ ...f, customRole: true, roleTitle: '' }));
            } else {
              setForm(f => ({ ...f, roleTitle: e.target.value }));
            }
          }}>
            <option value="">Select a role</option>
            {roleTitles?.map((opt: any) => (
              <option key={opt.id} value={opt.value}>{opt.label}</option>
            ))}
            <option value="__custom__">Custom...</option>
          </Select>
        )}
      </FormField>
      {form.type === 'internal' && (
        <FormField label="Department">
          {form.customDept ? (
            <div className="flex gap-2">
              <Input value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))} placeholder="e.g. Engineering" />
              <button onClick={() => setForm(f => ({ ...f, customDept: false, department: '' }))} className="text-xs text-[var(--text-3)] hover:text-[var(--text-0)] whitespace-nowrap">Use list</button>
            </div>
          ) : (
            <Select value={form.department} onChange={e => {
              if (e.target.value === '__custom__') {
                setForm(f => ({ ...f, customDept: true, department: '' }));
              } else {
                setForm(f => ({ ...f, department: e.target.value }));
              }
            }}>
              <option value="">Select a department</option>
              {departments?.map((opt: any) => (
                <option key={opt.id} value={opt.value}>{opt.label}</option>
              ))}
              <option value="__custom__">Custom...</option>
            </Select>
          )}
        </FormField>
      )}
      {form.type === 'external' && (
        <FormField label="Company"><Input value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} placeholder="e.g. Acme Consulting" /></FormField>
      )}
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={() => { if (form.name.trim()) create.mutate({ ...form, type: form.type as any, roleTitle: form.roleTitle || undefined, department: form.type === 'internal' ? form.department || undefined : undefined, company: form.type === 'external' ? form.company || undefined : undefined }); }} disabled={create.isPending || !form.name.trim()}>{create.isPending ? 'Saving...' : 'Create Resource'}</Button>
      </div>
    </Modal>
  );
}

function AssignResourceForm({ open, onClose, ventureId }: { open: boolean; onClose: () => void; ventureId: string }) {
  const utils = trpc.useUtils();
  const { data: allResources } = trpc.resources.list.useQuery(undefined, { enabled: open });
  const assign = trpc.resources.assign.useMutation({
    onSuccess: () => {
      utils.resources.listForVenture.invalidate({ ventureId });
      utils.resources.allocationSummary.invalidate();
      setForm({ resourceId: '', hoursPerWeek: '', startDate: new Date().toISOString().split('T')[0], endDate: '' });
      onClose();
    },
  });
  const [form, setForm] = useState({ resourceId: '', hoursPerWeek: '', startDate: new Date().toISOString().split('T')[0], endDate: '' });

  return (
    <Modal open={open} onClose={onClose} title="Assign Resource to Venture">
      <FormField label="Resource" required>
        <Select value={form.resourceId} onChange={e => setForm(f => ({ ...f, resourceId: e.target.value }))}>
          <option value="">Select a resource</option>
          {allResources?.map((r: any) => (
            <option key={r.id} value={r.id}>{r.name} ({r.type} — {r.roleTitle ?? 'No title'})</option>
          ))}
        </Select>
      </FormField>
      <FormField label="Hours per Week" required>
        <Input type="number" step="0.5" min="0" value={form.hoursPerWeek} onChange={e => setForm(f => ({ ...f, hoursPerWeek: e.target.value }))} placeholder="e.g. 20" />
      </FormField>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Start Date" required><Input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} /></FormField>
        <FormField label="End Date"><Input type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} /></FormField>
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={() => { if (form.resourceId && form.hoursPerWeek) assign.mutate({ ...form, ventureId, endDate: form.endDate || undefined }); }} disabled={assign.isPending || !form.resourceId || !form.hoursPerWeek}>{assign.isPending ? 'Saving...' : 'Assign'}</Button>
      </div>
    </Modal>
  );
}
