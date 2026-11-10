import { Check, Coins, Copy, Flame, PiggyBank, Plus, Sparkles, Trophy, Users, X } from 'lucide-react';
import { useState } from 'react';
import type { Transaction } from '../services/api';

const SAVINGS_KEY = 'capmoney_savings_jar_v1';

export type SavingsJarState = {
  goalName: string;
  targetAmount: number;
  savedAmount: number;
  history: Array<{ id: string; amount: number; date: string }>;
};

const defaultJar: SavingsJarState = {
  goalName: 'Quỹ Tự Do & Du Lịch ✈️',
  targetAmount: 10_000_000,
  savedAmount: 1_500_000,
  history: [],
};

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

type SmartToolkitModalProps = {
  transactions: Transaction[];
  onClose: () => void;
};

export function SmartToolkitModal({ transactions, onClose }: SmartToolkitModalProps) {
  const [tab, setTab] = useState<'jar' | 'split' | 'badges'>('jar');
  const [jar, setJar] = useState<SavingsJarState>(() => loadSavingsJar());
  const [coinBurst, setCoinBurst] = useState(false);
  const [editingGoal, setEditingGoal] = useState(false);
  const [customDeposit, setCustomDeposit] = useState('');

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
            <strong>✨ Tiện ích & Hũ tiết kiệm</strong>
            <small>Trợ lý tài chính thông minh trên di động</small>
          </div>
          <span className="cm-story-sparkle">
            <Sparkles size={16} />
          </span>
        </header>

        {/* Tab Switcher */}
        <div className="cm-story-period-tabs">
          <button
            type="button"
            className={`cm-story-period-btn ${tab === 'jar' ? 'active' : ''}`}
            onClick={() => setTab('jar')}
          >
            🐷 Hũ Tiết Kiệm
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
                <button
                  key={amt}
                  type="button"
                  className="cm-jar-add-chip"
                  onClick={() => depositToJar(amt)}
                >
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
              <button
                type="button"
                className="cm-text-link-btn"
                onClick={() => setEditingGoal(v => !v)}
              >
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

        {/* TAB 2: QUICK GROUP BILL SPLITTER */}
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
              <span>Phụ phí / VAT / Tip: <b>{tipPercent}%</b></span>
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

        {/* TAB 3: GAMIFICATION BADGES */}
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
