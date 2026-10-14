// ============================================================
// مطاحن بن لؤلؤة الحبشي — Service Worker
// نسخة: v1.1.0
// - الصفحات و JSON: network-first (التحديثات من GitHub تظهر فوراً) مع fallback للكاش أوفلاين
// - الصور: cache-first
// - الفيديو: من الكاش مع دعم Range (عشان يشتغل أوفلاين وعلى iOS)
// - مكتبة Swiper والخطوط (CDN): بتتخزن عشان الموقع يشتغل أوفلاين كامل
// ============================================================

const CACHE_VERSION = 'loloat-v1.1.0';
const STATIC_CACHE  = CACHE_VERSION + '-static';
const RUNTIME_CACHE = CACHE_VERSION + '-runtime';
const CDN_CACHE     = CACHE_VERSION + '-cdn';

const NETWORK_TIMEOUT = 5000;

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
  './assets/images/splash.mp4',
  './assets/images/splash-poster.jpg'
];

// ملفات الـ CDN اللي الصفحة بتعتمد عليها
const CDN_ASSETS = [
  'https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.css',
  'https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.js'
];
const FONTS_CSS = 'https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&family=Tajawal:wght@400;500;700;800;900&family=Lalezar&family=Poppins:wght@500;600;700;800&display=swap';

const CDN_HOSTS = [
  'cdn.jsdelivr.net',
  'fonts.googleapis.com',
  'fonts.gstatic.com'
];

// ---------------- تثبيت ----------------
self.addEventListener('install', (event) => {
  console.log('[SW] Installing version:', CACHE_VERSION);

  event.waitUntil(
    Promise.all([
      precacheStatic(),
      precacheCdn()
    ])
  );

  self.skipWaiting();
});

function precacheStatic() {
  return caches.open(STATIC_CACHE).then((cache) =>
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
  );
}

// تخزين Swiper + ملف الخطوط + ملفات الخطوط نفسها (best-effort)
async function precacheCdn() {
  try {
    const cache = await caches.open(CDN_CACHE);

    await Promise.all(CDN_ASSETS.map((url) =>
      fetch(url, { mode: 'no-cors' })
        .then((res) => cache.put(url, res))
        .catch((err) => console.warn('[SW] CDN cache failed:', url, err && err.message))
    ));

    try {
      const cssRes = await fetch(FONTS_CSS, { mode: 'cors' });
      if (cssRes.ok) {
        const cssText = await cssRes.clone().text();
        await cache.put(FONTS_CSS, cssRes);

        const fontUrls = Array.from(new Set(
          (cssText.match(/https:\/\/fonts\.gstatic\.com[^)'"\s]+/g) || [])
        ));
        await Promise.all(fontUrls.map((u) =>
          fetch(u, { mode: 'cors' })
            .then((r) => { if (r.ok) return cache.put(u, r); })
            .catch(() => {})
        ));
      }
    } catch (err) {
      console.warn('[SW] Fonts precache failed:', err && err.message);
    }
  } catch (err) {
    console.warn('[SW] CDN precache failed:', err && err.message);
  }
}

// ---------------- تنشيط ----------------
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating version:', CACHE_VERSION);

  const keep = [STATIC_CACHE, RUNTIME_CACHE, CDN_CACHE];

  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName.startsWith('loloat-') && !keep.includes(cacheName)) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      )
    ).then(() => self.clients.claim())
  );
});

// ---------------- اعتراض الطلبات ----------------
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;

  // موارد CDN (Swiper + الخطوط)
  if (url.origin !== location.origin) {
    if (CDN_HOSTS.includes(url.hostname)) {
      event.respondWith(staleWhileRevalidate(request, CDN_CACHE));
    }
    return;
  }

  // الفيديو (يحتاج دعم Range)
  if (/\.(mp4|webm)$/i.test(url.pathname)) {
    event.respondWith(videoResponse(request));
    return;
  }

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

// network-first بمهلة: لو فيه نسخة مخزنة والشبكة بطيئة (أكتر من 5 ثواني) أو أوفلاين → نرجع النسخة المخزنة
async function networkFirst(request) {
  const key = cacheKey(request);

  const net = fetch(request).then((response) => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(RUNTIME_CACHE).then((cache) => cache.put(key, copy));
    }
    return response;
  });

  let cached = await caches.match(key);
  if (!cached && request.mode === 'navigate') {
    cached = (await caches.match(request, { ignoreSearch: true })) ||
             (await caches.match('./index.html'));
  }

  if (cached) {
    return Promise.race([
      net.catch(() => cached),
      new Promise((resolve) => setTimeout(() => resolve(cached), NETWORK_TIMEOUT))
    ]);
  }

  try {
    return await net;
  } catch (err) {
    return new Response('Offline', { status: 503 });
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request.url);

  const network = fetch(request)
    .then((res) => {
      // نخزّن الردود السليمة والـ opaque (مكتبات no-cors)
      if (res && (res.ok || res.type === 'opaque')) {
        cache.put(request.url, res.clone());
      }
      return res;
    })
    .catch(() => null);

  if (cached) return cached;

  const res = await network;
  return res || new Response('', { status: 504 });
}

// الفيديو: من الكاش (مع تحديث بالخلفية) ودعم طلبات Range
async function videoResponse(request) {
  const cache = await caches.open(STATIC_CACHE);
  const key = request.url;

  let full = await cache.match(key);

  if (full) {
    // تحديث بالخلفية لو اتغيّر الفيديو
    fetch(key, { cache: 'no-cache' })
      .then((res) => { if (res.ok && res.status === 200) cache.put(key, res); })
      .catch(() => {});
  } else {
    try {
      const net = await fetch(key);
      if (!net.ok) return net;
      if (net.status === 200) cache.put(key, net.clone());
      full = net;
    } catch (err) {
      return new Response('', { status: 404 });
    }
  }

  const range = request.headers.get('range');
  if (!range) return full;

  const buf = await full.arrayBuffer();
  const total = buf.byteLength;
  const m = /bytes=(\d*)-(\d*)/.exec(range);
  let start = m && m[1] ? parseInt(m[1], 10) : 0;
  let end = m && m[2] ? parseInt(m[2], 10) : total - 1;
  if (isNaN(start) || start >= total) start = 0;
  if (isNaN(end) || end >= total) end = total - 1;

  return new Response(buf.slice(start, end + 1), {
    status: 206,
    statusText: 'Partial Content',
    headers: {
      'Content-Type': full.headers.get('Content-Type') || 'video/mp4',
      'Content-Range': `bytes ${start}-${end}/${total}`,
      'Content-Length': String(end - start + 1),
      'Accept-Ranges': 'bytes'
    }
  });
}

function isImage(request) {
  const url = request.url.toLowerCase().split('?')[0];
  return /\.(png|jpg|jpeg|gif|webp|svg|ico)$/.test(url) ||
         request.destination === 'image';
}

// ---------------- رسائل ----------------
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((cacheNames) =>
        Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)))
      )
    );
  }
});

console.log('🚀 [SW] Lo\'lo\'at El-Habashi SW loaded —', CACHE_VERSION);
