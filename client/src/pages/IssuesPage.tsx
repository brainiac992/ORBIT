import { useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { trpc } from '../lib/trpc.js';
import { StatusBadge, KpiCard } from '../components/StatusBadge.js';
import { Modal, FormField, Input, TextArea, Select, Button } from '../components/Modal.js';
import { useAuth } from '../lib/auth.js';

export function IssuesPage() {
  const { ventureId } = useParams<{ ventureId: string }>();
  const { user } = useAuth();
  const utils = trpc.useUtils();

  const { data: issuesList, isLoading, error } = trpc.risks.listIssues.useQuery({ ventureId: ventureId! });

  const [showForm, setShowForm] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterSeverity, setFilterSeverity] = useState<string>('all');

  const isGM = user?.role === 'gm';

  const filtered = useMemo(() => {
    let list = issuesList ?? [];
    if (filterStatus !== 'all') list = list.filter((i: any) => i.status === filterStatus);
    if (filterSeverity !== 'all') list = list.filter((i: any) => i.severity === filterSeverity);
    return list;
  }, [issuesList, filterStatus, filterSeverity]);

  if (isLoading) return <div className="p-8 text-center text-[var(--text-3)]">Loading issues...</div>;
  if (error) return <div className="p-8 text-red-400">Unable to load issues.</div>;

  const all = issuesList ?? [];
  const openCount = all.filter((i: any) => i.status !== 'resolved').length;
  const blockerCount = all.filter((i: any) => i.severity === 'blocker' && i.status !== 'resolved').length;
  const resolvedCount = all.filter((i: any) => i.status === 'resolved').length;

  const openIssues = filtered.filter((i: any) => i.status !== 'resolved');
  const resolvedIssues = filtered.filter((i: any) => i.status === 'resolved');

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-[var(--text-0)]">Issues</h3>
        {!isGM && <Button onClick={() => setShowForm(true)}>Log Issue</Button>}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        <KpiCard label="Open Issues" value={openCount} accent={openCount > 0 ? 'text-amber-400' : 'text-emerald-400'} />
        <KpiCard label="Blocking" value={blockerCount} accent={blockerCount > 0 ? 'text-red-400' : 'text-emerald-400'} />
        <KpiCard label="Resolved" value={resolvedCount} accent="text-emerald-400" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <span className="text-[10px] text-[var(--text-3)] uppercase tracking-widest">Filter:</span>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="bg-[var(--surface-1)] border border-[var(--border)] rounded-lg px-2 py-1 text-xs text-[var(--text-1)]">
          <option value="all">All Statuses</option>
          <option value="open">Open</option>
          <option value="in_progress">In Progress</option>
          <option value="resolved">Resolved</option>
        </select>
        <select value={filterSeverity} onChange={e => setFilterSeverity(e.target.value)} className="bg-[var(--surface-1)] border border-[var(--border)] rounded-lg px-2 py-1 text-xs text-[var(--text-1)]">
          <option value="all">All Severities</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="blocker">Blocker</option>
        </select>
        {(filterStatus !== 'all' || filterSeverity !== 'all') && (
          <button onClick={() => { setFilterStatus('all'); setFilterSeverity('all'); }} className="text-xs text-[var(--accent-hover)] hover:underline cursor-pointer">Clear filters</button>
        )}
      </div>

      {/* Open issues */}
      {openIssues.length === 0 ? (
        <p className="text-[var(--text-3)] mb-6">No open issues.</p>
      ) : (
        <div className="space-y-3 mb-6">
          {openIssues.map((i: any) => (
            <IssueCard key={i.id} issue={i} ventureId={ventureId!} isGM={isGM} />
          ))}
        </div>
      )}

      {/* Resolved */}
      {resolvedIssues.length > 0 && (
        <details className="mb-8">
          <summary className="text-sm text-[var(--text-3)] cursor-pointer mb-2">Resolved Issues ({resolvedIssues.length})</summary>
          <div className="space-y-2">
            {resolvedIssues.map((i: any) => (
              <div key={i.id} className="bg-[var(--surface-1)] rounded-xl p-3 text-sm text-[var(--text-3)] flex items-center gap-2">
                <span className="flex-1">{i.title}</span>
                <StatusBadge status={i.severity} />
                <StatusBadge status={i.status} />
              </div>
            ))}
          </div>
        </details>
      )}

      <CreateIssueForm open={showForm} onClose={() => setShowForm(false)} ventureId={ventureId!} />
    </div>
  );
}

function IssueCard({ issue, ventureId, isGM }: { issue: any; ventureId: string; isGM: boolean }) {
  const utils = trpc.useUtils();
  const updateIssue = trpc.risks.updateIssue.useMutation({
    onSuccess: () => utils.risks.listIssues.invalidate({ ventureId }),
  });

  const severityBorder: Record<string, string> = {
    blocker: 'border-s-4 border-s-red-700',
    high: 'border-s-4 border-s-red-500',
    medium: 'border-s-4 border-s-amber-500',
    low: 'border-s-4 border-s-green-500',
  };

  return (
    <div className={`bg-[var(--surface-0)] rounded-xl border border-[var(--border)] p-4 hover:border-[var(--border-hover)] transition-all ${severityBorder[issue.severity] ?? ''}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium text-sm text-[var(--text-0)]">{issue.title}</span>
        <div className="flex items-center gap-2">
          <StatusBadge status={issue.severity} />
          <StatusBadge status={issue.status} />
        </div>
      </div>
      {issue.description && <p className="text-xs text-[var(--text-3)] mb-2">{issue.description}</p>}
      <div className="flex gap-4 text-xs text-[var(--text-3)] mb-1">
        <span>Owner: {issue.owner ?? '—'}</span>
      </div>
      {issue.resolutionPlan && <p className="text-xs text-[var(--text-3)] mb-3">Resolution: {issue.resolutionPlan}</p>}
      {issue.escalated && <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full me-2">Escalated</span>}

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
          {issue.status !== 'resolved' && (
            <Button variant="secondary" onClick={() => updateIssue.mutate({ id: issue.id, status: 'resolved' })}>
              Resolve
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

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
          <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="blocker">Blocker</option>
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
