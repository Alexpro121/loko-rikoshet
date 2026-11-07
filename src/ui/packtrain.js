// openTrain: відкриття пака героїв — 3D-сцена на нічному пероні. Потяг ЛОКО (тепловоз у барвах герба) везе 20 критих вагонів
// кольорів рідкості — стільки кожного, скільки дають шанси пака, — і гальмує на випадковому вагоні з 3-го по 7-й: на тому, чий номер
// прийшов у відповіді (з 5-го по 7-й). Гальмування рахує поздовжня динаміка, як у справжнього складу (simulate): маси, автозчеплення з люфтом і
// поглинальним апаратом, гальмівна хвиля по магістралі й наповнення циліндрів; звідси набігання вагонів, удари зчеплень, іскри й скрип.
// Двері відʼїжджають, герой (справжня модель гравця) виходить із вагона на перон; потім кадр зсуває його ліворуч, праворуч — блок його параметрів.
// Свій WebGL-контекст лише на час сцени (kill звільняє його одразу), головний цикл гри тим часом стоїть (trainCovers).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import './packtrain.css';
import { PACKS, RARITY, TRAITS } from '../online/profile.js';
import { STAT_NAMES, ROLE_UA, keysFor, ovr } from '../state/squad.js';
import { Player } from '../graphics/player.js';
import { releaseTurntable } from './portrait.js';
import { TrainSound } from '../core/audio-train.js';
import { loadPerf } from '../core/perf.js';
import { setTrain, getTrain } from './trainstate.js';
export { trainBack, trainCovers } from './trainstate.js';

// ---------- розміри, м ----------
const LL = 21.5, P = 14.73, H2 = P / 2;        // тепловоз і критий вагон по осях зчеплення
const BODY0 = 0.45, BODY1 = 14.28, HALF = 1.62, ROOF = 4.62, EAVE = 4.22, FLOOR = 1.3;   // кузов 11-217: 13,8 × 3,25 × 4,7 м
const DOOR0 = 5.47, DOOR1 = 9.26, DOOR_TOP = 3.9;                                       // розсувні двері 3,8 м посередині
const RAIL = 0.15, PLAT = RAIL + FLOOR;         // голівка рейки; перон урівень із підлогою вагона
const V = 24, X0 = -34;                         // швидкість заїзду (86 км/год), ніс тепловоза на старті
// поздовжня динаміка (simulate): тепловоз 125 т, навантажений критий вагон 65 т; автозчеплення СА-3 з люфтом ±5 см і поглинальним апаратом;
// гальмо пневматичне: хвиля йде магістраллю ~250 м/с, циліндри наповнюються за ~1 с. Справжнє екстрене гальмування вантажного складу —
// 0,5–1,2 м/с², і зупинка тривала б 25–50 с, тому сила гальм тут ~4,5 м/с²: усе інше поводиться як у справжнього складу.
// Кузови на гальмуванні не нахиляються: у вантажного вагона жорсткі ресори, і нахил на око був би фальшивим.
const M_LOCO = 1.25e5, M_CAR = 6.5e4, SLK = 0.05, K_C = 3.2e6, C_C = 1.4e5;
const A_BR = 4.5, FILL_L = 0.7, FILL_C = 1.2, PIPE = 250, ROLL = 0.03, DT = 1 / 240, REC = 100;
const PW = 7, PZ = 0.22, PK = 0.0004;          // кузов на ресорах: власна частота, загасання, ледь помітне кивання від ударів зчеплень
const STOP_MIN = 5, STOP_MAX = 7;               // потяг стає на випадковому вагоні складу з 5-го по 7-й: не вгадати, звідки вийде герой
const N = 20, ORDER = ['c', 'r', 'e', 'l'];
const AX_LOCO = [2.75, 4.6, 6.45, 15.05, 16.9, 18.75], AX_CAR = [1.435, 3.285, 11.445, 13.295];   // осі від заднього краю
const HERO_Z0 = -0.6, HERO_PATH = [[0, 4.7]];   // герой із глибини вагона прямо крізь отвір дверей і далі до камери: стає на пів висоти екрана
const HERO_H = 2.35, HERO_C = 1.58, HERO_X = 0.27;   // кадр на героя: 2,35 м на всю висоту (від гомілок, із запасом на стрибок радості), центр на 1,58 м над пероном, герой на 27% ширини
const BX = 4.4;                                 // табло праворуч від дверей, над глухою частиною борту
const UA = { c: 'ЗВИЧАЙНИЙ', r: 'РІДКІСНИЙ', e: 'ЕПІЧНИЙ', l: 'ЛЕГЕНДА' };
const GRN = '#67B430', RED = '#E31119', FONT = 'Rubik, system-ui, sans-serif';
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)');
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (v) => { v = clamp01(v); return v * v * (3 - 2 * v); };
const easeOut = (v) => 1 - Math.pow(1 - clamp01(v), 3);

// ---------- геометрія: пласкі грані, колір у вершинах, усе злите; лише бік до перону має дрібні деталі ----------
const _c = new THREE.Color(), _c2 = new THREE.Color();
function paint(g, hex) {
  const n = g.attributes.position.count, a = new Float32Array(n * 3); _c.set(hex);
  for (let i = 0; i < n; i++) { a[i * 3] = _c.r; a[i * 3 + 1] = _c.g; a[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g;
}
const flat = (g) => { const n = g.index ? g.toNonIndexed() : g; if (n !== g) g.dispose(); if (n.attributes.uv) n.deleteAttribute('uv'); return n; };
function box(x0, x1, y0, y1, z0, z1, hex) { const g = flat(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0)); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); return paint(g, hex); }
/** Профіль у площині XY, видавлений по z. */
function prismZ(pts, z0, z1, hex) { const g = flat(new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y))), { depth: z1 - z0, bevelEnabled: false })); g.translate(0, 0, z0); return paint(g, hex); }
/** Переріз у площині ZY, видавлений уздовж x. */
function prismX(pts, x0, x1, hex) { const g = flat(new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y))), { depth: x1 - x0, bevelEnabled: false })); g.rotateY(Math.PI / 2); g.translate(x0, 0, 0); return paint(g, hex); }
function wheel(x, y, z, r, hex) { const g = flat(new THREE.CylinderGeometry(r, r, 0.14, 10)); g.rotateX(Math.PI / 2); g.translate(x, y, z); return paint(g, hex); }
/** Чотирикутник a-b-c-d; лицьовий бік — куди дивиться (b−a)×(c−a). */
function quad(a, b, c, d, hex) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...d], 3)); g.computeVertexNormals(); return paint(g, hex); }
const merge = (list) => { const g = mergeGeometries(list, false); for (const d of list) d.dispose(); return g; };
/** Вершини темнішають донизу: бруд і тінь під кузовом, дах світліший. */
function soil(g, y0, y1) {
  const p = g.attributes.position, c = g.attributes.color;
  for (let i = 0; i < p.count; i++) { const t = clamp01((p.getY(i) - y0) / (y1 - y0)), k = 0.6 + 0.4 * t * t * (3 - 2 * t); c.setXYZ(i, c.getX(i) * k, c.getY(i) * k, c.getZ(i) * k); }
  return g;
}
const hexMix = (a, b, k) => '#' + _c2.set(a).lerp(_c.set(b), k).getHexString();

