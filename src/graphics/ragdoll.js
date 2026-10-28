import * as THREE from 'three';

/**
 * Ragdoll гравця: тіло як система точок-суглобів (Верле), з'єднаних «кістками» сталої довжини. Гравітація, удар об газон
 * з тертям, тулуб жорсткий (з легким згином хребта), коліно не гнеться назад, руки рефлекторно виставляються вперед, щоб
 * зустріти землю. Кістки скелета щокадру орієнтуються за положенням точок, тож падіння щоразу інше — залежить від
 * швидкості, напрямку поштовху й пози, у якій гравця збили.
 */

const _v = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _qi = new THREE.Quaternion(), _qp = new THREE.Quaternion(), _qc = new THREE.Quaternion();
const DOWN = new THREE.Vector3(0, -1, 0), UP = new THREE.Vector3(0, 1, 0);
const G = 9.8, H0 = 1 / 240;

// точки: [вузол скелета, локальне зміщення (одиниці моделі), радіус для зіткнення з газоном]
const PTS = (p, headY) => [
  [p.legL, 0, 0, 0, 0.1], [p.legR, 0, 0, 0, 0.1],                 // 0,1 стегна
  [p.shinL, 0, 0, 0, 0.08], [p.shinR, 0, 0, 0, 0.08],             // 2,3 коліна
  [p.footL, 0, 0, 0, 0.06], [p.footR, 0, 0, 0, 0.06],             // 4,5 щиколотки
  [p.footL, 0, -0.06, 0.2, 0.04], [p.footR, 0, -0.06, 0.2, 0.04], // 6,7 носки
  [p.thorax, 0, 0, 0, 0.14],                                      // 8 грудний відділ
  [p.neck, 0, 0, 0, 0.08], [p.neck, 0, headY, 0.02, 0.19],        // 9 шия, 10 голова
  [p.armL, 0, 0, 0, 0.09], [p.armR, 0, 0, 0, 0.09],               // 11,12 плечі
  [p.foreL, 0, 0, 0, 0.09], [p.foreR, 0, 0, 0, 0.09],             // 13,14 лікті
  [p.handL, 0, -0.09, 0, 0.11], [p.handR, 0, -0.09, 0, 0.11],     // 15,16 кисті (радіус з запасом: кисть-блок лежить на траві, а не в ній)
];
const BONES = [[0, 2], [2, 4], [4, 6], [1, 3], [3, 5], [5, 7], [11, 13], [13, 15], [12, 14], [14, 16], [9, 10]];
const TORSO = [0, 1, 8, 9, 11, 12];
const _o = new THREE.Vector3(), _ex = new THREE.Vector3(), _st = { s: 0, t: 0 };
// плечі (11, 12) і стегна (0, 1) — частини тулуба: правила «не проходити крізь себе» їх не зсувають, лише кінцівки
// (інакше суперечка з газоном щокроку зсувала таз — і тіло, що лежить, «їхало» травою)
const SHOULDER = (i) => i === 11 || i === 12 || i === 0 || i === 1;
const _hu = new THREE.Vector3(), _hf = new THREE.Vector3(), _hy = new THREE.Vector3(), _hz = new THREE.Vector3(), _hx = new THREE.Vector3(), _hh = new THREE.Vector3();
const XA = new THREE.Vector3(1, 0, 0), FWD = new THREE.Vector3(0, 0, 1);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** Світові положення точок ragdoll за поточною позою скелета (у тому ж порядку, що й точки тіла). */
export function ragPoints(p, out = []) {
  p.root.updateMatrixWorld(true);
  const defs = ptsOf(p);
  for (let i = 0; i < defs.length; i++) { const d = defs[i]; (out[i] ??= new THREE.Vector3()).set(d[1], d[2], d[3]); d[0].localToWorld(out[i]); }
  return out;
}

/** Опис точок гравця — один раз на гравця (і заново лише коли змінилась висота голови), а не масиви щокадру. */
function ptsOf(p) {
  const hy = p.headY ?? 0.29;
  if (!p._ragPts || p._ragPtsY !== hy) { p._ragPts = PTS(p, hy); p._ragPtsY = hy; }
  return p._ragPts;
}

