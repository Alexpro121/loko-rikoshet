import { PITCH, PHYS } from '../config.js';
import { stepFree } from './ballmodel.js';

const { L, W, G, CH, GOAL_D, POST_R, GOAL_H } = PITCH;
const BAR_Y = GOAL_H - POST_R;          // вісь поперечини (верх рамки — на висоті воріт)

/**
 * Відскок від нерухомої перешкоди з нормаллю (nx, nz): нормальна швидкість × −e, дотична втрачає частину від тертя
 * (кулонове: імпульс тертя ≤ μ·нормальний імпульс) — ковзний удар об борт «з'їдає» трохи швидкості, прямий — майже ні.
 */
function bounce(s, nx, nz, vn, e, mu) {
  s.vx -= (1 + e) * vn * nx; s.vz -= (1 + e) * vn * nz;
  if (mu > 0) {
    const tx = s.vx - (s.vx * nx + s.vz * nz) * nx, tz = s.vz - (s.vx * nx + s.vz * nz) * nz, vt = Math.sqrt(tx * tx + tz * tz);
    if (vt > 1e-3) { const k = Math.min(1 - 0.6, mu * (1 + e) * -vn / vt); s.vx -= tx * k; s.vz -= tz * k; }
  }
}

/**
 * Спрощена 2.5D фізика в площині X/Z: м'яч-коло, нерухомі відрізки бортиків,
 * стовпи воріт, кінематичні кола гравців. Усе на числах і масивах, без алокацій у кроці.
 */
export class World {
  constructor() {
    this.segs = [];       // x1,z1,x2,z2,e (плоский масив)
    this.posts = [];      // x,z,r
    this.bodies = [];
    this.ball = { x: 0, z: 0, y: 0, vx: 0, vy: 0, vz: 0, w: 0, r: PITCH.R, gb: 0 };
    this.buildStatic();
  }

  seg(x1, z1, x2, z2, e = PHYS.wallE) { this.segs.push(x1, z1, x2, z2, e); }

  buildStatic() {
    const s = (a, b, c, d, e) => this.seg(a, b, c, d, e);
    s(-L + CH, -W, L - CH, -W); s(L - CH, -W, L, -W + CH); s(L, -W + CH, L, -G);
    s(L, G, L, W - CH); s(L, W - CH, L - CH, W); s(L - CH, W, -L + CH, W);
    s(-L + CH, W, -L, W - CH); s(-L, W - CH, -L, G); s(-L, -G, -L, -W + CH); s(-L, -W + CH, -L + CH, -W);
    this.netSeg0 = this.segs.length;          // далі — сітки воріт (зсередини воріт їх замінює пружна сітка, див. net())
    for (const sd of [1, -1]) {              // сітка воріт зовні майже не відбиває
      s(sd * L, G, sd * (L + GOAL_D), G, 0.1); s(sd * L, -G, sd * (L + GOAL_D), -G, 0.1);
      s(sd * (L + GOAL_D), -G, sd * (L + GOAL_D), G, 0.08);
      for (const zz of [G, -G]) this.posts.push(sd * L, zz, POST_R);
    }
  }

