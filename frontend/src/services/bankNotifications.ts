import { authenticatedRequest } from './api';

export const supportsBankPush = () => window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export async function bankPushEnabled() {
  if (!supportsBankPush() || Notification.permission !== 'granted') return false;
  const registration = await navigator.serviceWorker.getRegistration('/');
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return false;
  const result = await authenticatedRequest<{ enabled: boolean }>('/notifications/subscription/status', {
    method: 'POST', body: JSON.stringify({ endpoint: subscription.endpoint }),
  });
  return result.enabled;
}

export async function enableBankPush() {
  if (!supportsBankPush()) throw new Error('Thiết bị chưa hỗ trợ thông báo web. Với iPhone/iPad, hãy thêm CapMoney vào Màn hình chính rồi mở từ biểu tượng ứng dụng.');
  // Call from the button's user gesture, before making any network requests.
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Hãy cho phép thông báo cho CapMoney trong cài đặt trình duyệt để nhận biến động MB Bank.');
  const config = await authenticatedRequest<{ enabled: boolean; publicKey: string | null }>('/notifications/config');
  if (!config.enabled || !config.publicKey) throw new Error('Máy chủ chưa cấu hình thông báo đẩy. Cần thêm bộ khóa VAPID rồi triển khai lại.');
  await navigator.serviceWorker.register('/sw.js');
  const registration = await navigator.serviceWorker.ready;
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
  const registration = await navigator.serviceWorker.getRegistration('/');
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
