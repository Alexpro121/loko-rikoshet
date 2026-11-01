// Мінімальний офлайн-кеш. Сторінка (HTML) — спершу з мережі, щоб після оновлення сайту одразу бралась нова збірка;
// файли збірки (з хешем у назві) — лише з кешу, мережа тільки при промаху; решта (іконки) — з кешу з оновленням у фоні.
// Нова збірка (HTML змінився) — старі файли збірки прибираємо, інакше кеш росте з кожним релізом.
const CACHE = 'loko-rikoshet-v5';
self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  const page = req.mode === 'navigate' || /\.(html|webmanifest)$|\/$/.test(new URL(req.url).pathname) || new URL(req.url).pathname.endsWith('sw.js');
  e.respondWith(caches.open(CACHE).then(async (c) => {
    const hit = await c.match(req);
    if (hit && /\/assets\//.test(new URL(req.url).pathname)) return hit;
    const net = fetch(req, page ? { cache: 'no-store' } : undefined).then(async (r) => {
      if (r.ok) {
        // до відповіді сторінці: файли нової збірки, які вона зараз запитає, під чистку не потраплять
        if (req.mode === 'navigate' && hit && (await hit.clone().text()) !== (await r.clone().text())) await Promise.all((await c.keys()).filter((k) => /\/assets\//.test(new URL(k.url).pathname)).map((k) => c.delete(k)));
        c.put(req, r.clone());
      }
      return r;
    }).catch(() => hit);
    return page ? net.then((r) => r || hit) : hit || net;
  }));
});
