// TeamBrain: командне мислення ШІ. Читання гри, лінії блоку, опіка без дублів, ролі без м'яча, сигнал рукою; оцінки удару, паса й ведення.
import { PITCH } from '../config.js';

const { L, W, G } = PITCH;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** Що зараз робить гравець без м'яча. */
export const JOB = { SHAPE: 0, SUPPORT: 1, RUN: 2, WIDTH: 3, BOX: 4, REST: 5, GO: 6, MARK: 7, BLOCK: 8 };
const { SHAPE, SUPPORT, RUN, WIDTH, BOX, REST, GO, MARK, BLOCK } = JOB;

// вага роботи за лінією в схемі: захисник рідше йде вперед, нападник рідше спускається; чим більше — тим охочіше
const JOB_W = {
  D: { [SHAPE]: 1.2, [SUPPORT]: 0.3, [RUN]: -0.9, [WIDTH]: 0.5, [BOX]: -3 },
  M: { [SHAPE]: 0.5, [SUPPORT]: 1.0, [RUN]: 0.1, [WIDTH]: -0.1, [BOX]: 0.2 },
  W: { [SHAPE]: 0.3, [SUPPORT]: 0.1, [RUN]: 0.9, [WIDTH]: 1.0, [BOX]: 0.7 },
  F: { [SHAPE]: 0.3, [SUPPORT]: -0.1, [RUN]: 1.2, [WIDTH]: -1.2, [BOX]: 1.2 },
};
const JOB_SP = { [SHAPE]: 0.78, [SUPPORT]: 0.96, [RUN]: 1.12, [WIDTH]: 0.88, [BOX]: 1.06, [REST]: 0.8, [GO]: 1.1, [MARK]: 0.9, [BLOCK]: 0.82 };
const LEASH = { D: 20, M: 22, W: 13, F: 9 };          // як далеко від своєї зони гравець іде за чужим
const SUP_A = [0.6, -0.6, 1.25, -1.25, 0.1, -0.1, 1.9, -1.9, 0.95, -0.95], SUP_R = [14, 14, 13, 13, 19, 19, 11, 11, 22, 22];
// кандидати точок: тимчасові масиви на всю гру, без алокацій у гарячому циклі
const CX = new Float64Array(40), CZ = new Float64Array(40), CT = new Int8Array(40);
const _thr = new Float64Array(11), _idx = new Int32Array(11), _gapZ = new Float64Array(11), _sortZ = new Float64Array(11);
const _bestCall = [null, null], CALL_POLE = [1, -0.1, 0.1];
let _n = 0;
function add(side, u, z, k) { CX[_n] = clamp(u, -L + 3, L - 3) * side; CZ[_n] = clamp(z, -(W - 3), W - 3); CT[_n++] = k; }

/** Найменша відстань від відрізка до гравців списку (з індексу from). */
export function laneDist(x1, z1, x2, z2, list, from) {
  let m = 99;
  const dx = x2 - x1, dz = z2 - z1, l2 = dx * dx + dz * dz || 1;
  for (let i = from; i < list.length; i++) {
    const p = list[i].p, t = clamp(((p.x - x1) * dx + (p.z - z1) * dz) / l2, 0, 1);
    const ex = x1 + dx * t - p.x, ez = z1 + dz * t - p.z, d = ex * ex + ez * ez;
    if (d < m * m) m = Math.sqrt(d);
  }
  return m;
}

/** Найближчий гравець списку до точки (без воротаря). */
function nearest(x, z, list) {
  let m = 1e9;
  for (let i = 1; i < list.length; i++) { const p = list[i].p, dx = p.x - x, dz = p.z - z, d = dx * dx + dz * dz; if (d < m) m = d; }
  return Math.sqrt(m);
}

/** Наскільки небезпечна точка для того, хто атакує в бік side: 0 у своїх воріт, 1 перед чужими. */
export function zoneValue(x, z, side) {
  const dg = Math.hypot(side * L - x, z), near = clamp(1 - dg / 52, 0, 1);
  return 0.42 * clamp((x * side + L) / (2 * L), 0, 1) + 0.58 * near * near;
}