export class Ragdoll {
  /**
   * p — гравець (скелет уже в поточній позі), vel — швидкість тіла (м/с, світ), push — поштовх {x,z,up} (м/с),
   * trip — чи підсічено ноги (стопи зупиняються, тулуб летить далі).
   */
  /**
   * opts.vels — готові швидкості кожної точки (м/с, світ): тіло підхоплюється точно в русі, яким його вела анімація
   * (стрибок воротаря). opts.g — тяжіння; opts.dive — стрибок воротаря; opts.active — падіння живої людини.
   * В обох активних режимах «м'язи» (drive) тримають тіло зібраним, удар об газон гасять, а не розсипаються, і тіло
   * ковзає травою з тертям, а не зупиняється на місці.
   */
  constructor(p, vel, push, trip = true, opts = {}) {
    const s = p.root.scale.x || 0.82;
    p.root.updateMatrixWorld(true);
    this.p = p; this.s = s; this.t = 0; this.g = opts.g ?? G; this.dive = !!opts.dive; this.active = this.dive || !!opts.active; this.local = false; this.impact = 0; this.landT = -1; this.tone = 1;
    this.pos = []; this.prev = []; this.r = [];
    const defs = PTS(p, p.headY ?? 0.29);
    for (let i = 0; i < defs.length; i++) {
      const [node, x, y, z, r] = defs[i];
      const w = node.localToWorld(new THREE.Vector3(x, y, z));
      const leg = i <= 7, low = i === 4 || i === 5 || i === 6 || i === 7;
      // швидкість точки: тіло + поштовх (тулуб сильніше), підсічені стопи майже стоять або відлітають назад
      const k = leg ? (trip ? (low ? -0.25 : 0.35) : 0.8) : 1;
      const v = opts.vels ? opts.vels[i].clone() : new THREE.Vector3(vel.x * k + push.x * (leg ? 0.5 : 1), (push.up || 0) * (leg ? 0.3 : 1), vel.z * k + push.z * (leg ? 0.5 : 1));
      this.pos.push(w); this.prev.push(w.clone().addScaledVector(v, -H0)); this.r.push(r * s);   // швидкість у Верле — зсув за один підкрок
    }
    this.cons = [];
    const add = (a, b, k) => this.cons.push([a, b, this.pos[a].distanceTo(this.pos[b]), k]);
    for (const [a, b] of BONES) add(a, b, 1);
    for (let i = 0; i < TORSO.length; i++) for (let j = i + 1; j < TORSO.length; j++) {
      const a = TORSO[i], b = TORSO[j], hip = (x) => x === 0 || x === 1;
      add(a, b, hip(a) !== hip(b) ? (opts.active && !opts.dive ? 0.2 : 0.35) : 1);   // хребет гнеться між тазом і грудьми (у живої людини — помітно)
    }
    add(10, 11, 0.5); add(10, 12, 0.5); add(10, 8, 0.5);                // голова тримається на шиї, не теліпається
    add(0, 4, 0.04); add(1, 5, 0.04); add(11, 15, 0.03); add(12, 16, 0.03);   // м'язовий тонус: кінцівки не складаються повністю
    this.fall = new THREE.Vector3(vel.x + push.x, 0, vel.z + push.z);
    if (this.fall.lengthSq() < 1e-4) this.fall.set(Math.sin(p.bodyYaw), 0, Math.cos(p.bodyYaw));
    this.fall.normalize();
    this.dl = this.pos.map(() => new THREE.Vector3()); this.dk = this.pos.map(() => 0);
  }

  /** Центр мас (точки рівної маси). */
  com(P, out) { out.set(0, 0, 0); for (const q of P) out.add(q); return out.divideScalar(P.length); }

