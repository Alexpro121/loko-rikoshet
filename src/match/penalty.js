import * as THREE from 'three';
import { PITCH } from '../config.js';
import { audio } from '../core/audio.js';
import { ovr } from '../state/squad.js';

const { L, G, R } = PITCH;
const H = PITCH.GOAL_H, SPOT = 12, RUN = 3.6;     // висота воріт, відстань крапки до лінії, розбіг
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 0.9;
const _v = new THREE.Vector3(), _d = new THREE.Vector3();
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
    ui.setMatchUi(false); ui.hud.warn(null); ui.hud.hint(null); ui.hud.setCard(null);
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
      <button class="pen-go big go" id="pen-go" disabled><b>УДАР!</b></button>`;
    root.appendChild(el);
    this.el = el; this.msg = el.querySelector('#pen-msg'); this.markEl = el.querySelector('#pen-mark'); this.go = el.querySelector('#pen-go');
    const hit = el.querySelector('#pen-hit');
    hit.addEventListener('pointerdown', (e) => { if (this.state !== 'aim') return; this.setMark(e.clientX, e.clientY); e.preventDefault(); });
    this.go.addEventListener('click', () => { if (this.state === 'aim' && this.mark) { audio.click(); this.fire(); } });
    this.go.style.visibility = 'hidden';
    this.dots();
  }

  dots() {
    const mk = (arr) => { let s = ''; for (let i = 0; i < Math.max(5, arr.length); i++) { const r = arr[i]; s += `<i class="${r === undefined ? '' : r ? 'g' : 'x'}"></i>`; } return s; };
    this.el.querySelector('.pd.me').innerHTML = mk(this.res.me);
    this.el.querySelector('.pd.opp').innerHTML = mk(this.res.opp);
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
    this.me = me; this.dir = me ? 1 : -1; this.gx = this.dir * L;
    this.kicker = (me ? this.orderMe : this.orderOpp)[round % 10];
    this.keeper = me ? m.opp[0] : m.mine[0];
    const sx = this.gx - this.dir * SPOT;
    const ball = m.ball; ball.x = sx; ball.z = 0; ball.vx = ball.vz = 0; this.by = 0; this.bvy = 0;
    const kp = this.kicker.p, gp = this.keeper.p;
    kp.x = sx - this.dir * (RUN + 0.7); kp.z = -1.4; kp.vx = kp.vz = 0; kp.yaw = this.dir > 0 ? Math.PI / 2 : -Math.PI / 2; kp.setMode('idle'); kp.setExpr('neutral');
    gp.x = this.gx - this.dir * 0.8; gp.z = 0; gp.vx = gp.vz = 0; gp.yaw = this.dir > 0 ? -Math.PI / 2 : Math.PI / 2; gp.setMode('gkwait', 999);
    this.state = 'aim'; this.t = 0; this.live = false; this.mark = null; this.markEl.hidden = true; this.go.disabled = true; this.go.style.visibility = 'visible';
    this.go.querySelector('b').textContent = me ? 'УДАР!' : 'СТРИБОК!';
    this.msg.innerHTML = me ? `<b>№${this.kicker.info.num} ${this.kicker.info.name.split(' ')[0]}</b> б’є пенальті<small>Тапни у ворота, куди бити</small>` : `<b>Б’є ${this.kicker.info.name.split(' ')[0]}</b><small>Тапни у ворота, куди стрибне воротар</small>`;
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
      const read = this.read = Math.random() < 0.28 + 0.3 * gk.sk.iq;
      if (read) dive = { z: aim.z + gauss() * 1.6, y: aim.y + gauss() * 0.5 };
      else { const side = Math.random() < 0.5 ? -1 : 1; dive = { z: Math.random() < 0.2 ? 0 : side * G * 0.6, y: Math.random() < 0.5 ? 0.8 : H * 0.65 }; }
    }
    this.act = act; this.dive = { z: clamp(dive.z, -G, G), y: clamp(dive.y, 0.3, H) };
    let out;
    if (Math.abs(act.z) > G + 0.4 || act.y > H + 0.5) out = 'miss';
    else if (Math.abs(act.z) > G - 0.35 || act.y > H - 0.3) out = Math.random() < 0.6 ? 'post' : 'goal';
    else out = 'goal';
    if (out === 'goal') {
      const reach = 0.5 * gk.sk.reach + 0.5 * gk.sk.react, rr = 1.5 + 1.6 * reach;
      const d = Math.hypot(act.z - this.dive.z, (act.y - this.dive.y) * 0.9);
      if (d < rr && Math.random() < 0.92) out = 'save';
      else if (d < rr + 0.9 && Math.random() < 0.25) out = 'save';
    }
    this.out = out;
  }

  fire() {
    this.m.ui.hud.hint(null); this.msg.textContent = ''; this.go.style.visibility = 'hidden';
    this.decide();
    this.state = 'live'; this.t = 0; this.live = true;
    Object.assign(this, { kmode: false, kicked: false, struck: false, arrived: false, announced: false, dust: false, cel: false, gkGo: false, gkDone: false, slowUntil: 0, tArr: 0 });
  }

  announce() {
    const m = this.m, goal = this.out === 'goal', me = this.me;
    (me ? this.res.me : this.res.opp).push(goal);
    this.dots();
    const msg = { goal: 'ГОЛ!', save: me ? 'ВОРОТАР ВІДБИВ!' : 'ТИ ЗАХИСТИВ ВОРОТА!', miss: 'МИМО!', post: 'ШТАНГА!' }[this.out];
    m.ui.hud.goal(msg, '', goal ? (me ? 'me' : 'opp') : (me ? 'opp' : 'me'));
    const kp = this.kicker.p;
    if (goal) { kp.vx = -this.dir * 6.5; kp.vz = (Math.random() < 0.5 ? -1 : 1) * 3.2; audio.goal(); m.view.stands.cheer(2.8); m.game.addTrauma(0.35); }
    else { audio.save(); kp.setMode('sad', 2.2); }
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
    const slow = this.state === 'live' && this.struck && !this.arrived ? 0.42 : (this.state === 'live' && this.arrived && this.t < this.slowUntil ? 0.6 : 1);
    this.ts += (slow - this.ts) * Math.min(1, rawDt * 9);
    const dt = rawDt * this.ts;
    this.t += dt;
    if (this.state === 'wait') { if (this.t >= 0) this.begin(); }
    else if (this.state === 'aim') this.placeMark();
    else if (this.state === 'live') this.liveStep(dt);
    this.placeMark();
    return dt;
  }

  liveStep(dt) {
    const m = this.m, v = m.view, kp = this.kicker, gk = this.keeper, dir = this.dir, t = this.t;
    const sx = this.gx - dir * SPOT, TK = 1.0;
    const ease = (q) => (q < 0.5 ? 2 * q * q : 1 - Math.pow(-2 * q + 2, 2) / 2);

    // --- виконавець: розбіг із розгоном → замах → контакт → проводка
    if (!this.kicked) {
      const q = clamp(t / TK, 0, 1), e = ease(q), x0 = sx - dir * (RUN + 0.7), x1 = sx - dir * 0.95;
      const px = kp.p.x, pz = kp.p.z;
      kp.p.x = x0 + (x1 - x0) * e; kp.p.z = -1.4 * (1 - e);
      if (dt > 0) { kp.p.vx = (kp.p.x - px) / dt; kp.p.vz = (kp.p.z - pz) / dt; }
      const sp = Math.hypot(kp.p.vx, kp.p.vz); if (sp > 0.4) kp.p.yaw = Math.atan2(kp.p.vx, kp.p.vz);
      if (t >= TK - 0.1 && !this.kmode) { this.kmode = true; kp.p.startPKick(); }
      if (this.kmode) kp.p.kickP = (t - (TK - 0.1)) / 0.9;
      if (t >= TK) { this.kicked = true; this.kt = 0; kp.p.vx = kp.p.vz = 0; kp.p.yaw = dir > 0 ? Math.PI / 2 : -Math.PI / 2; }
    } else {
      this.kt += dt;
      if (this.kmode) { kp.p.kickP = (t - (TK - 0.1)) / 0.9; if (kp.p.kickP >= 1.1) { this.kmode = false; kp.p.setMode('idle'); } }
      if (this.out === 'goal' && this.announced) {
        if (t < this.tArr + 1.2) { kp.p.x += kp.p.vx * dt; kp.p.z += kp.p.vz * dt; const sp = Math.hypot(kp.p.vx, kp.p.vz); if (sp > 0.5) kp.p.yaw = Math.atan2(kp.p.vx, kp.p.vz); }
        else if (!this.cel) { this.cel = true; kp.p.vx = kp.p.vz = 0; kp.p.cheer(2.4); }
      } else if (!this.kmode && this.kt > 0.55) { const q = kp.p; q.vx = -dir * 2.4; q.vz = 1.8; q.x += q.vx * dt; q.z += q.vz * dt; q.yaw = Math.atan2(q.vx, q.vz); }
    }

    // --- контакт: фізика м'яча — початкова швидкість, щоб влучити у вибрану точку з тяжінням і закрутом
    if (this.kicked && !this.struck && this.kmode && kp.p.kickP >= 0.36) {
      this.struck = true; this.st = 0;
      audio.kick(1); v.ball.squash(dir, 0, 0.3); m.game.addTrauma(0.18); m.game.fovKick(2.5);
      v.particles.burst(m.ball.x, 0.3, m.ball.z, 8, 4, 0.5, 0.2, ['#8fb98a', '#f2f5ee'], 10, 0.6);
      const dist = Math.hypot(this.gx - m.ball.x, this.act.z), spd = 24 + 12 * kp.sk.shoot, Tf = clamp(dist / spd, 0.4, 0.62);
      const a = this.act, plane = this.gx;
      let tz = a.z, ty = Math.max(a.y, 0.12);
      this.gkAt = clamp(0.2 - 0.13 * gk.sk.react, 0.06, 0.2) - (this.read ? 0.14 : 0);
      this.Tf = Tf;
      if (this.out === 'save') {
        // воротар зустрічає м'яч руками: рахуємо його положення у момент влучання
        const gt = Math.max(0, Tf - this.gkAt), gTz = clamp(this.dive.z, -G + 0.4, G - 0.4), z0 = 0.2;
        const gF = clamp(0.5 + 0.035 * Math.abs(gTz - z0), 0.5, 0.78), qq = clamp((gt - 0.05) / (gF * 0.9), 0, 1);
        const gz = z0 + (gTz - z0) * (1 - Math.pow(1 - qq, 2));
        tz = gz + Math.sign(gTz - z0 || 1) * 1.5; ty = clamp(this.dive.y, 0.3, H);
      } else if (this.out === 'post') { tz = Math.sign(a.z || 1) * G; ty = a.y > H * 0.7 ? H : a.y; }
      this.az = gauss() * 5;                                                   // закрут: бічне прискорення
      const GR = 26;
      this.bv = { x: (plane - m.ball.x) / Tf, z: (tz - m.ball.z - 0.5 * this.az * Tf * Tf) / Tf, y: (ty - 0.15 + 0.5 * GR * Tf * Tf) / Tf };
      this.bt = 0; this.bp = { x: m.ball.x, z: m.ball.z, y: 0.15 }; this.tgt = { z: tz, y: ty };
      this.by = 0.15;
    }

    // --- воротар: чекає, потім виконує безперервний стрибок (триває до кінця, навіть після влучання)
    if (!this.gkGo) { gk.p.z = Math.sin(t * 5.5) * 0.45; gk.p.x = this.gx - dir * 0.8; }
    if (this.struck) {
      this.st += dt;
      if (!this.gkGo && this.st >= this.gkAt) {
        this.gkGo = true; this.gt = 0; this.gz0 = gk.p.z; this.gx0 = gk.p.x;
        this.gTz = clamp(this.dive.z, -G + 0.4, G - 0.4);
        const hi = this.dive.y > H * 0.42, sgn = Math.sign(this.gTz - this.gz0 || 1);
        this.gSgn = sgn;
        gk.p.startPDive(sgn * (dir > 0 ? 1 : -1), hi);
        this.gFly = clamp(0.5 + 0.035 * Math.abs(this.gTz - this.gz0), 0.5, 0.78);
      }
      if (this.gkGo && !this.gkDone) {
        this.gt += dt;
        // прогрес пози: 0..1 політ і приземлення, далі лежить 0.75 с, далі встає (до 1.5)
        const P = this.gt < this.gFly ? this.gt / this.gFly : this.gt < this.gFly + 0.75 ? 1 : 1 + ((this.gt - this.gFly - 0.75) / 0.9) * 0.5;
        gk.p.diveP = Math.min(1.5, P);
        // швидкий старт, далі гальмування в польоті й ковзання по траві
        const q = clamp((this.gt - 0.05) / (this.gFly * 0.9), 0, 1), e = easeOut(q, 2.0);
        const slide = this.gt > this.gFly ? this.gSgn * 0.9 * (1 - Math.exp(-(this.gt - this.gFly) * 6)) : 0;
        gk.p.z = this.gz0 + (this.gTz - this.gz0) * e + slide;
        gk.p.x = this.gx0 - dir * (0.8 * Math.sin(clamp(q, 0, 1) * Math.PI * 0.9));
        gk.p.vx = gk.p.vz = 0;
        if (this.gt >= this.gFly * 0.82 && !this.dust) { this.dust = true; v.particles.burst(gk.p.x, 0.2, gk.p.z, 12, 3.8, 0.6, 0.22, ['#8fb98a', '#cfd8c9', '#f2f5ee'], 10, 0.5); audio.thud(); }
        if (P >= 1.5) { this.gkDone = true; gk.p.setMode('idle'); if (this.out === 'save') gk.p.cheer(1.6); }
      }
    }

    // --- м'яч: політ по параболі з закрутом → влучання → вільна фізика
    if (this.struck && !this.arrived) {
      const GR = 26, b = m.ball, T = this.bt += dt, Tf = this.Tf, q = Math.min(T, Tf);
      b.x = this.bp.x + this.bv.x * q; b.z = this.bp.z + this.bv.z * q + 0.5 * this.az * q * q;
      this.by = this.bp.y + this.bv.y * q - 0.5 * GR * q * q;
      b.vx = this.bv.x; b.vz = this.bv.z + this.az * q;
      this.bvy = this.bv.y - GR * q;
      if (T >= Tf) {
        this.arrived = true; this.tArr = this.t; this.slowUntil = this.t + 0.5;
        this.bvx = this.bv.x; this.bvz = this.bv.z + this.az * Tf;
        const tz = b.z, ty = this.by;
        if (this.out === 'goal') { this.bvx *= 0.45; this.bvz *= 0.5; v.ball.squash(dir, 0, 0.32); audio.wall(0, 12); v.particles.burst(this.gx + dir * 1.5, ty, tz, 10, 4, 0.6, 0.18, ['#ffffff', '#cde'], 10, 0.5); }
        else if (this.out === 'save') { gk.p.parry(); audio.save(); v.ball.squash(dir, 0, 0.3); this.bvx = -dir * (6 + Math.random() * 3); this.bvz = this.gSgn * (-1.5 - Math.random() * 4); this.bvy = 4 + Math.random() * 3; }
        else if (this.out === 'post') { audio.wall(0, 26); v.ball.squash(dir, 0, 0.3); m.game.addTrauma(0.25); v.particles.burst(this.gx, ty, tz, 10, 5, 0.4, 0.2, ['#fff', '#ddd'], 10, 0.6); this.bvx = -this.bvx * 0.45; this.bvz = -Math.sign(tz) * (3 + Math.random() * 2); this.bvy = Math.abs(this.bvy) * 0.5 + 3; }
        else { /* мимо: м'яч летить далі за інерцією */ }
        if (!this.announced) { this.announced = true; this.announce(); }
      }
    } else if (this.arrived) {
      const b = m.ball, GR = 26;
      this.bvy -= GR * dt; this.by += this.bvy * dt;
      const air = 1 - Math.min(1, dt * 0.12);
      this.bvx *= air; this.bvz *= air;
      if (this.by <= 0) {                                          // відскок від газону з втратою енергії й тертям
        this.by = 0;
        if (this.bvy < -1.4) { this.bvy *= -0.5; v.ball.hop = 0.18; audio.wall && audio.wall(0, 3); } else this.bvy = 0;
        const fr = 1 - Math.min(1, dt * 1.6); this.bvx *= fr; this.bvz *= fr;
      }
      b.x += this.bvx * dt; b.z += this.bvz * dt; b.vx = this.bvx; b.vz = this.bvz;
      if (this.out === 'goal') {
        const back = this.gx + dir * (PITCH.GOAL_D - 0.5);
        if ((b.x - back) * dir > 0) { b.x = back; this.bvx *= -0.12; this.bvz *= 0.5; v.ball.squash(dir, 0, 0.2); }
        if (Math.abs(b.z) > G - 0.45) { b.z = Math.sign(b.z) * (G - 0.45); this.bvz *= -0.15; }
        if (this.by > H * 0.78) { this.by = H * 0.78; this.bvy = -Math.abs(this.bvy) * 0.2; }
      } else {
        // поза воротами: рекламні борти за ними не пускають м'яч далі
        const lim = this.gx + dir * (PITCH.GOAL_D + 5);
        if ((b.x - lim) * dir > 0) { b.x = lim; this.bvx *= -0.3; this.bvz *= 0.6; }
      }
      if (t > this.tArr + 2.6 && (this.gkDone || !this.gkGo)) this.endKick();
    }
  }

  endKick() {
    const m = this.m;
    this.state = 'between'; this.live = false;
    m.ui.hud.clearGoal();
    const vd = this.verdict();
    if (vd !== 0) { this.finish(vd > 0); return; }
    this.state = 'wait'; this.t = -0.4;
    this.keeper.p.setMode('idle'); this.kicker.p.setMode('idle');
  }

  /** Після syncView: висота м'яча (syncView її перезаписує). */
  post() { if (!this.over) this.m.view.ball.group.position.y = R + this.by; }

  finish(win) {
    const m = this.m, g = (arr) => arr.filter(Boolean).length;
    this.over = true;
    m.penRes = { me: g(this.res.me), opp: g(this.res.opp), win };
    this.el.remove();
    m.ui.hud.clearGoal();
    m.game.sm.go('MATCH', { resume: true });
    m.end();
  }
}
