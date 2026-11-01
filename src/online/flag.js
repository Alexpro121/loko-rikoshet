// Прапор онлайн-клубу: шари «поле → оздоба → плашка і знак → рамка», малювання в SVG і на canvas з одних шляхів,
// генератор зі стилями й перевіркою контрасту, очищення чужих і старих даних. Без залежностей: файл можна запускати в node.

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const pick = (a, rnd = Math.random) => a[(rnd() * a.length) | 0];
const n1 = (v) => +v.toFixed(2);

// ------------------------------------------------------------------ шляхи
const R = (x, y, w, h) => `M${n1(x)} ${n1(y)}h${n1(w)}v${n1(h)}h${n1(-w)}z`;
const O = (x, y, r) => `M${n1(x - r)} ${n1(y)}a${n1(r)} ${n1(r)} 0 1 0 ${n1(2 * r)} 0a${n1(r)} ${n1(r)} 0 1 0 ${n1(-2 * r)} 0z`;
const P = (...xy) => { let d = ''; for (let i = 0; i < xy.length; i += 2) d += (i ? 'L' : 'M') + n1(xy[i]) + ' ' + n1(xy[i + 1]); return d + 'z'; };
const star = (x, y, r, n = 5, k = 0.42, a0 = -Math.PI / 2) => { const p = []; for (let i = 0; i < n * 2; i++) { const a = a0 + (i * Math.PI) / n, q = i % 2 ? r * k : r; p.push(x + Math.cos(a) * q, y + Math.sin(a) * q); } return P(...p); };
const ngon = (x, y, r, n, a0 = -Math.PI / 2) => { const p = []; for (let i = 0; i < n; i++) { const a = a0 + (i * 2 * Math.PI) / n; p.push(x + Math.cos(a) * r, y + Math.sin(a) * r); } return P(...p); };
const wedge = (x, y, r, a, b) => P(x, y, x + Math.cos(a) * r, y + Math.sin(a) * r, x + Math.cos(b) * r, y + Math.sin(b) * r);
const mapJoin = (n, f) => { let s = ''; for (let i = 0; i < n; i++) s += f(i); return s; };

// ------------------------------------------------------------------ поле: 60×40, кольори a, b, c
const FULL = R(0, 0, 60, 40);
const rays = (x, y, n, off = 0) => mapJoin(n, (i) => { const st = (2 * Math.PI) / n, a = off + i * st; return wedge(x, y, 90, a, a + st / 2); });
const hStripes = (n) => mapJoin(n, (i) => (i % 2 ? R(0, (i * 40) / n, 60, 40 / n) : ''));
const vStripes = (n) => mapJoin(n, (i) => (i % 2 ? R((i * 60) / n, 0, 60 / n, 40) : ''));
const checks = (w, h) => { let s = ''; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if ((x + y) % 2) s += R((x * 60) / w, (y * 40) / h, 60 / w, 40 / h); return s; };
const bars = (n, w) => mapJoin(n, (i) => { const x = -40 + (i * 100) / n; return P(x, 40, x + w, 40, x + w + 40, 0, x + 40, 0); });
const waves = (y, h, n = 3) => { const s = 60 / (n * 2); let d = `M0 ${y}`; for (let i = 0; i < n * 2; i++) d += `q${s / 2} ${i % 2 ? h : -h} ${s} 0`; return d; };
const waveBand = (y, h, t) => { const s = 10; let d = `M0 ${y}`; for (let i = 0; i < 6; i++) d += `q${s / 2} ${i % 2 ? h : -h} ${s} 0`; d += `V${y + t}`; for (let i = 5; i >= 0; i--) d += `q${-s / 2} ${i % 2 ? h : -h} ${-s} 0`; return d + 'z'; };
const zig = (y, n, h) => { const st = 60 / n, p = [0, 40, 0, y]; for (let i = 0; i < n; i++) p.push(st * i + st / 2, y - h, st * (i + 1), y); p.push(60, 40); return P(...p); };
const lozenges = () => { let s = ''; for (let y = 0; y < 3; y++) for (let x = 0; x < 5; x++) { const cx = 6 + x * 12, cy = 6.67 + y * 13.33; s += P(cx, cy - 6.67, cx + 6, cy, cx, cy + 6.67, cx - 6, cy); } return s; };
const dots = () => { let s = ''; for (let y = 0; y < 4; y++) for (let x = 0; x < 6; x++) s += O(5 + x * 10, 5 + y * 10, 2.6); return s; };

