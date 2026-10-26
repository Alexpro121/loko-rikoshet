import * as THREE from 'three';
import { VoxelBuilder } from './voxel.js';
import { playerAtlas, faceCell, numberCell } from './textures.js';

const HIP = 1.05;
const THIGH = 0.52, UPPER = 0.43;          // довжина стегна й плеча: тут розміщені колінний і ліктьовий суглоби
const TAU = Math.PI * 2;
export const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const easeOut = (t) => 1 - (1 - t) * (1 - t);
const smooth = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;

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
const thighGeo = (kit) => cached('th' + kit.shorts + kit.socks, () => {
  const b = new VoxelBuilder(0.22, true);
  b.box(0, -0.22, 0, 0.58, 0.44, 0.58, kit.shorts);
  b.box(0, -0.48, 0, 0.46, 0.1, 0.46, kit.socks);
  return b.build();
});
const shinGeo = (kit) => cached('sh' + kit.socks, () => {
  const b = new VoxelBuilder(0.22, true);
  b.box(0, -0.19, 0, 0.46, 0.38, 0.46, kit.socks);
  b.box(0, -0.43, 0.07, 0.5, 0.2, 0.66, '#17191c');
  return b.build();
});
/** Плече (рукав) і передпліччя (шкіра або рукавиця воротаря): між ними лікоть. */
const upperGeo = (kit, gk) => cached('up' + kit.second + kit.main + gk, () => {
  const b = new VoxelBuilder(0.22, true), c = gk ? kit.main : kit.second;
  b.box(0, 0.0, 0, 0.46, 0.2, 0.44, c);               // дельта (плече)
  b.box(0, -0.2, 0, 0.4, 0.28, 0.38, c);              // біцепс/трицепс, звужується до ліктя
  b.box(0, -0.36, 0, 0.34, 0.1, 0.34, c);
  b.box(0, -0.43, 0, 0.38, 0.06, 0.38, kit.main);     // манжета рукава
  return b.build();
});
const foreGeo = (gk, skin) => cached('fo' + gk + skin, () => {
  const b = new VoxelBuilder(0.22, true);
  b.box(0, -0.03, 0, 0.3, 0.12, 0.3, skin);           // лікоть
  b.box(0, -0.16, 0, 0.3, 0.16, 0.3, skin);           // м'яз передпліччя (товщий угорі)
  b.box(0, -0.31, 0, 0.24, 0.16, 0.24, skin);         // зап'ясток вужчий
  b.box(0, -0.46, 0.02, 0.32, 0.16, 0.26, skin);      // долоня
  b.box(0.17, -0.42, 0.06, 0.08, 0.12, 0.1, skin);    // великий палець
  b.box(0, -0.57, 0.04, 0.3, 0.07, 0.22, skin);       // пальці
  if (gk) { b.box(0, -0.44, 0.02, 0.5, 0.3, 0.42, '#d9772a'); b.box(0, -0.6, 0.04, 0.46, 0.08, 0.36, '#f0a050'); }
  return b.build();
});

