import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { logout, onAuthChange, refreshSession, type AuthUser } from '../lib/authClient';

interface AuthState {
  /** The signed-in user, or null */
  user: AuthUser | null;
  username: string | null;
  /** True until we know whether there is a sign-in to resume (a refresh cookie from an earlier visit) */
  isLoading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let live = true;
    const stop = onAuthChange(next => { if (live) { setUser(next); if (next) setIsLoading(false); } });   // someone signed in: no need to wait for the resume check
    // Resume the sign-in from an earlier visit, if the browser still has its refresh cookie
    refreshSession()
      .then(resumed => { if (live) setUser(resumed); })
      .catch(() => { /* the server could not be reached: stay signed out */ })
      .finally(() => { if (live) setIsLoading(false); });
    return () => { live = false; stop(); };
  }, []);

  const value = useMemo<AuthState>(() => ({ user, username: user?.username ?? null, isLoading, signOut: logout }), [user, isLoading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
