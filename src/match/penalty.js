import * as THREE from 'three';
import { PITCH } from '../config.js';
import { audio } from '../core/audio.js';
import { ovr } from '../state/squad.js';

const { L, G, R } = PITCH;
const H = PITCH.GOAL_H, SPOT = 12, RUN = 3.6;            // висота воріт, відстань крапки до лінії, розбіг
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 0.9;
const _v = new THREE.Vector3(), _d = new THREE.Vector3();

/**
 * Серія пенальті: удар — ти ставиш кружечок у ворота; захист — ставиш кружечок, куди стрибає воротар.
 * Результат: траєкторія м'яча, стрибок воротаря й точність залежать від навичок.
 */
export class Penalties {
  constructor(m) { this.m = m; }

  start() {
    const m = this.m, ui = m.ui;
    m.phase = 'pens'; m.ts = 1; m.slow = false; m.slowT = 0; if (ui.setSlow) ui.setSlow(false); m.cancelAim(); m.hideAim && m.hideAim();
    ui.setMatchUi(false); ui.hud.warn(null); ui.hud.hint(null); ui.hud.setCard(null);
    this.k = 0; this.res = { me: [], opp: [] }; this.state = 'intro'; this.t = 0; this.mark = null; this.by = 0; this.over = false;
    const order = (arr) => arr.slice(1).map((a, i) => ({ a, i })).sort((x, y) => ovr(y.a.info) - ovr(x.a.info)).map((o) => o.a);
    this.orderMe = order(m.mine); this.orderOpp = order(m.opp);
    // решта гравців збираються біля центру
    [...m.mine, ...m.opp].forEach((a, n) => { a.body.on = false; a.p.setMode('idle'); a.p.vx = a.p.vz = 0; a.p.dribble = false; a.p.x = (a.side > 0 ? -1 : 1) * (4 + (n % 5) * 1.6); a.p.z = -7 + (n % 11) * 1.4; a.p.yaw = a.side > 0 ? 1.2 : -1.2; });
    this.build();
    ui.hud.banner('ПЕНАЛЬТІ', 'серія з п’яти ударів', 'ти б’єш і ловиш: став кружечок у ворота');
    audio.whistle(false);
    this.nextKick(1.6);
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
    return { p: _v.set(gx - dir * (SPOT + 16), 7.6, 0).clone(), l: _d.set(gx, 1.5, 0).clone(), fov: 40 };
  }

  /** Екран → точка в площині воріт (z, y). */
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

  // ---------------------------------------------------------------- послідовність ударів
  nextKick(delay = 1.0) {
    this.state = 'wait'; this.t = -delay; this.mark = null; this.markEl.hidden = true; this.go.disabled = true;
    this.go.style.visibility = 'hidden';
  }

  begin() {
    const m = this.m, k = this.k, me = k % 2 === 0, round = (k / 2) | 0;
    this.me = me; this.dir = me ? 1 : -1; this.gx = this.dir * L;
    this.kicker = (me ? this.orderMe : this.orderOpp)[round % 10];
    this.keeper = me ? m.opp[0] : m.mine[0];
    const sx = this.gx - this.dir * SPOT;
    const ball = m.ball; ball.x = sx; ball.z = 0; ball.vx = ball.vz = 0; this.by = 0;
    const kp = this.kicker.p, gp = this.keeper.p;
    kp.x = sx - this.dir * RUN; kp.z = -1.2; kp.vx = kp.vz = 0; kp.yaw = this.dir > 0 ? Math.PI / 2 : -Math.PI / 2; kp.setMode('idle'); kp.setExpr('neutral');
    gp.x = this.gx - this.dir * 0.8; gp.z = 0; gp.vx = gp.vz = 0; gp.yaw = this.dir > 0 ? -Math.PI / 2 : Math.PI / 2; gp.setMode('idle');
    const other = me ? m.mine : m.opp, oth2 = me ? m.opp : m.mine;
    for (const a of other) if (a !== this.kicker) { a.p.setMode('idle'); }
    for (const a of oth2) if (a !== this.keeper) { a.p.setMode('idle'); }
    this.state = 'aim'; this.t = 0; this.mark = null; this.markEl.hidden = true; this.go.disabled = true; this.go.style.visibility = 'visible';
    this.go.querySelector('b').textContent = me ? 'УДАР!' : 'СТРИБОК!';
    this.msg.innerHTML = me ? `<b>№${this.kicker.info.num} ${this.kicker.info.name.split(' ')[0]}</b> б’є пенальті<small>Тапни у ворота, куди бити</small>` : `<b>Б’є ${this.kicker.info.name.split(' ')[0]}</b><small>Тапни у ворота, куди стрибне воротар</small>`;
    this.m.ui.hud.setCard(null);
    audio.whistle(false);
  }

