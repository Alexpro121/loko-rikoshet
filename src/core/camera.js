// CamDirector: ігрова камера матчу за пресетами CAM_PRESETS (config.js); кадрує м'яч і важливих гравців.
import { PITCH, CAM_PRESETS } from '../config.js';

const { L, W, G } = PITCH;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const DEG = Math.PI / 180;
const HEAD = 1.75;                  // висота голови гравця: щоб у кадрі був увесь гравець, а не лише ноги
// безпечна зона кадру (частка від центру до краю): згори табло, знизу — джойстик і підказки
const TOP = 0.66, BOT = 0.8, SIDE = 0.86, SIDE_P = 0.8;
// м'яч не виходить за ці межі ніколи: якщо пружина не встигає (сильний удар), кадр доганяє його без затримки
const HARD_X = 0.92, HARD_TOP = 0.86, HARD_BOT = 0.9;
// від цих меж кадр м'яко, але швидко підтягується до м'яча (без стрибка) — задовго до жорсткої межі
const SOFT_X = 0.8, SOFT_TOP = 0.72, SOFT_BOT = 0.8;
const MAXP = 24;
// кого шукає nearest (числом, а не функцією: без замикань у кадрі)
const ANY = 0, FOE = 1, THEIR_GK = 2, GK = 3, MATE = 4;

/** Пресет, що діє зараз: «АВТО» — вертикальна на портретному екрані, класична на широкому. */
export function camPreset(id, asp) {
  if (!CAM_PRESETS[id]) id = 'classic';
  if (id === 'auto') id = asp < 0.9 ? 'vertical' : 'classic';
  return CAM_PRESETS[id];
}

/** Точка на траєкторії прицілу на відстані d від м'яча (або кінець, якщо траєкторія коротша). */
export function pathPoint(path, d, out) {
  const n = path.n; if (n < 2) { out.x = path.x[0]; out.z = path.z[0]; return out; }
  if (d >= path.cum[n - 1]) { out.x = path.x[n - 1]; out.z = path.z[n - 1]; return out; }
  let i = 1; while (i < n - 1 && path.cum[i] < d) i++;
  const d0 = path.cum[i - 1], d1 = path.cum[i], t = d1 > d0 ? (d - d0) / (d1 - d0) : 0;
  out.x = path.x[i - 1] + (path.x[i] - path.x[i - 1]) * t; out.z = path.z[i - 1] + (path.z[i] - path.z[i - 1]) * t;
  return out;
}

/** Порожній опис моменту для camInfo(): усе в координатах гравця — його команда атакує +X. */
export function camInfoBlank() {
  return { bx: 0, bz: 0, bvx: 0, bvz: 0, pl: [], n: 0, carrier: -1, receiver: -1, aiming: false, aimOn: false, ax: 0, az: 0 };
}

/**
 * Ігрова камера матчу — як у телетрансляції футболу: сталий широкий план, що йде за м'ячем (поперек кадру — майже повністю, вглиб —
 * частково, тож поле не «пливе» і на ньому легко орієнтуватись). Рух — критично загасана пружина зі швидкістю цілі:
 * камера йде разом із м'ячем без відставання, а ривки (відбір, рикошет) згладжує, без перельоту.
 *
 * Кожен кадр збирає важливі точки: м'яч і власник (обов'язково), хто на нього тисне, адресат паса, куди цілимось,
 * ворота під загрозою, партнери попереду. Поки вони вміщуються в базовий план — це чисте слідкування за м'ячем; коли ні —
 * кадр плавно зсувається до них і відходить (не далі, ніж дозволяє пресет), з урахуванням перспективи нахиленої камери.
 * Ближче за базовий план камера не підходить ніколи. Під час прицілу кадр стоїть (приціл рахується від екрана).
 */
