// Екран ЛОКО РАШ: власні блокові літери й вхід: м'яч відскакує по LOKO, ударом проходить крізь RUSH, ще один удар від глядача летить в отвір O, камера тримається за ним і пролітає крізь O, а там м'яч стає 3D і падає на поле стадіону.
// М'яч рухається за фізикою з однією гравітацією (`flight`, `shotAt`), шлях рахується наперед. Увесь рух це WAAPI на transform і opacity, тож іде на композиторі, навіть коли головний потік зайнятий грою.
import { appHidden } from '../core/telegram.js';

const INK = '#06120d';
/** Літери: ширина й контур у клітинці висотою 140, товщина штриха 30. */
const GLYPH = {
  L: [100, 'M0 0H30V106H100V128L88 140H0Z'],
  O: [100, 'M12 0H88L100 12V128L88 140H12L0 128V12ZM30 30V110H70V30Z'],
  K: [104, 'M0 0H30V54L62 0H102L64 64L104 140H68L40 86L30 100V140H0Z'],
  R: [100, 'M0 0H86L100 14V70L86 84H70L100 140H64L36 88H30V140H0ZM30 28V60H70V28Z'],
  U: [100, 'M0 0H30V110H70V0H100V128L88 140H12L0 128Z'],
  S: [100, 'M12 0H100V28H30V54H88L100 66V128L88 140H0V112H70V82H12L0 70V12Z'],
  H: [100, 'M0 0H30V54H70V0H100V140H70V84H30V140H0Z'],
};
const PAD = 44, SKEW = 0.17633, SHIFT = 26, TOP = 6;   // запас на нахил і об'єм у клітинці; зсув нахилу; верхнє поле
const DEFS = `<svg class="sp-defs" width="0" height="0" aria-hidden="true"><defs>${Object.keys(GLYPH).map((c) => `<path id="spg-${c}" fill-rule="evenodd" d="${GLYPH[c][1]}"/>`).join('')}</defs></svg>`;
const letter = (c, row) => {
  const w = GLYPH[c][0], face = row ? '#e02a38' : '#f6f4ec', side = row ? '#7d1219' : '#1f8f3f', u = `href="#spg-${c}"`;
  let deep = '';
  for (let k = 5; k > 0; k--) deep += `<use ${u} fill="${side}" transform="translate(${k * 2.4} ${k * 2.4})"/>`;
  return `<svg class="sp-ch" data-w="${w}" viewBox="0 ${-TOP} ${w + PAD} 168" style="--w:${w + PAD}" aria-hidden="true"><g transform="translate(${SHIFT} 0) skewX(-10)"><use ${u} fill="${INK}" stroke="${INK}" stroke-width="9" transform="translate(13 13)"/>${deep}<use ${u} fill="${face}" stroke="${INK}" stroke-width="4"/></g></svg>`;
};
const word = (t, row) => `<div class="sp-row r${row}">${[...t].map((c) => letter(c, row)).join('')}</div>`;
const LETTERS = word('LOKO', 0) + word('RUSH', 1);
const BALL = '<svg viewBox="-54 -54 108 108" aria-hidden="true"><circle r="50" fill="#fff" stroke="#06120d" stroke-width="6"/><path fill="#06120d" d="M0-17L16-5L10 14H-10L-16-5ZM-5-47L5-47L12-34L0-27L-12-34ZM45-16L36 4L24-1L24-16L36-27ZM27 40L12 47L4 35L14 23L30 25ZM-27 40L-30 25L-14 23L-4 35L-12 47ZM-45-16L-36-27L-24-16L-24-1L-36 4Z"/></svg>';

