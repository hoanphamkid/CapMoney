import { AlertTriangle, ArrowRight, CalendarDays, Check, ChevronDown, LayoutGrid, Minus, Plus, Sparkles, Sun, Wallet, X } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { Transaction } from '../services/api';
import './spending-limit.css';

export type BudgetConfig = {
  monthlyLimit: number;
  dailyLimit: number;
  categoryLimits: Record<string, number>;
};

const BUDGET_STORAGE_KEY = 'capmoney_budget_v1';

const defaultBudget: BudgetConfig = {
  monthlyLimit: 5_000_000,
  dailyLimit: 200_000,
  categoryLimits: {
    food: 2_000_000,
    shopping: 1_000_000,
    beauty: 750_000,
    household: 600_000,
    transport: 500_000,
    bills: 1_000_000,
    entertainment: 500_000,
  },
};

export function loadBudget(): BudgetConfig {
  try {
    const raw = localStorage.getItem(BUDGET_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<BudgetConfig>;
      return {
        monthlyLimit: parsed.monthlyLimit ?? defaultBudget.monthlyLimit,
        dailyLimit: parsed.dailyLimit ?? defaultBudget.dailyLimit,
        categoryLimits: { ...defaultBudget.categoryLimits, ...(parsed.categoryLimits ?? {}) },
      };
    }
  } catch {
    // Ignore storage read errors
  }
  return defaultBudget;
}

export function saveBudget(config: BudgetConfig) {
  localStorage.setItem(BUDGET_STORAGE_KEY, JSON.stringify(config));
}

const categoryLabels: Record<string, string> = {
  food: 'Ăn uống',
  shopping: 'Mua sắm',
  transport: 'Di chuyển',
  bills: 'Hóa đơn',
  entertainment: 'Giải trí',
  beauty: 'Làm đẹp',
  household: 'Gia vị & đồ dùng nhà',
};

const monthlyPresets = [1_000_000, 2_000_000, 3_000_000, 5_000_000, 8_000_000, 10_000_000, 15_000_000];
const dailyPresets = [50_000, 100_000, 150_000, 200_000, 300_000, 500_000];
const categoryPresets = [100_000, 200_000, 500_000, 1_000_000, 2_000_000, 3_000_000];
const categoryShares: Record<string, number> = { food: 0.3, shopping: 0.15, beauty: 0.15, household: 0.1, transport: 0.1, bills: 0.1, entertainment: 0.1 };

const budgetSections = [
  { id: 'month', label: 'Tháng', Icon: CalendarDays },
  { id: 'day', label: 'Ngày', Icon: Sun },
  { id: 'categories', label: 'Danh mục', Icon: LayoutGrid },
] as const;

function money(amount: number) {
  return `${amount.toLocaleString('vi-VN')} ₫`;
}

function usagePercent(spent: number, limit: number) {
  return limit > 0 ? Math.max(0, Math.round((spent / limit) * 100)) : 0;
}

function presetLabel(amount: number) {
  return amount >= 1_000_000 ? `${(amount / 1_000_000).toLocaleString('vi-VN')} triệu` : `${(amount / 1000).toLocaleString('vi-VN')} nghìn`;
}

function AmountPicker({ label, value, step, minimum, presets, onChange }: {
  label: string;
  value: number;
  step: number;
  minimum: number;
  presets: number[];
  onChange: (amount: number) => void;
}) {
  return (
    <div className="cm-budget-amount-picker" role="group" aria-label={label}>
      <div className="cm-budget-stepper">
        <output aria-label={label}>{money(value)}</output>
        <div className="cm-budget-stepper-buttons">
          <button type="button" disabled={value <= minimum} onClick={() => onChange(Math.max(minimum, value - step))} aria-label={`Giảm ${label.toLowerCase()} ${presetLabel(step)}`}>
            <Minus size={18} />
          </button>
          <button type="button" disabled={value >= 1_000_000_000_000} onClick={() => onChange(Math.min(1_000_000_000_000, value + step))} aria-label={`Tăng ${label.toLowerCase()} ${presetLabel(step)}`}>
            <Plus size={18} />
          </button>
        </div>
      </div>
      <div className="cm-budget-presets">
        {presets.map(preset => <button key={preset} type="button" aria-pressed={value === preset} onClick={() => onChange(preset)}>{presetLabel(preset)}</button>)}
      </div>
    </div>
  );
}

type SpendingLimitModalProps = {
  transactions: Transaction[];
  todayExpense: number;
  monthExpense: number;
  onClose: () => void;
  onSaved: (config: BudgetConfig) => void;
};

