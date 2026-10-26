import * as THREE from 'three';
import { VoxelBuilder } from './voxel.js';
import { playerAtlas, faceCell, numberCell } from './textures.js';

const HIP = 1.05;
const THIGH = 0.52, UPPER = 0.43;          // довжина стегна й плеча: тут розміщені колінний і ліктьовий суглоби
const SHIN = 0.40, YA = 0.14, LEG = THIGH + SHIN;   // гомілка до щиколотки; висота щиколотки над травою; довжина ноги бедро→щиколотка
const NECK = 1.25, WAIST = 0.3;                      // висота шиї й талії у вихідних координатах тулуба
const G_ACC = 9.8;
const TAU = Math.PI * 2;
export const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const easeOut = (t) => 1 - (1 - t) * (1 - t);
const smooth = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;

/**
 * Дволанкова зворотна кінематика ноги в сагітальній площині.
 * x — щиколотка вперед від стегна, y — вертикаль униз від стегна. Повертає кут стегна (вперед +) і згин коліна.
 */
function legIK(x, y, out) {
  let d = Math.hypot(x, y);
  const dmax = LEG * 0.998, dmin = 0.2;
  if (d > dmax) { x *= dmax / d; y *= dmax / d; d = dmax; } else if (d < dmin) { d = dmin; }
  const cosK = (THIGH * THIGH + SHIN * SHIN - d * d) / (2 * THIGH * SHIN);
  const cosH = (THIGH * THIGH + d * d - SHIN * SHIN) / (2 * THIGH * d);
  out.knee = Math.PI - Math.acos(clamp(cosK, -1, 1));
  out.hip = Math.atan2(x, y) + Math.acos(clamp(cosH, -1, 1));
  return out;
}

let _mat = null;
/** Один матеріал на всіх гравців: вершинний колір × атлас (обличчя, номери). */
function atlasMat() {
  if (!_mat) _mat = new THREE.MeshLambertMaterial({ map: playerAtlas(), vertexColors: true, flatShading: true });
  return _mat;
}

const cache = new Map();
const cached = (key, make) => { let g = cache.get(key); if (!g) { g = make(); cache.set(key, g); } return g; };
const FACE_UV = [[0, 1], [1, 1], [0, 0], [1, 0]];

/** Стегно (шорти + верх гетр) і гомілка (гетра + бутса): окремі частини, між ними коліно. */
const thighGeo = (kit, gk) => cached('th' + kit.shorts + kit.socks + gk, () => {
  const b = new VoxelBuilder(0.22, true);
  if (gk) {                                               // воротар: довгі штани з боковою смугою
    b.box(0, -0.22, 0, 0.64, 0.44, 0.64, kit.shorts);
    b.box(0.33, -0.22, 0, 0.04, 0.44, 0.5, kit.main);
    b.box(-0.33, -0.22, 0, 0.04, 0.44, 0.5, kit.main);
    b.box(0, -0.48, 0, 0.56, 0.1, 0.56, kit.shorts);
    return b.build();
  }
  b.box(0, -0.22, 0, 0.58, 0.44, 0.58, kit.shorts);
  b.box(0, -0.48, 0, 0.46, 0.1, 0.46, kit.socks);
  return b.build();
});
const shinGeo = (kit, gk) => cached('sh' + kit.socks + kit.shorts + gk, () => {
  const b = new VoxelBuilder(0.22, true);
  if (gk) {                                               // штани й наколінник
    b.box(0, -0.19, 0, 0.54, 0.38, 0.54, kit.shorts);
    b.box(0, -0.06, 0.28, 0.46, 0.2, 0.08, '#56606a');
    return b.build();
  }
  b.box(0, -0.19, 0, 0.46, 0.38, 0.46, kit.socks);
  if (kit.under) b.box(0, -0.33, 0, 0.48, 0.05, 0.48, '#f1efe8');          // біла стрічка на гетрах
  return b.build();
});
/** Стопа: бутса на шарнірі щиколотки (початок координат = щиколотка). */
const footGeo = (kit, gk) => cached('ft' + (kit.boot || '') + gk, () => {
  const b = new VoxelBuilder(0.22, true), Y = 0.40;
  if (gk) {
    b.box(0, -0.03, 0.07, 0.56, 0.2, 0.7, '#e8e4d8');
    b.box(0, -0.12, 0.12, 0.58, 0.04, 0.72, '#17191c');
    return b.build();
  }
  b.box(0, -0.43 + Y, 0.07, 0.5, 0.2, 0.66, kit.boot || '#17191c');
  if (kit.boot) { b.box(0, -0.52 + Y, 0.12, 0.52, 0.04, 0.7, '#2a2f33'); b.box(0, -0.4 + Y, 0.2, 0.2, 0.06, 0.3, '#f1efe8'); }
  else b.box(0, -0.52 + Y, 0.12, 0.52, 0.04, 0.7, '#0e0f11');
  return b.build();
});
/** Таз: шорти. */
const hipsGeo = (kit) => cached('hp' + kit.shorts, () => {
  const b = new VoxelBuilder(0.18, true);
  b.box(0, 0.19, 0, 1.3, 0.34, 0.8, kit.shorts);
  return b.build();
});
/** Плече (рукав) і передпліччя (шкіра або рукавиця воротаря): між ними лікоть. */
const upperGeo = (kit, gk) => cached('up' + kit.second + kit.main + (kit.sleeve || '') + gk, () => {
  const b = new VoxelBuilder(0.22, true), c = gk ? kit.main : (kit.sleeve || kit.second);
  b.box(0, 0.0, 0, 0.46, 0.2, 0.44, c);               // дельта (плече)
  b.box(0, -0.2, 0, 0.4, 0.28, 0.38, c);              // біцепс/трицепс, звужується до ліктя
  b.box(0, -0.36, 0, 0.34, 0.1, 0.34, c);
  b.box(0, -0.43, 0, 0.38, 0.06, 0.38, gk || !kit.under ? kit.main : '#c01a26');     // манжета рукава
  if (gk) { b.box(0, -0.3, -0.2, 0.44, 0.2, 0.1, kit.second); b.box(0, 0.06, 0, 0.52, 0.24, 0.5, kit.second); }   // налокітник і плечова накладка
  return b.build();
});
const foreGeo = (gk, skin, under) => cached('fo' + gk + skin + (under || ''), () => {
  const b = new VoxelBuilder(0.22, true), sk = (!gk && under) ? under : skin;
  b.box(0, -0.03, 0, 0.3, 0.12, 0.3, sk);           // лікоть
  b.box(0, -0.16, 0, 0.3, 0.16, 0.3, sk);           // м'яз передпліччя (товщий угорі)
  b.box(0, -0.31, 0, (!gk && under) ? 0.26 : 0.24, 0.16, (!gk && under) ? 0.26 : 0.24, sk);         // зап'ясток вужчий
  b.box(0, -0.46, 0.02, 0.32, 0.16, 0.26, skin);      // долоня
  b.box(0.17, -0.42, 0.06, 0.08, 0.12, 0.1, skin);    // великий палець
  b.box(0, -0.57, 0.04, 0.3, 0.07, 0.22, skin);       // пальці
  if (gk) {
    b.box(0, -0.3, 0, 0.36, 0.1, 0.36, '#23272b');                                    // манжета зап'ястка
    b.box(0, -0.46, 0.02, 0.58, 0.3, 0.46, '#d9772a');                                // долоня рукавиці
    for (const fx of [-0.2, -0.07, 0.07, 0.2]) b.box(fx, -0.68, 0.04, 0.11, 0.18, 0.34, '#f0a050');   // пальці
    b.box(0.34, -0.5, 0.1, 0.12, 0.24, 0.2, '#f0a050');                               // великий палець
    b.box(0, -0.46, 0.25, 0.46, 0.2, 0.06, '#8a4a16');                                // подушечка
  }
  return b.build();
});