/** Розмітка екрана: заслін із великими літерами на вхід і назва в спокої. */
export const splashHtml = (crest) => `${DEFS}
  <div class="sp-gate" aria-hidden="true"><div class="sp-gz"><svg class="sp-field"><path fill="${INK}" fill-rule="evenodd"/></svg><svg class="sp-cover grey"><path fill="#9aa3a0"/></svg><svg class="sp-cover ink"><path fill="${INK}" stroke="${INK}" stroke-width="8" stroke-linejoin="round"/></svg><div class="sp-gk"><div class="sp-gt">${LETTERS}</div></div></div></div>
  <i class="sp-flash"></i>
  <div class="sp-fx" aria-hidden="true"><i class="sp-ball">${BALL}</i></div>
  <div class="splash-in">
    <h1 class="sp-title" aria-label="LOKO RUSH">${LETTERS}</h1>
    <div class="sp-cta"><button class="sp-go" data-act="start"><span>ГРАТИ</span></button><div class="sp-crest">${crest}</div></div>
  </div>`;

const STEP = 1000 / 60;
/** Шлях м'яча: точки часу (мс), центр, обертання, стиск. Спільний для входу й м'яча в спокої. */
class Trace {
  constructor() { this.p = []; this.t = 0; this.rot = 0; }
  push(x, y, k = 1, sq = 0, dRot = 0) { this.rot += dRot; this.p.push({ t: this.t, x, y, k, sq, rot: this.rot }); this.t += STEP; }
  /** Перелiт під гравітацією: стартова швидкість, час (с), можна зупинитись умовою. Стиск у мить удару об поверхню додає `land`. */
  flight(x0, y0, vx, vy, g, T, r, stop) {
    const n = Math.max(1, Math.round((T * 1000) / STEP));
    for (let i = 0; i < n; i++) {
      const s = i * STEP / 1000, x = x0 + vx * s, y = y0 + vy * s + 0.5 * g * s * s;
      if (stop && stop(x, y)) return;
      this.push(x, y, 1, 0, (vx * STEP / 1000 / r) * 57.3);
    }
  }
  /** Стиск біля точок контакту: м'яч плющиться лише в мить удару, центр опускається разом із ним. */
  squash(times, r) {
    for (const q of this.p) for (const tc of times) { const d = Math.abs(q.t - tc); if (d < 60) { const s = 1 - d / 60; q.sq = Math.max(q.sq, s); q.y += r * 0.2 * s; } }
  }
  /** Програти на елементі м'яча: зовні зсув і стиск, усередині обертання. */
  play(el, spin, animFn, delay = 0) {
    const T = this.t, last = this.p.length - 1;
    const pos = this.p.map((q, i) => ({ offset: Math.min(q.t / T, 1), opacity: i === last ? 0 : 1, transform: `translate(${q.x.toFixed(1)}px,${q.y.toFixed(1)}px) scale(${(q.k * (1 + 0.18 * q.sq)).toFixed(3)},${(q.k * (1 - 0.22 * q.sq)).toFixed(3)})` }));
    const rot = this.p.map((q) => ({ offset: Math.min(q.t / T, 1), transform: `rotate(${q.rot.toFixed(1)}deg)` }));
    animFn(el, pos, { duration: T, delay, easing: 'linear', fill: 'both' });
    return animFn(spin, rot, { duration: T, delay, easing: 'linear', fill: 'both' });
  }
}

/**
 * Запускає вхід і життя екрана. Повертає stop(): викликати, коли екран ховається.
 * hooks.view(on): чи видно стадіон крізь заслін (поки ні, гра його не малює); hooks.ball(at): м'яч у отворі O стає 3D;
 * hooks.land(): назва падає на місце. hooks.stadium: є 3D-стадіон, тож плаский м'яч у спокої не літає, бо на полі вже є справжній.
 */
