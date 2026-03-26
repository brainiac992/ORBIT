import { useNavigate } from 'react-router-dom';
import { useAuth, DEV_USERS } from '../lib/auth.js';

export function LoginPage() {
  const { setUser } = useAuth();
  const navigate = useNavigate();

  const handleLogin = (user: (typeof DEV_USERS)[0]) => {
    setUser(user);
    const routes: Record<string, string> = {
      gm: '/dashboard/gm',
      pmo: '/dashboard/pmo',
      pm: '/dashboard/pm',
    };
    navigate(routes[user.role] ?? '/');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--surface-muted)]">
      <div className="bg-white rounded-xl shadow-sm border border-[var(--border)] p-10 w-full max-w-md text-center">
        <h1 className="text-2xl font-semibold mb-1">ADRES PMO</h1>
        <p className="text-sm text-[var(--text-secondary)] mb-8">Sign in to continue</p>

        {/* Production: Single SSO button */}
        {/* <button>Sign in with ADRES</button> */}

        {/* Dev mode: user picker */}
        <div className="space-y-3">
          <p className="text-xs text-[var(--text-secondary)] uppercase tracking-wide">Development Mode — Select User</p>
          {DEV_USERS.map(u => (
            <button
              key={u.azureOid}
              onClick={() => handleLogin(u)}
              className="w-full flex items-center justify-between px-4 py-3 rounded-lg border border-[var(--border)] hover:border-[var(--accent)] hover:bg-blue-50 transition-colors"
            >
              <div className="text-start">
                <div className="text-sm font-medium">{u.name}</div>
                <div className="text-xs text-[var(--text-secondary)]">{u.email}</div>
              </div>
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full uppercase">
                {u.role}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
