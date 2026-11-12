import { ApiError, authenticatedRequest, clearLocalAccountCache, readLocalBackup } from './api';

export const PREFERENCE_KEYS = [
  'capmoney_budget_v1', 'capmoney_savings_jar_v1', 'capmoney_debts_v1', 'capmoney_subscriptions_v1',
  'capmoney_challenge30_v1', 'capmoney-theme', 'capmoney-remind-record', 'capmoney-remind-bill',
  'capmoney_work_pay_v1',
] as const;
type Preferences = Record<string, string | null>;
export type AccountBackup = {
  id: string; deviceId: string; deviceName: string; label: string; kind: 'manual' | 'before_restore';
  walletCount: number; transactionCount: number; reminderCount: number; sizeBytes: number; createdAt: string;
};
export type BackupHistory = {
  backups: AccountBackup[]; nextCursor: string | null;
  lastApplied: { backupId: string; appliedAt: string } | null;
  activities: Array<{ id: string; backupId: string; deviceName: string; appliedAt: string }>;
};

export function getSyncDevice() {
  const key = 'capmoney_sync_device_v1';
  let deviceId = localStorage.getItem(key);
  if (!deviceId || !/^[a-f\d-]{36}$/i.test(deviceId)) {
    deviceId = crypto.randomUUID();
    localStorage.setItem(key, deviceId);
  }
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  return { deviceId, deviceName: mobile ? (/iPhone|iPad|iPod/i.test(navigator.userAgent) ? 'iPhone / iPad' : 'Điện thoại Android') : 'Laptop / Máy tính' };
}

function preferences(): Preferences {
  return Object.fromEntries(PREFERENCE_KEYS.map(key => [key, localStorage.getItem(key)]));
}

async function checkAccount(email: string) {
  const result = await authenticatedRequest<{ user: { email: string } }>('/auth/me');
  if (result.user.email.toLowerCase() !== email.toLowerCase()) throw new ApiError(409, 'SYNC_ACCOUNT_MISMATCH', 'Tài khoản trên thiết bị và máy chủ khác nhau. Hãy đăng nhập lại đúng tài khoản.');
}

async function imageForBackup(url: string | null) {
  if (!url) return undefined;
  if (url.startsWith('data:image/')) return url;
  if (!/^\/api\/transactions\/[a-f\d]{24}\/image$/i.test(url)) throw new Error('Ảnh trên thiết bị không còn truy cập được. Hãy cập nhật ảnh trước khi tạo bản sao.');
  const response = await fetch(url, { credentials: 'include' });
  if (!response.ok) throw new Error('Không tải được ảnh giao dịch để sao lưu. Hãy thử lại.');
  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Không đọc được ảnh giao dịch.'));
    reader.readAsDataURL(blob);
  });
}

export function localBackupInfo(email: string) {
  const local = readLocalBackup(email);
  return local ? { wallets: local.wallets.length, transactions: local.transactions.length } : null;
}

export async function createBackup(email: string, label: string, source: 'server' | 'device' = 'server') {
  await checkAccount(email);
  let localData;
  if (source === 'device') {
    const local = readLocalBackup(email);
    if (!local) throw new Error('Không có dữ liệu của tài khoản này trên thiết bị.');
    const transactions = [];
    for (const { imageUrl, ...tx } of local.transactions) transactions.push({ ...tx, image: await imageForBackup(imageUrl) });
    localData = { ...local, transactions, preferences: preferences() };
  }
  return authenticatedRequest<{ backup: AccountBackup }>('/backups', { method: 'POST', body: JSON.stringify({ ...getSyncDevice(), label, preferences: preferences(), localData }) });
}

export async function listBackups(before?: string) {
  const query = new URLSearchParams({ deviceId: getSyncDevice().deviceId, ...(before ? { before } : {}) });
  return authenticatedRequest<BackupHistory>(`/backups?${query}`);
}

function applyPreferences(values: Preferences) {
  const previous = preferences();
  try {
    for (const key of PREFERENCE_KEYS) {
      if (values[key] == null) localStorage.removeItem(key);
      else localStorage.setItem(key, values[key]);
    }
  } catch {
    for (const key of PREFERENCE_KEYS) {
      try {
        if (previous[key] == null) localStorage.removeItem(key);
        else localStorage.setItem(key, previous[key]);
      } catch { /* Keep server state available for retry. */ }
    }
    throw new Error('Dữ liệu web đã cập nhật nhưng bộ nhớ thiết bị đầy. Hãy giải phóng dung lượng rồi bấm “Thử lại” để áp dụng cài đặt.');
  }
  document.documentElement.classList.toggle('dark-theme', values['capmoney-theme'] !== 'light');
}

export async function recoverDeviceSettings(email: string) {
  const result = await authenticatedRequest<{ state: { backupId: string; appliedAt: string; preferences: Preferences } | null }>(`/backups/device?deviceId=${getSyncDevice().deviceId}`);
  if (!result.state) return;
  const marker = `capmoney_backup_applied:${email.toLowerCase()}`;
  if (localStorage.getItem(marker) === result.state.appliedAt) return;
  applyPreferences(result.state.preferences);
  localStorage.setItem(marker, result.state.appliedAt);
}

export async function restoreBackup(email: string, backupId: string, onStage: (message: string) => void) {
  await checkAccount(email);
  if (readLocalBackup(email)) {
    onStage('Đang giữ bản sao dữ liệu hiện tại trên thiết bị…');
    await createBackup(email, 'Tự lưu dữ liệu thiết bị trước khi khôi phục', 'device');
  }
  onStage('Đang tải bản sao và cập nhật ví, giao dịch, ảnh…');
  const result = await authenticatedRequest<{ preferences: Preferences; appliedAt: string }>(`/backups/${backupId}/restore`, {
    method: 'POST', body: JSON.stringify({ ...getSyncDevice(), preferences: preferences() }),
  });
  onStage('Đang áp dụng cài đặt và làm mới dữ liệu…');
  applyPreferences(result.preferences);
  clearLocalAccountCache(email);
  localStorage.setItem(`capmoney_backup_applied:${email.toLowerCase()}`, result.appliedAt);
  return result;
}
