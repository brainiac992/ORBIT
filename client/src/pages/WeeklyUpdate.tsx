import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { trpc } from '../lib/trpc.js';

export function WeeklyUpdatePage() {
  const { ventureId } = useParams<{ ventureId: string }>();
  const navigate = useNavigate();
  const utils = trpc.useUtils();

  const { data: workstreams } = trpc.workstreams.list.useQuery({ ventureId: ventureId! });
  const { data: allMilestones } = trpc.milestones.listForVenture.useQuery({ ventureId: ventureId! });
  const submitMutation = trpc.progress.submit.useMutation({
    onSuccess: () => {
      utils.dashboard.pm.invalidate();
      utils.progress.list.invalidate();
      navigate('/dashboard/pm');
    },
  });

  const [status, setStatus] = useState<string>('on_track');
  const [completionPct, setCompletionPct] = useState<number | ''>('');
  const [narrative, setNarrative] = useState('');
  const [nextActions, setNextActions] = useState('');
  const [wsUpdates, setWsUpdates] = useState<Record<string, { status: string; pct: number }>>({});
  const [completedMilestones, setCompletedMilestones] = useState<string[]>([]);
  const [blockersList, setBlockersList] = useState<string[]>([]);
  const [decisionsList, setDecisionsList] = useState<string[]>([]);
  const [newBlocker, setNewBlocker] = useState('');
  const [newDecision, setNewDecision] = useState('');

  const today = new Date();
  const weekNum = Math.ceil(((today.getTime() - new Date(today.getFullYear(), 0, 1).getTime()) / 86400000 + 1) / 7);
  const weekLabel = `W${weekNum} ${today.getFullYear()}`;

  const openMilestones = allMilestones?.filter(m => m.status !== 'achieved') ?? [];

  const handleSubmit = () => {
    submitMutation.mutate({
      ventureId: ventureId!,
      weekLabel,
      overallStatus: status as any,
      completionPct: completionPct === '' ? 0 : completionPct,
      narrative,
      nextActions: nextActions || undefined,
      workstreamUpdates: workstreams?.map(ws => ({
        workstreamId: ws.id,
        status: (wsUpdates[ws.id]?.status ?? ws.status) as any,
        completionPct: wsUpdates[ws.id]?.pct ?? ws.completionPct,
      })),
      milestoneCompletions: completedMilestones.map(msId => ({
        milestoneId: msId,
        completedAt: today.toISOString().split('T')[0],
      })),
      blockersList: blockersList.filter(b => b.trim()).map(b => ({ description: b })),
      decisionsList: decisionsList.filter(d => d.trim()).map(d => ({ description: d })),
    });
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h2 className="text-xl font-semibold mb-1 text-[var(--text-0)]">Log Weekly Update</h2>
      <p className="text-sm text-[var(--text-3)] mb-6">{weekLabel}</p>

      {/* Overall Status */}
      <FormSection title="Overall Status">
        <div className="flex gap-3">
          {['on_track', 'at_risk', 'off_track'].map(s => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                status === s
                  ? 'border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--accent)]'
                  : 'border-[var(--border)] text-[var(--text-3)] hover:border-[var(--border-hover)]'
              }`}
            >
              {s === 'on_track' ? 'On Track' : s === 'at_risk' ? 'At Risk' : 'Off Track'}
            </button>
          ))}
        </div>
        <div className="mt-3">
          <label className="text-xs text-[var(--text-3)]">Overall Completion %</label>
          <input
            type="number"
            min={0} max={100}
            value={completionPct}
            onChange={e => setCompletionPct(e.target.value === '' ? '' : Number(e.target.value))}
            className="mt-1 block w-24 border border-[var(--border)] bg-[var(--surface-1)] rounded-lg px-3 py-2 text-sm"
          />
        </div>
      </FormSection>

      {/* Narrative */}
      <FormSection title="What happened this week">
        <textarea
          value={narrative}
          onChange={e => setNarrative(e.target.value)}
          rows={4}
          placeholder="What progressed, what didn't, what changed."
          className="w-full border border-[var(--border)] bg-[var(--surface-1)] rounded-lg px-3 py-2 text-sm resize-none"
        />
      </FormSection>

      {/* Workstream updates */}
      {workstreams && workstreams.length > 0 && (
        <FormSection title="Workstream Updates">
          <div className="space-y-3">
            {workstreams.map(ws => {
              const current = wsUpdates[ws.id] ?? { status: ws.status, pct: ws.completionPct };
              return (
                <div key={ws.id} className="flex items-center gap-3 bg-[var(--surface-0)] rounded-lg px-4 py-3">
                  <span className="flex-1 text-sm font-medium">{ws.name}</span>
                  <select
                    value={current.status}
                    onChange={e => setWsUpdates(prev => ({ ...prev, [ws.id]: { ...current, status: e.target.value } }))}
                    className="border border-[var(--border)] bg-[var(--surface-1)] rounded px-2 py-1 text-xs"
                  >
                    <option value="not_started">Not Started</option>
                    <option value="in_progress">In Progress</option>
                    <option value="complete">Complete</option>
                    <option value="on_hold">On Hold</option>
                  </select>
                  <input
                    type="number" min={0} max={100}
                    value={current.pct}
                    onChange={e => setWsUpdates(prev => ({ ...prev, [ws.id]: { ...current, pct: Number(e.target.value) } }))}
                    className="w-16 border border-[var(--border)] bg-[var(--surface-1)] rounded px-2 py-1 text-xs text-end"
                  />
                  <span className="text-xs text-[var(--text-3)]">%</span>
                </div>
              );
            })}
          </div>
        </FormSection>
      )}

      {/* Milestones */}
      {openMilestones.length > 0 && (
        <FormSection title="Milestones Completed This Week">
          <div className="space-y-2">
            {openMilestones.map((ms: any) => (
              <label key={ms.id} className="flex items-center gap-3 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={completedMilestones.includes(ms.id)}
                  onChange={e => {
                    if (e.target.checked) setCompletedMilestones(prev => [...prev, ms.id]);
                    else setCompletedMilestones(prev => prev.filter(id => id !== ms.id));
                  }}
                  className="w-4 h-4"
                />
                <span className="flex-1">{ms.name}</span>
                <span className={`text-xs ${ms.status === 'overdue' ? 'text-amber-400' : 'text-[var(--text-3)]'}`}>
                  {ms.status === 'overdue' ? `Overdue — ${ms.dueDate}` : ms.dueDate}
                </span>
              </label>
            ))}
          </div>
        </FormSection>
      )}

      {/* Blocking Issues */}
      <FormSection title="Blocking Issues">
        {blockersList.map((b, i) => (
          <div key={i} className="flex gap-2 mb-2">
            <span className="text-sm py-2 px-3 bg-[var(--surface-0)] rounded-lg flex-1">{b}</span>
          </div>
        ))}
        <div className="flex gap-2">
          <input
            value={newBlocker}
            onChange={e => setNewBlocker(e.target.value)}
            placeholder="Describe a blocking issue"
            className="flex-1 border border-[var(--border)] bg-[var(--surface-1)] rounded-lg px-3 py-2 text-sm"
            onKeyDown={e => {
              if (e.key === 'Enter' && newBlocker.trim()) {
                setBlockersList(prev => [...prev, newBlocker.trim()]);
                setNewBlocker('');
              }
            }}
          />
          <button
            onClick={() => { if (newBlocker.trim()) { setBlockersList(prev => [...prev, newBlocker.trim()]); setNewBlocker(''); } }}
            className="px-3 py-2 text-sm border border-[var(--border)] bg-[var(--surface-1)] rounded-lg hover:bg-[var(--surface-2)]"
          >
            Add
          </button>
        </div>
      </FormSection>

      {/* Decisions */}
      <FormSection title="Decisions Needed">
        {decisionsList.map((d, i) => (
          <div key={i} className="flex gap-2 mb-2">
            <span className="text-sm py-2 px-3 bg-[var(--surface-0)] rounded-lg flex-1">{d}</span>
          </div>
        ))}
        <div className="flex gap-2">
          <input
            value={newDecision}
            onChange={e => setNewDecision(e.target.value)}
            placeholder="Describe a decision needed"
            className="flex-1 border border-[var(--border)] bg-[var(--surface-1)] rounded-lg px-3 py-2 text-sm"
            onKeyDown={e => {
              if (e.key === 'Enter' && newDecision.trim()) {
                setDecisionsList(prev => [...prev, newDecision.trim()]);
                setNewDecision('');
              }
            }}
          />
          <button
            onClick={() => { if (newDecision.trim()) { setDecisionsList(prev => [...prev, newDecision.trim()]); setNewDecision(''); } }}
            className="px-3 py-2 text-sm border border-[var(--border)] bg-[var(--surface-1)] rounded-lg hover:bg-[var(--surface-2)]"
          >
            Add
          </button>
        </div>
      </FormSection>

      {/* Next actions */}
      <FormSection title="Next Week's Actions">
        <textarea
          value={nextActions}
          onChange={e => setNextActions(e.target.value)}
          rows={3}
          placeholder="What's planned for next week"
          className="w-full border border-[var(--border)] bg-[var(--surface-1)] rounded-lg px-3 py-2 text-sm resize-none"
        />
      </FormSection>

      {/* Submit */}
      <div className="mt-6">
        <p className="text-xs text-amber-400 mb-3">Once submitted, this update cannot be edited.</p>
        <button
          onClick={handleSubmit}
          disabled={submitMutation.isPending || !narrative.trim()}
          className="w-full bg-[var(--accent)] text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {submitMutation.isPending ? 'Submitting...' : 'Submit Update'}
        </button>
      </div>
    </div>
  );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h3 className="text-xs font-medium text-[var(--text-3)] uppercase tracking-wide mb-3">{title}</h3>
      {children}
    </div>
  );
}
