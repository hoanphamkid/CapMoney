import { createHash } from 'node:crypto';
import * as webPush from 'web-push';

// Use the caller's database connection: standalone Vercel webhooks and Express
// can run in different processes and use different Mongoose versions.
export type NotificationDatabase = { collection(name: string): any };
export type BankNotification = { id: string; amount: number; type: string; duplicate: boolean };
export type DeviceSubscription = { endpoint: string; keys: { p256dh: string; auth: string } };

export const subscriptionId = (endpoint: string) => createHash('sha256').update(endpoint).digest('hex');

export function pushConfiguration() {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  return VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && VAPID_SUBJECT
    ? { publicKey: VAPID_PUBLIC_KEY, privateKey: VAPID_PRIVATE_KEY, subject: VAPID_SUBJECT }
    : null;
}

export function isPushEndpoint(endpoint: string) {
  try {
    const url = new URL(endpoint);
    const host = url.hostname;
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && (
      host === 'fcm.googleapis.com' || host === 'web.push.apple.com' ||
      host === 'updates.push.services.mozilla.com' || host.endsWith('.push.services.mozilla.com') ||
      host.endsWith('.notify.windows.com')
    );
  } catch { return false; }
}

type PushDeliveryResult = { sent: number; removed: number; failed: number; devices: number; configured: boolean };

async function sendPayload(db: NotificationDatabase, userId: string, payload: string): Promise<PushDeliveryResult> {
  const configuration = pushConfiguration();
  if (!configuration) return { sent: 0, removed: 0, failed: 0, devices: 0, configured: false };
  const devices = await db.collection('pushsubscriptions').find({ userId }).limit(50).toArray() as Array<DeviceSubscription & { _id: string }>;
  let sent = 0;
  let removed = 0;
  let failed = 0;
  await Promise.all(devices.map(async device => {
    try {
      await webPush.sendNotification(device, payload, { vapidDetails: configuration, TTL: 3600, timeout: 5000 });
      sent += 1;
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await db.collection('pushsubscriptions').deleteOne({ _id: device._id, userId });
        removed += 1;
      } else {
        failed += 1;
        console.error('[bank-push] delivery failed', { status, endpoint: device.endpoint.slice(0, 80) });
      }
    }
  }));
  return { sent, removed, failed, devices: devices.length, configured: true };
}

export async function sendTestNotification(db: NotificationDatabase, userId: string) {
  return sendPayload(db, userId, JSON.stringify({
    title: 'CapMoney: Thông báo thử',
    body: 'Thiết bị này đã kết nối thông báo MB Bank.',
    tag: `capmoney-test-${Date.now()}`,
    url: '/app/settings',
  }));
}

export async function sendBankNotifications(db: NotificationDatabase, userId: string, transactions: BankNotification[]) {
  const configuration = pushConfiguration();
  const fresh = transactions.filter(tx => !tx.duplicate);
  if (!configuration || !fresh.length) return;
  // Notification failures must never undo a committed bank transaction or cause
  // the provider to apply the same payment again.
  try {
    for (const tx of fresh) {
      const income = tx.type === 'income';
      const payload = JSON.stringify({
        title: income ? 'MB Bank: Nhận tiền' : 'MB Bank: Chuyển tiền',
        body: `${income ? '+' : '−'}${tx.amount.toLocaleString('vi-VN')} ₫`,
        tag: `mbbank-${tx.id}`, url: '/app/transactions',
      });
      await sendPayload(db, userId, payload);
    }
  } catch { console.error('[bank-push] notification service unavailable'); }
}
