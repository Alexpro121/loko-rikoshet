import * as THREE from 'three';

/**
 * Хода, керована фізикою й рівновагою, а не програвання готової анімації.
 *
 * 1. Стопи стоять у світі. Опорна стопа прикріплена до точки газону до відриву: на поворотах, гальмуванні,
 *    розворотах на місці кроки складаються самі, стопа не ковзає.
 * 2. Ритм — як у людини (спинномозковий генератор кроку): каденс і час опори залежно від швидкості з виміряних даних,
 *    масштабовані за довжиною ноги (частоти ∝ √(g/L)). Каденс 2.8 кроку/с при 3.5 м/с → 4.5 при 10; опора ≈ 0.9/v с.
 * 3. Куди ставити ногу, вирішує регулятор рівноваги: нейтральна точка Райберта (v·Tоп/2) із поправкою перевернутого
 *    маятника −(h/g)·a. Гальмування → стопа далеко попереду і таз опускається на ній; розгін → під тілом;
 *    поворот → стопа назовні, тіло нахиляється всередину. Стоячи — крок, коли точка захоплення (x + v/ω₀) виходить
 *    з опори, стопа далеко від стегна або закрутилась відносно корпусу. Зупинка з бігу — «закриваючий» крок під тіло.
 * 4. Висота таза — з реальної геометрії опорної ноги (стегно над стопою на відстані d: √(L² − d²)) з амортизацією
 *    коліна в опорі; у польоті — балістична дуга g·t²/2 між відривом і приземленням.
 * 4а. Рух боком — приставний крок: першою ступає нога з боку руху, друга приставляється до неї на ширину стійки й
 *    ніколи її не переходить; без фази польоту, коліна м'якші, стопи ледь відриваються.
 * 4б. Ключові пози поверх фізики (як у стилізованих іграх: кілька поз + фаза кроку): махова нога проходить чіткі пози —
 *    відрив (стегно позаду) → прохід (п'ята високо під сідницею, коліно веде вперед) → перед контактом (гомілка
 *    викидається вперед і трохи «загрібає» назад). Опорна нога лишається на фізиці й IK, стопа не ковзає. Руки махають
 *    ширше й з чітким ліктем ~90°, тулуб на приземленні ледь стискається, на відштовхуванні — витягується.
 * 4в. Задній хід (бекпедал, до ~4 м/с): короткі часті кроки без польоту, стопа стає на передню частину й перекочується
 *    на п'ятку, коліна м'якші, тулуб трохи вперед (центр мас над носками), руки махають менше. Швидше — гравець
 *    розвертає таз і біжить (це вирішує корпус у player.js), тож хода бачить звичайний біг.
 * 5. Нахил тіла — кут сили реакції опори atan(a / (g + aᵥ)) уперед-назад і вбік. Тулуб, руки, таз і голова — затухаючі
 *    осцилятори з інерцією: руки гасять кутовий момент ніг і на різкій зупинці летять уперед, тулуб «клює» на
 *    приземленні, голова стабілізує погляд.
 */

const G = 9.8, DEG = Math.PI / 180;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const minJerk = (u) => u * u * u * (10 - 15 * u + 6 * u * u);     // траєкторія мінімального ривка: старт і фініш без швидкості
const mod1 = (x) => x - Math.floor(x);
const angDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };

/** Виміряні показники бігу й ходи людини (нога ~0.93 м), v у м/с. */
export const HUMAN = {
  legRef: 0.93,
  runCadence: (v) => { v = Math.max(v, 2); return 2.55 + 0.03 * v + 0.017 * v * v; },   // кроків/с
  walkCadence: (v) => 1.45 + 0.35 * v,                                                     // ~115 кроків/хв при 1.4 м/с
  runContact: (v) => clamp(0.9 / Math.max(v, 1), 0.095, 0.4),                            // с
  walkDuty: (v) => clamp(0.64 - 0.03 * v, 0.56, 0.64),                                    // частка опори в циклі ходи
  kneeComp: [0.11, 0.075],                                                                  // присід під навантаженням опори: центр мас опускається на ~5–7 см підтюпцем, ~4 см на спринті
};

/** Затухаючий осцилятор: ω — власна частота, ζ — загасання (<1 — з легким коливанням); push — зовнішнє прискорення. */
function osc(o, target, w, z, dt, push = 0) {
  const n = Math.max(1, Math.ceil(dt * w / 0.3)), h = dt / n;
  for (let i = 0; i < n; i++) { o.v += (w * w * (target - o.a) - 2 * z * w * o.v + push) * h; o.a += o.v * h; }
  return o.a;
}

const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3();

export class Gait {
  /** R: розміри ноги моделі { THIGH, SHIN, YA, HIP_X } в одиницях моделі (до масштабу). */
  constructor(R) {
    this.R = R; this.LEG = R.THIGH + R.SHIN;
    this.feet = [-1, 1].map((side, i) => ({ side, off: i * 0.5, st: 'stance', x: 0, z: 0, yaw: 0, yaw0: 0, sx: 0, sz: 0, t: 0, T: 0.35, ul: 0, u: 0,
      timed: true, clear: 0, age: 1, psi: 0, psi0: 0, h: 0, tdT: 0 }));
    this.ready = false; this.cycling = false; this.phi = 0; this.running = false;
    this.y = 0; this.vy = 0; this.ay = 0; this.ayS = 0; this.time = 0; this.yLO = 0; this.tLO = 0;
    this.pitch = { a: 0, v: 0 }; this.roll = { a: 0, v: 0 }; this.trunk = { a: 0, v: 0 }; this.yOff = 0;
    this.arms = [{ a: 0, v: 0 }, { a: 0, v: 0 }]; this.elb = [{ a: 0.3, v: 0 }, { a: 0.3, v: 0 }];
    this.squash = { a: 0, v: 0 };
    this.pelY = { a: 0, v: 0 }; this.pelZ = { a: 0, v: 0 }; this.pelX = { a: 0, v: 0 }; this.chestY = { a: 0, v: 0 }; this.head = { a: 0, v: 0 }; this.headZ = { a: 0, v: 0 }; this.ayV = 0; this.shX = { a: 0, v: 0 }; this.surV = 0; this.surX = 0;
    this._hp = { lk: 0, wd: 0, rx: 1, rz: 0, fx: 0, fz: 1, x: 0, z: 0 }; this.hx = 0; this.hz = 0; this._errs = new Float64Array(2);
    this.steps = 0; this.stepT = 0.33; this.lastTD = 0; this.events = []; this.contacts = 0;
    this.out = { legA: 0, legB: 0, kneeA: 0, kneeB: 0, ankA: 0, ankB: 0, abdA: 0, abdB: 0, twA: 0, twB: 0, hip: 0, shX: 0, surX: 0, pitch: 0, roll: 0, pelX: 0, pelY: 0, pelZ: 0,
      armA: 0, armB: 0, elbA: 0.3, elbB: 0.3, armTwA: 0, armTwB: 0, spread: 0.07, leanX: 0, leanY: 0, leanZ: 0, hdX: 0, hdY: 0, hdZ: 0 };
    this.stats = { cadence: 0, step: 0, contact: 0, flight: 0, lean: 0, body: 0, state: 'стоїть' };
  }