export function SpendingLimitModal({
  transactions,
  todayExpense,
  monthExpense,
  onClose,
  onSaved,
}: SpendingLimitModalProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [initial] = useState(loadBudget);
  const [activeSection, setActiveSection] = useState<(typeof budgetSections)[number]['id']>('month');
  const [numMonthly, setMonthlyLimit] = useState(initial.monthlyLimit);
  const [numDaily, setDailyLimit] = useState(initial.dailyLimit);
  const [catLimits, setCatLimits] = useState<Record<string, number>>(initial.categoryLimits);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [saveError, setSaveError] = useState('');
  const [autoNotice, setAutoNotice] = useState('');

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  const closeDialog = () => {
    dialog.current?.close();
    onClose();
  };

  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const currentDay = Math.max(1, now.getDate());
  const remainingDays = Math.max(1, daysInMonth - currentDay + 1);
  const remainingMonthlyBudget = Math.max(0, numMonthly - monthExpense);
  const safeDailySpend = Math.round(remainingMonthlyBudget / remainingDays);
  const projectedMonthSpend = Math.round((monthExpense / currentDay) * daysInMonth);

  const monthPercent = usagePercent(monthExpense, numMonthly);
  const dayPercent = usagePercent(todayExpense, numDaily);
  const monthOverage = monthExpense - numMonthly;
  const dayOverage = todayExpense - numDaily;
  const monthTone = monthOverage > 0 ? 'over' : monthPercent >= 75 ? 'near' : 'within';
  const categoryTotal = Object.keys(categoryLabels).reduce((sum, id) => sum + (catLimits[id] ?? 0), 0);

  const distributeBudget = () => {
    const entries = Object.entries(categoryShares);
    let allocated = 0;
    const limits = Object.fromEntries(entries.map(([id, share], index) => {
      const amount = index === entries.length - 1 ? numMonthly - allocated : Math.floor(numMonthly * share);
      allocated += amount;
      return [id, amount];
    }));
    setDailyLimit(Math.max(1000, Math.round(numMonthly / daysInMonth / 1000) * 1000));
    setCatLimits(previous => ({ ...previous, ...limits }));
    setAutoNotice('Đã cập nhật hạn mức ngày và từng danh mục.');
  };

  // Compute category spending for the current month
  const catSpend: Record<string, number> = {};
  for (const tx of transactions) {
    if (tx.type === 'expense') {
      catSpend[tx.categoryId] = (catSpend[tx.categoryId] ?? 0) + tx.amount;
    }
  }

  const handleSave = () => {
    const nextConfig: BudgetConfig = {
      monthlyLimit: numMonthly,
      dailyLimit: numDaily,
      categoryLimits: catLimits,
    };
    try {
      saveBudget(nextConfig);
    } catch {
      setSaveError('Không thể lưu hạn mức trên thiết bị. Vui lòng thử lại.');
      return;
    }
    dialog.current?.close();
    onSaved(nextConfig);
  };

  return (
    <dialog
      ref={dialog}
      className="cm-budget-modal"
      aria-labelledby="cm-budget-title"
      onCancel={event => {
        event.preventDefault();
        closeDialog();
      }}
      onClick={event => {
        if (event.target === event.currentTarget) closeDialog();
      }}
    >
      <div className="cm-budget-sheet">
        <header className="cm-budget-header">
          <span className="cm-budget-heading-icon"><Wallet size={21} aria-hidden="true" /></span>
          <h2 id="cm-budget-title">Ngân sách chi tiêu</h2>
          <button className="cm-budget-close" type="button" aria-label="Đóng" onClick={closeDialog}>
            <X size={20} />
          </button>
        </header>

        <div className="cm-budget-body">
          <section className="cm-budget-overview" aria-label="Tổng quan chi tiêu" data-tone={monthTone}>
            <div className="cm-budget-overview-main">
              <div className="cm-budget-month-figures">
                <p>Đã chi trong tháng</p>
                <strong>{money(monthExpense)}</strong>
                <small>Hạn mức {money(numMonthly)}</small>
              </div>
              <div
                className="cm-budget-ring"
                style={{ '--budget-progress': `${Math.min(monthPercent, 100)}%` } as CSSProperties}
              >
                <strong>{monthPercent.toLocaleString('vi-VN')}%</strong>
                <small>đã dùng</small>
              </div>
            </div>

            <div className="cm-budget-month-status">
              {monthOverage > 0 ? <AlertTriangle size={15} aria-hidden="true" /> : <CalendarDays size={15} aria-hidden="true" />}
              <span>
                {monthOverage > 0
                  ? `Vượt hạn mức ${money(monthOverage)}`
                  : `Có thể chi ${money(safeDailySpend)}/ngày`}
              </span>
            </div>

            <dl className="cm-budget-overview-details">
              <div data-tone={dayOverage > 0 ? 'over' : dayPercent >= 75 ? 'near' : 'within'}>
                <dt className="cm-budget-today-label">
                  <span>Đã chi hôm nay</span>
                  <strong>{dayPercent.toLocaleString('vi-VN')}%</strong>
                </dt>
                <dd>{money(todayExpense)}</dd>
                <dd className="cm-budget-detail-muted">Hạn mức {money(numDaily)}</dd>
                <dd className="cm-budget-track" aria-hidden="true"><span style={{ width: `${Math.min(dayPercent, 100)}%` }} /></dd>
              </div>
              <div>
                <dt>Dự báo cuối tháng</dt>
                <dd>~{money(projectedMonthSpend)}</dd>
                <dd className="cm-budget-detail-muted">{remainingDays} ngày còn lại</dd>
              </div>
            </dl>
          </section>

          <div className="cm-budget-segments" role="group" aria-label="Chọn hạn mức để chỉnh">
            {budgetSections.map(({ id, label, Icon }) => (
              <button key={id} type="button" aria-pressed={activeSection === id} aria-controls="cm-budget-editor" onClick={() => setActiveSection(id)}>
                <Icon size={16} aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>

          <section className="cm-budget-editor" id="cm-budget-editor" aria-labelledby="cm-budget-editor-title">
            {activeSection === 'month' && (
              <>
                <h3 id="cm-budget-editor-title">Hạn mức tháng</h3>
                <AmountPicker label="Hạn mức tháng" value={numMonthly} step={500_000} minimum={100_000} presets={monthlyPresets} onChange={amount => { setMonthlyLimit(amount); setAutoNotice(''); }} />
                <button type="button" className="cm-budget-auto-plan" onClick={distributeBudget}>
                  <Sparkles size={18} aria-hidden="true" />
                  <span>Tự chia ngày & danh mục</span>
                  <ArrowRight size={17} aria-hidden="true" />
                </button>
                <div className="cm-budget-auto-notice" role="status">{autoNotice}</div>
              </>
            )}

            {activeSection === 'day' && (
              <>
                <h3 id="cm-budget-editor-title">Hạn mức ngày</h3>
                <AmountPicker label="Hạn mức ngày" value={numDaily} step={10_000} minimum={1000} presets={dailyPresets} onChange={setDailyLimit} />
              </>
            )}

            {activeSection === 'categories' && (
              <>
                <h3 id="cm-budget-editor-title">Hạn mức theo danh mục</h3>
                <div className="cm-budget-category-total" data-tone={categoryTotal > numMonthly ? 'over' : 'within'}>
                  <span>Tổng đã phân bổ</span>
                  <strong>{money(categoryTotal)}</strong>
                  {categoryTotal > numMonthly && <small>Vượt hạn mức tháng {money(categoryTotal - numMonthly)}.</small>}
                </div>
                <div className="cm-budget-category-list">
                  {Object.entries(categoryLabels).map(([catId, label]) => {
                    const spent = catSpend[catId] ?? 0;
                    const limit = catLimits[catId] ?? 1_000_000;
                    const percent = usagePercent(spent, limit);
                    const expanded = expandedCategory === catId;
                    return (
                      <div key={catId} className="cm-budget-category" data-tone={spent > limit ? 'over' : percent >= 80 ? 'near' : 'within'}>
                        <button type="button" className="cm-budget-category-toggle" aria-expanded={expanded} aria-controls={`cm-budget-category-${catId}`} onClick={() => setExpandedCategory(expanded ? null : catId)}>
                          <span>
                            <strong>{label}</strong>
                            <small>Đã chi {money(spent)} ({percent.toLocaleString('vi-VN')}%)</small>
                          </span>
                          <strong>{money(limit)}</strong>
                          <ChevronDown size={16} aria-hidden="true" />
                        </button>
                        <div className="cm-budget-track" aria-hidden="true">
                          <span style={{ width: `${Math.min(percent, 100)}%` }} />
                        </div>
                        <div id={`cm-budget-category-${catId}`} className="cm-budget-category-options" hidden={!expanded}>
                          {expanded && <AmountPicker label={`Hạn mức ${label.toLowerCase()}`} value={limit} step={50_000} minimum={1} presets={categoryPresets} onChange={amount => setCatLimits(prev => ({ ...prev, [catId]: amount }))} />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </section>
        </div>

        <footer className="cm-budget-footer">
          {saveError && <p role="alert">{saveError}</p>}
          <button type="button" onClick={handleSave}>
            <Check size={19} aria-hidden="true" /> Lưu hạn mức
          </button>
        </footer>
      </div>
    </dialog>
  );
}
