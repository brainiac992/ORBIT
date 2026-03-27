import { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth.js';
import { trpc } from '../lib/trpc.js';

const navItems: Record<string, { label: string; icon: string; path: string }[]> = {
  gm: [
    { label: 'Portfolio', icon: '📊', path: '/dashboard/gm' },
  ],
  pmo: [
    { label: 'Dashboard', icon: '📊', path: '/dashboard/pmo' },
    { label: 'Approvals', icon: '✅', path: '/approvals' },
    { label: 'Activity', icon: '⏱', path: '/activity' },
    { label: 'Configuration', icon: '⚙', path: '/admin/config' },
  ],
  pm: [
    { label: 'Overview', icon: '🏠', path: '/dashboard/pm' },
    { label: 'Activity', icon: '⏱', path: '/activity' },
  ],
};

const ventureTabs = [
  { label: 'Plan', icon: '📋', suffix: 'plan' },
  { label: 'Gantt', icon: '📐', suffix: 'gantt' },
  { label: 'Resources', icon: '👥', suffix: 'resources' },
  { label: 'Budget', icon: '💰', suffix: 'budget' },
  { label: 'Progress', icon: '📈', suffix: 'progress' },
  { label: 'Risks', icon: '⚡', suffix: 'risks' },
];

export function Shell() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  if (!user) return null;

  const items = navItems[user.role] ?? [];

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-60 bg-[var(--surface-0)] border-e border-[var(--border)] flex flex-col no-print">
        <div className="px-5 py-5 border-b border-[var(--border)]">
          <div className="text-lg font-bold text-[var(--text-0)] tracking-tight">ORBIT</div>
          <div className="text-[10px] text-[var(--text-3)] uppercase tracking-widest mt-0.5">ADRES PMO</div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {items.map(item => {
            const active = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  active
                    ? 'bg-[var(--accent-dim)] text-[var(--accent-hover)]'
                    : 'text-[var(--text-2)] hover:text-[var(--text-0)] hover:bg-[var(--surface-1)]'
                }`}
              >
                <span className="text-base">{item.icon}</span>
                {item.label}
              </button>
            );
          })}

          {user.role !== 'gm' && <VenturesList />}
        </nav>

        <div className="px-3 py-4 border-t border-[var(--border)]">
          <div className="flex items-center gap-3 px-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-[var(--accent-dim)] flex items-center justify-center text-sm font-semibold text-[var(--accent-hover)]">
              {user.name.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-[var(--text-0)] truncate">{user.name}</div>
              <div className="text-[10px] text-[var(--text-3)] uppercase">{user.role}</div>
            </div>
          </div>
          <button
            onClick={() => { setUser(null); navigate('/login'); }}
            className="w-full px-3 py-2 rounded-xl text-xs text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--surface-1)] transition-all"
          >
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}

function VenturesList() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  // PMO sees all ventures, PM sees their own via the pm dashboard query
  const { data: pmoData } = trpc.dashboard.pmo.useQuery(undefined, { enabled: user?.role === 'pmo' });
  const { data: pmData } = trpc.dashboard.pm.useQuery(undefined, { enabled: user?.role === 'pm' });

  const ventures = user?.role === 'pmo'
    ? (pmoData?.ventures ?? []).map(v => ({ id: v.id, name: v.name }))
    : pmData?.venture
      ? [{ id: pmData.venture.id, name: pmData.venture.name }]
      : [];

  // Track which ventures are expanded
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Which venture is currently active in the URL?
  const match = location.pathname.match(/\/venture\/([^/]+)/);
  const activeVentureId = match?.[1];

  // Auto-expand when navigating into a venture
  useEffect(() => {
    if (activeVentureId && !expanded[activeVentureId]) {
      setExpanded(prev => ({ ...prev, [activeVentureId]: true }));
    }
  }, [activeVentureId]);

  if (ventures.length === 0) return null;

  const toggleExpand = (id: string) => {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="mt-4 pt-4 border-t border-[var(--border)]">
      <div className="px-3 mb-2 text-[10px] text-[var(--text-3)] uppercase tracking-widest">Ventures</div>
      {ventures.map(v => {
        const isExpanded = !!expanded[v.id];
        const isActive = v.id === activeVentureId;
        return (
          <div key={v.id}>
            <button
              onClick={() => toggleExpand(v.id)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all ${
                isActive
                  ? 'text-[var(--text-0)] font-medium'
                  : 'text-[var(--text-2)] hover:text-[var(--text-0)] hover:bg-[var(--surface-1)]'
              }`}
            >
              <span className={`text-[10px] transition-transform ${isExpanded ? 'rotate-90' : ''}`}>&#9654;</span>
              <span className="truncate">{v.name}</span>
            </button>
            {isExpanded && (
              <div className="ms-3 border-s border-[var(--border)] ps-1 mb-1">
                {ventureTabs.map(tab => {
                  const path = `/venture/${v.id}/${tab.suffix}`;
                  const tabActive = location.pathname === path;
                  return (
                    <button
                      key={tab.suffix}
                      onClick={() => navigate(path)}
                      className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-xs transition-all ${
                        tabActive
                          ? 'bg-[var(--accent-dim)] text-[var(--accent-hover)] font-medium'
                          : 'text-[var(--text-2)] hover:text-[var(--text-0)] hover:bg-[var(--surface-1)]'
                      }`}
                    >
                      <span className="text-xs">{tab.icon}</span>
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
