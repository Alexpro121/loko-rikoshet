import { PITCH, FORMATIONS } from '../config.js';
import { makeBody } from '../physics/world.js';

const { L, W, G } = PITCH;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (t) => t * t * (3 - 2 * t);
const AVOID_R = 3.6;

const DEF_SK = { pace: 0.5, shoot: 0.5, pass: 0.5, drib: 0.5, tack: 0.5, iq: 0.5, react: 0.5, reach: 0.5, hands: 0.5 };

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
    if (d > 0.08) { const s = speed * Math.min(1, d / 1.8); dvx = (dx / d) * s; dvz = (dz / d) * s; }
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
    const out = this.out, n = out.length;
    const bs = Math.hypot(b.vx, b.vz);
    let n1 = -1, n2 = -1, d1 = 1e9, d2 = 1e9;
    for (let i = 0; i < n; i++) {
      const a = out[i]; if (a.manual || a.stun > 0 || a.frozen > 0) continue;
      const d = (a.p.x - b.x) * (a.p.x - b.x) + (a.p.z - b.z) * (a.p.z - b.z);
      if (d < d1) { d2 = d1; n2 = n1; d1 = d; n1 = i; } else if (d < d2) { d2 = d; n2 = i; }
    }
    const tmp = this._t || (this._t = { x: 0, z: 0 }), pb = this._pb || (this._pb = { x: 0, z: 0 });
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
    const contest = c.owner === -side && (c.bs === 'ready' || c.bs === 'aim' || c.bs === 'wind' || c.bs === 'held');
    for (let i = 0; i < n; i++) {
      const a = out[i];
      a.stun = Math.max(0, a.stun - dt);
      if (a.slideCool > 0) a.slideCool -= dt;
      if (a.frozen > 0) { a.frozen -= dt; a.p.vx = a.p.vz = 0; continue; }          // лежить або підводиться
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
      if (a.receiver) { chase = true; }
      else if (!owns) {
        if (i === n1 && (loose || contest || c.owner === 0)) chase = true;
        else if (i === n2 && (contest || (loose && bs < 5))) chase = true;
      } else if (c.owner === 0 && loose && i === n1) chase = true;
      if (a.stun > 0) chase = false;

      if (chase) {
        if (contest && !a.receiver && side < 0 && c.owner === 1) {   // м'яч у гравця: найближчий біжить прямо на нього
          if (i === n1) { tx = b.x; tz = b.z; sp = this.speed * (1.12 + this.press * 0.25); }
          else { tx = b.x + (-side * L - b.x) * 0.22; tz = b.z * 0.8; sp = this.speed * 1.05; }
        } else if (contest && !a.receiver) {            // стримування: ставимо корпус між м'ячем і своїми воротами
          const dd = i === n1 ? 4.0 - this.press * 1.2 : 8.5;
          const gx = -side * L, vx = gx - b.x, vz = 0 - b.z, vl = Math.hypot(vx, vz) || 1;
          tx = b.x + (vx / vl) * dd; tz = b.z + (vz / vl) * dd + (i === n1 ? 1 : -1) * (b.z >= 0 ? 1 : -1) * 2.8;   // збоку від лінії удару
          sp = this.speed * (1.05 + this.press * 0.18);
        } else {                                  // перехоплення: точка попереду м'яча
          const t = clamp(Math.sqrt(i === n1 ? d1 : d2) / (this.speed * 1.2), 0, 0.9);
          tx = b.x + b.vx * t * 0.6; tz = b.z + b.vz * t * 0.6;
          sp = this.speed * 1.2;
        }
        tx = clamp(tx, -L + 1.5, L - 1.5); tz = clamp(tz, -W + 1.5, W - 1.5);
      } else {
        const iq = a.sk.iq, line = a.role.line;
        if (i === lanePick) { tx = lx; tz = lz; sp *= 1.1; }                                                    // закриває лінію удару
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
        tx = clamp(tx, -L + 1.5, L - 1.5); tz = clamp(tz, -W + 1.5, W - 1.5);
      }
      if (!chase) { const w = (1 - a.sk.iq) * 1.7, tt = c.t || 0; tx += Math.sin(tt * 0.7 + i * 1.7) * w; tz += Math.cos(tt * 0.6 + i * 2.3) * w; }   // слабкий інтелект: гравець «пливе» з позиції
      sp *= 0.84 + 0.34 * a.sk.pace;
      a.tx = tx; a.tz = tz; a.sprint = chase;
      if (chase && Math.hypot(a.p.x - b.x, a.p.z - b.z) < 6) { a.avx = 0; a.avz = 0; } else this.avoid(a, c.all);   // біля м'яча не відштовхуємось
      a.move(tx, tz, sp, dt);
    }
    // орієнтація: за напрямком бігу, у спокої дивимось на м'яч
    for (let i = 0; i < n; i++) {
      const a = out[i], p = a.p, s = Math.hypot(p.vx, p.vz);
      if (a.manual || a.frozen > 0) continue;
      p.yaw = s > 1.8 ? Math.atan2(p.vx, p.vz) : Math.atan2(b.x - p.x, b.z - p.z);
    }
    this.updateGK(dt, c, bs);
  }

  updateGK(dt, c, bs) {
    const g = this.gk, p = g.p, b = c.ball, side = this.side;
    if (g.slideCool > 0) g.slideCool -= dt;
    if (g.frozen > 0) { g.frozen -= dt; p.vx = p.vz = 0; return; }
    if (g.manual) return;
    const goalX = -side * L;
    const toGoal = (b.x - goalX) * side;
    // позиція на бісектрисі: між центром воріт і м'ячем, ближче до м'яча при небезпеці
    const dist = Math.hypot(b.x - goalX, b.z);
    const out = clamp(1.7 + (30 - dist) * 0.06, 1.7, 3.2);
    let tx = goalX + side * out * Math.abs((b.x - goalX) / (dist || 1)) * 0.9 + side * 1.0;
    let tz = clamp(b.z / (dist || 1) * out * 1.6, -(G - 0.8), G - 0.8);
    const toward = -b.vx * side;
    if (toward > 4 && c.bs === 'roll' && toGoal < 70) {
      g.errT -= dt; if (g.errT <= 0) { g.errT = 0.45; g.err = (Math.random() * 2 - 1) * this.gkErr; }
      const line = goalX + side * 1.9;
      const predZ = b.z + b.vz * ((line - b.x) / (b.vx || 1e-3));
      tz = tz + (clamp(predZ + g.err, -G - 0.4, G + 0.4) - tz) * this.gkTrack;
      tx = line;
    } else if (c.bs === 'roll' && bs < 9 && toGoal < 17 && Math.abs(b.z) < 14) {
      let free = true;
      const opp = c.opps;
      for (let i = 1; i < opp.length; i++) { const q = opp[i].p; if ((q.x - b.x) * (q.x - b.x) + (q.z - b.z) * (q.z - b.z) < 22) { free = false; break; } }
      if (free) { tx = b.x; tz = b.z; }
    }
    this.avoid(g, c.all);
    g.move(tx, tz, this.gkSpeed, dt);
    p.yaw = Math.atan2(b.x - p.x, b.z - p.z);
  }
}
