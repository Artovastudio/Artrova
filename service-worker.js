const CACHE_NAME = 'artrova-cache-v5';
const URLS_TO_CACHE = [
  './',
  './index.html',
  './assets/design-system.css',
  './manifest.json',
  './assets/favicon-32x32.png',
  './assets/favicon-16x16.png',
  './assets/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(URLS_TO_CACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(key => (key !== CACHE_NAME ? caches.delete(key) : undefined))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;

  // Never cache content that should update frequently.
  // This ensures admin edits to data/portfolio_projects.json reflect immediately.
  try {
    const url = new URL(req.url);
    const path = url.pathname || '';
    const isSameOrigin = url.origin === self.location.origin;
    const isDataFile = path.includes('/data/') && path.toLowerCase().endsWith('.json');
    const isCsvFile = path.toLowerCase().endsWith('.csv');
    if (req.method === 'GET' && isSameOrigin && (isDataFile || isCsvFile)) {
      event.respondWith(fetch(req));
      return;
    }
  } catch (e) {}

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put('./index.html', copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(res => {
        if (req.method === 'GET' && res && res.status === 200 && new URL(req.url).origin === self.location.origin) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, copy)).catch(() => {});
        }
        return res;
      });
    })
  );
});
