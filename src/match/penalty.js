import * as THREE from 'three';
import { PITCH } from '../config.js';
import { audio } from '../core/audio.js';
import { ovr } from '../state/squad.js';

const { L, G, R } = PITCH;
const H = PITCH.GOAL_H, SPOT = 12, RUN = 3.6;     // висота воріт, відстань крапки до лінії, розбіг
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 0.9;
const _v = new THREE.Vector3(), _d = new THREE.Vector3();
const GRAV = 26;
const easeOut = (q, p = 2.2) => 1 - Math.pow(1 - clamp(q, 0, 1), p);

/**
 * Серія пенальті у стилі «кіно-футболу»: розбіг, удар, сповільнення під час польоту, безперервний політ м'яча й стрибок воротаря.
 * Три незалежні процеси: виконавець, м'яч і воротар. Кожен триває до природного кінця, незалежно від результату.
 * Удар: ти ставиш кружечок у ворота. Захист: ти ставиш кружечок, куди стрибає воротар.
 */
export class Penalties {
  constructor(m) { this.m = m; this.ts = 1; }

  start() {
    const m = this.m, ui = m.ui;
    document.querySelectorAll('#pen').forEach((e) => e.remove());
    m.phase = 'pens'; m.ts = 1; m.slow = false; m.slowT = 0; if (ui.setSlow) ui.setSlow(false); m.cancelAim();
    ui.setMatchUi(false); ui.hud.setTime('90+', false, 'Пенальті'); ui.hud.warn(null); ui.hud.hint(null); ui.hud.setCard(null);
    this.k = 0; this.res = { me: [], opp: [] }; this.state = 'wait'; this.t = -1.6; this.mark = null; this.by = 0; this.bvy = 0; this.over = false; this.ts = 1; this.live = false;
    const order = (arr) => arr.slice(1).sort((x, y) => ovr(y.info) - ovr(x.info));
    this.orderMe = order(m.mine); this.orderOpp = order(m.opp);
    [...m.mine, ...m.opp].forEach((a, n) => { a.body.on = false; a.p.setMode('idle'); a.p.vx = a.p.vz = 0; a.p.dribble = false; a.p.x = (a.side > 0 ? -1 : 1) * (4 + (n % 5) * 1.6); a.p.z = -7 + (n % 11) * 1.4; a.p.yaw = a.side > 0 ? 1.2 : -1.2; });
    this.build();
    ui.hud.banner('ПЕНАЛЬТІ', 'серія з п’яти ударів', 'ти б’єш і ловиш: став кружечок у ворота');
    audio.whistle(false);
  }

  build() {
    const root = this.m.ui.root, el = document.createElement('section');
    el.className = 'pen'; el.id = 'pen';
    el.innerHTML = `<div class="pen-top"><div class="pen-row"><b>ЛОКО</b><span class="pd me"></span></div><div class="pen-row"><b>${this.m.spec.club.name}</b><span class="pd opp"></span></div></div>
      <div class="pen-msg" id="pen-msg"></div><div class="pen-hit" id="pen-hit"></div><i class="pen-mark" id="pen-mark" hidden></i>
      <div class="pen-move" id="pen-move" hidden><button type="button" data-d="-1" aria-label="Воротар ліворуч">◀</button><button type="button" data-d="1" aria-label="Воротар праворуч">▶</button></div>
      <button class="pen-go big go" id="pen-go" disabled><b>УДАР!</b></button>`;
    root.appendChild(el);
    this.el = el; this.msg = el.querySelector('#pen-msg'); this.markEl = el.querySelector('#pen-mark'); this.go = el.querySelector('#pen-go');
    const hit = el.querySelector('#pen-hit');
    hit.addEventListener('pointerdown', (e) => {
      // точку стрибка можна переставити й під час розбігу — поки воротар ще не рушив
      const keep = this.state === 'live' && !this.me && !this.gkGo;
      if (this.state !== 'aim' && !keep) return;
      this.setMark(e.clientX, e.clientY);
      if (keep && this.mark) this.dive = { z: clamp(this.mark.z, -G, G), y: clamp(this.mark.y, 0.3, H) };
      e.preventDefault();
    });
    // рух воротаря вздовж лінії: стрілки / A·D на клавіатурі або кнопки ◀ ▶ (утримувати)
    this.move = { l: 0, r: 0, v: 0 };
    this.moveEl = el.querySelector('#pen-move');
    for (const b of this.moveEl.querySelectorAll('button')) {
      const k = b.dataset.d < 0 ? 'l' : 'r', on = (v) => (e) => { this.move[k] = v; e.preventDefault(); };
      b.addEventListener('pointerdown', on(1)); b.addEventListener('pointerup', on(0)); b.addEventListener('pointerleave', on(0)); b.addEventListener('pointercancel', on(0));
    }
    const key = (v) => (e) => {
      if (!this.el.isConnected) { removeEventListener('keydown', this.kd); removeEventListener('keyup', this.ku); return; }
      const c = e.code;
      if (c === 'ArrowLeft' || c === 'KeyA') this.move.l = v; else if (c === 'ArrowRight' || c === 'KeyD') this.move.r = v; else return;
      e.preventDefault();
    };
    this.kd = key(1); this.ku = key(0); addEventListener('keydown', this.kd); addEventListener('keyup', this.ku);
    this.go.addEventListener('click', () => { if (this.state === 'aim' && this.mark) { audio.click(); this.fire(); } });
    this.go.style.visibility = 'hidden';
    this.dots();
  }