/** Критий вагон 11-217 (кузов, сірий дах, ребра, смуги клубу, бруд унизу, двері, рама, візки 18-100, драбина) із центром у нулі. */
function carGeo(col, doorClosed = true, hollow = false) {
  const dark = '#1d2125', rib = hexMix(col, '#000000', 0.14), sill = hexMix(col, '#000000', 0.24), grime = hexMix(col, '#2a2016', 0.32), roof = '#5b636b', door = hexMix(col, '#000000', 0.07);
  const L = [], span = (x0, x1) => (hollow ? [[x0, DOOR0], [DOOR1, x1]] : [[x0, x1]]);   // порожнистий: у отворі дверей нічого не лежить
  if (!hollow) L.push(prismX([[-HALF, FLOOR], [HALF, FLOOR], [HALF, EAVE], [-HALF, EAVE]], BODY0, BODY1, col));
  else {                                                   // цільовий: стінки окремо, у боці до перону отвір дверей, усередині підлога й дошки
    const w = HALF - 0.06, wood = '#5c4a38', wood2 = '#4b3c2d';
    L.push(box(BODY0, DOOR0, FLOOR, EAVE, w, HALF, col), box(DOOR1, BODY1, FLOOR, EAVE, w, HALF, col), box(DOOR0, DOOR1, DOOR_TOP, EAVE, w, HALF, col));
    L.push(box(BODY0, BODY1, FLOOR, EAVE, -HALF, -w, col), box(BODY0, BODY0 + 0.06, FLOOR, EAVE, -HALF, HALF, col), box(BODY1 - 0.06, BODY1, FLOOR, EAVE, -HALF, HALF, col));
    L.push(box(BODY0, BODY1, EAVE - 0.05, EAVE, -HALF, HALF, '#2c3136'), box(BODY0 + 0.06, BODY1 - 0.06, FLOOR - 0.04, FLOOR + 0.02, -w, w, wood2));
    for (let x = BODY0 + 0.1; x < BODY1 - 0.1; x += 0.42) L.push(box(x, x + 0.38, FLOOR + 0.04, EAVE - 0.1, -w, -w + 0.04, x % 0.84 < 0.42 ? wood : wood2));
    for (const [x0, x1] of [[2.0, 4.6], [10.1, 12.6]]) { L.push(box(x0, x1, FLOOR, FLOOR + 1.0, -1.4, -0.2, '#7a5a36'), box(x0 + 0.3, x1 - 0.4, FLOOR + 1.0, FLOOR + 1.8, -1.3, -0.4, '#86643c')); }   // ящики вантажу
    // нутро клубного вагона: банер на дальній стіні, лава, сумки з формою, мʼячі, балки під стелею
    L.push(box(DOOR0 + 0.5, H2, 2.15, 3.55, -w + 0.04, -w + 0.07, '#d4202c'), box(H2, DOOR1 - 0.5, 2.15, 3.55, -w + 0.04, -w + 0.07, '#1f8f3f'), box(H2 - 0.45, H2 + 0.45, 2.55, 3.15, -w + 0.07, -w + 0.09, '#f1efe8'));
    L.push(box(DOOR0 - 0.6, DOOR1 + 0.6, FLOOR + 0.42, FLOOR + 0.5, -w + 0.05, -w + 0.55, '#6b5038'));
    for (const x of [DOOR0 - 0.4, H2, DOOR1 + 0.4]) L.push(box(x - 0.05, x + 0.05, FLOOR, FLOOR + 0.42, -w + 0.1, -w + 0.5, '#3c2e22'));
    L.push(box(DOOR0 + 0.2, DOOR0 + 1.0, FLOOR + 0.5, FLOOR + 0.92, -w + 0.1, -w + 0.5, '#1f5c35'), box(DOOR1 - 1.1, DOOR1 - 0.3, FLOOR + 0.5, FLOOR + 0.86, -w + 0.1, -w + 0.48, '#8a1f26'));
    for (const [x, z] of [[4.9, -0.1], [5.3, 0.25], [10.0, 0.05]]) L.push(box(x - 0.15, x + 0.15, FLOOR, FLOOR + 0.3, z - 0.15, z + 0.15, '#f4f2ea'), box(x - 0.06, x + 0.06, FLOOR + 0.12, FLOOR + 0.3, z + 0.15, z + 0.152, '#1d2125'));
    for (let x = BODY0 + 1.6; x < BODY1 - 1; x += 2.6) L.push(box(x, x + 0.12, EAVE - 0.22, EAVE - 0.05, -w, w, '#33393f'));
  }
  L.push(prismX([[-HALF - 0.04, EAVE], [HALF + 0.04, EAVE], [1.2, ROOF], [-1.2, ROOF]], BODY0 - 0.04, BODY1 + 0.04, roof), prismX([[-1.2, ROOF], [1.2, ROOF], [1.0, ROOF + 0.05], [-1.0, ROOF + 0.05]], BODY0 + 0.1, BODY1 - 0.1, roof));
  for (const [a, b] of span(BODY0, BODY1)) L.push(box(a, b, FLOOR + 0.13, FLOOR + 0.42, HALF, HALF + 0.01, grime));
  for (const [y0, y1] of [[1.62, 1.72], [1.8, 1.85]]) for (const [a, b] of [[BODY0, DOOR0 - 0.2], [DOOR1 + 0.2, BODY1]]) L.push(box(a, b, y0, y1, HALF + 0.045, HALF + 0.06, '#f1efe8'));
  for (let x = BODY0 + 0.35; x < BODY1 - 0.2; x += 0.69) if (x < DOOR0 - 0.15 || x > DOOR1 + 0.15) L.push(box(x, x + 0.1, FLOOR + 0.05, EAVE - 0.08, HALF, HALF + 0.045, rib));
  for (const [a, b] of span(BODY0, BODY1)) L.push(box(a, b, FLOOR - 0.05, FLOOR + 0.13, HALF - 0.02, HALF + 0.07, sill));
  L.push(box(BODY0, BODY1, EAVE - 0.12, EAVE, HALF - 0.02, HALF + 0.05, sill));
  L.push(box(DOOR0 - 0.15, BODY1 - 0.3, DOOR_TOP + 0.02, DOOR_TOP + 0.12, HALF + 0.04, HALF + 0.13, dark));
  for (const [a, b] of span(DOOR0 - 0.15, BODY1 - 0.3)) if (b > a) L.push(box(a, b, FLOOR + 0.06, FLOOR + 0.13, HALF + 0.04, HALF + 0.12, dark));
  if (doorClosed) {
    L.push(box(DOOR0, DOOR1, FLOOR + 0.1, DOOR_TOP, HALF + 0.05, HALF + 0.11, door));
    for (const y of [2.05, 2.75, 3.4]) L.push(box(DOOR0, DOOR1, y, y + 0.07, HALF + 0.11, HALF + 0.13, rib));
    L.push(box(H2 - 0.05, H2 + 0.05, FLOOR + 0.1, DOOR_TOP, HALF + 0.11, HALF + 0.125, rib));
  }
  L.push(box(0.6, 14.13, 0.92, FLOOR, -1.25, 1.25, dark), box(0, BODY0, 0.86, 1.08, -0.16, 0.16, '#30363c'), box(BODY1, P, 0.86, 1.08, -0.16, 0.16, '#30363c'));
  for (const c of [2.36, 12.37]) {
    L.push(box(c - 1.35, c + 1.35, 0.42, 0.88, 1.0, 1.16, '#2b3137'), box(c - 0.3, c + 0.3, 0.55, 0.95, -0.2, 1.3, '#23282d'));
    for (const d of [-0.925, 0.925]) L.push(wheel(c + d, 0.478, 0.8, 0.478, '#121416'));
  }
  L.push(box(6.0, 8.8, 0.62, 0.92, 0.3, 0.9, '#2a2f34'));                                        // гальмовий резервуар
  L.push(box(BODY1 - 0.06, BODY1 + 0.02, 1.4, 4.0, HALF - 0.05, HALF + 0.02, '#2a2f34'));
  for (let y = 1.6; y < 4; y += 0.35) L.push(box(BODY1 - 0.02, BODY1 + 0.08, y, y + 0.04, HALF - 0.4, HALF, '#2a2f34'));
  const g = soil(merge(L), 0.2, ROOF); g.translate(-H2, 0, 0); return g;
}
const LOCO_PROFILE = [[0.4, FLOOR], [20.6, FLOOR], [20.6, 2.75], [19.95, 3.75], [19.05, 4.55], [18.5, 4.82], [1.0, 4.82], [0.4, 4.45]];
/** Тепловоз ЛОКО: обтічна кабіна зі скосом і плугом зі скісними прорізами, як на гербі; центр у нулі, ніс у +LL/2. */
function locoGeo() {
  const gd = hexMix(GRN, '#000000', 0.3), gl = hexMix(GRN, '#ffffff', 0.18), dark = '#1d2125';
  const L = [prismZ(LOCO_PROFILE, -1.55, 1.55, GRN)];
  L.push(box(1.2, 18.2, 4.82, 4.9, -1.25, 1.25, gl), box(6, 8.6, 4.9, 5.12, -0.95, 0.95, gd), box(9.4, 12, 4.9, 5.12, -0.95, 0.95, gd), box(13.2, 14.6, 4.9, 5.3, -0.45, 0.45, gd));
  L.push(box(0.6, 20.4, 0.82, FLOOR, -1.45, 1.45, gd));
  L.push(prismZ([[19.6, 0.28], [21.05, 0.28], [20.7, FLOOR], [19.6, FLOOR]], -1.4, 1.4, GRN));
  for (let i = 0; i < 5; i++) { const z = -1.1 + i * 0.47; L.push(quad([21.07, 0.36, z], [20.75, 1.22, z + 0.25], [20.75, 1.22, z + 0.37], [21.07, 0.36, z + 0.12], '#f4f4f0')); }
  const w = (k) => [19.95 + (19.05 - 19.95) * k, 3.75 + (4.55 - 3.75) * k], a = w(0.12), b = w(0.86), nx = 0.024, ny = 0.027;   // лобове скло на скосі
  L.push(quad([a[0] + nx, a[1] + ny, 1.3], [a[0] + nx, a[1] + ny, -1.3], [b[0] + nx, b[1] + ny, -1.3], [b[0] + nx, b[1] + ny, 1.3], '#0e1f17'));
  L.push(box(0, 0.4, 0.86, 1.08, -0.16, 0.16, '#30363c'), box(20.6, 21.5, 0.86, 1.08, -0.16, 0.16, '#30363c'));
  for (const c of [4.6, 16.9]) {
    L.push(box(c - 2.5, c + 2.5, 0.38, 0.95, 1.05, 1.22, dark));
    for (const d of [-1.85, 0, 1.85]) L.push(wheel(c + d, 0.525, 0.8, 0.525, '#121416'));
  }
  const g = soil(merge(L), 0.2, 5.0); g.translate(-LL / 2, 0, 0); return g;
}

// ---------- текстури з полотна ----------
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.userData.draw = draw; return t;
}
const redraw = (t) => { const c = t.image, g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height); t.userData.draw(g, c.width, c.height); t.needsUpdate = true; };
const glowTex = () => canvasTex(128, 128, (g, w) => { const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,.55)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, w, w); });
/** Бік тепловоза: білі смуги, червона лінія, «1919», жалюзі, вікно кабіни — у межах профілю, як на гербі. */
const locoSide = () => canvasTex(2048, 400, (g, W, H) => {
  const sx = W / 20.6, sy = H / 4.0, X = (x) => (x - 0.4) * sx, Y = (y) => H - (y - 0.82) * sy;
  g.save(); g.beginPath(); LOCO_PROFILE.forEach(([x, y], i) => (i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y)))); g.closePath(); g.clip();
  g.fillStyle = '#ffffff'; g.fillRect(0, Y(2.95), W, 0.16 * sy); g.fillRect(0, Y(2.62), W, 0.09 * sy);
  g.fillStyle = RED; g.fillRect(0, Y(1.62), W, 0.14 * sy);
  for (let x = 2.2; x < 14.5; x += 1.55) { g.fillStyle = 'rgba(20,50,25,.55)'; g.fillRect(X(x), Y(4.2), 1.1 * sx, 0.95 * sy); g.fillStyle = 'rgba(255,255,255,.08)'; for (let k = 0; k < 6; k++) g.fillRect(X(x), Y(4.2) + k * 0.16 * sy, 1.1 * sx, 0.05 * sy); }
  g.fillStyle = '#0e1f17'; g.fillRect(X(16.9), Y(4.25), 1.3 * sx, 0.85 * sy); g.fillStyle = 'rgba(120,200,160,.25)'; g.fillRect(X(16.95), Y(4.2), 0.3 * sx, 0.75 * sy);
  g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(X(16.5), Y(4.3), 0.05 * sx, 2.85 * sy); g.fillRect(X(18.35), Y(4.3), 0.05 * sx, 2.85 * sy);
  g.fillStyle = 'rgba(40,30,15,.35)'; g.fillRect(0, Y(1.62), W, 0.25 * sy);
  g.restore();
  g.fillStyle = '#ffffff'; g.textBaseline = 'middle'; g.font = `800 ${0.34 * sy}px ${FONT}`; g.fillText('1919', X(2.0), Y(1.06));
  g.font = `800 ${0.3 * sy}px ${FONT}`; g.fillText('ЛОКОМОТИВ', X(9.4), Y(2.2));
});
/** Атлас бортових написів: номер, рідкість і позначки на кожен вагон. Плитка 512×256 на 3,6×1,8 м. */
const numberAtlas = (cars) => canvasTex(1024, 640, (g) => {
  g.scale(0.5, 0.5);                                                 // атлас у 4 рази менший: номерам вистачає
  cars.forEach((c, i) => {
    const x = (i % 4) * 512, y = Math.floor(i / 4) * 256;
    g.fillStyle = c.rar === 'l' ? '#3d2c00' : '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.font = `800 176px ${FONT}`; g.fillText(String(c.no).padStart(2, '0'), x + 256, y + 172);
    g.font = `800 34px ${FONT}`; g.fillText(UA[c.rar] + ' · ЛОКО', x + 256, y + 222);
    const pips = ORDER.indexOf(c.rar) + 1;
    for (let k = 0; k < 4; k++) { g.globalAlpha = k < pips ? 1 : 0.3; g.fillRect(x + 196 + k * 32, y + 236, 22, 12); }
    g.globalAlpha = 1;
  });
});
/**
 * Квиток «ЛОКО·ЕКСПРЕС» замість картки: гравець — пасажир цього вагона. Місце — позиція й номер, багаж — навички з крапками до числа,
 * особливі прикмети — риса. Загальний рейтинг ставить кругла печатка кольору рідкості; номер квитка зібрано з вагона й номера гравця.
 */
