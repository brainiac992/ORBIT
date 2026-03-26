import { useNavigate } from 'react-router-dom';
import { useAuth, DEV_USERS } from '../lib/auth.js';

export function LoginPage() {
  const { setUser } = useAuth();
  const navigate = useNavigate();

  const handleLogin = (user: (typeof DEV_USERS)[0]) => {
    setUser(user);
    const routes: Record<string, string> = { gm: '/dashboard/gm', pmo: '/dashboard/pmo', pm: '/dashboard/pm' };
    navigate(routes[user.role] ?? '/');
  };

  const roleMeta: Record<string, { color: string; desc: string }> = {
    gm: { color: 'from-purple-500 to-indigo-600', desc: 'Portfolio health at a glance' },
    pmo: { color: 'from-blue-500 to-cyan-600', desc: 'Cross-venture oversight' },
    pm: { color: 'from-emerald-500 to-teal-600', desc: 'Venture workspace' },
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)]">
      <div className="text-center">
        <div className="mb-10">
          <h1 className="text-5xl font-extrabold text-[var(--text-0)] tracking-tight">ORBIT</h1>
          <p className="text-sm text-[var(--text-3)] mt-2 uppercase tracking-[0.3em]">ADRES PMO Platform</p>
        </div>

        <div className="grid gap-4 w-full max-w-sm mx-auto">
          {DEV_USERS.map((u, i) => (
            <button
              key={u.azureOid}
              onClick={() => handleLogin(u)}
              className="group relative w-full text-start rounded-2xl border border-[var(--border)] bg-[var(--surface-0)] p-5 hover:border-[var(--border-hover)] hover:bg-[var(--surface-1)] transition-all animate-in"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <div className={`absolute inset-0 rounded-2xl bg-gradient-to-r ${roleMeta[u.role]?.color} opacity-0 group-hover:opacity-5 transition-opacity`} />
              <div className="relative flex items-center gap-4">
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${roleMeta[u.role]?.color} flex items-center justify-center text-white font-bold text-sm`}>
                  {u.name.charAt(0)}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-semibold text-[var(--text-0)]">{u.name}</div>
                  <div className="text-xs text-[var(--text-3)]">{roleMeta[u.role]?.desc}</div>
                </div>
                <span className="text-[10px] font-semibold text-[var(--text-3)] uppercase tracking-wider bg-[var(--surface-2)] px-2 py-1 rounded-lg">
                  {u.role}
                </span>
              </div>
            </button>
          ))}
        </div>

        <p className="text-[10px] text-[var(--text-3)] mt-8 uppercase tracking-wider">Development Mode</p>
      </div>
    </div>
  );
}
