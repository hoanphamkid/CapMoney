import { authenticatedRequest } from './api';

export type BankPushConfig = { enabled: boolean; publicKey: string | null };

export const supportsBankPush = () => window.isSecureContext && 'serviceWorker' in navigator && 'Notification' in window;

export const isHomeScreenApp = () => {
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone;
  return standalone === true || window.matchMedia('(display-mode: standalone)').matches;
};

export async function getBankPushConfig() {
  return authenticatedRequest<BankPushConfig>('/notifications/config');
}

async function getRegistration() {
  const current = await navigator.serviceWorker.getRegistration();
  return current ?? navigator.serviceWorker.register('/sw.js', { scope: '/' });
}

export async function bankPushEnabled() {
  if (!supportsBankPush() || Notification.permission !== 'granted') return false;
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager?.getSubscription();
  if (!subscription) return false;
  const result = await authenticatedRequest<{ enabled: boolean }>('/notifications/subscription/status', {
    method: 'POST', body: JSON.stringify({ endpoint: subscription.endpoint }),
  });
  return result.enabled;
}

export async function enableBankPush(preloadedConfig?: BankPushConfig) {
  if (!supportsBankPush()) {
    if (!window.isSecureContext) throw new Error('Thông báo chỉ hoạt động trên HTTPS. Hãy mở bản CapMoney có địa chỉ bắt đầu bằng https://.');
    throw new Error('Trình duyệt này chưa hỗ trợ thông báo web. Trên iPhone/iPad, hãy dùng Safari, chọn Chia sẻ → Thêm vào Màn hình chính, rồi mở CapMoney từ biểu tượng đó.');
  }
  // Keep the permission request directly inside the button gesture.
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Hãy cho phép thông báo cho CapMoney trong cài đặt trình duyệt để nhận biến động MB Bank.');
  const config = preloadedConfig ?? await getBankPushConfig();
  if (!config.enabled || !config.publicKey) throw new Error('Máy chủ chưa cấu hình thông báo đẩy. Cần thêm bộ khóa VAPID rồi triển khai lại.');
  const registration = await getRegistration();
  if (!registration.pushManager) throw new Error('iPhone chưa nhận CapMoney là web app. Hãy mở CapMoney từ biểu tượng đã thêm vào Màn hình chính.');
  const base64 = config.publicKey.replace(/-/g, '+').replace(/_/g, '/');
  const key = Uint8Array.from(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')), c => c.charCodeAt(0));
  let subscription = await registration.pushManager.getSubscription();
  if (subscription) {
    const existingKey = subscription.options.applicationServerKey;
    if (existingKey && new Uint8Array(existingKey).join() !== key.join()) {
      await subscription.unsubscribe();
      subscription = null;
    }
  }
  subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  await authenticatedRequest('/notifications/subscription', { method: 'POST', body: JSON.stringify(subscription.toJSON()) });
}

export async function disableBankPush() {
  if (!supportsBankPush()) return;
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  try {
    await authenticatedRequest('/notifications/subscription', { method: 'DELETE', body: JSON.stringify({ endpoint: subscription.endpoint }) });
  } finally {
    // Even if the network is down, revoke this device's endpoint on logout.
    await subscription.unsubscribe();
    const notifications = await registration?.getNotifications();
    notifications?.forEach(notification => notification.close());
  }
}
