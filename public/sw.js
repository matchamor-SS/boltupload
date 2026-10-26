/* Set & Settled service worker: shows reminder alerts and opens the app when one is tapped.
 * It does not cache pages or data. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(String(d.title || 'Set & Settled').slice(0, 80), {
    body: String(d.body || 'You have a new reminder.').slice(0, 240),
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-72.png',
    tag: String(d.tag || 'ss').slice(0, 64),
    data: { url: typeof d.url === 'string' ? d.url : '/' },
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  let url;
  try { url = new URL(e.notification.data && e.notification.data.url || '/', self.location.origin); } catch (_) { url = new URL('/', self.location.origin); }
  if (url.origin !== self.location.origin) url = new URL('/', self.location.origin);   // only ever open this site
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if (new URL(w.url).origin === url.origin && !new URL(w.url).searchParams.get('book')) {
        await w.focus();
        w.postMessage({ type: 'ss-goto', url: url.pathname + url.search });
        return;
      }
    }
    await self.clients.openWindow(url.href);
  })());
});
