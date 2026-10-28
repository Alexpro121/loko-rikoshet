import { PITCH, FORMATIONS, PHYS } from '../config.js';
import { makeBody } from '../physics/world.js';

const { L, W, G } = PITCH;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;
const angDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
const AVOID_R = 3.6;

/**
 * Де буде м'яч через t с: та сама фізика, що в world.js (v' = −k·v − r, до зупинки), у межах поля.
 * q — наскільки гравець «читає» м'яч: 1 — точно, менше — недооцінює, куди той докотиться (бачить лише, де м'яч зараз).
 */
let PLAN = null;          // прогноз польоту з match.js (BallPlan) — та сама фізика з навісом, підкруткою й відскоками
function ballAt(b, t, q, out) {
  if (PLAN) {
    PLAN.at(t, out);
    out.x = b.x + (out.x - b.x) * q; out.z = b.z + (out.z - b.z) * q;   // слабкий «читає» м'яч гірше — недооцінює шлях
    return out;
  }
  out.y = 0;
  const v0 = Math.hypot(b.vx, b.vz), k = PHYS.drag, r = PHYS.roll;
  let s = 0;
  if (v0 > 0.05) {
    const tStop = Math.log(1 + (k * v0) / r) / k, tt = Math.min(t, tStop);
    s = ((v0 + r / k) * (1 - Math.exp(-k * tt))) / k - (r / k) * tt;
    s *= q; out.x = b.x + (b.vx / v0) * s; out.z = b.z + (b.vz / v0) * s;
  } else { out.x = b.x; out.z = b.z; }
  out.x = clamp(out.x, -L + 0.8, L - 0.8); out.z = clamp(out.z, -W + 0.8, W - 0.8);
  return out;
}

/**
 * Найраніша мить, коли гравець може бути біля м'яча, і де (out.x/z). Бігова швидкість sp, реакція й розгін — react с.
 * Шукаємо кроками 0.08 с до 3 с; не встигає — точка, куди м'яч докотиться за 3 с.
 */
function intercept(a, b, sp, q, react, out) {
  for (let t = 0; t <= 3; t += 0.08) {
    ballAt(b, t, q, out);
    if (out.y > 1.7) continue;                                          // м'яч над головою — тут його не взяти, біжимо туди, де опуститься
    const d = Math.hypot(out.x - a.p.x, out.z - a.p.z) - 0.9;          // дістає ногою за ~0.9 м
    if (d <= sp * Math.max(0, t - react)) { out.t = t; return out; }
  }
  out.t = 3 + Math.hypot(out.x - a.p.x, out.z - a.p.z) / sp; return out;
}

const DEF_SK ={ pace: 0.5, shoot: 0.5, pass: 0.5, drib: 0.5, tack: 0.5, iq: 0.5, react: 0.5, reach: 0.5, hands: 0.5 };