  decide() {
    const kp = this.kicker, gk = this.keeper, sh = kp.sk.shoot, aimMe = this.me;
    // куди б'є: мій кружечок або вибір суперника
    let aim;
    if (aimMe) aim = { z: this.mark.z, y: this.mark.y };
    else { const side = Math.random() < 0.5 ? -1 : 1, hi = Math.random() < 0.45; aim = { z: Math.random() < 0.18 ? 0 : side * G * (0.5 + 0.4 * Math.random()), y: hi ? H * 0.62 + H * 0.22 * Math.random() : 0.4 + 0.6 * Math.random() }; }
    const sig = 2.0 - 1.5 * sh;
    const act = { z: aim.z + gauss() * sig, y: Math.max(0.12, aim.y + gauss() * sig * 0.5) };
    // куди стрибає воротар
    let dive;
    if (!aimMe) dive = { z: this.mark.z, y: this.mark.y };
    else {
      const read = Math.random() < 0.28 + 0.3 * gk.sk.iq;                       // «прочитав» удар
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
    this.state = 'run'; this.t = 0; this.go.style.visibility = 'hidden';
    this.m.ui.hud.hint(null); this.msg.textContent = '';
    this.decide();
  }

  finishKick() {
    const m = this.m, goal = this.out === 'goal', me = this.me;
    (me ? this.res.me : this.res.opp).push(goal);
    this.dots();
    const msg = { goal: 'ГОЛ!', save: me ? 'ВОРОТАР ВІДБИВ!' : 'ТИ ЗАХИСТИВ ВОРОТА!', miss: 'МИМО!', post: 'ШТАНГА!' }[this.out];
    m.ui.hud.goal(msg, '', goal ? (me ? 'me' : 'opp') : (me ? 'opp' : 'me'));
    if (goal) { audio.goal(); m.view.stands.cheer(2.5); this.kicker.p.cheer(2.5); this.keeper.p.sad(2.5); m.game.addTrauma(0.35); }
    else { audio.save(); this.kicker.p.sad(2.2); if (this.out === 'save') this.keeper.p.cheer(2.2); }
    this.state = 'result'; this.t = 0;
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

  update(rawDt) {
    const m = this.m, dt = rawDt, kp = this.kicker, gk = this.keeper;
    this.t += dt;
    const v = m.view;
    if (this.state === 'intro' || this.state === 'wait') { if (this.t >= 0) { this.begin(); } }
    else if (this.state === 'aim') { this.placeMark(); }
    else if (this.state === 'run') {
      const T = 0.62, sx = this.gx - this.dir * SPOT;
      if (this.t < T) {
        const q = this.t / T, x0 = sx - this.dir * RUN;
        kp.p.x = x0 + (sx - x0) * q; kp.p.vx = this.dir * (RUN / T); kp.p.vz = 0;
      } else if (!this.kicked) {
        this.kicked = true; kp.p.vx = kp.p.vz = 0; kp.p.x = sx - this.dir * 0.3; kp.p.kick(1);
        audio.kick(1); v.ball.squash(this.dir, 0, 0.25);
        const hi = this.dive.y > H * 0.42;
        gk.p.gkDive(Math.sign(this.dive.z || 1) * (this.dir > 0 ? 1 : -1) * 1, hi ? 0 : 1);
        this.gkT = 0; this.gkZ0 = gk.p.z; this.gkTz = clamp(this.dive.z * 0.92, -G + 0.6, G - 0.6);
        this.fly = { t: 0, from: { x: sx, z: 0 } };
      }
      if (this.kicked) {
        this.gkT += dt; const gq = clamp(this.gkT / 0.42, 0, 1), ge = 1 - Math.pow(1 - gq, 3);
        gk.p.z = this.gkZ0 + (this.gkTz - this.gkZ0) * ge;
        const f = this.fly; f.t += dt;
        const D = 0.62, q = clamp(f.t / D, 0, 1), a = this.act;
        let tx = this.gx, tz = a.z, ty = Math.max(a.y, 0.1);
        if (this.out === 'save') { tx = this.gx - this.dir * 0.4; tz = this.dive.z * 0.9; ty = this.dive.y; }
        if (this.out === 'miss') { tx = this.gx + this.dir * 6; ty = clamp(a.y, 0.1, 6); }
        if (this.out === 'post') { tx = this.gx; tz = Math.sign(a.z || 1) * G; ty = Math.sign(a.y - 1.2) > 0 ? H : a.y; }
        const b = m.ball;
        b.x = f.from.x + (tx - f.from.x) * q; b.z = f.from.z + (tz - f.from.z) * q;
        this.by = ty * q + Math.sin(q * Math.PI) * 0.7;
        b.vx = this.dir * 30; b.vz = 0;
        if (q >= 1 && !this.landed) {
          this.landed = true;
          if (this.out === 'goal') { this.net = { x: this.gx + this.dir * 1.8, z: tz + (Math.random() - 0.5) * 1.5, t: 0 }; v.ball.squash(this.dir, 0, 0.3); }
          else if (this.out === 'save') { gk.p.parry(); v.ball.squash(this.dir, 0, 0.3); this.net = { x: this.gx - this.dir * 3, z: tz + gauss() * 4, t: 0, fall: true }; }
          else if (this.out === 'post') { audio.wall(0, 24); v.particles.burst(this.gx, ty, tz, 8, 5, 0.4, 0.2, ['#fff', '#ddd'], 10, 0.6); this.net = { x: this.gx - this.dir * 5, z: tz * 1.1, t: 0, fall: true }; }
          else this.net = { x: this.gx + this.dir * 8, z: tz, t: 0 };
          this.finishKick();
          this.kicked = false; this.landed = false;
        }
      }
    } else if (this.state === 'result') {
      const n = this.net;
      if (n) {
        n.t += dt; const b = m.ball, k = Math.min(1, dt * 5);
        b.x += (n.x - b.x) * k; b.z += (n.z - b.z) * k; b.vx = b.vz = 0;
        this.by = Math.max(0, this.by - dt * 4.5);
      }
      if (this.t > 2.1) {
        m.ui.hud.clearGoal();
        const vd = this.verdict();
        if (vd !== 0) return this.finish(vd > 0);
        this.nextKick(0.6);
      }
    }
    this.placeMark();
  }

  /** Після syncView: виставляємо висоту м'яча (syncView перезаписує position.y). */
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
