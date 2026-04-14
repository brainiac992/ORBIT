import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { trpc } from '../lib/trpc.js';
import { Button, FormField, Input } from '../components/Modal.js';
import { useAuth } from '../lib/auth.js';
import { formatDateTime } from '../lib/format.js';

// ── Types ────────────────────────────────────────────────────────────────────

type TestState =
  | { status: 'idle' }
  | { status: 'testing' }
  | { status: 'success'; accountName: string }
  | { status: 'error'; message: string };

type DisconnectState = 'idle' | 'confirming' | 'disconnecting';

// ── Main page ─────────────────────────────────────────────────────────────────

export function JiraSettingsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Redirect non-PMO users
  if (user?.role !== 'pmo') {
    return (
      <div className="p-8 text-[var(--text-3)]">
        You do not have permission to access Jira settings.
      </div>
    );
  }

  return <JiraSettingsContent />;
}

function JiraSettingsContent() {
  const navigate = useNavigate();
  const utils = trpc.useUtils();

  const { data: connection, isLoading, error: loadError } = trpc.jira.getConnection.useQuery();
  const { data: importTime } = trpc.jira.getLastImportTime.useQuery(undefined, {
    enabled: connection?.status === 'connected',
    refetchInterval: 60_000,
  });

  const testMutation = trpc.jira.testConnection.useMutation();
  const saveMutation = trpc.jira.saveConnection.useMutation({
    onSuccess: () => {
      utils.jira.getConnection.invalidate();
      navigate('/admin/config/jira/import');
    },
  });
  const disconnectMutation = trpc.jira.disconnect.useMutation({
    onSuccess: () => {
      utils.jira.getConnection.invalidate();
    },
  });

  const [form, setForm] = useState({ instanceUrl: '', email: '', apiToken: '' });
  const [testState, setTestState] = useState<TestState>({ status: 'idle' });
  const [saveError, setSaveError] = useState<string | null>(null);
  const [disconnectState, setDisconnectState] = useState<DisconnectState>('idle');

  // ── Handlers ────────────────────────────────────────────────────────────────

  async function handleTest() {
    setSaveError(null);
    setTestState({ status: 'testing' });
    try {
      const result = await testMutation.mutateAsync({
        instanceUrl: form.instanceUrl.trim(),
        email: form.email.trim(),
        apiToken: form.apiToken,
      });
      if (result.success) {
        setTestState({ status: 'success', accountName: result.accountName ?? 'Connected' });
      } else {
        setTestState({ status: 'error', message: result.error ?? 'Connection failed.' });
      }
    } catch (e: any) {
      setTestState({ status: 'error', message: e?.message ?? 'Connection test failed.' });
    }
  }

  async function handleSave() {
    setSaveError(null);
    try {
      await saveMutation.mutateAsync({
        instanceUrl: form.instanceUrl.trim(),
        email: form.email.trim(),
        apiToken: form.apiToken,
      });
    } catch (e: any) {
      setSaveError(e?.message ?? 'Failed to save connection.');
    }
  }

  async function handleDisconnect() {
    setDisconnectState('disconnecting');
    try {
      await disconnectMutation.mutateAsync();
    } catch {
      // error surface via mutation state
    } finally {
      setDisconnectState('idle');
    }
  }

  // ── Loading / Error ──────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="p-8 text-[var(--text-3)]" role="status" aria-live="polite">
        Loading Jira connection...
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="p-8 text-red-400" role="alert">
        Unable to load Jira connection settings. Please try again.
      </div>
    );
  }

  const isConnected = connection?.status === 'connected';
  const hasError = connection?.status === 'error';
  const canSave =
    form.instanceUrl.trim().match(/^https:\/\/[a-zA-Z0-9-]+\.atlassian\.net\/?$/) &&
    form.email.trim().includes('@') &&
    form.apiToken.length > 0 &&
    !saveMutation.isPending;

  // ── Connected state ──────────────────────────────────────────────────────────

  if (isConnected || hasError) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <PageHeader />

        {/* Status card */}
        <div className={`rounded-2xl border p-5 mb-6 ${
          isConnected
            ? 'bg-emerald-500/10 border-emerald-500/30'
            : 'bg-red-500/10 border-red-500/30'
        }`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className={`flex items-center gap-2 mb-2 font-semibold text-sm ${isConnected ? 'text-emerald-400' : 'text-red-400'}`}>
                <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400' : 'bg-red-400'}`} aria-hidden="true" />
                {isConnected ? 'Connected to Jira Cloud' : 'Connection Error'}
              </div>
              <div className="text-sm text-[var(--text-1)] mb-1">{connection.instanceUrl}</div>
              <div className="text-xs text-[var(--text-3)]">{connection.accountEmail}</div>
              {importTime?.lastImportAt ? (
                <div className="text-xs text-[var(--text-3)] mt-1">
                  Last synced: {formatDateTime(String(importTime.lastImportAt))}
                </div>
              ) : connection.lastValidatedAt ? (
                <div className="text-xs text-[var(--text-3)] mt-1">
                  Last validated: {formatDateTime(String(connection.lastValidatedAt))}
                </div>
              ) : null}
              {importTime?.nextScheduledAt && (
                <div className="text-xs text-[var(--text-3)] mt-0.5">
                  Next auto-sync: {formatDateTime(String(importTime.nextScheduledAt))} (7:00 AM UAE)
                </div>
              )}
              {importTime?.projectKeyFilter && (
                <div className="text-xs text-[var(--text-3)] mt-0.5">
                  Syncing: <span className="font-mono text-[var(--text-1)]">{importTime.projectKeyFilter}</span>
                </div>
              )}
              {hasError && connection.lastError && (
                <div className="text-xs text-red-400 mt-2 font-mono bg-red-500/10 rounded-lg px-3 py-2">
                  {connection.lastError}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Button
                variant="secondary"
                onClick={() => navigate('/admin/config/jira/sync')}
                className="!text-xs whitespace-nowrap"
              >
                Sync Dashboard
              </Button>
              <Button
                variant="secondary"
                onClick={() => navigate('/admin/config/jira/import')}
                className="!text-xs whitespace-nowrap"
              >
                Run Import
              </Button>
            </div>
          </div>
        </div>

        {/* Disconnect section */}
        <div className="bg-[var(--surface-0)] rounded-2xl border border-[var(--border)] p-5">
          <h3 className="text-sm font-semibold text-[var(--text-0)] mb-1">Disconnect Jira</h3>
          <p className="text-xs text-[var(--text-3)] mb-4">
            Disconnecting will deregister the ORBIT webhook from Jira and pause all sync operations.
            Existing venture data imported from Jira will be preserved.
          </p>

          {disconnectState === 'confirming' ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-[var(--text-1)]">Confirm disconnect?</span>
              <Button
                variant="danger"
                onClick={handleDisconnect}
                disabled={disconnectState === 'disconnecting'}
              >
                {disconnectState === 'disconnecting' ? 'Disconnecting...' : 'Yes, Disconnect'}
              </Button>
              <Button variant="ghost" onClick={() => setDisconnectState('idle')}>Cancel</Button>
            </div>
          ) : (
            <Button variant="danger" onClick={() => setDisconnectState('confirming')}>
              Disconnect Jira
            </Button>
          )}

          {disconnectMutation.error && (
            <p className="text-red-400 text-xs mt-3" role="alert">
              {disconnectMutation.error.message}
            </p>
          )}
        </div>
      </div>
    );
  }

  // ── Setup form (no connection) ────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <PageHeader />

      <div className="bg-[var(--surface-0)] rounded-2xl border border-[var(--border)] p-6">
        <p className="text-sm text-[var(--text-2)] mb-6">
          Connect ORBIT to your Jira Cloud instance. You will need a Jira API token — generate one at
          {' '}
          <a
            href="https://id.atlassian.com/manage-profile/security/api-tokens"
            target="_blank"
            rel="noreferrer"
            className="text-[var(--accent-hover)] hover:underline"
          >
            id.atlassian.com
          </a>.
        </p>

        <FormField label="Jira Cloud URL" required>
          <Input
            type="url"
            placeholder="https://yourorg.atlassian.net"
            value={form.instanceUrl}
            onChange={e => { setForm(f => ({ ...f, instanceUrl: e.target.value })); setTestState({ status: 'idle' }); }}
            aria-describedby="instanceUrl-hint"
          />
          <p id="instanceUrl-hint" className="text-[10px] text-[var(--text-3)] mt-1">
            Must end in .atlassian.net
          </p>
        </FormField>

        <FormField label="Account Email" required>
          <Input
            type="email"
            placeholder="you@company.com"
            value={form.email}
            onChange={e => { setForm(f => ({ ...f, email: e.target.value })); setTestState({ status: 'idle' }); }}
          />
        </FormField>

        <FormField label="API Token" required>
          <Input
            type="password"
            placeholder="Paste your Jira API token"
            value={form.apiToken}
            onChange={e => { setForm(f => ({ ...f, apiToken: e.target.value })); setTestState({ status: 'idle' }); }}
            aria-describedby="token-hint"
            autoComplete="new-password"
          />
          <p id="token-hint" className="text-[10px] text-[var(--text-3)] mt-1">
            The token is encrypted at rest and never shown after saving.
          </p>
        </FormField>

        {/* Test connection feedback */}
        {testState.status === 'success' && (
          <div className="flex items-center gap-2 text-emerald-400 text-sm mb-4 bg-emerald-500/10 rounded-xl px-4 py-3" role="status">
            <span aria-hidden="true">&#10003;</span>
            Connected as <strong>{testState.accountName}</strong>
          </div>
        )}
        {testState.status === 'error' && (
          <div className="text-red-400 text-sm mb-4 bg-red-500/10 rounded-xl px-4 py-3" role="alert">
            {testState.message}
          </div>
        )}

        {saveError && (
          <div className="text-red-400 text-sm mb-4 bg-red-500/10 rounded-xl px-4 py-3" role="alert">
            {saveError}
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <Button
            variant="secondary"
            onClick={handleTest}
            disabled={testState.status === 'testing' || !form.instanceUrl || !form.email || !form.apiToken}
          >
            {testState.status === 'testing' ? 'Testing...' : 'Test Connection'}
          </Button>
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={!canSave || testState.status !== 'success'}
            title={testState.status !== 'success' ? 'Test the connection first' : undefined}
          >
            {saveMutation.isPending ? 'Saving...' : 'Save & Connect'}
          </Button>
        </div>

        {testState.status !== 'success' && (
          <p className="text-[10px] text-[var(--text-3)] mt-3">
            Test the connection before saving to verify your credentials.
          </p>
        )}
      </div>
    </div>
  );
}

function PageHeader() {
  return (
    <div className="mb-8">
      <h2 className="text-2xl font-bold text-[var(--text-0)]">Jira Integration</h2>
      <p className="text-sm text-[var(--text-3)] mt-1">
        Connect ORBIT to Jira Cloud to automatically sync ventures, workstreams, milestones, risks, and issues.
      </p>
    </div>
  );
}