export class CamDirector {
  constructor() {
    this.p = Array.from({ length: MAXP }, () => ({ x: 0, z: 0, h: 0, t: 0, a: 0, c: 0 })); this.np = 0;
    this.s0 = []; this.s1 = [];
    this.tx = 0; this.tz = 0; this.d = 60; this.dv = 0;
    this.bpx = 0; this.bpz = 0; this.vx = 0; this.vz = 0;        // шар «за м'ячем»: швидкий, зі швидкістю м'яча
    this.ox = 0; this.oz = 0; this.ovx = 0; this.ovz = 0;       // шар кадрування (запас атаки, важливі гравці): повільний
    this.lvx = 0; this.lvz = 0; this.gvx = 0; this.gvz = 0; this._b = { aLo: 0, aHi: 0, cLo: 0, cHi: 0 }; this._bt = [0, 0]; this._ot = [0, 0]; this._ff = [0, 0];
    this.yaw = 0; this.yv = 0; this.el = 45 * DEG; this.fov = 34;
    this.att = 0; this.fvx = 0; this.fvz = 0; this.bx = 0; this.bz = 0;
    this.frz = null; this.snapNext = true;
    this.px = 0; this.py = 40; this.pz = 40;
    this._near = []; this._r = { ta: 0, tc: 0, d: 0 };
  }

  snap() { this.snapNext = true; this.tx = this.tz = this.bpx = this.bpz = this.ox = this.oz = 0; }

  add(x, z, h, t) { if (this.np >= MAXP) return; const q = this.p[this.np++]; q.x = x; q.z = z; q.h = h; q.t = t; }

  /** k найближчих до (x, z) гравців у радіусі r, що проходять фільтр (індекси, від найближчого). */
  nearest(info, x, z, k, r, kind, ci, own, c) {
    const out = this._near; out.length = 0;
    for (let i = 0; i < info.n; i++) {
      const q = info.pl[i];
      if (kind === FOE ? i === ci || q.side === own : kind === THEIR_GK ? !q.gk || q.side !== -own : kind === GK ? !q.gk : kind === MATE ? i === ci || q.side !== 1 || q.gk || q.x <= c.x - 6 : false) continue;
      const d = Math.hypot(q.x - x, q.z - z); if (d > r) continue;
      let j = out.length; out.push(i); q._d = d;
      while (j > 0 && info.pl[out[j - 1]]._d > d) { out[j] = out[j - 1]; j--; }
      out[j] = i;
    }
    if (out.length > k) out.length = k;
    return out;
  }

  /** Важливі точки моменту: t = 0 — обов'язково в кадрі, 1 — важливо, 2 — бажано (якщо не треба сильно віддалятись). */
  collect(info, pre) {
    this.np = 0;
    const pl = info.pl, bx = info.bx, bz = info.bz;
    this.add(bx, bz, 0.5, 0);
    let ci = info.carrier;
    if (ci < 0) {   // м'яч біля ніг (ведення, прийом) — це теж власник
      const nb = this.nearest(info, bx, bz, 1, 1.4, ANY); if (nb.length) ci = nb[0];
    }
    const c = ci >= 0 ? pl[ci] : null, own = c ? c.side : 0;
    this.own = own; this.cq = c;
    if (c) this.add(c.x, c.z, HEAD, 0);
    // хто тисне: найближчі суперники власника; біля вільного м'яча — хто до нього біжить
    let ids = c ? this.nearest(info, c.x, c.z, 2, 15, FOE, ci, own) : this.nearest(info, bx, bz, 2, 11, ANY);
    for (let j = 0; j < ids.length; j++) { const q = pl[ids[j]]; this.add(q.x, q.z, HEAD, 1); }
    if (info.receiver >= 0) { const q = pl[info.receiver]; this.add(q.x, q.z, HEAD, 1); }
    this.aimQ = null; if (info.aimOn) { this.add(info.ax, info.az, 0.5, 1); this.aimQ = this.p[this.np - 1]; }
    // ворота під загрозою: власник у зоні удару — ворота й воротар у кадрі; м'яч летить у створ — ворота обов'язково
    if (c && !c.gk && Math.abs(own * L - c.x) < 34) {
      this.add(own * L, 0, 2.4, 1);
      ids = this.nearest(info, own * L, 0, 1, 12, THEIR_GK, ci, own);
      for (let j = 0; j < ids.length; j++) { const q = pl[ids[j]]; this.add(q.x, q.z, HEAD, 2); }
    } else if (!c && Math.abs(info.bvx) > 10) {
      const gx = Math.sign(info.bvx) * L, t = (gx - bx) / info.bvx, zl = bz + info.bvz * t;
      if (t > 0 && t < 1.5 && Math.abs(zl) < G + 8) {
        this.add(gx, clamp(zl, -G, G), 2.4, 0);
        ids = this.nearest(info, gx, 0, 1, 12, GK);
        for (let j = 0; j < ids.length; j++) { const q = pl[ids[j]]; this.add(q.x, q.z, HEAD, 1); }
      }
    }
    // варіанти паса: партнери, що відкрились попереду (у тактичній — ширше, щоб читалась розстановка)
    if (own === 1 && pre.mates) {
      ids = this.nearest(info, c.x, c.z, pre.mates, pre.mates > 2 ? 36 : 30, MATE, ci, own, c);
      for (let j = 0; j < ids.length; j++) { const q = pl[ids[j]]; this.add(q.x, q.z, HEAD, 2); }
    }
  }

