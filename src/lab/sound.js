// Сторінка прослуховування (sound.html): кнопка на кожен звук, старий/новий, сцена «хвилина матчу» й заміри через
// OfflineAudioContext. Не вкладка з грою: вона не чіпає Match і збереження. window.soundLab — для вимірів із консолі.
import '@fontsource/rubik/cyrillic-600.css';
import '@fontsource/rubik/cyrillic-800.css';
import '@fontsource/rubik/latin-600.css';
import '@fontsource/rubik/latin-800.css';
import './sound.css';
import { AudioEngine } from '../core/audio.js';
import { Bank, LOOP_LEN, MARGIN } from '../core/audio-bank.js';
import { OldAudio } from './audio-old.js';

const KEY = 'loko-sound-lab-v1';
const SR = 48000;

let saved = {};
try { saved = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (_) { /* приватне вікно */ }
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify({ notes: saved.notes || '' })); } catch (_) { /* ignore */ } };

// --- на цій сторінці всі записи в пам'яті: і живий контекст, і офлайн-рендер беруть ті самі буфери ---
const decoder = new OfflineAudioContext(2, 1, SR);
const bank = new Bank();

// --- живий звук ---
let ctx = null, input = null, phone = null, vol = null;
const eng = { neu: null, old: null };
let useFallback = false, useLite = false;
function ensureCtx() {
  if (ctx) { if (ctx.state !== 'running') ctx.resume(); return; }
  ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
  input = ctx.createGain(); vol = ctx.createGain(); vol.gain.value = saved.vol === undefined ? 1 : saved.vol;
  phone = buildPhone(ctx, input, vol);
  vol.connect(ctx.destination);
  setPhone(phoneOn);
  makeEngines();
  if (ctx.state !== 'running') ctx.resume();
}
function makeEngines() {
  if (eng.neu) { eng.neu.stopLayers(); eng.neu.master.disconnect(); eng.neu.music('off'); }
  eng.neu = new AudioEngine(useFallback ? new Bank({}) : bank);
  eng.neu.attach(ctx, { dest: input, forceOn: true, lite: useLite });
  if (!eng.old) { eng.old = new OldAudio(); eng.old.attach(ctx, { dest: input }); }
}
/** Як звучить динамік телефона: знизу майже нічого, верх обрізаний, горб на середині. */
function buildPhone(c, inp, out) {
  const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 380; hp.Q.value = 0.9;
  const hp2 = c.createBiquadFilter(); hp2.type = 'highpass'; hp2.frequency.value = 280; hp2.Q.value = 0.7;
  const mid = c.createBiquadFilter(); mid.type = 'peaking'; mid.frequency.value = 1600; mid.Q.value = 0.7; mid.gain.value = 5;
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 9000;
  hp.connect(hp2); hp2.connect(mid); mid.connect(lp);
  return { first: hp, last: lp, inp, out };
}
let phoneOn = false;
function setPhone(on) {
  phoneOn = on;
  if (!ctx) return;
  input.disconnect(); phone.last.disconnect();
  if (on) { input.connect(phone.first); phone.last.connect(vol); } else input.connect(vol);
}

