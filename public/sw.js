// Офлайн-кеш. Сторінка гри (HTML) спершу з мережі, щоб після оновлення сайту одразу бралась нова збірка; файли збірки
// (з хешем у назві) лише з кешу, мережа тільки при промаху; решта (іконки) з кешу з оновленням у фоні.
// У кеші під одним ключем (SHELL, без ?room=) лежить лише сторінка, усі файли якої вже збережені: реліз приймається цілком
// (adopt) і лише тоді прибираються старі файли, тому обрив посеред завантаження лишає робочою попередню версію. Чужа
// відповідь (портал Wi-Fi, 5xx) кеш не чіпає. Перше прийняття йде вже в install: офлайн працює після першого візиту.
const CACHE = 'loko-rikoshet-v6';
const SHELL = new URL('./', location.href).href;
const OURS = /id=["']?gl["']?/;                                    // канва гри в index.html: без неї це не наша сторінка
const LOGO = new URL('loko-logo.svg', SHELL).href;                 // на неї посилається лише код, а не HTML
const isAsset = (url) => /\/assets\//.test(new URL(url).pathname);
// відповідь можна класти в кеш: портал віддає свою сторінку 200-м на будь-яку адресу, навіть на .js
const fits = (r, url) => r.ok && !r.redirected && (/(\.html|\/)$/.test(new URL(url).pathname) || !/text\/html/i.test(r.headers.get('content-type') || ''));
const refs = (text, re, base) => Array.from(text.matchAll(re), (m) => new URL(m[1], base).href);

const pending = new Map();
/** Файл із мережі в кеш. Той самий файл одночасно просять сторінка й adopt: качаємо один раз. */
function grab(c, url) {
  let p = pending.get(url);
  if (!p) {
    p = fetch(url).then(async (r) => {
      if (fits(r, url)) await c.put(url, r.clone()).catch(() => {});
      return r;
    }).finally(() => pending.delete(url));
    pending.set(url, p);
  }
  return p.then((r) => r.clone());
}

/**
 * Прийняти збірку цієї сторінки: докачати її файли, покласти сторінку в кеш і прибрати файли інших збірок. Будь-який збій
 * обов'язкового файлу кидає виняток, і кеш лишається при попередній робочій версії (наступна навігація спробує знову).
 * Обов'язкові: файли з HTML і шрифти з CSS. Ледачі чанки (PeerJS) і картинки за можливістю, бо гра стартує і без них.
 */
async function adopt(c, r) {
  const html = await r.clone().text(), old = await c.match(SHELL);
  if (old && (await old.text()) === html) return;
  const list = refs(html, /(?:src|href)=["']\.\/([^"'?#]+)["']/g, SHELL).map((u) => ({ u, hard: isAsset(u) }));
  if (!list.some((q) => q.hard)) throw new Error('no assets');
  list.push({ u: LOGO, hard: false });
  const seen = new Set(list.map((q) => q.u));
  const add = (urls, hard) => { for (const u of urls) if (!seen.has(u)) { seen.add(u); list.push({ u, hard }); } };
  for (let i = 0; i < list.length; i++) {
    const { u, hard } = list[i];
    let f = await c.match(u);
    if (!f) {
      try { f = await grab(c, u); } catch (e) { if (hard) throw e; continue; }
      if (!fits(f, u)) { if (hard) throw new Error('bad ' + u); continue; }
    }
    if (/\.css$/.test(u)) add(refs(await f.text(), /url\(["']?\.\/([\w.-]+\.woff2)["']?\)/g, u), hard);
    else if (/\.js$/.test(u)) add(refs(await f.text(), /["'`]\.\/([\w.-]+-[\w-]{6,}\.(?:js|css))["'`]/g, u), false);
  }
  for (const q of list) if (q.hard && !(await c.match(q.u))) throw new Error('not stored ' + q.u);
  await c.put(SHELL, r);
  for (const k of await c.keys()) if (isAsset(k.url) && !seen.has(k.url)) await c.delete(k);
}

/** Сторінка гри: мережа, а якщо мережі нема чи відповідь не наша (5xx, портал) — робоча версія з кешу. */
async function shell(e, req) {
  const c = await caches.open(CACHE), hit = await c.match(SHELL);
  try {
    const r = await fetch(req, { cache: 'no-store' });
    if (!fits(r, SHELL) || !OURS.test(await r.clone().text())) return hit || r;
    e.waitUntil(adopt(c, r.clone()).catch(() => {}));
    return r;
  } catch (_) { return hit || Response.error(); }
}

/** Інші сторінки (політика, лабораторія, маніфест): мережа, запас із кешу. */
async function page(e, req, url) {
  const c = await caches.open(CACHE), hit = await c.match(url);
  try {
    const r = await fetch(req, { cache: 'no-store' });
    if (fits(r, url)) e.waitUntil(c.put(url, r.clone()).catch(() => {}));
    return r.ok ? r : hit || r;
  } catch (_) { return hit || Response.error(); }
}

async function file(e, req, url) {
  const c = await caches.open(CACHE), hit = await c.match(url);
  if (isAsset(url)) return hit || grab(c, url).catch(() => Response.error());
  const net = fetch(req).then(async (r) => { if (fits(r, url)) await c.put(url, r.clone()).catch(() => {}); return r; });
  if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
  return net.catch(() => Response.error());
}

self.addEventListener('install', (e) => {
  // збій лишає чинним попередній воркер із його кешем; браузер повторить установку під час наступного візиту
  e.waitUntil((async () => {
    const c = await caches.open(CACHE), r = await fetch(SHELL, { cache: 'no-store' });
    if (!fits(r, SHELL) || !OURS.test(await r.clone().text())) throw new Error('not the game');
    await adopt(c, r);
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const req = e.request, u = new URL(req.url);
  if (req.method !== 'GET' || u.origin !== location.origin) return;
  const url = u.origin + u.pathname;
  const res = url === SHELL || url === SHELL + 'index.html' ? shell(e, req)
    : req.mode === 'navigate' || /\.(html|webmanifest)$|\/$/.test(u.pathname) || u.pathname.endsWith('sw.js') ? page(e, req, url)
    : file(e, req, url);
  e.respondWith(res.catch(() => fetch(req)));                      // збій самого кешу (сховище недоступне) не має ламати гру: просто мережа
});
