// Telegram Mini App: SDK лише всередині Telegram, повний екран, поворот, кнопка «назад», вібрація, запрошення, хмарна копія збереження.
// Поза Telegram модуль нічого не вантажить і не змінює: усі функції тут безпечно викликати з будь-якого браузера.
const SDK = 'https://telegram.org/js/telegram-web-app.js?64';
const SDK_WAIT = 5000;                                          // telegram.org не відповів: гра стартує без нього
const BG = '#0b3d2a';
/** Посилання на бота для запрошень, наприклад 'https://t.me/loko_rush_bot'. Порожнє: у запрошенні звичайна адреса сайту. */
const BOT_LINK = '';

const CLOUD_KEYS = ['loko-rikoshet-save-v1', 'loko-online-v1']; // що копіюємо в хмару; порядок входить у формат meta.n
const SYNC_KEY = 'loko-tg-sync-v1';                             // локальна мітка останньої синхронізації: { at, sig }
const ROOM_KEY = 'loko-tg-room';                                // sessionStorage: запрошення вже використане, оновлення сторінки не заходить удруге
const CHUNK = 4000;                                             // ліміт значення в CloudStorage: 4096 символів
const CLOUD_WAIT = 2500;                                        // повільна хмара не тримає запуск
const SYNC_MS = 30000;

let tg = null, inactive = false, fsFailed = false, cloudLocked = false, pushing = false;

const at = (v) => tg.isVersionAtLeast(v);
const quiet = (fn) => { try { fn(); } catch (_) { /* старіша версія Telegram */ } };
const isMobile = () => /android|ios/.test(tg.platform);

export const inTelegram = () => !!tg;
/** Підписані дані запуску для входу на сервер гри; порожньо поза Telegram. */
export const tgInitData = () => (tg && typeof tg.initData === 'string' ? tg.initData : '');
/** Як document.hidden, але ще й згорнутий у Telegram застосунок: там сторінка може лишатись «видимою». */
export const appHidden = () => document.hidden || inactive;

function launchedInTelegram() {
  if (/tgWebApp/.test(location.hash + location.search)) return true;
  try { return !!sessionStorage.getItem('__telegram__initParams'); } catch (_) { return false; }   // оновлення сторінки: адреса вже без параметрів, їх пам'ятає SDK
}

/** Вантажить SDK, якщо гру відкрив Telegram. Повертає true, коли гра працює як Mini App. */
export function initTelegram() {
  if (!launchedInTelegram()) return Promise.resolve(false);
  return new Promise((res) => {
    let t = 0;
    const done = () => {
      clearTimeout(t);
      const w = window.Telegram && window.Telegram.WebApp;
      if (w && w.platform && w.platform !== 'unknown') { tg = w; setup(); }
      res(!!tg);
    };
    const s = document.createElement('script');
    s.src = SDK; s.onload = done; s.onerror = done;
    t = setTimeout(done, SDK_WAIT);
    document.head.appendChild(s);
  });
}

function setup() {
  const fire = () => dispatchEvent(new Event('resize'));
  const hide = (v) => { inactive = v; document.dispatchEvent(new Event('visibilitychange', { bubbles: true })); };
  quiet(() => tg.expand());
  quiet(() => { tg.setHeaderColor(BG); tg.setBackgroundColor(BG); });
  quiet(() => tg.setBottomBarColor(BG));
  quiet(() => tg.disableVerticalSwipes());                      // джойстик і приціл ведуть пальцем: свайп не має згортати гру
  tg.onEvent('viewportChanged', (e) => { if (!e || e.isStateStable) fire(); });
  tg.onEvent('safeAreaChanged', fire);
  tg.onEvent('contentSafeAreaChanged', fire);
  tg.onEvent('fullscreenChanged', () => { fsFailed = false; lockLandscape(); rotateHelp(); fire(); });
  tg.onEvent('fullscreenFailed', (e) => { if (e && e.error !== 'ALREADY_FULLSCREEN') { fsFailed = true; rotateHelp(); } });
  tg.onEvent('activated', () => hide(false));
  tg.onEvent('deactivated', () => hide(true));
  addEventListener('resize', lockLandscape);
  rotateHelp();
  tgEnterFullscreen();                                          // без повного екрана Telegram на iPhone не повертається в ландшафт
}

/** Показати гру замість заставки Telegram. Викликається й після помилки запуску, інакше заставка лишиться назавжди. */
export function tgReady() { if (tg) quiet(() => tg.ready()); }

// ---------------------------------------------------------------- повний екран і поворот
export const tgFullscreen = () => !!(tg && tg.isFullscreen);
export function tgEnterFullscreen() { if (tg && at('8.0') && !tg.isFullscreen) quiet(() => tg.requestFullscreen()); }
export function tgToggleFullscreen() {
  if (!tg || !at('8.0')) return;
  if (tg.isFullscreen) quiet(() => { tg.unlockOrientation(); tg.exitFullscreen(); });
  else tgEnterFullscreen();
}

