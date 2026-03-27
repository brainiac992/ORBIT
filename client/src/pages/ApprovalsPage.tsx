import { trpc } from '../lib/trpc.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { Button, Modal, FormField, TextArea } from '../components/Modal.js';
import { useState } from 'react';
import { formatDate } from '../lib/format.js';

export function ApprovalsPage() {
  const { data: pending, isLoading } = trpc.approvals.listPending.useQuery();
  const utils = trpc.useUtils();
  const decide = trpc.approvals.decide.useMutation({ onSuccess: () => utils.approvals.listPending.invalidate() });
  const [decideModal, setDecideModal] = useState<{ id: string; action: 'approved' | 'rejected' } | null>(null);
  const [notes, setNotes] = useState('');

  if (isLoading) return <div className="p-8 text-[var(--text-3)]">Loading approvals...</div>;

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <h2 className="text-2xl font-bold text-[var(--text-0)] mb-8">Pending Approvals</h2>

      {(!pending || pending.length === 0) ? (
        <div className="text-center py-12">
          <div className="text-4xl mb-4">✅</div>
          <h3 className="text-base font-semibold text-[var(--text-0)] mb-2">All clear</h3>
          <p className="text-sm text-[var(--text-3)]">No pending approvals.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {pending.map((a: any, i: number) => (
            <div
              key={a.id}
              className="bg-[var(--surface-0)] rounded-2xl border border-[var(--border)] p-5 animate-in"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <StatusBadge status={a.status} />
                  <span className="text-sm font-medium text-[var(--text-0)] capitalize">{a.entityType.replace('_', ' ')}</span>
                </div>
                <span className="text-xs text-[var(--text-3)]">{formatDate(a.createdAt)}</span>
              </div>
              {a.notes && <p className="text-xs text-[var(--text-2)] mb-3">{a.notes}</p>}
              <div className="flex gap-2">
                <Button onClick={() => { setDecideModal({ id: a.id, action: 'approved' }); setNotes(''); }}>Approve</Button>
                <Button variant="danger" onClick={() => { setDecideModal({ id: a.id, action: 'rejected' }); setNotes(''); }}>Reject</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={!!decideModal}
        onClose={() => setDecideModal(null)}
        title={decideModal?.action === 'approved' ? 'Approve Request' : 'Reject Request'}
      >
        <FormField label="Notes (optional)">
          <TextArea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Add a note for the requester" />
        </FormField>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="secondary" onClick={() => setDecideModal(null)}>Cancel</Button>
          <Button
            variant={decideModal?.action === 'approved' ? 'primary' : 'danger'}
            onClick={() => {
              if (decideModal) {
                decide.mutate({ id: decideModal.id, status: decideModal.action, notes: notes || undefined });
                setDecideModal(null);
              }
            }}
          >
            {decideModal?.action === 'approved' ? 'Approve' : 'Reject'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
