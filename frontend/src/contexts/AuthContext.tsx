import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import type { User } from '../types/auth';
import { api } from '../services/api';

type AuthContextValue = { user: User | null; loading: boolean; login: (input: { email: string; password: string; remember: boolean }) => Promise<User>; register: (input: { name: string; email: string; password: string; phone?: string }) => Promise<User>; logout: () => Promise<void>; refreshUser: () => Promise<void> };
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try { setUser((await api.me()).user); }
    catch { setUser(null); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void refreshUser(); }, [refreshUser]);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    login: async input => { const result = await api.login(input); setUser(result.user); return result.user; },
    register: async input => { const result = await api.register(input); setUser(result.user); return result.user; },
    logout: async () => { await api.logout(); setUser(null); },
    refreshUser,
  }), [loading, refreshUser, user]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
