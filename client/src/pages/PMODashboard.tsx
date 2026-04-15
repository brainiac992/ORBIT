import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { trpc } from '../lib/trpc.js';
import { HealthDot, StatusBadge } from '../components/StatusBadge.js';
import { Modal, FormField, Input, TextArea, Select, Button } from '../components/Modal.js';
import { useExportPortfolio } from '../hooks/useExport.js';
import { formatDate, daysSince } from '../lib/format.js';
import { JiraSyncBadge } from '../components/JiraSyncBadge.js';

type Tab = 'ventures' | 'escalations' | 'decisions' | 'resources';

const HEALTH_CONFIG = {
  on_track:  { label: 'On Track',  color: 'bg-emerald-500', text: 'text-emerald-400', border: 'border-l-emerald-500' },
  at_risk:   { label: 'At Risk',   color: 'bg-amber-500',   text: 'text-amber-400',   border: 'border-l-amber-500'   },
  off_track: { label: 'Off Track', color: 'bg-red-500',     text: 'text-red-400',     border: 'border-l-red-500'     },
  complete:  { label: 'Complete',  color: 'bg-[var(--accent)]', text: 'text-[var(--accent-hover)]', border: 'border-l-[var(--accent)]' },
} as const;

export function PMODashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('ventures');
  const [showCreateVenture, setShowCreateVenture] = useState(false);
  const { data, isLoading, error } = trpc.dashboard.pmo.useQuery();
  const navigate = useNavigate();
  const { exportCSV } = useExportPortfolio();

  if (isLoading) return <LoadingSkeleton />;
  if (error) return <div className="p-8 text-red-400">Unable to load ventures.</div>;
  if (!data) return null;

  const escalationCount = data.escalations.risks.length + data.escalations.issues.length;
  const decisionCount = data.openDecisions.length;
  const blockerCount = data.openBlockers.length;
  const total = data.ventures.length;

  // Health distribution for portfolio bar
  const onTrackCount  = data.ventures.filter((v: any) => v.health === 'on_track').length;
  const atRiskCount   = data.ventures.filter((v: any) => v.health === 'at_risk').length;
  const offTrackCount = data.ventures.filter((v: any) => v.health === 'off_track').length;
  const completeCount = data.ventures.filter((v: any) => v.health === 'complete').length;

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: 'ventures', label: 'Ventures' },
    { id: 'escalations', label: 'Escalations', badge: escalationCount || undefined },
    { id: 'decisions', label: 'Decisions', badge: decisionCount || undefined },
    { id: 'resources', label: 'Resources' },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">

      {/* ── Page header ── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-[var(--text-0)]">Venture Oversight</h2>
          <p className="text-xs text-[var(--text-3)] mt-0.5 uppercase tracking-wider">{total} active venture{total !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex gap-2 no-print">
          <Button variant="ghost" onClick={exportCSV} className="!text-xs">Export CSV</Button>
          <Button onClick={() => setShowCreateVenture(true)}>+ New Venture</Button>
        </div>
      </div>

      {/* ── KPI strip ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Active Ventures"   value={total}         />
        <StatCard label="On Track"          value={onTrackCount}  color="emerald" />
        <StatCard label="At Risk"           value={atRiskCount}   color="amber"   />
        <StatCard label="Off Track / Blocked" value={offTrackCount + blockerCount} color="red" />
      </div>

      {/* ── Portfolio health bar ── */}
      {total > 0 && (
        <div className="bg-[var(--surface-0)] rounded-2xl border border-[var(--border)] px-5 py-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-semibold text-[var(--text-3)] uppercase tracking-widest">Portfolio Health Distribution</span>
          </div>
          <div className="flex h-2.5 rounded-full overflow-hidden gap-px">
            {onTrackCount  > 0 && <div className="bg-emerald-500 transition-all" style={{ width: `${(onTrackCount  / total) * 100}%` }} />}
            {atRiskCount   > 0 && <div className="bg-amber-500  transition-all" style={{ width: `${(atRiskCount   / total) * 100}%` }} />}
            {offTrackCount > 0 && <div className="bg-red-500    transition-all" style={{ width: `${(offTrackCount / total) * 100}%` }} />}
            {completeCount > 0 && <div className="bg-[var(--accent)] transition-all" style={{ width: `${(completeCount / total) * 100}%` }} />}
          </div>
          <div className="flex flex-wrap gap-5 mt-3 text-xs text-[var(--text-3)]">
            {onTrackCount  > 0 && <LegendDot color="bg-emerald-500" label={`On Track — ${onTrackCount}`}  />}
            {atRiskCount   > 0 && <LegendDot color="bg-amber-500"   label={`At Risk — ${atRiskCount}`}    />}
            {offTrackCount > 0 && <LegendDot color="bg-red-500"     label={`Off Track — ${offTrackCount}`} />}
            {completeCount > 0 && <LegendDot color="bg-[var(--accent)]" label={`Complete — ${completeCount}`} />}
          </div>
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="flex gap-1 mb-5 bg-[var(--surface-0)] rounded-xl p-1 border border-[var(--border)] no-print">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
              activeTab === tab.id
                ? 'bg-[var(--accent)] text-white'
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

      {activeTab === 'ventures'    && <VenturesTable ventures={data.ventures} onSelect={id => navigate(`/venture/${id}/plan`)} />}
      {activeTab === 'escalations' && <EscalationsPanel data={data.escalations} />}
      {activeTab === 'decisions'   && <DecisionsPanel items={data.openDecisions} />}
      {activeTab === 'resources'   && <ResourcesPanel />}

      <CreateVentureForm open={showCreateVenture} onClose={() => setShowCreateVenture(false)} />
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: number; color?: 'emerald' | 'amber' | 'red' }) {
  const colorMap = { emerald: 'text-emerald-400', amber: 'text-amber-400', red: 'text-red-400' };
  return (
    <div className="bg-[var(--surface-0)] rounded-2xl border border-[var(--border)] p-5">
      <div className={`text-3xl font-bold ltr-num mb-1 ${color ? colorMap[color] : 'text-[var(--text-0)]'}`}>{value}</div>
      <div className="text-[10px] font-semibold text-[var(--text-3)] uppercase tracking-wider">{label}</div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${color}`} />
      {label}
    </span>
  );
}

function HealthBadge({ health }: { health: string }) {
  const cfg = HEALTH_CONFIG[health as keyof typeof HEALTH_CONFIG];
  if (!cfg) return null;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${cfg.text}`}>
      <span className={`w-2 h-2 rounded-full ${cfg.color}`} />
      {cfg.label}
    </span>
  );
}