/** Зачіски: кілька шарів і відтінків (темний «андеркат», світлі блики), виголені боки, чубчики, щетина на лисині. */
const mixc = (a, c, t) => '#' + new THREE.Color(a).lerp(new THREE.Color(c), t).getHexString();
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
      sides(fade, 0.3, 0.32); back(0.5, 0.3, fade);
      break;
    case 'slick':
      top(0.2, 0.5); b.box(0, hy + 0.66, -0.1, 0.9, 0.12, 0.62, hc); b.box(0.05, hy + 0.72, 0.18, 0.85, 0.12, 0.45, lt); b.box(0.0, hy + 0.62, 0.42, 0.9, 0.12, 0.16, lt);
      b.box(-0.3, hy + 0.7, 0.1, 0.04, 0.06, 0.95, dk);                        // проділ
      sides(fade, 0.26, 0.46); back(0.72, 0.1, dk);
      break;
    case 'curly': {
      const pts = [[0, 0.7, 0, 0.5], [-0.34, 0.66, 0.1, 0.42], [0.34, 0.66, 0.1, 0.42], [-0.3, 0.64, -0.3, 0.4], [0.3, 0.64, -0.3, 0.4], [0, 0.66, -0.36, 0.44], [-0.36, 0.62, 0.38, 0.36], [0.36, 0.62, 0.38, 0.36], [0, 0.62, 0.42, 0.36],
        [-0.5, 0.36, -0.1, 0.34], [0.5, 0.36, -0.1, 0.34], [-0.48, 0.18, -0.34, 0.34], [0.48, 0.18, -0.34, 0.34], [0, 0.22, -0.5, 0.4], [-0.26, 0.1, -0.52, 0.32], [0.26, 0.1, -0.52, 0.32]];
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
      hts.forEach((h, i) => b.box(0, hy + 0.52 + h * 0.5, -0.42 + i * 0.21, 0.24, h, 0.2, i % 2 ? hc : lt));
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

/** Тулуб + голова в одному мешеві: обличчя й номер лежать в UV-атласі. */
function bodyGeo(look) {
  const { kit, skin } = look, light = kit.ink === 'light';
  const b = new VoxelBuilder(0.18, true);
  b.box(0, 0.775, 0, 1.3, 0.95, 0.8, kit.main);
  b.box(0, 1.2, 0, 1.0, 0.1, 0.66, kit.collar || kit.second);                 // комір
  if (kit.collar) { b.ao = 0; b.box(0, 1.17, 0.335, 0.34, 0.12, 0.04, kit.collar); b.ao = 0.18; }
  if (kit.stripe) { b.ao = 0; for (const sx of [-0.5, 0.5]) b.box(sx, 0.78, 0.404, 0.15, 0.88, 0.03, kit.stripe); b.ao = 0.18; }
  if (look.gk) { b.box(-0.68, 1.16, 0, 0.18, 0.18, 0.7, kit.second); b.box(0.68, 1.16, 0, 0.18, 0.18, 0.7, kit.second); b.box(0, 0.58, 0.41, 0.9, 0.1, 0.02, kit.second); }   // накладки на плечах і смуга на животі
  const num = numberCell(look.num, light);
  b.ao = 0;
  if (kit.sponsor) {                                                                // емблема на лівій стороні грудей і «УЗ» зі смугами по центру
    const zf = 0.405;
    b.box(0.4, 1.0, zf, 0.24, 0.28, 0.03, '#f1efe8'); b.box(0.4, 0.99, zf + 0.012, 0.2, 0.22, 0.03, '#1f8f3f'); b.box(0.4, 1.06, zf + 0.025, 0.2, 0.08, 0.03, '#d4202c');
    const pix = (rows, x0, y0, c) => rows.forEach((row, ry) => [...row].forEach((ch, rx) => { if (ch === 'X') b.box(x0 + rx * 0.075, y0 - ry * 0.075, zf, 0.078, 0.078, 0.03, c); }));
    pix(['X.X', 'X.X', '.XX', '..X', 'XX.'], -0.2, 1.0, '#f4f4ee');
    pix(['XXX', '..X', '.XX', '..X', 'XXX'], 0.05, 1.0, '#f4f4ee');
    b.box(0, 0.58, zf, 0.52, 0.045, 0.03, '#f4f4ee'); b.box(0, 0.5, zf, 0.52, 0.045, 0.03, '#f4f4ee'); b.box(0, 0.42, zf, 0.52, 0.045, 0.03, '#f4f4ee');
  } else {
    b.box(0, 0.84, 0.405, 0.6, 0.6, 0.03, '#ffffff', 0, 0, 0, [null, null, null, null, num, null]);
  }
  b.box(0, 0.84, -0.405, 0.62, 0.62, 0.03, '#ffffff', 0, 0, 0, [null, null, null, null, null, num]);   // номер на спині
  b.ao = 0.18;
  return b.build();
}

/** Голова на шиї: початок координат = основа шиї. Обличчя й вуха в тому ж меші, UV обличчя змінюється при емоціях. */
function headGeo(look) {
  const { kit, skin } = look;
  const b = new VoxelBuilder(0.18, true);
  b.box(0, 0.02, 0, 0.42, 0.22, 0.4, skin);                                   // шия
  const headY = 0.55;
  const faceStart = b.n;
  b.box(0, headY, 0, 1.05, 1.05, 1.05, skin, 0, 0, 0, [null, null, null, null, faceCell('neutral', look.beard || 0), null]);
  hairBlock(b, look, kit, headY, skin);
  b.box(-0.55, headY - 0.05, 0, 0.1, 0.22, 0.2, skin); b.box(0.55, headY - 0.05, 0, 0.1, 0.22, 0.2, skin);
  const g = b.build();
  g.userData.faceStart = faceStart + 16;
  return g;
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
    this.lean = new THREE.Group(); this.lean.position.y = WAIST;          // грудна клітка гнеться навколо талії
    this.neck = new THREE.Group(); this.neck.position.y = NECK - WAIST; this.neck.rotation.order = 'ZYX';
    this.legL = new THREE.Group(); this.legR = new THREE.Group();
    this.shinL = new THREE.Group(); this.shinR = new THREE.Group();
    this.footL = new THREE.Group(); this.footR = new THREE.Group();
    this.armL = new THREE.Group(); this.armR = new THREE.Group();
    this.foreL = new THREE.Group(); this.foreR = new THREE.Group();
    this.root.add(this.body);
    this.body.add(this.pose);
    this.pose.add(this.pelvis, this.lean);
    this.pelvis.add(this.legL, this.legR);
    this.lean.add(this.armL, this.armR, this.neck);
    this.torso = new THREE.Mesh(undefined, m); this.torso.position.y = -WAIST;
    this.head = new THREE.Mesh(undefined, m);
    this.hips = new THREE.Mesh(undefined, m);
    this.thighLm = new THREE.Mesh(undefined, m); this.thighRm = new THREE.Mesh(undefined, m);
    this.shinLm = new THREE.Mesh(undefined, m); this.shinRm = new THREE.Mesh(undefined, m);
    this.footLm = new THREE.Mesh(undefined, m); this.footRm = new THREE.Mesh(undefined, m);
    this.upperLm = new THREE.Mesh(undefined, m); this.upperRm = new THREE.Mesh(undefined, m);
    this.foreLm = new THREE.Mesh(undefined, m); this.foreRm = new THREE.Mesh(undefined, m);
    this.lean.add(this.torso);
    this.neck.add(this.head);
    this.pelvis.add(this.hips);
    this.legL.add(this.thighLm, this.shinL); this.legR.add(this.thighRm, this.shinR);
    this.shinL.add(this.shinLm, this.footL); this.shinR.add(this.shinRm, this.footR);
    this.footL.add(this.footLm); this.footR.add(this.footRm);
    this.armL.add(this.upperLm, this.foreL); this.armR.add(this.upperRm, this.foreR);
    this.foreL.add(this.foreLm); this.foreR.add(this.foreRm);
    this.legL.position.set(-0.3, 0, 0); this.legR.position.set(0.3, 0, 0);
    this.shinL.position.y = -THIGH; this.shinR.position.y = -THIGH;
    this.footL.position.y = -SHIN; this.footR.position.y = -SHIN;
    this.armL.position.set(-0.87, 1.12 - WAIST, 0); this.armR.position.set(0.87, 1.12 - WAIST, 0);
    this.foreL.position.y = -UPPER; this.foreR.position.y = -UPPER;

    this.x = 0; this.z = 0; this.vx = 0; this.vz = 0;
    this.yaw = 0; this.bodyYaw = 0;
    this.phase = Math.random() * 6; this.mode = 'idle'; this.modeT = 0; this.modeD = 0; this.power = 0;
    this.diveDir = 0; this.diveKind = 0; this.expr = 'neutral'; this.exprT = 0;
    this.kicking = 0; this.kickAmp = 1; this.kickPow = 0; this.t = Math.random() * 10;
    this.threat = 0; this.threatYaw = 0; this.dribble = false; this.style = 0; this.amp = 1;
    this.r = { tx: 0, tz: 0, leanX: 0, legs: 0, arms: 0, drop: 0, spread: 0 };
    // згладжені значення суглобів: рухи плавно переходять один в одний, коли гравець зупиняється чи починає біг
    this.sm = { legA: 0, legB: 0, kneeA: 0.06, kneeB: 0.06, ankA: 0, ankB: 0, armA: 0, armB: 0, elbA: 0.3, elbB: 0.3, spread: 0, leanX: 0, leanY: 0, leanZ: 0, tiltX: 0, tiltZ: 0, drop: 0, pelY: 0, pelZ: 0, hdX: 0, hdY: 0, hdZ: 0 };
    this.gp = Math.random(); this.pvx = 0; this.pvz = 0; this.aLong = 0; this.aLat = 0; this.ik = { hip: 0, knee: 0 };
    this.setLook(look);
  }

  setLook(look) {
    this.look = look;
    const { kit, gk } = look;
    if (this.torso.geometry && this.torso.geometry.dispose) this.torso.geometry.dispose();
    if (this.head.geometry && this.head.geometry.dispose) this.head.geometry.dispose();
    this.torso.geometry = bodyGeo(look);
    this.head.geometry = headGeo(look);
    this.hips.geometry = hipsGeo(kit);
    this.thighLm.geometry = this.thighRm.geometry = thighGeo(kit, !!gk);
    this.shinLm.geometry = this.shinRm.geometry = shinGeo(kit, !!gk);
    this.footLm.geometry = this.footRm.geometry = footGeo(kit, !!gk);
    const as = gk ? 1.1 : 1; this.armL.scale.setScalar(as); this.armR.scale.setScalar(as);   // воротар має довші руки для дотяжки
    this.upperLm.geometry = this.upperRm.geometry = upperGeo(kit, !!gk);
    this.foreLm.geometry = this.foreRm.geometry = foreGeo(!!gk, look.skin, kit.under);
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
  setMode(m, t = 0) { this.mode = m; this.modeT = t; this.modeD = t; }
  kick(power = 1) { this.kicking = 0.0001; this.kickPow = power; this.kickAmp = 0.6 + 0.6 * power; this.setExpr('angry', 0.6); }
  cheer(t = 2.4) {
    this.setMode('cheer', t); this.setExpr('happy', t);
    const pool = [0, 1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 6, 7, 10, 12];
    this.style = Math.random() < 0.08 ? 5 : pool[(Math.random() * pool.length) | 0]; this.amp = 0.6 + Math.random() * 0.5;
  }
  sad(t = 2.4) { this.setMode('sad', t); this.setExpr('shock', t); this.style = (Math.random() * 4) | 0; }
  control() { this.style = Math.random() < 0.5 ? 0 : 1; this.setMode('control', 0.45); }
  chest() { this.setMode('chest', 0.55); this.setExpr('shock', 0.4); }
  header() { this.setMode('header', 0.6); this.setExpr('angry', 0.5); }
  block() { this.setMode('block', 0.5); this.setExpr('shock', 0.4); }
  hit() { if (this.mode !== 'idle') return; this.setMode('hit', 0.4); this.setExpr('shock', 0.5); }
  tackle() { this.setMode('tackle', 0.55); this.setExpr('angry', 0.5); }
  stumble() { this.setMode('stumble', 1.25); this.setExpr('shock', 0.9); }
  slideTackle() { this.setMode('slide', 1.6); this.setExpr('angry', 0.7); }
  kneel() { this.setMode('kneel', 1.5); this.setExpr('happy', 1.5); }
  gkDive(dir, kind = 0) { this.diveDir = dir; this.diveKind = kind; this.setMode('gkdive', 1.7); this.setExpr('shock', 1.0); }
  /** Керований стрибок воротаря (пенальті): прогрес diveP задає зовнішній код, поза будується безперервно. */
  startPDive(dir, high) { this.mode = 'pdive'; this.modeT = 999; this.modeD = 999; this.diveDir = dir; this.diveKind = high ? 0 : 1; this.diveP = 0; this.setExpr('shock', 2); }
  /** Керований удар (пенальті): прогрес kickP задає зовнішній код (0..1): замах → контакт ≈0.35 → проводка. */
  startPKick() { this.mode = 'pkick'; this.modeT = 999; this.modeD = 999; this.kickP = 0; this.setExpr('angry', 1.4); }
  gkJump() { this.setMode('gkjump', 0.7); this.setExpr('shock', 0.6); }
  parry() { if (this.mode === 'gkdive' || this.mode === 'gkjump') return; this.setMode('parry', 0.45); }
  throwBall() { this.setMode('throw', 0.7); }
  setThreat(v, yaw) { this.threat = v; this.threatYaw = yaw; }

  /** Підйом з землі: сісти/перекотитись → присісти → випрямитись. q 0..1. Результат в this.r. */
  rise(q, tx0, tz0) {
    const r = this.r;
    if (q < 0.34) {                         // упор руками
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
      const dy = angDiff(this.bodyYaw, this.yaw), wmax = (13 - 6 * sp) * dt;
      this.bodyYaw += clamp(dy * Math.min(1, dt * 12), -wmax, wmax);
    }
    this.body.rotation.y = this.bodyYaw;
    const turn = dt > 0 ? angDiff(prevYaw, this.bodyYaw) / dt : 0;
    const acc = dt > 0 ? (speed - (this.pSpeed || 0)) / dt : 0; this.pSpeed = speed;
    this.accL = (this.accL || 0) + (clamp(acc, -25, 25) - (this.accL || 0)) * Math.min(1, dt * 8);
    // прискорення з вектора швидкості: поздовжнє (розгін/гальмування) і бічне (поворот) у системі координат тіла
    if (dt > 0) {
      const ax = (this.vx - this.pvx) / dt, az = (this.vz - this.pvz) / dt, hs = Math.sin(this.bodyYaw), hc = Math.cos(this.bodyYaw);
      const al = clamp(ax * hs + az * hc, -30, 30), at = clamp(ax * hc - az * hs, -30, 30);
      const kk = Math.min(1, dt * 9); this.aLong += (al - this.aLong) * kk; this.aLat += (at - this.aLat) * kk;
    }
    this.pvx = this.vx; this.pvz = this.vz;

    if (this.exprT > 0) { this.exprT -= dt; if (this.exprT <= 0) this.setExpr('neutral'); }
    if (this.modeT > 0) { this.modeT -= dt; if (this.modeT <= 0) this.mode = 'idle'; }

    let aBoost = 0, legA = 0, legB = 0, kneeA = 0.06, kneeB = 0.06, armA = 0, armB = 0, elbA = 0.3, elbB = 0.3;
    let leanX = 0, leanZ = 0, leanY = 0, bob = 0, lift = 0, spread = 0, drop = 0;
    let tiltX = 0, tiltZ = 0, tiltY = 0, flip = 0, slide = 0;
    let ankA = null, ankB = null, pelY = 0, pelZ = 0, hdX = 0, hdY = 0, hdZ = 0;
    const loc = { legA: 0, legB: 0, kneeA: 0, kneeB: 0, on: false };
    const grounded = this.mode === 'slide' || this.mode === 'gkdive' || this.mode === 'stumble' || this.mode === 'kneel';

    if (speed > 0.5 && !grounded) {
      // ---- біг за фізикою контакту: стопа опори нерухома відносно трави (швидкість стопи відносно таза = −швидкість тіла),
      // довжина кроку й час контакту залежать від швидкості, висота таза випливає з довжини ноги (перевернутий маятник + пружина).
      const vm = speed / (this.root.scale.x || 0.82), spd = clamp(vm / 9, 0, 1);
      const Ls = 0.4 + 0.22 * vm, D = clamp(Ls * 1.1, 0.35, 0.9 + 0.014 * vm);
      const beta = D / (2 * Ls), fs = vm / Ls;
      this.gp = (this.gp + fs * 0.5 * dt) % 1; this.phase = this.gp * TAU;
      const clear = 0.06 + 0.4 * spd, comp = 0.03 + 0.07 * spd, ik = this.ik;
      const leg = (ph) => {
        if (ph < beta) {                                                  // опора: щиколотка їде назад із швидкістю бігу
          const u = ph / beta, x = D * 0.5 * (1 - 2 * u);
          const psi = u < 0.25 ? 0.25 * (1 - u / 0.25) : u < 0.6 ? 0 : -0.55 * smooth((u - 0.6) / 0.4);
          const eps = 0.985 - comp * Math.sin(Math.PI * u);
          return { st: true, u, x, psi, hh: YA + Math.sqrt(Math.max(0.05, eps * eps * LEG * LEG - x * x)) };
        }
        const u = (ph - beta) / (1 - beta), e = smooth(u);                // мах: нога несеться вперед, коліно згинається
        return { st: false, u, x: -D * 0.5 + D * e, y: clear * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.8)), 1.1), psi: lerp(-0.55, 0.25, e), hh: 0 };
      };
      const A = leg(this.gp), B = leg((this.gp + 0.5) % 1);
      // висота таза: опорна нога задає її; у польоті — балістична дуга
      let hh;
      if (A.st && B.st) hh = (A.hh + B.hh) * 0.5; else if (A.st) hh = A.hh; else if (B.st) hh = B.hh;
      else {
        const tf = (0.5 - beta) / (fs * 0.5), uf = ((this.gp % 0.5) - beta) / (0.5 - beta);
        hh = YA + Math.sqrt(Math.max(0.05, 0.985 * 0.985 * LEG * LEG - D * D * 0.25)) + 4 * (G_ACC / (this.root.scale.x || 0.82)) * tf * tf / 8 * clamp(uf, 0, 1) * (1 - clamp(uf, 0, 1));
      }
      const solve = (f) => {
        const ay = f.st ? 0 : f.y, psi = f.psi;
        const lift_ = YA * Math.cos(psi) + (psi > 0 ? 0.26 * Math.sin(psi) : -0.3 * Math.sin(psi)) - YA + ay;   // щиколотка піднімається разом із п'ятою або носком
        legIK(f.x, hh - (YA + lift_), ik);
        return { hip: ik.hip, knee: ik.knee, ank: -psi + ik.hip - ik.knee };
      };
      const SA = solve(A), SB = solve(B);
      legA = SA.hip; legB = SB.hip; kneeA = SA.knee; kneeB = SB.knee; ankA = SA.ank; ankB = SB.ank;
      loc.legA = legA; loc.legB = legB; loc.kneeA = kneeA; loc.kneeB = kneeB; loc.on = true;
      bob = hh - HIP; drop = 0;
      // руки працюють проти ніг (збереження кутового моменту): амплітуда з розмаху стегон; лікоть згинається більше при бігу
      const dsw0 = clamp((legA - legB) / 1.4, -1, 1), ka = 0.45 + 0.95 * spd;
      armA = 0.1 - dsw0 * ka; armB = 0.1 + dsw0 * ka;
      const eb = 0.45 + 0.95 * spd;
      elbA = eb + 0.5 * spd * Math.max(0, armA); elbB = eb + 0.5 * spd * Math.max(0, armB);
      // таз і плечі крутяться назустріч, таз провисає на боці маху, тулуб нахиляється від прискорення й у повороті
      const dsw = clamp((legA - legB) / 1.5, -1, 1), tw = 0.25 + 0.75 * spd;
      pelY = 0.16 * tw * dsw; leanY = -0.24 * tw * dsw; tiltY = 0;
      pelZ = -0.045 * tw * ((A.st ? 1 : 0) - (B.st ? 1 : 0));
      leanX = 0.03 + 0.12 * spd + clamp(Math.atan(this.aLong / G_ACC) * 0.95, -0.4, 0.42);
      leanZ = -clamp(Math.atan(this.aLat / G_ACC) * 1.05, -0.5, 0.5) + 0.03 * tw * ((A.st ? 1 : 0) - (B.st ? 1 : 0));
      spread = 0.07 + 0.1 * spd + clamp(Math.abs(turn) * 0.045, 0, 0.55) * spd;
      aBoost = clamp(this.accL * 0.02, 0, 0.3); armA += armA < 0 ? -aBoost : aBoost; armB += armB < 0 ? -aBoost : aBoost;
      if (this.dribble) { leanX += 0.08; armA *= 0.65; armB *= 0.65; spread += 0.16; leanZ += Math.sin(this.phase * 2) * 0.04; }
    } else if (!grounded) {
      bob = Math.sin(this.t * 1.6) * 0.007; { const g = Math.sin(this.t * 0.7 + (this.ph0 ??= Math.random() * 20)), hips = Math.sin(this.t * 0.23 + (this.ph0 ??= Math.random() * 20) * 2) > 0.55; armA = armB = hips ? -0.25 : 0.05 + 0.04 * g; elbA = elbB = hips ? 1.9 : 0.35 + 0.1 * g; spread = hips ? 0.5 : 0.08 + 0.03 * g; }          // майже статична стійка
      leanX = clamp(Math.atan(this.aLong / G_ACC) * 0.6, -0.3, 0.3);                // гальмування до зупинки відкидає корпус назад
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
        const st = this.style, a = this.amp;
        elbA = elbB = 0.3;
        if (st === 0) { lift = Math.abs(Math.sin(this.t * 8)) * 0.85 * a; armA = armB = 2.7 + Math.sin(this.t * 18) * 0.3; spread = 0.45; legA = Math.sin(this.t * 8) * 0.45; legB = -legA; kneeA = kneeB = 0.5 * Math.abs(Math.sin(this.t * 8)); }
        else if (st === 1) { lift = Math.abs(Math.sin(this.t * 6.5)) * 0.5 * a; armA = 2.5; armB = Math.sin(this.t * 14) * 0.6 + 1.2; elbB = 1.6; spread = 0.35; leanX = -0.12; }
        else if (st === 2) { lift = Math.abs(Math.sin(this.t * 9)) * 0.45 * a; armA = armB = 1.55; spread = 1.0; leanZ = Math.sin(this.t * 4.5) * 0.25; leanX = 0.15; elbA = elbB = 0.1; }
        else if (st === 3) { lift = Math.abs(Math.sin(this.t * 7)) * 0.35 * a; armA = armB = 2.35; spread = 0.12; leanX = 0.1; bob = Math.sin(this.t * 14) * 0.03; elbA = elbB = 1.7; }
        else if (st === 4) { armA = Math.sin(this.t * 9) * 1.2; armB = -armA; elbA = elbB = 0.9; legA = Math.sin(this.t * 9) * 0.5; legB = -legA; kneeA = 0.3 + Math.max(0, legA) * 0.8; kneeB = 0.3 + Math.max(0, legB) * 0.8; leanZ = Math.sin(this.t * 4.5) * 0.18; bob = Math.abs(Math.sin(this.t * 9)) * 0.1; spread = 0.5; }
        else if (st === 6) {                                   // «Локомотив»: руки-шатуни, крок на місці
          const w = Math.sin(this.t * 10);
          armA = 0.5 + w * 0.9; armB = 0.5 - w * 0.9; elbA = elbB = 1.5; legA = w * 0.8; legB = -legA;
          kneeA = 0.3 + Math.max(0, legA) * 1.0; kneeB = 0.3 + Math.max(0, legB) * 1.0; leanX = 0.22; lift = Math.abs(w) * 0.18; spread = 0.1; bob = Math.sin(this.t * 20) * 0.02;
        } else if (st === 7) {                                 // стрибок із обертом на 360° і руки вниз
          const q = clamp((md - this.modeT) / 0.9, 0, 1), e2 = easeOut(q);
          this.body.rotation.y = this.bodyYaw + e2 * TAU;
          lift = Math.sin(q * Math.PI) * 1.15 * a; armA = armB = q < 1 ? 0.2 : 0.1; spread = q < 1 ? 0.9 : 0.55; legA = q < 1 ? 0.5 : 0.12; legB = q < 1 ? -0.3 : -0.12; kneeA = kneeB = q < 1 ? 0.9 : 0.1; leanX = q < 1 ? 0.1 : -0.18;
        } else if (st === 8) {                                 // «тихо!»: палець до губ
          armA = 2.95; elbA = 2.7; armB = 0.7; elbB = 1.7; spread = 0.18; leanX = -0.08; bob = Math.sin(this.t * 2) * 0.012;
        } else if (st === 9) {                                 // колиска
          armA = armB = 0.95; elbA = elbB = 1.75; spread = 0.0; leanZ = Math.sin(this.t * 3) * 0.22; leanX = 0.1; bob = Math.sin(this.t * 3) * 0.015;
        } else if (st === 10) {                                // літак: руки в боки, нахили
          armA = armB = 0.0; spread = 1.5; leanZ = Math.sin(this.t * 2.4) * 0.38; leanX = 0.15; lift = Math.abs(Math.sin(this.t * 2.4)) * 0.12; legA = Math.sin(this.t * 4) * 0.25; legB = -legA;
        } else if (st === 11) {                                // відданя честі
          armA = 2.5; elbA = 2.35; armB = 0.05; elbB = 0.2; spread = 0.12; leanX = -0.04; bob = Math.sin(this.t * 6) * 0.01;
        } else if (st === 12) {                                // дэб
          armA = 2.3; elbA = 2.45; armB = 1.75; elbB = 0.1; spread = 0.5; leanX = 0.14; leanZ = 0.05;
        } else { const q = clamp((md - this.modeT) / 0.9, 0, 1); flip = -easeOut(q) * TAU; lift = Math.sin(q * Math.PI) * 1.5; armA = armB = q < 1 ? 1.2 : 2.7; spread = 0.4; legA = q < 1 ? 1.0 : 0; legB = q < 1 ? -0.4 : 0; kneeA = kneeB = q < 1 ? 1.4 : 0.06; }
        break;
      }
      case 'sad': {
        const st = this.style;
        if (speed > 0.5) { armA = armB = 1.9; elbA = elbB = 1.2; leanX = 0.3; break; }
        if (st === 0) { leanX = 0.3; armA = armB = 2.5; elbA = elbB = 2.0; spread = 0.15; }
        else if (st === 1) { leanX = 0.85; armA = armB = 0.55; elbA = elbB = 0.2; spread = 0.12; legA = 0.1; legB = -0.1; kneeA = kneeB = 0.3; drop = 0.05; }
        else if (st === 2) { leanX = 0.4; armA = armB = 0.2; const k = clamp((mk - 0.2) / 0.3, 0, 1); legB = Math.sin(k * Math.PI) * 1.2; kneeB = 0.4 + 0.7 * Math.sin(k * Math.PI); }
        else { leanX = 0.35; armA = armB = 0.3; leanY = Math.sin(mk * 18) * 0.28 * (1 - mk); }
        bob = -0.05;
        break;
      }
      case 'gkwait': { const w = Math.sin(this.t * 5.5); const hop = this.splitT > 0 ? Math.sin(clamp(1 - this.splitT / 0.18, 0, 1) * Math.PI) * 0.22 : 0; if (this.splitT > 0) this.splitT -= dt; lift = hop; legA = 0.18; legB = -0.1; kneeA = kneeB = 0.38 + Math.abs(w) * 0.08; drop = 0.1; armA = armB = 0.35; elbA = elbB = 0.8; spread = 0.95 + w * 0.05; leanX = 0.28; leanZ = w * 0.07; bob = Math.abs(w) * 0.025; break; }
      case 'catch': armA = armB = 1.45; elbA = elbB = 1.1; spread = 0.12; leanX = 0.2; break;
      case 'control': {
        if (this.style === 0) { legB = 1.0 * sn; legA = -0.2 * sn; kneeB = 0.9 * sn; leanX = -0.2 * sn; armA = 0.5 * sn; armB = -0.5 * sn; spread = 0.4 * sn; lift = 0.06 * sn; }
        else { legB = 1.55 * sn; kneeB = 1.5 * sn; legA = -0.1 * sn; leanX = -0.3 * sn; armA = 0.6 * sn; armB = 0.2 * sn; spread = 0.55 * sn; drop = 0.03 * sn; }
        break;
      }
      case 'chest': { leanX = -0.42 * sn; armA = armB = 0.85 * sn; elbA = elbB = 0.9 * sn; spread = 0.6 * sn; legA = 0.25 * sn; legB = -0.3 * sn; kneeB = 0.5 * sn; lift = 0.14 * sn; break; }
      case 'header': { const up = Math.sin(clamp(mk * 1.15, 0, 1) * Math.PI); lift = 0.7 * up; leanX = mk < 0.4 ? -0.45 * (mk / 0.4) : -0.45 + 1.05 * smooth((mk - 0.4) / 0.35); if (mk > 0.75) leanX = 0.6 * (1 - (mk - 0.75) / 0.25); armA = armB = 1.0 * up; elbA = elbB = 0.8 * up; spread = 0.7 * up; legA = 0.5 * up; legB = -0.3 * up; kneeA = 0.9 * up; kneeB = 1.0 * up; break; }
      case 'block': { legB = 1.35 * sn; kneeB = 0.5 * sn; legA = -0.15 * sn; leanX = 0.25 * sn; armA = armB = 0.9 * sn; elbA = elbB = 0.7 * sn; spread = 0.5 * sn; break; }
      case 'hit': { leanX = -0.45 * sn; armA = armB = 1.0 * sn; elbA = elbB = 0.7 * sn; spread = 0.4 * sn; lift = 0.05 * sn; break; }
      case 'tackle': {
        tiltX = -0.8 * sn; legA = 0.5 * sn; legB = -0.3 * sn; kneeA = 0.2; kneeB = 1.1 * sn; leanX = 0.15 * sn; armA = -0.7 * sn; armB = 0.9 * sn; spread = 0.5 * sn;
        slide = 1.5 * Math.sin(Math.min(1, mk * 1.2) * Math.PI * 0.85);
        break;
      }
      case 'slide': {
        const down = mk < 0.18 ? easeOut(mk / 0.18) : 1;
        if (mk < 0.52) { tiltX = -1.32 * down; legA = 0.1 * down; legB = -0.1 * down; kneeA = 0.15; kneeB = 0.5 * down; armA = armB = -0.8 * down; elbA = elbB = 0.3; spread = 0.55 * down; leanX = -0.1 * down; }
        else { this.rise((mk - 0.52) / 0.48, -1.32, 0); tiltX = r.tx; leanX = r.leanX; legA = r.legs; legB = r.legs * 0.7; kneeA = r.legs * 1.15; kneeB = r.legs * 0.9; armA = armB = r.arms; spread = r.spread; drop = r.drop; }
        break;
      }
      case 'stumble': {
        if (mk < 0.18) { const q = easeOut(mk / 0.18); tiltX = -1.05 * q; armA = armB = 1.9 * q; elbA = elbB = 0.4; spread = 0.7 * q; legA = 0.3 * q; kneeA = 0.4 * q; lift = 0.18 * Math.sin(q * Math.PI); }
        else if (mk < 0.42) { tiltX = -1.05; armA = armB = 0.6; spread = 0.4; leanX = 0.05; kneeA = kneeB = 0.5; }
        else { this.rise((mk - 0.42) / 0.58, -1.05, 0); tiltX = r.tx; leanX = r.leanX; legA = r.legs; legB = r.legs * 0.8; kneeA = r.legs * 1.15; kneeB = r.legs * 0.95; armA = armB = r.arms; spread = r.spread; drop = r.drop; }
        break;
      }
      case 'kneel': {
        const e = easeOut(Math.min(1, mk * 2.4)), up = mk > 0.8 ? (mk - 0.8) / 0.2 : 0, k = e * (1 - up);
        slide = 2.4 * e * (1 - up * 0.5); tiltX = -0.32 * k; legA = legB = 0.05 * k; kneeA = kneeB = 1.6 * k + 0.06; drop = THIGH * k; leanX = -0.3 * k; armA = armB = 2.6 * k + 0.4 * up; spread = 0.5;
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
      case 'gkdive': this.diveP = mk < 0.62 ? mk / 0.62 : 1 + ((mk - 0.62) / 0.38) * 0.5;   // у матчі воротар стрибає тією ж детальною позою
      // fallthrough
      case 'pdive': {
        const P = this.diveP || 0, sg = (Math.sign(Math.sin(this.bodyYaw)) || 1) * this.diveDir, high = this.diveKind === 0, maxTilt = high ? 1.45 : 1.28;
        const sm = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
        const load = sm(P / 0.12) * (1 - sm((P - 0.1) / 0.1)), launch = sm((P - 0.09) / 0.3), settle = sm((P - 0.5) / 0.4);
        if (P < 1) {
          const glide = sm((P - 0.4) / 0.35), land = sm((P - 0.72) / 0.28);
          // тіло: нахил вбік, невеликий прогин спини в польоті, у кінці глибше лягає на бік
          tiltZ = sg * (maxTilt * launch + 0.14 * land);
          leanX = 0.38 * load - 0.14 * launch * (1 - land) + 0.1 * land;
          leanZ = sg * 0.14 * load;
          // політ: дуга стрибка, потім ковзання по траві
          lift = Math.sin(clamp((P - 0.09) / 0.55, 0, 1) * Math.PI) * (high ? 1.0 : 0.5) * (1 - settle * 0.3);
          // руки: у присіді назад, у відштовхуванні різко вгору до м'яча (ведуча вище), на приземленні амортизують уперед
          armA = -0.45 * load + (3.05 * launch) * (1 - 0.65 * land) + 0.0 * glide;
          armB = -0.35 * load + (2.7 * launch) * (1 - 0.6 * land);
          elbA = 0.55 * load + 0.04 * launch + 0.25 * land; elbB = 0.5 * load + 0.08 * launch + 0.3 * land;
          spread = 0.1 + 0.16 * launch + 0.2 * land - 0.1 * load;
          // ноги: поштовх відштовхувальною ногою (вона випрямляється назад), ведуча нога підтягнута; у польоті ноги разом, на ковзанні розслаблені
          legA = 0.95 * load - 0.55 * launch * (1 - glide * 0.6) + 0.15 * land;
          legB = 0.95 * load + 0.75 * launch * (1 - glide) + 0.1 * land;
          kneeA = 1.05 * load + 0.12 * launch + 0.35 * land;
          kneeB = 1.05 * load + 1.0 * launch * (1 - glide) + 0.4 * land;
          drop = THIGH * (1 - Math.cos(0.95 * load));
        } else {
          this.rise(clamp((P - 1) / 0.5, 0, 1), 0, sg * maxTilt); tiltZ = r.tz; leanX = r.leanX; legA = r.legs; legB = r.legs * 0.8; kneeA = r.legs * 1.15; kneeB = r.legs * 0.95; armA = armB = r.arms; spread = r.spread; drop = r.drop;
        }
        break;
      }
      case 'gkjump': {
        const up = mk < 0.18 ? -mk / 0.18 : Math.sin(clamp((mk - 0.18) / 0.5, 0, 1) * Math.PI);
        if (up < 0) { legA = legB = 0.7 * -up; kneeA = kneeB = 0.9 * -up; drop = THIGH * (1 - Math.cos(legA)); armA = armB = 0.6 * -up; }
        else { lift = up * 0.85; armA = armB = 3.0 * up; elbA = elbB = 0.15; legA = 0.8 * up; legB = -0.3 * up; kneeA = 1.2 * up; kneeB = 0.9 * up; spread = 0.35; leanX = -0.1 * up; }
        break;
      }
      case 'parry': { armA = armB = 2.2 * sn; elbA = elbB = 0.4; spread = 0.25; leanX = -0.25 * sn; lift = 0.25 * sn; break; }
      case 'throw': {
        const e = easeOut(mk);
        armA = armB = mk < 0.35 ? 2.9 : 2.9 - 3.4 * easeOut((mk - 0.35) / 0.65); elbA = elbB = mk < 0.35 ? 1.7 : 0.2; leanX = mk < 0.35 ? -0.25 : 0.3 * e; spread = 0.15; legA = 0.3 * e; legB = -0.2 * e;
        break;
      }
      default: break;
    }

    // під тиском суперника: закритий корпус і витягнута рука (статична поза)
    if (this.threat > 0.2 && (this.mode === 'idle' || this.mode === 'aim') && speed < 2.5) {
      const th = (this.threat - 0.2) / 0.8, side = Math.sin(this.threatYaw - this.yaw) >= 0 ? 1 : -1;
      bob -= 0.07 * th; leanX += 0.1 * th; spread += 0.28 * th;
      if (side > 0) { armB += 1.0 * th; elbB = 0.4; } else { armA += 1.0 * th; elbA = 0.4; }
      legA += 0.1 * th; legB -= 0.1 * th; kneeA = kneeB = 0.06 + 0.4 * th;
    }

    if (this.kicking > 0) {
      this.kicking += dt;
      const k = this.kicking / 0.7, A = this.kickAmp, pw = this.kickPow;
      if (k >= 1) this.kicking = 0;
      else if (k < 0.14) { const q = k / 0.14; legB = (-0.9 - 0.3 * q) * A; kneeB = 1.0 + 0.4 * q; leanX = -0.25 * A; armA = -0.7; armB = 0.8; elbA = elbB = 0.7; spread = 0.4; }
      else if (k < 0.36) {
        const q = (k - 0.14) / 0.22; legB = (-1.2 + easeOut(q) * 2.9) * A; kneeB = 1.4 * (1 - q * q) + 0.1; leanX = (-0.25 + easeOut(q) * 0.65) * A; armA = -0.7 + q * 0.5; armB = 0.8 - q * 0.9; spread = 0.5; legA = 0.2; kneeA = 0.3;
        lift = (pw > 0.85 ? 0.28 : 0.08) * Math.sin(q * Math.PI);
        if (pw < 0.4) { legB *= 0.8; spread = 0.3; }
      } else { const q = (k - 0.36) / 0.64; legB = 1.7 * A * (1 - q); kneeB = 0.1 + 0.6 * q; leanX = 0.4 * A * (1 - q); armA = -0.2 * (1 - q); armB = -0.1 * (1 - q); legA = 0.2 * (1 - q); spread = 0.5 * (1 - q); }
    }

    if (this.look.gk) {
      const busy = this.mode !== 'idle' && this.mode !== 'aim';
      if (!busy && !this.kicking) {                              // статична «пружна» стійка воротаря
        spread = Math.max(spread, 0.6); armA = armB = -0.12; elbA = elbB = 0.5;
        if (speed < 3) { legA = 0.3; legB = -0.3; kneeA = kneeB = 0.55; drop = THIGH * (1 - Math.cos(0.3)); leanX = Math.max(leanX, 0.16); }
      }
    }

    // стопа: якщо режим не задав щиколотку — тримаємо її рівно до землі при малому махові й тягнемо носок вниз при високому
    const defAnk = (lg, kn) => { const psi = lg > 0.35 ? -0.5 * clamp((lg - 0.35) / 1.2, 0, 1) : 0; return -psi + lg - kn; };
    if (ankA === null || !loc.on || legA !== loc.legA || kneeA !== loc.kneeA) ankA = defAnk(legA, kneeA);
    if (ankB === null || !loc.on || legB !== loc.legB || kneeB !== loc.kneeB) ankB = defAnk(legB, kneeB);
    // голова стабілізується проти розвороту грудей і нахилу, дивиться вперед
    hdY = -leanY * 0.55 - pelY * 0.2; hdX = -leanX * 0.45; hdZ = -leanZ * 0.6;

    // ---- згладжування суглобів і застосування
    const S = this.sm, k2 = Math.min(1, dt * 38), kl = loc.on ? Math.min(1, dt * 80) : k2;
    S.legA += (legA - S.legA) * kl; S.legB += (legB - S.legB) * kl;
    S.kneeA += (kneeA - S.kneeA) * kl; S.kneeB += (kneeB - S.kneeB) * kl;
    S.ankA += (ankA - S.ankA) * kl; S.ankB += (ankB - S.ankB) * kl;
    S.armA += (armA - S.armA) * k2; S.armB += (armB - S.armB) * k2;
    S.elbA += (elbA - S.elbA) * k2; S.elbB += (elbB - S.elbB) * k2;
    S.spread += (spread - S.spread) * k2; S.drop += (drop - S.drop) * k2;
    S.leanX += (leanX - S.leanX) * k2; S.leanY += (leanY - S.leanY) * k2; S.leanZ += (leanZ - S.leanZ) * k2;
    S.tiltX += (tiltX - S.tiltX) * k2; S.tiltZ += (tiltZ - S.tiltZ) * k2;
    S.pelY += (pelY - S.pelY) * k2; S.pelZ += (pelZ - S.pelZ) * k2;
    S.hdX += (hdX - S.hdX) * k2; S.hdY += (hdY - S.hdY) * k2; S.hdZ += (hdZ - S.hdZ) * k2;

    this.legL.rotation.x = -S.legA; this.legR.rotation.x = -S.legB;
    this.shinL.rotation.x = S.kneeA; this.shinR.rotation.x = S.kneeB;
    this.footL.rotation.x = S.ankA; this.footR.rotation.x = S.ankB;
    this.pelvis.rotation.set(0, S.pelY, S.pelZ);
    this.armL.rotation.x = -S.armA; this.armR.rotation.x = -S.armB;
    const lagA = clamp((S.armA - (S.pArmA || 0)) / Math.max(dt, 1e-3) * 0.03, -0.35, 0.35), lagB = clamp((S.armB - (S.pArmB || 0)) / Math.max(dt, 1e-3) * 0.03, -0.35, 0.35);
    S.pArmA = S.armA; S.pArmB = S.armB;
    this.foreL.rotation.x = -(S.elbA + lagA); this.foreR.rotation.x = -(S.elbB + lagB);
    this.armL.rotation.z = -S.spread; this.armR.rotation.z = S.spread;
    this.lean.rotation.set(S.leanX, S.leanY, S.leanZ);
    this.neck.rotation.set(S.hdX, S.hdY, S.hdZ);
    // висота стегон з нахилу всього тіла: лежачи — на траві, а не в ній
    const cosT = Math.max(0, Math.cos(S.tiltX) * Math.cos(S.tiltZ));
    const hip = Math.max(0.4, 0.42 + 0.63 * cosT - S.drop + bob);
    this.pose.position.y = hip + lift;
    this.pose.rotation.set(S.tiltX + flip, tiltY, S.tiltZ);
    const hy = this.yaw, sx = Math.sin(hy), cx = Math.cos(hy);
    this.root.position.set(this.x + sx * slide, 0, this.z + cx * slide);
  }
}