  /** Стопи під стегнами (або там, де вони зараз), таз у рівновазі — на старті, після телепорту чи скриптової дії. */
  reset(st, feetWorld, hipY) {
    const s = st.scale, cy = Math.cos(st.yaw), sy = Math.sin(st.yaw);
    for (const f of this.feet) {
      const w = feetWorld && feetWorld[f.side < 0 ? 0 : 1];
      f.x = w ? w.x : st.x + cy * f.side * this.R.HIP_X * s; f.z = w ? w.z : st.z - sy * f.side * this.R.HIP_X * s;
      const air = w ? Math.max(0, w.y - this.R.YA * s) : 0;
      f.yaw = f.yaw0 = st.yaw; f.age = 1; f.psi = 0; f.timed = true;
      if (air > 0.05) { f.st = 'swing'; f.sx = f.x; f.sz = f.z; f.t = 0; f.T = 0.25; f.clear = air; f.h = air; f.u = 0; } else { f.st = 'stance'; f.h = 0; }
    }
    this.cycling = false; this.yS = undefined;
    if (!this.ready) { this.y = (this.R.YA + this.LEG * 0.975) * st.scale; this.vy = 0; }
    else if (hipY !== undefined) { this.y = hipY; this.vy = 0; this.yOff = 0; this.nSt = -1; }   // nSt = -1: перший кадр збереже неперервність висоти   // таз — там, де він зараз (після падіння чи дії)
    this.ready = true;
  }