  /** Мінімальна відстань камери, на якій усі точки списку (і extra) в безпечній зоні при центрі (ta, tc). */
  need(ta, tc, list, extra) {
    let d = 0;
    for (let i = 0; i < list.length; i++) d = Math.max(d, this.needOne(ta, tc, list[i]));
    return extra ? Math.max(d, this.needOne(ta, tc, extra)) : d;
  }
  /**
   * Для однієї точки: камера на відстані d над центром під нахилом el; точка зміщена на a вправо і на c до камери,
   * на висоті h. Глибина до неї d − c·cos − h·sin; умови — бік, верх (голова) і низ (ноги) в межах безпечної зони.
   */
  needOne(ta, tc, q) {
    const sE = this.sE, cE = this.cE, hh = this.half, ar = Math.abs(q.a - ta), cr = q.c - tc, hs = q.h * sE;
    return Math.max(ar / (hh * this.asp * this.side) + cr * cE + hs, (-cr * sE + q.h * cE) / (TOP * hh) + cr * cE + hs, (cr * sE) / (BOT * hh) + cr * cE);
  }

  /** Центр і відстань для списку точок: по горизонталі — посередині, вглиб — так, щоб ближній і дальній краї вміщались однаково. */
  solve(list, extra) {
    const sE = this.sE, cE = this.cE, hh = this.half;
    let amin = 1e9, amax = -1e9, cmax = -1e9, cmin = 1e9, ht = 0;
    for (let i = 0, n = list.length + (extra ? 1 : 0); i < n; i++) {
      const q = i < list.length ? list[i] : extra;
      if (q.a < amin) amin = q.a; if (q.a > amax) amax = q.a; if (q.c > cmax) cmax = q.c; if (q.c < cmin) { cmin = q.c; ht = q.h; }
    }
    const Kb = sE / (BOT * hh) + cE, Kt = sE / (TOP * hh) - cE, Hh = ht * (cE / (TOP * hh) + sE);
    const r = this._r;
    r.ta = (amin + amax) / 2; r.tc = (Kb * cmax + Kt * cmin - Hh) / (Kb + Kt);
    r.d = this.need(r.ta, r.tc, list, extra);
    return r;
  }

  /** Межі центру кадру (у координатах кадру a — поперек, c — вглиб) на відстані d: щоб не показувати зайве за полем. */
  bounds(d, cy, sy) {
    const hh = this.half, hw = d * hh * this.asp, near = d * hh / (this.sE + hh * this.cE), far = d * hh / Math.max(0.08, this.sE - hh * this.cE);
    const ca = Math.abs(cy), sa = Math.abs(sy), AX = ca * (L + 8) + sa * (W + 6), CN = sa * (L + 5) + ca * (W + 4), CF = sa * (L + 12) + ca * (W + 12);
    const r = this._b;
    if (hw >= AX) r.aLo = r.aHi = 0; else { r.aLo = -AX + hw; r.aHi = AX - hw; }
    if (near + far >= CN + CF) r.cLo = r.cHi = (CN - near - CF + far) / 2; else { r.cLo = -CF + far; r.cHi = CN - near; }
    return r;
  }

