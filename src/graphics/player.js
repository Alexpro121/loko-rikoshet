import * as THREE from 'three';
import { VoxelBuilder } from './voxel.js';
import { playerAtlas, faceCell, numberCell, sponsorCell, crestCell } from './textures.js';
import { Gait } from './gait.js';
import { CCDIKSolver } from 'three/examples/jsm/animation/CCDIKSolver.js';
import { Ragdoll, ragPoints } from './ragdoll.js';
import { PITCH } from '../config.js';

// Пропорції за анатомією (до масштабу look.scale): ~2.65 одиниці зросту, стегна на ~47%, плечі на ~78% зросту,
// кінчики пальців опущених рук — на середині стегна, голова ≈ 1/6.5 зросту.
const YA = 0.1;                                      // висота щиколотки над травою
const THIGH = 0.6, SHIN = 0.55, LEG = THIGH + SHIN;   // стегно до коліна, гомілка до щиколотки
const HIP = YA + LEG * 0.985;                        // висота стегон у стійці (нога майже пряма)
const HIP_LIE = 0.22;                                // висота стегон, коли гравець лежить на траві
const UPPER = 0.42;                                  // плече до ліктя
const NECK = 0.85, WAIST = 0.25, CHEST = 0.5;                      // висота основи шиї й талії від стегон
const SHOULDER_X = 0.32, SHOULDER_Y = 0.74, HIP_X = 0.14;   // плечові й тазостегнові суглоби
const G_ACC = 9.8;
const DEG = Math.PI / 180;
const TAU = Math.PI * 2;
export const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const easeOut = (t) => 1 - (1 - t) * (1 - t);
const smooth = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;

const _w = new THREE.Vector3();
// руки воротаря (IK): тимчасові вектори, щоб не створювати їх щокадру
const _hc = new THREE.Vector3(), _hv = new THREE.Vector3(), _hd = new THREE.Vector3(), _hl = new THREE.Vector3(), _hs = new THREE.Vector3();
/** armGuard: точки руки [y у вузлі, радіус] (два на передпліччі, два на кисті/рукавиці) і ноги в системі грудей. */
const ARM_PTS = [0, 0.06, -0.15, 0.055, 0, 0.05, -0.13, 0.06];
const CLAP_POLE = [0.9, -1, -0.15], CLAP_POLE_UP = [1, 0.15, -0.35];
const WAVE_POLE = [1, -0.7, 0.05], WAVE_POLE_UP = [1, 0.25, -0.3], WAVE_POLE_LOW = [1, -1, -0.25];   // лікоть при маханні (права рука)   // полюси ліктя для оплесків (права рука)
const SAD_UPPER = new Set(['armA', 'armB', 'elbA', 'elbB', 'leanX', 'leanY', 'leanZ', 'hdX', 'hdY', 'hdZ', 'spread', 'sdA', 'sdB']);
const PB_N = 32;                                      // пам'ять руху м'яча для сприйняття воротаря (кадрів)
const _pv = new THREE.Vector3(), _ik2 = new THREE.Vector3();
const _pT = new THREE.Vector3(), _pD = new THREE.Vector3(), _pP = new THREE.Vector3(), _pE = new THREE.Vector3(), _pU = new THREE.Vector3(), _pF = new THREE.Vector3(), _ax = new THREE.Vector3(), _ay = new THREE.Vector3(), _az = new THREE.Vector3(), _pM = new THREE.Matrix4(), _pR = new THREE.Euler();
const _gw = new THREE.Vector3(), _gl = new THREE.Vector3(), _gp = new THREE.Vector3(), _gn = new THREE.Vector3(), _gs = new THREE.Vector3(), _gv = new THREE.Vector3(), _ga = new THREE.Vector3(), _gq = new THREE.Quaternion();
const _hq = new THREE.Vector3(), _LG = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(() => new THREE.Vector3());   // 0–5 ноги, 6–9 друга рука
const OTHER_R = [0.08, 0.065, 0.08];                                                  // товщина другої руки: плече, передпліччя, рукавиця
const _hw = new THREE.Vector3(), _hu = new THREE.Vector3(), _hf = new THREE.Vector3(), _hp = new THREE.Vector3(), _hx = new THREE.Vector3(), _hz = new THREE.Vector3();
const _hm = new THREE.Matrix4(), _hqa = new THREE.Quaternion(), _hqe = new THREE.Quaternion(), _hqh = new THREE.Quaternion(), _hqi = new THREE.Quaternion();
const _XA = new THREE.Vector3(1, 0, 0), _Q1 = new THREE.Quaternion();
/** Дії воротаря, у яких руки працюють свідомо (м'язи, без розхитування). */
const GK_MODES = new Set(['pdive', 'gkdive', 'catch', 'scoop', 'parry', 'gkjump', 'throw', 'gkwait']);

/**
 * Кінематика стрибка воротаря за прогресом P (0..1 — сам стрибок, далі лежить і встає).
 * Фази (за біомеханікою сейву): 0–0.12 короткий присід (контррух), 0.12–0.30 відштовхування — спершу дальня від м'яча
 * нога, потім ближня, 0.30–0.72 балістичний політ, 0.72–0.90 приземлення й ковзання, далі лежить.
 * travel — частка бічного переміщення: плавний розгін на відштовхуванні, стала швидкість у польоті, гальмування на траві
 * (швидкість неперервна на межах фаз). roll — оберт тіла вбік (рад), lift — висота таза над звичайною (одиниці моделі).
 * kind: 0 — у верхній кут (високий політ), 1 — середня висота, 2 — низом: майже без польоту, тіло «падає» вбік і
 * лягає вздовж газону вже на середині стрибка, руки йдуть по траві. true/false — старі «верх/середина».
 */
const DK = { travel: 0, roll: 0, lift: 0, maxRoll: 0, landAt: 0 };   // результат — у спільному об'єкті (читається одразу), без виділень щокадру
const DK_MAXR = [1.42, 1.34, 1.46], DK_R0 = [0.16, 0.13, 0.1], DK_RL = [0.58, 0.5, 0.42], DK_PEAK = [1.05, 0.42, 0.12];
const dkSm = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
/**
 * Фази стрибка з місця, як у людини: присід (контррух, load), відрив і балістична дуга (air, висота h = 4u(1−u)), у польоті —
 * коліна підібрані (tuck), приземлення — амортизація колінами (absorb), що згасає. c — кінець присіду, l — мить приземлення
 * (частки тривалості дії). Результат — у спільному об'єкті (читається одразу), без виділень.
 */
const JP = { load: 0, air: 0, h: 0, u: 0, tuck: 0, absorb: 0 };
/** Акцент жесту з періодом 1 (x — фаза в «ударах»): різкий удар (~20% періоду, easeOut) і повільніше повернення — як у людини. */
function accent(x) { const p = x - Math.floor(x); return p < 0.2 ? 1 - (1 - p / 0.2) ** 3 : 1 - smooth((p - 0.2) / 0.8); }
function jumpPhase(mk, c, l) {
  const sm = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
  JP.load = sm(mk / (c * 0.8)) * (1 - sm((mk - c * 0.8) / (c * 0.35)));
  const u = clamp((mk - c) / (l - c), 0, 1); JP.u = u;
  JP.air = sm((mk - c) / 0.07) * (1 - sm((mk - l) / 0.07)); JP.h = mk > c && mk < l ? 4 * u * (1 - u) : 0;   // руки й тулуб входять у політ за ~0.07, не стрибком
  JP.tuck = mk > c && mk < l ? Math.sin(Math.PI * u) : 0;
  JP.absorb = mk >= l ? Math.sin(Math.PI * clamp((mk - l) / (1 - l), 0, 1)) : 0;
  return JP;
}

/** Сила м'язів ragdoll за точкою (див. ragdoll.js): стрибок воротаря і падіння польового — сталі функції, без замикань у кадрі. */
// руки не надто сильні: інакше, тягнучись до цілі, вони викручували й відкидували все тіло в польоті
const DRIVE_DIVE = (i) => (i === 0 || i === 1 || i === 8 || i === 9 || i === 11 || i === 12 ? 420 : i >= 13 ? 360 : i === 10 ? 320 : 280);
const DRIVE_TOUCH = (i) => (i === 0 || i === 1 || i === 8 || i === 9 || i === 11 || i === 12 ? 420 : i >= 13 ? 160 : i === 10 ? 320 : 280);
const DRIVE_FALL = (i) => (i === 0 || i === 1 || i === 8 ? 0 : i === 9 || i === 11 || i === 12 ? 160 : i >= 13 ? 480 : i === 10 ? 260 : 230);
/** Точки контролю газону: [вузол, y (null — висота голови), z, радіус] у одиницях моделі. */
const GROUND_PROBES = [['footL', -0.08, 0.2, 0.03], ['footR', -0.08, 0.2, 0.03], ['footL', -0.08, -0.05, 0.03], ['footR', -0.08, -0.05, 0.03],
  ['shinL', 0, 0, 0.08], ['shinR', 0, 0, 0.08], ['handL', -0.13, 0, 0.08], ['handR', -0.13, 0, 0.08], ['handL', -0.22, 0, 0.07], ['handR', -0.22, 0, 0.07], ['neck', null, 0.02, 0.17],
  ['armL', 0, 0, 0.09], ['armR', 0, 0, 0.09], ['foreL', 0, 0, 0.07], ['foreR', 0, 0, 0.07], ['thorax', 0, 0, 0.19], ['pose', 0, 0, 0.17]];   // рукавиці, плечі, лікті, груди й таз — лежачи теж не в газоні   // плечі, лікті, груди й таз — лежачи теж не в газоні

export function diveKin(P, kind) {
  const k = kind === true ? 0 : kind === false ? 1 : kind | 0, sm = dkSm;
  const V = 0.7 / 0.42;                                   // швидкість переміщення в польоті (частка за одиницю P)
  let travel;
  if (P < 0.12) travel = 0;
  else if (P < 0.3) travel = 0.15 * ((P - 0.12) / 0.18) ** 2;
  else if (P < 0.72) travel = 0.15 + V * (P - 0.3);
  else if (P < 0.9) { const u = P - 0.72; travel = 0.85 + V * u - (V / 0.36) * u * u; }
  else travel = 1;
  const maxRoll = DK_MAXR[k], r0 = DK_R0[k], rl = DK_RL[k];
  let roll = maxRoll * sm((P - r0) / rl) + (k === 2 ? 0.08 : 0.12) * sm((P - 0.72) / 0.18);
  if (P > 1) roll *= 1 - sm((P - 1) / 0.5);
  const u = (P - 0.3) / 0.42, peak = DK_PEAK[k];
  const lift = P > 0.3 && P < 0.72 ? peak * 4 * u * (1 - u) + 0.12 * peak * (1 - u) : P > 0.12 && P <= 0.3 ? 0.12 * peak * sm((P - 0.12) / 0.18) : 0;
  DK.travel = travel; DK.roll = roll; DK.lift = lift; DK.maxRoll = maxRoll; DK.landAt = k === 2 ? 0.55 : 0.72;
  return DK;
}
let _mat = null;
/** Один матеріал на всіх гравців: вершинний колір × атлас (обличчя, номери, спонсор). */
function atlasMat() {
  if (!_mat) _mat = new THREE.MeshLambertMaterial({ map: playerAtlas(), vertexColors: true, flatShading: true });
  return _mat;
}

let _print = null;
/**
 * Друк на формі (номер, спонсор, смуги, комір) — окремий шар із полігональним зсувом глибини: завжди лежить поверх тканини
 * і не мерехтить на відстані, навіть коли товщина друку — частки міліметра.
 */
