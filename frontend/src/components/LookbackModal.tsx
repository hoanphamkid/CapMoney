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
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Transaction } from '../services/api';

type LookbackPeriod = 1 | 3 | 7;
type FxMode = 'auto' | 'flip3d' | 'cinema' | 'polaroid' | 'neon';

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

const fxList: Array<{ id: FxMode; label: string }> = [
  { id: 'auto', label: '🌈 Tự đổi FX' },
  { id: 'flip3d', label: '🃏 Lật 3D' },
  { id: 'cinema', label: '🎬 Zoom Flash' },
  { id: 'polaroid', label: '📸 Tung ảnh' },
  { id: 'neon', label: '⚡ Sóng Neon' },
];

const activeFxCycle: Array<'flip3d' | 'cinema' | 'polaroid' | 'neon'> = ['flip3d', 'cinema', 'polaroid', 'neon'];

export function LookbackModal({ initialPeriod = 3, transactions, onClose }: LookbackModalProps) {
  const [period, setPeriod] = useState<LookbackPeriod>(initialPeriod);
  const [slideIndex, setSlideIndex] = useState(0); // 0: Photo Reel, 1: Daily Rhythm, 2: Insights
  const [photoIdx, setPhotoIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [fxMode, setFxMode] = useState<FxMode>('auto');
  const [isTouching, setIsTouching] = useState(false);
  const [dragX, setDragX] = useState(0);
  const [slideDir, setSlideDir] = useState<'next' | 'prev'>('next');
  const [pulseTick, setPulseTick] = useState(0);
  const [boothTheme, setBoothTheme] = useState<'dark' | 'pink' | 'neon' | 'retro'>('dark');
  const [exportError, setExportError] = useState('');

  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

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

  useEffect(() => {
    setPhotoIdx(0);
    setDragX(0);
  }, [period]);

  const goNextPhoto = () => {
    if (displayTxs.length <= 1) return;
    setSlideDir('next');
    setPulseTick(t => t + 1);
    setPhotoIdx(prev => (prev + 1) % displayTxs.length);
  };

  const goPrevPhoto = () => {
    if (displayTxs.length <= 1) return;
    setSlideDir('prev');
    setPulseTick(t => t + 1);
    setPhotoIdx(prev => (prev - 1 + displayTxs.length) % displayTxs.length);
  };

  // Auto-slide photos every 1 second (1000ms) when playing & not touching
  useEffect(() => {
    if (!playing || isTouching || slideIndex !== 0 || displayTxs.length <= 1) return;
    const timer = setInterval(() => {
      setSlideDir('next');
      setPulseTick(t => t + 1);
      setPhotoIdx(prev => (prev + 1) % displayTxs.length);
    }, 1000);
    return () => clearInterval(timer);
  }, [playing, isTouching, slideIndex, displayTxs.length]);

  // Touch & Pointer Swipe handlers for manual swiping (left/right or up/down)
  const handleSwipeStart = (clientX: number, clientY: number) => {
    touchStartRef.current = { x: clientX, y: clientY };
    setIsTouching(true);
    setDragX(0);
  };

  const handleSwipeMove = (clientX: number) => {
    if (!touchStartRef.current) return;
    const deltaX = clientX - touchStartRef.current.x;
    setDragX(Math.max(-150, Math.min(150, deltaX)));
  };

  const handleSwipeEnd = (clientX: number, clientY: number) => {
    if (!touchStartRef.current) {
      setIsTouching(false);
      setDragX(0);
      return;
    }
    const dx = clientX - touchStartRef.current.x;
    const dy = clientY - touchStartRef.current.y;
    touchStartRef.current = null;
    setIsTouching(false);
    setDragX(0);

    if (Math.abs(dx) > 30 || Math.abs(dy) > 40) {
      if (navigator.vibrate) navigator.vibrate(15);
      if (Math.abs(dx) >= Math.abs(dy)) {
        if (dx < 0) goNextPhoto();
        else goPrevPhoto();
      } else {
        if (dy < 0) goNextPhoto();
        else goPrevPhoto();
      }
    }
  };

  const currentTx = displayTxs[photoIdx] ?? displayTxs[0] ?? null;
  const nextTx = displayTxs.length > 1 ? displayTxs[(photoIdx + 1) % displayTxs.length] : null;
  const thirdTx = displayTxs.length > 2 ? displayTxs[(photoIdx + 2) % displayTxs.length] : null;

  const resolvedFx = fxMode === 'auto' ? activeFxCycle[photoIdx % activeFxCycle.length] : fxMode;

  const periodTitle =
    period === 1 ? '24 Giờ Qua (1 Ngày)' : period === 3 ? '3 Ngày Gần Nhất' : 'Hành Trình 1 Tuần (7 Ngày)';
  const maxDayExpense = Math.max(1, ...Object.values(stats.dayTotals).map(d => Math.max(d.expense, d.income)));
  const barCount = slideIndex === 0 ? Math.max(1, Math.min(displayTxs.length, 12)) : 4;

  // Export Korean Photobooth 4-Cut Strip with real photos
  const downloadPhotoboothStrip = async () => {
    setExportError('');
    const cuts = displayTxs.slice(0, 4);
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 1380;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const themeColors = {
      dark: { bg1: '#141722', bg2: '#0b0d13', text: '#ffffff', sub: '#9ba5bc', accent: '#c084fc' },
      pink: { bg1: '#fce7f3', bg2: '#fbcfe8', text: '#831843', sub: '#be185d', accent: '#ec4899' },
      neon: { bg1: '#1e1b4b', bg2: '#090d16', text: '#38bdf8', sub: '#f472b6', accent: '#a855f7' },
      retro: { bg1: '#fef3c7', bg2: '#fde68a', text: '#451a03', sub: '#92400e', accent: '#d97706' },
    }[boothTheme];

    const grad = ctx.createLinearGradient(0, 0, 0, 1380);
    grad.addColorStop(0, themeColors.bg1);
    grad.addColorStop(1, themeColors.bg2);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 640, 1380);

    // Film sprocket holes on left & right edges
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    for (let y = 30; y < 1340; y += 44) {
      ctx.fillRect(14, y, 12, 22);
      ctx.fillRect(614, y, 12, 22);
    }

    ctx.fillStyle = themeColors.text;
    ctx.font = 'bold 28px sans-serif';
    ctx.fillText('🎞️ CAPMONEY LIFE4CUTS', 48, 62);
    ctx.fillStyle = themeColors.sub;
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText(`${periodTitle} • Tổng chi: −${stats.expense.toLocaleString('vi-VN')}đ`, 48, 94);

    for (let i = 0; i < 4; i++) {
      const tx = cuts[i];
      const boxY = 120 + i * 285;
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(48, boxY, 544, 265);

      if (tx?.imageUrl && canvasImageIsSafe(tx.imageUrl)) {
        try {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          await new Promise<void>(resolve => {
            img.onload = () => resolve();
            img.onerror = () => resolve();
            img.src = tx.imageUrl!;
          });
          if (img.width > 0 && img.height > 0) {
            ctx.drawImage(img, 48, boxY, 544, 265);
          }
        } catch {
          // fallback if image fails
        }
      }

      // Dark bottom gradient for caption
      const capGrad = ctx.createLinearGradient(0, boxY + 170, 0, boxY + 265);
      capGrad.addColorStop(0, 'rgba(0,0,0,0)');
      capGrad.addColorStop(1, 'rgba(0,0,0,0.82)');
      ctx.fillStyle = capGrad;
      ctx.fillRect(48, boxY + 170, 544, 95);

      if (tx) {
        ctx.fillStyle = tx.type === 'income' ? '#7CE3A6' : '#FF8E88';
        ctx.font = 'bold 28px sans-serif';
        ctx.fillText(`${tx.type === 'income' ? '+' : '−'}${tx.amount.toLocaleString('vi-VN')}đ`, 68, boxY + 225);
        ctx.fillStyle = '#ffffff';
        ctx.font = '20px sans-serif';
        ctx.fillText(`${tx.note || 'Kỷ niệm'} • ${formatVNDate(tx.dateKey)}`, 68, boxY + 252);
      } else {
        ctx.fillStyle = '#9ba5bc';
        ctx.font = '22px sans-serif';
        ctx.fillText(`Khung ảnh #${i + 1} (Chụp thêm bill nhé!)`, 140, boxY + 145);
      }
    }

    ctx.fillStyle = themeColors.text;
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText('✨ cap-money.vercel.app • Nhật ký chi tiêu bằng ảnh', 72, 1320);

    try {
      await saveCanvasPng(canvas, `capmoney-photobooth-${period}d.png`, 'CapMoney Photobooth');
    } catch {
      setExportError('Không thể lưu PNG trên trình duyệt này. Hãy thử nút chia sẻ hoặc chụp màn hình ảnh đang mở.');
    }
  };

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
      <div className={`cm-story-card fx-stage-${resolvedFx}`} onClick={e => e.stopPropagation()}>
        {/* Ambient Floating Orbs & 1-Second Beat Pulse */}
        <div className="cm-story-ambient-orbs" aria-hidden="true">
          <span className="orb orb-1" />
          <span className="orb orb-2" />
        </div>

        {/* 1-Second Story Progress Bars */}
        <div
          className="cm-story-bars"
          style={{ gridTemplateColumns: `repeat(${barCount}, 1fr)` }}
        >
          {Array.from({ length: barCount }, (_, idx) => {
            const activeIdx = slideIndex === 0 ? photoIdx % barCount : slideIndex;
            const stateClass =
              idx < activeIdx
                ? 'done'
                : idx === activeIdx
                  ? playing && !isTouching && slideIndex === 0
                    ? 'active-1s'
                    : 'done'
                  : '';
            return (
              <button
                key={idx}
                type="button"
                className="cm-story-bar-track"
                onClick={() => {
                  if (slideIndex === 0) setPhotoIdx(idx);
                  else setSlideIndex(idx);
                }}
                aria-label={`Mục ${idx + 1}`}
              >
                <span
                  key={idx === activeIdx ? `fill-${photoIdx}-${playing}` : `static-${idx}`}
                  className={`cm-story-bar-fill ${stateClass}`}
                />
              </button>
            );
          })}
        </div>

        {/* Top Header & Play/Pause + Download Story */}
        <header className="cm-story-header">
          <div className="cm-story-brand">
            <span className={`cm-story-sparkle ${playing && slideIndex === 0 ? 'beat-1s' : ''}`}>
              <Sparkles size={15} />
            </span>
            <div>
              <strong>Nhìn lại kỷ niệm thu chi</strong>
              <small>
                {periodTitle} • {playing ? '⚡ Tự lướt 1s/ảnh' : 'Đang dừng (Vuốt tay)'}
              </small>
            </div>
          </div>

          <div className="cm-story-header-actions">
            <button
              type="button"
              className="cm-story-icon-btn"
              onClick={downloadStoryCard}
              title="Tải ảnh Story tổng kết về máy"
              aria-label="Tải ảnh Story"
            >
              <Download size={15} />
            </button>
            <button
              type="button"
              className="cm-story-icon-btn"
              onClick={() => setPlaying(p => !p)}
              title={playing ? 'Tạm dừng tự lướt' : 'Bật tự động lướt 1s'}
              aria-label={playing ? 'Tạm dừng' : 'Phát tiếp'}
            >
              {playing ? <Pause size={15} /> : <Play size={15} />}
            </button>
            <button type="button" className="cm-story-icon-btn" onClick={onClose} aria-label="Đóng">
              <X size={17} />
            </button>
          </div>
        </header>

        {/* Period Switcher Pills (1 Ngày | 3 Ngày | 1 Tuần) */}
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

        {/* FX Selector Bar for 1-Second Auto Transition */}
        {slideIndex === 0 && (
          <div className="cm-fx-selector-row">
            <WandSparkles size={13} className="cm-fx-icon" />
            {fxList.map(item => (
              <button
                key={item.id}
                type="button"
                className={`cm-fx-chip ${fxMode === item.id ? 'active' : ''}`}
                onClick={() => setFxMode(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}

        {/* SLIDE 0: PHOTO FLASHBACK REEL (3D STACK + 1S FX + TOUCH SWIPE) */}
        {slideIndex === 0 && (
          <div className="cm-story-slide fade-in">
            <div
              className="cm-story-polaroid-wrap swipeable"
              onTouchStart={e => {
                const t = e.touches[0];
                if (t) handleSwipeStart(t.clientX, t.clientY);
              }}
              onTouchMove={e => {
                const t = e.touches[0];
                if (t) handleSwipeMove(t.clientX);
              }}
              onTouchEnd={e => {
                const t = e.changedTouches[0];
                if (t) handleSwipeEnd(t.clientX, t.clientY);
              }}
              onPointerDown={e => {
                if (e.pointerType === 'mouse') handleSwipeStart(e.clientX, e.clientY);
              }}
              onPointerMove={e => {
                if (e.pointerType === 'mouse' && isTouching) handleSwipeMove(e.clientX);
              }}
              onPointerUp={e => {
                if (e.pointerType === 'mouse') handleSwipeEnd(e.clientX, e.clientY);
              }}
            >
              {currentTx ? (
                <div className="cm-polaroid-deck">
                  {/* Background Stacked Cards for 3D Depth */}
                  {thirdTx && (
                    <div className="cm-polaroid-ghost ghost-2" aria-hidden="true">
                      {thirdTx.imageUrl && <img src={thirdTx.imageUrl} alt="" />}
                    </div>
                  )}
                  {nextTx && (
                    <div className="cm-polaroid-ghost ghost-1" aria-hidden="true">
                      {nextTx.imageUrl && <img src={nextTx.imageUrl} alt="" />}
                    </div>
                  )}

                  {/* Floating 1s Beat Emojis */}
                  {playing && !isTouching && (
                    <div key={`particles-${pulseTick}`} className="cm-1s-particles" aria-hidden="true">
                      <span className="p1">{currentTx.type === 'income' ? '💰' : '💸'}</span>
                      <span className="p2">✨</span>
                      <span className="p3">{currentTx.type === 'income' ? '🎉' : '🔥'}</span>
                    </div>
                  )}

                  {/* Active Foreground Polaroid Card with 1s Transition Effect */}
                  <div
                    className={`cm-story-polaroid ${currentTx.type} fx-${resolvedFx} slide-${slideDir}`}
                    key={`${currentTx.id}-${photoIdx}`}
                    style={
                      dragX !== 0
                        ? {
                            transform: `translateX(${dragX}px) rotate(${dragX * 0.045}deg)`,
                            transition: 'none',
                          }
                        : undefined
                    }
                  >
                    {/* Light Shimmer & Camera Flash Overlay on 1s Change */}
                    <span className="cm-polaroid-shimmer" aria-hidden="true" />

                    <div className="cm-polaroid-media">
                      {currentTx.imageUrl ? (
                        <img
                          src={currentTx.imageUrl}
                          alt={currentTx.note}
                          className="cm-polaroid-zoom-img"
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
                            onClick={e => {
                              e.stopPropagation();
                              goPrevPhoto();
                            }}
                            aria-label="Ảnh trước"
                          >
                            <ChevronLeft size={20} />
                          </button>
                          <button
                            type="button"
                            className="cm-polaroid-side-arrow right"
                            onClick={e => {
                              e.stopPropagation();
                              goNextPhoto();
                            }}
                            aria-label="Ảnh tiếp theo"
                          >
                            <ChevronRight size={20} />
                          </button>
                        </>
                      )}
                    </div>

                    <div className="cm-polaroid-caption">
                      <strong className={`${currentTx.type} cm-price-pop`}>
                        {currentTx.type === 'income' ? '+' : '−'}
                        {currentTx.amount.toLocaleString('vi-VN')}đ
                      </strong>
                      <p>{currentTx.note || (currentTx.type === 'income' ? 'Khoản thu nhập' : 'Khoản chi tiêu')}</p>
                      <small className="cm-swipe-hint">
                        👆 Vuốt tay hoặc tự động lướt 1s • Ảnh {photoIdx + 1}/{displayTxs.length}
                      </small>
                    </div>
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

        {/* SLIDE 3: KOREAN PHOTOBOOTH / LOCKET 4-CUT COLLAGE */}
        {slideIndex === 3 && (
          <div className="cm-story-slide fade-in">
            <div className="cm-fx-selector-row">
              {(
                [
                  { id: 'dark', label: '🖤 Film Đen' },
                  { id: 'pink', label: '🌸 Đào Pastel' },
                  { id: 'neon', label: '💜 Tím Neon' },
                  { id: 'retro', label: '☕ Kem Retro' },
                ] as const
              ).map(th => (
                <button
                  key={th.id}
                  type="button"
                  className={`cm-fx-chip ${boothTheme === th.id ? 'active' : ''}`}
                  onClick={() => setBoothTheme(th.id)}
                >
                  {th.label}
                </button>
              ))}
            </div>

            <div className={`cm-photobooth-frame theme-${boothTheme}`}>
              <div className="cm-photobooth-head">
                <strong>🎞️ CAPMONEY LIFE4CUTS</strong>
                <span>−{stats.expense.toLocaleString('vi-VN')}đ</span>
              </div>
              <div className="cm-photobooth-grid">
                {[0, 1, 2, 3].map(idx => {
                  const tx = displayTxs[idx];
                  return (
                    <div key={idx} className="cm-photobooth-cell">
                      {tx?.imageUrl ? (
                        <img src={tx.imageUrl} alt={tx.note || 'Bill'} />
                      ) : (
                        <div className="cm-photobooth-empty">
                          <span>#{idx + 1}</span>
                        </div>
                      )}
                      {tx && (
                        <div className="cm-photobooth-tag">
                          <b>
                            {tx.type === 'income' ? '+' : '−'}
                            {tx.amount.toLocaleString('vi-VN')}đ
                          </b>
                          <small>{tx.note || formatVNDate(tx.dateKey)}</small>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <button
                type="button"
                className="cm-photobooth-dl-btn"
                onClick={() => void downloadPhotoboothStrip()}
              >
                <Download size={14} /> Lưu / chia sẻ Photobooth (PNG)
              </button>
            {exportError && <p className="cm-photobooth-export-note" role="alert">{exportError}</p>}
            </div>
          </div>
        )}

        {/* Footer View Mode Switcher (Ảnh Kỷ Niệm | Photobooth | Biểu Đồ | Tổng Kết) */}
        <footer className="cm-story-footer">
          <button
            type="button"
            className={`cm-story-nav-btn ${slideIndex === 0 ? 'active' : ''}`}
            onClick={() => setSlideIndex(0)}
          >
            <Camera size={14} /> 1s Reel ({displayTxs.length})
          </button>
          <button
            type="button"
            className={`cm-story-nav-btn ${slideIndex === 3 ? 'active' : ''}`}
            onClick={() => setSlideIndex(3)}
          >
            <WandSparkles size={14} /> Photobooth
          </button>
          <button
            type="button"
            className={`cm-story-nav-btn ${slideIndex === 1 ? 'active' : ''}`}
            onClick={() => setSlideIndex(1)}
          >
            <BarChart3 size={14} /> Biểu đồ
          </button>
          <button
            type="button"
            className={`cm-story-nav-btn ${slideIndex === 2 ? 'active' : ''}`}
            onClick={() => setSlideIndex(2)}
          >
            <Trophy size={14} /> Điểm nhấn
          </button>
        </footer>
      </div>
    </div>
  );
}

function canvasImageIsSafe(source: string) {
  try {
    const url = new URL(source, window.location.href);
    return url.protocol === 'data:' || url.protocol === 'blob:' || url.origin === window.location.origin;
  } catch {
    return false;
  }
}

async function saveCanvasPng(canvas: HTMLCanvasElement, filename: string, title: string) {
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('PNG blob unavailable');

  const file = new File([blob], filename, { type: 'image/png' });
  if (typeof navigator.share === 'function' && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
    try {
      await navigator.share({ title, files: [file] });
      return;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
    }
  }

  const url = URL.createObjectURL(blob);
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (isMobile) {
    const opened = window.open(url, '_blank', 'noopener,noreferrer');
    if (!opened) {
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
    }
  } else {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function formatVNDate(dateKey: string) {
  const d = new Date(`${dateKey}T12:00:00`);
  return `${d.getDate()} thg ${d.getMonth() + 1}`;
}
