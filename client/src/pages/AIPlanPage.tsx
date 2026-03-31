import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { trpc } from '../lib/trpc.js';
import { Button } from '../components/Modal.js';
import { SectionHeader } from '../components/StatusBadge.js';

const MODE_META: Record<string, { title: string; desc: string; color: string; icon: string }> = {
  comfort: {
    title: 'Comfort',
    desc: 'Generous timelines with built-in buffer for delays',
    color: 'emerald',
    icon: '🛡',
  },
  tight: {
    title: 'Tight',
    desc: 'Optimal timeline with minimal slack — balanced risk',
    color: 'amber',
    icon: '⚡',
  },
  stretch: {
    title: 'Stretch',
    desc: 'Aggressive compression — maximum speed, higher risk',
    color: 'red',
    icon: '🚀',
  },
};

export function AIPlanPage() {
  const { ventureId } = useParams<{ ventureId: string }>();
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: plans, isLoading: plansLoading } = trpc.wizard.listPlans.useQuery({ ventureId: ventureId! });
  const generate = trpc.wizard.generatePlans.useMutation({
    onSuccess: () => utils.wizard.listPlans.invalidate({ ventureId: ventureId! }),
  });
  const selectPlan = trpc.wizard.selectPlan.useMutation({
    onSuccess: (data) => {
      utils.wizard.state.invalidate({ ventureId: ventureId! });
      utils.dashboard.pm.invalidate();
      navigate(`/venture/${ventureId!}/plan`);
    },
  });

  const hasPlans = plans && plans.length > 0;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <SectionHeader title="AI Project Plan Generator" />
      <p className="text-sm text-[var(--text-2)] mb-6">
        Based on the resources, workstreams, RACI, risks, and budget you defined,
        AI will generate three project plan options for you to choose from.
      </p>

      {!hasPlans && (
        <div className="text-center py-16">
          <div className="text-5xl mb-4">🤖</div>
          <h3 className="text-lg font-semibold text-[var(--text-0)] mb-2">Ready to Generate Plans</h3>
          <p className="text-sm text-[var(--text-3)] mb-6 max-w-md mx-auto">
            Claude AI will analyze your project data and create three plan options:
            Comfort, Tight, and Stretch — each with different timeline and resource trade-offs.
          </p>
          <Button
            onClick={() => generate.mutate({ ventureId: ventureId! })}
            disabled={generate.isPending}
            className="!px-8 !py-3 !text-base"
          >
            {generate.isPending ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin">⏳</span> Generating Plans...
              </span>
            ) : (
              'Generate Plans'
            )}
          </Button>
          {generate.isError && (
            <p className="text-sm text-red-400 mt-4">{generate.error.message}</p>
          )}
        </div>
      )}

      {hasPlans && (
        <div className="space-y-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-[var(--text-3)]">Select a plan to apply to your venture</p>
            <Button
              variant="ghost"
              onClick={() => generate.mutate({ ventureId: ventureId! })}
              disabled={generate.isPending}
              className="!text-xs"
            >
              {generate.isPending ? 'Regenerating...' : 'Regenerate Plans'}
            </Button>
          </div>

          {plans.map((plan: any) => {
            const meta = MODE_META[plan.mode] ?? MODE_META.comfort;
            const payload = plan.payload as any;
            const isExpanded = expanded === plan.id;

            return (
              <div
                key={plan.id}
                className={`bg-[var(--surface-0)] rounded-2xl border transition-all animate-in ${
                  plan.selected
                    ? 'border-emerald-500/50 ring-1 ring-emerald-500/20'
                    : 'border-[var(--border)] hover:border-[var(--border-hover)]'
                }`}
              >
                {/* Header */}
                <div className="p-5 flex items-start justify-between">
                  <div className="flex items-start gap-3 flex-1">
                    <span className="text-2xl">{meta.icon}</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="text-base font-semibold text-[var(--text-0)]">{meta.title}</h4>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold bg-${meta.color}-500/15 text-${meta.color}-400`}>
                          {plan.mode.toUpperCase()}
                        </span>
                        {plan.selected && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-emerald-500/15 text-emerald-400">
                            SELECTED
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-[var(--text-2)]">{plan.summary}</p>
                    </div>
                  </div>
                  <div className="flex gap-2 ml-4">
                    <Button
                      variant="ghost"
                      onClick={() => setExpanded(isExpanded ? null : plan.id)}
                      className="!text-xs"
                    >
                      {isExpanded ? 'Collapse' : 'Details'}
                    </Button>
                    {!plan.selected && (
                      <Button
                        onClick={() => selectPlan.mutate({ ventureId: ventureId!, planId: plan.id })}
                        disabled={selectPlan.isPending}
                      >
                        {selectPlan.isPending ? 'Applying...' : 'Select Plan'}
                      </Button>
                    )}
                  </div>
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="border-t border-[var(--border)] p-5 space-y-5">
                    {/* Workstream schedule */}
                    <div>
                      <h5 className="text-xs font-semibold text-[var(--text-3)] uppercase tracking-widest mb-3">Workstream Schedule</h5>
                      <div className="space-y-2">
                        {payload.workstreams?.map((ws: any, i: number) => (
                          <div key={i} className="bg-[var(--surface-1)] rounded-xl p-3">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-medium text-[var(--text-0)]">{ws.name}</span>
                              <span className="text-xs text-[var(--text-3)]">{ws.startDate} → {ws.endDate}</span>
                            </div>
                            {ws.milestones?.length > 0 && (
                              <div className="flex flex-wrap gap-2 mt-2">
                                {ws.milestones.map((ms: any, j: number) => (
                                  <span key={j} className="text-[10px] bg-[var(--accent-dim)] text-[var(--accent)] px-2 py-1 rounded-full">
                                    {ms.name} — {ms.dueDate}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Resource allocations */}
                    {payload.resourceAllocations?.length > 0 && (
                      <div>
                        <h5 className="text-xs font-semibold text-[var(--text-3)] uppercase tracking-widest mb-3">Resource Allocations</h5>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                          {payload.resourceAllocations.map((ra: any, i: number) => (
                            <div key={i} className="bg-[var(--surface-1)] rounded-xl p-3 flex items-center justify-between">
                              <span className="text-sm text-[var(--text-1)]">{ra.resourceName}</span>
                              <span className="text-sm font-semibold text-[var(--text-0)] ltr-num">{ra.hoursPerWeek}h/w</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Budget distribution */}
                    {payload.budgetDistribution && (
                      <div>
                        <h5 className="text-xs font-semibold text-[var(--text-3)] uppercase tracking-widest mb-3">Budget Distribution</h5>
                        <div className="flex gap-2">
                          {Object.entries(payload.budgetDistribution).map(([cat, pct]: [string, any]) => (
                            <div key={cat} className="flex-1 bg-[var(--surface-1)] rounded-xl p-3 text-center">
                              <div className="text-lg font-bold text-[var(--text-0)] ltr-num">{pct}%</div>
                              <div className="text-[10px] text-[var(--text-3)] uppercase">{cat}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Assumptions & Risks */}
                    <div className="grid grid-cols-2 gap-4">
                      {payload.assumptions?.length > 0 && (
                        <div>
                          <h5 className="text-xs font-semibold text-[var(--text-3)] uppercase tracking-widest mb-2">Assumptions</h5>
                          <ul className="space-y-1">
                            {payload.assumptions.map((a: string, i: number) => (
                              <li key={i} className="text-xs text-[var(--text-2)] flex gap-2">
                                <span className="text-[var(--text-3)]">•</span>{a}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {payload.risks?.length > 0 && (
                        <div>
                          <h5 className="text-xs font-semibold text-[var(--text-3)] uppercase tracking-widest mb-2">Plan Risks</h5>
                          <ul className="space-y-1">
                            {payload.risks.map((r: string, i: number) => (
                              <li key={i} className="text-xs text-[var(--text-2)] flex gap-2">
                                <span className="text-amber-400">⚠</span>{r}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