/** lockOrientation фіксує поточний бік, а не ландшафт, тож викликаємо його лише коли телефон уже горизонтально. */
function lockLandscape() {
  if (!tg || !at('8.0') || !isMobile() || !tg.isFullscreen || tg.isOrientationLocked || innerWidth <= innerHeight) return;
  quiet(() => tg.lockOrientation());
}

/** Екран «поверни телефон» у Telegram: на ПК вузьке вікно не повернеш, а на старій версії застосунку поворот недоступний. */
function rotateHelp() {
  const box = document.getElementById('rotate'); if (!box) return;
  let help = box.querySelector('.rotate-help');
  if (!help) {
    help = document.createElement('div'); help.className = 'rotate-help';
    help.innerHTML = '<p></p><button type="button" data-fs>На весь екран</button><button type="button" data-web>Відкрити в браузері</button>';
    help.querySelector('[data-fs]').addEventListener('click', tgEnterFullscreen);
    help.querySelector('[data-web]').addEventListener('click', () => quiet(() => tg.openLink(location.origin + location.pathname)));
    box.appendChild(help);
  }
  const mobile = isMobile(), modern = at('8.0');
  box.querySelector(':scope > p').textContent = mobile ? 'Поверни телефон горизонтально' : 'Гра йде лише в широкому вікні';
  help.querySelector('p').textContent = !modern ? 'Онови Telegram, щоб грати тут. У браузері прогрес окремий.'
    : fsFailed ? 'Telegram тут не відкриває повний екран. У браузері прогрес окремий.'
    : mobile ? 'Не повертається? Вимкни блокування повороту в налаштуваннях телефону.' : 'Розтягни вікно Telegram у ширину або відкрий гру на весь екран.';
  help.querySelector('[data-fs]').hidden = !modern || fsFailed || tg.isFullscreen;
  help.querySelector('[data-web]').hidden = modern && !fsFailed;
}

// ---------------------------------------------------------------- вібрація
/** @returns {boolean} true, якщо вібрацію взяв на себе Telegram (navigator.vibrate на iPhone немає взагалі) */
export function tgHaptic(p) {
  if (!tg || !at('6.1')) return false;
  quiet(() => {
    if (typeof p !== 'number') tg.HapticFeedback.notificationOccurred('success');
    else tg.HapticFeedback.impactOccurred(p <= 12 ? 'light' : p <= 30 ? 'medium' : 'heavy');
  });
  return true;
}

// ---------------------------------------------------------------- запрошення в онлайн-кімнату
/** Код кімнати з посилання t.me/бот?startapp=room_КОД, один раз за сесію. */
export function tgStartRoom() {
  if (!tg) return null;
  const p = String((tg.initDataUnsafe && tg.initDataUnsafe.start_param) || ''), m = /^room_([A-Za-z0-9]{5})$/.exec(p);
  if (!m) return null;
  try { if (sessionStorage.getItem(ROOM_KEY) === p) return null; sessionStorage.setItem(ROOM_KEY, p); } catch (_) { /* ignore */ }
  return m[1];
}

/** Готове повідомлення від бота (картка виклику) у рідному вікні «Поділитися»; гра лишається відкритою. Telegram 8.0+. */
export function tgShareMessage(id) {
  if (!tg || !id || !at('8.0') || typeof tg.shareMessage !== 'function') return false;
  try { tg.shareMessage(id); return true; } catch (_) { return false; }
}

/** Вікно вибору чату Telegram із запрошенням. @returns {boolean} false поза Telegram */
export function tgShareRoom(code, webUrl, text) {
  if (!tg) return false;
  const url = BOT_LINK ? BOT_LINK + '?startapp=room_' + code : webUrl;
  quiet(() => tg.openTelegramLink('https://t.me/share/url?url=' + encodeURIComponent(url) + '&text=' + encodeURIComponent(text)));
  return true;
}

// ---------------------------------------------------------------- кнопка «назад» і підтвердження виходу
/** Кнопка «назад» Telegram закриває верхнє вікно або ставить паузу; посеред матчу закриття гри питає підтвердження. */
export function bindTelegram(ui, game, flush) {
  if (!tg) return;
  ui.root.classList.toggle('tg-full', isMobile() && at('8.0'));  // на телефоні гра завжди на весь екран: вихід із нього лишив би лише портрет
  let back = false, guard = false;
  if (at('6.1')) tg.BackButton.onClick(() => ui.goBack());
  setInterval(() => {
    const b = at('6.1') && ui.canGoBack();
    if (b !== back) { back = b; quiet(() => (b ? tg.BackButton.show() : tg.BackButton.hide())); }
    const n = game.sm.name, g = n === 'MATCH' || n === 'GOAL';
    if (g !== guard) { guard = g; quiet(() => (g ? tg.enableClosingConfirmation() : tg.disableClosingConfirmation())); }
  }, 250);
  const sync = () => { flush(); pushCloud(); };
  setInterval(sync, SYNC_MS);
  document.addEventListener('visibilitychange', () => { if (appHidden()) sync(); });
}

