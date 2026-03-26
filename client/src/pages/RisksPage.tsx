import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { trpc } from '../lib/trpc.js';
import { StatusBadge, SectionHeader } from '../components/StatusBadge.js';
import { Modal, FormField, Input, TextArea, Select, Button } from '../components/Modal.js';
import { useAuth } from '../lib/auth.js';
import { formatDate } from '../lib/format.js';

export function RisksPage() {
  const { ventureId } = useParams<{ ventureId: string }>();
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const { data: risksList, isLoading: risksLoading } = trpc.risks.listRisks.useQuery({ ventureId: ventureId! });
  const { data: issuesList, isLoading: issuesLoading } = trpc.risks.listIssues.useQuery({ ventureId: ventureId! });
  const { data: blockersList } = trpc.risks.listBlockers.useQuery({ ventureId: ventureId! });

  const [showRiskForm, setShowRiskForm] = useState(false);
  const [showIssueForm, setShowIssueForm] = useState(false);
  const [showBlockerForm, setShowBlockerForm] = useState(false);

  if (risksLoading || issuesLoading) return <div className="p-8 text-center text-[var(--text-3)]">Loading risks...</div>;

  const isGM = user?.role === 'gm';
  const openRisks = risksList?.filter(r => r.status === 'open') ?? [];
  const closedRisks = risksList?.filter(r => r.status !== 'open') ?? [];
  const openIssues = issuesList?.filter(i => i.status !== 'resolved') ?? [];
  const resolvedIssues = issuesList?.filter(i => i.status === 'resolved') ?? [];
  const openBlockers = blockersList?.filter(b => b.status === 'open') ?? [];
  const resolvedBlockers = blockersList?.filter(b => b.status === 'resolved') ?? [];

  const ragBorder: Record<string, string> = {
    red: 'border-s-4 border-s-red-500',
    amber: 'border-s-4 border-s-amber-500',
    green: 'border-s-4 border-s-green-500',
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <VentureTabs ventureId={ventureId!} active="risks" />

      {/* ── Risks ────────────────────────── */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Risks</h3>
        {!isGM && <Button onClick={() => setShowRiskForm(true)}>Log Risk</Button>}
      </div>

      {openRisks.length === 0 ? (
        <p className="text-[var(--text-3)] mb-6">No open risks.</p>
      ) : (
        <div className="space-y-3 mb-6">
          {openRisks.map(r => (
            <RiskCard key={r.id} risk={r} ragBorder={ragBorder} ventureId={ventureId!} isGM={isGM} />
          ))}
        </div>
      )}

      {closedRisks.length > 0 && (
        <details className="mb-8">
          <summary className="text-sm text-[var(--text-3)] cursor-pointer mb-2">Closed Risks ({closedRisks.length})</summary>
          <div className="space-y-2">
            {closedRisks.map(r => (
              <div key={r.id} className="bg-[var(--surface-1)] rounded-xl p-3 text-sm text-[var(--text-3)] flex items-center gap-2">
                <span className="flex-1">{r.title}</span>
                <StatusBadge status={r.status} />
              </div>
            ))}
          </div>
        </details>
      )}

      {/* ── Issues ───────────────────────── */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Issues</h3>
        {!isGM && <Button onClick={() => setShowIssueForm(true)}>Log Issue</Button>}
      </div>

      {openIssues.length === 0 ? (
        <p className="text-[var(--text-3)] mb-6">No open issues.</p>
      ) : (
        <div className="space-y-3 mb-6">
          {openIssues.map(i => (
            <IssueCard key={i.id} issue={i} ventureId={ventureId!} isGM={isGM} />
          ))}
        </div>
      )}

      {resolvedIssues.length > 0 && (
        <details className="mb-8">
          <summary className="text-sm text-[var(--text-3)] cursor-pointer mb-2">Resolved Issues ({resolvedIssues.length})</summary>
          <div className="space-y-2">
            {resolvedIssues.map(i => (
              <div key={i.id} className="bg-[var(--surface-1)] rounded-xl p-3 text-sm text-[var(--text-3)] flex items-center gap-2">
                <span className="flex-1">{i.title}</span>
                <StatusBadge status={i.status} />
              </div>
            ))}
          </div>
        </details>
      )}

      {/* ── Blockers ─────────────────────── */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-[var(--text-0)]">Blockers</h3>
        {!isGM && <Button variant="secondary" onClick={() => setShowBlockerForm(true)}>Add Blocker</Button>}
      </div>

      {openBlockers.length === 0 ? (
        <p className="text-[var(--text-3)] mb-6">No open blockers.</p>
      ) : (
        <div className="space-y-3 mb-6">
          {openBlockers.map(b => (
            <BlockerCard key={b.id} blocker={b} isGM={isGM} />
          ))}
        </div>
      )}

      {resolvedBlockers.length > 0 && (
        <details>
          <summary className="text-sm text-[var(--text-3)] cursor-pointer mb-2">Resolved Blockers ({resolvedBlockers.length})</summary>
          <div className="space-y-2">
            {resolvedBlockers.map(b => (
              <div key={b.id} className="bg-[var(--surface-1)] rounded-xl p-3 text-sm text-[var(--text-3)] line-through">{b.description}</div>
            ))}
          </div>
        </details>
      )}

      {/* ── Forms ────────────────────────── */}
      <CreateRiskForm open={showRiskForm} onClose={() => setShowRiskForm(false)} ventureId={ventureId!} />
      <CreateIssueForm open={showIssueForm} onClose={() => setShowIssueForm(false)} ventureId={ventureId!} />
      <CreateBlockerForm open={showBlockerForm} onClose={() => setShowBlockerForm(false)} ventureId={ventureId!} />
    </div>
  );
}

// ── Risk Card with actions ──────────────────────

function RiskCard({ risk, ragBorder, ventureId, isGM }: { risk: any; ragBorder: Record<string, string>; ventureId: string; isGM: boolean }) {
  const utils = trpc.useUtils();
  const updateRisk = trpc.risks.updateRisk.useMutation({
    onSuccess: () => utils.risks.listRisks.invalidate({ ventureId }),
  });

  return (
    <div className={`bg-[var(--surface-0)] rounded-xl border border-[var(--border)] p-4 ${ragBorder[risk.rag] ?? ''}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium text-sm">{risk.title}</span>
        <StatusBadge status={risk.status} />
      </div>
      {risk.description && <p className="text-xs text-[var(--text-3)] mb-2">{risk.description}</p>}
      <div className="flex gap-4 text-xs text-[var(--text-3)] mb-2">
        <span>Impact: {risk.impact}</span>
        <span>Probability: {risk.probability}</span>
        <span>Owner: {risk.owner ?? '—'}</span>
      </div>
      {risk.mitigationPlan && <p className="text-xs text-[var(--text-3)] mb-3">Mitigation: {risk.mitigationPlan}</p>}
      {risk.escalated && <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full me-2">Escalated</span>}

      {!isGM && (
        <div className="flex gap-2 mt-3 pt-3 border-t border-[var(--border)]">
          {!risk.escalated && (
            <Button variant="secondary" onClick={() => updateRisk.mutate({ id: risk.id, escalated: true })}>
              Escalate
            </Button>
          )}
          {risk.status === 'open' && (
            <Button variant="secondary" onClick={() => updateRisk.mutate({ id: risk.id, status: 'mitigated' })}>
              Mark Mitigated
            </Button>
          )}
          <Button variant="secondary" onClick={() => updateRisk.mutate({ id: risk.id, status: 'closed' })}>
            Close
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Issue Card with actions ─────────────────────

function IssueCard({ issue, ventureId, isGM }: { issue: any; ventureId: string; isGM: boolean }) {
  const utils = trpc.useUtils();
  const updateIssue = trpc.risks.updateIssue.useMutation({
    onSuccess: () => utils.risks.listIssues.invalidate({ ventureId }),
  });

  return (
    <div className="bg-[var(--surface-0)] rounded-xl border border-[var(--border)] p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium text-sm">{issue.title}</span>
        <StatusBadge status={issue.status} />
      </div>
      {issue.description && <p className="text-xs text-[var(--text-3)] mb-2">{issue.description}</p>}
      <div className="flex gap-4 text-xs text-[var(--text-3)] mb-1">
        <span>Severity: {issue.severity}</span>
        <span>Owner: {issue.owner ?? '—'}</span>
      </div>
      {issue.resolutionPlan && <p className="text-xs text-[var(--text-3)] mb-3">Resolution: {issue.resolutionPlan}</p>}
      {issue.escalated && <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full me-2">Escalated</span>}

      {!isGM && (
        <div className="flex gap-2 mt-3 pt-3 border-t border-[var(--border)]">
          {!issue.escalated && (
            <Button variant="secondary" onClick={() => updateIssue.mutate({ id: issue.id, escalated: true })}>
              Escalate
            </Button>
          )}
          {issue.status === 'open' && (
            <Button variant="secondary" onClick={() => updateIssue.mutate({ id: issue.id, status: 'in_progress' })}>
              In Progress
            </Button>
          )}
          <Button variant="secondary" onClick={() => updateIssue.mutate({ id: issue.id, status: 'resolved' })}>
            Resolve
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Blocker Card with resolve action ────────────

function BlockerCard({ blocker, isGM }: { blocker: any; isGM: boolean }) {
  const utils = trpc.useUtils();
  const resolve = trpc.risks.resolveBlocker.useMutation({
    onSuccess: () => {
      utils.risks.listBlockers.invalidate();
      utils.dashboard.pm.invalidate();
    },
  });

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-start gap-2">
          <span className="text-amber-500 mt-0.5">●</span>
          <span className="text-sm">{blocker.description}</span>
        </div>
        {!isGM && (
          <Button variant="secondary" onClick={() => resolve.mutate({ id: blocker.id })}>
            Resolve
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Create Risk Form ────────────────────────────

function CreateRiskForm({ open, onClose, ventureId }: { open: boolean; onClose: () => void; ventureId: string }) {
  const utils = trpc.useUtils();
  const create = trpc.risks.createRisk.useMutation({
    onSuccess: () => { utils.risks.listRisks.invalidate({ ventureId }); onClose(); },
  });
  const [form, setForm] = useState({ title: '', description: '', probability: 'medium', impact: 'medium', mitigationPlan: '', owner: '' });

  const handleSubmit = () => {
    if (!form.title.trim()) return;
    create.mutate({ ventureId, ...form, probability: form.probability as any, impact: form.impact as any });
    setForm({ title: '', description: '', probability: 'medium', impact: 'medium', mitigationPlan: '', owner: '' });
  };

  return (
    <Modal open={open} onClose={onClose} title="Log Risk">
      <FormField label="Title" required><Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Risk title" /></FormField>
      <FormField label="Description"><TextArea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} placeholder="Describe the risk" /></FormField>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Probability">
          <Select value={form.probability} onChange={e => setForm(f => ({ ...f, probability: e.target.value }))}>
            <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
          </Select>
        </FormField>
        <FormField label="Impact">
          <Select value={form.impact} onChange={e => setForm(f => ({ ...f, impact: e.target.value }))}>
            <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
          </Select>
        </FormField>
      </div>
      <FormField label="Mitigation Plan"><TextArea value={form.mitigationPlan} onChange={e => setForm(f => ({ ...f, mitigationPlan: e.target.value }))} rows={2} placeholder="How will this be mitigated?" /></FormField>
      <FormField label="Owner"><Input value={form.owner} onChange={e => setForm(f => ({ ...f, owner: e.target.value }))} placeholder="Who owns this risk" /></FormField>
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSubmit} disabled={create.isPending || !form.title.trim()}>{create.isPending ? 'Saving...' : 'Log Risk'}</Button>
      </div>
    </Modal>
  );
}

// ── Create Issue Form ───────────────────────────

function CreateIssueForm({ open, onClose, ventureId }: { open: boolean; onClose: () => void; ventureId: string }) {
  const utils = trpc.useUtils();
  const create = trpc.risks.createIssue.useMutation({
    onSuccess: () => { utils.risks.listIssues.invalidate({ ventureId }); onClose(); },
  });
  const [form, setForm] = useState({ title: '', description: '', severity: 'medium', resolutionPlan: '', owner: '' });

  const handleSubmit = () => {
    if (!form.title.trim()) return;
    create.mutate({ ventureId, ...form, severity: form.severity as any });
    setForm({ title: '', description: '', severity: 'medium', resolutionPlan: '', owner: '' });
  };

  return (
    <Modal open={open} onClose={onClose} title="Log Issue">
      <FormField label="Title" required><Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Issue title" /></FormField>
      <FormField label="Description"><TextArea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} placeholder="Describe the issue" /></FormField>
      <FormField label="Severity">
        <Select value={form.severity} onChange={e => setForm(f => ({ ...f, severity: e.target.value }))}>
          <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
        </Select>
      </FormField>
      <FormField label="Resolution Plan"><TextArea value={form.resolutionPlan} onChange={e => setForm(f => ({ ...f, resolutionPlan: e.target.value }))} rows={2} placeholder="How will this be resolved?" /></FormField>
      <FormField label="Owner"><Input value={form.owner} onChange={e => setForm(f => ({ ...f, owner: e.target.value }))} placeholder="Who owns this issue" /></FormField>
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSubmit} disabled={create.isPending || !form.title.trim()}>{create.isPending ? 'Saving...' : 'Log Issue'}</Button>
      </div>
    </Modal>
  );
}

// ── Create Blocker Form ─────────────────────────

function CreateBlockerForm({ open, onClose, ventureId }: { open: boolean; onClose: () => void; ventureId: string }) {
  const utils = trpc.useUtils();
  const create = trpc.risks.createBlocker.useMutation({
    onSuccess: () => { utils.risks.listBlockers.invalidate({ ventureId }); utils.dashboard.pm.invalidate(); onClose(); },
  });
  const [description, setDescription] = useState('');

  const handleSubmit = () => {
    if (!description.trim()) return;
    create.mutate({ ventureId, description });
    setDescription('');
  };

  return (
    <Modal open={open} onClose={onClose} title="Add Blocker">
      <FormField label="Description" required>
        <TextArea value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="What is blocking progress?" />
      </FormField>
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSubmit} disabled={create.isPending || !description.trim()}>
          {create.isPending ? 'Saving...' : 'Add Blocker'}
        </Button>
      </div>
    </Modal>
  );
}
