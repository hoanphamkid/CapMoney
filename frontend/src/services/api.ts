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

type CloudAccountSnapshot = {
  email: string;
  updatedAt: number;
  user: StoredUser;
  profile?: Profile;
  wallets: StoredWallet[];
  transactions: StoredTransaction[];
  reminders: StoredReminder[];
  budgetRaw?: string | null;
  savingsJarRaw?: string | null;
};

function emailToCloudTopic(email: string): string {
  const normalized = email.trim().toLowerCase();
  // Deterministic 64-bit FNV-1a style twin hash so every browser produces the exact same topic
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= ch * 31 + i;
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  const hex1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const hex2 = (h2 >>> 0).toString(16).padStart(8, '0');
  const safeSlug = normalized.replace(/[^a-z0-9]/g, '').slice(0, 14);
  return `cm_cloud_v2_${safeSlug}_${hex1}${hex2}`;
}

let cloudPushTimer: ReturnType<typeof setTimeout> | null = null;
let initialSessionSyncedForUser: string | null = null;

async function pushAccountToCloudNow(db: LocalDb, targetUserId?: string): Promise<boolean> {
  const uid = targetUserId ?? db.currentUserId;
  if (!uid) return false;
  const user = db.users.find(u => u.id === uid);
  if (!user || !user.email) return false;

  const topic = emailToCloudTopic(user.email);
  const snapshot: CloudAccountSnapshot = {
    email: user.email,
    updatedAt: Date.now(),
    user,
    profile: db.profiles[user.id],
    wallets: db.wallets.filter(w => w.userId === user.id),
    transactions: db.transactions.filter(t => t.userId === user.id),
    reminders: db.reminders.filter(r => r.userId === user.id),
    budgetRaw: localStorage.getItem('capmoney_budget_v1'),
    savingsJarRaw: localStorage.getItem('capmoney_savings_jar_v1'),
  };

  try {
    const res = await fetch(`https://ntfy.sh/${topic}`, {
      method: 'PUT',
      headers: { Filename: 'account.json' },
      body: JSON.stringify(snapshot),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function scheduleCloudPush(db: LocalDb) {
  if (!db.currentUserId) return;
  if (cloudPushTimer) clearTimeout(cloudPushTimer);
  cloudPushTimer = setTimeout(() => {
    void pushAccountToCloudNow(loadDb());
  }, 450);
}

async function pullAndMergeCloudAccount(emailInput: string): Promise<{ synced: boolean; txCount: number }> {
  const email = emailInput.trim().toLowerCase();
  if (!email) return { synced: false, txCount: 0 };
  const topic = emailToCloudTopic(email);

  let cloudSnap: CloudAccountSnapshot | null = null;
  try {
    const pollRes = await fetch(`https://ntfy.sh/${topic}/json?poll=1&since=12h`);
    if (pollRes.ok) {
      const text = await pollRes.text();
      const lines = text
        .split(/\r?\n/)
        .map(l => l.trim())
        .filter(Boolean);

      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          const item = JSON.parse(lines[i]) as {
            event?: string;
            message?: string;
            attachment?: { url?: string };
          };
          if (item.event !== 'message') continue;
          if (item.attachment?.url) {
            const fileRes = await fetch(item.attachment.url);
            if (fileRes.ok) {
              const parsed = (await fileRes.json()) as CloudAccountSnapshot;
              if (parsed && parsed.email === email && Array.isArray(parsed.transactions)) {
                cloudSnap = parsed;
                break;
              }
            }
          } else if (item.message && item.message.startsWith('{')) {
            const parsed = JSON.parse(item.message) as CloudAccountSnapshot;
            if (parsed && parsed.email === email && Array.isArray(parsed.transactions)) {
              cloudSnap = parsed;
              break;
            }
          }
        } catch {
          // Continue checking earlier messages
        }
      }
    }
  } catch {
    // Offline or network error
  }

  const db = loadDb();
  let localUser = db.users.find(u => u.email === email);

  if (!cloudSnap) {
    // Nothing in cloud yet: if local user already has data, push it to cloud so other browsers get it!
    if (localUser) {
      await pushAccountToCloudNow(db, localUser.id);
      const count = db.transactions.filter(t => t.userId === localUser!.id).length;
      return { synced: true, txCount: count };
    }
    return { synced: false, txCount: 0 };
  }

  // Merge cloudSnap into local db
  if (!localUser) {
    localUser = { ...cloudSnap.user, email };
    db.users.push(localUser);
  } else {
    localUser.name = cloudSnap.user.name || localUser.name;
    localUser.phone = cloudSnap.user.phone || localUser.phone;
  }

  const uid = localUser.id;
  if (cloudSnap.profile) {
    db.profiles[uid] = cloudSnap.profile;
  }

  // Merge wallets & build ID mapping so default 'Wallet' and 'Bank' don't duplicate
  const walletIdMap: Record<string, string> = {};
  const localUserWallets = db.wallets.filter(w => w.userId === uid);

  for (const cw of cloudSnap.wallets ?? []) {
    const byId = localUserWallets.find(lw => lw.id === cw.id);
    if (byId) {
      walletIdMap[cw.id] = byId.id;
      byId.name = cw.name;
      byId.color = cw.color;
      byId.active = cw.active;
    } else {
      const byNameAndType = localUserWallets.find(
        lw => lw.name.toLowerCase() === cw.name.toLowerCase() && lw.type === cw.type,
      );
      if (byNameAndType) {
        walletIdMap[cw.id] = byNameAndType.id;
      } else {
        const added: StoredWallet = { ...cw, userId: uid };
        db.wallets.push(added);
        localUserWallets.push(added);
        walletIdMap[cw.id] = added.id;
      }
    }
  }

  ensureDefaultLocalWallets(db, uid);
  const fallbackWalletId = db.wallets.find(w => w.userId === uid && w.active)?.id ?? '';

  // Merge transactions by ID
  const existingTxIds = new Set(db.transactions.filter(t => t.userId === uid).map(t => t.id));
  let addedFromCloud = 0;

  for (const ctx of cloudSnap.transactions ?? []) {
    if (!existingTxIds.has(ctx.id)) {
      const mappedWalletId = walletIdMap[ctx.walletId] || fallbackWalletId || ctx.walletId;
      const mappedToWalletId = ctx.toWalletId ? walletIdMap[ctx.toWalletId] || ctx.toWalletId : undefined;
      db.transactions.push({
        ...ctx,
        userId: uid,
        walletId: mappedWalletId,
        toWalletId: mappedToWalletId,
      });
      existingTxIds.add(ctx.id);
      addedFromCloud++;
    }
  }

  // Sort transactions newest first
  db.transactions.sort((a, b) => b.dateKey.localeCompare(a.dateKey));

  // Recalculate wallet balances from merged transactions
  const activeWallets = db.wallets.filter(w => w.userId === uid);
  for (const w of activeWallets) {
    let balMinor = 0;
    for (const tx of db.transactions) {
      if (tx.userId !== uid) continue;
      if (tx.type === 'income' && tx.walletId === w.id) balMinor += tx.amountMinor;
      else if (tx.type === 'expense' && tx.walletId === w.id) balMinor -= tx.amountMinor;
      else if (tx.type === 'transfer') {
        if (tx.walletId === w.id) balMinor -= tx.amountMinor;
        if (tx.toWalletId === w.id) balMinor += tx.amountMinor;
      }
    }
    w.balanceMinor = balMinor;
    w.balance = balMinor / 100;
  }

  // Merge reminders by ID
  const existingRemIds = new Set(db.reminders.filter(r => r.userId === uid).map(r => r.id));
  for (const crem of cloudSnap.reminders ?? []) {
    if (!existingRemIds.has(crem.id)) {
      db.reminders.push({ ...crem, userId: uid });
      existingRemIds.add(crem.id);
    }
  }

  if (cloudSnap.budgetRaw && !localStorage.getItem('capmoney_budget_v1')) {
    try {
      localStorage.setItem('capmoney_budget_v1', cloudSnap.budgetRaw);
    } catch {
      // Ignore
    }
  }
  if (cloudSnap.savingsJarRaw && !localStorage.getItem('capmoney_savings_jar_v1')) {
    try {
      localStorage.setItem('capmoney_savings_jar_v1', cloudSnap.savingsJarRaw);
    } catch {
      // Ignore
    }
  }

  saveDb(db, false);

  // If local had more transactions than cloud, push the merged union back to cloud
  const mergedUserTxCount = db.transactions.filter(t => t.userId === uid).length;
  if (mergedUserTxCount > (cloudSnap.transactions?.length ?? 0) || addedFromCloud > 0) {
    void pushAccountToCloudNow(db, uid);
  }

  return { synced: true, txCount: mergedUserTxCount };
}

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

function saveDb(db: LocalDb, syncCloud = true) {
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
  if (syncCloud) {
    scheduleCloudPush(db);
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
  syncCloud: async () => {
    const db = loadDb();
    const user = requireLocalUser(db);
    // First push local state if any, then pull & merge so both directions are synced
    await pullAndMergeCloudAccount(user.email);
    const updatedDb = loadDb();
    await pushAccountToCloudNow(updatedDb, user.id);
    const txCount = updatedDb.transactions.filter(t => t.userId === user.id).length;
    return { synced: true, txCount };
  },

  register: (input: { name: string; email: string; password: string; phone?: string }) =>
    withFallback(
      () => request<{ user: User; message: string }>('/auth/register', { method: 'POST', body: JSON.stringify(input) }),
      async () => {
        const email = input.email.trim().toLowerCase();
        await pullAndMergeCloudAccount(email);
        const db = loadDb();
        let user = db.users.find(u => u.email === email);
        if (user) {
          user.name = input.name.trim() || user.name;
          if (input.phone?.trim()) user.phone = input.phone.trim();
          user.password = input.password;
          db.currentUserId = user.id;
          initialSessionSyncedForUser = user.id;
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
        initialSessionSyncedForUser = user.id;
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
        await pullAndMergeCloudAccount(email);
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
        initialSessionSyncedForUser = user.id;
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
      async () => {
        let db = loadDb();
        const user = requireLocalUser(db);
        if (initialSessionSyncedForUser !== user.id) {
          initialSessionSyncedForUser = user.id;
          await pullAndMergeCloudAccount(user.email);
          db = loadDb();
        }
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