/** Тулуб + голова в одному мешеві: обличчя й номер лежать в UV-атласі. */
function bodyGeo(look) {
  const { kit, skin } = look, light = kit.ink === 'light';
  const b = new VoxelBuilder(0.18, true);
  b.box(0, 0.775, 0, 1.3, 0.95, 0.8, kit.main);
  b.box(0, 0.19, 0, 1.3, 0.32, 0.8, kit.shorts);
  b.box(0, 1.2, 0, 1.0, 0.1, 0.66, kit.second);
  if (kit.stripe) { b.ao = 0; for (const sx of [-0.5, 0.5]) b.box(sx, 0.78, 0.404, 0.15, 0.88, 0.03, kit.stripe); b.ao = 0.18; }   // зелені «рейки» на червоній футболці
  const num = numberCell(look.num, light);
  b.ao = 0;
  b.box(0, 0.84, 0.405, 0.6, 0.6, 0.03, '#ffffff', 0, 0, 0, [null, null, null, null, num, null]);
  b.ao = 0.18;
  const headY = 1.25 + 0.55, hc = look.hairCol;
  const faceStart = b.n;
  b.box(0, headY, 0, 1.05, 1.05, 1.05, skin, 0, 0, 0, [null, null, null, null, faceCell('neutral', look.beard || 0), null]);
  if (look.hair !== 'bald' && look.hair !== 'buzz') b.box(0, headY + 0.47, -0.04, 1.12, 0.24, 1.08, hc);
  if (look.hair === 'crop' || look.hair === 'band') { b.box(0, headY + 0.2, -0.5, 1.12, 0.56, 0.16, hc); b.box(0, headY + 0.4, 0.5, 1.12, 0.1, 0.1, hc); }
  if (look.hair === 'long') { b.box(0, headY - 0.05, -0.52, 1.14, 1.0, 0.2, hc); b.box(-0.56, headY, -0.1, 0.1, 0.8, 0.7, hc); b.box(0.56, headY, -0.1, 0.1, 0.8, 0.7, hc); }
  if (look.hair === 'buzz') b.box(0, headY + 0.5, -0.02, 1.08, 0.12, 1.06, hc);
  if (look.hair === 'slick') { b.box(0, headY + 0.5, 0, 1.12, 0.2, 1.1, hc); b.box(0.2, headY + 0.62, 0.08, 0.7, 0.16, 0.7, hc); b.box(0, headY + 0.1, -0.52, 1.1, 0.7, 0.14, hc); }
  if (look.hair === 'curly') { for (const [cx, cz] of [[-0.35, -0.3], [0.35, -0.3], [-0.35, 0.28], [0.35, 0.28], [0, 0], [0, -0.4]]) b.box(cx, headY + 0.62, cz, 0.42, 0.28, 0.42, hc); b.box(0, headY + 0.1, -0.54, 1.14, 0.8, 0.16, hc); b.box(-0.56, headY + 0.1, -0.1, 0.1, 0.55, 0.6, hc); b.box(0.56, headY + 0.1, -0.1, 0.1, 0.55, 0.6, hc); }
  if (look.hair === 'pony') { b.box(0, headY + 0.1, -0.54, 1.1, 0.8, 0.14, hc); b.box(0, headY - 0.2, -0.78, 0.3, 0.7, 0.3, hc); b.box(0, headY + 0.2, -0.64, 0.4, 0.2, 0.2, hc); }
  if (look.hair === 'mohawk') b.box(0, headY + 0.72, -0.02, 0.26, 0.4, 0.9, hc);
  if (look.hair === 'band') b.box(0, headY + 0.26, 0, 1.12, 0.14, 1.12, kit.second);
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
    this.lean = new THREE.Group();
    this.legL = new THREE.Group(); this.legR = new THREE.Group();
    this.shinL = new THREE.Group(); this.shinR = new THREE.Group();
    this.armL = new THREE.Group(); this.armR = new THREE.Group();
    this.foreL = new THREE.Group(); this.foreR = new THREE.Group();
    this.root.add(this.body);
    this.body.add(this.pose);
    this.pose.add(this.legL, this.legR, this.lean);
    this.lean.add(this.armL, this.armR);
    this.torso = new THREE.Mesh(undefined, m);
    this.thighLm = new THREE.Mesh(undefined, m); this.thighRm = new THREE.Mesh(undefined, m);
    this.shinLm = new THREE.Mesh(undefined, m); this.shinRm = new THREE.Mesh(undefined, m);
    this.upperLm = new THREE.Mesh(undefined, m); this.upperRm = new THREE.Mesh(undefined, m);
    this.foreLm = new THREE.Mesh(undefined, m); this.foreRm = new THREE.Mesh(undefined, m);
    this.lean.add(this.torso);
    this.legL.add(this.thighLm, this.shinL); this.legR.add(this.thighRm, this.shinR);
    this.shinL.add(this.shinLm); this.shinR.add(this.shinRm);
    this.armL.add(this.upperLm, this.foreL); this.armR.add(this.upperRm, this.foreR);
    this.foreL.add(this.foreLm); this.foreR.add(this.foreRm);
    this.legL.position.set(-0.3, 0, 0); this.legR.position.set(0.3, 0, 0);
    this.shinL.position.y = -THIGH; this.shinR.position.y = -THIGH;
    this.armL.position.set(-0.87, 1.12, 0); this.armR.position.set(0.87, 1.12, 0);
    this.foreL.position.y = -UPPER; this.foreR.position.y = -UPPER;

    this.x = 0; this.z = 0; this.vx = 0; this.vz = 0;
    this.yaw = 0; this.bodyYaw = 0;
    this.phase = Math.random() * 6; this.mode = 'idle'; this.modeT = 0; this.modeD = 0; this.power = 0;
    this.diveDir = 0; this.diveKind = 0; this.expr = 'neutral'; this.exprT = 0;
    this.kicking = 0; this.kickAmp = 1; this.kickPow = 0; this.t = Math.random() * 10;
    this.threat = 0; this.threatYaw = 0; this.dribble = false; this.style = 0; this.amp = 1;
    this.r = { tx: 0, tz: 0, leanX: 0, legs: 0, arms: 0, drop: 0, spread: 0 };
    // згладжені значення суглобів: рухи плавно переходять один в одний, коли гравець зупиняється чи починає біг
    this.sm = { legA: 0, legB: 0, kneeA: 0.06, kneeB: 0.06, armA: 0, armB: 0, elbA: 0.3, elbB: 0.3, spread: 0, leanX: 0, leanY: 0, leanZ: 0, tiltX: 0, tiltZ: 0, drop: 0 };
    this.setLook(look);
  }

  setLook(look) {
    this.look = look;
    const { kit, gk } = look;
    if (this.torso.geometry && this.torso.geometry.dispose) this.torso.geometry.dispose();
    this.torso.geometry = bodyGeo(look);
    this.thighLm.geometry = this.thighRm.geometry = thighGeo(kit);
    this.shinLm.geometry = this.shinRm.geometry = shinGeo(kit);
    this.upperLm.geometry = this.upperRm.geometry = upperGeo(kit, !!gk);
    this.foreLm.geometry = this.foreRm.geometry = foreGeo(!!gk, look.skin);
    this.root.scale.setScalar(look.scale || 0.82);
    this.expr = 'neutral'; this.exprT = 0;
  }

  setExpr(e, hold = 0) {
    this.exprT = hold;
    if (this.expr === e) return;
    this.expr = e;
    const uv = this.torso.geometry.attributes.uv, s = this.torso.geometry.userData.faceStart, r = faceCell(e, (this.look && this.look.beard) || 0);
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
    this.bodyYaw += angDiff(this.bodyYaw, this.yaw) * Math.min(1, dt * 14);
    this.body.rotation.y = this.bodyYaw;
    const turn = dt > 0 ? angDiff(prevYaw, this.bodyYaw) / dt : 0;
    const acc = dt > 0 ? (speed - (this.pSpeed || 0)) / dt : 0; this.pSpeed = speed;
    this.accL = (this.accL || 0) + (clamp(acc, -25, 25) - (this.accL || 0)) * Math.min(1, dt * 8);

    if (this.exprT > 0) { this.exprT -= dt; if (this.exprT <= 0) this.setExpr('neutral'); }
    if (this.modeT > 0) { this.modeT -= dt; if (this.modeT <= 0) this.mode = 'idle'; }

    let aBoost = 0, legA = 0, legB = 0, kneeA = 0.06, kneeB = 0.06, armA = 0, armB = 0, elbA = 0.3, elbB = 0.3;
    let leanX = 0, leanZ = 0, leanY = 0, bob = 0, lift = 0, spread = 0, drop = 0;
    let tiltX = 0, tiltZ = 0, tiltY = 0, flip = 0, slide = 0;
    const grounded = this.mode === 'slide' || this.mode === 'gkdive' || this.mode === 'stumble' || this.mode === 'kneel';

    if (speed > 0.5 && !grounded) {
      // ---- біг: довжина кроку росте зі швидкістю, фази лівої й правої ноги зсунуті на півциклу
      const walk = speed < 3.4;
      this.phase += speed * dt * (TAU / (1.9 + 1.7 * sp));
      const ph = this.phase, sL = Math.sin(ph), sR = -sL;
      const amp = walk ? 0.28 + 0.12 * sp : 0.5 + 0.55 * sp;                 // розмах стегна
      const base = 0.08 + 0.12 * sp;
      legA = base + amp * sL; legB = base + amp * sR;
      // коліно: сильно згинається, поки нога несеться вперед (мах), трохи пружинить під час опори
      const K = (walk ? 0.45 : 0.85) + 0.9 * sp;
      const cL = Math.max(0, Math.cos(ph - 0.5)), cR = Math.max(0, Math.cos(ph + Math.PI - 0.5));
      kneeA = 0.18 + K * cL * cL; kneeB = 0.18 + K * cR * cR;
      // руки: проти ніг, лікті зігнуті під ~90° і ще більше, коли рука іде вперед
      const aAmp = (walk ? 0.22 : 0.45) + 0.55 * sp;
      armA = 0.1 - sL * aAmp; armB = 0.1 - sR * aAmp;
      const eb = walk ? 0.5 : 1.15 + 0.45 * sp;
      elbA = eb + 0.35 * Math.max(0, -sL); elbB = eb + 0.35 * Math.max(0, -sR);
      // тулуб: підстрибування, присідання на опорі, плечі крутяться проти таза, нахил уперед від швидкості та прискорення
      const w = walk ? 0.4 : 1;
      bob = (Math.abs(Math.cos(ph)) - 0.5) * 0.14 * sp; drop = (0.04 + 0.07 * sp) * w;
      leanY = -sL * 0.24 * sp * w; tiltY = sL * 0.1 * sp * w;
      leanX = 0.04 + 0.2 * sp + (speed > 7 ? 0.08 : 0) + clamp(this.accL * 0.006, -0.1, 0.12);
      leanZ = clamp(-turn * 0.025 * sp, -0.22, 0.22) + sL * 0.05 * sp * w; spread = 0.07 + 0.1 * sp;
      // балансують руками: на різких поворотах руки розходяться, при розгоні різкіше працюють
      spread += clamp(Math.abs(turn) * 0.045, 0, 0.55) * sp; aBoost = clamp(this.accL * 0.02, 0, 0.35);
      armA += (armA < 0 ? -aBoost : aBoost); armB += (armB < 0 ? -aBoost : aBoost);
      if (this.dribble) {
        leanX += 0.1; armA *= 0.6; armB *= 0.6; leanZ += Math.sin(ph * 2) * 0.07; bob += Math.abs(Math.sin(ph * 2)) * 0.05; spread += 0.18;
        legA += Math.max(0, Math.sin(ph * 2 + 1)) * 0.2;
      }
    } else if (!grounded) {
      bob = Math.sin(this.t * 1.6) * 0.007; { const g = Math.sin(this.t * 0.7 + (this.ph0 ??= Math.random() * 20)), hips = Math.sin(this.t * 0.23 + (this.ph0 ??= Math.random() * 20) * 2) > 0.55; armA = armB = hips ? -0.25 : 0.05 + 0.04 * g; elbA = elbB = hips ? 1.9 : 0.35 + 0.1 * g; spread = hips ? 0.5 : 0.08 + 0.03 * g; }          // майже статична стійка
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
      case 'gkwait': { const w = Math.sin(this.t * 5.5); legA = 0.18; legB = -0.1; kneeA = kneeB = 0.38 + Math.abs(w) * 0.08; drop = 0.1; armA = armB = 0.35; elbA = elbB = 0.8; spread = 0.95 + w * 0.05; leanX = 0.28; leanZ = w * 0.07; bob = Math.abs(w) * 0.025; break; }
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
        const back = sm(P / 0.3), strike = sm((P - 0.28) / 0.1), follow = sm((P - 0.4) / 0.55);
        legB = -1.15 * back * (1 - strike) + 2.15 * strike * (1 - 0.4 * follow);
        kneeB = 1.55 * back * (1 - strike) + 0.12 * strike + 0.55 * follow;
        legA = 0.12 + 0.12 * back; kneeA = 0.2 + 0.4 * back * (1 - 0.6 * follow);
        leanX = -0.3 * back * (1 - strike) + 0.55 * strike * (1 - 0.5 * follow);
        leanY = 0.28 * strike * (1 - follow * 0.5) - 0.12 * back * (1 - strike);
        armA = -0.5 * back + 1.0 * strike; armB = 0.7 * back - 0.8 * strike; elbA = elbB = 0.5; spread = 0.4 + 0.3 * strike;
        lift = 0.26 * Math.sin(clamp((P - 0.3) / 0.35, 0, 1) * Math.PI);
        drop = 0.04 * back;
        break;
      }
      case 'pdive': {
        const P = this.diveP || 0, sg = (Math.sign(Math.sin(this.bodyYaw)) || 1) * this.diveDir, high = this.diveKind === 0, maxTilt = high ? 1.45 : 1.28;
        const sm = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
        const load = sm(P / 0.12) * (1 - sm((P - 0.1) / 0.1)), launch = sm((P - 0.09) / 0.3), settle = sm((P - 0.5) / 0.4);
        if (P < 1) {
          tiltZ = sg * maxTilt * launch;
          lift = Math.sin(clamp((P - 0.09) / 0.55, 0, 1) * Math.PI) * (high ? 1.0 : 0.5) * (1 - settle * 0.3);
          armA = armB = 0.35 + 2.55 * launch * (1 - 0.7 * settle); elbA = elbB = 0.12 + 0.3 * settle; spread = 0.14 + 0.32 * launch;
          legA = 0.85 * load - 0.35 * launch * (1 - settle); legB = 0.85 * load + 0.4 * launch * (1 - settle);
          kneeA = 0.95 * load + 0.25 * launch; kneeB = 0.95 * load + 0.3 * launch; leanX = 0.3 * load - 0.12 * launch;
          drop = THIGH * (1 - Math.cos(0.85 * load));
        } else {
          this.rise(clamp((P - 1) / 0.5, 0, 1), 0, sg * maxTilt); tiltZ = r.tz; leanX = r.leanX; legA = r.legs; legB = r.legs * 0.8; kneeA = r.legs * 1.15; kneeB = r.legs * 0.95; armA = armB = r.arms; spread = r.spread; drop = r.drop;
        }
        break;
      }
      case 'gkdive': {
        const sg = (Math.sign(Math.sin(this.bodyYaw)) || 1) * this.diveDir, high = this.diveKind === 0;
        const maxTilt = high ? 1.5 : 1.3;
        if (mk < 0.07) { const q = mk / 0.07; legA = legB = 0.8 * q; kneeA = kneeB = 0.95 * q; drop = THIGH * (1 - Math.cos(legA)); leanX = 0.3 * q; armA = armB = 0.8 * q; }
        else if (mk < 0.28) { const q = (mk - 0.07) / 0.21; tiltZ = sg * maxTilt * easeOut(q); lift = (high ? 0.95 : 0.4) * Math.sin(q * Math.PI); armA = armB = 2.85; elbA = elbB = 0.1; spread = 0.18; legA = -0.45; legB = 0.5; kneeA = 0.3; kneeB = 0.9; }
        else if (mk < 0.62) { tiltZ = sg * maxTilt; armA = armB = mk < 0.42 ? 2.5 : 0.5; elbA = elbB = 0.2; spread = 0.45; legA = -0.2; legB = 0.25; kneeA = kneeB = 0.3; }
        else { this.rise((mk - 0.62) / 0.38, 0, sg * maxTilt); tiltZ = r.tz; leanX = r.leanX; legA = r.legs; legB = r.legs * 0.8; kneeA = r.legs * 1.15; kneeB = r.legs * 0.95; armA = armB = r.arms; spread = r.spread; drop = r.drop; }
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

    // ---- згладжування суглобів і застосування
    const S = this.sm, k2 = Math.min(1, dt * 38);
    S.legA += (legA - S.legA) * k2; S.legB += (legB - S.legB) * k2;
    S.kneeA += (kneeA - S.kneeA) * k2; S.kneeB += (kneeB - S.kneeB) * k2;
    S.armA += (armA - S.armA) * k2; S.armB += (armB - S.armB) * k2;
    S.elbA += (elbA - S.elbA) * k2; S.elbB += (elbB - S.elbB) * k2;
    S.spread += (spread - S.spread) * k2; S.drop += (drop - S.drop) * k2;
    S.leanX += (leanX - S.leanX) * k2; S.leanY += (leanY - S.leanY) * k2; S.leanZ += (leanZ - S.leanZ) * k2;
    S.tiltX += (tiltX - S.tiltX) * k2; S.tiltZ += (tiltZ - S.tiltZ) * k2;

    this.legL.rotation.x = -S.legA; this.legR.rotation.x = -S.legB;
    this.shinL.rotation.x = S.kneeA; this.shinR.rotation.x = S.kneeB;
    this.armL.rotation.x = -S.armA; this.armR.rotation.x = -S.armB;
    const lagA = clamp((S.armA - (S.pArmA || 0)) / Math.max(dt, 1e-3) * 0.03, -0.35, 0.35), lagB = clamp((S.armB - (S.pArmB || 0)) / Math.max(dt, 1e-3) * 0.03, -0.35, 0.35);
    S.pArmA = S.armA; S.pArmB = S.armB;
    this.foreL.rotation.x = -(S.elbA + lagA); this.foreR.rotation.x = -(S.elbB + lagB);
    this.armL.rotation.z = -S.spread; this.armR.rotation.z = S.spread;
    this.lean.rotation.set(S.leanX, S.leanY, S.leanZ);
    // висота стегон з нахилу всього тіла: лежачи — на траві, а не в ній
    const cosT = Math.max(0, Math.cos(S.tiltX) * Math.cos(S.tiltZ));
    const hip = Math.max(0.4, 0.42 + 0.63 * cosT - S.drop + bob);
    this.pose.position.y = hip + lift;
    this.pose.rotation.set(S.tiltX + flip, tiltY, S.tiltZ);
    const hy = this.yaw, sx = Math.sin(hy), cx = Math.cos(hy);
    this.root.position.set(this.x + sx * slide, 0, this.z + cx * slide);
  }
}
