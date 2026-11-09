import type { MeResponse, User } from '../types/auth';

const API_ROOT = '/api';

export class ApiError extends Error {
  public status: number; public code: string;
  constructor(status: number, code: string, message: string) { super(message); this.status = status; this.code = code; }
}

async function request<T>(path: string, init: RequestInit = {}) {
  const response = await fetch(`${API_ROOT}${path}`, { ...init, credentials: 'include', headers: { 'Content-Type': 'application/json', ...init.headers } });
  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => ({})) as { error?: { code?: string; message?: string }; [key: string]: unknown };
  if (!response.ok) throw new ApiError(response.status, body.error?.code ?? 'REQUEST_FAILED', body.error?.message ?? 'Không thể hoàn tất yêu cầu');
  return body as T;
}

async function upload<T>(path: string, form: FormData, method: 'POST' | 'PUT' = 'POST') {
  const response = await fetch(`${API_ROOT}${path}`, { method, body: form, credentials: 'include' });
  const body = await response.json().catch(() => ({})) as { error?: { code?: string; message?: string }; [key: string]: unknown };
  if (!response.ok) throw new ApiError(response.status, body.error?.code ?? 'REQUEST_FAILED', body.error?.message ?? 'Không thể hoàn tất yêu cầu');
  return body as T;
}

export const api = {
  register: (input: { name: string; email: string; password: string; phone?: string }) => request<{ user: User; message: string }>('/auth/register', { method: 'POST', body: JSON.stringify(input) }),
  login: (input: { email: string; password: string; remember: boolean }) => request<{ user: User }>('/auth/login', { method: 'POST', body: JSON.stringify(input) }),
  me: () => request<MeResponse>('/auth/me'),
  refresh: () => request<{ user: User }>('/auth/refresh', { method: 'POST' }),
  logout: () => request<void>('/auth/logout', { method: 'POST' }),
  sessions: () => request<{ sessions: Array<{ id: string; deviceName: string; lastActiveAt: string; current: boolean }> }>('/auth/sessions'),
  logoutOthers: () => request<void>('/auth/sessions/others', { method: 'DELETE' }),
  wallets: () => request<{ wallets: Array<{ id: string; name: string; balance: number; currency: string; color: string }> }>('/wallets'),
  createWallet: (input: { name: string; type: string; openingBalance: number; color: string }) => request<{ wallet: { id: string; name: string; balance: number } }>('/wallets', { method: 'POST', body: JSON.stringify(input) }),
  createTransaction: (input: { type: string; amount: number; note: string; categoryId: string; walletId: string; transactionDate: string; image?: File | null; idempotencyKey?: string }) => { const form = new FormData(); form.set('type', input.type); form.set('amount', String(input.amount)); form.set('note', input.note); form.set('categoryId', input.categoryId); form.set('walletId', input.walletId); form.set('transactionDate', input.transactionDate); form.set('idempotencyKey', input.idempotencyKey ?? crypto.randomUUID()); if (input.image) form.set('image', input.image); return upload<{ transaction: { id: string; dateKey: string; imageUrl: string | null } }>('/transactions', form); },
  updateTransaction: (id: string, input: { type: string; amount: number; note: string; categoryId: string; walletId: string; transactionDate: string; image?: File | null }) => { const form = new FormData(); form.set('type', input.type); form.set('amount', String(input.amount)); form.set('note', input.note); form.set('categoryId', input.categoryId); form.set('walletId', input.walletId); form.set('transactionDate', input.transactionDate); if (input.image) form.set('image', input.image); return upload<{ transaction: { id: string; dateKey: string; imageUrl: string | null } }>(`/transactions/${id}`, form, 'PUT'); },
  deleteTransaction: (id: string) => request<void>(`/transactions/${id}`, { method: 'DELETE' }),
  calendarEvents: (from: string, to: string, selectedFilters: string[]) => request<{ events: CalendarEvent[]; byDay: Record<string, CalendarEvent[]>; summary: CalendarSummary }>(`/calendar/events?from=${from}&to=${to}${selectedFilters.length ? `&filters=${selectedFilters.join(',')}` : ''}`),
  calendarDay: (dateKey: string) => request<{ dateKey: string; summary: { income: number; expense: number; net: number; transactionCount: number }; transactions: CalendarEvent[]; reminders: CalendarEvent[] }>(`/calendar/day/${dateKey}`),
  createReminder: (input: { title: string; note: string; dateKey: string; time: string; kind: string; repeat: string; channels: string[] }) => request<{ reminder: CalendarEvent }>('/calendar/reminders', { method: 'POST', body: JSON.stringify(input) }),
  updateReminder: (id: string, input: Partial<{ title: string; note: string; dateKey: string; time: string; kind: string; repeat: string; channels: string[] }>) => request<{ reminder: CalendarEvent }>(`/calendar/reminders/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
  deleteReminder: (id: string) => request<void>(`/calendar/reminders/${id}`, { method: 'DELETE' }),
};

export type CalendarEvent = { id: string; kind: string; type: string; title: string; amount?: number; amountMinor?: number; dateKey: string; note?: string; categoryId?: string; walletId?: string; imageUrl?: string | null; status: string; source: 'transaction' | 'reminder'; time?: string; repeat?: string; channels?: string[] };
export type CalendarSummary = { income: number; expense: number; transfers: number; transactionCount: number; busiestExpenseDay: string | null; highestIncomeDay: string | null };