// --- опис звуків ---
const SOUNDS = [
  { g: "М'яч", id: 'kick', t: 'Удар', hint: 'Слухай повзунок: слабкий удар має бути темнішим і нижчим, а не просто тихішим. На телефоні має лишатись тіло.', slider: ['Сила', 0.1, 1, 0.8], run: (e, v) => e.kick(v) },
  { g: "М'яч", id: 'pass', t: 'Дотик, прийом, відбір', hint: 'Був «буп» на 520–780 Гц. Тепер дотик ногою, має бути майже непомітним.', run: (e) => e.pass() },
  { g: "М'яч", id: 'wall', t: 'Рикошет від борту', hint: 'Повзунок це номер рикошету: висота тону росте й підказує ланцюг, але без чіптюну.', slider: ['Рикошет', 0, 9, 2, 1], run: (e, v) => e.wall(v, 24) },
  { g: "М'яч", id: 'post', t: 'Стовп', hint: 'Новий окремий звук (раніше це був борт). Метал має дзвеніти, але не різати. Повзунок це сила.', slider: ['Сила', 6, 30, 18], run: (e, v) => e.post(v) },
  { g: "М'яч", id: 'net', t: "М'яч у сітці", hint: 'Новий звук. Тонкий запис шурхоту плюс прогин сітки. Найслабше місце: лише один запис під CC0.', run: (e) => e.net(1) },
  { g: "М'яч", id: 'save', t: 'Сейв, рукавиці', hint: 'Запис бейсбольної рукавиці, футбольного не знайшов. Скажи, чи не чути бейсбол.', run: (e) => e.save() },
  { g: "М'яч", id: 'thud', t: 'Глухий контакт (голова, відбір)', run: (e) => e.thud() },
  { g: 'Гравці', id: 'slide', t: 'Підкат по траві', run: (e) => e.slide() },
  { g: 'Гравці', id: 'clap', t: '«П\'ять» (долоні)', run: (e) => e.clap() },
  { g: 'Суддя', id: 'whistleS', t: 'Свисток короткий', hint: 'Найрізкіше місце старої гри. Новий тихіший і лунає здалеку. Перевір на повній гучності.', run: (e) => e.whistle(false) },
  { g: 'Суддя', id: 'whistleL', t: 'Свисток довгий', run: (e) => e.whistle(true) },
  { g: 'Натовп', id: 'goal', t: 'Гол своїх', hint: 'Сітка й рев. Має читатись як радість трибун навіть із заплющеними очима.', run: (e) => { e.crowd(0.7); e.goal(); } },
  { g: 'Натовп', id: 'concede', t: 'Пропущений гол', hint: 'Гість онлайн чує це, коли господар забиває. Зітхання домашніх і далекий сектор гостей.', run: (e) => { e.crowd(0.7); e.concede(); } },
  { g: 'Натовп', id: 'ooh', t: '«Ох» на небезпечний момент', hint: 'Лунає на штангу, сильний сейв і удар повз ворота.', run: (e) => { e.crowd(0.7); e.lastAt.ooh = undefined; e.crowdReact('gasp'); } },
  { g: 'Натовп', id: 'groan', t: 'Розчарування', run: (e) => { e.crowd(0.7); e.lastAt.groan = undefined; e.crowdReact('groan'); } },
  { g: 'Натовп', id: 'clapA', t: 'Оплески', hint: 'Запис CC-BY, потрібен автор у подяках. Якщо не вартий цього, приберу.', run: (e) => { e.crowd(0.7); e.lastAt.applause = undefined; e.crowdReact('clap'); } },
  { g: 'Кінець матчу', id: 'win', t: 'Перемога', hint: 'Стадіон замість іграшкової мелодії. У матчі перед цим лунає довгий свисток.', run: (e) => { e.whistle(true); e.win(); } },
  { g: 'Кінець матчу', id: 'lose', t: 'Поразка', run: (e) => { e.whistle(true); e.lose(); } },
  { g: 'Інтерфейс', id: 'click', t: 'Кнопка', run: (e) => e.click() },
  { g: 'Інтерфейс', id: 'back', t: 'Назад', run: (e) => e.back() },
  { g: 'Інтерфейс', id: 'coin', t: 'Монети, ланцюг', hint: 'Повзунок це довжина ланцюга: висота росте, але вже без square.', slider: ['Ланцюг', 0, 12, 3, 1], run: (e, v) => e.coin(v) },
  { g: 'Інтерфейс', id: 'buy', t: 'Покупка', run: (e) => e.buy() },
  { g: 'Інтерфейс', id: 'deny', t: 'Відмова', run: (e) => e.deny() },
  { g: 'Інтерфейс', id: 'bell', t: 'Дзвінок', run: (e) => e.bell() },
  { g: 'Кіно', id: 'horn', t: 'Гудок поїзда', hint: 'Вступ, онлайн-лобі, новий ярус.', run: (e) => e.horn() },
  { g: 'Кіно', id: 'rumble', t: 'Гул поїзда', run: (e) => e.rumble() },
  { g: 'Кіно', id: 'slowOn', t: 'Сповільнення: вхід', hint: 'Звучить при кожному володінні м\'ячем, тож має бути майже непомітним. Послухай разом із гулом натовпу.', run: (e) => { e.crowd(0.7); e.slowmo(true); } },
  { g: 'Кіно', id: 'slowOff', t: 'Сповільнення: вихід', run: (e) => e.slowmo(false) },
  { g: 'Кіно', id: 'beat', t: 'Серце в прицілі', hint: 'Повзунок це небезпека. Звучить безперервно, поки цілишся: не має набридати.', slider: ['Небезпека', 0, 1, 0.5], run: (e, v) => e.beat(v) },
];

