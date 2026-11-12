import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, BarChart3, ChevronsUpDown, CircleDollarSign, Plus, WalletCards } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ExpenseCapture } from '../components/ExpenseCapture';
import { CATEGORY_LABELS, MonthlyReport } from '../components/MonthlyReport';
import { useAuth } from '../contexts/AuthContext';
import { api, type Transaction, type Wallet } from '../services/api';

export function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const name = user?.name.split(' ').slice(-1)[0] ?? 'bạn';
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const recentListRef = useRef<HTMLDivElement>(null);
  const [scrollEdges, setScrollEdges] = useState({ above: false, below: false });

  const recentTransactions = useMemo(() => transactions
    .filter(tx => selectedCategory === 'all' || (tx.type === 'expense' && tx.categoryId === selectedCategory))
    .sort((a, b) => b.dateKey.localeCompare(a.dateKey) || (b.transactionTime ?? '').localeCompare(a.transactionTime ?? '') || (b.createdAt ?? '').localeCompare(a.createdAt ?? '')),
  [transactions, selectedCategory]);

  useEffect(() => {
    const list = recentListRef.current;
    if (!list) return;
    list.scrollTo({ top: 0, behavior: 'instant' });
    const updateEdges = () => {
      const above = list.scrollTop > 2;
      const below = list.scrollTop + list.clientHeight < list.scrollHeight - 2;
      setScrollEdges(previous => previous.above === above && previous.below === below ? previous : { above, below });
    };
    updateEdges();
    list.addEventListener('scroll', updateEdges, { passive: true });
    const resizeObserver = new ResizeObserver(updateEdges);
    resizeObserver.observe(list);
    const rows = list.querySelectorAll('.cm-recent-row');
    const revealObserver = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-visible');
        revealObserver?.unobserve(entry.target);
      }
    }, { root: list, threshold: 0.1 }) : null;
    for (const row of rows) {
      if (revealObserver) revealObserver.observe(row);
      else row.classList.add('is-visible');
    }
    return () => {
      list.removeEventListener('scroll', updateEdges);
      resizeObserver.disconnect();
      revealObserver?.disconnect();
    };
  }, [recentTransactions]);

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

      <MonthlyReport transactions={transactions} selectedCategory={selectedCategory} onCategoryChange={setSelectedCategory} />

      <section className="panel recent-panel" style={{ marginTop: 16 }}>
        <div className="panel-head">
          <div>
            <h2>Giao dịch gần đây</h2>
            <p aria-live="polite">{selectedCategory === 'all' ? `${recentTransactions.length} hoạt động đã ghi nhận` : `${recentTransactions.length} khoản chi · ${CATEGORY_LABELS[selectedCategory] ?? 'Khác'}`}</p>
          </div>
          <button className="text-button" onClick={() => navigate('/app/transactions')}>
            Xem tất cả
          </button>
        </div>
        {selectedCategory !== 'all' && (
          <div className="cm-recent-active-filter"><span>Danh mục: {CATEGORY_LABELS[selectedCategory] ?? 'Khác'}</span><button type="button" onClick={() => setSelectedCategory('all')}>Xem tất cả danh mục</button></div>
        )}
        {recentTransactions.length ? (
          <>
          <div
            ref={recentListRef}
            className={`transaction-table cm-recent-scroll ${scrollEdges.above ? 'has-more-above' : ''} ${scrollEdges.below ? 'has-more-below' : ''}`}
            role="region"
            aria-label="Danh sách giao dịch gần đây"
            tabIndex={0}
          >
            {recentTransactions.map(row => (
              <button type="button" className="transaction-row cm-recent-row" key={row.id} onClick={() => navigate('/app/transactions')}>
                <span className={`transaction-image ${row.imageUrl ? 'has-image' : row.type}`}>
                  {row.imageUrl ? (
                    <img src={row.imageUrl} alt="" />
                  ) : row.type === 'income' ? (
                    <ArrowDownLeft size={16} />
                  ) : row.type === 'expense' ? (
                    <ArrowUpRight size={16} />
                  ) : (
                    <ArrowLeftRight size={16} />
                  )}
                </span>
                <span className="transaction-main">
                  <strong>{row.note || (row.type === 'income' ? 'Thu nhập' : row.type === 'expense' ? 'Chi tiêu' : 'Chuyển tiền')}</strong>
                  <small>{row.type === 'income' ? 'Thu nhập' : row.type === 'transfer' ? 'Chuyển tiền' : CATEGORY_LABELS[row.categoryId] ?? 'Khác'} · {row.dateKey}{row.transactionTime ? ` · ${row.transactionTime.slice(0, 5)}` : ''}</small>
                </span>
                <span className={`transaction-amount ${row.type}`}>
                  {row.type === 'income' ? '+' : row.type === 'expense' ? '−' : ''}
                  {row.amount.toLocaleString('vi-VN')} ₫
                </span>
              </button>
            ))}
          </div>
          {(scrollEdges.above || scrollEdges.below) && <p className="cm-recent-scroll-hint"><ChevronsUpDown size={14} /> Cuộn để xem các giao dịch khác</p>}
          </>
        ) : (
          <div className="recent-empty">
            <div className="empty-circle">
              <WalletCards size={22} />
            </div>
            <div>
              <strong>{selectedCategory === 'all' ? 'Chưa có giao dịch nào' : `Chưa có khoản chi ${CATEGORY_LABELS[selectedCategory] ?? 'Khác'}`}</strong>
              <p>{selectedCategory === 'all' ? 'Mọi khoản thu chi của bạn sẽ xuất hiện ở đây.' : 'Chọn danh mục khác hoặc thêm khoản chi mới.'}</p>
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
