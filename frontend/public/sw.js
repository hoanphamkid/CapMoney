self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('push', event => {
  if (!event.data) return;
  let data;
  try { data = event.data.json(); } catch { return; }
  event.waitUntil(Promise.all([
    self.registration.showNotification(data.title || 'MB Bank', {
      body: data.body || 'Có giao dịch MB Bank mới.', tag: data.tag,
      icon: '/icons/icon-192.png', badge: '/icons/icon-192.png',
      data: { url: '/app/transactions' },
    }),
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      clients.forEach(client => client.postMessage({ type: 'capmoney:bank-data-changed' }));
    }),
  ]));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const target = new URL('/app/transactions', self.location.origin).href;
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const client = clients.find(item => new URL(item.url).origin === self.location.origin);
    if (client) { await client.navigate(target); await client.focus(); }
    else await self.clients.openWindow(target);
  })());
});