/** Кожен візерунок: список [шлях, індекс кольору]. Тло завжди a (індекс 0), його не повторюємо. */
const PATS = {
  h2: () => [[R(0, 20, 60, 20), 1]],
  v2: () => [[R(30, 0, 30, 40), 1]],
  h3: () => [[R(0, 13, 60, 14), 1], [R(0, 27, 60, 13), 2]],
  v3: () => [[R(20, 0, 20, 40), 1], [R(40, 0, 20, 40), 2]],
  band: () => [[R(0, 10, 60, 20), 1]],
  pale: () => [[R(15, 0, 30, 40), 1]],
  tri5: () => [[R(0, 8, 60, 24), 1], [R(0, 14, 60, 12), 2]],
  h5: () => [[hStripes(5), 1]],
  h9: () => [[hStripes(9), 1]],
  v5: () => [[vStripes(5), 1]],
  v9: () => [[vStripes(9), 1]],
  diag: () => [[P(0, 40, 60, 0, 60, 40), 1]],
  bend: () => [[P(0, 40, 0, 28, 42, 0, 60, 0, 60, 12, 18, 40), 1]],
  bend3: () => [[P(0, 40, 0, 26, 39, 0, 60, 0, 60, 14, 21, 40), 1], [P(0, 40, 0, 33, 49.5, 0, 60, 0, 60, 7, 10.5, 40), 2]],
  bars: () => [[bars(7, 7), 1]],
  cross: () => [[R(18, 0, 9, 40), 1], [R(0, 15.5, 60, 9), 1]],
  nordic: () => [[R(15, 0, 12, 40), 1], [R(0, 14, 60, 12), 1], [R(18.5, 0, 5, 40), 2], [R(0, 17.5, 60, 5), 2]],
  plus: () => [[R(25, 0, 10, 40), 1], [R(0, 15, 60, 10), 1]],
  salt: () => [[P(0, 0, 7, 0, 60, 35, 60, 40, 53, 40, 0, 5), 1], [P(60, 0, 53, 0, 0, 35, 0, 40, 7, 40, 60, 5), 1]],
  x4: () => [[P(0, 0, 30, 20, 0, 40), 1], [P(60, 0, 30, 20, 60, 40), 1], [P(0, 0, 60, 0, 30, 20), 2]],
  border: () => [[`${FULL}${R(5, 5, 50, 30)}`, 1]],
  chev: () => [[P(0, 0, 26, 20, 0, 40), 1]],
  pile: () => [[P(0, 0, 40, 20, 0, 40), 1], [P(0, 6, 25, 20, 0, 34), 2]],
  pall: () => [[P(0, 0, 8, 0, 30, 16, 60, 16, 60, 24, 30, 24, 8, 40, 0, 40, 0, 34, 20, 20, 0, 6), 1], [P(0, 11, 13, 20, 0, 29), 2]],
  vee: () => [[P(0, 0, 10, 0, 30, 20, 50, 0, 60, 0, 30, 30), 1], [P(0, 40, 0, 15, 30, 40, 60, 15, 60, 40), 2]],
  chv3: () => [[P(0, 16, 30, 4, 60, 16, 60, 24, 30, 12, 0, 24), 1], [P(0, 30, 30, 18, 60, 30, 60, 38, 30, 26, 0, 38), 1]],
  quad: () => [[R(0, 0, 30, 20), 1], [R(30, 20, 30, 20), 1]],
  gyro: () => [[P(30, 20, 30, 0, 0, 0), 1], [P(30, 20, 60, 0, 60, 20), 1], [P(30, 20, 30, 40, 60, 40), 1], [P(30, 20, 0, 40, 0, 20), 1]],
  chk: () => [[checks(6, 4), 1]],
  chk2: () => [[checks(12, 8), 1]],
  loz: () => [[lozenges(), 1]],
  dots: () => [[dots(), 1]],
  sun: () => [[rays(30, 20, 12), 1]],
  sun2: () => [[rays(0, 40, 9, -0.09), 1], [O(0, 40, 11), 2]],
  disc: () => [[O(30, 20, 13), 1]],
  ring: () => [[`${O(30, 20, 16)}${O(30, 20, 11)}`, 1]],
  rise: () => [[`M12 40a18 18 0 0 1 36 0z`, 1], [`M0 40V34H60V40z`, 2]],
  wave: () => [[waveBand(14, 5, 12), 1]],
  wave3: () => [[`${waveBand(6, 3, 7)}${waveBand(27, 3, 7)}`, 1], [waveBand(16.5, 3, 7), 2]],
  sea: () => [[`${waves(24, 5)}V40H0z`, 1], [`${waves(32, 4)}V40H0z`, 2]],
  zig: () => [[zig(26, 5, 9), 1]],
  peak: () => [[P(0, 40, 0, 28, 14, 9, 26, 26, 38, 5, 60, 32, 60, 40), 1], [P(0, 40, 0, 34, 16, 20, 30, 34, 42, 22, 60, 37, 60, 40), 2]],
  teeth: () => [[P(0, 0, 22, 0, 32, 4, 22, 8, 32, 12, 22, 16, 32, 20, 22, 24, 32, 28, 22, 32, 32, 36, 22, 40, 0, 40), 1]],
  canton: () => [[R(0, 0, 26, 20), 1], [`${R(26, 0, 34, 6.67)}${R(26, 13.33, 34, 6.67)}${R(0, 26.67, 60, 6.67)}`, 2]],
  corner: () => [[P(60, 0, 60, 40, 8, 40), 1], [P(60, 14, 60, 40, 28, 40), 2]],
  swoop: () => [[`M0 40C18 28 40 22 60 0V40z`, 1], [`M0 40C22 34 44 30 60 16V40z`, 2]],
  arrow: () => [[P(0, 12, 34, 12, 34, 0, 60, 20, 34, 40, 34, 28, 0, 28), 1]],
};
export const FLAG_PATS = Object.keys(PATS);
const BUSY = new Set(['h9', 'v9', 'h5', 'v5', 'bars', 'chk', 'chk2', 'loz', 'dots', 'sun', 'gyro', 'zig', 'peak', 'quad']);

