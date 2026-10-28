// Мінімальний офлайн-кеш. Сторінка (HTML) — спершу з мережі, щоб після оновлення сайту одразу бралась нова збірка;
// файли збірки (з хешем у назві) — з кешу, а без мережі — все з кешу.
const CACHE = 'loko-rikoshet-v5';
self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  const page = req.mode === 'navigate' || /\.(html|webmanifest)$|\/$/.test(new URL(req.url).pathname) || new URL(req.url).pathname.endsWith('sw.js');
  e.respondWith(caches.open(CACHE).then(async (c) => {
    const hit = await c.match(req);
    const net = fetch(req, page ? { cache: 'no-store' } : undefined).then((r) => { if (r.ok) c.put(req, r.clone()); return r; }).catch(() => hit);
    return page ? net.then((r) => r || hit) : hit || net;
  }));
});
