import { useParams } from 'react-router-dom';
import { trpc } from '../lib/trpc.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { useMemo, useState } from 'react';

export function GanttPage() {
  const { ventureId } = useParams<{ ventureId: string }>();
  const { data: ganttData, isLoading } = trpc.gantt.data.useQuery({ ventureId: ventureId! });
  const [zoom, setZoom] = useState<'week' | 'month'>('week');

  if (isLoading) return <div className="p-8 text-[var(--text-3)]">Loading Gantt chart...</div>;
  if (!ganttData || ganttData.workstreams.length === 0) {
    return (
      <div className="p-12 text-center">
        <div className="text-4xl mb-4">📐</div>
        <h2 className="text-lg font-semibold text-[var(--text-0)] mb-2">No Plan Data</h2>
        <p className="text-sm text-[var(--text-3)]">Add workstreams and milestones to see the Gantt chart.</p>
      </div>
    );
  }

  const { workstreams, milestones, dependencies, dateRange } = ganttData;

  // Build timeline columns
  const startDate = new Date(dateRange.start);
  const endDate = new Date(dateRange.end);
  const totalDays = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));

  // Generate period headers
  const periods = useMemo(() => {
    const result: { label: string; startDay: number; span: number }[] = [];
    const cur = new Date(startDate);
    while (cur <= endDate) {
      const periodStart = Math.max(0, Math.ceil((cur.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
      if (zoom === 'week') {
        const label = `W${getWeekNum(cur)}`;
        result.push({ label, startDay: periodStart, span: 7 });
        cur.setDate(cur.getDate() + 7);
      } else {
        const label = cur.toLocaleDateString('en', { month: 'short', year: '2-digit' });
        const daysInMonth = new Date(cur.getFullYear(), cur.getMonth() + 1, 0).getDate();
        result.push({ label, startDay: periodStart, span: daysInMonth });
        cur.setMonth(cur.getMonth() + 1);
        cur.setDate(1);
      }
    }
    return result;
  }, [dateRange, zoom]);

  const dayWidth = zoom === 'week' ? 18 : 6;
  const chartWidth = totalDays * dayWidth;
  const today = new Date();
  const todayOffset = Math.ceil((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

  const statusColor: Record<string, string> = {
    not_started: 'bg-gray-500/40',
    in_progress: 'bg-indigo-500',
    complete: 'bg-emerald-500',
    on_hold: 'bg-amber-500/60',
  };

  const msStatusColor: Record<string, string> = {
    upcoming: 'bg-blue-400',
    achieved: 'bg-emerald-400',
    overdue: 'bg-amber-400',
    deferred: 'bg-gray-400',
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-bold text-[var(--text-0)]">Gantt Chart</h3>
        <div className="flex gap-1 bg-[var(--surface-1)] rounded-xl p-1">
          <button onClick={() => setZoom('week')} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${zoom === 'week' ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-2)]'}`}>Week</button>
          <button onClick={() => setZoom('month')} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${zoom === 'month' ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-2)]'}`}>Month</button>
        </div>
      </div>

      <div className="bg-[var(--surface-0)] rounded-2xl border border-[var(--border)] overflow-hidden">
        <div className="flex">
          {/* Labels column */}
          <div className="w-56 flex-shrink-0 border-e border-[var(--border)]">
            <div className="h-10 border-b border-[var(--border)] bg-[var(--surface-1)] px-4 flex items-center">
              <span className="text-[10px] text-[var(--text-3)] uppercase tracking-widest">Workstream</span>
            </div>
            {workstreams.map((ws: any) => (
              <div key={ws.id}>
                <div className="h-10 border-b border-[var(--border)] px-4 flex items-center gap-2">
                  <span className="text-sm text-[var(--text-0)] font-medium truncate">{ws.name}</span>
                  <span className="text-[10px] text-[var(--text-3)] ltr-num">{ws.completionPct}%</span>
                </div>
                {/* Milestone rows under each workstream */}
                {milestones.filter((m: any) => m.workstreamId === ws.id).map((ms: any) => (
                  <div key={ms.id} className="h-8 border-b border-[var(--border)] px-4 ps-8 flex items-center gap-2">
                    <span className="text-xs text-[var(--text-2)] truncate">◆ {ms.name}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Chart area */}
          <div className="flex-1 overflow-x-auto">
            <div style={{ width: chartWidth, minWidth: '100%' }}>
              {/* Period headers */}
              <div className="h-10 border-b border-[var(--border)] bg-[var(--surface-1)] flex relative">
                {periods.map((p, i) => (
                  <div
                    key={i}
                    className="flex-shrink-0 border-e border-[var(--border)] flex items-center justify-center text-[10px] text-[var(--text-3)] uppercase tracking-wider"
                    style={{ width: p.span * dayWidth }}
                  >
                    {p.label}
                  </div>
                ))}
              </div>

              {/* Workstream bars */}
              <div className="relative">
                {/* Today line */}
                {todayOffset > 0 && todayOffset < totalDays && (
                  <div
                    className="absolute top-0 bottom-0 w-px bg-red-500/50 z-10"
                    style={{ left: todayOffset * dayWidth }}
                  >
                    <div className="absolute -top-0 -translate-x-1/2 text-[8px] bg-red-500 text-white px-1 rounded-b">Today</div>
                  </div>
                )}

                {workstreams.map((ws: any) => {
                  const wsStart = ws.baselineStart ? daysBetween(startDate, new Date(ws.actualStart || ws.baselineStart)) : 0;
                  const wsEnd = ws.baselineEnd ? daysBetween(startDate, new Date(ws.actualEnd || ws.baselineEnd)) : wsStart + 30;
                  const barLeft = Math.max(0, wsStart) * dayWidth;
                  const barWidth = Math.max(1, (wsEnd - Math.max(0, wsStart))) * dayWidth;

                  const wsMilestones = milestones.filter((m: any) => m.workstreamId === ws.id);

                  return (
                    <div key={ws.id}>
                      {/* Workstream bar row */}
                      <div className="h-10 border-b border-[var(--border)] relative">
                        {/* Background grid */}
                        <div className="absolute inset-0 flex">
                          {periods.map((p, i) => (
                            <div key={i} className="flex-shrink-0 border-e border-[var(--border)] opacity-30" style={{ width: p.span * dayWidth }} />
                          ))}
                        </div>
                        {/* Bar */}
                        <div
                          className={`absolute top-2 h-6 rounded-lg ${statusColor[ws.status] ?? 'bg-indigo-500'} transition-all`}
                          style={{ left: barLeft, width: barWidth }}
                        >
                          {/* Completion overlay */}
                          <div
                            className="h-full rounded-lg bg-white/20"
                            style={{ width: `${ws.completionPct}%` }}
                          />
                        </div>
                      </div>

                      {/* Milestone diamond rows */}
                      {wsMilestones.map((ms: any) => {
                        const msDay = daysBetween(startDate, new Date(ms.dueDate));
                        return (
                          <div key={ms.id} className="h-8 border-b border-[var(--border)] relative">
                            <div className="absolute inset-0 flex">
                              {periods.map((p, i) => (
                                <div key={i} className="flex-shrink-0 border-e border-[var(--border)] opacity-30" style={{ width: p.span * dayWidth }} />
                              ))}
                            </div>
                            <div
                              className={`absolute top-2 w-4 h-4 rotate-45 rounded-sm ${msStatusColor[ms.status] ?? 'bg-blue-400'}`}
                              style={{ left: msDay * dayWidth - 8 }}
                              title={`${ms.name} — ${ms.dueDate}`}
                            />
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-6 mt-4 text-xs text-[var(--text-3)]">
        <span className="flex items-center gap-2"><span className="w-3 h-3 rounded bg-indigo-500" /> In Progress</span>
        <span className="flex items-center gap-2"><span className="w-3 h-3 rounded bg-emerald-500" /> Complete</span>
        <span className="flex items-center gap-2"><span className="w-3 h-3 rounded bg-gray-500/40" /> Not Started</span>
        <span className="flex items-center gap-2"><span className="w-3 h-3 rounded bg-amber-500/60" /> On Hold</span>
        <span className="flex items-center gap-2"><span className="w-4 h-4 rotate-45 rounded-sm bg-blue-400" style={{ transform: 'rotate(45deg) scale(0.6)' }} /> Milestone</span>
      </div>
    </div>
  );
}

function daysBetween(a: Date, b: Date) {
  return Math.ceil((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function getWeekNum(d: Date) {
  const start = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - start.getTime()) / 86400000 + 1) / 7);
}