export class Actor {
  constructor(player, side, r = 0.85) {
    this.p = player; this.side = side;                 // +1 мої (атакують +X), -1 суперник
    this.body = makeBody(side > 0 ? 'mine' : 'opp', r, 0.5, 1.5); this.body.ref = this;
    this.manual = false; this.isGK = false; this.role = null;
    this.cool = 0; this.stealT = 0; this.err = 0; this.errT = 0;
    this.tx = 0; this.tz = 0; this.sprint = false; this.avx = 0; this.avz = 0;
    this.receiver = false; this.stun = 0; this.noTrap = 0; this.kx = 0; this.kz = 0;
    this.sk = DEF_SK; this.info = null; this.thinkT = Math.random() * 0.8; this.runUntil = 0; this.runX = 0; this.runZ = 0;
    this.frozen = 0; this.sliding = false; this.slide = null; this.dive = null; this.slideCool = 0; this.decided = -1; this.baseR = r;
  }
  place(x, z) { this.p.x = x; this.p.z = z; this.p.vx = this.p.vz = 0; this.sync(); }
  sync() { const b = this.body, p = this.p; b.x = p.x; b.z = p.z; b.vx = p.vx; b.vz = p.vz; }
  /** Плавний біг: прискорення, гальмування біля цілі, обхід перешкод. */
  move(tx, tz, speed, dt) {
    const p = this.p, dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
    let dvx = 0, dvz = 0;
    // підбігаючи до точки, гравець гальмує заздалегідь (шлях гальмування v²/2a), а не врізається з розгону
    if (d > 0.08) { const s = Math.min(speed * Math.min(1, d / 1.8), Math.sqrt(2 * 11 * d)); dvx = (dx / d) * s; dvz = (dz / d) * s; }
    dvx += this.avx; dvz += this.avz;
    const m = Math.hypot(dvx, dvz), cap = speed * 1.05;
    if (m > cap) { dvx *= cap / m; dvz *= cap / m; }
    // обмежені сили: розгін слабшає зі швидкістю, гальмування сильніше, бічне зчеплення обмежує поворот (радіус ≈ v²/a)
    let ex = dvx - p.vx, ez = dvz - p.vz;
    const v = Math.hypot(p.vx, p.vz), sc = Math.max(1, speed / 7.4);
    const aF = 8.5 * sc * (1 - 0.4 * Math.min(1, v / (speed * 1.05 + 0.1))), aB = 15 * sc, aL = 13 * sc;
    if (v > 0.6) {
      const hx = p.vx / v, hz = p.vz / v;
      let el = ex * hx + ez * hz, et = -ex * hz + ez * hx;
      el = clamp(el, -aB * dt, aF * dt); et = clamp(et, -aL * dt, aL * dt);
      p.vx += el * hx - et * hz; p.vz += el * hz + et * hx;
    } else {
      const m = Math.hypot(ex, ez), lim = aF * dt;
      if (m > lim) { ex *= lim / m; ez *= lim / m; }
      p.vx += ex; p.vz += ez;
    }
    p.x += p.vx * dt; p.z += p.vz * dt;
  }
}

/** Команда: розстановка за м'ячем, пресинг, опіка, підстраховка, воротар. */
export class Team {
  constructor(side, actors) {
    this.side = side;
    this.gk = actors[0]; this.gk.isGK = true;
    this.out = actors.slice(1);
    this.speed = 7.4;
    this.press = 0.6; this.line = 0; this.gkSpeed = 7; this.gkTrack = 0.7; this.gkErr = 1;
    this.setFormation('433');
  }

  setFormation(key) {
    this.roles = FORMATIONS[key] || FORMATIONS['433'];
    this.out.forEach((a, i) => { a.role = this.roles[i % this.roles.length]; });
  }

  /** Позиція ролі залежно від м'яча: лінії зсуваються, ширина стискається в обороні. */
  spot(a, b, owns, out) {
    const r = a.role, side = this.side;
    const prog = smooth(clamp((b.x * side + L) / (2 * L), 0, 1));
    const u = clamp(r.uDef + (r.uAtk - r.uDef) * prog + (owns ? 0.05 : -0.015) + (side < 0 ? this.line : 0.02), 0.06, 0.93);
    const wid = (W - 3.6) * (owns ? 0.98 : 0.8 + 0.2 * prog);
    out.x = -side * L + side * u * 2 * L;
    out.z = clamp(r.v * wid + b.z * (owns ? 0.28 : 0.38), -(W - 2.2), W - 2.2);
  }

  /** Вектор обходу інших гравців (щоб не штовхатись і не тупцювати на місці). */
  avoid(a, all) {
    let ax = 0, az = 0;
    const p = a.p;
    for (let j = 0; j < all.length; j++) {
      const q = all[j];
      if (q === a) continue;
      const dx = p.x - q.p.x, dz = p.z - q.p.z, d2 = dx * dx + dz * dz;
      if (d2 < AVOID_R * AVOID_R && d2 > 1e-4) {
        const d = Math.sqrt(d2), w = (1 - d / AVOID_R) * (q.side === a.side ? 0.8 : 1.15);
        ax += (dx / d) * w; az += (dz / d) * w;
      }
    }
    a.avx = ax * this.speed * 0.9; a.avz = az * this.speed * 0.9;
  }

