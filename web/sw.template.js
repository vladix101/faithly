/* Faithly service worker. scripts/build-web.mjs replaces the two placeholders below and writes dist/sw.js.
 *
 * Cache strategy
 * - App shell (index.html, JS bundle, fonts, icons): precached per build in "faithly-shell-<build>".
 * - Navigations: network first (3 s timeout), falling back to the cached shell, so the app opens
 *   offline and SPA routes work on reload.
 * - Hashed static files: cache first (their URLs change when their content changes).
 * - /content/<version>/…: not handled here; the app stores content in IndexedDB.
 * - /api/…: network only.
 * Updates: a new worker waits until the page sends SKIP_WAITING (user taps "Osveži"), then
 * deletes the previous shell cache. It never touches IndexedDB, so user data is safe.
 */
const BUILD_ID = '__BUILD_ID__';
const PRECACHE = __PRECACHE__;
const SHELL = `faithly-shell-${BUILD_ID}`;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' })))));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith('faithly-shell-') && name !== SHELL) await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/content/')) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          return await withTimeout(fetch(req), 3000);
        } catch {
          const cache = await caches.open(SHELL);
          return (await cache.match('/index.html')) || (await cache.match('/')) || Response.error();
        }
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(SHELL);
      const hit = await cache.match(req, { ignoreSearch: url.pathname.startsWith('/_expo/') });
      if (hit) return hit;
      const res = await fetch(req);
      // Keep fonts/images loaded lazily by the bundle for offline use.
      if (res.ok && (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/_expo/'))) cache.put(req, res.clone());
      return res;
    })(),
  );
});

// ---------- Web Push ----------
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'Faithly 🤍';
  // Every push results in a visible notification, as required by userVisibleOnly.
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || 'Tvoj današnji biblijski citat je spreman.',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: data.tag || 'faithly-daily',
      lang: 'sr',
      data: { url: data.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.find((c) => new URL(c.url).origin === self.location.origin);
      if (open) {
        await open.focus();
        open.postMessage({ type: 'faithly-navigate', url: new URL(target).pathname });
        return;
      }
      await self.clients.openWindow(target);
    })(),
  );
});
