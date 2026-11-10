import { AlertTriangle, Check, Flame, ShieldCheck, Sparkles, Target, TrendingUp, X } from 'lucide-react';
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
  try {
    localStorage.setItem(BUDGET_STORAGE_KEY, JSON.stringify(config));
  } catch {
    // Ignore storage quota errors
  }
}

const categoryLabels: Record<string, string> = {
  food: '🛒 Ăn uống',
  shopping: '🛍️ Mua sắm',
  transport: '🛵 Di chuyển',
  bills: '🧾 Hóa đơn',
  entertainment: '🎬 Giải trí',
};

const monthlyPresets = [3_000_000, 5_000_000, 8_000_000, 10_000_000, 15_000_000];

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
  const initial = loadBudget();
  const [monthlyLimit, setMonthlyLimit] = useState(String(initial.monthlyLimit));
  const [dailyLimit, setDailyLimit] = useState(String(initial.dailyLimit));
  const [catLimits, setCatLimits] = useState<Record<string, number>>(initial.categoryLimits);
  const [savedNotice, setSavedNotice] = useState(false);

  const numMonthly = Number(monthlyLimit.replace(/[^0-9]/g, '')) || 0;
  const numDaily = Number(dailyLimit.replace(/[^0-9]/g, '')) || 0;

  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const currentDay = Math.max(1, now.getDate());
  const remainingDays = Math.max(1, daysInMonth - currentDay + 1);
  const remainingMonthlyBudget = Math.max(0, numMonthly - monthExpense);
  const safeDailySpend = Math.round(remainingMonthlyBudget / remainingDays);
  const projectedMonthSpend = Math.round((monthExpense / currentDay) * daysInMonth);

  const monthPercent = numMonthly > 0 ? Math.min(100, Math.round((monthExpense / numMonthly) * 100)) : 0;
  const dayPercent = numDaily > 0 ? Math.min(100, Math.round((todayExpense / numDaily) * 100)) : 0;

  // Compute category spending for the current month
  const catSpend: Record<string, number> = {};
  for (const tx of transactions) {
    if (tx.type === 'expense') {
      catSpend[tx.categoryId] = (catSpend[tx.categoryId] ?? 0) + tx.amount;
    }
  }

  const handleSave = () => {
    const nextConfig: BudgetConfig = {
      monthlyLimit: numMonthly || 5_000_000,
      dailyLimit: numDaily || Math.round((numMonthly || 5_000_000) / 25),
      categoryLimits: catLimits,
    };
    saveBudget(nextConfig);
    setSavedNotice(true);
    setTimeout(() => {
      onSaved(nextConfig);
    }, 350);
  };

  return (
    <div className="cm-crop-overlay" onClick={onClose}>
      <div className="cm-budget-modal" onClick={e => e.stopPropagation()}>
        <header className="cm-crop-header">
          <button type="button" className="cm-crop-icon-btn" onClick={onClose} aria-label="Đóng">
            <X size={20} />
          </button>
          <div>
            <strong>🎯 Giới hạn & Kiểm soát chi tiêu</strong>
            <small>Đặt trần chi tiêu để giữ kỷ luật tài chính</small>
          </div>
          <button type="button" className="cm-crop-confirm-top" onClick={handleSave} aria-label="Lưu hạn mức">
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

        {/* Inputs for Monthly & Daily Limit */}
        <div className="cm-budget-inputs">
          <label className="select-field">
            <span>
              <Target size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />
              Hạn mức chi tiêu Tháng (đ)
            </span>
            <input
              inputMode="numeric"
              value={numMonthly ? numMonthly.toLocaleString('vi-VN') : ''}
              onChange={e => {
                const raw = e.target.value.replace(/[^0-9]/g, '');
                setMonthlyLimit(raw);
              }}
              placeholder="5.000.000"
            />
          </label>

          <div className="cm-preset-row">
            {monthlyPresets.map(preset => (
              <button
                key={preset}
                type="button"
                className={`cm-preset-chip ${numMonthly === preset ? 'active' : ''}`}
                onClick={() => {
                  setMonthlyLimit(String(preset));
                  setDailyLimit(String(Math.round(preset / 25)));
                }}
              >
                {preset / 1_000_000} triệu
              </button>
            ))}
          </div>

          <label className="select-field">
            <span>
              <TrendingUp size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />
              Hạn mức chi tiêu Ngày (đ)
            </span>
            <input
              inputMode="numeric"
              value={numDaily ? numDaily.toLocaleString('vi-VN') : ''}
              onChange={e => setDailyLimit(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="200.000"
            />
          </label>
        </div>

        {/* Category Limits */}
        <div className="cm-cat-limits">
          <div className="cm-cat-limits-head">
            <Sparkles size={14} />
            <span>Hạn mức theo từng danh mục</span>
          </div>
          {Object.entries(categoryLabels).map(([catId, label]) => {
            const spent = catSpend[catId] ?? 0;
            const limit = catLimits[catId] ?? 1_000_000;
            const pct = limit > 0 ? Math.min(100, Math.round((spent / limit) * 100)) : 0;
            return (
              <div key={catId} className="cm-cat-limit-row">
                <div className="cm-cat-limit-top">
                  <span>{label}</span>
                  <small>
                    Đã chi: <b>{spent.toLocaleString('vi-VN')}đ</b> ({pct}%)
                  </small>
                </div>
                <div className="cm-cat-limit-control">
                  <div className="cm-gauge-track compact">
                    <div
                      className={`cm-gauge-fill ${spent > limit ? 'danger' : pct >= 80 ? 'warning' : 'safe'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <input
                    inputMode="numeric"
                    className="cm-cat-input"
                    value={limit ? limit.toLocaleString('vi-VN') : ''}
                    onChange={e => {
                      const val = Number(e.target.value.replace(/[^0-9]/g, '')) || 0;
                      setCatLimits(prev => ({ ...prev, [catId]: val }));
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <button type="button" className="cm-crop-submit-btn" onClick={handleSave}>
          <Check size={18} /> {savedNotice ? 'Đã lưu hạn mức!' : 'Lưu hạn mức chi tiêu'}
        </button>
      </div>
    </div>
  );
}
