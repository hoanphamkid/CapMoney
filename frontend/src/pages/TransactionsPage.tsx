import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Banknote, Building2, Check, ChevronDown, ChevronRight, Eye, EyeOff, Filter, ImageOff, Pencil, Plus, RefreshCw, Search, Smartphone, Tag, WalletCards, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ExpenseCapture } from '../components/ExpenseCapture';
import { ExpenseDetail } from '../components/ExpenseDetail';
import { TransferForm, WalletForm } from '../components/WalletForms';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { api, type CalendarEvent, type Transaction, type Wallet } from '../services/api';
import './money.css';

type ReviewFilter = 'all' | 'no-photo' | 'uncategorized';
type TypeFilter = 'all' | 'income' | 'expense' | 'transfer';
const labels: Record<string, string> = { food: 'Ăn uống', shopping: 'Mua sắm', transport: 'Di chuyển', bills: 'Hóa đơn', entertainment: 'Giải trí', health: 'Sức khỏe', other: 'Khác', salary: 'Lương', bonus: 'Thưởng', investment: 'Đầu tư', gift: 'Được tặng', transfer: 'Chuyển ví' };
const walletLabels: Record<string, string> = { cash: 'Tiền mặt', bank: 'Ngân hàng', e_wallet: 'Ví điện tử', savings: 'Tiết kiệm', credit: 'Tín dụng', custom: 'Ví khác' };

