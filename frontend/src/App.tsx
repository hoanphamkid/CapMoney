import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { AuthPage, RequireAuth } from './pages/AuthPage';
import { DashboardPage } from './pages/DashboardPage';
import { CalendarPage } from './pages/CalendarPage';
import { WalletsPage } from './pages/WalletsPage';
import { TransactionsPage } from './pages/TransactionsPage';
import { SettingsPage } from './pages/SettingsPage';

export function App() { return <Routes><Route path="/login" element={<AuthPage mode="login" />} /><Route path="/register" element={<AuthPage mode="register" />} /><Route path="/app/*" element={<RequireAuth><AppShell><Routes><Route index element={<DashboardPage />} /><Route path="calendar" element={<CalendarPage />} /><Route path="wallets" element={<WalletsPage />} /><Route path="transactions" element={<TransactionsPage />} /><Route path="settings" element={<SettingsPage />} /><Route path="*" element={<Navigate to="/app" replace />} /></Routes></AppShell></RequireAuth>} /><Route path="*" element={<Navigate to="/login" replace />} /></Routes>; }
