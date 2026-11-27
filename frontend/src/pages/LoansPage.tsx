import { ArrowDownLeft, ArrowUpRight, CalendarDays, ChevronRight, CircleCheck, Clock3, HandCoins, Plus, Search, WalletCards, X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { LoanPhotos } from '../components/LoanPhotos';
import { ApiError } from '../services/api';
import { loansApi, type Loan, type LoanDetails, type LoanKind } from '../services/loansApi';
import './loans.css';

const moneyFormat = new Intl.NumberFormat('vi-VN');
const dateFormat = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });
const kindLabels = { borrow: 'Đi vay', lend: 'Cho mượn' };
const money = (value: number) => moneyFormat.format(value) + ' ₫';
const prettyDate = (date: string) => date.split('-').reverse().join('/');
const outstanding = (loan: Loan) => loan.amount - loan.payments.reduce((total, payment) => total + payment.amount, 0);
const normalize = (value: string) => value.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/đ/g, 'd').trim();

type Status = 'open' | 'due' | 'done' | 'all';
type Panel = { view: 'create'; kind: LoanKind } | { view: 'detail' | 'edit' | 'pay' | 'remove'; id: string };

export function LoansPage() {
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [kind, setKind] = useState<LoanKind | 'all'>('all');
  const [status, setStatus] = useState<Status>('open');
  const [query, setQuery] = useState('');
  const [panel, setPanel] = useState<Panel | null>(null);
  const requestVersion = useRef(0);
  const today = dateFormat.format(new Date());

  async function load() {
    const version = ++requestVersion.current;
    setLoading(true);
    setError('');
    try {
      const result = await loansApi.list();
      if (version === requestVersion.current) setLoans(result.loans);
    } catch (caught) {
      if (version === requestVersion.current) {
        setError(caught instanceof ApiError && caught.status === 401
          ? 'Hãy đăng nhập bằng tài khoản trên máy chủ để mở sổ vay mượn.'
          : 'Chưa tải được sổ vay mượn. Vui lòng thử lại.');
      }
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    return () => { requestVersion.current++; };
  }, []);

  const entries = loans.map(loan => ({ loan, remaining: outstanding(loan) }));
  const due = entries
    .filter(({ loan, remaining }) => remaining > 0 && loan.dueOn && loan.dueOn <= today)
    .sort((a, b) => (a.loan.dueOn ?? '').localeCompare(b.loan.dueOn ?? ''));
  const totals = entries.reduce((sum, { loan, remaining }) => {
    sum[loan.kind] += remaining;
    return sum;
  }, { borrow: 0, lend: 0 });
  const visible = (status === 'due' ? due : entries)
    .filter(({ loan, remaining }) => (kind === 'all' || loan.kind === kind)
      && (status !== 'open' || remaining > 0)
      && (status !== 'done' || remaining === 0)
      && normalize(loan.person + ' ' + loan.note).includes(normalize(query)));
  const selected = panel && 'id' in panel ? loans.find(loan => loan.id === panel.id) : undefined;

  function updateLoan(loan: Loan) {
    setLoans(previous => previous.some(item => item.id === loan.id)
      ? previous.map(item => item.id === loan.id ? loan : item)
      : [loan, ...previous]);
  }

  function saved(loan: Loan, message: string) {
    updateLoan(loan);
    setPanel({ view: 'detail', id: loan.id });
    setNotice(message);
  }

  function add(kind: LoanKind) {
    setPanel({ view: 'create', kind });
    setNotice('');
  }

  return (
    <div className="loans-page">
      <header className="loans-heading">
        <div>
          <span className="loans-kicker"><HandCoins size={15} /> Sổ cá nhân</span>
          <h1>Vay &amp; cho mượn</h1>
        </div>
        <Link className="loans-wallet-link" to="/app/transactions"><WalletCards size={16} /> Sổ ví</Link>
      </header>

      <section className="loans-overview" aria-labelledby="loans-overview-title">
        <h2 id="loans-overview-title">Số tiền còn lại</h2>
        <div className="loans-totals">
          <div className="loans-total borrow">
            <span><ArrowUpRight size={16} /> Tôi cần trả</span>
            <strong>{loading || error ? '—' : money(totals.borrow)}</strong>
          </div>
          <div className="loans-total lend">
            <span><ArrowDownLeft size={16} /> Tôi cần thu</span>
            <strong>{loading || error ? '—' : money(totals.lend)}</strong>
          </div>
        </div>
        <div className="loans-actions">
          <button className="loans-primary" type="button" onClick={() => add('borrow')} disabled={loading || Boolean(error)}><Plus size={17} /> Ghi đi vay</button>
          <button className="loans-secondary" type="button" onClick={() => add('lend')} disabled={loading || Boolean(error)}><Plus size={17} /> Ghi cho mượn</button>
        </div>
      </section>

      {!loading && !error && due.length > 0 && (
        <button type="button" className="loans-due" onClick={() => { setStatus('due'); setKind('all'); setQuery(''); }}>
          <Clock3 size={19} />
          <span><strong>{due.length} khoản đến hạn hoặc quá hạn</strong><small>Xem các khoản cần xử lý</small></span>
          <ChevronRight size={16} />
        </button>
      )}

      <section className="loans-journal" aria-label="Các khoản vay và cho mượn" aria-busy={loading}>
        <div className="loans-journal-head">
          <h2>Các khoản của tôi</h2>
          <label className="loans-status">
            <span className="visually-hidden">Trạng thái khoản vay</span>
            <select value={status} onChange={event => setStatus(event.target.value as Status)}>
              <option value="open">Còn số dư</option>
              <option value="due">Đến hạn / Quá hạn</option>
              <option value="done">Đã hoàn tất</option>
              <option value="all">Mọi trạng thái</option>
            </select>
          </label>
        </div>

        <div className="loans-filters" role="group" aria-label="Loại khoản vay">
          <button type="button" aria-pressed={kind === 'all'} onClick={() => setKind('all')}>Tất cả</button>
          <button type="button" aria-pressed={kind === 'borrow'} onClick={() => setKind('borrow')}>Đi vay</button>
          <button type="button" aria-pressed={kind === 'lend'} onClick={() => setKind('lend')}>Cho mượn</button>
        </div>

        <label className="loans-search"><Search size={17} /><input value={query} onChange={event => setQuery(event.target.value)} aria-label="Tìm khoản vay" placeholder="Tìm tên hoặc ghi chú" /></label>
        {notice && <p className="loans-notice" role="status">{notice}</p>}
        {loading && <p className="loans-empty" role="status">Đang tải sổ vay mượn…</p>}
        {error && <div className="loans-empty"><p role="alert">{error}</p><button className="loans-secondary" type="button" onClick={() => void load()}>Thử lại</button></div>}
        {!loading && !error && (
          visible.length ? <div className="loans-list">
            {visible.map(({ loan, remaining }) => (
              <button key={loan.id} className="loans-row" type="button" onClick={() => { setNotice(''); setPanel({ view: 'detail', id: loan.id }); }}>
                <span className={'loans-row-icon ' + loan.kind}>
                  {remaining === 0 ? <CircleCheck size={19} /> : loan.kind === 'borrow' ? <ArrowUpRight size={19} /> : <ArrowDownLeft size={19} />}
                </span>
                <span className="loans-row-content">
                  <strong>{loan.person}</strong>
                  <small>{kindLabels[loan.kind]} · {loanStatus(loan, remaining, today)}</small>
                </span>
                <span className="loans-row-balance"><strong>{money(remaining || loan.amount)}</strong><small>{remaining ? 'Còn lại' : 'Đã tất toán'}</small></span>
                <ChevronRight className="loans-row-chevron" size={15} />
              </button>
            ))}
          </div> : <p className="loans-empty">{loans.length ? 'Không có khoản nào phù hợp.' : 'Chưa có khoản nào. Ghi một khoản đi vay hoặc cho mượn để bắt đầu.'}</p>
        )}
      </section>

      {panel?.view === 'create' && (
        <LoanForm key="create" today={today} initialKind={panel.kind} onClose={() => setPanel(null)}
          onSave={async (id, details) => saved((await loansApi.create(id, details)).loan, 'Đã thêm khoản mới.')} />
      )}
      {selected && panel?.view === 'detail' && (
        <LoanDetail loan={selected} today={today} onClose={() => setPanel(null)}
          onAction={view => setPanel({ view, id: selected.id })} />
      )}
      {selected && panel?.view === 'edit' && (
        <LoanForm key={'edit-' + selected.id} today={today} initialKind={selected.kind} loan={selected}
          onClose={() => setPanel({ view: 'detail', id: selected.id })}
          onSave={async (_id, details) => saved((await loansApi.update(selected.id, details)).loan, 'Đã cập nhật thông tin.')} />
      )}
      {selected && panel?.view === 'pay' && (
        <PaymentForm loan={selected} today={today} onClose={() => setPanel({ view: 'detail', id: selected.id })}
          onSave={async payment => saved((await loansApi.pay(selected.id, payment)).loan, 'Đã ghi thanh toán.')} />
      )}
      {selected && panel?.view === 'remove' && (
        <LoanDialog title="Xóa khoản này?" onClose={() => setPanel({ view: 'detail', id: selected.id })}
          submitLabel="Xác nhận xóa" onSubmit={async () => {
            await loansApi.remove(selected.id);
            setLoans(previous => previous.filter(loan => loan.id !== selected.id));
            setPanel(null);
            setNotice('Đã xóa khoản chưa thanh toán.');
          }}>
          <p className="loans-help">Khoản {kindLabels[selected.kind].toLowerCase()} với {selected.person} sẽ bị xóa khỏi sổ.</p>
        </LoanDialog>
      )}
    </div>
  );
}