  /**
   * «М'язи»: куди кожна точка хоче стати відносно центру мас (з анімаційної пози — оберт тіла, руки з IK до м'яча, ноги),
   * і з якою жорсткістю (k, 1/с²). Сили внутрішні (їх сума віднімається), тож центр мас летить чисто балістично, а тіло
   * само обертається й групується, як спортсмен у повітрі; після удару ціль — поза приземлення (згрупувався, нижня рука
   * вздовж трави, м'яч притиснутий), тож тіло лягає кероване, а не розсипається.
   */
  setDrive(target, kOf, local = false) {
    this.local = local;
    if (local) {
      // у системі таза: тулуб падає вільно (фізика), а кінцівки й голова тримають позу відносно нього
      this.frame(target, _o, _hx, _hy, _hz);
      for (let i = 0; i < this.pos.length; i++) { _v.subVectors(target[i], _o); this.dl[i].set(_v.dot(_hx), _v.dot(_hy), _v.dot(_hz)); this.dk[i] = kOf(i); }
      return;
    }
    this.com(target, _o);
    for (let i = 0; i < this.pos.length; i++) { this.dl[i].subVectors(target[i], _o); this.dk[i] = kOf(i); }
  }

  /** Система таза за точками: початок — середина стегон, x — до правого стегна, y — до грудей, z — уперед. */
  frame(P, o, ex, ey, ez) {
    o.addVectors(P[0], P[1]).multiplyScalar(0.5);
    ex.subVectors(P[1], P[0]).normalize();
    ey.subVectors(P[8], o); ey.addScaledVector(ex, -ey.dot(ex)).normalize();
    ez.crossVectors(ex, ey);
  }

