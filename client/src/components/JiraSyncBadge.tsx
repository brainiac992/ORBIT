/**
 * JiraSyncBadge — small inline sync health dot for venture cards/list rows.
 * Rendered only when the venture has jiraProjectKey set.
 *
 * Colour logic (spec-aligned):
 *   green  = synced within last 30 minutes
 *   amber  = synced 30 min – 2 hours ago
 *   red    = >2 hours or hasError
 *
 * Accessibility: both sm and md sizes render a visible text label so status
 * is never conveyed by colour alone.
 */

import { syncHealthClass, syncHealthLabel } from '../hooks/useJira.js';

type Props = {
  lastSyncedAt: string | null | undefined;
  hasError: boolean;
  jiraProjectKey?: string | null;
  size?: 'sm' | 'md';
};

/** Short label shown at sm size — kept brief to fit in tight layouts */
function shortLabel(health: 'green' | 'amber' | 'red'): string {
  if (health === 'green') return 'Synced';
  if (health === 'amber') return 'Delayed';
  return 'Error';
}

export function JiraSyncBadge({ lastSyncedAt, hasError, jiraProjectKey, size = 'sm' }: Props) {
  if (!jiraProjectKey) return null;

  const health = syncHealthClass(lastSyncedAt, hasError);
  const label = syncHealthLabel(lastSyncedAt, hasError);

  const dotCls = health === 'green'
    ? 'bg-emerald-400'
    : health === 'amber'
    ? 'bg-amber-400'
    : 'bg-red-400';

  const textCls = health === 'green'
    ? 'text-emerald-400'
    : health === 'amber'
    ? 'text-amber-400'
    : 'text-red-400';

  const dotSize = size === 'sm' ? 'w-2 h-2' : 'w-2.5 h-2.5';

  return (
    <span
      className="inline-flex items-center gap-1.5"
      title={`Jira sync: ${label}`}
      aria-label={`Jira sync status: ${label}`}
    >
      <span
        className={`rounded-full shrink-0 ${dotCls} ${dotSize}`}
        aria-hidden="true"
      />
      {/* Always render a text label — at sm size use the short form so status
          is not communicated by colour alone (accessibility requirement). */}
      <span className={`text-[10px] font-medium ${textCls}`}>
        {size === 'sm' ? shortLabel(health) : label}
      </span>
    </span>
  );
}
