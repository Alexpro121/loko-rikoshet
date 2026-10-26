import * as THREE from 'three';
import { rng } from './voxel.js';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function tex(c, { repeat = false, mip = true, aniso = 4 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping; }
  if (!mip) { t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; }
  t.anisotropy = aniso;
  return t;
}

// ---------------------------------------------------------------- атлас гравців: обличчя + номери
const CELL = 32, COLS = 8, ROWS = 16, AW = COLS * CELL, AH = ROWS * CELL;
export const ATLAS = { cell: CELL, cols: COLS, rows: ROWS, w: AW, h: AH };
const FACES = ['neutral', 'happy', 'shock', 'angry'];
const NUMS = 32;             // номери 0..31 у двох варіантах (темний/світлий напис)

/** Комірка атласу -> [u0, v0, u1, v1] з відступом пів-текселя. */
export function cellRect(cx, cy) {
  const e = 0.6;
  return [(cx * CELL + e) / AW, 1 - ((cy + 1) * CELL - e) / AH, ((cx + 1) * CELL - e) / AW, 1 - (cy * CELL + e) / AH];
}
export const WHITE_CELL = cellRect(0, 0);
export const faceCell = (expr) => cellRect(1 + Math.max(0, FACES.indexOf(expr)), 0);
export function numberCell(num, light) {
  const i = (Math.max(0, Math.min(NUMS - 1, num))) + (light ? NUMS : 0);
  return cellRect(i % COLS, 1 + ((i / COLS) | 0));
}

let _atlas = null;
export function playerAtlas() {
  if (_atlas) return _atlas;
  const c = canvas(AW, AH), g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.fillStyle = '#fff'; g.fillRect(0, 0, AW, AH);
  // обличчя: пікселі 16×16 у клітинці 32×32, на білому тлі (колір шкіри дає вершинний колір)
  FACES.forEach((expr, k) => {
    const x0 = (1 + k) * CELL, f = CELL / 16;
    const px = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x0 + x * f, y * f, w * f, h * f); };
    const ink = '#1b1f27', brow = '#3a2616', mouth = '#8a2a33';
    if (expr === 'happy') { px(3, 6, 1, 1, ink); px(4, 5, 1, 1, ink); px(5, 6, 1, 1, ink); px(10, 6, 1, 1, ink); px(11, 5, 1, 1, ink); px(12, 6, 1, 1, ink); }
    else if (expr === 'shock') { px(4, 5, 2, 3, ink); px(10, 5, 2, 3, ink); }
    else { px(4, 6, 2, 2, ink); px(10, 6, 2, 2, ink); }
    if (expr === 'angry') { px(2, 4, 3, 1, brow); px(4, 5, 1, 1, brow); px(11, 4, 3, 1, brow); px(11, 5, 1, 1, brow); }
    else if (expr === 'shock') { px(3, 3, 3, 1, brow); px(10, 3, 3, 1, brow); }
    else { px(3, 4, 3, 1, brow); px(10, 4, 3, 1, brow); }
    if (expr === 'happy') { px(5, 10, 6, 1, mouth); px(6, 11, 4, 1, mouth); }
    else if (expr === 'shock') { px(7, 10, 2, 3, mouth); }
    else if (expr === 'angry') { px(5, 12, 6, 1, mouth); }
    else { px(6, 11, 4, 1, mouth); }
  });
  // номери: темні на світлій плашці й світлі на темній
  g.imageSmoothingEnabled = true;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let v = 0; v < 2; v++) for (let n = 0; n < NUMS; n++) {
    const i = n + v * NUMS, x = (i % COLS) * CELL, y = (1 + ((i / COLS) | 0)) * CELL;
    g.fillStyle = v ? '#23282d' : '#f1efe8'; g.fillRect(x, y, CELL, CELL);
    g.fillStyle = v ? '#f1efe8' : '#13321f'; g.font = `800 ${n > 9 ? 21 : 25}px Rubik, "Arial Black", sans-serif`;
    g.fillText(String(n), x + CELL / 2, y + CELL / 2 + 1);
  }
  _atlas = tex(c, { mip: true, aniso: 4 });
  _atlas.magFilter = THREE.LinearFilter;
  return _atlas;
}