  dots() {
    const mk = (arr) => { let s = ''; for (let i = 0; i < Math.max(5, arr.length); i++) { const r = arr[i]; s += `<i class="${r === undefined ? '' : r ? 'g' : 'x'}"></i>`; } return s; };
    this.el.querySelector('.pd.me').innerHTML = mk(this.res.me);
    this.el.querySelector('.pd.opp').innerHTML = mk(this.res.opp);
  }

  /**
   * Твій воротар до стрибка: ◀ ▶ ведуть його вздовж лінії приставним кроком (розгін і гальмування як у людини, до ~3 м/с),
   * «ліво/право» — як на екрані. Стрибок потім іде з того місця, де він стоїть, у вибрану точку.
   */
  keeperMove(dt) {
    if (this.me || !this.keeper) return;
    const gp = this.keeper.p, cam = this.m.game.matchCam, mv = this.move;
    cam.updateMatrixWorld();
    const sr = Math.sign(cam.matrixWorld.elements[2]) || 1;              // куди по z веде «праворуч» на екрані
    const want = (mv.r - mv.l) * sr * 3.1, a = mv.r || mv.l ? 14 : 18;
    mv.v += clamp(want - mv.v, -a * dt, a * dt);
    const lim = G - 0.7, z = clamp(gp.z + mv.v * dt, -lim, lim);
    if (z === lim || z === -lim) mv.v = 0;
    gp.z = z; gp.vx = 0; gp.vz = mv.v; gp.x = this.gx - this.dir * 0.8;
  }

  // ---------------------------------------------------------------- камера
  camOverride() {
    if (this.over) return null;
    const dir = this.dir || 1, gx = dir * L;
    // під час польоту камера злегка підсувається й слідкує за м'ячем
    const bz = this.live ? this.m.ball.z * 0.25 : 0, push = this.live ? 2.2 : 0;
    return { p: _v.set(gx - dir * (SPOT + 15 - push), 7.4, 5.2).clone(), l: _d.set(gx, 1.6, -0.6 + bz).clone(), fov: 40 };
  }

  setMark(px, py) {
    const g = this.m.game, r = g.rect, cam = g.matchCam, gx = (this.dir || 1) * L;
    cam.updateMatrixWorld();
    _v.set(((px - r.left) / r.width) * 2 - 1, -((py - r.top) / r.height) * 2 + 1, 0.5).unproject(cam).sub(cam.position).normalize();
    const t = (gx - cam.position.x) / _v.x;
    if (!(t > 0)) return;
    this.mark = { z: clamp(cam.position.z + _v.z * t, -G - 3, G + 3), y: clamp(cam.position.y + _v.y * t, 0.1, H + 1.6) };
    this.go.disabled = false; this.placeMark(); audio.click();
  }
  placeMark() {
    if (!this.mark) { this.markEl.hidden = true; return; }
    const g = this.m.game, cam = g.matchCam;
    _v.set((this.dir || 1) * L, this.mark.y, this.mark.z).project(cam);
    this.markEl.hidden = false;
    this.markEl.style.left = ((_v.x * 0.5 + 0.5) * g.w) + 'px'; this.markEl.style.top = ((-_v.y * 0.5 + 0.5) * g.h) + 'px';
  }