// ------------------------------------------------------------------ знаки: центр у (0, 0), радіус близько 18
const ROPE = (r, t) => O(0, 0, r) + O(0, 0, r - t);
const LOCO = [
  `${R(-17, -7, 21, 13)}${R(4, -13, 11, 19)}${R(-13, -14, 5, 7)}${R(6, -10, 7, 6)}`,
  `${O(-11, 10, 5.4)}${O(-11, 10, 2)}`, `${O(1, 10, 5.4)}${O(1, 10, 2)}`, `${O(11, 10, 4.2)}${O(11, 10, 1.6)}`,
];
const EMB = {
  star: `M0 -17l5.6 11.4 12.6 1.8-9.1 8.9 2.2 12.5L0 11.7l-11.3 5.9 2.2-12.5-9.1-8.9 12.6-1.8z`,
  star4: star(0, 0, 19, 4, 0.28),
  star6: star(0, 0, 18, 6, 0.55),
  star8: `${star(0, 0, 19, 8, 0.5)}${O(0, 0, 5)}`,
  three: [star(0, -9, 9.5), star(-10, 7, 9.5), star(10, 7, 9.5)],
  ball: `${O(0, 0, 17)}${P(0, -7.5, 7.1, -2.3, 4.4, 6, -4.4, 6, -7.1, -2.3)}${P(-3.2, -16.6, 3.2, -16.6, 0, -13)}${P(16.5, -3.5, 14, 3.5, 12, -2)}${P(-16.5, -3.5, -14, 3.5, -12, -2)}${P(-11, 12.5, -5, 15.8, -8, 10)}${P(11, 12.5, 5, 15.8, 8, 10)}`,
  bolt: `M3 -18L-11 3h9l-4 15 15-22h-9z`,
  crown: [`M-15 8l-3-17 10 8 8-12 8 12 10-8-3 17z`, R(-15, 10, 30, 4)],
  wheel: [ROPE(15, 4), `${R(-1.5, -14, 3, 28)}${P(-11, -9, -9, -11, 11, 9, 9, 11)}${P(11, -9, 9, -11, -11, 9, -9, 11)}${R(-14, -1.5, 28, 3)}`, O(0, 0, 4)],
  trident: `M0 -18l3 6h-1.5v16c3 0 6-3 6-9V-13l4 5v4c0 8-4 12-8.5 13V18h-6V9C-7.5 8 -11.5 4 -11.5 -4v-4l4-5v8c0 6 3 9 6 9V-12H-3z`,
  sun: [O(0, 0, 8), mapJoin(10, (i) => { const a = (i * Math.PI) / 5, c = Math.cos, s = Math.sin; return P(c(a - 0.17) * 10.5, s(a - 0.17) * 10.5, c(a) * 18.5, s(a) * 18.5, c(a + 0.17) * 10.5, s(a + 0.17) * 10.5); })],
  moon: `M6 -16.5A17 17 0 1 0 6 16.5A13.5 13.5 0 1 1 6 -16.5z`,
  moons: [`M2 -16.5A17 17 0 1 0 2 16.5A13.5 13.5 0 1 1 2 -16.5z`, star(9, 0, 8)],
  heart: `M0 16C-8 10 -17 4 -17 -5C-17 -11 -12.5 -14.5 -8 -14.5C-4.5 -14.5 -1.5 -12.5 0 -9C1.5 -12.5 4.5 -14.5 8 -14.5C12.5 -14.5 17 -11 17 -5C17 4 8 10 0 16z`,
  flame: `M1 -18C3 -10 12 -6 12 4C12 12 6 17 0 17C-7 17 -12 12 -12 5C-12 -1 -8 -4 -7 -9C-4 -7 -3 -5 -3 -2C0 -6 2 -12 1 -18z M0 15C3 15 5 12 5 9C5 6 2 4 1 0C0 4 -5 6 -5 10C-5 13 -3 15 0 15z`,
  wing: [`M-17 -9C-8 -13 2 -13 9 -17C8 -14 7 -13 5 -11C10 -12 14 -13 17 -13C15 -9 12 -7 8 -6C11 -6 13 -6 15 -7C12 -3 8 -1 3 -1C5 0 7 0 9 0C6 3 2 4 -2 4C-1 8 -3 13 -7 17C-7 11 -9 6 -12 2C-14 -2 -16 -5 -17 -9z`],
  eagle: `M0 -17l3 5-1 2 3 3C8 -9 14 -13 19 -14C17 -8 15 -3 10 1L7 2 8 6 4 8 6 16 2 13 0 18-2 13-6 16-4 8-8 6-7 2-10 1C-15 -3 -17 -8 -19 -14C-14 -13 -8 -9 -5 -7L-2 -10-3 -12z`,
  wolf: `${P(-14, -18, -8, -8, 8, -8, 14, -18, 15, -2, 9, 6, 3, 17, -3, 17, -9, 6, -15, -2)}${P(-9, -3, -3, -1, -8, 1)}${P(9, -3, 3, -1, 8, 1)}${P(-2.5, 10, 2.5, 10, 0, 13)}`,
  fox: `${P(-17, -17, -6, -7, 6, -7, 17, -17, 15, 0, 0, 18, -15, 0)}${P(-10, -3, -4, 0, -8, 1.5)}${P(10, -3, 4, 0, 8, 1.5)}`,
  bull: `${P(-18, -16, -14, -6, -8, -5, -8, -8, 8, -8, 8, -5, 14, -6, 18, -16, 19, -5, 13, 1, 9, 1, 7, 13, 3, 17, -3, 17, -7, 13, -9, 1, -13, 1, -19, -5)}${P(-6, -3, -1.5, -1, -5, 1)}${P(6, -3, 1.5, -1, 5, 1)}${O(-2.4, 13, 1)}${O(2.4, 13, 1)}`,
  stag: `M-2 18L-5 8-8 2C-11 1-13-2-13-5L-9-3-9-10-16-12-17-18-13-14-10-15-11-19-7-14-6-8-4-3H4L6-8 7-14 11-19 10-15 13-14 17-18 16-12 9-10 9-3 13-5C13-2 11 1 8 2L5 8 2 18z`,
  paw: [O(0, 7, 8.5), O(-13, -2, 4.2), O(-5, -11, 4.4), O(5, -11, 4.4), O(13, -2, 4.2)],
  dragon: `M-18 15C-14 8-14 2-8 -4C-7 -9-3 -14 3 -16L0 -11 8 -15 5 -9C10 -9 15 -8 18 -4L10 -3 13 2 6 0C3 2 3 6 7 8C10 10 11 13 9 17C7 14 4 12 0 12C-6 12-11 16-18 15z`,
  phoenix: `M0 -18L4 -10 11 -15 9 -7 18 -9 12 0 16 2 8 5 4 12 6 18 0 14-6 18-4 12-8 5-16 2-12 0-18-9-9-7-11-15-4-10z`,
  shark: `M-19 8C-10 7-4 2 0 -7C2 -11 5 -15 11 -17C8 -11 8 -5 10 0C12 4 15 7 19 8z`,
  anchor: [`${O(0, -13, 4.5)}${O(0, -13, 2)}`, R(-1.8, -9, 3.6, 25), R(-8, -7, 16, 3.2), `M-16 2L-13 -2-13.5 3C-12 10-6 14-1.8 14V17C-9 17-16 12-16 2z`, `M16 2L13 -2 13.5 3C12 10 6 14 1.8 14V17C9 17 16 12 16 2z`],
  sword: [P(-1.7, -18, 0, -21, 1.7, -18, 1.7, 8, -1.7, 8), R(-7, 8, 14, 3), R(-1.5, 11, 3, 5), O(0, 18, 2.3)],
  swords: [P(-15, -18, -12, -16, 11, 8, 8, 11, -16, -14), P(15, -18, 12, -16, -11, 8, -8, 11, 16, -14), P(6, 15, 15, 6, 17, 8, 8, 17), P(-6, 15, -15, 6, -17, 8, -8, 17)],
  axe: [P(-1.6, -18, 1.6, -18, 1.6, 18, -1.6, 18), `M1.6 -14C8 -14 14 -11 16 -5C16 0 14 3 12 5C9 1 5 -1 1.6 -1z`, `M-1.6 -14C-8 -14 -14 -11 -16 -5C-16 0 -14 3 -12 5C-9 1 -5 -1 -1.6 -1z`],
  mace: [R(-1.8, -4, 3.6, 22), `${P(0, -19, 5, -15, 9, -13, 8, -8, 6, -3, 0, -5, -6, -3, -8, -8, -9, -13, -5, -15)}${O(0, -11, 2.3)}`, R(-4, 11, 8, 2.6)],
  arrow: P(0, -19, 13, -4, 5, -4, 5, 19, -5, 19, -5, -4, -13, -4),
  shield: `M-14 -16H14V2C14 10 6 15 0 18C-6 15 -14 10 -14 2z M-9.5 -11.5V2C-9.5 7 -4 11 0 13C4 11 9.5 7 9.5 2V-11.5z`,
  tower: [`${P(-15, -17, -9.5, -17, -9.5, -12, -2.8, -12, -2.8, -17, 2.8, -17, 2.8, -12, 9.5, -12, 9.5, -17, 15, -17, 15, -5, 11, -1, 11, 18, -11, 18, -11, -1, -15, -5)}${P(-4, 18, -4, 8, 0, 4, 4, 8, 4, 18)}${R(-2, -6, 4, 6)}`],
  light: [P(-4, -9, 4, -9, 7, 18, -7, 18), P(-5.5, -13, 5.5, -13, 5.5, -10, -5.5, -10), `${P(-4, -14, 0, -19, 4, -14)}`, P(-19, -18, -7, -13, -7, -10, -19, -5), P(19, -18, 7, -13, 7, -10, 19, -5)],
  loco: LOCO,
  rocket: [`M0 -19C6 -14 8 -7 8 0V8H-8V0C-8 -7 -6 -14 0 -19z M0 -10A3.6 3.6 0 1 0 0 -2.8A3.6 3.6 0 1 0 0 -10z`, P(-8, 2, -15, 12, -8, 9), P(8, 2, 15, 12, 8, 9), P(-4, 10, 4, 10, 0, 19)],
  comet: [star(9, -9, 9.5), P(2.5, -7, -18, 10, -7, 5.5, -11, 17, 11.5, -3)],
  peak: `${P(-19, 15, -6, -8, -2, -2, 5, -15, 19, 15)}${P(5, -15, 9, -7, 6.5, -5, 4.5, -7.5, 2, -4.5, 1.5, -8)}`,
  pine: [P(0, -19, 7, -10, 3.5, -10, 10, -2, 5, -2, 13, 8, -13, 8, -5, -2, -10, -2, -3.5, -10, -7, -10), R(-2.5, 8, 5, 10)],
  leaf: `M0 18V8L-11 11-9 6-17 -1-14 -3-15 -9-9 -8-8 -11-3 -6-5 -15-1.5 -13 0 -19 1.5 -13 5 -15 3 -6 8 -11 9 -8 15 -9 14 -3 17 -1 9 6 11 11 1 8V18z`,
  drop: `M0 -19C5 -10 13 -3 13 5C13 12 7 18 0 18C-7 18 -13 12 -13 5C-13 -3 -5 -10 0 -19z M-6 5C-6 9 -3 12 0 12V9C-1.5 9 -3 7 -3 5z`,
  snow: [mapJoin(3, (i) => { const a = (i * Math.PI) / 3, c = Math.cos(a), s = Math.sin(a), w = 1.5, r = 19; return P(-c * r + s * w, -s * r - c * w, c * r + s * w, s * r - c * w, c * r - s * w, s * r + c * w, -c * r - s * w, -s * r + c * w); }), mapJoin(6, (i) => { const a = (i * Math.PI) / 3, c = Math.cos, s = Math.sin; return P(c(a) * 9, s(a) * 9, c(a + 0.5) * 15, s(a + 0.5) * 15, c(a + 0.34) * 16, s(a + 0.34) * 16, c(a) * 12, s(a) * 12, c(a - 0.34) * 16, s(a - 0.34) * 16, c(a - 0.5) * 15, s(a - 0.5) * 15); })],
  gear: `${mapJoin(1, () => { const p = []; for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4, st = 0.26, c = Math.cos, s = Math.sin; p.push(c(a - st - 0.14) * 13, s(a - st - 0.14) * 13, c(a - st) * 18, s(a - st) * 18, c(a + st) * 18, s(a + st) * 18, c(a + st + 0.14) * 13, s(a + st + 0.14) * 13); } return P(...p); })}${O(0, 0, 6)}`,
  shoe: `M-17 -10H-6L-5 -4C0 -2 8 0 14 2C18 3 19 6 19 9H-17z M-17 11H19V14H-17z`,
  cup: [`M-10 -18H10V-6C10 0 5 4 2 5V11H7V16H-7V11H-2V5C-5 4 -10 0 -10 -6z`, `M-11 -15H-17V-9C-17 -4 -14 -2 -10 -1V-5C-12 -5.5 -13.5 -7 -13.5 -9V-11.5H-11z`, `M11 -15H17V-9C17 -4 14 -2 10 -1V-5C12 -5.5 13.5 -7 13.5 -9V-11.5H11z`],
  letterv: P(-17, -16, -8, -16, 0, 4, 8, -16, 17, -16, 3.5, 17, -3.5, 17),
  horse: `M-12 18C-11 10-8 6-4 2C-6 0-9 2-13 3L-16 0C-13 -4-9 -7-6 -12L-7 -17-3 -15 1 -18 1 -14C7 -11 12 -4 13 6C14 11 13 15 12 18z`,
};
export const FLAG_EMB = ['none', ...Object.keys(EMB)];