  /** Повертає 1, якщо було зіткнення зі статикою (для відскоків прицілу). */
  integrate(s, h, cb, dyn) {
    const r = s.r, inNet = s.x > L + 0.2 || s.x < -L - 0.2;
    const y0 = s.y;
    s.gb = stepFree(s, h, inNet);                                       // тяжіння, опір, Магнус, відскок від газону / котіння
    const x0 = s.x, z0 = s.z;
    s.x += s.vx * h; s.z += s.vz * h;
    let hit = 0;

    const sg = this.segs, inGoal = Math.abs(s.z) < G + 0.5 && Math.abs(s.x) > L + 0.05 && s.y < GOAL_H;
    for (let i = 0; i < sg.length; i += 5) {
      if (inGoal && i >= this.netSeg0) continue;                         // усередині воріт — пружна сітка нижче
      const x1 = sg[i], z1 = sg[i + 1], dx = sg[i + 2] - x1, dz = sg[i + 3] - z1;
      const l2 = dx * dx + dz * dz;
      // безперервне зіткнення: сильний удар проходить до ~0.8 од за крок — більше за діаметр м'яча, тож перевіряємо весь шлях
      // кроку: якщо він перетинає лінію борту, м'яч зупиняється в точці дотику (на своєму боці) і відбивається
      {
        const len = Math.sqrt(l2) || 1e-6, nx = -dz / len, nz = dx / len;
        const d0 = (x0 - x1) * nx + (z0 - z1) * nz, d1 = (s.x - x1) * nx + (s.z - z1) * nz;
        if (Math.abs(d0) >= r && (d0 > 0 ? d1 < r : d1 > -r)) {
          const sd = d0 > 0 ? 1 : -1, t = (d0 - sd * r) / (d0 - d1);
          const cx = x0 + (s.x - x0) * t, cz = z0 + (s.z - z0) * t, along = ((cx - x1) * dx + (cz - z1) * dz) / l2;
          if (t >= 0 && t <= 1 && along > -r / len && along < 1 + r / len) {
            s.x = cx; s.z = cz;
            const qx = nx * sd, qz = nz * sd, vn = s.vx * qx + s.vz * qz;
            if (vn < 0) { const e = sg[i + 4]; bounce(s, qx, qz, vn, e, e > 0.5 ? PHYS.wallMu : 0); if (-vn > 1.5) { hit = 1; if (cb && cb.wall) cb.wall(qx, qz, -vn, e); } }
            continue;
          }
        }
      }
      let t = ((s.x - x1) * dx + (s.z - z1) * dz) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = s.x - (x1 + dx * t), qz = s.z - (z1 + dz * t), d2 = qx * qx + qz * qz;
      if (d2 < r * r) {
        const d = Math.sqrt(d2) || 0.0001;
        const nx = qx / d, nz = qz / d;
        s.x += nx * (r - d); s.z += nz * (r - d);
        const vn = s.vx * nx + s.vz * nz;
        if (vn < 0) {
          const e = sg[i + 4];
          bounce(s, nx, nz, vn, e, e > 0.5 ? PHYS.wallMu : 0);
          if (-vn > 1.5) { hit = 1; if (cb && cb.wall) cb.wall(nx, nz, -vn, e); }
        }
      }
    }
    // ---- поперечина й простір над нею. Вісь поперечини — горизонтальна (уздовж z), тож у площині x–y це коло:
    // безперервна перевірка шляху кроку (як для стовпів), відскок у площині x–y. Над поперечиною — сітка-огорожа арени:
    // м'яч, що летить вище воріт, відбивається від неї назад на поле. У воротах — дах сітки
    for (let sd = -1; sd <= 1; sd += 2) {
      if (Math.abs(s.z) > G + r) continue;
      const bx = sd * L, cy0 = r + y0, cy1 = r + s.y, rr = r + POST_R;
      {
        const ex = s.x - x0, ey = cy1 - cy0, e2 = ex * ex + ey * ey, fx = x0 - bx, fy = cy0 - BAR_Y, b2 = fx * ex + fy * ey, c = fx * fx + fy * fy - rr * rr * 0.998, disc = b2 * b2 - e2 * c;
        if (e2 > 1e-8 && c > 0 && disc > 0) { const t = (-b2 - Math.sqrt(disc)) / e2; if (t >= 0 && t <= 1) { s.x = x0 + ex * t; s.y = cy0 + ey * t - r; } }
      }
      const dx = s.x - bx, dy = r + s.y - BAR_Y, d2 = dx * dx + dy * dy;
      if (d2 < rr * rr) {
        const d = Math.sqrt(d2) || 1e-4, nx = dx / d, ny = dy / d;
        s.x = bx + nx * rr; s.y = Math.max(0, BAR_Y + ny * rr - r);
        const vn = s.vx * nx + s.vy * ny;
        if (vn < 0) { s.vx -= (1 + PHYS.postE) * vn * nx; s.vy -= (1 + PHYS.postE) * vn * ny; s.w *= 0.5; if (-vn > 1.5) { hit = 1; if (cb && cb.post) cb.post(nx, 0, -vn); } }
      } else if (r + s.y > GOAL_H + r * 0.5) {
        // над воротами: площина x = ±L (огорожа) — м'яч не залітає «у ворота згори»
        const a = (x0 - bx) * sd, c2 = (s.x - bx) * sd;
        if (a <= -r && c2 > -r) { s.x = bx - sd * r; if (s.vx * sd > 0) { s.vx = -s.vx * 0.45; hit = 1; if (cb && cb.wall) cb.wall(-sd, 0, Math.abs(s.vx), 0.45); } }
      }
      if ((s.x - bx) * sd > 0 && r + s.y > GOAL_H - 0.25) { s.y = GOAL_H - 0.25 - r; if (s.vy > 0) s.vy *= -0.35; s.vx *= 0.92; s.vz *= 0.92; }   // дах сітки
    }
    const ps = this.posts;
    for (let i = 0; i < ps.length; i += 3) {
      if (s.y > GOAL_H) continue;                                        // над рамкою стовпів немає
      // стовп — так само безперервно: найближче наближення шляху кроку до стовпа
      {
        const ex = s.x - x0, ez = s.z - z0, e2 = ex * ex + ez * ez, rr = r + ps[i + 2];
        if (e2 > 1e-8) {
          const fx = x0 - ps[i], fz = z0 - ps[i + 1], rc = rr * 0.999, b = fx * ex + fz * ez, c = fx * fx + fz * fz - rc * rc, disc = b * b - e2 * c;   // трохи всередині — відскок нижче спрацює напевно
          if (c > 0 && disc > 0) { const t = (-b - Math.sqrt(disc)) / e2; if (t >= 0 && t <= 1) { s.x = x0 + ex * t; s.z = z0 + ez * t; } }
        }
      }
      const dx = s.x - ps[i], dz = s.z - ps[i + 1], rr = r + ps[i + 2], d2 = dx * dx + dz * dz;
      if (d2 < rr * rr) {
        const d = Math.sqrt(d2) || 0.0001, nx = dx / d, nz = dz / d;
        s.x = ps[i] + nx * rr; s.z = ps[i + 1] + nz * rr;
        const vn = s.vx * nx + s.vz * nz;
        if (vn < 0) {
          s.vx -= (1 + PHYS.postE) * vn * nx; s.vz -= (1 + PHYS.postE) * vn * nz;
          if (-vn > 1.5) { hit = 1; if (cb && cb.post) cb.post(nx, nz, -vn); }
        }
      }
    }
    if (inGoal) this.net(s, h);
    // страховка від тунелювання
    const inMouth = Math.abs(s.z) < G + 0.4;
    if (!inMouth && Math.abs(s.x) > L) s.x = s.x > 0 ? L : -L;
    if (Math.abs(s.z) > W + 0.1 && Math.abs(s.x) <= L) s.z = s.z > 0 ? W - r : -W + r;

    if (dyn) this.players(s, cb);
    return hit;
  }