// ---------------------------------------------------------------- хмарна копія збереження
// localStorage вебв'ю Telegram очищає разом із кешем, а на іншому пристрої його немає. Копія лежить у CloudStorage бота: шматки
// значень у двох змінних наборах (a, b) і запис meta, який пишеться останнім і каже, який набір чинний. Обрив посеред запису
// лишає чинним попередній набір. Новіша копія з іншого пристрою перемагає: перезаписати її цей пристрій не може.
const cloud = (m, ...a) => new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('timeout')), CLOUD_WAIT);
  tg.CloudStorage[m](...a, (e, v) => { clearTimeout(t); if (e) rej(e); else res(v); });
});
const cloudOk = () => !!tg && at('6.9') && !!tg.CloudStorage;
const readMeta = async () => { const m = JSON.parse((await cloud('getItem', 'meta')) || 'null'); return m && Array.isArray(m.n) && m.n.length === CLOUD_KEYS.length ? m : null; };
const localRaws = () => CLOUD_KEYS.map((k) => localStorage.getItem(k));
const readSync = () => { try { const o = JSON.parse(localStorage.getItem(SYNC_KEY)); return { at: +o.at || 0, sig: String(o.sig) }; } catch (_) { return { at: 0, sig: '' }; } };
const writeSync = (a, sig) => localStorage.setItem(SYNC_KEY, JSON.stringify({ at: a, sig }));

/** Відбиток значень (FNV-1a): чи змінилось щось від останньої синхронізації. null і порожній рядок різні. */
function sigOf(raws) {
  let h = 0x811c9dc5;
  for (const r of raws) {
    const s = r === null ? '\u0002' : r + '\u0001';
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  }
  return (h >>> 0).toString(36);
}

/** Ділить рядок на шматки, не розриваючи пару сурогатів (емодзі в назві клубу): половинка символу не переживе JSON. */
export function splitChunks(s, n = CHUNK) {
  const out = [];
  for (let i = 0; i < s.length;) {
    let e = Math.min(i + n, s.length);
    if (e < s.length) { const c = s.charCodeAt(e - 1); if (c >= 0xd800 && c <= 0xdbff) e--; }
    out.push(s.slice(i, e)); i = e;
  }
  return out;
}

/**
 * Перед стартом гри: якщо хмарна копія новіша, кладе її в localStorage. S і OP уже прочитані з localStorage під час імпорту,
 * тому після true викликач має зупинити запис (holdSave) і перезавантажити сторінку.
 */
export async function pullCloud() {
  if (!cloudOk()) return false;
  try {
    const meta = await readMeta();
    if (!meta) return false;
    const mine = readSync(), sg = sigOf(localRaws());
    if (meta.sig === sg) { writeSync(meta.at, sg); return false; }
    if (!(meta.at > mine.at)) return false;                     // хмара не новіша: наступний pushCloud запише наше
    const keys = [];
    meta.n.forEach((n, k) => { for (let i = 0; i < n; i++) keys.push(`${meta.slot}_${k}_${i}`); });
    const vals = keys.length ? await cloud('getItems', keys) : {};
    const raws = meta.n.map((n, k) => {
      if (n < 0) return null;
      let s = ''; for (let i = 0; i < n; i++) s += vals[`${meta.slot}_${k}_${i}`] || '';
      JSON.parse(s);                                            // битий запис кидає виняток: лишаємо локальне
      return s;
    });
    if (sigOf(raws) !== meta.sig) return false;
    raws.forEach((r, k) => { if (r !== null) localStorage.setItem(CLOUD_KEYS[k], r); });
    writeSync(meta.at, sigOf(localRaws()));
    return true;
  } catch (_) { return false; }
}

/** Записує локальні дані в хмару, якщо вони змінились. Новішу копію з іншого пристрою не чіпає до наступного запуску. */
export async function pushCloud() {
  if (!cloudOk() || pushing || cloudLocked) return;
  pushing = true;
  try {
    const raws = localRaws(), sg = sigOf(raws), mine = readSync();
    if (sg === mine.sig) return;
    const cur = await readMeta();
    if (cur && cur.at > mine.at) { cloudLocked = true; return; }
    const slot = cur && cur.slot === 'a' ? 'b' : 'a', a = Math.max(Date.now(), cur ? cur.at + 1 : 0), jobs = [];
    const n = raws.map((r, k) => {
      if (r === null) return -1;
      const parts = splitChunks(r);
      parts.forEach((p, i) => jobs.push(cloud('setItem', `${slot}_${k}_${i}`, p)));
      return parts.length;
    });
    await Promise.all(jobs);
    await cloud('setItem', 'meta', JSON.stringify({ at: a, slot, sig: sg, n }));
    writeSync(a, sg);
  } catch (_) { /* спробуємо наступного разу */ } finally { pushing = false; }
}
