// Stands: трибуни й глядачі на InstancedMesh, реакції натовпу, банери, прапори, сектор гостей.
import * as THREE from 'three';
import { ANISO } from './textures.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PITCH } from '../config.js';
import { VoxelBuilder, rng } from './voxel.js';
import { drawFlag } from '../online/flag.js';
import { whenLogo, logoReady, logoImg } from './logo.js';

const TEXTS = ['ЛОКО, ВПЕРЕД!', 'ЗАЛІЗНИЧНИКИ', 'ЛОКОМОТИВ КИЇВ', 'СТОП ✕ ВПЕРЕД', 'ЛОКО · 1919', 'ДАВАЙ, ЛОКО!', 'ЗА КИЇВ!', 'ВІРИМО В ПЕРЕМОГУ', 'РИКОШЕТ!', 'ЛОКО — ДО ВЕРШИНИ', 'МИ — ЗАЛІЗНИЧНИКИ', 'СЛАВА УКРАЇНІ'];
const SCHEMES = [['#a8182b', '#f1efe8'], ['#157a46', '#f1efe8'], ['#f1efe8', '#a8182b'], ['#1c2328', '#e8b923'], ['#a8182b', '#e8b923'], ['#157a46', '#e8b923']];
const BC = 2, BR = 7, BW = 384, BH = 128;     // атлас банерів: 2 колонки × 6 полотнищ + рядок для древків

function drawAtlas(c, texts, schemes) {
  const g = c.getContext('2d'), r = rng(31);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  texts.forEach((t, i) => {
    const x = (i % BC) * BW, y = ((i / BC) | 0) * BH, [bg, fg] = schemes[i % schemes.length];
    g.fillStyle = bg; g.fillRect(x, y, BW, BH);
    g.fillStyle = 'rgba(255,255,255,0.07)'; for (let k = 0; k < 6; k++) g.fillRect(x, y + k * 22 + r() * 6, BW, 8);   // складки тканини
    g.strokeStyle = fg; g.lineWidth = 5; g.strokeRect(x + 7, y + 7, BW - 14, BH - 14);
    let fs = 62; g.font = `800 ${fs}px Rubik, "Arial Black", sans-serif`;
    while (g.measureText(t).width > BW - 44 && fs > 18) { fs -= 2; g.font = `800 ${fs}px Rubik, "Arial Black", sans-serif`; }
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillText(t, x + BW / 2 + 2, y + BH / 2 + 5);
    g.fillStyle = fg; g.fillText(t, x + BW / 2, y + BH / 2 + 3);
  });
  g.fillStyle = '#5a4630'; g.fillRect(0, (BR - 1) * BH, BC * BW, BH);
}
function bannerAtlas() {
  const c = document.createElement('canvas'); c.width = BC * BW; c.height = BR * BH;
  drawAtlas(c, TEXTS, SCHEMES);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = ANISO;
  return t;
}

const { L, W, WALL, GOAL_D } = PITCH;
const ROW_D = 1.45, ROW_H = 0.92, SP = 0.98, FS = 10;   // FS — чисел на фана в списку fans конструктора
const HOME_CLOTH = ['#a8182b', '#e8e4d8'], HOME_SCARF = ['#c8213a', '#f1efe8', '#157a46', '#c8213a'];
const CLOTHES = ['#2b3a4a', '#58687a', '#c9c4b8', '#8f2a2f', '#2f6b4b', '#c99a45', '#3d3d44', '#7e8a94', '#e1ddd2', '#5b4a63', '#a5b3bd'];
/**
 * Хвиля полотнища у вершинному шейдері: рухаються лише вершини вище древка. uAmp росте під час співів і радості.
 * uWave і uFlut — уже накопичені фази (Stands.update), а не час: частота хвилі залежить від uAmp, і sin(t·f(uAmp))
 * на 10-й хвилині матчу стрибав би на радіани за кадр при кожній зміні uAmp.
 */
