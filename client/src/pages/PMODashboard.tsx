import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { trpc } from '../lib/trpc.js';
import { HealthDot, StatusBadge, KpiCard, SectionHeader } from '../components/StatusBadge.js';
import { Modal, FormField, Input, TextArea, Select, Button } from '../components/Modal.js';
import { useExportPortfolio } from '../hooks/useExport.js';
import { formatDate, daysSince } from '../lib/format.js';
import { JiraSyncBadge } from '../components/JiraSyncBadge.js';

type Tab = 'ventures' | 'escalations' | 'decisions' | 'resources';

export function PMODashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('ventures');
  const [showCreateVenture, setShowCreateVenture] = useState(false);
  const { data, isLoading, error } = trpc.dashboard.pmo.useQuery();
  const navigate = useNavigate();
  const { exportCSV } = useExportPortfolio();

  if (isLoading) return <div className="p-8 text-[var(--text-3)]">Loading ventures...</div>;
  if (error) return <div className="p-8 text-red-400">Unable to load ventures.</div>;
  if (!data) return null;

  const escalationCount = data.escalations.risks.length + data.escalations.issues.length;
  const decisionCount = data.openDecisions.length;
  const blockerCount = data.openBlockers.length;

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: 'ventures', label: 'Ventures' },
    { id: 'escalations', label: 'Escalations', badge: escalationCount || undefined },
    { id: 'decisions', label: 'Decisions', badge: decisionCount || undefined },
    { id: 'resources', label: 'Resources' },
  ];

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-2xl font-bold text-[var(--text-0)]">Venture Oversight</h2>
        <div className="flex gap-2 no-print">
          <Button variant="ghost" onClick={exportCSV} className="!text-xs">Export CSV</Button>
          <Button onClick={() => setShowCreateVenture(true)}>Create Venture</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <KpiCard label="Active Ventures" value={data.ventures.length} />
        <KpiCard label="Escalations" value={escalationCount} accent={escalationCount > 0 ? 'text-red-400' : 'text-emerald-400'} />
        <KpiCard label="Decisions Pending" value={decisionCount} accent={decisionCount > 0 ? 'text-amber-400' : 'text-emerald-400'} />
        <KpiCard label="Blocking Issues" value={blockerCount} accent={blockerCount > 0 ? 'text-red-400' : 'text-emerald-400'} />
      </div>

      <div className="flex gap-1 mb-6 bg-[var(--surface-0)] rounded-xl p-1 border border-[var(--border)] no-print">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
              activeTab === tab.id
                ? 'bg-[var(--accent)] text-white shadow-lg shadow-indigo-500/20'
                : 'text-[var(--text-2)] hover:text-[var(--text-0)] hover:bg-[var(--surface-1)]'
            }`}
          >
            {tab.label}
            {tab.badge && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                activeTab === tab.id ? 'bg-white/20 text-white' : 'bg-red-500/20 text-red-400'
              }`}>{tab.badge}</span>
            )}
          </button>
        ))}
      </div>

      {activeTab === 'ventures' && <VenturesTable ventures={data.ventures} onSelect={id => navigate(`/venture/${id}/plan`)} />}
      {activeTab === 'escalations' && <EscalationsPanel data={data.escalations} />}
      {activeTab === 'decisions' && <DecisionsPanel items={data.openDecisions} />}
      {activeTab === 'resources' && <ResourcesPanel />}

      <CreateVentureForm open={showCreateVenture} onClose={() => setShowCreateVenture(false)} />
    </div>
  );
}