  /**
   * info — опис моменту (camInfoBlank), cv — кадр святкування гола (або null), o — { asp, preset, dist, tilt, follow, snap }.
   * Результат: this.tx/tz — куди дивимось, this.px/py/pz — де камера (у координатах гравця), this.fov.
   *
   * Рух розкладено на три незалежні шари, кожен зі своєю плавністю:
   *  1) «за м'ячем» — швидка пружина зі швидкістю цілі: камера йде разом із м'ячем без відставання. Швидкість м'яча
   *     міряємо з його реального зсуву за кадр (у сповільненні, на хітстопі й у гостя онлайн вона інша, ніж ігрова, —
   *     через це камера проскакувала вперед і смикалась назад);
   *  2) кадрування — запас попереду атаки й зсув до важливих гравців — повільна пружина: зміна власника, новий суперник
   *     поруч чи адресат паса зсувають кадр м'яко, а не ривком;
   *  3) віддалення — ще повільніше; відходить швидше, ніж наближається (без «дихання»).
   * Біля бортів швидкість шару 1 гасне заздалегідь: камера пригальмовує, а не впирається в межу.
   */
  update(dt, info, cv, o) {
    const pre = camPreset(o.preset, o.asp);
    let snap = this.snapNext || !!o.snap; this.snapNext = false;
    const aiming = !!info.aiming && !cv;
    // м'яч перенісся (розстановка після гола, новий тайм) — склейка, як у трансляції, а не переліт через усе поле
    if (!aiming && !cv && Math.hypot(info.bx - this.bx, info.bz - this.bz) > 14) snap = true;
    if (snap) { this.fvx = this.fvz = this.gvx = this.gvz = this.lvx = this.lvz = 0; }
    else if (dt > 1e-4) {
      const mvx = clamp((info.bx - this.bx) / dt, -60, 60), mvz = clamp((info.bz - this.bz) / dt, -60, 60);
      const k1 = 1 - Math.exp(-dt * 8), k2 = 1 - Math.exp(-dt * 2.2);
      // для руху камери — два ступені згладжування: після удару камера розганяється плавно, без поштовху
      this.gvx += (mvx - this.gvx) * k1; this.gvz += (mvz - this.gvz) * k1; this.fvx += (this.gvx - this.fvx) * k1; this.fvz += (this.gvz - this.fvz) * k1;
      this.lvx += (mvx - this.lvx) * k2; this.lvz += (mvz - this.lvz) * k2;      // для запасу попереду (спокійніше)
    }
    this.bx = info.bx; this.bz = info.bz;

    // кути: нахил і бік огляду з пресету; «трансляція» повертається за м'ячем, як камера на центральній лінії
    let elT = clamp(pre.el + (o.tilt || 0), 24, 82) * DEG, yawT = pre.yaw - (pre.swing || 0) * clamp(this.tx / L, -1, 1), fovT = pre.fov;
    if (cv) { elT = 50 * DEG; yawT = cv.ang; fovT = 34; }
    if (aiming) { elT = this.el; yawT = this.yaw; fovT = this.fov; }
    const ka = snap ? 1 : 1 - Math.exp(-dt * 2.6);
    this.el += (elT - this.el) * ka; this.fov += (fovT - this.fov) * ka;
    {
      let dy = yawT - this.yaw; dy -= Math.round(dy / (2 * Math.PI)) * 2 * Math.PI;
      if (snap) { this.yaw += dy; this.yv = 0; }
      else { const w = cv ? 3.2 : 2.4, n = Math.max(1, Math.ceil(dt / 0.01)), h = dt / n; for (let i = 0; i < n; i++) { this.yv += (w * w * dy - 2 * w * this.yv) * h; const s = this.yv * h; this.yaw += s; dy -= s; } }
    }
    this.sE = Math.sin(this.el); this.cE = Math.cos(this.el);
    this.half = Math.tan(this.fov * DEG / 2); this.asp = o.asp; this.side = o.asp < 1 ? SIDE_P : SIDE;
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);

    // базовий план — сталий, як у телетрансляції футболу: уся ширина пресету поперек екрана й глибина поля вздовж; на вузькому
    // (портретному) екрані ширина зменшується, інакше гравці стали б дрібними, як мурахи
    const mul = clamp((o.dist || 100) / 100, 0.6, 1.6);
    const wid = pre.width * clamp(o.asp / 1.6, pre.pmin || 0.55, 1) * mul;
    const dBase = Math.max((pre.depth * mul * this.sE) / (2 * this.half), wid / (2 * this.half * o.asp));
    const fol = clamp((o.follow || 100) / 100, 0.4, 2.5);