  /**
   * st: { x, z, vx, vz, yaw (курс корпусу), yawT (куди гравець хоче розвернутись), scale, aLong, aLat (прискорення в системі тіла),
   * crouch 0..1, wide (м), dribble }
   * Повертає кути суглобів і пози (this.out).
   */
  update(st, dt) {
    const R = this.R, s = st.scale, Lw = this.LEG * s, YAw = R.YA * s, out = this.out;
    if (dt <= 0) return out;
    this.time += dt;
    const yaw = st.yaw, cy = Math.cos(yaw), sy = Math.sin(yaw), yawT = st.yawT ?? yaw;
    const fx = sy, fz = cy, rx = cy, rz = -sy;                               // вперед і вправо у світі
    const v = Math.hypot(st.vx, st.vz);
    const ax = fx * st.aLong + rx * st.aLat, az = fz * st.aLong + rz * st.aLat;   // прискорення центру мас у світі
    if (!this.ready) this.reset(st);
    for (const f of this.feet) if (Math.hypot(f.x - st.x, f.z - st.z) > 2.2 * Lw) { this.reset(st); break; }   // телепорт

    // ---- режим і ритм
    // боком (швидкість переважно поперек погляду) — приставний крок, а не біг навхрест
    const vf = st.vx * fx + st.vz * fz, vl = st.vx * rx + st.vz * rz;
    // режим вирішуємо за тим, куди таз РОЗВЕРТАЄТЬСЯ (yawT), а не де він зараз: коли гравець на розгоні відкриває стегна в бік
    // руху, хода одразу переходить у біг, а не тягне приставний чи задній хід, поки корпус доверне (тоді таз «провалювався»)
    const cT = Math.cos(yawT), sT = Math.sin(yawT), vfT = st.vx * sT + st.vz * cT, vlT = st.vx * cT - st.vz * sT;
    this.shuffle = v > 0.3 && v < (this.shuffle ? 3.0 : 2.6) && Math.abs(vl) > (this.shuffle ? 0.9 : 1.2) * Math.abs(vf) && Math.abs(vlT) > 0.9 * Math.abs(vfT);   // швидше ~3 м/с приставним не біжать — таз відкривається (player.js)
    const sDir = Math.sign(vl) || 1;                                          // куди крок: +1 — праворуч
    // задній хід: рух переважно назад відносно погляду, не швидко
    this.back = !this.shuffle && v > 0.3 && v < (this.back ? 4.4 : 4.0) && vf < -(this.back ? 0.7 : 0.9) * Math.abs(vl) && vfT < -0.7 * Math.abs(vlT);
    this.running = !this.shuffle && !this.back && v > (this.running ? 1.9 : 2.4);
    const sp = clamp((v - 2.5) / 7, 0, 1), kL = Math.sqrt(HUMAN.legRef / Lw);
    // кроків/с; на розгоні ритм частішає (стартові кроки короткі й часті, як у спринтера з колодок)
    // приставний крок: пара кроків (ведуча + приставна) переносить тіло не далі ~0.42 ноги — швидше рух, частіші кроки
    // (2.6–5 кроків/с, як у воротаря на лінії); інакше ноги розходяться на метр, а таз падає
    const cad = (this.shuffle ? clamp(2 * v / (0.5 * Lw), 2.4, 4.4)
      : this.back ? Math.max(2.6, Math.min(3.8, v / (0.4 * Lw) * 0.5 + 1.9))   // назад — дрібно й часто
      : this.running ? HUMAN.runCadence(v) : HUMAN.walkCadence(v)) * kL * (1 + 0.035 * clamp(st.aLong, 0, 7))
      // свій темп кроку в кожного (довгоногий ступає рідше й ширше) і жива нерівність ритму від кроку до кроку —
      // двоє з однаковою швидкістю не йдуть «у ногу»
      * (st.cadK || 1) * (1 + 0.035 * Math.sin(this.time * 0.83 + (this.cph ??= Math.random() * 6.3)) + 0.02 * Math.sin(this.time * 2.1 + this.cph * 1.7));
    // перемикання ходи ↔ бігу ↔ приставного кроку — не стрибком: ваги режимів і темп кроків змінюються плавно
    this.runW = (this.runW ?? 0) + ((this.running ? 1 : 0) - (this.runW ?? 0)) * Math.min(1, dt * 4);
    this.shW = (this.shW ?? 0) + ((this.shuffle ? 1 : 0) - (this.shW ?? 0)) * Math.min(1, dt * 5);
    this.bkW = (this.bkW ?? 0) + ((this.back ? 1 : 0) - (this.bkW ?? 0)) * Math.min(1, dt * 5);
    this.cadS = this.cadS === undefined ? cad : this.cadS + (cad - this.cadS) * Math.min(1, dt * 6);
    const fStride = this.cadS / 2;
    const betaT = this.shuffle ? 0.62 : this.back ? 0.58 : this.running ? clamp(HUMAN.runContact(v) / kL * fStride, 0.18, 0.48) : HUMAN.walkDuty(v);
    this.beta = this.beta === undefined ? betaT : this.beta + clamp(betaT - this.beta, -1.5 * dt, 1.5 * dt);   // біг ↔ хода — плавно, без стрибка фаз
    const beta = this.beta;
    this.crouchS = (this.crouchS || 0) + ((this.shuffle ? 0.35 : this.back ? 0.3 : 0) - (this.crouchS || 0)) * Math.min(1, dt * 6);   // боком і назад — у напівприсіді
    const L0 = Lw * (0.985 - 0.1 * ((st.crouch || 0) + this.crouchS));
    const latK = 1 - 0.55 * clamp(v / 7, 0, 1);                              // на швидкості стопи ближче до середньої лінії
    // стегна — від таза, що зміщується над опорною ногою (вбік) і пульсує вперед-назад від сили опори
    // параметри стегон на цей кадр — для hip() (без замикань і масивів у кадрі)
    const hp = this._hp; hp.lk = R.HIP_X * latK * s; hp.wd = st.wide || 0; hp.rx = rx; hp.rz = rz; hp.fx = fx; hp.fz = fz; hp.x = st.x; hp.z = st.z;
    const mdx = v > 0.2 ? st.vx / v : fx, mdz = v > 0.2 ? st.vz / v : fz;
    const omega0 = Math.sqrt(G / Math.max(0.3, this.y));

    // старт циклу: першою відривається стопа, що далі позаду відносно руху
    if (!this.cycling && v > 0.3 && this.feet.every((f) => f.st === 'stance')) {
      const f0 = this.feet[0], f1 = this.feet[1];
      this.hip(f0.side); const b0 = (f0.x - this.hx) * mdx + (f0.z - this.hz) * mdz; this.hip(f1.side); const b1 = (f1.x - this.hx) * mdx + (f1.z - this.hz) * mdz;
      const first = this.shuffle ? (sDir > 0 ? 1 : 0) : b0 <= b1 ? 0 : 1, other = this.feet[1 - first];
      this.phi = mod1(other.off + 0.03);                                    // передня нога щойно стала — опора; задня у фазі маху й відірветься
      for (const f of this.feet) { f.ul = mod1(this.phi - f.off); f.timed = false; }
      this.cycling = true;
    }
    if (this.cycling) this.phi = mod1(this.phi + fStride * dt);

    // ---- відрив і приземлення за фазою ритму
    if (this.cycling) for (let i = 0; i < 2; i++) {
      const f = this.feet[i], o = this.feet[1 - i];
      const ul = mod1(this.phi - f.off), prev = f.ul, wrapped = ul < prev - 0.5; f.ul = ul;
      if (f.timed) continue;
      // при зупинці остання опорна нога лишається на траві, махова завершує «закриваючий» крок
      // рефлекс: опорна нога відстала далі, ніж дозволяє її довжина, — відривається зараз, а ритм синхронізується з цим кроком
      // «відстала» — коли нога вже розігнулась настільки, що далі тіло мусило б просісти більше, ніж на ~7% ноги в ході
      // (~8% у бігу): людина в цю мить відштовхується носком і відриває стопу, а не тягне її за собою, провалюючи таз
      this.hip(f.side); const hx = this.hx, hz = this.hz, lag = Math.hypot(f.x - hx, f.z - hz);
      const lagMax = L0 * Math.sqrt(0.98 - (0.99 - lerp(0.07, 0.08, this.runW)) ** 2);
      // і закрутка: опорна стопа повернута відносно корпусу більше ніж на ~43° (розворот) — переступає, а не скручує ногу
      const tw = f.st === 'stance' ? Math.abs(angDiff(f.yaw, yaw)) : 0;
      if (f.st === 'stance' && (lag > lagMax || tw > 0.75) && (o.st === 'stance' || o.u > 0.6 || this.runW > 0.5 || (v > 2.4 && tw > 0.75)) && f.age > 0.06) {   // на швидкості можна й у короткий політ
        this.phi = mod1(f.off + beta); f.ul = beta; o.ul = mod1(this.phi - o.off);
        this.liftOff(f, (1 - beta) / fStride, v, st, Lw); continue;
      }
      // відрив: фаза дійшла до кінця опори, або за ритмом нога вже мала б бути в маху, а друга її підстраховує
      if (f.st === 'stance' && ul >= beta && (prev < beta || o.st === 'stance') && !(v < 0.3 && o.st === 'stance')) this.liftOff(f, Math.max(0.14, (1 - ul) / fStride), v, st, Lw);
      else if (f.st === 'swing' && (f.t >= f.T || wrapped)) this.touchDown(f, o);
    }
    for (const f of this.feet) f.age += dt;
    if (this.cycling && v < 0.25 && this.feet.every((f) => f.st === 'stance')) { this.cycling = false; for (const f of this.feet) f.timed = true; }

    // ---- стоїть: кроки на місці, коли рівновага чи поворот корпусу цього вимагають
    if (!this.cycling) {
      const capX = st.x + st.vx / omega0, capZ = st.z + st.vz / omega0;     // точка захоплення
      if (this.feet.every((f) => f.st === 'stance')) {
        // розворот на місці: стопа, що найбільше «відстала» від нового курсу, переступає першою (крок-півот)
        const errs = this._errs;
        for (let k = 0; k < 2; k++) { const f = this.feet[k]; this.hip(f.side); errs[k] = Math.hypot(f.x - this.hx, f.z - this.hz) + 0.3 * Math.abs(angDiff(f.yaw, yawT)); }
        const capErr = Math.hypot(capX - (this.feet[0].x + this.feet[1].x) / 2, capZ - (this.feet[0].z + this.feet[1].z) / 2);
        const i = errs[0] >= errs[1] ? 0 : 1, f = this.feet[i];
        const need = Math.abs(angDiff(f.yaw, yawT)) > 0.3 || errs[i] > 0.22 * Lw / 0.94 || capErr > 0.2 * Lw / 0.94;
        if (need && f.age > 0.18 && this.feet[1 - i].age > 0.1) { this.liftOff(f, 0.26 * Math.sqrt(Lw / 0.94), v, st, Lw); f.timed = true; }
      }
      for (const f of this.feet) if (f.st === 'swing' && f.t >= f.T) this.touchDown(f, this.feet[f.side < 0 ? 1 : 0]);
    }

    // ---- мах: ціль за регулятором рівноваги, траєкторія мінімального ривка від точки відриву
    const hOverG = Math.max(0.3, this.y) / G, tSt = beta / fStride;
    for (const f of this.feet) {
      if (f.st !== 'swing') continue;
      f.t += dt;
      const u = Math.min(1, f.t / f.T);
      const rem = Math.max(0, (1 - u) * f.T);
      this.hip(f.side); const hx = this.hx, hz = this.hz;
      const px = hx + st.vx * rem + 0.5 * ax * rem * rem, pz = hz + st.vz * rem + 0.5 * az * rem * rem;   // де буде стегно при приземленні
      let ox = st.vx * tSt * 0.5 - hOverG * ax, oz = st.vz * tSt * 0.5 - hOverG * az;
      if (!this.cycling) { ox = st.vx / omega0; oz = st.vz / omega0; }      // крок на місці: під стегно + захоплення
      // межі, як у людини: уперед ≤ ~0.42 довжини ноги, назад ≤ 0.2; убік назовні ≤ 0.3, а всередину, під другу ногу, лише ≤ 0.08
      let fo = ox * mdx + oz * mdz, so = -ox * mdz + oz * mdx;
      fo = clamp(fo, -0.2 * Lw, 0.42 * Lw);
      const sOut = f.side * (-mdz * rx + mdx * rz) >= 0 ? 1 : -1;               // знак «назовні» для цієї ноги в осі so
      so = sOut > 0 ? clamp(so, -0.08 * Lw, 0.3 * Lw) : clamp(so, -0.3 * Lw, 0.08 * Lw);
      { const fs = Math.hypot(fo, so), fm = 0.45 * Lw; if (fs > fm) { fo *= fm / fs; so *= fm / fs; } }   // і разом (уперед + вбік) не далі ~0.45 ноги — інакше таз провалюється на приземленні
      let tx = px + fo * mdx - so * mdz, tz = pz + fo * mdz + so * mdx;
      // стопа стає на своєму боці від другої ноги: ноги не перехрещуються (на повороті внутрішня не заходить за зовнішню)
      {
        const o = this.feet[f.side < 0 ? 1 : 0], ox2 = o.st === 'swing' ? (o.tx ?? o.x) : o.x, oz2 = o.st === 'swing' ? (o.tz ?? o.z) : o.z;
        const gap = this.footGap(tx - ox2, tz - oz2, fx, fz, Lw), short = gap - f.side * ((tx - ox2) * rx + (tz - oz2) * rz);
        if (short > 0) { tx += rx * f.side * short; tz += rz * f.side * short; }
      }
      if (this.shuffle && this.cycling) {
        // приставний крок: ведуча нога (з боку руху) ступає назовні, друга стає поруч із нею на ширину стійки
        const o = this.feet[f.side < 0 ? 1 : 0], W = 1.9 * R.HIP_X * s + 0.6 * (st.wide || 0);   // приставлена — на ширину плечей (у воротаря трохи ширше)
        const lx = o.st === 'swing' ? (o.tx ?? o.x) : o.x, lz = o.st === 'swing' ? (o.tz ?? o.z) : o.z;
        const lat = (q, w) => (q - st.x) * rx + (w - st.z) * rz, fwd = (q, w) => (q - st.x) * fx + (w - st.z) * fz;
        const tl = lat(tx, tz), tf = clamp(fwd(tx, tz), -0.12 * Lw, 0.12 * Lw), ol = lat(lx, lz);
        let nl = tl;
        // ведуча — не ближче за стійку і так, щоб таз у середньому був над серединою між стопами (а не попереду, ніби ноги
        // «тягнуться» за тулубом)
        if (f.side === sDir) nl = Math.max(tl * sDir, ol * sDir + W, v * rem + 0.5 * W + 0.5 * v / fStride) * sDir;
        else nl = sDir * Math.min(tl * sDir, ol * sDir - W);                                         // приставна — не далі за ведучу
        tx = st.x + rx * nl + fx * tf; tz = st.z + rz * nl + fz * tf;
      }
      const m = minJerk(u);
      f.x = lerp(f.sx, tx, m); f.z = lerp(f.sz, tz, m); f.tx = tx; f.tz = tz;
      // у махові стопа обходить опорну ногу збоку, а не проходить крізь неї
      {
        const o = this.feet[f.side < 0 ? 1 : 0];
        {
          const gap = this.footGap(f.x - o.x, f.z - o.z, fx, fz, Lw), short = gap - f.side * ((f.x - o.x) * rx + (f.z - o.z) * rz);
          if (short > 0) { const k = short * smooth(clamp(short / (0.05 * Lw), 0, 1)); f.x += rx * f.side * k; f.z += rz * f.side * k; }
        }
      }
      // п'ята злітає плавно (пік на ~47% маху), у кінці стопа плавно сідає: u^1.8·(1−u)² — нульові швидкість і ривок на кінцях
      f.h = f.clear * Math.pow(u, 1.8) * (1 - u) * (1 - u) / 0.072;
      // нога не довша за себе: якщо тіло відлетіло від стопи, п'ята підтягується вгору (до сідниці) і до тіла
      {
        const Lmax = 0.96 * Lw, ddx = f.x - hx, ddz = f.z - hz, dh = Math.hypot(ddx, ddz);
        if (dh > Lmax * 0.97) { const k = Lmax * 0.97 / dh; f.x = hx + ddx * k; f.z = hz + ddz * k; }
        const dh2 = Math.min(dh, Lmax * 0.97), need = (this.y - YAw - this.liftOf(f.psi) * s) - Math.sqrt(Lmax * Lmax - dh2 * dh2);
        f.ex = (f.ex || 0) + (Math.max(0, need - f.h) - (f.ex || 0)) * Math.min(1, dt * 15); f.h += f.ex;   // підтягується плавно (~0.07 с), без ривка
      }
      // носок трохи назовні; стопа за крок повертається до нового курсу не більше ніж на ~50° на місці (півот)
      // і ~80° у бігу — так розворот іде кроками, а таз іде за стопами
      const fyT = f.yaw0 + clamp(angDiff(f.yaw0, yawT + f.side * 0.06), this.cycling ? -1.4 : -0.9, this.cycling ? 1.4 : 0.9);
      f.yaw = f.yaw0 + angDiff(f.yaw0, fyT) * m;
      f.psi = lerp(f.psi0, this.landPsi(sp), smooth(u));
      f.u = u;
    }

    // ---- кут стопи в опорі: перекат з п'ятки на носок — з того, де стопа відносно стегна
    for (const f of this.feet) {
      if (f.st !== 'stance') continue;
      this.hip(f.side); const hx = this.hx, hz = this.hz, fw = ((f.x - hx) * fx + (f.z - hz) * fz) / Lw;
      const push = lerp(this.cycling ? -0.45 : 0, -0.6, this.runW);
      const tgt = fw > 0 ? this.landPsi(sp) * smooth(clamp(fw / 0.25, 0, 1)) : push * smooth(clamp((-fw - 0.05) / 0.3, 0, 1));
      f.psi += (tgt - f.psi) * Math.min(1, dt * 25);
      f.h *= Math.exp(-dt * 35);                                             // стала, ще не торкнувшись (тіло задалеко): досідає за ~0.06 с
    }

    // ---- висота таза: опорна нога (геометрія + амортизація коліна) або балістичний політ
    // амортизація коліна: між ходою й бігом — плавно (інакше таз стрибав би на ~16 см у мить переходу)
    const comp = lerp(this.cycling ? 0.02 : 0.012 + 0.04 * (st.crouch || 0), lerp(HUMAN.kneeComp[0], HUMAN.kneeComp[1], sp), this.runW);
    let yG = Infinity;
    for (const f of this.feet) {
      if (f.st !== 'stance') continue;
      this.hip(f.side); const hx = this.hx, hz = this.hz, d = Math.hypot(f.x - hx, f.z - hz);
      const uSt = this.cycling && !f.timed ? clamp(mod1(this.phi - f.off) / beta, 0, 1) : 0.5;
      const eps = 0.99 - comp * Math.sin(Math.PI * uSt);
      yG = Math.min(yG, YAw + this.liftOf(f.psi) * s + Math.sqrt(Math.max(0.05 * Lw * Lw, eps * eps * L0 * L0 - d * d)));
    }
    if (yG !== Infinity) yG = Math.max(yG, YAw + 0.62 * L0);                 // глибше бігун не присідає навіть на старті
    if (yG === Infinity) {
      // політ: парабола g·t²/2 від висоти відриву до висоти, на яку приземлиться махова нога
      const tf = Math.max(0.05, (0.5 - beta) / fStride), uf = clamp((this.time - this.tLO) / tf, 0, 1);
      const next = this.feet[0].u >= this.feet[1].u ? this.feet[0] : this.feet[1];
      this.hip(next.side); const hx = this.hx, hz = this.hz, rem = Math.max(0, next.T - next.t);
      const dTD = Math.hypot((next.tx ?? next.x) - (hx + st.vx * rem), (next.tz ?? next.z) - (hz + st.vz * rem));   // де стопа стане відносно стегна в момент приземлення
      const yTD = YAw + this.liftOf(this.landPsi(sp)) * s + Math.sqrt(Math.max(0.05 * Lw * Lw, 0.99 * 0.99 * L0 * L0 - dTD * dTD));
      yG = lerp(this.yLO, yTD, uf) + 0.5 * G * tf * tf * uf * (1 - uf);
    }
    // змінилась опора (котра нога стоїть, а не лише скільки) — висота таза неперервна, різниця згасає за ~0.1 с
    const y0 = this.y, nSt = (this.feet[0].st === 'stance' ? 1 : 0) + (this.feet[1].st === 'stance' ? 2 : 0);
    if (nSt !== this.nSt && this.nSt !== undefined) this.yOff = y0 - yG;
    this.nSt = nSt;
    this.yOff = (this.yOff || 0) * Math.exp(-dt * 18);
    // таз — тіло з масою, а не точка на кінці ноги: іде за висотою, яку дає опора, пружно (~0.07 с), вниз не швидше
    // за вільне падіння, вгору — не більше ~2.5 ваги. Якщо опора «просить» різко вниз, нога на мить випрямляється
    // (стопа на носку, до ~2 см), а таз опускається плавно — так ходьба й біг без смикань угору-вниз
    {
      const yT = yG + this.yOff, tol = 0.02 * Lw, w = 30;
      if (this.yS === undefined) { this.yS = y0 || yT; this.yV = 0; }
      const n = Math.max(1, Math.ceil(dt / 0.004)), h = dt / n;
      for (let i = 0; i < n; i++) {
        const a = clamp(w * w * (yT - this.yS) - 2 * w * this.yV, -G, 2.5 * G);
        this.yV += a * h; this.yS += this.yV * h;
      }
      if (this.yS > yT + tol) { this.yS = yT + tol; this.yV = Math.min(this.yV, 0); }   // довше за ногу не буває
      this.y = this.yS;
    }
    const vy = (this.y - y0) / dt; this.ay = (vy - this.vy) / dt; this.vy = vy;
    this.ayS += (clamp(this.ay, -3 * G, 3 * G) - this.ayS) * Math.min(1, dt * 10);
    this.ayV += (clamp(this.ay, -1.2 * G, 3 * G) - this.ayV) * Math.min(1, dt * 30);   // вертикальне прискорення таза майже без згладження: удар приземлення

    // ---- горизонтальна сила опори (на кг маси). Кожен крок: на приземленні нога гальмує тіло (пік ~0.45 ваги в бігу,
    // ~0.6 на спринті), далі штовхає його вперед; імпульси рівні — тіло пульсує навколо середньої швидкості, а не відстає від
    // ніг. Розгін і гальмування в цілому (середня сила) вже дає нахил усього тіла (pitch з aLong) — тут їх не дублюємо,
    // інакше тулуб «відпливав» назад від ніг і перекидався на гальмуванні. У польоті горизонтальної сили немає.
    let aH = 0;
    if (this.cycling && v > 0.3) for (const f of this.feet) {
      if (f.st !== 'stance' || f.timed) continue;
      const uSt = clamp(mod1(this.phi - f.off) / beta, 0, 1), ub = this.running ? 0.45 : 0.5;
      let Fb = (this.running ? 0.45 + 0.15 * sp : this.shuffle ? 0.06 : 0.09) * G, Fp = Fb * ub / (1 - ub);   // площі синусоїд рівні
      aH += uSt < ub ? -Fb * Math.sin(Math.PI * uSt / ub) : Fp * Math.sin(Math.PI * (uSt - ub) / (1 - ub));
    }
    // перенесення ваги: центр мас зміщується до опорної стопи (у ході ~25% її бічного відступу, у бігу ~15%)
    let ml = 0, nS = 0;
    for (const f of this.feet) if (f.st === 'stance') { ml += (f.x - st.x) * rx + (f.z - st.z) * rz; nS++; }
    const shX = osc(this.shX, nS ? (ml / nS) * (this.running ? 0.15 : this.cycling ? 0.28 : 0.2) : 0, 11, 0.75, dt);
    // тіло рухається від цих сил відносно середньої швидкості (яку задає гра); у польоті швидкість стала. Пружина таза (~0.6 Гц)
    // тримає тулуб над ногами: пульсація ±1.5–2 см, без дрейфу вперед чи назад
    {
      const n = Math.max(1, Math.ceil(dt / 0.004)), h = dt / n;
      for (let i = 0; i < n; i++) { this.surV += (aH - 14 * this.surX - 3 * this.surV) * h; this.surX += this.surV * h; }
      this.surX = clamp(this.surX, -0.05 * Lw, 0.05 * Lw);
      if (!this.cycling) { this.surV *= Math.exp(-dt * 6); this.surX *= Math.exp(-dt * 6); }
    }

    // ---- нахил усього тіла з сили реакції опори
    const pitchT = clamp(Math.atan2(st.aLong, G + this.ayS), -0.35, 0.5);
    const rollT = clamp(-Math.atan2(st.aLat, G), -0.45, 0.45);
    const pitch = osc(this.pitch, 0.6 * pitchT, 6, 0.85, dt);               // нахил наростає за ~0.4 с, без ривка
    const roll = osc(this.roll, rollT, 5, 0.85, dt);
    // тулуб — перевернутий маятник на тазі (центр мас ~0.35 м над стегнами): м'язи тримають робочий нахил
    // (6° підтюпцем → 15° на спринті), а прискорення таза його розгойдують: θ'' = (aᵥ·sinθ − aₓ·cosθ) / l.
    // Приземлення (гальмування + удар знизу) — тулуб «клює» вперед; поштовх — випрямляється.
    // приставний і задній хід: тулуб майже прямо над тазом (≈5°), а не «тягнеться» вперед
    const trunkT = (this.running ? (6 + 9 * sp) * DEG : this.cycling ? 3 * DEG : 1.5 * DEG) + 0.15 * pitchT + (st.dribble ? 0.08 : 0) + 0.08 * (this.crouchS || 0) + 0.02 * (this.bkW || 0);
    const lT = 0.35 * s / 0.82, th = this.trunk.a + pitch;
    // + реактивний момент розгиначів стегна: опорна нога з силою йде назад — тулуб отримує поштовх уперед (пропорційно тій самій силі опори)
    const hipReact = 0.5 * (-aH) / lT;
    // + удар опори (у бігу вертикальне навантаження 2–3 ваги тіла): хребет під ним згинається вперед — «присід» тулуба
    const load = 0.45 * Math.max(0, this.ayV) / lT;
    // спина — не жорсткий стрижень: у бігу м'язи-розгиначі пропускають удар сильніше (коеф. 2.2), у ході — тримають корпус
    const kSp = lerp(1, 1.4, this.runW);                                     // спина пропускає удар опори помірно, без розгойдування
    // м'язи спини «налаштовані» на темп: власна частота тулуба ~0.75 від частоти кроків — однаковий відгук на будь-якій швидкості
    const wT = this.cycling ? Math.max(8, 0.75 * 2 * Math.PI * cad) : 10;
    // тулуб іде за кроком (сили опори), але майже критично загасає — не «теліпається» сам по собі між кроками
    const trunk = osc(this.trunk, trunkT, wT, 0.75, dt, kSp * ((this.ayV * Math.sin(th) - aH * Math.cos(th)) / lT + hipReact + load - (this.running ? 0.45 * G * 0.5 / lT : 0)));
    // таз: поворот за ногою, що попереду (±4–6°), перекіс на боці махової ноги (±4–6°), нахил уперед, коли опорне стегно розгинається (~5°)
    const fl = this.feet[0], fr = this.feet[1];
    const zl = ((fl.x - st.x) * fx + (fl.z - st.z) * fz), zr = ((fr.x - st.x) * fx + (fr.z - st.z) * fz);
    const pelY = osc(this.pelY, clamp(0.11 * (zl - zr) / Lw, -0.09, 0.09), 26, 0.85, dt);   // таз встигає за кожним кроком
    const pelZ = osc(this.pelZ, lerp(0.05, 0.09, this.runW) * ((fl.st === 'swing' ? 1 : 0) - (fr.st === 'swing' ? 1 : 0)), 14, 0.85, dt);
    let ext = 0; for (const f of this.feet) if (f.st === 'stance') ext = Math.max(ext, -(((f.x - st.x) * fx + (f.z - st.z) * fz) / Lw));
    const pelX = osc(this.pelX, (this.cycling ? 0.22 : 0) * clamp(ext, -0.3, 0.6), 12, 0.85, dt);

    // ---- ноги: 3D-IK від стегна до щиколотки (відведення, згин стегна, коліно, кут і поворот стопи)
    const yModel = this.y / s;
    _q1.setFromEuler(_e.set(pitch, 0, roll, 'ZXY'));
    _q2.setFromEuler(_e.set(pelX, pelY, pelZ, 'ZYX'));
    _q1.multiply(_q2).invert();
    const ik = { hip: 0, knee: 0 };
    for (let i = 0; i < 2; i++) {
      const f = this.feet[i], wx = f.x - st.x, wz = f.z - st.z;
      _v.set((wx * cy - wz * sy - shX) / s, (YAw + this.liftOf(f.psi) * s + f.h) / s - yModel, (wx * sy + wz * cy - this.surX) / s).applyQuaternion(_q1);   // світ → тіло → таз (зі зміщенням)
      _v.x -= f.side * R.HIP_X;
      const abd = Math.atan2(_v.x, -_v.y), down = Math.hypot(_v.x, _v.y) * Math.sign(-_v.y || 1);
      this.legIK(_v.z, down, ik);
      // поворот стопи відносно таза — у межах кульшового суглоба: носок назовні до ~40°, усередину лише до ~25°
      const tw0 = angDiff(yaw + pelY, f.yaw), ank = -f.psi - pitch + ik.hip - ik.knee, tw = f.side * clamp(f.side * tw0, -0.42, 0.7);
      let hip = ik.hip, knee = ik.knee, an = ank;
      // ключові пози махової ноги поверх IK: вага — посередині маху, на відриві й перед контактом нуль (стопа точно туди, куди
      // поставив регулятор рівноваги). Прохід: п'ята високо, коліно попереду; перед контактом — гомілка вперед і назад-«загріб»
      if (f.st === 'swing' && this.cycling && this.shW + this.bkW < 0.99) {
        const rw = this.runW, u = f.u, run = lerp(0.35, 1, rw) * (1 - this.shW) * (1 - this.bkW), kMax = lerp(1.05, 1.35 + 0.85 * sp, rw);
        const hMax = lerp(0.45, 0.75 + 0.35 * sp, rw);
        const kK = u < 0.45 ? lerp(0.5, kMax, smooth(u / 0.45)) : lerp(kMax, 0.3, smooth((u - 0.45) / 0.45));
        const kH = u < 0.7 ? lerp(-0.35, hMax, smooth(u / 0.7)) : lerp(hMax, hMax * 0.75, smooth((u - 0.7) / 0.3));
        const sw = Math.sin(Math.PI * Math.min(1, u / 0.85)), w = 0.6 * run * sw * sw;   // до постановки поза вже згасла
        hip = lerp(hip, kH, w); knee = lerp(knee, kK, w);
        an = -f.psi - pitch + hip - knee + 0.35 * w;                            // носок у маху трохи витягнутий
      }
      if (i === 0) { out.legA = hip; out.kneeA = knee; out.ankA = an; out.abdA = abd; out.twA = tw; }
      else { out.legB = hip; out.kneeB = knee; out.ankB = an; out.abdB = abd; out.twB = tw; }
    }

    // ---- руки: маятники з плеча, що гасять кутовий момент ніг; прискорення таза їх розгойдує (гальмування — вперед),
    // удар приземлення опускає передпліччя; лікоть 70–110°, на замаху назад розкривається
    // мах плеча проти стегна. Стегно вперед згинається сильно (до ~60°), а назад розгинається мало (~20°),
    // тож рука дзеркалить це асиметрично: уперед ~35° → 60° на спринті, назад ~25° → 45°
    const AS = st.arms || { amp: 1, elb: 0, cross: 0.2, ph: 0 };
    // для кубічних моделей мах ширший за людський (~×1.3) — силует читається й здалеку
    const rw = this.runW, walkK = this.cycling ? 0.55 : 0.1;
    const kap = 1.3 * lerp(walkK, 1 + 0.3 * sp, rw) * AS.amp * (1 - 0.45 * (this.bkW || 0)), mv = clamp(v / 3, 0, 1);   // назад руки працюють менше
    const fwdMax = 1.25 * lerp(20, 35 + 25 * sp, rw) * DEG, backMax = 1.25 * lerp(15, 25 + 20 * sp, rw) * DEG;
    const armOf = (lp) => clamp((lp < 0 ? -lp * 1.7 : -lp * 0.6) * kap, -backMax, fwdMax);
    const legP = [out.legA, out.legB], legM = (out.legA + out.legB) / 2;
    // у ході рука — маятник проти ноги навколо середнього положення ніг: рівно вперед і назад (~±20°), а не «волочиться» позаду
    const armWalk = (i) => clamp(-(legP[i] - legM) * 1.25 * AS.amp * (this.cycling ? 1 : 0.2), -backMax, fwdMax);
    for (let i = 0; i < 2; i++) {
      // жива мінливість: кожен мах трохи інший (повільні коливання амплітуди й ліктя, різні для кожної руки)
      const nz = 0.035 * Math.sin(this.time * 1.7 + AS.ph + i * 2.1) + 0.02 * Math.sin(this.time * 3.3 + AS.ph * 1.7 + i);
      const a = osc(this.arms[i], 0.06 + lerp(armWalk(i), armOf(legP[i]), rw) * (1 + nz * 2) + nz * mv, 10 + 3 * sp, 0.42, dt, -3 * st.aLong - aH / 0.45);
      // лікоть тримає чіткий прямий кут у бігу (~90°), уперед ще згинається, назад ледь розкривається
      // у ході рука розслаблена: лікоть лише ледь зігнутий (~20–30°), а не «марширує» під прямим кутом, як у бігу
      osc(this.elb[i], lerp(0.3, lerp(0.48, 1.6, rw), mv) + AS.elb * mv * (0.4 + 0.6 * rw) + 0.15 * sp + (0.1 + 0.2 * rw) * Math.max(0, a) - 0.15 * Math.max(0, -a) + nz, lerp(9, 14, rw), 0.5, dt, -this.ayV * 0.25);
    }
    // рука, що йде вперед, заходить до середньої лінії й повертається всередину; позаду — трохи відходить убік
    const armRot = (a) => (0.1 + 0.2 * sp) * mv + AS.cross * 1.2 * Math.max(0, a) * mv;
    const armAbd = (a) => (0.1 * Math.max(0, -a) - AS.cross * 0.35 * Math.max(0, a)) * mv;
    // грудна клітка крутиться назустріч тазу і сильніше за нього (±12° проти ±5°): її тягнуть руки
    // груди крутяться назустріч тазу (≈1.5–2× його кута, як у людини: ±5° у ході, ±8–10° у бігу) — жорстко зв'язано з кроком
    const chestY = osc(this.chestY, -lerp(1.6, 2.2, this.runW) * pelY + 0.08 * (this.arms[1].a - this.arms[0].a), 24, 0.85, dt);
    // голова: тримає погляд (компенсує нахил тіла й тулуба), а на вертикальних поштовхах ледь киває й повертається (шия — пружина)
    const hd = osc(this.head, -(pitch + trunk) * 0.8, 13, 0.75, dt, (this.ayV * 0.25 - aH * 0.4) / 0.25);
    const hdZ = osc(this.headZ, -roll * 0.7, 12, 0.85, dt);
    // тулуб на приземленні ледь стискається (до ~6% висоти), у польоті трохи витягується — відчуття ваги на кубах
    const flight = this.cycling && this.feet.every((f) => f.st === 'swing');
    const sqT = this.cycling ? clamp((this.ayV - 0.15 * G) / (1.3 * G), 0, 1) * 0.07 - (flight ? 0.025 : 0) : 0;
    const squash = osc(this.squash, sqT, 20, 0.55, dt);

    Object.assign(out, {
      hip: yModel, shX: shX / s, surX: this.surX / s, pitch, roll, pelX, pelY, pelZ, squash,
      armA: this.arms[0].a, armB: this.arms[1].a, elbA: this.elb[0].a, elbB: this.elb[1].a,
      armTwA: armRot(this.arms[0].a), armTwB: armRot(this.arms[1].a), sdA: armAbd(this.arms[0].a), sdB: armAbd(this.arms[1].a),
      spread: 0.06 + 0.05 * sp + Math.abs(roll) * 0.4 + 0.22 * this.crouchS,
      leanX: trunk, leanY: chestY, leanZ: -roll * 0.35 - pelZ * 0.6,
      hdX: hd, hdY: -chestY * 0.6, hdZ,
    });
    this.measure(pitch + trunk, pitch);
    return out;
  }

