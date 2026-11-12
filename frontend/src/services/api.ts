import type { MeResponse, Profile, User } from '../types/auth';
export type { MeResponse } from '../types/auth';

const API_ROOT = (import.meta as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL || '/api';

export class ApiError extends Error {
  public status: number; public code: string;
  constructor(status: number, code: string, message: string) { super(message); this.status = status; this.code = code; }
}

export type CalendarEvent = {
  id: string;
  kind: string;
  type: string;
  title: string;
  amount?: number;
  amountMinor?: number;
  dateKey: string;
  note?: string;
  categoryId?: string;
  walletId?: string;
  imageUrl?: string | null;
  status: string;
  source: 'transaction' | 'reminder' | 'manual' | 'camera' | 'webhook_mbbank';
  time?: string;
  transactionTime?: string;
  repeat?: string;
  channels?: string[];
  createdAt?: string;
};
export type CalendarSummary = { income: number; expense: number; transfers: number; transactionCount: number; busiestExpenseDay: string | null; highestIncomeDay: string | null };
export type Wallet = { id: string; name: string; type: string; balance: number; balanceMinor: number; currency: string; color: string };
export type Transaction = {
  id: string;
  type: 'income' | 'expense' | 'transfer';
  amount: number;
  amountMinor: number;
  note: string;
  categoryId: string;
  walletId: string;
  toWalletId?: string;
  dateKey: string;
  transactionTime?: string;
  source?: 'manual' | 'camera' | 'webhook_mbbank';
  status: string;
  imageUrl: string | null;
  createdAt?: string;
};

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
          break;
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
    source: (row.source as any) || 'transaction',
    transactionTime: row.transactionTime,
    time: row.transactionTime,
    createdAt: row.createdAt,
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

export async function authenticatedRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  try {
    try {
      return await request<T>(path, init);
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) throw error;
      await request('/auth/refresh', { method: 'POST' });
      return await request<T>(path, init);
    }
  } catch (error) {
    if (error instanceof BackendUnavailableError) throw new ApiError(503, 'SYNC_UNAVAILABLE', 'Không kết nối được máy chủ đồng bộ. Hãy kiểm tra bản triển khai API rồi thử lại; hai thiết bị không cần mở cùng lúc.');
    throw error;
  }
}

export function readLocalBackup(email: string) {
  const db = loadDb();
  const user = db.users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.id === db.currentUserId);
  if (!user) return null;
  return {
    version: 1 as const,
    account: { name: user.name, phone: user.phone ?? '' },
    profile: db.profiles[user.id] ?? { locale: 'vi-VN', currency: 'VND', timezone: 'Asia/Ho_Chi_Minh' },
    wallets: db.wallets.filter(w => w.userId === user.id).map(w => ({ id: w.id, name: w.name, type: w.type, balanceMinor: w.balanceMinor, currency: w.currency, color: w.color, active: w.active })),
    transactions: db.transactions.filter(tx => tx.userId === user.id).map(tx => ({
      id: tx.id, walletId: tx.walletId || undefined, toWalletId: tx.toWalletId || undefined,
      categoryId: tx.categoryId, type: tx.type, amountMinor: tx.amountMinor, note: tx.note, dateKey: tx.dateKey,
      transactionTime: tx.transactionTime || undefined, source: tx.source ?? 'manual',
      status: tx.status === 'completed' ? 'posted' : tx.status,
      createdAt: tx.createdAt, imageUrl: tx.imageUrl,
    })),
    reminders: db.reminders.filter(r => r.userId === user.id).map(r => ({ id: r.id, title: r.title, note: r.note ?? '', dateKey: r.dateKey, time: r.time || undefined, kind: r.kind, status: r.status === 'scheduled' ? 'pending' : r.status, repeat: r.repeat, channels: r.channels })),
  };
}