  // ---------------------------------------------------------------- підготовка удару
  begin() {
    const m = this.m, k = this.k, me = k % 2 === 0, round = (k / 2) | 0;
    // уся серія — в одні ворота (як на справжній серії): міняються лише виконавець і воротар
    this.me = me; this.dir = 1; this.gx = this.dir * L;
    this.kicker = (me ? this.orderMe : this.orderOpp)[round % 10];
    this.keeper = me ? m.opp[0] : m.mine[0];
    {   // воротар, чия команда зараз б'є, чекає збоку біля лицьової лінії, обличчям до воріт
      const wp = (me ? m.mine[0] : m.opp[0]).p;
      wp.setMode('idle'); wp.vx = wp.vz = 0; wp.x = this.gx - this.dir * 9; wp.z = (me ? -1 : 1) * 15; wp.yaw = Math.atan2(this.gx - wp.x, -wp.z);
    }
    const sx = this.gx - this.dir * SPOT;
    const ball = m.ball; ball.x = sx; ball.z = 0; ball.vx = ball.vz = 0; this.by = 0; this.bvy = 0; this.cy = R; this.bvx = this.bvz = 0;
    const kp = this.kicker.p, gp = this.keeper.p;
    // розбіг у кожного свій: довжина й кут заходу (праворукий заходить зліва від м'яча, під кутом)
    this.runLen = RUN * (0.72 + 0.78 * Math.random()); this.runSide = 0.8 + 1.4 * Math.random(); this.TK = 0.6 + this.runLen * 0.13;
    kp.x = sx - this.dir * (this.runLen + 0.7); kp.z = this.dir * this.runSide; kp.vx = kp.vz = 0; kp.yaw = this.dir > 0 ? Math.PI / 2 : -Math.PI / 2; kp.setMode('idle'); kp.setExpr('neutral');
    gp.x = this.gx - this.dir * 0.8; gp.z = 0; gp.vx = gp.vz = 0; gp.yaw = this.dir > 0 ? -Math.PI / 2 : Math.PI / 2; gp.setMode('gkwait', 999); gp.gkAlert = 1;
    this.state = 'aim'; this.t = 0; this.live = false; this.mark = null; this.markEl.hidden = true; this.go.disabled = true; this.go.style.visibility = 'visible';
    this.go.querySelector('b').textContent = me ? 'УДАР!' : 'СТРИБОК!';
    this.msg.innerHTML = me ? `<b>№${this.kicker.info.num} ${this.kicker.info.name.split(' ')[0]}</b> б’є пенальті<small>Тапни у ворота, куди бити</small>` : `<b>Б’є ${this.kicker.info.name.split(' ')[0]}</b><small>Тапни у ворота, куди стрибне воротар · ◀ ▶ — рух по лінії</small>`;
    this.moveEl.hidden = me; this.move.v = 0;
    this.m.ui.hud.setCard(null);
    audio.whistle(false);
  }

  decide() {
    const kp = this.kicker, gk = this.keeper, sh = kp.sk.shoot, aimMe = this.me;
    let aim; this.read = false;
    if (aimMe) aim = { z: this.mark.z, y: this.mark.y };
    else { const side = Math.random() < 0.5 ? -1 : 1, hi = Math.random() < 0.45; aim = { z: Math.random() < 0.18 ? 0 : side * G * (0.5 + 0.4 * Math.random()), y: hi ? H * 0.62 + H * 0.22 * Math.random() : 0.4 + 0.6 * Math.random() }; }
    const sig = 2.0 - 1.5 * sh;
    const act = { z: aim.z + gauss() * sig, y: Math.max(0.12, aim.y + gauss() * sig * 0.5) };
    let dive;
    if (!aimMe) dive = { z: this.mark.z, y: this.mark.y };
    else {
      const read = this.read = Math.random() < (0.28 + 0.3 * gk.sk.iq) * 0.7;   // воротар тепер точно дістає вибрану точку, тож читає удар рідше
      if (read) dive = { z: aim.z + gauss() * 1.6, y: aim.y + gauss() * 0.5 };
      else { const side = Math.random() < 0.5 ? -1 : 1; dive = { z: Math.random() < 0.2 ? 0 : side * G * 0.6, y: Math.random() < 0.5 ? 0.8 : H * 0.65 }; }
    }
    this.act = act; this.dive = { z: clamp(dive.z, -G, G), y: clamp(dive.y, 0.3, H) };
    this.out = null;
  }