function loanStatus(loan: Loan, remaining: number, today: string) {
  if (remaining === 0) return 'Đã hoàn tất';
  if (!loan.dueOn) return 'Chưa đặt hạn';
  if (loan.dueOn === today) return 'Đến hạn hôm nay';
  const daysLeft = (Date.parse(loan.dueOn) - Date.parse(today)) / 86_400_000;
  if (daysLeft < 0) return `Quá hạn ${-daysLeft} ngày (${prettyDate(loan.dueOn)})`;
  return `Còn ${daysLeft} ngày đến hạn (${prettyDate(loan.dueOn)})`;
}

function LoanDetail({ loan, today, onClose, onAction }: {
  loan: Loan;
  today: string;
  onClose: () => void;
  onAction: (view: 'edit' | 'pay' | 'remove') => void;
}) {
  const remaining = outstanding(loan);
  const paid = loan.amount - remaining;
  return (
    <LoanDialog title={loan.person} onClose={onClose}>
      <p className="loans-detail-status">{kindLabels[loan.kind]} · {loanStatus(loan, remaining, today)}</p>
      <div className="loans-detail-money">
        <span>{loan.kind === 'borrow' ? 'Còn phải trả' : 'Còn phải thu'}</span>
        <strong>{money(remaining)}</strong>
        <progress aria-label="Tiến độ thanh toán" max={loan.amount} value={paid} />
        <small>Đã thanh toán {money(paid)} / {money(loan.amount)}</small>
      </div>
      <p className="loans-help"><CalendarDays size={15} /> Ngày phát sinh {prettyDate(loan.openedOn)}</p>
      {loan.note && <p className="loans-detail-note">{loan.note}</p>}
      {remaining > 0 && <button className="loans-primary" type="button" onClick={() => onAction('pay')}>{loan.kind === 'borrow' ? 'Ghi trả tiền' : 'Ghi nhận thu tiền'}</button>}
      <div className="loans-detail-actions">
        <button className="loans-secondary" type="button" onClick={() => onAction('edit')}>Sửa thông tin</button>
        {paid === 0 && <button className="loans-danger" type="button" onClick={() => onAction('remove')}>Xóa khoản</button>}
      </div>
      <section className="loans-payments" aria-label="Lịch sử thanh toán">
        <h3>Lịch sử thanh toán</h3>
        {loan.payments.length ? <ul>
          {[...loan.payments].sort((a, b) => b.date.localeCompare(a.date)).map(payment => (
            <li key={payment.id}>
              <span><time dateTime={payment.date}>{prettyDate(payment.date)}</time>{payment.note && <small>{payment.note}</small>}</span>
              <strong>{money(payment.amount)}</strong>
            </li>
          ))}
        </ul> : <p className="loans-help">Chưa ghi khoản thanh toán nào.</p>}
      </section>
    </LoanDialog>
  );
}

