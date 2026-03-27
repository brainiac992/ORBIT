import { useParams } from 'react-router-dom';
import { trpc } from '../lib/trpc.js';
import { useMemo, useState } from 'react';

export function GanttPage() {
  const { ventureId } = useParams<{ ventureId: string }>();
  const { data, isLoading, error } = trpc.gantt.data.useQuery({ ventureId: ventureId! });
  const [zoom, setZoom] = useState<'week' | 'month'>('week');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const periods = useMemo(() => {
    if (!data) return [];
    const start = new Date(data.ventureStartDate);
    const end = new Date(data.ventureEndDate);
    const buffered = new Date(end.getTime() + 30 * 24 * 60 * 60 * 1000);
    const result: { label: string; startDay: number; span: number }[] = [];
    const cur = new Date(start);
    while (cur <= buffered) {
      const periodStart = Math.max(0, Math.ceil((cur.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
      if (zoom === 'week') {
        const wn = Math.ceil(((cur.getTime() - new Date(cur.getFullYear(), 0, 1).getTime()) / 86400000 + 1) / 7);
        result.push({ label: `W${wn}`, startDay: periodStart, span: 7 });
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
  }, [data?.ventureStartDate, data?.ventureEndDate, zoom]);

  if (isLoading) return <div className="p-8 text-[var(--text-3)]">Loading Gantt chart...</div>;
  if (error) return <div className="p-8 text-red-400">Unable to load Gantt data.</div>;
  if (!data || data.workstreams.length === 0) {
    return (
      <div className="p-12 text-center">
        <div className="text-4xl mb-4">📐</div>
        <h2 className="text-lg font-semibold text-[var(--text-0)] mb-2">No Plan Data</h2>
        <p className="text-sm text-[var(--text-3)]">Add workstreams and milestones to see the Gantt chart.</p>
      </div>
    );
  }

  const startDate = new Date(data.ventureStartDate);
  const endDate = new Date(data.ventureEndDate);
  const bufferedEnd = new Date(endDate.getTime() + 30 * 24 * 60 * 60 * 1000);
  const totalDays = Math.max(30, Math.ceil((bufferedEnd.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));

  const dayWidth = zoom === 'week' ? 18 : 6;
  const chartWidth = totalDays * dayWidth;
  const today = new Date();
  const todayOffset = Math.ceil((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

  const toggleCollapse = (wsId: string) => {
    setCollapsed(prev => ({ ...prev, [wsId]: !prev[wsId] }));
  };

  const barColor: Record<string, string> = {
    not_started: 'bg-gray-500/50',
    in_progress: 'bg-indigo-500',
    complete: 'bg-emerald-500',
    on_hold: 'bg-amber-500/70',
  };

  const diamondColor: Record<string, string> = {
    upcoming: 'bg-blue-400',
    achieved: 'bg-emerald-400',
    overdue: 'bg-amber-400',
    deferred: 'bg-gray-500',
  };

  // Check if a row is the very last visible row in the chart
  const isLastRow = (wsIndex: number) => {
    if (wsIndex < data.workstreams.length - 1) return false;
    const ws = data.workstreams[wsIndex];
    const wsMilestones = data.milestones.filter((m: any) => m.workstreamId === ws.id);
    return collapsed[ws.id] || wsMilestones.length === 0;
  };

  const isLastMilestone = (wsIndex: number, msIndex: number, msCount: number) => {
    return wsIndex === data.workstreams.length - 1 && msIndex === msCount - 1;
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-bold text-[var(--text-0)]">Gantt Chart</h3>
        <div className="flex gap-1 bg-[var(--surface-1)] rounded-xl p-1">
          {(['week', 'month'] as const).map(z => (
            <button key={z} onClick={() => setZoom(z)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${zoom === z ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-2)]'}`}>
              {z === 'week' ? 'Week' : 'Month'}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-[var(--surface-0)] rounded-2xl border border-[var(--border)] overflow-hidden">
        <div className="flex">
          {/* Labels */}
          <div className="w-52 flex-shrink-0 border-e border-[var(--border)]">
            <div className="h-10 border-b border-[var(--border)] bg-[var(--surface-1)] px-4 flex items-center">
              <span className="text-[10px] text-[var(--text-3)] uppercase tracking-widest">Workstream</span>
            </div>
            {data.workstreams.map((ws: any, wsIdx: number) => {
              const wsMilestones = data.milestones.filter((m: any) => m.workstreamId === ws.id);
              const isOpen = !collapsed[ws.id];
              const lastWsRow = isLastRow(wsIdx);

              return (
                <div key={ws.id}>
                  <div className={`h-10 ${lastWsRow ? '' : 'border-b'} border-[var(--border)] px-4 flex items-center gap-2`}>
                    {wsMilestones.length > 0 ? (
                      <button
                        onClick={() => toggleCollapse(ws.id)}
                        className="text-[var(--text-3)] hover:text-[var(--text-1)] transition-colors w-4 text-center flex-shrink-0"
                      >
                        <span className={`inline-block text-[10px] transition-transform ${isOpen ? 'rotate-90' : ''}`}>&#9654;</span>
                      </button>
                    ) : (
                      <span className="w-4 flex-shrink-0" />
                    )}
                    <span className="text-sm text-[var(--text-0)] font-medium truncate flex-1">{ws.name}</span>
                    <span className="text-[10px] text-[var(--text-3)] ltr-num">{ws.completionPct}%</span>
                  </div>
                  {isOpen && wsMilestones.map((ms: any, msIdx: number) => {
                    const lastMs = isLastMilestone(wsIdx, msIdx, wsMilestones.length);
                    return (
                      <div key={ms.id} className={`h-8 ${lastMs ? '' : 'border-b'} border-[var(--border)] px-4 ps-10 flex items-center`}>
                        <span className="text-xs text-[var(--text-2)] truncate">&#9670; {ms.name}</span>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* Chart */}
          <div className="flex-1 overflow-x-auto">
            <div style={{ width: Math.max(chartWidth, 600), minWidth: '100%' }}>
              {/* Headers */}
              <div className="h-10 border-b border-[var(--border)] bg-[var(--surface-1)] flex">
                {periods.map((p, i) => (
                  <div key={i} className="flex-shrink-0 border-e border-[var(--border)] flex items-center justify-center text-[10px] text-[var(--text-3)] uppercase tracking-wider" style={{ width: p.span * dayWidth }}>
                    {p.label}
                  </div>
                ))}
              </div>

              {/* Bars */}
              <div className="relative">
                {todayOffset > 0 && todayOffset < totalDays && (
                  <div className="absolute top-0 bottom-0 w-px bg-red-500/50 z-10" style={{ left: todayOffset * dayWidth }}>
                    <div className="absolute -top-0 -translate-x-1/2 text-[8px] bg-red-500 text-white px-1 rounded-b">Today</div>
                  </div>
                )}

                {data.workstreams.map((ws: any, wsIdx: number) => {
                  const barLeft = Math.max(0, ws.startOffsetDays) * dayWidth;
                  const barWidth = Math.max(dayWidth, ws.durationDays * dayWidth);
                  const wsMilestones = data.milestones.filter((m: any) => m.workstreamId === ws.id);
                  const isOpen = !collapsed[ws.id];
                  const lastWsRow = isLastRow(wsIdx);

                  return (
                    <div key={ws.id}>
                      <div className={`h-10 ${lastWsRow ? '' : 'border-b'} border-[var(--border)] relative`}>
                        <div className={`absolute top-2 h-6 rounded-lg ${barColor[ws.status] ?? 'bg-indigo-500'} transition-all`} style={{ left: barLeft, width: barWidth }}>
                          <div className="h-full rounded-lg bg-white/20" style={{ width: `${ws.completionPct}%` }} />
                        </div>
                      </div>
                      {isOpen && wsMilestones.map((ms: any, msIdx: number) => {
                        const lastMs = isLastMilestone(wsIdx, msIdx, wsMilestones.length);
                        return (
                          <div key={ms.id} className={`h-8 ${lastMs ? '' : 'border-b'} border-[var(--border)] relative`}>
                            <div
                              className={`absolute top-1.5 w-4 h-4 rotate-45 rounded-sm ${diamondColor[ms.status] ?? 'bg-blue-400'}`}
                              style={{ left: Math.max(0, ms.startOffsetDays * dayWidth - 8) }}
                              title={`${ms.name}`}
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
      <div className="flex flex-wrap gap-5 mt-4 text-xs text-[var(--text-3)]">
        <span className="flex items-center gap-2"><span className="w-3 h-3 rounded bg-indigo-500" /> In Progress</span>
        <span className="flex items-center gap-2"><span className="w-3 h-3 rounded bg-emerald-500" /> Complete</span>
        <span className="flex items-center gap-2"><span className="w-3 h-3 rounded bg-gray-500/50" /> Not Started</span>
        <span className="flex items-center gap-2"><span className="w-3 h-3 rounded bg-amber-500/70" /> On Hold</span>
        <span className="flex items-center gap-2"><span className="w-3 h-3 rotate-45 rounded-sm bg-blue-400" /> Milestone</span>
        <span className="flex items-center gap-2"><span className="w-px h-4 bg-red-500" /> Today</span>
      </div>
    </div>
  );
}
