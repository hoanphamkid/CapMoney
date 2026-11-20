import { ImagePlus, Trash2, X } from 'lucide-react';
import { useRef, useState, type ChangeEvent } from 'react';
import { encodeLoanPhoto, loansApi, MAX_LOAN_PHOTOS, type Loan } from '../services/loansApi';

export function LoanPhotos({ loan, onChange, onBusy }: {
  loan: Loan;
  onChange: (loan: Loan) => void;
  onBusy: (busy: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const pending = useRef(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const photos = loan.photos ?? [];
  const imageIndex = photos.findIndex(photo => photo.id === viewingId);
  const viewing = photos[imageIndex];

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = '';
    if (!files.length || pending.current) return;
    const available = MAX_LOAN_PHOTOS - photos.length;
    if (files.length > available) {
      setError(`Bạn có thể thêm tối đa ${available} ảnh nữa.`);
      setProgress('');
      return;
    }

    pending.current = true;
    onBusy(true);
    setError('');
    let saved = 0;
    try {
      for (const [index, file] of files.entries()) {
        setProgress(`Đang lưu ảnh ${index + 1}/${files.length}…`);
        const jpeg = await encodeLoanPhoto(file);
        const result = await loansApi.addPhoto(loan.id, { id: crypto.randomUUID(), jpeg });
        onChange(result.loan);
        saved++;
      }
      setProgress(`Đã thêm ${saved} ảnh.`);
    } catch (caught) {
      setProgress(saved ? `Đã thêm ${saved}/${files.length} ảnh.` : '');
      const message = caught instanceof Error ? caught.message : 'Chưa tải được ảnh.';
      setError(`Ảnh ${saved + 1}/${files.length}: ${message}`);
    } finally {
      pending.current = false;
      onBusy(false);
    }
  }

  async function remove(photoId: string) {
    if (pending.current) return;
    pending.current = true;
    onBusy(true);
    setError('');
    setProgress('');
    try {
      const result = await loansApi.removePhoto(loan.id, photoId);
      onChange(result.loan);
      setViewingId(null);
      setConfirmRemove(false);
      setProgress('Đã xóa ảnh.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Chưa xóa được ảnh.');
    } finally {
      pending.current = false;
      onBusy(false);
    }
  }

  return (
    <section className="loans-photos" aria-label="Ảnh đính kèm">
      <div className="loans-photos-head">
        <h3>Ảnh đính kèm <small>{photos.length}/{MAX_LOAN_PHOTOS}</small></h3>
        <input ref={input} type="file" accept="image/*" multiple hidden aria-label="Chọn nhiều ảnh đính kèm" onChange={event => void upload(event)} />
        <button className="loans-secondary" type="button" disabled={photos.length >= MAX_LOAN_PHOTOS}
          onClick={() => input.current?.click()}><ImagePlus size={16} /> Thêm ảnh</button>
      </div>
      {!photos.length && <p className="loans-help">Có thể chọn nhiều ảnh biên nhận hoặc giấy vay trong một lần.</p>}
      {photos.length > 0 && (
        <ul className="loans-photo-list">
          {photos.map((photo, index) => (
            <li key={photo.id}>
              <button type="button" aria-label={`Xem ảnh ${index + 1}`} aria-pressed={photo.id === viewingId}
                onClick={() => { setViewingId(photo.id); setConfirmRemove(false); }}>
                <img src={photo.url} alt="" loading="lazy" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {viewing && (
        <div className="loans-photo-viewer">
          <img src={viewing.url} alt={`Ảnh đính kèm ${imageIndex + 1}`} />
          <div className="loans-photo-actions">
            {confirmRemove ? (
              <>
                <span className="loans-help">Xóa ảnh này?</span>
                <button className="loans-secondary" type="button" onClick={() => setConfirmRemove(false)}>Giữ ảnh</button>
                <button className="loans-danger" type="button" onClick={() => void remove(viewing.id)}>Xác nhận xóa ảnh</button>
              </>
            ) : (
              <>
                <button className="loans-secondary" type="button" onClick={() => setViewingId(null)}><X size={16} /> Đóng ảnh</button>
                <button className="loans-danger" type="button" onClick={() => setConfirmRemove(true)}><Trash2 size={16} /> Xóa ảnh</button>
              </>
            )}
          </div>
        </div>
      )}
      {progress && <p className="loans-help" role="status">{progress}</p>}
      {error && <p className="loans-form-error" role="alert">{error}</p>}
    </section>
  );
}
