import { trpc } from '../lib/trpc.js';
import { Button } from '../components/Modal.js';
import { useAuth } from '../lib/auth.js';

const ORBIT_STATUS_OPTIONS = [
  { value: 'not_started', label: 'Not Started' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'complete', label: 'Complete' },
  { value: 'on_hold', label: 'On Hold' },
];

export function JiraStatusMappingsPage() {
  const { user } = useAuth();

  if (user?.role !== 'pmo') {
    return (
      <div className="p-8 text-[var(--text-3)]">
        You do not have permission to configure Jira status mappings.
      </div>
    );
  }

  return <StatusMappingsContent />;
}

function StatusMappingsContent() {
  const utils = trpc.useUtils();
  const { data: mappings, isLoading, error } = trpc.jira.getStatusMappings.useQuery();
  const updateMutation = trpc.jira.updateStatusMapping.useMutation({
    onSuccess: () => utils.jira.getStatusMappings.invalidate(),
  });

  if (isLoading) {
    return (
      <div className="p-8 text-[var(--text-3)]" role="status" aria-live="polite">
        Loading status mappings...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-red-400" role="alert">
        Unable to load status mappings: {error.message}
      </div>
    );
  }

  const rows = mappings ?? [];

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-[var(--text-0)]">Jira Status Mappings</h2>
        <p className="text-sm text-[var(--text-3)] mt-1">
          Control how Jira statuses map to ORBIT statuses. Changes apply from the next reconciliation cycle.
          They are not applied retroactively to already-synced data.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="text-center py-16 bg-[var(--surface-0)] rounded-2xl border border-[var(--border)]">
          <p className="text-[var(--text-3)] text-sm">
            No Jira statuses discovered yet. Run an import or wait for the next sync cycle.
          </p>
        </div>
      ) : (
        <div className="bg-[var(--surface-0)] rounded-2xl border border-[var(--border)] overflow-hidden">
          <table className="w-full text-sm" aria-label="Jira to ORBIT status mappings">
            <thead>
              <tr className="bg-[var(--surface-1)] text-[var(--text-3)] text-[10px] uppercase tracking-widest">
                <th className="text-start px-5 py-3">Jira Status</th>
                <th className="text-start px-5 py-3">ORBIT Status</th>
                <th className="text-start px-5 py-3 w-24">Last Updated</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m: any) => (
                <tr key={m.jiraStatusName} className="border-t border-[var(--border)] hover:bg-[var(--surface-1)]/40 transition-colors">
                  <td className="px-5 py-3">
                    <span className="font-medium text-[var(--text-0)]">{m.jiraStatusName}</span>
                    {m.isDefault && (
                      <span className="ms-2 text-[10px] text-[var(--text-3)] bg-[var(--surface-2)] rounded-full px-2 py-0.5">
                        Default
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <select
                      value={m.orbitStatus}
                      onChange={e => updateMutation.mutate({
                        jiraStatusName: m.jiraStatusName,
                        orbitStatus: e.target.value,
                      })}
                      disabled={updateMutation.isPending}
                      className="bg-[var(--surface-1)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs text-[var(--text-1)] focus:outline-none focus:border-[var(--accent)] transition-colors"
                      aria-label={`ORBIT status for Jira status "${m.jiraStatusName}"`}
                    >
                      {ORBIT_STATUS_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-5 py-3 text-xs text-[var(--text-3)]">
                    {m.updatedAt ? new Date(m.updatedAt).toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {updateMutation.error && (
        <p className="text-red-400 text-sm mt-4" role="alert">
          Failed to save mapping: {updateMutation.error.message}
        </p>
      )}
    </div>
  );
}