// ------------------------------------------------------------------ плашка під знаком
const PLATE = {
  none: null,
  disc: () => O(0, 0, 24),
  shield: () => `M-20 -23H20V4C20 13 9 20 0 25C-9 20 -20 13 -20 4z`,
  dia: () => P(0, -29, 29, 0, 0, 29, -29, 0),
  hex: () => ngon(0, 0, 26, 6),
  oct: () => ngon(0, 0, 25, 8, Math.PI / 8),
  sq: () => R(-22, -22, 44, 44),
  star: () => star(0, 0, 30, 8, 0.74),
};
export const FLAG_PLATES = Object.keys(PLATE);

// ------------------------------------------------------------------ оздоба поверх поля, колір c[2]
const OV = {
  none: null,
  stars: () => star(14, 6, 2.6) + star(30, 6, 2.6) + star(46, 6, 2.6),
  stars5: () => mapJoin(5, (i) => star(10 + i * 10, 35, 2.2)),
  arc: () => mapJoin(7, (i) => { const a = Math.PI * (1.12 + (i * 0.76) / 6); return star(30 + Math.cos(a) * 20, 22 + Math.sin(a) * 17, 2.1); }),
  circle: () => mapJoin(12, (i) => { const a = (i * Math.PI) / 6; return star(30 + Math.cos(a) * 16.5, 20 + Math.sin(a) * 16.5, 1.7); }),
  corners: () => P(0, 0, 9, 0, 0, 9) + P(60, 0, 51, 0, 60, 9) + P(0, 40, 9, 40, 0, 31) + P(60, 40, 51, 40, 60, 31),
  trim: () => R(0, 0, 60, 3) + R(0, 37, 60, 3),
  hoist: () => R(0, 0, 7, 40),
  fly: () => P(60, 0, 52, 0, 56, 5, 52, 10, 56, 15, 52, 20, 56, 25, 52, 30, 56, 35, 52, 40, 60, 40),
  sash: () => P(0, 40, 0, 35, 53, 0, 60, 0, 60, 5, 7, 40),
  speed: () => P(36, 40, 40, 40, 60, 16, 60, 11) + P(44, 40, 48, 40, 60, 25, 60, 20) + P(52, 40, 56, 40, 60, 35, 60, 30),
  ring: () => O(30, 20, 18) + O(30, 20, 16.8),
  laurel: () => mapJoin(7, (i) => {                                 // два вінки по боках: листок лягає вздовж дуги
    const a = -1.15 + i * 0.36, r = 16.5, leaf = (sg) => { const x = 30 + sg * Math.cos(a) * r * 1.15, y = 21 + Math.sin(a) * r, tx = sg * Math.sin(a), ty = -Math.cos(a), nx = sg * Math.cos(a), ny = Math.sin(a); return P(x + tx * 3, y + ty * 3, x + nx * 1.1, y + ny * 1.1, x - tx * 1.6, y - ty * 1.6, x - nx * 1.1, y - ny * 1.1); };
    return leaf(1) + leaf(-1);
  }),
  arrows: () => P(42, 12, 48, 20, 42, 28, 39, 28, 45, 20, 39, 12) + P(50, 12, 56, 20, 50, 28, 47, 28, 53, 20, 47, 12),
  grid: () => mapJoin(4, (i) => R(0, 4 + i * 11, 60, 0.7)) + mapJoin(6, (i) => R(4 + i * 10.4, 0, 0.7, 40)),
};
export const FLAG_OVS = Object.keys(OV);