// ---------------------------------------------------------------- газон
/** Газон: смуги покосу, ледь помітний шум, витоптані місця. Одна текстура на весь майданчик. */
export function grassTexture(L, W, G) {
  const w = 1536, h = Math.round(1536 * (2 * W) / (2 * L)), c = canvas(w, h), g = c.getContext('2d');
  const r = rng(21);
  const stripes = 18, sw = w / stripes;
  for (let i = 0; i < stripes; i++) { g.fillStyle = i % 2 ? '#3f8a3c' : '#377f35'; g.fillRect(i * sw, 0, sw + 1, h); }
  // велике «хмарне» варіювання кольору
  for (let i = 0; i < 90; i++) {
    const x = r() * w, y = r() * h, rad = 30 + r() * 90;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    const dark = r() > 0.5;
    gr.addColorStop(0, dark ? 'rgba(20,60,25,0.16)' : 'rgba(150,200,90,0.10)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // дрібне зерно трави
  for (let i = 0; i < 26000; i++) {
    const x = r() * w, y = r() * h, l = 0.5 + r() * 0.5;
    g.fillStyle = r() > 0.5 ? `rgba(20,70,25,${0.10 + r() * 0.12})` : `rgba(160,210,100,${0.06 + r() * 0.10})`;
    g.fillRect(x, y, 1 + r() * 1.5, 1 + l * 2);
  }
  // витоптані зони: центр і воротарські
  const wear = (x, y, rx, ry, a) => { g.save(); g.translate(x, y); g.scale(1, ry / rx); const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx); gr.addColorStop(0, `rgba(130,110,60,${a})`); gr.addColorStop(1, 'rgba(130,110,60,0)'); g.fillStyle = gr; g.fillRect(-rx, -rx, rx * 2, rx * 2); g.restore(); };
  wear(w / 2, h / 2, 90, 90, 0.26);
  wear(50, h / 2, 130, 100, 0.32); wear(w - 50, h / 2, 130, 100, 0.32);
  const t = tex(c, { aniso: 8 });
  return t;
}

// ---------------------------------------------------------------- рекламні борти
export function boardTexture() {
  const w = 2048, h = 96, c = canvas(w, h), g = c.getContext('2d');
  const blocks = [
    ['ЛОКО', '#8f1220', '#f1efe8'], ['ЗАЛІЗНИЧНИКИ', '#0e5a38', '#f1efe8'], ['КИЇВ · 1919', '#1c2328', '#e8b923'], ['СТОП', '#a3182a', '#f1efe8'],
    ['ВПЕРЕД', '#157a46', '#f1efe8'], ['СТАДІОН ЛОКОМОТИВ · 1925', '#e8e4d8', '#1c2328'], ['ЛОКО РУХАЄТЬСЯ ВПЕРЕД', '#1c2328', '#f1efe8'],
  ];
  g.textBaseline = 'middle';
  let x = 0, i = 0;
  while (x < w) {
    const [t, bg, fg] = blocks[i % blocks.length];
    g.font = '800 46px Rubik, "Arial Black", sans-serif';
    const bw = g.measureText(t).width + 90;
    g.fillStyle = bg; g.fillRect(x, 0, bw, h);
    g.fillStyle = fg; g.fillText(t, x + 45, h / 2 + 3);
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x + bw - 3, 0, 3, h);
    x += bw; i++;
  }
  const t = tex(c, { repeat: true, aniso: 8 });
  return { texture: t, width: x };
}

// ---------------------------------------------------------------- сітка воріт, тінь
let _net = null;
export function netTexture() {
  if (_net) return _net;
  const c = canvas(32, 32), g = c.getContext('2d');
  g.strokeStyle = 'rgba(245,248,245,0.9)'; g.lineWidth = 3;
  g.strokeRect(0, 0, 32, 32);
  _net = tex(c, { repeat: true });
  return _net;
}

export function netPlane(w, h, cell = 0.5) {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (w / cell), uv.getY(i) * (h / cell));
  return g;
}

let _shadow = null;
export function shadowTexture() {
  if (_shadow) return _shadow;
  const c = canvas(64, 64), g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  gr.addColorStop(0, 'rgba(0,0,0,0.85)'); gr.addColorStop(0.55, 'rgba(0,0,0,0.45)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  _shadow = tex(c, { aniso: 1 });
  return _shadow;
}

/** Банер для табло на острові. */
export function bannerTexture(words, bg = '#0e5a38') {
  const c = canvas(2048, 64), g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 2048, 64);
  g.font = '800 38px Rubik, "Arial Black", sans-serif'; g.textBaseline = 'middle';
  let x = 24, i = 0;
  while (x < 2048) { const w = words[i % words.length]; g.fillStyle = '#f1efe8'; g.fillText(w, x, 34); x += g.measureText(w).width + 46; i++; }
  return tex(c);
}

/** Вивіска: текст на однотонному тлі з рамкою. */
export function signTexture(text, bg = '#0e5a38', fg = '#f1efe8') {
  const c = canvas(512, 100), g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 512, 100);
  g.strokeStyle = fg; g.lineWidth = 6; g.strokeRect(6, 6, 500, 88);
  g.fillStyle = fg; g.font = '800 46px Rubik, "Arial Black", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 256, 54);
  return tex(c, { aniso: 4 });
}