export function clearLocalAccountCache(email: string) {
  const db = loadDb();
  const ids = new Set(db.users.filter(user => user.email.toLowerCase() === email.toLowerCase()).map(user => user.id));
  db.wallets = db.wallets.filter(w => !ids.has(w.userId));
  db.transactions = db.transactions.filter(tx => !ids.has(tx.userId));
  db.reminders = db.reminders.filter(r => !ids.has(r.userId));
  // The restored server data must be fetched again, rather than falling back to stale device data.
  if (db.currentUserId && ids.has(db.currentUserId)) db.currentUserId = null;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
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
      async () => {
        const email = input.email.trim().toLowerCase();
        const db = loadDb();
        let user = db.users.find(u => u.email === email);
        if (user) {
          user.name = input.name.trim() || user.name;
          if (input.phone?.trim()) user.phone = input.phone.trim();
          user.password = input.password;
          db.currentUserId = user.id;
          saveDb(db);
          return { user: publicUser(user), message: 'Đã đồng bộ tài khoản của bạn.' };
        }
        user = {
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
        ensureDefaultLocalWallets(db, user.id);
        saveDb(db);
        return { user: publicUser(user), message: 'Tài khoản đã được tạo.' };
      },
    ),

  login: (input: { email: string; password: string; remember: boolean }) =>
    withFallback(
      () => request<{ user: User }>('/auth/login', { method: 'POST', body: JSON.stringify(input) }),
      async () => {
        const email = input.email.trim().toLowerCase();
        const db = loadDb();
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
          ensureDefaultLocalWallets(db, user.id);
        } else {
          // Update password on login so user never gets locked out across devices
          user.password = input.password;
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

  createTransaction: (input: {
    type: string;
    amount: number;
    note: string;
    categoryId: string;
    walletId: string;
    toWalletId?: string;
    transactionDate: string;
    transactionTime?: string;
    source?: 'manual' | 'camera' | 'webhook_mbbank';
    image?: File | null;
    idempotencyKey?: string;
  }) =>
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
        if (input.transactionTime) form.set('transactionTime', input.transactionTime);
        if (input.source) form.set('source', input.source);
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
        const nowTime = input.transactionTime || new Date().toTimeString().slice(0, 8);
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
          transactionTime: nowTime,
          source: input.source || (input.image ? 'camera' : 'manual'),
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

  updateTransaction: (
    id: string,
    input: {
      type: string;
      amount: number;
      note: string;
      categoryId: string;
      walletId: string;
      transactionDate: string;
      transactionTime?: string;
      source?: 'manual' | 'camera' | 'webhook_mbbank';
      image?: File | null;
    },
  ) =>
    withFallback(
      () => {
        const form = new FormData();
        form.set('type', input.type);
        form.set('amount', String(input.amount));
        form.set('note', input.note);
        form.set('categoryId', input.categoryId);
        form.set('walletId', input.walletId);
        form.set('transactionDate', input.transactionDate);
        if (input.transactionTime) form.set('transactionTime', input.transactionTime);
        if (input.source) form.set('source', input.source);
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
        if (input.transactionTime) existing.transactionTime = input.transactionTime;
        if (input.source) existing.source = input.source;
        else if (input.image) existing.source = 'camera';
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
      async () => {
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

  simulateMbBankWebhook: async (input: { amount: number; type: 'income' | 'expense'; note: string; dateKey?: string; timeStr?: string }) => {
    try {
      const res = await fetch(`${API_ROOT}/webhooks/mbbank`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gateway: 'MBBank',
          amount: input.amount,
          type: input.type,
          description: input.note,
          transaction_time: `${input.dateKey || getTodayDateKey()} ${input.timeStr || new Date().toTimeString().slice(0, 8)}`,
          referenceCode: `MB_SIM_${Date.now()}`,
        }),
      });
      if (res.ok) return await res.json();
    } catch {
      // Fallback to client-side creation
    }

    const db = loadDb();
    const user = requireLocalUser(db);
    let mbWallet = db.wallets.find(w => w.userId === user.id && (/MB/i.test(w.name) || w.type === 'bank'));
    if (!mbWallet) {
      mbWallet = {
        id: crypto.randomUUID(),
        userId: user.id,
        name: 'MB Bank',
        type: 'bank',
        balance: 0,
        balanceMinor: 0,
        currency: 'VND',
        color: '#002D72',
        active: true,
      };
      db.wallets.push(mbWallet);
    }
    const dKey = input.dateKey || getTodayDateKey();
    const tStr = input.timeStr || new Date().toTimeString().slice(0, 8);
    const refCode = `MB_${Math.floor(100000 + Math.random() * 900000)}`;
    const receiptUrl = createMbBankReceiptDataUrl({
      amount: input.amount,
      type: input.type,
      dateKey: dKey,
      timeStr: tStr,
      note: input.note,
      referenceCode: refCode,
    });
    const amountMinor = Math.round(input.amount * 100);
    const created: StoredTransaction = {
      id: crypto.randomUUID(),
      userId: user.id,
      type: input.type,
      amount: input.amount,
      amountMinor,
      note: input.note || (input.type === 'income' ? 'Nhận tiền MB Bank' : 'Chi tiêu MB Bank'),
      categoryId: input.type === 'income' ? 'salary' : 'bills',
      walletId: mbWallet.id,
      dateKey: dKey,
      transactionTime: tStr,
      source: 'webhook_mbbank',
      status: 'completed',
      imageUrl: receiptUrl,
      createdAt: new Date().toISOString(),
      idempotencyKey: refCode,
    };
    if (input.type === 'income') {
      mbWallet.balanceMinor += amountMinor;
      mbWallet.balance = mbWallet.balanceMinor / 100;
    } else {
      mbWallet.balanceMinor -= amountMinor;
      mbWallet.balance = mbWallet.balanceMinor / 100;
    }
    db.transactions.unshift(created);
    saveDb(db);
    return { success: true, transaction: created };
  },
};

function getTodayDateKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function createMbBankReceiptDataUrl(options: {
  amount: number;
  type: 'income' | 'expense';
  dateKey: string;
  timeStr: string;
  note: string;
  referenceCode: string;
}): string {
  const isIncome = options.type === 'income';
  const sign = isIncome ? '+' : '−';
  const colorAccent = isIncome ? '#10b981' : '#f43f5e';
  const cleanNote = (options.note || 'Thanh toán qua MB Bank').replace(/[<>&'"]/g, ' ').slice(0, 75);
  const cleanRef = options.referenceCode.replace(/[<>&'"]/g, '').slice(0, 30);
  const formatted = options.amount.toLocaleString('vi-VN');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 900" width="720" height="900">
  <defs>
    <linearGradient id="mbg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#001844" />
      <stop offset="50%" stop-color="#002D72" />
      <stop offset="100%" stop-color="#0a1226" />
    </linearGradient>
  </defs>
  <rect width="720" height="900" fill="url(#mbg)" />
  <rect x="0" y="0" width="720" height="12" fill="#00A3E0" />
  <g transform="translate(60, 60)">
    <rect x="0" y="0" width="56" height="56" rx="14" fill="#00A3E0" />
    <path d="M 16 38 L 16 18 L 24 28 L 32 18 L 32 38 M 38 18 L 46 18 L 46 28 L 38 28 L 46 38" stroke="#ffffff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none" />
    <text x="72" y="28" font-family="-apple-system, sans-serif" font-weight="900" font-size="24" fill="#ffffff" letter-spacing="1.5">MB BANK</text>
    <text x="72" y="48" font-family="-apple-system, sans-serif" font-weight="600" font-size="13" fill="#93c5fd">NGÂN HÀNG QUÂN ĐỘI • BIÊN LAI ĐIỆN TỬ</text>
    <rect x="420" y="8" width="180" height="38" rx="19" fill="rgba(0, 163, 224, 0.22)" stroke="#00A3E0" stroke-width="1.5" />
    <text x="510" y="32" font-family="-apple-system, sans-serif" font-weight="800" font-size="12" fill="#67e8f9" text-anchor="middle">⚡ MB BANK AUTO</text>
  </g>
  <g transform="translate(60, 160)">
    <rect x="0" y="0" width="600" height="220" rx="24" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.18)" stroke-width="1.5" />
    <text x="40" y="48" font-family="-apple-system, sans-serif" font-size="14" font-weight="600" fill="#94a3b8">BIẾN ĐỘNG SỐ DƯ TỰ ĐỘNG</text>
    <text x="40" y="125" font-family="-apple-system, sans-serif" font-size="50" font-weight="900" fill="${colorAccent}">
      ${sign}${formatted} <tspan font-size="30" font-weight="700">VND</tspan>
    </text>
    <rect x="40" y="155" width="130" height="32" rx="8" fill="${isIncome ? 'rgba(16, 185, 129, 0.2)' : 'rgba(244, 63, 94, 0.2)'}" />
    <text x="105" y="176" font-family="-apple-system, sans-serif" font-size="13" font-weight="700" fill="${colorAccent}" text-anchor="middle">
      ${isIncome ? 'TIỀN VÀO (+)' : 'TIỀN RA (−)'}
    </text>
  </g>
  <g transform="translate(60, 410)">
    <rect x="0" y="0" width="600" height="330" rx="20" fill="rgba(10, 18, 38, 0.65)" stroke="rgba(255, 255, 255, 0.1)" stroke-width="1" />
    <text x="36" y="50" font-family="-apple-system, sans-serif" font-size="13" fill="#94a3b8">Thời gian giao dịch</text>
    <text x="564" y="50" font-family="-apple-system, sans-serif" font-size="15" font-weight="700" fill="#ffffff" text-anchor="end">${options.timeStr} • ${options.dateKey}</text>
    <line x1="36" y1="78" x2="564" y2="78" stroke="rgba(255, 255, 255, 0.08)" />
    <text x="36" y="118" font-family="-apple-system, sans-serif" font-size="13" fill="#94a3b8">Mã tham chiếu (Ref ID)</text>
    <text x="564" y="118" font-family="-apple-system, sans-serif" font-size="14" font-weight="700" fill="#38bdf8" text-anchor="end">${cleanRef}</text>
    <line x1="36" y1="146" x2="564" y2="146" stroke="rgba(255, 255, 255, 0.08)" />
    <text x="36" y="186" font-family="-apple-system, sans-serif" font-size="13" fill="#94a3b8">Nội dung</text>
    <text x="36" y="222" font-family="-apple-system, sans-serif" font-size="16" font-weight="600" fill="#f8fafc">${cleanNote}</text>
    <line x1="36" y1="254" x2="564" y2="254" stroke="rgba(255, 255, 255, 0.08)" />
    <text x="36" y="294" font-family="-apple-system, sans-serif" font-size="13" fill="#94a3b8">Kênh tích hợp</text>
    <text x="564" y="294" font-family="-apple-system, sans-serif" font-size="14" font-weight="700" fill="#a78bfa" text-anchor="end">Webhook API (Real-time)</text>
  </g>
  <g transform="translate(60, 780)">
    <rect x="0" y="0" width="600" height="54" rx="14" fill="rgba(0, 163, 224, 0.12)" stroke="rgba(0, 163, 224, 0.3)" stroke-width="1" />
    <text x="300" y="32" font-family="-apple-system, sans-serif" font-size="13" font-weight="600" fill="#7dd3fc" text-anchor="middle">
      📸 Chạm vào giao dịch để chụp hoặc thay ảnh bill thực tế
    </text>
  </g>
</svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