  /** Крок симуляції. Повертає true, коли тіло вже лягло й майже не рухається. */
  step(dt) {
    const n = Math.max(1, Math.round(Math.min(dt, 1 / 30) / H0)), h = H0, s = this.s;   // сталий підкрок 1/240 с: швидкості точок не залежать від частоти кадрів
    this.t += dt;
    // після удару об газон м'язи на мить піддаються (тіло «ляскає» об траву), потім знову тримають позу, але м'якше
    // удар об газон м'язи лише трохи «пропускають» (амортизація), і за ~0.25 с знову тримають тіло — людина не розсипається
    if (this.landT >= 0) { this.landT += dt; this.tone = this.landT < 0.08 ? 0.55 : 0.55 + 0.35 * Math.min(1, (this.landT - 0.08) / 0.25); }
    let drv = false; if (this.active) for (let i = 0; i < this.dk.length; i++) if (this.dk[i] > 0) { drv = true; break; }
    const loc = this.local;
    for (let it = 0; it < n; it++) {
      if (drv) { this.com(this.pos, _o); this.com(this.prev, _ex); }
      const vo = drv ? _c.subVectors(_o, _ex).divideScalar(h) : null;
      if (drv && loc) this.frame(this.pos, _hh, _hx, _hy, _hz);
      let sx = 0, sy = 0, sz = 0, nd = 0;
      for (let i = 0; i < this.pos.length; i++) {
        const p = this.pos[i], q = this.prev[i];
        _v.subVectors(p, q).multiplyScalar(this.active ? 0.9998 : 0.995);   // жива людина в польоті — чиста балістика, без «в'язкого повітря»
        // захисний рефлекс: перші 0.45 с кисті тягнуться вперед-униз, назустріч землі (у стрибку руки ведуть м'язи)
        let ax = 0, ay = -this.g, az = 0;
        if (drv && this.dk[i] > 0) {
          // м'яз: пружина до цільової точки відносно центру мас + загасання відносно його руху
          const l = this.dl[i], k = this.dk[i] * this.tone * (this.landT >= 0 && i >= 13 ? 0.6 : 1), c = 2 * 0.8 * Math.sqrt(k);   // руки на ударі трохи м'якші (гасять), але не мертві
          // ціль: відносно центру мас (стрибок) або в системі таза, що падає сам (падіння)
          const tx = loc ? _hh.x + _hx.x * l.x + _hy.x * l.y + _hz.x * l.z : _o.x + l.x, ty = loc ? _hh.y + _hx.y * l.x + _hy.y * l.y + _hz.y * l.z : _o.y + l.y, tz = loc ? _hh.z + _hx.z * l.x + _hy.z * l.y + _hz.z * l.z : _o.z + l.z;
          const fx = k * (tx - p.x) - c * (_v.x / h - vo.x), fy = k * (ty - p.y) - c * (_v.y / h - vo.y), fz = k * (tz - p.z) - c * (_v.z / h - vo.z);
          ax += fx; ay += fy; az += fz; sx += fx; sy += fy; sz += fz;
        }
        if (!this.active && (i === 15 || i === 16) && this.t < 0.45) {
          const tx = this.pos[8].x + this.fall.x * 0.55 * s, tz = this.pos[8].z + this.fall.z * 0.55 * s;
          ax += (tx - p.x) * 60; az += (tz - p.z) * 60; ay += (this.r[i] - p.y) * 25;
        }
        q.copy(p); p.add(_v).add(_a.set(ax * h * h, ay * h * h, az * h * h));
        // газон: не нижче радіуса, тертя гасить ковзання
        if (p.y < this.r[i]) {
          const vy = (p.y - q.y) / h;
          p.y = this.r[i];
          if (this.active) {
            // удар тулуба об траву — сила приземлення (для пилу, звуку, камери); далі ковзання з тертям (μ ≈ 0.55)
            if (vy < -1.2 && this.t > 0.08) { if (TORSO.includes(i) || i === 10) this.impact = Math.max(this.impact, -vy); if (this.landT < 0 && (TORSO.includes(i) || i === 10 || i >= 13)) this.landT = 0; }
            // тертя Кулона тіла об траву (μ ≈ 0.7): гальмує вага й сам удар — бічний імпульс до μ × нормального (жорстке
            // падіння гасить ковзання; з людської швидкості ~5 м/с тіло проїжджає травою до ~1 м)
            const hx = p.x - q.x, hz = p.z - q.z, hv = Math.hypot(hx, hz), dec = 0.7 * (this.g * h + Math.max(0, -vy)) * h;
            const k = hv > dec ? (hv - dec) / hv : 0; q.x = p.x - hx * k; q.z = p.z - hz * k;
          } else { q.x += (p.x - q.x) * 0.45; q.z += (p.z - q.z) * 0.45; }
          if (q.y < p.y - 0.001) q.y = p.y;
        }
      }
      if (drv) {                                   // сили м'язів внутрішні: їхня сума не штовхає центр мас
        const m = this.pos.length, hh = h * h;
        for (const p of this.pos) { p.x -= sx / m * hh; p.y -= sy / m * hh; p.z -= sz / m * hh; }
      }
      for (let k = 0; k < 6; k++) {
        for (const [a, b, len, st] of this.cons) {
          const A = this.pos[a], B = this.pos[b];
          _v.subVectors(B, A); const d = _v.length() || 1e-6, diff = (d - len) / d * 0.5 * st;
          A.addScaledVector(_v, diff); B.addScaledVector(_v, -diff);
        }
        this.limitKnees(); this.limitLegs(); this.limitBody();
      }
      // обмеження могли штовхнути точку в газон (рука під тулубом, що лежить) — назад на поверхню, без підкидання (prev теж);
      // і запобіжник: жодна точка тіла не рухається швидше ~14 м/с (людина в падінні — до ~8), тіло не «вибухає»
      const vm = 14 * h;
      for (let i = 0; i < this.pos.length; i++) {
        const P = this.pos[i], Q = this.prev[i];
        if (P.y < this.r[i]) { const dy = this.r[i] - P.y; P.y += dy; Q.y += dy; }
        _v.subVectors(P, Q); const l = _v.length(); if (l > vm) Q.copy(P).addScaledVector(_v, -vm / l);
      }
      // після удару об газон тіло вже не «повзе»: м'язи, що тягнуть кінцівки до пози й упираються в траву, через тертя
      // могли пересувати все тіло (воротар після стрибка їхав травою в сітку). Гасимо ковзання центру мас по газону
      // (~0.15 с — тертя лежачого тіла), а рух частин одна відносно одної лишаємо — тіло укладається саме
      if (this.landT > 0.12) {
        let mx = 0, mz = 0; const m = this.pos.length;
        for (let i = 0; i < m; i++) { mx += this.pos[i].x - this.prev[i].x; mz += this.pos[i].z - this.prev[i].z; }
        mx /= m; mz /= m;
        const k = 1 - Math.exp(-h * Math.min(14, 4 + 40 * (this.landT - 0.12)));
        for (let i = 0; i < m; i++) { this.prev[i].x += mx * k; this.prev[i].z += mz * k; }
      }
      // лежить: тіло заспокоюється — швидкості всіх точок гаснуть (~0.15–0.25 с), і м'язи, правила «не крізь себе» та газон
      // більше не смикають його дрібним тремтінням, а поза плавно доходить до спокою
      if (this.landT > 0.3) {
        const k = 1 - Math.exp(-h * Math.min(4, 1.5 + 8 * (this.landT - 0.3)));   // м'якше: тіло доходить до спокою, а не «застигає»
        for (let i = 0; i < this.pos.length; i++) { const P = this.pos[i], Q = this.prev[i]; Q.x += (P.x - Q.x) * k; Q.y += (P.y - Q.y) * k; Q.z += (P.z - Q.z) * k; }
      }
    }
    let ke = 0; for (let i = 0; i < this.pos.length; i++) ke += this.pos[i].distanceToSquared(this.prev[i]);
    return this.t > 0.5 && ke / (h * h) / this.pos.length < (this.active ? 0.4 : 0.05) && (!this.active || this.landT > 0.35);
  }

