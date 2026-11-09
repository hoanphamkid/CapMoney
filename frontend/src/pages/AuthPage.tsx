import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { AuthLayout } from '../components/AuthLayout';
import { AuthForm } from '../components/AuthForm';
import { useAuth } from '../contexts/AuthContext';

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const { user, loading } = useAuth();
  if (!loading && user) return <Navigate to="/app" replace />;
  return <AuthLayout mode={mode}><AuthForm mode={mode} /></AuthLayout>;
}

export function RequireAuth({ children }: { children: ReactNode }) { const { user, loading } = useAuth(); const location = useLocation(); if (loading) return <div className="page-loading"><span className="loading-mark" /></div>; if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />; return children; }