  /** Найменша відстань від відрізка до гравців списку (з індексу from). */
  laneClear(x1, z1, x2, z2, list, from) {
    let m = 99;
    const dx = x2 - x1, dz = z2 - z1, l2 = dx * dx + dz * dz || 1;
    for (let i = from; i < list.length; i++) {
      const p = list[i].p, t = clamp(((p.x - x1) * dx + (p.z - z1) * dz) / l2, 0, 1);
      const ex = x1 + dx * t - p.x, ez = z1 + dz * t - p.z, d = Math.sqrt(ex * ex + ez * ez);
      if (d < m) m = d;
    }
    return m;
  }

  /**
   * Забіг у простір: гравець оцінює кілька точок попереду; що вищий інтелект, то більше варіантів
   * він бачить, то рідше «спить» і то точніше обирає вільну зону з відкритою лінією паса від носія м'яча.
   */
  pickRun(a, b, tx, tz, c) {
    const iq = a.sk.iq, side = this.side, opps = c.opps;
    const n = iq < 0.35 ? 2 : iq < 0.65 ? 5 : 9;
    const DX = [0, 6, 12, 18, 6, 12, 0, 18, 9], DZ = [0, -9, 9, 0, 9, -9, 14, -14, 0];
    let best = null, bs = -99, bx = 0, bz = 0;
    for (let i = 0; i < n; i++) {
      const cx = clamp(tx + side * DX[i], -L + 3, L - 3), cz = clamp(tz + DZ[i], -(W - 3), W - 3);
      let open = 99;
      for (let j = 1; j < opps.length; j++) { const q = opps[j].p, d = Math.hypot(q.x - cx, q.z - cz); if (d < open) open = d; }
      const lane = this.laneClear(b.x, b.z, cx, cz, opps, 1);
      const fwd = ((cx - tx) * side) / 18;
      const score = Math.min(open, 9) * 0.9 + Math.min(lane, 5) * 0.7 + fwd * 1.1 + (Math.random() - 0.5) * (1 - iq) * 4;
      if (score > bs) { bs = score; bx = cx; bz = cz; best = true; }
    }
    if (best) { a.runX = bx; a.runZ = bz; a.runUntil = (c.t || 0) + 0.9 + iq * 1.0; }
  }