  fire() {
    this.m.ui.hud.hint(null); this.msg.textContent = ''; this.go.style.visibility = 'hidden';
    this.decide();
    this.state = 'live'; this.t = 0; this.live = true; this.m.view.stands.react('flash');
    // час польоту м'яча відомий наперед (сила удару й відстань); воротар, як справжній, рушає ще до удару — коли виконавець
    // ставить опорну ногу (~0.25 с до контакту), з реакцією за навичкою, а якщо «прочитав» удар — ще раніше
    {
      const m = this.m, kp = this.kicker, gk = this.keeper, TK = this.TK || 1.0;
      const dist = Math.hypot(this.gx - m.ball.x, this.act.z), spd = 24 + 12 * kp.sk.shoot;
      this.tFly = clamp(dist / spd, 0.4, 0.62);
      this.gkAt = clamp(0.2 - 0.13 * gk.sk.react, 0.06, 0.2) - (this.read ? 0.14 : 0);
      const tHit = TK + 0.224;                                       // мить контакту ноги з м'ячем
      this.gkStartT = tHit + this.gkAt - 0.25; this.ballArrT = tHit + this.tFly * (SPOT - 0.8) / SPOT;   // рушає, коли виконавець ставить опорну ногу
    }
    Object.assign(this, { kmode: false, kicked: false, struck: false, arrived: false, announced: false, dust: false, cel: false, gkGo: false, gkDone: false, gkReact: false, kReact: false, slowUntil: 0, tArr: 0, gkTouch: false, postHit: false, inNet: false, curve: true, out: null });
  }

  announce() {
    const m = this.m, goal = this.out === 'goal', me = this.me;
    (me ? this.res.me : this.res.opp).push(goal);
    this.dots();
    const msg = { goal: 'ГОЛ!', save: me ? 'ВОРОТАР ВІДБИВ!' : 'ТИ ЗАХИСТИВ ВОРОТА!', miss: 'МИМО!', post: 'ШТАНГА!' }[this.out];
    m.ui.hud.goal(msg, '', goal ? (me ? 'me' : 'opp') : (me ? 'opp' : 'me'));
    const kp = this.kicker.p;
    if (goal) { kp.vx = -this.dir * 6.5; kp.vz = (Math.random() < 0.5 ? -1 : 1) * 3.2; audio.goal(); m.view.stands.react('goal', { mine: me, dur: 3.4 }); m.game.addTrauma(0.35); }
    else { audio.save(); kp.setMode('sad', 2.2); m.view.stands.react(this.out === 'save' || this.out === 'post' ? 'gasp' : 'groan'); }
    this.k++;
  }

  verdict() {
    const a = this.res.me, b = this.res.opp, ga = a.filter(Boolean).length, gb = b.filter(Boolean).length;
    const ra = Math.max(0, 5 - a.length), rb = Math.max(0, 5 - b.length);
    if (a.length <= 5 && b.length <= 5) {
      if (ga > gb + rb) return 1;
      if (gb > ga + ra) return -1;
      if (ra === 0 && rb === 0 && ga !== gb) return ga > gb ? 1 : -1;
      return 0;
    }
    if (a.length === b.length && ga !== gb) return ga > gb ? 1 : -1;
    return 0;
  }

  // ---------------------------------------------------------------- головний цикл
  /** Повертає масштабований dt для анімацій (сповільнення під час польоту). */
  update(rawDt) {
    // легке сповільнення в польоті м'яча (кіно-ефект), але не настільки, щоб воротар рухався як під водою
    const slow = 1;                                                     // на пенальті без сповільнень
    this.ts += (slow - this.ts) * Math.min(1, rawDt * 9);
    const dt = rawDt * this.ts;
    this.t += dt;
    if (this.state === 'wait') { if (this.t >= 0) this.begin(); }
    else if (this.state === 'aim') { this.placeMark(); this.keeperMove(dt); }
    else if (this.state === 'live') this.liveStep(dt);
    this.placeMark();
    return dt;
  }

