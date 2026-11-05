// Stands: трибуни й глядачі (анімація в шейдерах), реакції натовпу на гру, банери, прапори, сектор гостей.
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

const { L, W, WALL, GOAL_D, G } = PITCH;
const ROW_D = 1.45, ROW_H = 0.92, SP = 0.98, FS = 8;   // FS — чисел на фана в списку fans конструктора
const HOME_CLOTH = ['#a8182b', '#e8e4d8'], HOME_SCARF = ['#c8213a', '#f1efe8', '#157a46', '#c8213a'];
const CLOTHES = ['#2b3a4a', '#58687a', '#c9c4b8', '#8f2a2f', '#2f6b4b', '#c99a45', '#3d3d44', '#7e8a94', '#e1ddd2', '#5b4a63', '#a5b3bd'];
const SKINS = ['#e8bf9b', '#d4a074', '#b07a52', '#8a5a3c', '#f0cfb0'];
const TAU = Math.PI * 2;
const smooth01 = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };

/**
 * Уся анімація трибун — у вершинних шейдерах: процесор щокадру ставить лише кілька uniform, буферів не вивантажує.
 * uT — годинник трибун (Stands.t за модулем 3600, щоб float у шейдері не втрачав точності).
 * uPhB, uPhF, uWave, uFlut — уже накопичені фази полотнищ: їхня частота залежить від uAmp, і sin(t·f(uAmp)) на 10-й хвилині
 * стрибав би на радіани за кадр. uRa/uRb — поточна реакція й та, що згасає під нею (тип, t, dur, mine), uRo — звідки
 * вони розходяться (x, z), uRw — вага старої, uBall — м'яч, згладжений (x, z), і напруга біля воріт +x та −x.
 */
const U = {
  uT: { value: 0 }, uCh: { value: 0 }, uAmp: { value: 0.3 }, uRs: { value: 0 }, uPhB: { value: 0 }, uPhF: { value: 0 }, uWave: { value: 0 }, uFlut: { value: 0 },
  uRa: { value: new THREE.Vector4(0, 0, 1, 0) }, uRb: { value: new THREE.Vector4(0, 0, 1, 0) }, uRo: { value: new THREE.Vector4() }, uRw: { value: 0 },
  uBall: { value: new THREE.Vector4() },
};
const useU = (sh, names) => { for (const k of names) sh.uniforms[k] = U[k]; };

/** Полотнища й прапори: усі разом кількома мешами. Півот (aPiv: x, y, z, фаза) і курс (aRot.x) лежать у вершинах, aRot.y — 0 банер, 1 прапор, 2 древко прапора. */
const BAN_VS = `uniform float uT, uCh, uAmp, uRs, uPhB, uPhF, uWave, uFlut;
attribute vec4 aPiv;
attribute vec2 aRot;
vec3 bnRot(vec3 v, float rz, float rx, float ry) {
  float c = cos(rz), s = sin(rz);
  v = vec3(c * v.x - s * v.y, s * v.x + c * v.y, v.z);
  c = cos(rx); s = sin(rx);
  v = vec3(v.x, c * v.y - s * v.z, s * v.y + c * v.z);
  c = cos(ry); s = sin(ry);
  return vec3(c * v.x + s * v.z, v.y, -s * v.x + c * v.z);
}
`;
const BAN_NORMAL = `#include <beginnormal_vertex>
  float bnK = aRot.y, bnPh = aPiv.w, bnBeat = sin(uT * 4.6), bnZ = 0.0, bnX = 0.0, bnY = 0.0;
  if (bnK < 0.5) {
    bnZ = sin(uPhB + bnPh) * (0.02 + 0.09 * uAmp) + bnBeat * 0.05 * uCh;
    bnX = sin(uT * 0.9 + bnPh * 2.0) * 0.03 + abs(bnBeat) * 0.06 * uCh;
    bnY = abs(sin(uT * 4.6 + bnPh * 0.2)) * 0.3 * uCh + abs(sin(uT * 7.0 + bnPh)) * 0.4 * uRs;
  } else {
    bnZ = sin(uPhF + bnPh) * (0.03 + 0.12 * uAmp) + bnBeat * 0.08 * uCh;
  }
  objectNormal = bnRot(objectNormal, bnZ, bnX, aRot.x);`;
