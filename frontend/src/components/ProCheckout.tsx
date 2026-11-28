import { Check, Copy, Crown, ReceiptText } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ProCheckout as Checkout } from '../constants/pro';
import { useAuth } from '../contexts/AuthContext';
import { BankReceiptDemo } from './BankReceiptDemo';

const money = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' });

export function ProCheckout() {
  const { user, loadProCheckout } = useAuth();
  const hasPro = user?.proEnabled === true;
  const [checkout, setCheckout] = useState<Checkout>();
  const [busy, setBusy] = useState(!hasPro);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (hasPro) return;
    let active = true;
    void loadProCheckout()
      .then(result => { if (active) setCheckout(result); })
      .catch(() => { if (active) setError('Không tải được thông tin thanh toán. Vui lòng thử lại.'); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [hasPro, loadProCheckout]);

  async function refresh(createOrder = false) {
    if (busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await loadProCheckout(createOrder);
      setCheckout(result);
      if (!createOrder && result.status === 'pending') setMessage('Chưa nhận được xác nhận chuyển khoản.');
    } catch {
      setError('Không thể kiểm tra thanh toán. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setMessage('Đã sao chép.');
    } catch {
      setMessage('Hãy nhấn giữ để sao chép thông tin.');
    }
  }

  const order = checkout?.status === 'pending' ? checkout.order : null;
  const price = checkout?.status === 'available' || checkout?.status === 'unavailable' ? checkout.price : undefined;

  return <>
    <section className="cm-settings-detail cm-pro-detail" aria-labelledby="cm-pro-title">
      <span className="cm-pro-icon"><Crown size={25} aria-hidden="true" /></span>
      <h2 id="cm-pro-title">{hasPro ? 'Bạn đã mở khóa Pro' : 'Mở khóa Pro để trải nghiệm tất cả'}</h2>
      <div className="cm-pro-bank-feature">
        {hasPro ? <Check size={20} aria-hidden="true" /> : <ReceiptText size={20} aria-hidden="true" />}
        <div>
          <h3>Tự nhận diện bill từ ngân hàng</h3>
          <p>Khi MB Bank đã được liên kết, CapMoney tự tạo bill từ thông báo giao dịch. Bạn chỉ cần mở app và thay ảnh hóa đơn.</p>
        </div>
      </div>

      {hasPro ? (
        <div className="cm-pro-bank-actions">
          <Link className="cm-settings-button is-primary" to="/app/transactions">Mở giao dịch</Link>
          <Link className="cm-settings-button" to="/app">Về trang chủ</Link>
        </div>
      ) : (
        <>
          {price != null && (
            <div className="cm-pro-price"><strong>{money.format(price)}</strong><span>Thanh toán một lần</span></div>
          )}
          {order && (
            <div className="cm-pro-payment">
              <h3>Chuyển khoản ngân hàng</h3>
              <p>Chuyển đúng số tiền và nội dung bên dưới. Nếu bạn đã chuyển, hãy kiểm tra xác nhận trước khi chuyển thêm.</p>
              <dl>
                <div><dt>Ngân hàng</dt><dd>{order.bankName}</dd></div>
                {order.accountName && <div><dt>Chủ tài khoản</dt><dd>{order.accountName}</dd></div>}
                <div><dt>Số tài khoản</dt><dd>{order.accountNumber}<CopyButton label="Sao chép số tài khoản" onClick={() => void copy(order.accountNumber)} /></dd></div>
                <div><dt>Số tiền</dt><dd>{money.format(order.amount)}<CopyButton label="Sao chép số tiền" onClick={() => void copy(String(order.amount))} /></dd></div>
                <div><dt>Nội dung</dt><dd>{order.code}<CopyButton label="Sao chép nội dung chuyển khoản" onClick={() => void copy(order.code)} /></dd></div>
              </dl>
            </div>
          )}
          {checkout?.status === 'unavailable' && <p>Thanh toán Pro chưa được cấu hình.</p>}
          {error && <p className="cm-settings-message is-error" role="alert">{error}</p>}
          <p className="cm-pro-checkout-status" role="status">{message}</p>
          {checkout?.status !== 'paid' && checkout?.status !== 'unavailable' && (
            <button type="button" className="cm-settings-button is-primary" disabled={busy} onClick={() => void refresh(checkout?.status === 'available')}>
              {busy ? 'Đang kiểm tra…' : checkout?.status === 'available' ? 'Thanh toán để mở khóa Pro' : order ? 'Kiểm tra thanh toán' : 'Thử lại'}
            </button>
          )}
        </>
      )}
    </section>
    <BankReceiptDemo />
  </>;
}

function CopyButton({ label, onClick }: { label: string; onClick: () => void }) {
  return <button type="button" aria-label={label} onClick={onClick}><Copy size={15} aria-hidden="true" /></button>;
}