function LoanForm({ today, initialKind, loan, onClose, onSave }: {
  today: string; initialKind: LoanKind; loan?: Loan; onClose: () => void;
  onSave: (id: string, details: LoanDetails) => Promise<void>;
}) {
  const [kind, setKind] = useState(initialKind);
  const [person, setPerson] = useState(loan?.person ?? '');
  const [amount, setAmount] = useState(loan ? String(loan.amount) : '');
  const [openedOn, setOpenedOn] = useState(loan?.openedOn ?? today);
  const [dueOn, setDueOn] = useState(loan?.dueOn ?? '');
  const [note, setNote] = useState(loan?.note ?? '');
  const [id] = useState(() => loan?.id ?? crypto.randomUUID());
  const [photoLoan, setPhotoLoan] = useState(loan);
  const [photosBusy, setPhotosBusy] = useState(false);

  return (
    <LoanDialog title={loan ? 'Sửa khoản vay/mượn' : kindLabels[kind]} onClose={onClose} locked={photosBusy} submitLabel={loan ? 'Lưu thay đổi' : 'Lưu khoản mới'}
      onSubmit={async () => {
        const value = Number(amount);
        if (!person.trim()) throw new Error('Hãy nhập tên người hoặc đơn vị.');
        if (!value || value > 1_000_000_000_000) throw new Error('Số tiền phải từ 1 đến 1.000.000.000.000 ₫.');
        if (dueOn && dueOn < openedOn) throw new Error('Hạn trả phải từ ngày phát sinh trở đi.');
        if (loan && value < loan.amount - outstanding(loan)) throw new Error('Số tiền gốc phải bằng hoặc lớn hơn số đã thanh toán.');
        await onSave(id, { kind, person: person.trim(), amount: value, openedOn, dueOn: dueOn || null, note: note.trim() });
      }}>
      <label>Loại khoản<select value={kind} disabled={Boolean(loan?.payments.length)} onChange={event => setKind(event.target.value as LoanKind)}>
        <option value="borrow">Đi vay</option><option value="lend">Cho mượn</option>
      </select></label>
      <label>{kind === 'borrow' ? 'Vay từ ai?' : 'Cho ai mượn?'}<input required maxLength={100} value={person} onChange={event => setPerson(event.target.value)} placeholder="Tên người hoặc đơn vị" /></label>
      <AmountField label="Số tiền gốc" value={amount} onChange={setAmount} />
      <div className="loans-date-fields">
        <label>Ngày phát sinh<input type="date" required value={openedOn} onChange={event => setOpenedOn(event.target.value)} /></label>
        <label>Hạn trả (tùy chọn)<input type="date" min={openedOn || undefined} value={dueOn} onChange={event => setDueOn(event.target.value)} /></label>
      </div>
      <label>Ghi chú<textarea maxLength={500} rows={2} value={note} onChange={event => setNote(event.target.value)} /></label>
      {photoLoan && <LoanPhotos loan={photoLoan} onChange={setPhotoLoan} onBusy={setPhotosBusy} />}
      <p className="loans-help">Khoản này được theo dõi riêng trong sổ vay mượn. Số dư ví giữ nguyên.</p>
    </LoanDialog>
  );
}

