import {
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  Calendar,
  Camera,
  ChevronLeft,
  ChevronRight,
  Download,
  Flame,
  Pause,
  Play,
  Sparkles,
  TrendingDown,
  Trophy,
  WandSparkles,
  X,
} from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Transaction } from '../services/api';
import { ALL_CATEGORY_LABELS } from '../constants/categories';
import { buildDateKeys, formatVNDate } from '../utils/lookbackDates';
import { saveCanvasPng } from '../utils/saveCanvasPng';
import { Photobooth } from './Photobooth';

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
  Object.assign(categoryNames, ALL_CATEGORY_LABELS);
  const [period, setPeriod] = useState<LookbackPeriod>(initialPeriod);
  const [slideIndex, setSlideIndex] = useState(0); // 0: Photo Reel, 1: Daily Rhythm, 2: Insights
  const [photoIdx, setPhotoIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [isTouching, setIsTouching] = useState(false);
  const [fadeCount, setFadeCount] = useState(0);
  const [exportError, setExportError] = useState('');

  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const previousPhotoId = useRef<string | undefined>(undefined);

  const dateKeys = useMemo(() => {
    return buildDateKeys(period);
  }, [period]);

  const periodTxs = useMemo(() => {
    const minKey = dateKeys[0] ?? '';
    const maxKey = dateKeys[dateKeys.length - 1] ?? '';
    return transactions
      .filter(tx => tx.dateKey >= minKey && tx.dateKey <= maxKey)
      .sort((a, b) => b.dateKey.localeCompare(a.dateKey));
  }, [transactions, dateKeys]);

  // Prefer transactions with photos first, or fallback to all recent transactions so the reel is always rich
  const displayTxs = useMemo(() => {
    const source = periodTxs.length > 0 ? periodTxs : transactions.slice(0, 20);
    const withPhotos = source.filter(tx => Boolean(tx.imageUrl));
    return withPhotos.length > 0 ? [...withPhotos, ...source.filter(tx => !tx.imageUrl)] : source;
  }, [periodTxs, transactions]);

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

  const photoCount = displayTxs.length;
  const activePhotoIndex = photoCount ? photoIdx % photoCount : 0;
  const currentTx = displayTxs[activePhotoIndex];
  const currentPhotoId = slideIndex === 0 ? currentTx?.id : undefined;

  useLayoutEffect(() => {
    if (previousPhotoId.current && currentPhotoId && previousPhotoId.current !== currentPhotoId) {
      setFadeCount(count => count + 1);
    }
    previousPhotoId.current = currentPhotoId;
  }, [currentPhotoId]);

  const stepPhoto = (direction: 1 | -1) => {
    setPlaying(false);
    if (photoCount > 1) setPhotoIdx(index => (index + photoCount + direction) % photoCount);
  };

  const selectPhoto = (index: number) => {
    setPlaying(false);
    setPhotoIdx(index);
  };

  const selectSlide = (index: number) => {
    setSlideIndex(index);
    if (index !== 0) {
      setPlaying(false);
      setFadeCount(0);
    }
  };

  // Auto-slide photos every 1 second (1000ms) when playing & not touching
  useEffect(() => {
    if (!playing || isTouching || slideIndex !== 0 || photoCount <= 1) return;
    const timer = setTimeout(() => setPhotoIdx((activePhotoIndex + 1) % photoCount), 1000);
    return () => clearTimeout(timer);
  }, [playing, isTouching, slideIndex, photoCount, activePhotoIndex]);

  // Touch & Pointer Swipe handlers for manual swiping (left/right or up/down)
  const handleSwipeStart = (clientX: number, clientY: number) => {
    touchStartRef.current = { x: clientX, y: clientY };
    setIsTouching(true);
  };

  const cancelSwipe = () => {
    touchStartRef.current = null;
    setIsTouching(false);
  };

  const handleSwipeEnd = (clientX: number, clientY: number) => {
    const start = touchStartRef.current;
    cancelSwipe();
    if (!start) return;
    const dx = clientX - start.x;
    const dy = clientY - start.y;
    const horizontal = Math.abs(dx) >= Math.abs(dy);
    const distance = horizontal ? dx : dy;
    if (Math.abs(distance) > (horizontal ? 30 : 40)) stepPhoto(distance < 0 ? 1 : -1);
  };

  const periodTitle =
    period === 1 ? '24 Giờ Qua (1 Ngày)' : period === 3 ? '3 Ngày Gần Nhất' : 'Hành Trình 1 Tuần (7 Ngày)';
  const maxDayExpense = Math.max(1, ...Object.values(stats.dayTotals).map(d => Math.max(d.expense, d.income)));
  const barCount = slideIndex === 0 ? Math.max(1, Math.min(displayTxs.length, 12)) : 4;

  // Export Story Card as PNG Image
  const downloadStoryCard = async () => {
    setExportError('');
    const canvas = document.createElement('canvas');
    canvas.width = 720;
    canvas.height = 1080;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const grad = ctx.createLinearGradient(0, 0, 720, 1080);
    grad.addColorStop(0, '#271d47');
    grad.addColorStop(0.5, '#151824');
    grad.addColorStop(1, '#0e1017');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 720, 1080);

    ctx.fillStyle = '#cdb4ff';
    ctx.font = 'bold 28px sans-serif';
    ctx.fillText(`✨ CAPMONEY • NHÌN LẠI ${periodTitle.toUpperCase()}`, 48, 76);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 54px sans-serif';
    ctx.fillText(`Tổng chi: −${stats.expense.toLocaleString('vi-VN')}đ`, 48, 155);

    ctx.fillStyle = '#7CE3A6';
    ctx.font = 'bold 36px sans-serif';
    ctx.fillText(`Tổng thu: +${stats.income.toLocaleString('vi-VN')}đ`, 48, 210);

    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.roundRect?.(48, 260, 624, 520, 28);
    ctx.fill();

    ctx.fillStyle = '#ffd166';
    ctx.font = 'bold 30px sans-serif';
    ctx.fillText(`🌱 Ngày không chi tiêu: ${stats.noSpendDays}/${period} ngày`, 80, 340);

    ctx.fillStyle = '#ff9e99';
    ctx.fillText(
      `🔥 Chi nhiều nhất: ${
        stats.topCategory ? `${categoryNames[stats.topCategory.id] ?? 'Khác'} (${stats.topCategory.amount.toLocaleString('vi-VN')}đ)` : '0đ'
      }`,
      80,
      415,
    );

    if (currentTx) {
      ctx.fillStyle = '#e5eaf5';
      ctx.font = 'bold 32px sans-serif';
      ctx.fillText(`📸 Kỷ niệm nổi bật (${formatVNDate(currentTx.dateKey)}):`, 80, 510);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 46px sans-serif';
      ctx.fillText(
        `${currentTx.type === 'income' ? '+' : '−'}${currentTx.amount.toLocaleString('vi-VN')}đ — ${currentTx.note || 'Giao dịch'}`,
        80,
        575,
      );
    }

    ctx.fillStyle = '#8d96ab';
    ctx.font = '24px sans-serif';
    ctx.fillText('cap-money.vercel.app • Quản lý chi tiêu bằng hình ảnh', 48, 1020);

    try {
      await saveCanvasPng(canvas, `capmoney-lookback-${period}d.png`, 'CapMoney Story');
    } catch {
      setExportError('Không thể lưu PNG trên trình duyệt này. Hãy thử nút chia sẻ hoặc chụp màn hình ảnh đang mở.');
    }
  };

  return (
    <div className="cm-story-overlay" onClick={onClose}>
      {fadeCount > 0 && <div key={fadeCount} className="cm-story-photo-fade" aria-hidden="true" />}
      <div className="cm-story-card" data-story-view={slideIndex === 3 ? 'photobooth' : undefined} onClick={e => e.stopPropagation()}>

        {/* 1-Second Story Progress Bars */}
        {slideIndex !== 3 && <div
          className="cm-story-bars"
          style={{ gridTemplateColumns: `repeat(${barCount}, 1fr)` }}
        >
          {Array.from({ length: barCount }, (_, idx) => {
            const activeIdx = slideIndex === 0 ? activePhotoIndex % barCount : slideIndex;
            return (
              <button
                key={idx}
                type="button"
                className="cm-story-bar-track"
                onClick={() => {
                  if (slideIndex === 0) selectPhoto(idx);
                  else selectSlide(idx);
                }}
                aria-label={`Mục ${idx + 1}`}
              >
                <span className={`cm-story-bar-fill ${idx <= activeIdx ? 'done' : ''}`} />
              </button>
            );
          })}
        </div>}

        {/* Top Header & Play/Pause + Download Story */}
        <header className="cm-story-header">
          <div className="cm-story-brand">
            <span className="cm-story-sparkle">
              <Sparkles size={15} />
            </span>
            <div>
              <strong>{slideIndex === 3 ? 'Photobooth' : 'Nhìn lại kỷ niệm thu chi'}</strong>
              {slideIndex !== 3 && <small>
                {periodTitle}{slideIndex === 0 && photoCount > 1 ? (playing ? ' · 1 giây/ảnh' : ' · Vuốt để chuyển ảnh') : ''}
              </small>}
            </div>
          </div>

          <div className="cm-story-header-actions">
            {slideIndex !== 3 && <button
              type="button"
              className="cm-story-icon-btn"
              onClick={downloadStoryCard}
              title="Tải ảnh Story tổng kết về máy"
              aria-label="Tải ảnh Story"
            >
              <Download size={15} />
            </button>}
            {slideIndex === 0 && photoCount > 1 && <button
              type="button"
              className="cm-story-icon-btn cm-story-play"
              onClick={() => setPlaying(p => !p)}
              aria-pressed={playing}
            >
              {playing ? <Pause size={15} aria-hidden="true" /> : <Play size={15} aria-hidden="true" />}
              {playing ? 'Tạm dừng' : 'Phát'}
            </button>}
            <button type="button" className="cm-story-icon-btn" onClick={onClose} aria-label="Đóng">
              <X size={17} />
            </button>
          </div>
        </header>

        {/* Period Switcher Pills (1 Ngày | 3 Ngày | 1 Tuần) */}
        {slideIndex !== 3 && <div className="cm-story-period-tabs">
          {([1, 3, 7] as LookbackPeriod[]).map(p => (
            <button
              key={p}
              type="button"
              className={`cm-story-period-btn ${period === p ? 'active' : ''}`}
              onClick={() => {
                if (p === period) return;
                setPeriod(p);
                selectPhoto(0);
              }}
            >
              {p === 1 ? 'Sau 1 ngày' : p === 3 ? 'Sau 3 ngày' : 'Sau 1 tuần'}
            </button>
          ))}
        </div>}

        {/* Photo reel */}
        {slideIndex === 0 && (
          <div className="cm-story-slide">
            <div
              className="cm-story-polaroid-wrap swipeable"
              onTouchStart={e => {
                const t = e.touches[0];
                if (t) handleSwipeStart(t.clientX, t.clientY);
              }}
              onTouchEnd={e => {
                const t = e.changedTouches[0];
                if (t) handleSwipeEnd(t.clientX, t.clientY);
              }}
              onTouchCancel={cancelSwipe}
              onPointerCancel={cancelSwipe}
              onPointerLeave={e => {
                if (e.pointerType === 'mouse') cancelSwipe();
              }}
              onPointerDown={e => {
                if (e.pointerType === 'mouse') handleSwipeStart(e.clientX, e.clientY);
              }}
              onPointerUp={e => {
                if (e.pointerType === 'mouse') handleSwipeEnd(e.clientX, e.clientY);
              }}
            >
              {currentTx ? (
                <div className={`cm-story-polaroid ${currentTx.type}`}>
                  <div className="cm-polaroid-media">
                    {currentTx.imageUrl ? (
                      <img
                        src={currentTx.imageUrl}
                        alt={currentTx.note}
                        draggable={false}
                      />
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

                    {displayTxs.length > 1 && (
                      <>
                        <button
                          type="button"
                          className="cm-polaroid-side-arrow left"
                          onClick={() => stepPhoto(-1)}
                          aria-label="Ảnh trước"
                        >
                          <ChevronLeft size={20} />
                        </button>
                        <button
                          type="button"
                          className="cm-polaroid-side-arrow right"
                          onClick={() => stepPhoto(1)}
                          aria-label="Ảnh tiếp theo"
                        >
                          <ChevronRight size={20} />
                        </button>
                      </>
                    )}
                  </div>

                  <div className="cm-polaroid-caption">
                    <strong className={currentTx.type}>
                      {currentTx.type === 'income' ? '+' : '−'}
                      {currentTx.amount.toLocaleString('vi-VN')}đ
                    </strong>
                    <p>{currentTx.note || (currentTx.type === 'income' ? 'Khoản thu nhập' : 'Khoản chi tiêu')}</p>
                    <small className="cm-swipe-hint">
                      Ảnh {activePhotoIndex + 1}/{photoCount}
                    </small>
                  </div>
                </div>
              ) : (
                <div className="cm-story-empty-state">
                  <Sparkles size={36} />
                  <strong>Chưa có bill nào được chụp</strong>
                  <p>
                    Hãy bấm dấu + trên lịch để chụp lại các hóa đơn và xem thước phim nhìn lại sau 1 ngày, 3 ngày, 1
                    tuần!
                  </p>
                </div>
              )}

              {displayTxs.length > 1 && (
                <div className="cm-polaroid-dots">
                  {displayTxs.slice(0, 10).map((tx, idx) => (
                    <button
                      key={tx.id}
                      type="button"
                      className={`cm-polaroid-dot ${idx === activePhotoIndex ? 'active' : ''}`}
                          onClick={() => selectPhoto(idx)}
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
          <div className="cm-story-slide">
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
                      <small>
                        {k.slice(8, 10)}/{k.slice(5, 7)}
                      </small>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* SLIDE 2: HIGHLIGHTS & HABITS */}
        {slideIndex === 2 && (
          <div className="cm-story-slide">
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

        <div hidden={slideIndex !== 3}><Photobooth transactions={transactions} /></div>

        {/* Footer View Mode Switcher (Ảnh Kỷ Niệm | Photobooth | Biểu Đồ | Tổng Kết) */}
        <footer className="cm-story-footer">
          <button
            type="button"
            className={`cm-story-nav-btn ${slideIndex === 0 ? 'active' : ''}`}
            onClick={() => selectSlide(0)}
          >
            <Camera size={14} /> Kỷ niệm
          </button>
          <button
            type="button"
            className={`cm-story-nav-btn ${slideIndex === 3 ? 'active' : ''}`}
            onClick={() => selectSlide(3)}
          >
            <WandSparkles size={14} /> Photobooth
          </button>
          <button
            type="button"
            className={`cm-story-nav-btn ${slideIndex === 1 ? 'active' : ''}`}
            onClick={() => selectSlide(1)}
          >
            <BarChart3 size={14} /> Biểu đồ
          </button>
          <button
            type="button"
            className={`cm-story-nav-btn ${slideIndex === 2 ? 'active' : ''}`}
            onClick={() => selectSlide(2)}
          >
            <Trophy size={14} /> Điểm nhấn
          </button>
        </footer>
        {exportError && <p className="cm-photobooth-export-note" role="alert">{exportError}</p>}
      </div>
    </div>
  );
}
