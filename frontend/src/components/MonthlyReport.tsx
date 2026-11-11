import { ChevronLeft, ChevronRight, Download, TrendingDown, TrendingUp } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Transaction } from '../services/api';
import { loadBudget } from './SpendingLimitModal';

const CATEGORY_LABELS: Record<string, string> = {
  food: 'Ăn uống',
  shopping: 'Mua sắm',
  transport: 'Di chuyển',
  bills: 'Hóa đơn',
  entertainment: 'Giải trí',
  health: 'Sức khỏe',
  other: 'Khác',
};

const CATEGORY_COLORS = ['#e06d64', '#f0a35e', '#e7cf5b', '#5fc278', '#4aa8d8', '#9b7bff', '#d977b8', '#8d96ab'];

function monthKey(year: number, month: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

function money(value: number) {
  return `${value.toLocaleString('vi-VN')} ₫`;
}

export function MonthlyReport({ transactions }: { transactions: Transaction[] }) {
  const now = new Date();
  const [cursor, setCursor] = useState(new Date(now.getFullYear(), now.getMonth(), 1));
  const budget = useMemo(() => loadBudget(), []);

  const report = useMemo(() => {
    const key = monthKey(cursor.getFullYear(), cursor.getMonth());
    const prev = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1);
    const prevKey = monthKey(prev.getFullYear(), prev.getMonth());

    let income = 0;
    let expense = 0;
    let prevExpense = 0;
    const byCategory: Record<string, number> = {};
    const monthTxs: Transaction[] = [];

    for (const tx of transactions) {
      const k = tx.dateKey.slice(0, 7);
      if (k === prevKey && tx.type === 'expense') prevExpense += tx.amount;
      if (k !== key) continue;
      monthTxs.push(tx);
      if (tx.type === 'income') income += tx.amount;
      else if (tx.type === 'expense') {
        expense += tx.amount;
        byCategory[tx.categoryId] = (byCategory[tx.categoryId] ?? 0) + tx.amount;
      }
    }

    const categories = Object.entries(byCategory)
      .sort((a, b) => b[1] - a[1])
      .map(([id, amount], i) => ({
        id,
        amount,
        pct: expense > 0 ? (amount / expense) * 100 : 0,
        color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
        limit: budget.categoryLimits[id] ?? 0,
      }));

    // 6-month trend ending at the selected month
    const trend = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(cursor.getFullYear(), cursor.getMonth() - (5 - i), 1);
      const k = monthKey(d.getFullYear(), d.getMonth());
      let inc = 0;
      let exp = 0;
      for (const tx of transactions) {
        if (tx.dateKey.slice(0, 7) !== k) continue;
        if (tx.type === 'income') inc += tx.amount;
        else if (tx.type === 'expense') exp += tx.amount;
      }
      return { label: `T${d.getMonth() + 1}`, income: inc, expense: exp };
    });

    const today = new Date();
    const isCurrent = cursor.getFullYear() === today.getFullYear() && cursor.getMonth() === today.getMonth();
    const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const daysPassed = isCurrent ? today.getDate() : daysInMonth;
    const daysLeft = isCurrent ? daysInMonth - today.getDate() : 0;
    const dailyAvg = Math.round(expense / Math.max(1, daysPassed));
    const projected = isCurrent ? Math.round(dailyAvg * daysInMonth) : expense;
    const remaining = budget.monthlyLimit - expense;
    const safePerDay = daysLeft > 0 ? Math.max(0, Math.floor(remaining / daysLeft)) : 0;

    return {
      key,
      income,
      expense,
      prevExpense,
      categories,
      trend,
      monthTxs,
      isCurrent,
      daysLeft,
      dailyAvg,
      projected,
      remaining,
      safePerDay,
    };
  }, [transactions, cursor, budget]);

  const donut = useMemo(() => {
    if (report.categories.length === 0) return 'conic-gradient(#2a2d38 0 100%)';
    let acc = 0;
    const stops = report.categories.map(c => {
      const start = acc;
      acc += c.pct;
      return `${c.color} ${start}% ${acc}%`;
    });
    return `conic-gradient(${stops.join(', ')})`;
  }, [report.categories]);

  const diff = report.expense - report.prevExpense;
  const diffPct = report.prevExpense > 0 ? Math.round((diff / report.prevExpense) * 100) : null;
  const maxTrend = Math.max(1, ...report.trend.map(t => Math.max(t.income, t.expense)));
  const budgetPct = budget.monthlyLimit > 0 ? Math.min(100, (report.expense / budget.monthlyLimit) * 100) : 0;
  const budgetState = budgetPct >= 100 ? 'over' : budgetPct >= 80 ? 'warn' : 'ok';

  const exportCsv = () => {
    const header = 'Ngày,Loại,Danh mục,Ghi chú,Số tiền';
    const rows = report.monthTxs
      .slice()
      .sort((a, b) => a.dateKey.localeCompare(b.dateKey))
      .map(tx =>
        [
          tx.dateKey,
          tx.type === 'income' ? 'Thu' : tx.type === 'expense' ? 'Chi' : 'Chuyển',
          CATEGORY_LABELS[tx.categoryId] ?? 'Khác',
          `"${(tx.note || '').replace(/"/g, '""')}"`,
          tx.amount,
        ].join(','),
      );
    const blob = new Blob(['\ufeff' + [header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `capmoney-${report.key}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="panel cm-report" style={{ marginTop: 16 }}>
      <div className="panel-head">
        <div>
          <h2>Báo cáo chi tiêu tháng</h2>
          <p>Phân tích theo danh mục, so sánh và dự báo</p>
        </div>
        <button type="button" className="outline-button small" onClick={exportCsv}>
          <Download size={14} /> CSV
        </button>
      </div>

      <div className="cm-report-month">
        <button type="button" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} aria-label="Tháng trước">
          <ChevronLeft size={16} />
        </button>
        <strong>
          Tháng {cursor.getMonth() + 1}/{cursor.getFullYear()}
        </strong>
        <button type="button" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} aria-label="Tháng sau">
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="cm-report-summary">
        <div>
          <small>Tổng chi</small>
          <strong className="expense-text">−{money(report.expense)}</strong>
        </div>
        <div>
          <small>Tổng thu</small>
          <strong className="income-text">+{money(report.income)}</strong>
        </div>
        <div>
          <small>Tiết kiệm được</small>
          <strong>{money(report.income - report.expense)}</strong>
        </div>
      </div>

      <div className={`cm-report-compare ${diff > 0 ? 'up' : 'down'}`}>
        {diff > 0 ? <TrendingUp size={15} /> : <TrendingDown size={15} />}
        {report.prevExpense === 0
          ? 'Chưa có dữ liệu tháng trước để so sánh.'
          : `${diff > 0 ? 'Chi nhiều hơn' : 'Chi ít hơn'} tháng trước ${money(Math.abs(diff))}${diffPct !== null ? ` (${diff > 0 ? '+' : ''}${diffPct}%)` : ''}`}
      </div>

      <div className="cm-report-budget">
        <div className="cm-report-budget-head">
          <span>Hạn mức tháng: {money(budget.monthlyLimit)}</span>
          <b className={budgetState}>{Math.round(budgetPct)}%</b>
        </div>
        <div className="cm-report-bar">
          <span className={budgetState} style={{ width: `${budgetPct}%` }} />
        </div>
        {budgetState === 'over' && <p className="cm-report-alert over">Đã vượt hạn mức tháng {money(Math.abs(report.remaining))}!</p>}
        {budgetState === 'warn' && <p className="cm-report-alert warn">Đã dùng trên 80% hạn mức, còn {money(report.remaining)}.</p>}
        {report.isCurrent && budgetState !== 'over' && (
          <p className="cm-report-hint">
            Còn {report.daysLeft} ngày: nên chi tối đa <b>{money(report.safePerDay)}</b>/ngày. Dự báo cuối tháng:{' '}
            <b>{money(report.projected)}</b>
            {report.projected > budget.monthlyLimit ? ' (vượt hạn mức)' : ''}.
          </p>
        )}
      </div>

      <div className="cm-report-donut-row">
        <div className="cm-report-donut" style={{ background: donut }}>
          <span>
            <small>Tổng chi</small>
            <b>{report.expense >= 1_000_000 ? `${(report.expense / 1_000_000).toFixed(1)}tr` : `${Math.round(report.expense / 1000)}k`}</b>
          </span>
        </div>
        <ul className="cm-report-legend">
          {report.categories.length === 0 && <li>Chưa có khoản chi nào trong tháng này.</li>}
          {report.categories.map(c => (
            <li key={c.id}>
              <i style={{ background: c.color }} />
              <span>{CATEGORY_LABELS[c.id] ?? 'Khác'}</span>
              <b>{Math.round(c.pct)}%</b>
              <small className={c.limit > 0 && c.amount > c.limit ? 'over' : ''}>
                {money(c.amount)}
                {c.limit > 0 && c.amount > c.limit ? ' ⚠' : ''}
              </small>
            </li>
          ))}
        </ul>
      </div>

      <div className="cm-report-trend">
        <strong>Xu hướng 6 tháng</strong>
        <div className="cm-report-trend-bars">
          {report.trend.map(t => (
            <div key={t.label}>
              <div className="cm-report-trend-pair">
                <span className="inc" style={{ height: `${Math.max(3, (t.income / maxTrend) * 80)}px` }} />
                <span className="exp" style={{ height: `${Math.max(3, (t.expense / maxTrend) * 80)}px` }} />
              </div>
              <small>{t.label}</small>
            </div>
          ))}
        </div>
        <div className="cm-report-trend-legend">
          <span>
            <i className="inc" /> Thu
          </span>
          <span>
            <i className="exp" /> Chi
          </span>
        </div>
      </div>
    </section>
  );
}
