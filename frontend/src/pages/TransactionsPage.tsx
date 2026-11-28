import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Banknote, Building2, CalendarDays, Check, ChevronDown, ChevronRight, Eye, EyeOff, Filter, ImageOff, Pencil, Plus, RefreshCw, Search, Smartphone, Tag, WalletCards, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ExpenseCapture } from '../components/ExpenseCapture';
import { ExpenseDetail } from '../components/ExpenseDetail';
import { TransferForm, WalletForm } from '../components/WalletForms';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { ApiError, api, type CalendarEvent, type Transaction, type Wallet } from '../services/api';
import { ALL_CATEGORY_LABELS } from '../constants/categories';
import './money.css';

type ReviewFilter = 'all' | 'no-photo' | 'uncategorized';
type TypeFilter = 'all' | 'income' | 'expense' | 'transfer';
type Period = 'all' | 'today' | 'week' | 'month' | 'custom';
const transactionTypes = { all: 'Tất cả', income: 'Tiền vào', expense: 'Tiền ra', transfer: 'Chuyển ví' } as const;
const emptyTransactions: Transaction[] = [];
// Keep older category labels while adding the newer beauty/skincare labels.
const labels: Record<string, string> = { food: 'Ăn uống', shopping: 'Mua sắm', transport: 'Di chuyển', bills: 'Hóa đơn', entertainment: 'Giải trí', health: 'Sức khỏe', other: 'Khác', salary: 'Lương', bonus: 'Thưởng', investment: 'Đầu tư', gift: 'Được tặng', transfer: 'Chuyển ví' };
const walletLabels: Record<string, string> = { cash: 'Tiền mặt', bank: 'Ngân hàng', e_wallet: 'Ví điện tử', savings: 'Tiết kiệm', credit: 'Tín dụng', custom: 'Ví khác' };
type LinkedTransaction = { id: string; transaction: Transaction } | { id: string; error: string };

