import { Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.js';

export function Shell() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = () => {
    setUser(null);
    navigate('/login');
  };

  const roleBadge: Record<string, string> = {
    gm: 'GM',
    pmo: 'PMO',
    pm: 'PM',
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white border-b border-[var(--border)] px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">ADRES PMO</h1>
        </div>
        <div className="flex items-center gap-4">
          {user && (
            <>
              <span className="text-sm text-[var(--text-secondary)]">{user.name}</span>
              <span className="text-xs bg-[var(--accent)] text-white px-2 py-0.5 rounded-full">
                {roleBadge[user.role] ?? user.role}
              </span>
              <button
                onClick={handleSignOut}
                className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                Sign Out
              </button>
            </>
          )}
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
