import { ArrowDownLeft, ArrowUpRight, BarChart3, CircleDollarSign, Plus, WalletCards } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ExpenseCapture } from '../components/ExpenseCapture';
import { MonthlyReport } from '../components/MonthlyReport';
import { useAuth } from '../contexts/AuthContext';
import { api, type Transaction, type Wallet } from '../services/api';

export function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const name = user?.name.split(' ').slice(-1)[0] ?? 'bạn';
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [captureOpen, setCaptureOpen] = useState(false);

  const load = async () => {
    try {
      const [w, t] = await Promise.all([api.wallets(), api.transactions()]);
      setWallets(w.wallets);
      setTransactions(t.transactions);
    } catch {
      // Ignore load errors
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const stats = useMemo(() => {
    const totalBalance = wallets.reduce((sum, w) => sum + w.balance, 0);
    const income = transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    const expense = transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    return { totalBalance, income, expense, net: income - expense };
  }, [wallets, transactions]);

  return (
    <div className="dashboard-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow dark">THỐNG KÊ TÀI CHÍNH</p>
          <h1>
            Chào {name}, <em>bức tranh dòng tiền</em>
          </h1>
          <p className="page-subtitle">Tổng hợp số dư các ví và biến động thu chi của bạn.</p>
        </div>
        <button className="add-calendar-button" onClick={() => setCaptureOpen(true)}>
          <Plus size={16} /> Ghi thu chi
        </button>
      </div>

      <div className="metric-grid" style={{ marginTop: 20 }}>
        <Metric
          label="Tổng số dư ví"
          value={`${stats.totalBalance.toLocaleString('vi-VN')} ₫`}
          icon={<CircleDollarSign size={19} />}
          tone="green"
          note={`${wallets.length} ví đang hoạt động`}
        />
        <Metric
          label="Tổng thu nhập"
          value={`+${stats.income.toLocaleString('vi-VN')} ₫`}
          icon={<ArrowDownLeft size={19} />}
          tone="blue"
          note="Các khoản thu đã ghi nhận"
        />
        <Metric
          label="Tổng chi tiêu"
          value={`−${stats.expense.toLocaleString('vi-VN')} ₫`}
          icon={<ArrowUpRight size={19} />}
          tone="sand"
          note="Các khoản chi đã ghi nhận"
        />
        <Metric
          label="Dòng tiền ròng"
          value={`${stats.net.toLocaleString('vi-VN')} ₫`}
          icon={<BarChart3 size={19} />}
          tone="pink"
          note="Thu nhập − chi tiêu"
        />
      </div>

      <MonthlyReport transactions={transactions} />

      <section className="panel recent-panel" style={{ marginTop: 16 }}>
        <div className="panel-head">
          <div>
            <h2>Giao dịch gần đây</h2>
            <p>{transactions.length} hoạt động đã ghi nhận</p>
          </div>
          <button className="text-button" onClick={() => navigate('/app/transactions')}>
            Xem tất cả
          </button>
        </div>
        {transactions.length ? (
          <div className="transaction-table">
            {transactions.slice(0, 8).map(row => (
              <div className="transaction-row" key={row.id} onClick={() => navigate('/app/transactions')}>
                <span className={`transaction-image ${row.imageUrl ? 'has-image' : row.type}`}>
                  {row.imageUrl ? (
                    <img src={row.imageUrl} alt="" />
                  ) : row.type === 'income' ? (
                    <ArrowDownLeft size={16} />
                  ) : (
                    <ArrowUpRight size={16} />
                  )}
                </span>
                <span className="transaction-main">
                  <strong>{row.note || (row.type === 'income' ? 'Thu nhập' : 'Chi tiêu')}</strong>
                  <small>{row.dateKey}</small>
                </span>
                <span className={`transaction-amount ${row.type}`}>
                  {row.type === 'income' ? '+' : '−'}
                  {row.amount.toLocaleString('vi-VN')} ₫
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="recent-empty">
            <div className="empty-circle">
              <WalletCards size={22} />
            </div>
            <div>
              <strong>Chưa có giao dịch nào</strong>
              <p>Mọi khoản thu chi của bạn sẽ xuất hiện ở đây.</p>
            </div>
            <button className="outline-button small" onClick={() => setCaptureOpen(true)}>
              Thêm giao dịch
            </button>
          </div>
        )}
      </section>

      {captureOpen && (
        <ExpenseCapture
          selectedDate={todayKey()}
          initialType="expense"
          onClose={() => setCaptureOpen(false)}
          onSaved={() => {
            setCaptureOpen(false);
            void load();
          }}
        />
      )}
    </div>
  );
}

function Metric({ label, value, icon, tone, note }: { label: string; value: string; icon: ReactNode; tone: string; note: string }) {
  return (
    <div className={`metric-card tone-${tone}`}>
      <div className="metric-top">
        <span>{label}</span>
        <i>{icon}</i>
      </div>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}

function todayKey() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