  /**
   * М'яч і гравці. Гравець — вертикальний циліндр (радіус r, висота h: м'яч, що летить вище голови, проходить над ним);
   * воротар — ще й 3D-капсули частин тіла за скелетом {ax, ay, az, bx, by, bz, r, vx, vy, vz}: руки ловлять і високі м'ячі.
   * Відскок — у 3D, відносно швидкості тієї частини тіла.
   */
  players(s, cb) {
    const r = s.r, bd = this.bodies, cy = r + s.y;
    for (let i = 0; i < bd.length; i++) {
      const o = bd[i];
      if (!o.on) continue;
      let cx = o.x, cz = o.z, ccy = cy, rr = r + o.r, cvx = o.vx, cvz = o.vz, cvy = 0;
      let best = o.r > 0 && s.y < o.h && !(o.capsOnly && o.caps && o.caps.n) ? rr * rr - ((s.x - o.x) ** 2 + (s.z - o.z) ** 2) : 0;   // воротар — лише капсули тіла
      const cs = o.caps;
      if (cs) for (let k = 0; k < cs.n; k++) {
        const c = cs[k], ex = c.bx - c.ax, ey = c.by - c.ay, ez = c.bz - c.az, l2 = ex * ex + ey * ey + ez * ez || 1e-6;
        let t = ((s.x - c.ax) * ex + (cy - c.ay) * ey + (s.z - c.az) * ez) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const px = c.ax + ex * t, py = c.ay + ey * t, pz = c.az + ez * t, rc = r + c.r, q = rc * rc - ((s.x - px) ** 2 + (cy - py) ** 2 + (s.z - pz) ** 2);
        if (q > best) { best = q; cx = px; ccy = py; cz = pz; rr = rc; cvx = c.vx; cvz = c.vz; cvy = c.vy; }
      }
      if (best > 0) {
        const dx = s.x - cx, dy = cy - ccy, dz = s.z - cz, d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.0001, nx = dx / d, ny = dy / d, nz = dz / d;
        s.x = cx + nx * rr; s.z = cz + nz * rr; s.y = Math.max(0, ccy + ny * rr - r);
        const vn = (s.vx - cvx) * nx + (s.vy - cvy) * ny + (s.vz - cvz) * nz;
        const speed = Math.sqrt(s.vx * s.vx + s.vy * s.vy + s.vz * s.vz);
        if (cb && cb.body && cb.body(o, vn, nx, nz, speed)) continue;
        if (vn < 0) { const j = -(1 + o.e) * vn; s.vx += j * nx; s.vy += j * ny; s.vz += j * nz; s.w *= 0.4; }
        const out = s.vx * nx + s.vz * nz;
        if (out < o.sep) { s.vx += nx * (o.sep - out); s.vz += nz * (o.sep - out); }
        if (s.y > 0 && s.vy === 0) s.vy = 0.01;                           // відбитий угору м'яч — у польоті
      }
    }
  }

