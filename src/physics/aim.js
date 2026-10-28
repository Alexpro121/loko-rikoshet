import * as THREE from 'three';
import { PITCH } from '../config.js';

const MAXP = 520;
const S = { x: 0, z: 0, y: 0, vx: 0, vy: 0, vz: 0, w: 0, r: PITCH.R, gb: 0 };

/** Передбачення траєкторії тим самим кодом, що й реальна фізика (стіни, стовпи, прискорювачі). */
export class AimPath {
  constructor(world) {
    this.world = world;
    this.x = new Float32Array(MAXP); this.z = new Float32Array(MAXP); this.y = new Float32Array(MAXP); this.cum = new Float32Array(MAXP);
    this.landX = 0; this.landZ = 0; this.land = false;   // перше приземлення навісного м'яча
    this.n = 0; this.length = 0; this.bounceAt = new Float32Array(16); this.nb = 0; this.goal = false; this.hitPlayer = false;
    this.circles = new Float32Array(4 * 24); this.nc = 0;
  }

  /** Знімок гравців на момент прицілу: приціл упирається в першого, кого зустріне. */
  setCircles(list, skip) {
    let k = 0;
    for (let i = 0; i < list.length && k < 96; i++) { const b = list[i]; if (b === skip) continue; this.circles[k++] = b.x; this.circles[k++] = b.z; this.circles[k++] = b.r; this.circles[k++] = b.e ?? 0.5; }
    this.nc = k / 4;
  }

  /** vy, w — вертикальна швидкість і бокове обертання (навіс, підкрутка): дуга рахується тим самим кроком, що й гра. */
  simulate(x, z, vx, vz, maxBounces, vy = 0, w = 0) {
    const wd = this.world, h = 1 / 120;
    S.x = x; S.z = z; S.y = 0; S.vx = vx; S.vz = vz; S.vy = vy; S.w = w;
    let n = 0, d = 0; this.nb = 0; this.goal = false; this.hitPlayer = false; this.land = false;
    this.x[0] = x; this.z[0] = z; this.y[0] = 0; this.cum[0] = 0; n = 1;
    let bounces = 0, px = x, pz = z;
    for (let i = 0; i < 960 && n < MAXP - 1; i++) {
      const hit = wd.integrate(S, h, null, false);
      d += Math.hypot(S.x - px, S.z - pz); px = S.x; pz = S.z;
      if (S.gb && !this.land) { this.land = true; this.landX = S.x; this.landZ = S.z; }
      if (hit) {
        bounces++;
        if (this.nb < 16) this.bounceAt[this.nb++] = d;
        this.x[n] = S.x; this.z[n] = S.z; this.y[n] = S.y; this.cum[n] = d; n++;
        if (bounces > maxBounces) break;
      } else if (i % 3 === 0 || S.gb) { this.x[n] = S.x; this.z[n] = S.z; this.y[n] = S.y; this.cum[n] = d; n++; }
      if (wd.goalSide(S)) { this.goal = true; break; }
      if (this.nc > 0 && i > 2) {                     // гравці: відскок як у реальній фізиці
        for (let k = 0; k < this.nc; k++) {
          const cx = this.circles[k * 4], cz = this.circles[k * 4 + 1], rr = S.r + this.circles[k * 4 + 2], ce = this.circles[k * 4 + 3];
          const dx = S.x - cx, dz = S.z - cz, d2 = dx * dx + dz * dz;
          if (d2 < rr * rr && d2 > 1e-6 && S.y < 2.1) {                // над головою — пролітає
            const dd = Math.sqrt(d2), nx = dx / dd, nz = dz / dd;
            S.x = cx + nx * rr; S.z = cz + nz * rr;
            const vn = S.vx * nx + S.vz * nz;
            if (vn < 0) { S.vx -= (1 + ce) * vn * nx; S.vz -= (1 + ce) * vn * nz; }   // та сама пружність, що в тіла гравця
            this.hitPlayer = true; bounces++;
            if (this.nb < 16) this.bounceAt[this.nb++] = d;
            this.x[n] = S.x; this.z[n] = S.z; this.y[n] = S.y; this.cum[n] = d; n++;
            break;
          }
        }
        if (bounces > maxBounces) break;
      }
      if (S.vx === 0 && S.vz === 0 && S.y === 0) break;
    }
    if (this.cum[n - 1] < d) { this.x[n] = S.x; this.z[n] = S.z; this.y[n] = S.y; this.cum[n] = d; n++; }
    this.n = n; this.length = d;
    return n;
  }
}

/** Пунктир-приціл: «ланцюжок» плоских кружечків в одному InstancedMesh. */
export class AimDots {
  constructor(max = 90) {
    this.max = max;
    const geo = new THREE.CircleGeometry(0.2, 10); geo.rotateX(-Math.PI / 2);
    this.mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthWrite: false });
    this.mesh = new THREE.InstancedMesh(geo, this.mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 4; this.mesh.count = 0;
    this.mesh.matrixAutoUpdate = false;
  }

  hide() { this.mesh.count = 0; }

  /** Розставити точки вздовж ламаної; offset «біжить» уздовж лінії. */
  draw(path, fromDist, spacing, offset, y = 0.07) {
    const m = this.mesh.instanceMatrix.array;
    const total = path.length;
    let seg = 1, c = 0;
    const span = total - fromDist;
    const step = Math.max(spacing, span / (this.max - 2));
    for (let d = fromDist + offset % step; d < total && c < this.max; d += step) {
      while (seg < path.n - 1 && path.cum[seg] < d) seg++;
      const d0 = path.cum[seg - 1], d1 = path.cum[seg];
      const t = d1 > d0 ? (d - d0) / (d1 - d0) : 0;
      const x = path.x[seg - 1] + (path.x[seg] - path.x[seg - 1]) * t;
      const z = path.z[seg - 1] + (path.z[seg] - path.z[seg - 1]) * t;
      const yy = y + path.y[seg - 1] + (path.y[seg] - path.y[seg - 1]) * t + (path.y[seg] > 0 ? PITCH.R : 0);   // навіс — крапки дугою в повітрі
      const k = 1.05 - 0.55 * ((d - fromDist) / Math.max(1, span));
      const o = c * 16;
      m[o] = k; m[o + 1] = 0; m[o + 2] = 0; m[o + 3] = 0;
      m[o + 4] = 0; m[o + 5] = 1; m[o + 6] = 0; m[o + 7] = 0;
      m[o + 8] = 0; m[o + 9] = 0; m[o + 10] = k; m[o + 11] = 0;
      m[o + 12] = x; m[o + 13] = yy; m[o + 14] = z; m[o + 15] = 1;
      c++;
    }
    if (path.land && c < this.max) {                  // де навіс уперше торкнеться газону — велика крапка-мітка
      const o = c * 16;
      m[o] = 2.6; m[o + 1] = 0; m[o + 2] = 0; m[o + 3] = 0; m[o + 4] = 0; m[o + 5] = 1; m[o + 6] = 0; m[o + 7] = 0;
      m[o + 8] = 0; m[o + 9] = 0; m[o + 10] = 2.6; m[o + 11] = 0; m[o + 12] = path.landX; m[o + 13] = y; m[o + 14] = path.landZ; m[o + 15] = 1;
      c++;
    }
    this.mesh.count = c;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