export function TransactionsPage() {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [rows, setRows] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [walletId, setWalletId] = useState('all');
  const [hideBalances, setHideBalances] = useState(false);
  const [query, setQuery] = useState('');
  const [review, setReview] = useState<ReviewFilter>('all');
  const [type, setType] = useState<TypeFilter>('all');
  const [category, setCategory] = useState('all');
  const [sort, setSort] = useState<'newest' | 'oldest' | 'highest' | 'lowest'>('newest');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [captureType, setCaptureType] = useState<'expense' | 'income' | null>(null);
  const [walletForm, setWalletForm] = useState<Wallet | 'new' | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [detail, setDetail] = useState<CalendarEvent | null>(null);
  const requestVersion = useRef(0);

  const load = async (quiet = false) => {
    const version = ++requestVersion.current;
    if (quiet) setRefreshing(true); else setLoading(true);
    const [walletResult, transactionResult] = await Promise.allSettled([api.wallets(), api.transactions()]);
    if (version !== requestVersion.current) return;
    if (walletResult.status === 'fulfilled') {
      setWallets(walletResult.value.wallets);
      setWalletId(current => current === 'all' || walletResult.value.wallets.some(wallet => wallet.id === current) ? current : 'all');
    }
    if (transactionResult.status === 'fulfilled') setRows(transactionResult.value.transactions);
    setError(walletResult.status === 'rejected' && transactionResult.status === 'rejected'
      ? 'Không tải được dữ liệu. Hãy thử làm mới.'
      : walletResult.status === 'rejected' ? 'Không tải được danh sách ví.'
        : transactionResult.status === 'rejected' ? 'Không tải được giao dịch.' : '');
    setLoading(false); setRefreshing(false);
  };
  useAutoRefresh(() => load(true));
  useEffect(() => { void load(); return () => { requestVersion.current++; }; }, []);

  const selectedWallet = wallets.find(wallet => wallet.id === walletId);
  const walletNames = useMemo(() => new Map(wallets.map(wallet => [wallet.id, wallet.name])), [wallets]);
  const walletRows = useMemo(() => rows.filter(row => walletId === 'all' || row.walletId === walletId || row.toWalletId === walletId), [rows, walletId]);
  const flowRows = useMemo(() => walletRows.filter(row => row.type === 'income' || row.type === 'expense'), [walletRows]);
  const monthKey = todayKey().slice(0, 7);
  const monthRows = useMemo(() => flowRows.filter(row => row.dateKey.startsWith(monthKey)), [flowRows, monthKey]);
  const totalBalance = useMemo(() => (walletId === 'all' ? wallets : wallets.filter(wallet => wallet.id === walletId)).reduce((sum, wallet) => sum + wallet.balance, 0), [wallets, walletId]);
  const monthIncome = useMemo(() => monthRows.filter(row => row.type === 'income').reduce((sum, row) => sum + row.amount, 0), [monthRows]);
  const monthExpense = useMemo(() => monthRows.filter(row => row.type === 'expense').reduce((sum, row) => sum + row.amount, 0), [monthRows]);
  const monthNet = monthIncome - monthExpense;
  const elapsedDays = Math.max(1, new Date().getDate());
  const remainingDays = Math.max(0, new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate() - elapsedDays);
  const forecast = totalBalance + (monthNet / elapsedDays) * remainingDays;
  const dailyFlow = useMemo(() => {
    const today = new Date();
    return Array.from({ length: 14 }, (_, index) => {
      const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (13 - index));
      const key = dateKey(date);
      const dayRows = flowRows.filter(row => row.dateKey === key);
      const income = dayRows.filter(row => row.type === 'income').reduce((sum, row) => sum + row.amount, 0);
      const expense = dayRows.filter(row => row.type === 'expense').reduce((sum, row) => sum + row.amount, 0);
      return { key, label: `${date.getDate()}/${date.getMonth() + 1}`, net: income - expense };
    });
  }, [flowRows]);
  const chartMax = Math.max(1, ...dailyFlow.map(day => Math.abs(day.net)));
  const reviewCounts = useMemo(() => ({
    noPhoto: walletRows.filter(row => row.type !== 'transfer' && !row.imageUrl).length,
    uncategorized: walletRows.filter(row => row.type !== 'transfer' && (!row.categoryId || row.categoryId === 'other')).length,
  }), [walletRows]);
  const visibleRows = useMemo(() => walletRows
    .filter(row => review === 'all' || (row.type !== 'transfer' && (review === 'no-photo' ? !row.imageUrl : !row.categoryId || row.categoryId === 'other')))
    .filter(row => type === 'all' || row.type === type)
    .filter(row => category === 'all' || row.categoryId === category)
    .filter(row => !query.trim() || normalize(`${row.note} ${labels[row.categoryId] ?? ''} ${walletNames.get(row.walletId) ?? ''} ${row.amount}`).includes(normalize(query)))
    .sort((a, b) => sort === 'highest' ? b.amount - a.amount : sort === 'lowest' ? a.amount - b.amount
      : (sort === 'oldest' ? 1 : -1) * (`${a.dateKey}${a.transactionTime ?? ''}`.localeCompare(`${b.dateKey}${b.transactionTime ?? ''}`))),
  [walletRows, review, type, category, query, sort, walletNames]);
  const groups = useMemo(() => {
    const result = new Map<string, Transaction[]>();
    for (const row of visibleRows) result.set(row.dateKey, [...(result.get(row.dateKey) ?? []), row]);
    return result;
  }, [visibleRows]);
  const categories = [...new Set(walletRows.map(row => row.categoryId).filter(Boolean))];
  const hasFilters = Boolean(query || review !== 'all' || type !== 'all' || category !== 'all');
  const resetFilters = () => { setQuery(''); setReview('all'); setType('all'); setCategory('all'); };
  const asEvent = (row: Transaction): CalendarEvent => ({ ...row, kind: row.type, title: row.note || labels[row.categoryId] || 'Giao dịch', source: row.source ?? 'manual' });
  const saved = () => { setCaptureType(null); setWalletForm(null); setTransferOpen(false); setDetail(null); void load(true); };

  return (
    <div className="money-page money-flow-page">
      <header className="money-heading money-flow-heading">
        <div><p className="eyebrow dark">DÒNG TIỀN CÁ NHÂN</p><h1>Tiền đang đi đâu?</h1><p>Nhìn nhanh dòng tiền vào, ra và số dư dự kiến đến cuối tháng.</p></div>
        <button type="button" className="money-add-wallet" onClick={() => setWalletForm('new')}><Plus size={16} /> Thêm ví</button>
      </header>

      {error && <div className="page-alert" role="alert">{error}<button type="button" onClick={() => void load(true)} aria-label="Thử tải lại"><RefreshCw size={15} /></button></div>}

      <section className="money-flow-hero" aria-label="Tổng quan dòng tiền">
        <div className="money-flow-balance"><div><span>Số dư hiện tại</span><button type="button" className="money-icon-button" onClick={() => setHideBalances(value => !value)} aria-label={hideBalances ? 'Hiện số dư tổng' : 'Ẩn số dư tổng'} aria-pressed={hideBalances}>{hideBalances ? <EyeOff size={16} /> : <Eye size={16} />}</button></div><strong>{hideBalances ? '••••••' : money(totalBalance)}</strong><small>{selectedWallet ? `Chỉ tính ${selectedWallet.name}` : `Tổng ${wallets.length || 0} ví`}</small></div>
        <div className="money-flow-forecast"><span>Dự báo cuối tháng</span><strong className={forecast < 0 ? 'negative' : ''}>{hideBalances ? '••••••' : money(forecast)}</strong><small>{remainingDays ? `Theo nhịp ${money(Math.abs(monthNet))}/ngày` : 'Đã đến cuối tháng'}</small></div>
      </section>

      <section className="money-flow-stats" aria-label="Tổng kết tháng này">
        <article><span className="money-stat-icon income"><ArrowDownLeft size={16} /></span><div><small>Tiền vào tháng này</small><strong className="income-text">+{hideBalances ? '••••••' : money(monthIncome)}</strong></div></article>
        <article><span className="money-stat-icon expense"><ArrowUpRight size={16} /></span><div><small>Tiền ra tháng này</small><strong className="expense-text">−{hideBalances ? '••••••' : money(monthExpense)}</strong></div></article>
        <article><span className="money-stat-icon net"><ArrowLeftRight size={16} /></span><div><small>Chênh lệch</small><strong className={monthNet < 0 ? 'expense-text' : 'income-text'}>{monthNet >= 0 ? '+' : '−'}{hideBalances ? '••••••' : money(Math.abs(monthNet))}</strong></div></article>
      </section>

      <section className="money-flow-chart" aria-label="Dòng tiền 14 ngày gần đây">
        <div className="money-section-heading"><div><h2>Nhịp tiền 14 ngày qua</h2><p>Cột xanh là tiền vào, cột đỏ là tiền ra.</p></div><button type="button" className="money-quiet-button" disabled={refreshing} onClick={() => void load(true)} aria-label="Làm mới dòng tiền"><RefreshCw size={16} className={refreshing ? 'spin' : ''} /></button></div>
        {loading ? <div className="money-chart-loading" role="status">Đang tính dòng tiền…</div> : <div className="money-bars" role="img" aria-label="Biểu đồ dòng tiền 14 ngày">{dailyFlow.map(day => <div className="money-bar-day" key={day.key} title={`${day.label}: ${day.net >= 0 ? '+' : '−'}${money(Math.abs(day.net))}`}><div className="money-bar-track"><span className={`money-bar ${day.net >= 0 ? 'positive' : 'negative'}`} style={{ height: `${day.net ? Math.max(10, Math.round(Math.abs(day.net) / chartMax * 100)) : 4}%` }} /></div><small>{day.label}</small></div>)}</div>}
      </section>

      <section className="money-actions" aria-label="Thao tác nhanh">
        <button type="button" className="money-action expense" onClick={() => setCaptureType('expense')}><span><ArrowUpRight size={21} /></span><strong>Ghi chi</strong><small>Khoản vừa chi</small></button>
        <button type="button" className="money-action income" onClick={() => setCaptureType('income')}><span><ArrowDownLeft size={21} /></span><strong>Ghi thu</strong><small>Tiền vừa nhận</small></button>
        <button type="button" className="money-action transfer" onClick={() => setTransferOpen(true)} disabled={wallets.length < 2} title={wallets.length < 2 ? 'Cần ít nhất hai ví để chuyển tiền' : undefined}><span><ArrowLeftRight size={21} /></span><strong>Chuyển ví</strong><small>Giữa hai ví</small></button>
      </section>

      <section className="money-wallet-section money-wallet-section-compact" aria-label="Theo dõi từng ví">
        <div className="money-section-heading"><div><h2>Tiền nằm ở đâu?</h2><p>Chọn ví để xem dòng tiền riêng.</p></div><button type="button" className="money-quiet-button" onClick={() => setHideBalances(value => !value)} aria-label={hideBalances ? 'Hiện số dư' : 'Ẩn số dư'} aria-pressed={hideBalances}>{hideBalances ? <EyeOff size={15} /> : <Eye size={15} />}<span>{hideBalances ? 'Hiện số dư' : 'Ẩn số dư'}</span></button></div>
        {loading ? <div className="money-wallet-loading" role="status">Đang tải ví…</div> : wallets.length ? <div className="money-wallet-grid">{wallets.map(wallet => { const Icon = wallet.type === 'bank' ? Building2 : wallet.type === 'cash' ? Banknote : wallet.type === 'e_wallet' ? Smartphone : WalletCards; const selected = walletId === wallet.id; return <button type="button" key={wallet.id} className={`money-wallet-card ${selected ? 'selected' : ''}`} aria-pressed={selected} aria-label={`Chọn ví ${wallet.name}`} onClick={() => { setWalletId(selected ? 'all' : wallet.id); resetFilters(); }}><span className="money-wallet-card-top"><span className="money-wallet-icon" style={{ backgroundColor: `${wallet.color}35`, color: wallet.color === '#163e36' ? '#83d7b3' : '#9fc8f5' }}><Icon size={19} /></span><span className="money-wallet-check">{selected ? <Check size={13} /> : <ChevronRight size={14} />}</span></span><span className="money-wallet-name">{wallet.name}</span><span className="money-wallet-type">{walletLabels[wallet.type] ?? 'Ví khác'}</span><strong className={wallet.balance < 0 ? 'negative' : ''} title={hideBalances ? undefined : money(wallet.balance)}>{hideBalances ? '••••••' : money(wallet.balance)}</strong></button>; })}</div> : <div className="money-wallet-empty"><WalletCards size={26} /><div><strong>Bắt đầu với một chiếc ví</strong><p>Tạo ví tiền mặt, tài khoản ngân hàng hoặc ví điện tử.</p></div><button type="button" onClick={() => setWalletForm('new')}>Tạo ví đầu tiên <Plus size={15} /></button></div>}
        <div className="money-wallet-context"><button type="button" className={`money-all-wallets ${walletId === 'all' ? 'active' : ''}`} aria-pressed={walletId === 'all'} onClick={() => { setWalletId('all'); resetFilters(); }}><WalletCards size={14} /> Tất cả ví</button>{selectedWallet && <button type="button" className="money-quiet-button" onClick={() => setWalletForm(selectedWallet)}><Pencil size={13} /> Sửa ví {selectedWallet.name}</button>}</div>
      </section>

      <section className="money-activity" aria-label="Dòng tiền gần đây">
        <div className="money-section-heading money-activity-heading"><div><h2>Dòng tiền gần đây</h2><p>Chạm một khoản để xem ảnh hoặc sửa chi tiết.</p></div><span className="money-flow-period">{monthKey.replace('-', '/')}</span></div>
        <div className="money-search"><Search size={17} /><input aria-label="Tìm giao dịch" placeholder="Tìm ghi chú, danh mục hoặc tên ví" value={query} onChange={event => setQuery(event.target.value)} />{query && <button type="button" aria-label="Xóa tìm kiếm" onClick={() => setQuery('')}><X size={15} /></button>}</div>
        <div className="money-review-filters" aria-label="Kiểm tra nhanh"><button type="button" className={review === 'all' ? 'active' : ''} aria-pressed={review === 'all'} onClick={() => setReview('all')}>Tất cả</button><button type="button" className={review === 'no-photo' ? 'active' : ''} aria-pressed={review === 'no-photo'} onClick={() => setReview('no-photo')}><ImageOff size={13} /> Thiếu ảnh <b>{reviewCounts.noPhoto}</b></button><button type="button" className={review === 'uncategorized' ? 'active' : ''} aria-pressed={review === 'uncategorized'} onClick={() => setReview('uncategorized')}><Tag size={13} /> Chưa phân loại <b>{reviewCounts.uncategorized}</b></button></div>
        <div className="money-list-controls"><span>{visibleRows.length} giao dịch</span><button type="button" aria-expanded={filtersOpen} aria-controls="money-filters" onClick={() => setFiltersOpen(value => !value)}><Filter size={14} /> Bộ lọc {(type !== 'all' || category !== 'all') && <i />}</button><label className="money-sort"><span className="visually-hidden">Sắp xếp giao dịch</span><select value={sort} onChange={event => setSort(event.target.value as typeof sort)}><option value="newest">Mới nhất</option><option value="oldest">Cũ nhất</option><option value="highest">Tiền cao nhất</option><option value="lowest">Tiền thấp nhất</option></select><ChevronDown size={13} /></label></div>
        {filtersOpen && <div id="money-filters" className="money-expanded-filters"><label className="select-field"><span>Loại giao dịch</span><select value={type} onChange={event => setType(event.target.value as TypeFilter)}><option value="all">Tất cả loại</option><option value="expense">Chi tiêu</option><option value="income">Thu nhập</option><option value="transfer">Chuyển ví</option></select></label><label className="select-field"><span>Danh mục</span><select value={category} onChange={event => setCategory(event.target.value)}><option value="all">Tất cả danh mục</option>{categories.map(id => <option key={id} value={id}>{labels[id] ?? 'Khác'}</option>)}</select></label></div>}
        {loading ? <div className="calendar-loading"><span className="loading-mark" /></div> : visibleRows.length ? <div className="money-history">{[...groups].map(([date, group]) => <div key={date} className="money-history-day"><div className="money-history-date">{dateLabel(date)}</div>{group.map(row => <button type="button" className="ledger-row money-history-row" key={row.id} onClick={() => setDetail(asEvent(row))}><span className={`money-history-icon ${row.type}`}>{row.type === 'transfer' ? <ArrowLeftRight size={17} /> : row.imageUrl ? <img src={row.imageUrl} alt="" /> : row.type === 'income' ? <ArrowDownLeft size={17} /> : <ArrowUpRight size={17} />}</span><span className="ledger-row-copy"><strong>{row.note || labels[row.categoryId] || 'Giao dịch'}</strong><small>{row.type === 'transfer' ? `${walletNames.get(row.walletId) ?? 'Ví nguồn'} → ${walletNames.get(row.toWalletId ?? '') ?? 'Ví nhận'}` : `${walletNames.get(row.walletId) ?? 'Ví'} · ${labels[row.categoryId] ?? 'Khác'}`}{row.transactionTime ? ` · ${row.transactionTime.slice(0, 5)}` : ''}</small></span><span className={`ledger-row-amount ${row.type}`}>{row.type === 'income' ? '+' : row.type === 'expense' ? '−' : ''}{money(row.amount)}</span><ChevronRight size={14} /></button>)}</div>)}</div> : <div className="money-history-empty"><Search size={24} /><h3>{hasFilters ? 'Không có khoản phù hợp' : 'Chưa có dòng tiền'}</h3><p>{hasFilters ? 'Thử từ khóa khác hoặc bỏ bớt bộ lọc.' : 'Ghi khoản thu hoặc chi đầu tiên để thấy dòng tiền.'}</p><button type="button" onClick={hasFilters ? resetFilters : () => setCaptureType('expense')}>{hasFilters ? 'Xóa bộ lọc' : 'Ghi khoản đầu tiên'}</button></div>}
      </section>

      {captureType && <ExpenseCapture selectedDate={todayKey()} initialType={captureType} defaultWalletId={walletId === 'all' ? undefined : walletId} onClose={() => setCaptureType(null)} onSaved={saved} />}
      {walletForm && <WalletForm wallet={walletForm === 'new' ? undefined : walletForm} onClose={() => setWalletForm(null)} onSaved={saved} />}
      {transferOpen && <TransferForm wallets={wallets} initialWalletId={walletId === 'all' ? undefined : walletId} onClose={() => setTransferOpen(false)} onSaved={saved} />}
      {detail && <ExpenseDetail event={detail} wallets={wallets} onClose={() => setDetail(null)} onChanged={saved} />}
    </div>
  );
}

function money(value: number) { return `${Math.round(value).toLocaleString('vi-VN')} ₫`; }
function normalize(value: string) { return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/đ/gi, 'd').toLowerCase().trim(); }
function dateLabel(value: string) { return new Date(`${value}T12:00:00`).toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }); }
function dateKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function todayKey() { return dateKey(new Date()); }