  /** Коліно не згинається назад: тримаємо його попереду лінії «стегно — щиколотка». */
  limitKnees() {
    const P = this.pos;
    _a.subVectors(P[1], P[0]);                                         // праворуч
    _b.addVectors(P[11], P[12]).multiplyScalar(0.5).sub(_c.addVectors(P[0], P[1]).multiplyScalar(0.5));   // угору
    _c.crossVectors(_a, _b).normalize();                               // уперед
    for (const [hp, kn, an] of [[0, 2, 4], [1, 3, 5]]) {
      _v.addVectors(P[hp], P[an]).multiplyScalar(0.5).sub(P[kn]).negate();
      const d = _v.dot(_c), min = 0.01 * this.s;
      if (d < min) { const f = min - d; P[kn].addScaledVector(_c, f * 0.6); P[hp].addScaledVector(_c, -f * 0.2); P[an].addScaledVector(_c, -f * 0.2); }
    }
  }

  /** Не дає точкам a і b зблизитись ближче за d (розсуває обидві порівну). */
  minDist(a, b, d) {
    const A = this.pos[a], B = this.pos[b];
    _v.subVectors(B, A); const l = _v.length();
    if (l >= d) return;
    if (l < 1e-6) _v.set(1, 0, 0); else _v.divideScalar(l);
    const f = (d - l) * 0.5; A.addScaledVector(_v, -f); B.addScaledVector(_v, f);
  }

  /**
   * Межі руху ніг, як у людини: стегно назад не далі ~25°, угору не вище ~125°, за середню лінію не більше ~15°;
   * коліна й щиколотки не проходять одна крізь одну; щиколотка не загинається (носок не наближається до коліна).
   */
  limitLegs() {
    const P = this.pos, s = this.s;
    _a.subVectors(P[1], P[0]).normalize();                                                  // праворуч
    _b.addVectors(P[11], P[12]).multiplyScalar(0.5).sub(_c.addVectors(P[0], P[1]).multiplyScalar(0.5));
    _b.addScaledVector(_a, -_b.dot(_a)).normalize();                                        // угору (до грудей)
    _c.crossVectors(_a, _b);                                                                // уперед
    for (let i = 0; i < 2; i++) {
      const hp = i, kn = 2 + i, side = i ? 1 : -1;
      this.legLim(hp, kn, _c, -1, 0.42);         // розгин назад ≤ ~25°
      this.legLim(hp, kn, _b, 1, 0.55);          // згин угору ≤ ~125°
      this.legLim(hp, kn, _a, -side, 0.26);      // приведення за середину ≤ ~15°
    }
    this.minDist(2, 3, 0.17 * s); this.minDist(4, 5, 0.15 * s);                             // ноги не проходять одна крізь одну
    this.minDist(2, 6, 0.5 * s); this.minDist(3, 7, 0.5 * s);                               // щиколотка не ламається
  }

