// version: 1.0.2
const VERSION = '1.0.2';
const CACHE = 'watar-' + VERSION;
const CORE = [
  '/Alaa/', '/Alaa/index.html', '/Alaa/manifest.webmanifest', '/Alaa/storage.js', '/Alaa/check.html',
  '/Alaa/icon-192.png', '/Alaa/icon-512.png', '/Alaa/maskable-192.png', '/Alaa/maskable-512.png',
  '/Alaa/apple-touch-icon.png', '/Alaa/favicon-32.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(CORE.map(u => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k.startsWith('watar-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (!/^https?:$/.test(url.protocol)) return;
  // الصوت/الفيديو (طلبات Range) تمرّ مباشرة
  if (req.headers.has('range')) return;

  // التنقّل: الشبكة أولًا مع رجوع للنسخة المخزّنة عند انقطاع الإنترنت
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(r => {
        if (r.ok && url.origin === location.origin) { const cp = r.clone(); caches.open(CACHE).then(c => c.put(req, cp)); }
        return r;
      }).catch(() =>
        caches.match(req, { ignoreSearch: true })
          .then(r => r || caches.match('/Alaa/index.html'))
          .then(r => r || caches.match('/Alaa/'))
      )
    );
    return;
  }

  // بقية الملفات (ومنها خطوط Google): من الكاش أولًا ثم الشبكة مع تحديث الكاش
  e.respondWith(
    caches.match(req).then(hit => {
      const net = fetch(req).then(r => {
        if (r && (r.ok || r.type === 'opaque')) { const cp = r.clone(); caches.open(CACHE).then(c => c.put(req, cp)); }
        return r;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
