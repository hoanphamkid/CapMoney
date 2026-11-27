import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import type { MeResponse, Profile, ProfileUpdate, User } from '../types/auth';
import type { ProCheckout } from '../constants/pro';
import { api } from '../services/api';
import { disableBankPush } from '../services/bankNotifications';

type AuthContextValue = {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  login: (input: { email: string; password: string; remember: boolean }) => Promise<User>;
  register: (input: { name: string; email: string; password: string; phone?: string }) => Promise<User>;
  logout: () => Promise<void>;
  updateProfile: (input: ProfileUpdate) => Promise<void>;
  loadProCheckout: (createOrder?: boolean) => Promise<ProCheckout>;
};
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [account, setAccount] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const userId = account?.user.id;

  useEffect(() => {
    let active = true;
    void api.me()
      .then(result => { if (active) setAccount(current => current ?? result); })
      .catch(() => {})
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const loadProCheckout = useCallback(async (createOrder = false) => {
    const checkout = await api.proCheckout(createOrder);
    if (checkout.status === 'paid') {
      setAccount(current => current && current.user.id === userId
        ? { ...current, user: { ...current.user, proEnabled: true } }
        : current);
    }
    return checkout;
  }, [userId]);

  const value = useMemo<AuthContextValue>(() => ({
    user: account?.user ?? null,
    profile: account?.profile ?? null,
    loading,
    login: async input => {
      const result = await api.login(input);
      setAccount({ user: result.user, profile: result.profile ?? null });
      return result.user;
    },
    register: async input => {
      const result = await api.register(input);
      setAccount({ user: result.user, profile: result.profile ?? null });
      return result.user;
    },
    logout: async () => {
      await disableBankPush().catch(() => {});
      await api.logout();
      setAccount(null);
    },
    updateProfile: async input => {
      const result = await api.updateMe(input);
      setAccount(current => current?.user.id === result.user.id
        ? { ...result, user: { ...result.user, proEnabled: result.user.proEnabled || current.user.proEnabled } }
        : current);
    },
    loadProCheckout,
  }), [account, loading, loadProCheckout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