function VenturesTable({ ventures, onSelect }: { ventures: any[]; onSelect: (id: string) => void }) {
  if (ventures.length === 0) return <EmptyState icon="🏗" text="No ventures created yet." />;

  return (
    <div className="bg-[var(--surface-0)] rounded-2xl border border-[var(--border)] overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[var(--accent)] text-white text-[10px] uppercase tracking-widest">
            <th className="text-start px-5 py-3 font-semibold">Venture</th>
            <th className="text-start px-5 py-3 font-semibold">PM</th>
            <th className="text-start px-5 py-3 font-semibold">Type</th>
            <th className="text-start px-5 py-3 font-semibold">Health</th>
            <th className="text-start px-5 py-3 font-semibold">Progress</th>
            <th className="text-start px-5 py-3 font-semibold">Target</th>
            <th className="text-start px-5 py-3 font-semibold">Updated</th>
          </tr>
        </thead>
        <tbody>
          {ventures.map((v: any, i: number) => {
            const days = daysSince(v.updatedAt);
            const hCfg = HEALTH_CONFIG[v.health as keyof typeof HEALTH_CONFIG];
            return (
              <tr
                key={v.id}
                onClick={() => onSelect(v.id)}
                className={`border-t border-[var(--border)] hover:bg-[var(--surface-1)] cursor-pointer transition-colors border-l-4 animate-in ${hCfg?.border ?? ''}`}
                style={{ animationDelay: `${i * 25}ms` }}
              >
                <td className="px-5 py-3.5 font-medium text-[var(--text-0)]">
                  <div className="flex items-center gap-2">
                    {v.name}
                    {v.jiraProjectKey && (
                      <JiraSyncBadge
                        lastSyncedAt={v.jiraLastSyncedAt}
                        hasError={v.jiraHasError ?? false}
                        jiraProjectKey={v.jiraProjectKey}
                      />
                    )}
                  </div>
                </td>
                <td className="px-5 py-3.5 text-[var(--text-2)] text-xs">{v.pmName}</td>
                <td className="px-5 py-3.5">
                  {v.ventureType
                    ? <span className="text-[10px] bg-[var(--surface-1)] text-[var(--text-2)] px-2 py-0.5 rounded-full">{v.ventureType}</span>
                    : <span className="text-[var(--text-3)]">—</span>}
                </td>
                <td className="px-5 py-3.5"><HealthBadge health={v.health} /></td>
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-2">
                    <div className="w-20 bg-[var(--surface-2)] rounded-full h-1.5 overflow-hidden">
                      <div className={`h-full rounded-full ${hCfg?.color ?? 'bg-[var(--accent)]'}`} style={{ width: `${v.completionPct}%` }} />
                    </div>
                    <span className="text-xs text-[var(--text-2)] ltr-num w-8">{v.completionPct}%</span>
                  </div>
                </td>
                <td className="px-5 py-3.5 text-xs text-[var(--text-3)] ltr-num">
                  {v.targetEndDate ? formatDate(v.targetEndDate) : '—'}
                </td>
                <td className="px-5 py-3.5 text-xs">
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
  const risks  = data.risks.map(r  => ({ ...r,  kind: 'Risk'  as const }));
  const issues = data.issues.map(i => ({ ...i,  kind: 'Issue' as const }));
  const all    = [...risks, ...issues];

  if (all.length === 0) return <EmptyState icon="✅" text="No open escalations." />;
  return (
    <div className="bg-[var(--surface-0)] rounded-2xl border border-[var(--border)] overflow-hidden">
      <div className="bg-[var(--accent)] text-white px-5 py-3 text-[10px] font-semibold uppercase tracking-widest">
        {all.length} open escalation{all.length !== 1 ? 's' : ''}
      </div>
      <div className="divide-y divide-[var(--border)]">
        {all.map((item) => (
          <div key={item.id} className="px-5 py-4 flex items-start gap-3">
            <span className={`mt-0.5 text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${
              item.kind === 'Risk' ? 'bg-amber-500/20 text-amber-400' : 'bg-red-500/20 text-red-400'
            }`}>{item.kind}</span>
            <div>
              <div className="text-sm font-medium text-[var(--text-0)]">{item.title}</div>
              {item.description && <p className="text-xs text-[var(--text-3)] mt-0.5 line-clamp-2">{item.description}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DecisionsPanel({ items }: { items: any[] }) {
  const utils = trpc.useUtils();
  const resolve = trpc.risks.resolveDecision.useMutation({ onSuccess: () => utils.dashboard.pmo.invalidate() });
  if (items.length === 0) return <EmptyState icon="✅" text="No open decisions." />;
  return (
    <div className="bg-[var(--surface-0)] rounded-2xl border border-[var(--border)] overflow-hidden">
      <div className="bg-[var(--accent)] text-white px-5 py-3 text-[10px] font-semibold uppercase tracking-widest">
        {items.length} pending decision{items.length !== 1 ? 's' : ''}
      </div>
      <div className="divide-y divide-[var(--border)]">
        {items.map((d: any) => (
          <div key={d.id} className="px-5 py-4 flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium text-[var(--text-0)]">{d.description}</div>
              <p className="text-[10px] text-[var(--text-3)] mt-0.5">Logged {formatDate(d.createdAt)}</p>
            </div>
            <Button variant="secondary" onClick={() => resolve.mutate({ id: d.id })} className="flex-shrink-0">Resolve</Button>
          </div>
        ))}
      </div>
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
          <tr className="bg-[var(--accent)] text-white text-[10px] uppercase tracking-widest">
            <th className="text-start px-5 py-3 font-semibold">Name</th>
            <th className="text-start px-5 py-3 font-semibold">Type</th>
            <th className="text-start px-5 py-3 font-semibold">Role</th>
            <th className="text-start px-5 py-3 font-semibold">Allocated</th>
          </tr>
        </thead>
        <tbody>
          {data.map((r: any) => (
            <tr key={r.id} className="border-t border-[var(--border)] hover:bg-[var(--surface-1)] transition-colors">
              <td className="px-5 py-3 font-medium text-[var(--text-0)]">{r.name}</td>
              <td className="px-5 py-3"><StatusBadge status={r.type} size="xs" /></td>
              <td className="px-5 py-3 text-[var(--text-2)]">{r.roleTitle}</td>
              <td className="px-5 py-3">
                <div className="flex items-center gap-2">
                  <div className="w-16 bg-[var(--surface-2)] rounded-full h-1.5 overflow-hidden">
                    <div className={`h-full rounded-full ${r.overAllocated ? 'bg-red-500' : 'bg-[var(--accent)]'}`}
                         style={{ width: `${Math.min(100, (r.totalHoursPerWeek / 40) * 100)}%` }} />
                  </div>
                  <span className={`text-xs ltr-num font-medium ${r.overAllocated ? 'text-red-400' : 'text-[var(--text-2)]'}`}>
                    {r.totalHoursPerWeek}h
                  </span>
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

function LoadingSkeleton() {
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="h-8 w-48 bg-[var(--surface-1)] rounded-xl mb-6 animate-pulse" />
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-[var(--surface-0)] rounded-2xl animate-pulse" />)}
      </div>
      <div className="h-20 bg-[var(--surface-0)] rounded-2xl mb-6 animate-pulse" />
      <div className="h-64 bg-[var(--surface-0)] rounded-2xl animate-pulse" />
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
            if (e.target.value === '__custom__') setForm(f => ({ ...f, customType: true, ventureType: '' }));
            else setForm(f => ({ ...f, ventureType: e.target.value }));
          }}>
            <option value="">Select a type</option>
            {ventureTypes?.map((opt: any) => <option key={opt.id} value={opt.value}>{opt.label}</option>)}
            <option value="__custom__">Custom...</option>
          </Select>
        )}
      </FormField>
      <FormField label="Assigned PM" required>
        <Select value={form.pmUserId} onChange={e => setForm(f => ({ ...f, pmUserId: e.target.value }))}>
          <option value="">Select a PM</option>
          {pmUsers?.map((pm: any) => <option key={pm.id} value={pm.id}>{pm.name}</option>)}
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
        <Button onClick={() => {
          if (!canSubmit) return;
          create.mutate({
            name: form.name,
            description: form.description || undefined,
            ventureType: form.ventureType || undefined,
            pmUserId: form.pmUserId,
            startDate: form.startDate,
            targetEndDate: form.targetEndDate || form.startDate,
          });
        }} disabled={create.isPending || !canSubmit}>
          {create.isPending ? 'Creating...' : 'Create Venture'}
        </Button>
      </div>
    </Modal>
  );
}
