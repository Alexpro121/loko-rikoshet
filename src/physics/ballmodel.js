import { PITCH, PHYS } from '../config.js';

/**
 * Модель польоту м'яча — одна на всю гру: фізика поля (world.js), пунктир прицілу (aim.js), прогноз для ІІ й воротарів
 * (BallPlan нижче) і розрахунок сили ударів беруть рух саме звідси, тож пунктир і поведінка гравців не розходяться з реальним
 * польотом.
 *
 * Стан м'яча: x, z — на полі; y — висота низу м'яча над газоном (0 — лежить/котиться); vx, vy, vz; w — бокове обертання
 * (рад/с навколо вертикалі, + — проти годинникової зверху).
 *
 *  • У повітрі: тяжіння g, квадратичний опір повітря a = −k·|v|·v (k = ρ·Cd·A / 2m ≈ 0.013 1/м для футбольного м'яча),
 *    ефект Магнуса: бічне прискорення ∝ w × v (крученый м'яч «заходить» у бік обертання), обертання повільно згасає.
 *  • Відскок від газону: вертикальна швидкість × e (трава ~0.55), удар «з'їдає» частину горизонтальної швидкості
 *    (кулонове тертя в мить контакту ∝ вертикальному імпульсу) і закрутки. Повільний відскок — м'яч «лягає» й котиться.
 *  • Котіння: як і раніше (експоненційне + постійне гальмування) — баланс гри по газону не змінюється; кручений м'яч
 *    по траві заходить слабше, обертання гасне швидко.
 *
 * Одиниця поля ≈ 0.9 м, тож g = 9.81 / 0.9. Без алокацій: усе на полях переданого об'єкта.
 */
export const BALL = {
  g: 9.81 / 0.9,
  air: 0.012,          // 1/од: квадратичний опір повітря
  curlAir: 0.16,       // Магнус у повітрі: a⊥ = curlAir · w · |v|
  curlGround: 0.03,    // по траві — слабше
  spinAir: 0.25,       // згасання обертання, 1/с
  spinGround: 2.6,
  bounceE: 0.55,       // пружність газону
  bounceMu: 0.22,      // тертя в мить відскоку
  settleVy: 1.6,       // повільніший відскок — м'яч лягає на газон
  netDamp: 0.5,        // у воротах — лише повітря; саму сітку (пружну) рахує world.js
  spinMax: 9,          // рад/с
};

/**
 * Вільний рух за крок h (без перешкод): швидкості, висота, відскок від газону. x/z рухає world.integrate (там же —
 * безперервні зіткнення). Повертає 1, якщо щойно був відскок від газону.
 */
export function stepFree(s, h, inNet) {
  let bounced = 0;
  if (inNet) {
    const k = Math.exp(-BALL.netDamp * h); s.vx *= k; s.vz *= k; s.vy *= k; s.w *= k;
  }
  if (s.y > 0 || s.vy > 0) {
    // ---- політ
    const vx = s.vx, vy = s.vy, vz = s.vz, v = Math.sqrt(vx * vx + vy * vy + vz * vz), kd = BALL.air * v;
    const m = BALL.curlAir * s.w;                                             // w × v для вертикальної осі: (−vz, ·, vx)
    s.vx += (-kd * vx - m * vz) * h;
    s.vz += (-kd * vz + m * vx) * h;
    s.vy += (-kd * vy - BALL.g) * h;
    s.w *= 1 - BALL.spinAir * h;
    s.y += s.vy * h;
    if (s.y <= 0) {
      s.y = 0;
      const vin = -s.vy;
      if (vin > BALL.settleVy) {
        s.vy = vin * BALL.bounceE;
        const vh = Math.sqrt(s.vx * s.vx + s.vz * s.vz);
        if (vh > 1e-3) { const f = Math.max(0.55, 1 - BALL.bounceMu * (1 + BALL.bounceE) * vin / vh); s.vx *= f; s.vz *= f; }
        s.w *= 0.6; bounced = 1;
      } else s.vy = 0;                                                        // ліг на газон
    }
  } else {
    // ---- котіння
    s.y = 0; s.vy = 0;
    const sp0 = Math.sqrt(s.vx * s.vx + s.vz * s.vz);
    if (sp0 > 0) {
      if (s.w !== 0) { const m = BALL.curlGround * s.w; s.vx -= m * s.vz * h; s.vz += m * s.vx * h; }
      let sp = sp0 * Math.exp(-PHYS.drag * h) - PHYS.roll * h;
      if (sp < PHYS.stop) sp = 0;
      const f = sp / sp0; s.vx *= f; s.vz *= f;
    }
    s.w *= Math.max(0, 1 - BALL.spinGround * h);
    if (Math.abs(s.w) < 0.02 || (s.vx === 0 && s.vz === 0)) s.w = 0;
  }
  return bounced;
}

