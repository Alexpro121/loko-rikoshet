// DemoMatch: маленька гра для зразка мінімапи в налаштуваннях: розстановки, пресинг, паси, удари, сейви, голи й аути. На справжній матч не впливає.
import { PITCH } from '../config.js';

const { L, W, G } = PITCH;
const HOME = [[-50, 0], [-30, -24], [-33, -8], [-33, 8], [-30, 24], [-8, -15], [-13, 0], [-8, 15], [17, -24], [21, 0], [17, 24]];
const JOG = 6.2, SPRINT = 8.8, DRIBBLE = 7.4, GK_V = 7.5;
const GRAV = 12;

const cl = (v, a, b) => (v < a ? a : v > b ? b : v);
const rnd = (a, b) => a + Math.random() * (b - a);
const sideOf = (i) => (i < 11 ? 1 : -1);
const baseOf = (i) => (i < 11 ? 0 : 11);

export class DemoMatch {
  constructor(mm) {
    this.m = mm;
    this.vx = new Float32Array(22); this.vz = new Float32Array(22);
    this.tx = new Float32Array(22); this.tz = new Float32Array(22); this.sp = new Float32Array(22);
    this.rx = new Float32Array(22); this.rz = new Float32Array(22);    // особисті забіги поверх розстановки
    this.bvx = 0; this.bvz = 0; this.bvy = 0; this.kind = ''; this.kicker = -1; this.passTo = -1; this.flight = 0;
    this.owner = -1; this.hold = 0; this.state = 'wait'; this.waitT = 0; this.taker = -1; this.lastSide = 1; this.kickSide = 1;
    this.runT = 0; this.cam = 0; this.goals = 0; this.passes = 0; this.saves = 0; this.outs = 0; this.swaps = 0;
    this.lineUp(Math.random() < 0.5 ? 1 : -1);
    for (let i = 0; i < 22; i++) { mm.px[i] = this.tx[i]; mm.pz[i] = this.tz[i]; mm.vis[i] = 1; }
    this.start();
  }

  /** Перед розведенням обидві команди у своїх половинах, м'яч у центрі. */
  lineUp(side) {
    const m = this.m; this.kickSide = side; m.bx = 0; m.bz = 0; m.by = 0; this.bvx = this.bvz = this.bvy = 0; this.owner = -1;
    this.formation(true);
  }
  start() {
    const t = baseOf(this.kickSide === 1 ? 0 : 11) + 9; this.state = 'play'; this.give(t, rnd(0.3, 0.6));
    this.m.px[t] = -this.kickSide * 1.2; this.m.pz[t] = 0; this.m.bx = 0; this.m.bz = 0;
  }
  give(i, hold) { this.owner = i; this.hold = hold; this.bvy = 0; this.m.by = 0; this.kind = ''; if (sideOf(i) !== this.lastSide) this.swaps++; this.lastSide = sideOf(i); }

  /** Цілі всіх без м'яча: блок зсувається за м'ячем, атака ширша й вища, оборона щільніша. */
  formation(kick) {
    const m = this.m;
    for (let i = 0; i < 22; i++) {
      const b = baseOf(i), k = i - b, sg = sideOf(i), h = HOME[k];
      if (k === 0) { this.tx[i] = sg * -(L - 2.5); this.tz[i] = cl(m.bz * 0.14, -G * 0.8, G * 0.8); this.sp[i] = GK_V; continue; }
      if (kick) { this.tx[i] = sg * Math.min(h[0] * 0.8, -1.5); this.tz[i] = sg * h[1]; this.sp[i] = JOG; continue; }
      const atk = sg === this.lastSide, run = atk ? 1 : 0.35;
      this.tx[i] = cl(sg * h[0] * (atk ? 0.9 : 0.72) + m.bx * 0.62 + sg * (atk ? 7 : -3) + this.rx[i] * run, -L + 5, L - 5);
      this.tz[i] = cl(sg * h[1] * (atk ? 1 : 0.8) + m.bz * 0.2 + this.rz[i] * run, -W + 2, W - 2);
      this.sp[i] = atk && this.rx[i] * sg > 5 ? SPRINT : JOG;
    }
  }

  /** Двоє найближчих захисників тиснуть на м'яч: перший іде на нього, другий стає між ним і воротами. */
  press(side) {
    const m = this.m, b = baseOf(side === 1 ? 0 : 11);
    let a1 = -1, a2 = -1, d1 = 1e9, d2 = 1e9;
    for (let i = b + 1; i < b + 11; i++) {
      const dx = m.px[i] - m.bx, dz = m.pz[i] - m.bz, d = dx * dx + dz * dz;
      if (d < d1) { d2 = d1; a2 = a1; d1 = d; a1 = i; } else if (d < d2) { d2 = d; a2 = i; }
    }
    this.tx[a1] = m.bx + this.bvx * 0.25; this.tz[a1] = m.bz + this.bvz * 0.25; this.sp[a1] = SPRINT;
    this.tx[a2] = m.bx - side * 6; this.tz[a2] = m.bz * 0.75; this.sp[a2] = SPRINT;
  }