const _shot = { q: 0, z: 0, clear: 0 };
/**
 * Якість удару 0..1: кут, під яким видно ворота, відстань, лінія удару й місце воротаря. У _shot.z найкраща точка у воротах:
 * найдальша від воротаря серед незакритих ліній. Те саме, що робить людина: дивиться, куди бити, а не лише «чи близько».
 */
export function shotQuality(x, z, side, foes) {
  const gx = side * L, dx = Math.abs(gx - x), d = Math.hypot(dx, z), gk = foes[0].p;
  const vis = Math.atan2(2 * G * dx, dx * dx + z * z - G * G);
  let bs = -99, bz = 0, bc = 0;
  for (let i = 0; i < 5; i++) {
    const zs = (i - 2) * 0.48 * (G - 0.2), c = laneDist(x, z, gx, zs, foes, 1), off = Math.abs(gk.z - zs);
    const sc = Math.min(c, 3) + Math.min(off, 4) * 0.7;
    if (sc > bs) { bs = sc; bz = zs; bc = c; }
  }
  const out = Math.abs(gk.x - gx), open = Math.abs(gk.z - bz);
  let q = Math.min(1, vis / 0.55) * Math.exp(-d / 26) * (bc < 1 ? 0.22 : bc < 2 ? 0.6 : 1);
  if (open > 2.6 && out < 9) q *= 1.25;                                 // воротар не встигає в той кут
  _shot.q = Math.min(1, q); _shot.z = bz; _shot.clear = bc;
  return _shot;
}

/**
 * Ризик паса 0..1: хто із суперників встигає вийти на лінію раніше за м'яч. Порівнює час, а не відстань: далекий пас
 * над повільним захисником іще можливий, а короткий поруч зі швидким — уже ні.
 */
export function passRisk(x1, z1, x2, z2, foes, sp) {
  const dx = x2 - x1, dz = z2 - z1, len = Math.hypot(dx, dz) || 1, ux = dx / len, uz = dz / len;
  let worst = -9;
  for (let i = 1; i < foes.length; i++) {
    const p = foes[i].p, rx = p.x - x1, rz = p.z - z1, along = clamp(rx * ux + rz * uz, 0.5, len);
    const tb = (along / sp) * 1.25, ex = x1 + ux * along - p.x, ez = z1 + uz * along - p.z, tf = Math.max(0, Math.sqrt(ex * ex + ez * ez) - 1.1) / 7.8 + 0.22;
    const m = tb - tf; if (m > worst) worst = m;
  }
  return clamp(0.5 + worst / 0.7, 0, 1);
}

const _carry = { dx: -1, dz: 0 };
const CAR_A = [0, 0.42, -0.42, 0.85, -0.85, 1.35, -1.35, 2.2, -2.2];
/**
 * Куди вести м'яч: кілька напрямків від «прямо на ворота» до розвороту назад. Вільний простір, вигода зони, відхід від
 * того, хто тисне; поточний напрямок має перевагу, щоб гравець не смикався. Назад — лише під тиском.
 */
export function pickCarry(a, side, foes, pm, cdx, cdz) {
  const p = a.p, iq = a.sk.iq, z0 = zoneValue(p.x, p.z, side);
  let fx = 0, fz = 0, fd = 99;
  for (let i = 1; i < foes.length; i++) { const q = foes[i].p, d = Math.hypot(q.x - p.x, q.z - p.z); if (d < fd) { fd = d; fx = q.x; fz = q.z; } }
  const ax = fd > 0.01 ? (fx - p.x) / fd : 0, az = fd > 0.01 ? (fz - p.z) / fd : 0;
  let bs = -99, bx = side, bz = 0;
  for (let i = 0; i < 9; i++) {
    const an = CAR_A[i]; if (Math.abs(an) > 1.6 && pm > 5) continue;
    const dx = Math.cos(an) * side, dz = Math.sin(an), ex = p.x + dx * 10, ez = p.z + dz * 10;
    const c = laneDist(p.x, p.z, ex, ez, foes, 0);
    let s = Math.min(c, 6) * 0.8 + (zoneValue(ex, ez, side) - z0) * 12 + (dx * cdx + dz * cdz) * 0.7 - Math.abs(an) * 0.25;
    if (Math.abs(ez) > W - 3 || Math.abs(ex) > L - 3) s -= 3.5;
    if (pm < 6) s -= (dx * ax + dz * az) * (6 - pm) * 0.55;
    s += (Math.random() - 0.5) * (1 - iq) * 1.8;
    if (s > bs) { bs = s; bx = dx; bz = dz; }
  }
  _carry.dx = bx; _carry.dz = bz;
  return _carry;
}

