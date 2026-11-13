import { ArrowLeftRight, LoaderCircle, X } from 'lucide-react';
import { useState } from 'react';
import { ApiError, api, type Wallet } from '../services/api';

const walletTypes = [
  { value: 'cash', label: 'Tiền mặt' }, { value: 'bank', label: 'Ngân hàng' },
  { value: 'e_wallet', label: 'Ví điện tử' }, { value: 'savings', label: 'Tiết kiệm' },
  { value: 'credit', label: 'Tín dụng' }, { value: 'custom', label: 'Khác' },
];
const colors = ['#163e36', '#3c6684', '#9c6d42', '#6a718f', '#a35c68'];

export function WalletForm({ wallet, onClose, onSaved }: {
  wallet?: Wallet; onClose: () => void; onSaved: () => void;
}) {
  const [name, setName] = useState(wallet?.name ?? '');
  const [type, setType] = useState(wallet?.type ?? 'cash');
  const [openingBalance, setOpeningBalance] = useState('');
  const [color, setColor] = useState(wallet?.color ?? colors[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    if (saving) return;
    if (!name.trim()) { setError('Vui lòng nhập tên ví.'); return; }
    setSaving(true); setError('');
    try {
      if (wallet) await api.updateWallet(wallet.id, { name: name.trim(), type, color });
      else await api.createWallet({ name: name.trim(), type, color, openingBalance: Number(openingBalance) || 0 });
      onSaved();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Không thể lưu ví. Vui lòng thử lại.');
    } finally { setSaving(false); }
  };
  return (
    <div className="detail-overlay" onClick={saving ? undefined : onClose}>
      <form className="reminder-modal wallet-modal cm-spring-pop money-form" onClick={event => event.stopPropagation()} onSubmit={event => { event.preventDefault(); void save(); }}>
        <button type="button" className="detail-close" disabled={saving} onClick={onClose} aria-label="Đóng"><X size={18} /></button>
        <p className="eyebrow dark">{wallet ? 'CHỈNH SỬA VÍ' : 'THÊM NGUỒN TIỀN'}</p>
        <h2>{wallet ? 'Thông tin ví' : 'Tạo ví mới'}</h2>
        <label className="select-field"><span>Tên ví</span><input value={name} maxLength={80} onChange={event => setName(event.target.value)} placeholder="Ví dụ: Tiền mặt, MB Bank" disabled={saving} /></label>
        <label className="select-field"><span>Loại ví</span><select value={type} onChange={event => setType(event.target.value)} disabled={saving}>{walletTypes.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        {!wallet && <label className="select-field"><span>Số dư ban đầu</span><input inputMode="numeric" value={openingBalance ? Number(openingBalance).toLocaleString('vi-VN') : ''} onChange={event => setOpeningBalance(event.target.value.replace(/\D/g, ''))} placeholder="0" disabled={saving} /></label>}
        <div className="color-picker"><span>Màu ví</span><div>{colors.map(value => <button type="button" key={value} className={color === value ? 'selected' : ''} style={{ background: value }} aria-label={`Chọn màu ${value}`} aria-pressed={color === value} disabled={saving} onClick={() => setColor(value)} />)}</div></div>
        {error && <div className="capture-error" role="alert">{error}</div>}
        <button type="submit" className="save-expense" disabled={saving}>{saving ? <LoaderCircle size={17} className="spin" /> : wallet ? 'Lưu thông tin ví' : 'Tạo ví'}</button>
      </form>
    </div>
  );
}

export function TransferForm({ wallets, initialWalletId, onClose, onSaved }: {
  wallets: Wallet[]; initialWalletId?: string; onClose: () => void; onSaved: () => void;
}) {
  const [from, setFrom] = useState(initialWalletId ?? wallets[0]?.id ?? '');
  const [to, setTo] = useState(wallets.find(wallet => wallet.id !== (initialWalletId ?? wallets[0]?.id))?.id ?? '');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const source = wallets.find(wallet => wallet.id === from);
  const destination = wallets.find(wallet => wallet.id === to);
  const save = async () => {
    if (saving) return;
    const value = Number(amount);
    if (!source || !destination || from === to) { setError('Vui lòng chọn hai ví khác nhau.'); return; }
    if (!Number.isFinite(value) || value <= 0) { setError('Vui lòng nhập số tiền cần chuyển.'); return; }
    if (value > source.balance) { setError('Số dư ví nguồn không đủ để chuyển số tiền này.'); return; }
    if (source.currency !== destination.currency) { setError('Vui lòng chọn hai ví cùng đơn vị tiền tệ.'); return; }
    setSaving(true); setError('');
    const date = new Date();
    const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    try {
      await api.createTransaction({ type: 'transfer', amount: value, note: note.trim() || `${source.name} → ${destination.name}`, categoryId: 'transfer', walletId: from, toWalletId: to, transactionDate: dateKey, transactionTime: date.toTimeString().slice(0, 8) });
      onSaved();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Không thể chuyển tiền. Vui lòng thử lại.');
    } finally { setSaving(false); }
  };
  return (
    <div className="detail-overlay" onClick={saving ? undefined : onClose}>
      <form className="reminder-modal wallet-modal cm-spring-pop money-form" onClick={event => event.stopPropagation()} onSubmit={event => { event.preventDefault(); void save(); }}>
        <button type="button" className="detail-close" disabled={saving} onClick={onClose} aria-label="Đóng"><X size={18} /></button>
        <p className="eyebrow dark">CHUYỂN TIỀN NỘI BỘ</p>
        <h2>Chuyển giữa hai ví</h2>
        <p className="money-form-hint">Khoản chuyển chỉ di chuyển số dư, không tính là thu hoặc chi.</p>
        <div className="transfer-route">
          <label className="select-field"><span>Từ ví</span><select value={from} disabled={saving} onChange={event => { const next = event.target.value; setFrom(next); if (to === next) setTo(wallets.find(wallet => wallet.id !== next)?.id ?? ''); }}>{wallets.map(wallet => <option key={wallet.id} value={wallet.id}>{wallet.name}</option>)}</select></label>
          <ArrowLeftRight size={18} aria-hidden="true" />
          <label className="select-field"><span>Đến ví</span><select value={to} disabled={saving} onChange={event => setTo(event.target.value)}>{wallets.map(wallet => <option key={wallet.id} value={wallet.id} disabled={wallet.id === from}>{wallet.name}</option>)}</select></label>
        </div>
        {source && <p className="money-form-hint">Có thể chuyển: <strong>{source.balance.toLocaleString('vi-VN')} ₫</strong></p>}
        <label className="amount-field"><span>Số tiền chuyển</span><input inputMode="numeric" value={amount ? Number(amount).toLocaleString('vi-VN') : ''} onChange={event => setAmount(event.target.value.replace(/\D/g, ''))} placeholder="0" disabled={saving} /></label>
        <label className="select-field"><span>Ghi chú chuyển tiền</span><input value={note} onChange={event => setNote(event.target.value)} maxLength={500} placeholder="Ví dụ: Rút tiền mặt" disabled={saving} /></label>
        {error && <div className="capture-error" role="alert">{error}</div>}
        <button type="submit" className="save-expense" disabled={saving}>{saving ? <LoaderCircle size={17} className="spin" /> : 'Xác nhận chuyển tiền'}</button>
      </form>
    </div>
  );
}