  /** ctx: { ball, bs, owner(+1/-1/0), readyT, stealTime, opps, all, shotBy, t } */
  update(dt, c) {
    const b = c.ball, side = this.side, owns = c.owner === side;
    PLAN = c.plan || null;
    const out = this.out, n = out.length;
    const bs = Math.hypot(b.vx, b.vz);
    let n1 = -1, n2 = -1, d1 = 1e9, d2 = 1e9;
    for (let i = 0; i < n; i++) {
      const a = out[i]; if (a.manual || a.stun > 0 || a.frozen > 0) continue;
      const d = (a.p.x - b.x) * (a.p.x - b.x) + (a.p.z - b.z) * (a.p.z - b.z);
      if (d < d1) { d2 = d1; n2 = n1; d1 = d; n1 = i; } else if (d < d2) { d2 = d; n2 = i; }
    }
    // м'яч котиться: до нього біжить не найближчий, а той, хто першим встигне туди, куди м'яч докотиться
    let hasRecv = false;
    const ic = this._ic || (this._ic = { x: 0, z: 0, y: 0, t: 0 });
    if (c.bs === 'roll') {
      let t1 = 1e9, t2 = 1e9, tr = 1e9, tPrev = 1e9; n1 = n2 = -1;
      const tOf = this._tOf || (this._tOf = []);
      for (let i = 0; i < n; i++) {
        const a = out[i]; tOf[i] = 1e9;
        if (a.manual || a.stun > 0 || a.frozen > 0) continue;
        const t = intercept(a, b, this.speed * 1.2 * (0.84 + 0.34 * a.sk.pace), 1, 0.15, ic).t;
        if (a.receiver) { hasRecv = true; tr = Math.min(tr, t); continue; }
        tOf[i] = t; if (i === this.lastN1) tPrev = t;
        if (t < t1) { t2 = t1; n2 = n1; t1 = t; n1 = i; } else if (t < t2) { t2 = t; n2 = i; }
      }
      // хто біжить на м'яч, не перескакує щокадру між двома майже рівними — той, хто вже біжить, лишається (запас 0.25 с);
      // інакше обидва гальмували й не біг ніхто
      if (this.lastN1 >= 0 && this.lastN1 !== n1 && tPrev < t1 + 0.25) { if (n2 === this.lastN1) n2 = n1; else { n2 = n1; t2 = t1; } n1 = this.lastN1; t1 = tPrev; }
      this.lastN1 = n1;
      // пас «не дійде» (приймач запізнюється на ~0.5 с) — на м'яч біжить і найближчий; м'яч між двома своїми майже порівну —
      // біжать обидва (хто перший)
      this.recvWeak = hasRecv && tr > t1 + 0.5;
      this.both = n2 >= 0 && t2 < t1 + 0.25 && t2 < 1.4;
      if (n1 >= 0) { const p = out[n1].p; d1 = (p.x - b.x) ** 2 + (p.z - b.z) ** 2; }
      if (n2 >= 0) { const p = out[n2].p; d2 = (p.x - b.x) ** 2 + (p.z - b.z) ** 2; }
    }
    const tmp = this._t || (this._t = { x: 0, z: 0, y: 0 }), pb = this._pb || (this._pb = { x: 0, z: 0 });
    // прогноз удару суперника: найрозумніший з тих, хто ближче до траєкторії, зсувається на неї
    let lanePick = -1, lx = 0, lz = 0;
    if (c.bs === 'roll' && bs > 18 && c.shotBy !== 0 && (c.shotBy > 0) !== (side > 0)) {
      const ux = b.vx / bs, uz = b.vz / bs; let bp = 9;
      for (let i = 0; i < n; i++) {
        const a = out[i]; if (a.manual || a.stun > 0 || a.frozen > 0 || a.receiver || a.sk.iq < 0.5) continue;
        const rx = a.p.x - b.x, rz = a.p.z - b.z, along = rx * ux + rz * uz, perp = Math.abs(rx * uz - rz * ux);
        if (along > 4 && along < 36 && perp < bp) { bp = perp; lanePick = i; lx = b.x + ux * along; lz = b.z + uz * along; }
      }
    }
    const loose = c.bs === 'roll' && bs < 24;
    // м'яч у руках воротаря суперника — його не відбирають: ніхто не біжить на нього, усі відходять (нижче)
    const gkH = c.gkHands && c.gkHands.side === -side ? c.gkHands.p : null;
    const contest = !gkH && c.owner === -side && (c.bs === 'ready' || c.bs === 'aim' || c.bs === 'wind' || c.bs === 'held');
    for (let i = 0; i < n; i++) {
      const a = out[i];
      a.stun = Math.max(0, a.stun - dt);
      if (a.slideCool > 0) a.slideCool -= dt;
      if (a.frozen > 0) a.frozen -= dt;
      if (a.frozen > 0 || a.p.downed) { a.p.vx = a.p.vz = 0; continue; }           // лежить, підводиться або ловить рівновагу — сам не біжить
      if (a.manual) continue;
      if (c.kickoff) {                                  // стартовий: усі чекають на перший удар
        a.tx = a.kx; a.tz = a.kz; a.sprint = false; a.avx = a.avz = 0;
        a.move(a.kx, a.kz, this.speed * 0.8, dt);
        continue;
      }
      let sb = b;
      if (!owns && bs > 6) { const lead = 0.2 + 0.5 * a.sk.iq; pb.x = clamp(b.x + b.vx * lead, -L, L); pb.z = clamp(b.z + b.vz * lead, -W, W); sb = pb; }   // розумніші передбачають рух м'яча
      this.spot(a, sb, owns, tmp);
      let tx = tmp.x, tz = tmp.z, sp = this.speed, chase = false;
      // на м'яч біжить один від команди (або той, кому пасують); другий — страхує (за ним або ближче до своїх воріт)
      if (a.receiver) { chase = true; }
      else if (!owns && (!hasRecv || (this.recvWeak && i === n1))) {
        if (i === n1 && (loose || contest || c.owner === 0)) chase = true;
        else if (i === n2 && (contest || (c.bs === 'roll' && this.both))) chase = true;
      }
      if (a.stun > 0) chase = false;

      if (chase) {
        if (contest && !a.receiver && side < 0 && c.owner === 1) {
          // м'яч у гравця: найближчий не врізається в нього, а як справжній захисник — підбігає, за ~5 м гальмує й стає
          // в стійку на ~1.6 м між м'ячем і своїми воротами (з того боку, звідки прийшов); відбір — випад ногою (match.js)
          if (i === n1) {
            const db = Math.sqrt(d1), gx = -side * L, gl = Math.hypot(gx - b.x, b.z) || 1, al = Math.hypot(a.p.x - b.x, a.p.z - b.z) || 1;
            let ux = (a.p.x - b.x) / al + 0.8 * (gx - b.x) / gl, uz = (a.p.z - b.z) / al - 0.8 * b.z / gl; const ul = Math.hypot(ux, uz) || 1;
            tx = b.x + (ux / ul) * 1.6; tz = b.z + (uz / ul) * 1.6;
            sp = this.speed * (db > 5 ? 1.1 + this.press * 0.2 : 0.42 + 0.12 * this.press);
          } else { tx = b.x + (-side * L - b.x) * 0.22; tz = b.z * 0.8; sp = this.speed * 1.05; }
        } else if (contest && !a.receiver) {
          // стримування: найближчий тримає ~1.9 м перед м'ячем (між ним і своїми воротами) і біжить разом із ним, чекаючи
          // моменту для випаду; другий страхує глибше й збоку
          const dd = i === n1 ? 1.9 : 8.5;
          const gx = -side * L, vx = gx - b.x, vz = 0 - b.z, vl = Math.hypot(vx, vz) || 1;
          tx = b.x + (vx / vl) * dd; tz = b.z + (vz / vl) * dd + (i === n1 ? 0.3 : -2.8) * (b.z >= 0 ? 1 : -1);
          sp = this.speed * (1.05 + this.press * 0.18);
        } else {
          // перехоплення: біжить туди, де встигне зустріти м'яч. Розумний читає траєкторію повністю й реагує швидко —
          // біжить на випередження; слабкий недооцінює, куди м'яч докотиться, і запізнюється — женеться за ним дугою
          const iq = a.sk.iq, spd = this.speed * 1.2 * (0.84 + 0.34 * a.sk.pace);
          intercept(a, b, spd, 0.3 + 0.7 * iq, 0.35 - 0.25 * iq, ic);
          tx = ic.x; tz = ic.z; sp = this.speed * 1.2;
          // вже на місці раніше за м'яч — не стоїть столбом, а йде назустріч, щоб прийняти першим
          if (ic.t > 0.4 && Math.hypot(tx - a.p.x, tz - a.p.z) < 1.2) { tx += (b.x - tx) * 0.15; tz += (b.z - tz) * 0.15; }
        }
        tx = clamp(tx, -L + 1.5, L - 1.5); tz = clamp(tz, -W + 1.5, W - 1.5);
      } else {
        const iq = a.sk.iq, line = a.role.line;
        if (i === lanePick) { tx = lx; tz = lz; sp *= 1.1; }                                                    // закриває лінію удару
        else if (i === n2 && !owns && c.owner === 0 && c.bs === 'roll' && !hasRecv) {                           // страхує того, хто біжить на м'яч
          const ch = out[n1]; ballAt(b, 1, 0.3 + 0.7 * a.sk.iq, tmp);
          const gx = -side * L, vx = gx - tmp.x, vz = -tmp.z, vl = Math.hypot(vx, vz) || 1;
          tx = tmp.x + (vx / vl) * 7; tz = tmp.z + (vz / vl) * 7; if (ch) tz += (tz > ch.p.z ? 1 : -1) * 2;
        }
        else if (owns && c.bs !== 'net' && (line === 'F' || line === 'W' || line === 'M')) {                    // забіги в простір
          a.thinkT -= dt;
          if (a.thinkT <= 0) { a.thinkT = 0.5 + (1 - iq) * 1.2 + Math.random() * 0.4; this.pickRun(a, b, tx, tz, c); }
          if (a.runUntil > (c.t || 0)) { tx = a.runX; tz = a.runZ; sp *= 1.08; }
        } else if (!owns && c.opps && line !== 'F' && line !== 'W') {
          if (c.owner === -side && iq > 0.5) {                                                                  // розумні перекривають лінію паса
            let q = null, qd = 190;
            for (let j = 1; j < c.opps.length; j++) {
              const o = c.opps[j].p, dB = Math.hypot(o.x - b.x, o.z - b.z); if (dB < 2.5) continue;
              const dd = (o.x - tmp.x) * (o.x - tmp.x) + (o.z - tmp.z) * (o.z - tmp.z);
              if (dd < qd) { qd = dd; q = o; }
            }
            if (q) { const t = 0.35 + 0.15 * iq; tx = tx * 0.35 + (q.x + (b.x - q.x) * t) * 0.65; tz = tz * 0.35 + (q.z + (b.z - q.z) * t) * 0.65; }
          } else if ((b.x * side + L) < 1.15 * L) {                                                              // опіка за напрямком до воріт
            let best = null, bd = 150;
            for (let j = 1; j < c.opps.length; j++) {
              const q = c.opps[j].p, dd = (q.x - tmp.x) * (q.x - tmp.x) + (q.z - tmp.z) * (q.z - tmp.z);
              if (dd < bd) { bd = dd; best = q; }
            }
            if (best) { const k = 0.25 + 0.3 * iq; tx = tx * (1 - k) + (best.x - side * 2.6) * k; tz = tz * (1 - k) + best.z * k; }
          }
        }
        if (!owns && c.owner === -side) {
          const dx = b.x - tx, dz = b.z - tz;
          if (dx * dx + dz * dz < 150) { tx += dx * 0.18; tz += dz * 0.18; }
        }
        {   // біля м'яча — лише той, хто відбирає; решта не лізе в купу ближче ~4.5 м
          const dx = tx - b.x, dz = tz - b.z, d = Math.hypot(dx, dz);
          if (c.owner !== 0 && d < 4.5) { const k = 4.5 / (d || 1); tx = b.x + (d > 0.01 ? dx : -side) * k; tz = b.z + dz * k; }
        }
        tx = clamp(tx, -L + 1.5, L - 1.5); tz = clamp(tz, -W + 1.5, W - 1.5);
      }
      if (!chase) { const w = (1 - a.sk.iq) * 1.7, tt = c.t || 0; tx += Math.sin(tt * 0.7 + i * 1.7) * w; tz += Math.cos(tt * 0.6 + i * 2.3) * w; }   // слабкий інтелект: гравець «пливе» з позиції
      if (gkH) {   // відходять від воротаря з м'ячем у руках на ~7.5 м (ціль поза колом)
        const dx = tx - gkH.x, dz = tz - gkH.z, d = Math.hypot(dx, dz), R0 = 7.5;
        if (d < R0) { const ox = d > 0.1 ? dx / d : (a.p.x - gkH.x) / (Math.hypot(a.p.x - gkH.x, a.p.z - gkH.z) || 1), oz = d > 0.1 ? dz / d : (a.p.z - gkH.z) / (Math.hypot(a.p.x - gkH.x, a.p.z - gkH.z) || 1); tx = gkH.x + ox * R0; tz = gkH.z + oz * R0; }
        chase = false;
      }
      // спокій без м'яча: гравець, далекий від епізоду, не смикається за кожним рухом м'яча — позиція-ціль згладжена (повільно
      // «пливе» за грою), переставляється лише коли відійшла помітно (≥ ~0.6–3 м: що далі від м'яча, то грубіше), і далеко
      // від гри йде кроком (~2.3 м/с), а не бігом. Біля м'яча, у забігу, на перехопленні удару — реагує одразу й швидко
      if (!chase && !a.receiver) {
        const db = Math.hypot(a.p.x - b.x, a.p.z - b.z), run = i === lanePick || (owns && a.runUntil > (c.t || 0));
        const inv = run ? 1 : Math.max(smooth(clamp(1 - (db - 8) / 26, 0, 1)), c.bs === 'roll' && bs > 18 ? 0.6 : 0);
        if (a.stx === undefined || Math.hypot(a.stx - tx, a.stz - tz) > 25) { a.stx = tx; a.stz = tz; }
        const kk = Math.min(1, dt * (0.8 + 3.5 * inv)); a.stx += (tx - a.stx) * kk; a.stz += (tz - a.stz) * kk;
        const off = Math.hypot(a.stx - a.p.x, a.stz - a.p.z), dz = 0.6 + 2.4 * (1 - inv);
        a.calmMove = a.calmMove ? off > 0.35 : off >= dz;
        if (a.calmMove) { tx = a.stx; tz = a.stz; } else { tx = a.p.x; tz = a.p.z; }
        sp = Math.min(sp, lerp(2.3, sp, Math.max(inv, smooth(clamp((off - 3) / 7, 0, 1)))));
      } else a.calmMove = true;
      sp *= 0.84 + 0.34 * a.sk.pace;
      a.tx = tx; a.tz = tz; a.sprint = chase;
      if (chase && Math.hypot(a.p.x - b.x, a.p.z - b.z) < 6) { a.avx = 0; a.avz = 0; } else this.avoid(a, c.all);   // біля м'яча не відштовхуємось
      a.move(tx, tz, sp, dt);
    }
    // орієнтація: за напрямком бігу, у спокої дивимось на м'яч
    for (let i = 0; i < n; i++) {
      const a = out[i], p = a.p, s = Math.hypot(p.vx, p.vz);
      if (a.manual || a.frozen > 0) continue;
      // погляд: плавно між «на м'яч» (повільно, у стійці, приставним чи заднім ходом) і «куди біжить» (швидко). Раніше
      // на 1.8 м/с погляд перескакував різко, і на межі гравця смикало туди-сюди. Біг майже спиною до м'яча — довше
      // дивиться на м'яч (задній хід), а швидше розвертається таз (player.js), груди й голова лишаються на грі
      const by = Math.atan2(b.x - p.x, b.z - p.z);
      if (s < 0.3) p.yaw = by;
      else {
        const vy = Math.atan2(p.vx, p.vz), d = angDiff(by, vy), v0 = 1.3 + 1.9 * smooth(clamp((Math.abs(d) - 1.6) / 1.0, 0, 1));
        p.yaw = by + d * smooth(clamp((s - v0) / 1.8, 0, 1));
      }
    }
    this.updateGK(dt, c, bs);
  }

