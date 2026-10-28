import * as THREE from 'three';
import { rng } from './voxel.js';
import { whenLogo, logoReady, logoImg } from './logo.js';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function tex(c, { repeat = false, mip = true, aniso = 16 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping; }
  if (!mip) { t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; }
  t.anisotropy = aniso;
  return t;
}

// ---------------------------------------------------------------- атлас гравців: обличчя + номери
const CELL = 64, COLS = 8, ROWS = 32, AW = COLS * CELL, AH = ROWS * CELL;
export const ATLAS = { cell: CELL, cols: COLS, rows: ROWS, w: AW, h: AH };
const FACES = ['neutral', 'happy', 'shock', 'angry'];
const NUMS = 100;            // номери 0..99 у двох варіантах (темний/світлий напис)

/** Комірка атласу -> [u0, v0, u1, v1] з відступом пів-текселя. */
export function cellRect(cx, cy) {
  const e = CELL / 32 * 0.8;
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

const SPONSOR_CELL = [0, 29], CREST_CELL = [1, 29];
export const sponsorCell = () => cellRect(...SPONSOR_CELL);
export const crestCell = () => cellRect(...CREST_CELL);

let _atlas = null;
export function playerAtlas() {
  if (_atlas) return _atlas;
  const c = canvas(AW, AH), g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.fillStyle = '#fff'; g.fillRect(0, 0, AW, AH);
  // обличчя: піксель-арт 32×32 на білому тлі (колір шкіри дає вершинний колір): брови з тінню, очі з райдужкою, зіницею,
  // повікою й відблиском, ніс із ніздрями, губи, вилиці й підборіддя; бороди окремими варіантами
  const drawFace = (x0, y0, expr, beard) => {
    const f = CELL / 32;
    const px = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x0 + x * f, y0 + y * f, w * f, h * f); };
    const ink = '#14181f', iris = '#4a3322', brow = '#33210f', lid = 'rgba(70,35,25,0.35)', lip = '#a2525a', lipD = '#6e2630', tooth = '#fbf6ee';
    const sh = (a) => `rgba(90,45,30,${a})`, hi = (a) => `rgba(255,240,225,${a})`;
    // об'єм: тінь під бровами, вилиці, щоки, підборіддя, скроні
    px(3, 9, 9, 1, sh(0.12)); px(20, 9, 9, 1, sh(0.12));
    px(1, 15, 3, 7, sh(0.07)); px(28, 15, 3, 7, sh(0.07));
    px(10, 29, 12, 2, sh(0.12)); px(12, 27, 8, 1, hi(0.1));
    px(13, 4, 6, 3, hi(0.08));
    // брови
    const browL = (x, y, tilt) => { for (let i = 0; i < 7; i++) px(x + i, y + Math.round(tilt * (i - 3) / 3), 1, 2, brow); };
    const browR = (x, y, tilt) => { for (let i = 0; i < 7; i++) px(x + i, y - Math.round(tilt * (i - 3) / 3), 1, 2, brow); };
    if (expr === 'angry') { browL(5, 7, 1.4); browR(20, 7, 1.4); px(14, 8, 4, 1, sh(0.2)); }
    else if (expr === 'shock') { browL(5, 5, -0.7); browR(20, 5, -0.7); }
    else if (expr === 'happy') { browL(5, 6, -0.4); browR(20, 6, -0.4); }
    else { browL(5, 7, 0); browR(20, 7, 0); }
    // очі
    const eye = (ex, side) => {
      if (expr === 'happy') {                                       // примружені дуги
        px(ex, 12, 1, 1, ink); px(ex + 1, 11, 5, 1, ink); px(ex + 6, 12, 1, 1, ink); px(ex + 1, 13, 5, 1, hi(0.25));
        return;
      }
      const top = expr === 'shock' ? 9 : 10, h = expr === 'shock' ? 6 : 5;
      px(ex, top, 7, h, '#f6f2ea');                                  // білок
      const ix = ex + 2 + (side > 0 ? 0 : 0);
      px(ix, top + (expr === 'shock' ? 1 : 0), 3, Math.min(5, h), iris);   // райдужка
      px(ix + 1, top + (expr === 'shock' ? 2 : 1), 2, 2, ink);       // зіниця
      px(ix + 1, top + (expr === 'shock' ? 1 : 0), 1, 1, '#ffffff'); // відблиск
      px(ex, top - 1, 7, 1, ink);                                    // верхня повіка й вії
      px(ex - 1, top, 1, 1, ink); px(ex + 7, top, 1, 1, ink);
      px(ex + 1, top + h, 5, 1, lid);                                // нижня повіка
      if (expr === 'angry') px(ex, top, 7, 2, sh(0.35));             // насуплена повіка
    };
    eye(5, -1); eye(20, 1);
    // ніс: спинка з відблиском, тінь збоку, ніздрі
    px(15, 12, 2, 7, hi(0.18)); px(17, 12, 1, 8, sh(0.16)); px(13, 19, 6, 1, sh(0.2)); px(13, 18, 1, 1, sh(0.35)); px(18, 18, 1, 1, sh(0.35));
    px(14, 20, 4, 1, sh(0.12));
    if (expr === 'happy') { px(4, 18, 4, 2, 'rgba(235,90,90,0.28)'); px(24, 18, 4, 2, 'rgba(235,90,90,0.28)'); }
    // бороди
    const bcol = 'rgba(38,24,16,0.92)', st = 'rgba(38,24,16,0.28)';
    if (beard === 1) { for (let y = 19; y < 32; y++) for (let x = 3; x < 29; x++) if ((x * 7 + y * 3) % 4 === 0 && !(y >= 22 && y <= 26 && x >= 10 && x <= 21)) px(x, y, 1, 1, st); }
    if (beard === 2) { px(9, 21, 14, 2, bcol); px(8, 22, 3, 3, bcol); px(21, 22, 3, 3, bcol); px(14, 21, 4, 1, 'rgba(38,24,16,0.6)'); }
    if (beard === 3) {
      px(2, 15, 4, 14, bcol); px(26, 15, 4, 14, bcol); px(4, 26, 24, 4, bcol); px(7, 30, 18, 2, bcol);
      px(9, 21, 14, 2, bcol); px(8, 22, 3, 5, bcol); px(21, 22, 3, 5, bcol); px(11, 27, 10, 1, bcol);
    }
    // рот
    const my = 23;
    if (expr === 'happy') { px(9, my - 1, 1, 1, lipD); px(22, my - 1, 1, 1, lipD); px(10, my, 12, 1, lipD); px(10, my + 1, 12, 2, tooth); px(11, my + 3, 10, 1, lipD); px(12, my + 4, 8, 1, lip); }
    else if (expr === 'shock') { px(12, my, 8, 1, lip); px(11, my + 1, 10, 4, lipD); px(12, my + 1, 8, 1, tooth); px(13, my + 3, 6, 2, '#c24a56'); px(12, my + 5, 8, 1, lip); }
    else if (expr === 'angry') { px(10, my, 12, 1, lipD); px(10, my + 1, 12, 2, 'rgba(250,246,238,0.9)'); px(14, my + 1, 1, 2, sh(0.4)); px(18, my + 1, 1, 2, sh(0.4)); px(10, my + 3, 12, 1, lipD); px(9, my + 3, 1, 1, lipD); px(22, my + 3, 1, 1, lipD); }
    else { px(11, my, 10, 1, lip); px(10, my + 1, 12, 1, lipD); px(11, my + 2, 10, 1, lip); px(13, my + 3, 6, 1, sh(0.15)); }
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
    g.fillStyle = v ? '#f1efe8' : '#13321f'; g.font = `800 ${(n > 9 ? 21 : 25) * CELL / 32}px Rubik, "Arial Black", sans-serif`;
    g.fillText(String(n), x + CELL / 2, y + CELL / 2 + CELL / 32);
  }
  // спонсор «УЗ» зі смугами на червоному тлі домашньої форми й емблема клубу (декалі на грудях)
  {
    const x = SPONSOR_CELL[0] * CELL, y = SPONSOR_CELL[1] * CELL;
    g.fillStyle = '#d4202c'; g.fillRect(x, y, CELL, CELL);
    g.fillStyle = '#f4f4ee'; g.font = `800 ${CELL * 0.5}px Rubik, "Arial Black", sans-serif`;
    g.fillText('УЗ', x + CELL / 2, y + CELL * 0.33);
    for (let k = 0; k < 3; k++) g.fillRect(x + CELL * 0.1, y + CELL * (0.66 + k * 0.12), CELL * 0.8, CELL * 0.06);
    const cx = CREST_CELL[0] * CELL, cy = CREST_CELL[1] * CELL, sh = (s, col) => {
      g.fillStyle = col; g.beginPath();
      g.moveTo(cx + CELL * (0.5 - 0.36 * s), cy + CELL * (0.5 - 0.4 * s)); g.lineTo(cx + CELL * (0.5 + 0.36 * s), cy + CELL * (0.5 - 0.4 * s));
      g.lineTo(cx + CELL * (0.5 + 0.36 * s), cy + CELL * (0.5 + 0.05 * s)); g.quadraticCurveTo(cx + CELL * (0.5 + 0.3 * s), cy + CELL * (0.5 + 0.34 * s), cx + CELL * 0.5, cy + CELL * (0.5 + 0.45 * s));
      g.quadraticCurveTo(cx + CELL * (0.5 - 0.3 * s), cy + CELL * (0.5 + 0.34 * s), cx + CELL * (0.5 - 0.36 * s), cy + CELL * (0.5 + 0.05 * s)); g.closePath(); g.fill();
    };
    g.fillStyle = '#d4202c'; g.fillRect(cx, cy, CELL, CELL);
    sh(1.08, '#f4f4ee'); sh(0.92, '#1f8f3f');
    g.fillStyle = '#d4202c'; g.fillRect(cx + CELL * 0.17, cy + CELL * 0.14, CELL * 0.66, CELL * 0.22);
    g.fillStyle = '#f4f4ee'; g.font = `800 ${CELL * 0.36}px Rubik, "Arial Black", sans-serif`; g.fillText('Л', cx + CELL / 2, cy + CELL * 0.6);
  }
  _atlas = tex(c, { mip: true, aniso: 16 });
  _atlas.magFilter = THREE.LinearFilter;
  return _atlas;
}

// ---------------------------------------------------------------- газон
/** Газон: смуги покосу, ледь помітний шум, витоптані місця. Одна текстура на весь майданчик. */
export function grassTexture(L, W, G) {
  const w = 2048, h = Math.round(2048 * (2 * W) / (2 * L)), c = canvas(w, h), g = c.getContext('2d');
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