  liveStep(dt) {
    const m = this.m, v = m.view, kp = this.kicker, gk = this.keeper, dir = this.dir, t = this.t;
    const sx = this.gx - dir * SPOT, TK = this.TK || 1.0;
    // розбіг без зупинки: розгін, а на останньому кроці швидкість ~0.9 від середньої — удар з ходу, тіло йде за м'ячем
    const run = (q) => (-2 * q * q * q + 3 * q * q) + 0.9 * (q * q * q - q * q);

    // --- виконавець: розбіг із розгоном → замах → контакт → проводка
    if (!this.kicked) {
      const q = clamp(t / TK, 0, 1), e = run(q), x0 = sx - dir * ((this.runLen || RUN) + 0.7), x1 = sx - dir * 1.25;
      const z0 = dir * (this.runSide ?? 1.4), z1 = dir * 0.25;
      const px = kp.p.x, pz = kp.p.z;
      kp.p.x = x0 + (x1 - x0) * e; kp.p.z = z0 + (z1 - z0) * (1 - (1 - e) * (1 - e));   // заходить дугою, наприкінці — прямо на м'яч
      if (dt > 0) { kp.p.vx = (kp.p.x - px) / dt; kp.p.vz = (kp.p.z - pz) / dt; }
      const sp = Math.hypot(kp.p.vx, kp.p.vz); if (sp > 0.4) kp.p.yaw = Math.atan2(kp.p.vx, kp.p.vz);
      if (t >= TK - 0.1 && !this.kmode) { this.kmode = true; kp.p.startPKick(); }
      if (this.kmode) kp.p.kickP = (t - (TK - 0.1)) / 0.9;
      if (t >= TK) { this.kicked = true; this.kt = 0; kp.p.yaw = dir > 0 ? Math.PI / 2 : -Math.PI / 2; }   // швидкість лишається — удар з ходу
    } else {
      this.kt += dt;
      // інерція розбігу: тіло проходить за м'ячем ще ~0.3 м і гальмує на опорній нозі
      if (this.kt <= 0.55 && !(this.out === 'goal' && this.announced)) { const q = kp.p, k = Math.exp(-dt * 6); q.x += q.vx * dt; q.z += q.vz * dt; q.vx *= k; q.vz *= k; }
      if (this.kmode) { kp.p.kickP = (t - (TK - 0.1)) / 0.9; if (kp.p.kickP >= 1.1) { this.kmode = false; kp.p.setMode('idle'); } }
      if (this.out === 'goal' && this.announced) {
        if (t < this.tArr + 1.2) { kp.p.x += kp.p.vx * dt; kp.p.z += kp.p.vz * dt; const sp = Math.hypot(kp.p.vx, kp.p.vz); if (sp > 0.5) kp.p.yaw = Math.atan2(kp.p.vx, kp.p.vz); }
        else if (!this.cel) { this.cel = true; kp.p.vx = kp.p.vz = 0; kp.p.cheer(2.4); }
      } else if (!this.kmode && this.kt > 0.55 && !this.kReact) { const q = kp.p, kv = Math.min(1, dt * 4); q.vx += (-dir * 2.4 - q.vx) * kv; q.vz += (1.8 - q.vz) * kv; q.x += q.vx * dt; q.z += q.vz * dt; q.yaw = Math.atan2(q.vx, q.vz); }   // рушає з місця, а не одразу з 3 м/с
      // виконавець бачить результат: забив — радіє (кулак, руки в небо, рик), ні — руки на голову, обличчя в долонях, присів
      if (this.announced && !this.kReact && this.kt > 0.35) {
        this.kReact = true; const q = kp.p; q.vx = q.vz = 0; q.yaw = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        q.react(this.out === 'goal' ? 'score' : 'miss', 2.4);
      }
    }

    // --- контакт: початкова швидкість, щоб м'яч (без перешкод) влучив у вибрану точку з тяжінням і закрутом
    if (this.kicked && !this.struck && this.kmode && kp.p.kickP >= 0.36) {
      this.struck = true; gk.p.splitT = 0.18;
      audio.kick(1); v.ball.squash(dir, 0, 0.3); m.game.addTrauma(0.18); m.game.fovKick(2.5);
      v.particles.burst(m.ball.x, 0.3, m.ball.z, 8, 4, 0.5, 0.2, ['#8fb98a', '#f2f5ee'], 10, 0.6);
      const Tf = this.tFly;
      const a = this.act, plane = this.gx, tz = a.z, ty = Math.max(a.y, 0.12);
      this.az = gauss() * 5;
      this.bvx = (plane - m.ball.x) / Tf; this.bvz = (tz - m.ball.z - 0.5 * this.az * Tf * Tf) / Tf; this.bvy = (ty - R + 0.5 * GRAV * Tf * Tf) / Tf;
      this.by = 0.15 - R + R;           // висота центра над газоном = R + by; стартуємо з землі
      this.by = 0; this.cy = R;
      this.tStrike = this.t; this.tFly = Tf;
    }

    // --- воротар: чекає, потім виконує безперервний стрибок (триває до кінця, незалежно від результату)
    // до стрибка: твій воротар ходить лінією, куди ти ведеш стрілками; воротар суперника переминається сам
    if (!this.gkGo) { if (this.me) gk.p.z = Math.sin(t * 5.5) * 0.45; else this.keeperMove(dt); gk.p.x = this.gx - dir * 0.8; }
    if (this.gkGo && this.moveEl && !this.moveEl.hidden) this.moveEl.hidden = true;
    gk.p.ballAt(m.ball.x, this.cy, m.ball.z);                      // воротар бачить м'яч: руки стежать за ним і б'ють по ньому
    if (!this.gkGo && t >= this.gkStartT) {
      this.gkGo = true; this.gz0 = gk.p.z; this.gx0 = gk.p.x;
      const tArr = Math.max(0.2, this.ballArrT - t), dz = this.dive.z - this.gz0;      // скільки до того, як м'яч підлетить до воротаря
      if (Math.abs(dz) < 0.9) {
        // точка майже на ньому: без стрибка — ловить стоячи (низький м'яч підбирає) або вистрибує вгору; руки йдуть до м'яча
        this.gStand = true;
        if (this.dive.y > 1.9) gk.p.gkJump(); else gk.p.catchBall(this.dive.y < 0.7);
      } else {
        // висота стрибка за точкою: верхня половина воріт — у кут, середина — у політ, нижче ~0.6 м — низом по газону
        const kind = this.dive.y > H * 0.5 ? 0 : this.dive.y > 0.5 ? 1 : 2, sgn = Math.sign(dz);
        this.gSgn = sgn; this.gKind = kind; this.gStand = false;
        // стрибок за фізикою: воротар сам рахує, як сильно відштовхнутись, щоб руки встигли до твоєї точки; сила ніг — за навичкою
        gk.p.startPDive(sgn, kind, { x: gk.p.x, y: this.dive.y, z: this.dive.z }, tArr, 6.4 + 1.6 * (gk.sk.reach ?? 0.5));
      }
    }
    if (this.gkGo && !this.gkDone && this.gStand) { if (gk.p.mode === 'idle') this.gkDone = true; }
    else if (this.gkGo && !this.gkDone) {
      gk.p.vx = gk.p.vz = 0;
      // приземлення: пил, глухий удар і легкий трус камери — у мить, коли тіло справді вдарилось об газон, і за силою удару
      const hit = gk.p.landImpact;
      if (hit && !this.dust) { this.dust = true; v.particles.burst(gk.p.x, 0.2, gk.p.z, 10 + Math.min(10, hit * 2) | 0, 3.8, 0.6, 0.22, ['#8fb98a', '#cfd8c9', '#f2f5ee'], 10, 0.5); audio.thud(); m.game.addTrauma(Math.min(0.22, hit * 0.03)); }
      if (gk.p.mode !== 'pdive') this.gkDone = true;               // стрибок, падіння й підйом скінчились — воротар сам повернувся в стійку
    }

    // --- м'яч: інтеграція малими кроками й зіткнення зі штангами, перекладиною, воротарем, сіткою й газоном
    if (this.struck) {
      const n = Math.max(1, Math.ceil(dt / 0.004)), h = dt / n;
      for (let i = 0; i < n; i++) this.ballStep(h);
      m.ball.vx = this.bvx; m.ball.vz = this.bvz;
      this.judge();
      // воротар реагує на результат, коли вже підвівся: радіє сейву, засмучується від голу
      if (this.announced && !this.gkReact && (this.gkDone || !this.gkGo) && gk.p.mode !== 'pdive') {
        this.gkReact = true; if (this.out === 'save') gk.p.react('save', 2.0); else if (this.out === 'goal') gk.p.react('concede', 1.9);
      }
      if (this.arrived && t > this.tArr + 2.6 && (this.gkDone || !this.gkGo)) this.endKick();
      else if (!this.arrived && t > this.tStrike + 3.2) { this.out = this.gkTouch ? 'save' : this.postHit ? 'post' : 'miss'; this.arrived = true; this.tArr = t; this.slowUntil = t + 0.4; this.announced = true; this.announce(); }
    }
  }