/** Сцена «хвилина матчу»: справжній порядок подій гри. [секунда, виклик, підпис]. */
const SCENE = [
  [0, (e) => e.crowd(0.7), 'Гул трибун'],
  [2, (e) => e.whistle(true), 'Стартовий свисток'],
  [2.8, (e) => e.kick(0.4), 'Пас'], [3.9, (e) => e.pass(), 'Прийом'], [4.6, (e) => e.kick(0.45), 'Пас'], [5.7, (e) => e.pass(), 'Прийом'],
  [6.3, (e) => e.slowmo(true), 'Твоє володіння: сповільнення'], [6.9, (e) => e.beat(0.3), ''], [7.9, (e) => e.beat(0.3), ''],
  [8.8, (e) => { e.slowmo(false); e.kick(0.5); }, 'Пас на хід'], [10, (e) => e.pass(), 'Прийом'], [10.8, (e) => e.wall(0, 16), 'Удар у борт'], [11.6, (e) => e.pass(), ''],
  [12.4, (e) => setT(e, 0.3), ''], [13.3, (e) => e.kick(0.55), 'Прострил'], [14.2, (e) => e.thud(), 'Відбір'], [14.5, (e) => e.slide(), 'Підкат'],
  [16, (e) => e.kick(0.45), 'Суперник вибиває'], [17.2, (e) => e.wall(1, 26), 'Рикошет'], [17.9, (e) => e.wall(2, 22), 'Рикошет'], [19, (e) => e.pass(), ''],
  [20, (e) => setT(e, 0.75), 'Біля воріт: напруга зростає'], [21, (e) => e.slowmo(true), 'Приціл'], [21.6, (e) => e.beat(0.7), ''], [22.4, (e) => e.beat(0.7), ''],
  [23.2, (e) => { e.slowmo(false); e.kick(1); }, 'Сильний удар'], [23.55, (e) => { e.save(); e.crowdReact('gasp'); }, 'Сейв і «ох»'], [25.2, (e) => setT(e, 0.4), ''],
  [26.2, (e) => e.kick(0.9), 'Добивання'], [26.5, (e) => { e.post(20); e.crowdReact('gasp'); }, 'Стовп'], [28.5, (e) => e.pass(), ''],
  [26, (e) => { if (e.rotateBed) e.rotateBed(); }, ''],
  [30, (e) => { setT(e, 0.15); if (e.chant) { e.chant(1); e.syncCrowd(1.1); } }, 'Гра біля центру, трибуни співають'], [31, (e) => e.kick(0.4), 'Пас'], [32.1, (e) => e.pass(), ''], [33.2, (e) => e.kick(0.45), 'Пас'], [34.2, (e) => e.pass(), ''],
  [35, (e) => { setT(e, 0.8); if (e.chant) { e.chant(0); e.syncCrowd(1.1); } }, 'Вихід сам на сам'], [36, (e) => e.kick(1), 'Удар'], [36.35, (e) => e.goal(), 'ГОЛ'],
  [42, (e) => e.crowd(0.8), ''], [44, (e) => { setT(e, 0.1); e.whistle(true); }, 'Розіграш після гола'], [45, (e) => e.kick(0.4), 'Пас'],
  [46.2, (e) => e.pass(), ''], [47.5, (e) => e.kick(0.55), 'Суперник іде вперед'], [48.6, (e) => setT(e, 0.7), 'Небезпека біля наших воріт'], [49.6, (e) => e.kick(0.95), 'Удар суперника'],
  [49.95, (e) => e.concede(), 'Пропустили'], [55, (e) => { setT(e, 0.1); e.crowd(0.7); }, ''], [56, (e) => e.kick(0.4), 'Пас'], [57, (e) => e.pass(), ''],
  [58.5, (e) => { e.whistle(true); e.crowd(0.35); }, 'Фінальний свисток'], [58.8, (e) => e.win(), 'Трибуни'],
];
const setT = (e, x) => { if (e instanceof AudioEngine) { e.tension = x; e.syncCrowd(1.1); } };
const SCENE_LEN = 66;