  /** Стегно з боку side (−1 ліве, +1 праве) у світі → this.hx, this.hz: таз зсунутий над опорою (вбік) і пульсує вперед-назад. */
  hip(side) {
    const h = this._hp, l = h.lk * side + h.wd * side + this.shX.a;
    this.hx = h.x + h.rx * l + h.fx * this.surX; this.hz = h.z + h.rz * l + h.fz * this.surX;
  }

  /** Відрив стопи: мах триває T секунд; висота п'яти в махові росте зі швидкістю (на спринті п'ята б'є в сідницю). */
  liftOff(f, T, v, st, Lw) {
    if (f.tdT) this.contacts = lerp(this.contacts || f.age, f.age, 0.3);
    f.st = 'swing'; f.sx = f.x; f.sz = f.z; f.t = 0; f.T = T; f.u = 0; f.yaw0 = f.yaw; f.psi0 = f.psi;
    f.clear = (this.shuffle ? 0.045 : this.back ? 0.05 : this.running ? 0.05 + 0.05 * v : this.cycling ? 0.07 : 0.06) * (Lw / 0.94) * (st.dribble ? 0.7 : 1);
    if (this.feet.every((q) => q.st === 'swing')) { this.yLO = this.y; this.tLO = this.time; }   // початок польоту
  }