  /** Один крок фізики м'яча (h — малий крок часу). */
  ballStep(h) {
    const m = this.m, v = m.view, b = m.ball, dir = this.dir, gx = this.gx;
    let x = b.x, y = this.cy, z = b.z, vx = this.bvx, vy = this.bvy, vz = this.bvz;
    // сили: тяжіння, опір повітря, закрут (тільки до першого контакту)
    vy -= GRAV * h;
    const drag = 1 - 0.06 * h; vx *= drag; vz *= drag; vy *= drag;
    if (this.curve) vz += this.az * h;
    x += vx * h; y += vy * h; z += vz * h;

    const bounce = (nx, ny, nz, e, mu, snd) => {
      const vn = vx * nx + vy * ny + vz * nz;
      if (vn < 0) {
        vx -= (1 + e) * vn * nx; vy -= (1 + e) * vn * ny; vz -= (1 + e) * vn * nz;
        const tx = vx - (vx * nx + vy * ny + vz * nz) * nx, ty2 = vy - (vx * nx + vy * ny + vz * nz) * ny, tz = vz - (vx * nx + vy * ny + vz * nz) * nz;
        vx -= tx * mu; vy -= ty2 * mu; vz -= tz * mu;
        if (-vn > 2.5 && snd) snd(-vn);
      }
    };
    const seg = (ax, ay, az, bx, by, bz, r) => {                  // найближча точка відрізка до центру м'яча
      const ex = bx - ax, ey = by - ay, ez = bz - az, l2 = ex * ex + ey * ey + ez * ez || 1;
      const tt = clamp(((x - ax) * ex + (y - ay) * ey + (z - az) * ez) / l2, 0, 1);
      return { cx: ax + ex * tt, cy: ay + ey * tt, cz: az + ez * tt, t: tt, r };
    };

    // штанги й перекладина: циліндри радіуса PR
    const PR = 0.12, rr = R + PR;
    const hitPost = (c) => {
      const dx = x - c.cx, dy = y - c.cy, dz = z - c.cz, d = Math.hypot(dx, dy, dz);
      if (d < rr && d > 1e-4) {
        const nx = dx / d, ny = dy / d, nz = dz / d;
        x = c.cx + nx * rr; y = c.cy + ny * rr; z = c.cz + nz * rr;
        const sp = Math.hypot(vx, vy, vz);
        bounce(nx, ny, nz, 0.72, 0.04, (vn) => { audio.wall(0, Math.min(30, vn * 1.2)); m.game.addTrauma(0.22); v.particles.burst(c.cx, c.cy, c.cz, 8, 4, 0.4, 0.18, ['#fff', '#ddd'], 10, 0.6); v.ball.squash(nx, nz, 0.3); });
        this.postHit = true; this.curve = false;
        return sp;
      }
      return 0;
    };
    hitPost(seg(gx, 0, -G, gx, H, -G, PR)); hitPost(seg(gx, 0, G, gx, H, G, PR)); hitPost(seg(gx, H, -G, gx, H, G, PR));

    // воротар: м'яч б'ється саме об ту частину тіла, яку видно (капсули скелета: тулуб, голова, руки, рукавиці, ноги),
    // з урахуванням її швидкості. Рукавиці трохи ширші за модель (прощаюча фізика) і м'якші — гасять удар;
    // твій воротар прощає неточний вибір точки (0.18), воротар суперника — майже ні (0.06): удар у кут лишається твоїм шансом
    const parts = this.keeper.p.hitCaps, gm = this.me ? 0.06 : 0.18;
    if (parts) {
      let best = null, bq = null, bd = 0;
      for (let i = 0; i < parts.length; i++) {
        const c = parts[i], q = seg(c.ax, c.ay, c.az, c.bx, c.by, c.bz, c.r + (c.glove ? gm : 0.04));
        const pen = R + q.r - Math.hypot(x - q.cx, y - q.cy, z - q.cz);
        if (pen > bd) { bd = pen; best = c; bq = q; }
      }
      if (best) {
        const dx = x - bq.cx, dy = y - bq.cy, dz = z - bq.cz, d = Math.hypot(dx, dy, dz) || 1e-4, rg = R + bq.r;
        const nx = dx / d, ny = dy / d, nz = dz / d, t = bq.t;
        x = bq.cx + nx * rg; y = bq.cy + ny * rg; z = bq.cz + nz * rg;
        const cl = (v) => clamp(v, -15, 15);                                   // ривок пози (розстановка) — не удар рукою
        const lvx = cl(best.vax + (best.vbx - best.vax) * t), lvy = cl(best.vay + (best.vby - best.vay) * t), lvz = cl(best.vaz + (best.vbz - best.vaz) * t);
        // наскільки «повно» м'яч влучив у рукавицю: 1 — серединою назустріч польоту, 0 — дотик кінчиками пальців
        const sp0 = Math.hypot(vx, vy, vz) || 1, solid = best.glove ? clamp(-(vx * nx + vy * ny + vz * nz) / sp0, 0, 1) : 0;
        vx -= lvx; vy -= lvy; vz -= lvz;
        bounce(nx, ny, nz, best.glove ? 0.3 : 0.45, 0.1, null);
        vx += lvx; vy += lvy; vz += lvz;
        if (best.glove) {
          // відбивання долонею: м'яч відводиться від воріт і назовні за стійку; дотик пальцями лише гальмує й трохи відхиляє
          const into = vx * dir;                                          // швидкість у бік воріт
          if (into > 0) vx -= dir * into * (0.35 + 1.25 * solid);
          vz += Math.sign(z || this.gSgn || 1) * (2 + 6 * solid); vy += 1.5 * solid;
        }
        if (!this.gkTouch) { this.gkTouch = true; this.curve = false; audio.save(); v.ball.squash(nx, nz, 0.3); this.keeper.p.parry({ x, y, z }); }
      }
    }

    // сітка: ззаду, з боків, зверху (поглинає енергію)
    const depth = (x - gx) * dir;
    const D = PITCH.GOAL_D, roofY = H - (H - H * 0.75) * clamp(depth / D, 0, 1);
    if (!this.inNet && depth > 0 && Math.abs(z) < G - 0.05 && y < H - 0.05) this.inNet = true;
    if (this.inNet) {
      const damp = 1 - Math.min(1, h * 3.2); vx *= damp; vy *= damp; vz *= damp;                 // м'яч «вязне» в сітці
      if (depth > D - R) { x = gx + dir * (D - R); if (vx * dir > 0) vx *= -0.12; v.ball.squash(dir, 0, 0.18); }
      if (Math.abs(z) > G - R - 0.1) { z = Math.sign(z) * (G - R - 0.1); vz *= -0.12; }
      if (y > roofY - R) { y = roofY - R; if (vy > 0) vy *= -0.12; }
    }
    // газон: відскок і кочення
    if (y < R) {
      y = R;
      if (vy < -2) { vy *= -0.55; v.ball.hop = 0.16; if (vy > 3) audio.wall(0, 3); } else vy = 0;
      const fr = 1 - Math.min(1, h * 1.5); vx *= fr; vz *= fr;
    }
    // рекламні борти й межі поля навколо воріт
    const lim = gx + dir * (D + 5);
    if ((x - lim) * dir > 0) { x = lim; vx *= -0.3; vz *= 0.6; }
    if (Math.abs(z) > 24) { z = Math.sign(z) * 24; vz *= -0.3; }

    b.x = x; b.z = z; this.cy = y; this.by = y - R; this.bvx = vx; this.bvy = vy; this.bvz = vz;
  }