  /** Проєкція стегна (hp → kn) на вісь axis (зі знаком sgn) не більша за cosMax — анатомічна межа кульшового суглоба. */
  legLim(hp, kn, axis, sgn, cosMax) {
    const P = this.pos; _v.subVectors(P[kn], P[hp]); const L = _v.length() || 1e-6;
    const d = (_v.dot(axis) * sgn) / L;
    if (d <= cosMax) return;
    const f = (d - cosMax) * L;
    P[kn].addScaledVector(axis, -sgn * f * 0.75); P[hp].addScaledVector(axis, sgn * f * 0.25);
  }

  /**
   * Тіло не проходить крізь себе: гомілки й стопи не перехрещуються посередині (а не лише в колінах і щиколотках),
   * передпліччя й плечі не заходять у тулуб і голову, рукавиці й передпліччя — одне в одне. Тулуб і голова «важкі» —
   * зсуваються лише кінцівки. Відрізок-відрізок, без виділень.
   */
  limitBody() {
    const s = this.s;
    this.segSep(2, 4, 3, 5, 0.15 * s, 0.5); this.segSep(2, 4, 5, 7, 0.13 * s, 0.5); this.segSep(3, 5, 4, 6, 0.13 * s, 0.5);
    this.segSep(0, 2, 3, 5, 0.17 * s, 0.5); this.segSep(1, 3, 2, 4, 0.17 * s, 0.5);           // стегно однієї й гомілка другої — теж ні
    // руки тут не обмежуємо: у польоті їх веде поза стрибка (м'язи), і правила «рука не в тулуб» у фізиці з нею сперечались —
    // тіло корчило й відкидало. Руки від тулуба, голови, ніг і одна від одної відводить уже поза (armGuard у player.js)
  }

  /** Найближчі точки відрізків a1–a2 і b1–b2 (параметри → _st). */
  closest(A1, A2, B1, B2) {
    _hu.subVectors(A2, A1); _hf.subVectors(B2, B1); _hy.subVectors(A1, B1);
    const a = _hu.dot(_hu), e = _hf.dot(_hf), f = _hf.dot(_hy), c = _hu.dot(_hy), b = _hu.dot(_hf), den = a * e - b * b;
    let sp = den > 1e-9 ? clamp((b * f - c * e) / den, 0, 1) : 0, tp = e > 1e-9 ? (b * sp + f) / e : 0;
    if (tp < 0) { tp = 0; sp = a > 1e-9 ? clamp(-c / a, 0, 1) : 0; } else if (tp > 1) { tp = 1; sp = a > 1e-9 ? clamp((b - c) / a, 0, 1) : 0; }
    _st.s = sp; _st.t = tp;
    _hz.copy(A1).addScaledVector(_hu, sp); _hx.copy(B1).addScaledVector(_hf, tp);
    return _v.subVectors(_hz, _hx);                                                       // від B до A
  }

  /** Відрізки точок a1–a2 і b1–b2 не ближче d; wb — частка поправки, яку бере відрізок b. */
  segSep(a1, a2, b1, b2, d, wb) {
    const P = this.pos, n = this.closest(P[a1], P[a2], P[b1], P[b2]), l = n.length();
    if (l >= d) return;
    if (l < 1e-6) n.set(0, 1, 0); else n.divideScalar(l);
    const f = d - l, sa = _st.s, tb = _st.t;
    // плече (11, 12) — частина тулуба: його не зсуваємо, поправку бере лікоть
    const pa = SHOULDER(a1), pb = SHOULDER(b1);
    const ka = f * (1 - wb) / (pa ? Math.max(0.3, sa) : (1 - sa) * (1 - sa) + sa * sa), kb = f * wb / (pb ? Math.max(0.3, tb) : (1 - tb) * (1 - tb) + tb * tb);
    if (!pa) this.nudge(a1, n, ka * (1 - sa)); this.nudge(a2, n, pa ? ka : ka * sa);
    if (!pb) this.nudge(b1, n, -kb * (1 - tb)); this.nudge(b2, n, pb ? -kb : -kb * tb);
  }