export class TeamBrain {
  constructor(team) { this.team = team; this.reset(); }

  reset() {
    this.att = false; this.wonT = -9; this.lostT = -9; this.readT = 0; this.expect = false; this.ment = 0; this.counter = false;
    this.lineU = -L * 0.45; this.midU = -10; this.foreU = 6; this.oppDeep = -L; this.oppLast = L * 0.4; this.behind = 9; this.pressOn = true; this.cp = false;
    this.nRun = 0; this.nSup = 0; this.nGap = 0; this.presser = -1; this.best1 = 1e9; this.calls = 0;
  }

  /** Читання гри раз на ~0.25 с: чий м'яч, де лінії, чи тиснути, хто кого тримає, хто просить м'яч. */
  read(dt, c, att, n1) {
    const T = this.team, side = T.side, b = c.ball, t = c.t || 0, ax = b.x * side, opps = c.opps, out = T.out;
    if (att !== this.att) {
      this.att = att; if (att) this.wonT = t; else this.lostT = t;
      this.readT = 0;
      // м'яч перейшов: команда перебудовується не миттю, кожен реагує зі своєю затримкою
      for (let i = 0; i < out.length; i++) { const a = out[i], d = 0.08 + Math.random() * (0.55 - 0.4 * a.sk.iq); a.thinkT = d; a.jUntil = 0; a.callT = 0; }
    }
    this.readT -= dt; if (this.readT > 0) return;
    this.readT = 0.25;
    let deep = 99, last = -99, behind = 0, tOpp = 1e9;
    for (let j = 1; j < opps.length; j++) {
      const q = opps[j].p, ox = q.x * side; if (ox < deep) deep = ox; if (ox > last) last = ox; if (ox > ax + 1) behind++;
      const d = Math.hypot(q.x - b.x, q.z - b.z); if (d < tOpp) tOpp = d;
    }
    this.oppDeep = deep; this.oppLast = last; this.behind = behind;
    // вільний м'яч: якщо ми явно встигаємо першими, команда вже відкривається, а не чекає прийому
    this.expect = c.owner === 0 && c.bs === 'roll' && n1 >= 0 && this.best1 + 0.35 < tOpp / 8.5 && Math.hypot(b.vx, b.vz) < 22;
    // рахунок і час: програємо наприкінці — вище й ризикованіше, ведемо — нижче й обережніше
    const diff = (c.diff || 0) * side, tf = c.tf === undefined ? 1 : c.tf;
    this.ment = clamp(-diff * (0.2 + 0.75 * (1 - tf)), -1, 1);
    this.counter = att && t - this.wonT < 5 && behind <= 6 && ax < L - 12 && this.ment > -0.6;
    this.setLines(c, ax, att, t);
    if (att) { this.gaps(opps); this.assignRest(c, ax); this.countJobs(); this.updateCalls(c, ax); }
    else { this.calls = 0; this.assignMarks(c); }
  }