function VenturesTable({ ventures, onSelect }: { ventures: any[]; onSelect: (id: string) => void }) {
  if (ventures.length === 0) return <EmptyState icon="🏗" text="No ventures created yet." />;

  return (
    <div className="bg-[var(--surface-0)] rounded-2xl border border-[var(--border)] overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[var(--surface-1)] text-[var(--text-3)] text-[10px] uppercase tracking-widest">
            <th className="text-start px-5 py-3">Name</th>
            <th className="text-start px-5 py-3">PM</th>
            <th className="text-start px-5 py-3">Health</th>
            <th className="text-start px-5 py-3">Progress</th>
            <th className="text-start px-5 py-3">Last Updated</th>
          </tr>
        </thead>
        <tbody>
          {ventures.map((v: any, i: number) => {
            const days = daysSince(v.updatedAt);
            return (
              <tr
                key={v.id}
                onClick={() => onSelect(v.id)}
                className="border-t border-[var(--border)] hover:bg-[var(--surface-1)] cursor-pointer transition-colors animate-in"
                style={{ animationDelay: `${i * 30}ms` }}
              >
                <td className="px-5 py-3.5 font-medium text-[var(--text-0)]">
                  <span className="flex items-center gap-2">
                    {v.name}
                    {v.jiraProjectKey && (
                      <JiraSyncBadge
                        lastSyncedAt={v.jiraLastSyncedAt}
                        hasError={v.jiraHasError ?? false}
                        jiraProjectKey={v.jiraProjectKey}
                      />
                    )}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-[var(--text-2)]">{v.pmName}</td>
                <td className="px-5 py-3.5"><HealthDot health={v.health} size="sm" /></td>
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className="w-20 bg-[var(--surface-2)] rounded-full h-1.5">
                      <div className="h-1.5 rounded-full bg-[var(--accent)]" style={{ width: `${v.completionPct}%` }} />
                    </div>
                    <span className="text-xs text-[var(--text-2)] ltr-num">{v.completionPct}%</span>
                  </div>
                </td>
                <td className="px-5 py-3.5">
                  <span className={v.isStale ? 'text-amber-400 font-medium' : 'text-[var(--text-3)]'}>
                    {days === 0 ? 'Today' : `${days}d ago`}
                    {v.isStale && ' ⚠'}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function EscalationsPanel({ data }: { data: { risks: any[]; issues: any[] } }) {
  const all = [...data.risks.map(r => ({ ...r, type: 'Risk' })), ...data.issues.map(i => ({ ...i, type: 'Issue' }))];
  if (all.length === 0) return <EmptyState icon="✅" text="No open escalations." />;
  return (
    <div className="space-y-3">
      {all.map((item, i) => (
        <div key={item.id} className="bg-[var(--surface-0)] rounded-xl border border-[var(--border)] p-4 animate-in" style={{ animationDelay: `${i * 30}ms` }}>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full font-semibold">{item.type}</span>
            <span className="text-sm font-medium text-[var(--text-0)]">{item.title}</span>
          </div>
          {item.description && <p className="text-xs text-[var(--text-3)]">{item.description}</p>}
        </div>
      ))}
    </div>
  );
}

function DecisionsPanel({ items }: { items: any[] }) {
  const utils = trpc.useUtils();
  const resolve = trpc.risks.resolveDecision.useMutation({ onSuccess: () => utils.dashboard.pmo.invalidate() });
  if (items.length === 0) return <EmptyState icon="✅" text="No open decisions." />;
  return (
    <div className="space-y-3">
      {items.map((d: any, i: number) => (
        <div key={d.id} className="bg-[var(--surface-0)] rounded-xl border border-[var(--border)] p-4 flex items-center justify-between animate-in" style={{ animationDelay: `${i * 30}ms` }}>
          <div>
            <span className="text-sm font-medium text-[var(--text-0)]">{d.description}</span>
            <p className="text-xs text-[var(--text-3)] mt-0.5">Logged {formatDate(d.createdAt)}</p>
          </div>
          <Button variant="secondary" onClick={() => resolve.mutate({ id: d.id })}>Resolve</Button>
        </div>
      ))}
    </div>
  );
}

function ResourcesPanel() {
  const { data, isLoading } = trpc.resources.allocationSummary.useQuery();
  if (isLoading) return <div className="text-[var(--text-3)]">Loading resources...</div>;
  if (!data || data.length === 0) return <EmptyState icon="👥" text="No resources in directory." />;

  return (
    <div className="bg-[var(--surface-0)] rounded-2xl border border-[var(--border)] overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[var(--surface-1)] text-[var(--text-3)] text-[10px] uppercase tracking-widest">
            <th className="text-start px-5 py-3">Name</th>
            <th className="text-start px-5 py-3">Type</th>
            <th className="text-start px-5 py-3">Role</th>
            <th className="text-start px-5 py-3">Allocated</th>
          </tr>
        </thead>
        <tbody>
          {data.map((r: any) => (
            <tr key={r.id} className="border-t border-[var(--border)]">
              <td className="px-5 py-3 font-medium text-[var(--text-0)]">{r.name}</td>
              <td className="px-5 py-3"><StatusBadge status={r.type} size="xs" /></td>
              <td className="px-5 py-3 text-[var(--text-2)]">{r.roleTitle}</td>
              <td className="px-5 py-3">
                <div className="flex items-center gap-2">
                  <div className="w-16 bg-[var(--surface-2)] rounded-full h-2">
                    <div className={`h-2 rounded-full ${r.overAllocated ? 'bg-red-500' : 'bg-[var(--accent)]'}`} style={{ width: `${Math.min(100, (r.totalHoursPerWeek / 40) * 100)}%` }} />
                  </div>
                  <span className={`text-xs ltr-num font-medium ${r.overAllocated ? 'text-red-400' : 'text-[var(--text-2)]'}`}>{r.totalHoursPerWeek}h</span>
                  {r.overAllocated && <span className="text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded-full">Over</span>}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="text-center py-12">
      <div className="text-4xl mb-4">{icon}</div>
      <p className="text-sm text-[var(--text-3)]">{text}</p>
    </div>
  );
}

function CreateVentureForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const utils = trpc.useUtils();
  const { data: pmUsers } = trpc.ventures.listPMs.useQuery(undefined, { enabled: open });
  const { data: ventureTypes } = trpc.config.listByCategory.useQuery({ category: 'venture_type' }, { enabled: open });
  const create = trpc.ventures.create.useMutation({
    onSuccess: () => {
      utils.dashboard.pmo.invalidate();
      setForm({ name: '', description: '', ventureType: '', pmUserId: '', startDate: '', targetEndDate: '', customType: false });
      onClose();
    },
  });
  const [form, setForm] = useState({ name: '', description: '', ventureType: '', pmUserId: '', startDate: '', targetEndDate: '', customType: false });

  const canSubmit = form.name.trim() && form.pmUserId && form.startDate;

  const handleSubmit = () => {
    if (!canSubmit) return;
    create.mutate({
      name: form.name,
      description: form.description || undefined,
      ventureType: form.ventureType || undefined,
      pmUserId: form.pmUserId,
      startDate: form.startDate,
      targetEndDate: form.targetEndDate || form.startDate, // default to start if empty
    });
  };

  return (
    <Modal open={open} onClose={onClose} title="Create Venture">
      <FormField label="Venture Name" required>
        <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. DARI.AE" />
      </FormField>
      <FormField label="Description">
        <TextArea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} placeholder="Brief description" />
      </FormField>
      <FormField label="Venture Type">
        {form.customType ? (
          <div className="flex gap-2">
            <Input value={form.ventureType} onChange={e => setForm(f => ({ ...f, ventureType: e.target.value }))} placeholder="e.g. Technology Platform" />
            <button onClick={() => setForm(f => ({ ...f, customType: false, ventureType: '' }))} className="text-xs text-[var(--text-3)] hover:text-[var(--text-0)] whitespace-nowrap">Use list</button>
          </div>
        ) : (
          <Select value={form.ventureType} onChange={e => {
            if (e.target.value === '__custom__') {
              setForm(f => ({ ...f, customType: true, ventureType: '' }));
            } else {
              setForm(f => ({ ...f, ventureType: e.target.value }));
            }
          }}>
            <option value="">Select a type</option>
            {ventureTypes?.map((opt: any) => (
              <option key={opt.id} value={opt.value}>{opt.label}</option>
            ))}
            <option value="__custom__">Custom...</option>
          </Select>
        )}
      </FormField>
      <FormField label="Assigned PM" required>
        <Select value={form.pmUserId} onChange={e => setForm(f => ({ ...f, pmUserId: e.target.value }))}>
          <option value="">Select a PM</option>
          {pmUsers?.map((pm: any) => (
            <option key={pm.id} value={pm.id}>{pm.name}</option>
          ))}
        </Select>
      </FormField>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Start Date" required>
          <Input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} />
        </FormField>
        <FormField label="Target End Date">
          <Input type="date" value={form.targetEndDate} onChange={e => setForm(f => ({ ...f, targetEndDate: e.target.value }))} />
        </FormField>
      </div>
      <div className="flex justify-end gap-2 mt-6">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSubmit} disabled={create.isPending || !canSubmit}>
          {create.isPending ? 'Creating...' : 'Create Venture'}
        </Button>
      </div>
    </Modal>
  );
}
