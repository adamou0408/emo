// 先走網路、失敗才用快取：上線新版本時使用者馬上拿到，離線時仍可使用。
const CACHE = 'emo-v4';
const SHELL = [
  '/',
  '/index.html',
  '/companions',
  '/styles.css',
  '/manifest.webmanifest',
  '/src/app.js',
  '/src/companions.js',
  '/src/companions-page.js',
  '/src/practice.js',
  '/src/practice-data.js',
  '/src/practice-safety.js',
  '/src/practice-view.js',
  '/icons/icon.svg',
  '/icons/icon-192.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // API 一律走網路，不進快取
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request).then((hit) => hit ?? caches.match('/index.html'))),
  );
});
