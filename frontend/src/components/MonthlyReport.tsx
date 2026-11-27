import { ChevronLeft, ChevronRight, Download, TrendingDown, TrendingUp } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Transaction } from '../services/api';
import { CATEGORY_LABELS as SHARED_CATEGORY_LABELS, INCOME_CATEGORY_LABELS as SHARED_INCOME_CATEGORY_LABELS } from '../constants/categories';
import { loadBudget } from './SpendingLimitModal';
import { isInReportRange, offsetReportDay, REPORT_PERIODS, reportRange, reportRangeLabel, type ReportPeriod, type ReportRange } from './reportPeriod';

export const CATEGORY_LABELS: Record<string, string> = {
  food: 'Ăn uống',
  shopping: 'Mua sắm',
  transport: 'Di chuyển',
  bills: 'Hóa đơn',
  entertainment: 'Giải trí',
  health: 'Sức khỏe',
  other: 'Khác',
};

const CATEGORY_COLORS: Record<string, string> = {
  food: '#e06d64', shopping: '#f0a35e', beauty: '#ed8eb7', household: '#d4a86a', skincare: '#e7a6c2', makeup: '#c995e8',
  haircare: '#b68a67', bodycare: '#78c8ba', fragrance: '#a994e8', nails: '#f18c9a', transport: '#4aa8d8', bills: '#5fc278',
  entertainment: '#9b7bff', health: '#d977b8', other: '#e7cf5b',
};

const INCOME_CATEGORY_LABELS: Record<string, string> = {
  salary: 'Lương',
  bonus: 'Thưởng',
  investment: 'Đầu tư',
  gift: 'Được tặng',
  other: 'Thu khác',
};

export { INCOME_CATEGORY_LABELS };
Object.assign(CATEGORY_LABELS, SHARED_CATEGORY_LABELS);
Object.assign(INCOME_CATEGORY_LABELS, SHARED_INCOME_CATEGORY_LABELS);
export type ReportFlowType = 'all' | 'expense' | 'income';

const INCOME_CATEGORY_COLORS: Record<string, string> = {
  salary: '#5fc278',
  bonus: '#7bb7ef',
  investment: '#b38cf3',
  gift: '#e7cf5b',
  other: '#d977b8',
};

