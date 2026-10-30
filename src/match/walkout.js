import * as THREE from 'three';
import { PITCH, ACADEMY } from '../config.js';
import { Player } from '../graphics/player.js';
import { shadowTexture } from '../graphics/textures.js';

const { W } = PITCH;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const TAU = Math.PI * 2;
// жилети волонтерів, що несуть прапори: номер зливається з тлом (його не видно)
const VEST = { main: '#f2c53d', second: '#2b2f33', sleeve: '#2b2f33', shorts: '#2b2f33', socks: '#2b2f33', under: '#2b2f33', collar: '#2b2f33', boot: '#1b1d20', plate: '#f2c53d', numInk: '#f2c53d', ink: 'light' };
const _v = new THREE.Vector3(), _w = new THREE.Vector3();

/** Полотно прапора: два кольори з діагоналлю, біле коло з назвою клубу. */
function flagTexture(a, b, title, sub) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 320;
  const g = c.getContext('2d');
  g.fillStyle = a; g.fillRect(0, 0, 512, 320);
  g.fillStyle = b; g.beginPath(); g.moveTo(300, 0); g.lineTo(512, 0); g.lineTo(512, 320); g.lineTo(150, 320); g.closePath(); g.fill();
  g.fillStyle = 'rgba(255,255,255,.9)'; g.fillRect(0, 148, 512, 24);
  g.beginPath(); g.arc(256, 160, 92, 0, TAU); g.fillStyle = '#f1efe8'; g.fill(); g.lineWidth = 10; g.strokeStyle = a; g.stroke();
  g.fillStyle = '#14231e'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '800 44px Rubik, Arial Black, sans-serif'; g.fillText(title, 256, 150, 168);
  g.font = '800 22px Rubik, Arial Black, sans-serif'; g.fillText(sub, 256, 196, 160);
  g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 8; g.strokeRect(4, 4, 504, 312);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

/** Тканина: сітка вершин, висоту/відхил кожної рахує функція f(u, v) — кубічна, «пласка» тканина під стиль гри. */
class Cloth {
  constructor(w, h, sx, sy, tex) {
    this.geo = new THREE.PlaneGeometry(w, h, sx, sy);
    this.mesh = new THREE.Mesh(this.geo, new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide, flatShading: true }));
    this.base = this.geo.attributes.position.array.slice(); this.w = w; this.h = h;
  }
  /** f(u, v) → зсув уздовж нормалі (локальна Z); u — від лівого краю, v — знизу. */
  shape(f) {
    const p = this.geo.attributes.position, a = p.array, b = this.base;
    for (let i = 0; i < p.count; i++) { const x = b[i * 3], y = b[i * 3 + 1]; a[i * 3 + 2] = f(x / this.w + 0.5, y / this.h + 0.5, x, y); }
    p.needsUpdate = true;
  }
}

/** Прапор на древку: древко ~3.4 м, полотно маяє вбік від руху. Позицію й поворот ставить той, хто несе. */
class PoleFlag {
  constructor(tex) {
    this.group = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.06, 3.4, 0.06), new THREE.MeshLambertMaterial({ color: '#d9dcd8' }));
    pole.position.y = 1.7; this.group.add(pole);
    this.cloth = new Cloth(1.9, 1.2, 14, 8, tex);
    this.cloth.mesh.position.set(0.95, 2.75, 0); this.group.add(this.cloth.mesh);
    this.ph = Math.random() * 6;
  }
  update(t, wind) {
    const ph = this.ph;
    // хвиля біжить від древка: амплітуда росте до вільного краю; ще дрібне тріпотіння
    this.cloth.shape((u, v) => (Math.sin(6.5 * u - t * (5 + 3 * wind) + ph) * (0.2 + 0.12 * wind) + 0.05 * Math.sin(17 * u + 5 * v - t * 13)) * u);
  }
}

/** Волонтер (прапороносець): гравець-модель у жилеті; власна м'яка тінь. */
function bearer(i, view, shadowMat) {
  const p = new Player({ kit: VEST, num: 0, skin: ACADEMY.skins[i % 4], hair: ACADEMY.hairs[(i + 2) % 5], hairCol: ACADEMY.hairCols[i % 6], gk: false, scale: 0.78 });
  p.gaze = true;
  const sh = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.5).rotateX(-Math.PI / 2), shadowMat); sh.renderOrder = 2;
  return { p, sh, x: 0, z: 0, yaw: 0, px: 0, pz: 0 };
}