  updateGK(dt, c, bs) {
    const g = this.gk, p = g.p, b = c.ball, side = this.side;
    if (g.slideCool > 0) g.slideCool -= dt;
    if (g.frozen > 0) g.frozen -= dt;
    if (g.frozen > 0 || (p.downed && !g.dive)) { p.vx = p.vz = 0; return; }
    if (g.manual) return;
    const goalX = -side * L;
    const toGoal = (b.x - goalX) * side;
    // позиція на бісектрисі між центром воріт і м'ячем. Як справжній воротар: м'яч далеко — грає високо, «на підстраховці»
    // (до ~9 м від лінії); м'яч наближається — виходить скоротити кут (~4–6 м); зовсім близько — ближче до воріт (~2.5 м)
    const dist = Math.hypot(b.x - goalX, b.z);
    const out = dist > 45 ? clamp(5 + (dist - 45) * 0.12, 5, 9) : dist > 14 ? 2.6 + (dist - 14) * 0.08 : clamp(1.8 + dist * 0.05, 1.8, 2.6);
    const ux = (b.x - goalX) / (dist || 1), uz = b.z / (dist || 1);
    let tx = goalX + side * Math.max(1.0, Math.abs(ux) * out), tz = clamp(uz * out, -(G + 1.5), G + 1.5);
    const toward = -b.vx * side;
    let speed = this.gkSpeed, shot = false;
    // удар у бік воріт: де м'яч перетне площину, у якій воротар СТОЇТЬ (а не лінію воріт позаду нього), — з прогнозу польоту
    // (гальмування, рикошети). Тоді воротар, як справжній: не біжить назад на лінію, а ставить ноги й приставним кроком
    // зміщується на лінію удару; задалеко вийшов (>5 м) — трохи відступає. Читає удар неідеально (Інтелект, ліга) і
    // уточнює, що ближче м'яч
    if (c.bs === 'roll' && toward > 4 && bs > 10 && c.plan && c.plan.len > 1) {
      const cr = c.plan.cross(p.x, -side, this._gcr || (this._gcr = { t: 0, z: 0, y: 0 }));
      if (cr.t > 0 && Math.abs(cr.z) < G + 2.5 && cr.y < PITCH.GOAL_H + 0.5) {
        shot = true;
        if (g.shotSeen !== c.shotId) { g.shotSeen = c.shotId; g.shotErr = (Math.random() * 2 - 1) * (0.15 + 0.3 * this.gkErr) * (1.2 - 0.6 * g.sk.iq); }
        const err = g.shotErr * clamp(cr.t / 0.8, 0, 1);
        tz = tz + (clamp(cr.z + err, -(G + 0.3), G + 0.3) - tz) * clamp(0.6 + 0.4 * this.gkTrack, 0, 1);
        tx = goalX + side * clamp((p.x - goalX) * side, 1.2, 5);
        speed = this.gkSpeed * 0.85;
      }
    }
    // суперник із м'ячем ідe на ворота (будь-звідки, і збоку теж): воротар не відступає на лінію, а виходить назустріч по
    // бісектрисі кута між штангами — що ближче нападник, то ближче до нього (~35% відстані, 2.2–6 м), перекриваючи кут
    // і ближню штангу. Зовсім близько — кидається в ноги (match.js, gkRush)
    const oppHas = c.owner === -side && (c.bs === 'ready' || c.bs === 'aim' || c.bs === 'wind' || c.bs === 'held');
    if (!shot && oppHas && dist < 24) {
      const px = goalX - b.x, l1 = Math.hypot(px, G - b.z) || 1, l2 = Math.hypot(px, -G - b.z) || 1;
      let bx = px / l1 + px / l2, bz = (G - b.z) / l1 + (-G - b.z) / l2; const bl = Math.hypot(bx, bz) || 1; bx /= bl; bz /= bl;
      const keep = clamp(0.35 * dist, 2.2, 6);
      tx = goalX + side * clamp((b.x + bx * keep - goalX) * side, 0.8, 12); tz = clamp(b.z + bz * keep, -(G + 2), G + 2);
      speed = this.gkSpeed;
    }
    if (!shot && c.bs === 'roll' && bs < 16 && toGoal < 20 && Math.abs(b.z) < 18) {   // вільний м'яч у штрафному — його
      let free = true;
      const opp = c.opps;
      for (let i = 1; i < opp.length; i++) { const q = opp[i].p; if ((q.x - b.x) * (q.x - b.x) + (q.z - b.z) * (q.z - b.z) < 22) { free = false; break; } }
      // свій гравець ближче до м'яча (або вже поруч) — м'яч його: воротар не вибігає на партнера й не лишає ворота
      const dg = (p.x - b.x) * (p.x - b.x) + (p.z - b.z) * (p.z - b.z);
      for (let i = 0; i < this.out.length && free; i++) { const q = this.out[i].p, dq = (q.x - b.x) * (q.x - b.x) + (q.z - b.z) * (q.z - b.z); if (dq < 12 || dq < dg * 0.8) free = false; }
      if (free) { tx = b.x; tz = b.z; }
    }
    // пильність: м'яч далеко на іншій половині — розслаблений (рівна стійка, руки вільні, ходить кроком); ближче ~35 м і в
    // штрафному — у стійці; удар — повна готовність. Від неї й темп пересування: не мчить на кожну зміну позиції
    const danger = shot || (oppHas && dist < 24) ? 1 : clamp(1 - (dist - 16) / 30, 0, 1) * (c.owner === side ? 0.45 : 1);
    p.gkAlert = danger; p.gkShot = shot;
    // переставляється, лише коли позиція відійшла помітно (≥ ~0.3–0.9 м, далі від гри — грубіше); тоді йде, поки не стане
    // точно, — а не «повзе» безперервно за кожним рухом м'яча, як робот
    const off = Math.hypot(tx - p.x, tz - p.z), dz = 0.3 + 0.6 * (1 - danger);
    if (!shot && !g.gkMoving && off < dz) { tx = p.x; tz = p.z; }
    g.gkMoving = shot || (g.gkMoving ? off > 0.12 : off >= dz);
    speed = Math.min(speed, lerp(2.4, this.gkSpeed, Math.max(danger, smooth(clamp((off - 2) / 4, 0, 1)))));   // далеко й без поспіху — кроком
    this.avoid(g, c.all);
    g.move(tx, tz, speed, dt);
    p.yaw = Math.atan2(b.x - p.x, b.z - p.z);
  }
}