// --- живі дії ---
let lastEng = null;
function trigger(which, s, v) {
  ensureCtx();
  const e = eng[which];
  if (which === 'neu') { e.lastAt = {}; }
  s.run(e, v);
  lastEng = e;
}
let sceneT = [];
function stopAll() {
  sceneT.forEach(clearTimeout); sceneT = [];
  if (!ctx) return;
  eng.neu.crowd(0); eng.old.crowd(0); eng.neu.music('off'); stopOldMusic();
  document.querySelectorAll('.playing').forEach((b) => b.classList.remove('playing'));
  el('#sceneNow').textContent = '';
}
function playScene(which, btn) {
  stopAll(); ensureCtx();
  const e = eng[which];
  btn.classList.add('playing');
  for (const [t, fn, label] of SCENE) sceneT.push(setTimeout(() => { fn(e); if (label) el('#sceneNow').textContent = `${t.toFixed(0)} с · ${label}`; }, t * 1000));
  sceneT.push(setTimeout(() => { e.crowd(0); btn.classList.remove('playing'); el('#sceneNow').textContent = ''; }, SCENE_LEN * 1000));
}
let oldMusicTimer = 0;
function stopOldMusic() { clearInterval(oldMusicTimer); oldMusicTimer = 0; }
function playOldMusic(mode) {
  stopAll(); ensureCtx();
  let next = 0;
  oldMusicTimer = setInterval(() => { if (next < ctx.currentTime + 1) { const w = Math.max(0, next - ctx.currentTime); eng.old.renderMusic(mode, 1, w); next = ctx.currentTime + w + 1; } }, 200);
}

