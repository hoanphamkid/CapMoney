import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarDays,
  Camera,
  Clock,
  Crop,
  Edit3,
  ImageOff,
  LoaderCircle,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { CalendarEvent } from '../services/api';
import { ApiError, api } from '../services/api';
import { ImageCropModal } from './ImageCropModal';

export function ExpenseDetail({ event, onClose, onChanged }: { event: CalendarEvent; onClose: () => void; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [updatingPhoto, setUpdatingPhoto] = useState(false);
  const [pendingCropFile, setPendingCropFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cancelDeleteRef = useRef<HTMLButtonElement>(null);
  const deleteTitleId = useId();
  const deleteDescriptionId = useId();

  useEffect(() => {
    if (confirmingDelete) cancelDeleteRef.current?.focus();
  }, [confirmingDelete]);

  const income = event.kind === 'income';
  const isMbBank = event.source === 'webhook_mbbank' || /MB Bank|MBBank/i.test(event.note ?? '');

  const timeDisplay = useMemo(() => {
    if (event.transactionTime) return event.transactionTime;
    if (event.time) return event.time;
    if (event.createdAt) {
      try {
        const d = new Date(event.createdAt);
        return d.toTimeString().slice(0, 8);
      } catch {
        // Ignore
      }
    }
    return '';
  }, [event]);

  // Handle direct photo update from detail view (e.g. replacing MB receipt with real photo)
  const handleDirectPhotoChosen = (file: File) => {
    setPendingCropFile(file);
  };

  const handleApplyCroppedPhoto = async (cropped: File) => {
    setPendingCropFile(null);
    setUpdatingPhoto(true);
    try {
      await api.updateTransaction(event.id, {
        type: event.kind,
        amount: event.amount ?? 0,
        note: event.note ?? '',
        categoryId: event.categoryId ?? 'other',
        walletId: event.walletId ?? '',
        transactionDate: event.dateKey,
        transactionTime: event.transactionTime,
        source: 'camera',
        image: cropped,
      });
      onChanged();
    } catch {
      alert('Không thể cập nhật ảnh.');
    } finally {
      setUpdatingPhoto(false);
    }
  };

  if (pendingCropFile) {
    return (
      <ImageCropModal
        file={pendingCropFile}
        onCancel={() => setPendingCropFile(null)}
        onConfirm={handleApplyCroppedPhoto}
      />
    );
  }

  if (editing) {
    return (
      <EditTransaction
        event={event}
        onCancel={() => setEditing(false)}
        onSaved={() => {
          setEditing(false);
          onChanged();
        }}
      />
    );
  }

  const remove = async () => {
    if (deleting) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await api.deleteTransaction(event.id);
      onClose();
      onChanged();
    } catch (error) {
      setDeleteError(error instanceof ApiError
        ? error.status === 401
          ? 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại rồi xóa giao dịch.'
          : error.message
        : 'Không thể xóa giao dịch. Vui lòng thử lại.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="detail-overlay" onClick={deleting ? undefined : onClose}>
      <section className="expense-detail cm-spring-pop" onClick={eventClick => eventClick.stopPropagation()}>
        <button className="detail-close" disabled={deleting} onClick={onClose} aria-label="Đóng">
          <X size={18} />
        </button>

        {/* Source Badge & Time Stamp Ribbon */}
        <div className="cm-detail-source-ribbon">
          {isMbBank ? (
            <span className="cm-source-badge mbbank">
              <Sparkles size={12} /> MB Bank Auto
            </span>
          ) : event.imageUrl ? (
            <span className="cm-source-badge camera">
              <Camera size={12} /> Camera Real-time
            </span>
          ) : (
            <span className="cm-source-badge manual">
              <Edit3 size={12} /> Ghi chép
            </span>
          )}

          {timeDisplay && (
            <span className="cm-detail-time-chip">
              <Clock size={12} /> {timeDisplay}
            </span>
          )}
        </div>

        {/* Photo Card Container */}
        <div className="cm-detail-photo-stage">
          {event.imageUrl ? (
            <img className="detail-photo" src={event.imageUrl} alt="Ảnh giao dịch" />
          ) : (
            <div className="detail-no-photo">
              <ImageOff size={28} />
              <span>Giao dịch chưa có ảnh</span>
            </div>
          )}

          {/* Quick Snap/Replace Photo Button directly on Card */}
          <button
            type="button"
            className="cm-detail-snap-btn"
            disabled={updatingPhoto}
            onClick={() => fileInputRef.current?.click()}
            title={event.imageUrl ? 'Chụp hoặc thay ảnh bill thật' : 'Chụp ảnh gắn vào giao dịch'}
          >
            {updatingPhoto ? (
              <LoaderCircle size={14} className="spin" />
            ) : (
              <>
                <Camera size={14} />
                <span>{event.imageUrl ? (isMbBank ? 'Thay bằng ảnh bill thật' : 'Thay ảnh') : 'Chụp / Gắn ảnh'}</span>
              </>
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: 'none' }}
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) handleDirectPhotoChosen(f);
              e.target.value = '';
            }}
          />
        </div>

        <div className="detail-content">
          <span className={`detail-kind ${income ? 'income' : 'expense'}`}>
            {income ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}
            {income ? 'Thu nhập' : 'Chi tiêu'}
          </span>
          <h2>{formatMoney(event.amount ?? 0)}</h2>
          <p className="detail-note">{event.note || event.title}</p>
          <div className="detail-meta">
            <span>
              <CalendarDays size={14} /> {formatDate(event.dateKey)}
            </span>
            <span>Danh mục: {categoryLabel(event.categoryId)}</span>
          </div>
          {confirmingDelete ? (
            <div
              className="detail-delete-confirm"
              role="alertdialog"
              aria-labelledby={deleteTitleId}
              aria-describedby={deleteDescriptionId}
              aria-busy={deleting}
              onKeyDown={e => {
                if (e.key === 'Escape' && !deleting) {
                  e.stopPropagation();
                  setConfirmingDelete(false);
                  setDeleteError('');
                }
              }}
            >
              <h3 id={deleteTitleId}>Xóa giao dịch này?</h3>
              <p id={deleteDescriptionId}>Giao dịch sẽ bị xóa và số dư ví sẽ được hoàn tác.</p>
              {deleteError && <div className="capture-error" role="alert">{deleteError}</div>}
              <div className="detail-actions">
                <button ref={cancelDeleteRef} type="button" disabled={deleting} onClick={() => {
                  setConfirmingDelete(false);
                  setDeleteError('');
                }}>Hủy</button>
                <button type="button" className="danger" disabled={deleting} onClick={() => void remove()}>
                  {deleting ? <LoaderCircle size={14} className="spin" /> : <Trash2 size={14} />}
                  {deleting ? 'Đang xóa…' : 'Xác nhận xóa'}
                </button>
              </div>
            </div>
          ) : (
            <div className="detail-actions">
              <button type="button" onClick={() => setEditing(true)}>
                <Edit3 size={14} /> Sửa chi tiết
              </button>
              <button type="button" className="danger" onClick={() => setConfirmingDelete(true)}>
                <Trash2 size={14} /> Xóa
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function EditTransaction({
  event,
  onCancel,
  onSaved,
}: {
  event: CalendarEvent;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState(String(event.amount ?? ''));
  const [note, setNote] = useState(event.note ?? '');
  const [category, setCategory] = useState(event.categoryId ?? 'other');
  const [type, setType] = useState<'expense' | 'income'>(event.kind === 'income' ? 'income' : 'expense');
  const [timeStr, setTimeStr] = useState(event.transactionTime || event.time || new Date().toTimeString().slice(0, 5));
  const [image, setImage] = useState<File | null>(null);
  const [pendingCropFile, setPendingCropFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const previewUrl = useMemo(() => (image ? URL.createObjectURL(image) : event.imageUrl ?? ''), [image, event.imageUrl]);
  useEffect(() => () => {
    if (image && previewUrl) URL.revokeObjectURL(previewUrl);
  }, [image, previewUrl]);

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await api.updateTransaction(event.id, {
        type,
        amount: Number(amount.replace(/[^0-9]/g, '')),
        note,
        categoryId: category,
        walletId: event.walletId ?? '',
        transactionDate: event.dateKey,
        transactionTime: timeStr ? (timeStr.length === 5 ? `${timeStr}:00` : timeStr) : undefined,
        source: image ? 'camera' : (event.source as any),
        image,
      });
      onSaved();
    } catch {
      setError('Không thể cập nhật giao dịch.');
    } finally {
      setSaving(false);
    }
  };

  if (pendingCropFile) {
    return (
      <ImageCropModal
        file={pendingCropFile}
        onCancel={() => setPendingCropFile(null)}
        onConfirm={cropped => {
          setPendingCropFile(null);
          setImage(cropped);
        }}
      />
    );
  }

  return (
    <div className="detail-overlay" onClick={onCancel}>
      <section className="reminder-modal edit-transaction cm-spring-pop" onClick={e => e.stopPropagation()}>
        <button className="detail-close" onClick={onCancel}>
          <X size={18} />
        </button>
        <p className="eyebrow dark">CHỈNH SỬA</p>
        <h2>Giao dịch ngày {event.dateKey.slice(-2)}</h2>
        {previewUrl && <img className="edit-thumb" src={previewUrl} alt="Ảnh giao dịch" />}
        <label className="amount-field">
          <span>Số tiền</span>
          <input
            inputMode="numeric"
            value={Number(amount.replace(/[^0-9]/g, '') || '0').toLocaleString('vi-VN')}
            onChange={input => setAmount(input.target.value)}
          />
        </label>
        <div className="type-toggle">
          <button
            type="button"
            className={type === 'expense' ? 'active expense' : ''}
            onClick={() => setType('expense')}
          >
            <ArrowUpRight size={15} /> Chi tiêu
          </button>
          <button
            type="button"
            className={type === 'income' ? 'active income' : ''}
            onClick={() => setType('income')}
          >
            <ArrowDownLeft size={15} /> Thu nhập
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <label className="select-field">
            <span>Giờ phát sinh</span>
            <input
              type="time"
              value={timeStr.slice(0, 5)}
              onChange={e => setTimeStr(e.target.value)}
            />
          </label>
          <label className="select-field">
            <span>Danh mục</span>
            <select value={category} onChange={input => setCategory(input.target.value)}>
              {categories.map(item => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="note-field">
          <span>Ghi chú</span>
          <textarea rows={2} value={note} onChange={input => setNote(input.target.value)} placeholder="Nhập ghi chú..." />
        </label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
          <label className="replace-image">
            <Camera size={15} /> {event.imageUrl ? 'Thay ảnh khác' : 'Chụp/Gắn ảnh'}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={input => {
                const file = input.target.files?.[0];
                if (file) setPendingCropFile(file);
                input.target.value = '';
              }}
            />
          </label>
          {image && (
            <button
              type="button"
              className="replace-image"
              onClick={() => setPendingCropFile(image)}
            >
              <Crop size={15} /> Cắt lại
            </button>
          )}
        </div>
        {error && <div className="capture-error">{error}</div>}
        <button className="save-expense" style={{ marginTop: 14, width: '100%' }} disabled={saving} onClick={() => void save()}>
          {saving ? <LoaderCircle size={17} className="spin" /> : 'Lưu thay đổi'}
        </button>
      </section>
    </div>
  );
}

const categories = [
  { id: 'food', label: 'Ăn uống' },
  { id: 'shopping', label: 'Mua sắm' },
  { id: 'transport', label: 'Di chuyển' },
  { id: 'entertainment', label: 'Giải trí' },
  { id: 'bills', label: 'Hóa đơn' },
  { id: 'health', label: 'Sức khỏe' },
  { id: 'salary', label: 'Lương' },
  { id: 'bonus', label: 'Thưởng' },
  { id: 'investment', label: 'Đầu tư' },
  { id: 'gift', label: 'Được tặng' },
  { id: 'other', label: 'Khác' },
];

function formatMoney(amount: number) {
  return `${amount.toLocaleString('vi-VN')} ₫`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('vi-VN', { day: 'numeric', month: 'long', year: 'numeric' }).format(
    new Date(`${value}T12:00:00`),
  );
}

function categoryLabel(value?: string) {
  return categories.reduce<Record<string, string>>((map, item) => ({ ...map, [item.id]: item.label }), {})[value ?? 'other'] ?? 'Khác';
}
