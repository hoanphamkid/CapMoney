import type { MeResponse, Profile, User } from '../types/auth';
export type { MeResponse } from '../types/auth';

const API_ROOT = (import.meta as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL || '/api';

export class ApiError extends Error {
  public status: number; public code: string;
  constructor(status: number, code: string, message: string) { super(message); this.status = status; this.code = code; }
}

export type CalendarEvent = { id: string; kind: string; type: string; title: string; amount?: number; amountMinor?: number; dateKey: string; note?: string; categoryId?: string; walletId?: string; imageUrl?: string | null; status: string; source: 'transaction' | 'reminder'; time?: string; repeat?: string; channels?: string[] };
export type CalendarSummary = { income: number; expense: number; transfers: number; transactionCount: number; busiestExpenseDay: string | null; highestIncomeDay: string | null };
export type Wallet = { id: string; name: string; type: string; balance: number; balanceMinor: number; currency: string; color: string };
export type Transaction = { id: string; type: 'income' | 'expense' | 'transfer'; amount: number; amountMinor: number; note: string; categoryId: string; walletId: string; toWalletId?: string; dateKey: string; status: string; imageUrl: string | null; createdAt?: string };

type StoredUser = User & { password: string };
type StoredWallet = Wallet & { userId: string; active: boolean };
type StoredTransaction = Transaction & { userId: string; idempotencyKey?: string };
type StoredReminder = CalendarEvent & { userId: string };
type LocalDb = {
  users: StoredUser[];
  currentUserId: string | null;
  profiles: Record<string, Profile>;
  wallets: StoredWallet[];
  transactions: StoredTransaction[];
  reminders: StoredReminder[];
};

const STORAGE_KEY = 'capmoney_local_db_v1';

function loadDb(): LocalDb {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<LocalDb>;
      return {
        users: parsed.users ?? [],
        currentUserId: parsed.currentUserId ?? null,
        profiles: parsed.profiles ?? {},
        wallets: parsed.wallets ?? [],
        transactions: parsed.transactions ?? [],
        reminders: parsed.reminders ?? [],
      };
    }
  } catch {
    // Ignore storage read errors
  }
  return { users: [], currentUserId: null, profiles: {}, wallets: [], transactions: [], reminders: [] };
}

function saveDb(db: LocalDb) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    // If mobile localStorage hits the 5MB quota, strip/shrink oldest transaction images so new bills always save
    try {
      const txsWithImages = [...db.transactions].reverse().filter(t => t.imageUrl && t.imageUrl.length > 80_000);
      for (const tx of txsWithImages) {
        tx.imageUrl = null;
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
          return;
        } catch {
          // Continue freeing space
        }
      }
    } catch {
      // Ignore fallback errors
    }
  }
}

function ensureDefaultLocalWallets(db: LocalDb, userId: string) {
  const existing = db.wallets.filter(w => w.userId === userId && w.active);
  if (existing.length > 0) return;
  db.wallets.push(
    {
      id: crypto.randomUUID(),
      userId,
      active: true,
      name: 'Wallet',
      type: 'cash',
      balance: 0,
      balanceMinor: 0,
      currency: 'VND',
      color: '#163e36',
    },
    {
      id: crypto.randomUUID(),
      userId,
      active: true,
      name: 'Bank',
      type: 'bank',
      balance: 0,
      balanceMinor: 0,
      currency: 'VND',
      color: '#3c6684',
    },
  );
  saveDb(db);
}

function publicUser(user: StoredUser): User {
  return { id: user.id, email: user.email, name: user.name, phone: user.phone, role: user.role, emailVerified: user.emailVerified };
}