export const FLAG_EDGES = ['none', 'thin', 'white', 'gold', 'double', 'wide'];
const SPOTS = [[12, 10], [30, 10], [48, 10], [14, 20], [30, 20], [46, 20], [12, 30], [30, 30], [48, 30]];   // 3×3, 4 — центр

// ------------------------------------------------------------------ збірка шарів
/** Плоский список фігур для малювання: { d, f (колір заливки), m (матриця або null) }. Те саме бачать SVG і canvas. */
function shapes(flag) {
  const c = flag.c, out = [], flip = flag.flip ? [-1, 0, 0, 1, 60, 0] : null, add = (d, f, m = null) => { if (d) out.push({ d, f, m }); };
  add(FULL, c[0]);
  for (const [d, i] of (PATS[flag.pat] || PATS.h2)()) add(d, c[i], flip);
  if (OV[flag.ov]) add(OV[flag.ov](), c[2], flip);
  const glyph = EMB[flag.em];
  if (glyph || PLATE[flag.pl]) {
    const s = 0.62 * (flag.sz / 100), a = (flag.rot * Math.PI) / 180, co = Math.cos(a) * s, si = Math.sin(a) * s;
    const [sx, sy] = flag.pos === 4 && flag.pat === 'cross' ? [22.5, 20] : SPOTS[flag.pos] || SPOTS[4], n = flag.rep;
    const gap = 25 * s * (PLATE[flag.pl] ? 1.9 : 1.5);
    for (let i = 0; i < n; i++) {
      const x = sx + (i - (n - 1) / 2) * gap, y = sy, m = [co, si, -si, co, x, y];
      if (PLATE[flag.pl]) { add(PLATE[flag.pl](), c[4], [s, 0, 0, s, x, y]); }
      if (glyph) for (const d of Array.isArray(glyph) ? glyph : [glyph]) add(d, c[3], m);
    }
  }
  return out;
}
const EDGE = {
  none: [], thin: [[0.75, 1.5, 'rgba(0,0,0,.35)']], white: [[1, 2, '#f6f4ec']], gold: [[1.1, 2.2, '#e8b923']],
  double: [[0.9, 1.8, '#f6f4ec'], [2.9, 0.9, '#14231e']], wide: [[1.6, 3.2, null]],
};
const edgeList = (flag) => (EDGE[flag.edge] || EDGE.thin).map(([i, w, col]) => [i, w, col || flag.c[1]]);

