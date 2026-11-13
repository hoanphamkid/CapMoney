import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Clock,
  CloudUpload,
  Eye,
  EyeOff,
  Flame,
  Image as ImageIcon,
  LayoutGrid,
  Leaf,
  Paintbrush,
  PiggyBank,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  UserRound,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ExpenseCapture } from '../components/ExpenseCapture';
import { ExpenseDetail } from '../components/ExpenseDetail';
import { LookbackModal } from '../components/LookbackModal';
import { SmartToolkitModal } from '../components/SmartToolkitModal';
import { loadBudget, SpendingLimitModal, type BudgetConfig } from '../components/SpendingLimitModal';
import { useAuth } from '../contexts/AuthContext';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { api, type CalendarEvent, type Transaction } from '../services/api';

const weekdayLabels = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

const categoryNames: Record<string, string> = {
  food: 'Ăn uống',
  shopping: 'Mua sắm',
  transport: 'Di chuyển',
  bills: 'Hóa đơn',
  entertainment: 'Giải trí',
  health: 'Sức khỏe',
  salary: 'Lương',
  bonus: 'Thưởng',
  investment: 'Đầu tư',
  gift: 'Được tặng',
  transfer: 'Chuyển tiền',
  other: 'Khác',
};

export function CalendarPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [cursor, setCursor] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(todayKey());
  const [dayViewDate, setDayViewDate] = useState<string | null>(null);
  const [dayViewLayout, setDayViewLayout] = useState<'timeline' | 'grid' | 'list'>('grid');
  const [daySlideAnim, setDaySlideAnim] = useState<'next' | 'prev' | null>(null);
  const dayTouchRef = useRef<{ x: number; y: number } | null>(null);
  const [dayTouchDx, setDayTouchDx] = useState(0);
  const [captureDate, setCaptureDate] = useState<string | null>(null);
  const [captureType, setCaptureType] = useState<'expense' | 'income'>('expense');
  const [detailEvent, setDetailEvent] = useState<CalendarEvent | null>(null);

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  const [hideAll, setHideAll] = useState(false);
  const [hideExpense, setHideExpense] = useState(false);
  const [hideIncome, setHideIncome] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [lookbackPeriod, setLookbackPeriod] = useState<1 | 3 | 7 | null>(null);
  const [budgetModalOpen, setBudgetModalOpen] = useState(false);
  const [toolkitOpen, setToolkitOpen] = useState(false);
  const [budget, setBudget] = useState<BudgetConfig>(() => loadBudget());

  const monthRange = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    return { from: toDateKey(first), to: toDateKey(last), year, month, daysInMonth: last.getDate(), firstWeekdayOffset: (first.getDay() + 6) % 7 };
  }, [cursor]);

  const reload = async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const txRes = await api.transactions({ from: monthRange.from, to: monthRange.to });
      setTransactions(txRes.transactions);
    } finally {
      if (!quiet) setLoading(false);
    }
  };

  useAutoRefresh(() => reload(true));

  useEffect(() => {
    void reload();
  }, [monthRange.from, monthRange.to]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter(tx => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const cat = (categoryNames[tx.categoryId] ?? tx.categoryId).toLowerCase();
        if (!tx.note.toLowerCase().includes(q) && !cat.includes(q)) return false;
      }
      return true;
    });
  }, [transactions, searchQuery]);

  const byDay = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    for (const tx of filteredTransactions) {
      const ev: CalendarEvent = {
        id: tx.id,
        kind: tx.type,
        type: tx.type,
        title: tx.note || categoryNames[tx.categoryId] || (tx.type === 'income' ? 'Thu nhập' : 'Chi tiêu'),
        amount: tx.amount,
        amountMinor: tx.amountMinor,
        dateKey: tx.dateKey,
        note: tx.note,
        categoryId: tx.categoryId,
        walletId: tx.walletId,
        imageUrl: tx.imageUrl,
        status: tx.status,
        source: tx.source || 'transaction',
        transactionTime: tx.transactionTime,
        time: tx.transactionTime,
        createdAt: tx.createdAt,
      };
      map[tx.dateKey] = [...(map[tx.dateKey] ?? []), ev];
    }
    return map;
  }, [filteredTransactions]);

  const totals = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const tx of filteredTransactions) {
      if (tx.type === 'income') income += tx.amount;
      else if (tx.type === 'expense') expense += tx.amount;
    }
    return { income, expense };
  }, [filteredTransactions]);

  const today = todayKey();
  const todayExpense = useMemo(() => {
    return transactions
      .filter(tx => tx.dateKey === today && tx.type === 'expense')
      .reduce((sum, tx) => sum + tx.amount, 0);
  }, [transactions, today]);

  const activeDaysCount = Object.keys(byDay).length;
  const displayName = user?.name || 'Daryl';
  const greeting = getGreeting();

  const handleDayClick = (key: string) => {
    setSelectedDate(key);
    const dayEvents = byDay[key] ?? [];
    if (dayEvents.length > 0) {
      setDayViewDate(key);
    } else {
      setCaptureType('expense');
      setCaptureDate(key);
    }
  };

  const getAdjacentDayKey = (baseKey: string, offset: number) => {
    const [y, m, d] = baseKey.split('-').map(Number);
    const dt = new Date(y, m - 1, d + offset);
    return toDateKey(dt);
  };

  const handlePrevDay = () => {
    if (!dayViewDate) return;
    setDaySlideAnim('prev');
    const prev = getAdjacentDayKey(dayViewDate, -1);
    setDayViewDate(prev);
    if (navigator.vibrate) navigator.vibrate(12);
  };

  const handleNextDay = () => {
    if (!dayViewDate) return;
    setDaySlideAnim('next');
    const next = getAdjacentDayKey(dayViewDate, 1);
    setDayViewDate(next);
    if (navigator.vibrate) navigator.vibrate(12);
  };

  const onDayTouchStart = (clientX: number, clientY: number) => {
    dayTouchRef.current = { x: clientX, y: clientY };
    setDayTouchDx(0);
  };

  const onDayTouchMove = (clientX: number) => {
    if (!dayTouchRef.current) return;
    setDayTouchDx(clientX - dayTouchRef.current.x);
  };

  const onDayTouchEnd = () => {
    if (!dayTouchRef.current || !dayViewDate) return;
    const dx = dayTouchDx;
    dayTouchRef.current = null;
    setDayTouchDx(0);
    if (Math.abs(dx) > 42) {
      if (dx < 0) handleNextDay();
      else handlePrevDay();
    }
  };

  const dayViewEvents = useMemo(() => {
    if (!dayViewDate) return [];
    if (byDay[dayViewDate]) return byDay[dayViewDate];
    return transactions
      .filter(tx => tx.dateKey === dayViewDate)
      .map(tx => ({
        id: tx.id,
        kind: tx.type,
        type: tx.type,
        title: tx.note || (tx.type === 'income' ? 'Thu nhập' : 'Chi tiêu'),
        amount: tx.amount,
        amountMinor: tx.amountMinor,
        dateKey: tx.dateKey,
        note: tx.note,
        categoryId: tx.categoryId,
        walletId: tx.walletId,
        imageUrl: tx.imageUrl,
        status: tx.status,
        source: (tx.source as any) || 'transaction',
        transactionTime: tx.transactionTime,
        time: tx.transactionTime,
        createdAt: tx.createdAt,
      }));
  }, [dayViewDate, byDay, transactions]);

  const dayViewNet = useMemo(() => {
    let inc = 0;
    let exp = 0;
    for (const ev of dayViewEvents) {
      if (ev.kind === 'income') inc += ev.amount ?? 0;
      else if (ev.kind === 'expense') exp += ev.amount ?? 0;
    }
    return { income: inc, expense: exp, net: inc - exp };
  }, [dayViewEvents]);

  const isCurrentMonth = cursor.getFullYear() === new Date().getFullYear() && cursor.getMonth() === new Date().getMonth();

  // Budget & Safe Daily Allowance calculations
  const budgetMetrics = useMemo(() => {
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const currentDay = Math.max(1, now.getDate());
    const remainingDays = Math.max(1, daysInMonth - currentDay + 1);
    const remainingBudget = Math.max(0, budget.monthlyLimit - totals.expense);
    const safeDailySpend = Math.round(remainingBudget / remainingDays);
    const monthPercent = budget.monthlyLimit > 0 ? Math.min(100, Math.round((totals.expense / budget.monthlyLimit) * 100)) : 0;
    const isOverMonth = budget.monthlyLimit > 0 && totals.expense > budget.monthlyLimit;
    const isOverDay = budget.dailyLimit > 0 && todayExpense > budget.dailyLimit;

    // Count days within daily budget in the last 7 days
    let safeDaysCount = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const k = toDateKey(d);
      const dayExp = (byDay[k] ?? []).reduce((s, e) => s + (e.kind === 'expense' ? e.amount ?? 0 : 0), 0);
      if (dayExp <= budget.dailyLimit) safeDaysCount++;
    }

    return {
      safeDailySpend,
      monthPercent,
      isOverMonth,
      isOverDay,
      safeDaysCount,
    };
  }, [budget, totals.expense, todayExpense, byDay]);

  return (
    <div className="cm-home-screen">
      {/* Top User Greeting Header */}
      <header className="cm-top-header">
        <div className="cm-greeting-block">
          <p className="cm-greeting-sub">
            {greeting.text} <span>{greeting.emoji}</span>
          </p>
          <h1 className="cm-user-title">{displayName}</h1>
          <div className="cm-status-badges">
            <span className="cm-badge-green">
              <Leaf size={12} />
              {todayExpense === 0 ? 'Hôm nay chưa chi tiêu' : `Hôm nay chi ${todayExpense.toLocaleString('vi-VN')}đ`}
            </span>
            <button
              type="button"
              className="cm-badge-blue clickable"
              onClick={() => setBudgetModalOpen(true)}
              title="Đặt hạn mức chi tiêu"
            >
              <Target size={12} /> Hạn mức {budgetMetrics.monthPercent}%
            </button>
            <button
              type="button"
              className="cm-badge-purple clickable"
              onClick={() => setLookbackPeriod(3)}
              title="Nhìn lại kỷ niệm chi tiêu"
            >
              <Sparkles size={12} /> Nhìn lại
            </button>
            <button
              type="button"
              className="cm-badge-blue clickable"
              onClick={() => navigate('/app/sync')}
              title="Đồng bộ dữ liệu và lịch sử bản sao"
            >
              <CloudUpload size={12} /> Đồng bộ
            </button>
          </div>
        </div>

        <button
          type="button"
          className="cm-avatar-circle"
          onClick={() => navigate('/app/settings')}
          aria-label="Tài khoản và cài đặt"
        >
          <UserRound size={26} />
        </button>
      </header>

      <div className="cm-toolkit-launcher">
        <button
          type="button"
          className="cm-toolkit-launch"
          onClick={() => setToolkitOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={toolkitOpen}
          aria-controls="cm-toolkit-dialog"
        >
          <span className="cm-toolkit-launch-icon" aria-hidden="true">
            <PiggyBank size={28} />
          </span>
          <span className="cm-toolkit-launch-copy">
            <strong>Hũ & Chia bill</strong>
            <small>Tiết kiệm • Chia tiền nhóm</small>
          </span>
          <Sparkles className="cm-toolkit-launch-sparkle" size={22} aria-hidden="true" />
        </button>
      </div>

      {/* Mode Switcher & Utility Icons */}
      <div className="cm-toolbar-row">
        <div className="cm-mode-switcher">
          <button
            type="button"
            className={`cm-mode-btn ${dayViewDate ? 'active' : ''}`}
            onClick={() => setDayViewDate(selectedDate)}
          >
            Ngày
          </button>
          <button
            type="button"
            className={`cm-mode-btn ${!dayViewDate ? 'active' : ''}`}
            onClick={() => setDayViewDate(null)}
          >
            <span>{isCurrentMonth ? 'Tháng' : `T${cursor.getMonth() + 1}/${cursor.getFullYear()}`}</span>
            <LayoutGrid size={13} />
            <em className="cm-count-bubble">{activeDaysCount}</em>
          </button>
        </div>

        <div className="cm-utility-icons">
          <button
            type="button"
            className={`cm-icon-circle ${searchOpen ? 'active' : ''}`}
            onClick={() => setSearchOpen(v => !v)}
            aria-label="Tìm kiếm"
          >
            <Search size={17} />
          </button>
          <button
            type="button"
            className={`cm-icon-circle ${hideAll ? 'active' : ''}`}
            onClick={() => setHideAll(v => !v)}
            aria-label="Ẩn hoặc hiện tất cả số dư"
          >
            {hideAll ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
          <button
            type="button"
            className={`cm-icon-circle ${toolkitOpen ? 'active' : ''}`}
            onClick={() => setToolkitOpen(true)}
            title="Tiện ích, Hũ tiết kiệm & Chia bill"
            aria-label="Tiện ích"
          >
            <Paintbrush size={17} />
          </button>
        </div>
      </div>

      {searchOpen && (
        <div className="cm-search-bar">
          <Search size={15} />
          <input
            autoFocus
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Tìm theo ghi chú hoặc danh mục..."
          />
          {searchQuery && (
            <button type="button" onClick={() => setSearchQuery('')}>
              <X size={14} />
            </button>
          )}
        </div>
      )}

      {/* Expense & Income Summary Cards */}
      <div className="cm-summary-cards">
        <div className="cm-summary-card">
          <span className="cm-summary-dot expense">
            <ArrowUpRight size={17} />
          </span>
          <div className="cm-summary-copy">
            <strong>{hideAll || hideExpense ? '••••••' : `${totals.expense.toLocaleString('vi-VN')}đ`}</strong>
            <small>Chi</small>
          </div>
          <button
            type="button"
            className="cm-summary-eye"
            onClick={() => setHideExpense(v => !v)}
            aria-label="Ẩn hoặc hiện khoản chi"
          >
            {hideAll || hideExpense ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        </div>

        <div className="cm-summary-card">
          <span className="cm-summary-dot income">
            <ArrowDownLeft size={17} />
          </span>
          <div className="cm-summary-copy">
            <strong>{hideAll || hideIncome ? '••••••' : `${totals.income.toLocaleString('vi-VN')}đ`}</strong>
            <small>Thu</small>
          </div>
          <button
            type="button"
            className="cm-summary-eye"
            onClick={() => setHideIncome(v => !v)}
            aria-label="Ẩn hoặc hiện khoản thu"
          >
            {hideAll || hideIncome ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        </div>
      </div>

      {/* Lookback Story Reel Strip (1 Ngày • 3 Ngày • 1 Tuần) */}
      <div className="cm-lookback-strip">
        <div className="cm-lookback-label">
          <Sparkles size={14} />
          <span>Nhìn lại:</span>
        </div>
        <div className="cm-lookback-pills">
          <button type="button" className="cm-lookback-pill" onClick={() => setLookbackPeriod(1)}>
            Sau 1 ngày
          </button>
          <button type="button" className="cm-lookback-pill" onClick={() => setLookbackPeriod(3)}>
            Sau 3 ngày
          </button>
          <button type="button" className="cm-lookback-pill" onClick={() => setLookbackPeriod(7)}>
            Sau 1 tuần
          </button>
        </div>
      </div>

      {/* Spending Limit & Safe Daily Allowance Bar */}
      <div
        className={`cm-budget-home-card ${
          budgetMetrics.isOverMonth ? 'danger' : budgetMetrics.monthPercent >= 75 ? 'warning' : 'safe'
        }`}
        onClick={() => setBudgetModalOpen(true)}
        role="button"
        tabIndex={0}
      >
        <div className="cm-budget-home-top">
          <div className="cm-budget-home-title">
            {budgetMetrics.isOverMonth ? (
              <AlertTriangle size={15} />
            ) : budgetMetrics.monthPercent >= 75 ? (
              <Flame size={15} />
            ) : (
              <ShieldCheck size={15} />
            )}
            <strong>
              {budgetMetrics.isOverMonth
                ? 'Vượt hạn mức tháng!'
                : `An toàn tiêu: ${hideAll ? '••••' : `${budgetMetrics.safeDailySpend.toLocaleString('vi-VN')}đ/ngày`}`}
            </strong>
          </div>
          <span className="cm-budget-home-tag">
            🔥 {budgetMetrics.safeDaysCount}/7 ngày chuẩn • Chỉnh hạn mức ›
          </span>
        </div>

        <div className="cm-budget-home-track">
          <div
            className={`cm-budget-home-fill ${
              budgetMetrics.isOverMonth ? 'danger' : budgetMetrics.monthPercent >= 75 ? 'warning' : 'safe'
            }`}
            style={{ width: `${budgetMetrics.monthPercent}%` }}
          />
        </div>

        <div className="cm-budget-home-foot">
          <small>
            Tháng: {hideAll ? '••••' : `${totals.expense.toLocaleString('vi-VN')}đ`} /{' '}
            {budget.monthlyLimit.toLocaleString('vi-VN')}đ ({budgetMetrics.monthPercent}%)
          </small>
          <small className={budgetMetrics.isOverDay ? 'danger-text' : ''}>
            Hôm nay: {hideAll ? '••••' : `${todayExpense.toLocaleString('vi-VN')}đ`} /{' '}
            {budget.dailyLimit.toLocaleString('vi-VN')}đ
          </small>
        </div>
      </div>

      {/* Main Monthly Calendar Card */}
      <section className="cm-calendar-board">
        <div className="cm-month-nav-row">
          <button
            type="button"
            className="cm-month-arrow"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
            aria-label="Tháng trước"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="cm-month-label">
            Tháng {cursor.getMonth() + 1}, {cursor.getFullYear()}
          </span>
          <button
            type="button"
            className="cm-month-arrow"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
            aria-label="Tháng sau"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="cm-weekdays">
          {weekdayLabels.map(label => (
            <span key={label}>{label}</span>
          ))}
        </div>

        {loading ? (
          <div className="cm-board-loading">
            <span className="loading-mark" />
          </div>
        ) : (
          <div className="cm-days-grid">
            {Array.from({ length: monthRange.firstWeekdayOffset }, (_, idx) => (
              <div key={`empty-${idx}`} className="cm-day-slot empty" />
            ))}

            {Array.from({ length: monthRange.daysInMonth }, (_, idx) => {
              const dayNumber = idx + 1;
              const dateObj = new Date(monthRange.year, monthRange.month, dayNumber);
              const key = toDateKey(dateObj);
              const events = byDay[key] ?? [];
              const isToday = key === today;
              const isPastOrToday = key <= today;
              const hasEvents = events.length > 0;
              const photoEvent = events.find(e => e.imageUrl) ?? events[0];

              return (
                <button
                  key={key}
                  type="button"
                  className={`cm-day-slot ${isToday ? 'today' : ''} ${hasEvents ? 'has-events' : ''}`}
                  aria-pressed={selectedDate === key}
                  onClick={() => handleDayClick(key)}
                >
                  <div className="cm-day-visual">
                    {hasEvents ? (
                      <div className={`cm-thumb-stack ${events.length > 1 ? 'multi' : ''}`}>
                        {events.length > 1 && <span className="cm-thumb-back" />}
                        <div className={`cm-thumb-card ${photoEvent.kind}`}>
                          {photoEvent.imageUrl ? (
                            <img src={photoEvent.imageUrl} alt={photoEvent.title} />
                          ) : (
                            <span className="cm-thumb-fallback">
                              {photoEvent.kind === 'income' ? '+' : '−'}
                              {formatCompact(photoEvent.amount ?? 0)}
                            </span>
                          )}
                        </div>
                      </div>
                    ) : isPastOrToday ? (
                      <span className="cm-day-circle actionable">
                        <Plus size={16} />
                      </span>
                    ) : (
                      <span className="cm-day-circle future" />
                    )}
                  </div>

                  <span className={`cm-day-number ${isToday ? 'today' : ''}`}>
                    {dayNumber}
                    {isToday && <i className="cm-today-dot" />}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Floating Quick Add Button on Calendar */}
        <button
          type="button"
          className="cm-fab-add"
          onClick={() => {
            setCaptureType('expense');
            setCaptureDate(selectedDate || today);
          }}
          aria-label="Thêm giao dịch"
        >
          <Plus size={28} />
        </button>
      </section>

      {/* SCREEN 2: Selected Day Full-Screen View */}
      {dayViewDate && (
        <div className="cm-day-view-overlay">
          <header className="cm-day-view-header">
            <button
              type="button"
              className="cm-day-close"
              onClick={() => setDayViewDate(null)}
              aria-label="Đóng"
            >
              <X size={20} />
            </button>

            <div className="cm-day-nav-center">
              <button
                type="button"
                className="cm-day-nav-arrow"
                onClick={handlePrevDay}
                aria-label="Ngày trước"
                title="Ngày trước"
              >
                <ChevronLeft size={20} />
              </button>

              <div className="cm-day-view-title">
                <small>{formatWeekday(dayViewDate)}</small>
                <h2>{formatShortDate(dayViewDate)}</h2>
                <p className={dayViewNet.net >= 0 ? 'income' : 'expense'}>
                  {dayViewNet.net >= 0 ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}
                  <span>{Math.abs(dayViewNet.net).toLocaleString('vi-VN')}đ</span>
                </p>
              </div>

              <button
                type="button"
                className="cm-day-nav-arrow"
                onClick={handleNextDay}
                aria-label="Ngày sau"
                title="Ngày sau"
              >
                <ChevronRight size={20} />
              </button>
            </div>

            <div className="cm-day-view-toggle">
              <button
                type="button"
                className={dayViewLayout === 'timeline' ? 'active' : ''}
                onClick={() => setDayViewLayout('timeline')}
                aria-label="Trục thời gian"
                title="Trục thời gian"
              >
                <Clock size={16} />
              </button>
              <button
                type="button"
                className={dayViewLayout === 'grid' ? 'active' : ''}
                onClick={() => setDayViewLayout('grid')}
                aria-label="Chế độ lưới"
                title="Chế độ lưới"
              >
                <LayoutGrid size={16} />
              </button>
              <button
                type="button"
                className={dayViewLayout === 'list' ? 'active' : ''}
                onClick={() => setDayViewLayout('list')}
                aria-label="Chế độ danh sách"
                title="Chế độ danh sách"
              >
                <ImageIcon size={16} />
              </button>
            </div>
          </header>

          <div
            className={`cm-day-view-body swipeable ${daySlideAnim ? `slide-${daySlideAnim}` : ''}`}
            onTouchStart={e => onDayTouchStart(e.touches[0].clientX, e.touches[0].clientY)}
            onTouchMove={e => onDayTouchMove(e.touches[0].clientX)}
            onTouchEnd={onDayTouchEnd}
            onMouseDown={e => onDayTouchStart(e.clientX, e.clientY)}
            onMouseMove={e => {
              if (e.buttons === 1) onDayTouchMove(e.clientX);
            }}
            onMouseUp={onDayTouchEnd}
            onAnimationEnd={() => setDaySlideAnim(null)}
          >
            {dayViewEvents.length === 0 ? (
              <div className="cm-day-view-empty">
                <p>Chưa có giao dịch nào trong ngày này.</p>
                <button
                  type="button"
                  className="cm-empty-add-btn"
                  onClick={() => {
                    setCaptureType('expense');
                    setCaptureDate(dayViewDate);
                  }}
                >
                  <Plus size={16} /> Thêm giao dịch
                </button>
              </div>
            ) : dayViewLayout === 'timeline' ? (
              <div className="cm-day-timeline">
                <div className="cm-timeline-track-line" />
                {[...dayViewEvents]
                  .sort((a, b) => {
                    const timeA = a.transactionTime || a.time || (a.createdAt ? new Date(a.createdAt).toTimeString().slice(0, 8) : '12:00:00');
                    const timeB = b.transactionTime || b.time || (b.createdAt ? new Date(b.createdAt).toTimeString().slice(0, 8) : '12:00:00');
                    return timeA.localeCompare(timeB);
                  })
                  .map((ev, idx) => {
                    const isIncome = ev.kind === 'income';
                    const isMbBank = ev.source === 'webhook_mbbank' || /MB Bank|MBBank/i.test(ev.note ?? '');
                    const tagLabel = ev.note || categoryNames[ev.categoryId ?? 'other'] || ev.title;
                    const timeLabel = ev.transactionTime
                      ? ev.transactionTime.slice(0, 5)
                      : ev.time
                        ? ev.time.slice(0, 5)
                        : ev.createdAt
                          ? new Date(ev.createdAt).toTimeString().slice(0, 5)
                          : '--:--';

                    return (
                      <div key={ev.id || idx} className="cm-timeline-node-row">
                        <div className={`cm-timeline-node-dot ${isIncome ? 'income' : 'expense'}`} />
                        <button
                          type="button"
                          className={`cm-timeline-card ${isIncome ? 'income' : 'expense'}`}
                          onClick={() => setDetailEvent(ev)}
                        >
                          <span className="cm-timeline-card-time">
                            <Clock size={12} />
                            <strong>{timeLabel}</strong>
                          </span>
                          {ev.imageUrl && (
                            <div className="cm-timeline-card-photo">
                              <img src={ev.imageUrl} alt={tagLabel} />
                            </div>
                          )}
                          <div className="cm-timeline-card-content">
                            <div className="cm-timeline-card-top">
                              <span className={`cm-bill-badge ${isIncome ? 'income' : 'expense'}`}>
                                {categoryNames[ev.categoryId ?? 'other'] ?? 'Giao dịch'}
                              </span>
                              <strong className={`cm-timeline-amount ${isIncome ? 'income' : 'expense'}`}>
                                {isIncome ? '+' : '−'}
                                {(ev.amount ?? 0).toLocaleString('vi-VN')}đ
                              </strong>
                            </div>
                            <p className="cm-timeline-note">{tagLabel}</p>
                            {isMbBank && (
                              <span className="cm-mbbank-text-pill">⚡ MB Bank Auto</span>
                            )}
                          </div>
                        </button>
                      </div>
                    );
                  })}
              </div>
            ) : dayViewLayout === 'grid' ? (
              <div className="cm-day-cards-grid">
                {dayViewEvents.map(ev => {
                  const tagLabel = ev.note || categoryNames[ev.categoryId ?? 'other'] || ev.title;
                  const isIncome = ev.kind === 'income';
                  const isMbBank = ev.source === 'webhook_mbbank' || /MB Bank|MBBank/i.test(ev.note ?? '');
                  const timeLabel = ev.transactionTime?.slice(0, 5) || ev.time?.slice(0, 5)
                    || (ev.createdAt && !Number.isNaN(Date.parse(ev.createdAt)) ? new Date(ev.createdAt).toTimeString().slice(0, 5) : '--:--');
                  return (
                    <button
                      key={ev.id}
                      type="button"
                      className={`cm-bill-card ${isIncome ? 'income' : 'expense'}`}
                      onClick={() => setDetailEvent(ev)}
                    >
                      {ev.imageUrl ? (
                        <img src={ev.imageUrl} alt="" className="cm-bill-img" />
                      ) : (
                        <div className={`cm-bill-placeholder ${isIncome ? 'income' : 'expense'}`}>
                          {isIncome ? <ArrowDownLeft size={32} /> : <ArrowUpRight size={32} />}
                        </div>
                      )}
                      <span className="cm-bill-time"><Clock size={12} /><span>{timeLabel}</span></span>
                      {isMbBank && <span className="cm-bill-source" title="MB Bank Auto">MB Bank</span>}
                      <span className="cm-bill-caption">
                        <span className={`cm-bill-badge ${isIncome ? 'income' : 'expense'}`}>
                          {categoryNames[ev.categoryId ?? 'other'] ?? 'Giao dịch'}
                        </span>
                        <span className="cm-bill-note">{tagLabel}</span>
                        <strong className="cm-bill-price">
                          {isIncome ? '+' : '−'}
                          {(ev.amount ?? 0).toLocaleString('vi-VN')}đ
                        </strong>
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="cm-day-cards-list">
                {dayViewEvents.map(ev => {
                  const tagLabel = ev.note || categoryNames[ev.categoryId ?? 'other'] || ev.title;
                  const isIncome = ev.kind === 'income';
                  const isMbBank = ev.source === 'webhook_mbbank' || /MB Bank|MBBank/i.test(ev.note ?? '');
                  const timeLabel = ev.transactionTime
                    ? ev.transactionTime.slice(0, 5)
                    : ev.time
                      ? ev.time.slice(0, 5)
                      : '';
                  return (
                    <button
                      key={ev.id}
                      type="button"
                      className="cm-day-list-row"
                      onClick={() => setDetailEvent(ev)}
                    >
                      <span className={`cm-day-list-thumb ${isIncome ? 'income' : 'expense'}`}>
                        {ev.imageUrl ? (
                          <img src={ev.imageUrl} alt={tagLabel} />
                        ) : isIncome ? (
                          <ArrowDownLeft size={18} />
                        ) : (
                          <ArrowUpRight size={18} />
                        )}
                      </span>
                      <span className="cm-day-list-info">
                        <strong>{tagLabel}</strong>
                        <small>
                          {timeLabel ? `${timeLabel} • ` : ''}
                          {categoryNames[ev.categoryId ?? 'other'] ?? 'Giao dịch'}
                          {isMbBank ? ' • ⚡ MB Bank' : ''}
                        </small>
                      </span>
                      <b className={isIncome ? 'income' : 'expense'}>
                        {isIncome ? '+' : '−'}
                        {(ev.amount ?? 0).toLocaleString('vi-VN')}đ
                      </b>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="cm-day-swipe-pill">
              👆 Vuốt ngang màn hình hoặc bấm mũi tên để chuyển ngày
            </div>
          </div>

          <button
            type="button"
            className="cm-fab-add day-view-fab"
            onClick={() => {
              setCaptureType('expense');
              setCaptureDate(dayViewDate);
            }}
            aria-label="Thêm giao dịch vào ngày này"
          >
            <Plus size={28} />
          </button>
        </div>
      )}

      {/* SCREEN 3: Quick Add / Capture Modal */}
      {captureDate && (
        <ExpenseCapture
          selectedDate={captureDate}
          initialType={captureType}
          onClose={() => setCaptureDate(null)}
          onSaved={() => {
            setCaptureDate(null);
            void reload();
          }}
        />
      )}

      {/* Transaction Detail / Edit / Delete Modal */}
      {detailEvent && (
        <ExpenseDetail
          event={detailEvent}
          onClose={() => setDetailEvent(null)}
          onChanged={() => {
            setDetailEvent(null);
            void reload();
          }}
        />
      )}

      {/* Lookback / Flashback Story Reel Modal */}
      {lookbackPeriod !== null && (
        <LookbackModal
          initialPeriod={lookbackPeriod}
          transactions={transactions}
          onClose={() => setLookbackPeriod(null)}
        />
      )}

      {/* Spending Limit & Budget Advisor Modal */}
      {budgetModalOpen && (
        <SpendingLimitModal
          transactions={transactions}
          todayExpense={todayExpense}
          monthExpense={totals.expense}
          onClose={() => setBudgetModalOpen(false)}
          onSaved={nextConfig => {
            setBudget(nextConfig);
            setBudgetModalOpen(false);
          }}
        />
      )}

      {/* Smart Financial Toolkit Modal (Savings Jar, Debt Book, Subscriptions, AI Coach, Bill Splitter, Badges) */}
      {toolkitOpen && (
        <SmartToolkitModal
          transactions={transactions}
          onClose={() => setToolkitOpen(false)}
          onTransactionAdded={() => void reload()}
        />
      )}
    </div>
  );
}

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function todayKey() {
  return toDateKey(new Date());
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return { text: 'Chào buổi sáng', emoji: '☀️' };
  if (hour >= 12 && hour < 18) return { text: 'Chào buổi chiều', emoji: '🌤️' };
  return { text: 'Chào buổi tối', emoji: '🌙' };
}

function formatWeekday(dateKey: string) {
  const date = new Date(`${dateKey}T12:00:00`);
  const day = date.getDay();
  const names = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  return names[day] ?? '';
}

function formatShortDate(dateKey: string) {
  const date = new Date(`${dateKey}T12:00:00`);
  return `${date.getDate()} thg ${date.getMonth() + 1}, ${date.getFullYear()}`;
}

function formatCompact(amount: number) {
  if (amount >= 1_000_000) return `${Math.round(amount / 100_000) / 10}tr`;
  if (amount >= 1_000) return `${Math.round(amount / 1_000)}k`;
  return String(amount);
}