/** М'яч лежить у ногах / в руках: без висоти й обертання. */
export function ground(s) { s.y = 0; s.vy = 0; s.w = 0; }

/**
 * Прогноз польоту м'яча (той самий крок, що й гра, з бортами, штангами, поперечиною) — таблиця на ~3 с уперед з кроком
 * 1/30 с: ІІ шукає, де перехопити, воротарі — де і на якій висоті м'яч перетне лінію. Перерахунок дешевий (типізовані
 * масиви, без алокацій) — раз на ~0.1 с або одразу після удару.
 */
export class BallPlan {
  constructor(world, n = 96, dt = 1 / 30) {
    this.world = world; this.n = n; this.dt = dt; this.len = 0;
    this.x = new Float32Array(n); this.z = new Float32Array(n); this.y = new Float32Array(n);
    this.s = { x: 0, z: 0, y: 0, vx: 0, vy: 0, vz: 0, w: 0, r: PITCH.R };
  }

  build(b) {
    const s = this.s, w = this.world, sub = 4, h = this.dt / sub;
    s.x = b.x; s.z = b.z; s.y = b.y || 0; s.vx = b.vx; s.vy = b.vy || 0; s.vz = b.vz; s.w = b.w || 0;
    let i = 0;
    this.x[0] = s.x; this.z[0] = s.z; this.y[0] = s.y; i = 1;
    for (; i < this.n; i++) {
      for (let k = 0; k < sub; k++) w.integrate(s, h, null, false);
      this.x[i] = s.x; this.z[i] = s.z; this.y[i] = s.y;
      if (s.vx === 0 && s.vz === 0 && s.y === 0 && s.vy === 0) { i++; break; }
    }
    this.len = i;
    return this;
  }

  /** Де м'яч через t с (out.x, out.z, out.y). Після кінця таблиці — остання точка. */
  at(t, out) {
    const f = t / this.dt, i = Math.min(this.len - 1, Math.floor(f)), j = Math.min(this.len - 1, i + 1), u = Math.min(1, f - i);
    out.x = this.x[i] + (this.x[j] - this.x[i]) * u; out.z = this.z[i] + (this.z[j] - this.z[i]) * u; out.y = this.y[i] + (this.y[j] - this.y[i]) * u;
    return out;
  }

  /** Коли й де м'яч перетне лінію x = lx (рухаючись у бік dir = ±1). out.t = −1 — не перетне за горизонт прогнозу. */
  cross(lx, dir, out) {
    for (let i = 1; i < this.len; i++) {
      const a = (this.x[i - 1] - lx) * dir, c = (this.x[i] - lx) * dir;
      if (a < 0 && c >= 0) {
        const u = a / (a - c);
        out.t = (i - 1 + u) * this.dt; out.z = this.z[i - 1] + (this.z[i] - this.z[i - 1]) * u; out.y = this.y[i - 1] + (this.y[i] - this.y[i - 1]) * u;
        return out;
      }
    }
    out.t = -1; return out;
  }
}
