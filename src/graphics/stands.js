import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PITCH } from '../config.js';
import { VoxelBuilder, rng } from './voxel.js';

const TEXTS = ['ЛОКО, ВПЕРЕД!', 'ЗАЛІЗНИЧНИКИ', 'ЛОКОМОТИВ КИЇВ', 'СТОП ✕ ВПЕРЕД', 'ЛОКО · 1919', 'ДАВАЙ, ЛОКО!', 'ЗА КИЇВ!', 'ВІРИМО В ПЕРЕМОГУ', 'РИКОШЕТ!', 'ЛОКО В ЛІГУ ЧЕМПІОНІВ', 'МИ — ЗАЛІЗНИЧНИКИ', 'СЛАВА УКРАЇНІ'];
const SCHEMES = [['#a8182b', '#f1efe8'], ['#157a46', '#f1efe8'], ['#f1efe8', '#a8182b'], ['#1c2328', '#e8b923'], ['#a8182b', '#e8b923'], ['#157a46', '#e8b923']];
const BC = 2, BR = 7, BW = 384, BH = 128;     // атлас банерів: 2 колонки × 6 полотнищ + рядок для древків

function bannerAtlas() {
  const c = document.createElement('canvas'); c.width = BC * BW; c.height = BR * BH;
  const g = c.getContext('2d'), r = rng(31);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  TEXTS.forEach((t, i) => {
    const x = (i % BC) * BW, y = ((i / BC) | 0) * BH, [bg, fg] = SCHEMES[i % SCHEMES.length];
    g.fillStyle = bg; g.fillRect(x, y, BW, BH);
    g.fillStyle = 'rgba(255,255,255,0.07)'; for (let k = 0; k < 6; k++) g.fillRect(x, y + k * 22 + r() * 6, BW, 8);   // складки тканини
    g.strokeStyle = fg; g.lineWidth = 5; g.strokeRect(x + 7, y + 7, BW - 14, BH - 14);
    let fs = 62; g.font = `800 ${fs}px Rubik, "Arial Black", sans-serif`;
    while (g.measureText(t).width > BW - 44 && fs > 18) { fs -= 2; g.font = `800 ${fs}px Rubik, "Arial Black", sans-serif`; }
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillText(t, x + BW / 2 + 2, y + BH / 2 + 5);
    g.fillStyle = fg; g.fillText(t, x + BW / 2, y + BH / 2 + 3);
  });
  g.fillStyle = '#5a4630'; g.fillRect(0, (BR - 1) * BH, BC * BW, BH);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

const { L, W, WALL, GOAL_D } = PITCH;
const ROW_D = 1.45, ROW_H = 0.92, SP = 0.98;
const CLOTHES = ['#2b3a4a', '#58687a', '#c9c4b8', '#8f2a2f', '#2f6b4b', '#c99a45', '#3d3d44', '#7e8a94', '#e1ddd2', '#5b4a63', '#a5b3bd'];
const SKINS = ['#e8bf9b', '#d4a074', '#b07a52', '#8a5a3c', '#f0cfb0'];

/** Трибуни навколо арени: бетон, вболівальники одним InstancedMesh (тіло + голова). */
export class Stands {
  constructor() {
    this.group = new THREE.Group();
    const b = new VoxelBuilder(0.2);
    const fans = [], spots = [], awaySpots = [], sides = [];          // x, y, z, фаза, колір тіла, колір голови
    const rnd = rng(7);
    const pickCloth = (home) => (home && rnd() > 0.35 ? (rnd() > 0.5 ? '#a8182b' : '#e8e4d8') : CLOTHES[(rnd() * CLOTHES.length) | 0]);

    // вісь «вздовж» (ax,az), вісь «углиб» (dx,dz) — від поля назовні
    const stand = (cx, cz, ax, az, dx, dz, cols, rows, homeFrom, homeTo) => {
      const width = cols * SP + 1.2;
      for (let r = 0; r < rows; r++) {
        const top = 1.0 + r * ROW_H, off = r * ROW_D;
        const px = cx + dx * off, pz = cz + dz * off;
        b.box(px, (top - 0.6) / 2, pz, ax !== 0 ? width : ROW_D, top + 0.6, ax !== 0 ? ROW_D : width, r % 2 ? '#8c969b' : '#7f898e');
        b.box(px, top + 0.04, pz, ax !== 0 ? width : ROW_D - 0.15, 0.08, ax !== 0 ? ROW_D - 0.15 : width, '#a4adb1');
        for (let k = 0; k < cols; k++) {
          if (rnd() > 0.94) continue;
          const lat = (k - (cols - 1) / 2) * SP;
          const home = k >= homeFrom && k < homeTo;
          fans.push(px + ax * lat, top + 0.46, pz + az * lat, rnd() * 6.28, pickCloth(home), SKINS[(rnd() * SKINS.length) | 0]);
          sides.push(home ? 1 : (k > cols * 0.58 ? -1 : 0));
        }
      }
      const nb = Math.max(2, Math.round((homeTo - homeFrom) / 7));
      for (let q = 0; q < nb; q++) {
        const k = homeFrom + 2 + Math.floor(((q + 0.5) / nb) * Math.max(1, homeTo - homeFrom - 4)), r = 1 + (q % 3);
        spots.push({ x: cx + dx * r * ROW_D + ax * (k - (cols - 1) / 2) * SP, z: cz + dz * r * ROW_D + az * (k - (cols - 1) / 2) * SP, y: 1.0 + r * ROW_H + 0.9, ry: Math.atan2(-dx, -dz) });
      }
      const place = (k, r) => ({ x: cx + dx * r * ROW_D + ax * (k - (cols - 1) / 2) * SP, z: cz + dz * r * ROW_D + az * (k - (cols - 1) / 2) * SP, y: 1.0 + r * ROW_H + 0.9, ry: Math.atan2(-dx, -dz) });
      if (dx !== 0) for (const [f, r] of [[0.26, 1], [0.38, 2], [0.5, 1]]) spots.push(place(Math.round(cols * f), r));   // плакати за воротами: добре видно при пенальті
      for (const [f, r] of [[0.6, 1], [0.7, 2], [0.8, 1]]) awaySpots.push(place(Math.round(cols * f), r));            // сектор гостей
      const H = 1.0 + rows * ROW_H, bx = cx + dx * (rows * ROW_D + 0.3), bz = cz + dz * (rows * ROW_D + 0.3);
      b.box(bx, H / 2 + 0.3, bz, ax !== 0 ? width + 0.6 : 0.7, H + 0.6, ax !== 0 ? 0.7 : width + 0.6, '#6f797e');
    };

    const zf = W + WALL + 3.2;
    stand(0, -zf, 1, 0, 0, -1, Math.round((2 * L + 20) / SP), 10, 22, 52);
    for (const sd of [-1, 1]) stand(sd * (L + GOAL_D + 4.5), 0, 0, 1, sd, 0, Math.round((2 * W + 10) / SP), 8, 8, 28);
    for (const sd of [-1, 1]) {            // прожектори
      const px = sd * (L + 9), pz = -(W + 9);
      b.box(px, 8, pz, 0.7, 16, 0.7, '#59636a');
      b.box(px, 16.4, pz, 5, 2.4, 0.8, '#30373c');
      for (let i = 0; i < 5; i++) for (let j = 0; j < 2; j++) b.box(px - 1.9 + i * 0.95, 16 + j * 1.0, pz + 0.5, 0.7, 0.7, 0.2, '#fff6dc');
    }
    this.group.add(b.mesh());

    const n = fans.length / 6;
    this.n = n;
    const mk = (geo) => new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ flatShading: true }), n);
    this.body = mk(new THREE.BoxGeometry(0.72, 0.84, 0.56));
    this.head = mk(new THREE.BoxGeometry(0.44, 0.44, 0.44));
    this.body.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.head.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.body.frustumCulled = this.head.frustumCulled = false;
    this.bx = new Float32Array(n); this.by = new Float32Array(n); this.bz = new Float32Array(n); this.ph = new Float32Array(n);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      this.bx[i] = fans[i * 6]; this.by[i] = fans[i * 6 + 1]; this.bz[i] = fans[i * 6 + 2]; this.ph[i] = fans[i * 6 + 3];
      this.body.setColorAt(i, c.set(fans[i * 6 + 4]).multiplyScalar(0.85 + rnd() * 0.25));
      this.head.setColorAt(i, c.set(fans[i * 6 + 5]));
    }
    this.side = Int8Array.from(sides);
    // руки: дві планки на фана (піднімаються під час радості), спалахи телефонів
    const am = new THREE.MeshLambertMaterial({ flatShading: true });
    this.arms = new THREE.InstancedMesh(new THREE.BoxGeometry(0.17, 0.62, 0.17), am, n * 2);
    this.arms.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.arms.frustumCulled = false;
    for (let i = 0; i < n; i++) { c.set(fans[i * 6 + 5]); this.arms.setColorAt(i * 2, c); this.arms.setColorAt(i * 2 + 1, c); }
    this.flashN = 140;
    this.flash = new THREE.InstancedMesh(new THREE.BoxGeometry(0.34, 0.34, 0.1), new THREE.MeshBasicMaterial({ color: '#ffffff' }), this.flashN);
    this.flash.frustumCulled = false; this.flashT = new Float32Array(this.flashN); this.flashI = new Int32Array(this.flashN);
    this.rx = null; this.idleT = 0;
    this.writeMatrices(0);
    this.group.add(this.body, this.head, this.arms, this.flash);
    this.buildBanners(spots, rnd);
    this.buildAway(awaySpots);
  }

  /** Банери на древках: кожен — окремий меш зі спільним атласом, гойдається та підстрибує під час радості. */
  buildBanners(spots, rnd) {
    const map = bannerAtlas(), mat = new THREE.MeshLambertMaterial({ map, side: THREE.DoubleSide });
    const BWW = 4.4, BHH = BWW * BH / BW, order = TEXTS.map((_, i) => i).sort(() => rnd() - 0.5);
    this.banners = [];
    spots.forEach((sp, n) => {
      const ti = order[n % order.length], u0 = (ti % BC) / BC, v1 = 1 - ((ti / BC) | 0) / BR, u1 = u0 + 1 / BC, v0 = v1 - 1 / BR;
      const cloth = new THREE.PlaneGeometry(BWW, BHH, 6, 1); cloth.translate(0, BHH / 2 + 0.7, 0);
      const uv = cloth.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
      const parts = [cloth];
      for (const sx of [-1, 1]) {
        const st = new THREE.BoxGeometry(0.07, BHH + 0.9, 0.07); st.translate(sx * (BWW / 2 - 0.1), (BHH + 0.9) / 2, 0);
        const su = st.attributes.uv; for (let i = 0; i < su.count; i++) su.setXY(i, 0.5, 1 / (2 * BR));
        parts.push(st);
      }
      const geo = mergeGeometries(parts);
      const m = new THREE.Mesh(geo, mat); m.position.set(sp.x, sp.y - 0.9, sp.z); m.rotation.y = sp.ry; m.frustumCulled = false;
      this.group.add(m); this.banners.push({ m, ph: rnd() * 6.28, ry: sp.ry, y: m.position.y });
    });
  }

  /** Банери гостей: полотнища з назвою суперника в його кольорах; перемальовуються на кожен матч. */
  buildAway(spots) {
    const c = document.createElement('canvas'); c.width = 768; c.height = 384; this.awayCanvas = c;
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; this.awayTex = t;
    const mat = new THREE.MeshLambertMaterial({ map: t, side: THREE.DoubleSide });
    const BWW = 4.4, BHH = BWW * 128 / 384;
    this.away = [];
    spots.forEach((sp, n) => {
      const ti = n % 6, u0 = (ti % 2) / 2, v1 = 1 - ((ti / 2) | 0) / 3, u1 = u0 + 0.5, v0 = v1 - 1 / 3;
      const cloth = new THREE.PlaneGeometry(BWW, BHH, 6, 1); cloth.translate(0, BHH / 2 + 0.7, 0);
      const uv = cloth.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
      const parts = [cloth];
      for (const sx of [-1, 1]) { const st = new THREE.BoxGeometry(0.07, BHH + 0.9, 0.07); st.translate(sx * (BWW / 2 - 0.1), (BHH + 0.9) / 2, 0); const su = st.attributes.uv; for (let i = 0; i < su.count; i++) su.setXY(i, 0.01, 0.01); parts.push(st); }
      const m = new THREE.Mesh(mergeGeometries(parts), mat); m.position.set(sp.x, sp.y - 0.9, sp.z); m.rotation.y = sp.ry; m.frustumCulled = false;
      this.group.add(m); this.banners.push({ m, ph: Math.random() * 6.28, ry: sp.ry, y: m.position.y });
    });
    this.setOpponent({ name: 'ГОСТІ', kit: { main: '#254e9c', second: '#e4e8ec' } });
  }

  setOpponent(club) {
    const c = this.awayCanvas; if (!c) return;
    const g = c.getContext('2d'), n = String(club.name).toUpperCase(), a = club.kit.main, b = club.kit.second;
    const texts = [n, n + ' ВПЕРЕД!', 'ЗА ' + n, 'ГОСТІ · ' + n, n + ' З НАМИ', 'ТІЛЬКИ ' + n];
    g.textAlign = 'center'; g.textBaseline = 'middle';
    texts.forEach((t, i) => {
      const x = (i % 2) * 384, y = ((i / 2) | 0) * 128, bg = i % 2 ? b : a, fg = i % 2 ? a : b;
      g.fillStyle = bg; g.fillRect(x, y, 384, 128);
      g.fillStyle = 'rgba(255,255,255,0.08)'; for (let k = 0; k < 6; k++) g.fillRect(x, y + k * 22, 384, 8);
      g.strokeStyle = fg; g.lineWidth = 5; g.strokeRect(x + 7, y + 7, 370, 114);
      let fs = 60; g.font = `800 ${fs}px Rubik, "Arial Black", sans-serif`;
      while (g.measureText(t).width > 340 && fs > 16) { fs -= 2; g.font = `800 ${fs}px Rubik, "Arial Black", sans-serif`; }
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillText(t, x + 194, y + 69); g.fillStyle = fg; g.fillText(t, x + 192, y + 66);
    });
    this.awayTex.needsUpdate = true;
  }


  /** Типи реакцій: goal (радість своїх/сум гостей), groan, gasp, wave, clap, flash. */
  react(type, o = {}) {
    const DUR = { goal: 3.8, groan: 2.6, gasp: 1.2, wave: 4.2, clap: 2.6, flash: 3.2 };
    this.rx = { type, t: 0, dur: o.dur || DUR[type] || 2, mine: o.mine !== false };
  }
  cheer(sec) { this.react('goal', { dur: sec, mine: true }); }

  writeMatrices(t) {
    const rx = this.rx, mb = this.body.instanceMatrix.array, mh = this.head.instanceMatrix.array, ma = this.arms.instanceMatrix.array;
    const n = this.n;
    let env = 0, ty = '', mine = true;
    if (rx) { ty = rx.type; mine = rx.mine; const q = rx.t / rx.dur; env = Math.min(1, rx.t * 7) * (1 - q * q * (3 - 2 * q)); }
    for (let i = 0; i < n; i++) {
      const ph = this.ph[i], s = this.side[i];
      let jump = 0, headY = 0, headZ = 0, arm = 0, lean = 0;
      if (ty === 'goal') {
        const joy = mine ? (s >= 0 ? 1 : 0.2) : (s < 0 ? 1 : 0), sad = mine ? (s < 0 ? 1 : 0) : (s >= 0 ? 0.9 : 0.4);
        jump = Math.abs(Math.sin(t * 9 + ph)) * 0.55 * env * joy; arm = env * joy; headY = -0.16 * env * sad; lean = 0.1 * env * sad;
      } else if (ty === 'groan') { headY = -0.17 * env; lean = 0.12 * env; headZ = Math.sin(t * 4 + ph) * 0.05 * env; }
      else if (ty === 'gasp') { const g = Math.min(1, rx.t * 9) * Math.max(0, 1 - rx.t / rx.dur); headY = 0.22 * g; lean = -0.1 * g; jump = 0.08 * g; arm = ph < 2.6 ? 0.9 * g : 0; }
      else if (ty === 'wave') { const wc = (this.bx[i] + this.bz[i]) * 0.11 - rx.t * 5.5; const pl = Math.pow(Math.max(0, Math.sin(wc)), 3) * (rx.t < rx.dur ? 1 : 0); jump = 0.45 * pl; arm = pl; }
      else if (ty === 'clap') { jump = Math.abs(Math.sin(t * 13 + ph)) * 0.05 * env; arm = 0.45 * env * (0.5 + 0.5 * Math.sin(t * 13 + ph)); }
      else if (ty === 'flash') { arm = ph < 3 ? 0.85 * Math.min(1, rx.t * 3) * (1 - rx.t / rx.dur) : 0; }
      const o = i * 16, y = this.by[i] + jump;
      mb[o] = 1; mb[o + 1] = 0; mb[o + 2] = 0; mb[o + 3] = 0; mb[o + 4] = 0; mb[o + 5] = 1; mb[o + 6] = 0; mb[o + 7] = 0;
      mb[o + 8] = 0; mb[o + 9] = 0; mb[o + 10] = 1; mb[o + 11] = 0; mb[o + 12] = this.bx[i]; mb[o + 13] = y; mb[o + 14] = this.bz[i]; mb[o + 15] = 1;
      mh[o] = 1; mh[o + 1] = 0; mh[o + 2] = 0; mh[o + 3] = 0; mh[o + 4] = 0; mh[o + 5] = 1; mh[o + 6] = 0; mh[o + 7] = 0;
      mh[o + 8] = 0; mh[o + 9] = 0; mh[o + 10] = 1; mh[o + 11] = 0; mh[o + 12] = this.bx[i]; mh[o + 13] = y + 0.66 + headY; mh[o + 14] = this.bz[i] + (headZ || 0) + lean; mh[o + 15] = 1;
      // руки: планки з боків плечей; висота й нахил залежать від arm
      const sc = arm > 0.04 ? arm : 0.0001, ay = y + 0.4 + 0.31 * sc;
      for (let k = 0; k < 2; k++) {
        const oa = (i * 2 + k) * 16, sx = k ? 0.43 : -0.43;
        ma[oa] = 1; ma[oa + 1] = 0; ma[oa + 2] = 0; ma[oa + 3] = 0; ma[oa + 4] = 0; ma[oa + 5] = sc; ma[oa + 6] = 0; ma[oa + 7] = 0;
        ma[oa + 8] = 0; ma[oa + 9] = 0; ma[oa + 10] = 1; ma[oa + 11] = 0; ma[oa + 12] = this.bx[i] + sx; ma[oa + 13] = ay; ma[oa + 14] = this.bz[i]; ma[oa + 15] = 1;
      }
    }
    this.body.instanceMatrix.needsUpdate = true; this.head.instanceMatrix.needsUpdate = true; this.arms.instanceMatrix.needsUpdate = true;
  }

  update(dt, t) {
    const rx = this.rx, amp = rx && (rx.type === 'goal' || rx.type === 'wave') ? 1 : 0;
    for (const b of this.banners) {
      b.m.rotation.z = Math.sin(t * (amp ? 5 : 1.3) + b.ph) * (amp ? 0.1 : 0.025);
      b.m.rotation.x = Math.sin(t * 0.9 + b.ph * 2) * 0.03;
      b.m.position.y = b.y + (amp ? Math.abs(Math.sin(t * 7 + b.ph)) * 0.35 : 0);
    }
    // вільний фон: час від часу «ла-ла» легкий гул (дрібне погойдування голів) тільки під час реакції
    if (rx) {
      rx.t += dt;
      this.writeMatrices(t);
      if (rx.type === 'flash') this.runFlashes(dt);
      if (rx.t >= rx.dur) { this.rx = null; this.writeMatrices(t); this.flash.count = 0; }
    }
  }

  /** Спалахи камер телефонів по трибунах. */
  runFlashes(dt) {
    const dm = new THREE.Matrix4(), tmp = new THREE.Vector3(), sc = new THREE.Vector3(), q = new THREE.Quaternion();
    this.flash.count = this.flashN;
    for (let i = 0; i < this.flashN; i++) {
      this.flashT[i] -= dt;
      if (this.flashT[i] <= 0 && Math.random() < dt * 2.6) { this.flashT[i] = 0.09; this.flashI[i] = (Math.random() * this.n) | 0; }
      const on = this.flashT[i] > 0, f = this.flashI[i];
      tmp.set(this.bx[f], this.by[f] + 1.2, this.bz[f]); sc.setScalar(on ? 1 : 0.0001);
      dm.compose(tmp, q, sc); this.flash.setMatrixAt(i, dm);
    }
    this.flash.instanceMatrix.needsUpdate = true;
  }
}