  /** Лінії блоку в обороні: захист, півзахист і вістря тримаються разом; від м'яча й від найглибшого чужого нападника. */
  setLines(c, ax, att, t) {
    const T = this.team, pr = T.press, side = T.side;
    const tl = (side < 0 ? T.line : 0) * 2 * L;
    this.cp = !att && t - this.lostT < 2 + 1.6 * pr && ax > -L * 0.35;      // щойно втратили: тиснуть одразу, поки суперник не роздивився
    let cap = -8 + 26 * pr + tl + this.ment * 7;
    if (this.cp) cap += 8;
    let line = Math.min(ax - (20 - 7 * pr), cap);
    line = Math.min(line, this.oppDeep - 1.6);                              // за спину нікого не пускають: тут немає офсайду
    line = Math.max(line, -L + 9);
    const k = att ? 1 : 2.4;                                               // лінія не стрибає за м'ячем, а переступає
    this.lineU += clamp(line - this.lineU, -6 * k * 0.25, 6 * k * 0.25);
    const gap = 19 - 4 * pr;
    this.midU = this.lineU + gap; this.foreU = this.midU + gap + (this.ment < -0.3 ? -3 : 2);
    // тиснути далеко не завжди: низький блок чекає, поки м'яч зайде в зону пресингу або носій затримається
    this.pressOn = this.cp || ax < this.midU + 16 + 26 * pr || (c.readyT || 0) > 1.6;
  }

  /** Місце в обороні: своя лінія, вузько й зі зсувом на бік м'яча. */
  defSpot(a, b, out) {
    const r = a.role, side = this.team.side, u = r.line === 'D' ? this.lineU : r.line === 'M' ? this.midU + (r.name === 'DM' ? -3 : 0) : r.line === 'W' ? this.midU + 5 : this.foreU;
    out.x = clamp(u, -L + 7, L - 7) * side;
    out.z = clamp(r.v * (W - 3.6) * 0.74 + clamp(b.z, -24, 24) * 0.34, -(W - 2.2), W - 2.2);
  }

  /** Щілини в останній лінії суперника: туди, а не на захисника, біжить той, хто забігає. */
  gaps(opps) {
    const side = this.team.side, ln = this.oppLast - 16; let n = 0;
    for (let j = 1; j < opps.length; j++) {
      const q = opps[j].p; if (q.x * side < ln) continue;
      let k = n++; while (k > 0 && _sortZ[k - 1] > q.z) { _sortZ[k] = _sortZ[k - 1]; k--; } _sortZ[k] = q.z;
    }
    let g = 0, prev = -(W - 4);
    for (let k = 0; k <= n; k++) {
      const z = k < n ? _sortZ[k] : W - 4;
      if (z - prev > 7 && g < 6) _gapZ[g++] = (z + prev) * 0.5;
      prev = z;
    }
    this.nGap = g;
  }

  /** Страховка на втрату: ті, хто стоїть найглибше, лишаються позаду м'яча, навіть коли всі в атаці. */
  assignRest(c, ax) {
    const T = this.team, out = T.out, want = ax < -L * 0.3 ? 0 : Math.round(3 - this.ment * 1.2 - (this.counter ? 1 : 0));
    for (let i = 0; i < out.length; i++) if (out[i].job === REST) out[i].job = SHAPE;
    for (let n = 0; n < want; n++) {
      let best = null, bs = 1e9;
      for (let i = 0; i < out.length; i++) {
        const a = out[i], l = a.role.line; if (a.manual || a.receiver || a.job === REST || (l !== 'D' && a.role.name !== 'DM')) continue;
        // центральні захисники й опорний першими, крайні частіше йдуть уперед
        const s = a.p.x * T.side + Math.abs(a.role.v) * 22;
        if (s < bs) { bs = s; best = a; }
      }
      if (best) best.job = REST;
    }
  }

  countJobs() {
    const out = this.team.out; let r = 0, s = 0;
    for (let i = 0; i < out.length; i++) { const j = out[i].job; if (j === RUN || j === GO) r++; else if (j === SUPPORT) s++; }
    this.nRun = r; this.nSup = s;
  }