export function runSplash(s, level, hooks = {}) {
  const q = (x) => s.querySelector(x);
  const gate = q('.sp-gate'), fxBox = q('.sp-fx'), ball = q('.sp-ball'), spin = q('.sp-ball svg'), flash = q('.sp-flash'), inner = q('.splash-in');
  const rest = [...s.querySelectorAll('.sp-title .sp-ch')], go = q('.sp-go'), crest = q('.sp-crest');
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const chipN = level >= 2 ? 5 : level === 1 ? 3 : 0, COL = ['#e02a38', '#3fae3c', '#f6f4ec', '#f6f4ec'];
  let dead = false, idleT = 0, gateOn = false, handoff = null;   // handoff: де екранний м'яч стає 3D у отворі O
  const call = (k, x) => { try { if (hooks[k]) hooks[k](x); } catch (e) { console.error(e); } };
  /** Подія в часі входу: той самий годинник WAAPI, що й анімації, тож не розходиться з ними, як setTimeout. */
  const atT = (ms, fn) => { const a = anim(fxBox, [{ opacity: 1 }, { opacity: 1 }], { duration: 1, delay: Math.max(0, ms) }); a.onfinish = fn; };
  const live = [];
  const anim = (el, frames, opts) => { const a = el.animate(frames, opts); if (gateOn) live.push(a); return a; };   // live: те, що скасовує пропуск входу

  /** Осколки летять угору від удару й падають тією самою гравітацією. */
  const chips = (x, y, vx, g, delay, n, size) => {
    for (let i = 0; i < n; i++) {
      const c = document.createElement('i'); c.className = 'sp-chip';
      c.style.cssText = `left:${x.toFixed(0)}px;top:${y.toFixed(0)}px;width:${size.toFixed(1)}px;height:${size.toFixed(1)}px;background:${COL[i % 4]}`;
      fxBox.appendChild(c);
      const dur = 0.42 + Math.random() * 0.24, ux = vx * 0.35 + (Math.random() - 0.5) * size * 42, uy = -(0.3 + Math.random() * 0.5) * g * dur * 0.6, r = (Math.random() * 900 - 450) | 0;
      const fr = [0, 0.25, 0.5, 0.75, 1].map((u) => { const t = u * dur; return { offset: u, opacity: u < 0.75 ? 1 : 2 * (1 - u) * 2, transform: `translate(${(ux * t).toFixed(1)}px,${(uy * t + 0.5 * g * t * t).toFixed(1)}px) rotate(${(r * u) | 0}deg)` }; });
      const an = c.animate(fr, { duration: dur * 1000, delay, easing: 'linear' });
      if (gateOn) live.push(an);
      an.onfinish = () => c.remove(); an.oncancel = () => c.remove();
    }
  };

  // ---------------------------------------------------------------- назва на місці
  const dip = (el, delay = 0, power = 1) => anim(el, [{ transform: 'none' }, { transform: `translateY(${5 * power}%) scale(${1 + 0.04 * power},${1 - 0.07 * power})`, offset: 0.2 }, { transform: `translateY(${-1.6 * power}%) scale(${1 - 0.01 * power},${1 + 0.025 * power})`, offset: 0.55 }, { transform: 'none' }], { duration: 420, delay, easing: 'ease-out' });
  /** У спокої м'яч зрідка падає згори, відскакує від верху літери й вилітає за екран. */
  const bounceOne = () => {
    const el = rest[(Math.random() * rest.length) | 0], b = el.getBoundingClientRect(), cu = b.height / 168, r = 17 * cu, w = +el.dataset.w;
    const cx = b.left + (SHIFT + w * 0.5) * cu, cy = b.top + TOP * cu - r, g = 5000 * cu, tDown = Math.sqrt((2 * (cy + r * 2)) / g), dir = Math.random() < 0.5 ? 1 : -1, vx = dir * (140 + Math.random() * 90) * cu;
    const tr = new Trace();
    tr.flight(cx - vx * tDown, -r * 2, vx, 0, g, tDown, r);
    const tHit = tr.t, vy = -g * tDown * 0.62, W = s.clientWidth, H = s.clientHeight;
    tr.flight(cx, cy, vx, vy, g, 3, r, (x, y) => x < -r * 2 || x > W + r * 2 || y > H + r * 2);
    tr.squash([tHit], r);
    ball.style.width = `${(r * 2).toFixed(0)}px`;
    tr.play(ball, spin, anim);
    dip(el, tHit - 10);
    setTimeout(() => { if (!dead) chips(cx, cy + r, vx, g, 0, Math.max(chipN - 2, 0), cu * 8); }, tHit);
  };
  const idle = () => {
    if (dead) return;
    if (!appHidden() && !s.hidden && level >= 1 && !calm && !hooks.stadium) bounceOne();   // на стадіоні вже котиться справжній м'яч: другого не треба
    idleT = setTimeout(idle, 6000 + Math.random() * 3500);
  };
  const onTap = (e) => {
    const el = e.target.closest && e.target.closest('.sp-title .sp-ch'); if (!el || gateOn) return;
    const b = el.getBoundingClientRect();
    dip(el, 0, 1.2);
    chips(e.clientX, e.clientY, 0, 5000 * (b.height / 168), 0, chipN, b.height * 0.05);
  };
  q('.sp-title').addEventListener('pointerdown', onTap);

  const landed = () => {
    gateOn = false; for (const a of live) a.cancel();
    live.length = 0; gate.remove(); s.classList.remove('gating');
    call('view', true); call('ball', handoff); call('land');
    if (calm) return;
    anim(flash, [{ opacity: 0.55 }, { opacity: 0 }], { duration: 170, easing: 'ease-out' });
    rest.forEach((el, i) => anim(el, [{ opacity: 0, transform: 'translateY(-8%) scale(2.7)' }, { opacity: 1, transform: 'scale(.95)', offset: 0.58 }, { opacity: 1, transform: 'none' }], { duration: 360, delay: i * 30, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'backwards' }));
    anim(inner, [{ transform: 'none' }, { transform: 'translate(-.6%,1.1%)' }, { transform: 'translate(.5%,-.7%)' }, { transform: 'none' }], { duration: 240, delay: 190, easing: 'ease-out' });
    anim(go, [{ opacity: 0, transform: 'skewX(-10deg) translateX(-34%)' }, { opacity: 1, transform: 'skewX(-10deg)' }], { duration: 300, delay: 360, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'backwards' });
    anim(crest, [{ opacity: 0, transform: 'scale(2.6) rotate(-14deg)' }, { opacity: 1, transform: 'scale(.92) rotate(2deg)', offset: 0.6 }, { opacity: 1, transform: 'none' }], { duration: 340, delay: 520, easing: 'cubic-bezier(.2,1,.4,1)', fill: 'backwards' });
    idleT = setTimeout(idle, 3200);
  };

  // ---------------------------------------------------------------- вхід
  const skip = (e) => {
    if (!gateOn) return;
    if (e) { e.stopPropagation(); e.preventDefault(); }
    // другий дотик подвійного тапу не влучить у «ГРАТИ», що щойно з'явиться
    const stop = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
    s.addEventListener('click', stop, true); setTimeout(() => s.removeEventListener('click', stop, true), 350);
    landed();
  };
  const enter = () => {
    const W = s.clientWidth, H = s.clientHeight, gt = q('.sp-gt'), z = q('.sp-gz'), kick = q('.sp-gk'), field = q('.sp-field');
    const cu = Math.min(W * 0.84 / 508, H * 0.84 / 322);                          // найбільша назва, що влізає: відступ рядка, 4 літери, запас, два рядки
    gt.style.setProperty('--cu', `${cu.toFixed(3)}px`);
    const row1 = [...gt.querySelectorAll('.r0 .sp-ch')], row2 = [...gt.querySelectorAll('.r1 .sp-ch')];
    // отвір O у заслоні: крізь нього вже видно стадіон
    const box = row1[1].getBoundingClientRect();
    const ptX = (x, y) => box.left + (SHIFT + x - SKEW * y) * cu, ptY = (y) => box.top + (y + TOP) * cu;
    const hole = `M${ptX(30, 30).toFixed(1)} ${ptY(30).toFixed(1)}L${ptX(70, 30).toFixed(1)} ${ptY(30).toFixed(1)}L${ptX(70, 110).toFixed(1)} ${ptY(110).toFixed(1)}L${ptX(30, 110).toFixed(1)} ${ptY(110).toFixed(1)}Z`;
    field.setAttribute('viewBox', `0 0 ${W} ${H}`); field.firstElementChild.setAttribute('d', `M${-W} ${-H}H${2 * W}V${2 * H}H${-W}Z${hole}`);   // з запасом: на замаху заслін стискається
    z.classList.add('open');
    call('view', false);                                                           // далі стадіон видно лише крізь сіре скло: доти гра його не малює                                                       // суцільне тло до старту ховало порожню канву, далі темне лише поле з отвором
    const hx = (ptX(30, 70) + ptX(70, 70)) / 2, hy = ptY(70);
    z.style.transformOrigin = `${hx.toFixed(1)}px ${hy.toFixed(1)}px`;
    const hw = 20 * cu * 0.75, hh = 40 * cu, far = Math.max(Math.max(hx, W - hx) / hw, Math.max(hy, H - hy) / hh) * 1.25;
    // заглушки отвору: темна, поки O ще немає, під нею сіре скло, що тане, коли м'яч летить в O
    const hp = [[30, 30], [70, 30], [70, 110], [30, 110]].map(([x, y]) => [ptX(x, y), ptY(y)]), bx0 = Math.min(...hp.map((p) => p[0])) - 4, by0 = Math.min(...hp.map((p) => p[1])) - 4, bx1 = Math.max(...hp.map((p) => p[0])) + 4, by1 = Math.max(...hp.map((p) => p[1])) + 4;
    const coverD = `M${(hp[0][0] - bx0 - 3).toFixed(1)} ${(hp[0][1] - by0 - 3).toFixed(1)}L${(hp[1][0] - bx0 + 3).toFixed(1)} ${(hp[1][1] - by0 - 3).toFixed(1)}L${(hp[2][0] - bx0 + 3).toFixed(1)} ${(hp[2][1] - by0 + 3).toFixed(1)}L${(hp[3][0] - bx0 - 3).toFixed(1)} ${(hp[3][1] - by0 + 3).toFixed(1)}Z`;
    const covers = [...z.querySelectorAll('.sp-cover')];
    for (const c of covers) { c.style.cssText = `left:${bx0.toFixed(1)}px;top:${by0.toFixed(1)}px;width:${(bx1 - bx0).toFixed(1)}px;height:${(by1 - by0).toFixed(1)}px`; c.setAttribute('viewBox', `0 0 ${(bx1 - bx0).toFixed(1)} ${(by1 - by0).toFixed(1)}`); c.firstElementChild.setAttribute('d', coverD); }
    const [greyC, inkC] = covers;

    const r = 17 * cu, tr = new Trace(), hits = [], jolts = [];
    ball.style.width = `${(r * 2).toFixed(0)}px`;
    const LH = 140 * cu, T0 = 0.38, g = (8 * LH * 0.62) / (T0 * T0);               // одна гравітація на весь вхід, підібрана під висоту першого відскоку
    const topOf = (el) => { const b = el.getBoundingClientRect(), w = +el.dataset.w; return { x: b.left + (SHIFT + w * 0.5) * cu, y: b.top + TOP * cu - r }; };
    /** Літера виростає під м'ячем за мить до контакту, а удар її просаджує. */
    const pop = (el, tc) => anim(el, [{ opacity: 0, transform: 'translateY(24%) scale(.92,.35)' }, { opacity: 1, transform: 'translateY(-3%) scale(.97,1.06)', offset: 0.26 }, { opacity: 1, transform: 'translateY(6%) scale(1.05,.9)', offset: 0.42 }, { opacity: 1, transform: 'translateY(-1.5%) scale(.99,1.02)', offset: 0.72 }, { opacity: 1, transform: 'none' }], { duration: 350, delay: Math.max(0, tc - 90), easing: 'ease-out', fill: 'both' });

    // постріл 1: м'яч падає згори й відскакує по верху LOKO
    const tops = row1.map(topOf), hops = [T0, 0.35, 0.32];
    let vx = (tops[1].x - tops[0].x) / hops[0];
    const y0 = -r * 2, tFall = Math.sqrt((2 * (tops[0].y - y0)) / g);
    tr.t = 120;
    tr.flight(tops[0].x - vx * tFall, y0, vx, 0, g, tFall, r);
    for (let i = 0; i < 3; i++) {
      hits.push(tr.t); pop(row1[i], tr.t); chips(tops[i].x, tops[i].y + r, vx, g, tr.t, chipN, 8 * cu); jolts.push([tr.t, 0, 7 * cu]);
      const T = hops[i], dy = tops[i + 1].y - tops[i].y;
      vx = (tops[i + 1].x - tops[i].x) / T;
      tr.flight(tops[i].x, tops[i].y, vx, dy / T - (g * T) / 2, g, T, r);
    }
    hits.push(tr.t); pop(row1[3], tr.t); chips(tops[3].x, tops[3].y + r, vx, g, tr.t, chipN, 8 * cu); jolts.push([tr.t, 0, 7 * cu]);
    // останній відскік нижчий: м'яч зривається за край і падає за екран
    tr.flight(tops[3].x, tops[3].y, vx * 1.1, -(g * 0.28) / 2, g, 3, r, (x, y) => x > W + r * 2 || y > H + r * 2);
    tr.squash(hits, r);

    // постріл 2: сильний удар збоку, м'яч іде дугою крізь RUSH, літери вибиває на проході
    tr.t += 90;
    const T2 = 0.42, b2 = row2[0].getBoundingClientRect(), rowMid = b2.top + (TOP + 70) * cu, x20 = -r * 2, x21 = W + r * 2, v2x = (x21 - x20) / T2, y20 = rowMid + (g * T2 * T2) / 16, t2 = tr.t;
    tr.flight(x20, y20, v2x, -(g * T2) / 2, g, T2, r);
    row2.forEach((el) => {
      const c = el.getBoundingClientRect(), mx = c.left + (SHIFT + 50) * cu, tc = t2 + ((mx - x20) / v2x) * 1000;
      anim(el, [{ opacity: 0, transform: 'translateX(-34%) scale(1.5,.86)' }, { opacity: 1, transform: 'translateX(4%) scale(.95,1.04)', offset: 0.5 }, { opacity: 1, transform: 'none' }], { duration: 210, delay: tc - 40, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'both' });
      chips(mx, rowMid, v2x, g, tc, chipN, 8 * cu); jolts.push([tc, 8 * cu, 0]);
    });

    // O з'явилась: темна заглушка зникає, лишається сіре скло
    anim(inkC, [{ opacity: 1 }, { opacity: 0 }], { duration: 140, delay: hits[1], fill: 'both' });

    // постріл 3: удар від глядача, м'яч летить углиб до отвору O, а камера (заслін) їде слідом і проходить крізь O.
    // Глибина: площина літер на 1, камера на dcam, м'яч на zb; розмір на екрані це 1/(глибина - dcam).
    tr.t += 130;
    const t3 = tr.t, Bw = 26 * cu, z0 = 0.12, T3 = 0.95, gap = 0.22, X0 = (W * 0.6 - hx) * z0, Y0 = (H + r * 3 - hy) * z0, lift = 3 * cu;
    const zoom = [];
    const ex = W / 2 - hx, ey = H / 2 - hy;                                          // куди камера зводить отвір: у центр кадру
    for (let i = 0; i < 400; i++) {
      const sec = (i * STEP) / 1000, zb = z0 + ((1 - z0) * sec) / T3, u = Math.min(1, (zb - z0) / (1 - z0));
      const f = Math.min(1, sec / (T3 * 0.45)), follow = f * f * (3 - 2 * f);                 // камера рушає не одразу, а наздоганяє м'яч
      const dcam = Math.min(0.999, follow * Math.max(0, zb - gap)), d = Math.max(zb - dcam, 0.04), sc = 1 / (1 - dcam);
      // камера стає на лінію удару позаду м'яча: тоді м'яч і отвір на одному промені, і м'яч летить точно в O; дуга лише невелика
      const line = 1 - (dcam - z0) / (1 - z0), X = X0 * (1 - u), Y = Y0 * (1 - u) - lift * 4 * u * (1 - u), cx = follow * X0 * line, cy = follow * Y0 * line, ox = ex * follow, oy = ey * follow;
      tr.push(hx + ox + (X - cx) / d, hy + oy + (Y - cy) / d, Bw / d / (2 * r), 0, 6);
      if (!handoff && zb >= 0.9) { const q2 = tr.p[tr.p.length - 1]; handoff = { x: q2.x, y: q2.y, d: q2.k * 2 * r, t: q2.t }; }   // м'яч уже в отворі: тут він стане 3D
      zoom.push([tr.t - STEP - t3, sc, ox - cx * sc, oy - cy * sc]);
      if (sc > far) break;
    }
    tr.p.unshift({ t: 0, x: tr.p[0].x, y: tr.p[0].y, k: 1, sq: 0, rot: 0 });
    tr.play(ball, spin, anim);
    const T = tr.t, D = zoom[zoom.length - 1][0];
    // стадіон знову малюється, щойно скло почне танути; у отворі м'яч стає 3D, а плаский над ним розчиняється
    atT(t3 + T3 * 140, () => call('view', true));
    if (hooks.stadium && handoff) { atT(handoff.t, () => call('ball', handoff)); anim(spin, [{ opacity: 1 }, { opacity: 0 }], { duration: 220, delay: handoff.t, easing: 'ease-in', fill: 'forwards' }); }
    // сіре скло тане, поки м'яч летить до O: стадіон проступає поступово
    anim(greyC, [{ opacity: 1 }, { opacity: 0 }], { duration: T3 * 0.55 * 1000, delay: t3 + T3 * 150, easing: 'ease-in-out', fill: 'both' });
    const fly = anim(z, zoom.map(([zt, sc, tx, ty]) => ({ offset: Math.min(zt / D, 1), transform: `translate(${tx.toFixed(1)}px,${ty.toFixed(1)}px) scale(${sc.toFixed(3)})` })), { duration: D, delay: t3, easing: 'linear', fill: 'forwards' });
    fly.onfinish = () => { if (gateOn) landed(); };

    // поштовхи кадру на кожен удар одною анімацією: кілька окремих перекривали б одна одну
    jolts.sort((a, b) => a[0] - b[0]);
    const kf = [{ offset: 0, transform: 'none' }];
    jolts.forEach(([jt, jx, jy], i) => {
      const next = i + 1 < jolts.length ? jolts[i + 1][0] : jt + 150;
      kf.push({ offset: jt / T, transform: 'none' }, { offset: Math.min((jt + 22) / T, 0.999), transform: `translate(${jx.toFixed(1)}px,${jy.toFixed(1)}px)` }, { offset: Math.min(Math.min(jt + 120, next - 1) / T, 0.999), transform: 'none' });
    });
    kf.push({ offset: 1, transform: 'none' });
    let lastO = -1; const clean = kf.filter((f) => { if (f.offset <= lastO) return false; lastO = f.offset; return true; });
    anim(kick, clean, { duration: T, easing: 'ease-out' });
    gate.addEventListener('click', skip, true);
  };

  const onVis = () => { for (const a of s.getAnimations({ subtree: true })) { if (appHidden()) a.pause(); else if (a.playState === 'paused') a.play(); } };
  const onResize = () => { if (gateOn) skip(); };
  document.addEventListener('visibilitychange', onVis);
  addEventListener('resize', onResize);

  try {
    gateOn = true;
    if (calm) landed(); else enter();
  } catch (e) { console.error(e); gateOn = true; landed(); }

  return () => {
    dead = true; clearTimeout(idleT); gateOn = false;
    document.removeEventListener('visibilitychange', onVis); removeEventListener('resize', onResize);
    if (gate.isConnected) gate.remove();
    s.classList.remove('gating');
  };
}
