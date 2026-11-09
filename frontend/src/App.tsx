import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { AuthPage, RequireAuth } from './pages/AuthPage';
import { DashboardPage } from './pages/DashboardPage';
import { FeaturePage } from './pages/FeaturePage';
import { CalendarPage } from './pages/CalendarPage';

export function App() { return <Routes><Route path="/login" element={<AuthPage mode="login" />} /><Route path="/register" element={<AuthPage mode="register" />} /><Route path="/app/*" element={<RequireAuth><AppShell><Routes><Route index element={<DashboardPage />} /><Route path="calendar" element={<CalendarPage />} /><Route path="wallets" element={<FeaturePage />} /><Route path="transactions" element={<FeaturePage />} /><Route path="settings" element={<FeaturePage />} /><Route path="*" element={<Navigate to="/app" replace />} /></Routes></AppShell></RequireAuth>} /><Route path="*" element={<Navigate to="/login" replace />} /></Routes>; }
