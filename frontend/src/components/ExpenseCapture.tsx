import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarDays,
  Camera,
  Check,
  ChevronDown,
  LoaderCircle,
  Plus,
  ReceiptText,
  Share,
  ShoppingCart,
  SquarePen,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, api, type Wallet } from '../services/api';
import { CameraView } from './CameraView';

const expenseCategories = [
  { id: 'food', label: 'Ăn uống' },
  { id: 'shopping', label: 'Mua sắm' },
  { id: 'transport', label: 'Di chuyển' },
  { id: 'bills', label: 'Hóa đơn' },
  { id: 'entertainment', label: 'Giải trí' },
  { id: 'health', label: 'Sức khỏe' },
  { id: 'other', label: 'Khác' },
];

const incomeCategories = [
  { id: 'salary', label: 'Lương' },
  { id: 'bonus', label: 'Thưởng' },
  { id: 'investment', label: 'Đầu tư' },
  { id: 'gift', label: 'Được tặng' },
  { id: 'other', label: 'Thu khác' },
];

type ExpenseCaptureProps = {
  selectedDate: string;
  initialType?: 'expense' | 'income';
  defaultWalletId?: string;
  onClose: () => void;
  onSaved: () => void;
};

export function ExpenseCapture({
  selectedDate,
  initialType = 'expense',
  defaultWalletId,
  onClose,
  onSaved,
}: ExpenseCaptureProps) {
  const [showCamera, setShowCamera] = useState(false);
  const [type, setType] = useState<'expense' | 'income'>(initialType);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [category, setCategory] = useState(initialType === 'income' ? 'salary' : 'food');
  const [dateKey, setDateKey] = useState(selectedDate || todayKey());
  const [walletId, setWalletId] = useState(defaultWalletId && defaultWalletId !== 'all' ? defaultWalletId : '');
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [image, setImage] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);

  const previewUrl = useMemo(() => (image ? URL.createObjectURL(image) : ''), [image]);
  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  useEffect(() => {
    let active = true;
    const initWallets = async () => {
      try {
        const result = await api.wallets();
        let list = result.wallets;
        if (!list.length) {
          const w1 = await api.createWallet({ name: 'Wallet', type: 'cash', openingBalance: 0, color: '#163e36' });
          const w2 = await api.createWallet({ name: 'Bank', type: 'bank', openingBalance: 0, color: '#3c6684' });
          list = [w1.wallet, w2.wallet];
        }
        if (!active) return;
        setWallets(list);
        setWalletId(current => {
          if (current && list.some(w => w.id === current)) return current;
          return list[0]?.id ?? '';
        });
      } catch {
        if (active) setError('Không tải được danh sách ví.');
      }
    };
    void initWallets();
    return () => {
      active = false;
    };
  }, []);

  const switchType = (nextType: 'expense' | 'income') => {
    setType(nextType);
    if (nextType === 'income' && !incomeCategories.some(item => item.id === category)) {
      setCategory('salary');
    } else if (nextType === 'expense' && !expenseCategories.some(item => item.id === category)) {
      setCategory('food');
    }
  };

  const categories = type === 'income' ? incomeCategories : expenseCategories;
  const formattedAmount = amount ? Number(amount.replace(/[^0-9]/g, '')).toLocaleString('vi-VN') : '';

  const saveTransaction = async (keepOpen = false) => {
    const numericAmount = Number(amount.replace(/[^0-9]/g, ''));
    if (!numericAmount) {
      setError('Vui lòng nhập số tiền.');
      return;
    }
    let targetWalletId = walletId || wallets[0]?.id || '';
    setSaving(true);
    setError('');
    try {
      if (!targetWalletId) {
        const created = await api.createWallet({ name: 'Wallet', type: 'cash', openingBalance: 0, color: '#163e36' });
        targetWalletId = created.wallet.id;
        setWallets([created.wallet]);
        setWalletId(targetWalletId);
      }
      await api.createTransaction({
        type,
        amount: numericAmount,
        note: note.trim() || (categories.find(c => c.id === category)?.label ?? ''),
        categoryId: category,
        walletId: targetWalletId,
        transactionDate: dateKey,
        image,
      });
      if (keepOpen) {
        setAmount('');
        setNote('');
        setImage(null);
      } else {
        onSaved();
      }
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Không thể lưu giao dịch.');
    } finally {
      setSaving(false);
    }
  };

  if (showCamera) {
    return (
      <div className="capture-overlay">
        <CameraView
          onCaptured={file => {
            setImage(file);
            setShowCamera(false);
          }}
          onSelected={file => {
            setImage(file);
            setShowCamera(false);
          }}
          onManual={() => setShowCamera(false)}
          onClose={() => setShowCamera(false)}
        />
      </div>
    );
  }

  const isToday = dateKey === todayKey();
  const displayDate = isToday ? 'Hôm nay' : formatShortDate(dateKey);

  return (
    <div className="cm-capture-modal" onClick={onClose}>
      <div className="cm-capture-sheet" onClick={event => event.stopPropagation()}>
        <header className="cm-capture-top">
          <button type="button" className="cm-pill-btn" onClick={onClose}>
            Hủy
          </button>
          <div className="cm-capture-top-right">
            <button
              type="button"
              className="cm-camera-trigger"
              onClick={() => setShowCamera(true)}
              title="Mở camera chụp hóa đơn"
            >
              <Camera size={15} />
              <span>Chụp bill</span>
            </button>
            <span className="cm-quota-badge">
              <SquarePen size={13} /> 3/3
            </span>
          </div>
        </header>

        <div className={`cm-entry-card ${type} ${previewUrl ? 'has-photo' : ''}`}>
          {previewUrl && (
            <div className="cm-entry-photo-bg">
              <img src={previewUrl} alt="Ảnh đính kèm" />
              <button
                type="button"
                className="cm-remove-photo"
                aria-label="Xóa ảnh"
                onClick={() => setImage(null)}
              >
                <Trash2 size={14} />
              </button>
            </div>
          )}
          <div className="cm-amount-row">
            <span className={`cm-amount-sign ${type}`}>{type === 'expense' ? '−' : '+'}</span>
            <input
              autoFocus
              inputMode="numeric"
              className="cm-amount-input"
              value={formattedAmount}
              onChange={event => setAmount(event.target.value.replace(/[^0-9]/g, ''))}
              placeholder="0"
            />
            <span className="cm-amount-currency">đ</span>
          </div>

          <input
            type="text"
            className="cm-detail-input"
            value={note}
            onChange={event => setNote(event.target.value)}
            placeholder="Thêm chi tiết"
            onKeyDown={event => {
              if (event.key === 'Enter') void saveTransaction(false);
            }}
          />
        </div>

        <div className="cm-Select-pills">
          <label className="cm-select-pill">
            <ShoppingCart size={15} />
            <select value={category} onChange={event => setCategory(event.target.value)}>
              {categories.map(item => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
            <ChevronDown size={14} />
          </label>

          <label className="cm-select-pill">
            <ReceiptText size={15} />
            <select value={walletId} onChange={event => setWalletId(event.target.value)}>
              {wallets.map(wallet => (
                <option key={wallet.id} value={wallet.id}>
                  {wallet.name}
                </option>
              ))}
            </select>
            <ChevronDown size={14} />
          </label>
        </div>

        <div className="cm-type-switcher">
          <button
            type="button"
            className={`cm-type-btn expense ${type === 'expense' ? 'active' : ''}`}
            onClick={() => switchType('expense')}
            aria-label="Khoản chi"
          >
            <ArrowUpRight size={18} />
          </button>
          <button
            type="button"
            className={`cm-type-btn income ${type === 'income' ? 'active' : ''}`}
            onClick={() => switchType('income')}
            aria-label="Khoản thu"
          >
            <ArrowDownLeft size={18} />
          </button>
        </div>

        <div className="cm-date-row">
          <button
            type="button"
            className="cm-date-pill"
            onClick={() => {
              if (dateInputRef.current?.showPicker) {
                dateInputRef.current.showPicker();
              } else {
                dateInputRef.current?.focus();
              }
            }}
          >
            <CalendarDays size={15} />
            <span>{displayDate}</span>
            <ChevronDown size={14} />
            <input
              ref={dateInputRef}
              type="date"
              className="cm-hidden-date"
              value={dateKey}
              onChange={event => {
                if (event.target.value) setDateKey(event.target.value);
              }}
            />
          </button>
        </div>

        {error && <div className="cm-capture-error">{error}</div>}

        <div className="cm-action-row">
          <div className="cm-action-item">
            <button
              type="button"
              className="cm-circle-action secondary"
              onClick={() => fileInputRef.current?.click()}
              aria-label="Chọn ảnh hóa đơn"
            >
              <Share size={20} />
            </button>
            <span>Share</span>
          </div>

          <button
            type="button"
            className="cm-circle-action primary"
            disabled={saving}
            onClick={() => void saveTransaction(false)}
            aria-label="Lưu giao dịch"
          >
            {saving ? <LoaderCircle size={26} className="spin" /> : <Check size={28} strokeWidth={2.5} />}
          </button>

          <div className="cm-action-item">
            <button
              type="button"
              className="cm-circle-action add-more"
              disabled={saving}
              onClick={() => {
                if (!amount && !image) {
                  fileInputRef.current?.click();
                } else {
                  void saveTransaction(true);
                }
              }}
              aria-label="Thêm ảnh hoặc lưu và nhập tiếp"
            >
              <Plus size={22} />
            </button>
            <span>Thêm</span>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="visually-hidden"
          onChange={event => {
            const file = event.target.files?.[0];
            if (file) setImage(file);
            event.target.value = '';
          }}
        />
      </div>
    </div>
  );
}

function todayKey() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatShortDate(dateKey: string) {
  const date = new Date(`${dateKey}T12:00:00`);
  return `${date.getDate()} thg ${date.getMonth() + 1}, ${date.getFullYear()}`;
}