function printMat() {
  if (!_print) _print = new THREE.MeshLambertMaterial({ map: playerAtlas(), vertexColors: true, flatShading: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  return _print;
}

const cache = new Map();
const cached = (key, make) => { let g = cache.get(key); if (!g) { g = make(); cache.set(key, g); } return g; };
const FACE_UV = [[0, 1], [1, 1], [0, 0], [1, 0]];
const mixc = (a, c, t) => '#' + new THREE.Color(a).lerp(new THREE.Color(c), t).getHexString();
const dark = (c, t = 0.22) => mixc(c, '#000000', t);
const vox = () => new VoxelBuilder(0.2, true);

// ---------------------------------------------------------------- ноги
// Стиль: рівні блоки без зайвого рельєфу. Кожна частина — один-два прямокутники; смуги й манжети — кольорові
// сегменти того самого перерізу, тож поверхня лишається гладкою.
/** Стегно: штанина шортів і стегно. Початок = тазостегновий суглоб. */
const thighGeo = (kit, gk, skin) => cached('th' + kit.shorts + skin + gk, () => {
  const b = vox(), S = kit.shorts;
  if (gk) { b.box(0, -0.3, 0, 0.24, 0.6, 0.25, S); return b.build(); }   // воротар: довгі штани
  b.box(0, -0.135, 0, 0.25, 0.27, 0.26, S);                 // штанина
  b.box(0, -0.435, 0.005, 0.19, 0.33, 0.2, skin);           // стегно до коліна
  return b.build();
});

/** Гомілка: коліно, гетра зі смугою. Початок = коліно. */
const shinGeo = (kit, gk, skin) => cached('sh' + kit.socks + kit.shorts + (kit.under || kit.second) + skin + gk, () => {
  const b = vox(), K = kit.socks, band = kit.under || kit.second;
  if (gk) {
    b.box(0, -0.17, 0, 0.17, 0.34, 0.18, kit.shorts);
    b.box(0, -0.43, -0.005, 0.15, 0.18, 0.165, K);
    return b.build();
  }
  b.box(0, -0.03, 0, 0.16, 0.06, 0.17, skin);               // під коліном
  b.box(0, -0.0725, -0.005, 0.155, 0.025, 0.17, K);         // верх гетри
  b.box(0, -0.1, -0.005, 0.155, 0.03, 0.17, band);          // смуга
  b.box(0, -0.3175, -0.005, 0.155, 0.405, 0.17, K);         // гетра до щиколотки
  return b.build();
});

/** Бутса на шарнірі щиколотки: підошва, верх, носок, смуга збоку. Ґрунт на y = −YA. */
const footGeo = (kit, gk) => cached('ft' + (kit.boot || '') + gk, () => {
  const b = vox(), boot = gk ? '#e8e4d8' : kit.boot || '#17191c', sole = kit.boot ? '#2a2f33' : '#0b0c0e';
  b.box(0, -0.085, 0.08, 0.13, 0.03, 0.37, sole);           // підошва
  b.box(0, -0.035, 0.035, 0.125, 0.07, 0.27, boot);         // верх
  b.box(0, -0.05, 0.205, 0.115, 0.04, 0.07, boot);          // носок
  return b.build();
});

/** Таз: шорти з поясом. Початок = рівень тазостегнових суглобів. */
const hipsGeo = (kit) => cached('hp' + kit.shorts, () => {
  const b = vox(), S = kit.shorts;
  b.box(0, -0.005, 0, 0.5, 0.15, 0.3, S);                  // видима частина шортів під футболкою
  b.box(0, 0.15, 0, 0.44, 0.16, 0.24, S);                   // верх під футболкою: вужчий, щоб при повороті таза (±10°) не виходив крізь неї
  b.box(0, -0.11, 0, 0.28, 0.06, 0.28, S);                  // промежина
  return b.build();
});

// ---------------------------------------------------------------- руки
/** Плече: рукав із манжетою й рука до ліктя. Початок = плечовий суглоб. */
const upperGeo = (kit, gk, skin) => cached('up' + kit.second + kit.main + (kit.sleeve || '') + (kit.under || '') + skin + gk, () => {
  const b = vox();
  if (gk) {                                                // довгий рукав, верх плеча в другому кольорі
    b.box(0, 0.02, 0, 0.16, 0.13, 0.16, kit.second);
    b.box(0, -0.235, 0, 0.15, 0.38, 0.15, kit.main);
    return b.build();
  }
  const A = kit.under || skin, SL = kit.sleeve || kit.second, CU = kit.under ? '#c01a26' : kit.second;
  b.box(0, -0.05, 0, 0.16, 0.27, 0.16, SL);                 // рукав
  b.box(0, -0.2, 0, 0.16, 0.03, 0.16, CU);                  // манжета
  b.box(0, -0.32, 0, 0.115, 0.21, 0.12, A);                 // рука до ліктя
  return b.build();
});

/** Передпліччя; у воротаря — з манжетою рукавиці. Початок = лікоть. */
const foreGeo = (kit, gk, skin) => cached('fo' + gk + skin + (kit.under || '') + kit.main, () => {
  const b = vox();
  if (gk) {
    b.box(0, -0.15, 0, 0.105, 0.3, 0.105, kit.main);
    b.box(0, -0.32, 0, 0.11, 0.04, 0.11, '#23272b');        // манжета рукавиці
    return b.build();
  }
  b.box(0, -0.15, 0, 0.095, 0.3, 0.095, kit.under || skin); // передпліччя
  return b.build();
});

/** Кисть (або рукавиця воротаря) на зап'ястку: окремий суглоб, щоб розслаблена кисть відставала й «доганяла» рух. Початок = зап'ястя. */
const WRIST = 0.31;
/**
 * Воротарська рукавиця (side: −1 ліва, +1 права — долоня в них з різних боків, усередину). Як справжня, на ~20% більша за
 * кисть: широка чорна манжета з ремінцем, неонова тильна сторона, світло-сірий «латекс» долоні, чотири окремі пальці
 * (середній найдовший) і великий палець. Усе — пласкі бокси.
 */
const GLOVE = '#c9f23a', LATEX = '#e6e9ec', CUFF = '#16181c';
const handGeo = (gk, skin, side = 1) => cached('hd' + gk + skin + (gk ? side : ''), () => {
  const b = vox();
  if (gk) {
    const px = -side * 0.0485;                               // бік долоні: ліва — +x, права — −x
    b.box(0, -0.03, 0, 0.115, 0.07, 0.125, CUFF);            // манжета
    b.box(0, -0.036, 0, 0.12, 0.022, 0.13, GLOVE);           // ремінець на липучці
    b.box(0, -0.12, 0, 0.085, 0.11, 0.17, GLOVE);            // тильна сторона кисті
    b.box(px, -0.12, 0, 0.012, 0.105, 0.165, LATEX);          // долоня
    // пальці від вказівного (з боку великого) до мізинця: довжини як у кисті, з проміжками
    for (const [z, h] of [[0.06, 0.085], [0.02, 0.098], [-0.02, 0.092], [-0.06, 0.076]]) {
      b.box(0, -0.175 - h / 2, z, 0.075, h, 0.036, GLOVE);
      b.box(px * 0.94, -0.175 - h / 2, z, 0.012, h - 0.004, 0.034, LATEX);
    }
    b.box(0, -0.1, 0.106, 0.07, 0.1, 0.046, GLOVE);          // великий палець
    b.box(px * 0.94, -0.1, 0.106, 0.012, 0.096, 0.044, LATEX);
  }
  else b.box(0, -0.09, 0, 0.05, 0.18, 0.095, skin);
  return b.build();
});

// ---------------------------------------------------------------- голова
/** Зачіски: кілька шарів і відтінків (темний «андеркат», світлі блики), виголені боки, чубчики. Координати — у старій сітці голови 1×1×1, масштабуються під нову голову. */
function hairBlock(b, look, kit, hy, skin) {
  const hc = look.hairCol, dk = mixc(hc, '#000000', 0.38), lt = mixc(hc, '#ffffff', 0.2), st = mixc(skin, hc, 0.5), fade = mixc(hc, skin, 0.55);
  const top = (h = 0.22, y = 0.48) => b.box(0, hy + y, -0.03, 1.13, h, 1.1, hc);
  const sides = (c, y = 0.22, h = 0.5) => { for (const sx of [-1, 1]) b.box(sx * 0.545, hy + y, -0.1, 0.1, h, 0.78, c); };
  const back = (h = 0.78, y = 0.12, c = hc) => b.box(0, hy + y, -0.52, 1.13, h, 0.14, c);
  const sideburn = () => { for (const sx of [-1, 1]) b.box(sx * 0.545, hy + 0.02, 0.28, 0.1, 0.26, 0.12, dk); };
  switch (look.hair) {
    case 'bald':
      b.box(0, hy + 0.08, -0.52, 1.1, 0.42, 0.05, st); for (const sx of [-1, 1]) b.box(sx * 0.535, hy + 0.1, -0.05, 0.05, 0.4, 0.9, st);
      break;
    case 'buzz':
      b.box(0, hy + 0.55, -0.02, 1.1, 0.1, 1.08, dk); b.box(0, hy + 0.5, -0.02, 1.08, 0.06, 1.06, fade);
      sides(fade, 0.3, 0.32); back(0.5, 0.3, fade); b.box(0, hy + 0.5, 0.53, 0.9, 0.06, 0.06, dk);
      break;
    case 'slick':
      top(0.2, 0.5); b.box(0, hy + 0.66, -0.1, 0.9, 0.12, 0.62, hc); b.box(0.05, hy + 0.72, 0.18, 0.85, 0.12, 0.45, lt); b.box(0.0, hy + 0.62, 0.42, 0.9, 0.12, 0.16, lt);
      b.box(-0.3, hy + 0.7, 0.1, 0.04, 0.06, 0.95, dk);                        // проділ
     
      sides(fade, 0.26, 0.46); back(0.72, 0.1, dk);
      break;
    case 'curly': {
      const pts = [[0, 0.7, 0, 0.5], [-0.34, 0.66, 0.1, 0.42], [0.34, 0.66, 0.1, 0.42], [-0.3, 0.64, -0.3, 0.4], [0.3, 0.64, -0.3, 0.4], [0, 0.66, -0.36, 0.44], [-0.36, 0.62, 0.38, 0.36], [0.36, 0.62, 0.38, 0.36], [0, 0.62, 0.42, 0.36],
        [-0.5, 0.36, -0.1, 0.34], [0.5, 0.36, -0.1, 0.34], [-0.48, 0.18, -0.34, 0.34], [0.48, 0.18, -0.34, 0.34], [0, 0.22, -0.5, 0.4], [-0.26, 0.1, -0.52, 0.32], [0.26, 0.1, -0.52, 0.32],
        [-0.18, 0.8, 0.12, 0.26], [0.2, 0.8, -0.12, 0.26], [0, 0.78, 0.3, 0.24], [-0.5, 0.5, 0.2, 0.26], [0.5, 0.5, 0.2, 0.26]];
      pts.forEach(([x, y, z, sz], i) => b.box(x, hy + y, z, sz, sz * 0.9, sz, i % 3 === 0 ? dk : i % 3 === 1 ? hc : lt));
      sideburn();
      break;
    }
    case 'pony':
      top(0.22, 0.48); b.box(0, hy + 0.55, 0.0, 0.9, 0.06, 0.9, lt); sides(hc, 0.3, 0.4); back(0.8, 0.1);
      b.box(0, hy + 0.18, -0.64, 0.36, 0.12, 0.2, kit.second);                       // резинка
      b.box(0, hy - 0.05, -0.78, 0.3, 0.46, 0.28, hc); b.box(0, hy - 0.42, -0.8, 0.24, 0.34, 0.22, dk); b.box(0, hy - 0.66, -0.8, 0.16, 0.16, 0.16, dk);
      b.box(-0.2, hy + 0.4, 0.54, 0.5, 0.14, 0.08, hc); b.box(0.28, hy + 0.42, 0.54, 0.4, 0.12, 0.08, dk);
      break;
    case 'long':
      top(0.24, 0.48); b.box(0, hy + 0.58, 0, 0.9, 0.06, 0.9, lt);
      b.box(0, hy - 0.05, -0.54, 1.18, 1.1, 0.18, hc); b.box(0, hy - 0.52, -0.56, 1.0, 0.36, 0.14, dk);
      for (const sx of [-1, 1]) { b.box(sx * 0.57, hy - 0.05, -0.1, 0.12, 0.95, 0.7, hc); b.box(sx * 0.58, hy - 0.5, -0.12, 0.1, 0.3, 0.5, dk); }
      b.box(-0.3, hy + 0.4, 0.54, 0.46, 0.2, 0.08, hc); b.box(0.3, hy + 0.4, 0.54, 0.46, 0.2, 0.08, hc); b.box(0, hy + 0.46, 0.55, 0.08, 0.1, 0.06, dk);   // проділ по центру
      break;
    case 'mohawk': {
      const hts = [0.32, 0.42, 0.52, 0.42, 0.32];
      hts.forEach((h, i) => { b.box(0, hy + 0.52 + h * 0.5, -0.42 + i * 0.21, 0.24, h, 0.2, i % 2 ? hc : lt); });
      b.box(0, hy + 0.52, 0, 0.9, 0.06, 1.0, st); sides(st, 0.28, 0.36); back(0.4, 0.28, st);
      break;
    }
    case 'band':
      top(0.22, 0.48); sides(hc, 0.2, 0.5); back(0.7, 0.14); sideburn();
      b.box(0, hy + 0.26, 0, 1.15, 0.14, 1.14, kit.second); b.box(0, hy + 0.26, -0.6, 0.3, 0.12, 0.14, kit.second);
      b.box(-0.2, hy + 0.42, 0.54, 0.5, 0.12, 0.08, hc);
      break;
    default:                                           // 'crop': класична коротка з виголеними боками й нерівним чубчиком
      top(0.22, 0.48); b.box(0.1, hy + 0.6, 0.0, 0.7, 0.05, 0.7, lt);
      sides(hc, 0.3, 0.38); sides(fade, 0.0, 0.2); back(0.7, 0.18); b.box(0, hy - 0.16, -0.52, 1.08, 0.2, 0.12, fade); sideburn();
      b.box(-0.24, hy + 0.4, 0.54, 0.62, 0.16, 0.08, hc); b.box(0.3, hy + 0.44, 0.54, 0.5, 0.12, 0.08, dk); b.box(0.04, hy + 0.34, 0.55, 0.2, 0.07, 0.06, dk);
  }
}

/** Розміри голови: ширина × висота × глибина; центр над основою шиї. */
const HW = 0.34, HH = 0.4, HD = 0.37, HY = 0.29;

/** Голова на шиї: обличчя з атласу на передній грані, ніс, вуха, зачіска. Початок = основа шиї. */
function headGeo(look) {
  const { kit, skin } = look;
  const b = vox();
  b.box(0, 0.04, -0.005, 0.14, 0.12, 0.13, skin);                           // шия
  const faceStart = b.n;
  b.box(0, HY, 0, HW, HH, HD, skin, 0, 0, 0, [null, null, null, null, faceCell('neutral', look.beard || 0), null]);
  b.box(0, 0.27, HD / 2 + 0.012, 0.044, 0.065, 0.024, skin);                // ніс
  for (const sx of [-1, 1]) b.box(sx * (HW / 2 + 0.01), 0.285, -0.01, 0.02, 0.08, 0.06, skin);   // вуха
  // зачіска з координат «голова 1×1×1» у розміри нової голови
  const sx = HW / 1.05, sy = HH / 1.05, sz = HD / 1.05;
  let layer = 0;
  const hb = { box: (x, y, z, w, h, d, c) => { const e = 0.0006 * ++layer; return b.box(x * sx, HY + y * sy, z * sz, w * sx + e, h * sy + e, d * sz + e, c); } };
  hairBlock(hb, look, kit, 0, skin);
  const g = b.build();
  g.userData.faceStart = faceStart + 16;
  return g;
}

/**
 * Тулуб у двох частинах для вигнутої спини: поперек і грудна клітка з плечима. Рівні блоки без рельєфу;
 * комір, смуги й друк — плоский шар на поверхні. Початок = таз.
 */
function bodyGeo(look) {
  const { kit } = look, lightInk = kit.ink === 'light', M = kit.main, C = kit.collar || kit.second, S2 = kit.second;
  const L = vox(), b = vox(), P = vox();
  if (look.gk) {                                                 // воротар: смуга на животі й плечі другого кольору — сегменти блоків
    L.box(0, 0.19, 0, 0.52, 0.24, 0.33, M); L.box(0, 0.33, 0, 0.52, 0.04, 0.33, S2); L.box(0, 0.43, 0, 0.52, 0.16, 0.33, M);
    b.box(0, 0.58, 0.005, 0.54, 0.16, 0.34, M); b.box(0, 0.73, 0.005, 0.54, 0.14, 0.34, S2);
  } else {
    L.box(0, 0.29, 0, 0.52, 0.44, 0.33, M);                      // поперек (заходить під груди, щоб на згині не було щілини)
    b.box(0, 0.65, 0.005, 0.54, 0.3, 0.34, M);                    // груди й плечі
  }
  b.box(0, 0.825, -0.01, 0.3, 0.05, 0.23, C);                    // комір навколо шиї
  // друк: тонкий шар трохи над поверхнею, малюється матеріалом із зсувом глибини
  P.ao = 0;
  const F = 0.1765, BK = -0.1665;                                // передня й задня площини грудей + 1.5 мм
  if (kit.collar) P.box(0, 0.765, F, 0.12, 0.05, 0.002, C);       // V-виріз
  else P.box(0, 0.785, F, 0.18, 0.02, 0.002, C);
  if (!look.gk) for (const sx of [-1, 1]) P.box(sx * 0.22, 0.8015, 0.005, 0.05, 0.002, 0.343, S2);   // смуги на плечах
  if (kit.stripe) for (const sx of [-0.17, 0.17]) { P.box(sx, 0.65, F, 0.05, 0.3, 0.002, kit.stripe); P.box(sx, 0.65, BK, 0.05, 0.3, 0.002, kit.stripe); }
  const num = numberCell(look.num, lightInk);
  if (kit.sponsor) {
    P.box(-0.03, 0.6, F, 0.2, 0.15, 0.002, '#ffffff', 0, 0, 0, [null, null, null, null, sponsorCell(), null]);
    P.box(0.19, 0.66, F, 0.07, 0.07, 0.002, '#ffffff', 0, 0, 0, [null, null, null, null, crestCell(), null]);
  } else {
    P.box(0, 0.62, F, 0.15, 0.15, 0.002, '#ffffff', 0, 0, 0, [null, null, null, null, num, null]);
  }
  P.box(0, 0.64, BK, 0.24, 0.24, 0.002, '#ffffff', 0, 0, 0, [null, null, null, null, null, num]);   // номер на спині
  return { lower: L.build(), upper: b.build(), prints: P.build() };
}

/**
 * Скелет: root → body (курс) → pose (жорсткий нахил усього тіла навколо стегон) → lean (згин тулуба) + ноги.
 * Нога: стегно → коліно → гомілка; рука: плече → лікоть → передпліччя. Висота стегон рахується з нахилу тіла,
 * тож лежачи гравець на траві, а не в ній.
 */
export class Player {
  /** look: { kit, num, skin, hair, hairCol, gk, scale } */
  constructor(look) {
    const m = atlasMat();
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.pose = new THREE.Group(); this.pose.rotation.order = 'ZXY'; this.pose.position.y = HIP;
    this.pelvis = new THREE.Group(); this.pelvis.rotation.order = 'ZYX';
    this.lean = new THREE.Group(); this.lean.position.y = WAIST;          // поперек гнеться навколо талії
    this.thorax = new THREE.Group(); this.thorax.position.y = CHEST - WAIST; // грудний відділ — другий згин, спина вигинається дугою
    this.neck = new THREE.Group(); this.neck.position.y = NECK - CHEST; this.neck.rotation.order = 'ZYX';
    this.legL = new THREE.Group(); this.legR = new THREE.Group(); this.legL.rotation.order = this.legR.rotation.order = 'ZXY';
    this.shinL = new THREE.Group(); this.shinR = new THREE.Group();
    this.footL = new THREE.Group(); this.footR = new THREE.Group();
    this.armL = new THREE.Group(); this.armR = new THREE.Group();
    this.foreL = new THREE.Group(); this.foreR = new THREE.Group();
    this.handL = new THREE.Group(); this.handR = new THREE.Group(); this.handL.position.y = this.handR.position.y = -WRIST;
    this.root.add(this.body);
    this.body.add(this.pose);
    this.pose.add(this.pelvis, this.lean);
    this.pelvis.add(this.legL, this.legR);
    this.lean.add(this.thorax);
    this.thorax.add(this.armL, this.armR, this.neck);
    this.torso = new THREE.Mesh(undefined, m); this.torso.position.y = -WAIST;
    this.chestM = new THREE.Mesh(undefined, m); this.chestM.position.y = -CHEST;
    this.printM = new THREE.Mesh(undefined, printMat()); this.printM.position.y = -CHEST;
    this.head = new THREE.Mesh(undefined, m);
    this.hips = new THREE.Mesh(undefined, m);
    this.thighLm = new THREE.Mesh(undefined, m); this.thighRm = new THREE.Mesh(undefined, m);
    this.shinLm = new THREE.Mesh(undefined, m); this.shinRm = new THREE.Mesh(undefined, m);
    this.footLm = new THREE.Mesh(undefined, m); this.footRm = new THREE.Mesh(undefined, m);
    this.upperLm = new THREE.Mesh(undefined, m); this.upperRm = new THREE.Mesh(undefined, m);
    this.foreLm = new THREE.Mesh(undefined, m); this.foreRm = new THREE.Mesh(undefined, m);
    this.handLm = new THREE.Mesh(undefined, m); this.handRm = new THREE.Mesh(undefined, m);
    this.lean.add(this.torso); this.thorax.add(this.chestM, this.printM);
    this.neck.add(this.head);
    this.pelvis.add(this.hips);
    this.legL.add(this.thighLm, this.shinL); this.legR.add(this.thighRm, this.shinR);
    this.shinL.add(this.shinLm, this.footL); this.shinR.add(this.shinRm, this.footR);
    this.footL.add(this.footLm); this.footR.add(this.footRm);
    this.armL.add(this.upperLm, this.foreL); this.armR.add(this.upperRm, this.foreR);
    this.foreL.add(this.foreLm, this.handL); this.foreR.add(this.foreRm, this.handR);
    this.handL.add(this.handLm); this.handR.add(this.handRm);
    this.legL.position.set(-HIP_X, 0, 0); this.legR.position.set(HIP_X, 0, 0);
    this.shinL.position.y = -THIGH; this.shinR.position.y = -THIGH;
    this.footL.position.y = -SHIN; this.footR.position.y = -SHIN;
    this.armL.position.set(-SHOULDER_X, SHOULDER_Y - CHEST, 0); this.armR.position.set(SHOULDER_X, SHOULDER_Y - CHEST, 0);
    this.foreL.position.y = -UPPER; this.foreR.position.y = -UPPER;

    this.x = 0; this.z = 0; this.vx = 0; this.vz = 0;
    this.yaw = 0; this.bodyYaw = 0;
    this.phase = Math.random() * 6; this.mode = 'idle'; this.modeT = 0; this.modeD = 0; this.power = 0;
    this.diveDir = 0; this.diveKind = 0; this.expr = 'neutral'; this.exprT = 0;
    this.kicking = 0; this.kickAmp = 1; this.kickPow = 0; this.t = Math.random() * 10;
    this.threat = 0; this.threatYaw = 0; this.dribble = false; this.style = 0; this.amp = 1;
    this.r = { tx: 0, tz: 0, leanX: 0, legs: 0, arms: 0, drop: 0, spread: 0 };
    // згладжені значення суглобів: рухи плавно переходять один в одний, коли гравець зупиняється чи починає біг
    this.sm = { legA: 0, legB: 0, kneeA: 0.06, kneeB: 0.06, ankA: 0, ankB: 0, armA: 0, armB: 0, elbA: 0.3, elbB: 0.3, twA: 0, twB: 0, spread: 0, leanX: 0, leanY: 0, leanZ: 0, tiltX: 0, tiltZ: 0, drop: 0, bob: 0, pelX: 0, sdA: 0, sdB: 0, abdA: 0, abdB: 0, ftA: 0, ftB: 0, lift: 0, pelY: 0, pelZ: 0, hdX: 0, hdY: 0, hdZ: 0 };
    this.pvx = 0; this.pvz = 0; this.aLong = 0; this.aLat = 0;
    // манера рук: розмах, кут ліктя, наскільки руки заходять навхрест — у кожного своя
    this.armStyle = { amp: 0.75 + 0.6 * Math.random(), elb: (Math.random() - 0.5) * 0.45, cross: 0.1 + 0.22 * Math.random(), ph: Math.random() * 20 };
    // характер гравця — один раз на все життя моделі: постава (нахил, голова набік, ширина плечей), темп жестів, улюблені
    // дрібні рухи, свої способи радіти й сумувати, як плескає й як високо б'є «п'ять». Тож двоє гравців не рухаються однаково
    const R = Math.random, some = (arr, n) => arr.slice().sort(() => R() - 0.5).slice(0, n);
    this.persona = {
      cad: 0.9 + 0.2 * R(), tempo: 0.82 + 0.4 * R(), lean: -0.04 + 0.13 * R(), tilt: (R() - 0.5) * 0.14, wide: (R() - 0.5) * 0.14, slapHi: 0.75 + 0.5 * R(),
      fid: some([7, 8, 10, 11, 12, 14, 2, 1, 0], 4), cheer: some([0, 1, 13, 14, 15, 16, 17, 18, 19, 20, 6, 12, 8, 4], 3), sad: some([0, 4, 5, 6, 8, 1, 2], 2),
      clap: some([30, 30, 31, 32, 33, 34], 2)[0], clapV: some([30, 30, 31, 32, 33, 34], 2), waveV: some([40, 40, 41, 42], 2), walk: some([16, 5, 6, 15, 17, 11, 12, 7, 14], 3),
      walkP: some([0, 0, 1, 1, 3], 2), stand: some([2, 4, 5, 6, 7, 2], 3),   // як тримає руки на ходу й стоячи
      // вибуховість (наскільки різко б'є, як сильно тіло «віддає» в ударі й падінні), як сідає й лягає на газон, якою рукою
      // жестикулює в розмові, як часто й глибоко дихає після гри
      power: 0.8 + 0.45 * R(), sitV: R() < 0.6 ? 0 : 1, lieV: R() < 0.5 ? 2 : 3, talkH: R() < 0.7 ? 1 : 0, breath: 1.3 + 0.7 * R(), heave: 0.6 + 0.8 * R(),
    };
    this.wrist = [{ a: 0.12, v: 0 }, { a: 0.12, v: 0 }];
    this.gaitSys = new Gait({ THIGH, SHIN, YA, HIP_X }); this.gaitFree = false;
    this.setLook(look);
  }

  setLook(look) {
    this.look = look;
    const { kit, gk, skin } = look;
    if (this.torso.geometry && this.torso.geometry.dispose) { this.torso.geometry.dispose(); this.chestM.geometry.dispose(); this.printM.geometry.dispose(); }
    if (this.head.geometry && this.head.geometry.dispose) this.head.geometry.dispose();
    const bg = bodyGeo(look); this.torso.geometry = bg.lower; this.chestM.geometry = bg.upper; this.printM.geometry = bg.prints;
    this.head.geometry = headGeo(look);
    this.hips.geometry = hipsGeo(kit);
    this.thighLm.geometry = this.thighRm.geometry = thighGeo(kit, !!gk, skin);
    this.shinLm.geometry = this.shinRm.geometry = shinGeo(kit, !!gk, skin);
    this.footLm.geometry = this.footRm.geometry = footGeo(kit, !!gk);
    const as = gk ? 1.1 : 1; this.armL.scale.setScalar(as); this.armR.scale.setScalar(as);   // воротар має довші руки для дотяжки
    this.upperLm.geometry = this.upperRm.geometry = upperGeo(kit, !!gk, skin);
    this.foreLm.geometry = this.foreRm.geometry = foreGeo(kit, !!gk, skin);
    this.handLm.geometry = handGeo(!!gk, skin, -1); this.handRm.geometry = handGeo(!!gk, skin, 1);
    this.root.scale.setScalar(look.scale || 0.82);
    this.expr = 'neutral'; this.exprT = 0;
  }

  setExpr(e, hold = 0) {
    this.exprT = hold;
    if (this.expr === e) return;
    this.expr = e;
    const uv = this.head.geometry.attributes.uv, s = this.head.geometry.userData.faceStart, r = faceCell(e, (this.look && this.look.beard) || 0);
    for (let k = 0; k < 4; k++) uv.setXY(s + k, r[0] + FACE_UV[k][0] * (r[2] - r[0]), r[1] + FACE_UV[k][1] * (r[3] - r[1]));
    uv.needsUpdate = true;
  }

  // ---------------------------------------------------------------- події (кожна запускається один раз)
  setMode(m, t = 0) { this.bakeSlide(); const k = 0.92 + 0.16 * Math.random(); t *= k; this.mode = m; this.modeT = t; this.modeD = t; this.vary = 0.9 + 0.2 * Math.random(); }
  kick(power = 1) {
    this.kicking = 0.0001; this.kickPow = power; this.kickAmp = (0.6 + 0.6 * power) * (0.93 + 0.14 * Math.random()); this.setExpr('angry', 0.6);
    this.kickSide = this.backLeg(); this.kickHit = false;
    this.kickAmp *= 0.92 + 0.4 * (this.persona.power - 0.8);          // хтось б'є з величезним замахом, хтось — коротко
    // на бігу проводка й крок через м'яч коротші — тіло не «пливе» з застиглими ногами, хода підхоплює раніше
    this.kickF = lerp(1, 0.6, smooth(clamp((Math.hypot(this.vx, this.vz) - 2) / 4, 0, 1)));
  }
  /**
   * Якою ногою бити (0 — ліва, 1 — права): тією, що зараз позаду. На бігу це опорна нога наприкінці відштовхування —
   * вона вже відведена назад, тож замах продовжує крок, а друга нога якраз стає опорною біля м'яча. Без ходи — частіше права.
   */
  backLeg() {
    const gs = this.gaitSys;
    if (this.gaitFree && gs.ready) {
      const fx = Math.sin(this.bodyYaw), fz = Math.cos(this.bodyYaw), [a, b] = gs.feet;
      const pa = (a.x - this.x) * fx + (a.z - this.z) * fz, pb = (b.x - this.x) * fx + (b.z - this.z) * fz;
      if (Math.abs(pa - pb) > 0.06) return pa < pb ? 0 : 1;
    }
    return Math.random() < 0.8 ? 1 : 0;
  }
  /** Радість; style — конкретна (або випадкова з набору). Лежить після стрибка — спершу підведеться. */
  cheer(t = 2.4, style) {
    if (this.mode === 'pdive' && this.dvPlan) { this.pendingCheer = t; this.pendingCheerStyle = style; this.setExpr('happy', t + 2); return; }
    this.setMode('cheer', t); this.setExpr('happy', t);
    this.emoRate = (0.85 + 0.35 * Math.random()) * this.persona.tempo; this.emoPh = Math.random() * 10;
    const pool = [0, 1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 6, 7, 10, 12, 13, 14, 15, 16, 17, 13, 16, 17, 18, 19, 20, 21, 18, 20];
    const fav = this.persona.cheer;                                       // найчастіше — свої улюблені способи радіти
    this.style = style ?? (Math.random() < 0.65 ? fav[(Math.random() * fav.length) | 0] : Math.random() < 0.08 ? 5 : pool[(Math.random() * pool.length) | 0]); this.amp = 0.6 + Math.random() * 0.5;
  }
  /** Реакції за подією: забив / не забив (промах, сейв суперника) / сейв воротаря — кожна з власним набором жестів. */
  react(kind, t = 2.2) {
    const pick = (a) => a[(Math.random() * a.length) | 0];
    if (kind === 'score') this.cheer(t + 0.6, pick([13, 16, 17, 14, 0, 1, 8, 12, 15, 18, 19, 20]));
    else if (kind === 'miss') this.sad(t, pick([0, 6, 8, 4, 7, 5]));
    else if (kind === 'save') this.cheer(t, pick([13, 17, 14, 15]));
    else if (kind === 'concede') this.sad(t, pick([0, 4, 5, 8, 6]));
  }
  sad(t = 2.4, style) {
    // лежить після стрибка (пропустив): не схоплюється в стійку, а повільно, важко підводиться — і вже тоді засмучений
    if (this.mode === 'pdive' && this.dvPlan) { this.pendingSad = t; this.pendingSadStyle = style; this.slowRise = true; this.setExpr('shock', t + 2); return; }
    // біг чи якась дія: спершу зупиняється / довершує (кожен трохи по-своєму, ~0.3–0.9 с), а тоді вже сумує
    const sp = Math.hypot(this.vx, this.vz);
    if (!this.sadNow && (sp > 1.2 || (this.mode !== 'idle' && this.mode !== 'sad' && this.mode !== 'gkwait'))) { this.pendingSad = t; this.pendingSadStyle = style; this.sadAt = this.t + 0.3 + 0.08 * sp + Math.random() * 0.35; this.setExpr('shock', t + 1); return; }
    this.sadNow = false;
    this.setMode('sad', t); this.setExpr('shock', t); this.style = style ?? (Math.random() < 0.6 ? this.persona.sad[(Math.random() * 2) | 0] : (Math.random() * 9) | 0);
  }
  /**
   * Жест рукою на ходу (ноги — звичайна хода): воротар після стрибка показує захисникам, де стати, підганяє «вперед!»,
   * плескає «зібрались!» чи розводить руками. Повертаючись при цьому на позицію.
   */
  /** Тягнути руку (0 — ліва A, 1 — права B) до точки у світі з вагою w; треба оновлювати щокадру, інакше рука плавно відпускає. */
  reach(i, x, y, z, w = 1, hard = false, carry = false, pole = null) { const q = (this.rch ??= [{ x: 0, y: 0, z: 0, w: 0, k: 0, at: -9, hard: false }, { x: 0, y: 0, z: 0, w: 0, k: 0, at: -9, hard: false }])[i]; q.x = x; q.y = y; q.z = z; q.w = w; q.at = this.t; q.hard = hard; q.carry = carry; q.pole = pole; }
  /** Груди (і голова) до світового курсу yaw з вагою w; lean — нахил корпусу вперед(+)/назад(−), roll — убік. Щокадру. */
  engage(yaw, lean = 0, w = 1, roll = 0) { const e = (this.eng ??= { yaw: 0, lean: 0, roll: 0, w: 0, k: 0, at: -9 }); e.yaw = yaw; e.lean = lean; e.roll = roll; e.w = w; e.at = this.t; }
  /**
   * Рука до цілі — готовим розв'язувачем CCD-IK із three.js: лікоть — шарнір (згинається лише вперед, до ~145°), плече в
   * анатомічних межах (не заходить за голову й за спину), поворот плеча обмежений. Розв'язок змішується з позою анімації
   * за вагою q.k — тож рука плавно входить у жест і виходить із нього.
   */
  solveReach() {
    if (!this.rch || this.rag || (this.rch[0].k < 0.01 && this.rch[1].k < 0.01)) return;
    if (!this.ccd) {
      const mk = (fore) => { const o = new THREE.Object3D(); o.position.set(0, -WRIST - 0.1, 0.02); fore.add(o); return o; };
      this.ikT = [new THREE.Object3D(), new THREE.Object3D()];
      const V = (x, y, z) => new THREE.Vector3(x, y, z), X = V(-1, 0, 0);   // лікоть: шарнір навколо −X (згин уперед)
      // Euler XYZ: x — згин плеча (− уперед/угору), z — відведення (у правої + назовні, у лівої −), y — поворот.
      // Рука може завестися перед груди за середину тіла (оплески, схрещені руки); у тулуб її не пускає bodyGuard
      this.ccd = new CCDIKSolver({ skeleton: { bones: [this.armL, this.foreL, mk(this.foreL), this.ikT[0], this.armR, this.foreR, mk(this.foreR), this.ikT[1]] } }, [
        { target: 3, effector: 2, iteration: 12, links: [{ index: 1, limitation: X, rotationMin: V(-2.5, 0, 0), rotationMax: V(-0.05, 0, 0) }, { index: 0, rotationMin: V(-2.75, -0.95, -2.3), rotationMax: V(0.6, 0.95, 0.95) }] },
        { target: 7, effector: 6, iteration: 12, links: [{ index: 5, limitation: X, rotationMin: V(-2.5, 0, 0), rotationMax: V(-0.05, 0, 0) }, { index: 4, rotationMin: V(-2.75, -0.95, -0.95), rotationMax: V(0.6, 0.95, 2.3) }] },
      ]);
      this.ikQ = [new THREE.Quaternion(), new THREE.Quaternion()];
    }
    this.root.updateMatrixWorld(true);
    for (let i = 0; i < 2; i++) {
      const q = this.rch[i]; if (q.k < 0.01) continue;
      const arm = i ? this.armR : this.armL, fore = i ? this.foreR : this.foreL, T = this.ikT[i];
      T.position.set(q.x, q.y, q.z); T.updateMatrixWorld(true);
      this.ikQ[0].copy(arm.quaternion); this.ikQ[1].copy(fore.quaternion);
      if (q.pole) this.poleIK(i, arm, fore, q); else this.ccd.updateOne(this.ccd.iks[i]);
      const k = smooth(clamp(q.k, 0, 1));
      // поза анімації → розв'язок IK (slerp від збереженої пози до щойно знайденої; не in-place — інакше розв'язок губиться)
      arm.quaternion.copy(this.ikQ[0].slerp(arm.quaternion, k)); fore.quaternion.copy(this.ikQ[1].slerp(fore.quaternion, k));
      arm.updateMatrixWorld(true);
    }
  }
  /**
   * Дволанкова IK із «полюсом» — для поз і оплесків, де важливо, КУДИ дивиться лікоть (вниз-назовні від тіла, а не
   * притиснутий до боку). У системі грудей: лікоть на перетині сфер плеча й кисті, зміщений у бік полюса; плече
   * орієнтується так, що −Y дивиться на лікоть, а площина згину ліктя (+Z) — на кисть.
   * pole — напрям у системі грудей для ПРАВОЇ руки; для лівої дзеркалиться по X.
   */
  poleIK(i, arm, fore, q) {
    const sc = arm.scale.x || 1, u = UPPER * sc, f = (WRIST + 0.1) * sc, S = arm.position;
    _pT.set(q.x, q.y, q.z); this.thorax.worldToLocal(_pT);
    _pD.subVectors(_pT, S); const d = clamp(_pD.length(), Math.abs(u - f) + 0.02, (u + f) * 0.999); _pD.normalize();
    const a = (u * u - f * f + d * d) / (2 * d), h = Math.sqrt(Math.max(0, u * u - a * a));
    _pP.set(q.pole[0] * (i ? 1 : -1), q.pole[1], q.pole[2]); _pP.addScaledVector(_pD, -_pP.dot(_pD));
    if (_pP.lengthSq() < 1e-6) _pP.set(0, -1, 0); _pP.normalize();
    _pE.copy(S).addScaledVector(_pD, a).addScaledVector(_pP, h);                               // лікоть
    _pU.subVectors(_pE, S).normalize();                                                        // плече → лікоть
    _pF.copy(S).addScaledVector(_pD, d).sub(_pE).normalize();                                  // лікоть → кисть
    _ay.copy(_pU).negate();
    _az.copy(_pF).addScaledVector(_pU, -_pF.dot(_pU));
    if (_az.lengthSq() < 1e-6) _az.copy(_pP).negate(); _az.normalize();
    _ax.crossVectors(_ay, _az).normalize(); _az.crossVectors(_ax, _ay);
    _pM.makeBasis(_ax, _ay, _az); arm.quaternion.setFromRotationMatrix(_pM);
    fore.quaternion.setFromEuler(_pR.set(-Math.acos(clamp(_pF.dot(_pU), -1, 1)), 0, 0));
    arm.updateMatrixWorld(true);
  }
  /**
   * Руки не проходять крізь тіло: точки плеча, ліктя, передпліччя й кисті (з їхньою товщиною) перевіряються проти
   * справжніх коробок грудей, тулуба й таза моделі. Якщо щось усередині — плече провертається так, щоб найглибша точка
   * вийшла на поверхню (поворот у системі грудної клітки), до 4 разів на кадр. Діє після будь-якої пози та IK.
   */
  bodyGuard() {
    const B = (this._bb ??= [this.chestM, this.torso, this.hips].map((m) => { m.geometry.computeBoundingBox(); return { m, b: m.geometry.boundingBox.clone(), inv: new THREE.Matrix4() }; }));
    this.root.updateMatrixWorld(true);
    for (const o of B) o.inv.copy(o.m.matrixWorld).invert();
    const sc = this.root.scale.x || 0.82;
    for (let i = 0; i < 2; i++) {
      const arm = i ? this.armR : this.armL, fore = i ? this.foreR : this.foreL, hand = i ? this.handR : this.handL;
      const pts = [[arm, -0.3, 0.075], [arm, -0.4, 0.075], [fore, -0.06, 0.05], [fore, -0.17, 0.047], [fore, -0.29, 0.047], [hand, -0.09, 0.045], [hand, -0.17, 0.04]];
      for (let it = 0; it < 4; it++) {
        let best = 0.004, found = false;
        for (const [node, py, r] of pts) {
          _gw.set(0, py, 0); node.localToWorld(_gw);
          for (const o of B) {
            const b = o.b; _gl.copy(_gw).applyMatrix4(o.inv);
            const ox = Math.max(b.min.x - _gl.x, 0, _gl.x - b.max.x), oy = Math.max(b.min.y - _gl.y, 0, _gl.y - b.max.y), oz = Math.max(b.min.z - _gl.z, 0, _gl.z - b.max.z);
            let pen, nx = 0, ny = 0, nz = 0;
            if (ox + oy + oz > 0) {                                         // зовні: чи торкається сферою
              const d = Math.hypot(ox, oy, oz); pen = r - d; if (pen <= best) continue;
              nx = (_gl.x < b.min.x ? -ox : _gl.x > b.max.x ? ox : 0) / d; ny = (_gl.y < b.min.y ? -oy : _gl.y > b.max.y ? oy : 0) / d; nz = (_gl.z < b.min.z ? -oz : _gl.z > b.max.z ? oz : 0) / d;
            } else {                                                        // усередині: до найближчої грані
              const f = [_gl.x - b.min.x, b.max.x - _gl.x, _gl.y - b.min.y, b.max.y - _gl.y, _gl.z - b.min.z, b.max.z - _gl.z];
              let j = 0; for (let q = 1; q < 6; q++) if (f[q] < f[j]) j = q;
              if (j === 2 || j === 3) continue;                             // угору-вниз руку не виштовхуємо (плече, стегна)
              pen = r + f[j]; if (pen <= best) continue;
              if (j === 0) nx = -1; else if (j === 1) nx = 1; else if (j === 4) nz = -1; else nz = 1;
            }
            best = pen; found = true;
            _gp.copy(_gw); _gn.set(nx, ny, nz).transformDirection(o.m.matrixWorld);
          }
        }
        if (!found) break;
        arm.getWorldPosition(_gs);
        _gv.subVectors(_gp, _gs); const L = _gv.length(); if (L < 1e-4) break;
        _ga.crossVectors(_gv, _gn); if (_ga.lengthSq() < 1e-8) break;
        _ga.normalize().applyQuaternion(this.thorax.getWorldQuaternion(_gq).invert());
        _gq.setFromAxisAngle(_ga, Math.atan2(best * sc * 1.05, L));
        arm.quaternion.premultiply(_gq); arm.updateMatrixWorld(true);
      }
    }
  }
  /**
   * Поштовх від удару долонею: рука відскакує назад, плечі й голова здригаються (вторинний рух тіла), обличчя — радість.
   * mag ~1 — звичайна «п'ять».
   */
  /** Поштовх у вторинний рух (маятники тулуба, голови, рук і стиск тіла): удар, контакт, падіння на газон. */
  hit(tr = 0, hd = 0, side = 0, aA = 0, aB = 0, sq = 0) {
    const s = this.sec; if (!s) return;
    s.tr.v += tr; s.hd.v += hd; s.trZ.v += side; s.aA.v += aA; s.aB.v += aB; s.sq.v += sq;
  }
  jolt(mag = 1, arm = 1) {
    const s = this.sec; if (!s) return;
    s.tr.v -= 1.6 * mag; s.hd.v -= 3.2 * mag; s.trZ.v += (arm ? -1 : 1) * 1.2 * mag;
    (arm ? s.aB : s.aA).v -= 7 * mag;
    this.setExpr('happy', 1.2);
  }
  gesture(t = 1.4, style) {
    // старі «оплески» (6 — на рівні грудей, 16 — над головою, 2 — «зібрались!») — тепер справжні, з дотиком долонь: кожен
    // гравець плеще по-своєму (свої 2 улюблені варіанти)
    if (style === 6) style = this.persona.clapV[(Math.random() * 2) | 0]; else if (style === 16) style = 31; else if (style === 2) style = 35;
    else if (style === 5) style = this.persona.waveV[(Math.random() * 2) | 0];   // махання — справжнє, однією рукою
    this.setMode('gesture', t); this.style = style ?? ((Math.random() * 4) | 0); this.emoPh = Math.random() * 6;
  }
  /** Дотик при веденні: стопа (side 0 — ліва, 1 — права) коротко підбиває м'яч — носок/щиколотка, без зміни кроку. */
  tapBall(side) { this.tapT = 0.2; this.tapSide = side; }
  control() { this.style = Math.random() < 0.5 ? 0 : 1; this.recvSide = Math.random() < 0.5 ? 0 : 1; this.setMode('control', 0.45); }
  /**
   * Прийом м'яча — за висотою, як у людини: низом — стопою (повільний — підошвою зупиняє, швидкий — внутрішньою стороною,
   * «відводячи» стопу назад, гасить); на рівні стегна — стегном (піднімає й опускає, амортизуючи); вище — грудьми (прогин
   * назад, м'яч падає до ніг). Приймає зручнішою ногою; руки розведені для рівноваги.
   */
  receive(y = 0, speed = 0) {
    this.recvSide = Math.random() < 0.5 ? 0 : 1;
    if (y > 0.95) return this.chest();
    if (y > 0.4) { this.setMode('thigh', 0.6); return; }
    this.style = speed > 13 ? 1 : 0; this.setMode('control', speed > 13 ? 0.5 : 0.42);
  }
  chest() { this.setMode('chest', 0.55); this.setExpr('shock', 0.4); }
  header() { this.setMode('header', 0.6); this.setExpr('angry', 0.5); }
  block() { this.setMode('block', 0.5); this.setExpr('shock', 0.4); }
  hit() { if (this.mode !== 'idle') return; this.setMode('hit', 0.4); this.setExpr('shock', 0.5); }
  /** Відбір випадом: contact — за скільки секунд нога дістане м'яч; далі ~0.4 с відновлення стійки. */
  tackle(contact = 0.25) {
    this.tkHit = false;
    this.tkC = contact / (contact + 0.4); this.tkSide = this.backLeg() === 0 ? 1 : 0;   // tkSide 1 — випад лівою
    this.setMode('tackle', contact + 0.4); this.modeT = this.modeD = contact + 0.4;           // без випадкового розкиду: контакт ноги — тоді ж, коли й у грі
    this.setExpr('angry', 0.5);
  }
  /** Збили (підкат, підсічка): падіння за фізикою ragdoll у напрямку руху, з легким випадковим відхиленням. */
  stumble() {
    const a = this.bodyYaw + (Math.random() - 0.5) * 0.9;
    this.knock(Math.sin(a), Math.cos(a), 2.2 + Math.random() * 1.5, true);
  }
  /** Гравець зайнятий своїм тілом — падає, лежить, підводиться чи ловить рівновагу: гра не веде його ногами. */
  get downed() { return !!this.rag && !this.rag.dive || this.mode === 'stumble' || this.mode === 'stagger' || this.mode === 'pdive'; }
  /**
   * Втримав рівновагу: тіло відкинуло в бік поштовху, руки розкидаються й «гребуть», ноги дрібно переступають услід за
   * тілом (стопи самі перекрокують, коли тіло від них відходить), за ~0.6–1 с гравець знову грає.
   */
  stagger(dx, dz, power) {
    const l = Math.hypot(dx, dz) || 1, v = 0.55 * power;
    this.stag = { vx: dx / l * v, vz: dz / l * v, ph: Math.random() * 6, t: 0 };
    this.setMode('stagger', 0.55 + 0.09 * power); this.setExpr('shock', 0.9);
  }
  /**
   * Поштовх із ragdoll-падінням: (dx, dz) — напрям у світі, power — сила поштовху (м/с), trip — підсічено ноги.
   * Тіло падає за фізикою, лягає на траву, а потім гравець підводиться — з живота або зі спини, як упав.
   */
  knock(dx, dz, power = 3, trip = true) {
    const l = Math.hypot(dx, dz) || 1;
    // чи встоїть: легкий поштовх майже завжди переступає, сильний — рідко; підсічку інколи теж «витягує» крок
    const keep = trip ? 0.25 : Math.max(0, Math.min(0.85, 1.25 - power * 0.25));
    if (!this.rag && Math.random() < keep) { this.kicking = 0; this.stagger(dx, dz, power); return; }
    this.setMode('stumble', 999); this.setExpr('shock', 1.2);
    this.kicking = 0;
    this.rag = new Ragdoll(this, { x: this.vx, z: this.vz }, { x: dx / l * power, z: dz / l * power, up: 0.8 + 0.4 * Math.random() }, trip, { active: true });
    this.ragDone = -1; this.riseT0 = -1.05;
  }
  slideTackle() { this.setMode('slide', 1.6); this.setExpr('angry', 0.7); }
  kneel() { this.setMode('kneel', 1.5); this.setExpr('happy', 1.5); this.kSlide = 0; }
  /** Після матчу на газоні: 0 — сів, руки на колінах; 1 — сів, відкинувшись на руки; 2 — ліг, руки під голову; 3 — ліг, руки розкинуті. */
  rest(style = 0) { this.setMode('rest', 999); this.style = style; this.restHit = 0; this.vx = this.vz = 0; this.setExpr(style >= 2 ? 'shock' : 'neutral', 999); }
  /** Ковзання на колінах зсуває тіло візуально; коли воно закінчується (чи перервалось), зсув стає справжньою позицією — без ривка назад. */
  bakeSlide() { if (this.mode === 'kneel' && this.kSlide) { this.x += Math.sin(this.yaw) * this.kSlide; this.z += Math.cos(this.yaw) * this.kSlide; this.lpx = this.x; this.lpz = this.z; } this.kSlide = 0; }
  /** Обійми: руки обхоплюють партнера (yaw — до нього), корпус уперед, разом підстрибують. */
  hug(t = 1.8) { this.setMode('hug', t); this.setExpr('happy', t + 0.5); this.emoPh = Math.random() * 3; this.emoRate = 0.9 + 0.2 * Math.random(); }
  /** aim — куди стрибок принесе рукавиці (світ {x,y,z}); руки тягнуться лише до м'яча, що пролітає біля цієї точки. */
  gkDive(dir, kind = 0, aim = null, tArr = null, vmax = 5.5) {
    if (aim && tArr != null) { this.startPDive(dir, kind, aim, tArr, vmax); this.setExpr('shock', 1.0); return; }   // з метою й часом — за фізикою
    this.diveDir = dir; this.diveKind = kind; this.setAim(aim); this.diveReset(); this.setMode('gkdive', 1.4); this.setExpr('shock', 1.0);
  }
  /** Новий стрибок: ще не підхоплений фізикою, гра знову веде корінь тіла. */
  diveReset() { this.dvPlan = null; this.diveRise = undefined; this.diveRag = false; this.diveFree = false; this.dvPrev = null; this.landImpact = 0; if (this.rag && this.rag.dive) this.rag = null; }
  setAim(aim) { if (aim) (this.diveAim ??= new THREE.Vector3()).set(aim.x, aim.y, aim.z); else this.diveAim = null; }
  /** Керований стрибок воротаря (пенальті): прогрес diveP задає зовнішній код, поза будується безперервно. */
  /**
   * Стрибок воротаря. Без tArr — фаза diveP задається ззовні (лабораторія, старий шлях). З метою aim (куди мають дістати
   * рукавиці, світ) і часом tArr (с, коли м'яч долетить) — стрибок за фізикою: воротар сам рахує, з якою швидкістю
   * відштовхнутись, і летить балістично (див. planDive).
   */
  startPDive(dir, kind, aim = null, tArr = null, vmax = 5.5) {
    this.slowRise = false; this.pendingSad = 0;
    this.setAim(aim); this.diveReset(); this.mode = 'pdive'; this.modeT = 999; this.modeD = 999; this.diveDir = dir; this.diveKind = kind === true ? 0 : kind === false ? 1 : kind | 0; this.diveP = 0; this.setExpr('shock', 2);
    if (aim && tArr != null) { this.dvPlan = this.planDive(aim, tArr, vmax); this.diveFree = true; }
  }

  /**
   * План стрибка як у фізиці (g = 9.81 м/с², зріст ~1.85 м, маса ~85 кг). Контррух (~35%) і відштовхування за t0
   * (~третина часу, що є, 0.15–0.24 с — воротар уже стоїть у напівприсіді): ноги розганяють центр мас по прямій до швидкості відриву
   * v0; далі — балістика. v0 підібрано так, щоб тіло в мить, коли підлітає м'яч, було там, звідки витягнуті руки (таз →
   * кінчики пальців ≈1.45 м, під кутом нахилу тіла в цій фазі) дістають мету. Сила ніг — як у професійного воротаря:
   * убік 3–6.5 м/с, угору 3–4.4 м/с у верхній кут, 2.2–3.8 у середину, 1.2–2.6 низом — він вистрибує, а не падає з росту.
   * М'яч задалеко — фізично не встигає, як і насправді.
   */
  planDive(aim, tArr, vmax) {
    const s = this.root.scale.x || 0.82, g = 9.81;
    // воротар уже в напівприсіді (стійка): короткий контррух і вибухове відштовхування — разом 0.15–0.24 с, решта часу — політ
    const t0 = clamp(tArr * 0.35, 0.15, 0.24), Tc = 0.35 * t0, Tp = t0 - Tc, tf = Math.max(0.12, tArr - t0);
    const PA = [0.5, 0.52, 0.55][this.diveKind], roll = diveKin(PA, this.diveKind).roll;
    const fx = Math.sin(this.bodyYaw), fz = Math.cos(this.bodyYaw);
    let ux = aim.x - this.x, uz = aim.z - this.z; const fw = ux * fx + uz * fz; ux -= fw * fx; uz -= fw * fz;
    const lat = Math.hypot(ux, uz) || 1e-6; ux /= lat; uz /= lat;
    const Lb = 1.45 * s / 0.82, reachH = Lb * Math.sin(roll);
    // куди має прилетіти таз: убік — до мети мінус дотяг рук, трохи вперед назустріч м'ячу; угору — під мету на висоту рук
    const dLat = Math.max(0.25, lat - reachH), tx = ux * dLat + fx * 0.3, tz = uz * dLat + fz * 0.3;
    const yTO = HIP * s, yT = Math.max(HIP_LIE * s + 0.1, aim.y - Lb * Math.cos(roll));
    let vx = tx / (Tp / 2 + tf), vz = tz / (Tp / 2 + tf); const vh = Math.hypot(vx, vz);
    // відштовхування вибухове: навіть до близької точки воротар летить не повільніше ~3 м/с убік (лишок гасять руки й трава)
    const k = this.diveKind, vmin = [3.2, 3.0, 2.6][k];
    if (vh > vmax) { vx *= vmax / vh; vz *= vmax / vh; } else if (vh < vmin && vh > 1e-3) { vx *= vmin / vh; vz *= vmin / vh; }
    // низом — не вистрибує вгору: тіло «падає» вбік і до м'яча, що котиться, має вже лежати майже на траві (руки й бік
    // перекривають газон). Тож вертикальна швидкість лише та, щоб у мить м'яча таз був на висоті лежачого (до ~1 м/с,
    // а якщо часу мало — і без підскоку взагалі)
    const vy = clamp((yT - yTO + 0.5 * g * tf * tf) / tf, [3.0, 2.2, -0.3][k], [4.4, 3.8, 1.0][k]);
    return { t: 0, Tc, Tp, t0, tf, PA, vx, vy, vz, x0: this.x, z0: this.z };
  }
  /** Керований удар (пенальті): прогрес kickP задає зовнішній код (0..1): замах → контакт ≈0.35 → проводка. */
  startPKick() { this.mode = 'pkick'; this.modeT = 999; this.modeD = 999; this.kickP = 0; this.setExpr('angry', 1.4); }
  gkJump() { this.setMode('gkjump', 0.7); this.setExpr('shock', 0.6); }
  /**
   * Відбиває м'яч (at — точка контакту у світі; без неї — де м'яч зараз). У стрибку поза не змінюється:
   * руки самі б'ють по м'ячу й проводять його назовні. Стоячи — долоні (або одна) виштовхують м'яч.
   */
  parry(at) {
    const air = this.mode === 'gkdive' || this.mode === 'pdive' || this.mode === 'gkjump', pt = at || this.ball;
    if (pt) {
      (this.parryAt ??= new THREE.Vector3()).copy(pt);
      this.root.updateMatrixWorld(true); { const lx = this.thorax.worldToLocal(_w.copy(pt)).x; this.parrySide = Math.abs(lx) < 0.25 ? 0 : Math.sign(lx); }   // −1 — м'яч з боку лівої руки (−x), +1 — правої, 0 — по центру
    }
    if (air) { if (pt) this.touchT = 0.35; return; }
    this.setMode('parry', 0.45);
  }
  /** Де м'яч (центр, світ). Воротар стежить за ним руками; null — м'яча не видно. Кликати щокадру. */
  ballAt(x, y, z, r = PITCH.BALL_VIS) {
    if (x === null || x === undefined) { this.ball = null; this.pbN = 0; return; }
    (this.ball ??= new THREE.Vector3()).set(x, y, z); this.ballR = r; this.ballSeen = this.t;
    // пам'ять останніх ~0.5 с руху м'яча — для сприйняття з затримкою реакції (perceive)
    const B = (this.pbB ??= new Float32Array(PB_N * 4)), i = (this.pbI = ((this.pbI ?? -1) + 1) % PB_N) * 4;
    if (this.pbN && Math.hypot(x - B[((this.pbI + PB_N - 1) % PB_N) * 4 + 1], z - B[((this.pbI + PB_N - 1) % PB_N) * 4 + 3]) > 3) this.pbN = 0;   // м'яч переставили — пам'ять заново
    B[i] = this.t; B[i + 1] = x; B[i + 2] = y; B[i + 3] = z; this.pbN = Math.min(PB_N, (this.pbN || 0) + 1);
  }

  /**
   * Що воротар «бачить» зараз: людина реагує на те, що було reactT секунд тому (≈0.13–0.26 с — «Реакція»), і подумки
   * продовжує рух, який тоді бачила (м'яч летів так — значить, тепер він тут). Тож руки йдуть туди, куди м'яч мав би
   * бути; різку зміну (рикошет, відбиття) воротар помічає із запізненням, як живий. out — Vector3; false — м'яча нема.
   */
  perceive(out) {
    const n = this.pbN || 0; if (!this.ball || n < 2) { if (this.ball) out.copy(this.ball); return !!this.ball; }
    const B = this.pbB, tq = this.t - (this.reactT ?? 0.18);
    let j = this.pbI, k = -1;
    for (let c = 0; c < n - 1; c++) { const pj = (j + PB_N - 1) % PB_N; if (B[pj * 4] <= tq) { k = pj; break; } j = pj; }
    if (k < 0) { k = (this.pbI - n + 1 + PB_N) % PB_N; j = (k + 1) % PB_N; }            // пам'ять коротша за реакцію — найстаріше
    const ta = B[k * 4], tb = B[j * 4], u = tb > ta ? clamp((tq - ta) / (tb - ta), 0, 1) : 1, dtm = Math.max(1e-3, tb - ta);
    const vx = (B[j * 4 + 1] - B[k * 4 + 1]) / dtm, vy = (B[j * 4 + 2] - B[k * 4 + 2]) / dtm, vz = (B[j * 4 + 3] - B[k * 4 + 3]) / dtm;
    const lead = this.t - Math.max(tq, ta);                                            // наскільки «вперед» думає мозок
    out.set(B[k * 4 + 1] + (B[j * 4 + 1] - B[k * 4 + 1]) * u + vx * lead, Math.max(0, B[k * 4 + 2] + (B[j * 4 + 2] - B[k * 4 + 2]) * u + vy * lead), B[k * 4 + 3] + (B[j * 4 + 3] - B[k * 4 + 3]) * u + vz * lead);
    return true;
  }
  /** Ловить м'яч: високий — у «віконце» на рівні грудей, низький (low) — підбирає з трави. Повторний виклик — одразу притискає. */
  catchBall(low = !this.ball || this.ball.y < 0.6) {
    if ((this.mode === 'catch' || this.mode === 'scoop') && this.modeT > 0) { this.modeT = Math.min(this.modeT, this.modeD * 0.45); return; }
    this.setMode(low ? 'scoop' : 'catch', 0.9); this.setExpr('shock', 0.4);
  }
  throwBall() { this.setMode('throw', 0.7); }
  setThreat(v, yaw) { this.threat = v; this.threatYaw = yaw; }
  /** Поруч інший гравець (dx, dz — до нього у світі, w 0..1 — наскільки близько): тримати його на відстані рукою. */
  fendAt(dx, dz, w) { this.fendW = w; if (w > 0) this.fendYaw = Math.atan2(dx, dz); }
  /**
   * Куди розвернути таз (відносно погляду), коли гравець біжить не туди, куди дивиться. Одна неперервна функція кута й
   * швидкості — без стрибків на межах:
   *  • повільно — таз за поглядом: убік приставний крок, назад задній хід, навскіс — хода/біг навскіс;
   *  • швидше (убік і навскіс — і вперед, і назад — від ~2.6 м/с; прямо назад, де працює задній хід, — від ~3.9 м/с) таз відкривається в бік руху — ноги біжать уперед,
   *    як у людини, а груди й голова лишаються на грі (до ~45° + ~65°); лишок між тазом і рухом — до ~11° (більший розводить стопи й хитає таз);
   *  • майже назад бік розвороту (через яке плече) запам'ятовується, щоб тіло не перекидало з боку на бік.
   */
  hipTurn(vdir, vh) {
    let rel = angDiff(this.yawF, vdir);
    const ar = Math.abs(rel);
    if (ar > 2.6) {
      if (!this.hipSide) this.hipSide = Math.sign(rel) || 1;
      if (Math.sign(rel) !== this.hipSide) rel += this.hipSide * Math.PI * 2;   // той самий кут через «своє» плече
      if (Math.abs(rel) > 3.75) { this.hipSide = -this.hipSide; rel -= this.hipSide * -Math.PI * 2; }   // рух пішов далеко за спину — інше плече
    } else this.hipSide = ar > 0.3 ? Math.sign(rel) : 0;
    // воротар довше тримає корпус на м'ячі (приставний, задній хід) — таз відкриває лише на справжньому бігу (~+0.25 м/с)
    const bk = smooth(clamp((ar - 2.55) / 0.4, 0, 1));                 // наскільки рух «назад» (там працює задній хід до ~4–4.4 м/с)
    // польовий гравець боком не ходить і не бігає: таз за рухом уже з ~0.7 м/с (назад — короткий задній хід до ~1.5 м/с);
    // приставним кроком довше пересувається лише воротар у стійці (м'яч близько до його воріт)
    const gkw = this.look.gk && !this.gaze && (this.mode === 'gkwait' || (this.gkAlertS ?? 1) > 0.3);
    const v0 = gkw ? lerp(2.0, 3.4, bk) + 0.25 * (1 - bk) : lerp(0.55, 1.3, bk), w = smooth(clamp((vh - v0) / 0.4, 0, 1));
    return w * (rel - Math.sign(rel) * Math.min(0.08, 0.05 * Math.abs(rel)));
  }

  /** Контакт тілом (плече в плече): (dx, dz) — до суперника, w 0..1 — наскільки щільно тиснуть. За кадр береться найсильніший. */
  jostle(dx, dz, w) { if (w > (this.jsIn || 0)) { this.jsIn = w; this.jsYaw = Math.atan2(dx, dz); } }

  /** Підйом з землі: сісти/перекотитись → присісти → випрямитись. q 0..1. Результат в this.r. */
  rise(q, tx0, tz0) {
    const r = this.r;
    if (tx0 > 0) {                          // з живота: відтискаємось руками, груди вгору → коліна під себе → встаємо
      if (q < 0.34) {
        const k = smooth(q / 0.34);
        r.tx = tx0 * lerp(1, 0.7, k); r.tz = tz0 * lerp(1, 0.7, k); r.leanX = -0.3 * k; r.legs = 1.0 * k; r.arms = 0.9 * k; r.spread = 0.3;
      } else if (q < 0.7) {
        const k = smooth((q - 0.34) / 0.36);
        r.tx = tx0 * lerp(0.7, 0.15, k); r.tz = tz0 * lerp(0.7, 0.15, k); r.leanX = lerp(-0.3, 0.5, k); r.legs = lerp(1.0, 1.4, k); r.arms = lerp(0.9, 0.4, k); r.spread = 0.25;
      } else {
        const k = smooth((q - 0.7) / 0.3);
        r.tx = tx0 * 0.15 * (1 - k); r.tz = tz0 * 0.15 * (1 - k); r.leanX = lerp(0.5, 0, k); r.legs = lerp(1.4, 0, k); r.arms = lerp(0.4, 0, k); r.spread = lerp(0.25, 0.08, k);
      }
      r.drop = THIGH * (1 - Math.cos(r.legs));
      return;
    }
    if (q < 0.34) {                         // зі спини: упор руками
      const k = smooth(q / 0.34);
      r.tx = tx0 * lerp(1, 0.55, k); r.tz = tz0 * lerp(1, 0.55, k); r.leanX = 0.7 * k; r.legs = 0.6 * k; r.arms = -1.15 * k; r.spread = 0.3;
    } else if (q < 0.7) {                   // присіли навпочіпки
      const k = smooth((q - 0.34) / 0.36);
      r.tx = tx0 * lerp(0.55, 0.08, k); r.tz = tz0 * lerp(0.55, 0.08, k); r.leanX = lerp(0.7, 0.85, k); r.legs = lerp(0.6, 1.4, k); r.arms = lerp(-1.15, 0.4, k); r.spread = 0.25;
    } else {                                // випрямляємось
      const k = smooth((q - 0.7) / 0.3);
      r.tx = tx0 * 0.08 * (1 - k); r.tz = tz0 * 0.08 * (1 - k); r.leanX = lerp(0.85, 0, k); r.legs = lerp(1.4, 0, k); r.arms = lerp(0.4, 0, k); r.spread = lerp(0.25, 0.08, k);
    }
    r.drop = THIGH * (1 - Math.cos(r.legs));
  }

  /** Кінематика: біг із фазами кроку, згином колін і ліктів, контр-обертанням плечей; удар, прийом, підкат, сейви, радість. */
  animate(dt) {
    this.t += dt;
    const speed = Math.hypot(this.vx, this.vz);
    const sp = clamp(speed / 8.5, 0, 1);
    const prevYaw = this.bodyYaw;
    {   // поворот корпусу: швидкість обмежена (повільніше на великій швидкості) — тіло має інерцію
      // ціль курсу згладжена: гра (ІІ) смикає напрям від кадру до кадру — тіло цього не повторює
      // в ударі, випаді й підкаті тіло розвертається різко — на опорній нозі, а не плавним поворотом бігу
      const act = this.kicking > 0 || this.mode === 'tackle' || this.mode === 'slide' || this.mode === 'header';
      this.yawF = this.yawF === undefined ? this.yaw : this.yawF + angDiff(this.yawF, this.yaw) * Math.min(1, dt * (act ? 25 : 7));
      // куди розвернути таз, коли гравець дивиться в одну сторону (на гру), а рухається в іншу — як футболіст:
      //  убік повільно — приставний крок (таз за поглядом); убік швидше — «відкриває стегна» в бік руху на 45–60°;
      //  назад повільно — задній хід (таз за поглядом); назад швидше ~3.5 м/с — розвертається й біжить, озираючись через плече.
      // Груди й голова лишаються на грі (до ~110° разом), решту докручує погляд
      let hipT = 0;
      {
        const own = Math.abs(this.vx) + Math.abs(this.vz) > 0.01, vx = own ? this.vx : this.mvx || 0, vz = own ? this.vz : this.mvz || 0;
        const vh = Math.hypot(vx, vz), free0 = (this.mode === 'idle' || this.mode === 'aim' || this.mode === 'gkwait' || this.mode === 'gesture' || this.mode === 'sad') && !this.kicking && !this.holdFacing;
        if (free0 && vh > 0.6) hipT = this.hipTurn(Math.atan2(vx, vz), vh);
        else this.hipSide = 0;
      }
      // укривання м'яча: під тиском таз розвертається так, щоб суперник опинився збоку-позаду (між ним і м'ячем — тіло),
      // але м'яч лишається в межах досяжності ноги (не більше ~75° від погляду)
      if (this.threat > 0.3 && this.mode === 'idle' && speed < 2.5 && !this.look.gk) {
        const th = smooth(clamp((this.threat - 0.3) / 0.5, 0, 1)), rel = angDiff(this.yawF, this.threatYaw), sg = Math.sign(rel) || 1;
        hipT += clamp(angDiff(this.yawF, this.threatYaw - sg * (Math.PI / 2 + 0.4)), -1.3, 1.3) * th;
      }
      this.hipY = (this.hipY || 0) + (hipT - (this.hipY || 0)) * Math.min(1, dt * 5);
      this.bodyYawT = this.yawF + this.hipY;
      const dy = angDiff(this.bodyYaw, this.bodyYawT), wmax = (act ? 16 : 9 - 4 * sp) * dt;
      this.bodyYaw += clamp(dy * Math.min(1, dt * (act ? 20 : 8)), -wmax, wmax);
      // таз не обганяє стопи: відносно них він повертається лише на ~30° (у бігу ~45°), далі — тільки переступивши.
      // Тож ноги й тулуб рухаються разом, а поворот іде кроками, як у людини
      const gs = this.gaitSys;
      if (this.gaitFree && gs.ready) {
        const f0 = gs.feet[0].yaw, fy = f0 + angDiff(f0, gs.feet[1].yaw) / 2, lim = gs.cycling ? 0.8 : 0.5;
        const d = angDiff(fy, this.bodyYaw); if (Math.abs(d) > lim) this.bodyYaw = fy + Math.sign(d) * lim;
        // і щодо кожної опорної стопи — не більше ~55° (оберт стегна): на розвороті тіло чекає, поки стопа переступить
        for (let i = 0; i < 2; i++) { const f = gs.feet[i]; if (f.st !== 'stance') continue; const e = angDiff(f.yaw, this.bodyYaw); if (Math.abs(e) > 0.95) this.bodyYaw = f.yaw + Math.sign(e) * 0.95; }
      }
    }
    this.body.rotation.y = this.bodyYaw;
    const turn = dt > 0 ? angDiff(prevYaw, this.bodyYaw) / dt : 0;
    const acc = dt > 0 ? (speed - (this.pSpeed || 0)) / dt : 0; this.pSpeed = speed;
    this.accL = (this.accL || 0) + (clamp(acc, -25, 25) - (this.accL || 0)) * Math.min(1, dt * 8);
    // прискорення з вектора швидкості: поздовжнє (розгін/гальмування) і бічне (поворот) у системі координат тіла
    if (dt > 0) {
      const ax = (this.vx - this.pvx) / dt, az = (this.vz - this.pvz) / dt, hs = Math.sin(this.bodyYaw), hc = Math.cos(this.bodyYaw);
      const al = clamp(ax * hs + az * hc, -30, 30), at = clamp(ax * hc - az * hs, -30, 30);
      const kk = Math.min(1, dt * 5); this.aLong += (al - this.aLong) * kk; this.aLat += (at - this.aLat) * kk;   // тіло відчуває прискорення м'яко (вестибулярна інерція)
    }
    this.pvx = this.vx; this.pvz = this.vz;
    this.fatigue = clamp((this.fatigue || 0) + dt * (speed > 5.5 ? 0.12 : speed > 2.5 ? 0.02 : -0.05), 0, 1);   // втома: росте на спринті, спадає в спокої
    this.breathUp = 0;

    if (this.exprT > 0) { this.exprT -= dt; if (this.exprT <= 0) this.setExpr('neutral'); }
    if (this.pendingSad && this.mode !== 'pdive' && this.t >= (this.sadAt ?? 0) && (this.mode === 'idle' || this.mode === 'gkwait' || this.modeT <= 0) && Math.hypot(this.vx, this.vz) < 2.6) { const ps = this.pendingSad; this.pendingSad = 0; this.sadNow = true; this.sad(ps, this.pendingSadStyle); }
    if (this.modeT > 0) { this.modeT -= dt; if (this.modeT <= 0) { this.bakeSlide(); this.mode = 'idle'; } }
    if (this.mode === 'stagger' && this.stag) {                // поштовх несе тіло, ноги його наздоганяють; сила гаситься кроками
      // поштовх діє не миттєво, а за ~0.15 с контакту — тіло набирає швидкість плавно, і ноги встигають підставити крок
      const g = this.stag, k = Math.exp(-dt * 3.2), ramp = Math.min(1, (g.t += dt) / 0.15); this.x += g.vx * ramp * dt; this.z += g.vz * ramp * dt; g.vx *= k; g.vz *= k;
    } else this.stag = null;

    let sdA = 0, sdB = 0, twA = 0, twB = 0, aBoost = 0, legA = 0, legB = 0, kneeA = 0.06, kneeB = 0.06, armA = 0, armB = 0, elbA = 0.3, elbB = 0.3;
    let leanX = 0, leanZ = 0, leanY = 0, bob = 0, lift = 0, spread = 0, drop = 0;
    let tiltX = 0, tiltZ = 0, tiltY = 0, flip = 0, slide = 0;
    let ankA = null, ankB = null, ankOwn = false, abdSA = 0, abdSB = 0, pelX = 0, pelY = 0, pelZ = 0, hdX = 0, hdY = 0, hdZ = 0;
    const loc = (this._loc ??= { legA: 0, legB: 0, kneeA: 0, kneeB: 0, on: false }); loc.legA = loc.legB = loc.kneeA = loc.kneeB = 0; loc.on = false;
    const grounded = this.mode === 'slide' || this.mode === 'gkdive' || this.mode === 'stumble' || this.mode === 'kneel' || this.mode === 'rest';

    // ---- фізична хода: коли тіло вільне від скриптової дії — стійка, переступання, хода, біг, повороти, гальмування.
    // Стопи стоять у світі, таз — маса на пружних ногах, кроки ставить регулятор рівноваги (див. gait.js).
    // справжня швидкість тіла з переміщення: гра інколи рухає гравця напряму (воротар у пенальті), без vx/vz
    if (dt > 0) {
      const mx = (this.x - (this.lpx ?? this.x)) / dt, mz = (this.z - (this.lpz ?? this.z)) / dt, ok = Math.hypot(mx, mz) < 12, k = Math.min(1, dt * 15);
      this.mvx = (this.mvx || 0) + ((ok ? mx : 0) - (this.mvx || 0)) * k; this.mvz = (this.mvz || 0) + ((ok ? mz : 0) - (this.mvz || 0)) * k;
    }
    this.lpx = this.x; this.lpz = this.z;
    const own = Math.abs(this.vx) + Math.abs(this.vz) > 0.01, gvx = own ? this.vx : this.mvx, gvz = own ? this.vz : this.mvz;
    // стійка воротаря (пенальті) теж на справжній ході: ноги переступають приставним кроком, а не ковзають «крабом»
    // і втримання рівноваги після поштовху (stagger) — теж справжніми кроками: ноги наздоганяють центр мас
    const free = !grounded && (this.mode === 'idle' || this.mode === 'aim' || this.mode === 'gkwait' || this.mode === 'stagger' || this.mode === 'sad' || this.mode === 'gesture') && !this.kicking;
    let G = null;
    if (free) {
      const sc = this.root.scale.x || 0.82, th = this.threat > 0.2 && speed < 2.5 ? (this.threat - 0.2) / 0.8 : 0;
      const st = (this._gst ??= { x: 0, z: 0, vx: 0, vz: 0, yaw: 0, scale: 1, aLong: 0, aLat: 0, yawT: 0, crouch: 0, arms: null, wide: 0, dribble: false });   // один об'єкт на гравця
      st.x = this.x; st.z = this.z; st.vx = gvx; st.vz = gvz; st.yaw = this.bodyYaw; st.scale = sc; st.aLong = this.aLong; st.aLat = this.aLat;
      // воротар: стійка залежить від пильності (gkAlert 0..1 — гра, 1 у лабораторії й на пенальті): м'яч далеко — стоїть і
      // ходить майже рівно, розслаблено; небезпека — низька широка стійка. Перед ударом — «set»: коротке присідання на обидві
      // ноги (вага на носках), а в стійці вага ледь переходить з ноги на ногу, а не застиглий манекен
      let gkC = 0, gkW = 0;
      if (this.look.gk && speed < 3) {
        const al = this.gkAlertS = (this.gkAlertS ?? 1) + ((this.gaze ? 0 : this.gkAlert ?? 1) - (this.gkAlertS ?? 1)) * Math.min(1, dt * 3), ws = 1 - smooth(clamp((speed - 1.5) / 1.5, 0, 1));   // у кат-сценах (gaze) — не в стійці
        if (this.gkShot && !this.gkShotP) this.gkSetT = 0.32;                                           // удар — «set»
        this.gkShotP = this.gkShot;
        const setK = this.gkSetT > 0 ? Math.sin(Math.PI * (1 - (this.gkSetT -= dt) / 0.32)) : 0;
        gkC = lerp(0.12, 0.58, al) * ws + 0.4 * Math.max(0, setK) + (speed < 0.3 ? 0.03 * al * Math.sin(this.t * 5.3 + (this.ph0 ?? 0)) : 0);
        gkW = lerp(0.03, 0.1, al) * ws * sc;
      }
      st.yawT = this.bodyYawT ?? this.yaw; st.crouch = gkC + 0.5 * th + (this.gCrouch || 0); this.gCrouch = 0; st.arms = this.armStyle; st.wide = gkW; st.dribble = this.dribble; st.cadK = this.persona.cad;
      if (!this.gaitFree && this.gaitSys.ready) {             // ноги повертаються зі скриптової дії: стопи там, де вони зараз
        this.root.updateMatrixWorld(true);
        const fw = (this._fw ??= [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]);
        this.gaitSys.reset(st, [this.footL.getWorldPosition(fw[0]), this.footR.getWorldPosition(fw[1])], this.pose.getWorldPosition(fw[2]).y);
      }
      G = this.gaitSys.update(st, dt);
      legA = G.legA; legB = G.legB; kneeA = G.kneeA; kneeB = G.kneeB; ankA = G.ankA; ankB = G.ankB;
      armA = G.armA; armB = G.armB; elbA = G.elbA; elbB = G.elbB; twA = G.armTwA; twB = G.armTwB; spread = G.spread; sdA = G.sdA; sdB = G.sdB;
      leanX = G.leanX; leanY = G.leanY; leanZ = G.leanZ; pelY = G.pelY; pelZ = G.pelZ; pelX = G.pelX; tiltX = G.pitch; tiltZ = G.roll; bob = G.hip - HIP;
      loc.on = true; loc.legA = legA; loc.legB = legB; loc.kneeA = kneeA; loc.kneeB = kneeB;
      { const PS = this.persona; leanX += PS.lean * (1 - 0.5 * sp); hdZ += PS.tilt; spread += PS.wide; }   // своя постава
      // дотик м'яча на веденні: стопа коротко «клацає» вперед (щиколотка), корпус ледь над м'ячем — кроки ходи не ламаються
      if (this.tapT > 0) {
        this.tapT -= dt; const e = Math.sin(Math.PI * clamp(1 - this.tapT / 0.2, 0, 1));
        if (this.tapSide) { if (ankB !== null) ankB -= 0.55 * e; } else if (ankA !== null) ankA -= 0.55 * e;
        leanX += 0.06 * e; if (this.tapSide) armA += 0.2 * e; else armB += 0.2 * e;
      }
      // руки тримають рівновагу: у крутому повороті зовнішня рука відходить убік (противага відцентровій силі), на різкому
      // гальмуванні обидві йдуть уперед і трохи вбік, на ривку з місця — сильніший мах (амплітуду дає хода)
      {
        const tk = smooth(clamp((Math.abs(this.aLat) - 3) / 9, 0, 1)), bk = smooth(clamp((-this.aLong - 4) / 9, 0, 1));
        if (this.aLat > 0) sdA += 0.4 * tk; else sdB += 0.4 * tk;
        spread += 0.15 * tk + 0.2 * bk; armA += 0.35 * bk; armB += 0.35 * bk; elbA += 0.25 * bk; elbB += 0.25 * bk;
      }
      if (speed < 0.3) {                                      // стоїть: дихання й інколи руки на поясі
        const ph0 = (this.ph0 ??= Math.random() * 20);
        // після спринту дихання важке: частіше й глибше, плечі піднімаються на вдиху
        const fat = this.fatigue || 0, bh = Math.sin((this.bph = (this.bph || 0) + dt * (1.7 + 2.6 * fat)));
        leanX += (0.01 + 0.04 * fat) * bh; spread += 0.03 * fat * Math.max(0, bh); this.breathUp = 0.012 * fat * Math.max(0, bh);
      }
      // манера тримати руки — своя в кожного й час від часу змінюється: на ходу розслаблені майже прямі руки, звичайний
      // мах або одна рука на поясі; стоячи — руки на поясі, схрещені на грудях, за спиною, зчеплені перед собою, одна на поясі
      if (this.mode === 'idle' && this.fidget !== false && !this.dribble && speed < 3.2 && !(this.look.gk && (this.gkAlertS ?? 1) > 0.3)) {
        const PS = this.persona, C = (this.cg ??= { pose: 1, t: 0, k: 0, stand: null }), stand = speed < 0.35;
        C.t -= dt;
        if (C.stand !== stand || C.t <= 0) { const pool = stand ? PS.stand : PS.walkP; C.pose = pool[(Math.random() * pool.length) | 0]; C.t = 5 + Math.random() * 8; C.stand = stand; C.k = 0; }
        C.k = Math.min(1, C.k + dt / 0.7);
        const k = smooth(C.k), pz = C.pose;
        if ((pz === 4 && (this.fatigue || 0) > 0.5)) C.t = 0;                      // захекався — руки за спиною не тримає
        if (pz === 0) { elbA = lerp(elbA, 0.16 + 0.12 * Math.max(0, armA), k); elbB = lerp(elbB, 0.16 + 0.12 * Math.max(0, armB), k); }
        else if (pz !== 1) {
          // пози, де долоні лежать на тілі: кути — лише «заготовка» (лікті куди треба: на поясі — назовні, схрещені — вперед),
          // точне місце долоні ставить IK на ПОВЕРХНІ тіла (з товщиною кисті), а bodyGuard не пускає руку всередину тулуба
          const both = pz === 2 || pz === 4 || pz === 5 || pz === 6, pre = pz === 4 ? [-0.45, 1.2, 0.2] : pz === 5 ? [1.1, 2.1, -0.05] : pz === 6 ? [0.45, 0.9, 0.05] : [-0.15, 1.7, 0.55];
          armA = lerp(armA, pre[0], k); elbA = lerp(elbA, pre[1], k); sdA += pre[2] * k;
          if (both) { armB = lerp(armB, pre[0], k); elbB = lerp(elbB, pre[1], k); sdB += pre[2] * k; } else elbB = lerp(elbB, 0.22, k);
          const busy = this.rch && this.rch.some((q) => !q.carry && this.t - q.at < 0.15);
          if (!busy) {
            const P = pz === 4 ? [[-0.05, -0.5, -0.24], [0.05, -0.5, -0.24]]          // зчеплені за спиною, на попереку
              : pz === 5 ? [[0.24, -0.08, 0.27], [-0.24, -0.02, 0.31]]                    // схрещені: передпліччя перед грудьми
              : pz === 6 ? [[-0.04, -0.62, 0.3], [0.04, -0.62, 0.3]]                      // зчеплені перед собою, низько
              : [[-0.32, -0.4, 0.04], [0.32, -0.4, 0.04]];                                // долоні на поясі збоку
            const pole = pz === 4 ? [1, -0.5, -0.6] : pz === 5 ? [0.7, -1, 0.5] : pz === 6 ? [0.6, -1, 0.1] : [1, 0.1, -0.45];   // куди дивиться лікоть
            for (let h = 0; h < (both ? 2 : 1); h++) { this.thorax.localToWorld(_ik2.set(P[h][0], P[h][1], P[h][2])); this.reach(h, _ik2.x, _ik2.y, _ik2.z, k, false, true, pole); }
          }
        }
      } else if (this.cg) { this.cg.k = 0; this.cg.t = 0; }
      this.gait = this.gaitSys.stats; this.gait.v = speed;
      this.phase = this.gaitSys.phaseAngle;
    }
    this.gaitFree = free;

    if (this.mode === 'pdive' && this.dvPlan) {
      // стрибок за фізикою: фаза — з реального часу (присід → відштовхування → політ до м'яча → лежить → підводиться)
      const pl = this.dvPlan; pl.t += dt; const t = pl.t, r = (pl.PA - 0.3) / pl.tf;
      const tA = t - pl.t0, tOne = (1 - 0.3) / r;
      // після приземлення: звичайно — встає за ~0.8 с; пропустив гол — повільно, ~2 с (темп підйому згладжено, без ривка)
      if (tA >= tOne) { this.riseK = (this.riseK ?? 0.6) + ((this.slowRise ? 0.22 : 0.6) - (this.riseK ?? 0.6)) * Math.min(1, dt * 4); this.riseP = (this.riseP ?? 1) + this.riseK * dt; }
      else { this.riseK = 0.6; this.riseP = 1; }
      this.diveP = t < pl.t0 ? 0.3 * t / pl.t0 : tA < tOne ? 0.3 + r * tA : this.riseP;
      // відштовхування: ноги розганяють тіло рівноприскорено від нуля до швидкості відриву (поки воно ще на газоні)
      // (лише до відриву: після польоту тіло лишається там, де впало, і встає звідти)
      if (!this.diveRag) { const tau = clamp(t - pl.Tc, 0, pl.Tp), d = 0.5 * tau * tau / pl.Tp; this.x = pl.x0 + pl.vx * d; this.z = pl.z0 + pl.vz * d; }
      if (this.diveP >= 1.5) {
        this.dvPlan = null; this.setMode('idle'); this.diveFree = false; this.slowRise = false;
        if (this.pendingSad) { const ps = this.pendingSad; this.pendingSad = 0; this.sad(ps, this.pendingSadStyle); }   // підвівся — тепер сумує
        else if (this.pendingCheer) { const pc = this.pendingCheer; this.pendingCheer = 0; this.cheer(pc, this.pendingCheerStyle); }   // … або радіє сейву
        else if (this.look.gk && this.afterDive) { this.afterDive = false; this.gesture(1.5); }              // підвівся — жестом підганяє захисників і йде на позицію
      }
    }
    const md = this.modeD || 1, mk = md > 0 ? clamp(1 - this.modeT / md, 0, 1) : 1;     // прогрес режиму 0..1
    const sn = Math.sin(mk * Math.PI), r = this.r;
    switch (this.mode) {
      case 'aim': {
        const p = this.power;
        legB = -p * 1.15; kneeB = 0.3 + p * 1.1; leanX = -0.08 - p * 0.3; armA = -0.45 - p * 0.5; armB = 0.5 + p * 0.4; spread = 0.3 + p * 0.4; elbA = elbB = 0.6;
        break;
      }
      case 'cheer': {
        const st = this.style, a = this.amp, T = (this.t + (this.emoPh ?? 0)) * (this.emoRate ?? 1);   // кожен у своєму темпі й фазі
        elbA = elbB = 0.3;
        if (st === 0) { const j = Math.abs(Math.sin(T * 8)); lift = j * 0.85 * a; armA = armB = 2.7 + Math.sin(T * 18) * 0.3; spread = 0.45; legA = 0.3 * (1 - j) + 0.15 * j; legB = legA; kneeA = kneeB = 0.6 * (1 - j) * (1 - j) + 0.15 * j; drop = 0.06 * (1 - j) * (1 - j); }   // на землі — присід (амортизація й відштовхування), угорі — ноги прямі
        else if (st === 1) { const j = Math.abs(Math.sin(T * 6.5)); lift = j * 0.5 * a; kneeA = kneeB = 0.45 * (1 - j) * (1 - j); legA = legB = 0.2 * (1 - j); armA = 2.5; armB = Math.sin(T * 14) * 0.6 + 1.2; elbB = 1.6; spread = 0.35; leanX = -0.12; }
        else if (st === 2) { const j = Math.abs(Math.sin(T * 9)); lift = j * 0.45 * a; kneeA = kneeB = 0.4 * (1 - j) * (1 - j); legA = legB = 0.18 * (1 - j); armA = armB = 1.55; spread = 1.0; leanZ = Math.sin(T * 4.5) * 0.25; leanX = 0.15; elbA = elbB = 0.1; }
        else if (st === 3) { const j = Math.abs(Math.sin(T * 7)); lift = j * 0.35 * a; kneeA = kneeB = 0.35 * (1 - j) * (1 - j); legA = legB = 0.15 * (1 - j); armA = armB = 2.35; spread = 0.12; leanX = 0.1; bob = Math.sin(T * 14) * 0.03; elbA = elbB = 1.7; }
        else if (st === 4) { armA = Math.sin(T * 9) * 1.2; armB = -armA; elbA = elbB = 0.9; legA = Math.sin(T * 9) * 0.5; legB = -legA; kneeA = 0.3 + Math.max(0, legA) * 0.8; kneeB = 0.3 + Math.max(0, legB) * 0.8; leanZ = Math.sin(T * 4.5) * 0.18; bob = Math.abs(Math.sin(T * 9)) * 0.1; spread = 0.5; }
        else if (st === 6) {                                   // «Локомотив»: руки-шатуни, крок на місці
          const w = Math.sin(T * 10);
          armA = 0.5 + w * 0.9; armB = 0.5 - w * 0.9; elbA = elbB = 1.5; legA = w * 0.8; legB = -legA;
          kneeA = 0.3 + Math.max(0, legA) * 1.0; kneeB = 0.3 + Math.max(0, legB) * 1.0; leanX = 0.22; lift = Math.abs(w) * 0.18; spread = 0.1; bob = Math.sin(T * 20) * 0.02;
        } else if (st === 7) {                                 // стрибок із обертом на 360° і руки вниз
          const q = clamp((md - this.modeT) / 0.9, 0, 1), e2 = easeOut(q);
          this.body.rotation.y = this.bodyYaw + e2 * TAU;
          lift = Math.sin(q * Math.PI) * 1.15 * a; armA = armB = q < 1 ? 0.2 : 0.1; spread = q < 1 ? 0.9 : 0.55; legA = q < 1 ? 0.5 : 0.12; legB = q < 1 ? -0.3 : -0.12; kneeA = kneeB = q < 1 ? 0.9 : 0.1; leanX = q < 1 ? 0.1 : -0.18;
        } else if (st === 8) {                                 // «тихо!»: палець до губ
          armA = 2.95; elbA = 2.7; armB = 0.7; elbB = 1.7; spread = 0.18; leanX = -0.08; bob = Math.sin(T * 2) * 0.012;
        } else if (st === 9) {                                 // колиска
          armA = armB = 0.95; elbA = elbB = 1.75; spread = 0.0; leanZ = Math.sin(T * 3) * 0.22; leanX = 0.1; bob = Math.sin(T * 3) * 0.015;
        } else if (st === 10) {                                // літак: руки в боки, нахили
          armA = armB = 0.0; spread = 1.5; leanZ = Math.sin(T * 2.4) * 0.38; leanX = 0.15; lift = Math.abs(Math.sin(T * 2.4)) * 0.12; legA = Math.sin(T * 4) * 0.25; legB = -legA;
        } else if (st === 11) {                                // відданя честі
          armA = 2.5; elbA = 2.35; armB = 0.05; elbB = 0.2; spread = 0.12; leanX = -0.04; bob = Math.sin(T * 6) * 0.01;
        } else if (st === 12) {                                // дэб
          armA = 2.3; elbA = 2.45; armB = 1.75; elbB = 0.1; spread = 0.5; leanX = 0.14; leanZ = 0.05;
        } else if (st === 13) {                                // «Так!»: кулак ривком до себе (кілька разів), корпус уперед, ноги в стійці
          const pw = accent(T * 1.15);                         // ривок кулаком — різко, назад — повільніше; тіло йде за рукою
          armB = 1.5 - 0.9 * pw; elbB = 1.45 + 0.95 * pw; sdB = 0.2; armA = 0.25 + 0.15 * pw; elbA = 0.5; spread = 0.25;
          leanX = 0.1 + 0.2 * pw; leanY = -0.22 * pw; legA = legB = 0.18; kneeA = kneeB = 0.33 + 0.2 * pw; drop = 0.04 + 0.05 * pw; hdX = -0.2 + 0.25 * pw;
        } else if (st === 14) {                                // оплески над головою
          const cl = accent(T * 2.3);                          // плеск — долоні зустрічаються різко, розходяться м'якше
          armA = armB = 2.8; elbA = elbB = 0.25 + 0.3 * (1 - cl); spread = 0.03 + 0.34 * (1 - cl); leanX = -0.08 + 0.05 * cl; hdX = -0.25 + 0.1 * cl;
          const j = Math.abs(Math.sin(T * 4.5)); lift = 0.12 * j * a; kneeA = kneeB = 0.25 * (1 - j);
        } else if (st === 15) {                                // б'є себе в груди, друга рука вгору — до трибун
          const tp = accent(T * 1.7);                          // удар у груди — різкий
          armB = 1.25 + 0.15 * tp; elbB = 2.25; sdB = -0.25 - 0.1 * tp; armA = 2.6; elbA = 0.25; spread = 0.3; leanX = -0.12 - 0.05 * tp; hdX = -0.2;
          leanY = Math.sin(T * 1.6) * 0.25;
        } else if (st === 16) {                                // обидві руки в небо, голова вгору
          armA = armB = 2.95; elbA = elbB = 0.08; spread = 0.22 + 0.04 * Math.sin(T * 3); leanX = -0.28; hdX = -0.45; kneeA = kneeB = 0.15;
        } else if (st === 17) {                                // рик: силова стійка, руки «м'язами» вниз-убік, крик
          const r = Math.sin(T * 5) * 0.06;
          armA = armB = 0.85 + r; elbA = elbB = 2.0; spread = 1.15; leanX = 0.3; legA = legB = 0.3; kneeA = kneeB = 0.55; drop = 0.08; hdX = -0.25;
        } else if (st === 18) {                                // «не чую!»: долоня до вуха, друга рука підганяє трибуни
          const w = accent(T * 1.4);
          armB = 2.25; elbB = 2.35; sdB = 0.75; armA = 1.9 + 0.7 * w; elbA = 0.6 - 0.4 * w; spread = 0.35; leanX = -0.05; leanZ = -0.12; hdZ = 0.2; hdY = -0.25;
        } else if (st === 19) {                                // цілує емблему: рука до грудей, голова вниз — і рука вгору
          const up = smooth(clamp(((md - this.modeT) - 0.8) / 0.4, 0, 1));
          armB = lerp(1.15, 2.85, up); elbB = lerp(2.35, 0.15, up); sdB = lerp(-0.35, 0.1, up); armA = 0.35; hdX = lerp(0.55, -0.3, up); leanX = lerp(0.25, -0.15, up);
        } else if (st === 20) {                                // «сила!»: обидві руки зігнуті вгору, біцепси, рик
          const f = accent(T * 1.1);
          armA = armB = 1.55; elbA = elbB = 2.1 + 0.25 * f; sdA = sdB = 1.05; spread = 0.4; leanX = 0.05 + 0.12 * f; kneeA = kneeB = 0.25 + 0.2 * f; legA = legB = 0.15; drop = 0.03 + 0.04 * f; hdX = -0.3;
        } else if (st === 21) {                                // «спокійно, спокійно»: долоні вниз, притискає повітря
          const pu = accent(T * 1.5);
          armA = armB = 1.15 - 0.35 * pu; elbA = elbB = 0.25; spread = 0.55; leanX = 0.1 + 0.08 * pu; kneeA = kneeB = 0.15 + 0.12 * pu; hdX = 0.05;
        } else { const q = clamp((md - this.modeT) / 0.9, 0, 1); flip = -easeOut(q) * TAU; lift = Math.sin(q * Math.PI) * 1.5; armA = armB = q < 1 ? 1.2 : 2.7; spread = 0.4; legA = q < 1 ? 1.0 : 0; legB = q < 1 ? -0.4 : 0; kneeA = kneeB = q < 1 ? 1.4 : 0.06; }
        break;
      }
      case 'hug': {
        // обійми: руки обхоплюють (плечі вперед, лікті зігнуті, долоні всередину), корпус до партнера, голова набік;
        // разом підстрибують — з присідом на землі; входять і виходять плавно
        const e = smooth(clamp((md - this.modeT) / 0.3, 0, 1)) * smooth(clamp(this.modeT / 0.35, 0, 1)), T = (this.t + (this.emoPh ?? 0)) * (this.emoRate ?? 1);
        const j = Math.abs(Math.sin(T * 7)) * smooth(clamp(((md - this.modeT) - 0.4) / 0.3, 0, 1));
        armA = armB = 1.35 * e; elbA = elbB = 0.3 + 1.2 * e; sdA = sdB = -0.3 * e; spread = 0.25 * (1 - e) + 0.05 * e;
        leanX = 0.22 * e; leanZ = 0.06 * Math.sin(T * 3) * e; hdZ = 0.25 * e; hdX = 0.1 * e;
        lift = 0.13 * j * e; kneeA = kneeB = 0.06 + 0.35 * (1 - j) * (1 - j) * e; legA = legB = 0.15 * (1 - j) * e; drop = 0.03 * (1 - j) * e;
        break;
      }
      case 'gesture': {
        const e = smooth(clamp((md - this.modeT) / 0.25, 0, 1)) * smooth(clamp(this.modeT / 0.35, 0, 1)), T = (this.t + (this.emoPh ?? 0)) * this.persona.tempo, st = this.style;
        if (st === 0) { const a2 = accent(T * 1.6); armB = lerp(armB, 1.55 + 0.15 * a2, e); elbB = lerp(elbB, 0.1, e); sdB += 0.5 * e * (0.6 + 0.4 * a2); leanY -= 0.2 * e; hdY -= 0.35 * e; }   // показує рукою вбік: «стань там!»
        else if (st === 1) { const a2 = accent(T * 2); armB = lerp(armB, 1.3 + 0.9 * a2, e); elbB = lerp(elbB, 0.9 - 0.6 * a2, e); armA = lerp(armA, 0.4, e); hdX -= 0.15 * e; }   // підганяє: «вперед, вперед!»
        else if (st === 2) { const c2 = accent(T * 2.4); armA = lerp(armA, 1.35, e); armB = lerp(armB, 1.35, e); elbA = lerp(elbA, 0.9, e); elbB = lerp(elbB, 0.9, e); spread = lerp(spread, 0.03 + 0.3 * (1 - c2), e); }   // плескає: «зібрались!»
        else if (st === 3) { armA = lerp(armA, 0.9, e); armB = lerp(armB, 0.9, e); elbA = lerp(elbA, 0.5, e); elbB = lerp(elbB, 0.5, e); spread = lerp(spread, 1.0, e); hdX -= 0.2 * e; leanX -= 0.06 * e; }   // розводить руками: «як так?!»
        else if (st === 4) { armB = lerp(armB, 1.05, e); elbB = lerp(elbB, 2.3, e); sdB = lerp(sdB, -0.45, e); armA = lerp(armA, 0.05, e); elbA = lerp(elbA, 0.2, e); hdX -= 0.12 * e; leanX -= 0.03 * e; }   // гімн: долоня на серці, підборіддя вгору
        else if (st === 5) { const w = Math.sin(T * 7); armB = lerp(armB, 2.55, e); elbB = lerp(elbB, 0.4 + 0.15 * w, e); sdB += (0.3 + 0.32 * w) * e; hdX -= 0.22 * e; leanY -= 0.12 * e; }   // махає трибунам
        else if (st === 7) {                                   // витирає піт з чола: долоня через лоб
          const q = mk, sw = smooth(clamp((q - 0.25) / 0.45, 0, 1));
          armB = lerp(armB, 2.15, e); elbB = lerp(elbB, 2.45, e); sdB = lerp(sdB, -0.45 + 0.75 * sw, e); hdX += (0.08 - 0.12 * sw) * e; hdY -= 0.1 * e;
        } else if (st === 8) {                                 // поправляє футболку: обидві руки до низу футболки, смикає
          const a2 = accent(T * 1.3); armA = lerp(armA, 0.35, e); armB = lerp(armB, 0.35, e); elbA = lerp(elbA, 1.35, e); elbB = lerp(elbB, 1.35, e); spread = lerp(spread, -0.05, e);
          leanX += 0.06 * a2 * e; hdX += 0.3 * e;
        } else if (st === 9) {                                 // руки на колінах — відсапується після спринту
          leanX = lerp(leanX, 0.78 + 0.04 * Math.sin(T * 4.2), e); armA = lerp(armA, 0.72, e); armB = lerp(armB, 0.72, e); elbA = lerp(elbA, 0.15, e); elbB = lerp(elbB, 0.15, e); spread = lerp(spread, 0.22, e); hdX -= 0.55 * e;
          this.gCrouch = 0.55 * e;
        } else if (st === 10) {                                // показує партнерові й кричить: рука вперед, корпус за нею
          const a2 = accent(T * 1.8); armB = lerp(armB, 1.55 + 0.12 * a2, e); elbB = lerp(elbB, 0.06, e); sdB += 0.2 * e; armA = lerp(armA, 0.45, e); elbA = lerp(elbA, 1.0, e); leanX += 0.08 * a2 * e; hdX -= 0.12 * a2 * e;
          if (e > 0.5 && this.expr === 'neutral') this.setExpr('angry', 0.8);
        } else if (st === 44) {                                // розмовляє на ходу: передпліччя перед собою, кисть «пояснює», голова киває
          const a2 = accent(T * 1.4), w = Math.sin(T * 5.2), g = this.persona.power;   // хтось ледь ворушить кистю, хтось розмахує
          if (this.persona.talkH) { armB = lerp(armB, 0.6 + 0.18 * a2 * g, e); elbB = lerp(elbB, 1.25 + 0.25 * w * g, e); sdB += 0.12 * e; armA = lerp(armA, 0.2, e); }
          else { armA = lerp(armA, 0.6 + 0.18 * a2 * g, e); elbA = lerp(elbA, 1.25 + 0.25 * w * g, e); sdA += 0.12 * e; armB = lerp(armB, 0.2, e); }
          hdX += (0.04 * w - 0.06) * e; leanY += 0.06 * a2 * g * e * (this.persona.talkH ? -1 : 1);
        } else if (st === 11) {                                // струшує руки, розслабляє
          const sh = Math.sin(T * 23), sh2 = Math.sin(T * 19 + 1); armA = lerp(armA, 0.12 + 0.08 * sh, e); armB = lerp(armB, 0.12 + 0.08 * sh2, e); elbA = lerp(elbA, 0.2, e); elbB = lerp(elbB, 0.2, e);
          sdA += (0.22 + 0.1 * sh2) * e; sdB += (0.22 + 0.1 * sh) * e; hdZ += 0.05 * sh * e; this.breathUp += 0.01 * Math.abs(sh) * e;
        } else if (st === 12) {                                // розминає шию, руки на поясі
          hdX += 0.28 * Math.sin(T * 2.6) * e; hdZ += 0.28 * Math.cos(T * 2.6) * e; armA = lerp(armA, -0.25, e); armB = lerp(armB, -0.25, e); elbA = lerp(elbA, 1.9, e); elbB = lerp(elbB, 1.9, e); spread = lerp(spread, 0.5, e);
        } else if (st === 13) {                                // руки на голові: «ну як так»
          armA = lerp(armA, 2.5, e); armB = lerp(armB, 2.5, e); elbA = lerp(elbA, 2.05, e); elbB = lerp(elbB, 2.05, e); spread = lerp(spread, 0.15, e); hdX -= 0.25 * e; leanX -= 0.05 * e;
        } else if (st === 14) {                                // великий палець угору партнерові
          armB = lerp(armB, 1.25, e); elbB = lerp(elbB, 1.55, e); sdB += 0.25 * e; hdY -= 0.15 * e; if (e > 0.5 && this.expr === 'neutral') this.setExpr('happy', 0.8);
        } else if (st === 15) {                                // обидва вказівні в небо — присвята
          armA = lerp(armA, 2.85, e); armB = lerp(armB, 2.85, e); elbA = lerp(elbA, 0.12, e); elbB = lerp(elbB, 0.12, e); spread = lerp(spread, 0.25, e); hdX -= 0.4 * e;
        } else if (st === 16) {                                // аплодує трибунам над головою
          const c2 = accent(T * 2.1); armA = lerp(armA, 2.35, e); armB = lerp(armB, 2.35, e); elbA = lerp(elbA, 0.55, e); elbB = lerp(elbB, 0.55, e); spread = lerp(spread, 0.03 + 0.3 * (1 - c2), e); hdX -= 0.2 * e;
        } else if (st === 43) {                                // «літак» на бігу: руки розкинуті в боки, корпус закладає віражі
          const bank = Math.sin(T * 1.6);
          armA = lerp(armA, 0.15, e); armB = lerp(armB, 0.15, e); elbA = lerp(elbA, 0.12, e); elbB = lerp(elbB, 0.12, e);
          spread = lerp(spread, 1.45, e); leanZ += 0.32 * bank * e; leanX += 0.08 * e; hdZ -= 0.15 * bank * e;
          if (e > 0.5 && this.expr === 'neutral') this.setExpr('happy', 0.8);
        } else if (st >= 40 && st <= 42) {
          // МАХАННЯ однією (правою) рукою, IK з полюсом ліктя. 40 — привітне: долоня біля голови, передпліччя гойдається
          // від ліктя з боку в бік; 41 — велике: уся рука над головою ходить дугою (до трибун); 42 — коротке, на рівні плеча
          // (партнерові). Рух — маятник: швидко через середину, з паузою в крайніх точках; голова й груди — трохи в бік руки
          const Tw = this.t + (this.emoPh ?? 0), f = st === 41 ? 1.15 : st === 42 ? 2.9 : 2.1, sw = Math.sin(Tw * f * TAU), j = 1 + 0.12 * Math.sin(Tw * 0.9);
          let tx, ty, tz, pole;
          if (st === 41) { const th = 0.42 * sw * j; tx = 0.32 + 0.78 * Math.sin(th + 0.1); ty = 0.24 + 0.78 * Math.cos(th + 0.1); tz = 0.14; pole = WAVE_POLE_UP; }
          else if (st === 42) { tx = 0.44 + 0.08 * sw * j; ty = 0.26 - 0.015 * sw * sw; tz = 0.36; pole = WAVE_POLE_LOW; }
          else { tx = 0.46 + 0.13 * sw * j; ty = 0.62 - 0.04 * sw * sw; tz = 0.16; pole = WAVE_POLE; }
          this.thorax.localToWorld(_ik2.set(tx, ty, tz)); this.reach(1, _ik2.x, _ik2.y, _ik2.z, e, true, true, pole);
          armB = lerp(armB, st === 42 ? 1.2 : 2.3, e); elbB = lerp(elbB, st === 41 ? 0.3 : 1.2, e);   // «заготовка» для переходу
          leanY -= 0.12 * e; hdY -= 0.18 * e; hdZ += 0.05 * sw * e; if (st !== 42) hdX -= 0.1 * e;
          if (e > 0.5 && this.expr === 'neutral') this.setExpr('happy', 0.8);
        } else if (st >= 30 && st <= 35) {
          // ОПЛЕСКИ з дотиком долонь (IK): долоні сходяться в точці перед тілом. Удар — з прискоренням (руки «летять» одна
          // до одної), після — м'який відскок і пауза; кожен удар трохи інший; голова й корпус ледь кивають у такт.
          // 30 — ввічливі на рівні грудей; 31 — над головою, до фанатів; 32 — швидкі енергійні з пружинкою в колінах;
          // 33 — з поворотом корпусу по трибунах; 34 — повільні великі, «з повагою»; 35 — «зібрались!»: кілька різких
          // оплесків і кулак угору
          const V = [[0, 0.04, 0.44, 0.22, 2.8], [0, 0.62, 0.3, 0.3, 2.0], [0, 0.1, 0.44, 0.18, 4.1], [0, 0.16, 0.44, 0.24, 2.6], [0, 0.1, 0.45, 0.42, 1.35], [0, 0.12, 0.44, 0.26, 3.4]][st - 30];   // точка оплесків — попереду, лікті від тіла
          const Tc = this.t + (this.emoPh ?? 0), cyc = 2.3, rally = st === 35 && (Tc % cyc) > 1.05;
          const ph = Tc * V[4] * (0.94 + 0.12 * (this.persona.tempo - 0.82) / 0.4), n = Math.floor(ph), u = ph - n;
          const jit = Math.sin(n * 12.9898 + (this.ph0 ?? 1) * 7.3) * 0.5;                    // кожен удар трохи інший
          const op = V[3] * (1 + 0.18 * jit);
          // розкриття долонь у фазі удару: після контакту швидко розходяться й гальмують, перед наступним — розгін назустріч
          const sep = u < 0.35 ? op * smooth(u / 0.35) : op * (1 - Math.pow((u - 0.35) / 0.65, 2.2));
          const hit = Math.max(0, 1 - u / 0.12) + Math.max(0, (u - 0.9) / 0.1);                   // мить удару — для кивка
          let cx = V[0], cy = V[1] + 0.02 * jit, cz = V[2];
          if (st === 33) { const sw = Math.sin(Tc * 0.7); leanY += 0.45 * sw * e; hdY += 0.3 * sw * e; }                     // оглядає трибуни
          if (st === 32) this.gCrouch = 0.12 * e * Math.abs(Math.sin(Math.PI * u));                                        // пружинить у колінах
          if (st === 31) { hdX -= 0.25 * e; leanX -= 0.06 * e; }
          if (rally) {                                                                                                      // кулак угору
            const f = smooth(clamp(((Tc % cyc) - 1.05) / 0.25, 0, 1));
            armB = lerp(armB, 2.55, e * f); elbB = lerp(elbB, 1.5, e * f); armA = lerp(armA, 0.2, e * f); hdX -= 0.2 * e * f;
            if (f > 0.5 && this.expr === 'neutral') this.setExpr('angry', 0.6);
          } else {
            // заготовка кутів (лікті вниз-убік, як у людини, що плеще), точне місце долонь — IK
            armA = lerp(armA, st === 31 ? 2.3 : 1.05, e); armB = lerp(armB, st === 31 ? 2.3 : 1.05, e); elbA = lerp(elbA, st === 31 ? 0.9 : 1.3, e); elbB = lerp(elbB, st === 31 ? 0.9 : 1.3, e);
            const half = 0.028 + sep / 2;
            const pole = st === 31 ? CLAP_POLE_UP : CLAP_POLE;                                  // лікті вниз-назовні (над головою — у боки)
            this.thorax.localToWorld(_ik2.set(cx - half, cy, cz)); this.reach(0, _ik2.x, _ik2.y, _ik2.z, e, true, true, pole);
            this.thorax.localToWorld(_ik2.set(cx + half, cy, cz)); this.reach(1, _ik2.x, _ik2.y, _ik2.z, e, true, true, pole);
            hdX += 0.035 * hit * e; leanX += 0.025 * hit * e;
          }
        } else if (st === 17) {                                // цілує емблему, потім рука вгору до фанатів
          const up = smooth(clamp((mk - 0.45) / 0.25, 0, 1)); armB = lerp(armB, lerp(1.15, 2.7, up), e); elbB = lerp(elbB, lerp(2.35, 0.25, up), e); sdB = lerp(sdB, lerp(-0.4, 0.15, up), e); hdX += lerp(0.45, -0.3, up) * e;
        } else { const c2 = accent(T * 1.6); armA = lerp(armA, 1.2, e); armB = lerp(armB, 1.2, e); elbA = lerp(elbA, 1.1, e); elbB = lerp(elbB, 1.1, e); spread = lerp(spread, 0.02 + 0.26 * (1 - c2), e); hdX -= 0.1 * e; }   // аплодує вболівальникам
        break;
      }
      case 'sad': {
        // смуток наростає поступово (~0.8 с), а не вмикається; ноги — справжня хода (гравець ще йде, гальмує, плететься),
        // поверх неї опускаються плечі й голова, руки повисають або йдуть на голову
        const st = this.style, e = smooth(clamp((md - this.modeT) / 0.8, 0, 1));
        let tl = 0.3, ta = 1.9, te = 1.2, ts = spread, ty = 0;
        let hd = 0.35;                                                      // голова: униз (сум) або вгору («за що?!»)
        if (speed > 0.5) { tl = 0.3; ta = 0.15; te = 0.35; }                // іде, опустивши голову, руки звисають
        else if (st === 4) { tl = 0.85; ta = 1.0; te = 0.35; ts = 0.18; if (!G) { legA = legB = 0.55; kneeA = kneeB = 0.85; drop = 0.1; } }   // руки на колінах, важко дихає
        else if (st === 5) { tl = -0.08; ta = -0.15; te = 1.9; ts = 0.6; hd = -0.4; }                                                       // руки в боки, погляд у небо
        else if (st === 6) { tl = 0.4; ta = 1.85; te = 2.45; ts = 0.04; hd = 0.45; }                                                        // обличчя в долонях
        else if (st === 7) { tl = 0.45; ta = 2.4; te = 2.2; ts = 0.15; if (!G) { legA = legB = 1.35; kneeA = kneeB = 2.1; drop = 0.42; } }  // присів, руки на голові
        else if (st === 8) { tl = 0.05 + 0.08 * Math.sin(this.t * 3); ta = 0.95; te = 0.65; ts = 1.1; hd = -0.2; }                          // руки розвів: «як так?!»
        else if (st === 0) { tl = 0.3; ta = 2.5; te = 2.0; ts = 0.15; }       // руки на голові
        else if (st === 1) { tl = 0.85; ta = 0.55; te = 0.2; ts = 0.12; if (!G) { legA = 0.1; legB = -0.1; kneeA = kneeB = 0.3; drop = 0.05; } }
        else if (st === 2) { tl = 0.4; ta = 0.2; te = elbA; if (!G) { const k = clamp((mk - 0.2) / 0.3, 0, 1); legB = Math.sin(k * Math.PI) * 1.2; kneeB = 0.4 + 0.7 * Math.sin(k * Math.PI); } }
        else { tl = 0.35; ta = 0.3; te = elbA; ty = Math.sin(mk * 18) * 0.28 * (1 - mk); }
        leanX = lerp(leanX, tl, e); armA = lerp(armA, ta, e); armB = lerp(armB, ta, e); elbA = lerp(elbA, te, e); elbB = lerp(elbB, te, e); spread = lerp(spread, ts, e); leanY += ty * e;
        hdX += hd * e;
        if (!G) bob = -0.05 * e;
        break;
      }
      case 'gkwait': {                                           // стійка на пенальті: ноги — хода (приставний крок), решта — воротарська
        const w = Math.sin(this.t * 5.5); const hop = this.splitT > 0 ? Math.sin(clamp(1 - this.splitT / 0.18, 0, 1) * Math.PI) * 0.22 : 0; if (this.splitT > 0) this.splitT -= dt;
        // час від часу «робить себе більшим»: руки широко вгору-в боки, як справжній воротар перед ударом
        const big = Math.pow(Math.max(0, Math.sin(this.t * 0.8 + (this.ph0 ??= Math.random() * 20))), 6);
        lift = hop; armA = armB = 0.35 + 0.9 * big; elbA = elbB = 0.8 - 0.5 * big; spread = 0.95 + w * 0.05 + 0.5 * big; leanX = Math.max(leanX, 0.28 - 0.12 * big); leanZ += w * 0.04;
        if (!G) { legA = 0.18; legB = -0.1; kneeA = kneeB = 0.38 + Math.abs(w) * 0.08; drop = 0.1; bob = Math.abs(w) * 0.025; }
        break;
      }
      case 'catch': {                                            // «віконце»: руки назустріч, після контакту м'яч притягується до грудей
        const meet = smooth(clamp(mk / 0.3, 0, 1)), hug = smooth(clamp((mk - 0.35) / 0.3, 0, 1)), rel = smooth(clamp((mk - 0.85) / 0.15, 0, 1));
        armA = armB = (1.45 * meet - 0.35 * hug) * (1 - rel) - 0.12 * rel; elbA = elbB = (0.5 + 1.2 * hug) * (1 - rel) + 0.5 * rel; spread = 0.12;
        leanX = 0.12 * meet + 0.18 * hug * (1 - rel); legA = 0.25 * hug; legB = -0.1 * hug; kneeA = kneeB = 0.15 + 0.25 * meet * (1 - rel);
        drop = 0.04 * meet * (1 - rel); break;
      }
      case 'scoop': {                                            // низький м'яч: присід із нахилом, долоні під м'ячем, потім до грудей і випрямитись
        const down = smooth(clamp(mk / 0.3, 0, 1)), up = smooth(clamp((mk - 0.5) / 0.4, 0, 1)), k = down * (1 - up);
        // техніка: ноги разом і напівзігнуті, глибокий нахил у кульшових, прямі руки до трави, долоні позаду м'яча
        legA = legB = 1.1 * k + 0.1 * up; kneeA = kneeB = 1.7 * k + 0.12; ankOwn = true; ankA = legA - kneeA; ankB = legB - kneeB;
        drop = HIP - (YA + THIGH * Math.cos(legA) + SHIN * Math.cos(legA - kneeA));
        leanX = 1.15 * k + 0.12 * up; spread = 0.08;
        armA = armB = 0.55 * k + 0.95 * up; elbA = elbB = 0.15 * k + 1.85 * up;
        break;
      }
      case 'control': case 'thigh': {
        // нога, що приймає (n), і опорна (f); руки розведені для рівноваги — ближня до ноги рука трохи вперед, друга вбік-назад
        const up = smooth(clamp(mk / 0.35, 0, 1)), dn = smooth(clamp((mk - 0.4) / 0.6, 0, 1)), act = up * (1 - dn);
        let ln, kn, lf = -0.12 * act, kf = 0.3 * act;
        if (this.mode === 'thigh') { ln = 1.45 * up - 0.75 * dn * up; kn = 1.6 * up - 0.6 * dn * up; leanX = -0.12 * act; lift = 0.04 * act; }   // стегно вгору, далі опускає з м'ячем
        else if (this.style === 0) { ln = 0.7 * act; kn = 0.55 * act; leanX = 0.08 * act; drop = 0.03 * act; }                                      // підошвою на м'яч
        else { ln = 0.85 * up - 0.55 * dn * up; kn = 0.7 * up + 0.3 * dn * up; leanX = -0.05 * act; drop = 0.04 * act; }                          // внутрішньою стороною, відводячи стопу
        if (this.recvSide) { legB = ln; kneeB = kn; legA = lf; kneeA = kf; armA = 0.55 * act; armB = 0.25 * act; sdB += 0.35 * act; }
        else { legA = ln; kneeA = kn; legB = lf; kneeB = kf; armB = 0.55 * act; armA = 0.25 * act; sdA += 0.35 * act; }
        spread = 0.5 * act; elbA = elbB = 0.5 + 0.2 * act;
        break;
      }
      case 'chest': {
        // груди: назустріч м'ячу прогин назад (гасить), руки широко в боки й трохи вгору; далі корпус уперед — м'яч падає до ніг
        const up = smooth(clamp(mk / 0.4, 0, 1)), fw = smooth(clamp((mk - 0.45) / 0.4, 0, 1));
        leanX = -0.45 * up * (1 - fw) + 0.15 * fw * (1 - smooth(clamp((mk - 0.85) / 0.15, 0, 1)));
        armA = armB = 0.95 * up * (1 - 0.6 * fw); elbA = elbB = 0.7 * up; spread = 0.85 * up * (1 - 0.5 * fw);
        legA = 0.18 * up; legB = -0.25 * up; kneeA = 0.15 * up; kneeB = 0.45 * up; lift = 0.1 * up * (1 - fw);
        break;
      }
      case 'header': {
        const J = jumpPhase(mk, 0.22, 0.72);
        lift = 0.62 * J.h;
        legA = legB = 0.55 * J.load + 0.25 * J.tuck + 0.45 * J.absorb; kneeA = kneeB = 0.95 * J.load + 0.5 * J.tuck + 0.8 * J.absorb; drop = THIGH * (1 - Math.cos(legA)) * (1 - J.air);
        // у польоті прогин назад (замах тулубом), удар — різкий кивок уперед на вершині, після — повертається
        const hit = smooth(clamp((J.u - 0.45) / 0.15, 0, 1)) * (1 - smooth(clamp((mk - 0.8) / 0.2, 0, 1)));
        leanX = 0.2 * J.load - 0.4 * J.air * (1 - hit) + 0.45 * hit + 0.15 * J.absorb;
        armA = armB = -0.5 * J.load + 1.15 * J.air + 0.3 * J.absorb; elbA = elbB = 0.4 + 0.5 * J.air; spread = 0.25 + 0.5 * J.air;
        break;
      }
      case 'block': { legB = 1.35 * sn; kneeB = 0.5 * sn; legA = -0.15 * sn; leanX = 0.25 * sn; armA = armB = 0.9 * sn; elbA = elbB = 0.7 * sn; spread = 0.5 * sn; break; }
      case 'hit': { leanX = -0.45 * sn; armA = armB = 1.0 * sn; elbA = elbB = 0.7 * sn; spread = 0.4 * sn; lift = 0.05 * sn; break; }
      case 'stagger': {
        const g = this.stag; if (!g) break;
        const fx = Math.sin(this.bodyYaw), fz = Math.cos(this.bodyYaw), sp = Math.hypot(g.vx, g.vz) || 1e-6;
        const f = (g.vx * fx + g.vz * fz) / sp, sd = (g.vx * fz - g.vz * fx) / sp, a = Math.min(1, sp / 1.6) * (1 - smooth(clamp((mk - 0.55) / 0.45, 0, 1)));
        const w = this.t * 12 + g.ph;
        // ноги веде хода (G): поштовх несе тіло, регулятор рівноваги ставить швидкі компенсаторні кроки туди, куди
        // тікає центр мас (назад — дрібним заднім ходом, убік — приставним), стопи стоять на траві, не ковзають.
        // Поверх — лише верх тіла: корпус відкинутий у бік поштовху, тулуб — проти (ловить рівновагу), руки розкинуті й гребуть
        tiltX += 0.3 * f * a; tiltZ += -0.28 * sd * a; leanX += -0.18 * f * a; leanZ += 0.2 * sd * a;
        spread = Math.max(spread, 0.95 * a); armA = lerp(armA, 0.4 + 0.9 * Math.sin(w), a); armB = lerp(armB, 0.4 - 0.9 * Math.sin(w + 0.8), a); elbA = lerp(elbA, 0.5, a); elbB = lerp(elbB, 0.5, a);
        if (!G) { legA = 0.3 * Math.sin(w) * a; legB = -legA; kneeA = kneeB = 0.25 + 0.25 * a; drop = 0.05 * a; }
        break;
      }
      case 'tackle': {
        // випад: опорна нога глибоко підгинається, корпус опускається й лягає трохи назад (противага), ударна нога спершу
        // підтягується, потім викидається вперед низько над травою майже прямою — стопою до м'яча; руки розкинуті для рівноваги.
        // Після контакту — повернення в стійку. Тіло вперед несе сам випад (match.js), тож тут без зсуву
        const c = this.tkC ?? 0.4, load = smooth(clamp(mk / (c * 0.45), 0, 1)), strike = smooth(clamp((mk - c * 0.35) / (c * 0.65), 0, 1));
        if (!this.tkHit && mk >= c) { this.tkHit = true; const m = this.persona.power; this.hit(1.1 * m, -2.2 * m, (this.tkSide ? -0.8 : 0.8) * m, 2.5 * m, 2.5 * m, 1.4 * m); }   // нога вдарилась у м'яч
        const rec = smooth(clamp((mk - c) / (1 - c), 0, 1)), on = load * (1 - rec), hit = strike * (1 - rec);
        const kick = -0.35 * on * (1 - strike) + 1.15 * hit, kKnee = 0.35 + 0.6 * on * (1 - strike) - 0.25 * hit, sup = -0.25 * hit, sKnee = 0.35 * on + 0.75 * hit;
        if (this.tkSide) { legA = kick; kneeA = kKnee; legB = sup; kneeB = sKnee; armA = -0.45 * hit; armB = 0.7 * hit; }
        else { legB = kick; kneeB = kKnee; legA = sup; kneeA = sKnee; armB = -0.45 * hit; armA = 0.7 * hit; }
        tiltX = -0.22 * hit; leanX = 0.25 * on - 0.1 * hit; spread = 0.25 + 0.45 * on; elbA = elbB = 0.5; drop = 0.1 * on + 0.06 * hit;
        break;
      }
      case 'slide': {
        const down = mk < 0.18 ? easeOut(mk / 0.18) : 1;
        if (mk < 0.52) { tiltX = -1.32 * down; legA = 0.1 * down; legB = -0.1 * down; kneeA = 0.15; kneeB = 0.5 * down; armA = armB = -0.8 * down; elbA = elbB = 0.3; spread = 0.55 * down; leanX = -0.1 * down; }
        else { this.rise((mk - 0.52) / 0.48, -1.32, 0); tiltX = r.tx; leanX = r.leanX; legA = r.legs; legB = r.legs * 0.7; kneeA = r.legs * 1.15; kneeB = r.legs * 0.9; armA = armB = r.arms; spread = r.spread; drop = r.drop; }
        break;
      }
      case 'stumble': {
        // під час ragdoll ця поза прихована фізикою, але пружини вже лежать так само, як тіло (на животі чи на спині) — підйом без перевороту
        const T0 = this.riseT0 ?? -1.05;
        if (this.rag) {
          // рятується: руки назустріч землі в бік падіння (вперед — перед собою, назад — за спину, вбік — та рука вбік),
          // лікті м'які, коліна підігнуті, спина трохи згорнута, підборіддя притиснуте — голова не б'ється об газон
          tiltX = T0;
          const fl = this.rag.fall, fx = Math.sin(this.bodyYaw), fz = Math.cos(this.bodyYaw);
          const fw = fl.x * fx + fl.z * fz, sd = fl.x * fz - fl.z * fx, f = Math.max(0, fw), b = Math.max(0, -fw);
          armA = armB = 1.35 * f - 0.75 * b + 0.5 * Math.abs(sd); elbA = elbB = 0.35 + 0.25 * b;
          spread = 0.2 + 0.45 * b; if (sd > 0) sdB = 0.9 * sd; else sdA = -0.9 * sd;
          // перші ~0.3 с ноги підломлюються (тіло осідає, а не падає «колодою»), далі коліна м'яко зігнуті; спина згорнута,
          // підборіддя до грудей — і вперед, і назад людина падає «калачиком», перекочуючись, а не плиткою
          const bk = this.rag.landT < 0 ? 1 - smooth(clamp((this.rag.t - 0.3) / 0.3, 0, 1)) : 0;
          legA = 0.35 + 0.45 * bk; legB = 0.3 + 0.35 * bk; kneeA = 0.6 + 0.7 * bk; kneeB = 0.55 + 0.55 * bk;
          leanX = 0.35 + 0.15 * b;
        }
        else if (mk < 0.18) { const q = easeOut(mk / 0.18); tiltX = -1.05 * q; armA = armB = 1.9 * q; elbA = elbB = 0.4; spread = 0.7 * q; legA = 0.3 * q; kneeA = 0.4 * q; lift = 0.18 * Math.sin(q * Math.PI); }
        else if (mk < 0.42) { tiltX = -1.05; armA = armB = 0.6; spread = 0.4; leanX = 0.05; kneeA = kneeB = 0.5; }
        else { this.rise((mk - 0.42) / 0.58, this.riseT0 ?? -1.05, 0); tiltX = r.tx; leanX = r.leanX; legA = r.legs; legB = r.legs * 0.8; kneeA = r.legs * 1.15; kneeB = r.legs * 0.95; armA = armB = r.arms; spread = r.spread; drop = r.drop; }
        break;
      }
      case 'rest': {
        // спершу сідає (присід → таз на траву, коліна вгору), лежачи — далі відкидається на спину; дихає важко, грудьми
        // кожен у своєму темпі: хтось падає на газон без сил, хтось сідає повільно; дихання спершу глибоке й часте, далі вгамовується
        const PS = this.persona, tp = PS.tempo * this.vary, u = (md - this.modeT) * tp, st = this.style;
        const sit = smooth(clamp(u / 1.1, 0, 1)), lie = st >= 2 ? smooth(clamp((u - 1.0) / 1.2, 0, 1)) : 0;
        const calm = Math.exp(-u / 7), br = Math.sin(this.t * PS.breath * (1 + 0.6 * calm) + (this.ph0 ??= Math.random() * 20)) * PS.heave * (0.5 + calm);
        if (this.restHit === 0 && u > 0.95) { this.restHit = 1; this.hit(-0.7, 1.6, 0, -1.5, -1.5, 2.4 * PS.power); }                     // сів — таз ударився об траву, тіло осідає
        if (st >= 2 && this.restHit === 1 && u > 2.15) { this.restHit = 2; this.hit(0, 2.8, 0.3 * (Math.random() - 0.5), -3, -3, 0.9); }   // ліг — спина й голова на газон, руки відскакують
        legA = legB = 2.2 * sit; kneeA = kneeB = 0.06 + 2.04 * sit; drop = (HIP - 0.27) * sit * (1 - lie);
        if (st === 0) { leanX = 0.32 * sit + 0.03 * br; armA = armB = 0.95 * sit; elbA = elbB = 0.55; spread = 0.12; hdX = 0.3 * sit; }
        else if (st === 1) { leanX = -0.45 * sit + 0.03 * br; armA = armB = -0.75 * sit; elbA = elbB = 0.08; spread = 0.3 * sit; hdX = -0.2 * sit; legB = 1.75 * sit; kneeB = 0.06 + 1.3 * sit; }
        else {
          tiltX = -1.5 * lie; leanX = 0.25 * sit * (1 - lie) + 0.03 * br * lie;
          legA = lerp(legA, 0.55, lie); kneeA = lerp(kneeA, 1.1, lie); legB = lerp(legB, 0.05, lie); kneeB = lerp(kneeB, 0.1, lie);   // одне коліно зігнуте
          if (st === 2) { armA = armB = lerp(0.9 * sit, 2.7, lie); elbA = elbB = lerp(0.55, 2.0, lie); spread = 0.35 * lie; }     // руки під голову
          else { armA = armB = lerp(0.9 * sit, 0.3, lie); elbA = elbB = 0.3; spread = lerp(0.12, 1.35, lie); }                    // руки розкинуті
        }
        spread += 0.04 * br * sit; bob = 0;                                  // плечі ходять у такт диханню
        break;
      }
      case 'kneel': {
        const e = easeOut(Math.min(1, mk * 2.4)), up = mk > 0.8 ? (mk - 0.8) / 0.2 : 0, k = e * (1 - up);
        slide = this.kSlide = 2.4 * e; tiltX = -0.32 * k; legA = legB = 0.05 * k; kneeA = kneeB = 1.6 * k + 0.06; drop = THIGH * k; leanX = -0.3 * k; armA = armB = 2.6 * k + 0.4 * up; spread = 0.5;
        break;
      }
      case 'pkick': {
        const P = this.kickP || 0, sm = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
        const plant = sm(P / 0.14), back = sm(P / 0.3), strike = sm((P - 0.28) / 0.09), follow = sm((P - 0.4) / 0.5), land = sm((P - 0.62) / 0.3);
        // б'ючa нога: замах назад зі зігнутим коліном → розпрямлення в контакті → висока проводка
        legB = -1.25 * back * (1 - strike) + 2.25 * strike * (1 - 0.45 * follow) * (1 - 0.7 * land);
        kneeB = 1.65 * back * (1 - strike) + 0.1 * strike + 0.7 * follow * (1 - land);
        // опорна нога: корок у крапку, коліно амортизує, у контакті відштовхується на носок
        legA = 0.1 + 0.18 * plant - 0.1 * strike; kneeA = 0.15 + 0.5 * plant * (1 - 0.7 * strike) + 0.3 * follow * (1 - land);
        // корпус: нахил над м'ячем, у контакті вперед, скрут тулуба для сили
        leanX = -0.28 * back * (1 - strike) + 0.6 * strike * (1 - 0.55 * follow) * (1 - 0.6 * land);
        leanY = 0.34 * strike * (1 - 0.5 * follow) - 0.18 * back * (1 - strike);
        leanZ = -0.06 * back + 0.05 * strike;
        // руки: різко розкинуті для балансу
        armA = -0.6 * back + 1.15 * strike - 0.3 * follow; armB = 0.85 * back - 0.95 * strike + 0.2 * follow;
        elbA = 0.55; elbB = 0.45; spread = 0.5 + 0.32 * strike - 0.15 * land;
        lift = 0.3 * Math.sin(clamp((P - 0.3) / 0.38, 0, 1) * Math.PI);        // легкий стрибок на проводці
        drop = 0.06 * plant * (1 - strike);
        break;
      }
      case 'gkdive': this.diveP = mk < 0.6 ? mk / 0.6 : 1 + ((mk - 0.6) / 0.4) * 0.5;   // у матчі воротар стрибає тією ж детальною позою (~0.85 с від присіду до трави)
      // fallthrough
      case 'pdive': {
        // якщо тіло лягло пізніше, ніж за анімацією (фізика), підйом починається з цієї миті й встигає до кінця стрибка
        const P0 = this.diveP || 0, Ps = this.diveRise;
        let P = P0;
        if (this.rag && this.rag.dive && this.ragDone < 0) P = Math.min(P0, 1);                     // ще летить або ковзає — поза не встає
        else if (Ps !== undefined && Ps > 1) P = P0 > Ps ? 1 + (P0 - Ps) / Math.max(0.05, 1.5 - Ps) * 0.5 : 1;
        const sg = (Math.sign(Math.sin(this.bodyYaw)) || 1) * this.diveDir, low = this.diveKind === 2;
        const sm = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
        const K = diveKin(P, this.diveKind);
        if (P < 1) {
          const load = sm(P / 0.12) * (1 - sm((P - 0.12) / 0.14));           // присід: вага переходить на ногу з боку стрибка
          const push = sm((P - 0.12) / 0.16);                                  // головне відштовхування — ближньою до м'яча ногою
          const drive = sm((P - 0.12) / 0.12);                                 // дальня нога: мах коліном угору
          const fly = sm((P - 0.3) / 0.12), land = sm((P - K.landAt) / 0.18), tk = fly * (1 - land);
          // низом: ближня нога підломлюється (коліно до трави), тіло падає вбік, а не злітає
          const buckle = low ? sm((P - 0.1) / 0.16) * (1 - land) : 0;
          // ближня до м'яча нога — та, що на боці стрибка (sg > 0 — убік −x, ліва)
          const nearA = sg > 0;
          // ближня нога: глибокий присід із кроком убік (на ній уся вага), потім вибухове розгинання до кінчиків пальців;
          // у польоті тягнеться за тілом
          const ln = 0.8 * load * (1 - push) - 0.22 * push * (1 - fly) + 0.25 * tk + 0.2 * land + 0.35 * buckle;
          const kn = 1.35 * load * (1 - push) + 0.06 + 0.35 * tk + 0.45 * land + 0.9 * buckle;
          // дальня нога: ширше й пряміше (ваги на ній менше), на відштовхуванні коліно махом іде вгору — дає висоту й оберт
          const lf = 0.35 * load + 0.9 * drive * (1 - 0.5 * fly) * (1 - land) + 0.25 * land;
          const kf = 0.5 * load + 1.1 * drive * (1 - 0.4 * fly) * (1 - land) + 0.5 * land;
          // розведення: ближня робить крок до м'яча, дальня стоїть широко — тому обидві стопи на траві при різному згині колін
          const abN = 0.22 * load + 0.12 * tk, abF = 0.55 * load * (1 - drive) + 0.1 * tk;
          if (nearA) { legA = ln; kneeA = kn; legB = lf; kneeB = kf; abdSA = -abN; abdSB = abF; }
          else { legA = lf; kneeA = kf; legB = ln; kneeB = kn; abdSA = -abF; abdSB = abN; }
          // стопи: на присіді пласко, на відштовхуванні ближня розгинається до носка, у польоті обидві витягнуті
          const ankNear = 0.6 * sm((P - 0.2) / 0.1) * (1 - land), ankFar = 0.3 * drive * (1 - land);
          ankA = legA - kneeA + (nearA ? ankNear : ankFar); ankB = legB - kneeB + (nearA ? ankFar : ankNear); ankOwn = true;
          drop = THIGH * (1 - Math.cos(1.1 * load));                         // глибший присід — сильніше відштовхування
          // тіло: оберт убік за кінематикою, бічний вигин тулуба до м'яча в польоті, на приземленні — згрупувався
          tiltZ = sg * Math.max(K.roll, 0.5 * push * (1 - land));                   // на відштовхуванні тіло вже нахилене в бік стрибка (~30°)
          leanX = 0.3 * load - 0.12 * fly * (1 - land) + 0.28 * land;
          leanZ = sg * (0.12 * load + (low ? 0.08 : 0.16) * fly * (1 - land));
          lift = K.lift + 0.1 * land;                                         // лежачи на боці таз і плече над газоном
          // руки: на присіді вниз-назад (замах), на відштовхуванні махом угору до м'яча — верхня (дальня) рука вища,
          // у польоті витягнуті, на приземленні притискають м'яч до грудей
          const up = sm((P - 0.13) / 0.2);
          // на приземленні нижня рука лишається витягнутою вздовж газону за головою, верхня накриває м'яч
          // верхня рука після приземлення лишається над головою поруч із нижньою (накриває м'яч зверху), а не складається поперек
          // тіла — інакше вона лягала на нижню руку й тулуб і проходила крізь них
          const armFar = -0.35 * load + 3.05 * up * (1 - 0.3 * land), armNear = -0.3 * load + 2.7 * up + 0.2 * land;
          if (nearA) { armA = armNear; armB = armFar; } else { armA = armFar; armB = armNear; }
          const elbFar = 0.5 * load + 0.08 * up + 0.65 * land, elbNear = 0.5 * load + 0.08 * up + 0.25 * land;
          if (nearA) { elbA = elbNear; elbB = elbFar; } else { elbA = elbFar; elbB = elbNear; }
          spread = 0.12 + 0.12 * up - 0.12 * load + 0.1 * land;
          // нижня рука, коли тіло вже на боці, лягає вздовж газону над головою, а не впирається в нього відведенням
          const tuck = -(spread + 0.22) * sm(K.roll / 1.2);
          if (nearA) { sdA = tuck; sdB = 0.3 * land; } else { sdB = tuck; sdA = 0.3 * land; }   // верхня — трохи вгору, над нижньою
          hdZ = -sg * K.roll * 0.25;                                           // голова стежить за м'ячем, не за газоном
        } else {
          this.rise(clamp((P - 1) / 0.5, 0, 1), 0, sg * K.maxRoll); tiltZ = r.tz; leanX = r.leanX; legA = r.legs; legB = r.legs * 0.8; kneeA = r.legs * 1.15; kneeB = r.legs * 0.95; armA = armB = r.arms; spread = r.spread; drop = r.drop;
          const tuck = -(spread + 0.22) * sm(Math.abs(r.tz) / 1.2);               // нижня рука й далі не вгрузає в газон, поки лежить на боці
          lift = 0.1 * (1 - sm((P - 1) / 0.15));
          ankA = legA - kneeA; ankB = legB - kneeB; ankOwn = true;                              // підводиться на пласких стопах, носки не встромляються в траву
          if (sg > 0) { sdA = tuck; armA = Math.max(armA, 2.4 * sm(Math.abs(r.tz) / 1.2)); } else { sdB = tuck; armB = Math.max(armB, 2.4 * sm(Math.abs(r.tz) / 1.2)); }
        }
        break;
      }
      case 'gkjump': {
        // присід → вибух угору (коліна-ривок, руки махом угору) → у повітрі одне коліно піднято (захист і висота) → м'яке
        // приземлення на обидві ноги
        const J = jumpPhase(mk, 0.2, 0.75);
        lift = 0.9 * J.h;
        legA = 0.7 * J.load + 0.9 * J.tuck + 0.45 * J.absorb; legB = 0.7 * J.load + 0.15 * J.tuck + 0.45 * J.absorb;
        kneeA = 0.95 * J.load + 1.3 * J.tuck + 0.8 * J.absorb; kneeB = 0.95 * J.load + 0.3 * J.tuck + 0.8 * J.absorb;
        drop = THIGH * (1 - Math.cos(0.7 * J.load + 0.45 * J.absorb));
        armA = armB = -0.6 * J.load + 3.0 * J.air + 0.4 * J.absorb; elbA = elbB = 0.15 + 0.4 * J.load; spread = 0.25 + 0.15 * J.air; leanX = 0.25 * J.load - 0.1 * J.air + 0.15 * J.absorb;
        break;
      }
      case 'parry': {                                            // відбивання стоячи: випад до м'яча, ближня рука б'є (її веде IK), друга — для рівноваги
        const ps = this.parrySide || 0, nearA = ps < 0;           // м'яч з боку −x — ліва рука (A)
        const hi = 1.7 * sn, lo = 0.45 * sn;
        armA = ps === 0 || nearA ? hi : lo; armB = ps === 0 || !nearA ? hi : lo; elbA = elbB = 0.5; spread = 0.12;
        leanX = 0.1 * sn; leanZ = -ps * 0.22 * sn; lift = 0.08 * sn;
        if (nearA) { legA = 0.35 * sn; kneeA = 0.4 * sn; kneeB = 0.25 * sn; } else { legB = 0.35 * sn; kneeB = 0.4 * sn; kneeA = 0.25 * sn; }
        break;
      }
      case 'throw': {
        const e = easeOut(mk);
        armA = armB = mk < 0.35 ? 2.9 : 2.9 - 3.4 * easeOut((mk - 0.35) / 0.65); elbA = elbB = mk < 0.35 ? 1.7 : 0.2; leanX = mk < 0.35 ? -0.25 : 0.3 * e; spread = 0.15; legA = 0.3 * e; legB = -0.2 * e;
        break;
      }
      default: break;
    }

    // відштовхує рукою найближчого: ближня до нього рука витягується назустріч (на висоту його грудей), лікоть майже прямий;
    // далеко — рука плавно повертається до бігу. Плавність — від пружин суглобів нижче
    this.fendS = (this.fendS || 0) + ((this.fendW || 0) - (this.fendS || 0)) * Math.min(1, dt * 8);
    if (this.fendS > 0.01 && (this.mode === 'idle' || this.mode === 'aim') && !this.kicking && !this.look.gk) {
      const rel = angDiff(this.bodyYaw, this.fendYaw ?? this.bodyYaw), f = this.fendS, fw = Math.cos(rel), sd = Math.sin(rel);
      if (fw > -0.3) {                                        // позаду — не дотягнутись
        const a = 1.25 * Math.max(0.35, fw), ab = 0.9 * Math.abs(sd), kk = f * smooth(clamp((fw + 0.3) / 0.5, 0, 1));
        if (sd >= 0) { armB = lerp(armB, a, kk); elbB = lerp(elbB, 0.35, kk); sdB += ab * kk; }
        else { armA = lerp(armA, a, kk); elbA = lerp(elbA, 0.35, kk); sdA += ab * kk; }
        leanZ -= 0.08 * Math.sign(sd) * kk;                   // корпус ледь притискається плечем до суперника
      }
    }
    // плече в плече: тіло не відскакує, а впирається — увесь корпус кренится до суперника (тисне вагою), тулуб — ще трохи,
    // вільна рука відходить убік для рівноваги. Наростає й спадає пружно (~0.1 с), без ривка
    this.jsS = (this.jsS || 0) + ((this.jsIn || 0) - (this.jsS || 0)) * Math.min(1, dt * ((this.jsIn || 0) > (this.jsS || 0) ? 14 : 6));
    this.jsIn = 0;
    if (this.jsS > 0.01 && G) {
      const c = this.jsS, rel = angDiff(this.bodyYaw, this.jsYaw ?? this.bodyYaw), sd = Math.sin(rel), fw = Math.cos(rel);
      tiltZ -= 0.1 * sd * c; leanZ -= 0.16 * sd * c; leanX += 0.08 * Math.max(0, fw) * c;
      if (sd >= 0) { sdA += 0.55 * c; elbA = lerp(elbA, 0.6, c); } else { sdB += 0.55 * c; elbB = lerp(elbB, 0.6, c); }
    }
    // радість: емоція не вмикається й не вимикається миттєво — входить за ~0.35 с (з присіду, з бігу) і згасає за ~0.4 с
    if (this.mode === 'cheer' && !this.rag) {
      const e = smooth(clamp((md - this.modeT) / 0.35, 0, 1)) * smooth(clamp(this.modeT / 0.4, 0, 1));
      if (e < 1) {
        legA *= e; legB *= e; kneeA = lerp(0.06, kneeA, e); kneeB = lerp(0.06, kneeB, e); armA *= e; armB *= e; elbA = lerp(0.3, elbA, e); elbB = lerp(0.3, elbB, e);
        lift *= e; leanX *= e; leanZ *= e; leanY *= e; spread *= e; bob *= e; drop *= e; sdA *= e; sdB *= e; hdX *= e; hdY *= e; hdZ *= e;
      }
    }
    // старт емоції з імпульсом, а не плавним «вмиканням»: радість — коротко збирається (присід, руки до себе) і вибухає
    // вгору (руки ривком, підскок, голова вгору); сум — тіло на мить «осідає» (плечі, голова, коліна), а тоді вже поза
    if (!this.rag && (this.mode === 'cheer' || this.mode === 'sad')) {
      const el = md - this.modeT;
      if (this.mode === 'cheer' && el < 0.5) {
        const dip = el < 0.13 ? Math.sin((Math.PI / 2) * el / 0.13) : Math.max(0, 1 - (el - 0.13) / 0.1), pop = el > 0.11 && el < 0.5 ? Math.sin(Math.PI * (el - 0.11) / 0.39) : 0;
        if (!G) { kneeA += 0.45 * dip; kneeB += 0.45 * dip; legA += 0.2 * dip; legB += 0.2 * dip; drop += 0.07 * dip; lift += 0.16 * pop * (this.amp ?? 1); }
        leanX += 0.18 * dip - 0.14 * pop; armA += 0.7 * pop - 0.3 * dip; armB += 0.7 * pop - 0.3 * dip; hdX -= 0.3 * pop;
      } else if (this.mode === 'sad' && el < 0.45) {
        const sl = Math.sin(Math.PI * Math.min(1, el / 0.45));
        hdX += 0.3 * sl; leanX += 0.14 * sl; armA -= 0.15 * sl; armB -= 0.15 * sl; if (!G) { kneeA += 0.15 * sl; kneeB += 0.15 * sl; drop += 0.03 * sl; }
      }
    }
    // кожне виконання скриптової дії трохи інше: амплітуда рук і корпусу ±10%
    if (!G && this.mode !== 'idle' && this.vary) { armA *= this.vary; armB *= this.vary; leanX *= this.vary; }

    // під тиском суперника — укривання м'яча корпусом: таз розвернутий боком-спиною до суперника (див. shY вище), коліна
    // зігнуті (присід — у ході), ближня до суперника рука відведена вбік-назад і тримає його на відстані, корпус упирається в нього
    if (this.threat > 0.2 && (this.mode === 'idle' || this.mode === 'aim') && speed < 2.5) {
      const th = (this.threat - 0.2) / 0.8, side = Math.sin(this.threatYaw - this.bodyYaw) >= 0 ? 1 : -1;
      leanX += 0.1 * th; spread += 0.28 * th; leanZ -= 0.08 * side * th;
      if (side > 0) { armB += 0.5 * th; sdB += 0.9 * th; elbB = 0.45; } else { armA += 0.5 * th; sdA += 0.9 * th; elbA = 0.45; }
      if (!G) { bob -= 0.07 * th; legA += 0.1 * th; legB -= 0.1 * th; kneeA = kneeB = 0.06 + 0.4 * th; }
    }

    if (this.kicking > 0) {
      /*
       * Удар як у людини (контакт ~0.13 с — тоді ж гра й випускає м'яч):
       * замах — опорна нога стає біля м'яча, б'юча відводиться назад із високо зігнутим коліном, таз розвертається назад;
       * удар — спершу стегно веде вперед (коліно ще зігнуте), потім гомілка «хльостає» й випрямляється саме в контакті —
       *   швидкість стопи найбільша в мить удару, а не на початку; таз розвертається вперед, плечі — назустріч;
       * проводка — нога йде вгору тим вище, чим сильніший удар; тіло піднімається на носок опорної;
       * завершення — нога опускається попереду (крок через м'яч). Протилежна рука відведена вбік для рівноваги.
       */
      this.kicking += dt;
      const t = this.kicking, A = this.kickAmp, pw = this.kickPow, f = this.kickF ?? 1;
      if (!this.kickHit && t >= 0.13) {
        // контакт: тіло «віддає» — корпус кидає вперед над м'ячем, голова відстає, руки розлітаються, опорна нога просідає
        this.kickHit = true; const m = (0.5 + 0.8 * pw) * this.persona.power, sd = this.kickSide === 0 ? -1 : 1;
        this.hit(1.3 * m, -2.6 * m, 1.0 * sd * m, (sd > 0 ? 4 : -2) * m, (sd > 0 ? -2 : 4) * m, 1.1 * m);
      }
      if (t >= 0.13 + 0.57 * f) this.kicking = 0;
      else {
        const s2 = (x) => smooth(clamp(x, 0, 1));
        const back = s2(t / 0.09) * (1 - s2((t - 0.09) / 0.05));         // замах
        const thigh = s2((t - 0.06) / 0.08);                                // стегно веде вперед
        const whip = s2((t - 0.09) / 0.045);                                // гомілка розгинається до контакту
        const fol = s2((t - 0.13) / (0.17 * f));                            // проводка
        const down = s2((t - 0.13 - 0.25 * f) / (0.28 * f));                // нога опускається попереду
        const end = 1 - s2((t - 0.13 - 0.47 * f) / (0.1 * f));             // і стає на газон
        const hiF = (0.85 + 0.75 * pw) * A;                                 // висота проводки — за силою
        legB = (lerp(lerp(-0.65 * A * back, 0.35 * A, thigh), hiF, fol) * (1 - down) + 0.25 * down * end) * (pw < 0.4 ? 0.8 : 1);
        kneeB = lerp(0.3 + 1.3 * A * s2(t / 0.08), 0.1, whip) + 0.2 * fol * (1 - down) + 0.25 * down * end;
        legA = 0.15 + 0.1 * fol * (1 - down); kneeA = 0.4 - 0.2 * fol + 0.15 * down * end;   // опорна: м'яко, у проводці випрямляється
        drop = 0.04 * thigh * (1 - fol);
        lift = (pw > 0.7 ? 0.12 : 0.04) * Math.sin(Math.PI * clamp((t - 0.12) / 0.32, 0, 1));   // підйом на носок опорної
        // таз: на замаху праве стегно назад, в ударі — різко вперед; плечі крутяться назустріч
        pelY = 0.3 * A * back - 0.4 * A * thigh * (1 - 0.6 * down); leanY = -0.5 * pelY;
        // тулуб: над м'ячем для низького удару, трохи назад для сильного; убік від б'ючої ноги
        leanX = 0.05 + (0.1 + 0.15 * (1 - pw)) * thigh * (1 - down) - 0.15 * pw * fol * (1 - down);
        leanZ = 0.18 * (back + thigh) * (1 - down);
        // руки: ліва (протилежна) — убік і вперед для рівноваги, права — назад, у проводці йде вперед
        armA = (0.5 * back + 0.9 * thigh) * (1 - down); sdA = 0.6 * Math.min(1, back + thigh) * (1 - down);
        armB = (-0.4 * back - 0.3 * thigh + 0.6 * fol) * (1 - down); sdB = 0.2 * (1 - down);
        elbA = elbB = 0.5; spread = 0.2;
        if (this.kickSide === 0) {                                          // б'є лівою — дзеркально
          [legA, legB] = [legB, legA]; [kneeA, kneeB] = [kneeB, kneeA]; [armA, armB] = [armB, armA]; [sdA, sdB] = [sdB, sdA];
          pelY = -pelY; leanY = -leanY; leanZ = -leanZ;
        }
      }
    }

    if (this.look.gk) {
      const busy = this.mode !== 'idle' && this.mode !== 'aim';
      if (!busy && !this.kicking) {
        // «пружна» стійка воротаря — лише коли він пильнує (м'яч близько) і стоїть: руки розведені, корпус уперед. Іде або
        // м'яч далеко, або кат-сцена — руки вільні й махають у такт крокам, як у звичайної людини
        const k = (this.gkAlertS ?? 1) * (1 - smooth(clamp((speed - 0.6) / 1.0, 0, 1)));
        if (k > 0.01) {
          spread = lerp(spread, Math.max(spread, 0.6), k); armA = lerp(armA, -0.12, k); armB = lerp(armB, -0.12, k); elbA = lerp(elbA, 0.5, k); elbB = lerp(elbB, 0.5, k);
          if (speed < 3) { leanX = Math.max(leanX, 0.16 * k); if (!G) { legA = 0.3; legB = -0.3; kneeA = kneeB = 0.55; drop = THIGH * (1 - Math.cos(0.3)); } }
        }
      }
    }

    // рука до точки у світі (рукостискання, «дай п'ять», плече партнера): вага входить і виходить плавно, саму руку ставить
    // CCD-IK наприкінці кадру (solveReach). Удар — без запізнення ваги
    if (this.rch) for (let i = 0; i < 2; i++) {
      const q = this.rch[i], on = this.t - q.at < 0.12;
      if (q.hard && on) q.k = q.w; else q.k += ((on ? q.w : 0) - q.k) * Math.min(1, dt * 7);
    }
    // тіло включається в жест: груди й голова розвертаються до партнера (ноги йдуть далі за ходою), корпус — у замах і в удар
    if (this.eng && !this.rag) {
      const e = this.eng; e.k += ((this.t - e.at < 0.12 ? e.w : 0) - e.k) * Math.min(1, dt * 9);
      if (e.k > 0.01) { const d = clamp(angDiff(this.bodyYaw, e.yaw), -1.1, 1.1); leanY += 0.75 * d * e.k; hdY += 0.35 * d * e.k; leanX += e.lean * e.k; leanZ += e.roll * e.k; }
    }
    // стопа: якщо режим не задав щиколотку — тримаємо її рівно до землі при малому махові й тягнемо носок вниз при високому
    const defAnk = (lg, kn) => { const psi = lg > 0.35 ? -0.5 * clamp((lg - 0.35) / 1.2, 0, 1) : 0; return -psi + lg - kn; };
    if (!ankOwn && (ankA === null || !loc.on || legA !== loc.legA || kneeA !== loc.kneeA)) ankA = defAnk(legA, kneeA);
    if (!ankOwn && (ankB === null || !loc.on || legB !== loc.legB || kneeB !== loc.kneeB)) ankB = defAnk(legB, kneeB);
    // голова стабілізується проти розвороту грудей і нахилу, дивиться вперед
    // живий гравець: коли стоїть без діла, то поправляє футболку, витирає піт, струшує руки, кричить партнерам; після
    // спринту — руки на колінах. Раз на кілька секунд, кожен у свій час
    if (this.fidget && G && this.mode === 'idle' && !this.look.gk && speed < 0.35 && this.threat < 0.2 && !this.kicking && !(this.rch && (this.rch[0].k > 0.05 || this.rch[1].k > 0.05))) {
      this.fidT = (this.fidT ?? 1.5 + Math.random() * 5) - dt;
      if (this.fidT <= 0) {
        this.fidT = 3.5 + Math.random() * 6;
        const tired = (this.fatigue || 0) > 0.4 && Math.random() < 0.7, pool = Math.random() < 0.75 ? this.persona.fid : [7, 8, 10, 11, 12, 14, 2, 1, 0];
        const st = tired ? 9 : pool[(Math.random() * pool.length) | 0]; this.gesture(st === 9 ? 2.6 : 1.2 + Math.random() * 0.7, st);
      }
    }
    // у кат-сценах (вихід, перерва, кінець) гравець живий: роззирається на трибуни й партнерів, а не дивиться в одну точку
    if (G && this.gaze && this.mode === 'idle' && !this.look.gk) {
      const ph = (this.ph0 ??= Math.random() * 20);
      hdY += 0.38 * Math.sin(this.t * 0.37 + ph) * Math.sin(this.t * 0.11 + ph * 1.3); hdX += 0.07 * Math.sin(this.t * 0.53 + ph * 0.7) - 0.04;
    }
    if (G) { hdX += G.hdX; hdY += G.hdY; hdZ += G.hdZ; } else { hdY += -leanY * 0.55 - pelY * 0.2; hdX += -leanX * 0.6; hdZ += -leanZ * 0.6; }
    if (G && speed < 2.5) {                                     // різкий розворот на місці: руки трохи в боки для рівноваги, корпус ледь уперед
      const tq = clamp(Math.abs(turn) / 4, 0, 1);              // (ноги не чіпаємо — їх точно веде хода, інакше стопи ковзали б)
      spread += 0.18 * tq; leanX += 0.05 * tq;
    }
    // поворот починається згори: погляд і груди вже дивляться в новий бік, таз і ноги доганяють кроками
    // (лише справжній поворот, понад ~7°: дрібне смикання курсу груди й голову не крутить). Коли таз відкритий у бік руху,
    // груди повертаються до гри до ~45°, голова ще до ~65° — озирається через плече
    if (!this.rag) {
      const d = angDiff(this.bodyYaw, this.yawF ?? this.yaw), tw = Math.sign(d) * Math.max(0, Math.abs(d) - 0.12);
      leanY += clamp(0.5 * tw, -0.8, 0.8); hdY += clamp(0.55 * tw, -1.1, 1.1);
    }

    // ---- згладжування: кожен суглоб — пружина з критичним загасанням (неперервні і кут, і швидкість: без ривків і без перельоту).
    // Ноги на бігу йдуть точно за IK (інакше стопа ковзає), а вхід і вихід із бігу плавно змішуються з пружинами.
    const S = this.sm, V = (this.sv ??= {});
    const quick = this.kicking > 0 || this.mode === 'pkick' || this.mode === 'pdive' || this.mode === 'gkdive' || this.mode === 'header' || this.mode === 'tackle' || this.mode === 'block' || this.mode === 'parry' || this.mode === 'gkjump' || this.mode === 'scoop' || this.mode === 'catch' || this.mode === 'stagger' ? 1.4 : 0.9;
    // у скриптових діях суглоби — пружини з легким недогасанням (ζ < 1): замах проходить трохи далі й повертається,
    // як у живого тіла з інерцією кінцівок; у вільному русі (фізика ходи) — критичне загасання, бо динаміка вже своя
    const spring = (key, target, w, z = 1) => {
      w *= quick; if (G && !(this.mode === 'sad' && SAD_UPPER.has(key))) z = 1;   // у сумі на ходу верх тіла — з інерцією, ноги — точно за ходою
      let x = S[key], v = V[key] || 0;
      if (!Number.isFinite(target)) target = Number.isFinite(x) ? x : 0;
      if (!Number.isFinite(x) || !Number.isFinite(v)) { x = target; v = 0; }   // збій (NaN) не «заморожує» суглоб назавжди
      const n = Math.max(1, Math.ceil(dt * w / 0.3)), h = dt / n;
      for (let i = 0; i < n; i++) { v += (w * w * (target - x) - 2 * z * w * v) * h; x += v * h; }
      S[key] = x; V[key] = v;
    };
    const locOn = !!G && legA === loc.legA && legB === loc.legB && kneeA === loc.kneeA && kneeB === loc.kneeB;
    const Lc = (this.lastLoc ??= { legA: 0, legB: 0, kneeA: 0, kneeB: 0, ankA: 0, ankB: 0, abdA: 0, abdB: 0, ftA: 0, ftB: 0, lift: 0, tilt: 0, roll: 0, pelX: 0, pelY: 0, pelZ: 0, hip: HIP, shX: 0, surX: 0 });
    if (locOn) Object.assign(Lc, { legA, legB, kneeA, kneeB, ankA, ankB, abdA: G.abdA, abdB: G.abdB, ftA: G.twA, ftB: G.twB, tilt: tiltX, roll: tiltZ, pelX, pelY, pelZ, hip: G.hip, shX: G.shX, surX: G.surX });
    // перехід фізика ↔ скриптова дія за ~0.25 с; в удар і випад — за ~0.1 с: контакт уже на 0.13 с, а пружини й так
    // тягнулися за ходою, тож старт від пози бігу без ривка, і замах видно повністю
    const fastIn = !locOn && (this.kicking > 0 || this.mode === 'tackle');
    this.locW = clamp((this.locW || 0) + (locOn ? 1 : -1) * dt * (fastIn ? 10 : 4), 0, 1);
    const lw = smooth(this.locW);                                                // S-подібно: старт і фініш змішування без ривка
    // важкі сегменти повільніші (стегно, тулуб), легкі — швидші (передпліччя, голова)
    spring('legA', legA, 20, 0.72); spring('legB', legB, 20, 0.72); spring('kneeA', kneeA, 24, 0.7); spring('kneeB', kneeB, 24, 0.7);
    spring('ankA', ankA, 26, 0.75); spring('ankB', ankB, 26, 0.75);
    // у діях воротаря руки ведуть м'язи (майже без перельоту й коливань), в інших скриптових діях — легке недогасання
    const firm = this.look.gk && GK_MODES.has(this.mode), az = firm ? 0.9 : 0.55;
    const aw = G ? 32 : firm ? 20 : 17;
    // рука, що б'є «п'ять», — швидкий м'язовий рух: жорстка пружина без запізнення (інакше долоні лише «підтягуються»)
    spring('armA', armA, aw, az); spring('armB', armB, aw, az); spring('elbA', elbA, aw + 4, firm ? 0.9 : 0.5); spring('elbB', elbB, aw + 4, firm ? 0.9 : 0.5);
    spring('twA', twA, 16, 0.7); spring('twB', twB, 16, 0.7); spring('sdA', sdA, 20); spring('sdB', sdB, 20); spring('spread', spread, 16, 0.6); spring('drop', drop, 15, 0.7);
    const lwk = G ? 30 : 12; spring('leanX', leanX, lwk, 0.6); spring('leanY', leanY, lwk, 0.6); spring('leanZ', leanZ, lwk, 0.6);   // у вільному русі тулуб уже має власну динаміку
    spring('tiltX', tiltX, 14, 0.8); spring('tiltZ', tiltZ, 14, 0.8);
    spring('pelX', pelX, 18, 0.7); spring('pelY', pelY, 18, 0.7); spring('pelZ', pelZ, 18, 0.7);
    const hw = G ? 30 : 11; spring('hdX', hdX, hw, 0.55); spring('hdY', hdY, hw, 0.55); spring('hdZ', hdZ, hw, 0.55);
    spring('bob', bob, 18, 0.75); spring('lift', lift, 24, 0.8);   // стрибки скриптових дій теж без обриву, коли дія скінчилась
    spring('abdA', locOn ? Lc.abdA : abdSA, 24); spring('abdB', locOn ? Lc.abdB : abdSB, 24);   // у діях — власне розведення ніг (стійка, крок убік) spring('ftA', locOn ? Lc.ftA : 0, 20); spring('ftB', locOn ? Lc.ftB : 0, 20);
    const J = (k) => (lw > 0.001 ? lerp(S[k], Lc[k], lw) : S[k]);    // показ: пружина ↔ точний IK бігу
    const jLegA = J('legA'), jLegB = J('legB'), jKneeA = J('kneeA'), jKneeB = J('kneeB'), jAnkA = J('ankA'), jAnkB = J('ankB');
    const jTilt = lerp(S.tiltX, Lc.tilt, lw), jRoll = lerp(S.tiltZ, Lc.roll, lw), jPelX = lerp(S.pelX, Lc.pelX, lw), jPelY = lerp(S.pelY, Lc.pelY, lw), jPelZ = lerp(S.pelZ, Lc.pelZ, lw);

    this.legL.rotation.set(-jLegA, 0, J('abdA')); this.legR.rotation.set(-jLegB, 0, J('abdB'));
    this.shinL.rotation.x = jKneeA; this.shinR.rotation.x = jKneeB;
    this.footL.rotation.set(jAnkA, J('ftA'), 0); this.footR.rotation.set(jAnkB, J('ftB'), 0);   // поворот стопи — у щиколотці, площина коліна не крутиться
    this.pelvis.rotation.set(jPelX, jPelY, jPelZ);
    this.armL.rotation.x = -S.armA; this.armR.rotation.x = -S.armB;
    const lk = firm ? 0.008 : 0.03, lagA = clamp((V.armA || 0) * lk, -0.35, 0.35), lagB = clamp((V.armB || 0) * lk, -0.35, 0.35);   // передпліччя трохи запізнюється за плечем
    // зап'ястя: розслаблена кисть — затухаючий осцилятор, що відстає від кутового прискорення передпліччя й доганяє його
    for (let i = 0; i < 2; i++) {
      const w = this.wrist[i], va = (i ? (V.armB || 0) + (V.elbB || 0) : (V.armA || 0) + (V.elbA || 0));
      const acc = dt > 0 ? (va - (w.pv ?? va)) / dt : 0; w.pv = va;
      const n = Math.max(1, Math.ceil(dt * 16 / 0.3)), h = dt / n;
      const wc = firm ? 0.04 : 0.18, wz = firm ? 0.9 : 0.35;
      for (let k = 0; k < n; k++) { w.v += (256 * (0.12 - w.a) - 2 * wz * 16 * w.v - wc * clamp(acc, -400, 400)) * h; w.a += w.v * h; }
      w.a = clamp(w.a, -0.6, 0.8);
    }
    this.handL.rotation.set(-this.wrist[0].a, 0, 0); this.handR.rotation.set(-this.wrist[1].a, 0, 0);
    this.foreL.rotation.set(-(S.elbA + lagA), 0, 0); this.foreR.rotation.set(-(S.elbB + lagB), 0, 0);
    const fixA = this.armFix ? this.armFix[0] : 0, fixB = this.armFix ? this.armFix[1] : 0;
    this.armL.rotation.z = -(S.spread + S.sdA + fixA); this.armR.rotation.z = S.spread + S.sdB + fixB;
    this.armL.rotation.y = S.twA; this.armR.rotation.y = -S.twB;
    // підняті над головою руки тягнуть за собою плечі (ключиця): плечовий суглоб трохи вгору
    const shrug = (a) => 0.04 * Math.max(clamp((a - 1.4) / 1.3, 0, 1), clamp((S.spread - 0.9) / 0.7, 0, 1));
    this.armL.position.y = SHOULDER_Y - CHEST + shrug(S.armA) + this.breathUp; this.armR.position.y = SHOULDER_Y - CHEST + shrug(S.armB) + this.breathUp;
    // ключиця: плече висувається вперед разом із рукою й відходить назад, коли рука позаду
    this.armL.position.z = 0.035 * clamp(S.armA, -1, 1.5); this.armR.position.z = 0.035 * clamp(S.armB, -1, 1.5);
    // згин спини розподілено між поперековим і грудним відділами — спина вигинається дугою
    // вторинний рух: тулуб, голова й руки — маятники, що реагують на прискорення таза (стрибок, приземлення, удар, гальмування);
    // у вільному русі це вже робить фізика ходи, тут — для всіх скриптових дій
    const sec = (this.sec ??= { tr: { a: 0, v: 0 }, trZ: { a: 0, v: 0 }, hd: { a: 0, v: 0 }, aA: { a: 0, v: 0 }, aB: { a: 0, v: 0 }, sq: { a: 0, v: 0 }, ay: 0, af: 0, al: 0 });
    const ws = 1 - lw, aUp = sec.ay, aF = sec.af + this.aLong, aL = this.aLat;
    const oscS = (o, w, z, push) => { const n = Math.max(1, Math.ceil(dt * w / 0.3)), h = dt / n; for (let i = 0; i < n; i++) { o.v += (-w * w * o.a - 2 * z * w * o.v + push) * h; o.a += o.v * h; } return o.a; };
    const trS = oscS(sec.tr, 9, 0.4, ws * (-aF * 0.9 + Math.max(0, aUp) * 0.25) / 0.35) , trZ = oscS(sec.trZ, 8, 0.45, ws * (aL * 0.7) / 0.35);
    const hdS = oscS(sec.hd, 12, 0.45, ws * (-aF * 0.5 + aUp * 0.3) / 0.25);
    const aAS = oscS(sec.aA, 10, 0.35, ws * (-aF / 0.45 + aUp * 0.4)), aBS = oscS(sec.aB, 10.5, 0.35, ws * (-aF / 0.45 + aUp * 0.4));
    const sa = firm ? 0.2 : 1; this.armL.rotation.x -= aAS * sa; this.armR.rotation.x -= aBS * sa;
    this.lean.rotation.set(S.leanX * 0.55 + trS * 0.5, S.leanY * 0.45, S.leanZ * 0.6 + trZ * 0.5);
    this.thorax.rotation.set(S.leanX * 0.45 + trS * 0.5, S.leanY * 0.55, S.leanZ * 0.4 + trZ * 0.5);
    this.neck.rotation.set(S.hdX + hdS, S.hdY, S.hdZ);
    // висота стегон з нахилу всього тіла: лежачи — на траві, а не в ній
    // висота таза: у вільному русі — з фізики ходи; у скриптових діях — з нахилу тіла (лежачи — на траві, а не в ній)
    const cosT = Math.max(0, Math.cos(S.tiltX) * Math.cos(S.tiltZ));
    let hip = Math.max(HIP_LIE - 0.02, HIP_LIE + (HIP - HIP_LIE) * cosT - S.drop + S.bob);
    {   // стопи не провалюються в газон; правило вмикається плавно, коли тіло випрямляється (без ривка таза)
      const up = smooth(clamp((0.65 - Math.max(Math.abs(S.tiltX), Math.abs(S.tiltZ))) / 0.25, 0, 1));
      if (up > 0) {
        // розведена вбік нога дістає до трави нижче (на cos кута розведення)
        const reach = (a, k, ab) => (THIGH * Math.cos(S.tiltX - a) + SHIN * Math.cos(S.tiltX - a + k)) * Math.cos(ab);
        hip = lerp(hip, Math.max(hip, YA - 0.005 + Math.max(reach(S.legA, S.kneeA, S.abdA), reach(S.legB, S.kneeB, S.abdB))), up);
      }
      // перекат із боку (воротар підводиться після стрибка): нижня нога й стегно теж тримають таз над травою
      const tz = Math.abs(S.tiltZ), side = smooth(clamp((1.3 - tz) / 0.3, 0, 1)) * smooth(clamp((tz - 0.15) / 0.2, 0, 1));
      if (side > 0) {
        const reach = (a, k) => THIGH * Math.cos(S.tiltX - a) + SHIN * Math.cos(S.tiltX - a + k);
        const need = YA + Math.max(reach(S.legA, S.kneeA), reach(S.legB, S.kneeB)) * Math.cos(tz) + HIP_X * Math.sin(tz);
        hip = lerp(hip, Math.max(hip, need), side);
      }
    }
    hip = lerp(hip, Lc.hip, lw);
    // приземлення після стрибка: тіло осідає пропорційно швидкості падіння, коліна амортизують (ноги дотримує IK стоп)
    const vl = V.lift || 0;
    if (ws > 0.3 && (this.pLift ?? 0) > 0.03 && S.lift <= 0.03 && vl < -0.6) sec.sq.v += Math.min(2.5, -vl) * 0.9;
    this.pLift = S.lift;
    const sq = Math.max(-0.02, oscS(sec.sq, 11, 0.5, 0));
    {   // стиск/витяг тулуба: з бігу (кожне приземлення) або з приземлення після стрибка в діях; бокси — пласко, без вигинів
      const q = clamp((G ? G.squash : 0) * lw + clamp(sq * 0.25, 0, 0.06) * ws, -0.03, 0.07), wq = 1 + 0.5 * q;
      this.torso.scale.set(wq, 1 - q, wq); this.chestM.scale.set(wq, 1 - q, wq); this.printM.scale.set(wq, 1 - q, wq);
      this.thorax.position.y = (CHEST - WAIST) * (1 - q);
    }
    const hipY = hip + S.lift - sq * ws;
    this.pose.position.set(Lc.shX * lw, hipY, Lc.surX * lw);   // таз над опорною ногою (перенесення ваги)
    // прискорення таза (вертикальне й уперед) для вторинного руху наступного кадру
    if (dt > 0) {
      const vy = (hipY - (sec.py ?? hipY)) / dt, ayRaw = (vy - (sec.pvy ?? vy)) / dt; sec.py = hipY; sec.pvy = vy;
      sec.ay += (clamp(ayRaw * (this.root.scale.x || 0.82), -30, 30) - sec.ay) * Math.min(1, dt * 20);
      const vf = slide / dt - (sec.ps ?? slide) / dt; sec.ps = slide;
      sec.af += (clamp((vf - (sec.pvf ?? vf)) / dt, -30, 30) - sec.af) * Math.min(1, dt * 15); sec.pvf = vf;
    }
    this.pose.rotation.set(jTilt + flip, tiltY, jRoll);
    const hy = this.yaw, sx = Math.sin(hy), cx = Math.cos(hy);
    this.root.position.set(this.x + sx * slide, 0, this.z + cx * slide);
    this.plantFeet(dt, 1 - lw, Math.abs(jTilt + flip) < 0.5 && Math.abs(jRoll) < 0.5 && !grounded && this.mode !== 'pdive');   // стрибок воротаря сам відриває ноги
    const diving = this.mode === 'pdive' || this.mode === 'gkdive', flying = this.rag && this.rag.dive && this.ragDone < 0;
    // у польоті анімаційна поза стоїть там, де летить фізичне тіло: руки (IK до м'яча) рахуються від справжнього положення
    if (flying) { const P = this.rag.pos; this.root.updateMatrixWorld(true); this.pose.position.copy(this.body.worldToLocal(_hs.addVectors(P[0], P[1]).multiplyScalar(0.5))); }
    // руки не заходять у тулуб, голову, ноги й газон — у воротаря завжди, у польового — у скриптових діях (у ході руки й так збоку)
    if (!this.rag || flying) { if (!this.rag) this.solveArms(dt, S); this.handsIK(dt); if (this.look.gk || !G) this.armGuard(); }
    if (diving && this.look.gk && !this.rag && !this.diveRag) this.diveTakeoff(dt);
    // ---- ragdoll: падіння за фізикою; коли тіло лягло — плавний перехід у підйом (з живота чи зі спини)
    if (this.rag) {
      const dive = this.rag.dive;
      if (dive && this.ragDone < 0) {
        // м'язи ведуть тіло за позою стрибка (оберт на бік, руки з IK, ноги) відносно центру мас; удар об газон на мить «пропускають»
        this.rag.setDrive(ragPoints(this, this.dvNow ??= []), this.touchT > 0 ? DRIVE_TOUCH : DRIVE_DIVE);   // у мить контакту з м'ячем руки м'якші — гасять удар, а не смикають тіло
      }
      const settled = this.rag.step(dt);
      if (dive) {
        const P = this.rag.pos, hx = (P[0].x + P[1].x) / 2, hz = (P[0].z + P[1].z) / 2;
        if (this.ragDone < 0) { this.x = hx; this.z = hz; }                         // корінь іде за тілом, що летить і ковзає
        if (this.rag.impact > 0 && !this.landImpact) this.landImpact = this.rag.impact;
      } else if (this.ragDone < 0) this.riseT0 = this.rag.faceDown() ? 1.15 : -1.05;
      if (!dive && this.rag.active && this.ragDone < 0) {
        // м'язи тримають «рятувальну» позу відносно таза; тулуб падає сам — за поштовхом і тяжінням
        this.rag.setDrive(ragPoints(this, this.dvNow ??= []), DRIVE_FALL, true);
      }
      if (this.ragDone < 0 && (settled || this.rag.t > (dive ? 1.3 : 1.3))) {
        this.ragDone = 0;
        if (dive) { this.diveRise = this.diveP || 0; this.root.position.set(this.x, 0, this.z); this.root.updateMatrixWorld(true); }   // ліг — далі поза лежачи й підйом
      }
      if (this.ragDone === 0 && !dive) {
        this.ragDone = 1e-6;
        this.riseT0 = this.rag.faceDown() ? 1.15 : -1.05;
        this.modeD = 1.15; this.modeT = this.modeD * 0.58;                         // далі — фаза підйому анімації падіння
        // гравець тепер там, де впав, і розвернутий так, як лежить: на животі — головою вперед, на спині — ногами вперед
        const P = this.rag.pos, hx = (P[0].x + P[1].x) / 2, hz = (P[0].z + P[1].z) / 2, dx = P[9].x - hx, dz = P[9].z - hz;
        this.x = hx; this.z = hz;
        if (Math.hypot(dx, dz) > 0.05) this.yaw = this.bodyYaw = this.riseT0 > 0 ? Math.atan2(dx, dz) : Math.atan2(-dx, -dz);
        this.body.rotation.y = this.bodyYaw; this.root.position.set(this.x, 0, this.z); this.root.updateMatrixWorld(true);
      }
      if (this.ragDone >= 0) this.ragDone += dt;
      const w = this.ragDone < 0 ? 1 : Math.max(0, 1 - this.ragDone / 0.45);
      const ws = w * w * (3 - 2 * w);
      if (ws > 0) {
        this.rag.apply(ws);
        this.armGuard();                                                   // поза з фізики: руки ще раз — не в тулуб, голову й ноги
      } else this.rag = null;
      if (this.rag && (dive ? !diving : this.mode !== 'stumble')) this.rag = null;   // гра перервала падіння (розстановка тощо)
    }
    this.solveReach();
    if (!this.rag && !(this.look.gk && GK_MODES.has(this.mode))) this.bodyGuard();
    // жодна частина тіла не під газоном: у скриптових позах (підкат, випад, стрибок, політ і падіння, підйом) тіло
    // піднімається на глибину провалу. У ході ноги й так на траві
    if (!G) { this.ggDt = dt; this.groundGuard(); } else this.ggLift = 0;
    if (this.look.gk) this.hitbox(dt);
  }

  /** Найнижча точка тіла (стопи, коліна, кисті, голова з їхніми товщинами) не нижче газону. ~10 точок, без виділень. */
  groundGuard() {
    const s = this.root.scale.x || 0.82; let low = 0;
    this.root.updateMatrixWorld(true);
    for (let i = 0; i < GROUND_PROBES.length; i++) {
      const q = GROUND_PROBES[i], y = q[1] === null ? (this.headY ?? 0.29) : q[1];
      low = Math.min(low, this[q[0]].localToWorld(_hs.set(0, y, q[2])).y - q[3] * s);
    }
    // підйом згладжений: піднімається одразу (не в газон), а опускається повільно (~0.25 с) — інакше лежаче тіло, де
    // глибина провалу щокадру трохи інша, підскакувало б (тремтіло)
    const need = low < -0.012 ? -(low + 0.012) / s : 0, dt = this.ggDt || 1 / 60;
    this.ggLift = need >= (this.ggLift || 0) ? need : (this.ggLift || 0) + (need - (this.ggLift || 0)) * Math.min(1, dt * 4);
    if (this.ggLift > 1e-4) { this.pose.position.y += this.ggLift; this.root.updateMatrixWorld(true); }
  }

  /**
   * Відрив у вільний політ. За фізичним планом — одразу після відштовхування, зі швидкістю відриву (весь політ — балістика).
   * Старий шлях (без плану): до сейву воротар керує польотом (тіло й руки летять на м'яч — так, як він вклав стрибок), а з
   * верхньої точки, коли м'яч уже біля рук, тіло стає ragdoll — падає саме, з тими самими швидкостями кожного суглоба, що були
   * в цю мить (оберт, руки), і вдаряється об газон за фізикою: справжнє тяжіння 9.81 м/с². Бічна швидкість центру мас — не
   * більша за людську (~5 м/с): гра підтягує воротаря до м'яча швидше, ніж він летів би насправді, і без цієї межі тіло
   * відлітало б і ковзало пів поля. Руки й ноги ведуть м'язи; після удару вони гасять його й тримають тіло.
   */
  diveTakeoff(dt) {
    const now = ragPoints(this, this.dvNow ??= []), P = this.diveP || 0, P0 = [0.56, 0.56, 0.5][this.diveKind] ?? 0.56, pl = this.dvPlan;
    if ((pl ? pl.t < pl.t0 : P < P0) || !this.dvPrev || dt <= 0) {   // попередні точки — у тому самому масиві щокадру, без нових векторів
      const pv = (this.dvPrevBuf ??= []); for (let i = 0; i < now.length; i++) (pv[i] ??= new THREE.Vector3()).copy(now[i]);
      this.dvPrev = pv; this.dvDt = dt; return;
    }
    const vels = now.map((v, i) => v.clone().sub(this.dvPrev[i]).divideScalar(Math.max(1e-3, this.dvDt)).clampLength(0, 12));
    if (pl) {
      // відрив за планом: власний рух суглобів відносно центру мас (оберт, руки) + швидкість, яку дало відштовхування
      let ax = 0, ay = 0, az = 0; for (const v of vels) { ax += v.x; ay += v.y; az += v.z; } ax /= vels.length; ay /= vels.length; az /= vels.length;
      for (const v of vels) { v.x += pl.vx - ax; v.y += pl.vy - ay; v.z += pl.vz - az; }
      this.rag = new Ragdoll(this, { x: 0, z: 0 }, { x: 0, z: 0, up: 0 }, false, { vels, g: 9.81, dive: true });
      this.ragDone = -1; this.diveRag = true; this.diveFree = true;
      return;
    }
    let mx = 0, mz = 0; for (const v of vels) { mx += v.x; mz += v.z; } mx /= vels.length; mz /= vels.length;
    const mh = Math.hypot(mx, mz), VMAX = 5;
    if (mh > VMAX) { const k = 1 - VMAX / mh; for (const v of vels) { v.x -= mx * k; v.z -= mz * k; } }   // оберт тіла лишається, зайвий політ убік — ні
    this.rag = new Ragdoll(this, { x: 0, z: 0 }, { x: 0, z: 0, up: 0 }, false, { vels, g: 9.81, dive: true });
    this.ragDone = -1; this.diveRag = true; this.diveFree = true;
  }


  /**
   * Руки не заходять у тулуб, голову й газон після IK (і в будь-якій позі воротаря). Точки руки (лікоть, передпліччя, зап'ястя,
   * рукавиця) перевіряються в системі грудної клітки: груди й живіт — коробка, голова — куля. Якщо точка всередині, плече
   * повертається навколо плечового суглоба рівно настільки, щоб вивести її назовні найкоротшим шляхом (убік або вперед).
   */
  armGuard() {
    const HW = 0.27, ZF = 0.18, ZB = -0.165, YT = 0.3, YB = -0.47, HC = NECK - CHEST + 0.3, HR = 0.27, s = this.root.scale.x || 0.82;
    // «угору» світу в системі грудної клітки — напрям, у який рука виходить із газону
    this.root.updateMatrixWorld(true);
    const up = _hl.set(0, 1, 0).transformDirection(_hm.copy(this.thorax.matrixWorld).invert());
    // ноги в системі грудей (вони під час цієї перевірки не рухаються): стегно й гомілка кожної ноги — капсули
    const LG = _LG;
    this.thorax.worldToLocal(this.legL.getWorldPosition(LG[0])); this.thorax.worldToLocal(this.shinL.getWorldPosition(LG[1])); this.thorax.worldToLocal(this.footL.getWorldPosition(LG[2]));
    this.thorax.worldToLocal(this.legR.getWorldPosition(LG[3])); this.thorax.worldToLocal(this.shinR.getWorldPosition(LG[4])); this.thorax.worldToLocal(this.footR.getWorldPosition(LG[5]));
    for (let i = 0; i < 2; i++) {
      const sg = i ? 1 : -1, arm = i ? this.armR : this.armL, fore = i ? this.foreR : this.foreL, hand = i ? this.handR : this.handL;
      {   // друга рука в системі грудей: плече → лікоть → зап'ястя → кінчики пальців рукавиці
        const oa = i ? this.armL : this.armR, of = i ? this.foreL : this.foreR, oh = i ? this.handL : this.handR;
        oa.updateMatrixWorld(true);
        this.thorax.worldToLocal(oa.getWorldPosition(_LG[6])); this.thorax.worldToLocal(of.getWorldPosition(_LG[7]));
        this.thorax.worldToLocal(oh.localToWorld(_LG[8].set(0, -0.02, 0))); this.thorax.worldToLocal(oh.localToWorld(_LG[9].set(0, -0.22, 0)));
      }
      for (let it = 0; it < 4; it++) {
        arm.updateMatrixWorld(true);
        let pen = 0;
        for (let k = 0; k < 4; k++) {
          const node = k < 2 ? fore : hand, py = ARM_PTS[k * 2], r = ARM_PTS[k * 2 + 1];
          const q = node.localToWorld(_hs.set(0, py, 0)), pg = r * s - q.y;   // газон: точка руки не нижче своєї товщини
          this.thorax.worldToLocal(q);
          // ноги: точка руки не всередині стегна (r 0.11) чи гомілки (0.09) — назовні від осі сегмента
          for (let g = 0; g < 4; g++) {
            const A = LG[(g >> 1) * 3 + (g & 1)], Bp = LG[(g >> 1) * 3 + (g & 1) + 1], rr = (g & 1 ? 0.09 : 0.11) + r;
            _hq.subVectors(Bp, A); const l2 = _hq.lengthSq() || 1e-9, t = clamp(_hw.subVectors(q, A).dot(_hq) / l2, 0, 1);
            _hw.copy(A).addScaledVector(_hq, t); _hw.subVectors(q, _hw); const dl = _hw.length(), pl = rr - dl;
            if (pl > pen) { pen = pl; _hd.copy(q); if (dl > 1e-5) _hp.copy(_hw).divideScalar(dl); else _hp.set(sg, 0, 0); }
          }
          if (pg / s > pen) { pen = pg / s; _hd.copy(q); _hp.copy(up); }
          // голова: радіально назовні
          const dh = Math.hypot(q.x, q.y - HC, q.z), ph = HR + r - dh;
          if (ph > pen) { pen = ph; _hd.copy(q); _hp.set(q.x, q.y - HC, q.z).divideScalar(dh || 1); }
          // шия (між грудьми й головою): капсула r 0.13 — лікоть руки над головою не заходить у шию
          if (q.y > YT - 0.05 && q.y < HC) { const dn = Math.hypot(q.x, q.z), pn = 0.13 + r - dn; if (pn > pen) { pen = pn; _hd.copy(q); if (dn > 1e-5) _hp.set(q.x / dn, 0, q.z / dn); else _hp.set(sg, 0, 0); } }
          // друга рука (вона під час цієї перевірки стоїть): плече, передпліччя й рукавиця — капсули, руки не проходять одна крізь одну
          for (let g = 0; g < 3; g++) {
            const Ao = _LG[6 + g], Bo = _LG[7 + g], rr = OTHER_R[g] + r;
            _hz.subVectors(Bo, Ao); const l2 = _hz.lengthSq() || 1e-9, t = clamp(_hw.subVectors(q, Ao).dot(_hz) / l2, 0, 1);
            _hw.copy(Ao).addScaledVector(_hz, t); _hw.subVectors(q, _hw); const dg = _hw.length(), pgl = rr - dg;
            if (pgl > pen) { pen = pgl; _hd.copy(q); if (dg > 1e-5) _hp.copy(_hw).divideScalar(dg); else _hp.set(sg, 0, 0); }
          }
          if (q.y < YB || q.y > YT) continue;
          // тулуб: убік (на бік цієї руки) або вперед — що коротше
          const pSide = HW + r - q.x * sg, pFront = ZF + r - q.z;
          if (pSide <= 0 || pFront <= 0 || q.z < ZB - r || q.x * sg < -(HW + r)) continue;
          const pb = Math.min(pSide, pFront);
          if (pb > pen) { pen = pb; _hd.copy(q); if (pSide < pFront) _hp.set(sg, 0, 0); else _hp.set(0, 0, 1); }
        }
        if (pen <= 0.004) break;
        // поворот плеча: точка рухається вздовж _hp на pen
        const rv = _hu.subVectors(_hd, arm.position), ax = _hx.crossVectors(rv, _hp);
        if (ax.lengthSq() < 1e-8) ax.crossVectors(rv, _hz.set(0, 0, 1));          // рука точно вздовж напряму виходу — повертаємо вперед
        const l = ax.length(); if (l < 1e-5) break;
        const rp = Math.max(0.12, rv.length());
        _Q1.setFromAxisAngle(ax.divideScalar(l), Math.atan((pen + 0.01) / rp));
        arm.quaternion.premultiply(_Q1);
      }
    }
  }

  /**
   * Хітбокси за скелетом (світ): капсули тулуба, голови, плечей, передпліч, рукавиць, стегон, гомілок і стоп — там, де їх видно.
   * Кожна — {ax..bz, r, glove, va*, vb*} зі швидкостями кінців (м/с), щоб м'яч відбивався від руки, що рухається.
   */
  hitbox(dt) {
    const s = this.root.scale.x || 0.82;
    const D = (this._hbD ??= [
      // тулуб — дві паралельні капсули на всю ширину (±0.27) і товщину (±0.17) моделі; голова — у її розмір
      [this.pose, -0.1, -0.05, 0.005, this.neck, -0.1, -0.08, 0.005, 0.17, 0], [this.pose, 0.1, -0.05, 0.005, this.neck, 0.1, -0.08, 0.005, 0.17, 0],
      [this.neck, 0, 0.22, -0.015, this.neck, 0, 0.32, -0.015, 0.23, 0],
      [this.armL, 0, 0, 0, this.foreL, 0, 0, 0, 0.08, 0], [this.armR, 0, 0, 0, this.foreR, 0, 0, 0, 0.08, 0],
      [this.foreL, 0, 0, 0, this.handL, 0, 0, 0, 0.065, 0], [this.foreR, 0, 0, 0, this.handR, 0, 0, 0, 0.065, 0],
      [this.handL, 0, -0.04, 0, this.handL, 0, -0.22, 0, 0.09, 1], [this.handR, 0, -0.04, 0, this.handR, 0, -0.22, 0, 0.09, 1],
      [this.legL, 0, 0, 0, this.shinL, 0, 0, 0, 0.1, 0], [this.legR, 0, 0, 0, this.shinR, 0, 0, 0, 0.1, 0],
      [this.shinL, 0, 0, 0, this.footL, 0, 0, 0, 0.08, 0], [this.shinR, 0, 0, 0, this.footR, 0, 0, 0, 0.08, 0],
      [this.footL, 0, -0.05, -0.05, this.footL, 0, -0.05, 0.2, 0.06, 0], [this.footR, 0, -0.05, -0.05, this.footR, 0, -0.05, 0.2, 0.06, 0],
    ]);   // опис — один раз на гравця
    const H = (this.hitCaps ??= D.map(() => ({ ax: 0, ay: 0, az: 0, bx: 0, by: 0, bz: 0, r: 0, glove: 0, vax: 0, vay: 0, vaz: 0, vbx: 0, vby: 0, vbz: 0, ok: false })));
    this.root.updateMatrixWorld(true);
    for (let i = 0; i < D.length; i++) {
      const e = D[i], c = H[i], r = e[8], gl = e[9];
      const a = e[0].localToWorld(_hs.set(e[1], e[2], e[3])), b = e[4].localToWorld(_hd.set(e[5], e[6], e[7]));
      if (c.ok && dt > 0) {
        c.vax = (a.x - c.ax) / dt; c.vay = (a.y - c.ay) / dt; c.vaz = (a.z - c.az) / dt;
        c.vbx = (b.x - c.bx) / dt; c.vby = (b.y - c.by) / dt; c.vbz = (b.z - c.bz) / dt;
      }
      c.ax = a.x; c.ay = a.y; c.az = a.z; c.bx = b.x; c.by = b.y; c.bz = b.z; c.r = r * s; c.glove = gl; c.ok = true;
    }
  }

  /**
   * Руки воротаря працюють по м'ячу: IK двох сегментів (плече → лікоть → зап'ястя) у системі грудної клітки.
   * Хват (grip) задає, як рукавиці стоять відносно м'яча: 0 — «W» позаду м'яча (долоні назустріч польоту, великі пальці
   * майже разом), 1 — утримання з боків (долоні одна до одної). Пальці дивляться вгору для високого м'яча і вниз для
   * низького («кошик»). Лікті йдуть назовні-донизу; поворот кисті ділиться між передпліччям (пронація) і зап'ястям, обидва
   * з анатомічними межами. Мета, хват і вага кожної руки згладжені, тож руки переходять між позами, а не перескакують.
   */
  handsIK(dt) {
    const st = (this.hk ??= { w: [0, 0], V: new THREE.Vector3(), off: new THREE.Vector3(), src: '', grip: 0, spr: 0.1, pb: null, bv: new THREE.Vector3(), pc: null, cv: new THREE.Vector3() });
    // польовий — без IK рук; воротар, що тисне руку чи б'є «п'ять», теж (рука зайнята, а не стежить за м'ячем)
    if (!this.look.gk || (this.rch && (this.rch[0].k > 0.05 || this.rch[1].k > 0.05))) { st.w[0] = st.w[1] = 0; return; }
    const s = this.root.scale.x || 0.82, md = this.modeD || 1, mk = md > 0 ? clamp(1 - this.modeT / md, 0, 1) : 1;
    // воротар діє за тим, що бачить (із затримкою реакції), а не за справжнім положенням м'яча в цю мить
    const ball = this.ball && this.t - (this.ballSeen ?? -9) < 0.3 && this.perceive(_pv) ? _pv : null;
    const chest = this.thorax.getWorldPosition(_hc);
    const dist = ball ? ball.distanceTo(chest) : 99, rb = (this.ballR || PITCH.BALL_VIS) / s;
    if (ball && dt > 0) {                                                     // стрибок м'яча (новий удар, розстановка) — не швидкість
      if (st.pb) { _hs.subVectors(ball, st.pb).divideScalar(dt); if (_hs.lengthSq() > 3600) st.bv.set(0, 0, 0); else st.bv.lerp(_hs, Math.min(1, dt * 30)); }
      (st.pb ??= new THREE.Vector3()).copy(ball);
    } else if (!ball) { st.pb = null; st.bv.set(0, 0, 0); }
    if (dt > 0) {                                                             // швидкість грудей (тіло в стрибку летить до м'яча)
      if (st.pc) { _hs.subVectors(chest, st.pc).divideScalar(dt); if (_hs.lengthSq() < 400) st.cv.lerp(_hs, Math.min(1, dt * 20)); }
      (st.pc ??= new THREE.Vector3()).copy(chest);
    }
    let src = '';
    const sm = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
    // де м'яч буде, коли долетить до рук (reach від грудей): воротар читає політ і ставить руки заздалегідь
    const sp = st.bv.length(), coming = ball && sp > 3 && st.bv.dot(_hs.subVectors(chest, ball)) > 0;
    const intercept = (reach) => {                                            // reach — по горизонталі від грудей
      if (!coming) return ball;
      const hs = Math.hypot(st.bv.x, st.bv.z), hd = Math.hypot(ball.x - chest.x, ball.z - chest.z);
      return _hv.copy(ball).addScaledVector(st.bv, hs > 1 ? Math.min(0.6, Math.max(0, hd - reach) / hs) : 0);
    };
    // де м'яч перетне площину воротаря (через груди, поперек його погляду) і коли — для стрибків, коли м'яч летить повз тіло
    let tPlane = 0, along = 0;
    const toPlane = (off) => {
      const fx = Math.sin(this.bodyYaw), fz = Math.cos(this.bodyYaw), vf = -(st.bv.x * fx + st.bv.z * fz);
      along = (ball.x - chest.x) * fx + (ball.z - chest.z) * fz;
      tPlane = coming && vf > 1 ? clamp((along - off) / vf, 0, 0.6) : 0;
      return _hv.copy(ball).addScaledVector(st.bv, tPlane);
    };
    // чи дістане: груди через tAhead с (тіло ще летить) і довжина руки разом із плечем і рукавицею. Недосяжний м'яч руки не
    // переслідують — воротар просто довершує свій рух (стрибок не в той бік, м'яч уже пролетів, далеко від тіла)
    const armReach = (UPPER + WRIST + 0.13) * this.armL.scale.x * s + 0.35;
    const reachable = (pt, tAhead, ext = 0) => {                              // ext — дотяжка однією рукою (плече вперед)
      const t = Math.min(tAhead, 0.5), d = Math.hypot(pt.x - chest.x - st.cv.x * t, pt.y - chest.y - st.cv.y * t, pt.z - chest.z - st.cv.z * t);
      return sm((armReach + 0.15 + ext - d) / 0.35);
    };
    const local = (x, y, z) => this.thorax.localToWorld(_hv.set(x, y, z));
    let V = null, wL = 0, wR = 0, grip = 0, spr = rb * 0.6, oneT = 0, oneS = st.one || 1;
    const both = (w) => { wL = wR = w; };
    if (this.touchT > 0) this.touchT -= dt;
    switch (this.mode) {
      case 'catch':                                                           // «віконце» назустріч м'ячу → притиснути до грудей
        if (mk < 0.32) {
          const ip = ball && (dist < 2.4 || coming) ? intercept(0.6) : null, ok = ip && reachable(ip, 0) > 0.3;
          V = ok ? ip : local(0, 0.05, 0.6); src = ok ? 'ball' : 'front';
        } else { V = local(0, -0.12, 0.2 + rb); grip = 1; src = 'hold'; }   // м'яч притиснутий до грудей: центр — на радіус м'яча перед ними
        both(1 - sm((mk - 0.82) / 0.18)); break;
      case 'scoop':                                                           // «кошик» під м'ячем → до грудей
        if (mk < 0.5) {
          const ip = ball && (dist < 2.2 || coming) ? intercept(0.7) : null, ok = ip && reachable(ip, 0) > 0.3;
          V = ok ? ip : _hv.set(this.root.position.x + Math.sin(this.bodyYaw) * 0.67 * s, PITCH.BALL_VIS, this.root.position.z + Math.cos(this.bodyYaw) * 0.67 * s); src = ok ? 'ball' : 'ground';
        }
        else { V = local(0, -0.16, 0.2 + rb); grip = 1; src = 'hold'; }
        both(sm(mk / 0.15) * (1 - sm((mk - 0.85) / 0.15))); break;
      case 'parry': {                                                         // долоні б'ють по м'ячу й проводять його назовні
        if (!this.parryAt) break;
        const out = _hd.subVectors(this.parryAt, chest); out.y = Math.max(0, out.y); out.normalize();
        V = _hv.copy(this.parryAt).addScaledVector(out, 0.35 * sm(mk / 0.55)); src = 'parry';
        const lx = this.thorax.worldToLocal(_hs.copy(this.parryAt)).x;            // м'яч збоку — б'є ближня рука, друга лише підстраховує
        const w = 1 - sm((mk - 0.55) / 0.45);
        wL = lx > 0.25 ? 0 : w; wR = lx < -0.25 ? 0 : w; spr = rb * 0.45; break;
      }
      case 'gkdive': case 'pdive': {
        const P = this.diveP || 0;
        if (this.touchT > 0 && this.parryAt) {                                 // контакт у польоті: долоні проводять м'яч назовні
          const out = _hd.subVectors(this.parryAt, chest); out.y = Math.max(0, out.y); out.normalize();   // проводка назовні, але не в газон
          // долоні лише супроводжують м'яч назовні (~12 см), а не «вистрілюють» на 40 см: у польоті такий ривок рук через фізику
          // тіла відкидав увесь корпус у протилежний бік — воротаря ніби відкидало від м'яча
          V = _hv.copy(this.parryAt).addScaledVector(out, 0.12 * (1 - this.touchT / 0.35)); src = 'parry'; both(sm(this.touchT / 0.15));
        } else if (P > 0.1 && P < 0.9 && !(this.rag && this.rag.landT >= 0)) {   // уже на газоні — руки м'яч не шукають
          // руки в польоті — як у живого воротаря: спершу витягнуті туди, куди він вирішив стрибати (і розведені — більша
          // площа), а далі за тим, що він бачить: м'яч ще не пролетів і є хоч якийсь шанс — тягнеться до нього, на межі
          // досяжності — однією рукою (плече вперед, ще ~12 см). Шансу нема — довершує стрибок туди, куди летів
          const go = sm((P - 0.13) / 0.12) * (1 - sm((P - 0.76) / 0.12));
          let r = 0;
          if (ball && coming) { V = toPlane(0.3); if (along > -0.7) r = reachable(V, tPlane, 0.12); }
          if (r > 0.01) {
            src = 'ball'; both(go * Math.max(r, 0.4));
            // однією рукою: м'яч далі, ніж дістають дві; тягнеться та рука, чиє плече ближче до м'яча
            const t = Math.min(tPlane, 0.5), dd = Math.hypot(V.x - chest.x - st.cv.x * t, V.y - chest.y - st.cv.y * t, V.z - chest.z - st.cv.z * t);
            oneT = smooth(clamp((dd - (armReach - 0.12)) / 0.18, 0, 1));
            this.armL.getWorldPosition(_hs); const dl = _hs.distanceToSquared(V); this.armR.getWorldPosition(_hs); oneS = _hs.distanceToSquared(V) < dl ? 1 : -1;
            spr = rb * lerp(0.75, 1.7, smooth(clamp((tPlane - 0.1) / 0.2, 0, 1)));   // поки м'яч далеко — руки ширше, ближче — збираються
          } else if (this.diveAim) { V = _hv.copy(this.diveAim); src = 'aim'; both(go * 0.55); spr = rb * 1.8; }   // м'яко: руки тягнуться, а не викручують тіло
          else { V = null; spr = rb * 0.75; }
          break;
        }
        spr = rb * 0.75; break;
      }
      case 'gkjump':
        if (ball && (dist < 2.6 || coming)) { V = intercept(1.1); const r = reachable(V, 0); if (r > 0.01) { src = 'ball'; both(Math.sin(mk * Math.PI) * r); } else V = null; }
        break;
      default: {
        // м'яч у руках (після сейву, поки воротар не віддав його): притиснутий до грудей обома руками — і стоячи, і на ходу
        if (this.holdBall && (this.mode === 'idle' || this.mode === 'aim') && !this.kicking) { V = local(0, -0.12, 0.2 + rb); grip = 1; src = 'hold'; both(1); break; }
        // стійка («готові руки»): долоні попереду на рівні пояса, розкриті назустріч м'ячу; летить м'яч — руки стежать за ним
        const ready = (this.mode === 'gkwait' || this.mode === 'idle') && !this.kicking && Math.hypot(this.vx, this.vz) < 3 && !this.gaze;   // у кат-сценах руки не «ловлять»
        if (!ready) break;
        // наскільки руки «в роботі»: м'яч далеко — майже вільні (махають у такт крокам, як у людини, що йде), небезпека — перед
        // тілом напоготові; на бігу руки віддаємо ході
        const al = this.gkAlertS ?? 1, mv = smooth(clamp((Math.hypot(this.mvx || 0, this.mvz || 0) - 1.2) / 1.8, 0, 1));
        const rw = lerp(0.12, 0.85, al) * (1 - 0.7 * mv);
        // м'яч поруч — руки трохи зсуваються в його бік і по висоті, але лишаються перед тілом
        let bx = 0, by = 0;
        if (ball && dist < 14) { const bl = this.thorax.worldToLocal(_hs.copy(ball)); bx = clamp(bl.x / Math.max(1, bl.z), -0.18, 0.18); by = clamp((bl.y + 0.4) / Math.max(1, bl.z), -0.1, 0.25); }
        V = local(bx, lerp(-0.55, -0.42, al) + by, lerp(0.5, 0.66, al));
        src = 'ready'; spr = lerp(0.24, 0.3, al); grip = 0.15; both(rw);
      }
    }
    // згладжування мети, хвату й ваг
    const wSum = st.w[0] + st.w[1], kk = 1 - Math.exp(-dt * 14);
    if (V && V.y < rb * s) V.y = rb * s;
    if (V) {
      if (wSum < 0.02) { st.off.set(0, 0, 0); st.grip = grip; st.spr = spr; }
      else {
        if (src !== st.src) st.off.subVectors(st.V, V);                       // нова мета: рука не стрибає, а доходить до неї
        st.off.multiplyScalar(1 - kk); st.grip += (grip - st.grip) * Math.min(1, dt * 12); st.spr += (spr - st.spr) * Math.min(1, dt * 12);
      }
      st.V.copy(V).add(st.off); st.src = src;
      // руки не телепортуються: відносно грудей рукавиці рухаються не швидше ~handV м/с (кращі руки — швидші)
      if (!st.rel || wSum < 0.02) (st.rel ??= new THREE.Vector3()).subVectors(st.V, chest);
      else {
        _hq.subVectors(st.V, chest).sub(st.rel); const l = _hq.length(), m = (this.handV ?? 7) * dt;
        if (l > m) _hq.multiplyScalar(m / l);
        st.rel.add(_hq); st.V.copy(chest).add(st.rel);
      }
    }
    st.one = oneS; st.oneW = (st.oneW || 0) + (oneT - (st.oneW || 0)) * Math.min(1, dt * 10);
    st.w[0] += (wL - st.w[0]) * Math.min(1, dt * 12); st.w[1] += (wR - st.w[1]) * Math.min(1, dt * 12);
    if (st.w[0] < 0.01 && st.w[1] < 0.01) return;

    // мета в системі грудної клітки; d — від середини плечей до м'яча, бокова вісь — ширина грудей, перпендикулярна d
    const Vl = this.thorax.worldToLocal(_hw.copy(st.V)), g = st.grip;
    const d = _hd.subVectors(Vl, _hs.addVectors(this.armL.position, this.armR.position).multiplyScalar(0.5)).normalize();
    if (st.src === 'ball' && st.bv.lengthSq() > 9 && st.bv.dot(_hs.subVectors(chest, st.V)) > 0) {
      const toward = this.thorax.worldToLocal(_hs.copy(st.V).sub(st.bv)).sub(Vl).normalize();   // звідки летить м'яч, у системі грудей
      d.lerp(toward, 0.75).normalize();
    }
    const lat = _hl.copy(_XA).addScaledVector(d, -d.x); if (lat.lengthSq() < 1e-4) lat.set(0, 0, 1); lat.normalize();
    // м'яч далеко вбік: руки не стоять поруч (тоді дальня перехрещує ближню перед обличчям), а одна над одною — дальня йде
    // над головою зверху, ближня знизу, як у воротаря в стрибку
    {
      const ws = smooth(clamp((Math.abs(d.x) - 0.5) / 0.4, 0, 1));
      if (ws > 0) { _hq.set(0, -Math.sign(d.x), 0).addScaledVector(d, Math.sign(d.x) * d.y); if (_hq.lengthSq() > 1e-4) { _hq.normalize(); lat.lerp(_hq, ws).normalize(); } }
    }
    // пальці: високий м'яч — угору (долоні за м'ячем), низький — донизу («кошик»), завжди трохи вперед до м'яча
    const fUp = Vl.y > -0.38 ? 1 : -1;
    for (let i = 0; i < 2; i++) {
      const sg = i ? 1 : -1, w = st.w[i] * (1 - 0.3 * (st.oneW || 0) * (sg === st.one ? 0 : 1)); if (w < 0.01) continue;
      const arm = i ? this.armR : this.armL, fore = i ? this.foreR : this.foreL, hand = i ? this.handR : this.handL, as = arm.scale.x;
      const L1 = UPPER * as, L2 = WRIST * as;
      // долоня: при «W» дивиться назустріч м'ячу (трохи всередину), при утриманні — на м'яч збоку
      const n = _hp.copy(d).multiplyScalar(1 - g).addScaledVector(lat, -sg * (g + 0.3 * (1 - g))).normalize();
      const F = _hf.set(0, fUp, 0).addScaledVector(d, 0.6); F.addScaledVector(n, -F.dot(n));
      if (F.lengthSq() < 1e-5) F.copy(lat).multiplyScalar(-sg); F.normalize();
      // центр долоні: позаду м'яча (між м'ячем і тілом) і трохи вбік; зап'ястя — на довжину долоні назад уздовж пальців
      // однією рукою: та, що тягнеться, — долоня прямо за м'ячем (без бічного зсуву); друга — позаду, ширше й слабше
      const oh = (st.oneW || 0) * (sg === st.one ? 1 : -1), side0 = st.spr + (rb + 0.045 - st.spr) * g;
      const side = oh > 0 ? side0 * (1 - oh) : side0 * (1 - 0.9 * oh);
      const c = _hz.copy(Vl).addScaledVector(d, -(rb + 0.045) * (1 - g)).addScaledVector(lat, sg * side);
      const v = c.addScaledVector(F, -0.11 * as).sub(arm.position);
      let dd = v.length(); const dir = v.divideScalar(dd || 1);
      dd = clamp(dd, 0.3 * as, (L1 + L2) * 0.995);                             // далі, ніж дістає — рука витягується прямо до м'яча
      const cA = clamp((L1 * L1 + dd * dd - L2 * L2) / (2 * L1 * dd), -1, 1), sA = Math.sqrt(1 - cA * cA);
      // лікоть: назовні, донизу й трохи назад (як у живої людини), у площині, перпендикулярній до напрямку на мету
      const pp = _hx.set(sg * 0.8, -1, -0.35); pp.addScaledVector(dir, -pp.dot(dir));
      if (pp.lengthSq() < 1e-5) pp.set(sg, 0, 0); pp.normalize();
      const u = _hu.copy(dir).multiplyScalar(cA).addScaledVector(pp, sA);       // напрям плеча (плече → лікоть)
      const fa = _hs.copy(dir).multiplyScalar(dd).addScaledVector(u, -L1).normalize();   // напрям передпліччя (лікоть → зап'ястя)
      const Z = _hv.copy(fa).addScaledVector(u, -fa.dot(u)); if (Z.lengthSq() < 1e-6) Z.copy(pp).negate(); Z.normalize();
      const e = Math.acos(clamp(u.dot(fa), -1, 1));
      const Y = u.negate(), X = _hx.crossVectors(Y, Z);
      _hm.makeBasis(X, Y, Z); _hqa.setFromRotationMatrix(_hm);
      _hqe.setFromAxisAngle(_XA, -e);
      // кисть: ліва рукавиця має долоню з боку +X, права — з боку −X; пальці — вздовж −Y; великий палець (+Z) — до м'яча/іншої руки
      const Xh = _hx.copy(n).multiplyScalar(-sg), Yh = _hu.copy(F).negate(), Zh = _hs.crossVectors(Xh, Yh);
      _hm.makeBasis(Xh, Yh, Zh); _hqh.setFromRotationMatrix(_hm);
      _hqi.copy(_hqa).multiply(_hqe).invert().multiply(_hqh);                    // поворот кисті відносно передпліччя
      // розклад «обертання навколо осі передпліччя + згин зап'ястя»: обертання бере передпліччя (до ~85°), згин — зап'ястя (до ~70°)
      _Q1.set(0, _hqi.y, 0, _hqi.w); if (_Q1.lengthSq() < 1e-8) _Q1.identity(); else _Q1.normalize();
      const tw = 2 * Math.atan2(_Q1.y, _Q1.w), twC = clamp(Math.atan2(Math.sin(tw), Math.cos(tw)), -1.5, 1.5);
      _Q1.setFromAxisAngle(_hx.set(0, 1, 0), twC);
      _hqi.premultiply(_hqh.copy(_Q1).invert());                                 // що лишилось — згин у зап'ясті
      const ang = 2 * Math.acos(clamp(Math.abs(_hqi.w), 0, 1)), lim = 1.2;
      if (ang > lim) _hqi.slerp(_hqh.identity(), 1 - lim / ang);
      _hqe.multiply(_Q1);
      arm.quaternion.slerp(_hqa, w); fore.quaternion.slerp(_hqe, w); hand.quaternion.slerp(_hqi, w);
    }
  }


  /**
   * Стопи на газоні в скриптових діях: стопа, що торкнулась трави, прикріплюється до цієї точки й тримається через IK ноги,
   * доки дія не підніме її (замах, стрибок) або тіло не відійде від неї далі, ніж дозволяє крок. Так опорна нога в ударі,
   * радості, блоці чи прийомі не ковзає, а коліна самі амортизують, коли таз опускається.
   */
  plantFeet(dt, w, allowed) {
    const P = (this.plants ??= [0, 1].map(() => ({ on: false, w: 0, x: 0, z: 0, step: 0, sx: 0, sz: 0, rx: 0, rz: 0 })));
    const s = this.root.scale.x || 0.82, ground = YA * s, STEP_T = 0.2;
    if (w < 0.01 || !allowed) { for (const q of P) { q.on = false; q.w = 0; q.step = 0; } return; }
    this.root.updateMatrixWorld(true);
    const ik = { hip: 0, knee: 0 };
    for (let i = 0; i < 2; i++) {
      const q = P[i], o = P[1 - i], leg = i ? this.legR : this.legL, shin = i ? this.shinR : this.shinL, foot = i ? this.footR : this.footL;
      foot.getWorldPosition(_w);
      const fx = _w.x, fy = _w.y, fz = _w.z;                                   // куди стопу ставить сама дія
      let tx, ty, tz, k;
      if (q.step === 0) {
        const gf = this.gaitSys.feet[i];
        const rx = this.root.position.x, rz = this.root.position.z;
        if (!q.on && gf.st === 'stance' && (this.locW || 0) > 0.05) { q.on = true; q.x = gf.x; q.z = gf.z; q.w = 1; q.rx = rx; q.rz = rz; }   // з бігу в дію: опорна стопа лишається там, де стояла
        else if (!q.on) { if (fy < ground + 0.035 && q.w < 0.05) { q.on = true; q.x = fx; q.z = fz; q.rx = rx; q.rz = rz; } }
        else if (fy > ground + 0.08) q.on = false;                                   // дія сама підняла ногу (замах, стрибок)
        else if (Math.hypot(fx - q.x, fz - q.z) > 0.24 * s) {
          // стопа мусить переміститись, а дія тримає її низько — вона переступає (дугою, а не волочиться травою)
          if (o.step === 0 || Math.hypot(fx - q.x, fz - q.z) > 0.4 * s) { q.step = 1e-4; q.sx = q.x; q.sz = q.z; }   // дуже розтягнулась — підскок і на цю ногу
          q.on = false;
        }
      }
      if (q.step > 0) {
        // швидкий крок: спершу п'ята відривається вгору, потім стопа переноситься туди, де її хоче бачити дія, й опускається
        q.step = Math.min(1, q.step + dt / STEP_T);
        const u = clamp((q.step - 0.18) / 0.64, 0, 1), m = u * u * (3 - 2 * u);
        tx = lerp(q.sx, fx, m); tz = lerp(q.sz, fz, m); ty = Math.max(fy, ground) + 0.13 * s * Math.pow(Math.sin(Math.PI * q.step), 0.6);
        k = 1;
        if (q.step >= 1) { q.step = 0; q.x = fx; q.z = fz; q.w = 1; q.rx = this.root.position.x; q.rz = this.root.position.z; q.on = fy < ground + 0.05; }   // якщо дія вже піднімає ногу — далі м'яко відпускається
      } else {
        q.w = q.on ? Math.min(1, q.w + dt * 8) : Math.max(0, q.w - dt * 4);
        if (q.w > 0) { tx = q.x; ty = ground; tz = q.z; k = q.w * q.w * (3 - 2 * q.w); }   // вмикання й відпускання по S-кривій
        else if (fy < ground + 0.05) { tx = fx; ty = Math.max(fy, ground); tz = fz; k = w * clamp((ground + 0.05 - fy) / 0.04, 0, 1); }   // не провалюється в газон (плавно)
        else continue;
      }
      _w.set(tx, ty, tz); this.pelvis.worldToLocal(_w); _w.sub(leg.position);
      const abd = Math.atan2(_w.x, -_w.y), down = Math.hypot(_w.x, _w.y) * Math.sign(-_w.y || 1);
      this.gaitSys.legIK(_w.z, down, ik);
      leg.rotation.x = lerp(leg.rotation.x, -ik.hip, k); leg.rotation.z = lerp(leg.rotation.z, abd, k);
      shin.rotation.x = lerp(shin.rotation.x, ik.knee, k);
      if (q.step === 0) { const flat = -(this.pose.rotation.x + this.pelvis.rotation.x + leg.rotation.x + shin.rotation.x); foot.rotation.x = lerp(foot.rotation.x, flat, k); }   // стопа лежить на траві рівно
      leg.updateMatrixWorld(true);
    }
  }

  /**
   * Руки не заходять у тулуб: лікоть, середина плеча й передпліччя та кисть перевіряються відносно об'єму грудей і живота
   * (у системі грудної клітки). Якщо точка всередині — рука відводиться назовні рівно настільки, щоб вийти;
   * коли зіткнення немає, поправка плавно спадає.
   */
  solveArms(dt, S) {
    const fix = (this.armFix ??= [0, 0]);
    this.root.updateMatrixWorld(true);
    const HW = 0.27, ZF = 0.18, ZB = -0.165, YT = 0.28, YB = -0.45;     // тулуб у системі грудної клітки
    for (let i = 0; i < 2; i++) {
      const arm = i ? this.armR : this.armL, fore = i ? this.foreR : this.foreL, hand = i ? this.handR : this.handL;
      const pts = [[arm, -0.21, 0.075], [fore, 0, 0.06], [fore, -0.15, 0.05], [hand, -0.09, 0.035]];
      let pushed = false;
      for (let it = 0; it < 3; it++) {
        let pen = 0, L = 0.3;
        for (const [node, py, r] of pts) {
          _w.set(0, py, 0); node.localToWorld(_w); this.thorax.worldToLocal(_w);
          if (_w.y < YB || _w.y > YT || _w.z < ZB - r || _w.z > ZF + r) continue;
          const p = HW + r - Math.abs(_w.x);
          if (p > pen) { pen = p; L = Math.max(0.15, Math.hypot(_w.x - arm.position.x, _w.y - arm.position.y, _w.z - arm.position.z)); }
        }
        if (pen <= 0.003) break;
        fix[i] = Math.min(1.2, fix[i] + Math.atan(pen / L) + 0.01); pushed = true;
        arm.rotation.z = i ? S.spread + S.sdB + fix[i] : -(S.spread + S.sdA + fix[i]);
        arm.updateMatrixWorld(true);
      }
      if (!pushed) fix[i] = Math.max(0, fix[i] - dt * 0.8);
    }
  }
}
