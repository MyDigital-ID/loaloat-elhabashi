// ============================================================
// مطاحن بن لؤلؤة الحبشي — Service Worker
// نسخة: v1.0.0
// ============================================================

const CACHE_VERSION = 'loloat-v1.0.1';
const STATIC_CACHE  = CACHE_VERSION + '-static';
const RUNTIME_CACHE = CACHE_VERSION + '-runtime';

const STATIC_ASSETS = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './site-data-loader.js',
  './manifest.json',
  './site-data.json',
  './assets/images/banner.jpg',
  './assets/images/icon-192.png',
  './assets/images/icon-512.png',
  './assets/images/apple-touch-icon.png',
  './assets/images/splash.mp4'
];

// تثبيت
self.addEventListener('install', (event) => {
  console.log('[SW] Installing version:', CACHE_VERSION);

  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) =>
      Promise.all(
        STATIC_ASSETS.map((url) =>
          fetch(new Request(url, { cache: 'reload' }))
            .then((res) => {
              if (!res.ok) throw new Error('HTTP ' + res.status);
              return cache.put(cacheKey(new Request(url)), res);
            })
            .catch((err) => {
              console.warn('[SW] Could not cache:', url, err.message);
            })
        )
      )
    )
  );

  self.skipWaiting();
});

// تنشيط
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating version:', CACHE_VERSION);

  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName.startsWith('loloat-') &&
              cacheName !== STATIC_CACHE &&
              cacheName !== RUNTIME_CACHE) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// اعتراض الطلبات
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;
  if (url.origin !== location.origin) return;

  if (isImage(request)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  event.respondWith(networkFirst(request));
});

function cacheKey(request) {
  const url = new URL(request.url);
  if (url.pathname.toLowerCase().endsWith('.json')) {
    return url.origin + url.pathname;
  }
  return request;
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    return new Response('', { status: 404 });
  }
}

async function networkFirst(request) {
  const key = cacheKey(request);

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(key, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await caches.match(key);
    if (cached) return cached;

    if (request.mode === 'navigate') {
      const page = await caches.match(request, { ignoreSearch: true });
      if (page) return page;
      const offline = await caches.match('./index.html');
      if (offline) return offline;
    }

    return new Response('Offline', { status: 503 });
  }
}

function isImage(request) {
  const url = request.url.toLowerCase().split('?')[0];
  return /\.(png|jpg|jpeg|gif|webp|svg|ico)$/.test(url) ||
         request.destination === 'image';
}

// رسائل
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));
      })
    );
  }
});

console.log('🚀 [SW] Lo\'lo\'at El-Habashi SW loaded —', CACHE_VERSION);