const BAN_POS = `#include <begin_vertex>
  if (bnK < 1.5) {
    float bnCl = smoothstep(0.65, 0.95, position.y);
    float bnW = aPiv.x * 0.8 + aPiv.z * 0.6;
    transformed.z += sin(position.x * 2.8 + uWave + bnW) * (0.05 + 0.2 * uAmp) * bnCl;
    transformed.y += sin(uFlut + bnW + position.x) * 0.05 * uAmp * bnCl;
  }
  transformed = aPiv.xyz + vec3(0.0, bnY, 0.0) + bnRot(transformed, bnZ, bnX, aRot.x);`;
function bannerMat(mat) {
  mat.onBeforeCompile = (sh) => {
    useU(sh, ['uT', 'uCh', 'uAmp', 'uRs', 'uPhB', 'uPhF', 'uWave', 'uFlut']);
    sh.vertexShader = BAN_VS + sh.vertexShader.replace('#include <beginnormal_vertex>', BAN_NORMAL).replace('#include <begin_vertex>', BAN_POS);
  };
  mat.customProgramCacheKey = () => 'stands-banner';
  return mat;
}
/** Вершинам однієї деталі — її півот, фаза й курс. */
function pin(geo, x, y, z, ph, ry, kind) {
  const n = geo.attributes.position.count, P = new Float32Array(n * 4), R = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) { P[i * 4] = x; P[i * 4 + 1] = y; P[i * 4 + 2] = z; P[i * 4 + 3] = ph; R[i * 2] = ry; R[i * 2 + 1] = kind; }
  geo.setAttribute('aPiv', new THREE.BufferAttribute(P, 4)); geo.setAttribute('aRot', new THREE.BufferAttribute(R, 2));
  return geo;
}

/**
 * Натовп: один меш на всіх (тулуб, голова, дві руки, шарф — aPart 0..4), глядач — екземпляр. Локальний кадр глядача:
 * x уздовж трибуни, y угору, z до поля (aDir.xy), тож тулуб за воротами теж стоїть обличчям до гри.
 * Реакції 1 гол, 2 стогін, 3 ахання, 4 хвиля, 5 оплески, 6 спалахи, 7 промах чи сейв (mine — чия команда била).
 * Гол, стогін, ахання й промах розходяться від м'яча: далекі сектори підхоплюють до 0.8 с пізніше.
 */