  /** Опіка: найнебезпечніших суперників розбирають найближчі, кожного один. Тому двоє не тримають одного, а третій не стоїть вільний. */
  assignMarks(c) {
    const T = this.team, side = T.side, out = T.out, opps = c.opps, b = c.ball, gx = -side * L, carrier = c.carrier;
    let n = 0;
    for (let j = 1; j < opps.length; j++) {
      const q = opps[j]; if (q === carrier) continue;
      const qx = q.p.x, qz = q.p.z, dG = Math.hypot(qx - gx, qz), dB = Math.hypot(qx - b.x, qz - b.z);
      if (dB > 24 && qx * side > -L * 0.4) continue;                       // далеко від м'яча й далеко від воріт: його тримає зона, а не окрема людина
      const v = (1 - dG / 116) * 3 + Math.max(0, 28 - dB) / 28 * 1.2;
      let k = n++; while (k > 0 && _thr[k - 1] < v) { _thr[k] = _thr[k - 1]; _idx[k] = _idx[k - 1]; k--; } _thr[k] = v; _idx[k] = j;
    }
    for (let i = 0; i < out.length; i++) { const a = out[i]; a.mkOld = a.mark; a.mark = null; }
    const sp = T._t2 || (T._t2 = { x: 0, z: 0 });
    for (let k = 0; k < n; k++) {
      const q = opps[_idx[k]]; let best = null, bc = 1e9;
      for (let i = 0; i < out.length; i++) {
        const a = out[i]; if (a.mark || a.manual || a.receiver || a.stun > 0 || a.frozen > 0 || i === T.pressI || i === T.coverI) continue;
        this.defSpot(a, b, sp);
        const d = Math.hypot(sp.x - q.p.x, sp.z - q.p.z); if (d > LEASH[a.role.line]) continue;
        const cost = d - (a.mkOld === q ? 6 : 0);                           // свого не кидає через дрібну різницю відстаней
        if (cost < bc) { bc = cost; best = a; }
      }
      if (best) best.mark = q;
    }
  }

  /**
   * Хто підіймає руку: відкритий партнер із чистою лінією паса. Не всі разом: двоє найкращих, кожен зі своїм відпочинком.
   * Рука — це сигнал і людині, що грає: куди можна віддати просто зараз.
   */
  updateCalls(c, ax) {
    const T = this.team, side = T.side, out = T.out, b = c.ball, opps = c.opps, carrier = c.carrier;
    if (!carrier || c.bs === 'roll' || c.bs === 'wind') { for (let i = 0; i < out.length; i++) out[i].callT = Math.min(out[i].callT, 0.1); this.calls = 0; return; }
    let live = 0;
    _bestCall[0] = _bestCall[1] = null; let s0 = -9, s1 = -9;
    for (let i = 0; i < out.length; i++) {
      const a = out[i], p = a.p;
      if (a === carrier || a.manual || a.receiver || a.stun > 0 || a.frozen > 0 || p.downed || p.mode !== 'idle') { a.callT = 0; continue; }
      const dB = Math.hypot(p.x - b.x, p.z - b.z);
      const ok = dB > 6 && dB < 42, lane = ok ? laneDist(b.x, b.z, p.x, p.z, opps, 0) : 0, free = ok ? nearest(p.x, p.z, opps) : 0;
      if (a.callT > 0) { if (lane < 1.5 || free < 2.6) a.callT = 0; else { live++; continue; } }
      if (a.callCool > 0 || !ok || lane < 1.9 || free < 3.8) continue;
      // просять передусім ті, хто попереду; хто стоїть позаду м'яча, руку підіймає лише коли носія притиснули
      const fwd = (p.x * side - ax) / 18; if (fwd < -0.35) continue;
      if (Math.random() > 0.4 + 0.55 * a.sk.iq) continue;
      const s = fwd * 1.5 + Math.min(free, 10) * 0.12 + Math.min(lane, 5) * 0.15 + (a.job === RUN || a.job === GO ? 0.7 : 0);
      if (s > s0) { s1 = s0; _bestCall[1] = _bestCall[0]; s0 = s; _bestCall[0] = a; } else if (s > s1) { s1 = s; _bestCall[1] = a; }
    }
    for (let k = 0; k < 2 && live < 2; k++) {
      const a = _bestCall[k]; if (!a) continue;
      a.callT = 1.2 + Math.random() * 0.8; a.callCool = a.callT + 0.6 + Math.random() * 1.0; live++;
      // рука з боку, далі від найближчого суперника: так її видно, і її не треба тримати над чужим плечем
      let mn = 1e9, mx = 0, mz = 0;
      for (let j = 1; j < opps.length; j++) { const q = opps[j].p, d = (q.x - a.p.x) ** 2 + (q.z - a.p.z) ** 2; if (d < mn) { mn = d; mx = q.x; mz = q.z; } }
      const y = a.p.yaw || 0, right = (mx - a.p.x) * Math.cos(y) - (mz - a.p.z) * Math.sin(y);
      a.callArm = right > 0 ? 0 : 1;
    }
    this.calls = live;
  }

