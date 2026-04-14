import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { trpc } from '../lib/trpc.js';
import { Button } from '../components/Modal.js';
import { useAuth } from '../lib/auth.js';
import { syncHealthClass, syncHealthLabel } from '../hooks/useJira.js';
import { formatDateTime } from '../lib/format.js';

// ── Types ─────────────────────────────────────────────────────────────────────

type SyncFilter = 'all' | 'green' | 'amber' | 'red';

type VentureSyncRow = {
  ventureId: string;
  ventureName: string;
  jiraProjectKey: string;
  lastSyncAt: string | null;
  jiraSyncEnabled: boolean;
  errorCount: number;
  rag: 'green' | 'amber' | 'red';
};

// ── Main page ─────────────────────────────────────────────────────────────────

export function JiraSyncDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  if (user?.role !== 'pmo') {
    return (
      <div className="p-8 text-[var(--text-3)]">
        You do not have permission to view the Jira sync dashboard.
      </div>
    );
  }

  return <SyncDashboardContent />;
}

function SyncDashboardContent() {
  const navigate = useNavigate();
  const utils = trpc.useUtils();

  const [filter, setFilter] = useState<SyncFilter>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reimportConfirm, setReimportConfirm] = useState<'idle' | 'confirming'>('idle');

  const { data, isLoading, error } = trpc.jira.getSyncDashboard.useQuery(undefined, {
    refetchInterval: 30_000,
  });

  const { data: connection } = trpc.jira.getConnection.useQuery();

  const resyncMutation = trpc.jira.triggerVentureResync.useMutation({
    onSuccess: () => utils.jira.getSyncDashboard.invalidate(),
  });

  if (isLoading) {
    return (
      <div className="p-8 text-[var(--text-3)]" role="status" aria-live="polite">
        Loading sync dashboard...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-red-400" role="alert">
        Unable to load sync dashboard: {error.message}
      </div>
    );
  }

  const ventures: VentureSyncRow[] = (data as VentureSyncRow[] | undefined) ?? [];
  const filtered = ventures.filter(v => {
    if (filter === 'all') return true;
    return v.rag === filter;
  });

  const green = ventures.filter(v => v.rag === 'green').length;
  const amber = ventures.filter(v => v.rag === 'amber').length;
  const red = ventures.filter(v => v.rag === 'red').length;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-[var(--text-0)]">Jira Sync Dashboard</h2>
          <p className="text-sm text-[var(--text-3)] mt-1">
            Monitor real-time sync health across all Jira-linked ventures.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => navigate('/admin/config/jira')} className="!text-xs">
            Connection Settings
          </Button>
          {reimportConfirm === 'idle' ? (
            <Button variant="danger" onClick={() => setReimportConfirm('confirming')} className="!text-xs">
              Wipe & Reimport All
            </Button>
          ) : (
            <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
              <div className="flex-1">
                <p className="text-xs font-semibold text-red-400 mb-1">Risk: Permanent data loss</p>
                <p className="text-xs text-[var(--text-2)] mb-1">
                  All ventures, workstreams, milestones, risks, and issues will be permanently deleted and re-imported from Jira. This cannot be undone.
                </p>
                <p className="text-xs text-[var(--text-3)]">
                  <span className="font-medium">Safe default:</span> Cancel.{' '}
                  <span className="font-medium">Risky alternative:</span> Proceed with full reimport.
                </p>
              </div>
              <div className="flex flex-col gap-1.5 shrink-0">
                <Button variant="ghost" onClick={() => setReimportConfirm('idle')} className="!text-xs">
                  Cancel (safe)
                </Button>
                <Button variant="danger" onClick={() => navigate('/admin/config/jira/import')} className="!text-xs">
                  Proceed with reimport
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Global connection status */}
      <ConnectionStatusCard connection={connection} />

      {/* KPI summary */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <SyncKpi label="Healthy" count={green} colour="text-emerald-400" bg="bg-emerald-500/10" />
        <SyncKpi label="Warning" count={amber} colour="text-amber-400" bg="bg-amber-500/10" />
        <SyncKpi label="Error" count={red} colour="text-red-400" bg="bg-red-500/10" />
      </div>

      {/* Filter */}
      <div className="flex gap-2 mb-4">
        {(['all', 'green', 'amber', 'red'] as SyncFilter[]).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              filter === f
                ? 'bg-[var(--accent)] text-white'
                : 'bg-[var(--surface-1)] text-[var(--text-2)] hover:text-[var(--text-0)] hover:bg-[var(--surface-2)]'
            }`}
          >
            {f === 'all' ? 'All' : f === 'green' ? 'Healthy' : f === 'amber' ? 'Warning' : 'Error'}
          </button>
        ))}
      </div>

      {/* Empty state */}
      {ventures.length === 0 && (
        <div className="text-center py-16">
          <div className="text-4xl mb-4 text-[var(--text-3)]" aria-hidden="true">&#9673;</div>
          <p className="text-[var(--text-3)] text-sm mb-4">No Jira-linked ventures found.</p>
          <Button onClick={() => navigate('/admin/config/jira/import')}>Run Import</Button>
        </div>
      )}

      {/* Table */}
      {filtered.length > 0 && (
        <div className="bg-[var(--surface-0)] rounded-2xl border border-[var(--border)] overflow-hidden">
          <table className="w-full text-sm" role="table" aria-label="Jira sync status by venture">
            <thead>
              <tr className="bg-[var(--surface-1)] text-[var(--text-3)] text-[10px] uppercase tracking-widest">
                <th className="text-start px-5 py-3">Venture</th>
                <th className="text-start px-5 py-3">Jira Project</th>
                <th className="text-start px-5 py-3">Last Synced</th>
                <th className="text-start px-5 py-3">Status</th>
                <th className="text-start px-5 py-3">Errors</th>
                <th className="text-end px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(v => (
                <VentureRow
                  key={v.ventureId}
                  venture={v}
                  expanded={expandedId === v.ventureId}
                  onToggle={() => setExpandedId(prev => prev === v.ventureId ? null : v.ventureId)}
                  onResync={() => resyncMutation.mutate({ ventureId: v.ventureId })}
                  resyncPending={resyncMutation.isPending && resyncMutation.variables?.ventureId === v.ventureId}
                  connection={connection}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {filtered.length === 0 && ventures.length > 0 && (
        <div className="text-center py-12 text-[var(--text-3)] text-sm">
          No ventures match the selected filter.
        </div>
      )}
    </div>
  );
}

// ── Connection Status Card ────────────────────────────────────────────────────

function ConnectionStatusCard({ connection }: { connection: any }) {
  if (!connection) return null;

  const isConnected = connection.status === 'connected';
  const hasError = connection.status === 'error';
  const isDisconnected = !isConnected && !hasError;

  const cardBg = isConnected
    ? 'bg-emerald-500/10 border-emerald-500/30'
    : hasError
    ? 'bg-red-500/10 border-red-500/30'
    : 'bg-amber-500/10 border-amber-500/30';

  const dotColour = isConnected ? 'bg-emerald-400' : hasError ? 'bg-red-400' : 'bg-amber-400';
  const textColour = isConnected ? 'text-emerald-400' : hasError ? 'text-red-400' : 'text-amber-400';

  return (
    <div className={`rounded-2xl border px-5 py-4 mb-6 flex items-center justify-between ${cardBg}`}>
      <div className="flex items-center gap-3">
        <span
          className={`w-3 h-3 rounded-full ${dotColour}`}
          aria-hidden="true"
        />
        <div>
          <div className={`text-sm font-semibold ${textColour}`}>
            {isConnected ? 'Jira Connected' : hasError ? 'Connection Error' : 'Disconnected'}
          </div>
          <div className="text-xs text-[var(--text-3)]">
            {connection.instanceUrl}
            {connection.lastValidatedAt && (
              <> &mdash; Last ping: {formatDateTime(String(connection.lastValidatedAt))}</>
            )}
          </div>
        </div>
      </div>
      {hasError && connection.lastError && (
        <div className="text-xs text-red-400 font-mono max-w-xs truncate" title={connection.lastError}>
          {connection.lastError}
        </div>
      )}
    </div>
  );
}

// ── Venture row ───────────────────────────────────────────────────────────────

function VentureRow({
  venture,
  expanded,
  onToggle,
  onResync,
  resyncPending,
  connection,
}: {
  venture: VentureSyncRow;
  expanded: boolean;
  onToggle: () => void;
  onResync: () => void;
  resyncPending: boolean;
  connection: any;
}) {
  const health = venture.rag;
  const healthLabel = syncHealthLabel(venture.lastSyncAt, venture.errorCount > 0);

  const dotColour = health === 'green'
    ? 'bg-emerald-400'
    : health === 'amber'
    ? 'bg-amber-400'
    : 'bg-red-400';

  const textColour = health === 'green'
    ? 'text-emerald-400'
    : health === 'amber'
    ? 'text-amber-400'
    : 'text-red-400';

  const jiraProjectUrl = connection?.instanceUrl
    ? `${connection.instanceUrl.replace(/\/$/, '')}/jira/software/projects/${venture.jiraProjectKey}/boards`
    : null;

  const detailRowId = `sync-detail-${venture.ventureId}`;

  return (
    <>
      <tr
        className="border-t border-[var(--border)] hover:bg-[var(--surface-1)]/40 transition-colors"
        onClick={onToggle}
      >
        <td className="px-5 py-3">
          <div className="flex items-center gap-2">
            {/* Dedicated toggle button — carries aria-expanded, not the <tr> */}
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={detailRowId}
              onClick={e => { e.stopPropagation(); onToggle(); }}
              className="text-[var(--text-3)] hover:text-[var(--text-1)] transition-colors w-4 h-4 flex items-center justify-center rounded shrink-0"
              aria-label={`${expanded ? 'Collapse' : 'Expand'} sync details for ${venture.ventureName}`}
            >
              <span aria-hidden="true">{expanded ? '▾' : '▸'}</span>
            </button>
            <span className="font-medium text-[var(--text-0)]">{venture.ventureName}</span>
          </div>
        </td>
        <td className="px-5 py-3">
          {jiraProjectUrl ? (
            <a
              href={jiraProjectUrl}
              target="_blank"
              rel="noreferrer"
              onClick={e => e.stopPropagation()}
              className="text-[var(--accent-hover)] hover:underline text-xs font-mono"
              aria-label={`Open ${venture.jiraProjectKey} in Jira`}
            >
              {venture.jiraProjectKey}
            </a>
          ) : (
            <span className="text-xs font-mono text-[var(--text-2)]">{venture.jiraProjectKey}</span>
          )}
        </td>
        <td className="px-5 py-3 text-xs text-[var(--text-2)]">
          {venture.lastSyncAt ? formatDateTime(String(venture.lastSyncAt)) : '—'}
        </td>
        <td className="px-5 py-3">
          <span
            className={`inline-flex items-center gap-1.5 text-xs font-medium ${textColour}`}
            aria-label={`Sync health: ${healthLabel}`}
          >
            <span className={`w-2 h-2 rounded-full ${dotColour}`} aria-hidden="true" />
            {healthLabel}
          </span>
          {!venture.jiraSyncEnabled && (
            <span className="ms-2 text-[10px] text-[var(--text-3)] bg-[var(--surface-2)] rounded-full px-2 py-0.5">
              Paused
            </span>
          )}
        </td>
        <td className="px-5 py-3">
          {venture.errorCount > 0 ? (
            <span className="text-xs text-red-400 font-semibold">{venture.errorCount}</span>
          ) : (
            <span className="text-xs text-[var(--text-3)]">0</span>
          )}
        </td>
        <td className="px-5 py-3 text-end">
          <Button
            variant="secondary"
            onClick={e => { e.stopPropagation(); onResync(); }}
            disabled={resyncPending || !venture.jiraSyncEnabled}
            className="!text-xs !px-3 !py-1.5"
            title={!venture.jiraSyncEnabled ? 'Sync is paused for this venture' : undefined}
            aria-label={`Re-sync ${venture.ventureName}`}
          >
            {resyncPending ? 'Syncing...' : 'Re-sync'}
          </Button>
        </td>
      </tr>

      {/* Expanded sync log */}
      {expanded && (
        <tr id={detailRowId}>
          <td colSpan={6} className="bg-[var(--surface-1)]/30 px-5 py-4">
            <VentureSyncDetail ventureId={venture.ventureId} />
          </td>
        </tr>
      )}
    </>
  );
}

// ── Venture sync detail (expanded row) ───────────────────────────────────────

function VentureSyncDetail({ ventureId }: { ventureId: string }) {
  const utils = trpc.useUtils();
  const { data, isLoading, error } = trpc.jira.getVentureSyncDetail.useQuery({ ventureId });
  const setSyncMutation = trpc.jira.setSyncEnabled.useMutation({
    onSuccess: () => {
      utils.jira.getSyncDashboard.invalidate();
      utils.jira.getVentureSyncDetail.invalidate({ ventureId });
    },
  });

  if (isLoading) {
    return <div className="text-xs text-[var(--text-3)] py-2">Loading sync details...</div>;
  }
  if (error) {
    return <div className="text-xs text-red-400 py-2">Unable to load sync log: {error.message}</div>;
  }
  if (!data) return null;

  const logs = data.syncLog ?? [];

  return (
    <div className="animate-in">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs text-[var(--text-2)]">
          <span className="font-medium">Last sync:</span>{' '}
          {data.lastSyncAt ? formatDateTime(String(data.lastSyncAt)) : '—'}
          <span className="mx-3 text-[var(--border-hover)]">|</span>
          <span className="font-medium">Sync:</span>{' '}
          <span className={data.jiraSyncEnabled ? 'text-emerald-400' : 'text-amber-400'}>
            {data.jiraSyncEnabled ? 'Enabled' : 'Paused'}
          </span>
        </div>
        <Button
          variant="secondary"
          className="!text-xs !px-3 !py-1.5"
          onClick={() => setSyncMutation.mutate({ ventureId, enabled: !data.jiraSyncEnabled })}
          disabled={setSyncMutation.isPending}
        >
          {data.jiraSyncEnabled ? 'Pause Sync' : 'Resume Sync'}
        </Button>
      </div>

      {logs.length === 0 ? (
        <p className="text-xs text-[var(--text-3)]">No sync log entries for this venture.</p>
      ) : (
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {logs.slice(0, 50).map((log: any) => (
            <div
              key={log.id}
              className={`flex items-start gap-3 text-xs rounded-lg px-3 py-2 ${
                log.level === 'error'
                  ? 'bg-red-500/10 text-red-400'
                  : log.level === 'warning'
                  ? 'bg-amber-500/10 text-amber-400'
                  : 'bg-[var(--surface-1)] text-[var(--text-2)]'
              }`}
            >
              <span className="whitespace-nowrap text-[var(--text-3)] shrink-0">
                {formatDateTime(String(log.createdAt))}
              </span>
              <span className="uppercase font-semibold w-14 shrink-0">{log.level}</span>
              <span className="truncate">{log.message}</span>
              {log.jiraEntityId && (
                <span className="text-[var(--text-3)] shrink-0 font-mono">{log.jiraEntityId}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── KPI card variant ──────────────────────────────────────────────────────────

function SyncKpi({
  label,
  count,
  colour,
  bg,
}: {
  label: string;
  count: number;
  colour: string;
  bg: string;
}) {
  return (
    <div className={`rounded-2xl border border-[var(--border)] ${bg} px-5 py-4`}>
      <div className="text-xs text-[var(--text-3)] uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-2xl font-bold ${colour}`}>{count}</div>
    </div>
  );
}
