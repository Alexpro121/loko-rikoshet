// Банк семплів: справжні записи з src/audio (джерела й ліцензії в src/audio/SOURCES.md). Вантажаться у фоні після першого
// дотику, гра їх не чекає: поки слота немає, AudioEngine грає запасний синтез. Назва файлу: <слот>_<варіант><дубль>.mp3.
// Короткі звуки лежать у пам'яті всі. Петлі натовпу довгі (хвилина стерео це 23 МБ), а WebView у Telegram тісний, тож у пам'яті лише ті, що грають зараз, плюс наступна.
const URLS = import.meta.env ? import.meta.glob('../audio/*.mp3', { eager: true, query: '?url', import: 'default' }) : {};

/**
 * Точний період петель у секундах. Файл довший на MARGIN з кожного боку: пауза кодера лише зсуває все, шва немає.
 * Скандування не кратне 16 с: Stands.chantEnv вмикає його саме з цим періодом, і кратна петля щоразу давала б той самий шматок.
 */
export const LOOP_LEN = { 'crowd-bed': 24, 'crowd-tense': 14, 'crowd-chant': 13 };
export const MARGIN = 0.3;
/** Скільки варіантів петлі декодувати одразу. Решту Bank приносить по одному, коли AudioEngine міняє поєднання. */
const KEEP = { 'crowd-bed': 2, 'crowd-tense': 1, 'crowd-chant': 1 };
/** Спершу те, що чути найчастіше. Важкі петлі йдуть після коротких: удар має з'явитись якомога раніше. */
const ORDER = ['kick', 'touch', 'whistle-short', 'whistle-long', 'glove', 'post', 'net', 'bounce', 'crowd-bed', 'crowd-goal', 'crowd-ooh', 'crowd-groan', 'crowd-tense', 'crowd-chant', 'crowd-clap'];

/** Розкласти { шлях: url } на { слот: [url] }. */
export function groupUrls(map) {
  const out = {};
  for (const path of Object.keys(map)) {
    const m = /([\w-]+)_[a-z]\d+\.mp3$/.exec(path);
    if (m) (out[m[1]] = out[m[1]] || []).push(map[path]);
  }
  for (const k of Object.keys(out)) out[k].sort();
  return out;
}

export class Bank {
  constructor(urls = groupUrls(URLS)) {
    this.urls = urls;
    this.ctx = null;
    this.buf = {};                                     // слот → [AudioBuffer] у пам'яті
    this.last = {};                                    // слот → останній дубль, щоб не повторювати двічі поспіль
    this.next = {};                                    // петля → номер наступного файлу
    this.fresh = {};                                   // петля → уже декодований наступний варіант
    this.busy = {};
    this.onLoad = null;                                // кличеться, коли з'явився новий запис слота
    this.started = false;
    this.mono = false;                                 // телефон: записи в моно вдвічі легші, а динамік і так один
    this.all = false;                                  // сторінка прослуховування: усе в пам'яті, нічого не дозавантажуємо
  }

  has(slot) { const b = this.buf[slot]; return !!b && b.length > 0; }
  count(slot) { const b = this.buf[slot]; return b ? b.length : 0; }

  /** Послідовно, по одному файлу: на слабкому телефоні декодування не змагається з кадром. Збій файлу лишає синтез. */
  async load(ctx, rnd) {
    if (this.started) return; this.started = true;
    this.ctx = ctx;
    const slots = Object.keys(this.urls).sort((a, b) => rank(a) - rank(b));
    for (const slot of slots) {
      const urls = this.urls[slot], keep = KEEP[slot] || urls.length;
      if (KEEP[slot]) this.next[slot] = Math.floor(rnd() * urls.length) % urls.length;
      for (let i = 0; i < keep && i < urls.length; i++) {
        const url = KEEP[slot] ? urls[this.next[slot]++ % urls.length] : urls[i];
        const buf = await this.fetchBuf(url, slot);
        if (!buf) continue;
        (this.buf[slot] = this.buf[slot] || []).push(buf);
        if (this.onLoad) this.onLoad(slot);
      }
    }
    this.prepare('crowd-bed');
  }