  /** Рука щокадру: поступово вгору через IK; гравець, що забігає, ще й показує, куди дати м'яч. */
  hand(a, dt) {
    if (a.callCool > 0) a.callCool -= dt;
    if (!(a.callT > 0)) return;
    a.callT -= dt;
    const p = a.p, y = p.yaw || 0, S = 0.82, fx = Math.sin(y), fz = Math.cos(y), rx = Math.cos(y), rz = -Math.sin(y), sgn = a.callArm ? 1 : -1;
    let ox = rx * 0.34 * sgn * S + fx * 0.08, oz = rz * 0.34 * sgn * S + fz * 0.08, up = 2.85 * S;
    if (a.job === RUN || a.job === GO) {
      const dx = a.jx - p.x, dz = a.jz - p.z, l = Math.hypot(dx, dz);
      if (l > 3) { ox = rx * 0.32 * sgn * S + (dx / l) * 0.5 * S; oz = rz * 0.32 * sgn * S + (dz / l) * 0.5 * S; up = 2.55 * S; }
    }
    p.reach(a.callArm, p.x + ox, up, p.z + oz, 1, false, false, CALL_POLE);   // лікоть назовні: рука рівна, а не зігнута на рівні плеча
  }

  /** Пасу зробив — іде далі: стіночка й рух після передачі, а не стоїть і дивиться. */
  afterPass(a, c) {
    return (c.t || 0) - (a.passT ?? -9) < 1.5 && a.sk.iq > 0.25;
  }