function monthKey(year: number, month: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

function money(value: number) {
  return `${value.toLocaleString('vi-VN')} ₫`;
}

export function MonthlyReport({
  transactions, selectedCategory, flowType, incomeCategory, selectedPeriod, dateRange, today,
  onCategoryChange, onFilterChange, onPeriodChange,
}: {
  transactions: Transaction[];
  selectedCategory: string;
  flowType: ReportFlowType;
  incomeCategory: string;
  selectedPeriod: ReportPeriod | null;
  dateRange: ReportRange | null;
  today: string;
  onPeriodChange: (period: ReportPeriod | null) => void;
  onCategoryChange: (category: string) => void;
  onFilterChange?: (filter: { flowType: ReportFlowType; categoryId: string }) => void;
}) {
  const [cursor, setCursor] = useState(() => new Date(`${today.slice(0, 7)}-01T12:00:00`));
  const budget = useMemo(() => loadBudget(), []);

  const report = useMemo(() => {
    const key = monthKey(cursor.getFullYear(), cursor.getMonth());
    const prev = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1);
    const prevKey = monthKey(prev.getFullYear(), prev.getMonth());

    let income = 0;
    let expense = 0;
    let prevExpense = 0;
    const byCategory: Record<string, number> = {};
    const reportTxs: Transaction[] = [];

    for (const tx of transactions) {
      const k = tx.dateKey.slice(0, 7);
      if (k === prevKey && tx.type === 'expense') prevExpense += tx.amount;
      if (dateRange ? !isInReportRange(tx.dateKey, dateRange) : k !== key) continue;
      if (flowType !== 'all' && tx.type !== flowType) continue;
      if (flowType === 'income' && incomeCategory !== 'all' && tx.categoryId !== incomeCategory) continue;
      if (dateRange && flowType === 'expense' && selectedCategory !== 'all' && tx.categoryId !== selectedCategory) continue;
      reportTxs.push(tx);
      if (tx.type === 'income') income += tx.amount;
      else if (tx.type === 'expense') {
        expense += tx.amount;
        byCategory[tx.categoryId] = (byCategory[tx.categoryId] ?? 0) + tx.amount;
      }
    }

    const categories = Object.entries(byCategory)
      .sort((a, b) => b[1] - a[1])
      .map(([id, amount]) => ({
        id,
        amount,
        pct: expense > 0 ? (amount / expense) * 100 : 0,
        color: CATEGORY_COLORS[id] ?? '#8d96ab',
        limit: budget.categoryLimits[id] ?? 0,
      }));

    const incomeCategories = Object.entries(
      reportTxs
        .filter(tx => tx.type === 'income')
        .reduce<Record<string, number>>((totals, tx) => {
          totals[tx.categoryId] = (totals[tx.categoryId] ?? 0) + tx.amount;
          return totals;
        }, {}),
    )
      .sort((a, b) => b[1] - a[1])
      .map(([id, amount]) => ({
        id,
        amount,
        pct: income > 0 ? (amount / income) * 100 : 0,
        color: INCOME_CATEGORY_COLORS[id] ?? '#8d96ab',
        limit: 0,
      }));

    // 6-month trend ending at the selected month
    const trend = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(cursor.getFullYear(), cursor.getMonth() - (5 - i), 1);
      const k = monthKey(d.getFullYear(), d.getMonth());
      let inc = 0;
      let exp = 0;
      for (const tx of transactions) {
        if (tx.dateKey.slice(0, 7) !== k) continue;
        if (flowType !== 'expense' && tx.type === 'income' && (flowType !== 'income' || incomeCategory === 'all' || tx.categoryId === incomeCategory)) inc += tx.amount;
        else if (flowType !== 'income' && tx.type === 'expense' && (selectedCategory === 'all' || tx.categoryId === selectedCategory)) exp += tx.amount;
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
      incomeCategories,
      trend,
      reportTxs,
      isCurrent,
      daysLeft,
      projected,
      remaining,
      safePerDay,
    };
  }, [transactions, cursor, budget, selectedCategory, flowType, incomeCategory, dateRange]);

  const categoryName = CATEGORY_LABELS[selectedCategory] ?? 'Khác';
  const visibleCategories = useMemo(() => report.categories.filter(c => selectedCategory === 'all' || c.id === selectedCategory), [report.categories, selectedCategory]);
  const visibleExpense = visibleCategories.reduce((sum, c) => sum + c.amount, 0);
  const categoryTransactions = report.reportTxs.filter(tx => tx.type === 'expense' && tx.categoryId === selectedCategory);
  const flowTotal = flowType === 'income' ? report.income : report.expense;
  const visibleBreakdown = flowType === 'income' ? report.incomeCategories : visibleCategories;
  const visibleTotal = flowType === 'income' ? report.income : visibleExpense;
  const activeCategory = flowType === 'income' ? incomeCategory : selectedCategory;
  const categoryLabels = flowType === 'income' ? INCOME_CATEGORY_LABELS : CATEGORY_LABELS;
  const activeIncomeCategoryName = incomeCategory === 'all' ? 'Tất cả tiền vào' : INCOME_CATEGORY_LABELS[incomeCategory] ?? 'Thu khác';
  const largestTransaction = report.reportTxs.reduce((largest, tx) => tx.amount > (largest?.amount ?? 0) ? tx : largest, null as Transaction | null);
  const daysInView = selectedPeriod?.days ?? new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const averagePerDay = Math.round(flowTotal / daysInView);

  const periodTotals = REPORT_PERIODS.map(period => {
    const range = reportRange(period, today);
    const category = flowType === 'income' ? incomeCategory : selectedCategory;
    const type = flowType === 'income' ? 'income' : 'expense';
    const amount = transactions.reduce((sum, tx) =>
      tx.type === type && (category === 'all' || tx.categoryId === category) && isInReportRange(tx.dateKey, range)
        ? sum + tx.amount
        : sum, 0);
    return { period, amount };
  });

  const donut = useMemo(() => {
    if (visibleBreakdown.length === 0) return 'conic-gradient(#2a2d38 0 100%)';
    let acc = 0;
    const stops = visibleBreakdown.map(c => {
      const start = acc;
      acc += (c.amount / Math.max(1, visibleTotal)) * 100;
      return `${c.color} ${start}% ${acc}%`;
    });
    return `conic-gradient(${stops.join(', ')})`;
  }, [visibleBreakdown, visibleTotal]);

  const diff = report.expense - report.prevExpense;
  const diffPct = report.prevExpense > 0 ? Math.round((diff / report.prevExpense) * 100) : null;
  const showIncomeTrend = flowType === 'income' || (flowType === 'all' && selectedCategory === 'all');
  const showExpenseTrend = flowType !== 'income';
  const trend = selectedPeriod && dateRange ? periodTrend(report.reportTxs, selectedPeriod, dateRange) : report.trend;
  const maxTrend = Math.max(1, ...trend.map(t => Math.max(showIncomeTrend ? t.income : 0, showExpenseTrend ? t.expense : 0)));
  const budgetPct = budget.monthlyLimit > 0 ? Math.min(100, (report.expense / budget.monthlyLimit) * 100) : 0;
  const budgetState = budgetPct >= 100 ? 'over' : budgetPct >= 80 ? 'warn' : 'ok';

  const changeCategory = (categoryId: string) => {
    if (flowType === 'income') onFilterChange?.({ flowType, categoryId });
    else onCategoryChange(categoryId);
  };

  const exportCsv = () => {
    const header = 'Ngày,Loại,Danh mục,Ghi chú,Số tiền';
    const rows = report.reportTxs
      .filter(tx => (flowType === 'all' || tx.type === flowType) && (selectedCategory === 'all' || (tx.type === 'expense' && tx.categoryId === selectedCategory)))
      .slice()
      .sort((a, b) => a.dateKey.localeCompare(b.dateKey))
      .map(tx =>
        [
          tx.dateKey,
          tx.type === 'income' ? 'Thu' : tx.type === 'expense' ? 'Chi' : 'Chuyển',
          tx.type === 'income' ? INCOME_CATEGORY_LABELS[tx.categoryId] ?? 'Thu khác' : CATEGORY_LABELS[tx.categoryId] ?? 'Khác',
          `"${(tx.note || '').replace(/"/g, '""')}"`,
          tx.amount,
        ].join(','),
      );
    const blob = new Blob(['\ufeff' + [header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const exportDate = dateRange ? `${dateRange.from}_${dateRange.to}` : report.key;
    const exportCategory = flowType === 'income' ? incomeCategory : selectedCategory;
    a.download = `capmoney-${exportDate}-${flowType}${exportCategory === 'all' ? '' : `-${exportCategory}`}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="panel cm-report" aria-labelledby="cm-report-title">
      <div className="panel-head">
        <h2 id="cm-report-title">{dateRange ? 'Báo cáo theo thời gian' : 'Báo cáo tháng'}</h2>
        <button type="button" className="outline-button small" onClick={exportCsv} aria-label={dateRange ? 'Xuất CSV theo thời gian đã chọn' : selectedCategory === 'all' ? 'Xuất CSV tháng này' : `Xuất CSV ${categoryName}`}>
          <Download size={14} /> CSV
        </button>
      </div>

      {dateRange ? (
        <p className="cm-report-range" aria-live="polite">{reportRangeLabel(dateRange)}</p>
      ) : <div className="cm-report-month">
        <button type="button" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} aria-label="Tháng trước">
          <ChevronLeft size={16} />
        </button>
        <strong aria-live="polite">
          Tháng {cursor.getMonth() + 1}/{cursor.getFullYear()}
        </strong>
        <button type="button" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} aria-label="Tháng sau">
          <ChevronRight size={16} />
        </button>
      </div>}

      <div className="cm-report-summary">
        <div>
          <small>Tổng thu</small>
          <strong className="income-text">+{money(report.income)}</strong>
        </div>
        <div>
          <small>Tổng chi</small>
          <strong className="expense-text">−{money(report.expense)}</strong>
        </div>
        <div>
          <small>Chênh lệch</small>
          <strong>{money(report.income - report.expense)}</strong>
        </div>
      </div>

      <div className="cm-report-flow-filter" role="group" aria-label="Lọc dòng tiền">
        <div>
          {(['all', 'expense', 'income'] as const).map(value => (
            <button key={value} type="button" aria-pressed={flowType === value} onClick={() => { onCategoryChange('all'); onFilterChange?.({ flowType: value, categoryId: 'all' }); }}>
              {value === 'all' ? 'Tất cả' : value === 'expense' ? 'Tiền ra' : 'Tiền vào'}
            </button>
          ))}
        </div>
      </div>

      <div className="cm-report-category-picker">
        <label htmlFor="cm-report-category">{flowType === 'income' ? 'Loại tiền vào' : 'Danh mục chi'}</label>
        <select
          id="cm-report-category"
          value={activeCategory}
          onChange={event => changeCategory(event.target.value)}
        >
          <option value="all">{flowType === 'income' ? 'Tất cả loại thu' : 'Tất cả danh mục'}</option>
          {Object.entries(categoryLabels).map(([id, label]) => (
            <option key={id} value={id}>{label}</option>
          ))}
        </select>
      </div>

      <div className="cm-report-insights">
        <div><small>Số giao dịch</small><strong>{report.reportTxs.length}</strong></div>
        <div><small>Khoản lớn nhất</small><strong>{largestTransaction ? money(largestTransaction.amount) : '0 ₫'}</strong></div>
        <div><small>Trung bình/ngày</small><strong>{money(averagePerDay)}</strong></div>
      </div>

      <div className="cm-report-periods" aria-label={`${flowType === 'income' ? 'Tổng tiền vào' : 'Tổng chi tiêu'} theo thời gian`}>
        <div className="cm-report-periods-heading">
          <strong>{flowType === 'income' ? 'Tổng tiền vào' : 'Tổng tiền chi tiêu'} theo thời gian</strong>
          {selectedPeriod ? (
            <button type="button" className="cm-report-period-clear" onClick={() => onPeriodChange(null)}>Bỏ lọc thời gian</button>
          ) : <span>{flowType === 'all' ? 'theo bộ lọc đang chọn' : 'Chạm để lọc đến hôm nay'}</span>}
        </div>
        <div className="cm-report-period-grid" role="group" aria-label="Lọc theo thời gian">
          {periodTotals.map(({ period, amount }) => {
            const content = (
              <>
                <small>{period.label}</small>
                <strong className={flowType === 'income' ? 'income-text' : 'expense-text'}>{money(amount)}</strong>
              </>
            );
            return flowType === 'all' ? <div key={period.days}>{content}</div> : (
              <button key={period.days} type="button" aria-pressed={selectedPeriod === period}
                title={reportRangeLabel(reportRange(period, today))}
                onClick={() => onPeriodChange(selectedPeriod === period ? null : period)}>
                {content}
              </button>
            );
          })}
        </div>
      </div>

      {!dateRange && flowType !== 'income' && (
        <>
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
        </>
      )}

      {flowType !== 'income' && selectedCategory !== 'all' && (
        <div className="cm-report-category-total" aria-live="polite">
          <div><span>Chi cho {categoryName}</span><strong>−{money(visibleExpense)}</strong></div>
          <div>
            <span>{categoryTransactions.length} khoản chi {dateRange ? 'trong khoảng đã chọn' : 'trong tháng'}</span>
            {!dateRange && <small>{report.expense > 0 ? Math.round((visibleExpense / report.expense) * 100) : 0}% tổng chi tháng này</small>}
          </div>
        </div>
      )}

      <div className="cm-report-donut-row">
        <div className="cm-report-donut" style={{ background: donut }}>
          <span>
            <small>{flowType === 'income' ? activeIncomeCategoryName : selectedCategory === 'all' ? 'Tổng chi' : categoryName}</small>
            <b>{visibleTotal >= 1_000_000 ? `${(visibleTotal / 1_000_000).toFixed(1)}tr` : `${Math.round(visibleTotal / 1000)}k`}</b>
          </span>
        </div>
        <ul className="cm-report-legend">
          {visibleBreakdown.length === 0 && <li className="cm-report-category-empty">
            Chưa có {flowType === 'income' ? (incomeCategory === 'all' ? 'tiền vào' : activeIncomeCategoryName.toLowerCase()) : (selectedCategory === 'all' ? 'khoản chi' : `khoản chi ${categoryName}`)} {dateRange ? 'trong khoảng đã chọn.' : 'trong tháng này.'}
          </li>}
          {visibleBreakdown.map(c => {
            const label = categoryLabels[c.id] ?? (flowType === 'income' ? 'Thu khác' : 'Khác');
            const selected = activeCategory === c.id;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  className="cm-report-category-row"
                  aria-label={`Lọc ${flowType === 'income' ? 'loại tiền vào' : 'danh mục'} ${label}`}
                  aria-pressed={selected}
                  onClick={() => changeCategory(selected ? 'all' : c.id)}
                >
                  <i style={{ background: c.color }} />
                  <span>{label}</span>
                  <b>{Math.round(c.pct)}%</b>
                  <small className={c.limit > 0 && c.amount > c.limit ? 'over' : ''}>
                    {money(c.amount)}
                    {c.limit > 0 && c.amount > c.limit ? ' ⚠' : ''}
                  </small>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="cm-report-trend">
        <strong>{selectedPeriod ? `Dòng tiền trong ${selectedPeriod.days} ngày` : selectedCategory === 'all' ? 'Xu hướng 6 tháng' : `Xu hướng chi ${categoryName} · 6 tháng`}</strong>
        {selectedPeriod?.days === 30 && <small>Mỗi cột gộp 5 ngày</small>}
        <div className="cm-report-trend-bars" style={{ gridTemplateColumns: `repeat(${trend.length}, minmax(0, 1fr))` }}>
          {trend.map(t => (
            <div key={t.label}>
              <div className="cm-report-trend-pair">
                {showIncomeTrend && <span className="inc" style={{ height: `${Math.max(3, (t.income / maxTrend) * 80)}px` }} />}
                {showExpenseTrend && <span className="exp" style={{ height: `${Math.max(3, (t.expense / maxTrend) * 80)}px` }} />}
              </div>
              <small>{t.label}</small>
            </div>
          ))}
        </div>
        <div className="cm-report-trend-legend">
          {showIncomeTrend && <span>
            <i className="inc" /> Thu
          </span>}
          {showExpenseTrend && <span>
            <i className="exp" /> {selectedCategory === 'all' ? 'Chi' : `Chi ${categoryName}`}
          </span>}
        </div>
      </div>
    </section>
  );
}

function periodTrend(transactions: Transaction[], period: ReportPeriod, range: ReportRange) {
  const bucketDays = period.days === 30 ? 5 : 1;
  return Array.from({ length: period.days / bucketDays }, (_, index) => {
    const from = offsetReportDay(range.from, index * bucketDays);
    const to = offsetReportDay(from, bucketDays - 1);
    let income = 0;
    let expense = 0;
    for (const tx of transactions) {
      if (!isInReportRange(tx.dateKey, { from, to })) continue;
      if (tx.type === 'income') income += tx.amount;
      if (tx.type === 'expense') expense += tx.amount;
    }
    const label = `${Number(from.slice(8))}/${Number(from.slice(5, 7))}`;
    return { label, income, expense };
  });
}