const CROWD_VS = `uniform float uT, uCh, uRw;
uniform vec4 uRa, uRb, uRo, uBall;
attribute float aPart;
attribute vec4 aBase;
attribute vec3 aDir;
attribute vec3 aCloth;
attribute vec3 aSkin;
attribute vec3 aScarf;
varying vec3 vCrowd;
float crEnv(float rt, float dur) {
  if (rt <= 0.0) return 0.0;
  float q = clamp(rt / dur, 0.0, 1.0);
  return min(1.0, rt * 7.0) * (1.0 - q * q * (3.0 - 2.0 * q));
}
// M: стрибок, руки, шарф (беремо найбільше); A: голова вниз, нахил до поля, погойдування (додаємо)
void crReact(vec4 R, vec2 org, float w, float s, float ph, vec2 xz, inout vec3 M, inout vec3 A) {
  float ty = R.x;
  if (ty < 0.5 || w <= 0.0) return;
  float rt = R.y, dur = R.z, t = uT;
  bool mine = R.w > 0.5, home = s > -0.5;
  if (ty < 3.5 || ty > 6.5) rt -= min(0.8, distance(xz, org) * 0.008);
  float e = crEnv(rt, dur);
  float j = 0.0, a = 0.0, sc = 0.0, hy = 0.0, l = 0.0, hz = 0.0;
  if (ty < 1.5) {
    float joy = mine ? (home ? 1.0 : 0.2) : (home ? 0.0 : 1.0);
    float sad = mine ? (home ? 0.0 : 1.0) : (home ? 0.9 : 0.4);
    j = abs(sin(t * 9.0 + ph)) * 0.55 * e * joy; a = e * joy; hy = -0.16 * e * sad; l = 0.1 * e * sad; sc = ph < 3.5 ? joy * e : 0.0;
  } else if (ty < 2.5) {
    hy = -0.17 * e; l = 0.12 * e; hz = sin(t * 4.0 + ph) * 0.05 * e;
  } else if (ty < 3.5) {
    float g = rt > 0.0 ? min(1.0, rt * 9.0) * max(0.0, 1.0 - rt / dur) : 0.0;
    hy = 0.22 * g; l = -0.1 * g; j = 0.08 * g; a = ph < 2.6 ? 0.9 * g : 0.0;
  } else if (ty < 4.5) {
    float we = min(1.0, max(0.0, rt) * 2.0) * clamp((dur - rt) * 1.5, 0.0, 1.0);
    float sw = max(0.0, sin((xz.x + xz.y) * 0.11 - rt * 5.5));
    float pl = sw * sw * sw * we;
    j = 0.45 * pl; a = pl;
  } else if (ty < 5.5) {
    float cp = sin(t * 13.0 + ph);
    j = abs(cp) * 0.05 * e; a = 0.45 * e * (0.5 + 0.5 * cp);
  } else if (ty < 6.5) {
    a = (ph < 3.0 && rt > 0.0) ? 0.85 * min(1.0, rt * 3.0) * max(0.0, 1.0 - rt / dur) : 0.0;
  } else if (mine == home) {
    float up = rt > 0.0 ? max(0.0, 1.0 - rt * 2.5) : 0.0;
    j = 0.22 * e * up; a = 0.8 * e; hy = -0.12 * e; l = -0.07 * e;
  } else {
    float cp = sin(t * 11.0 + ph);
    j = abs(cp) * 0.06 * e; a = 0.3 * e * (0.5 + 0.5 * cp);
  }
  M = max(M, vec3(j, a, sc) * w);
  A += vec3(hy, l, hz) * w;
}
vec3 crowdPos(vec3 p) {
  float ph = aBase.w, s = aDir.z, t = uT, part = aPart;
  vec2 xz = aBase.xz, fw = aDir.xy, lt = vec2(fw.y, -fw.x);
  float jump = sin(t * 1.6 + ph * 3.0) * 0.018;
  vec3 M = vec3(0.0);
  vec3 A = vec3(0.0, 0.0, sin(t * 0.9 + ph) * 0.035);
  if (uCh > 0.01 && s > -0.5) {
    float pulse = abs(sin(t * 4.6 + ph * 0.12));
    jump += 0.1 * pulse * uCh;
    M.y = ph < 3.7 ? (0.4 + 0.5 * pulse) * uCh : 0.0;
    M.z = ph < 3.1 ? uCh : 0.0;
  }
  // напруга біля воріт: домашні атакують ворота +x, гості −x. Коли атакують свої — встають і тягнуть руки,
  // коли загрожують своїм — подаються вперед і хапаються за голову. Ближчі до тих воріт реагують сильніше
  float home = s > -0.5 ? 1.0 : 0.0;
  float wp = uBall.z * (0.45 + 0.55 * clamp(1.0 - abs(xz.x - ${(L + 6).toFixed(1)}) / 100.0, 0.0, 1.0));
  float wm = uBall.w * (0.45 + 0.55 * clamp(1.0 - abs(xz.x + ${(L + 6).toFixed(1)}) / 100.0, 0.0, 1.0));
  float att = mix(wm, wp, home), def = mix(wp, wm, home);
  jump += 0.16 * att + 0.05 * att * abs(sin(t * 5.0 + ph));
  M.y = max(M.y, ph < 2.2 ? 0.55 * att : (ph > 5.0 ? 0.45 * def : 0.0));
  A.y += 0.07 * att + 0.06 * def;
  A.x -= 0.04 * def;
  crReact(uRa, uRo.xy, 1.0, s, ph, xz, M, A);
  crReact(uRb, uRo.zw, uRw, s, ph, xz, M, A);
  jump += M.x;
  // погляд за м'ячем: голова повертається до нього, тулуб трохи; дехто час від часу дивиться повз
  vec2 d = uBall.xy - xz;
  float look = atan(dot(d, lt), dot(d, fw) + 0.001) + sin(t * 0.37 + ph * 2.0) * 0.18;
  float hyaw = clamp(look, -1.1, 1.1), yaw = clamp(look * 0.3, -0.35, 0.35);
  float arm = M.y, sc = arm > 0.04 ? arm : 0.0001;
  vec3 v;
  if (part < 0.5) {
    v = vec3(p.x, p.y + jump, p.z);
  } else if (part < 1.5) {
    float hc = cos(hyaw), hs = sin(hyaw);
    v = vec3(p.x * hc + p.z * hs + A.z, p.y + jump + 0.66 + A.x, -p.x * hs + p.z * hc + A.y);
    yaw = 0.0;
  } else if (part < 3.5) {
    v = vec3(p.x + (part < 2.5 ? -0.43 : 0.43), p.y * sc + jump + 0.4 + 0.31 * sc, p.z);
  } else {
    float ss = max(0.0001, smoothstep(0.15, 0.5, M.z)), r = sin(t * 8.0 + ph) * 0.5, rc = cos(r), rs = sin(r);
    vec3 q = p * ss;
    v = vec3(rc * q.x - rs * q.y + 0.43, rs * q.x + rc * q.y + jump + 0.4 + 0.62 * max(sc, 0.5) + 0.06, q.z);
  }
  float yc = cos(yaw), ys = sin(yaw);
  v = vec3(v.x * yc + v.z * ys, v.y, -v.x * ys + v.z * yc);
  return aBase.xyz + vec3(lt.x, 0.0, lt.y) * v.x + vec3(0.0, v.y, 0.0) + vec3(fw.x, 0.0, fw.y) * v.z;
}
`;
function crowdMat() {
  const mat = new THREE.MeshLambertMaterial({ flatShading: true });   // flatShading: нормаль із похідних, вершинну не крутимо
  mat.onBeforeCompile = (sh) => {
    useU(sh, ['uT', 'uCh', 'uRw', 'uRa', 'uRb', 'uRo', 'uBall']);
    sh.vertexShader = CROWD_VS + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
  transformed = crowdPos(position);
  vCrowd = aPart < 0.5 ? aCloth : (aPart < 3.5 ? aSkin : aScarf);`);
    sh.fragmentShader = 'varying vec3 vCrowd;\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb *= vCrowd;');
  };
  mat.customProgramCacheKey = () => 'stands-crowd';
  return mat;
}
const RX = { goal: 1, groan: 2, gasp: 3, wave: 4, clap: 5, flash: 6, miss: 7 };
const DUR = { goal: 3.8, groan: 2.6, gasp: 1.2, wave: 4.2, clap: 2.6, flash: 3.2, miss: 2.2 };
const TAIL = 0.8;                                   // с: стільки ще йде реакція, що розходиться від м'яча (CROWD_VS, rt −= відстань)
const FADE = 0.3;                                   // с: стільки згасає попередня реакція, коли поверх неї почалась нова

const _fm = new THREE.Matrix4(), _fp = new THREE.Vector3(), _fs = new THREE.Vector3(), _fq = new THREE.Quaternion();
/** Свій генератор для спалахів і диму: натовп не бере Math.random, тож не зсуває випадковість гри в симуляторі. */
const vrand = rng(53);

/** Трибуни навколо арени: бетон одним мешем, натовп одним мешем з екземплярами, полотнища й прапори п'ятьма. */
export class Stands {
  constructor() {
    this.group = new THREE.Group();
    const b = new VoxelBuilder(0.2);
    const fans = [], spots = [], awaySpots = [], sides = [], flagSpots = [];          // FS чисел на фана: x, y, z, фаза, колір тіла, колір голови, обличчям до поля (fx, fz)
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
          fans.push(px + ax * lat, top + 0.46, pz + az * lat, rnd() * 6.28, pickCloth(home), SKINS[(rnd() * SKINS.length) | 0], -dx, -dz);
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
    this.n = n; this.live = n;
    // t — власний годинник трибун (Match.time стоїть у вступі, фіналі й серії пенальті)
    this.t = 0; this.rs = 0; this.phB = 0; this.phF = 0;
    // м'яч (view.ball.group.position ставить MatchView): згладжена точка погляду, швидкість і напруга біля воріт +x і −x
    this.ball = null; this.lbx = 0; this.lbz = 0; this.sbx = 0; this.sbz = 0; this.tenP = 0; this.tenM = 0;
    this.bx = new Float32Array(n); this.by = new Float32Array(n); this.bz = new Float32Array(n);   // для спалахів
    const base = new Float32Array(n * 4), dir = new Float32Array(n * 3), cloth = new Float32Array(n * 3), skin = new Float32Array(n * 3), scarf = new Float32Array(n * 3);
    const c = new THREE.Color(), put = (arr, i, col) => { arr[i * 3] = col.r; arr[i * 3 + 1] = col.g; arr[i * 3 + 2] = col.b; };
    this.homeFans = []; this.homeKey = '';
    for (let i = 0; i < n; i++) {
      const o = i * FS;
      this.bx[i] = fans[o]; this.by[i] = fans[o + 1]; this.bz[i] = fans[o + 2];
      base[i * 4] = fans[o]; base[i * 4 + 1] = fans[o + 1]; base[i * 4 + 2] = fans[o + 2]; base[i * 4 + 3] = fans[o + 3];
      dir[i * 3] = fans[o + 6]; dir[i * 3 + 1] = fans[o + 7]; dir[i * 3 + 2] = sides[i];
      const shade = 0.85 + rnd() * 0.25; put(cloth, i, c.set(fans[o + 4]).multiplyScalar(shade));
      if (fans[o + 4] === HOME_CLOTH[0] || fans[o + 4] === HOME_CLOTH[1]) this.homeFans.push(i, fans[o + 4] === HOME_CLOTH[0] ? 0 : 1, shade);   // у клубному: їх перефарбовує setHome
      put(skin, i, c.set(fans[o + 5]));
    }
    this.scarfI = new Uint8Array(n);
    for (let i = 0; i < n; i++) { this.scarfI[i] = (rnd() * HOME_SCARF.length) | 0; put(scarf, i, c.set(HOME_SCARF[this.scarfI[i]])); }
    // одна фігура: тулуб, голова, дві руки, шарф; низ коробки ніколи не видно з камери зверху
    const noBottom = (geo) => { const ix = geo.index.array, keep = []; for (let f = 0; f < ix.length; f += 3) { if (f < 18 || f >= 24) keep.push(ix[f], ix[f + 1], ix[f + 2]); } geo.setIndex(keep); return geo; };   // BoxGeometry: грані +x,-x,+y,-y,+z,-z по 6 індексів
    const box = (w, h, d, part) => { const g = noBottom(new THREE.BoxGeometry(w, h, d)); g.deleteAttribute('uv'); g.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(part), 1)); return g; };
    const fig = mergeGeometries([box(0.72, 0.84, 0.56, 0), box(0.44, 0.44, 0.44, 1), box(0.17, 0.62, 0.17, 2), box(0.17, 0.62, 0.17, 3), box(0.62, 0.09, 0.14, 4)]);
    const geo = new THREE.InstancedBufferGeometry();
    geo.setIndex(fig.index);
    for (const k of ['position', 'normal', 'aPart']) geo.setAttribute(k, fig.attributes[k]);
    geo.setAttribute('aBase', new THREE.InstancedBufferAttribute(base, 4));
    geo.setAttribute('aDir', new THREE.InstancedBufferAttribute(dir, 3));
    geo.setAttribute('aCloth', (this.aCloth = new THREE.InstancedBufferAttribute(cloth, 3)));
    geo.setAttribute('aSkin', new THREE.InstancedBufferAttribute(skin, 3));
    geo.setAttribute('aScarf', (this.aScarf = new THREE.InstancedBufferAttribute(scarf, 3)));
    geo.instanceCount = n;
    this.crowd = new THREE.Mesh(geo, crowdMat()); this.crowd.frustumCulled = false;
    this.flashN = 140;
    this.flash = new THREE.InstancedMesh(new THREE.BoxGeometry(0.34, 0.34, 0.1), new THREE.MeshBasicMaterial({ color: '#ffffff' }), this.flashN);
    this.flash.frustumCulled = false; this.flash.count = 0; this.flashT = new Float32Array(this.flashN); this.flashI = new Int32Array(this.flashN);
    this.rx = null; this.px = null; this.pxT = 0; this.chant = 0; this.flagSmoke = true;
    this.group.add(this.crowd, this.flash);
    this.cloths = [];                                // меші полотнищ і прапорів: вмикає й вимикає setDetail
    this.buildBanners(spots, rnd);
    this.buildAway(awaySpots);
    this.buildFlags(flagSpots);
  }

  /** Банери на древках одним мешем зі спільним атласом; гойдаються й підстрибують у шейдері (BAN_VS). */
  buildBanners(spots, rnd) {
    const map = bannerAtlas(), mat = bannerMat(new THREE.MeshLambertMaterial({ map, side: THREE.DoubleSide }));
    this.homeTex = map;
    const BWW = 4.4, BHH = BWW * BH / BW, order = TEXTS.map((_, i) => i).sort(() => rnd() - 0.5), all = [];
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
      all.push(pin(mergeGeometries(parts), sp.x, sp.y - 0.9, sp.z, rnd() * 6.28, sp.ry, 0));
    });
    this.addCloth(all, mat);
  }
  addCloth(geos, mat) {
    const m = new THREE.Mesh(mergeGeometries(geos), mat); m.frustumCulled = false;
    this.group.add(m); this.cloths.push(m);
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
    const gH = [], gA = [], gP = [];
    this.flagPos = [];                               // для диму з домашніх прапорів
    for (const sp of spots) {
      const w = 2.4, hh = 1.5, ph = Math.random() * 6.28, y = sp.y - 0.9;
      const cloth = new THREE.PlaneGeometry(w, hh, 14, 1); cloth.translate(w / 2 - 0.05, 0.7 + hh / 2, 0);
      const pole = new THREE.CylinderGeometry(0.05, 0.05, 4.4, 5); pole.translate(0, 2.2, 0);
      (sp.home ? gH : gA).push(pin(cloth, sp.x, y, sp.z, ph, sp.ry, 1));
      gP.push(pin(pole, sp.x, y, sp.z, ph, sp.ry, 2));
      this.flagPos.push({ x: sp.x, y, z: sp.z, home: sp.home });
    }
    this.addCloth(gH, bannerMat(new THREE.MeshLambertMaterial({ map: home.t, side: THREE.DoubleSide })));
    this.addCloth(gA, bannerMat(new THREE.MeshLambertMaterial({ map: away.t, side: THREE.DoubleSide })));
    this.addCloth(gP, bannerMat(new THREE.MeshLambertMaterial({ color: '#59636a' })));
  }

  /** Банери гостей: полотнища з назвою суперника в його кольорах; перемальовуються на кожен матч. */
  buildAway(spots) {
    const c = document.createElement('canvas'); c.width = 768; c.height = 384; this.awayCanvas = c;
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = ANISO; this.awayTex = t;
    const mat = bannerMat(new THREE.MeshLambertMaterial({ map: t, side: THREE.DoubleSide }));
    const BWW = 4.4, BHH = BWW * 128 / 384, all = [];
    spots.forEach((sp, n) => {
      const ti = n % 6, u0 = (ti % 2) / 2, v1 = 1 - ((ti / 2) | 0) / 3, u1 = u0 + 0.5, v0 = v1 - 1 / 3;
      const cloth = new THREE.PlaneGeometry(BWW, BHH, 14, 1); cloth.translate(0, BHH / 2 + 0.7, 0);
      const uv = cloth.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
      const parts = [cloth];
      for (const sx of [-1, 1]) { const st = new THREE.BoxGeometry(0.07, BHH + 0.9, 0.07); st.translate(sx * (BWW / 2 - 0.1), (BHH + 0.9) / 2, 0); const su = st.attributes.uv; for (let i = 0; i < su.count; i++) su.setXY(i, 0.01, 0.01); parts.push(st); }
      all.push(pin(mergeGeometries(parts), sp.x, sp.y - 0.9, sp.z, Math.random() * 6.28, sp.ry, 0));
    });
    this.addCloth(all, mat);
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
    const cl = this.aCloth.array, sa = this.aScarf.array;
    for (let i = 0; i < F.length; i += 3) { c.set(F[i + 1] ? b : a).multiplyScalar(F[i + 2]); const o = F[i] * 3; cl[o] = c.r; cl[o + 1] = c.g; cl[o + 2] = c.b; }
    this.aCloth.needsUpdate = true;
    const sc = club ? [a, b, a, a] : HOME_SCARF;
    for (let i = 0; i < this.n; i++) { c.set(sc[this.scarfI[i]]); sa[i * 3] = c.r; sa[i * 3 + 1] = c.g; sa[i * 3 + 2] = c.b; }
    this.aScarf.needsUpdate = true;
    if (club) {
      const n = String(club.name).toUpperCase(), base = [n, n + ' ВПЕРЕД!', 'ЗА ' + n, n + ' З НАМИ', 'ТІЛЬКИ ' + n, 'ДАВАЙ, ' + n + '!'];
      drawAtlas(this.homeTex.image, TEXTS.map((_, i) => base[i % base.length]), [[a, b], [b, a]]);
      if (club.flag) drawFlag(this.flagHomeCanvas.getContext('2d'), club.flag, 128, 80);
    } else { drawAtlas(this.homeTex.image, TEXTS, SCHEMES); this.flagHomeDraw(); }
    this.homeTex.needsUpdate = true; this.flagHomeTex.needsUpdate = true;
  }

  /**
   * Типи реакцій: goal (радість своїх/сум гостей), groan, gasp, wave, clap, flash, miss (промах чи сейв: mine — чия
   * команда била). Гол, стогін, ахання й промах розходяться від м'яча. Нова реакція поверх живої не обриває її: стара (px)
   * ще FADE с згасає поруч. Ахання не перебиває свіжої реакції: за штангою й сейвом одразу йде промах.
   */
  react(type, o = {}) {
    const cur = this.rx;
    if (type === 'gasp' && cur && cur.type !== 'gasp' && cur.t < 0.6) return;
    if (type !== 'flash') this.flash.count = 0;                // спалахи малює лише реакція flash: без цього застигли б білими квадратами
    this.px = cur && cur.t < cur.end ? cur : null; this.pxT = 0;
    const dur = o.dur || DUR[type] || 2, code = RX[type] || 0, B = this.ball;
    this.rx = { type, code, t: 0, dur, end: dur + (code <= 3 || code === 7 ? TAIL : 0), mine: o.mine !== false, x: B ? B.x : 0, z: B ? B.z : 0 };
  }
  cheer(sec) { this.react('goal', { dur: sec, mine: true }); }

  /** Хор: кожні 16 с на ~9 с домашні сектори стрибають у ритм і піднімають руки/шарфи. */
  chantEnv(t) {
    const c = t % 16;
    return smooth01((c - 2) / 1.5) * (1 - smooth01((c - 10.5) / 1.5));
  }

  /** Рівень деталізації: частка глядачів і полотнища (src/core/perf.js). Місця перемішані, тож менша частка проріджує рівномірно. */
  setDetail(d) {
    this.live = Math.max(1, Math.round(this.n * d.crowd));
    this.crowd.geometry.instanceCount = this.live;
    for (let i = 0; i < this.cloths.length; i++) this.cloths[i].visible = d.banners;
  }

  /**
   * dt — час гри (у сповільненні менший, у паузі 0). Годинник трибун свій: Match.time стоїть у вступі, на фіналі й у серії
   * пенальті. Процесор лише ставить uniform, рух глядачів і полотнищ рахує шейдер.
   */
  update(dt) {
    dt = dt > 0.1 ? 0.1 : dt > 0 ? dt : 0;
    const t = (this.t += dt), rx = this.rx, ch = this.chantEnv(t), react = rx && (rx.type === 'goal' || rx.type === 'wave') ? Math.min(1, rx.t * 4) * Math.max(0, 1 - rx.t / rx.dur) : 0;
    this.chant = ch;
    // сила радості згладжена: нова реакція скидає rx.t, і полотнища б смикнулись разом зі стрибком react
    this.rs += (react - this.rs) * (1 - Math.exp(-dt * 6));
    const amp = Math.min(1.3, 0.28 + 0.65 * ch + 0.8 * this.rs);
    // фази накопичуємо: їхня частота залежить від amp, а sin(t·f(amp)) на великому t стрибав би на радіани за кадр
    this.phB = (this.phB + dt * (1.3 + 4 * amp)) % TAU; this.phF = (this.phF + dt * (1.1 + 3 * amp)) % TAU;
    U.uWave.value = (U.uWave.value + dt * (7 + 6 * amp)) % TAU; U.uFlut.value = (t * 9) % TAU;
    U.uT.value = t % 3600; U.uCh.value = ch; U.uAmp.value = amp; U.uRs.value = this.rs; U.uPhB.value = this.phB; U.uPhF.value = this.phF;
    this.track(dt);
    if (rx) { rx.t += dt; if (rx.type === 'flash') this.runFlashes(dt); }
    const px = this.px;
    if (px) { px.t += dt; this.pxT += dt; if (this.pxT >= FADE || px.t >= px.end) this.px = null; }
    if (rx && rx.t >= rx.end) { this.rx = null; this.flash.count = 0; }
    const a = this.rx, p = this.px;
    if (a) U.uRa.value.set(a.code, a.t, a.dur, a.mine ? 1 : 0); else U.uRa.value.x = 0;
    if (p) U.uRb.value.set(p.code, p.t, p.dur, p.mine ? 1 : 0); else U.uRb.value.x = 0;
    U.uRo.value.set(a ? a.x : 0, a ? a.z : 0, p ? p.x : 0, p ? p.z : 0);
    U.uRw.value = p ? 1 - smooth01(this.pxT / FADE) : 0;
    U.uBall.value.set(this.sbx, this.sbz, this.tenP, this.tenM);
    // димові шашки в домашньому секторі під час співів
    if (ch > 0.5 && this.particles && this.flagSmoke) {
      this.smokeT = (this.smokeT || 0) - dt;
      if (this.smokeT <= 0) {
        this.smokeT = 0.16;
        const f = this.flagPos[(vrand() * this.flagPos.length) | 0];
        if (f && f.home) this.particles.emit(f.x, f.y + 4.6, f.z, (vrand() - 0.5) * 0.8, 1.6, (vrand() - 0.5) * 0.8, 1.9, 0.5, vrand() < 0.5 ? '#d6282f' : '#f1efe8', -1.2, 0.8, 0, 0.6);
      }
    }
  }

  /**
   * Натовп стежить за грою: погляд за м'ячем (згладжено, як у живих людей), напруга біля воріт +x (tenP) і −x (tenM).
   * Напруга росте, коли м'яч ближче ніж ~30 до воріт, і стрибає, коли він летить у створ швидше за 8. Лише з положення м'яча на
   * екрані, тож у гостя натовп реагує так само без жодних даних із мережі.
   */
  track(dt) {
    const B = this.ball;
    if (!B || dt <= 0) return;
    const vx = (B.x - this.lbx) / dt, vz = (B.z - this.lbz) / dt;
    this.lbx = B.x; this.lbz = B.z;
    const k = 1 - Math.exp(-dt * 3.5);
    this.sbx += (B.x - this.sbx) * k; this.sbz += (B.z - this.sbz) * k;
    const moved = vx * vx + vz * vz < 4900;        // інакше м'яч переставили (розведення, повтор), це не удар
    for (let e = 1; e >= -1; e -= 2) {
      const dx = L - e * B.x, dz = Math.max(0, Math.abs(B.z) - G), dist = Math.sqrt(Math.max(0, dx) * Math.max(0, dx) + dz * dz);
      let tg = Math.max(0, 1 - dist / 30); tg = tg * tg * 0.75;
      const ve = e * vx;
      if (moved && ve > 8 && dx > 0 && Math.abs(B.z + vz * dx / ve) < G + 5) tg = Math.max(tg, Math.min(1, (ve - 8) / 12) * (0.5 + 0.5 * Math.max(0, 1 - dist / 45)));
      const cur = e > 0 ? this.tenP : this.tenM, nv = cur + (tg - cur) * (1 - Math.exp(-dt * (tg > cur ? 8 : 1.5)));
      if (e > 0) this.tenP = nv; else this.tenM = nv;
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