  touchDown(f, o) {
    f.st = 'stance'; f.age = 0; f.tdT = this.time; f.u = 0;              // висоту не обнуляємо — стопа досідає на траву (нижче)
    if (this.lastTD) this.stepT = lerp(this.stepT, clamp(this.time - this.lastTD, 0.12, 1), 0.4);
    this.steps++; this.lastTD = this.time;
    const ev = this.events.length >= 12 ? this.events.shift() : { t: 0, x: 0, z: 0, side: 0, flight: false };   // подію перевикористовуємо
    ev.t = this.time; ev.x = f.x; ev.z = f.z; ev.side = f.side; ev.flight = o.st === 'swing'; this.events.push(ev);
  }

  /**
   * Мінімальний бічний проміжок між стопами (м): поруч одна з одною — на ширину стопи з запасом, а коли одна далеко
   * попереду іншої — менший (у бігу стопи майже на одній лінії, але не навхрест).
   */
  footGap(dx, dz, fx, fz, Lw) {
    const lon = Math.abs(dx * fx + dz * fz);
    return Lw * lerp(0.14, 0.04, smooth(clamp((lon - 0.15 * Lw) / (0.3 * Lw), 0, 1)));
  }

  /** Як стопа ставиться: підтюпцем — на п'ятку, на спринті — на передню частину стопи; у ході — на п'ятку. */
  landPsi(sp) {
    const fw = lerp(this.cycling ? 0.25 : 0, lerp(0.22, -0.1, sp), this.runW ?? (this.running ? 1 : 0));
    return lerp(fw, -0.2, this.bkW || 0);                                   // назад — на передню частину стопи
  }

