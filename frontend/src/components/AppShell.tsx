import { Home, PieChart, UserRound, WalletCards, X } from 'lucide-react';
import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useBankRealtime, type BankEvent } from '../hooks/useBankRealtime';

const dockItems = [
  { label: 'Trang chủ', icon: Home, to: '/app', matchPaths: ['/app', '/app/calendar'] },
  { label: 'Thống kê', icon: PieChart, to: '/app/dashboard', matchPaths: ['/app/dashboard'] },
  { label: 'Ví', icon: WalletCards, to: '/app/transactions', matchPaths: ['/app/transactions'] },
  { label: 'Cá nhân', icon: UserRound, to: '/app/settings', matchPaths: ['/app/settings'] },
];

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const activeIndex = dockItems.findIndex(item => item.matchPaths.includes(location.pathname));
  const [bankEvent, setBankEvent] = useState<BankEvent | null>(null);
  const onTransaction = useCallback((event: BankEvent) => setBankEvent(event), []);
  useBankRealtime(onTransaction);
  useEffect(() => {
    if (!bankEvent) return;
    const timer = setTimeout(() => setBankEvent(null), 8000);
    return () => clearTimeout(timer);
  }, [bankEvent]);

  return (
    <div className="cm-app-shell">
      <main className="cm-app-content">{children}</main>
      {bankEvent && <div className="bank-notification-toast" role="status" aria-live="polite">
        <Link to="/app/transactions" onClick={() => setBankEvent(null)}>
          <strong>MB Bank · {bankEvent.type === 'income' ? 'Nhận tiền' : 'Chuyển tiền'}</strong>
          <span>{bankEvent.type === 'income' ? '+' : '−'}{bankEvent.amount.toLocaleString('vi-VN')} ₫</span>
        </Link>
        <button type="button" aria-label="Đóng thông báo" onClick={() => setBankEvent(null)}><X size={18} /></button>
      </div>}

      <nav
        className="cm-bottom-dock"
        aria-label="Điều hướng chính"
        style={{ '--cm-dock-count': dockItems.length, '--cm-dock-index': Math.max(0, activeIndex) } as CSSProperties}
      >
        <span className="cm-dock-highlight" aria-hidden="true" hidden={activeIndex < 0} />
        {dockItems.map(({ label, icon: Icon, to, matchPaths }) => {
          const isActive = matchPaths.includes(location.pathname);
          return (
            <NavLink
              key={to}
              to={to}
              end={to === '/app'}
              className={`cm-dock-item ${isActive ? 'active' : ''}`}
              aria-label={label}
              aria-current={isActive ? 'page' : undefined}
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
