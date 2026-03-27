import { useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { trpc } from '../lib/trpc.js';
import { StatusBadge, KpiCard, SectionHeader } from '../components/StatusBadge.js';
import { Modal, FormField, Input, TextArea, Select, Button } from '../components/Modal.js';
import { useAuth } from '../lib/auth.js';
import { LIKELIHOOD_LABELS, IMPACT_LABELS, getScoreBand } from '../../../shared/enums.js';

// ── Helpers ──────────────────────────────────────

const BAND_COLORS: Record<string, string> = {
  green: 'var(--risk-green)',
  yellow: 'var(--risk-yellow)',
  amber: 'var(--risk-amber)',
  red: 'var(--risk-red)',
  darkRed: 'var(--risk-dark-red)',
};

const BAND_BG: Record<string, string> = {
  green: 'bg-emerald-500/15 text-emerald-400',
  yellow: 'bg-yellow-500/15 text-yellow-400',
  amber: 'bg-amber-500/15 text-amber-400',
  red: 'bg-red-500/15 text-red-400',
  darkRed: 'bg-red-700/20 text-red-300',
};

const BAND_LABELS: Record<string, string> = {
  green: 'Low', yellow: 'Med-Low', amber: 'Medium', red: 'High', darkRed: 'Critical',
};

function getHeatmapCellColor(likelihood: number, impact: number): string {
  const score = likelihood * impact;
  return BAND_COLORS[getScoreBand(score)] ?? BAND_COLORS.green;
}

function ScoreBadge({ score }: { score: number }) {
  const band = getScoreBand(score);
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${BAND_BG[band]}`}>
      {score}
    </span>
  );
}

function RagBadge({ rag }: { rag: string }) {
  const cls: Record<string, string> = {
    green: 'bg-emerald-500/15 text-emerald-400',
    amber: 'bg-amber-500/15 text-amber-400',
    red: 'bg-red-500/15 text-red-400',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${cls[rag] ?? cls.amber}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${rag === 'green' ? 'bg-emerald-400' : rag === 'red' ? 'bg-red-400' : 'bg-amber-400'}`} />
      {rag.charAt(0).toUpperCase() + rag.slice(1)}
    </span>
  );
}

// ── Selector component for 1-5 ──────────────────

function LevelSelector({ value, onChange, labels }: { value: number; onChange: (v: number) => void; labels: Record<number, string> }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={`flex-1 px-1 py-2 rounded-lg text-xs text-center transition-all cursor-pointer ${
            value === n
              ? 'bg-[var(--accent)] text-white font-semibold'
              : 'bg-[var(--surface-1)] text-[var(--text-3)] hover:bg-[var(--surface-2)] hover:text-[var(--text-1)]'
          }`}
          title={labels[n]}
        >
          <div className="font-bold">{n}</div>
          <div className="text-[9px] leading-tight mt-0.5 truncate">{labels[n]}</div>
        </button>
      ))}
    </div>
  );
}

// ── Main page component ─────────────────────────

