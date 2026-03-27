const statusConfig: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  on_track:      { bg: 'bg-emerald-500/15', text: 'text-emerald-400', dot: 'bg-emerald-400', label: 'On Track' },
  at_risk:       { bg: 'bg-amber-500/15',   text: 'text-amber-400',   dot: 'bg-amber-400',   label: 'At Risk' },
  off_track:     { bg: 'bg-red-500/15',     text: 'text-red-400',     dot: 'bg-red-400',     label: 'Off Track' },
  complete:      { bg: 'bg-blue-500/15',    text: 'text-blue-400',    dot: 'bg-blue-400',    label: 'Complete' },
  planning:      { bg: 'bg-gray-500/15',    text: 'text-gray-400',    dot: 'bg-gray-400',    label: 'Planning' },
  on_hold:       { bg: 'bg-gray-500/15',    text: 'text-gray-400',    dot: 'bg-gray-400',    label: 'On Hold' },
  archived:      { bg: 'bg-gray-500/15',    text: 'text-gray-500',    dot: 'bg-gray-500',    label: 'Archived' },
  not_started:   { bg: 'bg-gray-500/15',    text: 'text-gray-400',    dot: 'bg-gray-400',    label: 'Not Started' },
  in_progress:   { bg: 'bg-emerald-500/15', text: 'text-emerald-400', dot: 'bg-emerald-400', label: 'In Progress' },
  upcoming:      { bg: 'bg-blue-500/15',    text: 'text-blue-400',    dot: 'bg-blue-400',    label: 'Upcoming' },
  achieved:      { bg: 'bg-emerald-500/15', text: 'text-emerald-400', dot: 'bg-emerald-400', label: 'Achieved' },
  overdue:       { bg: 'bg-amber-500/15',   text: 'text-amber-400',   dot: 'bg-amber-400',   label: 'Overdue' },
  deferred:      { bg: 'bg-gray-500/15',    text: 'text-gray-500',    dot: 'bg-gray-500',    label: 'Deferred' },
  within_budget: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', dot: 'bg-emerald-400', label: 'Within Budget' },
  over_budget:   { bg: 'bg-red-500/15',     text: 'text-red-400',     dot: 'bg-red-400',     label: 'Over Budget' },
  open:          { bg: 'bg-amber-500/15',   text: 'text-amber-400',   dot: 'bg-amber-400',   label: 'Open' },
  resolved:      { bg: 'bg-emerald-500/15', text: 'text-emerald-400', dot: 'bg-emerald-400', label: 'Resolved' },
  mitigated:     { bg: 'bg-blue-500/15',    text: 'text-blue-400',    dot: 'bg-blue-400',    label: 'Mitigated' },
  closed:        { bg: 'bg-gray-500/15',    text: 'text-gray-500',    dot: 'bg-gray-500',    label: 'Closed' },
  pending:       { bg: 'bg-amber-500/15',   text: 'text-amber-400',   dot: 'bg-amber-400',   label: 'Pending' },
  approved:      { bg: 'bg-emerald-500/15', text: 'text-emerald-400', dot: 'bg-emerald-400', label: 'Approved' },
  rejected:      { bg: 'bg-red-500/15',     text: 'text-red-400',     dot: 'bg-red-400',     label: 'Rejected' },
  internal:      { bg: 'bg-indigo-500/15',  text: 'text-indigo-400',  dot: 'bg-indigo-400',  label: 'Internal' },
  external:      { bg: 'bg-purple-500/15',  text: 'text-purple-400',  dot: 'bg-purple-400',  label: 'External' },
  blocker:       { bg: 'bg-red-700/20',     text: 'text-red-300',     dot: 'bg-red-700',     label: 'Blocker' },
};

export function StatusBadge({ status, size = 'sm' }: { status: string; size?: 'xs' | 'sm' }) {
  const s = statusConfig[status] ?? { bg: 'bg-gray-500/15', text: 'text-gray-400', dot: 'bg-gray-400', label: status };
  const sizeClass = size === 'xs' ? 'text-[10px] px-1.5 py-0' : 'text-xs px-2 py-0.5';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-medium ${s.bg} ${s.text} ${sizeClass}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

export function HealthDot({ health, size = 'md' }: { health: string; size?: 'sm' | 'md' | 'lg' }) {
  const s = statusConfig[health] ?? { dot: 'bg-gray-400', label: health, text: 'text-gray-400' };
  const dotSize = size === 'sm' ? 'w-2 h-2' : size === 'lg' ? 'w-4 h-4' : 'w-3 h-3';
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`rounded-full ${s.dot} ${dotSize}`} />
      <span className={`text-sm font-medium ${s.text}`}>{s.label}</span>
    </span>
  );
}

export function ProgressRing({ value, size = 64, stroke = 5, color }: { value: number; size?: number; stroke?: number; color?: string }) {
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (value / 100) * circ;
  const ringColor = color ?? (value >= 75 ? 'var(--green)' : value >= 40 ? 'var(--amber)' : 'var(--red)');

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
      <circle
        cx={size/2} cy={size/2} r={radius}
        fill="none" stroke={ringColor} strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        style={{ animation: 'ring-fill 1s ease-out forwards', transition: 'stroke-dashoffset 0.5s ease' }}
      />
    </svg>
  );
}

export function KpiCard({ label, value, sub, accent }: { label: string; value: React.ReactNode; sub?: string; accent?: string }) {
  return (
    <div className="bg-[var(--surface-0)] rounded-2xl border border-[var(--border)] p-5 hover:border-[var(--border-hover)] transition-all animate-in">
      <div className="text-xs text-[var(--text-3)] uppercase tracking-wider mb-2">{label}</div>
      <div className={`text-2xl font-bold ${accent ?? 'text-[var(--text-0)]'}`} style={{ animation: 'countUp 0.5s ease-out' }}>{value}</div>
      {sub && <div className="text-xs text-[var(--text-3)] mt-1">{sub}</div>}
    </div>
  );
}

export function formatAED(amount: number) {
  return `AED ${amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-base font-semibold text-[var(--text-0)]">{title}</h3>
      {action}
    </div>
  );
}
