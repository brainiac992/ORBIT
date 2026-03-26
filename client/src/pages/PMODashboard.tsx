import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { trpc } from '../lib/trpc.js';
import { HealthDot, StatusBadge } from '../components/StatusBadge.js';

type Tab = 'ventures' | 'escalations' | 'decisions' | 'blockers' | 'resources';

export function PMODashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('ventures');
  const { data, isLoading, error } = trpc.dashboard.pmo.useQuery();
  const navigate = useNavigate();

  if (isLoading) return <div className="p-8 text-center text-[var(--text-secondary)]">Loading ventures...</div>;
  if (error) return <div className="p-8 text-center text-red-600">Unable to load ventures.</div>;
  if (!data) return null;

  const escalationCount = data.escalations.risks.length + data.escalations.issues.length;
  const decisionCount = data.openDecisions.length;
  const blockerCount = data.openBlockers.length;

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: 'ventures', label: 'Ventures' },
    { id: 'escalations', label: 'Escalations', badge: escalationCount || undefined },
    { id: 'decisions', label: 'Decisions Needed', badge: decisionCount || undefined },
    { id: 'blockers', label: 'Blockers', badge: blockerCount || undefined },
    { id: 'resources', label: 'Resources' },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h2 className="text-xl font-semibold mb-6">Venture Oversight</h2>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-[var(--border)]">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === tab.id
                ? 'border-[var(--accent)] text-[var(--accent)]'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {tab.label}
            {tab.badge && (
              <span className="bg-red-100 text-red-700 text-xs px-1.5 py-0.5 rounded-full">{tab.badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'ventures' && <VenturesTable ventures={data.ventures} onSelect={id => navigate(`/venture/${id}/plan`)} />}
      {activeTab === 'escalations' && <EscalationsPanel data={data.escalations} />}
      {activeTab === 'decisions' && <DecisionsPanel items={data.openDecisions} />}
      {activeTab === 'blockers' && <BlockersPanel items={data.openBlockers} />}
      {activeTab === 'resources' && <ResourcesPanel />}
    </div>
  );
}

function VenturesTable({ ventures, onSelect }: { ventures: any[]; onSelect: (id: string) => void }) {
  const [sortKey, setSortKey] = useState<string>('name');

  const sorted = [...ventures].sort((a, b) => {
    if (sortKey === 'name') return a.name.localeCompare(b.name);
    if (sortKey === 'completionPct') return b.completionPct - a.completionPct;
    return 0;
  });

  if (ventures.length === 0) {
    return <p className="text-[var(--text-secondary)]">No ventures created yet. Create your first venture.</p>;
  }

  function daysSince(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  }

  return (
    <div className="bg-white rounded-xl border border-[var(--border)] overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[var(--surface-muted)] text-[var(--text-secondary)] text-xs uppercase tracking-wide">
            <th className="text-start px-4 py-3 cursor-pointer" onClick={() => setSortKey('name')}>Name</th>
            <th className="text-start px-4 py-3">PM</th>
            <th className="text-start px-4 py-3">Health</th>
            <th className="text-start px-4 py-3 cursor-pointer" onClick={() => setSortKey('completionPct')}>% Complete</th>
            <th className="text-start px-4 py-3">Last Updated</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(v => {
            const days = daysSince(v.updatedAt);
            return (
              <tr
                key={v.id}
                onClick={() => onSelect(v.id)}
                className="border-t border-[var(--border)] hover:bg-blue-50 cursor-pointer transition-colors"
              >
                <td className="px-4 py-3 font-medium">{v.name}</td>
                <td className="px-4 py-3">{v.pmName}</td>
                <td className="px-4 py-3"><HealthDot health={v.health} /></td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="ltr-num">{v.completionPct}%</span>
                    <div className="w-16 bg-gray-100 rounded-full h-1.5">
                      <div className="h-1.5 rounded-full bg-[var(--accent)]" style={{ width: `${v.completionPct}%` }} />
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={v.isStale ? 'text-amber-600 font-medium' : ''}>
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
  const all = [
    ...data.risks.map(r => ({ ...r, type: 'Risk' })),
    ...data.issues.map(i => ({ ...i, type: 'Issue' })),
  ];

  if (all.length === 0) return <p className="text-[var(--text-secondary)]">No open escalations across ventures.</p>;

  return (
    <div className="space-y-3">
      {all.map(item => (
        <div key={item.id} className="bg-white rounded-lg border border-[var(--border)] p-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">{item.type}</span>
            <span className="font-medium text-sm">{item.title}</span>
          </div>
          <p className="text-xs text-[var(--text-secondary)]">{item.description}</p>
        </div>
      ))}
    </div>
  );
}

function DecisionsPanel({ items }: { items: any[] }) {
  if (items.length === 0) return <p className="text-[var(--text-secondary)]">No open decisions across ventures.</p>;

  return (
    <div className="space-y-3">
      {items.map(d => (
        <div key={d.id} className="bg-white rounded-lg border border-[var(--border)] p-4">
          <div className="flex items-center gap-2 mb-1">
            <StatusBadge status="open" />
            <span className="text-sm font-medium">{d.description}</span>
          </div>
          <p className="text-xs text-[var(--text-secondary)]">
            Logged: {new Date(d.createdAt ?? Date.now()).toLocaleDateString()}
          </p>
        </div>
      ))}
    </div>
  );
}

function BlockersPanel({ items }: { items: any[] }) {
  if (items.length === 0) return <p className="text-[var(--text-secondary)]">No open blockers across ventures.</p>;

  return (
    <div className="space-y-3">
      {items.map(b => (
        <div key={b.id} className="bg-white rounded-lg border border-[var(--border)] p-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-amber-500">●</span>
            <span className="text-sm font-medium">{b.description}</span>
          </div>
          <p className="text-xs text-[var(--text-secondary)]">
            Logged: {new Date(b.createdAt ?? Date.now()).toLocaleDateString()}
          </p>
        </div>
      ))}
    </div>
  );
}

function ResourcesPanel() {
  const { data, isLoading } = trpc.resources.allocationSummary.useQuery();

  if (isLoading) return <div className="text-[var(--text-secondary)]">Loading resources...</div>;
  if (!data || data.length === 0) return <p className="text-[var(--text-secondary)]">No resources in directory.</p>;

  return (
    <div className="bg-white rounded-xl border border-[var(--border)] overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[var(--surface-muted)] text-[var(--text-secondary)] text-xs uppercase tracking-wide">
            <th className="text-start px-4 py-3">Name</th>
            <th className="text-start px-4 py-3">Type</th>
            <th className="text-start px-4 py-3">Role</th>
            <th className="text-start px-4 py-3">Total HpW</th>
          </tr>
        </thead>
        <tbody>
          {data.map(r => (
            <tr key={r.id} className="border-t border-[var(--border)]">
              <td className="px-4 py-3 font-medium">{r.name}</td>
              <td className="px-4 py-3"><StatusBadge status={r.type} /></td>
              <td className="px-4 py-3">{r.roleTitle}</td>
              <td className="px-4 py-3">
                <span className={`ltr-num ${r.overAllocated ? 'text-red-600 font-semibold' : ''}`}>
                  {r.totalHoursPerWeek}h
                  {r.overAllocated && <span className="ms-2 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">Over-allocated</span>}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
