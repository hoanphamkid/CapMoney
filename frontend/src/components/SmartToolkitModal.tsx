import {
  BarChart3,
  CalendarDays,
  Check,
  ChevronRight,
  ClipboardCheck,
  Coins,
  Copy,
  Crown,
  Flame,
  LockKeyhole,
  Pencil,
  PiggyBank,
  Plus,
  RotateCcw,
  Sparkles,
  Target,
  Users,
  WalletCards,
  X,
} from 'lucide-react';
import { useMemo, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import type { Transaction } from '../services/api';
import { ALL_CATEGORY_LABELS } from '../constants/categories';
import { PRO_FEATURES, PRO_SETTINGS_PATH } from '../constants/pro';
import { useAuth } from '../contexts/AuthContext';
import { loadBudget } from './SpendingLimitModal';

const SAVINGS_KEY = 'capmoney_savings_jar_v1';
const CHALLENGE_KEY = 'capmoney_challenge30_v1';

export type SavingsJarState = {
  goalName: string;
  targetAmount: number;
  savedAmount: number;
  history: Array<{ id: string; amount: number; date: string }>;
};

const defaultGoal: SavingsJarState = {
  goalName: 'Mục tiêu tự do tài chính',
  targetAmount: 10_000_000,
  savedAmount: 0,
  history: [],
};

export function loadSavingsJar(): SavingsJarState {
  try {
    const raw = localStorage.getItem(SAVINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SavingsJarState>;
      return {
        goalName: parsed.goalName || defaultGoal.goalName,
        targetAmount: parsed.targetAmount || defaultGoal.targetAmount,
        savedAmount: parsed.savedAmount ?? defaultGoal.savedAmount,
        history: Array.isArray(parsed.history) ? parsed.history : [],
      };
    }
  } catch {
    // Ignore storage errors.
  }
  return defaultGoal;
}

export function saveSavingsJar(value: SavingsJarState) {
  try {
    localStorage.setItem(SAVINGS_KEY, JSON.stringify(value));
  } catch {
    // Ignore storage errors.
  }
}

function loadChallenge() {
  try {
    const raw = localStorage.getItem(CHALLENGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((day): day is number => Number.isInteger(day) && day >= 1 && day <= 30) : [];
  } catch {
    return [];
  }
}

type ToolkitTab = 'overview' | 'challenge' | 'goal' | 'week' | 'split';

type SmartToolkitModalProps = {
  transactions: Transaction[];
  onClose: () => void;
  onTransactionAdded?: () => void;
};

export function SmartToolkitModal({ transactions, onClose }: SmartToolkitModalProps) {
  const { user } = useAuth();
  const hasPro = user?.proEnabled === true;
  const [tab, setTab] = useState<ToolkitTab>('challenge');
  const lockedFeature = !hasPro && (tab === 'week' || tab === 'split') ? PRO_FEATURES[tab] : null;
  const AccessIcon = hasPro ? ChevronRight : LockKeyhole;
  const [challengeDays, setChallengeDays] = useState<number[]>(loadChallenge);
  const [goal, setGoal] = useState<SavingsJarState>(loadSavingsJar);
  const [goalEditing, setGoalEditing] = useState(false);
  const [customDeposit, setCustomDeposit] = useState('');
  const [billTotal, setBillTotal] = useState('450000');
  const [people, setPeople] = useState(4);
  const [tip, setTip] = useState(0);
  const [copied, setCopied] = useState(false);

  const today = todayKey();
  const budget = useMemo(() => loadBudget(), []);
  const challengeTotal = challengeDays.reduce((sum, day) => sum + day * 10_000, 0);
  const challengePercent = Math.round((challengeDays.length / 30) * 100);
  const goalPercent = goal.targetAmount > 0 ? Math.min(100, Math.round((goal.savedAmount / goal.targetAmount) * 100)) : 0;

  const monthStats = useMemo(() => {
    const month = today.slice(0, 7);
    const expenses = transactions.filter(tx => tx.type === 'expense' && tx.dateKey.startsWith(month));
    const income = transactions.filter(tx => tx.type === 'income' && tx.dateKey.startsWith(month)).reduce((sum, tx) => sum + tx.amount, 0);
    const spent = expenses.reduce((sum, tx) => sum + tx.amount, 0);
    const byCategory: Record<string, number> = {};
    expenses.forEach(tx => { byCategory[tx.categoryId] = (byCategory[tx.categoryId] ?? 0) + tx.amount; });
    const topCategory = Object.entries(byCategory).sort((a, b) => b[1] - a[1])[0];
    return { spent, income, count: expenses.length, topCategory };
  }, [today, transactions]);

  const todaySpent = transactions.filter(tx => tx.type === 'expense' && tx.dateKey === today).reduce((sum, tx) => sum + tx.amount, 0);
  const monthPercent = budget.monthlyLimit > 0 ? Math.min(100, Math.round((monthStats.spent / budget.monthlyLimit) * 100)) : 0;

  const weekStats = useMemo(() => {
    const date = new Date(`${today}T12:00:00`);
    const mondayOffset = (date.getDay() + 6) % 7;
    const monday = new Date(date);
    monday.setDate(date.getDate() - mondayOffset);
    const key = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
    const from = key(monday);
    const rows = transactions.filter(tx => tx.type === 'expense' && tx.dateKey >= from && tx.dateKey <= today);
    const spent = rows.reduce((sum, tx) => sum + tx.amount, 0);
    const target = Math.max(1, Math.round(budget.monthlyLimit / 4));
    const daysLeft = Math.max(1, 7 - mondayOffset);
    return { from, spent, target, remaining: Math.max(0, target - spent), safeDaily: Math.max(0, Math.round((target - spent) / daysLeft)), percent: Math.min(100, Math.round((spent / target) * 100)) };
  }, [budget.monthlyLimit, today, transactions]);

  const numericBill = Number(billTotal.replace(/[^0-9]/g, '')) || 0;
  const totalWithTip = Math.round(numericBill * (1 + tip / 100));
  const perPerson = people > 0 ? Math.ceil(totalWithTip / people / 1000) * 1000 : 0;

  const toggleChallengeDay = (day: number) => {
    const next = challengeDays.includes(day) ? challengeDays.filter(item => item !== day) : [...challengeDays, day].sort((a, b) => a - b);
    setChallengeDays(next);
    localStorage.setItem(CHALLENGE_KEY, JSON.stringify(next));
    navigator.vibrate?.(20);
  };

  const resetChallenge = () => {
    setChallengeDays([]);
    localStorage.removeItem(CHALLENGE_KEY);
  };

  const deposit = (amount: number) => {
    if (amount <= 0) return;
    const next = { ...goal, savedAmount: goal.savedAmount + amount, history: [{ id: String(Date.now()), amount, date: today }, ...goal.history].slice(0, 20) };
    setGoal(next);
    saveSavingsJar(next);
    setCustomDeposit('');
    navigator.vibrate?.([25, 35, 55]);
  };

  const copySplit = async () => {
    const message = `🧾 Chia bill nhóm (${people} người):\n• Tổng bill: ${totalWithTip.toLocaleString('vi-VN')}đ\n• Mỗi người: ${perPerson.toLocaleString('vi-VN')}đ`;
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      navigator.vibrate?.(35);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const tabs: Array<{ id: ToolkitTab; label: string; icon: typeof Target }> = [
    { id: 'overview', label: 'Tổng quan', icon: BarChart3 },
    { id: 'challenge', label: '30 ngày', icon: Flame },
    { id: 'goal', label: 'Mục tiêu', icon: Target },
    { id: 'week', label: 'Kế hoạch tuần', icon: CalendarDays },
    { id: 'split', label: 'Chia bill', icon: Users },
  ];

  return (
    <div className="cm-crop-overlay cm-toolkit-overlay" onClick={onClose}>
      <div className="cm-toolkit-modal cm-toolkit-redesign cm-spring-pop" role="dialog" aria-modal="true" aria-labelledby="cm-toolkit-title" onClick={event => event.stopPropagation()}>
        <header className="cm-toolkit-new-header">
          <button type="button" className="cm-crop-icon-btn" onClick={onClose} aria-label="Đóng"><X size={19} /></button>
          <div>
            <span className="cm-toolkit-kicker">KHÔNG GIAN TIỀN BẠC</span>
            <strong id="cm-toolkit-title">Siêu tiện ích tài chính</strong>
            <small>Gọn hơn, rõ hơn, dùng được ngay mỗi ngày.</small>
          </div>
          <span className="cm-toolkit-new-mark"><Sparkles size={16} /></span>
        </header>

        <div className="cm-toolkit-new-nav" role="tablist" aria-label="Tiện ích tài chính">
          {tabs.map(({ id, label, icon: Icon }) => {
            const locked = !hasPro && (id === 'week' || id === 'split');
            return (
              <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'active' : ''} aria-label={locked ? `${label} (Pro)` : undefined} onClick={() => setTab(id)}>
                <Icon size={14} aria-hidden="true" /> {label}
                {locked && <LockKeyhole size={12} className="cm-toolkit-lock" aria-hidden="true" />}
              </button>
            );
          })}
        </div>

        {tab === 'overview' && (
          <div className="cm-toolkit-body cm-toolkit-new-body fade-in">
            <div className="cm-toolkit-overview-hero">
              <div><span>Đã chi tháng này</span><strong>{monthStats.spent.toLocaleString('vi-VN')}đ</strong><small>{monthPercent}% hạn mức tháng</small></div>
              <div className="cm-toolkit-overview-ring" style={{ '--ring-progress': `${monthPercent * 3.6}deg` } as CSSProperties}><b>{monthPercent}%</b></div>
            </div>
            <div className="cm-toolkit-stat-grid">
              <div><small>Hôm nay</small><strong>{todaySpent.toLocaleString('vi-VN')}đ</strong></div>
              <div><small>Tiền vào tháng</small><strong className="income">+{monthStats.income.toLocaleString('vi-VN')}đ</strong></div>
              <div><small>Giao dịch chi</small><strong>{monthStats.count}</strong></div>
              <div><small>Nhóm chi nhiều nhất</small><strong>{monthStats.topCategory ? ALL_CATEGORY_LABELS[monthStats.topCategory[0]] ?? 'Khác' : 'Chưa có'}</strong></div>
            </div>
            <div className="cm-toolkit-next-card"><ClipboardCheck size={18} /><div><strong>Gợi ý cho hôm nay</strong><span>{todaySpent <= budget.dailyLimit ? `Bạn còn khoảng ${(budget.dailyLimit - todaySpent).toLocaleString('vi-VN')}đ trong hạn mức ngày.` : 'Hôm nay đã vượt hạn mức ngày, hãy giảm một khoản chi nhỏ nhé.'}</span></div></div>
            <div className="cm-toolkit-action-grid">
              <button type="button" onClick={() => setTab('challenge')}><Flame size={17} /><span>Thử thách 30 ngày</span><ChevronRight size={15} /></button>
              <button type="button" onClick={() => setTab('goal')}><PiggyBank size={17} /><span>Đặt mục tiêu tiết kiệm</span><ChevronRight size={15} /></button>
              <button type="button" onClick={() => setTab('week')}><CalendarDays size={17} /><span>Lập kế hoạch tuần</span><AccessIcon size={15} /></button>
              <button type="button" onClick={() => setTab('split')}><Users size={17} /><span>Chia bill nhóm</span><AccessIcon size={15} /></button>
            </div>
          </div>
        )}

        {tab === 'challenge' && (
          <div className="cm-toolkit-body cm-toolkit-new-body fade-in">
            <div className="cm-challenge-hero">
              <div className="cm-challenge-hero-icon"><Flame size={23} /></div>
              <div><span>Thử thách 30 ngày</span><strong>Biến từng ngày nhỏ thành một khoản lớn.</strong><small>Ngày N = N × 10.000đ · Chạm vào ô để đánh dấu.</small></div>
            </div>
            <div className="cm-challenge-progress-head"><span>{challengeDays.length}/30 ngày hoàn thành</span><strong>{challengePercent}%</strong></div>
            <div className="cm-challenge-progress"><span style={{ width: `${challengePercent}%` }} /></div>
            <div className="cm-story-stats-row cm-toolkit-new-stats">
              <div className="cm-story-stat-box income"><small>Đã tiết kiệm</small><strong>+{challengeTotal.toLocaleString('vi-VN')}đ</strong></div>
              <div className="cm-story-stat-box expense"><small>Mục tiêu 30 ngày</small><strong>4.650.000đ</strong></div>
            </div>
            <div className="cm-challenge-grid cm-challenge-grid-new">
              {Array.from({ length: 30 }, (_, index) => index + 1).map(day => <button key={day} type="button" className={`cm-challenge-cell ${challengeDays.includes(day) ? 'done' : ''}`} onClick={() => toggleChallengeDay(day)}><b>{day}</b><small>{(day * 10).toLocaleString('vi-VN')}k</small>{challengeDays.includes(day) && <Check size={12} />}</button>)}
            </div>
            {challengeDays.length > 0 && <button type="button" className="cm-toolkit-reset" onClick={resetChallenge}><RotateCcw size={14} /> Làm lại thử thách</button>}
          </div>
        )}

        {tab === 'goal' && (
          <div className="cm-toolkit-body cm-toolkit-new-body fade-in">
            <div className="cm-goal-card">
              <div className="cm-goal-card-top"><span className="cm-goal-icon"><PiggyBank size={21} /></span><span className="cm-goal-percent">{goalPercent}%</span></div>
              <span className="cm-goal-label">Mục tiêu hiện tại</span><strong>{goal.goalName}</strong>
              <div className="cm-goal-amount"><b>{goal.savedAmount.toLocaleString('vi-VN')}đ</b><span>/ {goal.targetAmount.toLocaleString('vi-VN')}đ</span></div>
              <div className="cm-challenge-progress"><span style={{ width: `${goalPercent}%` }} /></div>
            </div>
            <div className="cm-toolkit-section-title"><span>Nạp nhanh vào mục tiêu</span><small>Chọn một mức hoặc nhập số riêng</small></div>
            <div className="cm-goal-quick-grid">{[50_000, 100_000, 200_000, 500_000].map(amount => <button key={amount} type="button" onClick={() => deposit(amount)}><Coins size={14} /> +{amount / 1000}k</button>)}</div>
            <div className="cm-goal-input-row"><input className="cm-cat-input" inputMode="numeric" placeholder="Nhập số tiền..." value={customDeposit ? Number(customDeposit).toLocaleString('vi-VN') : ''} onChange={event => setCustomDeposit(event.target.value.replace(/[^0-9]/g, ''))} /><button type="button" className="cm-toolkit-primary-btn" onClick={() => deposit(Number(customDeposit) || 0)}><Plus size={15} /> Nạp tiền</button></div>
            <button type="button" className="cm-toolkit-outline-btn" onClick={() => setGoalEditing(value => !value)}><Pencil size={14} /> {goalEditing ? 'Đóng chỉnh sửa mục tiêu' : 'Đổi tên hoặc số tiền mục tiêu'}</button>
            {goalEditing && <div className="cm-goal-edit"><label>Tên mục tiêu<input value={goal.goalName} onChange={event => { const next = { ...goal, goalName: event.target.value }; setGoal(next); saveSavingsJar(next); }} /></label><label>Số tiền đích<input inputMode="numeric" value={goal.targetAmount.toLocaleString('vi-VN')} onChange={event => { const next = { ...goal, targetAmount: Number(event.target.value.replace(/[^0-9]/g, '')) || 0 }; setGoal(next); saveSavingsJar(next); }} /></label></div>}
          </div>
        )}

        {lockedFeature && (
          <div className="cm-toolkit-body cm-toolkit-new-body">
            <section className="cm-toolkit-pro-lock">
              <LockKeyhole size={22} aria-hidden="true" />
              <h3>{lockedFeature.title}</h3>
              <p>{lockedFeature.detail}</p>
              <Link className="cm-toolkit-primary-btn" to={PRO_SETTINGS_PATH}>
                <Crown size={16} aria-hidden="true" /> Mở khóa Pro
              </Link>
            </section>
          </div>
        )}

        {tab === 'week' && !lockedFeature && (
          <div className="cm-toolkit-body cm-toolkit-new-body fade-in">
            <div className="cm-week-hero"><div><span>Kế hoạch tuần</span><strong>Giữ nhịp chi tiêu nhẹ nhàng.</strong><small>Bắt đầu từ {weekStats.from}</small></div><CalendarDays size={30} /></div>
            <div className="cm-toolkit-stat-grid cm-week-stat-grid"><div><small>Đã chi tuần này</small><strong>{weekStats.spent.toLocaleString('vi-VN')}đ</strong></div><div><small>Mục tiêu tuần</small><strong>{weekStats.target.toLocaleString('vi-VN')}đ</strong></div><div><small>Còn lại</small><strong className="income">{weekStats.remaining.toLocaleString('vi-VN')}đ</strong></div><div><small>Nên chi mỗi ngày</small><strong>{weekStats.safeDaily.toLocaleString('vi-VN')}đ</strong></div></div>
            <div className="cm-week-progress-card"><div><span>Mức sử dụng tuần</span><strong>{weekStats.percent}%</strong></div><div className="cm-challenge-progress"><span style={{ width: `${weekStats.percent}%` }} /></div><small>{weekStats.percent >= 100 ? 'Tuần này đã vượt mục tiêu.' : 'Bạn đang trong vùng kiểm soát tốt.'}</small></div>
            <div className="cm-toolkit-next-card"><WalletCards size={18} /><div><strong>Mẹo nhỏ</strong><span>Chia khoản còn lại cho số ngày còn lại để tránh dồn chi vào cuối tuần.</span></div></div>
          </div>
        )}

        {tab === 'split' && !lockedFeature && (
          <div className="cm-toolkit-body cm-toolkit-new-body fade-in">
            <div className="cm-split-result-box cm-split-result-new"><small>Mỗi người cần đóng</small><strong>{perPerson.toLocaleString('vi-VN')}đ</strong><span>Đã làm tròn đến hàng nghìn · {people} người</span></div>
            <label className="cm-toolkit-field"><span>Tổng hóa đơn</span><div><input inputMode="numeric" value={numericBill ? numericBill.toLocaleString('vi-VN') : ''} onChange={event => setBillTotal(event.target.value.replace(/[^0-9]/g, ''))} placeholder="450.000" /><b>đ</b></div></label>
            <div className="cm-toolkit-control-card"><div><strong>Số người chia</strong><span>{people} người</span></div><div className="cm-toolkit-choice-grid">{[2, 3, 4, 5, 6, 8, 10].map(value => <button key={value} type="button" className={people === value ? 'active' : ''} onClick={() => setPeople(value)}>÷{value}</button>)}</div></div>
            <div className="cm-toolkit-control-card"><div><strong>Phí dịch vụ / tip</strong><span>{tip}%</span></div><div className="cm-toolkit-choice-grid">{[0, 5, 8, 10].map(value => <button key={value} type="button" className={tip === value ? 'active' : ''} onClick={() => setTip(value)}>+{value}%</button>)}</div></div>
            <button type="button" className="cm-toolkit-primary-btn cm-toolkit-copy-btn" onClick={() => void copySplit}>{copied ? <Check size={17} /> : <Copy size={17} />}{copied ? 'Đã sao chép tin nhắn' : 'Sao chép để gửi nhóm'}</button>
          </div>
        )}
      </div>
    </div>
  );
}

function todayKey() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

