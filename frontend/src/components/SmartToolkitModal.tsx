import {
  Bot,
  CalendarSync,
  Check,
  Coins,
  Copy,
  Flame,
  HandCoins,
  HeartHandshake,
  PiggyBank,
  Plus,
  Sparkles,
  Trash2,
  Trophy,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { api, type Transaction } from '../services/api';

const SAVINGS_KEY = 'capmoney_savings_jar_v1';
const DEBTS_KEY = 'capmoney_debts_v1';
const SUBS_KEY = 'capmoney_subscriptions_v1';

export type SavingsJarState = {
  goalName: string;
  targetAmount: number;
  savedAmount: number;
  history: Array<{ id: string; amount: number; date: string }>;
};

export type DebtItem = {
  id: string;
  person: string;
  amount: number;
  kind: 'lend' | 'borrow'; // lend: cho vay (cần thu), borrow: đi vay (cần trả)
  note: string;
  settled: boolean;
};

export type SubscriptionItem = {
  id: string;
  name: string;
  amount: number;
  dayOfMonth: number;
  categoryId: string;
  icon: string;
};

const defaultJar: SavingsJarState = {
  goalName: 'Quỹ Tự Do & Du Lịch ✈️',
  targetAmount: 10_000_000,
  savedAmount: 1_500_000,
  history: [],
};

const defaultSubs: SubscriptionItem[] = [
  { id: 'sub-rent', name: 'Tiền thuê nhà / phòng', amount: 3_000_000, dayOfMonth: 5, categoryId: 'bills', icon: '🏠' },
  { id: 'sub-elec', name: 'Tiền điện & nước', amount: 450_000, dayOfMonth: 10, categoryId: 'bills', icon: '⚡' },
  { id: 'sub-net', name: 'Wifi / Gói 4G tháng', amount: 120_000, dayOfMonth: 15, categoryId: 'bills', icon: '📶' },
  { id: 'sub-ent', name: 'Netflix / Spotify / YouTube', amount: 79_000, dayOfMonth: 20, categoryId: 'entertainment', icon: '🎬' },
];

export function loadSavingsJar(): SavingsJarState {
  try {
    const raw = localStorage.getItem(SAVINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SavingsJarState>;
      return {
        goalName: parsed.goalName || defaultJar.goalName,
        targetAmount: parsed.targetAmount || defaultJar.targetAmount,
        savedAmount: parsed.savedAmount ?? defaultJar.savedAmount,
        history: Array.isArray(parsed.history) ? parsed.history : [],
      };
    }
  } catch {
    // Ignore storage errors
  }
  return defaultJar;
}

export function saveSavingsJar(state: SavingsJarState) {
  try {
    localStorage.setItem(SAVINGS_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage errors
  }
}

function loadDebts(): DebtItem[] {
  try {
    const raw = localStorage.getItem(DEBTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as DebtItem[];
    }
  } catch {
    // Ignore
  }
  return [
    { id: 'd1', person: 'Minh', amount: 150_000, kind: 'lend', note: 'Ứng tiền ăn trưa', settled: false },
  ];
}

function saveDebts(list: DebtItem[]) {
  try {
    localStorage.setItem(DEBTS_KEY, JSON.stringify(list));
  } catch {
    // Ignore
  }
}

function loadSubs(): SubscriptionItem[] {
  try {
    const raw = localStorage.getItem(SUBS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed as SubscriptionItem[];
    }
  } catch {
    // Ignore
  }
  return defaultSubs;
}

function saveSubs(list: SubscriptionItem[]) {
  try {
    localStorage.setItem(SUBS_KEY, JSON.stringify(list));
  } catch {
    // Ignore
  }
}

type ToolkitTab = 'jar' | 'debts' | 'subs' | 'coach' | 'split' | 'badges';

type SmartToolkitModalProps = {
  transactions: Transaction[];
  onClose: () => void;
  onTransactionAdded?: () => void;
};

export function SmartToolkitModal({ transactions, onClose, onTransactionAdded }: SmartToolkitModalProps) {
  const [tab, setTab] = useState<ToolkitTab>('jar');
  const [jar, setJar] = useState<SavingsJarState>(() => loadSavingsJar());
  const [coinBurst, setCoinBurst] = useState(false);
  const [editingGoal, setEditingGoal] = useState(false);
  const [customDeposit, setCustomDeposit] = useState('');

  // Debts / IOU state
  const [debts, setDebts] = useState<DebtItem[]>(() => loadDebts());
  const [debtPerson, setDebtPerson] = useState('');
  const [debtAmount, setDebtAmount] = useState('');
  const [debtNote, setDebtNote] = useState('');
  const [debtKind, setDebtKind] = useState<'lend' | 'borrow'>('lend');
  const [copiedDebtId, setCopiedDebtId] = useState<string | null>(null);

  // Subscriptions / Recurring Bills state
  const [subs, setSubs] = useState<SubscriptionItem[]>(() => loadSubs());
  const [subName, setSubName] = useState('');
  const [subAmount, setSubAmount] = useState('');
  const [recordedSubId, setRecordedSubId] = useState<string | null>(null);

  // AI Coach state
  const [coachTone, setCoachTone] = useState<'roast' | 'heal'>('roast');

  // Bill Splitter state
  const [billTotal, setBillTotal] = useState('450000');
  const [peopleCount, setPeopleCount] = useState(4);
  const [tipPercent, setTipPercent] = useState(0);
  const [copiedSplit, setCopiedSplit] = useState(false);

  const jarPercent = jar.targetAmount > 0 ? Math.min(100, Math.round((jar.savedAmount / jar.targetAmount) * 100)) : 0;

  const depositToJar = (amount: number) => {
    if (amount <= 0) return;
    if (navigator.vibrate) navigator.vibrate([30, 40, 60]);
    const next: SavingsJarState = {
      ...jar,
      savedAmount: jar.savedAmount + amount,
      history: [
        { id: String(Date.now()), amount, date: new Date().toLocaleDateString('vi-VN') },
        ...jar.history.slice(0, 9),
      ],
    };
    setJar(next);
    saveSavingsJar(next);
    setCoinBurst(true);
    setTimeout(() => setCoinBurst(false), 950);
  };

  // Debts helpers
  const totalLend = debts.filter(d => d.kind === 'lend' && !d.settled).reduce((s, d) => s + d.amount, 0);
  const totalBorrow = debts.filter(d => d.kind === 'borrow' && !d.settled).reduce((s, d) => s + d.amount, 0);

  const handleAddDebt = () => {
    const amt = Number(debtAmount.replace(/[^0-9]/g, '')) || 0;
    if (!debtPerson.trim() || amt <= 0) return;
    const item: DebtItem = {
      id: String(Date.now()),
      person: debtPerson.trim(),
      amount: amt,
      kind: debtKind,
      note: debtNote.trim() || (debtKind === 'lend' ? 'Cho mượn tiền' : 'Mượn tiền'),
      settled: false,
    };
    const next = [item, ...debts];
    setDebts(next);
    saveDebts(next);
    setDebtPerson('');
    setDebtAmount('');
    setDebtNote('');
    if (navigator.vibrate) navigator.vibrate(30);
  };

  const toggleDebtSettled = (id: string) => {
    const next = debts.map(d => (d.id === id ? { ...d, settled: !d.settled } : d));
    setDebts(next);
    saveDebts(next);
    if (navigator.vibrate) navigator.vibrate([25, 45]);
  };

  const removeDebt = (id: string) => {
    const next = debts.filter(d => d.id !== id);
    setDebts(next);
    saveDebts(next);
  };

  const copyZaloDebtReminder = async (d: DebtItem) => {
    const msg =
      d.kind === 'lend'
        ? `Ê ${d.person} ơi, cho mình nhắc nhẹ khoản ${d.amount.toLocaleString('vi-VN')}đ (${d.note}) nha, khi nào tiện chuyển khoản giúp mình nhé hehe 💸✨`
        : `Hi ${d.person}, mình gửi lại bạn khoản ${d.amount.toLocaleString('vi-VN')}đ (${d.note}) nhé, cảm ơn bạn nhiều nha! 💖`;
    try {
      await navigator.clipboard.writeText(msg);
      setCopiedDebtId(d.id);
      setTimeout(() => setCopiedDebtId(null), 2000);
    } catch {
      // Ignore
    }
  };

  // Subscriptions helpers
  const handleAddSub = () => {
    const amt = Number(subAmount.replace(/[^0-9]/g, '')) || 0;
    if (!subName.trim() || amt <= 0) return;
    const item: SubscriptionItem = {
      id: String(Date.now()),
      name: subName.trim(),
      amount: amt,
      dayOfMonth: new Date().getDate(),
      categoryId: 'bills',
      icon: '🧾',
    };
    const next = [item, ...subs];
    setSubs(next);
    saveSubs(next);
    setSubName('');
    setSubAmount('');
  };

  const recordSubToCalendar = async (sub: SubscriptionItem) => {
    try {
      const wRes = await api.wallets();
      const firstWalletId = wRes.wallets[0]?.id ?? '';
      if (!firstWalletId) return;
      const now = new Date();
      const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      await api.createTransaction({
        type: 'expense',
        amount: sub.amount,
        note: `${sub.icon} ${sub.name}`,
        categoryId: sub.categoryId,
        walletId: firstWalletId,
        transactionDate: todayKey,
      });
      setRecordedSubId(sub.id);
      if (navigator.vibrate) navigator.vibrate([30, 50]);
      onTransactionAdded?.();
      setTimeout(() => setRecordedSubId(null), 2000);
    } catch {
      // Ignore
    }
  };

  // AI Coach Insights
  const coachAnalysis = useMemo(() => {
    const totalExp = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const totalInc = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const catMap: Record<string, number> = {};
    for (const t of transactions) {
      if (t.type === 'expense') catMap[t.categoryId] = (catMap[t.categoryId] ?? 0) + t.amount;
    }
    const topCat = Object.entries(catMap).sort((a, b) => b[1] - a[1])[0];
    const foodSpent = catMap['food'] ?? 0;
    const shopSpent = catMap['shopping'] ?? 0;

    if (coachTone === 'roast') {
      if (totalExp === 0) {
        return {
          title: 'Ủa chưa tiêu đồng nào luôn hả? 👀',
          quote:
            'Ví bạn đang sạch bóng giao dịch! Hoặc là bạn siêu tiết kiệm hệ thần tiên, hoặc là tiêu xong quên chụp bill trốn tránh sự thật đúng không? Mau bấm dấu + chụp hóa đơn ngay đi nha!',
          tip: 'Mẹo: Chụp bill liền tay lúc vừa thanh toán để AI tự đọc số trong 1 giây!',
        };
      }
      return {
        title: `Đã bay màu ${totalExp.toLocaleString('vi-VN')}đ rồi đó chủ nhân! 🔥`,
        quote: `Nhìn vào lịch sử kìa: ăn uống hết ${foodSpent.toLocaleString('vi-VN')}đ, mua sắm ${shopSpent.toLocaleString('vi-VN')}đ! Tay bấm chốt đơn nhanh hơn tốc độ ánh sáng nhưng lúc nhìn số dư thì trầm cảm nhẹ nha. Giữ cái tay lại trước khi cuối tháng ăn mì tôm thanh lọc cơ thể!`,
        tip: `Cảnh báo: Danh mục ngốn tiền số 1 đang là "${topCat?.[0] === 'food' ? 'Ăn uống' : topCat?.[0] === 'shopping' ? 'Mua sắm' : 'Chi tiêu'}" (${(topCat?.[1] ?? 0).toLocaleString('vi-VN')}đ). Hãy thử 2 ngày Không Chi Tiêu (No-Spend) tuần này nhé!`,
      };
    } else {
      return {
        title: 'Bạn đang làm rất tốt hành trình quản lý tài chính 🌱',
        quote: `Việc bạn kiên trì ghi chép lại ${transactions.length} giao dịch (Tổng thu: +${totalInc.toLocaleString('vi-VN')}đ • Tổng chi: −${totalExp.toLocaleString('vi-VN')}đ) đã giúp bạn kiểm soát dòng tiền tốt hơn 80% mọi người rồi! Mỗi bức ảnh hóa đơn là một bước tiến tới tự do tài chính.`,
        tip: 'Gợi ý nhẹ nhàng: Hãy trích 10% khoản thu hoặc 50.000đ mỗi tuần bỏ vào Hũ Tiết Kiệm 🐷 bên cạnh nhé!',
      };
    }
  }, [transactions, coachTone]);

  // Splitter calculations
  const numericBill = Number(billTotal.replace(/[^0-9]/g, '')) || 0;
  const totalWithTip = Math.round(numericBill * (1 + tipPercent / 100));
  const perPerson = peopleCount > 0 ? Math.ceil(totalWithTip / peopleCount / 1000) * 1000 : 0;

  const handleCopySplit = async () => {
    const text = `🧾 Chia bill nhóm (${peopleCount} người):\n• Tổng hóa đơn: ${totalWithTip.toLocaleString('vi-VN')}đ\n• Mỗi người: ${perPerson.toLocaleString('vi-VN')}đ nha! 💸`;
    try {
      await navigator.clipboard.writeText(text);
      if (navigator.vibrate) navigator.vibrate(40);
      setCopiedSplit(true);
      setTimeout(() => setCopiedSplit(false), 2000);
    } catch {
      // Ignore clipboard error
    }
  };

  // Badges calculation
  const photoBillsCount = transactions.filter(t => Boolean(t.imageUrl)).length;
  const totalTxCount = transactions.length;
  const badges = [
    {
      id: 'snapper',
      icon: '📸',
      title: 'Thợ Săn Hóa Đơn',
      desc: 'Chụp ảnh lưu giữ hóa đơn chi tiêu',
      unlocked: photoBillsCount >= 1 || totalTxCount >= 1,
      progress: `${Math.min(5, Math.max(1, photoBillsCount))}/5 bill ảnh`,
    },
    {
      id: 'saver',
      icon: '🐷',
      title: 'Chủ Nhân Hũ Vàng',
      desc: 'Bỏ ống heo tiết kiệm đạt mốc đầu tiên',
      unlocked: jar.savedAmount >= 500_000,
      progress: `${jarPercent}% mục tiêu`,
    },
    {
      id: 'streak',
      icon: '🌱',
      title: 'Bậc Thầy Giữ Ví',
      desc: 'Có ngày không phát sinh chi tiêu (No-Spend)',
      unlocked: true,
      progress: 'Đã kích hoạt',
    },
    {
      id: 'ocr',
      icon: '🤖',
      title: 'Tiên Phong AI OCR',
      desc: 'Tự động quét số tiền từ ảnh chụp hóa đơn',
      unlocked: true,
      progress: 'Đã mở khóa',
    },
  ];

  return (
    <div className="cm-crop-overlay" onClick={onClose}>
      <div className="cm-toolkit-modal cm-spring-pop" onClick={e => e.stopPropagation()}>
        <header className="cm-crop-header">
          <button type="button" className="cm-crop-icon-btn" onClick={onClose} aria-label="Đóng">
            <X size={20} />
          </button>
          <div>
            <strong>✨ Siêu Tiện Ích Tài Chính</strong>
            <small>Hũ tiết kiệm • Sổ nợ • Định kỳ • AI Coach</small>
          </div>
          <span className="cm-story-sparkle">
            <Sparkles size={16} />
          </span>
        </header>

        {/* Scrollable 6-Tab Switcher */}
        <div className="cm-toolkit-tabs-scroll">
          <button
            type="button"
            className={`cm-story-period-btn ${tab === 'jar' ? 'active' : ''}`}
            onClick={() => setTab('jar')}
          >
            🐷 Hũ Vàng
          </button>
          <button
            type="button"
            className={`cm-story-period-btn ${tab === 'debts' ? 'active' : ''}`}
            onClick={() => setTab('debts')}
          >
            🤝 Sổ Nợ
          </button>
          <button
            type="button"
            className={`cm-story-period-btn ${tab === 'subs' ? 'active' : ''}`}
            onClick={() => setTab('subs')}
          >
            🔄 Định Kỳ
          </button>
          <button
            type="button"
            className={`cm-story-period-btn ${tab === 'coach' ? 'active' : ''}`}
            onClick={() => setTab('coach')}
          >
            🤖 AI Phán
          </button>
          <button
            type="button"
            className={`cm-story-period-btn ${tab === 'split' ? 'active' : ''}`}
            onClick={() => setTab('split')}
          >
            👥 Chia Bill
          </button>
          <button
            type="button"
            className={`cm-story-period-btn ${tab === 'badges' ? 'active' : ''}`}
            onClick={() => setTab('badges')}
          >
            🏆 Huy Hiệu
          </button>
        </div>

        {/* TAB 1: SAVINGS JAR */}
        {tab === 'jar' && (
          <div className="cm-toolkit-body fade-in">
            <div className={`cm-jar-visual-card ${coinBurst ? 'bursting' : ''}`}>
              <div className="cm-jar-liquid" style={{ height: `${Math.max(12, jarPercent)}%` }} />
              {coinBurst && (
                <div className="cm-coin-rain" aria-hidden="true">
                  <span>🪙</span>
                  <span>✨</span>
                  <span>💰</span>
                  <span>🪙</span>
                  <span>💎</span>
                </div>
              )}
              <div className="cm-jar-content">
                <span className="cm-jar-icon">
                  <PiggyBank size={30} />
                </span>
                <strong>{jar.goalName}</strong>
                <h3>
                  {jar.savedAmount.toLocaleString('vi-VN')}đ <small>/ {jar.targetAmount.toLocaleString('vi-VN')}đ</small>
                </h3>
                <span className="cm-jar-pct-pill">Đạt {jarPercent}% mục tiêu</span>
              </div>
            </div>

            <div className="cm-jar-quick-row">
              {[50_000, 100_000, 200_000, 500_000].map(amt => (
                <button key={amt} type="button" className="cm-jar-add-chip" onClick={() => depositToJar(amt)}>
                  <Coins size={13} /> +{amt / 1_000}k
                </button>
              ))}
            </div>

            <div className="cm-jar-custom-row">
              <input
                inputMode="numeric"
                className="cm-cat-input"
                style={{ flex: 1, textAlign: 'left' }}
                placeholder="Nhập số tiền bỏ ống heo..."
                value={customDeposit ? Number(customDeposit).toLocaleString('vi-VN') : ''}
                onChange={e => setCustomDeposit(e.target.value.replace(/[^0-9]/g, ''))}
              />
              <button
                type="button"
                className="cm-jar-deposit-btn"
                onClick={() => {
                  const val = Number(customDeposit) || 0;
                  if (val > 0) {
                    depositToJar(val);
                    setCustomDeposit('');
                  }
                }}
              >
                <Plus size={16} /> Bỏ hũ
              </button>
            </div>

            <div className="cm-jar-footer-actions">
              <button type="button" className="cm-text-link-btn" onClick={() => setEditingGoal(v => !v)}>
                {editingGoal ? 'Đóng chỉnh sửa mục tiêu' : '⚙️ Đổi tên mục tiêu / số tiền đích'}
              </button>
              {jar.savedAmount > 0 && (
                <button
                  type="button"
                  className="cm-text-link-btn danger"
                  onClick={() => {
                    const reset = { ...jar, savedAmount: 0, history: [] };
                    setJar(reset);
                    saveSavingsJar(reset);
                  }}
                >
                  Làm mới hũ
                </button>
              )}
            </div>

            {editingGoal && (
              <div className="cm-jar-edit-box">
                <label className="select-field">
                  <span>Tên mục tiêu</span>
                  <input
                    value={jar.goalName}
                    onChange={e => {
                      const next = { ...jar, goalName: e.target.value };
                      setJar(next);
                      saveSavingsJar(next);
                    }}
                  />
                </label>
                <label className="select-field">
                  <span>Số tiền mục tiêu (đ)</span>
                  <input
                    inputMode="numeric"
                    value={jar.targetAmount ? jar.targetAmount.toLocaleString('vi-VN') : ''}
                    onChange={e => {
                      const val = Number(e.target.value.replace(/[^0-9]/g, '')) || 0;
                      const next = { ...jar, targetAmount: val };
                      setJar(next);
                      saveSavingsJar(next);
                    }}
                  />
                </label>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: DEBT & LOAN IOU TRACKER (SỔ NỢ) */}
        {tab === 'debts' && (
          <div className="cm-toolkit-body fade-in">
            <div className="cm-story-stats-row">
              <div className="cm-story-stat-box income">
                <small>Cần thu về (Cho vay)</small>
                <strong>+{totalLend.toLocaleString('vi-VN')}đ</strong>
              </div>
              <div className="cm-story-stat-box expense">
                <small>Cần trả (Đi vay)</small>
                <strong>−{totalBorrow.toLocaleString('vi-VN')}đ</strong>
              </div>
            </div>

            <div className="cm-debt-form-card">
              <div className="cm-debt-kind-toggle">
                <button
                  type="button"
                  className={`cm-preset-chip ${debtKind === 'lend' ? 'active' : ''}`}
                  onClick={() => setDebtKind('lend')}
                >
                  <HandCoins size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />
                  Cho vay (Thu về)
                </button>
                <button
                  type="button"
                  className={`cm-preset-chip ${debtKind === 'borrow' ? 'active' : ''}`}
                  onClick={() => setDebtKind('borrow')}
                >
                  <HeartHandshake size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />
                  Đi vay (Phải trả)
                </button>
              </div>
              <div className="cm-jar-custom-row">
                <input
                  className="cm-cat-input"
                  style={{ flex: 1, textAlign: 'left' }}
                  placeholder="Tên người (VD: Nam)"
                  value={debtPerson}
                  onChange={e => setDebtPerson(e.target.value)}
                />
                <input
                  inputMode="numeric"
                  className="cm-cat-input"
                  style={{ width: 120, textAlign: 'right' }}
                  placeholder="Số tiền..."
                  value={debtAmount ? Number(debtAmount).toLocaleString('vi-VN') : ''}
                  onChange={e => setDebtAmount(e.target.value.replace(/[^0-9]/g, ''))}
                />
              </div>
              <div className="cm-jar-custom-row">
                <input
                  className="cm-cat-input"
                  style={{ flex: 1, textAlign: 'left' }}
                  placeholder="Ghi chú (VD: Ăn trưa, vé xem phim...)"
                  value={debtNote}
                  onChange={e => setDebtNote(e.target.value)}
                />
                <button type="button" className="cm-jar-deposit-btn" onClick={handleAddDebt}>
                  <Plus size={15} /> Lưu
                </button>
              </div>
            </div>

            <div className="cm-debt-list">
              {debts.map(d => (
                <div key={d.id} className={`cm-debt-row ${d.settled ? 'settled' : ''}`}>
                  <button
                    type="button"
                    className={`cm-debt-check ${d.settled ? 'checked' : ''}`}
                    onClick={() => toggleDebtSettled(d.id)}
                    title="Đánh dấu đã trả"
                  >
                    <Check size={14} />
                  </button>
                  <div className="cm-debt-info">
                    <strong>
                      {d.person} •{' '}
                      <span className={d.kind === 'lend' ? 'income-text' : 'expense-text'}>
                        {d.kind === 'lend' ? '+' : '−'}
                        {d.amount.toLocaleString('vi-VN')}đ
                      </span>
                    </strong>
                    <small>{d.note}</small>
                  </div>
                  <button
                    type="button"
                    className="cm-debt-action-btn"
                    onClick={() => void copyZaloDebtReminder(d)}
                    title="Sao chép tin nhắn nhắc nợ Zalo"
                  >
                    {copiedDebtId === d.id ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                  <button
                    type="button"
                    className="cm-debt-action-btn danger"
                    onClick={() => removeDebt(d.id)}
                    title="Xóa"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 3: RECURRING BILLS & SUBSCRIPTIONS (ĐỊNH KỲ) */}
        {tab === 'subs' && (
          <div className="cm-toolkit-body fade-in">
            <div className="cm-sub-intro">
              <CalendarSync size={18} />
              <span>Bấm 1 chạm để ghi ngay hóa đơn cố định hàng tháng vào lịch hôm nay!</span>
            </div>

            <div className="cm-debt-list">
              {subs.map(sub => (
                <div key={sub.id} className="cm-debt-row">
                  <span className="cm-sub-emoji">{sub.icon}</span>
                  <div className="cm-debt-info">
                    <strong>{sub.name}</strong>
                    <small>
                      Định kỳ ngày {sub.dayOfMonth} • <b>{sub.amount.toLocaleString('vi-VN')}đ</b>
                    </small>
                  </div>
                  <button
                    type="button"
                    className="cm-sub-record-btn"
                    onClick={() => void recordSubToCalendar(sub)}
                  >
                    {recordedSubId === sub.id ? (
                      <>
                        <Check size={13} /> Đã ghi!
                      </>
                    ) : (
                      <>
                        <Zap size={13} /> Ghi lịch
                      </>
                    )}
                  </button>
                </div>
              ))}
            </div>

            <div className="cm-jar-custom-row">
              <input
                className="cm-cat-input"
                style={{ flex: 1, textAlign: 'left' }}
                placeholder="Thêm khoản định kỳ mới..."
                value={subName}
                onChange={e => setSubName(e.target.value)}
              />
              <input
                inputMode="numeric"
                className="cm-cat-input"
                style={{ width: 110 }}
                placeholder="Số tiền..."
                value={subAmount ? Number(subAmount).toLocaleString('vi-VN') : ''}
                onChange={e => setSubAmount(e.target.value.replace(/[^0-9]/g, ''))}
              />
              <button type="button" className="cm-jar-deposit-btn" onClick={handleAddSub}>
                <Plus size={15} />
              </button>
            </div>
          </div>
        )}

        {/* TAB 4: AI FINANCIAL COACH (ROAST VS HEAL) */}
        {tab === 'coach' && (
          <div className="cm-toolkit-body fade-in">
            <div className="cm-debt-kind-toggle">
              <button
                type="button"
                className={`cm-preset-chip ${coachTone === 'roast' ? 'active' : ''}`}
                onClick={() => setCoachTone('roast')}
              >
                🔥 Chế độ "Mỏ Hỗn" (Tỉnh ngộ)
              </button>
              <button
                type="button"
                className={`cm-preset-chip ${coachTone === 'heal' ? 'active' : ''}`}
                onClick={() => setCoachTone('heal')}
              >
                🌱 Chế độ "Chữa Lành" (Khích lệ)
              </button>
            </div>

            <div className={`cm-ai-coach-card ${coachTone}`}>
              <div className="cm-ai-coach-head">
                <span className="cm-ai-avatar">
                  <Bot size={22} />
                </span>
                <strong>{coachAnalysis.title}</strong>
              </div>
              <p>{coachAnalysis.quote}</p>
              <div className="cm-ai-tip-box">💡 {coachAnalysis.tip}</div>
            </div>
          </div>
        )}

        {/* TAB 5: QUICK GROUP BILL SPLITTER */}
        {tab === 'split' && (
          <div className="cm-toolkit-body fade-in">
            <div className="cm-split-result-box">
              <small>Mỗi người cần đóng ({peopleCount} người)</small>
              <strong>{perPerson.toLocaleString('vi-VN')}đ / người</strong>
              <span>Đã làm tròn đẹp tới hàng nghìn</span>
            </div>

            <label className="select-field">
              <span>Tổng tiền hóa đơn (đ)</span>
              <input
                inputMode="numeric"
                value={numericBill ? numericBill.toLocaleString('vi-VN') : ''}
                onChange={e => setBillTotal(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="450.000"
              />
            </label>

            <div className="cm-split-people-row">
              <span>
                <Users size={15} style={{ verticalAlign: '-2px', marginRight: 6 }} />
                Số người chia: <b>{peopleCount} người</b>
              </span>
              <div className="cm-split-stepper">
                {[2, 3, 4, 5, 6, 8, 10].map(n => (
                  <button
                    key={n}
                    type="button"
                    className={`cm-preset-chip ${peopleCount === n ? 'active' : ''}`}
                    onClick={() => setPeopleCount(n)}
                  >
                    ÷{n}
                  </button>
                ))}
              </div>
            </div>

            <div className="cm-split-people-row">
              <span>
                Phụ phí / VAT / Tip: <b>{tipPercent}%</b>
              </span>
              <div className="cm-split-stepper">
                {[0, 5, 8, 10].map(pct => (
                  <button
                    key={pct}
                    type="button"
                    className={`cm-preset-chip ${tipPercent === pct ? 'active' : ''}`}
                    onClick={() => setTipPercent(pct)}
                  >
                    +{pct}%
                  </button>
                ))}
              </div>
            </div>

            <button type="button" className="cm-crop-submit-btn" onClick={() => void handleCopySplit()}>
              {copiedSplit ? <Check size={18} /> : <Copy size={18} />}
              {copiedSplit ? 'Đã sao chép tin nhắn chia tiền!' : 'Sao chép tin nhắn gửi nhóm Zalo'}
            </button>
          </div>
        )}

        {/* TAB 6: GAMIFICATION BADGES */}
        {tab === 'badges' && (
          <div className="cm-toolkit-body fade-in">
            <div className="cm-badges-grid">
              {badges.map(b => (
                <div key={b.id} className={`cm-badge-card ${b.unlocked ? 'unlocked' : 'locked'}`}>
                  <span className="cm-badge-emoji">{b.icon}</span>
                  <strong>{b.title}</strong>
                  <p>{b.desc}</p>
                  <small>
                    {b.unlocked ? <Flame size={11} /> : <Trophy size={11} />} {b.progress}
                  </small>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