  /** Відрізок кінцівки a1–a2 не ближче d до нерухомого відрізка B1–B2 (тулуб, голова). */
  segSepTo(a1, a2, B1, B2, d) {
    const P = this.pos, n = this.closest(P[a1], P[a2], B1, B2), l = n.length();
    if (l >= d) return;
    if (l < 1e-6) n.set(0, 0, 1); else n.divideScalar(l);
    const f = d - l, sa = _st.s;
    if (SHOULDER(a1)) { this.nudge(a2, n, f / Math.max(0.3, sa)); return; }   // плече — частина тулуба: рухається лікоть
    const ka = f / ((1 - sa) * (1 - sa) + sa * sa);
    this.nudge(a1, n, ka * (1 - sa)); this.nudge(a2, n, ka * sa);
  }

  /**
   * Зсув точки разом із попереднім положенням: тіло виходить із самого себе, але не отримує від цього швидкості.
   * (У Верле зсув лише поточного положення — це поштовх; коли обмеження сперечаються з газоном, такі поштовхи
   * накачували тіло енергією, і воротаря після стрибка викидало за поле.)
   */
  nudge(i, n, k) { this.pos[i].addScaledVector(n, k); this.prev[i].addScaledVector(n, k); }

  /** Чи лежить обличчям донизу (для того, як підводитись). */
  faceDown() {
    const P = this.pos;
    _a.subVectors(P[1], P[0]); _b.subVectors(P[9], _c.addVectors(P[0], P[1]).multiplyScalar(0.5));
    _c.crossVectors(_a, _b).normalize();
    return _c.y < 0;
  }

  /** Поставити кістки скелета за точками; w — вага ragdoll (0 — анімація, 1 — повністю фізика). Без виділень пам'яті. */
  apply(w, torsoOnly = false) {
    const p = this.p, P = this.pos, s = this.s;
    // таз: базис зі стегон (праворуч) і хребта (угору); груди — з плечей і шиї
    _hip.addVectors(P[0], P[1]).multiplyScalar(0.5);
    basisQ(P, 0, 1, _hip, P[8], _qp);
    basisQ(P, 11, 12, P[8], P[9], _qc);
    // поза: світовий поворот таза в системі корпусу (body має курс)
    _q.setFromAxisAngle(UP, p.bodyYaw).invert();
    blendQ(p.pose, _q1.copy(_q).multiply(_qp), w);
    blendQ(p.pelvis, _qId, w);
    // таз у системі корпусу: (світ − корінь) повернуте на −курс, поділене на масштаб
    _v.copy(_hip).sub(p.root.position).applyQuaternion(_q).divideScalar(s);
    p.pose.position.lerp(_v, w);
    // тулуб: грудна клітка відносно таза
    blendQ(p.lean, _q1.copy(_qp).invert().multiply(_qc), w); blendQ(p.thorax, _qId, w);
    if (torsoOnly) return;
    legQ(P, p.legL, p.shinL, p.footL, 0, 2, 4, 6, w);
    legQ(P, p.legR, p.shinR, p.footR, 1, 3, 5, 7, w);
    hingeQ(P, p.armL, p.foreL, _qc, 11, 13, 15, 1, false, w, _qS);
    hingeQ(P, p.armR, p.foreR, _qc, 12, 14, 16, 1, false, w, _qS);
    // шия: напрям шия → голова в системі грудей
    _v.subVectors(P[10], P[9]).applyQuaternion(_qi.copy(_qc).invert()).normalize();
    blendQ(p.neck, _q1.setFromUnitVectors(UP, _v), w);
  }
}