  /** Усе в пам'ять одразу: для сторінки прослуховування й рендеру сцен. */
  async loadAll(ctx, onStep) {
    this.ctx = ctx; this.all = this.started = true;
    const slots = Object.keys(this.urls); let total = 0, done = 0;
    for (const s of slots) total += this.urls[s].length;
    await Promise.all(slots.map(async (slot) => {
      this.buf[slot] = (await Promise.all(this.urls[slot].map(async (u) => { const b = await this.fetchBuf(u, slot); done++; onStep(done, total); return b; }))).filter(Boolean);
    }));
  }

  async fetchBuf(url, slot) {
    try {
      const r = await fetch(url);
      if (!r.ok) return null;
      let buf = await decode(this.ctx, await r.arrayBuffer());
      if (this.mono && buf.numberOfChannels > 1) buf = toMono(this.ctx, buf);
      return sealLoop(buf, slot);
    } catch (_) { return null; }                       // лишаємось на тому, що вже є
  }

  /** Заздалегідь декодувати наступний варіант петлі, щоб зміна поєднання не чекала мережі. */
  async prepare(slot) {
    const urls = this.urls[slot];
    if (this.all || this.fresh[slot] || this.busy[slot] || !this.ctx || !urls || urls.length <= this.count(slot)) return;
    this.busy[slot] = true;
    const buf = await this.fetchBuf(urls[this.next[slot]++ % urls.length], slot);
    this.busy[slot] = false;
    if (buf) this.fresh[slot] = buf;
  }

  /** Новий варіант для плавної зміни. old іде з пам'яті. null: наступний ще не готовий, спробуємо пізніше. */
  take(slot, old, rnd) {
    if (this.all) return this.pick(slot, rnd);
    const buf = this.fresh[slot];
    if (!buf) { this.prepare(slot); return null; }
    this.fresh[slot] = null;
    const b = this.buf[slot], i = b.indexOf(old);
    if (i >= 0) b[i] = buf; else b.push(buf);
    this.prepare(slot);
    return buf;
  }

  /** Замінити єдиний варіант петлі, поки вона мовчить: у пам'яті ніколи не два. */
  async swap(slot, rnd) {
    const urls = this.urls[slot];
    if (this.all) return this.pick(slot, rnd);
    if (this.busy[slot] || !this.ctx || !urls || urls.length < 2 || this.next[slot] === undefined) return null;   // load до цього слота ще не дійшов
    this.busy[slot] = true;
    const buf = await this.fetchBuf(urls[this.next[slot]++ % urls.length], slot);
    this.busy[slot] = false;
    if (buf) this.buf[slot] = [buf];
    return buf;
  }

  /** Дубль слота; rnd — генератор двигуна, а не гри. Двічі поспіль той самий не випадає, тож другий шар завжди інший запис. */
  pick(slot, rnd) {
    const b = this.buf[slot];
    if (!b || !b.length) return null;
    let i = Math.floor(rnd() * b.length) % b.length;
    if (b.length > 1 && i === this.last[slot]) i = (i + 1) % b.length;
    this.last[slot] = i;
    return b[i];
  }
}

/**
 * Зашити стик петлі. MP3 псує точну періодичність, тож перед кінцем петлі плавно переходимо на те, що стоїть перед її початком:
 * після стрибка з loopEnd на loopStart хвиля неперервна. Поля MARGIN дають місце.
 */
export function sealLoop(buf, slot) {
  const L = LOOP_LEN[slot];
  if (!L) return buf;
  const sr = buf.sampleRate, s = Math.round(MARGIN * sr), e = Math.round((MARGIN + L) * sr), N = Math.round(0.03 * sr);
  if (e > buf.length || s < N) return buf;
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < N; i++) { const w = (i + 1) / N; d[e - N + i] = d[e - N + i] * (1 - w) + d[s - N + i] * w; }
  }
  return buf;
}

function toMono(ctx, buf) {
  const out = ctx.createBuffer(1, buf.length, buf.sampleRate), d = out.getChannelData(0), a = buf.getChannelData(0), b = buf.getChannelData(1);
  for (let i = 0; i < d.length; i++) d[i] = (a[i] + b[i]) * 0.5;
  return out;
}
const rank = (slot) => { const i = ORDER.indexOf(slot); return i < 0 ? 99 : i; };
/** Старий Safari не вміє Promise-форму decodeAudioData. */
function decode(ctx, data) { return new Promise((ok, no) => { const p = ctx.decodeAudioData(data, ok, no); if (p && p.catch) p.catch(no); }); }
