import { ArrowDownLeft, ArrowUpRight, Plus, WalletCards } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { DashboardRecentTransactions, transactionTitle } from '../components/DashboardRecentTransactions';
import { ExpenseCapture } from '../components/ExpenseCapture';
import { ExpenseDetail } from '../components/ExpenseDetail';
import { CATEGORY_LABELS, INCOME_CATEGORY_LABELS, MonthlyReport, type ReportFlowType } from '../components/MonthlyReport';
import { isInReportRange, reportRange, reportRangeLabel, type ReportPeriod } from '../components/reportPeriod';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { api, type CalendarEvent, type Transaction, type Wallet } from '../services/api';
import './dashboard.css';

const amountFormat = new Intl.NumberFormat('vi-VN');
const flowFormat = new Intl.NumberFormat('vi-VN', { signDisplay: 'exceptZero' });

export function DashboardPage() {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [detail, setDetail] = useState<CalendarEvent | null>(null);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedFlowType, setSelectedFlowType] = useState<ReportFlowType>('all');
  const [selectedIncomeCategory, setSelectedIncomeCategory] = useState('all');
  const [selectedPeriod, setSelectedPeriod] = useState<ReportPeriod | null>(null);
  const today = todayKey();
  const dateRange = useMemo(() => selectedPeriod ? reportRange(selectedPeriod, today) : null, [selectedPeriod, today]);
  const requestVersion = useRef(0);
  useAutoRefresh(() => load());

  const recentTransactions = useMemo(() => transactions
    .filter(tx => {
      if (dateRange && !isInReportRange(tx.dateKey, dateRange)) return false;
      if (selectedFlowType === 'income') return tx.type === 'income' && (selectedIncomeCategory === 'all' || tx.categoryId === selectedIncomeCategory);
      if (selectedFlowType === 'expense') return tx.type === 'expense' && (selectedCategory === 'all' || tx.categoryId === selectedCategory);
      return selectedCategory === 'all' || (tx.type === 'expense' && tx.categoryId === selectedCategory);
    })
    .sort((a, b) => b.dateKey.localeCompare(a.dateKey) || (b.transactionTime ?? '').localeCompare(a.transactionTime ?? '') || (b.createdAt ?? '').localeCompare(a.createdAt ?? '')),
  [transactions, selectedCategory, selectedFlowType, selectedIncomeCategory, dateRange]);

  const recentFlowLabel = selectedFlowType === 'income'
    ? `Tiền vào${selectedIncomeCategory === 'all' ? '' : ` · ${INCOME_CATEGORY_LABELS[selectedIncomeCategory] ?? 'Thu khác'}`}`
    : selectedFlowType === 'expense'
      ? `Tiền ra${selectedCategory === 'all' ? '' : ` · ${CATEGORY_LABELS[selectedCategory] ?? 'Khác'}`}`
      : selectedCategory === 'all' ? '' : `Chi · ${CATEGORY_LABELS[selectedCategory] ?? 'Khác'}`;
  const recentFilterLabel = dateRange ? `${recentFlowLabel} · ${reportRangeLabel(dateRange)}` : recentFlowLabel;

  const clearRecentFilter = () => {
    setSelectedCategory('all');
    setSelectedFlowType('all');
    setSelectedIncomeCategory('all');
    setSelectedPeriod(null);
  };

  const load = async () => {
    const version = ++requestVersion.current;
    try {
      const [w, t] = await Promise.all([api.wallets(), api.transactions()]);
      if (version !== requestVersion.current) return;
      setWallets(w.wallets);
      setTransactions(t.transactions);
    } catch {
      // Ignore load errors
    }
  };

  useEffect(() => {
    void load();
    return () => { requestVersion.current++; };
  }, []);

  const stats = useMemo(() => {
    const totalBalance = wallets.reduce((sum, w) => sum + w.balance, 0);
    const income = transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    const expense = transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    return { totalBalance, income, expense, net: income - expense };
  }, [wallets, transactions]);

  const openDetail = (row: Transaction) => {
    setDetail({
      ...row,
      kind: row.type,
      title: transactionTitle(row),
      source: row.source ?? 'manual',
    });
  };

  return (
    <div className="dashboard-page">
      <header className="dashboard-header">
        <h1>Thống kê</h1>
        <button type="button" className="dashboard-add" onClick={() => setCaptureOpen(true)}>
          <Plus size={17} aria-hidden="true" /> Ghi thu chi
        </button>
      </header>

      <section className="dashboard-overview" aria-label="Tổng quan tài chính">
        <div className="metric-card dashboard-balance">
          <div className="dashboard-balance-title">
            <span>Tổng số dư ví</span>
            <WalletCards size={21} aria-hidden="true" />
          </div>
          <strong className="dashboard-money">{amountFormat.format(stats.totalBalance)} <span>₫</span></strong>
          <p>{wallets.length} ví đang hoạt động</p>
          <div className="dashboard-net">
            <span>Dòng tiền ròng</span>
            <span className="dashboard-net-value" data-flow={stats.net < 0 ? 'expense' : stats.net > 0 ? 'income' : undefined}>
              {flowFormat.format(stats.net)} ₫
            </span>
          </div>
        </div>
        <div className="metric-card dashboard-flows">
          <div data-flow="income">
            <span className="dashboard-flow-label"><ArrowDownLeft size={16} aria-hidden="true" /> Tổng thu nhập</span>
            <strong className="dashboard-money">{flowFormat.format(stats.income)} <span>₫</span></strong>
          </div>
          <div data-flow="expense">
            <span className="dashboard-flow-label"><ArrowUpRight size={16} aria-hidden="true" /> Tổng chi tiêu</span>
            <strong className="dashboard-money">{flowFormat.format(-stats.expense)} <span>₫</span></strong>
          </div>
        </div>
      </section>

      <MonthlyReport
        transactions={transactions}
        selectedCategory={selectedCategory}
        flowType={selectedFlowType}
        incomeCategory={selectedIncomeCategory}
        selectedPeriod={selectedPeriod}
        dateRange={dateRange}
        today={today}
        onPeriodChange={setSelectedPeriod}
        onCategoryChange={setSelectedCategory}
        onFilterChange={({ flowType, categoryId }) => {
          if (flowType !== selectedFlowType) setSelectedPeriod(null);
          setSelectedFlowType(flowType);
          setSelectedIncomeCategory(flowType === 'income' ? categoryId : 'all');
        }}
      />

      <DashboardRecentTransactions
        key={JSON.stringify([selectedFlowType, selectedCategory, selectedIncomeCategory, dateRange?.from, dateRange?.to])}
        transactions={recentTransactions}
        today={today}
        filterLabel={recentFilterLabel}
        onClearFilter={clearRecentFilter}
        onOpen={openDetail}
        onAdd={() => setCaptureOpen(true)}
      />

      {detail && (
        <ExpenseDetail
          event={detail}
          wallets={wallets}
          onClose={() => setDetail(null)}
          onChanged={() => {
            setDetail(null);
            void load();
          }}
        />
      )}

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

function todayKey() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