function PaymentForm({ loan, today, onClose, onSave }: {
  loan: Loan; today: string; onClose: () => void; onSave: (payment: { id: string; amount: number; date: string; note: string }) => Promise<void>;
}) {
  const [id] = useState(() => crypto.randomUUID());
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today);
  const [note, setNote] = useState('');
  const remaining = outstanding(loan);
  return (
    <LoanDialog title={loan.kind === 'borrow' ? 'Ghi trả tiền' : 'Ghi nhận thu tiền'} onClose={onClose} submitLabel="Lưu thanh toán"
      onSubmit={async () => {
        const value = Number(amount);
        if (!value || value > remaining) throw new Error('Số tiền phải lớn hơn 0 và tối đa ' + money(remaining) + '.');
        await onSave({ id, amount: value, date, note: note.trim() });
      }}>
      <p className="loans-help">{loan.person} · Còn lại {money(remaining)}</p>
      <AmountField label="Số tiền thanh toán" value={amount} onChange={setAmount} />
      <button className="loans-secondary" type="button" onClick={() => setAmount(String(remaining))}>Điền toàn bộ số còn lại</button>
      <label>Ngày thanh toán<input required type="date" min={loan.openedOn} max={today} value={date} onChange={event => setDate(event.target.value)} /></label>
      <label>Ghi chú<textarea maxLength={500} rows={2} value={note} onChange={event => setNote(event.target.value)} /></label>
    </LoanDialog>
  );
}

function AmountField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label>{label}<span className="loans-amount-field">
      <input required inputMode="numeric" value={value ? moneyFormat.format(Number(value)) : ''} placeholder="0"
        onChange={event => onChange(event.target.value.replace(/\D/g, '').slice(0, 13))} />
      <span aria-hidden="true">₫</span>
    </span></label>
  );
}

function LoanDialog({ title, children, onClose, onSubmit, submitLabel, locked = false }: {
  title: string; children: ReactNode; onClose: () => void; onSubmit?: () => Promise<void>; submitLabel?: string; locked?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => { element?.close(); };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!onSubmit || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try { await onSubmit(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Vui lòng thử lại.'); }
    finally { pending.current = false; setBusy(false); }
  }

  return (
    <dialog ref={dialog} className="loans-dialog" aria-label={title} onCancel={event => { event.preventDefault(); if (!busy && !locked) onClose(); }}>
      <form className="loans-dialog-content" onSubmit={event => void submit(event)}>
        <header><h2>{title}</h2><button type="button" className="loans-close" onClick={onClose} disabled={busy || locked} aria-label="Đóng"><X size={20} /></button></header>
        <fieldset disabled={busy || locked}>{children}</fieldset>
        {error && <p className="loans-form-error" role="alert">{error}</p>}
        {submitLabel && <button className="loans-primary" type="submit" disabled={busy || locked}>{busy ? 'Đang lưu…' : submitLabel}</button>}
      </form>
    </dialog>
  );
}