const WAVE = { uWave: { value: 0 }, uFlut: { value: 0 }, uAmp: { value: 0.3 } };
const TAU = Math.PI * 2;
const smooth01 = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
function waveMat(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uWave = WAVE.uWave; sh.uniforms.uFlut = WAVE.uFlut; sh.uniforms.uAmp = WAVE.uAmp;
    sh.vertexShader = 'uniform float uWave;\nuniform float uFlut;\nuniform float uAmp;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      float cl = smoothstep(0.65, 0.95, position.y);
      float ph = modelMatrix[3].x * 0.8 + modelMatrix[3].z * 0.6;
      transformed.z += sin(position.x * 2.8 + uWave + ph) * (0.05 + 0.2 * uAmp) * cl;
      transformed.y += sin(uFlut + ph + position.x) * 0.05 * uAmp * cl;`);
  };
  return mat;
}
const SKINS = ['#e8bf9b', '#d4a074', '#b07a52', '#8a5a3c', '#f0cfb0'];

const _fm = new THREE.Matrix4(), _fp = new THREE.Vector3(), _fs = new THREE.Vector3(), _fq = new THREE.Quaternion();
/** Свій генератор для спалахів і диму: натовп не бере Math.random, тож не зсуває випадковість гри в симуляторі. */
const vrand = rng(53);
const FADE = 0.3;                                   // с: стільки згасає попередня реакція, коли поверх неї почалась нова

/**
 * Проміжні числа реакцій лежать у Float64Array, а не в модульних let: дріб у змінній модуля V8 щоразу пакує в новий об'єкт,
 * і цикл по тисячах глядачів смітив би щокадру.
 * _P[ENV] — сила реакції (швидкий наступ, плавний спад до нуля рівно на кінці), _P[WE] — краї хвилі, щоб вона не обривалась на гребені.
 */
const _P = new Float64Array(2);
const ENV = 0, WE = 1;
function rxEnv(rx) {
  const q = Math.min(1, rx.t / rx.dur);
  _P[ENV] = Math.min(1, rx.t * 7) * (1 - q * q * (3 - 2 * q));
  _P[WE] = Math.min(1, rx.t * 2) * Math.max(0, Math.min(1, (rx.dur - rx.t) * 1.5));
}


/** Трибуни навколо арени: бетон, вболівальники одним InstancedMesh (тіло + голова). */
export class Stands {
  constructor() {
    this.group = new THREE.Group();
    const b = new VoxelBuilder(0.2);
    const fans = [], spots = [], awaySpots = [], sides = [], flagSpots = [];          // FS чисел на фана: x, y, z, фаза, колір тіла, колір голови, вісь «вздовж» (ax, az), обличчям до поля (fx, fz)
    const rnd = rng(7);
    const pickCloth = (home) => (home && rnd() > 0.35 ? (rnd() > 0.5 ? HOME_CLOTH[0] : HOME_CLOTH[1]) : CLOTHES[(rnd() * CLOTHES.length) | 0]);

    // вісь «вздовж» (ax,az), вісь «углиб» (dx,dz) — від поля назовні
    // cut — проріз над тунелем гравців (лише трибуна вздовж X): по центру на ±cut.w нижні ряди прибрано, вищі стоять на
    // його даху (від cut.y), тож тунель іде під трибуну, а не впирається в неї
    const stand = (cx, cz, ax, az, dx, dz, cols, rows, homeFrom, homeTo, cut = null) => {
      const width = cols * SP + 1.2;
      const px0 = () => cx - dx * 0.4, pz0 = () => cz - dz * 0.4;
      // смуга на всю ширину трибуни (y0..y1), крім прорізу; над прорізом — лише те, що вище за його дах
      const span = (px, pz, y0, y1, dep, col) => {
        if (!cut || ax === 0) { b.box(px, (y0 + y1) / 2, pz, ax !== 0 ? width : dep, y1 - y0, ax !== 0 ? dep : width, col); return; }
        const sw = width / 2 - cut.w;
        for (const sg of [-1, 1]) b.box(px + sg * (cut.w + sw / 2), (y0 + y1) / 2, pz, sw, y1 - y0, dep, col);
        if (y1 > cut.y + 0.05) b.box(px, (Math.max(y0, cut.y) + y1) / 2, pz, 2 * cut.w, y1 - Math.max(y0, cut.y), dep, col);
      };
      for (let r = 0; r < rows; r++) {
        const top = 1.0 + r * ROW_H, off = r * ROW_D;
        const px = cx + dx * off, pz = cz + dz * off;
        span(px, pz, -0.3, top + 0.3, ROW_D, r % 2 ? '#8c969b' : '#7f898e');
        span(px, pz, top, top + 0.08, ROW_D - 0.15, '#a4adb1');
        for (let k = 0; k < cols; k++) {
          if (rnd() > 0.94 || k % 26 === 0) continue;                     // проходи між секторами
          const lat = (k - (cols - 1) / 2) * SP;
          if (cut && Math.abs(lat) < cut.w + 0.3 && top < cut.y + 0.3) continue;   // над тунелем у нижніх рядах — нікого
          const home = k >= homeFrom && k < homeTo;
          fans.push(px + ax * lat, top + 0.46, pz + az * lat, rnd() * 6.28, pickCloth(home), SKINS[(rnd() * SKINS.length) | 0], ax, az, -dx, -dz);
          sides.push(home ? 1 : (k > cols * 0.58 ? -1 : 0));
        }
      }
      const nb = Math.max(2, Math.round((homeTo - homeFrom) / 7));
      for (let q = 0; q < nb; q++) {
        const k = homeFrom + 2 + Math.floor(((q + 0.5) / nb) * Math.max(1, homeTo - homeFrom - 4)), r = 1 + (q % 3);
        spots.push({ x: cx + dx * r * ROW_D + ax * (k - (cols - 1) / 2) * SP, z: cz + dz * r * ROW_D + az * (k - (cols - 1) / 2) * SP, y: 1.0 + r * ROW_H + 0.9, ry: Math.atan2(-dx, -dz) });
      }
      // поручні перед першим рядом і сходи в проходах
      if (cut && ax !== 0) span(px0(), pz0(), 1.5, 1.6, 0.1, '#dfe3e6'); else b.box(px0(), 1.55, pz0(), ax !== 0 ? width : 0.1, 0.1, ax !== 0 ? 0.1 : width, '#dfe3e6');
      const place = (k, r) => ({ x: cx + dx * r * ROW_D + ax * (k - (cols - 1) / 2) * SP, z: cz + dz * r * ROW_D + az * (k - (cols - 1) / 2) * SP, y: 1.0 + r * ROW_H + 0.9, ry: Math.atan2(-dx, -dz) });
      if (dx !== 0) for (const [f, r] of [[0.26, 1], [0.38, 2], [0.5, 1]]) spots.push(place(Math.round(cols * f), r));   // плакати за воротами: добре видно при пенальті
      for (const [f, r] of [[0.6, 1], [0.7, 2], [0.8, 1]]) awaySpots.push(place(Math.round(cols * f), r));            // сектор гостей
      for (const k of [homeFrom + 3, homeTo - 3]) flagSpots.push({ ...place(k, 3), home: true });
      for (const f of [0.66, 0.84]) flagSpots.push({ ...place(Math.round(cols * f), 3), home: false });
      const H = 1.0 + rows * ROW_H, bx = cx + dx * (rows * ROW_D + 0.3), bz = cz + dz * (rows * ROW_D + 0.3);
      b.box(bx, H / 2 + 0.3, bz, ax !== 0 ? width + 0.6 : 0.7, H + 0.6, ax !== 0 ? 0.7 : width + 0.6, '#6f797e');
    };

    const zf = W + WALL + 3.2;
    stand(0, -zf, 1, 0, 0, -1, Math.round((2 * L + 20) / SP), 10, 22, 52, { w: 4.4, y: 4.85 });   // над тунелем гравців
    for (const sd of [-1, 1]) stand(sd * (L + GOAL_D + 4.5), 0, 0, 1, sd, 0, Math.round((2 * W + 10) / SP), 8, 8, 28);
    for (const [sd, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {            // прожектори
      const px = sd * (L + 9), pz = sz * (W + 9);
      b.box(px, 8, pz, 0.7, 16, 0.7, '#59636a');
      b.box(px, 16.4, pz, 5, 2.4, 0.8, '#30373c');
      for (let i = 0; i < 5; i++) for (let j = 0; j < 2; j++) b.box(px - 1.9 + i * 0.95, 16 + j * 1.0, pz + 0.5, 0.7, 0.7, 0.2, '#fff6dc');
    }
    this.group.add(b.mesh());

    // місця в випадковому порядку: менший count проріджує всі трибуни рівномірно, а не вимикає цілий сектор
    const shuffle = rng(97);
    for (let i = sides.length - 1; i > 0; i--) {
      const j = (shuffle() * (i + 1)) | 0;
      for (let k = 0; k < FS; k++) { const q = fans[i * FS + k]; fans[i * FS + k] = fans[j * FS + k]; fans[j * FS + k] = q; }
      const q = sides[i]; sides[i] = sides[j]; sides[j] = q;
    }
    const n = fans.length / FS;
    this.n = n; this.live = n; this.every = 1;
    // t — власний годинник трибун (Match.time стоїть у вступі, фіналі й серії пенальті); cur/acc — черга розподіленого оновлення
    this.t = 0; this.cur = 0; this.acc = 0; this.lastNow = 0; this.rs = 0; this.phB = 0; this.phF = 0;
    const noBottom = (geo) => { const ix = geo.index.array, keep = []; for (let f = 0; f < ix.length; f += 3) { if (f < 18 || f >= 24) keep.push(ix[f], ix[f + 1], ix[f + 2]); } geo.setIndex(keep); return geo; };   // BoxGeometry: грані +x,-x,+y,-y,+z,-z по 6 індексів; -y (18..23) ніколи не видно з камери зверху
    const mk = (geo) => new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ flatShading: true }), n);
    this.body = mk(noBottom(new THREE.BoxGeometry(0.72, 0.84, 0.56)));
    this.head = mk(noBottom(new THREE.BoxGeometry(0.44, 0.44, 0.44)));
    this.body.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.head.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.body.frustumCulled = this.head.frustumCulled = false;
    this.bx = new Float32Array(n); this.by = new Float32Array(n); this.bz = new Float32Array(n); this.ph = new Float32Array(n);
    // плечі вздовж трибуни, нахил голови до поля: на трибунах за воротами тулуб повернуто на 90°, руки по боках, а не спереду й ззаду
    this.lx = new Int8Array(n); this.lz = new Int8Array(n); this.fx = new Int8Array(n); this.fz = new Int8Array(n);
    const c = new THREE.Color();
    this.homeFans = []; this.homeKey = '';
    for (let i = 0; i < n; i++) {
      const o = i * FS;
      this.bx[i] = fans[o]; this.by[i] = fans[o + 1]; this.bz[i] = fans[o + 2]; this.ph[i] = fans[o + 3];
      this.lx[i] = fans[o + 6]; this.lz[i] = fans[o + 7]; this.fx[i] = fans[o + 8]; this.fz[i] = fans[o + 9];
      const shade = 0.85 + rnd() * 0.25; this.body.setColorAt(i, c.set(fans[o + 4]).multiplyScalar(shade));
      if (fans[o + 4] === HOME_CLOTH[0] || fans[o + 4] === HOME_CLOTH[1]) this.homeFans.push(i, fans[o + 4] === HOME_CLOTH[0] ? 0 : 1, shade);   // у клубному: їх перефарбовує setHome
      this.head.setColorAt(i, c.set(fans[o + 5]));
    }
    this.side = Int8Array.from(sides);
    // руки: дві планки на фана (піднімаються під час радості), спалахи телефонів
    const am = new THREE.MeshLambertMaterial({ flatShading: true });
    this.arms = new THREE.InstancedMesh(noBottom(new THREE.BoxGeometry(0.17, 0.62, 0.17)), am, n * 2);
    this.arms.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.arms.frustumCulled = false;
    for (let i = 0; i < n; i++) { c.set(fans[i * FS + 5]); this.arms.setColorAt(i * 2, c); this.arms.setColorAt(i * 2 + 1, c); }
    this.flashN = 140;
    this.flash = new THREE.InstancedMesh(new THREE.BoxGeometry(0.34, 0.34, 0.1), new THREE.MeshBasicMaterial({ color: '#ffffff' }), this.flashN);
    this.flash.frustumCulled = false; this.flash.count = 0; this.flashT = new Float32Array(this.flashN); this.flashI = new Int32Array(this.flashN);
    const scm = new THREE.MeshLambertMaterial({ flatShading: true });
    this.scarf = new THREE.InstancedMesh(noBottom(new THREE.BoxGeometry(0.62, 0.09, 0.14)), scm, n);
    this.scarf.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.scarf.frustumCulled = false;
    this.scarfI = new Uint8Array(n);
    for (let i = 0; i < n; i++) { this.scarfI[i] = (rnd() * HOME_SCARF.length) | 0; this.scarf.setColorAt(i, c.set(HOME_SCARF[this.scarfI[i]])); }
    this.rx = null; this.px = null; this.pxT = 0; this.idleT = 0; this.chant = 0; this.flagSmoke = true;
    // діапазони вивантаження: по чотири готові об'єкти на меш замість addUpdateRange, що створює новий щокадру (push)
    for (const m of [this.body, this.head, this.arms, this.scarf]) m.userData.rg = [0, 1, 2, 3].map(() => ({ start: 0, count: 0 }));
    this.writeMatrices(0, false, 0, n);
    this.group.add(this.body, this.head, this.arms, this.flash, this.scarf);
    this.buildBanners(spots, rnd);
    this.buildAway(awaySpots);
    this.buildFlags(flagSpots);
  }

  /** Банери на древках: кожен — окремий меш зі спільним атласом, гойдається та підстрибує під час радості. */
  buildBanners(spots, rnd) {
    const map = bannerAtlas(), mat = waveMat(new THREE.MeshLambertMaterial({ map, side: THREE.DoubleSide }));
    this.homeTex = map;
    const BWW = 4.4, BHH = BWW * BH / BW, order = TEXTS.map((_, i) => i).sort(() => rnd() - 0.5);
    this.banners = [];
    spots.forEach((sp, n) => {
      const ti = order[n % order.length], u0 = (ti % BC) / BC, v1 = 1 - ((ti / BC) | 0) / BR, u1 = u0 + 1 / BC, v0 = v1 - 1 / BR;
      const cloth = new THREE.PlaneGeometry(BWW, BHH, 14, 1); cloth.translate(0, BHH / 2 + 0.7, 0);
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

  /** Прапори на довгих древках: клубні (червоно-зелені) і гостей (кольори суперника, оновлюються разом із банерами). */
  buildFlags(spots) {
    const paint = (c, c1, c2) => { const g = c.getContext('2d'); g.fillStyle = c1; g.fillRect(0, 0, 128, 80); g.fillStyle = c2; g.beginPath(); g.moveTo(64, 0); g.lineTo(128, 0); g.lineTo(128, 80); g.lineTo(40, 80); g.closePath(); g.fill(); g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 4; g.strokeRect(2, 2, 124, 76); };
    const mk = (c1, c2) => { const c = document.createElement('canvas'); c.width = 128; c.height = 80; paint(c, c1, c2); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return { t, c }; };
    const home = mk('#c8213a', '#157a46'), away = mk('#254e9c', '#e4e8ec');
    this.flagAwayCanvas = away.c; this.flagAwayTex = away.t;
    const loko = (c) => { const g = c.getContext('2d'); g.fillStyle = '#d4202c'; g.fillRect(0, 0, 128, 40); g.fillStyle = '#1f8f3f'; g.fillRect(0, 40, 128, 40); g.fillStyle = '#f1efe8'; g.fillRect(0, 37, 128, 6); if (logoReady()) { const h = 74, w = h * 166 / 180; g.drawImage(logoImg(), 64 - w / 2, 3, w, h); } };
    loko(home.c); whenLogo(() => { if (!this.homeKey) { loko(home.c); home.t.needsUpdate = true; } });
    this.flagHomeCanvas = home.c; this.flagHomeTex = home.t; this.flagHomeDraw = () => loko(home.c);
    const matH = waveMat(new THREE.MeshLambertMaterial({ map: home.t, side: THREE.DoubleSide })), matA = waveMat(new THREE.MeshLambertMaterial({ map: away.t, side: THREE.DoubleSide }));
    this.flags = [];
    for (const sp of spots) {
      const w = 2.4, hh = 1.5, cloth = new THREE.PlaneGeometry(w, hh, 14, 1); cloth.translate(w / 2 - 0.05, 0.7 + hh / 2, 0);
      const pole = new THREE.CylinderGeometry(0.05, 0.05, 4.4, 5); pole.translate(0, 2.2, 0);
      const pm = new THREE.Mesh(pole, new THREE.MeshLambertMaterial({ color: '#59636a' })), cm = new THREE.Mesh(cloth, sp.home ? matH : matA);
      const gr = new THREE.Group(); gr.add(pm, cm); gr.position.set(sp.x, sp.y - 0.9, sp.z); gr.rotation.y = sp.ry; gr.frustumCulled = false;
      this.group.add(gr); this.flags.push({ gr, ph: Math.random() * 6.28, home: sp.home });
    }
  }

  /** Банери гостей: полотнища з назвою суперника в його кольорах; перемальовуються на кожен матч. */
  buildAway(spots) {
    const c = document.createElement('canvas'); c.width = 768; c.height = 384; this.awayCanvas = c;
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = ANISO; this.awayTex = t;
    const mat = waveMat(new THREE.MeshLambertMaterial({ map: t, side: THREE.DoubleSide }));
    const BWW = 4.4, BHH = BWW * 128 / 384;
    this.away = [];
    spots.forEach((sp, n) => {
      const ti = n % 6, u0 = (ti % 2) / 2, v1 = 1 - ((ti / 2) | 0) / 3, u1 = u0 + 0.5, v0 = v1 - 1 / 3;
      const cloth = new THREE.PlaneGeometry(BWW, BHH, 14, 1); cloth.translate(0, BHH / 2 + 0.7, 0);
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
    if (this.flagAwayCanvas && club.flag) { drawFlag(this.flagAwayCanvas.getContext('2d'), club.flag, 128, 80); this.flagAwayTex.needsUpdate = true; } else if (this.flagAwayCanvas) { const f = this.flagAwayCanvas.getContext('2d'); f.fillStyle = a; f.fillRect(0, 0, 128, 80); f.fillStyle = b; f.beginPath(); f.moveTo(64, 0); f.lineTo(128, 0); f.lineTo(128, 80); f.lineTo(40, 80); f.closePath(); f.fill(); f.strokeStyle = 'rgba(255,255,255,.7)'; f.lineWidth = 4; f.strokeRect(2, 2, 124, 76); this.flagAwayTex.needsUpdate = true; }
  }


  /**
   * Домашній сектор онлайн-матчу: вболівальники, шарфи, банери й прапори в кольорах клубу господаря. null — знову «Локомотив»
   * (кар'єра після онлайну). Лише на старті матчу: перефарбовує тисячі глядачів, тож без зміни клубу нічого не робить.
   */
  setHome(club) {
    const key = club ? club.name + club.kit.main + club.kit.second + JSON.stringify(club.flag || 0) : '';
    if (key === this.homeKey) return;
    this.homeKey = key;
    const a = club ? club.kit.main : HOME_CLOTH[0], b = club ? club.kit.second : HOME_CLOTH[1], c = new THREE.Color(), F = this.homeFans;
    for (let i = 0; i < F.length; i += 3) this.body.setColorAt(F[i], c.set(F[i + 1] ? b : a).multiplyScalar(F[i + 2]));
    this.body.instanceColor.needsUpdate = true;
    const sc = club ? [a, b, a, a] : HOME_SCARF;
    for (let i = 0; i < this.n; i++) this.scarf.setColorAt(i, c.set(sc[this.scarfI[i]]));
    this.scarf.instanceColor.needsUpdate = true;
    if (club) {
      const n = String(club.name).toUpperCase(), base = [n, n + ' ВПЕРЕД!', 'ЗА ' + n, n + ' З НАМИ', 'ТІЛЬКИ ' + n, 'ДАВАЙ, ' + n + '!'];
      drawAtlas(this.homeTex.image, TEXTS.map((_, i) => base[i % base.length]), [[a, b], [b, a]]);
      if (club.flag) drawFlag(this.flagHomeCanvas.getContext('2d'), club.flag, 128, 80);
    } else { drawAtlas(this.homeTex.image, TEXTS, SCHEMES); this.flagHomeDraw(); }
    this.homeTex.needsUpdate = true; this.flagHomeTex.needsUpdate = true;
  }

  /**
   * Типи реакцій: goal (радість своїх/сум гостей), groan, gasp, wave, clap, flash. Нова реакція поверх живої не обриває її:
   * стара (px) ще FADE с згасає поруч, інакше руки й стрибки за кадр падали б до нуля (спалахи → гол у пенальті).
   */
  react(type, o = {}) {
    const DUR = { goal: 3.8, groan: 2.6, gasp: 1.2, wave: 4.2, clap: 2.6, flash: 3.2 };
    if (type !== 'flash') this.flash.count = 0;                // спалахи малює лише реакція flash: без цього застигли б білими квадратами
    this.px = this.rx && this.rx.t < this.rx.dur ? this.rx : null; this.pxT = 0;
    this.rx = { type, t: 0, dur: o.dur || DUR[type] || 2, mine: o.mine !== false };
  }
  cheer(sec) { this.react('goal', { dur: sec, mine: true }); }

  /** Хор: кожні 16 с на ~9 с домашні сектори стрибають у ритм і піднімають руки/шарфи. */
  chantEnv(t) {
    const c = t % 16;
    return smooth01((c - 2) / 1.5) * (1 - smooth01((c - 10.5) / 1.5));
  }

  /**
   * Глядачі i0..i1-1 на мить t. light: спокійний фон — рухаються лише тулуби й голови; руки та шарфи лежать згорнутими.
   * Тулуб і шарф повернуті віссю x уздовж трибуни (lx, lz), голова хилиться до поля (fx, fz).
   */
  writeMatrices(t, light, i0, i1) {
    const rx = this.rx, px = this.px, mb = this.body.instanceMatrix.array, mh = this.head.instanceMatrix.array, ma = this.arms.instanceMatrix.array, msc = this.scarf.instanceMatrix.array;
    const ch = this.chant || 0, beat = t * 4.6, pw = px ? 1 - smooth01(this.pxT / FADE) : 0;
    if (rx) rxEnv(rx);
    const env = _P[ENV], we = _P[WE];
    if (px) rxEnv(px);
    const penv = _P[ENV], pwe = _P[WE];
    for (let i = i0; i < i1; i++) {
      const ph = this.ph[i], s = this.side[i];
      // фон: дихання, погойдування голів, у співах — ритмічні стрибки та руки вгору
      let jump = Math.sin(t * 1.6 + ph * 3) * 0.018, headY = 0, headZ = Math.sin(t * 0.9 + ph) * 0.035, arm = 0, lean = 0, scarfUp = 0;
      if (ch > 0.01 && s >= 0) {
        const pulse = Math.abs(Math.sin(beat + ph * 0.12));
        jump += 0.1 * pulse * ch; arm = ph < 3.7 ? (0.4 + 0.5 * pulse) * ch : 0; scarfUp = ph < 3.1 ? ch : 0;
      }
      // поточна реакція (r = 0) і та, що згасає під нею (r = 1, вага pw); без виклику функції: дробові аргументи V8 пакує в об'єкти
      let rj = 0;
      for (let r = 0; r < 2; r++) {
        const q = r ? px : rx;
        if (!q) continue;
        const w = r ? pw : 1, e = r ? penv : env, ty = q.type;
        let j = 0, a = 0, sc = 0, hy = 0, l = 0, hz = 0;
        if (ty === 'goal') {
          const mine = q.mine, joy = mine ? (s >= 0 ? 1 : 0.2) : (s < 0 ? 1 : 0), sad = mine ? (s < 0 ? 1 : 0) : (s >= 0 ? 0.9 : 0.4);
          j = Math.abs(Math.sin(t * 9 + ph)) * 0.55 * e * joy; a = e * joy; hy = -0.16 * e * sad; l = 0.1 * e * sad; sc = ph < 3.5 ? joy * e : 0;
        } else if (ty === 'groan') { hy = -0.17 * e; l = 0.12 * e; hz = Math.sin(t * 4 + ph) * 0.05 * e; }
        else if (ty === 'gasp') { const g = Math.min(1, q.t * 9) * Math.max(0, 1 - q.t / q.dur); hy = 0.22 * g; l = -0.1 * g; j = 0.08 * g; a = ph < 2.6 ? 0.9 * g : 0; }
        else if (ty === 'wave') { const pl = Math.pow(Math.max(0, Math.sin((this.bx[i] + this.bz[i]) * 0.11 - q.t * 5.5)), 3) * (r ? pwe : we); j = 0.45 * pl; a = pl; }
        else if (ty === 'clap') { j = Math.abs(Math.sin(t * 13 + ph)) * 0.05 * e; a = 0.45 * e * (0.5 + 0.5 * Math.sin(t * 13 + ph)); }
        else if (ty === 'flash') { a = ph < 3 ? 0.85 * Math.min(1, q.t * 3) * Math.max(0, 1 - q.t / q.dur) : 0; }
        rj = Math.max(rj, j * w); arm = Math.max(arm, a * w); scarfUp = Math.max(scarfUp, sc * w); headY += hy * w; lean += l * w; headZ += hz * w;
      }
      jump += rj;
      const o = i * 16, y = this.by[i] + jump, x = this.bx[i], z = this.bz[i], lx = this.lx[i], lz = this.lz[i];
      mb[o] = lx; mb[o + 1] = 0; mb[o + 2] = lz; mb[o + 3] = 0; mb[o + 4] = 0; mb[o + 5] = 1; mb[o + 6] = 0; mb[o + 7] = 0;
      mb[o + 8] = -lz; mb[o + 9] = 0; mb[o + 10] = lx; mb[o + 11] = 0; mb[o + 12] = x; mb[o + 13] = y; mb[o + 14] = z; mb[o + 15] = 1;
      mh[o] = 1; mh[o + 1] = 0; mh[o + 2] = 0; mh[o + 3] = 0; mh[o + 4] = 0; mh[o + 5] = 1; mh[o + 6] = 0; mh[o + 7] = 0;
      mh[o + 8] = 0; mh[o + 9] = 0; mh[o + 10] = 1; mh[o + 11] = 0;
      mh[o + 12] = x + lx * headZ + this.fx[i] * lean; mh[o + 13] = y + 0.66 + headY; mh[o + 14] = z + lz * headZ + this.fz[i] * lean; mh[o + 15] = 1;
      if (light) continue;
      const sc = arm > 0.04 ? arm : 0.0001, ay = y + 0.4 + 0.31 * sc;
      for (let k = 0; k < 2; k++) {
        const oa = (i * 2 + k) * 16, sx = k ? 0.43 : -0.43;
        ma[oa] = 1; ma[oa + 1] = 0; ma[oa + 2] = 0; ma[oa + 3] = 0; ma[oa + 4] = 0; ma[oa + 5] = sc; ma[oa + 6] = 0; ma[oa + 7] = 0;
        ma[oa + 8] = 0; ma[oa + 9] = 0; ma[oa + 10] = 1; ma[oa + 11] = 0; ma[oa + 12] = x + lx * sx; ma[oa + 13] = ay; ma[oa + 14] = z + lz * sx; ma[oa + 15] = 1;
      }
      // шарф над піднятою рукою: гойдається; виростає з руки, а не з'являється на весь розмір за один кадр
      const ss = Math.max(0.0001, smooth01((scarfUp - 0.15) / 0.35)), rot = Math.sin(t * 8 + ph) * 0.5, cr = Math.cos(rot) * ss, sr = Math.sin(rot) * ss, ty2 = y + 0.4 + 0.62 * Math.max(sc, 0.5) + 0.06;
      msc[o] = cr * lx; msc[o + 1] = sr; msc[o + 2] = cr * lz; msc[o + 3] = 0; msc[o + 4] = -sr * lx; msc[o + 5] = cr; msc[o + 6] = -sr * lz; msc[o + 7] = 0;
      msc[o + 8] = -lz * ss; msc[o + 9] = 0; msc[o + 10] = lx * ss; msc[o + 11] = 0; msc[o + 12] = x + 0.43 * lx; msc[o + 13] = ty2; msc[o + 14] = z + 0.43 * lz; msc[o + 15] = 1;
    }
    const c = i1 - i0;
    if (c <= 0) return;
    this.push(this.body, i0 * 16, c * 16); this.push(this.head, i0 * 16, c * 16);
    if (!light) { this.push(this.arms, i0 * 32, c * 32); this.push(this.scarf, i0 * 16, c * 16); }
  }

  /**
   * Вантажимо на GPU лише записаний шматок буфера: усі 12 тисяч матриць важать понад 700 КБ. Діапазони — готові об'єкти з
   * userData.rg; рендерер очищає список після вивантаження, а якщо меш давно не малювався, список згортається в один діапазон.
   */
  push(mesh, start, count) {
    const a = mesh.instanceMatrix, R = a.updateRanges;
    if (R.length >= 4) { const r = R[0]; R.length = 1; r.start = 0; r.count = this.live * (mesh === this.arms ? 32 : 16); }
    else { const r = mesh.userData.rg[R.length]; r.start = start; r.count = count; R.push(r); }
    a.needsUpdate = true;
  }

  /** Рівень деталізації: частка глядачів, частота їхнього оновлення, полотнища (src/core/perf.js). */
  setDetail(d) {
    this.live = Math.max(1, Math.round(this.n * d.crowd)); this.every = d.crowdEvery;
    this.body.count = this.head.count = this.scarf.count = this.live; this.arms.count = this.live * 2;
    for (let i = 0; i < this.banners.length; i++) this.banners[i].m.visible = d.banners;
    for (let i = 0; i < this.flags.length; i++) this.flags[i].gr.visible = d.banners;
    this.cur = 0; this.acc = 0;
    this.writeMatrices(this.t, false, 0, this.live);
  }

  /**
   * Розподілене оновлення: щокадру переписуємо шматок натовпу, щоб кожен глядач оновлювався hz разів на секунду справжнього
   * часу. Раніше весь натовп писався раз на crowdEvery кадрів: трибуна смикалась уся разом, на 30 к/с співи йшли 3–4 рази на
   * секунду, а кадр із записом був важчим за сусідні.
   */
  stagger(t, real, hz, light) {
    const n = this.live;
    this.acc += n * hz * real;
    if (this.acc >= n) { this.acc = 0; this.cur = 0; this.writeMatrices(t, light, 0, n); return; }
    const k = Math.floor(this.acc);
    if (k <= 0) return;
    this.acc -= k;
    const i0 = this.cur >= n ? 0 : this.cur, e = i0 + k;
    if (e <= n) { this.writeMatrices(t, light, i0, e); this.cur = e; }
    else { this.writeMatrices(t, light, i0, n); this.writeMatrices(t, light, 0, e - n); this.cur = e - n; }
  }

  /**
   * dt — час гри (у сповільненні менший, у паузі 0). Годинник трибун свій: Match.time стоїть у вступі, на фіналі й у серії
   * пенальті, і з ним завмирали б і полотнища, і стрибки. Частоту оновлення натовпу міряємо справжнім часом кадру.
   */
  update(dt) {
    dt = dt > 0.1 ? 0.1 : dt > 0 ? dt : 0;
    const now = performance.now(), real = Math.min(0.1, Math.max(0, (now - this.lastNow) / 1000));
    this.lastNow = now;
    const t = (this.t += dt), rx = this.rx, ch = this.chantEnv(t), react = rx && (rx.type === 'goal' || rx.type === 'wave') ? Math.min(1, rx.t * 4) * Math.max(0, 1 - rx.t / rx.dur) : 0;
    this.chant = ch;
    const active = !!rx || !!this.px || ch > 0.01;
    this.arms.visible = this.scarf.visible = active;       // поза реакціями й співами руки й шарфи згорнуті: не малюємо їх узагалі
    // сила радості згладжена: нова реакція скидає rx.t, і полотнища б смикнулись разом зі стрибком react
    this.rs += (react - this.rs) * (1 - Math.exp(-dt * 6));
    const amp = Math.min(1.3, 0.28 + 0.65 * ch + 0.8 * this.rs);
    // фази накопичуємо: їхня частота залежить від amp, а sin(t·f(amp)) на великому t стрибав би на радіани за кадр
    this.phB = (this.phB + dt * (1.3 + 4 * amp)) % TAU; this.phF = (this.phF + dt * (1.1 + 3 * amp)) % TAU;
    WAVE.uWave.value = (WAVE.uWave.value + dt * (7 + 6 * amp)) % TAU; WAVE.uFlut.value = (t * 9) % TAU; WAVE.uAmp.value = amp;
    // полотнища й прапори: тряска в ритм співів, сильніше під час радості
    const beat = Math.sin(t * 4.6), rs = this.rs;
    for (let i = 0; i < this.banners.length; i++) {
      const b = this.banners[i];
      b.m.rotation.z = Math.sin(this.phB + b.ph) * (0.02 + 0.09 * amp) + beat * 0.05 * ch;
      b.m.rotation.x = Math.sin(t * 0.9 + b.ph * 2) * 0.03 + Math.abs(beat) * 0.06 * ch;
      b.m.position.y = b.y + Math.abs(Math.sin(t * 4.6 + b.ph * 0.2)) * 0.3 * ch + Math.abs(Math.sin(t * 7 + b.ph)) * 0.4 * rs;
    }
    for (let i = 0; i < this.flags.length; i++) { const f = this.flags[i]; f.gr.rotation.z = Math.sin(this.phF + f.ph) * (0.03 + 0.12 * amp) + beat * 0.08 * ch; }
    if (rx) { rx.t += dt; if (rx.type === 'flash') this.runFlashes(dt); }
    const px = this.px;
    if (px) { px.t += dt; this.pxT += dt; if (this.pxT >= FADE || px.t >= px.dur) this.px = null; }
    // глядачі: у реакціях і співах — 60/crowdEvery разів на секунду (не рідше 20), у спокої — легкий фон 7.5/crowdEvery
    if (dt > 0) {
      if (active) { this.wasActive = true; if (this.every <= 1) this.writeMatrices(t, false, 0, this.live); else this.stagger(t, real, Math.max(20, 60 / this.every), false); }
      else if (this.wasActive) { this.wasActive = false; this.cur = 0; this.acc = 0; this.writeMatrices(t, false, 0, this.live); }   // згортаємо руки й шарфи всім одразу
      else this.stagger(t, real, 7.5 / this.every, true);
    }
    if (rx && rx.t >= rx.dur) { this.rx = null; this.flash.count = 0; }
    // димові шашки в домашньому секторі під час співів
    if (ch > 0.5 && this.particles && this.flagSmoke) {
      this.smokeT = (this.smokeT || 0) - dt;
      if (this.smokeT <= 0) {
        this.smokeT = 0.16;
        const f = this.flags[(vrand() * this.flags.length) | 0];
        if (f && f.home) this.particles.emit(f.gr.position.x, f.gr.position.y + 4.6, f.gr.position.z, (vrand() - 0.5) * 0.8, 1.6, (vrand() - 0.5) * 0.8, 1.9, 0.5, vrand() < 0.5 ? '#d6282f' : '#f1efe8', -1.2, 0.8, 0, 0.6);
      }
    }
  }

  /** Спалахи камер телефонів по трибунах. */
  runFlashes(dt) {
    const dm = _fm, tmp = _fp, sc = _fs, q = _fq;
    this.flash.count = this.flashN;
    for (let i = 0; i < this.flashN; i++) {
      this.flashT[i] -= dt;
      if (this.flashT[i] <= 0 && vrand() < dt * 2.6) { this.flashT[i] = 0.09; this.flashI[i] = (vrand() * this.live) | 0; }
      const on = this.flashT[i] > 0, f = this.flashI[i];
      tmp.set(this.bx[f], this.by[f] + 1.2, this.bz[f]); sc.setScalar(on ? 1 : 0.0001);
      dm.compose(tmp, q, sc); this.flash.setMatrixAt(i, dm);
    }
    this.flash.instanceMatrix.needsUpdate = true;
  }
}
