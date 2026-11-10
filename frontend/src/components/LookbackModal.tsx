import {
  ArrowDownLeft,
  ArrowUpRight,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Flame,
  Pause,
  Play,
  Sparkles,
  TrendingDown,
  Trophy,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { Transaction } from '../services/api';

type LookbackPeriod = 1 | 3 | 7;

type LookbackModalProps = {
  initialPeriod?: LookbackPeriod;
  transactions: Transaction[];
  onClose: () => void;
};

const categoryNames: Record<string, string> = {
  food: '🛒 Ăn uống',
  shopping: '🛍️ Mua sắm',
  transport: '🛵 Di chuyển',
  bills: '🧾 Hóa đơn',
  entertainment: '🎬 Giải trí',
  health: '💊 Sức khỏe',
  salary: '💰 Lương',
  bonus: '🎁 Thưởng',
  investment: '📈 Đầu tư',
  gift: '🎉 Được tặng',
  other: '✨ Khác',
};

export function LookbackModal({ initialPeriod = 3, transactions, onClose }: LookbackModalProps) {
  const [period, setPeriod] = useState<LookbackPeriod>(initialPeriod);
  const [slideIndex, setSlideIndex] = useState(0); // 0: Photo Reel, 1: Daily Rhythm, 2: Insights
  const [photoIdx, setPhotoIdx] = useState(0);
  const [playing, setPlaying] = useState(true);

  const dateKeys = useMemo(() => {
    const list: string[] = [];
    const now = new Date();
    for (let i = period - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      list.push(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      );
    }
    return list;
  }, [period]);

  const periodTxs = useMemo(() => {
    const minKey = dateKeys[0] ?? '';
    const maxKey = dateKeys[dateKeys.length - 1] ?? '';
    return transactions
      .filter(tx => tx.dateKey >= minKey && tx.dateKey <= maxKey)
      .sort((a, b) => b.dateKey.localeCompare(a.dateKey));
  }, [transactions, dateKeys]);

  // If current period has 0 txs, fallback to recent transactions so the user can still enjoy the flashback reel
  const displayTxs = periodTxs.length > 0 ? periodTxs : transactions.slice(0, 10);

  const stats = useMemo(() => {
    let income = 0;
    let expense = 0;
    const catTotals: Record<string, number> = {};
    const dayTotals: Record<string, { income: number; expense: number }> = {};
    for (const k of dateKeys) {
      dayTotals[k] = { income: 0, expense: 0 };
    }
    let biggestExpense: Transaction | null = null;

    for (const tx of periodTxs) {
      if (tx.type === 'income') {
        income += tx.amount;
        if (dayTotals[tx.dateKey]) dayTotals[tx.dateKey].income += tx.amount;
      } else if (tx.type === 'expense') {
        expense += tx.amount;
        if (dayTotals[tx.dateKey]) dayTotals[tx.dateKey].expense += tx.amount;
        catTotals[tx.categoryId] = (catTotals[tx.categoryId] ?? 0) + tx.amount;
        if (!biggestExpense || tx.amount > biggestExpense.amount) {
          biggestExpense = tx;
        }
      }
    }

    const topCategoryEntry = Object.entries(catTotals).sort((a, b) => b[1] - a[1])[0] ?? null;
    const noSpendDays = Object.values(dayTotals).filter(d => d.expense === 0).length;
    const avgDailyExpense = Math.round(expense / Math.max(1, period));

    return {
      income,
      expense,
      avgDailyExpense,
      topCategory: topCategoryEntry ? { id: topCategoryEntry[0], amount: topCategoryEntry[1] } : null,
      biggestExpense,
      noSpendDays,
      dayTotals,
      txCount: periodTxs.length,
    };
  }, [periodTxs, dateKeys, period]);

  useEffect(() => {
    setSlideIndex(0);
    setPhotoIdx(0);
  }, [period]);

  // Auto-cycle photos & slides when playing
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      if (slideIndex === 0 && displayTxs.length > 1 && photoIdx < Math.min(displayTxs.length - 1, 4)) {
        setPhotoIdx(p => p + 1);
      } else {
        setPhotoIdx(0);
        setSlideIndex(s => (s + 1) % 3);
      }
    }, 3800);
    return () => clearInterval(timer);
  }, [playing, slideIndex, photoIdx, displayTxs.length]);

  const currentTx = displayTxs[photoIdx] ?? displayTxs[0] ?? null;
  const periodTitle = period === 1 ? '24 Giờ Qua (1 Ngày)' : period === 3 ? '3 Ngày Gần Nhất' : 'Hành Trình 1 Tuần (7 Ngày)';
  const maxDayExpense = Math.max(1, ...Object.values(stats.dayTotals).map(d => Math.max(d.expense, d.income)));

  return (
    <div className="cm-story-overlay" onClick={onClose}>
      <div className="cm-story-card" onClick={e => e.stopPropagation()}>
        {/* Story Progress Bars */}
        <div className="cm-story-bars">
          {[0, 1, 2].map(idx => (
            <button
              key={idx}
              type="button"
              className="cm-story-bar-track"
              onClick={() => setSlideIndex(idx)}
              aria-label={`Chuyển đến trang ${idx + 1}`}
            >
              <span
                className={`cm-story-bar-fill ${
                  idx < slideIndex ? 'done' : idx === slideIndex ? (playing ? 'active' : 'paused') : ''
                }`}
              />
            </button>
          ))}
        </div>

        {/* Top Header & Period Selector (1 Ngày | 3 Ngày | 1 Tuần) */}
        <header className="cm-story-header">
          <div className="cm-story-brand">
            <span className="cm-story-sparkle">
              <Sparkles size={15} />
            </span>
            <div>
              <strong>Nhìn lại kỷ niệm thu chi</strong>
              <small>{periodTitle}</small>
            </div>
          </div>

          <div className="cm-story-header-actions">
            <button
              type="button"
              className="cm-story-icon-btn"
              onClick={() => setPlaying(p => !p)}
              aria-label={playing ? 'Tạm dừng' : 'Phát tiếp'}
            >
              {playing ? <Pause size={15} /> : <Play size={15} />}
            </button>
            <button type="button" className="cm-story-icon-btn" onClick={onClose} aria-label="Đóng">
              <X size={17} />
            </button>
          </div>
        </header>

        {/* Period Switcher Pills */}
        <div className="cm-story-period-tabs">
          {([1, 3, 7] as LookbackPeriod[]).map(p => (
            <button
              key={p}
              type="button"
              className={`cm-story-period-btn ${period === p ? 'active' : ''}`}
              onClick={() => setPeriod(p)}
            >
              {p === 1 ? 'Sau 1 ngày' : p === 3 ? 'Sau 3 ngày' : 'Sau 1 tuần'}
            </button>
          ))}
        </div>

        {/* SLIDE 0: PHOTO FLASHBACK REEL */}
        {slideIndex === 0 && (
          <div className="cm-story-slide fade-in">
            <div className="cm-story-polaroid-wrap">
              {currentTx ? (
                <div className={`cm-story-polaroid ${currentTx.type}`} key={currentTx.id}>
                  <div className="cm-polaroid-media">
                    {currentTx.imageUrl ? (
                      <img src={currentTx.imageUrl} alt={currentTx.note} />
                    ) : (
                      <div className={`cm-polaroid-placeholder ${currentTx.type}`}>
                        {currentTx.type === 'income' ? <ArrowDownLeft size={48} /> : <ArrowUpRight size={48} />}
                        <span>{categoryNames[currentTx.categoryId] ?? 'Khoảnh khắc thu chi'}</span>
                      </div>
                    )}
                    <span className="cm-polaroid-date">
                      <Calendar size={12} /> {formatVNDate(currentTx.dateKey)}
                    </span>
                    <span className={`cm-polaroid-cat ${currentTx.type}`}>
                      {categoryNames[currentTx.categoryId] ?? 'Giao dịch'}
                    </span>
                  </div>

                  <div className="cm-polaroid-caption">
                    <strong className={currentTx.type}>
                      {currentTx.type === 'income' ? '+' : '−'}
                      {currentTx.amount.toLocaleString('vi-VN')}đ
                    </strong>
                    <p>{currentTx.note || (currentTx.type === 'income' ? 'Khoản thu nhập' : 'Khoản chi tiêu')}</p>
                  </div>
                </div>
              ) : (
                <div className="cm-story-empty-state">
                  <Sparkles size={36} />
                  <strong>Chưa có bill nào được chụp</strong>
                  <p>Hãy bấm dấu + trên lịch để chụp lại các hóa đơn và xem thước phim nhìn lại sau 1 ngày, 3 ngày, 1 tuần!</p>
                </div>
              )}

              {displayTxs.length > 1 && (
                <div className="cm-polaroid-dots">
                  {displayTxs.slice(0, 5).map((tx, idx) => (
                    <button
                      key={tx.id}
                      type="button"
                      className={`cm-polaroid-dot ${idx === photoIdx ? 'active' : ''}`}
                      onClick={() => setPhotoIdx(idx)}
                      aria-label={`Ảnh ${idx + 1}`}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* SLIDE 1: DAILY RHYTHM CHART */}
        {slideIndex === 1 && (
          <div className="cm-story-slide fade-in">
            <div className="cm-story-stats-row">
              <div className="cm-story-stat-box expense">
                <small>Tổng chi ({period} ngày)</small>
                <strong>−{stats.expense.toLocaleString('vi-VN')}đ</strong>
              </div>
              <div className="cm-story-stat-box income">
                <small>Tổng thu ({period} ngày)</small>
                <strong>+{stats.income.toLocaleString('vi-VN')}đ</strong>
              </div>
            </div>

            <div className="cm-story-chart-box">
              <div className="cm-story-chart-head">
                <strong>Nhịp độ chi tiêu theo ngày</strong>
                <small>TB: {stats.avgDailyExpense.toLocaleString('vi-VN')}đ/ngày</small>
              </div>
              <div className="cm-story-bars-chart">
                {dateKeys.map(k => {
                  const d = stats.dayTotals[k] ?? { income: 0, expense: 0 };
                  const expHeight = Math.max(8, Math.round((d.expense / maxDayExpense) * 120));
                  const incHeight = Math.max(8, Math.round((d.income / maxDayExpense) * 120));
                  return (
                    <div key={k} className="cm-story-bar-col">
                      <div className="cm-story-bar-pair">
                        {d.expense > 0 && (
                          <span
                            className="cm-bar-pill expense"
                            style={{ height: `${expHeight}px` }}
                            title={`Chi: ${d.expense.toLocaleString('vi-VN')}đ`}
                          />
                        )}
                        {d.income > 0 && (
                          <span
                            className="cm-bar-pill income"
                            style={{ height: `${incHeight}px` }}
                            title={`Thu: ${d.income.toLocaleString('vi-VN')}đ`}
                          />
                        )}
                        {d.expense === 0 && d.income === 0 && <span className="cm-bar-pill empty" />}
                      </div>
                      <small>{k.slice(8, 10)}/{k.slice(5, 7)}</small>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* SLIDE 2: HIGHLIGHTS & HABITS */}
        {slideIndex === 2 && (
          <div className="cm-story-slide fade-in">
            <div className="cm-story-highlights">
              <div className="cm-highlight-item">
                <span className="cm-highlight-icon gold">
                  <Trophy size={19} />
                </span>
                <div>
                  <small>Ngày không chi tiêu (No-Spend)</small>
                  <strong>
                    {stats.noSpendDays} / {period} ngày giữ ví an toàn 🌱
                  </strong>
                </div>
              </div>

              <div className="cm-highlight-item">
                <span className="cm-highlight-icon coral">
                  <Flame size={19} />
                </span>
                <div>
                  <small>Danh mục chi nhiều nhất</small>
                  <strong>
                    {stats.topCategory
                      ? `${categoryNames[stats.topCategory.id] ?? 'Khác'} (${stats.topCategory.amount.toLocaleString('vi-VN')}đ)`
                      : 'Chưa phát sinh khoản chi nào'}
                  </strong>
                </div>
              </div>

              <div className="cm-highlight-item">
                <span className="cm-highlight-icon blue">
                  <TrendingDown size={19} />
                </span>
                <div>
                  <small>Hóa đơn lớn nhất trong kỳ</small>
                  <strong>
                    {stats.biggestExpense
                      ? `${stats.biggestExpense.note || 'Chi tiêu'} (−${stats.biggestExpense.amount.toLocaleString('vi-VN')}đ)`
                      : '0đ — Rất tiết kiệm!'}
                  </strong>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer Slide Navigation */}
        <footer className="cm-story-footer">
          <button
            type="button"
            className="cm-story-nav-btn"
            onClick={() => setSlideIndex(s => (s + 2) % 3)}
          >
            <ChevronLeft size={17} /> Trước
          </button>
          <span className="cm-story-page-indicator">
            Trang {slideIndex + 1} / 3 • {stats.txCount} giao dịch
          </span>
          <button
            type="button"
            className="cm-story-nav-btn"
            onClick={() => setSlideIndex(s => (s + 1) % 3)}
          >
            Tiếp <ChevronRight size={17} />
          </button>
        </footer>
      </div>
    </div>
  );
}

function formatVNDate(dateKey: string) {
  const d = new Date(`${dateKey}T12:00:00`);
  return `${d.getDate()} thg ${d.getMonth() + 1}`;
}
