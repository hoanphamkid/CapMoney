import { Check, Cloud, Flower2, Leaf, MoonStar, Sparkles, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import './home-themes.css';

export const HOME_THEMES = [
  { id: 'classic', label: 'Mặc định', detail: 'Đen · Xanh lam', icon: Sparkles },
  { id: 'sleepy-cat', label: 'Mèo Ngủ', detail: 'Kem · Caramel', icon: null },
  { id: 'strawberry', label: 'Dâu Sữa', detail: 'Hồng · Trắng kem', icon: Flower2 },
  { id: 'matcha', label: 'Matcha', detail: 'Xanh trà · Ngà', icon: Leaf },
  { id: 'lavender', label: 'Oải Hương', detail: 'Tím lilac · Xanh mây', icon: Cloud },
  { id: 'moonlight', label: 'Trăng Sao', detail: 'Chàm · Tím đêm', icon: MoonStar },
] as const;

export type HomeTheme = (typeof HOME_THEMES)[number]['id'];
const preferenceKey = 'capmoney-home-theme';
export const SLEEPY_CAT_IMAGE = '/sleepy-cat-theme.png';

export function readHomeTheme(): HomeTheme {
  try {
    return HOME_THEMES.find(theme => theme.id === localStorage.getItem(preferenceKey))?.id ?? 'classic';
  } catch {
    return 'classic';
  }
}

export function saveHomeTheme(theme: HomeTheme) {
  try {
    localStorage.setItem(preferenceKey, theme);
  } catch {
    // The chosen theme remains usable for this visit when storage is unavailable.
  }
}

export function HomeThemePicker({
  selected,
  onSelect,
  onClose,
}: {
  selected: HomeTheme;
  onSelect: (theme: HomeTheme) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  const closePicker = () => {
    dialog.current?.close();
    onClose();
  };

  return (
    <dialog
      className="cm-home-theme-dialog"
      ref={dialog}
      id="cm-home-theme-dialog"
      aria-labelledby="cm-home-theme-title"
      onCancel={event => {
        event.preventDefault();
        closePicker();
      }}
      onClick={event => {
        if (event.target === event.currentTarget) closePicker();
      }}
    >
      <div className="cm-home-theme-dialog-body">
        <header className="cm-home-theme-dialog-head">
          <div>
            <h2 id="cm-home-theme-title">Giao diện trang chủ</h2>
            <p>Chạm vào một mẫu để áp dụng ngay.</p>
          </div>
          <button type="button" aria-label="Đóng bộ chọn giao diện" onClick={closePicker}>
            <X size={20} />
          </button>
        </header>

        <div className="cm-home-theme-options" role="group" aria-label="Các mẫu giao diện">
          {HOME_THEMES.map(({ id, label, detail, icon: Icon }) => (
            <button
              type="button"
              key={id}
              className="cm-home-theme-option"
              aria-pressed={selected === id}
              onClick={() => onSelect(id)}
            >
              <span className="cm-home-theme-sample" data-theme-sample={id} aria-hidden="true">
                <span className="cm-home-theme-sample-calendar">
                  <i /><i /><i /><i /><i /><i />
                </span>
                {Icon ? <Icon className="cm-home-theme-sample-icon" size={32} /> : (
                  <img className="cm-home-theme-sample-cat" src={SLEEPY_CAT_IMAGE} alt="" />
                )}
              </span>
              <span className="cm-home-theme-option-copy">
                <strong>{label}</strong>
                <small>{detail}</small>
              </span>
              {selected === id && <span className="cm-home-theme-check" aria-hidden="true"><Check size={14} /></span>}
            </button>
          ))}
        </div>
        <button className="cm-home-theme-done" type="button" onClick={closePicker}>Xong</button>
      </div>
    </dialog>
  );
}
