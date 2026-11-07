// Картка гравця онлайн-клубу: одна на всю гру (магазин, лава, «Герої», відкриття паку, ринок). heroCard дає розмітку,
// bindCards — нахил за пальцем чи мишею й переворот. Рамка й матеріал за рідкістю (RARITY): звичайний — матовий сірий,
// рідкісний — синій метал, епічний — фіолетовий перелив, легенда — золото з бігом світла й іскрами. Стилі: .hc у src/style.css.
// Рухаються лише transform і opacity; prefers-reduced-motion вимикає нахил і постійні анімації.
import { RARITY, TRAITS, esc } from '../online/profile.js';
import { ovr, keysFor, ROLE_UA } from '../state/squad.js';

/** Короткі підписи навичок на картці (повні — STAT_NAMES). */
export const STAT_ABBR = { pace: 'ШВД', shoot: 'УДР', pass: 'ПАС', drib: 'ВЕД', tack: 'ВІД', iq: 'ГРА', react: 'РЕА', reach: 'ДІС', hands: 'ЛОВ' };
const REDUCED = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: true };
const COARSE = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

/**
 * Розмітка картки героя e.
 * opts: img — портрет (dataURL з portrait()), flag — SVG прапора клубу, size — 's' | 'm' | 'l', state — '' | 'new' | 'sold',
 * act — data-act усієї картки, cmp — різниця з гравцем клубу на цій позиції ({ d, k: { навичка: різниця } }),
 * back — розмітка звороту (без неї картку не перевернути), flip — показати зворотом, cls — додаткові класи.
 */
export function heroCard(e, opts = {}) {
  const rar = RARITY[e.rar] ? e.rar : 'c', R = RARITY[rar], T = TRAITS[e.trait], o = ovr(e);
  const parts = String(e.name || '').split(' '), last = parts.slice(-1)[0], first = parts.slice(0, -1).join(' ');
  const cmp = opts.cmp || null, kd = (cmp && cmp.k) || {};
  const stats = keysFor(e.line).map((k) => {
    const v = e.stats[k] | 0, d = kd[k] | 0;
    return `<span class="${T && T.stat === k ? 'tr' : ''}"><b>${v}</b><small>${STAT_ABBR[k] || k}</small>${d ? `<em class="${d > 0 ? 'up' : 'dn'}">${d > 0 ? '+' : ''}${d}</em>` : ''}</span>`;
  }).join('');
  const st = opts.state === 'sold' ? ' sold' : opts.state === 'new' ? ' new' : '';
  const delta = cmp && cmp.d != null ? `<i class="hc-cmp ${cmp.d > 0 ? 'up' : cmp.d < 0 ? 'dn' : ''}">${cmp.d > 0 ? '+' : ''}${cmp.d}</i>` : '';
  const sparks = rar === 'l' ? '<i class="hc-spk"></i><i class="hc-spk"></i><i class="hc-spk"></i><i class="hc-spk"></i>' : '';
  const act = opts.act ? ` data-act="${esc(opts.act)}"` : '';
  const front = `<div class="hc-f"><i class="hc-mat" aria-hidden="true"></i>
      <div class="hc-top"><b class="hc-ovr">${o}</b><span class="hc-pos">${esc(e.pos || e.role || '')}</span><span class="hc-num">${e.num | 0}</span></div>${opts.flag ? `<span class="hc-flag">${opts.flag}</span>` : ''}
      <div class="hc-ph">${opts.img ? `<img src="${opts.img}" alt="" draggable="false"/>` : ''}</div>
      <div class="hc-nm"><b>${esc(last)}</b>${first ? `<small>${esc(first)}</small>` : ''}</div>
      <div class="hc-tr">${T ? `★ ${T.name}` : esc(ROLE_UA[e.role] || e.role || '')}</div>
      <div class="hc-st">${stats}</div>
      <i class="hc-rar">${R.name}</i>${delta}${sparks}<i class="hc-sheen" aria-hidden="true"></i>
      ${st === ' new' ? '<i class="hc-badge">НОВИЙ</i>' : ''}${st === ' sold' ? '<i class="hc-soldm">ПРОДАНО</i>' : ''}</div>`;
  const back = opts.back ? `<div class="hc-b"><i class="hc-mat" aria-hidden="true"></i>${opts.back}</div>` : '';
  const flipB = opts.back ? '<button class="hc-flipb" data-hcflip aria-label="Перевернути картку"></button>' : '';
  return `<div class="hc r-${rar} hc-${opts.size || 'm'}${st}${opts.flip ? ' flip' : ''}${opts.cls ? ' ' + opts.cls : ''}" style="--rc:${R.col}" data-hc${act}><div class="hc-in">${front}${back}</div>${flipB}</div>`;
}

/** Зворот за замовчуванням: риса, рівень, матчі й голи (те, що не влізло на лице). extra — ще рядки (ціна продажу тощо). */
export function heroBack(e, extra = '') {
  const T = TRAITS[e.trait], R = RARITY[e.rar] || RARITY.c;
  return `<div class="hc-bk"><b>${esc(e.name)}</b><small>${R.name} · ${esc(ROLE_UA[e.role] || e.role || '')} · №${e.num | 0}</small>
    ${T ? `<p class="hc-bt">★ ${T.name}: ${esc(T.tip)}</p>` : ''}
    <dl><dt>Рівень</dt><dd>${e.lvl | 0 || 1}</dd><dt>Матчів</dt><dd>${e.apps | 0}</dd><dt>Голів</dt><dd>${e.goals | 0}</dd></dl>${extra}</div>`;
}

const bound = new WeakSet();
let raf = 0, tgt = null, px = 0, py = 0;
/** Нахил під пальцем: значення пишемо раз на кадр (rAF), лише змінні --rx/--ry/--mx, які читає transform. */
function tilt() {
  raf = 0; if (!tgt || !tgt.isConnected) return;
  const r = tgt.getBoundingClientRect(), x = Math.max(0, Math.min(1, (px - r.left) / r.width)), y = Math.max(0, Math.min(1, (py - r.top) / r.height));
  tgt.style.setProperty('--ry', ((x - 0.5) * 16).toFixed(2) + 'deg');
  tgt.style.setProperty('--rx', ((0.5 - y) * 12).toFixed(2) + 'deg');
  tgt.style.setProperty('--mx', (x * 100).toFixed(1) + '%');
}
function rest(el) { if (!el) return; el.classList.remove('tilt'); el.style.removeProperty('--rx'); el.style.removeProperty('--ry'); el.style.removeProperty('--mx'); }

/** Слухачі на контейнері (раз на контейнер): нахил за вказівником і переворот кнопкою .hc-flipb. */
export function bindCards(root) {
  if (!root || bound.has(root)) return;
  bound.add(root);
  root.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-hcflip]'); if (!b || !root.contains(b)) return;
    ev.stopPropagation(); ev.preventDefault();
    const c = b.closest('[data-hc]'); if (c) c.classList.toggle('flip');
  }, true);
  if (REDUCED.matches) return;
  root.addEventListener('pointermove', (ev) => {
    const c = ev.target.closest && ev.target.closest('[data-hc]');
    if (c !== tgt) { rest(tgt); tgt = c; if (c) c.classList.add('tilt'); }
    if (!c) return;
    px = ev.clientX; py = ev.clientY;
    if (!raf) raf = requestAnimationFrame(tilt);
  }, { passive: true });
  const off = () => { rest(tgt); tgt = null; };
  root.addEventListener('pointerleave', off);
  if (COARSE) { root.addEventListener('pointerup', off); root.addEventListener('pointercancel', off); }
}