  /** Фаза кроку (+π за кожен крок) — для подій у такт ногам (підбивання м'яча під час ведення). */
  get phaseAngle() { return Math.PI * (this.steps + clamp((this.time - this.lastTD) / this.stepT, 0, 1)); }

  /** Підйом щиколотки, коли стопа перекочується на п'ятку (psi > 0) або носок (psi < 0), в одиницях моделі. */
  liftOf(psi) { const YA = this.R.YA; return YA * Math.cos(psi) + (psi > 0 ? 0.09 * Math.sin(psi) : -0.2 * Math.sin(psi)) - YA; }

  /** Дволанкова IK у площині ноги: x — уперед, y — униз. hip — згин стегна (уперед +), knee — згин коліна. */
  legIK(x, y, out) {
    const { THIGH, SHIN } = this.R;
    let d = Math.hypot(x, y);
    const dmax = (THIGH + SHIN) * 0.998, dmin = 0.2;
    if (d > dmax) { x *= dmax / d; y *= dmax / d; d = dmax; } else if (d < dmin) d = dmin;
    const cosK = (THIGH * THIGH + SHIN * SHIN - d * d) / (2 * THIGH * SHIN), cosH = (THIGH * THIGH + d * d - SHIN * SHIN) / (2 * THIGH * d);
    out.knee = Math.PI - Math.acos(clamp(cosK, -1, 1));
    out.hip = Math.atan2(x, y) + Math.acos(clamp(cosH, -1, 1));
    return out;
  }

  /** Виміряні з подій кроку показники: каденс, довжина кроку, час опори, частка кроків із польотом. */
  measure(lean, body) {
    const e = this.events, S = this.stats;
    S.lean = lean / DEG; S.body = body / DEG;
    S.state = this.shuffle ? 'приставний крок' : this.back ? 'задній хід' : this.running ? 'біг' : this.cycling ? 'хода' : 'стоїть';
    if (e.length >= 4 && this.time - e[e.length - 1].t < 1) {
      const k = Math.min(6, e.length - 1), a = e[e.length - 1 - k], b = e[e.length - 1];
      S.cadence = (k / Math.max(1e-3, b.t - a.t)) * 60;
      let len = 0; for (let i = e.length - k; i < e.length; i++) len += Math.hypot(e[i].x - e[i - 1].x, e[i].z - e[i - 1].z);
      S.step = len / k; let fl = 0; for (let i = e.length - k; i < e.length; i++) if (e[i].flight) fl++; S.flight = fl / k; S.contact = this.contacts;
    } else if (this.time - (e.length ? e[e.length - 1].t : 0) > 1) { S.cadence = 0; S.step = 0; }
  }
}
