import { Check, Cloud, Droplet, Flower2, ImagePlus, Leaf, Moon, MoonStar, Palette, Sparkles, Sun, Trees, Waves, Wind, X } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { HOME_THEMES, resolveColorMode, themePalette, themeVariables, WALLPAPER_FILTERS, wallpaperFilter, type Wallpaper } from '../constants/appearance';
import { useAppTheme } from '../contexts/ThemeContext';
import { encodeWallpaper } from '../services/wallpaperImage';
import './home-themes.css';

export const SLEEPY_CAT_IMAGE = '/sleepy-cat-theme.png';

const themeIcons = {
  classic: Sparkles, 'sleepy-cat': null, strawberry: Flower2, matcha: Leaf, lavender: Cloud, moonlight: MoonStar,
  ocean: Waves, amber: Sun, slate: Wind, jade: Trees, terracotta: Droplet, orchid: Flower2,
};

const modes = [
  { id: 'light', label: 'Sáng', icon: Sun },
  { id: 'dark', label: 'Tối', icon: Moon },
  { id: 'theme', label: 'Theo chủ đề', icon: Palette },
] as const;

export function AppearanceModeControls() {
  const { mode, setMode } = useAppTheme();
  return <div className="cm-appearance-mode" role="group" aria-label="Chế độ hiển thị">
    {modes.map(({ id, label, icon: Icon }) => (
      <button key={id} type="button" aria-pressed={mode === id} onClick={() => setMode(id)}>
        <Icon size={17} aria-hidden="true" /> {label}
      </button>
    ))}
  </div>;
}

export function HomeThemePicker({ onClose }: { onClose: () => void }) {
  const { theme, mode, wallpaper, setTheme, setWallpaper } = useAppTheme();
  const [tab, setTab] = useState<'palette' | 'wallpaper'>('palette');
  const [draft, setDraft] = useState<Wallpaper | null>(wallpaper);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  function close() {
    dialog.current?.close();
    onClose();
  }

  async function choosePhoto(file: File) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const src = await encodeWallpaper(file);
      setDraft(current => ({ src, filter: current?.filter ?? 'original' }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không đọc được ảnh từ album.');
    } finally {
      setBusy(false);
    }
  }

  function applyWallpaper(next: Wallpaper | null) {
    setError('');
    setNotice('');
    try {
      setWallpaper(next);
      setDraft(next);
      setNotice(next ? 'Đã áp dụng ảnh nền.' : 'Đã gỡ ảnh nền.');
    } catch {
      setError('Không lưu được ảnh nền trên thiết bị này.');
    }
  }

  return (
    <dialog className="cm-home-theme-dialog" ref={dialog} id="cm-home-theme-dialog" aria-labelledby="cm-home-theme-title"
      onCancel={event => { event.preventDefault(); close(); }}
      onClick={event => { if (event.target === event.currentTarget) close(); }}>
      <div className="cm-home-theme-dialog-body">
        <header className="cm-home-theme-dialog-head">
          <h2 id="cm-home-theme-title">Giao diện toàn ứng dụng</h2>
          <button type="button" aria-label="Đóng bộ chọn giao diện" onClick={close}><X size={20} /></button>
        </header>
        <AppearanceModeControls />

        <div className="cm-appearance-tabs" role="group" aria-label="Tùy chỉnh giao diện">
          <button type="button" aria-pressed={tab === 'palette'} onClick={() => setTab('palette')}><Palette size={16} aria-hidden="true" /> Chủ đề màu</button>
          <button type="button" aria-pressed={tab === 'wallpaper'} onClick={() => setTab('wallpaper')}><ImagePlus size={16} aria-hidden="true" /> Ảnh nền</button>
        </div>

        {tab === 'palette' ? (
          <div className="cm-home-theme-options" role="group" aria-label="Các mẫu giao diện">
            {HOME_THEMES.map(({ id, label }) => {
              const Icon = themeIcons[id];
              const palette = themePalette(id, resolveColorMode(mode, id));
              return (
                <button type="button" key={id} className="cm-home-theme-option" aria-pressed={theme === id} onClick={() => setTheme(id)}>
                  <span className="cm-home-theme-sample" data-theme-sample={id} style={themeVariables(palette) as CSSProperties} aria-hidden="true">
                    <span className="cm-home-theme-sample-calendar"><i /><i /><i /><i /><i /><i /></span>
                    {Icon ? <Icon size={29} /> : <img className="cm-home-theme-sample-cat" src={SLEEPY_CAT_IMAGE} alt="" />}
                  </span>
                  <span className="cm-home-theme-option-copy"><strong>{label}</strong></span>
                  {theme === id && <span className="cm-home-theme-check" aria-hidden="true"><Check size={14} /></span>}
                </button>
              );
            })}
          </div>
        ) : (
          <section className="cm-wallpaper-picker" aria-label="Ảnh nền từ album">
            {draft && <div className="cm-wallpaper-preview">
              <img src={draft.src} alt="Xem trước ảnh nền" style={{ filter: wallpaperFilter(draft.filter) }} />
              <div className="cm-wallpaper-preview-card" aria-hidden="true"><span /><span /><span /></div>
            </div>}
            <input ref={fileInput} type="file" accept="image/*" hidden aria-label="Tệp ảnh nền"
              onChange={event => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = '';
                if (file) void choosePhoto(file);
              }} />
            <button className="cm-wallpaper-button" type="button" disabled={busy} onClick={() => fileInput.current?.click()}>
              <ImagePlus size={17} aria-hidden="true" /> {busy ? 'Đang xử lý ảnh…' : 'Chọn ảnh từ album'}
            </button>
            {draft && <div className="cm-wallpaper-filters" role="group" aria-label="Bộ lọc ảnh nền">
              {WALLPAPER_FILTERS.map(filter => <button type="button" key={filter.id} aria-pressed={draft.filter === filter.id}
                onClick={() => { setDraft({ ...draft, filter: filter.id }); setNotice(''); }}>{filter.label}</button>)}
            </div>}
            <div className="cm-wallpaper-actions">
              {draft && <button type="button" className="cm-wallpaper-button is-primary" disabled={busy || (draft.src === wallpaper?.src && draft.filter === wallpaper.filter)}
                onClick={() => applyWallpaper(draft)}>Áp dụng ảnh nền</button>}
              {wallpaper && <button className="cm-wallpaper-button" type="button" disabled={busy} onClick={() => applyWallpaper(null)}>Gỡ ảnh nền</button>}
            </div>
            {error && <p role="alert">{error}</p>}
            {notice && <p role="status">{notice}</p>}
            <p>Ảnh nền được lưu trên thiết bị này.</p>
          </section>
        )}
        <footer className="cm-home-theme-footer"><button className="cm-home-theme-done" type="button" onClick={close}>Xong</button></footer>
      </div>
    </dialog>
  );
}
