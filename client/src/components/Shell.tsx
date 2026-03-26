import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth.js';

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

        <nav className="flex-1 px-3 py-4 space-y-1">
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

          {/* Venture tabs for PM — shown when on a venture route */}
          {user.role !== 'gm' && <VentureNav />}
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

function VentureNav() {
  const location = useLocation();
  const navigate = useNavigate();

  // Extract ventureId from URL
  const match = location.pathname.match(/\/venture\/([^/]+)/);
  const ventureId = match?.[1];
  if (!ventureId) return null;

  const tabs = [
    { label: 'Plan', icon: '📋', path: `/venture/${ventureId}/plan` },
    { label: 'Gantt', icon: '📐', path: `/venture/${ventureId}/gantt` },
    { label: 'Resources', icon: '👥', path: `/venture/${ventureId}/resources` },
    { label: 'Budget', icon: '💰', path: `/venture/${ventureId}/budget` },
    { label: 'Progress', icon: '📈', path: `/venture/${ventureId}/progress` },
    { label: 'Risks', icon: '⚡', path: `/venture/${ventureId}/risks` },
  ];

  return (
    <div className="mt-4 pt-4 border-t border-[var(--border)]">
      <div className="px-3 mb-2 text-[10px] text-[var(--text-3)] uppercase tracking-widest">Venture</div>
      {tabs.map(tab => {
        const active = location.pathname === tab.path;
        return (
          <button
            key={tab.path}
            onClick={() => navigate(tab.path)}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all ${
              active
                ? 'bg-[var(--accent-dim)] text-[var(--accent-hover)] font-medium'
                : 'text-[var(--text-2)] hover:text-[var(--text-0)] hover:bg-[var(--surface-1)]'
            }`}
          >
            <span className="text-sm">{tab.icon}</span>
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