  stepPlayers(dt) {
    const m = this.m;
    for (let i = 0; i < 22; i++) {
      const dx = this.tx[i] - m.px[i], dz = this.tz[i] - m.pz[i], d = Math.sqrt(dx * dx + dz * dz) || 1;
      const s = Math.min(this.sp[i], d * 2.2), k = Math.min(1, dt * 4.5);
      this.vx[i] += (dx / d * s - this.vx[i]) * k; this.vz[i] += (dz / d * s - this.vz[i]) * k;
      m.px[i] = cl(m.px[i] + this.vx[i] * dt, -L, L); m.pz[i] = cl(m.pz[i] + this.vz[i] * dt, -W, W);
    }
  }

  nearest(side, skip) {
    const m = this.m, b = baseOf(side === 1 ? 0 : 11);
    let who = -1, best = 1e9;
    for (let i = b; i < b + 11; i++) { if (i === skip) continue; const dx = m.px[i] - m.bx, dz = m.pz[i] - m.bz, d = dx * dx + dz * dz; if (d < best) { best = d; who = i; } }
    return who;
  }

  /** Вільний партнер трохи попереду краще за того, кого вже опікують; завжди є випадковість, щоб гра не повторювалась. */
  choosePass(i) {
    const m = this.m, sg = sideOf(i), b = baseOf(i);
    let who = -1, best = -1e9;
    for (let j = b + 1; j < b + 11; j++) {
      if (j === i) continue;
      const dx = m.px[j] - m.bx, dz = m.pz[j] - m.bz, d = Math.sqrt(dx * dx + dz * dz);
      let free = 1e9;
      for (let o = 11 - b; o < 22 - b; o++) { const ox = m.px[o] - m.px[j], oz = m.pz[o] - m.pz[j], od = ox * ox + oz * oz; if (od < free) free = od; }
      const score = dx * sg * 0.45 - Math.abs(d - 17) * 0.3 + Math.min(free, 64) * 0.14 + rnd(0, 9);
      if (score > best) { best = score; who = j; }
    }
    return who;
  }

  pass(i) {
    const m = this.m, j = this.choosePass(i); if (j < 0) return;
    let dx = m.px[j] - m.bx, dz = m.pz[j] - m.bz, d = Math.hypot(dx, dz);
    const sp = cl(d * 1.15 + 11, 15, 30), lead = d / sp;
    dx += this.vx[j] * lead; dz += this.vz[j] * lead; d = Math.hypot(dx, dz) || 1;
    this.bvx = dx / d * sp; this.bvz = dz / d * sp; this.bvy = d > 28 ? GRAV * d / sp * 0.5 : 0;
    this.kind = 'pass'; this.kicker = i; this.passTo = j; this.owner = -1; this.flight = 0; this.passes++;
  }

  shoot(i) {
    const m = this.m, sg = sideOf(i), tz = (Math.random() < 0.5 ? -1 : 1) * rnd(G * 0.35, G * 1.15), dx = sg * (L + 1) - m.bx, dz = tz - m.bz, d = Math.hypot(dx, dz) || 1, sp = rnd(28, 36);
    this.bvx = dx / d * sp; this.bvz = dz / d * sp; this.bvy = rnd(0, 3.5);
    this.kind = 'shot'; this.kicker = i; this.passTo = -1; this.owner = -1; this.flight = 0;
  }

  /** М'яч у грі, але без господаря: летить або котиться, його можуть прийняти. */
  stepBall(dt) {
    const m = this.m, f = Math.exp(-0.42 * dt);
    this.bvx *= f; this.bvz *= f; this.flight += dt;
    m.bx += this.bvx * dt; m.bz += this.bvz * dt;
    m.by += this.bvy * dt; this.bvy -= GRAV * dt;
    if (m.by <= 0) { m.by = 0; this.bvy = 0; }
    if (this.flight < 0.12) return;
    for (let i = 0; i < 22; i++) {
      if (i === this.kicker && this.flight < 0.45) continue;
      const gk = i === 0 || i === 11, r = gk && this.kind === 'shot' ? 1.5 : i === this.passTo ? 1.9 : 1.15;
      const dx = m.px[i] - m.bx, dz = m.pz[i] - m.bz;
      if (m.by > 2.4 || dx * dx + dz * dz > r * r) continue;
      if (gk && this.kind === 'shot') this.saves++;
      this.give(i, gk ? rnd(0.9, 1.4) : rnd(0.25, 1.3));
      return;
    }
    if (Math.abs(m.bx) > L) {
      if (Math.abs(m.bz) < G) { this.goal(m.bx > 0 ? 1 : -1); return; }
      // повз ворота: удар від воріт команди, яка захищалась
      const def = m.bx > 0 ? -1 : 1; this.outs++;
      this.dead(def === 1 ? 0 : 11, -def * (L - 6), rnd(-8, 8));
      return;
    }
    if (Math.abs(m.bz) > W) {
      // за бокову: вкидання команди, яка не торкалась останньою
      const s = -this.lastSide; this.outs++;
      m.bz = cl(m.bz, -W + 0.4, W - 0.4); m.bx = cl(m.bx, -L + 2, L - 2);
      this.dead(this.nearest(s, -1), m.bx, m.bz);
    }
  }

