import { Home, PieChart, ReceiptText, UserRound } from 'lucide-react';
import type { ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';

const dockItems = [
  { label: 'Trang chủ', icon: Home, to: '/app', matchPaths: ['/app', '/app/calendar'] },
  { label: 'Thống kê', icon: PieChart, to: '/app/dashboard', matchPaths: ['/app/dashboard'] },
  { label: 'Giao dịch', icon: ReceiptText, to: '/app/transactions', matchPaths: ['/app/transactions'] },
  { label: 'Cá nhân', icon: UserRound, to: '/app/settings', matchPaths: ['/app/settings'] },
];

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation();

  return (
    <div className="cm-app-shell">
      <main className="cm-app-content">{children}</main>

      <nav className="cm-bottom-dock" aria-label="Điều hướng chính">
        {dockItems.map(({ label, icon: Icon, to, matchPaths }) => {
          const isActive = matchPaths.includes(location.pathname);
          return (
            <NavLink
              key={to}
              to={to}
              end={to === '/app'}
              className={`cm-dock-item ${isActive ? 'active' : ''}`}
              aria-label={label}
              title={label}
            >
              <Icon size={21} />
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
