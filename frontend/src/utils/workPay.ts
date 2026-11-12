export const WORK_PAY_KEY = 'capmoney_work_pay_v1';
export const WORK_PAY_EVENT = 'capmoney:work-pay-changed';

export const SHIFT_PRESETS = [
  { id: 'day-long', label: 'Ca ngày 8h–20h', pay: 350_000, hours: 11 },
  { id: 'day-short', label: 'Ca ngày ngắn', pay: 230_000, hours: 8.67 },
  { id: 'night-long', label: 'Ca đêm 20h–8h', pay: 400_000, hours: 11 },
  { id: 'night-short', label: 'Ca đêm ngắn', pay: 280_000, hours: 8.67 },
  { id: 'sunday-day', label: 'Chủ nhật ngày', pay: 500_000, hours: 11 },
  { id: 'sunday-night', label: 'Chủ nhật đêm', pay: 550_000, hours: 11 },
] as const;

export type ShiftId = typeof SHIFT_PRESETS[number]['id'];
export type WorkPayConfig = {
  version: 1;
  ownerEmail: string;
  selectedShift: ShiftId;
  shifts: Record<ShiftId, { pay: number; hours: number }>;
  phoPrice: number;
  milkTeaPrice: number;
  paymentCycle: 'weekly';
};

export function defaultWorkPay(email: string): WorkPayConfig {
  return {
    version: 1, ownerEmail: email.trim().toLowerCase(), selectedShift: 'day-long',
    shifts: Object.fromEntries(SHIFT_PRESETS.map(shift => [shift.id, { pay: shift.pay, hours: shift.hours }])) as WorkPayConfig['shifts'],
    phoPrice: 50_000, milkTeaPrice: 35_000, paymentCycle: 'weekly',
  };
}

export function validWorkPay(value: unknown, email: string): value is WorkPayConfig {
  if (!value || typeof value !== 'object') return false;
  const config = value as WorkPayConfig;
  return config.version === 1 && config.ownerEmail === email.trim().toLowerCase()
    && config.paymentCycle === 'weekly'
    && SHIFT_PRESETS.some(shift => shift.id === config.selectedShift)
    && Number.isFinite(config.phoPrice) && config.phoPrice > 0
    && Number.isFinite(config.milkTeaPrice) && config.milkTeaPrice > 0
    && SHIFT_PRESETS.every(shift => {
      const rate = config.shifts?.[shift.id];
      return rate && Number.isFinite(rate.pay) && rate.pay > 0 && Number.isFinite(rate.hours) && rate.hours > 0 && rate.hours <= 24;
    });
}

export function loadWorkPay(email: string): WorkPayConfig {
  try {
    const raw = localStorage.getItem(WORK_PAY_KEY);
    const config: unknown = raw ? JSON.parse(raw) : null;
    if (validWorkPay(config, email)) return config;
  } catch { /* Use the supplied company rates until settings are saved. */ }
  return defaultWorkPay(email);
}

export function saveWorkPay(config: WorkPayConfig) {
  if (!validWorkPay(config, config.ownerEmail)) throw new Error('Lương và giá tham khảo phải lớn hơn 0; giờ làm từ trên 0 đến 24 giờ.');
  localStorage.setItem(WORK_PAY_KEY, JSON.stringify(config));
  window.dispatchEvent(new Event(WORK_PAY_EVENT));
}

export function hourlyPay(config: WorkPayConfig) {
  const rate = config.shifts[config.selectedShift];
  return rate.pay / rate.hours;
}

export function equivalentWorkHours(amount: number, config: WorkPayConfig) {
  return Math.max(0, amount) / hourlyPay(config);
}

export function formatEquivalent(value: number) {
  if (value > 0 && value < 0.1) return '<0,1';
  return value.toLocaleString('vi-VN', { maximumFractionDigits: 1 });
}