export function TransactionsPage() {
  Object.assign(labels, ALL_CATEGORY_LABELS);
  const [searchParams, setSearchParams] = useSearchParams();
  const linkedId = searchParams.get('transaction');
  const [linkedResult, setLinkedResult] = useState<LinkedTransaction | null>(null);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [loadedRows, setLoadedRows] = useState<{ scope: string; transactions: Transaction[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [walletId, setWalletId] = useState('all');
  const [hideBalances, setHideBalances] = useState(false);
  const [query, setQuery] = useState('');
  const [review, setReview] = useState<ReviewFilter>('all');
  const [type, setType] = useState<TypeFilter>('all');
  const [category, setCategory] = useState('all');
  const [period, setPeriod] = useState<Period>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [sort, setSort] = useState<'newest' | 'oldest' | 'highest' | 'lowest'>('newest');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [captureType, setCaptureType] = useState<'expense' | 'income' | null>(null);
  const [walletForm, setWalletForm] = useState<Wallet | 'new' | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [detail, setDetail] = useState<CalendarEvent | null>(null);
  const requestVersion = useRef(0);
  const today = new Date();
  const todayDate = dateKey(today);
  const from = period === 'custom' ? customFrom : period === 'month' ? `${todayDate.slice(0, 7)}-01`
    : period === 'week' ? dateKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6)) : period === 'today' ? todayDate : '';
  const to = period === 'custom' ? customTo : period === 'all' ? '' : todayDate;
  const invalidRange = Boolean(from && to && from > to);
  const scope = JSON.stringify([walletId, from, to]);
  const rows = loadedRows?.scope === scope ? loadedRows.transactions : emptyTransactions;

  const load = async (quiet = false) => {
    const version = ++requestVersion.current;
    if (quiet) setRefreshing(true); else setLoading(true);
    const [walletResult, transactionResult] = await Promise.allSettled([
      api.wallets(),
      invalidRange ? Promise.resolve({ transactions: [] }) : api.transactions({ from, to, walletId: walletId === 'all' ? undefined : walletId }),
    ]);
    if (version !== requestVersion.current) return;
    if (walletResult.status === 'fulfilled') {
      setWallets(walletResult.value.wallets);
      setWalletId(current => current === 'all' || walletResult.value.wallets.some(wallet => wallet.id === current) ? current : 'all');
    }
    if (transactionResult.status === 'fulfilled') setLoadedRows({ scope, transactions: transactionResult.value.transactions });
    setError(walletResult.status === 'rejected' && transactionResult.status === 'rejected'
      ? 'Không tải được dữ liệu. Hãy thử làm mới.'
      : walletResult.status === 'rejected' ? 'Không tải được danh sách ví.'
        : transactionResult.status === 'rejected' ? 'Không tải được giao dịch.' : '');
    setLoading(false); setRefreshing(false);
  };
  useAutoRefresh(() => load(true));
  useEffect(() => { void load(); return () => { requestVersion.current++; }; }, [walletId, from, to, invalidRange]);
  useEffect(() => {
    if (!linkedId) { setLinkedResult(null); return; }
    let active = true;
    void api.transaction(linkedId).then(transaction => {
      if (active) setLinkedResult({ id: linkedId, transaction });
    }).catch(error => {
      if (active) setLinkedResult({ id: linkedId, error: error instanceof ApiError ? error.message : 'Không mở được giao dịch từ thông báo.' });
    });
    return () => { active = false; };
  }, [linkedId]);

  const selectedWallet = wallets.find(wallet => wallet.id === walletId);
  const walletNames = useMemo(() => new Map(wallets.map(wallet => [wallet.id, wallet.name])), [wallets]);
  const walletRows = useMemo(() => rows.filter(row => !invalidRange
    && (!from || row.dateKey >= from) && (!to || row.dateKey <= to)
    && (walletId === 'all' || row.walletId === walletId || row.toWalletId === walletId)), [rows, walletId, from, to, invalidRange]);
  const totalBalance = selectedWallet?.balance ?? wallets.reduce((sum, wallet) => sum + wallet.balance, 0);
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
    for (const row of visibleRows) {
      const group = result.get(row.dateKey);
      if (group) group.push(row);
      else result.set(row.dateKey, [row]);
    }
    return result;
  }, [visibleRows]);
  const totals = visibleRows.reduce((sum, row) => {
    if (row.type === 'income' || row.type === 'expense') sum[row.type] += row.amount;
    return sum;
  }, { income: 0, expense: 0 });
  const categories = [...new Set([
    ...walletRows.filter(row => type === 'all' || row.type === type).map(row => row.categoryId).filter(Boolean),
    ...(category === 'all' ? [] : [category]),
  ])];
  const hasFilters = Boolean(query.trim() || review !== 'all' || type !== 'all' || category !== 'all' || period !== 'all');
  const resetFilters = () => { setQuery(''); setReview('all'); setType('all'); setCategory('all'); setPeriod('all'); };
  const selectWallet = (id: string) => {
    setWalletId(id);
    setQuery('');
    setReview('all');
    setCategory('all');
  };
  const selectType = (value: TypeFilter) => {
    if (type === value) return;
    setType(value);
    setCategory('all');
  };
  const toggleBalances = () => setHideBalances(value => !value);
  const displayMoney = (value: number) => hideBalances ? '••••••' : money(value);
  const asEvent = (row: Transaction): CalendarEvent => ({ ...row, kind: row.type, title: row.note || labels[row.categoryId] || 'Giao dịch', source: row.source ?? 'manual' });
  const closeDetail = () => {
    setDetail(null);
    if (!linkedId) return;
    setSearchParams(params => {
      const next = new URLSearchParams(params);
      next.delete('transaction');
      return next;
    }, { replace: true });
  };
  const saved = () => { setCaptureType(null); setWalletForm(null); setTransferOpen(false); closeDetail(); void load(true); };
  const linked = linkedId && linkedResult?.id === linkedId ? linkedResult : null;
  const shownDetail = linkedId ? (linked && 'transaction' in linked ? asEvent(linked.transaction) : null) : detail;

  const amountOrder = sort === 'highest' || sort === 'lowest';
  const renderRow = (row: Transaction) => {
    const description = row.type === 'transfer'
      ? (walletNames.get(row.walletId) ?? 'Ví nguồn') + ' → ' + (walletNames.get(row.toWalletId ?? '') ?? 'Ví nhận')
      : (walletNames.get(row.walletId) ?? 'Ví') + ' · ' + (labels[row.categoryId] ?? 'Khác');
    return (
      <button type="button" className="ledger-row money-history-row" key={row.id} onClick={() => setDetail(asEvent(row))}>
        <span className={'money-history-icon ' + row.type}>
          {row.type === 'transfer' ? <ArrowLeftRight size={17} /> : row.imageUrl ? <img src={row.imageUrl} alt="" loading="lazy" />
            : row.type === 'income' ? <ArrowDownLeft size={17} /> : <ArrowUpRight size={17} />}
        </span>
        <span className="ledger-row-copy">
          <strong>{row.note || labels[row.categoryId] || 'Giao dịch'}</strong>
          <small>{description}{amountOrder && ' · ' + row.dateKey.split('-').reverse().join('/')}{row.transactionTime && ' · ' + row.transactionTime.slice(0, 5)}</small>
        </span>
        <span className={'ledger-row-amount ' + row.type}>
          {hideBalances ? '••••••' : (row.type === 'income' ? '+' : row.type === 'expense' ? '−' : '') + money(row.amount)}
        </span>
        <ChevronRight size={14} />
      </button>
    );
  };

  return (
    <div className="money-page">
      <header className="money-heading">
        <h1>Ví của tôi</h1>
        <button type="button" className="money-add-wallet" onClick={() => setWalletForm('new')}><Plus size={17} /> Thêm ví</button>
      </header>

      {error && <div className="page-alert" role="alert">{error}<button type="button" onClick={() => void load(true)} aria-label="Thử tải lại"><RefreshCw size={15} /></button></div>}
      {linkedId && !linked && <p className="page-alert" role="status">Đang mở giao dịch từ thông báo…</p>}
      {linked && 'error' in linked && <div className="page-alert" role="alert">{linked.error}<button type="button" onClick={closeDetail} aria-label="Đóng thông báo lỗi"><X size={15} /></button></div>}

      <section className="money-balance-panel" aria-label="Số dư ví">
        <div className="money-balance-heading">
          <div>
            <span className="money-balance-context"><WalletCards size={16} /> {selectedWallet?.name ?? 'Tất cả ví'}</span>
            <span className="money-balance-label">Số dư hiện tại</span>
            <strong aria-live="polite">{loading && !wallets.length ? '—' : displayMoney(totalBalance)}</strong>
          </div>
          <button type="button" className="money-eye" onClick={toggleBalances} aria-label={hideBalances ? 'Hiện số dư' : 'Ẩn số dư'} aria-pressed={hideBalances}>
            {hideBalances ? <EyeOff size={19} /> : <Eye size={19} />}
          </button>
        </div>
        <div className="money-actions" aria-label="Thao tác nhanh">
          <button type="button" className="money-action expense" onClick={() => setCaptureType('expense')}><ArrowUpRight size={18} /> Ghi chi</button>
          <button type="button" className="money-action income" onClick={() => setCaptureType('income')}><ArrowDownLeft size={18} /> Ghi thu</button>
          <button type="button" className="money-action transfer" onClick={() => setTransferOpen(true)} disabled={wallets.length < 2} aria-label="Chuyển ví Giữa hai ví" title={wallets.length < 2 ? 'Cần ít nhất hai ví để chuyển tiền' : undefined}><ArrowLeftRight size={18} /> Chuyển ví</button>
        </div>
      </section>

      <section className="money-wallet-section" aria-label="Chọn ví">
        <div className="money-section-heading">
          <h2>Chọn ví</h2>
          {selectedWallet
            ? <button type="button" className="money-quiet-button" onClick={() => setWalletForm(selectedWallet)}><Pencil size={15} /> Sửa ví</button>
            : <span className="money-muted">{wallets.length} ví</span>}
        </div>
        {!!wallets.length && (
          <>
            <button type="button" className="money-all-wallets" aria-pressed={walletId === 'all'} onClick={() => selectWallet('all')}>
              <WalletCards size={16} /> Tất cả ví {walletId === 'all' && <Check size={14} />}
            </button>
            <div className="money-wallet-grid">
              {wallets.map(wallet => {
                const Icon = wallet.type === 'bank' ? Building2 : wallet.type === 'cash' ? Banknote : wallet.type === 'e_wallet' ? Smartphone : WalletCards;
                const selected = walletId === wallet.id;
                return (
                  <button type="button" key={wallet.id} className="money-wallet-card" aria-pressed={selected}
                    aria-label={'Chọn ví ' + wallet.name} onClick={() => selectWallet(selected ? 'all' : wallet.id)}>
                    <span className="money-wallet-icon" style={{ borderColor: wallet.color }}><Icon size={17} /></span>
                    <span className="money-wallet-copy">
                      <span className="money-wallet-name" title={wallet.name}>{wallet.name}</span>
                      <small>{walletLabels[wallet.type] ?? 'Ví khác'}</small>
                      <strong>{displayMoney(wallet.balance)}</strong>
                    </span>
                    {selected && <Check size={14} className="money-wallet-check" />}
                  </button>
                );
              })}
            </div>
          </>
        )}
        {loading && !wallets.length && <p className="money-muted" role="status">Đang tải ví…</p>}
        {!loading && !wallets.length && !error && <p className="money-muted">Thêm ví để theo dõi số dư riêng cho từng nguồn tiền.</p>}
      </section>

      <section className="money-activity" aria-labelledby="money-activity-title" aria-busy={loading}>
        <div className="money-journal-tools">
          <div className="money-section-heading money-activity-heading">
            <h2 id="money-activity-title">Sổ giao dịch</h2>
            <button type="button" className="money-quiet-button" disabled={loading || refreshing} onClick={() => void load(true)} aria-label="Làm mới giao dịch"><RefreshCw size={17} className={refreshing ? 'spin' : ''} /></button>
          </div>
          <div className="money-period-controls">
            <label className="money-select">
              <CalendarDays size={16} aria-hidden="true" />
              <select aria-label="Khoảng thời gian" value={period} onChange={event => setPeriod(event.target.value as Period)}>
                <option value="all">Mọi thời gian</option>
                <option value="today">Hôm nay</option>
                <option value="week">7 ngày qua</option>
                <option value="month">Tháng này</option>
                <option value="custom">Tùy chọn</option>
              </select>
              <ChevronDown size={14} aria-hidden="true" />
            </label>
            <button type="button" className="money-filter-button" aria-expanded={filtersOpen} aria-controls="money-filters" onClick={() => setFiltersOpen(value => !value)}>
              <Filter size={15} /> Bộ lọc {category !== 'all' && <i aria-hidden="true" />}
            </button>
          </div>
          {period === 'custom' && (
            <div className="money-custom-period">
              <label>Từ ngày<input type="date" value={customFrom} onChange={event => setCustomFrom(event.target.value)} /></label>
              <label>Đến ngày<input type="date" value={customTo} onChange={event => setCustomTo(event.target.value)} /></label>
              {invalidRange && <p role="alert">Ngày kết thúc phải từ ngày bắt đầu trở đi.</p>}
            </div>
          )}

          <div className="money-type-filters" role="group" aria-label="Lọc nhanh dòng tiền">
            {(Object.keys(transactionTypes) as TypeFilter[]).map(value => (
              <button type="button" key={value} aria-pressed={type === value} onClick={() => selectType(value)}>{transactionTypes[value]}</button>
            ))}
          </div>

          {filtersOpen && (
            <div id="money-filters" className="money-expanded-filters">
              <label>Loại giao dịch
                <select value={type} onChange={event => selectType(event.target.value as TypeFilter)}>
                  <option value="all">Tất cả loại</option><option value="income">Thu nhập</option><option value="expense">Chi tiêu</option><option value="transfer">Chuyển ví</option>
                </select>
              </label>
              <label>Danh mục
                <select value={category} onChange={event => setCategory(event.target.value)}>
                  <option value="all">Tất cả danh mục</option>
                  {categories.map(id => <option key={id} value={id}>{labels[id] ?? id}</option>)}
                </select>
              </label>
            </div>
          )}

          <div className="money-search">
            <Search size={17} />
            <input aria-label="Tìm giao dịch" placeholder="Tìm giao dịch" value={query} onChange={event => setQuery(event.target.value)} />
            {query && <button type="button" aria-label="Xóa tìm kiếm" onClick={() => setQuery('')}><X size={16} /></button>}
          </div>
          <div className="money-review-filters" role="group" aria-label="Rà soát giao dịch">
            <button type="button" aria-pressed={review === 'no-photo'} onClick={() => setReview(review === 'no-photo' ? 'all' : 'no-photo')}><ImageOff size={14} /> Thiếu ảnh <b>{reviewCounts.noPhoto}</b></button>
            <button type="button" aria-pressed={review === 'uncategorized'} onClick={() => setReview(review === 'uncategorized' ? 'all' : 'uncategorized')}><Tag size={14} /> Chưa phân loại <b>{reviewCounts.uncategorized}</b></button>
          </div>
          {!loading && !invalidRange && (
            <dl className="money-filter-totals" aria-label="Tổng tiền theo bộ lọc">
              <div><dt><ArrowDownLeft size={15} /> Tổng thu</dt><dd className="income">{displayMoney(totals.income)}</dd></div>
              <div><dt><ArrowUpRight size={15} /> Tổng chi</dt><dd className="expense">{displayMoney(totals.expense)}</dd></div>
            </dl>
          )}
        </div>

        <div className="money-list-controls">
          <span aria-live="polite">{loading ? 'Đang tải…' : visibleRows.length + ' giao dịch'}</span>
          {hasFilters && <button type="button" className="money-reset-button" onClick={resetFilters}>Xóa lọc</button>}
          <label className="money-select money-sort">
            <select aria-label="Sắp xếp giao dịch" value={sort} onChange={event => setSort(event.target.value as typeof sort)}>
              <option value="newest">Mới nhất</option><option value="oldest">Cũ nhất</option><option value="highest">Tiền cao nhất</option><option value="lowest">Tiền thấp nhất</option>
            </select>
            <ChevronDown size={13} aria-hidden="true" />
          </label>
        </div>
        {!loading && rows.length === 500 && <p className="money-limit-note">Đang xem 500 giao dịch đã tải. Chọn khoảng ngày hẹp hơn để tra cứu các giao dịch cũ.</p>}
        {loading && <div className="money-history-empty"><span className="loading-mark" /></div>}
        {!loading && !invalidRange && (visibleRows.length ? (
          <div className="money-history">
            {amountOrder ? visibleRows.map(renderRow) : [...groups].map(([date, group]) => (
              <div key={date} className="money-history-day">
                <div className="money-history-date">{dateLabel(date)}</div>
                {group.map(renderRow)}
              </div>
            ))}
          </div>
        ) : (
          <div className="money-history-empty">
            <Search size={23} />
            <h3>{hasFilters ? 'Không có giao dịch phù hợp' : 'Chưa có giao dịch'}</h3>
            <button type="button" onClick={hasFilters ? resetFilters : () => setCaptureType('expense')}>{hasFilters ? 'Xóa bộ lọc' : 'Ghi khoản đầu tiên'}</button>
          </div>
        ))}
      </section>

      {captureType && <ExpenseCapture selectedDate={todayKey()} initialType={captureType} defaultWalletId={walletId === 'all' ? undefined : walletId} onClose={() => setCaptureType(null)} onSaved={saved} />}
      {walletForm && <WalletForm wallet={walletForm === 'new' ? undefined : walletForm} onClose={() => setWalletForm(null)} onSaved={saved} />}
      {transferOpen && <TransferForm wallets={wallets} initialWalletId={walletId === 'all' ? undefined : walletId} onClose={() => setTransferOpen(false)} onSaved={saved} />}
      {shownDetail && <ExpenseDetail key={shownDetail.id} event={shownDetail} wallets={wallets} onClose={closeDetail} onChanged={saved} />}
    </div>
  );
}

function money(value: number) { return `${Math.round(value).toLocaleString('vi-VN')} ₫`; }
function normalize(value: string) { return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/đ/gi, 'd').toLowerCase().trim(); }
function dateLabel(value: string) { return new Date(`${value}T12:00:00`).toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }); }
function dateKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function todayKey() { return dateKey(new Date()); }