// --- заміри ---
const FFT_N = 8192;
function fft(re, im) { const n = re.length; for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } } for (let l = 2; l <= n; l <<= 1) { const a = -2 * Math.PI / l; for (let i = 0; i < n; i += l) for (let k = 0; k < l / 2; k++) { const c = Math.cos(a * k), s = Math.sin(a * k), u = i + k, v = i + k + l / 2, tr = re[v] * c - im[v] * s, ti = re[v] * s + im[v] * c; re[v] = re[u] - tr; im[v] = im[u] - ti; re[u] += tr; im[u] += ti; } } }
/** Пік, RMS і енергія в смугах (дБ відносно повної шкали, усереднення за час самого звуку). */
function analyse(buf) {
  const a = buf.getChannelData(0), b = buf.numberOfChannels > 1 ? buf.getChannelData(1) : a, n = a.length;
  let pk = 0, clip = 0, s = 0, active = 0;
  const mono = new Float32Array(n);
  for (let i = 0; i < n; i++) { const v = (a[i] + b[i]) * 0.5; mono[i] = v; const m = Math.max(Math.abs(a[i]), Math.abs(b[i])); if (m > pk) pk = m; if (m >= 0.999) clip++; s += v * v; if (m > 0.003) active++; }
  const band = (lo, hi) => { let e = 0, w = 0; const re = new Float64Array(FFT_N), im = new Float64Array(FFT_N); for (let i = 0; i + FFT_N <= n || (i === 0 && n > 0); i += FFT_N) { re.fill(0); im.fill(0); for (let k = 0; k < FFT_N && i + k < n; k++) re[k] = mono[i + k] * (0.5 - 0.5 * Math.cos(2 * Math.PI * k / FFT_N)); fft(re, im); for (let k = 1; k < FFT_N / 2; k++) { const f = k * SR / FFT_N; if (f >= lo && f < hi) e += (re[k] * re[k] + im[k] * im[k]); } w++; } return 10 * Math.log10((e / Math.max(1, w)) / (FFT_N * FFT_N) * 8 + 1e-12); };
  const dB = (x) => (x > 1e-9 ? 20 * Math.log10(x) : -120);
  return { peak: +dB(pk).toFixed(1), rms: +(10 * Math.log10(s / Math.max(1, active) + 1e-12)).toFixed(1), clip, harsh: +band(2000, 5000).toFixed(1), phone: +band(150, 400).toFixed(1), sub: +band(30, 120).toFixed(1) };
}
async function render(which, fn, dur) {
  const c = new OfflineAudioContext(2, Math.ceil(dur * SR), SR);
  let e;
  if (which === 'neu') { e = new AudioEngine(bank); e.attach(c, { offline: true, lite: useLite }); e.seed = 12345; } else { e = new OldAudio(); e.attach(c, {}); }
  fn(e, c);
  return c.startRendering();
}
const at = (e, t, fn) => { e.tOff = t; fn(e); };
const TESTS = [
  ['kick 0.3', (e) => e.kick(0.3), 1], ['kick 1.0', (e) => e.kick(1), 1], ['pass', (e) => e.pass(), 0.6], ['wall n=2', (e) => e.wall(2, 24), 0.8], ['post', (e) => e.post(20), 1.2], ['net', (e) => e.net(1), 1.2], ['save', (e) => e.save(), 0.8], ['thud', (e) => e.thud(), 0.6], ['slide', (e) => e.slide(), 0.7], ['clap', (e) => e.clap(), 0.5],
  ['whistle short', (e) => e.whistle(false), 1.6], ['whistle long', (e) => e.whistle(true), 2.2], ['horn', (e) => e.horn(), 2], ['rumble', (e) => e.rumble(), 2.5],
  ['coin 3', (e) => e.coin(3), 0.6], ['click', (e) => e.click(), 0.2], ['back', (e) => e.back(), 0.2], ['buy', (e) => e.buy(), 0.7], ['deny', (e) => e.deny(), 0.4], ['bell', (e) => e.bell(), 0.8], ['beat 0.7', (e) => e.beat(0.7), 0.6], ['slowmo on', (e) => e.slowmo(true), 0.7], ['slowmo off', (e) => e.slowmo(false), 0.5],
  ['win', (e) => e.win(), 4], ['lose', (e) => e.lose(), 4], ['goal (без гулу)', (e) => e.goal(), 6], ['concede (без гулу)', (e) => e.concede(), 6],
  ['натовп: гул 0.7', (e) => { e.crowd(0.7); }, 8], ['натовп: напруга', (e) => { e.crowd(0.7); if (e instanceof AudioEngine) { e.tension = 1; e.syncCrowd(0.01); } }, 8],
  ['збіг: гол+гул+свисток', (e) => { e.crowd(0.8); at(e, 1, (x) => { x.goal(); x.whistle(true); x.kick(1); }); }, 6],
  ['збіг: удар+стовп+ох+свисток', (e) => { e.crowd(0.8); at(e, 1, (x) => { x.kick(1); x.post(28); x.crowdReact('gasp'); x.whistle(false); }); }, 4],
  ['музика меню', (e, c) => { if (e instanceof AudioEngine) { for (let i = 0; i < 6; i++) e.playBar(i * 3.44); } else e.renderMusic('menu', 20); }, 20],
];
async function measure(onRow) {
  const rows = [];
  for (const [name, fn, dur] of TESTS) {
    const o = analyse(await render('old', fn, dur)), n = analyse(await render('neu', fn, dur));
    const r = { name, old: o, neu: n }; rows.push(r); if (onRow) onRow(r);
  }
  return rows;
}
/** Сцена цілком: час, пік і чи не вилазить із майстра. */
async function measureScene(which) {
  const buf = await render(which, (e) => { for (const [t, fn] of SCENE) at(e, t, fn); }, SCENE_LEN);
  const a = analyse(buf);
  // стрибки рівня: RMS у вікнах 0.5 с
  const d = buf.getChannelData(0), W = SR / 2 | 0, out = [];
  for (let i = 0; i + W <= d.length; i += W) { let s = 0; for (let k = 0; k < W; k++) s += d[i + k] * d[i + k]; out.push(+(10 * Math.log10(s / W + 1e-12)).toFixed(0)); }
  return { ...a, env: out };
}
/** Чи є шов у петлі: різниця сусідніх відліків на стику проти типової. */
function loopSeam(slot) {
  const res = [];
  for (const buf of bank.buf[slot] || []) {
    const d = buf.getChannelData(0), s = Math.round(MARGIN * buf.sampleRate), e = Math.round((MARGIN + LOOP_LEN[slot]) * buf.sampleRate);
    let dif = 0, ref = 0; const n = 64;                 // останні відліки перед стрибком мають збігатися з тими, що перед початком петлі
    for (let i = 1; i <= n; i++) { dif += (d[s - i] - d[e - i]) ** 2; ref += d[s - i] ** 2; }
    res.push(+(10 * Math.log10(dif / (ref + 1e-12) + 1e-12)).toFixed(1));
  }
  return res;
}