/**
 * Церемонія виходу: великий прапор клубу посеред поля (12 волонтерів тримають краї й пускають по ньому хвилю — полотно
 * здіймається, наче під ним повітря), двоє прапороносців з клубними прапорами на древках ведуть колони з тунелю,
 * фаєрний дим на трибунах і салют. Створюється раз, живе лише в інтро.
 */
export class Walkout {
  constructor(view) {
    this.view = view; this.group = new THREE.Group(); this.group.visible = false; view.scene.add(this.group);
    const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false, opacity: 0.55 });
    // великий прапор: 15 × 9 м, лежить горизонтально, висоту кожної точки рахує wave()
    this.big = new Cloth(15, 9, 30, 18, flagTexture('#d4202c', '#1f8f3f', 'ЛОКО', 'КИЇВ · 1919'));
    this.big.mesh.rotation.x = -Math.PI / 2; this.group.add(this.big.mesh);
    this.bearers = [];
    // 12 волонтерів по периметру: по 4 на довгих краях, по 2 на коротких; (u, v) — де тримають край.
    // Вони тримають край прапора — лишаються обличчям до нього й ходять приставним кроком (holdFacing)
    const spots = [[0.12, 0], [0.37, 0], [0.63, 0], [0.88, 0], [0.12, 1], [0.37, 1], [0.63, 1], [0.88, 1], [0, 0.3], [0, 0.7], [1, 0.3], [1, 0.7]];
    spots.forEach(([u, v], i) => { const b = bearer(i, view, shadowMat); b.u = u; b.v = v; b.p.holdFacing = true; this.bearers.push(b); this.group.add(b.p.root, b.sh); });
    // прапороносці колон: наш прапор і прапор гостей
    this.poles = [0, 1].map((k) => { const b = bearer(12 + k, view, shadowMat); this.group.add(b.p.root, b.sh); return b; });
    this.flags = [new PoleFlag(flagTexture('#d4202c', '#1f8f3f', 'ЛОКО', '1919')), new PoleFlag(flagTexture('#888', '#444', 'ГОСТІ', ''))];
    for (const f of this.flags) this.group.add(f.group);
    this.cx = 0; this.cz = 5; this.t = 0; this.pyroT = 0;
  }

  /** Новий матч: прапор гостей у кольорах суперника. */
  start(club) {
    const k = club.kit;
    this.flags[1].cloth.mesh.material.map = flagTexture(k.main, k.second, club.name.slice(0, 6).toUpperCase(), club.city || '');
    this.flags[1].cloth.mesh.material.needsUpdate = true;
    this.cx = 0; this.cz = 5; this.t = 0; this.carry = false; this.group.visible = true;
    this.bearers.forEach((b, i) => { b.p.root.visible = true; b.p.setMode('idle'); b.p.gaitSys.ready = false; });
    for (let k = 0; k < 2; k++) { this.poles[k].p.root.visible = this.flags[k].group.visible = this.poles[k].sh.visible = true; }
  }
  hide() { this.group.visible = false; }

  /** Висота полотна (світова Y) у точці (u, v) великого прапора: тримають на рівні пояса, по краях біжить хвиля, середина здіймається. */
  wave(u, v) {
    const t = this.t, raise = this.raise || 0;
    const base = 1.0 + 0.45 * raise, edge = (0.18 + 0.2 * raise) * Math.sin(3.2 * t - TAU * (1.3 * u + 0.6 * v));
    const inner = Math.sin(Math.PI * u) * Math.sin(Math.PI * v), billow = (0.35 + 0.5 * raise) * (0.6 + 0.4 * Math.sin(2.1 * t + 2.5 * u)) * inner;
    return base + edge * (1 - 0.6 * inner) + billow;
  }

  /**
   * Кадр церемонії. poleAt(k, out) — де зараз прапороносець k (0 — наш, 1 — гості) і куди йде: { x, z, vx, vz, yaw }.
   * raise 0..1 — наскільки високо підняти великий прапор (на гімні — вище, хвиля сильніша); carry — відносять до бровки.
   */
  update(dt, t, poleAt, raise, carry) {
    this.t = t; this.raise = (this.raise || 0) + (raise - (this.raise || 0)) * Math.min(1, dt * 2);
    if (carry && this.cz < W - 7) this.cz += 2.2 * dt;               // відносять до бровки й там тримають
    const big = this.big, cx = this.cx, cz = this.cz;
    big.mesh.position.set(cx, 0, cz);
    big.shape((u, v) => this.wave(u, 1 - v));
    // волонтери великого прапора: стоять за краєм обличчям до полотна, руки — на краю (там, де він зараз)
    for (const b of this.bearers) {
      const ex = cx + (b.u - 0.5) * 15, ez = cz + (b.v - 0.5) * 9, nx = b.u === 0 ? -1 : b.u === 1 ? 1 : 0, nz = nx ? 0 : b.v === 0 ? -1 : 1;
      const tx = ex + nx * 0.5, tz = ez + nz * 0.5, p = b.p;
      p.vx = (tx - p.x) / Math.max(dt, 1e-3); p.vz = (tz - p.z) / Math.max(dt, 1e-3);
      if (Math.hypot(p.vx, p.vz) > 6) { p.vx = p.vz = 0; }
      p.x = tx; p.z = tz; p.yaw = Math.atan2(-nx, -nz);
      // кожна рука — на свою точку краю (уздовж краю ±0.35 м)
      const ax = nz ? 1 : 0, az = nx ? 1 : 0;
      for (let h = 0; h < 2; h++) {
        const s = (h ? 1 : -1) * 0.35 * (nz > 0 || nx < 0 ? -1 : 1);
        const hx = ex + ax * s, hz = ez + az * s, hu = (hx - cx) / 15 + 0.5, hv = (hz - cz) / 9 + 0.5;
        p.reach(h, hx, this.wave(clamp(hu, 0, 1), clamp(hv, 0, 1)), hz, 1);
      }
      p.animate(dt);
      b.sh.position.set(p.root.position.x + 0.3, 0.04, p.root.position.z - 0.2);
    }
    // прапороносці колон
    for (let k = 0; k < 2; k++) {
      const b = this.poles[k], p = b.p, f = this.flags[k], at = poleAt(k, _w);
      const vis = !at.hidden; p.root.visible = f.group.visible = b.sh.visible = vis; if (!vis) continue;
      p.x = at.x; p.z = at.z; p.vx = at.vx; p.vz = at.vz; p.yaw = at.yaw;
      // древко — перед грудьми, трохи ближче до правої руки (вона тримає низько, ліва — на рівні плеча): обидва лікті
      // зігнуті, руки дістають древко й тоді, коли тіло на ходу опускається. Позиція — з поточної (а не минулого кадру)
      // позиції тіла, тож древко не відстає від рук. Полотно маяє назад, від напрямку руху
      const y = p.bodyYaw ?? at.yaw, fx = Math.sin(y), fz = Math.cos(y), rx = Math.cos(y), rz = -Math.sin(y), sp = Math.hypot(at.vx, at.vz);
      const px = p.x + fx * 0.3 + rx * 0.09, pz = p.z + fz * 0.3 + rz * 0.09;
      f.group.position.set(px, 0.42, pz); f.group.rotation.y = y + Math.PI / 2;
      f.update(t, clamp(sp / 2.5, 0, 1));
      p.reach(0, px, 1.5, pz, 1); p.reach(1, px, 1.1, pz, 1);
      p.animate(dt);
      b.sh.position.set(p.root.position.x + 0.3, 0.04, p.root.position.z - 0.2);
    }
    // фаєри: червоний і зелений дим уздовж обох трибун (повільно здіймається й розходиться)
    this.pyroT -= dt;
    if (this.pyroT <= 0 && t < 18) {
      this.pyroT = 0.07;
      const P = this.view.particles, side = Math.random() < 0.5 ? -1 : 1, x = [-40, -20, 20, 40][(Math.random() * 4) | 0] + (Math.random() - 0.5) * 3;
      P.emit(x, 1.4, side * (W + 2.2), (Math.random() - 0.5) * 0.9, 0.7 + 0.6 * Math.random(), (Math.random() - 0.5) * 0.6, 2.2, 0.8, Math.random() < 0.5 ? '#c4303a' : '#2f8a4c', -0.12, 0.9, 0, 0.9);   // дим стелиться над бровкою, а не летить у небо
    }
  }

  /** Салют над трибунами. */
  fireworks(n = 4) {
    const P = this.view.particles;
    for (let i = 0; i < n; i++) {
      const x = (Math.random() - 0.5) * 90, z = (Math.random() < 0.5 ? -1 : 1) * (W + 8 + Math.random() * 6);
      P.burst(x, 20 + Math.random() * 8, z, 34, 9, 1.5, 0.35, ['#d4202c', '#1f8f3f', '#f1efe8', '#e8b923'], 3, 0.35);
    }
  }
}
