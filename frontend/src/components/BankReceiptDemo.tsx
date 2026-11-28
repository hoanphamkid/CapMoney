import { Bell, Camera, ChevronRight, ReceiptText, RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ImageCropModal } from './ImageCropModal';

export function BankReceiptDemo() {
  const [opened, setOpened] = useState(false);
  const [fileToCrop, setFileToCrop] = useState<File | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const notification = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!photo) { setPreview(''); return; }
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  return (
    <section className="cm-settings-detail cm-bank-demo" aria-labelledby="cm-bank-demo-title">
      <header>
        <div>
          <h2 id="cm-bank-demo-title">Demo nhận diện bill</h2>
          <p>Ảnh bạn chọn chỉ hiển thị trong demo.</p>
        </div>
        {opened && <button className="cm-settings-button cm-bank-demo-reset" type="button" aria-label="Đặt lại demo" onClick={() => {
          setOpened(false);
          setPhoto(null);
          notification.current?.focus();
        }}><RotateCcw size={17} aria-hidden="true" /></button>}
      </header>

      <button ref={notification} className="cm-bank-demo-notification" type="button" aria-controls="cm-bank-demo-receipt" aria-expanded={opened} onClick={() => setOpened(value => !value)}>
        <span className="cm-bank-demo-notification-icon"><Bell size={18} aria-hidden="true" /></span>
        <span className="cm-bank-demo-notification-copy"><small>MB Bank · Thông báo mẫu</small><strong>Chi tiêu 68.000 ₫</strong><span>{opened ? 'Đóng bill mẫu' : 'Mở bill mẫu'} <ChevronRight size={14} aria-hidden="true" /></span></span>
      </button>

      <div id="cm-bank-demo-receipt" hidden={!opened}>
        <div className="cm-bank-demo-receipt">
          <div className="cm-bank-demo-preview">
            {preview ? <img src={preview} alt="Ảnh hóa đơn trong demo" /> : (
              <div className="cm-bank-demo-paper">
                <ReceiptText size={21} aria-hidden="true" />
                <span>Bill tự động</span>
                <strong>68.000 ₫</strong>
              </div>
            )}
          </div>
          <div className="cm-bank-demo-details">
            <strong>Thanh toán cà phê</strong>
            <p>12:35 · Ăn uống</p>
            <button className="cm-settings-button" type="button" onClick={() => input.current?.click()}>
              <Camera size={16} aria-hidden="true" /> Thay ảnh hóa đơn
            </button>
            <input ref={input} type="file" accept="image/*" hidden aria-label="Ảnh hóa đơn mẫu" onChange={event => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = '';
              if (file) setFileToCrop(file);
            }} />
          </div>
        </div>
      </div>
      {fileToCrop && <ImageCropModal file={fileToCrop} onCancel={() => setFileToCrop(null)} onConfirm={cropped => {
        setPhoto(cropped);
        setFileToCrop(null);
      }} />}
    </section>
  );
}