function cardHtml(e, no) {
  const R = RARITY[e.rar] || RARITY.c, T = TRAITS[e.trait], keys = keysFor(e.line || 'F'), st = e.stats || {};
  let o = 0; try { o = ovr(e); } catch (_) { /* неповний герой */ }
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const two = (n) => String(n || 0).padStart(2, '0'), rows = keys.map((k, i) => `<li style="--i:${i}"><span>${STAT_NAMES[k] || k}</span><i></i><b>${Math.max(0, Math.min(99, st[k] | 0))}</b></li>`).join('');
  return `<div class="pt-card" style="--rc:${R.col}"><header><b>ЛОКО·ЕКСПРЕС</b><span>№ ${two(no)}${two(e.num)}-1919</span></header>
    <dl><dt>пасажир</dt><dd class="nm">${esc(e.name || 'Новачок')}</dd><dt>місце</dt><dd>${esc(ROLE_UA[e.role] || e.pos || '—')}${e.num ? ', №' + e.num : ''}</dd><dt>вагон</dt><dd>${two(no)}, ${esc(R.name.toLowerCase())}</dd></dl>
    <h4>багаж</h4><ul>${rows}</ul>${T ? `<p><em>особливі прикмети</em>${esc(T.tip)}</p>` : ''}
    <footer><i></i><small>дійсний для виходу на поле</small></footer>
    <div class="pt-stamp"><b>${o || '—'}</b><small>${esc(R.name)}</small></div></div>`;
}
/** Принти клубу на правій панелі вагонів: шеврони герба, «1919», силует потяга, мʼяч, смуги, «ЛОКО» із зіркою. Плитка 256×128. */
const PRINTS = 6;
const printAtlas = () => canvasTex(1024, 256, (g) => {
  const W = '#f4f2ea', R = '#e31119', Gn = '#4fae2c', tile = (i, fn) => { g.save(); g.translate((i % 4) * 256, Math.floor(i / 4) * 128); fn(); g.restore(); };
  g.font = `800 40px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  tile(0, () => { g.fillStyle = R; g.beginPath(); g.moveTo(40, 110); g.lineTo(96, 18); g.lineTo(152, 110); g.lineTo(128, 110); g.lineTo(96, 58); g.lineTo(64, 110); g.fill(); g.fillStyle = Gn; g.fillRect(150, 70, 70, 40); g.fillStyle = W; g.font = `800 30px ${FONT}`; g.fillText('ЛОКО', 186, 52); });
  tile(1, () => { g.strokeStyle = W; g.lineWidth = 5; g.font = `800 86px ${FONT}`; g.strokeText('1919', 128, 68); });
  tile(2, () => { g.fillStyle = W; g.fillRect(30, 50, 150, 34); g.beginPath(); g.moveTo(180, 50); g.lineTo(212, 62); g.lineTo(226, 84); g.lineTo(180, 84); g.fill(); g.fillStyle = R; g.fillRect(30, 76, 196, 6); for (const x of [56, 96, 150, 196]) { g.beginPath(); g.arc(x, 92, 9, 0, 7); g.fill(); } g.fillStyle = W; g.font = `800 22px ${FONT}`; g.fillText('ЛОКО·ЕКСПРЕС', 128, 26); });
  tile(3, () => { g.fillStyle = W; g.fillRect(36, 30, 64, 64); g.fillStyle = '#1d2125'; g.fillRect(56, 50, 24, 24); g.fillRect(36, 30, 14, 14); g.fillRect(86, 80, 14, 14); g.fillStyle = W; g.font = `800 44px ${FONT}`; g.fillText('КИЇВ', 170, 64); });
  tile(4, () => { for (let k = 0; k < 6; k++) { g.fillStyle = k % 2 ? Gn : R; g.beginPath(); g.moveTo(10 + k * 42, 118); g.lineTo(40 + k * 42, 118); g.lineTo(80 + k * 42, 10); g.lineTo(50 + k * 42, 10); g.fill(); } });
  tile(5, () => { g.fillStyle = W; g.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + (k * Math.PI) / 5, r = k % 2 ? 14 : 34; g.lineTo(52 + Math.cos(a) * r, 64 + Math.sin(a) * r); } g.fill(); g.font = `800 56px ${FONT}`; g.fillText('ЛОКО', 166, 66); });
});
const mailSide = () => canvasTex(1024, 256, (g, W) => { g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.font = `800 150px ${FONT}`; g.fillText('ЛОКО', W / 2, 160); g.font = `800 44px ${FONT}`; g.fillText('1919 · КИЇВ', W / 2, 226); });

// ---------- склад ----------
/** Скільки вагонів кожної рідкості з 20 за шансами (найбільші залишки). */
export function trainMix(odds) {
  const ks = ORDER.filter((k) => odds[k] > 0), raw = ks.map((k) => odds[k] * N), n = raw.map(Math.floor);
  let left = N - n.reduce((a, b) => a + b, 0);
  ks.map((k, i) => [raw[i] - n[i], i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (left > 0) { n[i]++; left--; } });
  const o = {}; ks.forEach((k, i) => { o[k] = n[i]; }); return o;
}
let seed = 1;
const srnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; return seed / 4294967296; };


/**
 * Відкриття пака. o.kind — 'scout' | 'rare' | 'epic' (назва й шанси з PACKS), o.odds — інші шанси; o.result — Promise<{ hero, wagon?: { no, rar } }>;
 * o.view(hero) → { look } для моделі героя; o.host — куди класти шар (онлайн-хаб дає #reveal).
 * Повертає Promise<{ end: 'done' | 'skip' | 'error', at: DOMRect | null, close() }>. Після 'done' і 'skip' шар із героєм стоїть, доки не close().
 */
export function openTrain(o) {
  return new Promise((res) => { const old = getTrain(); if (old) old.kill(); setTrain(new Train(o, res)); });
}

// тимчасові об'єкти кадру
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _p = new THREE.Vector3(), _l = new THREE.Vector3(), _m = new THREE.Matrix4();
const _pose = { x: 0, y: 0, th: 0 };
const CAM0 = new THREE.Vector3(7, 2.3, 7.8), LOOK0 = new THREE.Vector3(-40, 2.6, -1.2);   // спершу вздовж колії: тепловоз іде на глядача, як на гербі
const CAM1 = new THREE.Vector3(0, 2.7, 11.0), LOOK1 = new THREE.Vector3(0, 2.9, 0);       // потім збоку, навпроти дверей; задня стіна перону — за камерою (z 11,5)

class Train {
  constructor(o, res) {
    this.o = o; this.res = res; this.timers = []; this.tw = []; this.slots = []; this.ims = []; this.steam = []; this.plan = null;
    this.dead = false; this.ended = false; this.opaque = false; this.closing = false;
    const pack = PACKS[o.kind] || PACKS.scout;
    this.odds = o.odds || pack.odds; this.mix = trainMix(this.odds); this.name = (pack.name || 'Пак').toUpperCase();
    seed = (Date.now() ^ Math.round(performance.now() * 1000)) >>> 0 || 1;
    this.el = document.createElement('div'); this.el.className = 'pt';
    this.el.innerHTML = '<canvas class="pt-cv"></canvas><i class="pt-vig"></i><i class="pt-flash"></i>';
    (o.host || document.getElementById('ui') || document.body).appendChild(this.el);
    this.flash = this.el.querySelector('.pt-flash');
    try { releaseTurntable(); this.build(); } catch (e) { console.warn(e); this.broken = true; }
    this.sound = new TrainSound();
    this.onSize = () => this.fit(); addEventListener('resize', this.onSize);
    this.spin = 0; this.spinV = 0; this.spinWait = 0; this.drag = null;
    this.el.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      if (this.hero && this.blurT) { this.drag = { id: e.pointerId, x: e.clientX, t: performance.now() }; this.spinV = 0; try { this.el.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ } return; }
      if (performance.now() - this.openAt > 1000) this.skipNow();
    });
    this.el.addEventListener('pointermove', (e) => {
      const d = this.drag; if (!d || e.pointerId !== d.id) return;
      const now = performance.now(), da = ((e.clientX - d.x) / Math.max(1, this.el.clientWidth)) * Math.PI * 2.4;
      this.spin += da; this.spinV = da / Math.max(0.008, (now - d.t) / 1000); d.x = e.clientX; d.t = now;
    });
    const up = (e) => { const d = this.drag; if (!d || e.pointerId !== d.id) return; if (performance.now() - d.t > 90) this.spinV = 0; this.drag = null; this.spinWait = performance.now() + 2200; };
    this.el.addEventListener('pointerup', up); this.el.addEventListener('pointercancel', up);
    this.el.addEventListener('click', (e) => e.stopPropagation());
    this.openAt = performance.now();
    this.el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 280 }).finished.then(() => { if (!this.dead && !this.closing) this.opaque = true; }, () => {});
    this.t0 = null; this.last = performance.now();
    Promise.resolve(o.result).then((r) => this.got(r), () => this.fail());
    if (this.broken) return;
    this.frame = this.frame.bind(this); this.raf = requestAnimationFrame(this.frame);
  }
  /** Перший кадр уже на екрані: звідси йде годинник руху, звук і службові вагони. */
  go(now) {
    this.t0 = now + 60;
    if (!REDUCED.matches) { const s = this.sound; s.horn(this.t0 + 60); s.rumble([[this.t0, 0.3], [this.t0 + 500, 1]]); if (s.pan) { s.pan.pan.value = -0.7; s.panTo(0, this.t0 + 200, 1.4); } }
    if (this.pending) { const r = this.pending; this.pending = null; this.got(r); }
    this.at(0, () => this.feed());
  }

  // ---------------------------------------------------------------- сцена
  build() {
    const cv = this.el.querySelector('canvas'), coarse = matchMedia('(pointer: coarse)').matches;
    const r = (this.r = new THREE.WebGLRenderer({ canvas: cv, antialias: !coarse, powerPreference: 'high-performance', stencil: false }));
    this.low = loadPerf(coarse).level <= 1;                         // слабкий телефон (рівень деталізації гри 0–1): менша роздільність і менше іскор
    this.pr = this.pr0 = Math.min(window.devicePixelRatio || 1, coarse ? 1.35 : 2) * (this.low ? 0.75 : 1); this.ftAcc = 0; this.ftN = 0;
    r.setPixelRatio(this.pr);
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05; r.outputColorSpace = THREE.SRGBColorSpace;
    const sc = (this.scene = new THREE.Scene());
    sc.position.y = -PLAT;                                          // перон на світовому нулі: хода героя ставить стопи у світових координатах
    sc.fog = new THREE.Fog(0x1a2b34, 12, 62);                       // густий туман: дальні вагони й фон тануть, далі ~60 м нічого не малюється
    this.cam = new THREE.PerspectiveCamera(40, 1, 0.3, 80); this.cam.layers.mask = 3;   // шар 0 — сцена, шар 1 — герой
    // Ламберт замість фізичного матеріалу: на пласких гранях різниці майже нема, а телефону вдвічі легше
    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.glowM = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    this.tmat = this.low ? this.mat : new THREE.MeshPhongMaterial({ vertexColors: true, flatShading: true, shininess: 38, specular: 0x3a3a3a });   // фарбований метал вагонів: бліки від ліхтарів, без карти середовища (вона довго будується)
    this.stripM = new THREE.MeshBasicMaterial({ toneMapped: false });
    this.glow = glowTex();
    // світла сталий набір з першого кадру: нове світло посеред сцени перезбирало б усі шейдери
    const hemi = new THREE.HemisphereLight(0x8aa6cc, 0x2a2219, 1.5); hemi.layers.mask = 3; sc.add(hemi);
    const rim = new THREE.DirectionalLight(0x9fbcff, 1.1); rim.position.set(14, 16, -30); rim.layers.mask = 3; sc.add(rim);   // холодне контрове світло з-за колії: обвідка дахів і граней
    for (const x of [-9, 9]) { /* лінійне згасання: світло розходиться широко й мʼяко, без гарячої плями */ const lamp = new THREE.PointLight(0xffd29a, 22, 34, 1); lamp.position.set(x, 4.5, 3.62); lamp.layers.mask = 3; sc.add(lamp); }   // світло саме з ліхтарів біля зупинки
    this.fill = new THREE.PointLight(0xfff1dc, 26, 20, 1.3); this.fill.position.set(1.5, 4.8, 8.2); this.fill.layers.mask = 3; sc.add(this.fill);
    this.inLight = new THREE.PointLight(0xffffff, 0, 14, 1.4); this.inLight.position.set(0, -50, 0); this.inLight.layers.mask = 3; sc.add(this.inLight);
    // небо: купол із градієнтом і зорі
    const sky = new THREE.SphereGeometry(70, 24, 12), col = [], sp = sky.attributes.position;
    for (let i = 0; i < sp.count; i++) { _c.set(0x1a2b34).lerp(_c2.set(0x050c14), clamp01((sp.getY(i) / 70) * 1.6)); col.push(_c.r, _c.g, _c.b); }
    sky.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    sc.add(new THREE.Mesh(sky, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false })));
    const st = []; for (let i = 0; i < 120; i++) { const a = srnd() * Math.PI * 2, e = 0.45 + srnd() * 1.0; st.push(Math.cos(a) * Math.cos(e) * 66, Math.sin(e) * 66, Math.sin(a) * Math.cos(e) * 66); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(st, 3));
    sc.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xcfe0ff, size: 1.1, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.8 })));
    this.station();
    // тепловоз: центр групи посередині, ніс у +LL/2
    const lg = (this.locoG = new THREE.Group()); sc.add(lg);
    lg.add(new THREE.Mesh(locoGeo(), this.tmat));
    this.locoTex = locoSide();
    const lside = new THREE.Mesh(new THREE.PlaneGeometry(20.6, 4.0), new THREE.MeshLambertMaterial({ map: this.locoTex, transparent: true, polygonOffset: true, polygonOffsetFactor: -2 }));
    lside.position.set(-0.05, 2.82, 1.556); lg.add(lside);
    const lamps = merge([box(20.58, 20.64, 2.05, 2.35, 0.6, 1.1, '#fff4d0'), box(20.58, 20.64, 2.05, 2.35, -1.1, -0.6, '#fff4d0'), box(18.6, 18.9, 4.62, 4.78, -0.25, 0.25, '#fff4d0')]); lamps.translate(-LL / 2, 0, 0);
    lg.add(new THREE.Mesh(lamps, this.glowM));
    /* фара — лише промінь і ореоли: справжнє світло рахувалося б у кожному пікселі сцени */
    /* прожектор: мʼякий стовп світла, що розширюється й тане вдалині (два схрещені полотна), і пляма на колії попереду */
    const shaft = canvasTex(256, 128, (g, W, H) => { const img = g.createImageData(W, H); for (let x = 0; x < W; x++) { const t = x / W, half = 0.14 + 0.86 * t, fall = Math.pow(1 - t, 1.5) * Math.min(1, t * 12); for (let y = 0; y < H; y++) { const v = ((y / H - 0.5) * 2) / half, a = Math.exp(-v * v * 2.6) * fall, i = (y * W + x) * 4; img.data[i] = 255; img.data[i + 1] = 241; img.data[i + 2] = 208; img.data[i + 3] = Math.round(a * 255); } } g.putImageData(img, 0, 0); });
    const shM = new THREE.MeshBasicMaterial({ map: shaft, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    for (const rx of [0, Math.PI / 2]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(30, 7), shM); p.rotation.x = rx; p.position.set(LL / 2 + 14.6, 2.15, 0); lg.add(p); }
    const fp = new THREE.Mesh(new THREE.PlaneGeometry(16, 4.2), new THREE.MeshBasicMaterial({ map: this.glow, color: 0xfff0c8, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false })); fp.rotation.x = -Math.PI / 2; fp.position.set(LL / 2 + 9.5, 0.04, 0); lg.add(fp);
    for (const z of [0.85, -0.85]) { const hs = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: 0xfff1cf, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); hs.scale.set(3.2, 3.2, 1); hs.position.set(LL / 2 - 0.75, 2.2, z); lg.add(hs); }
    this.slots.push({ obj: lg });
    this.mailGeo = carGeo(GRN); this.mailTex = mailSide();
    this.sparksInit();
    this.board(); this.fit();
    document.fonts && document.fonts.load(`800 60px ${FONT}`).then(() => { if (!this.dead) { redraw(this.boardTex); redraw(this.locoTex); redraw(this.mailTex); redraw(this.posterTex); } }, () => {});
    this.place(0);
    try { r.compile(sc, this.cam); } catch (_) { /* зберемо в першому кадрі */ }
  }
  station() {
    const sc = this.scene, L = [], E = [];
    L.push(box(-300, 300, -0.45, 0, -3.2, 1.78, '#25221f'));                                             // баласт
    L.push(box(-300, 300, 0, RAIL, 0.72, 0.8, '#7f8a92'), box(-300, 300, 0, RAIL, -0.8, -0.72, '#7f8a92'));   // рейки
    L.push(box(-160, 160, 0, PLAT - 0.04, 1.78, 11, '#4b565b'), box(-160, 160, PLAT - 0.06, PLAT, 1.78, 2.3, '#9aa4a8'), box(-160, 160, PLAT - 0.04, PLAT + 0.006, 2.35, 2.5, '#f2c230'), box(-160, 160, PLAT - 0.04, PLAT + 0.004, 2.55, 2.95, '#7d7558'));
    L.push(box(-160, 160, PLAT - 0.04, PLAT - 0.02, 2.95, 11, '#5a666b'));
    for (let x = -158; x < 160; x += 1.5) L.push(box(x, x + 0.03, PLAT - 0.02, PLAT - 0.012, 2.95, 11, '#465156'));   // шви плит
    L.push(box(-160, 160, PLAT, 5.7, 11.5, 11.9, '#1b2a31'));
    for (let x = -66; x <= 66; x += 12) {
      L.push(box(x - 0.18, x + 0.18, PLAT, 5.6, 11.1, 11.46, '#22333a'));
      L.push(box(x + 1.6, x + 2.6, 2.6, 5.0, 11.44, 11.5, '#d4202c'), box(x + 2.7, x + 3.7, 2.6, 5.0, 11.44, 11.5, '#1f8f3f'));   // банери клубу на задній стіні
    }
    L.push(box(-70, 70, 5.6, 5.85, 3.15, 11.5, '#1a2930'), box(-70, 70, 5.3, 5.86, 3.05, 3.25, '#263a42'));
    for (let x = -64; x < 70; x += 8) E.push(box(x, x + 3.2, 5.52, 5.6, 4.6, 4.9, '#fff1c9'));
    for (const x of [-27, -9, 9, 27]) { L.push(box(x - 0.07, x + 0.07, PLAT, 4.9, 3.55, 3.69, '#1a262b'), box(x - 0.35, x + 0.35, 4.9, 5.0, 3.35, 3.9, '#16232a')); E.push(box(x - 0.22, x + 0.22, 4.45, 4.9, 3.4, 3.84, '#ffe0a0')); }
    // дальній бік: стінка з постерами, друга колія, місто й стадіон
    L.push(box(-300, 300, -0.45, 3.4, -11.5, -10.9, '#18262c'), box(-300, 300, 0, RAIL, -6.1, -6.03, '#5d666c'), box(-300, 300, 0, RAIL, -7.6, -7.53, '#5d666c'));
    for (let i = 0; i < 26; i++) {                                    // кілька ближніх силуетів міста в тумані; далі все одно не видно
      const x = -80 + i * 6.8 + srnd() * 4, w = 5 + srnd() * 9, h = 9 + srnd() * 30, z = -30 - srnd() * 22, d = 6 + srnd() * 8, c = srnd() < 0.5 ? '#0e2129' : '#122a33';
      if (x > 70 && x < 175) continue;
      L.push(box(x, x + w, -1, h, z - d, z, c));
      for (let wy = 3; wy < h - 2; wy += 2.6) for (let wx = x + 0.8; wx < x + w - 1; wx += 1.8) if (srnd() < 0.24) E.push(box(wx, wx + 0.8, wy, wy + 1.1, z + 0.02, z + 0.08, srnd() < 0.7 ? '#f6d68b' : '#bfe0ff'));
    }
    sc.add(new THREE.Mesh(merge(L), this.mat), new THREE.Mesh(merge(E), this.glowM));
    this.posterTex = canvasTex(512, 200, (g, W, H) => { g.fillStyle = '#0d2a1b'; g.fillRect(0, 0, W, H); g.fillStyle = RED; g.fillRect(0, 0, 26, H); g.fillStyle = GRN; g.fillRect(26, 0, 18, H); g.fillStyle = '#ffffff'; g.font = `800 64px ${FONT}`; g.fillText('ЛОКОМОТИВ', 70, 95); g.font = `800 34px ${FONT}`; g.fillStyle = '#ffcf4a'; g.fillText('КИЇВ · З 1919 РОКУ', 72, 150); });
    const shade = canvasTex(8, 64, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(0,0,0,.75)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(240, 1.5), new THREE.MeshBasicMaterial({ map: shade, transparent: true, depthWrite: false })); sh.rotation.x = -Math.PI / 2; sh.position.set(0, PLAT + 0.012, 2.53); sc.add(sh);   // тінь складу на краю перону
    const pools = [], wet = [];
    for (const x of [-27, -9, 9, 27]) {
      const p = new THREE.PlaneGeometry(6.4, 4.6); p.rotateX(-Math.PI / 2); p.translate(x, PLAT + 0.01, 3.9); pools.push(p);                 // тепла пляма під ліхтарем
      const q = new THREE.PlaneGeometry(0.7, 2.6); q.rotateX(-Math.PI / 2); q.translate(x, PLAT + 0.009, 5.6); wet.push(q);                  // відблиск на мокрому пероні
    }
    for (let x = -62; x < 70; x += 8) { const q = new THREE.PlaneGeometry(2.4, 1.6); q.rotateX(-Math.PI / 2); q.translate(x + 1.6, PLAT + 0.008, 6.6); wet.push(q); }
    const add = (list, col, op) => { sc.add(new THREE.Mesh(mergeGeometries(list, false), new THREE.MeshBasicMaterial({ map: this.glow, color: col, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false }))); list.forEach((g) => g.dispose()); };
    add(pools, 0xffc983, 0.26); add(wet, 0xffe2b0, 0.16);
    const haze = new THREE.SpriteMaterial({ map: this.glow, color: 0xffd9a0, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false });   // світло ліхтаря розсіюється в тумані мʼяким ореолом, без країв
    for (const x of [-27, -9, 9, 27]) { const h = new THREE.Sprite(haze); h.scale.set(5.2, 6.4, 1); h.position.set(x, PLAT + 2.3, 3.62); sc.add(h); }
    const pm = new THREE.MeshBasicMaterial({ map: this.posterTex, toneMapped: false, color: 0xb8b8b8 });
    for (let x = -96; x <= 96; x += 24) { const q = new THREE.Mesh(new THREE.PlaneGeometry(6, 2.35), pm); q.position.set(x, 1.95, -10.88); sc.add(q); }
    const sl = new THREE.InstancedMesh(new THREE.BoxGeometry(0.26, 0.14, 2.75), new THREE.MeshLambertMaterial({ color: 0x3a332c }), 260);
    for (let i = 0; i < 260; i++) { _m.makeTranslation(-70 + i * 0.55, 0.07, 0); sl.setMatrixAt(i, _m); } sc.add(sl);
    const spr = (x, y, z, s, c, op) => { const q = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: c, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: op })); q.position.set(x, y, z); q.scale.set(s, s, 1); sc.add(q); };
    for (const x of [-27, -9, 9, 27]) spr(x, 4.68, 3.62, 2.2, 0xffd9a0, 0.7);
    for (let x = -62; x < 70; x += 8) spr(x + 1.6, 5.4, 4.75, 3.2, 0xfff1c9, 0.35);
  }
  /** Табло з назвою пака, номером вагона й складом. Перегортання — перемальовування полотна. */
  board() {
    this.flaps = ['–', '–']; this.rarTxt = '';
    const mix = this.mix;
    this.boardTex = canvasTex(1024, 416, (g, W) => {
      g.fillStyle = '#0a1114'; g.fillRect(0, 0, W, 416);
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = this.failed ? '#ff6b5e' : '#ffcf4a'; g.font = `800 64px ${FONT}`; g.fillText(this.failed ? 'РЕЙС СКАСОВАНО' : this.name, W / 2, 62);
      g.fillStyle = '#c9d6dc'; g.font = `800 50px ${FONT}`; g.textAlign = 'right'; g.fillText('ВАГОН', 360, 200);
      for (let i = 0; i < 2; i++) {
        const x = 392 + i * 112; g.fillStyle = '#1c262c'; g.fillRect(x, 140, 100, 120); g.fillStyle = '#151d22'; g.fillRect(x, 200, 100, 60);
        g.fillStyle = '#ffd257'; g.textAlign = 'center'; g.font = `800 104px ${FONT}`; g.fillText(this.flaps[i], x + 50, 204); g.fillStyle = '#05090b'; g.fillRect(x, 198, 100, 4);
      }
      if (this.rarTxt) { g.fillStyle = RARITY[this.rar].col; g.textAlign = 'left'; g.font = `800 46px ${FONT}`; g.fillText(this.rarTxt, 640, 202); }
      let x = 290; g.textAlign = 'left'; g.font = `800 36px ${FONT}`; g.fillStyle = '#7f8f96'; g.fillText('СКЛАД 20', 80, 352);
      for (const k of ORDER) if (mix[k]) { g.fillStyle = RARITY[k].col; g.fillRect(x, 334, 52, 34); g.fillStyle = '#c9d6dc'; g.fillText('×' + mix[k], x + 62, 352); x += 150; }
    });
    const bg = (this.boardG = new THREE.Group()); bg.position.x = BX; this.scene.add(bg);
    bg.add(new THREE.Mesh(merge([box(-1.7, 1.7, 3.62, 5.0, 3.32, 3.48, '#0c1418'), box(-1.02, -0.96, 5.0, 5.3, 3.37, 3.43, '#0f1a1f'), box(0.96, 1.02, 5.0, 5.3, 3.37, 3.43, '#0f1a1f')]), this.mat));
    const face = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.3), new THREE.MeshBasicMaterial({ map: this.boardTex, toneMapped: false }));
    face.position.set(0, 4.31, 3.49); bg.add(face);
  }
  fit() {
    if (!this.r) return;
    const w = this.el.clientWidth || innerWidth, h = this.el.clientHeight || innerHeight, a = w / h;
    this.r.setSize(w, h, false);
    this.blurFree();
    this.cam.aspect = a; this.cam.fov = this.fov0 = a < 1.6 ? 40 + (1.6 - a) * 30 : 40; this.cam.updateProjectionMatrix();
    const half = (CAM1.z - 1.2 - 3.49) * Math.tan((this.cam.fov * Math.PI) / 360) * a;   // скільки видно вбік на відстані табло в кінцевому кадрі
    if (this.boardG) this.boardG.position.x = Math.max(2.3, Math.min(BX, half - 1.85));
  }
  /** Службовий вагон без номера (зелений «ЛОКО»): їде, поки нема відповіді, і не входить у 20. */
  addMail() {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(this.mailGeo, this.tmat));
    const d = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 1.6), new THREE.MeshLambertMaterial({ map: this.mailTex, transparent: true, polygonOffset: true, polygonOffsetFactor: -2 }));
    d.position.set(0, 2.85, HALF + 0.05); g.add(d);
    this.scene.add(g); this.slots.push({ obj: g });
    this.place(Math.max(0, this.now()));
  }

  // ---------------------------------------------------------------- рух: стала швидкість, стале сповільнення, перекат і відкат
  at(ms, fn) { this.timers.push(setTimeout(() => { if (!this.dead) fn(); }, Math.max(0, ms))); }
  now() { return this.t0 == null ? -1 : (performance.now() - this.t0) / 1000; }
  ms(s) { return this.t0 + s * 1000; }
  /**
   * Поздовжня динаміка від мити гальмування: n ланок (0 — тепловоз), спершу всі йдуть зі швидкістю V як одне ціле. Між ланками
   * автозчеплення: у межах люфту сили нема, далі пружина й тертя поглинального апарата. Гальмо кожної ланки вмикається, коли до неї
   * дійде хвиля по магістралі, і набирає силу за час наповнення циліндрів; зупинена ланка тримається, поки сила зчеплень менша за гальмо.
   * Кузов на ресорах нахиляється за прискоренням. Пише позиції, швидкості й нахили REC разів на секунду та удари зчеплень.
   */
  simulate(n) {
    const c = new Float64Array(n), m = new Float64Array(n), d = new Float64Array(n), fl = new Float64Array(n);
    for (let i = 0; i < n; i++) { c[i] = i ? -LL - (i - 0.5) * P : -LL / 2; m[i] = i ? M_CAR : M_LOCO; d[i] = -c[i] / PIPE; fl[i] = i ? FILL_C : FILL_L; }
    const p = Float64Array.from(c), v = new Float64Array(n).fill(V), f = new Float64Array(n), th = new Float64Array(n), tv = new Float64Array(n), held = new Uint8Array(n), eng = new Int8Array(n);
    const fr = [], vr = [], tr = [], hits = [];
    let t = 0, next = 0, still = -1;
    for (let guard = 0; guard < 240 * 18; guard++) {
      if (t >= next - 1e-9) {
        fr.push(Float32Array.from(p)); vr.push(Float32Array.from(v)); tr.push(Float32Array.from(th)); next += 1 / REC;
        if (still >= 0 && t > still + 1.4) break;
      }
      f.fill(0);
      for (let i = 1; i < n; i++) {
        const gap = p[i - 1] - p[i] - (c[i - 1] - c[i]), rv = v[i - 1] - v[i];
        let F = 0, e = 0;
        if (gap > SLK) { F = K_C * (gap - SLK) + C_C * rv; e = 1; } else if (gap < -SLK) { F = K_C * (gap + SLK) + C_C * rv; e = -1; }
        if (e && e !== eng[i] && Math.abs(rv) > 0.03) hits.push([t, i, Math.abs(rv)]);   // зчеплення вибрало люфт і вдарило
        eng[i] = e; f[i] += F; f[i - 1] -= F;
      }
      let moving = false;
      for (let i = 0; i < n; i++) {
        const k = clamp01((t - d[i]) / fl[i]), ab = A_BR * k * k * (3 - 2 * k) + ROLL, af = f[i] / m[i], v0 = v[i];
        if (held[i] && Math.abs(af) > ab) held[i] = 0;
        if (held[i]) v[i] = 0;
        else {
          const sg = v[i] > 0 ? 1 : v[i] < 0 ? -1 : Math.sign(af);
          let nv = v[i] + (af - sg * ab) * DT;
          if (v[i] * nv < 0 || (v[i] === 0 && Math.abs(af) <= ab)) { nv = 0; if (Math.abs(af) <= ab) held[i] = 1; }
          v[i] = nv;
        }
        if (v[i] !== 0) moving = true;
        const acc = (v[i] - v0) / DT;
        tv[i] += (-PW * PW * (th[i] - PK * acc) - 2 * PZ * PW * tv[i]) * DT; th[i] += tv[i] * DT;
        p[i] += v[i] * DT;
      }
      if (!moving) { if (still < 0) still = t; } else still = -1;
      t += DT;
    }
    return { n, fr, vr, tr, hits };
  }
  /** Центр, швидкість і нахил ланки i в мить s: до гальмування — рівний хід, далі — таблиця симуляції. */
  look(tab, i, s, def) {
    const pl = this.plan, S = this.sim;
    if (!pl || s <= pl.sb || i >= S.n) return def;
    const q = (s - pl.sb) * REC, L = tab.length - 1, k = Math.min(L, Math.floor(q)), k2 = Math.min(L, k + 1), w = Math.min(1, q - k);
    return tab[k][i] + (tab[k2][i] - tab[k][i]) * w;
  }
  bodyX(i, s) { const ci = i ? -LL - (i - 0.5) * P : -LL / 2, pl = this.plan; if (!pl || s <= pl.sb || i >= this.sim.n) return X0 + V * Math.max(0, s) + ci; return pl.xb + this.look(this.sim.fr, i, s, 0); }
  bodyV(i, s) { return s < 0 ? 0 : this.look(this.sim ? this.sim.vr : null, i, s, V); }
  bodyTh(i, s) { return this.look(this.sim ? this.sim.tr : null, i, s, 0); }
  noseX(s) { return this.bodyX(0, s) + LL / 2; }
  /** Поза ланки k: центр і нахил з динаміки, плюс підскоки на стиках рейок, що слабнуть разом зі швидкістю. */
  pose(k, s) {
    const x = this.bodyX(k, s), v = this.bodyV(k, s), ph = x * 0.85 + k * 1.9;
    _pose.x = x;
    _pose.y = RAIL + (0.014 * Math.sin(ph) + 0.006 * Math.sin(ph * 2.3)) * (v / V);
    _pose.th = this.bodyTh(k, s);
    return _pose;
  }
  /** Розставити всі ланки складу на мить s; повертає, де ніс тепловоза. */
  place(s) {
    const S = this.slots;
    for (let k = 0; k < S.length; k++) {
      const q = this.pose(k, s), sl = S[k];
      if (sl.obj) { sl.obj.position.set(q.x, q.y, 0); sl.obj.rotation.z = q.th; continue; }
      _m.makeRotationZ(q.th); _m.setPosition(q.x, q.y, 0);
      sl.im.setMatrixAt(sl.i, _m); this.strip.setMatrixAt(sl.si, _m);
      sl.dec.position.set(q.x - 4.615, q.y + 3.0 - 4.615 * q.th, HALF + 0.06); sl.dec.rotation.z = q.th;
      sl.pdec.position.set(q.x + 4.4, q.y + 2.95 + 4.4 * q.th, HALF + 0.06); sl.pdec.rotation.z = q.th;
    }
    for (let i = 0; i < this.ims.length; i++) this.ims[i].instanceMatrix.needsUpdate = true;
    if (this.strip) this.strip.instanceMatrix.needsUpdate = true;
    return this.noseX(s);
  }
  /** Раз на 120 мс: службові вагони, поки нема відповіді, і стук осей на стику біля камери на найближчі 300 мс. */
  feed() {
    if (this.dead || this.stopped || this.broken) return;
    const s = Math.max(0, this.now());
    if (!this.plan && !this.failed) {
      if (s > 20) return this.fail();
      const x = this.noseX(s + 0.25);
      while (x - LL - (this.slots.length - 1) * P > -48) this.addMail();   // наступне місце вже видно: туди службовий вагон, а не номер
    }
    this.clacks(s, s + 0.3);
    this.timers.push(setTimeout(() => this.feed(), 120));
  }
  clacks(s0, s1) {
    const from = Math.max(this.clackS ?? s0, s0); this.clackS = s1;
    for (let i = 0; i < this.slots.length; i++) {
      const c0 = this.bodyX(i, from); if (c0 < -40 || c0 > 40) continue;
      const ax = i ? AX_CAR : AX_LOCO, off = i ? H2 : LL / 2;
      for (let t = from; t < s1; t += 0.01) {
        const a = this.bodyX(i, t), b = this.bodyX(i, t + 0.01); if (b <= a) continue;
        for (let q = 0; q < ax.length; q++) { const xa = a + ax[q] - off, xb = b + ax[q] - off; if (xa < 0 && xb >= 0) { const tt = t + (0.01 * -xa) / (xb - xa); this.sound.clack(this.ms(tt), this.bodyV(i, tt) / V); } }
      }
    }
  }

  // ---------------------------------------------------------------- відповідь і склад
  got(r) {
    if (this.dead || this.plan || this.failed) return;
    const hero = r && r.hero; if (!hero) return this.fail();
    const w = (r && r.wagon) || {}, rar = ORDER.includes(w.rar) ? w.rar : ORDER.includes(hero.rar) ? hero.rar : 'c';
    const no = Number.isInteger(w.no) && w.no >= 1 && w.no <= N ? w.no : 1 + Math.floor(srnd() * N);
    if (this.broken) { this.hero_ = hero; this.rar = rar; this.no = no; this.end('skip'); return; }
    if (this.t0 == null && !REDUCED.matches) { this.pending = r; return; }   // план рахується від першого кадру
    this.hero_ = hero; this.rar = rar; this.no = no;
    const nMail = this.slots.length - 1;
    const sim = (this.sim = this.simulate(nMail + 1 + N)), last = sim.fr[sim.fr.length - 1], now = Math.max(0, this.now());
    let j = REDUCED.matches ? 1 : STOP_MIN + Math.floor(srnd() * (STOP_MAX - STOP_MIN + 1)), xb, sb;
    for (;; j++) { xb = -last[nMail + j]; sb = (xb - X0) / V; if (REDUCED.matches || sb > now + 0.25 || j >= N) break; }   // ціль має стати рівно навпроти камери
    this.consist(j, nMail);
    let stopT = sim.fr.length / REC; for (let k = sim.vr.length - 1; k > 0; k--) if (sim.vr[k][nMail + j] !== 0) { stopT = k / REC; break; }
    this.plan = { sb, xb, stopS: sb + stopT, j: nMail + j };
    if (REDUCED.matches) { this.final(true); return; }
    if (this.r.compileAsync) this.r.compileAsync(this.scene, this.cam).catch(() => {});   // шейдери складу й героя — наперед, не на розвороті камери
    if (this.skipReq) { this.final(false); return; }
    const snd = this.sound, L = rar === 'l', pl = this.plan, pts = [[performance.now(), 1]];
    for (let t = 0; t <= stopT + 0.01; t += 0.25) pts.push([this.ms(sb + t), sim.vr[Math.min(sim.vr.length - 1, Math.round(t * REC))][0] / V]);
    snd.rumble(pts);
    snd.squeal(this.ms(sb + stopT * 0.35), this.ms(pl.stopS), L);
    sim.hits.map(([t, i, rv]) => [t, Math.min(1, rv / 0.45) * Math.max(0, 1 - Math.abs(this.bodyX(i, sb + t)) / 45)]).filter((h) => h[1] > 0.06).sort((a, b) => b[1] - a[1]).slice(0, 14).forEach(([t, k]) => snd.clank(this.ms(sb + t), k));
    snd.thud(this.ms(pl.stopS)); snd.air(this.ms(pl.stopS + 0.7));
    this.sparkAt = [this.ms(sb + 0.5), this.ms(pl.stopS - 0.15)];
    this.at(this.ms(pl.stopS + 0.35) - performance.now(), () => this.stopAt());
  }
  /** Склад із 20: на місці j — вагон з відповіді, поруч сусідні рідкості (інтрига); решта перемішана так, щоб однакові кольори не йшли підряд, коли шанси це дозволяють. */
  consist(j, nMail) {
    const left = {}; for (const k of ORDER) left[k] = this.mix[k] || 0;
    if (!left[this.rar]) { const big = ORDER.reduce((a, k) => (left[k] > (left[a] || 0) ? k : a), 'c'); left[big]--; left[this.rar] = 1; }   // дані не збігаються з шансами: склад усе одно чесний до відповіді
    left[this.rar]--;
    const take = (k) => { left[k]--; return k; };
    const near = (up) => { const i = ORDER.indexOf(this.rar), a = ORDER[i + (up ? 1 : -1)], b = ORDER[i + (up ? -1 : 1)]; return left[a] > 0 ? take(a) : left[b] > 0 ? take(b) : null; };
    const pos = new Array(N + 2).fill(null);
    pos[j] = this.rar;
    if (j > 1) pos[j - 1] = near(true);                      // повз камеру перед зупинкою проходить сусідня рідкість, краще вища
    if (j < N) pos[j + 1] = near(false);
    for (let p = 1; p <= N; p++) {
      if (pos[p]) continue;
      const avoid = (k) => k === pos[p - 1] || k === pos[p + 1];
      let tot = 0; for (const k of ORDER) if (left[k] && !avoid(k)) tot += left[k];
      let pick = null;
      if (tot) { let r = srnd() * tot; for (const k of ORDER) { if (!left[k] || avoid(k)) continue; r -= left[k]; if (r < 0) { pick = k; break; } } }
      if (!pick) { tot = 0; for (const k of ORDER) tot += left[k]; let r = srnd() * tot; for (const k of ORDER) { r -= left[k]; if (r < 0) { pick = k; break; } } }
      pos[p] = take(pick);
    }
    const nums = []; for (let i = 1; i <= N; i++) if (i !== this.no) nums.push(i);
    for (let i = nums.length - 1; i > 0; i--) { const k = Math.floor(srnd() * (i + 1)); [nums[i], nums[k]] = [nums[k], nums[i]]; }
    const list = []; for (let p = 1; p <= N; p++) list.push({ rar: pos[p], no: p === j ? this.no : nums.pop(), target: p === j });
    // кожна рідкість — один InstancedMesh (виклик малювання на всі вагони цього кольору), але кожен вагон рухається сам: зчеплення, ресори
    const cnt = {}; for (const c of list) if (!c.target) cnt[c.rar] = (cnt[c.rar] || 0) + 1;
    const im = {}, used = {};
    for (const k in cnt) { const m = new THREE.InstancedMesh(this.carBase(k), this.tmat, cnt[k]); m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.scene.add(m); this.ims.push(m); im[k] = m; used[k] = 0; }
    this.strip = new THREE.InstancedMesh(paint(box(BODY0 + 0.2 - H2, BODY1 - 0.2 - H2, FLOOR - 0.1, FLOOR - 0.04, HALF + 0.07, HALF + 0.09, '#ffffff'), '#ffffff'), this.stripM, N);   // світлова смуга кольору рідкості
    this.strip.frustumCulled = false; this.strip.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.scene.add(this.strip);
    const atlas = numberAtlas(list), decM = new THREE.MeshLambertMaterial({ map: atlas, transparent: true, polygonOffset: true, polygonOffsetFactor: -2 });
    const prM = new THREE.MeshLambertMaterial({ map: (this.printTex ||= printAtlas()), transparent: true, polygonOffset: true, polygonOffsetFactor: -2 });
    let lastPr = -1;
    const print = () => { let d = Math.floor(srnd() * PRINTS); if (d === lastPr) d = (d + 1) % PRINTS; lastPr = d; const pl = new THREE.PlaneGeometry(3.6, 1.8), uv = pl.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, ((d % 4) + uv.getX(k)) / 4, 1 - (Math.floor(d / 4) + 1 - uv.getY(k)) / 2); const m = new THREE.Mesh(pl, prM); this.scene.add(m); return m; };
    list.forEach((c, i) => {
      this.strip.setColorAt(i, _c.set(RARITY[c.rar].col));
      const pl = new THREE.PlaneGeometry(3.6, 1.8), uv = pl.attributes.uv, u0 = (i % 4) / 4, v0 = 1 - (Math.floor(i / 4) + 1) / 5;
      for (let k = 0; k < uv.count; k++) uv.setXY(k, u0 + uv.getX(k) / 4, v0 + uv.getY(k) / 5);
      const dec = new THREE.Mesh(pl, decM); this.scene.add(dec);
      const pdec = print();
      if (c.target) { this.extras(dec, i); pdec.position.set(4.4, 2.95, HALF + 0.06); this.tg.add(pdec); return; }
      im[c.rar].setColorAt(used[c.rar], _c.setScalar(0.88 + srnd() * 0.18));   // кожен вагон трохи свого відтінку: різний вік фарби
      this.slots.push({ im: im[c.rar], i: used[c.rar]++, si: i, dec, pdec });
    });
    if (this.strip.instanceColor) this.strip.instanceColor.needsUpdate = true;
    for (const k in im) if (im[k].instanceColor) im[k].instanceColor.needsUpdate = true;
    if (this.r.initTexture) this.r.initTexture(atlas);
    this.place(Math.max(0, this.now()));
  }
  carBase(rar) { (this.cache ||= {}); return (this.cache[rar] ||= carGeo(RARITY[rar].col)); }
  /** Цільовий вагон окремою групою: двері відʼїжджають, темне нутро, світло рідкості, промінь на перон, пара, герой усередині. */
  extras(dec, si) {
    const col = RARITY[this.rar].col, g = (this.tg = new THREE.Group()); this.scene.add(g);
    this.slots.push({ obj: g });
    g.add(new THREE.Mesh(carGeo(col, false, true), this.tmat));
    dec.position.set(-4.615, 3.0, HALF + 0.06); g.add(dec);
    const strip = new THREE.Mesh(box(BODY0 + 0.2 - H2, BODY1 - 0.2 - H2, FLOOR - 0.1, FLOOR - 0.04, HALF + 0.07, HALF + 0.09, col), this.glowM); g.add(strip);
    this.strip.setColorAt(si, _c.set(0x000000)); this.strip.setMatrixAt(si, _m.makeTranslation(0, -50, 0));
    const d0 = DOOR0 - H2, d1 = DOOR1 - H2;
    this.door = new THREE.Mesh(merge([box(d0, d1, FLOOR + 0.1, DOOR_TOP, HALF + 0.05, HALF + 0.11, hexMix(col, '#000000', 0.07)), ...[2.05, 2.75, 3.4].map((y) => box(d0, d1, y, y + 0.07, HALF + 0.11, HALF + 0.13, hexMix(col, '#000000', 0.14)))]), this.mat);
    g.add(this.door);
    this.inLight.color.set(col); this.inLight.position.set(0, 3.0, -1.35); g.add(this.inLight);   // світло в глибині вагона: героя підсвічує ззаду, а не палить у груди
    this.backM = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const back = new THREE.Mesh(new THREE.PlaneGeometry(d1 - d0 + 2.4, EAVE - FLOOR - 0.2), this.backM); back.position.set(0, (FLOOR + EAVE) / 2, -HALF + 0.14); g.add(back);   // світло рідкості на дальній стінці нутра
    const bg = new THREE.BufferGeometry(), x0 = d0 + 0.1, x1 = d1 - 0.1, fy = PLAT - RAIL + 0.02;   // промінь із дверей на перон: біля дверей світлий, далі тане
    bg.setAttribute('position', new THREE.Float32BufferAttribute([x0, DOOR_TOP, HALF + 0.1, x1, DOOR_TOP, HALF + 0.1, x1 + 1.6, fy, 6.4, x0, DOOR_TOP, HALF + 0.1, x1 + 1.6, fy, 6.4, x0 - 1.6, fy, 6.4], 3));
    _c.set(col); bg.setAttribute('color', new THREE.Float32BufferAttribute([1, 1, 0, 1, 0, 0].flatMap((v) => [_c.r * v, _c.g * v, _c.b * v]), 3));
    this.beamM = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    g.add(new THREE.Mesh(bg, this.beamM));
    this.poolM = new THREE.MeshBasicMaterial({ map: this.glow, color: col, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(7, 4.6), this.poolM); pool.rotation.x = -Math.PI / 2; pool.position.set(0, fy + 0.01, 3.6); g.add(pool);
    this.seamM = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const seam = new THREE.Mesh(new THREE.PlaneGeometry(0.09, DOOR_TOP - FLOOR - 0.1), this.seamM); seam.position.set(d0 + 0.02, (FLOOR + DOOR_TOP) / 2, HALF + 0.13); g.add(seam);
    if (this.rar === 'l') {
      const rays = canvasTex(256, 256, (c, w) => { c.translate(w / 2, w / 2); for (let i = 0; i < 16; i++) { c.rotate(Math.PI / 8); const gr = c.createLinearGradient(0, 0, w / 2, 0); gr.addColorStop(0, 'rgba(255,220,120,.9)'); gr.addColorStop(1, 'rgba(255,220,120,0)'); c.fillStyle = gr; c.beginPath(); c.moveTo(0, 0); c.lineTo(w / 2, -9); c.lineTo(w / 2, 9); c.fill(); } });
      this.rays = new THREE.Sprite(new THREE.SpriteMaterial({ map: rays, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      this.rays.scale.set(9, 9, 1); this.rays.position.set(0, 2.9, 1.0); g.add(this.rays);
      this.flashS = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: 0xffe9a8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false })); this.flashS.scale.set(60, 40, 1); this.flashS.position.set(0, 2.6, -1.2); g.add(this.flashS);
    }
    this.prepHero();
  }
  /** Модель героя будується одразу й стоїть у вагоні за зачиненими дверима: шейдери збираються наперед, а конструктор не дає фризу в мить відчинення. */
  prepHero() {
    let look = null; try { look = this.o.view ? this.o.view(this.hero_).look : null; } catch (e) { console.warn(e); }
    if (!look) return;
    try {
      const p = new Player(look), hg = new THREE.Group();
      hg.position.set(0, FLOOR, 0); hg.add(p.root); this.tg.add(hg);
      p.root.traverse((o) => o.layers.set(1));
      p.x = 0; p.z = HERO_Z0; p.yaw = 0; p.vx = 0; p.vz = 0; p.mode = 'idle'; p.setExpr('happy');
      for (let i = 0; i < 6; i++) p.animate(0.05);
      this.hero = p; this.heroG = hg;
    } catch (e) { console.warn(e); }
  }

  // ---------------------------------------------------------------- іскри гальм: з-під коліс вагонів, що біля камери
  sparksInit() {
    const n = 160, pa = new Float32Array(n * 3).fill(-50), geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pa, 3));
    this.spkM = new THREE.PointsMaterial({ map: this.glow, color: 0xffa040, size: 0.42, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const pts = new THREE.Points(geo, this.spkM); pts.frustumCulled = false; this.scene.add(pts);
    this.spk = { n, pa, v: new Float32Array(n * 3), life: new Float32Array(n), geo };
  }
  sparks(now, dt, X) {
    const S = this.spk, on = this.sparkAt && now > this.sparkAt[0] && now < this.sparkAt[1], L = this.rar === 'l', rate = (L ? 0.6 : 0.35) * (this.low ? 0.5 : 1);
    for (let i = 0; i < S.n; i++) {
      if (S.life[i] <= 0) {
        if (!on || srnd() > rate) { S.pa[i * 3 + 1] = -50; continue; }
        const k = 1 + Math.floor(srnd() * (this.slots.length - 1)), s = Math.max(0, this.now()), cx = this.bodyX(k, s);
        if (cx < -16 || cx > 16 || this.bodyV(k, s) < 1.2) { S.pa[i * 3 + 1] = -50; continue; }
        S.pa[i * 3] = cx + AX_CAR[i & 3] - H2; S.pa[i * 3 + 1] = 0.95; S.pa[i * 3 + 2] = 1.68;   // з-під гальмівних колодок у щілину між вагоном і пероном: видно над краєм
        S.v[i * 3] = -(1.5 + srnd() * 5); S.v[i * 3 + 1] = 2.2 + srnd() * (L ? 4.2 : 3.0); S.v[i * 3 + 2] = 0.3 + srnd() * 2.2; S.life[i] = 0.2 + srnd() * 0.35;
      }
      S.life[i] -= dt; S.v[i * 3 + 1] -= 9.8 * dt;
      S.pa[i * 3] += S.v[i * 3] * dt; S.pa[i * 3 + 1] += S.v[i * 3 + 1] * dt; S.pa[i * 3 + 2] += S.v[i * 3 + 2] * dt;
    }
    S.geo.attributes.position.needsUpdate = true;
  }

  // ---------------------------------------------------------------- кадр
  tween(fn, at, dur, ease = smooth) { this.tw.push({ fn, t0: at, dur, ease }); }
  frame(now) {
    if (this.dead) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    if (this.drawn && dt > 0) {                                        // адаптивна роздільність: кадр довший за 24 мс — менше пікселів (до 70% від початкової)
      this.ftAcc += dt; this.ftN++;
      if (this.ftAcc > 1) { const avg = this.ftAcc / this.ftN; this.ftAcc = 0; this.ftN = 0; if (avg > 0.024 && this.pr > this.pr0 * 0.72) { this.pr = Math.max(this.pr0 * 0.7, this.pr - 0.15); this.r.setPixelRatio(this.pr); this.fit(); } }
    }
    if (this.t0 == null && this.drawn) this.go(now);
    const s = this.frozen ? 1e6 : this.now(), x = this.place(s), v = this.bodyV(0, s);
    // камера: від погляду вздовж колії на тепловоз до бокового плану; дрижить від потяга, що мчить поруч, і здригається від удару зчеплень
    const u = 1,                                                       // камера весь час збоку навпроти місця зупинки: потяг вʼїжджає в кадр, камера за ним не крутиться
          push = this.stopT ? easeOut((now - this.stopT) / 2600) : 0;
    _p.lerpVectors(CAM0, CAM1, u); _l.lerpVectors(LOOK0, LOOK1, u);
    _p.z -= 1.2 * push; _p.y -= 0.15 * push; _l.y -= 0.2 * push;
    if (this.blurT) {                                                 // наїзд на героя: на весь екран, ноги трохи обрізані, сам герой ліворуч
      const z = smooth((now - this.blurT) / 900), d = Math.max(2, _p.z - HERO_PATH[HERO_PATH.length - 1][1]), half = HERO_H / 2;
      const fz = (2 * Math.atan(half / d) * 180) / Math.PI, sx = half * this.cam.aspect * (1 - 2 * HERO_X) * z;
      _l.y += (PLAT + HERO_C - _l.y) * z; _p.x += sx; _l.x += sx;
      const fv = this.fov0 + (fz - this.fov0) * z; if (Math.abs(this.cam.fov - fv) > 1e-3) { this.cam.fov = fv; this.cam.updateProjectionMatrix(); }
    }
    const rum = 0.012 * (v / V); _p.y += Math.sin(now * 0.071) * rum; _p.x += Math.sin(now * 0.053) * rum * 0.6;
    const m = this.plan;
    if (m && !this.frozen) { const k = s - m.stopS; if (k > 0 && k < 0.7) { const a = 0.05 * Math.exp(-k * 7); _p.x += Math.sin(k * 52) * a; _l.x += Math.sin(k * 52) * a * 0.5; } }
    if (this.shakeT && now < this.shakeT + 460) { const k = 1 - (now - this.shakeT) / 460, f = now * 0.09; _p.x += Math.sin(f * 7.1) * 0.07 * k; _p.y += Math.sin(f * 9.3) * 0.05 * k; }
    _p.y -= PLAT; _l.y -= PLAT;                                       // камера у світі, сцена опущена на висоту перону
    this.cam.position.copy(_p); this.cam.lookAt(_l);
    for (let i = this.tw.length - 1; i >= 0; i--) { const t = this.tw[i], k = (now - t.t0) / t.dur; if (k < 0) continue; t.fn(t.ease(Math.min(1, k))); if (k >= 1) this.tw.splice(i, 1); }
    this.sparks(now, dt, x);
    if (this.steamT) for (let i = 0; i < this.steam.length; i++) {
      const p = this.steam[i], k = (now - this.steamT - p.t0) / (p.d * 1000);
      if (k < 0 || k > 1) { p.s.material.opacity = 0; continue; }
      p.s.position.set(p.dx * k, 1.7 + p.dy * k, HALF + 0.3 + p.dz * k); const sc = 0.6 + p.sc * k; p.s.scale.set(sc, sc, 1); p.s.material.opacity = 0.75 * Math.sin(Math.PI * k);
    }
    if (this.rays && this.rays.material.opacity > 0) this.rays.material.rotation += dt * 0.25;
    if (this.walking) this.walk(now, dt);
    if (this.hero && this.blurT) {                                     // обертання героя пальцем
      if (!this.drag) {
        this.spin += this.spinV * dt; this.spinV *= Math.exp(-dt * 3.2);
        if (now > this.spinWait && Math.abs(this.spinV) < 0.3) { const a = ((((this.spin + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI; this.spin = a + (0 - a) * Math.min(1, dt * 2); }
      }
      this.hero.root.rotation.y = this.spin;
    }
    if (this.blurT) this.drawBlur(smooth((now - this.blurT) / 800));
    else if (this.hero) { const r = this.r, c = this.cam; c.layers.mask = 1; r.render(this.scene, c); c.layers.mask = 2; r.autoClear = false; r.render(this.scene, c); r.autoClear = true; c.layers.mask = 3; }   // світло з дверей не лягає поверх героя
    else this.r.render(this.scene, this.cam);
    this.drawn = true;
  }
  /**
   * Фон без героя — у текстуру пів роздільності; дуальний Кавасе вниз до 1/32 і назад дає м'які кольорові плями без жодної форми
   * (потяг, перон і табло зникають). На екран — змішування різкого й розмитого за силою k з легким затемненням у колір рідкості; герой
   * зверху різкий (шар 1). Світла на обох шарах, тож шейдери ті самі.
   */
  drawBlur(k) {
    const r = this.r, B = this.bl || this.blurInit(), c = this.cam, L = B.lv;
    c.layers.mask = 1; r.setRenderTarget(L[0]); r.render(this.scene, c);
    const pass = (m, src, dst) => { B.q.material = m; m.uniforms.t.value = src.texture; m.uniforms.px.value.set(1 / src.width, 1 / src.height); r.setRenderTarget(dst); r.render(B.sc, B.cam); };
    for (let i = 1; i < L.length; i++) pass(B.down, L[i - 1], L[i]);
    pass(B.up, L[L.length - 1], B.upr[L.length - 2]);
    for (let i = L.length - 2; i > 1; i--) pass(B.up, B.upr[i], B.upr[i - 1]);
    B.mix.uniforms.a.value = L[0].texture; B.mix.uniforms.b.value = B.upr[1].texture; B.mix.uniforms.k.value = k;
    r.setRenderTarget(null); B.q.material = B.mix; r.render(B.sc, B.cam);
    c.layers.mask = 2; r.autoClear = false; r.clearDepth(); r.render(this.scene, c); r.autoClear = true; c.layers.mask = 3;
  }
  blurInit() {
    const r = this.r, gl = r.getContext(), half = r.extensions.has('EXT_color_buffer_float') || r.extensions.has('EXT_color_buffer_half_float');
    const type = half ? THREE.HalfFloatType : THREE.UnsignedByteType, W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
    const rt = (d, depth) => new THREE.WebGLRenderTarget(Math.max(2, Math.round(W / d)), Math.max(2, Math.round(H / d)), { type, depthBuffer: depth });
    const lv = [rt(2, true), rt(4), rt(8), rt(16), rt(32)], upr = [null, rt(4), rt(8), rt(16)];
    const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
    const sh = (fs) => new THREE.ShaderMaterial({ uniforms: { t: { value: null }, px: { value: new THREE.Vector2() } }, vertexShader: VS, fragmentShader: fs, depthTest: false, depthWrite: false, toneMapped: false });
    const down = sh('uniform sampler2D t; uniform vec2 px; varying vec2 vUv; void main(){ vec2 h = px; vec4 s = texture2D(t, vUv) * 4.0; s += texture2D(t, vUv - h); s += texture2D(t, vUv + h); s += texture2D(t, vUv + vec2(h.x, -h.y)); s += texture2D(t, vUv - vec2(h.x, -h.y)); gl_FragColor = s / 8.0; }');
    const up = sh('uniform sampler2D t; uniform vec2 px; varying vec2 vUv; void main(){ vec2 h = px * 1.5; vec4 s = texture2D(t, vUv + vec2(-h.x * 2.0, 0.0)); s += texture2D(t, vUv + vec2(-h.x, h.y)) * 2.0; s += texture2D(t, vUv + vec2(0.0, h.y * 2.0)); s += texture2D(t, vUv + vec2(h.x, h.y)) * 2.0; s += texture2D(t, vUv + vec2(h.x * 2.0, 0.0)); s += texture2D(t, vUv + vec2(h.x, -h.y)) * 2.0; s += texture2D(t, vUv + vec2(0.0, -h.y * 2.0)); s += texture2D(t, vUv + vec2(-h.x, -h.y)) * 2.0; gl_FragColor = s / 12.0; }');
    _c.set(RARITY[this.rar || 'c'].col).convertSRGBToLinear();
    const mix = new THREE.ShaderMaterial({ uniforms: { a: { value: null }, b: { value: null }, k: { value: 0 }, tint: { value: new THREE.Vector3(_c.r, _c.g, _c.b) } }, vertexShader: VS, depthTest: false, depthWrite: false,
      fragmentShader: 'uniform sampler2D a; uniform sampler2D b; uniform float k; uniform vec3 tint; varying vec2 vUv; void main(){ vec3 c = mix(texture2D(a, vUv).rgb, texture2D(b, vUv).rgb, k); float v = 1.0 - 0.55 * length(vUv - 0.5); c = mix(c, c * 0.62 * v + tint * 0.1, k); gl_FragColor = vec4(c, 1.0);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}' });
    const sc = new THREE.Scene(), q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), down); sc.add(q);
    this.bl = { lv, upr, down, up, mix, sc, q, cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1) };
    return this.bl;
  }
  blurFree() { const B = this.bl; if (!B) return; for (const t of [...B.lv, ...B.upr]) if (t) t.dispose(); B.down.dispose(); B.up.dispose(); B.mix.dispose(); B.q.geometry.dispose(); this.bl = null; }

  // ---------------------------------------------------------------- зупинка й розкриття
  stopAt() {
    this.stopped = true; this.stopT = performance.now();
    const now = this.stopT, r = this.rar, s = this.sound;
    this.flapTo(now);
    const open = (at, dur) => { this.tween((k) => { this.door.position.x = k * (DOOR1 - DOOR0 + 0.2); }, now + at, dur, r === 'l' ? easeOut : smooth); s.door(now + at, dur < 300); };
    const light = (at, dur, to) => this.tween((k) => { this.inLight.intensity = 30 * to * k; this.backM.opacity = 0.55 * to * k; this.beamM.opacity = (r === 'c' ? 0.12 : 0.3) * k; this.poolM.opacity = (r === 'c' ? 0.25 : 0.55) * k; }, now + at, dur);
    let heroAt, chord;
    if (r === 'c') { open(420, 600); light(420, 600, 0.6); heroAt = 800; chord = 600; }
    else if (r === 'r') {
      this.tween((k) => { this.seamM.opacity = k; }, now + 200, 260);
      this.tween((k) => { this.door.position.x = 0.25 * k; this.inLight.intensity = 8 * k; }, now + 460, 200, easeOut); s.door(now + 460, true);
      open(780, 480); light(780, 450, 1); this.tween((k) => { this.seamM.opacity = 1 - k; }, now + 780, 300);
      heroAt = 1040; chord = 780;
    } else if (r === 'e') {
      this.tween((k) => { const f = Math.abs(Math.sin(k * Math.PI * 3)); this.inLight.intensity = 30 * (0.35 + 0.65 * f); this.backM.opacity = 0.5 * f; }, now + 220, 800, (v) => v);
      open(970, 480); light(970, 400, 1.1); heroAt = 1250; chord = 970;
    } else {
      this.tween((k) => { this.r.toneMappingExposure = 1.05 - 0.6 * k; }, now + 140, 320);
      s.silence(now + 180, 0.5);
      this.at(280, () => { this.shakeT = performance.now(); });
      this.tween((k) => { this.flashS.material.opacity = 0.95 * (k < 0.16 ? k / 0.16 : 1 - (k - 0.16) / 0.84); }, now + 740, 620, (v) => v);   // спалах за героєм: він лишається видимим
      this.tween((k) => { this.r.toneMappingExposure = 0.45 + 0.75 * k; }, now + 740, 500, easeOut);
      open(740, 240); light(740, 160, 1.1);
      this.tween((k) => { this.rays.material.opacity = 0.75 * k; }, now + 780, 600);
      heroAt = 1020; chord = 740;
    }
    s.chord(r, now + chord); this.chordAt = now + chord;
    this.at(heroAt, () => this.heroOut(false));
  }
  /** Номер на табло перегортається щитками. */
  flapTo(now) {
    const str = String(this.no).padStart(2, '0');
    for (let i = 0; i < 2; i++) {
      const n = 6 + i * 3;
      for (let k = 0; k <= n; k++) { const t = k * 70 + i * 40; this.at(t, () => { this.flaps[i] = k === n ? str[i] : String(Math.floor(srnd() * 10)); redraw(this.boardTex); }); this.sound.flap(now + t); }
    }
    this.at(780, () => { this.rarTxt = UA[this.rar]; redraw(this.boardTex); });
  }
  /** Герой виходить із глибини вагона на перон, показується обличчям до камери й радіє; потім кадр зсуває його ліворуч, праворуч — блок параметрів. instant — одразу кінцевий кадр (пропуск). */
  heroOut(instant) {
    const p = this.hero;
    if (!p) { this.showCard(instant); if (!instant) this.at(400, () => this.end('done')); return; }
    if (instant) { const [x, z] = HERO_PATH[HERO_PATH.length - 1]; p.x = x; p.z = z; p.vx = p.vz = 0; p.yaw = 0; p.root.position.set(x, 0, z); this.place(1e6); this.tg.updateMatrixWorld(true); this.scene.attach(this.heroG); /* вагон уже на кінцевому місці, інакше герой лишився б там, де вагон був у мить пропуску */ p.setExpr('happy'); this.walking = true; this.leg = HERO_PATH.length; this.blurT = performance.now() - 2000; this.showCard(true); return; }
    this.tg.updateMatrixWorld(true); this.scene.attach(this.heroG); // далі вагон ще погойдується, а герой — ні
    this.walkT = performance.now() + 150; this.walking = true; this.leg = 0;
    for (let k = 0; k < 4; k++) this.sound.step(performance.now() + 650 + k * 480);
  }
  walk(now, dt) {
    const p = this.hero;
    if (now > this.walkT && this.leg < HERO_PATH.length) {
      const [tx, tz] = HERO_PATH[this.leg], dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz), sp = Math.min(2.3, (this.hv = Math.min(2.3, (this.hv || 0) + 3.4 * dt)), Math.sqrt(2 * 3.4 * d) + 0.05);   // крок, а не біг: розгін і гальмування, без провалу на першому кроці
      if (d < sp * dt) {
        p.x = tx; p.z = tz;
        if (++this.leg >= HERO_PATH.length) { p.vx = p.vz = 0; p.yaw = 0; this.at(150, () => p.cheer(0.9)); this.at(800, () => { this.blurT = performance.now(); this.showCard(false); this.at(950, () => this.end('done')); }); }
      } else { p.vx = (dx / d) * sp; p.vz = (dz / d) * sp; p.yaw = Math.atan2(dx, dz); p.x += p.vx * dt; p.z += p.vz * dt; }
    }
    p.animate(dt);
  }
  /** Блок параметрів героя праворуч (o.card === false — його малює той, хто відкрив). */
  showCard(instant) {
    if (this.cardEl || this.o.card === false || !this.hero_) return;
    this.el.insertAdjacentHTML('beforeend', cardHtml(this.hero_, this.no));
    const c = (this.cardEl = this.el.lastElementChild);
    if (instant) { c.classList.add('in', 'now'); return; }
    requestAnimationFrame(() => c.classList.add('in'));
  }

  // ---------------------------------------------------------------- пропуск, кінець, помилка
  skipNow() {
    if (this.dead || this.ended) return;
    if (!this.plan) { this.skipReq = true; return; }
    this.final(false);
  }
  /** Одразу кінцевий кадр: потяг стоїть, номер на табло, двері відчинені, світло, герой на пероні. */
  final(soft) {
    for (const t of this.timers) clearTimeout(t); this.timers = []; this.tw = [];
    this.stopped = true; this.sound.stop(120); this.sparkAt = null;
    if (!this.broken) {
      this.frozen = true; this.stopT = performance.now() - 2600; this.r.toneMappingExposure = 1.05; this.shakeT = 0;
      this.flaps = String(this.no).padStart(2, '0').split(''); this.rarTxt = UA[this.rar]; redraw(this.boardTex);
      const r = this.rar; this.door.position.x = DOOR1 - DOOR0 + 0.2; this.inLight.intensity = 30 * (r === 'c' ? 0.6 : 1); this.backM.opacity = 0.5; this.beamM.opacity = r === 'c' ? 0.12 : 0.3; this.poolM.opacity = r === 'c' ? 0.25 : 0.55; this.seamM.opacity = 0;
      if (this.rays) this.rays.material.opacity = 0.75;
      this.heroOut(true);
    }
    if (!(this.chordAt && performance.now() >= this.chordAt)) new TrainSound(true).chord(this.rar, performance.now() + 60);   // акорд звучить один раз
    if (soft) { this.at(1200, () => this.end('done')); return; }
    requestAnimationFrame(() => requestAnimationFrame(() => this.end('skip')));
  }
  /** Де герой на екрані: рамка від стоп до піднятих рук. */
  heroRect() {
    if (!this.hero) return null;
    const b = this.el.getBoundingClientRect();
    this.heroG.getWorldPosition(_p); const z = _p.z + this.hero.z;
    const hx = _p.x + this.hero.x;
    _v.set(hx, _p.y - 0.05, z).project(this.cam); _w.set(hx, _p.y + 2.2, z).project(this.cam);
    const x = b.left + ((_v.x + 1) / 2) * b.width, y0 = b.top + ((1 - _w.y) / 2) * b.height, y1 = b.top + ((1 - _v.y) / 2) * b.height, h = Math.max(1, y1 - y0), w = h * 0.62;
    return new DOMRect(x - w / 2, y0, w, h);
  }
  end(kind) {
    if (this.ended || this.dead) return;
    this.ended = true;
    const hero = this.heroRect(), card = this.cardEl ? this.cardEl.getBoundingClientRect() : null;
    this.res({ end: kind, at: card || hero, hero, card, close: () => this.close() });
  }
  fail() {
    if (this.dead || this.ended || this.failed || this.plan) return;
    this.failed = true; if (this.boardTex) redraw(this.boardTex);
    this.at(1600, () => {
      this.sound.stop(400); this.opaque = false;
      this.el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, fill: 'forwards' }).finished.then(() => { this.kill(); this.res({ end: 'error', at: null, close() {} }); }, () => {});
    });
  }
  close() {
    if (this.dead || this.closing) return;
    this.closing = true; this.opaque = false;
    this.sound.stop(250);
    this.el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250, fill: 'forwards' }).finished.then(() => this.kill(), () => this.kill());
  }
  /** Усе прибрати: таймери, звук, кадр, сцену й сам контекст WebGL (другий контекст не має жити довше за сцену, BUGS GFX-2). */
  kill() {
    if (this.dead) return;
    this.dead = true; this.opaque = false;
    for (const t of this.timers) clearTimeout(t);
    cancelAnimationFrame(this.raf);
    this.sound.stop(120);
    removeEventListener('resize', this.onSize);
    if (this.scene) this.scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); const m = o.material; if (m) for (const x of Array.isArray(m) ? m : [m]) { if (x.map) x.map.dispose(); x.dispose(); } });
    if (this.cache) for (const k in this.cache) this.cache[k].dispose();
    this.blurFree();
    if (this.env) this.env.dispose();
    if (this.r) { this.r.dispose(); this.r.forceContextLoss(); }
    this.el.remove();
    if (getTrain() === this) setTrain(null);
  }
}
