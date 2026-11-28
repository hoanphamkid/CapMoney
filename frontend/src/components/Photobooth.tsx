import { Check, Download, ImagePlus, Images } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Transaction } from '../services/api';
import { buildDateKeys, formatVNDate } from '../utils/lookbackDates';
import { BOOTH_BORDERS, BOOTH_EFFECTS, BOOTH_THEMES, loadBoothImage, renderPhotobooth, type BoothBorder, type BoothEffect, type BoothPhoto, type BoothRatio, type BoothTheme } from '../utils/photobooth';
import { saveCanvasPng } from '../utils/saveCanvasPng';
import './photobooth.css';

const periods = [{ days: 1, label: '1 ngày' }, { days: 7, label: '1 tuần' }, { days: 30, label: '1 tháng' }] as const;
const ratios = [{ id: 'source', label: 'Tỷ lệ gốc' }, { id: 'portrait', label: 'Dọc 9:16' }, { id: 'landscape', label: 'Ngang 16:9' }] as const;
type BoothPeriod = typeof periods[number]['days'];

export function Photobooth({ transactions }: { transactions: Transaction[] }) {
  const [period, setPeriod] = useState<BoothPeriod>(7);
  const [slots, setSlots] = useState<4 | 8>(4);
  const [ratio, setRatio] = useState<BoothRatio>('source');
  const [theme, setTheme] = useState<BoothTheme>('dark');
  const [border, setBorder] = useState<BoothBorder>('plain');
  const [effect, setEffect] = useState<BoothEffect>('original');
  const [album, setAlbum] = useState<BoothPhoto[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loaded, setLoaded] = useState<{ key: string; images: HTMLImageElement[] } | null>(null);
  const [loadError, setLoadError] = useState('');
  const [exportError, setExportError] = useState('');
  const [saving, setSaving] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const albumUrls = useRef<string[]>([]);

  useEffect(() => () => albumUrls.current.forEach(url => URL.revokeObjectURL(url)), []);

  const transactionPhotos = useMemo<BoothPhoto[]>(() => {
    const days = buildDateKeys(period);
    const min = days[0];
    const max = days[days.length - 1];
    return transactions
      .filter(transaction => transaction.imageUrl && transaction.dateKey >= min && transaction.dateKey <= max)
      .sort((a, b) => b.dateKey.localeCompare(a.dateKey)
        || (b.transactionTime ?? '').localeCompare(a.transactionTime ?? '')
        || (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
      .map(transaction => ({
        id: transaction.id, src: transaction.imageUrl!, label: transaction.note || 'Giao dịch',
        date: formatVNDate(transaction.dateKey),
        amount: `${transaction.type === 'income' ? '+' : '−'}${transaction.amount.toLocaleString('vi-VN')} đ`,
      }));
  }, [period, transactions]);
  const photos = useMemo(() => [...album, ...transactionPhotos], [album, transactionPhotos]);
  const selected = useMemo(() => {
    const byId = new Map(photos.map(photo => [photo.id, photo]));
    return selectedIds.flatMap(id => { const photo = byId.get(id); return photo ? [photo] : []; }).slice(0, slots);
  }, [photos, selectedIds, slots]);
  const sourceKey = JSON.stringify(selected.map(photo => photo.src));

  useEffect(() => {
    const sources: string[] = JSON.parse(sourceKey);
    setLoadError('');
    setExportError('');
    if (!sources.length) return;
    let active = true;
    void Promise.all(sources.map(loadBoothImage)).then(images => {
      if (active) setLoaded({ key: sourceKey, images });
    }).catch(() => {
      if (active) setLoadError('Có ảnh chưa đọc được. Hãy bỏ ảnh lỗi hoặc chọn bản gốc từ album.');
    });
    return () => { active = false; };
  }, [sourceKey]);

  const images = loaded?.key === sourceKey ? loaded.images : null;
  const ready = Boolean(images && selected.length && !loadError);
  useLayoutEffect(() => {
    if (!images || !selected.length || !canvasRef.current) return;
    try {
      renderPhotobooth(canvasRef.current, selected.map((photo, index) => ({ ...photo, image: images[index] })), { slots, ratio, theme, border, effect });
      setLoadError('');
    } catch {
      setLoadError('Không thể tạo ảnh xem trước. Hãy thử dùng ảnh từ album.');
    }
  }, [images, selected, slots, ratio, theme, border, effect]);

  function updatePeriod(next: BoothPeriod) {
    if (next === period) return;
    const days = new Set(buildDateKeys(next));
    const available = new Set(transactions.filter(transaction => days.has(transaction.dateKey)).map(transaction => transaction.id));
    setSelectedIds(current => current.filter(id => id.startsWith('album:') || available.has(id)));
    setPeriod(next);
  }

  function togglePhoto(id: string) {
    const ids = selected.map(photo => photo.id);
    setSelectedIds(ids.includes(id) ? ids.filter(selectedId => selectedId !== id) : [...ids, id].slice(0, slots));
  }

  function addAlbumPhotos(files: FileList) {
    const imported = Array.from(files).filter(file => !file.type || file.type.startsWith('image/')).map(file => {
      const src = URL.createObjectURL(file);
      albumUrls.current.push(src);
      return { id: `album:${src}`, src, label: file.name.replace(/\.[^.]+$/, '') || 'Ảnh từ album' };
    });
    if (!imported.length) return;
    setAlbum(current => [...current, ...imported]);
    setSelectedIds([...selected.map(photo => photo.id), ...imported.map(photo => photo.id)].slice(0, slots));
  }

  async function exportPng() {
    if (!ready || !canvasRef.current || saving) return;
    setSaving(true);
    setExportError('');
    try {
      await saveCanvasPng(canvasRef.current, `capmoney-photobooth-${slots}-${ratio}.png`, 'CapMoney Photobooth');
    } catch {
      setExportError('Không lưu được ảnh PNG. Vui lòng thử lại.');
    } finally { setSaving(false); }
  }

  return <div className="cm-story-slide cm-photobooth-editor">
    <section className="cm-photobooth-controls" aria-label="Chọn ảnh Photobooth">
      <div className="cm-photobooth-control-heading">
        <div><strong>Ảnh của bạn</strong><small>Ghép theo thứ tự đã chọn</small></div>
        <span className="cm-photobooth-selection-count">{selected.length}/{slots} ảnh</span>
      </div>
      <input type="file" ref={uploadRef} accept="image/*" multiple hidden aria-label="Ảnh Photobooth từ album" onChange={event => {
        if (event.currentTarget.files?.length) addAlbumPhotos(event.currentTarget.files);
        event.currentTarget.value = '';
      }} />
      <button className="cm-photobooth-album" type="button" onClick={() => uploadRef.current?.click()}><ImagePlus size={16} aria-hidden="true" /> Thêm ảnh từ album</button>
      <div className="cm-photobooth-period-tabs" role="group" aria-label="Khoảng thời gian ảnh giao dịch">
        {periods.map(option => <button key={option.days} type="button" aria-pressed={period === option.days} onClick={() => updatePeriod(option.days)}>{option.label}</button>)}
      </div>
      {photos.length > 0 && <>
        <div className="cm-photobooth-picker-head">
          <span>{transactionPhotos.length} ảnh giao dịch{album.length ? ` · ${album.length} ảnh album` : ''}</span>
          <div>
            <button type="button" onClick={() => setSelectedIds(photos.slice(0, slots).map(photo => photo.id))}>Chọn đủ</button>
            <button type="button" onClick={() => setSelectedIds([])} disabled={!selected.length}>Bỏ chọn</button>
          </div>
        </div>
        <div className="cm-photobooth-photo-options">
          {photos.map(photo => {
            const order = selected.findIndex(item => item.id === photo.id);
            return <button key={photo.id} type="button" className="cm-photobooth-photo-option" title={photo.label} aria-pressed={order >= 0}
              disabled={order < 0 && selected.length >= slots} onClick={() => togglePhoto(photo.id)}>
              <span className="cm-photobooth-photo-thumb"><img src={photo.src} alt="" loading="lazy" />
                {order >= 0 && <span className="cm-photobooth-photo-order"><Check size={11} aria-hidden="true" />{order + 1}</span>}
              </span>
              <strong>{photo.label}</strong>{photo.date && <small>{photo.date}</small>}
            </button>;
          })}
        </div>
      </>}
    </section>

    <section className="cm-photobooth-frame" aria-label="Xem trước và xuất ảnh">
      <div className="cm-photobooth-head"><strong>Xem trước</strong><span>{ratio === 'source' ? 'Tỷ lệ gốc' : ratio === 'portrait' ? '9:16' : '16:9'}</span></div>
      <canvas className="cm-photobooth-preview" ref={canvasRef} hidden={!ready} role="img" aria-label="Ảnh Photobooth xem trước" />
      {!ready && <div className="cm-photobooth-empty">
        <Images size={27} aria-hidden="true" />
        {!selected.length ? 'Chọn ảnh để xem bản ghép' : loadError ? 'Chưa tạo được bản xem trước' : 'Đang tải ảnh…'}
      </div>}
      {(loadError || exportError) && <p className="cm-photobooth-export-note" role="alert">{loadError || exportError}</p>}
      <button type="button" className="cm-photobooth-dl-btn" disabled={!ready || saving} onClick={() => void exportPng()}>
        <Download size={16} aria-hidden="true" /> {saving ? 'Đang lưu ảnh…' : 'Tải PNG'}
      </button>
    </section>

    <section className="cm-photobooth-controls cm-photobooth-effects" aria-label="Tùy chỉnh ảnh Photobooth">
      <div className="cm-photobooth-customize">
        <ChoiceGroup label="Số ảnh tối đa" value={String(slots)} options={[{ id: '4', label: '4 ảnh' }, { id: '8', label: '8 ảnh' }]} onSelect={value => {
          const next = value === '8' ? 8 : 4;
          setSlots(next);
          setSelectedIds(selected.slice(0, next).map(photo => photo.id));
        }} />
        <ChoiceGroup label="Tỷ lệ khi xuất" value={ratio} options={ratios} onSelect={setRatio} />
      </div>
      <ChoiceGroup label="Màu khung" value={theme} onSelect={setTheme} options={Object.entries(BOOTH_THEMES).map(([id, theme]) => ({ id: id as BoothTheme, label: theme.label, swatch: theme.background }))} />
      <ChoiceGroup label="Hiệu ứng viền" value={border} onSelect={setBorder} options={Object.entries(BOOTH_BORDERS).map(([id, border]) => ({ id: id as BoothBorder, label: border.label, mark: border.mark }))} />
      <ChoiceGroup label="Bộ lọc ảnh" value={effect} onSelect={setEffect} options={Object.entries(BOOTH_EFFECTS).map(([id, label]) => ({ id: id as BoothEffect, label }))} />
    </section>
  </div>;
}

function ChoiceGroup<T extends string>({ label, value, onSelect, options }: {
  label: string; value: T; onSelect: (value: T) => void;
  options: readonly { id: T; label: string; mark?: string; swatch?: string }[];
}) {
  return <div className="cm-photobooth-choice" role="group" aria-label={label}>
    <strong aria-hidden="true">{label}</strong>
    <div className="cm-photobooth-choice-row">
      {options.map(option => <button key={option.id} type="button" aria-pressed={value === option.id} onClick={() => onSelect(option.id)}>
        {option.swatch && <i aria-hidden="true" style={{ '--booth-swatch': option.swatch } as CSSProperties} />}
        {option.mark && <span aria-hidden="true">{option.mark}</span>}
        {option.label}
      </button>)}
    </div>
  </div>;
}
