/**
 * JiraManagedBanner — shown inside venture detail pages when the venture is
 * Jira-managed. Disabling the form inputs must be done by the consuming
 * component; this banner communicates the reason to the user.
 *
 * Variants:
 *   - default (PM/PMO): informs user fields are read-only and changes must be
 *     made in Jira.
 *   - readOnly (GM): informs the viewer that data originates from Jira (no
 *     edit affordance language since GMs can never edit).
 */

type Props = {
  jiraProjectKey: string;
  instanceUrl?: string | null;
  /** When true, renders a softer informational variant for read-only viewers (e.g. GMs). */
  readOnly?: boolean;
};

export function JiraManagedBanner({ jiraProjectKey, instanceUrl, readOnly = false }: Props) {
  const jiraProjectUrl = instanceUrl
    ? `${instanceUrl.replace(/\/$/, '')}/jira/software/projects/${jiraProjectKey}/boards`
    : null;

  if (readOnly) {
    return (
      <div
        className="flex items-start gap-3 bg-[var(--surface-1)] border border-[var(--border)] rounded-xl px-4 py-3 mb-4"
        role="note"
        aria-label="This venture is synced from Jira"
      >
        <span className="text-[var(--text-3)] shrink-0 mt-0.5" aria-hidden="true">&#9432;</span>
        <div>
          <p className="text-sm font-medium text-[var(--text-1)]">
            Data sourced from Jira
          </p>
          <p className="text-xs text-[var(--text-3)] mt-0.5">
            This venture is managed in Jira. Data shown here is kept up to date automatically via sync.
          </p>
          {jiraProjectUrl && (
            <a
              href={jiraProjectUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 mt-2 text-xs text-[var(--accent-hover)] hover:underline"
              aria-label={`View project ${jiraProjectKey} in Jira`}
            >
              View in Jira
              <span aria-hidden="true">&#8599;</span>
            </a>
          )}
          {!jiraProjectUrl && (
            <p className="text-xs text-[var(--text-3)] mt-1 font-mono">Project key: {jiraProjectKey}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex items-start gap-3 bg-blue-500/10 border border-blue-500/30 rounded-xl px-4 py-3 mb-4"
      role="note"
      aria-label="This venture is managed by Jira"
    >
      <span className="text-blue-400 shrink-0 mt-0.5" aria-hidden="true">&#9432;</span>
      <div>
        <p className="text-sm font-medium text-blue-400">
          This venture is managed by Jira
        </p>
        <p className="text-xs text-[var(--text-2)] mt-0.5">
          Fields are read-only. To update venture details, edit the project in Jira — changes will sync automatically.
        </p>
        {jiraProjectUrl ? (
          <a
            href={jiraProjectUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 mt-2 text-xs text-[var(--accent-hover)] hover:underline"
            aria-label={`Open project ${jiraProjectKey} in Jira`}
          >
            Open in Jira
            <span aria-hidden="true">&#8599;</span>
          </a>
        ) : (
          <p className="text-xs text-[var(--text-3)] mt-1 font-mono">Project key: {jiraProjectKey}</p>
        )}
      </div>
    </div>
  );
}
