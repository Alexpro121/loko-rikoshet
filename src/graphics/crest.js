// Герб клубу кар'єри: форма щита, поле в кольорах клубу, знак і назва на стрічці. Одні шляхи для SVG (табло, екрани)
// і canvas (емблема в центрі поля). Без залежностей від three: файл можна імпортувати й у node.
import { embPaths } from '../online/flag.js';

const W = 40, H = 46;
const SHAPE = {
  shield: 'M3 3h34v22c0 9-9 16-17 19C12 41 3 34 3 25z',
  round: 'M1.5 23a18.5 18.5 0 1 0 37 0a18.5 18.5 0 1 0 -37 0z',
  spade: 'M3 3H37V24L20 44L3 24z',
  hex: 'M20 2.5L37.5 12.5V33.5L20 43.5L2.5 33.5V12.5z',
  tower: 'M3 7H8V3H14V7H17V3H23V7H26V3H32V7H37V25c0 9-9 16-17 19C12 41 3 34 3 25z',
};
const rect = (x, y, w, h) => `M${x} ${y}h${w}v${h}h${-w}z`;
const waves = (y, h) => { let d = `M0 ${y}`; for (let i = 0; i < 8; i++) d += `q2.5 ${i % 2 ? h : -h} 5 0`; return d + `V${H}H0z`; };
/** Поле: [шлях, індекс кольору]; тло — колір 0. */
const FIELD = {
  plain: () => [],
  halves: () => [[rect(20, 0, 20, H), 1]],
  quarters: () => [[rect(20, 0, 20, 23) + rect(0, 23, 20, 23), 1]],
  stripes: () => [[rect(8, 0, 6, H) + rect(20, 0, 6, H) + rect(32, 0, 6, H), 1]],
  hoops: () => [[rect(0, 9, W, 5) + rect(0, 19, W, 5) + rect(0, 29, W, 5) + rect(0, 39, W, 5), 1]],
  chief: () => [[rect(0, 0, W, 14), 1]],
  pale: () => [[rect(14, 0, 12, H), 1]],
  nordic: () => [[rect(11, 0, 7, H) + rect(0, 18, W, 7), 1], [rect(13, 0, 3, H) + rect(0, 20, W, 3), 5]],
  waves: () => [[waves(31, 2), 1], [waves(37, 2), 5]],
  split: () => [[rect(0, 23, W, 23), 1]],
};

/**
 * Збирає герб: список фігур { d, f, m, clip, stroke } і підпис. badge: { sh, f, c: [поле, поле 2, знак, обід, текст],
 * em, tx, at: 'chief' | 'ribbon' | '' }.
 */
function build(club) {
  const b = club.badge, c = b.c, out = [], sh = SHAPE[b.sh] || SHAPE.shield;
  out.push({ d: sh, f: c[0] });
  for (const [d, i] of (FIELD[b.f] || FIELD.plain)()) out.push({ d, f: c[i] || c[1], clip: true });
  const ey = b.at === 'chief' ? 27.5 : b.at === 'ribbon' ? 20 : b.sh === 'round' ? 23 : 22.5, s = b.at ? 0.5 : 0.6;
  for (const d of embPaths(b.em)) out.push({ d, f: c[2], m: [s, 0, 0, s, 20, ey] });
  if (b.at === 'ribbon') out.push({ d: 'M1 31H39L36.5 34.25L39 37.5H1L3.5 34.25z', f: c[3] });
  return { out, sh, rim: c[3], text: b.tx || '', tc: c[4] || '#fff', at: b.at };
}

const TXY = { chief: 8.6, ribbon: 35.3 };
let uid = 0;
/** Герб як вбудований SVG (той самий розмір 40×46, що й простий щит у icons.js). */
export function crestSvg(club, cls = 'crest') {
  const { out, sh, rim, text, tc, at } = build(club), id = 'cc' + (++uid);
  let s = `<svg class="${cls}" viewBox="0 0 ${W} ${H}" aria-hidden="true"><defs><clipPath id="${id}"><path d="${sh}"/></clipPath></defs>`;
  for (const o of out) s += `<path d="${o.d}" fill="${o.f}" fill-rule="evenodd"${o.clip ? ` clip-path="url(#${id})"` : ''}${o.m ? ` transform="matrix(${o.m.join(' ')})"` : ''}/>`;
  s += `<path d="${sh}" fill="none" stroke="rgba(0,0,0,.55)" stroke-width="3.6" stroke-linejoin="round"/><path d="${sh}" fill="none" stroke="${rim}" stroke-width="2.2" stroke-linejoin="round"/>`;
  if (text && at) {
    const fs = text.length > 8 ? 4.6 : 5.4, len = Math.min(31, text.length * fs * 0.72);
    s += `<text x="20" y="${TXY[at]}" text-anchor="middle" dominant-baseline="central" font-family="Rubik, 'Arial Black', sans-serif" font-weight="800" font-size="${fs}" fill="${tc}" textLength="${len}" lengthAdjust="spacingAndGlyphs">${text}</text>`;
  }
  return s + '</svg>';
}

/** Той самий герб на canvas: x, y — лівий верхній кут, k — масштаб (1 = 40×46 пікселів). */
export function drawCrest(g, club, x, y, k) {
  const { out, sh, rim, text, tc, at } = build(club), shape = new Path2D(sh);
  g.save(); g.translate(x, y); g.scale(k, k); g.lineJoin = 'round';
  for (const o of out) {
    g.save();
    if (o.clip) g.clip(shape);
    if (o.m) g.transform(...o.m);
    g.fillStyle = o.f; g.fill(new Path2D(o.d), 'evenodd'); g.restore();
  }
  g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = 3.6; g.stroke(shape);
  g.strokeStyle = rim; g.lineWidth = 2.2; g.stroke(shape);
  if (text && at) {
    const fs = text.length > 8 ? 4.6 : 5.4;
    g.fillStyle = tc; g.font = `800 ${fs}px Rubik, "Arial Black", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, 20, TXY[at], Math.min(31, text.length * fs * 0.72));
  }
  g.restore();
}