    const bt = this._bt, ot = this._ot, ff = this._ff; ff[0] = ff[1] = 0; ot[0] = ot[1] = 0;
    let dT, rate = pre.rate * fol, orate = 1.9 * Math.sqrt(fol);
    if (cv) {
      // святкування: кадри задає матч (крупно автор, гурт, загальний), камера лише плавно їх веде
      bt[0] = cv.tx; bt[1] = cv.tz; dT = cv.zoom * dBase; rate = 4.5; orate = 3;
      this.frz = null;
    } else {
      this.collect(info, pre);
      // хто з м'ячем: невеликий запас попереду атаки (змінюється повільно — без шарпання при кожному відборі)
      const attT = this.own || clamp(this.lvx / 18, -1, 1) * 0.5;
      this.att += (attT - this.att) * (snap ? 1 : 1 - Math.exp(-dt * 1.2));
      // шар 1: точка «за м'ячем» — поперек кадру майже повністю, вглиб частково (поле не «пливе»), у межах поля
      const ba = info.bx * cy - info.bz * sy, bc = info.bx * sy + info.bz * cy;
      const B0 = this.bounds(dBase, cy, sy);
      const pa = clamp(ba * pre.af, B0.aLo, B0.aHi), pc = clamp(bc * pre.cf + pre.co, B0.cLo, B0.cHi);
      // швидкість цілі; ближче ніж ~8 од. до межі, куди вона рухається, — плавно гасне
      let fa = (this.fvx * cy - this.fvz * sy) * pre.af, fc = (this.fvx * sy + this.fvz * cy) * pre.cf;
      fa *= clamp((fa > 0 ? B0.aHi - pa : pa - B0.aLo) / 8, 0, 1); fc *= clamp((fc > 0 ? B0.cHi - pc : pc - B0.cLo) / 8, 0, 1);
      // шар 2: запас попереду (за напрямком руху й атаки) і зсув до важливих гравців
      const lx = clamp(this.lvx * 0.25, -7, 7) + this.att * pre.lead * wid * 0.5, lz = clamp(this.lvz * 0.15, -4, 4);
      let ta = pa + lx * cy - lz * sy, tc = pc + lx * sy + lz * cy;
      for (let i = 0; i < this.np; i++) { const q = this.p[i]; q.a = q.x * cy - q.z * sy; q.c = q.x * sy + q.z * cy; }
      const s0 = this.s0, s1 = this.s1; s0.length = 0; s1.length = 0;
      for (let i = 0; i < this.np; i++) if (this.p[i].t === 0) s0.push(this.p[i]);
      const dGrow = dBase * pre.grow;
      for (let t = 1; t <= 2; t++) {
        for (let i = 0; i < this.np; i++) {
          const q = this.p[i]; if (q.t !== t) continue;
          if (this.solve(s0, q).d <= (t === 1 ? dGrow : dBase * 1.04)) s0.push(q);
        }
      }
      const r = this.solve(s0), over = this.need(ta, tc, s0) / dBase;
      const k = clamp((over - 0.82) / 0.35, 0, 1) * 0.7;      // усе й так у кадрі — чисте слідкування за м'ячем
      const hw = dBase * this.half * o.asp, hd = dBase * this.half / this.sE;
      ta += clamp((r.ta - ta) * k, -0.35 * hw, 0.35 * hw); tc += clamp((r.tc - tc) * k, -0.35 * hd, 0.35 * hd);
      const d = clamp(this.need(ta, tc, s0), dBase, dGrow);
      const B1 = this.bounds(d, cy, sy);
      ta = clamp(ta, Math.min(B1.aLo, pa), Math.max(B1.aHi, pa)); tc = clamp(tc, Math.min(B1.cLo, pc), Math.max(B1.cHi, pc));
      bt[0] = pa * cy + pc * sy; bt[1] = -pa * sy + pc * cy;
      ot[0] = (ta - pa) * cy + (tc - pc) * sy; ot[1] = -(ta - pa) * sy + (tc - pc) * cy;
      ff[0] = fa * cy + fc * sy; ff[1] = -fa * sy + fc * cy;
      dT = d;
      if (aiming) {
        // приціл рахується від екрана: кадр зупиняється (за мить, а не різко) і лише трохи відходить, щоб було видно,
        // куди полетить м'яч
        if (!this.frz) this.frz = { d: this.d };
        const ta0 = this.tx * cy - this.tz * sy, tc0 = this.tx * sy + this.tz * cy;
        s1.push(this.p[0]); if (this.aimQ) s1.push(this.aimQ);
        dT = clamp(this.need(ta0, tc0, s1), this.frz.d, this.frz.d * 1.15);
      } else this.frz = null;
    }