  /**
   * Сітка воріт зсередини — пружна: м'яч входить у неї (сітка прогинається до ~0.5 м), гальмує й відскакує назад частиною
   * швидкості (як справжня: ~0.4), а сітка ще й «хапає» дотичний рух. Задня стінка й бічні — пружини з загасанням;
   * this.netPush — глибина й точка прогину для малювання (видно, як сітка вигинається).
   */
  net(s, h) {
    const sd = s.x > 0 ? 1 : -1, r = s.r, back = L + GOAL_D - r, K = 4200, C = 30;
    let push = 0;
    const pb = s.x * sd - back;                                           // задня стінка
    if (pb > 0) {
      const vn = s.vx * sd;
      s.vx -= sd * (K * pb + C * vn) * h;
      const g = Math.exp(-5 * h); s.vz *= g; s.vy = s.vy > 0 ? s.vy * g : s.vy; s.w *= g;
      if (pb > 0.55) { s.x = sd * (back + 0.55); if (s.vx * sd > 0) s.vx = 0; }
      push = pb;
    }
    const ps = Math.abs(s.z) - (G - r);                                   // бічні стінки
    if (ps > 0 && s.x * sd < L + GOAL_D + 0.6) {
      const zs = s.z > 0 ? 1 : -1, vn = s.vz * zs;
      s.vz -= zs * (K * 0.8 * ps + C * vn) * h;
      const g = Math.exp(-4 * h); s.vx *= g; s.w *= g;
      if (ps > 0.4) { s.z = zs * (G - r + 0.4); if (s.vz * zs > 0) s.vz = 0; }
      push = Math.max(push, ps * 0.6);
    }
    this.netPush = push > 0 ? { sd, depth: push, y: s.y + r, z: s.z } : null;
  }

  /** Чи м'яч повністю за лінією воріт: +1 праві (суперника), -1 ліві (наші), 0 ні. */
  goalSide(s = this.ball) {
    if (Math.abs(s.z) < G) {
      if ((s.y || 0) + 2 * s.r > GOAL_H + 0.3) return 0;                // над поперечиною — не гол
      if (s.x > L + s.r) return 1;
      if (s.x < -L - s.r) return -1;
    }
    return 0;
  }
}

export function makeBody(kind, r, e = 0.55, sep = 2) {
  return { kind, x: 0, z: 0, vx: 0, vz: 0, r, h: 2.1, on: true, e, sep, ref: null };   // h — висота тіла (~1.9 м)
}
