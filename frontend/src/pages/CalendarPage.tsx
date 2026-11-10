import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Landmark,
  LayoutGrid,
  Leaf,
  Paintbrush,
  Plus,
  ReceiptText,
  Search,
  SquarePen,
  UserRound,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ExpenseCapture } from '../components/ExpenseCapture';
import { ExpenseDetail } from '../components/ExpenseDetail';
import { useAuth } from '../contexts/AuthContext';
import { api, type CalendarEvent, type Transaction, type Wallet } from '../services/api';

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
  const [dayViewLayout, setDayViewLayout] = useState<'grid' | 'list'>('grid');
  const [captureDate, setCaptureDate] = useState<string | null>(null);
  const [captureType, setCaptureType] = useState<'expense' | 'income'>('expense');
  const [detailEvent, setDetailEvent] = useState<CalendarEvent | null>(null);

  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [selectedWallet, setSelectedWallet] = useState<string>('all');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  const [hideAll, setHideAll] = useState(false);
  const [hideExpense, setHideExpense] = useState(false);
  const [hideIncome, setHideIncome] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const monthRange = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    return { from: toDateKey(first), to: toDateKey(last), year, month, daysInMonth: last.getDate(), firstWeekdayOffset: (first.getDay() + 6) % 7 };
  }, [cursor]);

  const reload = async () => {
    setLoading(true);
    try {
      const [walletRes, txRes] = await Promise.all([
        api.wallets(),
        api.transactions({ from: monthRange.from, to: monthRange.to }),
      ]);
      let walletList = walletRes.wallets;
      if (!walletList.length) {
        const w1 = await api.createWallet({ name: 'Wallet', type: 'cash', openingBalance: 0, color: '#163e36' });
        const w2 = await api.createWallet({ name: 'Bank', type: 'bank', openingBalance: 0, color: '#3c6684' });
        walletList = [w1.wallet, w2.wallet];
      }
      setWallets(walletList);
      setTransactions(txRes.transactions);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, [monthRange.from, monthRange.to]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter(tx => {
      if (selectedWallet !== 'all' && tx.walletId !== selectedWallet && tx.toWalletId !== selectedWallet) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const cat = (categoryNames[tx.categoryId] ?? tx.categoryId).toLowerCase();
        if (!tx.note.toLowerCase().includes(q) && !cat.includes(q)) return false;
      }
      return true;
    });
  }, [transactions, selectedWallet, searchQuery]);

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
        source: 'transaction',
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

  const dayViewEvents = dayViewDate ? byDay[dayViewDate] ?? [] : [];
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
            <span className="cm-badge-blue">
              <SquarePen size={12} /> 3/3
            </span>
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
            className="cm-icon-circle"
            onClick={() => {
              const nextMonth = new Date(cursor);
              nextMonth.setMonth(cursor.getMonth() - 1);
              setCursor(nextMonth);
            }}
            title="Xem tháng trước / đổi chủ đề"
            aria-label="Tuỳ chỉnh"
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

      {/* Wallet Filter Chips */}
      <div className="cm-wallet-chips">
        <button
          type="button"
          className={`cm-wallet-chip ${selectedWallet === 'all' ? 'active' : ''}`}
          onClick={() => setSelectedWallet('all')}
        >
          <ReceiptText size={14} />
          <span>Tất cả</span>
        </button>
        {wallets.map(wallet => {
          const Icon = wallet.type === 'bank' ? Landmark : ReceiptText;
          return (
            <button
              key={wallet.id}
              type="button"
              className={`cm-wallet-chip ${selectedWallet === wallet.id ? 'active' : ''}`}
              onClick={() => setSelectedWallet(wallet.id)}
            >
              <Icon size={14} />
              <span>{wallet.name}</span>
            </button>
          );
        })}
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

            <div className="cm-day-view-title">
              <small>{formatWeekday(dayViewDate)}</small>
              <h2>{formatShortDate(dayViewDate)}</h2>
              <p className={dayViewNet.net >= 0 ? 'income' : 'expense'}>
                {dayViewNet.net >= 0 ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}
                <span>{Math.abs(dayViewNet.net).toLocaleString('vi-VN')}đ</span>
              </p>
            </div>

            <div className="cm-day-view-toggle">
              <button
                type="button"
                className={dayViewLayout === 'grid' ? 'active' : ''}
                onClick={() => setDayViewLayout('grid')}
                aria-label="Chế độ lưới"
              >
                <LayoutGrid size={16} />
              </button>
              <button
                type="button"
                className={dayViewLayout === 'list' ? 'active' : ''}
                onClick={() => setDayViewLayout('list')}
                aria-label="Chế độ danh sách"
              >
                <ImageIcon size={16} />
              </button>
            </div>
          </header>

          <div className="cm-day-view-body">
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
            ) : dayViewLayout === 'grid' ? (
              <div className="cm-day-cards-grid">
                {dayViewEvents.map(ev => {
                  const tagLabel = ev.note || categoryNames[ev.categoryId ?? 'other'] || ev.title;
                  const isIncome = ev.kind === 'income';
                  return (
                    <button
                      key={ev.id}
                      type="button"
                      className={`cm-bill-card ${isIncome ? 'income' : 'expense'}`}
                      onClick={() => setDetailEvent(ev)}
                    >
                      {ev.imageUrl ? (
                        <img src={ev.imageUrl} alt={tagLabel} className="cm-bill-img" />
                      ) : (
                        <div className={`cm-bill-placeholder ${isIncome ? 'income' : 'expense'}`}>
                          {isIncome ? <ArrowDownLeft size={32} /> : <ArrowUpRight size={32} />}
                        </div>
                      )}
                      <span className={`cm-bill-badge ${isIncome ? 'income' : 'expense'}`}>
                        {tagLabel}
                      </span>
                      <strong className="cm-bill-price">
                        {isIncome ? '+' : '−'}
                        {(ev.amount ?? 0).toLocaleString('vi-VN')}đ
                      </strong>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="cm-day-cards-list">
                {dayViewEvents.map(ev => {
                  const tagLabel = ev.note || categoryNames[ev.categoryId ?? 'other'] || ev.title;
                  const isIncome = ev.kind === 'income';
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
                        <small>{categoryNames[ev.categoryId ?? 'other'] ?? 'Giao dịch'}</small>
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
          defaultWalletId={selectedWallet}
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