    if (snap) {
      this.bpx = bt[0]; this.bpz = bt[1]; this.vx = ff[0]; this.vz = ff[1];
      this.ox = ot[0]; this.oz = ot[1]; this.ovx = this.ovz = 0; this.d = dT; this.dv = 0;
    } else {
      // критично загасані пружини: без ривків швидкості й без перельоту
      const wd = (dT > this.d ? 2.0 : 0.85) * (cv ? 1.6 : 1), n = Math.max(1, Math.ceil(dt / 0.01)), h = dt / n;
      for (let i = 0; i < n; i++) {
        if (aiming) {
          const f = Math.exp(-12 * h); this.vx *= f; this.vz *= f; this.ovx *= f; this.ovz *= f;
        } else {
          this.vx += (rate * rate * (bt[0] - this.bpx) + 2 * rate * (ff[0] - this.vx)) * h; this.vz += (rate * rate * (bt[1] - this.bpz) + 2 * rate * (ff[1] - this.vz)) * h;
          bt[0] += ff[0] * h; bt[1] += ff[1] * h;
          this.ovx += (orate * orate * (ot[0] - this.ox) - 2 * orate * this.ovx) * h; this.ovz += (orate * orate * (ot[1] - this.oz) - 2 * orate * this.ovz) * h;
        }
        this.bpx += this.vx * h; this.bpz += this.vz * h; this.ox += this.ovx * h; this.oz += this.ovz * h;
        this.dv += (wd * wd * (dT - this.d) - 2 * wd * this.dv) * h; this.d += this.dv * h;
      }
    }
    this.tx = this.bpx + this.ox; this.tz = this.bpz + this.oz;
    if (!cv && !aiming) {
      // м'яч (і власник) не тікають з кадру: від м'якої межі кадр швидко, але плавно підтягується; жорстка — запобіжник
      const ks = snap ? 1 : 1 - Math.exp(-dt * 9);
      if (this.cq) this.keepIn(this.cq.x, this.cq.z, cy, sy, SOFT_X, SOFT_TOP, SOFT_BOT, ks);
      this.keepIn(info.bx, info.bz, cy, sy, SOFT_X, SOFT_TOP, SOFT_BOT, ks);
      this.keepIn(info.bx, info.bz, cy, sy, HARD_X, HARD_TOP, HARD_BOT, 1);
    }
    const d = this.d, ce = this.cE * d;
    this.px = this.tx + sy * ce; this.py = this.sE * d; this.pz = this.tz + cy * ce;
  }

  /**
   * Тримає точку в межах кадру (частки від центру до краю: lx — бік, lt — верх, lb — низ). Потрібний зсув додається до
   * шару «за м'ячем» з часткою k (1 — одразу), тож пружина далі веде камеру від нового місця без ривка швидкості.
   */
  keepIn(bx, bz, cy, sy, lx, lt, lb, k) {
    const d = this.d, sE = this.sE, cE = this.cE, hh = this.half;
    const ta = this.tx * cy - this.tz * sy, tc0 = this.tx * sy + this.tz * cy;
    const a = bx * cy - bz * sy, c = bx * sy + bz * cy;
    let cr = c - tc0, tc = tc0;
    const top = lt * hh, bot = lb * hh;
    if (-cr * sE > top * (d - cr * cE)) { cr = (top * d) / (top * cE - sE); tc = c - cr; }
    else if (cr * sE > bot * (d - cr * cE)) { cr = (bot * d) / (bot * cE + sE); tc = c - cr; }
    const lim = lx * hh * this.asp * (d - cr * cE), ar = a - ta;
    const da = Math.abs(ar) > lim ? ar - Math.sign(ar) * lim : 0, dc = tc - tc0;
    if (!da && !dc) return;
    const wx = (da * cy + dc * sy) * k, wz = (-da * sy + dc * cy) * k;
    this.bpx += wx; this.bpz += wz; this.tx += wx; this.tz += wz;
  }
}