  goal(side) {
    this.goals++; this.state = 'wait'; this.waitT = 2.6; this.owner = -1; this.kickSide = -side; this.lastSide = -side;
    this.bvx = this.bvz = this.bvy = 0; this.m.by = 0; this.m.bx = cl(this.m.bx, -L - 1.6, L + 1.6);
  }

  dead(taker, x, z) {
    const m = this.m; this.state = 'dead'; this.owner = -1; this.taker = taker; this.waitT = 2.2; this.lastSide = sideOf(taker);
    m.bx = x; m.bz = z; m.by = 0; this.bvx = this.bvz = this.bvy = 0;
  }

  step(dt) {
    const m = this.m;
    // час від часу хтось відкривається: забіг уперед або в бік
    this.runT -= dt;
    if (this.runT <= 0) {
      this.runT = rnd(0.25, 0.7);
      const i = (Math.random() * 22) | 0, sg = sideOf(i);
      this.rx[i] = sg * rnd(-3, 13); this.rz[i] = rnd(-10, 10);
    }
    if (this.state === 'wait') {
      this.waitT -= dt;
      if (this.waitT < 1.3 && (m.bx !== 0 || m.bz !== 0)) this.lineUp(this.kickSide);
      this.formation(true);
      this.stepPlayers(dt);
      if (this.waitT <= 0) this.start();
    } else if (this.state === 'dead') {
      this.waitT -= dt;
      this.formation(false); this.press(-this.lastSide);
      this.tx[this.taker] = m.bx; this.tz[this.taker] = m.bz; this.sp[this.taker] = SPRINT;
      this.stepPlayers(dt);
      const dx = m.px[this.taker] - m.bx, dz = m.pz[this.taker] - m.bz;
      if (dx * dx + dz * dz < 1.6 || this.waitT <= 0) { m.px[this.taker] = m.bx; m.pz[this.taker] = m.bz; this.state = 'play'; this.give(this.taker, rnd(0.25, 0.5)); }
    } else {
      this.formation(false);
      const own = this.owner;
      if (own >= 0) {
        this.press(-sideOf(own));
        const sg = sideOf(own), gk = own === 0 || own === 11, gx = sg * (L - 10);
        this.tx[own] = gk ? m.px[own] : gx; this.tz[own] = gk ? m.pz[own] : cl(m.bz * 0.75, -W + 3, W - 3); this.sp[own] = gk ? 0 : DRIBBLE;
        this.stepPlayers(dt);
        const v = Math.hypot(this.vx[own], this.vz[own]) || 1;
        m.bx = m.px[own] + this.vx[own] / v * 0.8; m.bz = m.pz[own] + this.vz[own] / v * 0.8;
        // відбір: суперник упритул інколи забирає м'яч
        const op = this.nearest(-sg, -1), ox = m.px[op] - m.bx, oz = m.pz[op] - m.bz, od = ox * ox + oz * oz;
        if (od < 1.7 && Math.random() < dt * 1.5 && !gk) this.give(op, rnd(0.3, 0.9));
        else {
          this.hold -= dt;
          if (this.hold <= 0 || (od < 12 && this.hold < 0.6)) {
            const to = Math.abs(sg * (L + 1) - m.bx);
            if (!gk && to < 34 && (to < 16 || Math.random() < 0.3)) this.shoot(own); else this.pass(own);
          }
        }
      } else {
        // м'яч ничий: по одному з кожної команди біжить до нього, адресат — у точку зустрічі, воротар — під удар
        const a = this.nearest(1, -1), b = this.nearest(-1, -1), px = m.bx + this.bvx * 0.3, pz = m.bz + this.bvz * 0.3;
        this.tx[a] = px; this.tz[a] = pz; this.sp[a] = SPRINT; this.tx[b] = px; this.tz[b] = pz; this.sp[b] = SPRINT;
        if (this.passTo >= 0) { const T = 0.35; this.tx[this.passTo] = m.bx + this.bvx * T; this.tz[this.passTo] = m.bz + this.bvz * T; this.sp[this.passTo] = SPRINT; }
        if (this.kind === 'shot') {
          const k = this.bvx > 0 ? 11 : 0, t = (m.px[k] - m.bx) / (this.bvx || 1);
          if (t > 0) { this.tz[k] = cl(m.bz + this.bvz * t, -G - 0.5, G + 0.5); this.sp[k] = GK_V * 1.1; }
        }
        this.stepPlayers(dt);
        this.stepBall(dt);
      }
    }
    // зона камери: іде за м'ячем, як у грі
    this.cam += (cl(m.bx, -30, 30) - this.cam) * Math.min(1, dt * 2.2);
    const q = m.quad, x = this.cam, zc = cl(m.bz * 0.25, -6, 6);
    q[0] = x - 34; q[1] = zc - 30; q[2] = x + 34; q[3] = zc - 30; q[4] = x + 25; q[5] = zc + 30; q[6] = x - 25; q[7] = zc + 30;
  }
}
