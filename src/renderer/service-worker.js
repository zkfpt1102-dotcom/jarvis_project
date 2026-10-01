// J.A.R.V.I.S. PWA Service Worker v3 (Network-First to always deliver fresh code)
const CACHE_NAME = 'jarvis-pwa-v3';

self.addEventListener('install', (event) => {
  console.log('[JARVIS SW] Installing service worker v3 (Network-First)...');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[JARVIS SW] Activating service worker v3 and purging all old caches...');
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          console.log('[JARVIS SW] Purging old cache:', key);
          return caches.delete(key);
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Network-First strategy: Always fetch newest code from server
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Always bypass for API calls or non-GET
  if (url.pathname.startsWith('/api') || event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});
