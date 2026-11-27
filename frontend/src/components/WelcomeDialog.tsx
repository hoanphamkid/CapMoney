import { ArrowRight, X } from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';
import '../welcome.css';

export function WelcomeDialog() {
  const [show, setShow] = useState(true);
  const dialog = useRef<HTMLDialogElement>(null);

  useLayoutEffect(() => {
    const element = dialog.current;
    if (!element) return;
    element.showModal();
    return () => element.close();
  }, [show]);

  function dismiss() {
    dialog.current?.close();
    setShow(false);
  }

  if (!show) return null;

  return (
    <dialog
      ref={dialog}
      className="cm-welcome-dialog"
      aria-labelledby="cm-welcome-title"
      aria-describedby="cm-welcome-description"
      onCancel={event => {
        event.preventDefault();
        dismiss();
      }}
    >
      <button type="button" className="cm-welcome-close" aria-label="Đóng lời chào" onClick={dismiss}>
        <X size={20} aria-hidden="true" />
      </button>
      <div className="cm-welcome-intro">
        <span className="cm-welcome-icon">
          <img src="/icons/welcome-wallet.webp" width="64" height="64" alt="" />
        </span>
        <h2 id="cm-welcome-title">Chào mừng đến với <span>CapMoney</span></h2>
        <p id="cm-welcome-description">Ghi thu chi, theo dõi ngân sách và xem báo cáo trong cùng một ứng dụng.</p>
        <p className="cm-welcome-credit">Hoàn Phạm vibe code</p>
      </div>
      <div className="cm-welcome-actions">
        <button type="button" className="cm-welcome-primary" onClick={dismiss}>
          Vào CapMoney <ArrowRight size={17} aria-hidden="true" />
        </button>
      </div>
    </dialog>
  );
}
