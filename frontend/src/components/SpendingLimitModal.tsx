import { AlertTriangle, Check, ChevronDown, Flame, Minus, Plus, ShieldCheck, Sparkles, Target, TrendingUp, X } from 'lucide-react';
import { useState } from 'react';
import type { Transaction } from '../services/api';

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
  food: '🛒 Ăn uống',
  shopping: '🛍️ Mua sắm',
  transport: '🛵 Di chuyển',
  bills: '🧾 Hóa đơn',
  entertainment: '🎬 Giải trí',
};

const monthlyPresets = [1_000_000, 2_000_000, 3_000_000, 5_000_000, 8_000_000, 10_000_000, 15_000_000];
const dailyPresets = [50_000, 100_000, 150_000, 200_000, 300_000, 500_000];
const categoryPresets = [100_000, 200_000, 500_000, 1_000_000, 2_000_000, 3_000_000];
const categoryShares: Record<string, number> = { food: 0.4, shopping: 0.2, transport: 0.1, bills: 0.2, entertainment: 0.1 };

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
        <button type="button" disabled={value <= minimum} onClick={() => onChange(Math.max(minimum, value - step))} aria-label={`Giảm ${label} ${presetLabel(step)}`}>
          <Minus size={18} />
        </button>
        <output aria-label={label} aria-live="polite">{value.toLocaleString('vi-VN')}<small>đ</small></output>
        <button type="button" disabled={value >= 1_000_000_000_000} onClick={() => onChange(Math.min(1_000_000_000_000, value + step))} aria-label={`Tăng ${label} ${presetLabel(step)}`}>
          <Plus size={18} />
        </button>
      </div>
      <div className="cm-preset-row">
        {presets.map(preset => <button key={preset} type="button" className={`cm-preset-chip ${value === preset ? 'active' : ''}`} aria-pressed={value === preset} onClick={() => onChange(preset)}>{presetLabel(preset)}</button>)}
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
  const [initial] = useState(loadBudget);
  const [numMonthly, setMonthlyLimit] = useState(initial.monthlyLimit);
  const [numDaily, setDailyLimit] = useState(initial.dailyLimit);
  const [catLimits, setCatLimits] = useState<Record<string, number>>(initial.categoryLimits);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [autoNotice, setAutoNotice] = useState('');

  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const currentDay = Math.max(1, now.getDate());
  const remainingDays = Math.max(1, daysInMonth - currentDay + 1);
  const remainingMonthlyBudget = Math.max(0, numMonthly - monthExpense);
  const safeDailySpend = Math.round(remainingMonthlyBudget / remainingDays);
  const projectedMonthSpend = Math.round((monthExpense / currentDay) * daysInMonth);

  const monthPercent = numMonthly > 0 ? Math.min(100, Math.round((monthExpense / numMonthly) * 100)) : 0;
  const dayPercent = numDaily > 0 ? Math.min(100, Math.round((todayExpense / numDaily) * 100)) : 0;
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
    setAutoNotice(`Đã chia mức ngày theo ${daysInMonth} ngày trong tháng và phân bổ các danh mục. Bạn có thể bấm chỉnh từng mức trước khi lưu.`);
  };

  // Compute category spending for the current month
  const catSpend: Record<string, number> = {};
  for (const tx of transactions) {
    if (tx.type === 'expense') {
      catSpend[tx.categoryId] = (catSpend[tx.categoryId] ?? 0) + tx.amount;
    }
  }

  const handleSave = () => {
    if (savedNotice) return;
    const nextConfig: BudgetConfig = {
      monthlyLimit: numMonthly,
      dailyLimit: numDaily,
      categoryLimits: catLimits,
    };
    try {
      saveBudget(nextConfig);
      setSaveError('');
    } catch {
      setSaveError('Không lưu được hạn mức trên thiết bị. Hãy giải phóng dung lượng rồi thử lại.');
      return;
    }
    setSavedNotice(true);
    setTimeout(() => {
      onSaved(nextConfig);
    }, 350);
  };

  return (
    <div className="cm-crop-overlay cm-budget-overlay" onClick={onClose}>
      <div className="cm-budget-modal" role="dialog" aria-modal="true" aria-labelledby="cm-budget-title" onClick={e => e.stopPropagation()}>
        <header className="cm-crop-header">
          <button type="button" className="cm-crop-icon-btn" onClick={onClose} aria-label="Đóng">
            <X size={20} />
          </button>
          <div>
            <strong id="cm-budget-title">🎯 Giới hạn & Kiểm soát chi tiêu</strong>
            <small>Chạm chọn mức phù hợp, không cần gõ số</small>
          </div>
          <button type="button" className="cm-crop-confirm-top" disabled={savedNotice} onClick={handleSave} aria-label="Lưu hạn mức">
            <Check size={20} />
          </button>
        </header>

        {/* Smart AI / Advisor Insight Box */}
        <div className={`cm-budget-insight ${monthExpense > numMonthly ? 'danger' : monthPercent >= 75 ? 'warning' : 'safe'}`}>
          <div className="cm-budget-insight-icon">
            {monthExpense > numMonthly ? (
              <AlertTriangle size={20} />
            ) : monthPercent >= 75 ? (
              <Flame size={20} />
            ) : (
              <ShieldCheck size={20} />
            )}
          </div>
          <div className="cm-budget-insight-copy">
            <strong>
              {monthExpense > numMonthly
                ? `Đã vượt hạn mức tháng ${(monthExpense - numMonthly).toLocaleString('vi-VN')}đ!`
                : `An toàn tiêu: ${safeDailySpend.toLocaleString('vi-VN')}đ / ngày`}
            </strong>
            <small>
              Dự báo cuối tháng: ~{projectedMonthSpend.toLocaleString('vi-VN')}đ ({remainingDays} ngày còn lại)
            </small>
          </div>
        </div>

        {/* Progress Bars for Month & Today */}
        <div className="cm-budget-gauges">
          <div className="cm-gauge-card">
            <div className="cm-gauge-top">
              <span>Chi tiêu tháng này</span>
              <strong className={monthExpense > numMonthly ? 'danger' : ''}>{monthPercent}%</strong>
            </div>
            <div className="cm-gauge-track">
              <div
                className={`cm-gauge-fill ${monthExpense > numMonthly ? 'danger' : monthPercent >= 75 ? 'warning' : 'safe'}`}
                style={{ width: `${monthPercent}%` }}
              />
            </div>
            <small>
              {monthExpense.toLocaleString('vi-VN')}đ / {numMonthly.toLocaleString('vi-VN')}đ
            </small>
          </div>

          <div className="cm-gauge-card">
            <div className="cm-gauge-top">
              <span>Chi tiêu hôm nay</span>
              <strong className={todayExpense > numDaily ? 'danger' : ''}>{dayPercent}%</strong>
            </div>
            <div className="cm-gauge-track">
              <div
                className={`cm-gauge-fill ${todayExpense > numDaily ? 'danger' : dayPercent >= 75 ? 'warning' : 'safe'}`}
                style={{ width: `${dayPercent}%` }}
              />
            </div>
            <small>
              {todayExpense.toLocaleString('vi-VN')}đ / {numDaily.toLocaleString('vi-VN')}đ
            </small>
          </div>
        </div>

        <div className="cm-budget-quick-section">
          <h3><Target size={15} /> Hạn mức tháng</h3>
          <AmountPicker label="Hạn mức tháng" value={numMonthly} step={500_000} minimum={100_000} presets={monthlyPresets} onChange={amount => { setMonthlyLimit(amount); setAutoNotice(''); }} />
          <div className="cm-budget-auto-plan">
            <button type="button" onClick={distributeBudget}><Sparkles size={16} /> Tự chia ngày & danh mục</button>
            <small>Gợi ý: Ăn uống 40%, Mua sắm 20%, Di chuyển 10%, Hóa đơn 20%, Giải trí 10%.</small>
            {autoNotice && <p role="status">{autoNotice}</p>}
          </div>
        </div>

        <div className="cm-budget-quick-section">
          <h3><TrendingUp size={15} /> Hạn mức ngày</h3>
          <AmountPicker label="Hạn mức ngày" value={numDaily} step={10_000} minimum={1000} presets={dailyPresets} onChange={setDailyLimit} />
        </div>

        {/* Category Limits */}
        <div className="cm-cat-limits">
          <div className="cm-cat-limits-head">
            <Sparkles size={14} />
            <span>Hạn mức theo từng danh mục</span>
          </div>
          <p className="cm-budget-category-hint">Bấm vào danh mục để chọn mức nhanh.</p>
          {Object.entries(categoryLabels).map(([catId, label]) => {
            const spent = catSpend[catId] ?? 0;
            const limit = catLimits[catId] ?? 1_000_000;
            const pct = limit > 0 ? Math.min(100, Math.round((spent / limit) * 100)) : 0;
            const expanded = expandedCategory === catId;
            return (
              <div key={catId} className="cm-cat-limit-row">
                <button type="button" className="cm-budget-category-toggle" aria-expanded={expanded} aria-controls={`cm-budget-category-${catId}`} onClick={() => setExpandedCategory(expanded ? null : catId)}>
                  <span>{label}</span>
                  <strong>{limit.toLocaleString('vi-VN')}đ</strong>
                  <ChevronDown size={16} />
                </button>
                <small className="cm-budget-category-spent">Đã chi: {spent.toLocaleString('vi-VN')}đ ({pct}%)</small>
                  <div className="cm-gauge-track">
                    <div
                      className={`cm-gauge-fill ${spent > limit ? 'danger' : pct >= 80 ? 'warning' : 'safe'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                {expanded && <div id={`cm-budget-category-${catId}`} className="cm-budget-category-options">
                  <AmountPicker label={`Hạn mức ${label.slice(label.indexOf(' ') + 1)}`} value={limit} step={50_000} minimum={1} presets={categoryPresets} onChange={amount => setCatLimits(prev => ({ ...prev, [catId]: amount }))} />
                </div>}
              </div>
            );
          })}
          <div className={`cm-budget-category-total ${categoryTotal > numMonthly ? 'over' : ''}`}>
            <span>Tổng các danh mục</span><strong>{categoryTotal.toLocaleString('vi-VN')}đ</strong>
            {categoryTotal > numMonthly && <small>Đang lớn hơn hạn mức tháng. Bấm “Tự chia ngày & danh mục” để phân bổ lại.</small>}
          </div>
        </div>

        {saveError && <p className="cm-budget-save-error" role="alert">{saveError}</p>}
        <button type="button" className="cm-crop-submit-btn" disabled={savedNotice} onClick={handleSave}>
          <Check size={18} /> {savedNotice ? 'Đã lưu hạn mức!' : 'Lưu hạn mức chi tiêu'}
        </button>
      </div>
    </div>
  );
}
