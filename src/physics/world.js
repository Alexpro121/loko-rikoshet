import { PITCH, PHYS } from '../config.js';

const { L, W, G, CH, GOAL_D, POST_R } = PITCH;

/**
 * Спрощена 2.5D фізика в площині X/Z: м'яч-коло, нерухомі відрізки бортиків,
 * стовпи воріт, кінематичні кола гравців. Усе на числах і масивах, без алокацій у кроці.
 */
export class World {
  constructor() {
    this.segs = [];       // x1,z1,x2,z2,e (плоский масив)
    this.posts = [];      // x,z,r
    this.bodies = [];
    this.ball = { x: 0, z: 0, vx: 0, vz: 0, r: PITCH.R };
    this.buildStatic();
  }

  seg(x1, z1, x2, z2, e = PHYS.wallE) { this.segs.push(x1, z1, x2, z2, e); }

  buildStatic() {
    const s = (a, b, c, d, e) => this.seg(a, b, c, d, e);
    s(-L + CH, -W, L - CH, -W); s(L - CH, -W, L, -W + CH); s(L, -W + CH, L, -G);
    s(L, G, L, W - CH); s(L, W - CH, L - CH, W); s(L - CH, W, -L + CH, W);
    s(-L + CH, W, -L, W - CH); s(-L, W - CH, -L, G); s(-L, -G, -L, -W + CH); s(-L, -W + CH, -L + CH, -W);
    for (const sd of [1, -1]) {              // сітка воріт майже не відбиває
      s(sd * L, G, sd * (L + GOAL_D), G, 0.1); s(sd * L, -G, sd * (L + GOAL_D), -G, 0.1);
      s(sd * (L + GOAL_D), -G, sd * (L + GOAL_D), G, 0.08);
      for (const zz of [G, -G]) this.posts.push(sd * L, zz, POST_R);
    }
  }

  /** Повертає 1, якщо було зіткнення зі статикою (для відскоків прицілу). */
  integrate(s, h, cb, dyn) {
    const r = s.r;
    const sp0 = Math.sqrt(s.vx * s.vx + s.vz * s.vz);
    if (sp0 > 0) {
      const inNet = s.x > L + 0.2 || s.x < -L - 0.2;
      let sp = sp0 * Math.exp(-(inNet ? 7 : PHYS.drag) * h) - PHYS.roll * h;
      if (sp < PHYS.stop) sp = 0;
      const f = sp / sp0; s.vx *= f; s.vz *= f;
    }
    s.x += s.vx * h; s.z += s.vz * h;
    let hit = 0;

    const sg = this.segs;
    for (let i = 0; i < sg.length; i += 5) {
      const x1 = sg[i], z1 = sg[i + 1], dx = sg[i + 2] - x1, dz = sg[i + 3] - z1;
      const l2 = dx * dx + dz * dz;
      let t = ((s.x - x1) * dx + (s.z - z1) * dz) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = s.x - (x1 + dx * t), qz = s.z - (z1 + dz * t), d2 = qx * qx + qz * qz;
      if (d2 < r * r) {
        const d = Math.sqrt(d2) || 0.0001;
        const nx = qx / d, nz = qz / d;
        s.x += nx * (r - d); s.z += nz * (r - d);
        const vn = s.vx * nx + s.vz * nz;
        if (vn < 0) {
          const e = sg[i + 4];
          s.vx -= (1 + e) * vn * nx; s.vz -= (1 + e) * vn * nz;
          if (-vn > 1.5) { hit = 1; if (cb && cb.wall) cb.wall(nx, nz, -vn, e); }
        }
      }
    }
    const ps = this.posts;
    for (let i = 0; i < ps.length; i += 3) {
      const dx = s.x - ps[i], dz = s.z - ps[i + 1], rr = r + ps[i + 2], d2 = dx * dx + dz * dz;
      if (d2 < rr * rr) {
        const d = Math.sqrt(d2) || 0.0001, nx = dx / d, nz = dz / d;
        s.x = ps[i] + nx * rr; s.z = ps[i + 1] + nz * rr;
        const vn = s.vx * nx + s.vz * nz;
        if (vn < 0) {
          s.vx -= 1.85 * vn * nx; s.vz -= 1.85 * vn * nz;
          if (-vn > 1.5) { hit = 1; if (cb && cb.post) cb.post(nx, nz, -vn); }
        }
      }
    }
    // страховка від тунелювання
    const inMouth = Math.abs(s.z) < G + 0.4;
    if (!inMouth && Math.abs(s.x) > L) s.x = s.x > 0 ? L : -L;
    if (Math.abs(s.z) > W + 0.1 && Math.abs(s.x) <= L) s.z = s.z > 0 ? W - r : -W + r;

    if (dyn) this.players(s, cb);
    return hit;
  }

  players(s, cb) {
    const r = s.r, bd = this.bodies;
    for (let i = 0; i < bd.length; i++) {
      const o = bd[i];
      if (!o.on) continue;
      const dx = s.x - o.x, dz = s.z - o.z, rr = r + o.r, d2 = dx * dx + dz * dz;
      if (d2 < rr * rr) {
        const d = Math.sqrt(d2) || 0.0001, nx = dx / d, nz = dz / d;
        s.x = o.x + nx * rr; s.z = o.z + nz * rr;
        const vn = (s.vx - o.vx) * nx + (s.vz - o.vz) * nz;
        const speed = Math.sqrt(s.vx * s.vx + s.vz * s.vz);
        if (cb && cb.body && cb.body(o, vn, nx, nz, speed)) continue;
        if (vn < 0) { const j = -(1 + o.e) * vn; s.vx += j * nx; s.vz += j * nz; }
        const out = s.vx * nx + s.vz * nz;
        if (out < o.sep) { s.vx += nx * (o.sep - out); s.vz += nz * (o.sep - out); }
      }
    }
  }

  /** Чи м'яч повністю за лінією воріт: +1 праві (суперника), -1 ліві (наші), 0 ні. */
  goalSide(s = this.ball) {
    if (Math.abs(s.z) < G) {
      if (s.x > L + s.r) return 1;
      if (s.x < -L - s.r) return -1;
    }
    return 0;
  }
}

export function makeBody(kind, r, e = 0.55, sep = 2) {
  return { kind, x: 0, z: 0, vx: 0, vz: 0, r, on: true, e, sep, ref: null };
}
