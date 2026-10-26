import * as THREE from 'three';
import { rng } from './voxel.js';
import { whenLogo, logoReady, logoImg } from './logo.js';

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
const CELL = 32, COLS = 8, ROWS = 32, AW = COLS * CELL, AH = ROWS * CELL;
export const ATLAS = { cell: CELL, cols: COLS, rows: ROWS, w: AW, h: AH };
const FACES = ['neutral', 'happy', 'shock', 'angry'];
const NUMS = 100;            // номери 0..99 у двох варіантах (темний/світлий напис)

/** Комірка атласу -> [u0, v0, u1, v1] з відступом пів-текселя. */
export function cellRect(cx, cy) {
  const e = 0.6;
  return [(cx * CELL + e) / AW, 1 - ((cy + 1) * CELL - e) / AH, ((cx + 1) * CELL - e) / AW, 1 - (cy * CELL + e) / AH];
}
export const WHITE_CELL = cellRect(0, 0);
export const faceCell = (expr, beard = 0) => {
  const k = Math.max(0, FACES.indexOf(expr));
  if (!beard) return cellRect(1 + k, 0);
  const idx = (beard - 1) * 4 + k;
  return cellRect(idx % COLS, 27 + ((idx / COLS) | 0));
};
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
  // обличчя: 16×16 пікселів у клітинці 32×32 на білому тлі (колір шкіри дає вершинний колір): очі з білками й відблиском, брови, ніс, рот, щоки; бороди окремими варіантами
  const drawFace = (x0, y0, expr, beard) => {
    const f = CELL / 16;
    const px = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x0 + x * f, y0 + y * f, w * f, h * f); };
    const ink = '#161a21', brow = '#3a2616', mouth = '#7a2530', tooth = '#fbf6ee', shade = 'rgba(60,30,20,0.16)', blush = 'rgba(235,90,90,0.30)';
    // брови
    if (expr === 'angry') { px(2, 3, 3, 1, brow); px(4, 4, 1, 1, brow); px(11, 3, 3, 1, brow); px(11, 4, 1, 1, brow); }
    else if (expr === 'shock') { px(2, 2, 3, 1, brow); px(11, 2, 3, 1, brow); }
    else if (expr === 'happy') { px(2, 3, 3, 1, brow); px(11, 3, 3, 1, brow); px(3, 2, 1, 1, brow); px(12, 2, 1, 1, brow); }
    else { px(2, 3, 3, 1, brow); px(11, 3, 3, 1, brow); }
    // очі
    const eye = (ex) => {
      if (expr === 'happy') { px(ex, 6, 1, 1, ink); px(ex + 1, 5, 2, 1, ink); px(ex + 3, 6, 1, 1, ink); }
      else if (expr === 'shock') { px(ex, 4, 4, 4, '#fff'); px(ex + 1, 5, 2, 2, ink); px(ex + 1, 5, 1, 1, '#fff'); }
      else { px(ex, 5, 4, 3, '#fff'); px(ex + 1, 5, 2, 3, ink); px(ex + 1, 5, 1, 1, '#fff'); if (expr === 'angry') px(ex, 5, 4, 1, shade); }
    };
    eye(2); eye(10);
    // ніс і тіні
    px(7, 7, 2, 3, shade); px(6, 9, 4, 1, 'rgba(60,30,20,0.22)'); px(7, 6, 2, 1, 'rgba(255,255,255,0.18)');
    // щоки
    if (expr === 'happy') { px(1, 9, 2, 1, blush); px(13, 9, 2, 1, blush); }
    // бороди (нижня частина обличчя)
    const bcol = 'rgba(38,24,16,0.92)', st = 'rgba(38,24,16,0.34)';
    if (beard === 1) { for (let y = 9; y < 16; y++) for (let x = 2; x < 14; x++) if ((x + y) % 2 === 0 && !(y >= 11 && y <= 12 && x >= 5 && x <= 10)) px(x, y, 1, 1, st); }
    if (beard === 2) { px(4, 9, 8, 1, bcol); px(3, 10, 3, 1, bcol); px(10, 10, 3, 1, bcol); }
    if (beard === 3) { px(1, 8, 2, 7, bcol); px(13, 8, 2, 7, bcol); px(2, 13, 12, 2, bcol); px(3, 15, 10, 1, bcol); px(3, 9, 10, 1, bcol); px(4, 10, 2, 3, bcol); px(10, 10, 2, 3, bcol); px(5, 13, 6, 1, bcol); }
    // рот
    const my = beard === 3 ? 11 : 11;
    if (expr === 'happy') { px(5, my, 6, 1, mouth); px(6, my, 4, 1, tooth); px(6, my + 1, 4, 1, mouth); px(4, my - 1, 1, 1, mouth); px(11, my - 1, 1, 1, mouth); }
    else if (expr === 'shock') { px(6, my, 4, 3, mouth); px(7, my + 1, 2, 1, '#c24a56'); px(6, my, 4, 1, tooth); }
    else if (expr === 'angry') { px(5, my + 1, 6, 1, mouth); px(4, my + 2, 1, 1, mouth); px(11, my + 2, 1, 1, mouth); px(6, my, 4, 1, 'rgba(250,246,238,0.85)'); }
    else { px(6, my, 4, 1, mouth); px(5, my, 1, 1, 'rgba(122,37,48,0.5)'); px(10, my, 1, 1, 'rgba(122,37,48,0.5)'); }
  };
  FACES.forEach((expr, k) => {
    drawFace((1 + k) * CELL, 0, expr, 0);
    for (let bd = 1; bd <= 3; bd++) { const idx = (bd - 1) * 4 + k; drawFace((idx % COLS) * CELL, (27 + ((idx / COLS) | 0)) * CELL, expr, bd); }
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
  const w = 4096, h = 160, c = canvas(w, h), g = c.getContext('2d');
  const FONT = (px) => `800 ${px}px Rubik, "Arial Black", sans-serif`;
  let opp = { name: 'ГОСТІ', kit: { main: '#254e9c', second: '#e4e8ec' } };
  const icon = {
    ball: (x, y, r) => { g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill(); g.fillStyle = '#1c1c1e'; g.beginPath(); for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + k * 1.2566; g.lineTo(x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.5); } g.closePath(); g.fill(); },
    semaphore: (x, y, r) => { g.fillStyle = '#0b0f12'; g.fillRect(x - r * 0.9, y - r * 1.5, r * 1.8, r * 3); g.fillStyle = '#ff3b4a'; g.beginPath(); g.arc(x, y - r * 0.7, r * 0.5, 0, 6.283); g.fill(); g.fillStyle = '#3fe08f'; g.beginPath(); g.arc(x, y + r * 0.7, r * 0.5, 0, 6.283); g.fill(); },
    rail: (x, y, r, col) => { g.strokeStyle = col; g.lineWidth = 4; g.beginPath(); g.moveTo(x - r * 1.6, y - r * 0.6); g.lineTo(x + r * 1.6, y - r * 0.6); g.moveTo(x - r * 1.6, y + r * 0.6); g.lineTo(x + r * 1.6, y + r * 0.6); g.stroke(); g.lineWidth = 6; for (let k = -3; k <= 3; k++) { g.beginPath(); g.moveTo(x + k * r * 0.5, y - r * 0.95); g.lineTo(x + k * r * 0.5 - 6, y + r * 0.95); g.stroke(); } },
    chev: (x, y, r, col) => { g.fillStyle = col; for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(x + k * r * 0.7, y - r); g.lineTo(x + k * r * 0.7 + r * 0.6, y); g.lineTo(x + k * r * 0.7, y + r); g.lineTo(x + k * r * 0.7 - r * 0.25, y + r); g.lineTo(x + k * r * 0.7 + r * 0.35, y); g.lineTo(x + k * r * 0.7 - r * 0.25, y - r); g.closePath(); g.fill(); } },
  };
  /** Кожен блок: [ширина, малюнок]. Усе малюється на LED-панелі: градієнти, смуги, значки. */
  const blocks = () => [
    [700, (x, bw) => { const gr = g.createLinearGradient(x, 0, x + bw, 0); gr.addColorStop(0, '#d4202c'); gr.addColorStop(1, '#8f1220'); g.fillStyle = gr; g.fillRect(x, 0, bw, h); g.fillStyle = '#1f8f3f'; g.beginPath(); g.moveTo(x + bw * 0.62, 0); g.lineTo(x + bw * 0.78, 0); g.lineTo(x + bw * 0.62, h); g.lineTo(x + bw * 0.46, h); g.fill(); const lg = logoReady(); if (lg) g.drawImage(logoImg(), x + 28, 14, 132 * 166 / 180, 132); g.save(); g.transform(1, 0, -0.2, 1, 0, 0); g.fillStyle = '#fff'; g.font = FONT(88); g.textBaseline = 'middle'; g.fillText('LOKO RUSH', x + (lg ? 215 : 70), h / 2 + 18); g.restore(); }],
    [620, (x, bw) => { g.fillStyle = '#0e5a38'; g.fillRect(x, 0, bw, h); g.fillStyle = '#157a46'; g.fillRect(x, h * 0.62, bw, h * 0.38); icon.rail(x + 150, h * 0.5, 38, '#f1efe8'); g.fillStyle = '#f1efe8'; g.font = FONT(58); g.textBaseline = 'middle'; g.fillText('УЗ ЕКСПРЕС', x + 250, h * 0.4); g.font = FONT(26); g.fillStyle = '#bfe9d2'; g.fillText('ЛОКО ЇДЕ ВПЕРЕД', x + 252, h * 0.76); }],
    [560, (x, bw) => { g.fillStyle = '#1c2328'; g.fillRect(x, 0, bw, h); g.fillStyle = '#e8b923'; g.fillRect(x, h - 14, bw, 14); icon.ball(x + 90, h * 0.46, 42); g.fillStyle = '#e8b923'; g.font = FONT(64); g.textBaseline = 'middle'; g.fillText('КИЇВ · 1919', x + 160, h * 0.46); }],
    [520, (x, bw) => { g.fillStyle = '#f1efe8'; g.fillRect(x, 0, bw, h); icon.semaphore(x + 80, h * 0.5, 34); g.fillStyle = '#c8202b'; g.font = FONT(78); g.textBaseline = 'middle'; g.fillText('СТОП', x + 150, h * 0.5 + 4); g.fillStyle = '#157a46'; g.fillText('›', x + bw - 70, h * 0.5 + 2); }],
    [640, (x, bw) => { const gr = g.createLinearGradient(x, 0, x, h); gr.addColorStop(0, opp.kit.main); gr.addColorStop(1, opp.kit.main); g.fillStyle = gr; g.fillRect(x, 0, bw, h); g.fillStyle = opp.kit.second; g.fillRect(x, 0, 18, h); g.fillRect(x + bw - 18, 0, 18, h); g.font = FONT(26); g.textBaseline = 'middle'; g.fillText('ГОСТІ', x + 50, h * 0.2); let fs = 78; g.font = FONT(fs); while (g.measureText(opp.name).width > bw - 120 && fs > 24) { fs -= 4; g.font = FONT(fs); } g.fillStyle = opp.kit.second; g.fillText(opp.name, x + 60, h * 0.58); }],
    [680, (x, bw) => { g.fillStyle = '#e8e4d8'; g.fillRect(x, 0, bw, h); g.fillStyle = '#c8202b'; g.fillRect(x, 0, bw, 12); g.fillStyle = '#157a46'; g.fillRect(x, h - 12, bw, 12); g.fillStyle = '#1c2328'; g.font = FONT(54); g.textBaseline = 'middle'; g.fillText('СТАДІОН ЛОКОМОТИВ', x + 40, h * 0.42); g.font = FONT(34); g.fillText('З 1925 РОКУ · ЗАЛІЗНИЧНИКИ', x + 42, h * 0.74); }],
    [480, (x, bw) => { g.fillStyle = '#0b1114'; g.fillRect(x, 0, bw, h); icon.chev(x + 70, h * 0.5, 44, '#e02a38'); g.fillStyle = '#f1efe8'; g.font = FONT(64); g.textBaseline = 'middle'; g.fillText('ВПЕРЕД!', x + 240, h * 0.52); }],
    [520, (x, bw) => { g.fillStyle = '#157a46'; g.fillRect(x, 0, bw, h); icon.ball(x + 90, h * 0.5, 44); g.fillStyle = '#fff'; g.font = FONT(56); g.textBaseline = 'middle'; g.fillText('FAIR PLAY', x + 160, h * 0.5 + 2); }],
  ];
  const t = tex(c, { repeat: true, aniso: 8 });
  let total = 0;
  const redraw = () => {
    g.clearRect(0, 0, w, h);
    let x = 0, i = 0; const list = blocks();
    while (x < w - 1) {
      const [bw0, draw] = list[i % list.length];
      const bw = Math.min(bw0, w - x);
      draw(x, bw0);
      g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(x + bw - 4, 0, 4, h);
      x += bw; i++;
    }
    total = x;
    // LED-ефект: світлий верх, темніший низ і ледь помітна сітка пікселів
    const sh = g.createLinearGradient(0, 0, 0, h); sh.addColorStop(0, 'rgba(255,255,255,0.14)'); sh.addColorStop(0.5, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.28)');
    g.fillStyle = sh; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(0,0,0,0.12)'; for (let yy = 0; yy < h; yy += 5) g.fillRect(0, yy, w, 1.2);
    t.needsUpdate = true;
  };
  redraw(); whenLogo(() => redraw());
  return { texture: t, get width() { return w; }, redraw: (club) => { if (club) opp = { name: String(club.name).toUpperCase(), kit: { main: club.kit.main, second: club.kit.second } }; redraw(); } };
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