export function RisksPage() {
  const { ventureId } = useParams<{ ventureId: string }>();
  const { user } = useAuth();
  const utils = trpc.useUtils();

  const { data: risksList, isLoading: risksLoading, error: risksError } = trpc.risks.listRisks.useQuery({ ventureId: ventureId! });
  const { data: summary } = trpc.risks.riskSummary.useQuery({ ventureId: ventureId! });
  const { data: heatmapData } = trpc.risks.heatmapData.useQuery({ ventureId: ventureId! });
  const { data: issuesList, isLoading: issuesLoading } = trpc.risks.listIssues.useQuery({ ventureId: ventureId! });
  const { data: ventureResources } = trpc.raci.listVentureResources.useQuery({ ventureId: ventureId! });

  const [showRiskForm, setShowRiskForm] = useState(false);
  const [editingRisk, setEditingRisk] = useState<any>(null);
  const [showIssueForm, setShowIssueForm] = useState(false);
  const [heatmapFilter, setHeatmapFilter] = useState<{ likelihood: number; impact: number } | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterOwner, setFilterOwner] = useState<string>('all');
  const [filterBand, setFilterBand] = useState<string>('all');
  const [sortField, setSortField] = useState<string>('riskScore');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const isGM = user?.role === 'gm';

  // Build heatmap cell map
  const heatmapCells = useMemo(() => {
    const map = new Map<string, number>();
    if (heatmapData) {
      for (const cell of heatmapData) {
        map.set(`${cell.likelihood}-${cell.impact}`, cell.count);
      }
    }
    return map;
  }, [heatmapData]);

  // Filter and sort risks
  const filteredRisks = useMemo(() => {
    let list = risksList ?? [];
    if (heatmapFilter) {
      list = list.filter((r: any) => r.likelihood === heatmapFilter.likelihood && r.impact === heatmapFilter.impact);
    }
    if (filterStatus !== 'all') {
      list = list.filter((r: any) => r.status === filterStatus);
    }
    if (filterOwner !== 'all') {
      list = list.filter((r: any) => (r.ownerResourceId ?? 'unassigned') === filterOwner);
    }
    if (filterBand !== 'all') {
      list = list.filter((r: any) => getScoreBand(r.riskScore) === filterBand);
    }
    return [...list].sort((a: any, b: any) => {
      const av = a[sortField] ?? 0;
      const bv = b[sortField] ?? 0;
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === 'asc' ? av - bv : bv - av;
    });
  }, [risksList, heatmapFilter, filterStatus, filterOwner, filterBand, sortField, sortDir]);

  const openRisks = filteredRisks.filter((r: any) => r.status === 'open');
  const closedRisks = filteredRisks.filter((r: any) => r.status !== 'open');

  if (risksLoading || issuesLoading) return <div className="p-8 text-center text-[var(--text-3)]">Loading risks...</div>;
  if (risksError) return <div className="p-8 text-red-400">Unable to load risk data.</div>;

  const openIssues = issuesList?.filter((i: any) => i.status !== 'resolved') ?? [];
  const resolvedIssues = issuesList?.filter((i: any) => i.status === 'resolved') ?? [];

  const toggleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
  };

  const handleHeatmapClick = (likelihood: number, impact: number) => {
    if (heatmapFilter?.likelihood === likelihood && heatmapFilter?.impact === impact) {
      setHeatmapFilter(null);
    } else {
      setHeatmapFilter({ likelihood, impact });
    }
  };

  const exposureBand = summary ? getScoreBand(Math.round(summary.weightedExposure)) : 'green';

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* ── Header ────────────────────────── */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <h3 className="text-lg font-semibold text-[var(--text-0)]">Risks</h3>
          {summary && (
            <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold ${BAND_BG[exposureBand]}`}>
              Weighted Exposure: {summary.weightedExposure.toFixed(1)}
            </span>
          )}
        </div>
        {!isGM && <Button onClick={() => { setEditingRisk(null); setShowRiskForm(true); }}>Log Risk</Button>}
      </div>

      {/* ── KPI Tiles ─────────────────────── */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
          <KpiCard label="Total Open" value={summary.totalOpen} />
          <KpiCard label="Highest Score" value={summary.highestScore} accent={summary.highestScore >= 13 ? 'text-red-400' : summary.highestScore >= 5 ? 'text-amber-400' : 'text-emerald-400'} />
          {Object.entries(summary.countByBand).map(([band, count]) => (
            <div key={band} className="bg-[var(--surface-0)] rounded-2xl border border-[var(--border)] p-4 hover:border-[var(--border-hover)] transition-all animate-in">
              <div className="text-xs text-[var(--text-3)] uppercase tracking-wider mb-1">{BAND_LABELS[band] ?? band}</div>
              <div className="text-xl font-bold" style={{ color: BAND_COLORS[band] }}>{count as number}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Heatmap ───────────────────────── */}
      <div className="bg-[var(--surface-0)] rounded-2xl border border-[var(--border)] p-3 mb-6">
        <div className="text-[9px] text-[var(--text-3)] uppercase tracking-widest mb-2">Risk Heatmap</div>
        <div className="flex gap-2 max-w-md">
          {/* Y-axis label */}
          <div className="flex flex-col items-center justify-center">
            <span className="text-[9px] text-[var(--text-3)] uppercase tracking-widest" style={{ writingMode: 'vertical-lr', transform: 'rotate(180deg)' }}>Likelihood</span>
          </div>
          <div className="flex-1">
            {/* Grid: 5 rows (likelihood 5 at top to 1 at bottom) x 5 columns (impact 1 to 5) */}
            <div className="grid grid-cols-5 gap-0.5">
              {[5, 4, 3, 2, 1].map(likelihood => (
                [1, 2, 3, 4, 5].map(impact => {
                  const key = `${likelihood}-${impact}`;
                  const count = heatmapCells.get(key) ?? 0;
                  const isActive = heatmapFilter?.likelihood === likelihood && heatmapFilter?.impact === impact;
                  return (
                    <button
                      key={key}
                      onClick={() => handleHeatmapClick(likelihood, impact)}
                      className={`relative rounded flex items-center justify-center text-[10px] font-bold transition-all cursor-pointer ${isActive ? 'ring-2 ring-white ring-offset-1 ring-offset-[var(--bg)]' : 'hover:opacity-80'}`}
                      style={{ backgroundColor: getHeatmapCellColor(likelihood, impact), opacity: isActive ? 1 : count > 0 ? 0.9 : 0.3, height: '28px' }}
                      title={`L${likelihood} x I${impact} = ${likelihood * impact} | ${count} risk${count !== 1 ? 's' : ''}`}
                    >
                      {count > 0 && <span className="text-white drop-shadow-md">{count}</span>}
                    </button>
                  );
                })
              ))}
            </div>
            {/* X-axis labels */}
            <div className="grid grid-cols-5 gap-0.5 mt-0.5">
              {[1, 2, 3, 4, 5].map(impact => (
                <div key={impact} className="text-center text-[9px] text-[var(--text-3)] truncate">{impact}-{IMPACT_LABELS[impact]}</div>
              ))}
            </div>
            <div className="text-center text-[9px] text-[var(--text-3)] uppercase tracking-widest mt-0.5">Impact</div>
          </div>
          {/* Y-axis labels */}
          <div className="flex flex-col justify-between py-0" style={{ height: 'auto' }}>
            {[5, 4, 3, 2, 1].map(l => (
              <div key={l} className="text-[9px] text-[var(--text-3)] text-right leading-none flex items-center justify-end" style={{ flex: 1 }}>
                {l}-{LIKELIHOOD_LABELS[l]}
              </div>
            ))}
          </div>
        </div>
        {heatmapFilter && (
          <button onClick={() => setHeatmapFilter(null)} className="mt-2 text-xs text-[var(--accent-hover)] hover:underline cursor-pointer">
            Clear heatmap filter (L:{heatmapFilter.likelihood} x I:{heatmapFilter.impact})
          </button>
        )}
      </div>

      {/* ── Filter controls ────────────────── */}
      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <span className="text-[10px] text-[var(--text-3)] uppercase tracking-widest">Filter:</span>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="bg-[var(--surface-1)] border border-[var(--border)] rounded-lg px-2 py-1 text-xs text-[var(--text-1)]">
          <option value="all">All Statuses</option>
          <option value="open">Open</option>
          <option value="mitigated">Mitigated</option>
          <option value="closed">Closed</option>
        </select>
        <select value={filterBand} onChange={e => setFilterBand(e.target.value)} className="bg-[var(--surface-1)] border border-[var(--border)] rounded-lg px-2 py-1 text-xs text-[var(--text-1)]">
          <option value="all">All Bands</option>
          <option value="green">Low (1-4)</option>
          <option value="yellow">Med-Low (5-8)</option>
          <option value="amber">Medium (9-12)</option>
          <option value="red">High (13-19)</option>
          <option value="darkRed">Critical (20-25)</option>
        </select>
        <select value={filterOwner} onChange={e => setFilterOwner(e.target.value)} className="bg-[var(--surface-1)] border border-[var(--border)] rounded-lg px-2 py-1 text-xs text-[var(--text-1)]">
          <option value="all">All Owners</option>
          <option value="unassigned">Unassigned</option>
          {(ventureResources ?? []).map((r: any) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
        {(filterStatus !== 'all' || filterBand !== 'all' || filterOwner !== 'all') && (
          <button onClick={() => { setFilterStatus('all'); setFilterBand('all'); setFilterOwner('all'); }} className="text-xs text-[var(--accent-hover)] hover:underline cursor-pointer">Clear filters</button>
        )}
      </div>

      {/* ── Sort controls ─────────────────── */}
      <div className="flex flex-wrap gap-2 mb-4">
        <span className="text-[10px] text-[var(--text-3)] uppercase tracking-widest self-center me-2">Sort by:</span>
        {([
          ['riskScore', 'Score'],
          ['likelihood', 'Likelihood'],
          ['impact', 'Impact'],
          ['weight', 'Weight'],
          ['rag', 'RAG'],
          ['status', 'Status'],
          ['title', 'Title'],
        ] as const).map(([field, label]) => (
          <button
            key={field}
            onClick={() => toggleSort(field)}
            className={`px-2 py-1 rounded-lg text-xs transition-all cursor-pointer ${
              sortField === field
                ? 'bg-[var(--accent-dim)] text-[var(--accent-hover)] font-medium'
                : 'bg-[var(--surface-1)] text-[var(--text-3)] hover:text-[var(--text-1)]'
            }`}
          >
            {label} {sortField === field ? (sortDir === 'desc' ? '↓' : '↑') : ''}
          </button>
        ))}
      </div>

      {/* ── Risk List ─────────────────────── */}
      {openRisks.length === 0 ? (
        <p className="text-[var(--text-3)] mb-6">{heatmapFilter ? 'No risks matching heatmap filter.' : 'No open risks.'}</p>
      ) : (
        <div className="space-y-3 mb-6">
          {openRisks.map((r: any) => (
            <RiskCard key={r.id} risk={r} ventureId={ventureId!} isGM={isGM} onEdit={() => { setEditingRisk(r); setShowRiskForm(true); }} />
          ))}
        </div>
      )}

      {closedRisks.length > 0 && (
        <details className="mb-8">
          <summary className="text-sm text-[var(--text-3)] cursor-pointer mb-2">Closed / Mitigated Risks ({closedRisks.length})</summary>
          <div className="space-y-2">
            {closedRisks.map((r: any) => (
              <div key={r.id} className="bg-[var(--surface-1)] rounded-xl p-3 text-sm text-[var(--text-3)] flex items-center gap-2">
                <span className="flex-1">{r.title}</span>
                <ScoreBadge score={r.riskScore} />
                <StatusBadge status={r.status} />
              </div>
            ))}
          </div>
        </details>
      )}

      {/* ── Issues ───────────────────────── */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-[var(--text-0)]">Issues</h3>
        {!isGM && <Button onClick={() => setShowIssueForm(true)}>Log Issue</Button>}
      </div>

      {openIssues.length === 0 ? (
        <p className="text-[var(--text-3)] mb-6">No open issues.</p>
      ) : (
        <div className="space-y-3 mb-6">
          {openIssues.map((i: any) => (
            <IssueCard key={i.id} issue={i} ventureId={ventureId!} isGM={isGM} />
          ))}
        </div>
      )}

      {resolvedIssues.length > 0 && (
        <details className="mb-8">
          <summary className="text-sm text-[var(--text-3)] cursor-pointer mb-2">Resolved Issues ({resolvedIssues.length})</summary>
          <div className="space-y-2">
            {resolvedIssues.map((i: any) => (
              <div key={i.id} className="bg-[var(--surface-1)] rounded-xl p-3 text-sm text-[var(--text-3)] flex items-center gap-2">
                <span className="flex-1">{i.title}</span>
                <StatusBadge status={i.status} />
              </div>
            ))}
          </div>
        </details>
      )}

      {/* ── Forms ────────────────────────── */}
      <RiskFormModal
        open={showRiskForm}
        onClose={() => { setShowRiskForm(false); setEditingRisk(null); }}
        ventureId={ventureId!}
        editRisk={editingRisk}
        resources={ventureResources ?? []}
      />
      <CreateIssueForm open={showIssueForm} onClose={() => setShowIssueForm(false)} ventureId={ventureId!} />
    </div>
  );
}

// ── Risk Card ────────────────────────────────────

function RiskCard({ risk, ventureId, isGM, onEdit }: { risk: any; ventureId: string; isGM: boolean; onEdit: () => void }) {
  const utils = trpc.useUtils();
  const updateRisk = trpc.risks.updateRisk.useMutation({
    onSuccess: () => {
      utils.risks.listRisks.invalidate({ ventureId });
      utils.risks.riskSummary.invalidate({ ventureId });
      utils.risks.heatmapData.invalidate({ ventureId });
    },
  });

  const ragBorder: Record<string, string> = {
    red: 'border-s-4 border-s-red-500',
    amber: 'border-s-4 border-s-amber-500',
    green: 'border-s-4 border-s-green-500',
  };

  return (
    <div
      className={`bg-[var(--surface-0)] rounded-xl border border-[var(--border)] p-4 hover:border-[var(--border-hover)] transition-all ${ragBorder[risk.rag] ?? ''} ${!isGM ? 'cursor-pointer' : ''}`}
      onClick={!isGM ? onEdit : undefined}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium text-sm text-[var(--text-0)]">{risk.title}</span>
        <div className="flex items-center gap-2">
          <ScoreBadge score={risk.riskScore} />
          <StatusBadge status={risk.status} />
        </div>
      </div>
      {risk.description && <p className="text-xs text-[var(--text-3)] mb-2">{risk.description}</p>}
      <div className="flex flex-wrap gap-3 text-xs text-[var(--text-3)] mb-2">
        <span>L: {risk.likelihood} ({LIKELIHOOD_LABELS[risk.likelihood]})</span>
        <span>I: {risk.impact} ({IMPACT_LABELS[risk.impact]})</span>
        <span>W: {risk.weight}</span>
        <span>Owner: {risk.ownerName ?? 'Unassigned'}</span>
        <RagBadge rag={risk.rag} />
        {risk.ragOverride && <span className="text-[10px] text-[var(--text-3)] italic">(override)</span>}
      </div>
      {risk.mitigationPlan && <p className="text-xs text-[var(--text-3)] mb-1">Mitigation: {risk.mitigationPlan}</p>}
      {risk.escalationPath && <p className="text-xs text-[var(--text-3)] mb-1">Escalation: {risk.escalationPath}</p>}
      {risk.escalated && <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full me-2">Escalated</span>}

      {!isGM && (
        <div className="flex gap-2 mt-3 pt-3 border-t border-[var(--border)]" onClick={e => e.stopPropagation()}>
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

// ── Risk Create/Edit Form ────────────────────────

function RiskFormModal({ open, onClose, ventureId, editRisk, resources }: {
  open: boolean;
  onClose: () => void;
  ventureId: string;
  editRisk: any;
  resources: any[];
}) {
  const utils = trpc.useUtils();
  const invalidateAll = () => {
    utils.risks.listRisks.invalidate({ ventureId });
    utils.risks.riskSummary.invalidate({ ventureId });
    utils.risks.heatmapData.invalidate({ ventureId });
  };
  const createMut = trpc.risks.createRisk.useMutation({ onSuccess: () => { invalidateAll(); onClose(); } });
  const updateMut = trpc.risks.updateRisk.useMutation({ onSuccess: () => { invalidateAll(); onClose(); } });

  const isEdit = !!editRisk;
  const [form, setForm] = useState({
    title: '',
    description: '',
    likelihood: 3,
    impact: 3,
    weight: 3,
    mitigationPlan: '',
    ownerResourceId: '' as string | null,
    escalationPath: '',
    ragOverride: false,
    rag: '' as string,
  });

  // Reset form when editRisk changes
  const [lastEditId, setLastEditId] = useState<string | null>(null);
  if (open && editRisk && editRisk.id !== lastEditId) {
    setLastEditId(editRisk.id);
    setForm({
      title: editRisk.title ?? '',
      description: editRisk.description ?? '',
      likelihood: editRisk.likelihood ?? 3,
      impact: editRisk.impact ?? 3,
      weight: editRisk.weight ?? 3,
      mitigationPlan: editRisk.mitigationPlan ?? '',
      ownerResourceId: editRisk.ownerResourceId ?? '',
      escalationPath: editRisk.escalationPath ?? '',
      ragOverride: editRisk.ragOverride ?? false,
      rag: editRisk.rag ?? '',
    });
  }
  if (open && !editRisk && lastEditId !== null) {
    setLastEditId(null);
    setForm({ title: '', description: '', likelihood: 3, impact: 3, weight: 3, mitigationPlan: '', ownerResourceId: '', escalationPath: '', ragOverride: false, rag: '' });
  }

  const previewScore = form.likelihood * form.impact;

  const handleSubmit = () => {
    if (!form.title.trim()) return;
    const payload: any = {
      title: form.title,
      description: form.description || undefined,
      likelihood: form.likelihood,
      impact: form.impact,
      weight: form.weight,
      mitigationPlan: form.mitigationPlan || undefined,
      ownerResourceId: form.ownerResourceId || null,
      escalationPath: form.escalationPath || undefined,
    };
    if (form.ragOverride && form.rag) {
      payload.rag = form.rag;
    }

    if (isEdit) {
      payload.id = editRisk.id;
      if (!form.ragOverride) payload.ragOverride = false;
      updateMut.mutate(payload);
    } else {
      payload.ventureId = ventureId;
      createMut.mutate(payload);
    }
  };

  const isPending = createMut.isPending || updateMut.isPending;

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit Risk' : 'Log Risk'}>
      <FormField label="Title" required>
        <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Risk title" />
      </FormField>
      <FormField label="Description">
        <TextArea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} placeholder="Describe the risk" />
      </FormField>

      <FormField label="Likelihood">
        <LevelSelector value={form.likelihood} onChange={v => setForm(f => ({ ...f, likelihood: v }))} labels={LIKELIHOOD_LABELS} />
      </FormField>

      <FormField label="Impact">
        <LevelSelector value={form.impact} onChange={v => setForm(f => ({ ...f, impact: v }))} labels={IMPACT_LABELS} />
      </FormField>

      <FormField label="Weight">
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map(n => (
            <button
              key={n}
              type="button"
              onClick={() => setForm(f => ({ ...f, weight: n }))}
              className={`flex-1 px-2 py-2 rounded-lg text-sm text-center transition-all cursor-pointer ${
                form.weight === n
                  ? 'bg-[var(--accent)] text-white font-semibold'
                  : 'bg-[var(--surface-1)] text-[var(--text-3)] hover:bg-[var(--surface-2)] hover:text-[var(--text-1)]'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </FormField>

      {/* Score preview */}
      <div className="mb-4 flex items-center gap-3">
        <span className="text-xs text-[var(--text-3)] uppercase tracking-wider">Score Preview:</span>
        <ScoreBadge score={previewScore} />
        <span className="text-xs text-[var(--text-3)]">({form.likelihood} x {form.impact})</span>
      </div>

      {/* RAG override toggle */}
      <div className="mb-4">
        <label className="flex items-center gap-2 text-xs text-[var(--text-2)] cursor-pointer">
          <input
            type="checkbox"
            checked={form.ragOverride}
            onChange={e => setForm(f => ({ ...f, ragOverride: e.target.checked, rag: e.target.checked ? (f.rag || 'amber') : '' }))}
            className="rounded"
          />
          Override auto RAG
        </label>
        {form.ragOverride && (
          <div className="mt-2">
            <Select value={form.rag} onChange={e => setForm(f => ({ ...f, rag: e.target.value }))}>
              <option value="green">Green</option>
              <option value="amber">Amber</option>
              <option value="red">Red</option>
            </Select>
          </div>
        )}
      </div>

      <FormField label="Owner">
        <Select value={form.ownerResourceId ?? ''} onChange={e => setForm(f => ({ ...f, ownerResourceId: e.target.value || null }))}>
          <option value="">Unassigned</option>
          {resources.map((r: any) => (
            <option key={r.id} value={r.id}>{r.name}{r.roleTitle ? ` (${r.roleTitle})` : ''}</option>
          ))}
        </Select>
      </FormField>

      <FormField label="Escalation Path">
        <Input value={form.escalationPath} onChange={e => setForm(f => ({ ...f, escalationPath: e.target.value }))} placeholder="Who to escalate to" />
      </FormField>

      <FormField label="Mitigation Plan">
        <TextArea value={form.mitigationPlan} onChange={e => setForm(f => ({ ...f, mitigationPlan: e.target.value }))} rows={2} placeholder="How will this be mitigated?" />
      </FormField>

      <div className="flex justify-end gap-2 mt-4">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSubmit} disabled={isPending || !form.title.trim()}>
          {isPending ? 'Saving...' : isEdit ? 'Update Risk' : 'Log Risk'}
        </Button>
      </div>
    </Modal>
  );
}

// ── Issue Card ───────────────────────────────────

function IssueCard({ issue, ventureId, isGM }: { issue: any; ventureId: string; isGM: boolean }) {
  const utils = trpc.useUtils();
  const updateIssue = trpc.risks.updateIssue.useMutation({
    onSuccess: () => utils.risks.listIssues.invalidate({ ventureId }),
  });

  return (
    <div className="bg-[var(--surface-0)] rounded-xl border border-[var(--border)] p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium text-sm text-[var(--text-0)]">{issue.title}</span>
        <StatusBadge status={issue.status} />
      </div>
      {issue.description && <p className="text-xs text-[var(--text-3)] mb-2">{issue.description}</p>}
      <div className="flex gap-4 text-xs text-[var(--text-3)] mb-1">
        <span>Severity: {issue.severity}</span>
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
          <Button variant="secondary" onClick={() => updateIssue.mutate({ id: issue.id, status: 'resolved' })}>
            Resolve
          </Button>
        </div>
      )}
    </div>
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