// ---- постановка кісток за точками (спільні тимчасові змінні модуля — нуль виділень у кадрі)
const _hip = new THREE.Vector3(), _q1 = new THREE.Quaternion(), _qU = new THREE.Quaternion(), _qD = new THREE.Quaternion(), _qS = new THREE.Quaternion(), _qId = new THREE.Quaternion();
const TOE_REST = new THREE.Vector3(0, -0.06, 0.2).normalize();

function blendQ(node, q, w) { if (w >= 0.999) node.quaternion.copy(q); else node.quaternion.slerp(q, w); }

function basisQ(P, r0, r1, u0, u1, out) {
  _a.subVectors(P[r1], P[r0]).normalize();
  _b.subVectors(u1, u0); _b.addScaledVector(_a, -_b.dot(_a)).normalize();
  _c.crossVectors(_a, _b);
  _m.makeBasis(_a, _b, _c); return out.setFromRotationMatrix(_m);
}

/*
 * Кінцівка з шарніром (коліно, лікоть): верхній сегмент повертається так, щоб площина згину точно збігалася з віссю
 * шарніра, а нижній — лише навколо цієї осі й лише в природний бік. Без цього найкоротший поворот міг перекрутити
 * стегно навколо своєї осі — і коліно виглядало зламаним убік чи назад.
 * bend: −1 — коліно (гомілка йде назад), +1 — лікоть (передпліччя йде вперед); knee — обмежити поворот стегна.
 * out ← світовий поворот нижнього сегмента (parentQ · верхній · нижній).
 */
function hingeQ(P, upper, lower, parentQ, a, b, c, bend, knee, w, out) {
  _qi.copy(parentQ).invert();
  const u = _hu.subVectors(P[b], P[a]).applyQuaternion(_qi).normalize();
  const f = _hf.subVectors(P[c], P[b]).applyQuaternion(_qi).normalize();
  const Y = _hy.copy(u).negate();
  // площина згину: куди відхилився нижній сегмент; майже пряма кінцівка — плавно до «коліном/ліктем уперед»
  const Z = _hz.copy(f).addScaledVector(u, -f.dot(u)).multiplyScalar(bend);
  _hh.copy(FWD).addScaledVector(Y, -Y.dot(FWD)); if (_hh.lengthSq() < 1e-6) _hh.set(0, 1, 0).addScaledVector(Y, -Y.y); _hh.normalize();
  Z.addScaledVector(_hh, 0.06);
  let e = Math.acos(clamp(u.dot(f), -1, 1));
  if (knee) {
    // коліно дивиться вперед (± ~70° обертання стегна); прогин назад — це пряма нога, а не перекручене стегно
    Z.normalize(); const d = Z.dot(_hh);
    if (d < 0.35) { Z.addScaledVector(_hh, 0.35 - d).normalize(); if (d < -0.2) e = 0; }
  }
  Z.normalize();
  const X = _hx.crossVectors(Y, Z).normalize(); Z.crossVectors(X, Y);
  _m.makeBasis(X, Y, Z); _qU.setFromRotationMatrix(_m); blendQ(upper, _qU, w);
  if (knee) e = Math.min(e, 2.5);                                                       // гомілка не входить у стегно
  _qD.setFromAxisAngle(XA, bend < 0 ? e : -e); blendQ(lower, _qD, w);
  return out.copy(parentQ).multiply(_qU).multiply(_qD);
}

/** Нога: стегно й гомілка шарніром, стопа — носок уперед від гомілки, без вивертання вбік чи назад. */
function legQ(P, leg, shin, foot, h0, k0, a0, t0, w) {
  const qS = hingeQ(P, leg, shin, _qp, h0, k0, a0, -1, true, w, _qS);
  _v.subVectors(P[t0], P[a0]).applyQuaternion(_qi.copy(qS).invert()).normalize();
  _v.z = Math.max(_v.z, 0.3); _v.x = clamp(_v.x, -0.4, 0.4); _v.normalize();
  blendQ(foot, _q1.setFromUnitVectors(TOE_REST, _v), w);
}