const svgBody = (flag) => {
  let s = '';
  for (const { d, f, m } of shapes(flag)) s += `<path d="${d}" fill="${f}" fill-rule="evenodd"${m ? ` transform="matrix(${m.map(n1).join(' ')})"` : ''}/>`;
  for (const [i, w, col] of edgeList(flag)) s += `<rect x="${i}" y="${i}" width="${n1(60 - i * 2)}" height="${n1(40 - i * 2)}" fill="none" stroke="${col}" stroke-width="${w}"/>`;
  return s;
};
/** Прапор як вбудований SVG 60×40. */
export function flagSvg(flag, cls = 'oflag') { return `<svg class="${cls}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 40" aria-hidden="true">${svgBody(flag)}</svg>`; }
/** Той самий прапор для background-image (полотно, що майорить). */
export function flagUri(flag) { return `url('data:image/svg+xml,${encodeURIComponent(flagSvg(flag, ''))}')`; }
/** Малює прапор на canvas: для тканини на стадіоні. */
export function drawFlag(g, flag, w, h) {
  const sx = w / 60, sy = h / 40;
  g.save(); g.scale(sx, sy);
  for (const { d, f, m } of shapes(flag)) {
    g.save(); if (m) g.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
    g.fillStyle = f; g.fill(new Path2D(d), 'evenodd'); g.restore();
  }
  for (const [i, lw, col] of edgeList(flag)) { g.strokeStyle = col; g.lineWidth = lw; g.strokeRect(i, i, 60 - i * 2, 40 - i * 2); }
  g.restore();
}
/** Один знак окремо (іконка в редакторі, крутілка очікування). */
export function emblemSvg(em, col = 'currentColor', cls = 'oemb') {
  const g = EMB[em]; if (!g) return '';
  return `<svg class="${cls}" viewBox="-22 -22 44 44" aria-hidden="true">${(Array.isArray(g) ? g : [g]).map((d) => `<path d="${d}" fill="${col}" fill-rule="evenodd"/>`).join('')}</svg>`;
}