  /** Вибір роботи в атаці: один і той самий підрахунок для всіх точок, чи це підтримка, забіг, ширина, чи штрафний. */
  pickJob(a, c, base) {
    const T = this.team, side = T.side, b = c.ball, t = c.t || 0, p = a.p, r = a.role, iq = a.sk.iq, opps = c.opps, out = T.out;
    const ax = b.x * side, sgn = r.v >= 0 ? 1 : -1, bsg = b.z >= 0 ? 1 : -1, W2 = JOB_W[r.line] || JOB_W.M, line = r.line, deep = ax < -L * 0.45;
    _n = 0;
    CX[_n] = base.x; CZ[_n] = base.z; CT[_n++] = SHAPE;
    if (a.job !== SHAPE && a.jUntil > t) { CX[_n] = a.jx; CZ[_n] = a.jz; CT[_n++] = a.job; }
    const dB = Math.hypot(p.x - b.x, p.z - b.z);
    // підтримка: коротке кутове відкривання біля носія. Хто далеко, цим не займається: туди вже встигне ближчий
    if (dB < 34) {
      const m = iq < 0.35 ? 4 : iq < 0.65 ? 8 : 10;
      for (let i = 0; i < m; i++) add(side, ax + Math.cos(SUP_A[i]) * SUP_R[i], b.z + Math.sin(SUP_A[i]) * SUP_R[i], SUPPORT);
    }
    // забіг за спину: у щілину останньої лінії. Не з глибини власної половини, коли носій ще не може віддати далеко
    if (!deep || this.counter) {
      for (let g = 0; g < this.nGap; g++) add(side, this.oppLast + 4 + iq * 5, _gapZ[g], RUN);
      add(side, this.oppLast - 7, p.z, SUPPORT);                                   // між лініями: у кишеню за спиною півзахисту
    }
    // ширина: крайні тягнуть блок суперника вшир, дальній бік чекає на переведення
    if (line === 'W' || Math.abs(r.v) > 0.6) {
      add(side, ax + 4 + 8 * iq, sgn * (W - 5), WIDTH);
      if (line === 'D' && bsg === sgn && ax > -22) add(side, ax + 9, sgn * (W - 4), RUN);   // крайній захисник обіганням за своїм вінгером
    }
    if (line === 'M') add(side, ax + 2, -bsg * W * 0.5, SUPPORT);
    // м'яч на фланзі в чужій третині: штрафний заповнюють рівномірно: ближня штанга, дальня, пенальті, край, відкат
    if (ax > L - 34 && line !== 'D') {
      const bz = Math.abs(b.z) > 9 ? bsg : (r.v >= 0 ? 1 : -1);
      add(side, L - 6, bz * 3, BOX); add(side, L - 6, -bz * 3.5, BOX); add(side, L - 12, 0, BOX); add(side, L - 20, -bz * 5, BOX); add(side, L - 13, bz * 13, BOX);
    }
    let best = 0, bs = -1e9;
    for (let i = 0; i < _n; i++) {
      const x = CX[i], z = CZ[i], k = CT[i];
      if (iq < 0.5 && i > 1 && Math.random() < 0.5 - iq * 0.7) continue;     // не всі бачать всі варіанти
      let open = 99;
      for (let j = 1; j < opps.length; j++) { const q = opps[j].p, dx = q.x + q.vx * 0.4 - x, dz = q.z + q.vz * 0.4 - z, d = dx * dx + dz * dz; if (d < open * open) open = Math.sqrt(d); }
      const d2b = Math.hypot(x - b.x, z - b.z), lane = laneDist(b.x, b.z, x, z, opps, 1), me = Math.hypot(x - p.x, z - p.z);
      let crowd = 0;
      for (let m = 0; m < out.length; m++) {
        const o = out[m]; if (o === a) continue;
        const ox = o.jUntil > t ? o.jx : o.p.x, oz = o.jUntil > t ? o.jz : o.p.z, d = Math.hypot(ox - x, oz - z);
        if (d < 10) crowd += 10 - d;
      }
      const hold = Math.hypot(x - base.x, z - base.z);
      const pw = 1 + (this.counter ? 0.6 : 0) + this.ment * 0.45 + a.trait * 0.4;
      let s = Math.min(open, 9) * 0.34 + Math.min(lane, 5) * 0.42 + clamp((x * side - ax) / 14, -1, 1.4) * pw + zoneValue(x, z, side) * 3 - me * 0.045 - crowd * 0.36 + (W2[k] || 0);
      if (d2b < 10) s -= (10 - d2b) * 0.5; else if (d2b > 44) s -= (d2b - 44) * 0.12;
      if (hold > 24) s -= (hold - 24) * 0.1;
      if (k === a.job && Math.hypot(x - a.jx, z - a.jz) < 3) s += 1;         // передумує лише заради явно кращого
      if (k === RUN && a.job !== RUN && this.nRun >= (this.counter ? 3 : 2)) s -= 2.6;   // за спину разом не біжать: хтось має лишитись для паса
      if (k === SUPPORT && a.job !== SUPPORT && this.nSup >= 2) s -= 1.8;   // коротко відкриваються двоє, решта тримає простір
      s += (Math.random() - 0.5) * (1 - iq) * 3;
      if (s > bs) { bs = s; best = i; }
    }
    a.job = CT[best]; a.jx = CX[best]; a.jz = CZ[best];
    const me = Math.hypot(a.jx - p.x, a.jz - p.z);
    a.jUntil = t + clamp(me / 7, 0.8, 3.4) + 0.7 + Math.random() * 0.5;
    this.countJobs();
  }

