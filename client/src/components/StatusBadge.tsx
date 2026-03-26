const statusStyles: Record<string, { bg: string; text: string; label: string }> = {
  on_track:      { bg: 'bg-green-100',  text: 'text-green-800',  label: 'On Track' },
  at_risk:       { bg: 'bg-amber-100',  text: 'text-amber-800',  label: 'At Risk' },
  off_track:     { bg: 'bg-red-100',    text: 'text-red-800',    label: 'Off Track' },
  complete:      { bg: 'bg-blue-100',   text: 'text-blue-800',   label: 'Complete' },
  planning:      { bg: 'bg-gray-100',   text: 'text-gray-600',   label: 'Planning' },
  on_hold:       { bg: 'bg-gray-100',   text: 'text-gray-600',   label: 'On Hold' },
  archived:      { bg: 'bg-gray-100',   text: 'text-gray-500',   label: 'Archived' },
  not_started:   { bg: 'bg-gray-100',   text: 'text-gray-600',   label: 'Not Started' },
  in_progress:   { bg: 'bg-green-100',  text: 'text-green-800',  label: 'In Progress' },
  upcoming:      { bg: 'bg-blue-50',    text: 'text-blue-700',   label: 'Upcoming' },
  achieved:      { bg: 'bg-green-100',  text: 'text-green-800',  label: 'Achieved' },
  overdue:       { bg: 'bg-amber-100',  text: 'text-amber-800',  label: 'Overdue' },
  deferred:      { bg: 'bg-gray-100',   text: 'text-gray-500',   label: 'Deferred' },
  within_budget: { bg: 'bg-green-100',  text: 'text-green-800',  label: 'Within Budget' },
  over_budget:   { bg: 'bg-red-100',    text: 'text-red-800',    label: 'Over Budget' },
  open:          { bg: 'bg-amber-100',  text: 'text-amber-800',  label: 'Open' },
  resolved:      { bg: 'bg-green-100',  text: 'text-green-800',  label: 'Resolved' },
  mitigated:     { bg: 'bg-blue-100',   text: 'text-blue-700',   label: 'Mitigated' },
  closed:        { bg: 'bg-gray-100',   text: 'text-gray-500',   label: 'Closed' },
};

const healthDots: Record<string, string> = {
  on_track:  'bg-green-500',
  at_risk:   'bg-amber-500',
  off_track: 'bg-red-500',
  complete:  'bg-blue-500',
};

export function StatusBadge({ status }: { status: string }) {
  const s = statusStyles[status] ?? { bg: 'bg-gray-100', text: 'text-gray-600', label: status };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  );
}

export function HealthDot({ health }: { health: string }) {
  const dot = healthDots[health] ?? 'bg-gray-400';
  const label = statusStyles[health]?.label ?? health;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`w-2.5 h-2.5 rounded-full ${dot}`} />
      <span className="text-sm">{label}</span>
    </span>
  );
}

export function formatAED(amount: number) {
  return `AED ${amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}
