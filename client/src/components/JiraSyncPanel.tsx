/**
 * JiraSyncPanel — small panel displayed on venture detail pages showing Jira
 * sync status. Visible to all roles but content varies by role:
 *   - GM: last synced timestamp only
 *   - PM (own venture): sync status + error count
 *   - PMO: full status + sync toggle + link to sync dashboard
 */

import { useNavigate } from 'react-router-dom';
import { trpc } from '../lib/trpc.js';
import { useAuth } from '../lib/auth.js';
import { syncHealthClass, syncHealthLabel } from '../hooks/useJira.js';
import { formatDateTime } from '../lib/format.js';
import { Button } from './Modal.js';

type Props = {
  ventureId: string;
  jiraProjectKey: string | null | undefined;
  jiraSyncEnabled: boolean;
  instanceUrl?: string | null;
};

export function JiraSyncPanel({ ventureId, jiraProjectKey, jiraSyncEnabled, instanceUrl }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const utils = trpc.useUtils();

  // Only render if this venture is Jira-linked
  if (!jiraProjectKey) return null;

  const isGM = user?.role === 'gm';
  const isPMO = user?.role === 'pmo';

  const { data, isLoading } = trpc.jira.getVentureSyncDetail.useQuery(
    { ventureId },
    { enabled: !isGM, refetchInterval: 60_000 }
  );

  const setSyncMutation = trpc.jira.setSyncEnabled.useMutation({
    onSuccess: () => {
      utils.jira.getVentureSyncDetail.invalidate({ ventureId });
      utils.jira.getSyncDashboard.invalidate();
    },
  });

  const health = data ? syncHealthClass(data.lastSyncedAt ? String(data.lastSyncedAt) : null, data.hasError ?? false) : 'amber';
  const dotColour = health === 'green' ? 'bg-emerald-400' : health === 'amber' ? 'bg-amber-400' : 'bg-red-400';
  const textColour = health === 'green' ? 'text-emerald-400' : health === 'amber' ? 'text-amber-400' : 'text-red-400';

  const jiraProjectUrl = instanceUrl
    ? `${instanceUrl.replace(/\/$/, '')}/jira/software/projects/${jiraProjectKey}/boards`
    : null;

  return (
    <div
      className="bg-[var(--surface-0)] border border-[var(--border)] rounded-xl px-4 py-3 flex flex-wrap items-center gap-4 text-xs"
      aria-label="Jira sync status"
    >
      {/* Jira project chip */}
      <div className="flex items-center gap-1.5">
        <span className="text-[var(--text-3)]">Jira:</span>
        {jiraProjectUrl ? (
          <a
            href={jiraProjectUrl}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-[var(--accent-hover)] hover:underline font-semibold"
            aria-label={`Open Jira project ${jiraProjectKey} in Jira`}
          >
            {jiraProjectKey}
          </a>
        ) : (
          <span className="font-mono font-semibold text-[var(--text-1)]">{jiraProjectKey}</span>
        )}
      </div>

      <span className="text-[var(--border-hover)]" aria-hidden="true">|</span>

      {/* GM: just last synced */}
      {isGM && (
        <span className="text-[var(--text-3)]">
          Last synced:{' '}
          <span className="text-[var(--text-2)]">
            {data?.lastSyncedAt ? formatDateTime(String(data.lastSyncedAt)) : '—'}
          </span>
        </span>
      )}

      {/* PM / PMO: health indicator */}
      {!isGM && (
        <>
          {isLoading ? (
            <span className="text-[var(--text-3)]">Loading...</span>
          ) : (
            <>
              <span
                className={`inline-flex items-center gap-1.5 font-medium ${textColour}`}
                aria-label={`Sync health: ${syncHealthLabel(data?.lastSyncedAt ? String(data.lastSyncedAt) : null, data?.hasError ?? false)}`}
              >
                <span className={`w-2 h-2 rounded-full ${dotColour}`} aria-hidden="true" />
                {!jiraSyncEnabled || !(data?.syncEnabled) ? 'Paused' : syncHealthLabel(data?.lastSyncedAt ? String(data.lastSyncedAt) : null, data?.hasError ?? false)}
              </span>

              <span className="text-[var(--text-3)]">
                Last synced:{' '}
                <span className="text-[var(--text-2)]">
                  {data?.lastSyncedAt ? formatDateTime(String(data.lastSyncedAt)) : '—'}
                </span>
              </span>

              {/* Error count for PM and PMO */}
              {(data?.errorCount ?? 0) > 0 && (
                <>
                  <span className="text-[var(--border-hover)]" aria-hidden="true">|</span>
                  <span className="text-red-400 font-semibold">
                    {data!.errorCount} sync {data!.errorCount === 1 ? 'error' : 'errors'}
                  </span>
                </>
              )}

              {/* PMO actions */}
              {isPMO && (
                <>
                  <span className="text-[var(--border-hover)]" aria-hidden="true">|</span>
                  <button
                    onClick={() => navigate(`/settings/jira/sync`)}
                    className="text-[var(--accent-hover)] hover:underline transition-colors"
                    aria-label="View full sync log in sync dashboard"
                  >
                    View sync log
                  </button>
                  <Button
                    variant="ghost"
                    className="!text-[10px] !px-2 !py-1"
                    onClick={() => setSyncMutation.mutate({ ventureId, enabled: !jiraSyncEnabled })}
                    disabled={setSyncMutation.isPending}
                  >
                    {jiraSyncEnabled ? 'Pause sync' : 'Resume sync'}
                  </Button>
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
