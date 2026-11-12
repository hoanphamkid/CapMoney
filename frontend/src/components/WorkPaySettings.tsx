import { Clock, Save } from 'lucide-react';
import { useState } from 'react';
import { defaultWorkPay, hourlyPay, loadWorkPay, saveWorkPay, SHIFT_PRESETS, type ShiftId, type WorkPayConfig } from '../utils/workPay';

const money = (amount: number) => `${Math.round(amount).toLocaleString('vi-VN')}đ`;

export function WorkPaySettings({ email }: { email: string }) {
  const [config, setConfig] = useState(() => loadWorkPay(email));
  const [rates, setRates] = useState(() => Object.fromEntries(SHIFT_PRESETS.map(shift => [shift.id, { pay: String(config.shifts[shift.id].pay), hours: String(config.shifts[shift.id].hours) }])) as Record<ShiftId, { pay: string; hours: string }>);
  const [pho, setPho] = useState(String(config.phoPrice));
  const [tea, setTea] = useState(String(config.milkTeaPrice));
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const save = () => {
    setNotice(''); setError('');
    const next: WorkPayConfig = { ...config, shifts: Object.fromEntries(SHIFT_PRESETS.map(shift => [shift.id, { pay: Number(rates[shift.id].pay), hours: Number(rates[shift.id].hours.replace(',', '.')) }])) as WorkPayConfig['shifts'], phoPrice: Number(pho), milkTeaPrice: Number(tea) };
    try { saveWorkPay(next); setConfig(next); setNotice('Đã lưu. Giờ làm được quy đổi theo ca bạn chọn; cài đặt này được lưu cùng bản sao đồng bộ.'); }
    catch (err) { setError(err instanceof Error ? err.message : 'Không lưu được mức lương.'); }
  };
  const reset = () => {
    const defaults = defaultWorkPay(email);
    setConfig(defaults);
    setRates(Object.fromEntries(SHIFT_PRESETS.map(shift => [shift.id, { pay: String(shift.pay), hours: String(shift.hours) }])) as typeof rates);
    setPho(String(defaults.phoPrice)); setTea(String(defaults.milkTeaPrice)); setError(''); setNotice('Đã điền mức lương ban đầu. Bấm Lưu để áp dụng.');
  };
  return <section className="settings-card panel cm-work-pay-settings">
    <div className="settings-heading"><span><Clock size={17} /></span><div><h2>Lương & quy đổi chi tiêu</h2><p>Giờ làm tương đương = số tiền chi ÷ (lương ca ÷ giờ thực làm).</p></div></div>
    <p className="cm-work-pay-explanation">Ca 8h–20h hoặc 20h–8h tính <b>11 giờ thực làm</b>, đã trừ giờ nghỉ. Ca ngắn tính <b>8,67 giờ</b>. Lương thanh toán theo tuần, số ca có thể khác nhau.</p>
    <div className="cm-work-pay-rates">
      {SHIFT_PRESETS.map(shift => <div className="cm-work-pay-rate" key={shift.id}><strong>{shift.label}</strong><div>
        <label><span>Lương ca (đ)</span><input type="number" inputMode="numeric" min="1" step="1000" aria-label={`Lương ${shift.label}`} value={rates[shift.id].pay} onChange={e => { setNotice(''); setRates(old => ({ ...old, [shift.id]: { ...old[shift.id], pay: e.target.value } })); }} /></label>
        <label><span>Giờ thực làm</span><input type="number" inputMode="decimal" min="0.01" max="24" step="0.01" aria-label={`Giờ ${shift.label}`} value={rates[shift.id].hours} onChange={e => { setNotice(''); setRates(old => ({ ...old, [shift.id]: { ...old[shift.id], hours: e.target.value } })); }} /></label>
      </div></div>)}
    </div>
    <label className="select-field"><span>Ca dùng để quy đổi “giờ làm”</span><select value={config.selectedShift} onChange={e => { setNotice(''); setConfig(old => ({ ...old, selectedShift: e.target.value as ShiftId })); }}>{SHIFT_PRESETS.map(shift => <option key={shift.id} value={shift.id}>{shift.label}</option>)}</select></label>
    <div className="cm-work-pay-prices"><label><span>Giá tham khảo 1 bát phở (đ)</span><input type="number" inputMode="numeric" min="1" value={pho} onChange={e => { setPho(e.target.value); setNotice(''); }} /></label><label><span>Giá tham khảo 1 trà sữa (đ)</span><input type="number" inputMode="numeric" min="1" value={tea} onChange={e => { setTea(e.target.value); setNotice(''); }} /></label></div>
    <p className="cm-work-pay-explanation">Mức đã lưu: <b>{money(hourlyPay(loadWorkPay(email)))}/giờ</b>. Quy đổi để tham khảo, chưa trừ thuế, bảo hiểm hay khoản khấu trừ khác.</p>
    {error && <p className="cm-work-pay-error" role="alert">{error}</p>}{notice && <p className="cm-work-pay-notice" role="status">{notice}</p>}
    <div className="cm-work-pay-actions"><button type="button" className="settings-save" onClick={save}><Save size={16} /> Lưu lương & quy đổi</button><button type="button" className="cm-text-link-btn" onClick={reset}>Điền mức ban đầu</button></div>
  </section>;
}
