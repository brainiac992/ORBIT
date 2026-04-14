import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { trpc } from '../lib/trpc.js';
import { Button } from '../components/Modal.js';
import { useAuth } from '../lib/auth.js';
import { useImportStatus } from '../hooks/useJira.js';

// ── Step machine ──────────────────────────────────────────────────────────────

type ImportStep = 'preview' | 'progress' | 'complete' | 'error';

// ── Main page ─────────────────────────────────────────────────────────────────

export function JiraImportPage() {
  const { user } = useAuth();

  if (user?.role !== 'pmo') {
    return (
      <div className="p-8 text-[var(--text-3)]">
        You do not have permission to run the Jira import.
      </div>
    );
  }

  return <ImportFlow />;
}

function ImportFlow() {
  const navigate = useNavigate();
  const utils = trpc.useUtils();

  const [step, setStep] = useState<ImportStep>('preview');
  const [confirmText, setConfirmText] = useState('');
  const [jobId, setJobId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [completionCounts, setCompletionCounts] = useState<{
    ventures: number;
    workstreams: number;
    milestones: number;
  } | null>(null);

  const { data: preview, isLoading: previewLoading, error: previewError } = trpc.jira.getImportPreview.useQuery(undefined, {
    enabled: step === 'preview',
  });

  const triggerMutation = trpc.jira.triggerImport.useMutation({
    onSuccess: (result) => {
      setJobId(result.jobId);
      setStep('progress');
    },
    onError: (e) => {
      setErrorMessage(e.message ?? 'Failed to start import.');
      setStep('error');
    },
  });

  const retryMutation = trpc.jira.retryImport.useMutation({
    onSuccess: (result) => {
      setJobId(result.jobId);
      setErrorMessage(null);
      setStep('progress');
    },
    onError: (e) => {
      setErrorMessage(e.message ?? 'Failed to retry import.');
    },
  });

  const pollEnabled = step === 'progress';
  const { data: importStatus } = useImportStatus(jobId, pollEnabled);

  // Watch for completion or error from poll
  useEffect(() => {
    if (!importStatus) return;
    if (importStatus.phase === 'Complete') {
      setCompletionCounts({
        ventures: importStatus.total ?? 0,
        workstreams: 0,
        milestones: 0,
      });
      utils.jira.getSyncDashboard.invalidate();
      utils.dashboard.pmo.invalidate();
      setStep('complete');
    } else if (importStatus.phase === 'Failed') {
      setErrorMessage((importStatus.errors?.[0]) ?? 'Import failed. Please retry.');
      setStep('error');
    }
  }, [importStatus]);

  // ── Preview step ─────────────────────────────────────────────────────────────

  if (step === 'preview') {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <ImportPageHeader />

        {previewLoading && (
          <div className="text-[var(--text-3)] py-12 text-center" role="status" aria-live="polite">
            Fetching import preview from Jira...
          </div>
        )}

        {previewError && (
          <div className="text-red-400 bg-red-500/10 rounded-xl px-5 py-4" role="alert">
            Unable to load import preview: {previewError.message}
          </div>
        )}

        {preview && !previewLoading && (
          <>
            {/* Destructive warning banner */}
            <div className="bg-red-500/10 border border-red-500/40 rounded-2xl px-5 py-4 mb-6" role="alert">
              <div className="flex items-start gap-3">
                <span className="text-red-400 text-lg mt-0.5" aria-hidden="true">&#9888;</span>
                <div>
                  <p className="text-sm font-semibold text-red-400 mb-1">This action is irreversible</p>
                  <p className="text-sm text-[var(--text-1)]">
                    This will permanently delete <strong>all existing ORBIT ventures, workstreams, milestones,
                    risks, and issues</strong> before importing from Jira. Deleted data cannot be recovered.
                  </p>
                </div>
              </div>
            </div>

            {/* Counts — what will be deleted */}
            <div className="bg-[var(--surface-0)] rounded-2xl border border-[var(--border)] p-5 mb-4">
              <h3 className="text-sm font-semibold text-[var(--text-0)] mb-3">
                Data that will be permanently deleted
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <CountRow label="Ventures" value={preview.toDelete.ventures} danger />
                <CountRow label="Workstreams" value={preview.toDelete.workstreams} danger />
                <CountRow label="Milestones" value={preview.toDelete.milestones} danger />
                <CountRow label="Risks" value={preview.toDelete.risks} danger />
                <CountRow label="Issues" value={preview.toDelete.issues} danger />
                <CountRow label="Progress Updates" value={preview.toDelete.progressUpdates} danger />
              </div>
            </div>

            {/* Counts — what will be created */}
            <div className="bg-[var(--surface-0)] rounded-2xl border border-[var(--border)] p-5 mb-6">
              <h3 className="text-sm font-semibold text-[var(--text-0)] mb-3">
                Data that will be imported from Jira
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <CountRow label="Jira Projects (Ventures)" value={preview.toCreate.projects} accent />
                <CountRow label="Epics (Workstreams)" value={preview.toCreate.epics} accent />
                <CountRow label="Stories / Tasks (Milestones)" value={preview.toCreate.stories} accent />
                <CountRow label="Risk Issues (Risks)" value={preview.toCreate.riskIssues} accent />
                <CountRow label="Blocker Issues" value={preview.toCreate.blockerIssues} accent />
              </div>
            </div>

            {/* Confirm input */}
            <div className="bg-[var(--surface-0)] rounded-2xl border border-[var(--border)] p-5 mb-4">
              <label
                htmlFor="confirmInput"
                className="block text-sm text-[var(--text-1)] mb-2"
              >
                Type <strong className="text-[var(--text-0)]">CONFIRM</strong> to enable the import button:
              </label>
              <input
                id="confirmInput"
                type="text"
                value={confirmText}
                onChange={e => setConfirmText(e.target.value)}
                placeholder="CONFIRM"
                className="w-full bg-[var(--surface-1)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm text-[var(--text-0)] placeholder:text-[var(--text-3)] focus:outline-none focus:border-[var(--accent)] transition-colors"
                aria-describedby="confirmHint"
              />
              <p id="confirmHint" className="text-[10px] text-[var(--text-3)] mt-1">
                This is required to prevent accidental data loss.
              </p>
            </div>

            <div className="flex gap-3">
              <Button
                variant="ghost"
                onClick={() => navigate('/admin/config/jira')}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={() => triggerMutation.mutate({ force: true })}
                disabled={confirmText !== 'CONFIRM' || triggerMutation.isPending}
                aria-disabled={confirmText !== 'CONFIRM'}
              >
                {triggerMutation.isPending ? 'Starting import...' : 'Confirm and Import'}
              </Button>
            </div>

            {triggerMutation.error && (
              <p className="text-red-400 text-sm mt-3" role="alert">
                {triggerMutation.error.message}
              </p>
            )}
          </>
        )}
      </div>
    );
  }

  // ── Progress step ─────────────────────────────────────────────────────────────

  if (step === 'progress') {
    const isIndeterminate = !importStatus || importStatus.total === 0;
    const pct = !isIndeterminate
      ? Math.round((importStatus!.processed / importStatus!.total) * 100)
      : 0;

    return (
      <div className="p-6 max-w-2xl mx-auto">
        <ImportPageHeader />
        <div className="bg-[var(--surface-0)] rounded-2xl border border-[var(--border)] p-8 text-center">
          <div className="text-4xl mb-6 animate-pulse" aria-hidden="true">&#8635;</div>
          <h3 className="text-lg font-semibold text-[var(--text-0)] mb-2">Import in Progress</h3>
          <p className="text-sm text-[var(--text-2)] mb-1">
            {importStatus?.phase ?? 'Initialising…'}
          </p>
          {!isIndeterminate && (
            <p className="text-xs text-[var(--text-3)] mb-6">
              {importStatus!.processed} of {importStatus!.total} items processed
            </p>
          )}

          {/* Progress bar — pulse animation while total is unknown, determinate once known */}
          {isIndeterminate ? (
            <div
              className="w-full bg-[var(--surface-2)] rounded-full h-2 mb-2 overflow-hidden"
              role="progressbar"
              aria-busy="true"
              aria-label="Import initialising"
            >
              <div className="bg-[var(--accent)] h-2 rounded-full w-1/3 animate-pulse" />
            </div>
          ) : (
            <div
              className="w-full bg-[var(--surface-2)] rounded-full h-2 mb-2"
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Import progress"
            >
              <div
                className="bg-[var(--accent)] h-2 rounded-full transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
          )}
          {!isIndeterminate && (
            <p className="text-xs text-[var(--text-3)]">{pct}%</p>
          )}

          <p className="text-xs text-[var(--text-3)] mt-6">
            Do not close this page. The import may take several minutes for large Jira instances.
          </p>
        </div>
      </div>
    );
  }

  // ── Complete step ─────────────────────────────────────────────────────────────

  if (step === 'complete') {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <ImportPageHeader />
        <div className="bg-[var(--surface-0)] rounded-2xl border border-emerald-500/30 p-8 text-center">
          <div className="text-5xl mb-6" aria-hidden="true">&#10003;</div>
          <h3 className="text-lg font-semibold text-emerald-400 mb-2">Import Complete</h3>
          <p className="text-sm text-[var(--text-2)] mb-6">
            All Jira projects have been imported into ORBIT.
          </p>
          {completionCounts && (
            <div className="grid grid-cols-3 gap-4 mb-8 text-center">
              <div className="bg-[var(--surface-1)] rounded-xl p-4">
                <div className="text-2xl font-bold text-[var(--text-0)]">{completionCounts.ventures}</div>
                <div className="text-xs text-[var(--text-3)] mt-1">Ventures</div>
              </div>
              <div className="bg-[var(--surface-1)] rounded-xl p-4">
                <div className="text-2xl font-bold text-[var(--text-0)]">{completionCounts.workstreams}</div>
                <div className="text-xs text-[var(--text-3)] mt-1">Workstreams</div>
              </div>
              <div className="bg-[var(--surface-1)] rounded-xl p-4">
                <div className="text-2xl font-bold text-[var(--text-0)]">{completionCounts.milestones}</div>
                <div className="text-xs text-[var(--text-3)] mt-1">Milestones</div>
              </div>
            </div>
          )}
          <div className="flex gap-3 justify-center">
            <Button variant="secondary" onClick={() => navigate('/admin/config/jira/sync')}>
              View Sync Dashboard
            </Button>
            <Button onClick={() => navigate('/dashboard/pmo')}>
              Go to Dashboard
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Error step ────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <ImportPageHeader />
      <div className="bg-[var(--surface-0)] rounded-2xl border border-red-500/30 p-8 text-center" role="alert">
        <div className="text-5xl mb-6 text-red-400" aria-hidden="true">&#10007;</div>
        <h3 className="text-lg font-semibold text-red-400 mb-2">Import Failed</h3>
        <p className="text-sm text-[var(--text-2)] mb-4">
          {errorMessage ?? 'An unexpected error occurred during the import.'}
        </p>
        <p className="text-xs text-[var(--text-3)] mb-6">
          Retrying will delete all existing ORBIT data and re-import from Jira from scratch.
        </p>
        <div className="flex gap-3 justify-center">
          <Button variant="ghost" onClick={() => navigate('/admin/config/jira')}>
            Back to Settings
          </Button>
          <Button
            variant="danger"
            onClick={() => retryMutation.mutate({ force: true })}
            disabled={retryMutation.isPending}
          >
            {retryMutation.isPending ? 'Retrying...' : 'Retry Import'}
          </Button>
        </div>
        {retryMutation.error && (
          <p className="text-red-400 text-xs mt-4">{retryMutation.error.message}</p>
        )}
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function ImportPageHeader() {
  return (
    <div className="mb-8">
      <h2 className="text-2xl font-bold text-[var(--text-0)]">Import from Jira</h2>
      <p className="text-sm text-[var(--text-3)] mt-1">
        Import all Jira projects as ORBIT ventures. This replaces all existing ORBIT data.
      </p>
    </div>
  );
}

function CountRow({
  label,
  value,
  danger,
  accent,
}: {
  label: string;
  value: number;
  danger?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between bg-[var(--surface-1)] rounded-lg px-3 py-2">
      <span className="text-xs text-[var(--text-2)]">{label}</span>
      <span className={`text-sm font-semibold ${danger ? 'text-red-400' : accent ? 'text-emerald-400' : 'text-[var(--text-0)]'}`}>
        {value.toLocaleString()}
      </span>
    </div>
  );
}