  /**
   * Де стояти без м'яча. out: x, z, sp (множник швидкості), hot (біжить свідомо, а не повільно переставляється).
   * base — місце за схемою для цієї фази.
   */
  place(a, c, base, att, dt, out) {
    const T = this.team, side = T.side, b = c.ball, t = c.t || 0, p = a.p, iq = a.sk.iq, ax = b.x * side;
    out.x = base.x; out.z = base.z; out.sp = 0.8; out.hot = false;
    if (att) {
      a.mark = null;
      if (a.job === REST) {
        // страховка: позаду м'яча й позаду найглибшого чужого нападника, але не в своїх воротах
        out.x = clamp(Math.min(ax - 24 - Math.max(0, -this.ment) * 8, this.oppDeep - 2.5), -L + 14, L * 0.45) * side;
        out.z = clamp(a.role.v * (W - 3.6) * 0.55 + b.z * 0.3, -(W - 3), W - 3);
        out.sp = JOB_SP[REST]; a.jx = out.x; a.jz = out.z;
        return;
      }
      if (this.afterPass(a, c) && a.job !== GO) {
        // віддав — відкрився вперед у бік, де вільно: партнер має куди повернути
        const zz = clamp(p.z + (nearest(p.x, p.z + 8, c.opps) > nearest(p.x, p.z - 8, c.opps) ? 7 : -7), -(W - 4), W - 4);
        a.job = GO; a.jx = clamp(p.x * side + 13, -L + 3, L - 3) * side; a.jz = zz; a.jUntil = t + 1.6; a.thinkT = 1.3;
      }
      a.thinkT -= dt;
      if (a.thinkT <= 0) {
        a.thinkT = 0.4 + (1 - iq) * 0.9 + Math.random() * 0.4;
        if (!(a.job === GO && a.jUntil > t)) this.pickJob(a, c, base);
      }
      if (a.jUntil > t && a.job !== SHAPE) {
        out.x = a.jx; out.z = a.jz;
        const dG = Math.hypot(a.jx - p.x, a.jz - p.z);
        out.sp = (JOB_SP[a.job] || 1) * (this.counter ? 1.06 : 1); out.hot = dG > 1.2;
      } else out.sp = JOB_SP[SHAPE];
      return;
    }
    a.job = BLOCK;
    const axp = p.x * side;
    const q = a.mark;
    if (q) {
      // опіка: між суперником і своїми воротами, ближче до лінії паса. Що ближче м'яч, то щільніше. Той, хто бачить гру, читає рух на випередження
      const gx = -side * L, lead = 0.2 + 0.45 * iq, qx = q.p.x + q.p.vx * lead, qz = q.p.z + q.p.vz * lead;
      const dB = Math.hypot(qx - b.x, qz - b.z), tight = clamp(1.5 + dB * 0.1 + (1 - iq) * 1.5, 1.5, 7);
      const gl = Math.hypot(gx - qx, qz) || 1, bl = dB || 1;
      let mx = qx + ((gx - qx) / gl) * tight * 0.85 + ((b.x - qx) / bl) * tight * 0.28, mz = qz + (-qz / gl) * tight * 0.85 + ((b.z - qz) / bl) * tight * 0.28;
      // чужий пішов далеко вперед від лінії — захисник не вилазить із неї, а чекає його в своїй зоні
      const qa = qx * side, k = a.role.line === 'D' ? clamp(1 - (qa - (this.lineU + 5)) / 15, 0, 1) : 1;
      mx = base.x + (mx - base.x) * k; mz = base.z + (mz - base.z) * Math.max(k, 0.35);
      out.x = mx; out.z = mz; out.sp = JOB_SP[MARK]; out.hot = Math.hypot(mx - p.x, mz - p.z) > 2.2;
      a.job = MARK;
    } else out.sp = JOB_SP[BLOCK];
    // опинився перед м'ячем, коли його втратили: не йде підтюпцем, а біжить назад за лінію м'яча
    if (axp > ax + 3 && Math.hypot(out.x - p.x, out.z - p.z) > 6) { out.sp = 1.1; out.hot = true; }
    else if (this.cp && q) out.sp = 1.05;                                  // щойно втратили: свого тримає щільно, але на м'яч іде лише той, хто тисне
  }
}