  /** Результат за фізикою: гол, мимо, штанга, сейв. */
  judge() {
    if (this.arrived) return;
    const b = this.m.ball, dir = this.dir, depth = (b.x - this.gx) * dir, y = this.cy;
    let out = null;
    if (depth > R * 0.9) out = (Math.abs(b.z) < G - 0.05 && y < H - 0.05) ? 'goal' : (this.postHit ? 'post' : 'miss');
    else if (depth < -2.8 && this.bvx * dir < 0) out = this.gkTouch ? 'save' : this.postHit ? 'post' : 'miss';
    else if (this.gkTouch && this.bvx * dir < 0 && depth < -0.6 && Math.hypot(this.bvx, this.bvz) > 2) out = 'save';
    if (!out) return;
    this.out = out; this.arrived = true; this.tArr = this.t; this.slowUntil = this.t + 0.5;
    if (out === 'goal') { this.m.view.ball.squash(dir, 0, 0.32); audio.wall(0, 12); this.m.view.particles.burst(this.gx + dir * 1.5, y, b.z, 10, 4, 0.6, 0.18, ['#ffffff', '#cde'], 10, 0.5); }
    this.announced = true; this.announce();
  }

  endKick() {
    const m = this.m;
    this.state = 'between'; this.live = false;
    m.ui.hud.clearGoal();
    const vd = this.verdict();
    if (vd !== 0) { this.finish(vd > 0); return; }
    this.state = 'wait'; this.t = -0.4;
    const kp = this.kicker.p; kp.setMode('idle'); kp.vx = kp.vz = 0; kp.x = (this.me ? -1 : 1) * (6 + Math.random() * 4); kp.z = -8 + Math.random() * 16; kp.yaw = this.me ? 1.2 : -1.2;   // виконавець повертається до решти
    this.keeper.p.setMode('idle');
  }

  /** Після syncView: висота м'яча (syncView її перезаписує). */
  post() { if (!this.over) { const b = this.m.view.ball; b.group.position.y = Math.max(R + this.by, b.rad); } }   // збільшений здалеку м'яч не провалюється в газон

  finish(win) {
    const m = this.m, g = (arr) => arr.filter(Boolean).length;
    this.over = true;
    m.penRes = { me: g(this.res.me), opp: g(this.res.opp), win };
    this.el.remove(); removeEventListener('keydown', this.kd); removeEventListener('keyup', this.ku);
    m.ui.hud.clearGoal();
    m.game.sm.go('MATCH', { resume: true });
    m.end();
  }
}