// --- сторінка ---
const el = (q) => document.querySelector(q);
const h = (tag, cls, txt) => { const n = document.createElement(tag); if (cls) n.className = cls; if (txt !== undefined) n.textContent = txt; return n; };
function row(s) {
  const r = h('div', 'snd-row');
  const head = h('div', 'snd-head'); head.append(h('b', '', s.t));
  if (s.hint) head.append(h('span', 'hint', s.hint));
  r.append(head);
  const ctl = h('div', 'snd-ctl');
  const val = () => (s.slider ? +rng.value : undefined);
  let rng = null;
  const b0 = h('button', 'old', 'Старий'), b1 = h('button', 'neu', 'Новий');
  b0.onclick = () => trigger('old', s, val()); b1.onclick = () => trigger('neu', s, val());
  ctl.append(b0, b1);
  if (s.slider) {
    const [name, lo, hi, def, step] = s.slider;
    rng = h('input'); rng.type = 'range'; rng.min = lo; rng.max = hi; rng.step = step || (hi - lo) / 40; rng.value = def;
    const out = h('span', 'val', String(def));
    rng.oninput = () => { out.textContent = (+rng.value).toFixed(step ? 0 : 2); };
    rng.onchange = () => b1.click();
    const wrap = h('label', 'slider'); wrap.append(h('span', '', name), rng, out); ctl.append(wrap);
  }
  r.append(ctl);
  return r;
}
function build() {
  const root = el('#snd');
  root.innerHTML = '';
  const top = h('header', 'top');
  top.append(h('h1', '', 'Звук LOKO'), h('p', 'sub', 'Усі записи в грі, кожне натискання збирає звук по-новому з різних дублів.'));
  const bar = h('div', 'bar');
  const pb = h('button', 'toggle', 'Динамік телефона: вимк');
  pb.onclick = () => { ensureCtx(); setPhone(!phoneOn); pb.textContent = 'Динамік телефона: ' + (phoneOn ? 'увімк' : 'вимк'); pb.classList.toggle('on', phoneOn); };
  const fb = h('button', 'toggle', 'Без записів (запасний синтез): вимк');
  fb.onclick = () => { useFallback = !useFallback; ensureCtx(); makeEngines(); fb.textContent = 'Без записів (запасний синтез): ' + (useFallback ? 'увімк' : 'вимк'); fb.classList.toggle('on', useFallback); };
  const lb = h('button', 'toggle', 'Слабкий телефон (простір на затримках): вимк');
  lb.onclick = () => { useLite = !useLite; ensureCtx(); makeEngines(); lb.textContent = 'Слабкий телефон (простір на затримках): ' + (useLite ? 'увімк' : 'вимк'); lb.classList.toggle('on', useLite); };
  const stop = h('button', 'stop', 'Стоп усе'); stop.onclick = stopAll;
  const v = h('input'); v.type = 'range'; v.min = 0; v.max = 1.5; v.step = 0.01; v.value = saved.vol === undefined ? 1 : saved.vol;
  v.oninput = () => { ensureCtx(); vol.gain.value = +v.value; saved.vol = +v.value; };
  const vw = h('label', 'slider'); vw.append(h('span', '', 'Гучність'), v);
  bar.append(pb, fb, lb, stop, vw); top.append(bar);
  top.append(h('p', 'status', '')); root.append(top);

  const scene = h('section', 'scene');
  scene.append(h('h2', '', 'Хвилина матчу'), h('p', 'hint', 'Найважливіше: справжня послідовність подій гри. Слухай старий і новий поспіль, спершу на динаміках телефона.'));
  const sb = h('div', 'snd-ctl'); const s0 = h('button', 'old', 'Старий'), s1 = h('button', 'neu', 'Новий');
  s0.onclick = () => playScene('old', s0); s1.onclick = () => playScene('neu', s1); sb.append(s0, s1, h('span', 'now', '')); sb.lastChild.id = 'sceneNow';
  scene.append(sb); root.append(scene);

  const crowd = h('section', 'crowd');
  crowd.append(h('h2', '', 'Натовп: головний фон матчу'), h('p', 'hint', 'Гул це два варіанти разом, вони плавно міняються кожні 30–60 с. Напруга в грі росте сама, коли м\'яч біля воріт.'));
  const cc = h('div', 'snd-ctl');
  const c0 = h('button', 'old', 'Старий гул'), c1 = h('button', 'neu', 'Новий гул'); c0.onclick = () => { stopAll(); ensureCtx(); eng.old.crowd(0.7); }; c1.onclick = () => { stopAll(); ensureCtx(); eng.neu.crowd(+lv.value); eng.neu.tension = +tn.value; eng.neu.syncCrowd(0.5); };
  const lv = h('input'); lv.type = 'range'; lv.min = 0; lv.max = 1; lv.step = 0.01; lv.value = 0.7; lv.oninput = () => { if (eng.neu) eng.neu.crowd(+lv.value); };
  const tn = h('input'); tn.type = 'range'; tn.min = 0; tn.max = 1; tn.step = 0.01; tn.value = 0; tn.oninput = () => { if (eng.neu) { eng.neu.tension = +tn.value; eng.neu.syncCrowd(0.8); } };
  const ch = h('input'); ch.type = 'range'; ch.min = 0; ch.max = 1; ch.step = 0.01; ch.value = 0; ch.oninput = () => { if (eng.neu) { eng.neu.chant(+ch.value); eng.neu.syncCrowd(0.8); } };
  const lw = h('label', 'slider'); lw.append(h('span', '', 'Рівень'), lv); const tw = h('label', 'slider'); tw.append(h('span', '', 'Напруга'), tn); const cw = h('label', 'slider'); cw.append(h('span', '', 'Скандування'), ch);
  cc.append(c0, c1, lw, tw, cw); crowd.append(cc);
  const rot = h('button', 'neu', 'Змінити поєднання'); rot.onclick = () => { ensureCtx(); eng.neu.rotateBed(); }; cc.append(rot);
  root.append(crowd);

  const groups = {};
  for (const s of SOUNDS) { if (!groups[s.g]) { groups[s.g] = h('section', 'group'); groups[s.g].append(h('h2', '', s.g)); root.append(groups[s.g]); } groups[s.g].append(row(s)); }

  const mus = h('section', 'music');
  mus.append(h('h2', '', 'Музика меню'), h('p', 'hint', 'У матчі музики немає, там стадіон: це твій вибір. Меню: тепла фонова гра. Слухай кілька хвилин, чи не набридає.'));
  const mc = h('div', 'snd-ctl');
  const m0 = h('button', 'old', 'Стара, меню'), m0b = h('button', 'old', 'Стара, матч'), m1 = h('button', 'neu', 'Клавіші й пад'), m2 = h('button', 'neu', 'Лише пад');
  const newMus = (style) => { stopAll(); ensureCtx(); eng.neu.musicStyle = style; eng.neu.musicMode = 'off'; eng.neu.music('menu'); };
  m0.onclick = () => playOldMusic('menu'); m0b.onclick = () => playOldMusic('match'); m1.onclick = () => newMus('keys'); m2.onclick = () => newMus('pad');
  mc.append(m0, m0b, m1, m2); mus.append(mc); root.append(mus);

  const ms = h('section', 'measure');
  ms.append(h('h2', '', 'Заміри'), h('p', 'hint', 'Цифри показують лише рівні й різкість, а не красу. Різкість це енергія у 2–5 кГц, телефон це 150–400 Гц, обидві в дБ відносно повної шкали.'));
  const mb = h('button', '', 'Виміряти старий і новий');
  const tb = h('table', 'mt'); tb.innerHTML = '<thead><tr><th>Звук</th><th colspan=2>Пік, дБ</th><th colspan=2>RMS, дБ</th><th colspan=2>Різкість</th><th colspan=2>Телефон</th><th colspan=2>Клірінг</th></tr><tr><th></th><th>стар</th><th>нов</th><th>стар</th><th>нов</th><th>стар</th><th>нов</th><th>стар</th><th>нов</th><th>стар</th><th>нов</th></tr></thead><tbody></tbody>';
  mb.onclick = async () => { mb.disabled = true; tb.tBodies[0].innerHTML = ''; await measure((r) => { const tr = h('tr'); for (const x of [r.name, r.old.peak, r.neu.peak, r.old.rms, r.neu.rms, r.old.harsh, r.neu.harsh, r.old.phone, r.neu.phone, r.old.clip, r.neu.clip]) tr.append(h('td', '', String(x))); tb.tBodies[0].append(tr); }); mb.disabled = false; };
  ms.append(mb, tb); root.append(ms);

  const out = h('section', 'out');
  out.append(h('h2', '', 'Зауваження'), h('p', 'hint', 'Якщо щось різке чи фальшиве, напиши своїми словами, натисни «Скопіювати» й надішли в чат.'));
  const notes = h('textarea'); notes.placeholder = 'Що різке, що фальшиве, що подобається'; notes.value = saved.notes || ''; notes.oninput = () => { saved.notes = notes.value; persist(); };
  const cp = h('button', '', 'Скопіювати'); cp.onclick = async () => { try { await navigator.clipboard.writeText(notes.value); cp.textContent = 'Скопійовано'; } catch (_) { notes.select(); document.execCommand('copy'); cp.textContent = 'Скопійовано'; } setTimeout(() => { cp.textContent = 'Скопіювати'; }, 1400); };
  out.append(notes, cp); root.append(out);
}
build();
const status = el('.status');
status.textContent = 'Записи вантажаться…';
bank.loadAll(decoder, (d, n) => { status.textContent = `Записи вантажаться: ${d} із ${n}`; }).then(() => { status.textContent = 'Записи готові. Перше натискання вмикає звук.'; }).catch((e) => { status.textContent = 'Не вдалось завантажити записи: ' + e.message; });

setInterval(() => { if (eng.neu) eng.neu.tick(); }, 500);   // у грі це робить track

window.soundLab = { setLite(v) { useLite = v; }, measure, measureScene, loopSeam, TESTS, SCENE, render, analyse, bank, AudioEngine, Bank };
