import { useNavigate, useLocation } from 'react-router-dom';
import { trpc } from '../lib/trpc.js';
import { Button } from './Modal.js';

const STEPS = [
  { key: 'resources', label: 'Resources', suffix: 'resources', icon: '👥' },
  { key: 'workstreams', label: 'Workstreams', suffix: 'gantt', icon: '📐' },
  { key: 'raci', label: 'RACI', suffix: 'raci', icon: '👤' },
  { key: 'risks', label: 'Risks & Issues', suffix: 'risks', icon: '⚡' },
  { key: 'budget', label: 'Budget', suffix: 'budget', icon: '💰' },
  { key: 'ai_plan', label: 'AI Plan', suffix: 'setup/plan', icon: '🤖' },
] as const;

export function SetupWizard({ ventureId, children }: { ventureId: string; children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: state, isLoading } = trpc.wizard.state.useQuery({ ventureId });
  const utils = trpc.useUtils();
  const advance = trpc.wizard.advanceStep.useMutation({
    onSuccess: () => utils.wizard.state.invalidate({ ventureId }),
  });

  if (isLoading || !state) return null;
  if (state.complete) return <>{children}</>;

  const currentStep = state.setupStep;
  const currentSuffix = location.pathname.split('/').pop();

  // Determine which step index we're viewing
  const viewingIdx = STEPS.findIndex(s => {
    if (s.suffix.includes('/')) return location.pathname.includes(s.suffix);
    return currentSuffix === s.suffix;
  });

  const handleNav = (stepIdx: number) => {
    if (stepIdx > currentStep) return; // can't skip ahead
    const step = STEPS[stepIdx];
    navigate(`/venture/${ventureId}/${step.suffix}`);
  };

  const handleNext = async () => {
    const nextStep = currentStep + 1;
    if (nextStep > 5) {
      // Go to AI plan page
      navigate(`/venture/${ventureId}/setup/plan`);
      return;
    }
    try {
      await advance.mutateAsync({ ventureId, toStep: nextStep });
      navigate(`/venture/${ventureId}/${STEPS[nextStep].suffix}`);
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      const prevStep = Math.max(0, (viewingIdx >= 0 ? viewingIdx : currentStep) - 1);
      navigate(`/venture/${ventureId}/${STEPS[prevStep].suffix}`);
    }
  };

  return (
    <div className="flex flex-col min-h-[calc(100vh-64px)]">
      {/* Stepper bar */}
      <div className="bg-[var(--surface-0)] border-b border-[var(--border)] px-6 py-4 no-print">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-[var(--text-0)]">Venture Setup</h3>
            <span className="text-xs text-[var(--text-3)]">Step {currentStep + 1} of {STEPS.length}</span>
          </div>
          <div className="flex gap-1">
            {STEPS.map((step, idx) => {
              const stepState = state.steps[idx];
              const isActive = viewingIdx === idx;
              const isCompleted = idx < currentStep || (stepState?.done && idx <= currentStep);
              const isAccessible = idx <= currentStep;

              return (
                <button
                  key={step.key}
                  onClick={() => handleNav(idx)}
                  disabled={!isAccessible}
                  className={`flex-1 flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-[var(--accent)] text-white shadow-lg shadow-indigo-500/20'
                      : isCompleted
                        ? 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/20'
                        : isAccessible
                          ? 'bg-[var(--surface-1)] text-[var(--text-2)] hover:text-[var(--text-0)] hover:bg-[var(--surface-2)]'
                          : 'bg-[var(--surface-1)] text-[var(--text-3)] opacity-50 cursor-not-allowed'
                  }`}
                >
                  <span>{step.icon}</span>
                  <span className="hidden md:inline">{step.label}</span>
                  {isCompleted && !isActive && <span className="ml-auto text-emerald-400">✓</span>}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Page content */}
      <div className="flex-1">
        {children}
      </div>

      {/* Bottom navigation */}
      <div className="bg-[var(--surface-0)] border-t border-[var(--border)] px-6 py-4 no-print">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Button
            variant="secondary"
            onClick={handleBack}
            disabled={viewingIdx <= 0 && currentStep === 0}
          >
            ← Back
          </Button>
          <div className="text-xs text-[var(--text-3)]">
            {state.steps[currentStep]?.done
              ? '✓ Step requirements met'
              : '⚠ Complete this step to continue'}
          </div>
          <Button
            onClick={handleNext}
            disabled={advance.isPending || (currentStep < 5 && !state.steps[currentStep]?.done)}
          >
            {advance.isPending ? 'Validating...' : currentStep >= 5 ? 'Generate AI Plan →' : 'Next Step →'}
          </Button>
        </div>
      </div>
    </div>
  );
}
