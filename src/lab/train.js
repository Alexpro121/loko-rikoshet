// Сторінка перевірки пака-потяга (train.html): кнопки пака, рідкості, затримки відповіді й помилки. Не вкладка з грою: Match і
// збереження не чіпає. Блок параметрів героя малює сам потяг.
import '@fontsource/rubik/cyrillic-600.css';
import '@fontsource/rubik/cyrillic-800.css';
import '@fontsource/rubik/latin-600.css';
import '@fontsource/rubik/latin-800.css';
import { openTrain, trainBack, trainMix } from '../ui/packtrain.js';
import { PACKS, RARITY, newHero } from '../online/profile.js';
import { ACADEMY, KIT_LOKO } from '../config.js';
import { audio } from '../core/audio.js';

const box = document.getElementById('tr');
const host = document.createElement('div');                       // як #reveal у хабі: на весь екран, сам дотиків не ловить
Object.assign(host.style, { position: 'fixed', inset: '0', zIndex: '30', pointerEvents: 'none' }); document.body.appendChild(host);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const st = { kind: 'scout', rar: 'auto', delay: 0, fail: false, n: 0 };
const look = (h) => ({ kit: KIT_LOKO, num: h.num, skin: h.skin, hair: h.hair, hairCol: h.hairCol, beard: h.beard, gk: false, scale: 0.9 });

function ui() {
  const odds = PACKS[st.kind].odds, mix = trainMix(odds);
  const btn = (grp, v, t, on) => `<button data-g="${grp}" data-v="${v}" class="${on ? 'on' : ''}">${t}</button>`;
  box.innerHTML = `<h1>Пак-потяг</h1>
    <p>Пак: ${Object.keys(PACKS).map((k) => btn('kind', k, PACKS[k].name, st.kind === k)).join('')}</p>
    <p>Склад: ${Object.keys(mix).map((k) => `<b style="color:${RARITY[k].col}">${RARITY[k].name} ×${mix[k]}</b>`).join(' · ')}</p>
    <p>Рідкість: ${btn('rar', 'auto', 'за шансами', st.rar === 'auto')}${Object.keys(odds).map((k) => btn('rar', k, RARITY[k].name, st.rar === k)).join('')}</p>
    <p>Відповідь: ${[0, 900, 2500, 6000].map((d) => btn('delay', d, d ? d / 1000 + ' с' : 'одразу', st.delay === d)).join('')}${btn('fail', 1, 'помилка', st.fail)}</p>
    <p><button class="go" data-go>ВІДКРИТИ ПАК</button></p>
    <p class="fine">Дотик після першої секунди або Esc — пропуск. Після кінця герой і блок параметрів стоять 4,5 с, далі шар закривається сам.</p>
    <pre id="log"></pre>`;
}
const log = (t) => { const p = document.getElementById('log'); if (p) p.textContent = t + '\n' + p.textContent; };

function roll() {
  if (st.rar !== 'auto') return st.rar;
  const o = PACKS[st.kind].odds; let r = Math.random();
  for (const k of ['l', 'e', 'r', 'c']) { const p = o[k] || 0; if (r < p) return k; r -= p; }
  return Object.keys(o)[0];
}

async function go() {
  audio.unlock();
  const rar = roll(), no = 1 + Math.floor(Math.random() * 20), n = ++st.n;
  const hero = Object.assign(newHero({ name: 'ST', line: 'F', num: 7 + (n % 20) }, new Set(), rar), { id: 't' + n });   // справжній герой: ім'я, навички, риса
  const result = new Promise((res, rej) => setTimeout(() => (st.fail ? rej(new Error('test')) : res({ hero, wagon: { no, rar } })), st.delay));
  const t0 = performance.now();
  const r = await openTrain({
    kind: st.kind, result, host,
    view: (h) => ({ look: look(h), key: 'tr-' + h.id, still: () => '' }),
  });
  log(`#${n} ${st.kind} → вагон ${no}, ${RARITY[rar].name}: ${r.end} за ${((performance.now() - t0) / 1000).toFixed(2)} с`);
  if (r.end !== 'error') setTimeout(() => r.close(), 5000);           // герой і блок параметрів стоять 5 с, потім шар закривається
}

box.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.go !== undefined) return go();
  const g = b.dataset.g, v = b.dataset.v;
  if (g === 'kind') { st.kind = v; st.rar = 'auto'; }
  if (g === 'rar') st.rar = v;
  if (g === 'delay') st.delay = +v;
  if (g === 'fail') st.fail = !st.fail;
  ui();
});
addEventListener('keydown', (e) => { if (e.key === 'Escape') trainBack(); });
window.trainLab = { st, go };
ui();
