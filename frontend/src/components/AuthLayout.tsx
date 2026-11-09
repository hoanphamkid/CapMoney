import { BarChart3, Check, LockKeyhole, Sparkles } from 'lucide-react';
import type { PropsWithChildren } from 'react';
import { BrandMark } from './BrandMark';

export function AuthLayout({ children, mode }: PropsWithChildren<{ mode: 'login' | 'register' }>) {
  return <main className="auth-page" data-mode={mode}>
    <section className="auth-showcase">
      <div className="showcase-top"><BrandMark light /><span className="showcase-badge"><Sparkles size={13} /> Tài chính sáng rõ</span></div>
      <div className="showcase-copy"><p className="eyebrow">KHÔNG GIAN TÀI CHÍNH CỦA BẠN</p><h1>Để tiền bạc<br /><em>đi cùng bạn.</em></h1><p className="showcase-description">Một nơi bình tĩnh để nhìn rõ dòng tiền, xây thói quen tốt và tiến gần hơn đến những điều bạn muốn.</p></div>
      <div className="showcase-visual" aria-hidden="true">
        <div className="visual-grid" />
        <div className="chart-label"><span>Chi tiêu tháng này</span><strong>− 8,4%</strong></div>
        <div className="chart-line"><i /><i /><i /><i /><i /><i /><i /><i /></div>
        <div className="chart-axis"><span>T.6</span><span>T.7</span><span>T.8</span><span>T.9</span><span>T.10</span><span>T.11</span></div>
        <div className="floating-stat"><span className="stat-icon"><BarChart3 size={16} /></span><span><small>Số dư khả dụng</small><b>24.680.000 ₫</b></span><span className="stat-change">+12,6%</span></div>
      </div>
      <div className="showcase-footer"><span><LockKeyhole size={14} /> Dữ liệu được bảo vệ</span><span>© 2026 CapMoney</span></div>
    </section>
    <section className="auth-panel"><div className="auth-panel-inner"><div className="mobile-brand"><BrandMark /></div>{children}<p className="auth-footnote"><Check size={13} /> Không dùng dữ liệu của bạn cho quảng cáo</p></div><div className="auth-panel-orbit" /></section>
  </main>;
}
