import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

interface User {
  id: string;
  name: string;
  email: string;
  role: 'gm' | 'pmo' | 'pm';
  azureOid: string;
}

interface AuthContextType {
  user: User | null;
  setUser: (u: User | null) => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType>({ user: null, setUser: () => {}, isLoading: true });

// Dev mode: pick a user from seed data. In production this would be MSAL.
const DEV_USERS: User[] = [
  { id: '1', name: 'General Manager', email: 'gm@adres.ae', role: 'gm', azureOid: 'seed-gm-001' },
  { id: '2', name: 'PMO Lead', email: 'pmo@adres.ae', role: 'pmo', azureOid: 'seed-pmo-001' },
  { id: '3', name: 'Omar Shawahneh', email: 'omar@adres.ae', role: 'pm', azureOid: 'seed-pm-001' },
  { id: '4', name: 'Hannah Wray', email: 'hannah@adres.ae', role: 'pm', azureOid: 'seed-pm-002' },
  { id: '5', name: 'Test PM', email: 'testpm@adres.ae', role: 'pm', azureOid: 'seed-pm-003' },
];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('adres-pmo-user');
    if (stored) {
      setUser(JSON.parse(stored));
    }
    setIsLoading(false);
  }, []);

  const handleSetUser = (u: User | null) => {
    setUser(u);
    if (u) localStorage.setItem('adres-pmo-user', JSON.stringify(u));
    else localStorage.removeItem('adres-pmo-user');
  };

  return (
    <AuthContext.Provider value={{ user, setUser: handleSetUser, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() { return useContext(AuthContext); }
export { DEV_USERS };
export type { User };