function requireLocalUser(db: LocalDb): StoredUser {
  const user = db.users.find(item => item.id === db.currentUserId);
  if (!user) throw new ApiError(401, 'UNAUTHORIZED', 'Vui lòng đăng nhập để tiếp tục');
  return user;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const rawDataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!rawDataUrl) {
        resolve('');
        return;
      }
      // Compress image to max 600x600 JPEG (0.74 quality, ~40KB) so mobile localStorage never overflows
      const img = new Image();
      img.onload = () => {
        try {
          const maxDim = 600;
          const scale = Math.min(1, maxDim / Math.max(img.naturalWidth || 600, img.naturalHeight || 600));
          const w = Math.max(1, Math.round((img.naturalWidth || 600) * scale));
          const h = Math.max(1, Math.round((img.naturalHeight || 600) * scale));
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL('image/jpeg', 0.74));
            return;
          }
        } catch {
          // Fallback to rawDataUrl
        }
        resolve(rawDataUrl);
      };
      img.onerror = () => resolve(rawDataUrl);
      img.src = rawDataUrl;
    };
    reader.onerror = () => reject(new Error('Không thể đọc file ảnh'));
    reader.readAsDataURL(file);
  });
}

function txToCalendarEvent(row: StoredTransaction): CalendarEvent {
  return {
    id: row.id,
    kind: row.type,
    type: row.type,
    title: row.note || (row.type === 'income' ? 'Thu nhập' : row.type === 'expense' ? 'Chi tiêu' : 'Chuyển tiền'),
    amount: row.amount,
    amountMinor: row.amountMinor,
    dateKey: row.dateKey,
    note: row.note,
    categoryId: row.categoryId,
    walletId: row.walletId,
    imageUrl: row.imageUrl,
    status: row.status,
    source: 'transaction',
  };
}

class BackendUnavailableError extends Error {}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_ROOT}${path}`, {
      ...init,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...init.headers },
    });
  } catch {
    throw new BackendUnavailableError();
  }
  if (response.status === 204) return undefined as T;
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new BackendUnavailableError();
  }
  const body = await response.json().catch(() => null) as { error?: { code?: string; message?: string }; [key: string]: unknown } | null;
  if (!body) throw new BackendUnavailableError();
  if (!response.ok) {
    if (!body.error?.code && (response.status === 404 || response.status === 405 || response.status >= 502)) {
      throw new BackendUnavailableError();
    }
    throw new ApiError(response.status, body.error?.code ?? 'REQUEST_FAILED', body.error?.message ?? 'Không thể hoàn tất yêu cầu');
  }
  return body as T;
}

async function upload<T>(path: string, form: FormData, method: 'POST' | 'PUT' = 'POST'): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_ROOT}${path}`, { method, body: form, credentials: 'include' });
  } catch {
    throw new BackendUnavailableError();
  }
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new BackendUnavailableError();
  }
  const body = await response.json().catch(() => null) as { error?: { code?: string; message?: string }; [key: string]: unknown } | null;
  if (!body) throw new BackendUnavailableError();
  if (!response.ok) {
    if (!body.error?.code && (response.status === 404 || response.status === 405 || response.status >= 502)) {
      throw new BackendUnavailableError();
    }
    throw new ApiError(response.status, body.error?.code ?? 'REQUEST_FAILED', body.error?.message ?? 'Không thể hoàn tất yêu cầu');
  }
  return body as T;
}

async function withFallback<T>(remoteCall: () => Promise<T>, localCall: () => T | Promise<T>): Promise<T> {
  try {
    return await remoteCall();
  } catch (error) {
    if (error instanceof BackendUnavailableError) {
      return await localCall();
    }
    throw error;
  }
}