// ------------------------------------------------------------------ кольори
/** Палітра редактора: насичені кольори, з яких добре читається форма на газоні, плюс темні й світлі. */
export const FLAG_COLS = [
  '#d4202c', '#9e1622', '#e0482a', '#e0762a', '#f2a01e', '#e8b923', '#f4d84a', '#9fbf3a', '#4caf3f', '#1f8f3f', '#0f5e3c', '#17a589',
  '#3fb7d8', '#2f80d8', '#1f4fa8', '#14306e', '#6a2fa0', '#4a1f7a', '#a03fb5', '#c2185b', '#ef5d8f', '#7a4a22', '#14231e', '#2b2f33',
  '#5c6b73', '#8d98a3', '#c9ced3', '#f1efe8',
];
const lumOf = (hex) => { const n = parseInt(hex.slice(1), 16), f = (v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }; return 0.2126 * f(n >> 16) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255); };
/** Контраст WCAG: 1 — той самий колір, 21 — чорне на білому. */
export const contrast = (a, b) => { const x = lumOf(a), y = lumOf(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const hsl = (h, s, l) => { const f = (n) => { const k = (n + h / 30) % 12, q = s * Math.min(l, 1 - l), v = l - q * Math.max(-1, Math.min(k - 3, 9 - k, 1)); return Math.round(v * 255).toString(16).padStart(2, '0'); }; return `#${f(0)}${f(8)}${f(4)}`; };
const INK = '#14231e', PAPER = '#f1efe8', GOLD = '#e8b923';

/** Перевірені поєднання: футболка, шорти, третій колір. */
const SCHEMES = [
  ['#d4202c', '#f1efe8', '#14231e'], ['#14231e', '#e8b923', '#f1efe8'], ['#1f4fa8', '#e8b923', '#f1efe8'], ['#1f8f3f', '#f1efe8', '#e8b923'],
  ['#6a2fa0', '#e8b923', '#f1efe8'], ['#14306e', '#d4202c', '#f1efe8'], ['#f1efe8', '#d4202c', '#14306e'], ['#e0762a', '#14231e', '#f1efe8'],
  ['#0f5e3c', '#e8b923', '#14231e'], ['#c2185b', '#14231e', '#f4d84a'], ['#3fb7d8', '#14306e', '#f1efe8'], ['#9e1622', '#e8b923', '#14231e'],
  ['#14231e', '#d4202c', '#f1efe8'], ['#17a589', '#14231e', '#f4d84a'], ['#f4d84a', '#14231e', '#d4202c'], ['#2f80d8', '#f1efe8', '#14306e'],
  ['#4a1f7a', '#3fb7d8', '#f1efe8'], ['#ef5d8f', '#14231e', '#f1efe8'], ['#7a4a22', '#e8b923', '#f1efe8'], ['#2b2f33', '#e0482a', '#f2a01e'],
  ['#f1efe8', '#1f8f3f', '#d4202c'], ['#a03fb5', '#f4d84a', '#14231e'], ['#e0482a', '#14306e', '#f1efe8'], ['#5c6b73', '#f2a01e', '#14231e'],
  ['#9fbf3a', '#14231e', '#f1efe8'], ['#1f4fa8', '#f1efe8', '#d4202c'], ['#f2a01e', '#14306e', '#f1efe8'], ['#14306e', '#3fb7d8', '#e8b923'],
];
/** Схема, отримана з кола кольорів: незвичні поєднання, яких немає в готових. */
const harmony = (rnd) => {
  const h = rnd() * 360, kind = pick([150, 180, 210, 120, 60], rnd), dark = rnd() < 0.3;
  const a = dark ? hsl(h, 0.55, 0.2) : hsl(h, 0.72, 0.42 + rnd() * 0.12), b = hsl((h + kind) % 360, 0.78, 0.5 + rnd() * 0.12);
  return [a, b, rnd() < 0.5 ? PAPER : hsl((h + kind + 90) % 360, 0.75, 0.55)];
};

// ------------------------------------------------------------------ генератор
const CHANCE = (rnd, p) => rnd() < p;
const STYLE = {
  classic: {
    pats: ['h2', 'v2', 'h3', 'v3', 'band', 'pale', 'tri5', 'cross', 'nordic', 'plus', 'salt', 'bend', 'chev', 'pile', 'border', 'quad', 'h5', 'v5', 'canton'],
    ems: ['star', 'three', 'crown', 'wheel', 'trident', 'ball', 'shield', 'star8', 'sun', 'tower', 'anchor', 'loco', 'cup', 'moons'],
    ovs: ['none', 'none', 'none', 'stars', 'trim', 'hoist', 'corners', 'stars5'], pls: ['none', 'none', 'disc', 'shield'], edges: ['thin', 'white', 'gold', 'double'], hue: 0.08,
  },
  herald: {
    pats: ['quad', 'gyro', 'x4', 'salt', 'cross', 'border', 'pale', 'chk', 'loz', 'chv3', 'vee', 'pall', 'nordic', 'bend3'],
    ems: ['eagle', 'wolf', 'bull', 'stag', 'dragon', 'phoenix', 'horse', 'swords', 'sword', 'axe', 'mace', 'tower', 'crown', 'trident', 'shield', 'fox', 'wing', 'leaf'],
    ovs: ['none', 'laurel', 'arc', 'circle', 'corners', 'ring'], pls: ['shield', 'shield', 'disc', 'oct', 'dia', 'star'], edges: ['gold', 'double', 'white', 'wide'], hue: 0.05,
  },
  modern: {
    pats: ['swoop', 'corner', 'arrow', 'bend3', 'bars', 'diag', 'chv3', 'rise', 'sea', 'wave', 'teeth', 'disc', 'ring', 'tri5', 'bend', 'v9', 'h9', 'chk2'],
    ems: ['bolt', 'star4', 'comet', 'rocket', 'flame', 'arrow', 'shark', 'gear', 'drop', 'snow', 'wing', 'letterv', 'paw', 'none', 'moon'],
    ovs: ['none', 'speed', 'arrows', 'fly', 'sash', 'grid', 'none'], pls: ['none', 'none', 'none', 'hex', 'dia', 'sq'], edges: ['none', 'none', 'thin', 'white'], hue: 0.35,
  },
  wild: {
    pats: ['sun', 'sun2', 'peak', 'zig', 'wave3', 'sea', 'dots', 'loz', 'gyro', 'chk2', 'teeth', 'pall', 'x4', 'vee', 'rise', 'bars'],
    ems: ['dragon', 'flame', 'wolf', 'fox', 'sun', 'peak', 'pine', 'phoenix', 'paw', 'light', 'heart', 'moons', 'star6', 'comet', 'shark', 'horse', 'shoe', 'none'],
    ovs: ['circle', 'arc', 'corners', 'speed', 'stars', 'none', 'laurel', 'ring', 'fly'], pls: ['none', 'disc', 'star', 'hex', 'dia'], edges: ['none', 'white', 'wide', 'double', 'gold'], hue: 0.6,
  },
};
export const FLAG_STYLES = Object.keys(STYLE);

/** Колір знака, що читається на тлі: спершу задані, потім чорний чи білий. */
const legible = (bgs, opts) => {
  for (const o of opts) if (bgs.every((b) => contrast(o, b) >= 2.6)) return o;
  const best = (x) => Math.min(...bgs.map((b) => contrast(x, b)));
  return [INK, PAPER, GOLD].sort((p, q) => best(q) - best(p))[0];
};
/** Кольорова схема під стиль. */
export function rollColors(style = 'any', rnd = Math.random) {
  const st = STYLE[style] || STYLE[pick(FLAG_STYLES, rnd)];
  let [a, b, c] = CHANCE(rnd, st.hue) ? harmony(rnd) : pick(SCHEMES, rnd).slice();
  if (CHANCE(rnd, 0.3)) [b, c] = [c, b];
  if (contrast(a, b) < 1.5) b = contrast(a, PAPER) > contrast(a, INK) ? PAPER : INK;   // без двох однакових смуг і форми-суцільної плями
  return [a, b, c];
}
function fitEmblem(f, rnd) {
  const [a, b, c] = f.c;
  const under = f.pl !== 'none' ? null : BUSY.has(f.pat) ? [a, b] : [a];
  if (!under) {
    const plate = pick([PAPER, INK, c, b, a], rnd);
    f.c[4] = contrast(plate, a) >= 1.5 ? plate : (contrast(a, PAPER) > contrast(a, INK) ? PAPER : INK);
    f.c[3] = legible([f.c[4]], [c, a, b, GOLD, PAPER, INK].sort(() => rnd() - 0.5));
  } else {
    f.c[4] = contrast(a, PAPER) > contrast(a, INK) ? PAPER : INK;
    f.c[3] = legible(under, [c, b, GOLD, PAPER, INK]);
  }
}
/** Поділ редактора для кубика: 'all' — усе; 'field', 'emblem', 'colors', 'extra' — лише цю частину. */
export function rollFlag(style = 'any', base = null, part = 'all', rnd = Math.random) {
  const key = style === 'any' ? pick(FLAG_STYLES, rnd) : style, st = STYLE[key] || STYLE.classic;
  const f = base ? normFlag(base) : normFlag({});
  if (part === 'all' || part === 'colors') { const [a, b, c] = rollColors(key, rnd); f.c[0] = a; f.c[1] = b; f.c[2] = c; }
  if (part === 'all' || part === 'field') { f.pat = pick(st.pats, rnd); f.flip = CHANCE(rnd, 0.25) ? 1 : 0; }
  if (part === 'all' || part === 'extra') { f.ov = pick(st.ovs, rnd); f.edge = pick(st.edges, rnd); }
  if (part === 'all' || part === 'emblem') {
    f.em = pick(st.ems, rnd); f.pl = f.em === 'none' ? 'none' : pick(st.pls, rnd);
    f.pos = CHANCE(rnd, 0.72) ? 4 : pick([3, 0, 5, 2, 7], rnd);
    f.sz = 80 + Math.round(rnd() * 8) * 10; f.rot = CHANCE(rnd, 0.14) ? pick([-15, 15, -30, 30, 45], rnd) : 0;
    f.rep = CHANCE(rnd, 0.12) && f.pl === 'none' ? pick([2, 3], rnd) : 1;
    if (f.pl !== 'none') f.sz = Math.min(f.sz, f.pos === 4 ? 100 : 60);
    if (f.pos !== 4) f.sz = Math.min(f.sz, 90);
    if (f.rep > 1) { f.sz = 50 + Math.round(rnd() * 2) * 10; f.pos = 4; }
  }
  if (part !== 'field' && part !== 'extra') fitEmblem(f, rnd);
  return f;
}

// ------------------------------------------------------------------ дані
const HEX = /^#[0-9a-f]{6}$/i;
const hexOr = (v, d) => (typeof v === 'string' && HEX.test(v) ? v : d);
const intOr = (v, a, b, d) => (Number.isFinite(+v) ? clamp(Math.round(+v), a, b) : d);
const oneOf = (v, list, d) => (list.includes(v) ? v : d);
/** Перевіряє будь-який прапор (свій старий чи чужий із мережі): лише відомі значення, жодного HTML. */
export function normFlag(f) {
  f = f && typeof f === 'object' ? f : {};
  const c = Array.isArray(f.c) ? f.c : [];
  const a = hexOr(c[0], '#254e9c'), b = hexOr(c[1], '#e4e8ec'), t = hexOr(c[2], '#e8b923');
  return {
    pat: oneOf(f.pat, FLAG_PATS, 'h2'), c: [a, b, t, hexOr(c[3], t), hexOr(c[4], contrast(a, PAPER) > contrast(a, INK) ? PAPER : INK)],
    em: oneOf(f.em, FLAG_EMB, 'none'), pl: oneOf(f.pl, FLAG_PLATES, 'none'), ov: oneOf(f.ov, FLAG_OVS, 'none'), edge: oneOf(f.edge, FLAG_EDGES, 'thin'),
    pos: intOr(f.pos, 0, 8, 4), sz: intOr(f.sz, 40, 200, 100), rot: intOr(f.rot, -180, 180, 0), rep: intOr(f.rep, 1, 3, 1), flip: f.flip ? 1 : 0,
  };
}
/** Старий клуб: його вибір лишається, а прапор отримує оздобу, плашку й рамку, щоб не бути схожим на інші. */
export function upgradeFlag(f, rnd = Math.random) {
  if (f && f.ov !== undefined) return normFlag(f);
  const n = normFlag(f), k = pick(FLAG_STYLES, rnd), st = STYLE[k];
  n.ov = pick(st.ovs, rnd); n.edge = pick(st.edges, rnd);
  if (n.em !== 'none') n.pl = pick(st.pls, rnd);
  if (n.pl !== 'none') fitEmblem(n, rnd);
  return n;
}