export const api = {
  register: (input: { name: string; email: string; password: string; phone?: string }) =>
    withFallback(
      () => request<{ user: User; message: string }>('/auth/register', { method: 'POST', body: JSON.stringify(input) }),
      () => {
        const db = loadDb();
        const email = input.email.trim().toLowerCase();
        if (db.users.some(u => u.email === email)) {
          throw new ApiError(409, 'EMAIL_EXISTS', 'Email này đã được đăng ký');
        }
        const user: StoredUser = {
          id: crypto.randomUUID(),
          email,
          name: input.name.trim(),
          phone: input.phone?.trim() ?? '',
          role: 'user',
          emailVerified: false,
          password: input.password,
        };
        db.users.push(user);
        db.profiles[user.id] = { locale: 'vi-VN', currency: 'VND', timezone: 'Asia/Ho_Chi_Minh' };
        db.currentUserId = user.id;
        saveDb(db);
        return { user: publicUser(user), message: 'Tài khoản đã được tạo.' };
      },
    ),

  login: (input: { email: string; password: string; remember: boolean }) =>
    withFallback(
      () => request<{ user: User }>('/auth/login', { method: 'POST', body: JSON.stringify(input) }),
      () => {
        const db = loadDb();
        const email = input.email.trim().toLowerCase();
        let user = db.users.find(u => u.email === email);
        if (!user) {
          const rawName = email.split('@')[0]?.replace(/[._-]+/g, ' ').trim() || 'Người dùng';
          const displayName = rawName.charAt(0).toUpperCase() + rawName.slice(1);
          user = {
            id: crypto.randomUUID(),
            email,
            name: displayName,
            phone: '',
            role: 'user',
            emailVerified: false,
            password: input.password,
          };
          db.users.push(user);
          db.profiles[user.id] = { locale: 'vi-VN', currency: 'VND', timezone: 'Asia/Ho_Chi_Minh' };
        } else if (user.password !== input.password) {
          throw new ApiError(401, 'INVALID_CREDENTIALS', 'Email hoặc mật khẩu không đúng');
        }
        db.currentUserId = user.id;
        saveDb(db);
        return { user: publicUser(user) };
      },
    ),

  me: () =>
    withFallback(
      () => request<MeResponse>('/auth/me'),
      () => {
        const db = loadDb();
        const user = requireLocalUser(db);
        const profile = db.profiles[user.id] ?? { locale: 'vi-VN', currency: 'VND', timezone: 'Asia/Ho_Chi_Minh' };
        return { user: publicUser(user), profile };
      },
    ),

  refresh: () =>
    withFallback(
      () => request<{ user: User }>('/auth/refresh', { method: 'POST' }),
      () => {
        const db = loadDb();
        const user = requireLocalUser(db);
        return { user: publicUser(user) };
      },
    ),

  logout: () =>
    withFallback(
      () => request<void>('/auth/logout', { method: 'POST' }),
      () => {
        const db = loadDb();
        db.currentUserId = null;
        saveDb(db);
      },
    ),

  sessions: () =>
    withFallback(
      () => request<{ sessions: Array<{ id: string; deviceName: string; lastActiveAt: string; current: boolean }> }>('/auth/sessions'),
      () => ({
        sessions: [
          {
            id: 'local-session-current',
            deviceName: typeof navigator !== 'undefined' && navigator.platform ? navigator.platform : 'Trình duyệt',
            lastActiveAt: new Date().toISOString(),
            current: true,
          },
        ],
      }),
    ),

  logoutOthers: () =>
    withFallback(
      () => request<void>('/auth/sessions/others', { method: 'DELETE' }),
      () => undefined,
    ),

  wallets: () =>
    withFallback(
      () => request<{ wallets: Wallet[] }>('/wallets'),
      () => {
        const db = loadDb();
        const user = requireLocalUser(db);
        ensureDefaultLocalWallets(db, user.id);
        const wallets = db.wallets
          .filter(w => w.userId === user.id && w.active)
          .map(({ userId: _u, active: _a, ...wallet }) => wallet);
        return { wallets };
      },
    ),

  createWallet: (input: { name: string; type: string; openingBalance: number; color: string }) =>
    withFallback(
      () => request<{ wallet: Wallet }>('/wallets', { method: 'POST', body: JSON.stringify(input) }),
      () => {
        const db = loadDb();
        const user = requireLocalUser(db);
        const balanceMinor = Math.round((input.openingBalance || 0) * 100);
        const stored: StoredWallet = {
          id: crypto.randomUUID(),
          userId: user.id,
          active: true,
          name: input.name.trim(),
          type: input.type,
          balance: balanceMinor / 100,
          balanceMinor,
          currency: 'VND',
          color: input.color || '#163e36',
        };
        db.wallets.push(stored);
        saveDb(db);
        const { userId: _u, active: _a, ...wallet } = stored;
        return { wallet };
      },
    ),

  updateWallet: (id: string, input: { name?: string; type?: string; color?: string }) =>
    withFallback(
      () => request<{ wallet: Wallet }>('/wallets/' + id, { method: 'PATCH', body: JSON.stringify(input) }),
      () => {
        const db = loadDb();
        const user = requireLocalUser(db);
        const stored = db.wallets.find(w => w.id === id && w.userId === user.id && w.active);
        if (!stored) throw new ApiError(404, 'WALLET_NOT_FOUND', 'Không tìm thấy ví');
        if (input.name !== undefined) stored.name = input.name.trim();
        if (input.type !== undefined) stored.type = input.type;
        if (input.color !== undefined) stored.color = input.color;
        saveDb(db);
        const { userId: _u, active: _a, ...wallet } = stored;
        return { wallet };
      },
    ),

  archiveWallet: (id: string) =>
    withFallback(
      () => request<void>('/wallets/' + id + '/archive', { method: 'PATCH' }),
      () => {
        const db = loadDb();
        const user = requireLocalUser(db);
        const stored = db.wallets.find(w => w.id === id && w.userId === user.id && w.active);
        if (!stored) throw new ApiError(404, 'WALLET_NOT_FOUND', 'Không tìm thấy ví');
        stored.active = false;
        saveDb(db);
      },
    ),

  deleteWallet: (id: string) =>
    withFallback(
      () => request<void>('/wallets/' + id, { method: 'DELETE' }),
      () => {
        const db = loadDb();
        const user = requireLocalUser(db);
        const stored = db.wallets.find(w => w.id === id && w.userId === user.id && w.active);
        if (!stored) throw new ApiError(404, 'WALLET_NOT_FOUND', 'Không tìm thấy ví');
        const hasTx = db.transactions.some(tx => tx.userId === user.id && (tx.walletId === id || tx.toWalletId === id));
        if (hasTx) throw new ApiError(409, 'WALLET_HAS_TRANSACTIONS', 'Ví đã có giao dịch, hãy lưu trữ thay vì xóa');
        stored.active = false;
        saveDb(db);
      },
    ),

  createTransaction: (input: { type: string; amount: number; note: string; categoryId: string; walletId: string; toWalletId?: string; transactionDate: string; image?: File | null; idempotencyKey?: string }) =>
    withFallback(
      () => {
        const form = new FormData();
        form.set('type', input.type);
        form.set('amount', String(input.amount));
        form.set('note', input.note);
        form.set('categoryId', input.categoryId);
        form.set('walletId', input.walletId);
        if (input.toWalletId) form.set('toWalletId', input.toWalletId);
        form.set('transactionDate', input.transactionDate);
        form.set('idempotencyKey', input.idempotencyKey ?? crypto.randomUUID());
        if (input.image) form.set('image', input.image);
        return upload<{ transaction: { id: string; dateKey: string; imageUrl: string | null } }>('/transactions', form);
      },
      async () => {
        const db = loadDb();
        const user = requireLocalUser(db);
        const amountMinor = Math.round(input.amount * 100);
        const sourceWallet = db.wallets.find(w => w.id === input.walletId && w.userId === user.id && w.active);
        if (!sourceWallet) throw new ApiError(400, 'WALLET_REQUIRED', 'Vui lòng chọn ví cho giao dịch');
        let targetWallet: StoredWallet | undefined;
        if (input.type === 'transfer') {
          targetWallet = db.wallets.find(w => w.id === input.toWalletId && w.userId === user.id && w.active);
          if (!targetWallet || targetWallet.id === sourceWallet.id) {
            throw new ApiError(400, 'TRANSFER_WALLETS_REQUIRED', 'Chuyển tiền cần hai ví khác nhau');
          }
          if (sourceWallet.balanceMinor < amountMinor) {
            throw new ApiError(400, 'INSUFFICIENT_BALANCE', 'Số dư ví nguồn không đủ');
          }
        }
        const imageUrl = input.image ? await fileToDataUrl(input.image) : null;
        const created: StoredTransaction = {
          id: crypto.randomUUID(),
          userId: user.id,
          type: input.type as 'income' | 'expense' | 'transfer',
          amount: amountMinor / 100,
          amountMinor,
          note: input.note.trim(),
          categoryId: input.categoryId || 'other',
          walletId: sourceWallet.id,
          toWalletId: targetWallet?.id,
          dateKey: input.transactionDate,
          status: 'completed',
          imageUrl,
          createdAt: new Date().toISOString(),
          idempotencyKey: input.idempotencyKey,
        };
        if (input.type === 'income') {
          sourceWallet.balanceMinor += amountMinor;
          sourceWallet.balance = sourceWallet.balanceMinor / 100;
        } else if (input.type === 'expense') {
          sourceWallet.balanceMinor -= amountMinor;
          sourceWallet.balance = sourceWallet.balanceMinor / 100;
        } else if (input.type === 'transfer' && targetWallet) {
          sourceWallet.balanceMinor -= amountMinor;
          sourceWallet.balance = sourceWallet.balanceMinor / 100;
          targetWallet.balanceMinor += amountMinor;
          targetWallet.balance = targetWallet.balanceMinor / 100;
        }
        db.transactions.unshift(created);
        saveDb(db);
        return { transaction: { id: created.id, dateKey: created.dateKey, imageUrl: created.imageUrl } };
      },
    ),

  updateTransaction: (id: string, input: { type: string; amount: number; note: string; categoryId: string; walletId: string; transactionDate: string; image?: File | null }) =>
    withFallback(
      () => {
        const form = new FormData();
        form.set('type', input.type);
        form.set('amount', String(input.amount));
        form.set('note', input.note);
        form.set('categoryId', input.categoryId);
        form.set('walletId', input.walletId);
        form.set('transactionDate', input.transactionDate);
        if (input.image) form.set('image', input.image);
        return upload<{ transaction: { id: string; dateKey: string; imageUrl: string | null } }>(`/transactions/${id}`, form, 'PUT');
      },
      async () => {
        const db = loadDb();
        const user = requireLocalUser(db);
        const existing = db.transactions.find(tx => tx.id === id && tx.userId === user.id);
        if (!existing) throw new ApiError(404, 'TRANSACTION_NOT_FOUND', 'Không tìm thấy giao dịch');
        const oldWallet = db.wallets.find(w => w.id === existing.walletId && w.userId === user.id);
        if (oldWallet && existing.type !== 'transfer') {
          oldWallet.balanceMinor -= existing.type === 'income' ? existing.amountMinor : -existing.amountMinor;
          oldWallet.balance = oldWallet.balanceMinor / 100;
        }
        const amountMinor = Math.round(input.amount * 100);
        const newWallet = db.wallets.find(w => w.id === (input.walletId || existing.walletId) && w.userId === user.id);
        if (newWallet && input.type !== 'transfer') {
          newWallet.balanceMinor += input.type === 'income' ? amountMinor : -amountMinor;
          newWallet.balance = newWallet.balanceMinor / 100;
        }
        existing.type = input.type as 'income' | 'expense' | 'transfer';
        existing.amountMinor = amountMinor;
        existing.amount = amountMinor / 100;
        existing.note = input.note.trim();
        existing.categoryId = input.categoryId;
        if (input.walletId) existing.walletId = input.walletId;
        existing.dateKey = input.transactionDate;
        if (input.image) existing.imageUrl = await fileToDataUrl(input.image);
        saveDb(db);
        return { transaction: { id: existing.id, dateKey: existing.dateKey, imageUrl: existing.imageUrl } };
      },
    ),

  deleteTransaction: (id: string) =>
    withFallback(
      () => request<void>(`/transactions/${id}`, { method: 'DELETE' }),
      () => {
        const db = loadDb();
        const user = requireLocalUser(db);
        const index = db.transactions.findIndex(tx => tx.id === id && tx.userId === user.id);
        if (index === -1) throw new ApiError(404, 'TRANSACTION_NOT_FOUND', 'Không tìm thấy giao dịch');
        const [removed] = db.transactions.splice(index, 1);
        const wallet = db.wallets.find(w => w.id === removed.walletId && w.userId === user.id);
        if (wallet && removed.type !== 'transfer') {
          wallet.balanceMinor -= removed.type === 'income' ? removed.amountMinor : -removed.amountMinor;
          wallet.balance = wallet.balanceMinor / 100;
        } else if (removed.type === 'transfer') {
          if (wallet) {
            wallet.balanceMinor += removed.amountMinor;
            wallet.balance = wallet.balanceMinor / 100;
          }
          const toWallet = db.wallets.find(w => w.id === removed.toWalletId && w.userId === user.id);
          if (toWallet) {
            toWallet.balanceMinor -= removed.amountMinor;
            toWallet.balance = toWallet.balanceMinor / 100;
          }
        }
        saveDb(db);
      },
    ),

  transactions: (params: { from?: string; to?: string; walletId?: string } = {}) =>
    withFallback(
      () => {
        const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value) as Array<[string, string]>);
        return request<{ transactions: Transaction[] }>('/transactions' + (query.size ? `?${query}` : ''));
      },
      () => {
        const db = loadDb();
        const user = requireLocalUser(db);
        const transactions = db.transactions
          .filter(tx => {
            if (tx.userId !== user.id) return false;
            if (params.from && tx.dateKey < params.from) return false;
            if (params.to && tx.dateKey > params.to) return false;
            if (params.walletId && tx.walletId !== params.walletId && tx.toWalletId !== params.walletId) return false;
            return true;
          })
          .sort((a, b) => b.dateKey.localeCompare(a.dateKey))
          .map(({ userId: _u, idempotencyKey: _k, ...tx }) => tx);
        return { transactions };
      },
    ),

  updateMe: (input: { name: string; phone: string; locale: string; currency: string; timezone: string }) =>
    withFallback(
      () => request<MeResponse>('/auth/me', { method: 'PATCH', body: JSON.stringify(input) }),
      () => {
        const db = loadDb();
        const user = requireLocalUser(db);
        user.name = input.name.trim();
        user.phone = input.phone.trim();
        const profile: Profile = {
          locale: input.locale || 'vi-VN',
          currency: (input.currency || 'VND').toUpperCase(),
          timezone: input.timezone || 'Asia/Ho_Chi_Minh',
        };
        db.profiles[user.id] = profile;
        saveDb(db);
        return { user: publicUser(user), profile };
      },
    ),

  changePassword: (input: { currentPassword: string; newPassword: string }) =>
    withFallback(
      () => request<void>('/auth/password', { method: 'POST', body: JSON.stringify(input) }),
      () => {
        const db = loadDb();
        const user = requireLocalUser(db);
        if (user.password !== input.currentPassword) {
          throw new ApiError(400, 'PASSWORD_INVALID', 'Mật khẩu hiện tại không đúng');
        }
        user.password = input.newPassword;
        saveDb(db);
      },
    ),

  calendarEvents: (from: string, to: string, selectedFilters: string[]) =>
    withFallback(
      () => request<{ events: CalendarEvent[]; byDay: Record<string, CalendarEvent[]>; summary: CalendarSummary }>(`/calendar/events?from=${from}&to=${to}${selectedFilters.length ? `&filters=${selectedFilters.join(',')}` : ''}`),
      () => {
        const db = loadDb();
        const user = requireLocalUser(db);
        const txRows = db.transactions
          .filter(tx => tx.userId === user.id && tx.dateKey >= from && tx.dateKey <= to)
          .sort((a, b) => a.dateKey.localeCompare(b.dateKey));
        const reminderRows = db.reminders
          .filter(r => r.userId === user.id && r.dateKey >= from && r.dateKey <= to)
          .sort((a, b) => a.dateKey.localeCompare(b.dateKey) || (a.time ?? '').localeCompare(b.time ?? ''));
        const allEvents = [
          ...txRows.map(txToCalendarEvent),
          ...reminderRows.map(({ userId: _u, ...r }) => r),
        ].filter(ev => !selectedFilters.length || selectedFilters.includes(ev.kind));
        const byDay: Record<string, CalendarEvent[]> = {};
        for (const ev of allEvents) {
          byDay[ev.dateKey] = [...(byDay[ev.dateKey] ?? []), ev];
        }
        const expenseByDay = new Map<string, number>();
        for (const tx of txRows.filter(row => row.type === 'expense')) {
          expenseByDay.set(tx.dateKey, (expenseByDay.get(tx.dateKey) ?? 0) + tx.amountMinor);
        }
        const busiestExpenseDay = [...expenseByDay.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
        const highestIncomeDay = [...txRows.filter(row => row.type === 'income')].sort((a, b) => b.amountMinor - a.amountMinor)[0]?.dateKey ?? null;
        const summary: CalendarSummary = {
          income: txRows.filter(row => row.type === 'income').reduce((sum, row) => sum + row.amountMinor, 0) / 100,
          expense: txRows.filter(row => row.type === 'expense').reduce((sum, row) => sum + row.amountMinor, 0) / 100,
          transfers: txRows.filter(row => row.type === 'transfer').length,
          transactionCount: txRows.length,
          busiestExpenseDay,
          highestIncomeDay,
        };
        return { events: allEvents, byDay, summary };
      },
    ),

  calendarDay: (dateKey: string) =>
    withFallback(
      () => request<{ dateKey: string; summary: { income: number; expense: number; net: number; transactionCount: number }; transactions: CalendarEvent[]; reminders: CalendarEvent[] }>(`/calendar/day/${dateKey}`),
      () => {
        const db = loadDb();
        const user = requireLocalUser(db);
        const txRows = db.transactions.filter(tx => tx.userId === user.id && tx.dateKey === dateKey);
        const reminderRows = db.reminders.filter(r => r.userId === user.id && r.dateKey === dateKey);
        const income = txRows.filter(row => row.type === 'income').reduce((sum, row) => sum + row.amountMinor, 0) / 100;
        const expense = txRows.filter(row => row.type === 'expense').reduce((sum, row) => sum + row.amountMinor, 0) / 100;
        return {
          dateKey,
          summary: { income, expense, net: income - expense, transactionCount: txRows.length },
          transactions: txRows.map(txToCalendarEvent),
          reminders: reminderRows.map(({ userId: _u, ...r }) => r),
        };
      },
    ),

  createReminder: (input: { title: string; note: string; dateKey: string; time: string; kind: string; repeat: string; channels: string[] }) =>
    withFallback(
      () => request<{ reminder: CalendarEvent }>('/calendar/reminders', { method: 'POST', body: JSON.stringify(input) }),
      () => {
        const db = loadDb();
        const user = requireLocalUser(db);
        const stored: StoredReminder = {
          id: crypto.randomUUID(),
          userId: user.id,
          kind: input.kind || 'reminder',
          type: input.kind || 'reminder',
          title: input.title.trim(),
          note: input.note?.trim() ?? '',
          dateKey: input.dateKey,
          time: input.time || '',
          repeat: input.repeat || 'none',
          channels: input.channels ?? ['in_app'],
          status: 'scheduled',
          source: 'reminder',
        };
        db.reminders.push(stored);
        saveDb(db);
        const { userId: _u, ...reminder } = stored;
        return { reminder };
      },
    ),

  updateReminder: (id: string, input: Partial<{ title: string; note: string; dateKey: string; time: string; kind: string; repeat: string; channels: string[] }>) =>
    withFallback(
      () => request<{ reminder: CalendarEvent }>(`/calendar/reminders/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
      () => {
        const db = loadDb();
        const user = requireLocalUser(db);
        const stored = db.reminders.find(r => r.id === id && r.userId === user.id);
        if (!stored) throw new ApiError(404, 'REMINDER_NOT_FOUND', 'Không tìm thấy lời nhắc');
        if (input.title !== undefined) stored.title = input.title.trim();
        if (input.note !== undefined) stored.note = input.note.trim();
        if (input.dateKey !== undefined) stored.dateKey = input.dateKey;
        if (input.time !== undefined) stored.time = input.time;
        if (input.kind !== undefined) { stored.kind = input.kind; stored.type = input.kind; }
        if (input.repeat !== undefined) stored.repeat = input.repeat;
        if (input.channels !== undefined) stored.channels = input.channels;
        saveDb(db);
        const { userId: _u, ...reminder } = stored;
        return { reminder };
      },
    ),

  deleteReminder: (id: string) =>
    withFallback(
      () => request<void>(`/calendar/reminders/${id}`, { method: 'DELETE' }),
      () => {
        const db = loadDb();
        const user = requireLocalUser(db);
        const index = db.reminders.findIndex(r => r.id === id && r.userId === user.id);
        if (index === -1) throw new ApiError(404, 'REMINDER_NOT_FOUND', 'Không tìm thấy lời nhắc');
        db.reminders.splice(index, 1);
        saveDb(db);
      },
    ),
};
