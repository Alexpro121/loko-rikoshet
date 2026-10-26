import { PITCH, PHYS, FIXTURES, ACADEMY } from '../config.js';
import { CLUB, CHRONICLE } from '../club.js';
import { World } from '../physics/world.js';
import { AimPath } from '../physics/aim.js';
import { MatchView } from './view.js';
import { Actor, Team } from './team.js';
import { audio, vibrate } from '../core/audio.js';
import { S, commit } from '../state/save.js';
import { powerMult, incomeMult, striker, keeper } from '../state/economy.js';
import { oppSquad, skillOf, gkBonus, gainXp, ovr, tierOf, keysFor, ROLE_UA, STAT_NAMES } from '../state/squad.js';

const { L, W, G, R } = PITCH;
const H = 1 / PHYS.hz;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rand = (a, b) => a + Math.random() * (b - a);
const DEG = Math.PI / 180;
const MY_FORMATION = '433';

export class Match {
  constructor(game) {
    this.game = game; this.ui = game.ui;
    this.world = new World();
    this.view = new MatchView();
    this.path = new AimPath(this.world);
    const v = this.view;
    this.mine = v.mine.map((p, i) => new Actor(p, 1, i === 0 ? 0.95 : 0.5));
    this.opp = v.opp.map((p, i) => new Actor(p, -1, i === 0 ? 0.95 : 0.5));
    this.oppBodies = this.opp.map((a) => a.body);
    this.mine[0].body.e = this.opp[0].body.e = 0.8; this.mine[0].body.sep = this.opp[0].body.sep = 4;
    this.myTeam = new Team(1, this.mine); this.oppTeam = new Team(-1, this.opp);
    this.actors = [...this.mine, ...this.opp];
    this.world.bodies = this.actors.map((a) => a.body);
    this.ball = this.world.ball;
    this.ctx = { ball: this.ball, bs: 'ready', owner: 1, readyT: 0, stealTime: 6, opps: this.opp, all: this.actors };
    this.protectT = 0; this.receiverT = 0; this.passTarget = null; this.pressWarn = false;
    this.slow = false; this.slowT = 0; this.beatT = 0; this.danger = 0;
    this.kickoff = true; this.shotId = 0; this.slideT = 0; this.slideShotId = -1; this.slideTries = 0; this.slid = false;
    this.glideT = 0; this.glideX = 0; this.glideZ = 0; this.tapT = 0; this.hopT = 0; this.celeb = null; this.shooter = null; this.lastOppTaker = null;

    this.cb = {
      wall: (nx, nz, impact, e) => this.onWall(nx, nz, impact, e),
      post: (nx, nz, impact) => this.onPost(nx, nz, impact),
      body: (b, vn, nx, nz, speed) => this.onBody(b, vn, nx, nz, speed),
    };
    this.phase = 'idle';
    this.joy = { dx: 0, dy: 0, m: 0 }; this.joyMode = false; this.scr = { x: 0, y: 0 };
    this.anchor = { x: 0, y: 0 }; this.ptr = { x: 0, y: 0 }; this.anchorW = { x: 0, z: 0 }; this.curW = { x: 0, z: 0 };
    this.shot = { vx: 0, vz: 0, power: 0, valid: false, dirx: 1, dirz: 0 };
    this.time = 0; this.acc = 0; this.ts = 1;
    this.counterV = { vx: 0, vz: 0 };
    this.holder = null; this.taker = null; this.bs = 'ready'; this.owner = 1; this.readyT = 0;
  }

  // ------------------------------------------------------------------ старт
  start(spec) {
    this.spec = spec;
    const v = this.view;
    this.mySquad = S.squad; this.oppSq = oppSquad(spec);
    v.setup(spec, MY_FORMATION, this.mySquad, this.oppSq);
    const gb = gkBonus();
    this.mine.forEach((a, i) => { a.info = this.mySquad[i]; a.sk = skillOf(a.info, i === 0 ? gb : 0); });
    this.opp.forEach((a, i) => { a.info = this.oppSq[i]; a.sk = skillOf(a.info); });
    this.xp = new Array(11).fill(0); this.levelUps = [];
    this.kk = keeper(); this.st = striker();
    this.myTeam.setFormation(MY_FORMATION); this.oppTeam.setFormation(spec.formation);
    const mg = this.mine[0].sk, og = this.opp[0].sk;
    Object.assign(this.myTeam, { speed: 9.2, gkSpeed: 6 + 7 * mg.react, gkTrack: 0.35 + 0.6 * mg.iq, gkErr: (1.15 - mg.react) * 3.0 });
    Object.assign(this.oppTeam, { speed: 8.4, press: spec.press, line: spec.line, gkSpeed: 5 + 6 * og.react, gkTrack: 0.25 + 0.65 * og.iq, gkErr: (1.2 - og.react) * 3.4 });
    this.mine[0].body.r = this.mine[0].baseR = Math.max(0.9, 0.7 + 0.6 * mg.reach);
    this.opp[0].body.r = this.opp[0].baseR = Math.max(0.9, 0.7 + 0.6 * og.reach);
    this.score = { me: 0, opp: 0 };
    this.clock = spec.time; this.golden = false; this.timeUp = false; this.timeUpWait = 0;
    this.coins = 0; this.stats = { goals: 0, combo: 1, saves: 0 };
    this.phase = 'intro'; this.introT = 0; this.hitStop = 0; this.ts = 1; this.acc = 0;
    this.aiming = false; this.endT = 0; this.goalT = 0; this.resultSent = false;
    this.lastClock = -1;
    this.holder = null; this.taker = null;
    this.formation();
    const hud = this.ui.hud;
    hud.show(spec);
    hud.setScore(0, 0); hud.setTime(this.timeText(), false); hud.setCoins(0);
    hud.warn(null); hud.hint(null);
    hud.banner(spec.club.name, spec.leagueName + ' · матч ' + spec.no + ' з ' + spec.of + (spec.final ? ' · ФІНАЛ' : ''), spec.note || CLUB.slogan);
    audio.music('match'); audio.crowd(0.7);
    this.game.setIntroCam(true);
    this.game.snapCamera();
  }

  /**
   * Стартова розстановка за правилами: кожна команда на своїй половині, суперник поза центральним колом,
   * нападник із м'ячем у центрі. Поки не зроблено перший удар, ніхто не рухається з місця.
   */
  formation() {
    const b = this.ball;
    b.x = 0; b.z = 0; b.vx = b.vz = 0;
    const FR = { D: 0.46, M: 0.68, W: 0.8, F: 0.9 };         // частка половини від своїх воріт
    // виконавець: центральний нападник мого складу
    let hold = this.mine[1], bv = 9;
    for (let i = 1; i < this.mine.length; i++) { const r = this.mine[i].role; if (r.line === 'F' && Math.abs(r.v) < bv) { bv = Math.abs(r.v); hold = this.mine[i]; } }
    for (const t of [this.myTeam, this.oppTeam]) {
      const side = t.side, R0 = side > 0 ? 9.4 : 10.4;
      t.gk.place(-side * L + side * 1.9, 0);
      t.out.forEach((a) => {
        const f = FR[a.role.line] || 0.7;
        let x = -side * L + side * f * L, z = a.role.v * (W - 4.5);
        if (a !== hold) {                                      // поза центральним колом
          const d = Math.hypot(x, z);
          if (d < R0) { if (d < 0.01) { x = -side * R0; z = 0; } else { x *= R0 / d; z *= R0 / d; } }
        }
        a.place(x, z); a.kx = x; a.kz = z;
        a.manual = false; a.cool = 0; a.noTrap = 0; a.stun = 0; a.receiver = false; a.hug = false; a.frozen = 0; a.slide = null; a.dive = null; a.sliding = false; a.slideCool = 0; a.decided = -1; a.body.r = a.baseR; a.p.dribble = false; a.p.setThreat(0, 0); a.body.on = true; a.p.setMode('idle');
      });
      t.gk.manual = false; t.gk.cool = 0; t.gk.noTrap = 0; t.gk.stun = 0; t.gk.frozen = 0; t.gk.slide = null; t.gk.dive = null; t.gk.sliding = false; t.gk.slideCool = 0; t.gk.decided = -1; t.gk.body.r = t.gk.baseR; t.gk.p.setMode('idle');
      for (const a of [t.gk, ...t.out]) a.p.yaw = side > 0 ? Math.PI / 2 : -Math.PI / 2;
    }
    hold.place(-1.8, 0); hold.kx = -1.8; hold.kz = 0;
    this.kickoff = true;
    this.makeReady(hold, true);
    this.hideAim();
    this.shotBy = 0; this.shotBounces = 0; this.counter = false; this.looseT = 0; this.protectT = 0; this.pressWarn = false;
  }

  timeText() { const s = Math.max(0, Math.ceil(this.clock)); const m = (s / 60) | 0, r = s % 60; return m + ':' + (r < 10 ? '0' : '') + r; }

  // ------------------------------------------------------------------ керування
  pointerDown(x, y) {
    if (this.phase !== 'play' || this.bs !== 'ready') return;
    if (this.ui.useJoy()) return;                         // на телефоні цілимось джойстиком
    this.joyMode = false;
    this.anchor.x = x; this.anchor.y = y; this.ptr.x = x; this.ptr.y = y;
    this.glideT = 0;
    this.bs = 'aim'; this.aiming = true; this.shot.valid = false; this.aimDirty = true;
    this.ui.hud.hint(null);
    audio.click();
  }
  /** Джойстик: штовхаєш у бік удару, величина відхилення задає силу, відпускаєш — удар. */
  joyStart() {
    if (this.phase !== 'play' || this.bs !== 'ready') return;
    this.joyMode = true; this.joy.m = 0; this.glideT = 0;
    this.bs = 'aim'; this.aiming = true; this.shot.valid = false; this.aimDirty = true;
    this.ui.hud.hint(null);
    audio.click(); vibrate(8);
  }
  joyMove(dx, dy, m) { if (this.bs !== 'aim' || !this.joyMode) return; this.joy.dx = dx; this.joy.dy = dy; this.joy.m = m; this.aimDirty = true; }

  pointerMove(x, y) { if (this.bs === 'aim') { this.ptr.x = x; this.ptr.y = y; this.aimDirty = true; } }
  pointerUp() {
    if (this.bs !== 'aim') return;
    this.updateAim();                                    // остання позиція пальця, навіть якщо кадр ще не оновився
    this.aiming = false; this.hideAim();
    if (!this.shot.valid) { this.bs = 'ready'; this.holder.p.setMode('idle'); return; }
    this.bs = 'wind'; this.windT = 0.14; this.ts = 1; this.holder.p.kick(this.shot.power); this.holder.p.setMode('idle');
    if (!S.tutorial) { S.tutorial = true; commit(); }
  }
  hideAim() { const v = this.view; v.aim.hide(); v.ring.visible = false; v.band.visible = false; }
  cancelAim() {
    if (this.bs === 'aim') { this.bs = 'ready'; this.aiming = false; this.hideAim(); this.holder.p.setMode('idle'); }
  }

  /** Сильний удар залежить від навички «Удар» виконавця; пас — від «Пасу» (точність). */
  shotMul(p) { return p >= 0.45 ? 0.9 + 0.2 * this.holder.sk.shoot : 1; }

  updateAim() {
    const sh = this.shot, b = this.ball, g = this.game;
    let dirx = 0, dirz = 0, power = 0, valid = false;
    if (this.joyMode) {
      const j = this.joy;
      g.worldToScreen(b.x, b.z, this.scr);
      g.screenToGround(this.scr.x, this.scr.y, this.anchorW);
      g.screenToGround(this.scr.x + j.dx * 140, this.scr.y + j.dy * 140, this.curW);
      const px = this.curW.x - this.anchorW.x, pz = this.curW.z - this.anchorW.z, wl = Math.hypot(px, pz);
      valid = j.m > 0.14 && wl > 0.01;
      if (valid) { dirx = px / wl; dirz = pz / wl; power = clamp((j.m - 0.14) / 0.86, 0, 1); }
    } else {
      g.screenToGround(this.anchor.x, this.anchor.y, this.anchorW);
      g.screenToGround(this.ptr.x, this.ptr.y, this.curW);
      const px = this.anchorW.x - this.curW.x, pz = this.anchorW.z - this.curW.z, wl = Math.hypot(px, pz);
      const pxl = Math.hypot(this.anchor.x - this.ptr.x, this.anchor.y - this.ptr.y), hh = g.h;
      const minPx = hh * PHYS.pullMinFrac, maxPx = hh * PHYS.pullMaxFrac;
      valid = pxl > minPx && wl > 0.01;
      if (valid) { dirx = px / wl; dirz = pz / wl; power = clamp((pxl - minPx) / (maxPx - minPx), 0, 1); }
    }
    sh.valid = valid;
    if (!valid) { this.hideAim(); sh.power = 0; return; }
    sh.dirx = dirx; sh.dirz = dirz; sh.power = power;
    const speed = Math.min(PHYS.maxSpeed, PHYS.baseShot * powerMult() * (0.28 + 0.72 * sh.power) * this.shotMul(sh.power));
    sh.vx = sh.dirx * speed; sh.vz = sh.dirz * speed;
    const v = this.view;
    if (this.aimDirty) {
      this.path.setCircles(this.oppBodies, null);      // свої не заважають сильному удару, тож приціл рахує лише суперника
      this.path.simulate(b.x, b.z, sh.vx, sh.vz, this.st.bounces);
      this.aimDirty = false;
      v.aim.mat.color.setHex(0xffffff);
      v.ring.visible = true; v.band.visible = true;
      const bl = 2 + sh.power * 7;
      v.band.position.set(b.x - sh.dirx * bl / 2, 0.08, b.z - sh.dirz * bl / 2);
      v.band.scale.x = bl; v.band.rotation.y = -Math.atan2(sh.dirz, sh.dirx);
      v.ring.material.color.setHSL(0.36 - 0.34 * sh.power, 0.65, 0.62);
      v.ring.position.set(b.x, 0.07, b.z); v.ring.scale.setScalar(1.1 + sh.power * 1.2);
    }
    v.aim.draw(this.path, 1.1, 1.15, this.time * 5);
    const p = this.holder.p;
    p.yaw = Math.atan2(sh.dirx, sh.dirz); p.setMode('aim'); p.power = sh.power;
  }

  // ------------------------------------------------------------------ події фізики
  onWall(nx, nz, impact, e) {
    if (e < 0.5) return;
    const b = this.ball, v = this.view;
    if (this.bs === 'roll') this.shotBounces++;
    audio.wall(this.shotBounces, impact);
    v.ball.squash(nx, nz, Math.min(0.3, impact / 110));
    v.particles.burst(b.x - nx * R, 0.5, b.z - nz * R, Math.min(6, 2 + (impact / 8) | 0), 3 + impact * 0.1, 0.3, 0.2, ['#e9efe6', '#b9c9b5'], 10, 0.5);
    this.game.addTrauma(Math.min(0.14, impact / 300));
    if (this.bs === 'roll' && this.shotBy > 0 && this.shotBounces >= 2) this.ui.hud.combo(this.shotBounces);
  }
  onPost(nx, nz, impact) {
    audio.wall(5, impact); this.view.ball.squash(nx, nz, 0.3);
    this.view.particles.burst(this.ball.x, 0.6, this.ball.z, 8, 6, 0.5, 0.22, ['#ffffff', '#d9dcd8'], 10, 0.6);
    this.game.addTrauma(0.18);
    this.floatAt(this.ball.x, this.ball.z, 'СТОВП!', 'warn');
  }

  onBody(b, vn, nx, nz, speed) {
    const a = b.ref, v = this.view;
    if (a.sliding && this.bs === 'roll') return this.onSlideContact(a, speed, nx, nz);
    if (this.bs === 'ready' || this.bs === 'aim') {          // суперник дотягнувся до м'яча, який ми тримаємо
      if (a.side < 0) this.attemptTackle(a);
      return true;
    }
    if (this.bs !== 'roll') return true;
    // швидкість, повільніше за яку гравець гасить м'яч: приймач паса ловить точно, свої підбирають охочіше
    const sk = a.sk, ctl = 0.8 + 0.5 * sk.drib;
    const limit = a.receiver ? 34 : a.isGK ? PHYS.trapSpeed * (1.2 + 0.8 * sk.hands) : (a.side > 0 ? PHYS.trapSpeed * 1.35 : PHYS.trapSpeed) * ctl;
    if (speed < limit && a.noTrap <= 0) {
      if (a.side > 0) { if (a.isGK || Math.random() < 0.6 + 0.4 * sk.drib) { this.trapMine(a, speed); return true; } }
      else if (a.receiver || (this.protectT <= 0 && Math.random() < (0.34 + 0.34 * this.oppTeam.press + (a.isGK ? 0.3 : 0)) * (0.7 + 0.6 * (a.isGK ? sk.hands : sk.drib)))) { this.trapOpp(a, speed); return true; }
      a.noTrap = 0.45; a.p.control();                         // не впорався з прийомом: короткий відскок
      if (speed < 6) return true;                              // повільний м'яч не штовхаємо, нехай інший підбере
    }
    if (a.isGK) {
      audio.save(); this.stats.saves += a.side < 0 ? 1 : 0;
      a.p.parry(); audio.thud(); if (a.side > 0) this.addXp(a, 25);
      this.floatAt(a.p.x, a.p.z, a.side > 0 ? 'СЕЙВ!' : 'ВОРОТАР!', a.side > 0 ? 'good' : 'warn');
    } else {
      audio.wall(0, 8);
      if (speed > 24) { const q = Math.random(); if (q < 0.4) a.p.header(); else if (q < 0.7) a.p.block(); else a.p.hit(); }
    }
    v.ball.squash(nx, nz, 0.22);
    return false;
  }

  /** Шанс відбору: навичка «Відбір» супротивника проти «Дриблінгу» виконавця; сила ліги задає базу. */
  tackleChance(a) { const h = this.holder ? this.holder.sk.drib : 0.4; return clamp(this.spec.tackle * (0.75 + 0.5 * a.sk.tack) - (h - 0.4) * 0.35, 0.3, 0.97); }

  addXp(actor, n) { const i = this.mine.indexOf(actor); if (i >= 0) this.xp[i] += n; }

  /** Картка гравця з м'ячем у HUD. */
  showCard(a) {
    if (!a || !a.info) { this.ui.hud.setCard(null); return; }
    const e = a.info, keys = keysFor(e.line).slice().sort((x, y) => e.stats[y] - e.stats[x]).slice(0, 3), o = ovr(e);
    this.ui.hud.setCard({ name: e.name, num: e.num, ovr: o, tier: tierOf(o), role: ROLE_UA[e.role] || '', bars: keys.map((k) => [STAT_NAMES[k], e.stats[k]]) }, a.side);
  }

  /** Відбір: шанс залежить від пресингу; невдала спроба «оглушує» захисника й відтерміновує наступну. */
  attemptTackle(a) {
    if (a.noTrap > 0 || a.stun > 0) return;
    if (Math.random() < this.tackleChance(a)) {
      const h = this.holder;
      this.cancelAim(); a.p.tackle(); h.p.stumble(); h.p.setThreat(0, 0); h.stun = 1.4; h.frozen = 1.2; h.manual = false;
      this.floatAt(a.p.x, a.p.z, 'ВІДІБРАВ!', 'warn'); this.trapOpp(a, 0);
    } else {
      a.stun = 1.0; a.noTrap = 1.1; a.frozen = 0.8; a.p.stumble();
      this.floatAt(this.holder.p.x, this.holder.p.z, 'ЗАХИСТИВ М’ЯЧ!', 'good'); audio.pass(); this.addXp(this.holder, 12);
    }
  }

  // ------------------------------------------------------------------ володіння
  /** Ставить м'яч до ніг: soft — м'яч плавно докочується, замість миттєвого стрибка. */
  placeBallAt(a, soft) {
    const b = this.ball, dir = a.side > 0 ? 1 : -1;
    b.vx = b.vz = 0;
    const tx = clamp(a.p.x + dir * 1.25, -L + 2, L - 2), tz = clamp(a.p.z, -W + 1.5, W - 1.5);
    if (soft) { this.glideX = tx; this.glideZ = tz; this.glideT = 0.4; } else { b.x = tx; b.z = tz; this.glideT = 0; }
  }

  /** Мій гравець «приймає» м'яч і стає виконавцем: можна цілитись (це й є пас). */
  trapMine(a, speed = 0) {
    if (a.cool > 0) return;
    if (this.shotBy === 1 && this.shooter && a !== this.shooter && this.bs === 'roll') { this.addXp(this.shooter, 10); this.addXp(a, 6); this.floatAt(a.p.x, a.p.z, 'ПАС!', 'good'); }
    if (a.isGK) this.addXp(a, 25);
    this.placeBallAt(a, true); audio.pass();
    a.p.setExpr('happy', 0.5);
    if (a.isGK) { a.p.setMode('catch', 0.9); this.floatAt(a.p.x, a.p.z, 'СЕЙВ!', 'good'); }
    else if (speed > 11) a.p.chest(); else a.p.control();
    this.view.ball.hop = 0.3;
    this.clearReceivers();
    this.makeReady(a);
  }

  makeReady(a, kickoff) {
    this.bs = 'ready'; this.owner = 1; this.readyT = 0; this.counter = false; this.shotBy = 0;
    if (this.holder && this.holder !== a) this.holder.manual = false;
    if (this.holder && this.holder !== a) this.holder.p.setThreat(0, 0);
    this.holder = a; a.manual = true;
    if (!a.isGK || kickoff) a.p.setMode('idle');
    this.tapT = 0.5; this.hopT = 0; this.showCard(a);
    if (this.taker) { this.taker.manual = false; this.taker = null; }
    this.hideAim();
    this.ui.hud.warn(null);
    this.looseT = 0;
  }

  /** Суперник отримує м'яч: веде його до наших воріт і б'є. */
  trapOpp(a, speed = 0) {
    if (a.cool > 0) return;
    this.placeBallAt(a, true);
    if (this.holder) this.holder.manual = false;
    this.bs = 'held'; this.owner = -1; this.taker = a; a.manual = true; this.counter = true;
    this.showCard(a);
    this.dribbleT = 0; this.tackleT = 0; this.telegraph = false; this.thinkT = 0.15; this.dribZ = a.p.z; this.clearReceivers();
    if (speed > 11) a.p.chest(); else a.p.control();
    a.p.dribble = !a.isGK;
    this.ui.hud.warn('КОНТРАТАКА!');
    a.p.setExpr('angry', 1);
    if (a.isGK) { a.p.setMode('catch', 0.9); audio.save(); }
    this.aiming = false; this.hideAim();
  }

  clearReceivers() { for (let i = 0; i < this.opp.length; i++) this.opp[i].receiver = false; this.passTarget = null; this.receiverT = 0; }

  /** Найменша відстань від відрізка (x1,z1)-(x2,z2) до гравців списку, починаючи з індексу from. */
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
   * Оцінка паса: наскільки вперед, чи вільна лінія, чи вільний партнер, чи небезпечна позиція біля наших воріт.
   * Під тиском дозволені бічні й задні передачі, щоб зберегти м'яч.
   */
  choosePass(a, pm) {
    let best = null, bs = -99;
    const gkTaker = a.isGK;
    for (let i = 1; i < this.opp.length; i++) {
      const q = this.opp[i];
      if (q === a || q.stun > 0 || q.frozen > 0 || q.sliding) continue;
      const dx = q.p.x - a.p.x, dz = q.p.z - a.p.z, len = Math.hypot(dx, dz);
      if (len < 5 || len > 44) continue;
      const fwd = (a.p.x - q.p.x) / 18;                                   // наші ворота зліва: уперед = менший x
      if (!gkTaker && fwd < -0.25 && pm > 5.5) continue;                  // назад тільки під тиском
      const lane = this.laneClear(a.p.x, a.p.z, q.p.x, q.p.z, this.mine, 0);
      if (lane < 1.7) continue;
      const open = clamp(this.laneClear(q.p.x, q.p.z, q.p.x, q.p.z, this.mine, 1) / 6, 0, 1.3);
      const deep = q.p.x + L < 26 ? 1 + (this.laneClear(q.p.x, q.p.z, -L, 0, this.mine, 0) > 2.5 ? 1 : 0) : 0;
      const score = fwd * 2.4 + open * 1.7 + Math.min(lane, 4) * 0.5 + deep - len * 0.03 + (Math.random() - 0.5) * (1 - a.sk.iq) * 3.5;
      if (score > bs) { bs = score; best = q; }
    }
    if (!best) return null;
    this.passScore = bs;
    return best;
  }

  /** Віддати пас партнеру: м'яч летить на випередження, партнер біжить на прийом. */
  passTo(a, best) {
    const b = this.ball;
    const err = (1 - a.sk.pass) * 3.2;
    const dx = best.p.x + best.p.vx * 0.35 - b.x + (Math.random() - 0.5) * err, dz = best.p.z + best.p.vz * 0.35 - b.z + (Math.random() - 0.5) * err, d = Math.hypot(dx, dz) || 1;
    const sp = clamp(16 + d * 0.9, 22, 46) * (0.92 + 0.16 * a.sk.pass);
    b.vx = (dx / d) * sp; b.vz = (dz / d) * sp;
    a.p.dribble = false; if (a.isGK) a.p.throwBall(); else a.p.kick(0.35);
    a.cool = 0.35; a.noTrap = 1.3; a.manual = false; this.taker = null; this.lastOppTaker = a;
    best.receiver = true; this.passTarget = best; this.receiverT = 3.2;
    audio.pass();
    this.bs = 'roll'; this.owner = 0; this.shotBy = -2; this.shotBounces = 0; this.looseT = 0; this.counter = true; this.protectT = 0; this.shotId++; this.ui.hud.setCard(null);
    this.ui.hud.warn(null);
  }

  /** Підготувати удар у вибрану точку воріт (з попередженням-прицілом). */
  startShot(a, tz) {
    const b = this.ball, spec = this.spec;
    this.telegraph = true; this.shootT = 0.5;
    const z = tz * (0.55 + 0.45 * this.kk.concede);
    const dx = -L - 1 - b.x, dz = z - b.z, d = Math.hypot(dx, dz) || 1;
    const sp = spec.counterSpeed * (a.isGK ? 1.05 : 1) * (0.9 + 0.2 * a.sk.shoot);
    this.counterV.vx = (dx / d) * sp; this.counterV.vz = (dz / d) * sp;
    this.path.setCircles(this.world.bodies, a.body);
    this.path.simulate(b.x, b.z, this.counterV.vx, this.counterV.vz, 1);
    this.view.aim.mat.color.setHex(0xe5484d);
  }

  /** Рішення носія м'яча раз на ~0.3 с: удар, пас чи ведення. */
  takerThink(a, pm, toGoal) {
    if (this.telegraph) return;
    // 1) удар: близько й є просвіт, або під тиском біля воріт
    if (!a.isGK && toGoal < 56) {
      let bz = 0, bc = -1;
      const zs = [-G + 1.1, -G * 0.4, G * 0.4, G - 1.1];
      for (let i = 0; i < 4; i++) { const c = this.laneClear(a.p.x, a.p.z, -L, zs[i], this.mine, 0); if (c > bc) { bc = c; bz = zs[i]; } }
      const close = toGoal < 28;
      if ((close && bc > 1.5) || (toGoal < 42 && bc > 2.6 && Math.random() < 0.5) || (close && pm < 3.2)) { this.startShot(a, bz); return; }
    }
    // 2) пас: під тиском охоче, інакше лише коли партнер явно кращий
    const opt = this.choosePass(a, pm);
    if (opt && (a.isGK || (pm < 5.5 && this.passScore > 0.2) || (this.passScore > 3.4 && this.dribbleT > 0.6))) { this.passTo(a, opt); return; }
    if (a.isGK && this.dribbleT > 0.9) { this.startShot(a, rand(-G + 1, G - 1)); return; }      // немає кому віддати: довгий удар
    // 3) ведення: шукаємо вільну доріжку
    if (!a.isGK) {
      let bz = a.p.z, bs = -99;
      const zs = [-20, -11, -3, 3, 11, 20];
      for (let i = 0; i < 6; i++) {
        const c = this.laneClear(a.p.x, a.p.z, a.p.x - 20, zs[i], this.mine, 1);
        const sc = Math.min(c, 6) - Math.abs(zs[i] - a.p.z) * 0.05 - Math.abs(zs[i]) * 0.03;
        if (sc > bs) { bs = sc; bz = zs[i]; }
      }
      this.dribZ = bz;
    }
    if (this.dribbleT > 3.8) this.startShot(a, rand(-G + 1, G - 1));
  }

  /** Володіння суперника: ведення, спроба відбору нашими, пас або удар. */
  updateTaker(dt) {
    const a = this.taker, b = this.ball;
    this.dribbleT += dt; this.thinkT -= dt;
    const toGoal = a.p.x + L;
    let pm = 99;
    for (let i = 1; i < this.mine.length; i++) { const m = this.mine[i].p, d = Math.hypot(m.x - a.p.x, m.z - a.p.z); if (d < pm) pm = d; }
    if (this.thinkT <= 0) { this.thinkT = 0.5 - 0.3 * a.sk.iq; this.takerThink(a, pm, toGoal); if (this.bs !== 'held') return; }
    if (!a.isGK) {
      this.oppTeam.avoid(a, this.actors);
      a.move(-L + 22, clamp(this.dribZ === undefined ? a.p.z : this.dribZ, -W + 3, W - 3), this.oppTeam.speed * (pm < 4 ? 1.05 : 0.95), dt);
      if (Math.hypot(a.p.vx, a.p.vz) > 0.5) a.p.yaw = Math.atan2(a.p.vx, a.p.vz);
    } else { a.p.vx = a.p.vz = 0; a.p.yaw = -Math.PI / 2; }
    const fl = Math.hypot(a.p.vx, a.p.vz);
    const dirx = fl > 0.5 ? a.p.vx / fl : -1, dirz = fl > 0.5 ? a.p.vz / fl : 0;
    const tap = 1.15 + 0.28 * Math.sin(a.p.phase * 2);          // м'яч «підбивається» в такт крокам
    const kf = Math.min(1, dt * 22);
    b.x += (a.p.x + dirx * tap - b.x) * kf; b.z += (a.p.z + dirz * tap - b.z) * kf; b.vx = a.p.vx; b.vz = a.p.vz;
    this.glideT = 0;
    let near = null;
    for (let i = 1; i < this.mine.length; i++) {
      const m = this.mine[i]; if (m.manual || m.frozen > 0) continue;
      const dx = m.p.x - a.p.x, dz = m.p.z - a.p.z;
      if (dx * dx + dz * dz < 2.9 * 2.9) { near = m; break; }
    }
    this.tackleT = near ? this.tackleT + dt : Math.max(0, this.tackleT - dt * 1.5);
    if (this.tackleT > 0.5 && near && !a.isGK) {
      this.tackleT = 0;
      near.p.tackle();
      if (Math.random() < clamp(0.5 + (near.sk.tack - a.sk.drib) * 0.6, 0.2, 0.92)) {
        this.addXp(near, 25);
        this.floatAt(near.p.x, near.p.z, 'ПЕРЕХОПИЛИ!', 'good'); audio.pass();
        a.noTrap = 1.5; a.stun = 1.4; a.frozen = 1.2; a.manual = false; this.taker = null; a.p.dribble = false; a.p.stumble();
        this.placeBallAt(near, true); near.noTrap = 0; near.p.control(); this.makeReady(near);
        return;
      }
      near.stun = 1.4; near.frozen = 1.0; near.p.stumble(); this.floatAt(near.p.x, near.p.z, 'НЕ ДОТЯГНУВСЯ', 'warn');
    }
    if (this.telegraph) {
      this.shootT -= dt;
      this.view.aim.draw(this.path, 1.1, 1.3, this.time * 3);
      if (this.shootT <= 0) this.releaseCounter();
    }
  }

  releaseCounter() {
    const b = this.ball, a = this.taker, c = this.counterV;
    const j = rand(-1, 1) * 2.5 * DEG * (this.spec.gkErr / 3) * (1.7 - 1.2 * a.sk.shoot), cs = Math.cos(j), sn = Math.sin(j);
    b.vx = c.vx * cs - c.vz * sn; b.vz = c.vx * sn + c.vz * cs;
    a.p.dribble = false; if (a.isGK) a.p.throwBall(); else a.p.kick(0.9);
    a.cool = 0.35; a.noTrap = 1.3; a.manual = false; this.taker = null; this.lastOppTaker = a;
    audio.kick(0.8);
    this.bs = 'roll'; this.owner = 0; this.shotBy = -1; this.shotBounces = 0; this.looseT = 0; this.protectT = 0; this.shotId++; this.ui.hud.setCard(null);
    this.hideAim(); this.ui.hud.warn(null);
  }

  launchShot() {
    const b = this.ball, sh = this.shot, h = this.holder;
    const j = rand(-1, 1) * this.st.jitter * (1.5 - 0.9 * (sh.power >= 0.45 ? h.sk.shoot : h.sk.pass)) * DEG, cs = Math.cos(j), sn = Math.sin(j);
    b.vx = sh.vx * cs - sh.vz * sn; b.vz = sh.vx * sn + sh.vz * cs;
    this.bs = 'roll'; this.owner = 0; this.shotBy = 1; this.shotBounces = 0; this.looseT = 0; this.ts = 1; this.shotId++; this.kickoff = false; this.ui.hud.setCard(null);
    this.glideT = 0;                                   // м'яч, що ще докочувався до ніг, більше не гальмується
    h.cool = 0.35; h.noTrap = 1.4; h.manual = false; this.protectT = 2.2;
    h.p.setThreat(0, 0); this.shooter = h;
    // ті, хто впритул до м'яча, на мить не блокують удар
    for (let i = 0; i < this.actors.length; i++) { const q = this.actors[i]; if (q !== h && Math.hypot(q.p.x - b.x, q.p.z - b.z) < 1.9) { q.ghostBall = 0.22; q.body.on = false; } }
    audio.kick(sh.power); vibrate(10 + sh.power * 18);
    this.game.addTrauma(0.08 + sh.power * 0.14);
    if (sh.power > 0.85) { this.hitStop = Math.max(this.hitStop, 0.03); this.game.fovKick(1.4); }
    this.view.particles.burst(b.x, 0.3, b.z, 6, 3 + sh.power * 4, 0.45, 0.24, ['#8fb98a', '#f2f5ee'], 8, 0.5);
    this.view.ball.squash(sh.dirx, sh.dirz, 0.26);
  }

  // ------------------------------------------------------------------ голи
  onGoal(side) {
    const spec = this.spec, v = this.view, mine = side > 0;
    this.bs = 'net'; this.owner = 0; this.ball.vx *= 0.3; this.ball.vz *= 0.3;
    this.goalMine = mine; this.goalT = 0;
    this.hideAim(); this.ui.hud.warn(null); this.ui.hud.setCard(null);
    if (this.holder) this.holder.manual = false;
    if (this.taker) { this.taker.manual = false; this.taker = null; }
    const gx = side * (L + 1);
    const sc = mine ? (this.shooter || this.mine[1]) : (this.lastOppTaker || this.opp[1]);
    this.celeb = { mine, scorer: sc, t: 0, kneeled: false, tx: side * (L - 7.5), tz: (sc.p.z >= 0 ? 1 : -1) * (W - 5) };
    if (mine) {
      this.score.me++; this.stats.goals++;
      const bn = this.shotBounces, mult = bn >= 2 ? Math.min(4, 1 + 0.5 * (bn - 1)) : 1;
      this.stats.combo = Math.max(this.stats.combo, mult);
      const c = Math.round(50 * spec.scale * mult);
      this.coins += c; this.ui.hud.setCoins(this.coins);
      if (this.shooter && this.mine.indexOf(this.shooter) >= 0) { this.addXp(this.shooter, 60 + (bn >= 2 ? 20 : 0)); if (this.shooter.info) this.shooter.info.goals++; }
      this.ui.hud.goal('ГОЛ!', (bn >= 2 ? 'РИКОШЕТ ×' + mult + ' · ' : '') + '+' + c, 'me');
      v.stands.cheer(3);
      for (let i = 0; i < this.mine.length; i++) this.mine[i].p.cheer(2.2);
      for (let i = 0; i < this.opp.length; i++) this.opp[i].p.sad(2.2);
      v.particles.burst(gx, 1.4, 0, 60, 11, 1.8, 0.4, ['#b3162a', '#117a4a', '#f1efe8', '#e8b923'], 12, 1.0);
      audio.goal(); this.game.addTrauma(0.6); this.game.fovKick(4); vibrate([30, 40, 60]);
      this.ui.flash('rgba(255,255,255,.4)');
    } else {
      this.score.opp++;
      this.ui.hud.goal('ПРОПУСТИЛИ', 'контратака спрацювала', 'opp');
      for (let i = 0; i < this.mine.length; i++) this.mine[i].p.sad(2.2);
      for (let i = 0; i < this.opp.length; i++) this.opp[i].p.cheer(2.2);
      v.particles.burst(gx, 1.4, 0, 24, 8, 1.4, 0.35, ['#9ca3af', '#4b5563', '#f1efe8'], 12, 1.0);
      audio.concede(); this.game.addTrauma(0.4); vibrate(80);
    }
    this.ui.hud.setScore(this.score.me, this.score.opp);
    this.ts = 0.28;
    this.game.sm.go('GOAL', { mine });
  }

  updateGoal(rawDt) {
    this.goalT += rawDt;
    const k = clamp((this.goalT - 0.5) / 0.7, 0, 1);
    this.ts = 0.28 + (1 - 0.28) * k;
    this.tick(rawDt * this.ts, rawDt);
    if (this.goalT > 2.4) this.afterGoal();
  }
  afterGoal() {
    this.ui.hud.clearGoal();
    if (this.golden || this.timeUp) { this.game.sm.go('MATCH', { resume: true }); this.end(); return; }
    this.formation();
    this.game.sm.go('MATCH', { resume: true });
  }

  // ------------------------------------------------------------------ головний цикл
  update(rawDt) {
    if (this.phase === 'paused') { this.syncView(0); return; }
    if (this.hitStop > 0) { this.hitStop -= rawDt; this.syncView(0); return; }
    this.updateSlow(rawDt);
    const k = this.slow ? this.slowTarget : 1;
    this.ts += (k - this.ts) * Math.min(1, rawDt * (this.slow ? 14 : 20));
    const dt = rawDt * this.ts;

    if (this.phase === 'intro') {
      this.introT += rawDt;
      this.game.setIntroCam(this.introT < 2.2, clamp(this.introT / 2.2, 0, 1));
      if (this.introT > 2.2) { this.phase = 'play'; this.readyT = 0; this.slowT = 0; audio.whistle(true); this.ui.hud.hint(S.tutorial ? null : (this.ui.useJoy() ? 'Час сповільнено: тягни джойстик у бік удару й відпусти' : 'Час сповільнено: відтягни від м’яча й відпусти')); }
      this.tick(dt, rawDt);
      return;
    }
    if (this.phase === 'end') {
      this.endT += rawDt; this.tick(dt, rawDt);
      if (this.endT > 1.8 && !this.resultSent) { this.resultSent = true; this.game.sm.go('RESULT', this.result); }
      return;
    }
    if (this.phase === 'play') {
      this.clock -= dt;                  // годинник іде в темпі гри: у сповільненні він теж повільніший
      const s = Math.ceil(Math.max(0, this.clock));
      if (s !== this.lastClock) {
        this.lastClock = s; this.ui.hud.setTime(this.timeText(), this.clock <= 10);
        if (s <= 5 && s > 0) audio.click();
      }
      if (this.clock <= 0 && !this.timeUp) { this.timeUp = true; this.timeUpWait = 0; }
      if (this.timeUp) {
        this.timeUpWait += rawDt;
        if (this.bs === 'ready' || this.bs === 'aim' || this.timeUpWait > 5) { this.cancelAim(); this.timeOver(); return; }
      }
    }
    this.tick(dt, rawDt);
  }

  timeOver() {
    if (this.score.me === this.score.opp && !this.golden) {
      this.golden = true; this.clock = 25; this.timeUp = false; this.lastClock = -1;
      this.ui.hud.banner('ЗОЛОТИЙ ГОЛ', 'наступний гол вирішує все', ''); audio.whistle(false);
      this.ui.hud.setTime(this.timeText(), true);
      return;
    }
    this.end();
  }

  /** Режим володіння: поки м'яч у нас, час сповільнюється до удару або до відбору. */
  updateSlow(rawDt) {
    const want = this.phase === 'play' && (this.bs === 'ready' || this.bs === 'aim');
    if (want !== this.slow) {
      this.slow = want; this.slowT = 0; this.beatT = 0;
      this.ui.setSlow(want); audio.slowmo(want);
      if (!want) this.ts = Math.max(this.ts, 0.85);
      else this.game.fovKick(-1.5);
    }
    if (want) {
      this.slowT += rawDt;
      // запобіжник від безкінечного роздумування: через ~10 с темп поступово наростає
      this.slowTarget = clamp(this.spec.slowFactor + Math.max(0, this.slowT - 10) * 0.04, this.spec.slowFactor, 0.6);
      this.beatT -= rawDt;
      if (this.beatT <= 0) { this.beatT = 0.55 + (1 - this.danger) * 0.5; audio.beat(this.danger); }
    }
  }

  /** Суперник, що дістався до м'яча або до самого виконавця (з будь-якого боку), намагається відібрати. */
  checkTackles() {
    const b = this.ball, h = this.holder.p;
    for (let i = 1; i < this.opp.length; i++) {
      const a = this.opp[i];
      if (a.stun > 0 || a.noTrap > 0 || a.frozen > 0 || a.sliding || a.manual) continue;
      const db = Math.hypot(a.p.x - b.x, a.p.z - b.z), dh = Math.hypot(a.p.x - h.x, a.p.z - h.z);
      if (db < 1.8 || dh < 1.9) { this.attemptTackle(a); return; }
    }
  }

  /** Найближчий суперник до м'яча: «небезпека» 0..1 для підсвітки кільця. */
  updateDanger() {
    const b = this.ball; let dm = 1e9;
    for (let i = 1; i < this.opp.length; i++) { const p = this.opp[i].p, d = (p.x - b.x) * (p.x - b.x) + (p.z - b.z) * (p.z - b.z); if (d < dm) dm = d; }
    this.danger = clamp(1 - (Math.sqrt(dm) - 3) / 15, 0, 1);
    const h = this.holder;
    if (h && (this.bs === 'ready' || this.bs === 'aim')) {
      let bd = 1e9, ox = 0, oz = 0;
      for (let i = 1; i < this.opp.length; i++) { const p = this.opp[i].p, d = (p.x - h.p.x) * (p.x - h.p.x) + (p.z - h.p.z) * (p.z - h.p.z); if (d < bd) { bd = d; ox = p.x; oz = p.z; } }
      if (this.bs === 'ready') h.p.setThreat(this.danger, Math.atan2(ox - h.p.x, oz - h.p.z));
    }
  }

  tick(dt, rawDt) {
    this.time += dt;
    this.ui.hud.setSignal(this.owner);
    if (this.slow) this.updateDanger(); else this.danger = 0;
    const b = this.ball, bs = Math.hypot(b.vx, b.vz), ctx = this.ctx;
    ctx.bs = this.bs; ctx.owner = this.owner; ctx.kickoff = this.kickoff; ctx.t = this.time; ctx.shotBy = this.shotBy;
    if (this.phase !== 'play') this.readyT = 0;
    else if (this.bs === 'ready' || this.bs === 'aim' || this.bs === 'wind') this.readyT += dt; else this.readyT = 0;
    ctx.readyT = this.readyT;
    if (this.bs === 'net') this.updateCelebration(dt);
    else {
      ctx.opps = this.opp; this.myTeam.update(dt, ctx);
      ctx.opps = this.mine; this.oppTeam.update(dt, ctx);
    }
    this.updateHolder(dt);
    this.updateSlides(dt);
    this.updateKeepers(dt);
    if ((this.bs === 'ready' || this.bs === 'aim') && this.holder && this.phase === 'play' && !this.kickoff) this.checkTackles();
    if (this.glideT > 0) { this.glideT -= dt; const k = Math.min(1, dt * 16); b.x += (this.glideX - b.x) * k; b.z += (this.glideZ - b.z) * k; b.vx = b.vz = 0; }
    for (let i = 0; i < this.actors.length; i++) { const a = this.actors[i]; if (a.cool > 0) a.cool -= dt; if (a.noTrap > 0) a.noTrap -= dt; if (a.ghostBall > 0) a.ghostBall -= dt; }
    if (this.protectT > 0) this.protectT -= dt;
    if (this.receiverT > 0) { this.receiverT -= dt; if (this.receiverT <= 0) this.clearReceivers(); }
    this.resolvePlayers();
    this.updateSolidity(bs);
    if (this.bs === 'aim') this.updateAim();
    if (this.bs === 'held') this.updateTaker(dt);
    if (this.bs === 'wind') {
      this.windT -= dt;
      const h = this.holder.p, sh = this.shot;
      const tx = b.x - sh.dirx * 1.5, tz = b.z - sh.dirz * 1.5;
      let free = true;
      for (let i = 0; i < this.opp.length; i++) { const q = this.opp[i].p; if ((q.x - tx) * (q.x - tx) + (q.z - tz) * (q.z - tz) < 1.5 * 1.5) { free = false; break; } }
      if (free) { h.x += (tx - h.x) * Math.min(1, dt * 26); h.z += (tz - h.z) * Math.min(1, dt * 26); }
      h.vx = h.vz = 0; h.yaw = Math.atan2(sh.dirx, sh.dirz);
      if (this.windT <= 0) this.launchShot();
    }
    if (this.bs === 'roll') {
      if (bs < 2.5) { this.looseT += dt; if (this.looseT > 1.3) this.fallbackPick(); } else this.looseT = 0;
    }
    for (let i = 0; i < this.actors.length; i++) this.actors[i].sync();
    this.acc += dt;
    let steps = 0;
    while (this.acc >= H && steps < 8) {
      this.acc -= H; steps++;
      if (this.bs === 'net') this.world.integrate(b, H, null, false);
      else if (this.bs !== 'held' && this.bs !== 'wind') {
        this.world.integrate(b, H, this.cb, true);
        if ((this.bs === 'ready' || this.bs === 'aim') && (b.vx !== 0 || b.vz !== 0)) { this.cancelAim(); this.bs = 'roll'; this.owner = 0; this.shotBy = 0; }
        const g = this.world.goalSide(b);
        if (g !== 0 && this.phase === 'play') { this.onGoal(g); break; }
      }
    }
    if (this.acc > H * 3) this.acc = 0;
    this.syncView(dt);
  }

  /** Тверді гравці: ніхто не проходить крізь іншого; борти тримають усередині поля. */
  resolvePlayers() {
    const A = this.actors, n = A.length;
    for (let it = 0; it < 2; it++) {
      for (let i = 0; i < n; i++) {
        const ai = A[i], a = ai.p;
        for (let j = i + 1; j < n; j++) {
          const aj = A[j], q = aj.p, dx = q.x - a.x, dz = q.z - a.z, d2 = dx * dx + dz * dz;
          const min = (ai.body.r + aj.body.r) * 1.1;
          if (d2 < min * min && d2 > 1e-6) {
            const d = Math.sqrt(d2), push = min - d;
            const hold = (this.bs === 'ready' || this.bs === 'aim' || this.bs === 'wind') ? this.holder : null;
            let wi = ai.manual ? 0.5 : 1, wj = aj.manual ? 0.5 : 1;
            if (hold && ai === hold && aj.side < 0) { wi = 1; wj = 0; }          // виконавець відступає, суперник не посувається
            else if (hold && aj === hold && ai.side < 0) { wi = 0; wj = 1; }
            const tot = wi + wj;
            const nx = dx / d, nz = dz / d;
            a.x -= nx * push * (wi / tot); a.z -= nz * push * (wi / tot);
            q.x += nx * push * (wj / tot); q.z += nz * push * (wj / tot);
          }
        }
      }
    }
    const xm = L - 1.3, zm = W - 1.3;
    for (let i = 0; i < n; i++) { const p = A[i].p; p.x = clamp(p.x, -xm, xm); p.z = clamp(p.z, -zm, zm); }
  }

  // ------------------------------------------------------------------ підкати й сейви
  /** Захисники читають траєкторію удару: хтось падає в підкат, щоб перехопити м'яч на шляху. */
  updateSlides(dt) {
    // рух тих, хто вже ковзає
    for (let i = 0; i < this.actors.length; i++) {
      const a = this.actors[i], s = a.slide;
      if (!s) continue;
      s.t += dt;
      const k = Math.max(0, 1 - (s.t / s.dur) * 0.65);
      a.p.x += s.vx * dt * k; a.p.z += s.vz * dt * k; a.p.vx = a.p.vz = 0;
      if (s.t >= s.dur) {
        a.slide = null; a.sliding = false; a.body.r = a.baseR; a.frozen = 1.15; a.stun = 1.3; a.slideCool = 4;
        a.manual = a === this.holder || a === this.taker;
      }
    }
    if (this.bs !== 'roll' || this.shotBy === 0) return;
    this.slideT += dt;
    if (this.slideT < 0.07) return;
    this.slideT = 0;
    const b = this.ball, sp = Math.hypot(b.vx, b.vz);
    if (sp < 12) return;
    const ux = b.vx / sp, uz = b.vz / sp;
    if (this.slideShotId !== this.shotId) { this.slideShotId = this.shotId; this.slideTries = 0; this.slid = false; }
    if (this.slid || this.slideTries >= 2) return;
    const list = this.shotBy === 1 ? this.opp : this.mine, press = this.shotBy === 1 ? this.oppTeam.press : 0.6;
    // шукаємо єдиного, хто справді може дотягнутися: близько до лінії, встигає за часом польоту м'яча
    let best = null, bestScore = 1e9, bx = 0, bz = 0, bperp = 0;
    for (let i = 1; i < list.length; i++) {
      const a = list[i];
      if (a.manual || a.frozen > 0 || a.stun > 0 || a.slideCool > 0 || a.receiver || a.decided === this.shotId || a.sliding || a.dive) continue;
      const rx = a.p.x - b.x, rz = a.p.z - b.z, along = rx * ux + rz * uz, perp = Math.abs(rx * uz - rz * ux);
      if (along < 3.5 || along > 18 || perp > 3.4) continue;                       // далеко від траєкторії
      const tb = along / (sp * 0.9), need = Math.max(0, perp - 1.1) / Math.max(0.05, tb);
      if (tb < 0.16 || need > 10.5) continue;                                       // не встигає
      const score = perp + along * 0.04;
      if (score < bestScore) { bestScore = score; best = a; bx = b.x + ux * along; bz = b.z + uz * along; bperp = perp; }
    }
    if (!best) return;
    best.decided = this.shotId; this.slideTries++;
    const p = (this.shotBy === 1 ? 0.3 + 0.4 * press : 0.5) * (1 - bperp / 4.4) * (0.6 + 0.8 * best.sk.iq);
    if (Math.random() < p) { this.slid = true; this.startSlide(best, bx, bz); }
  }

  startSlide(a, ix, iz) {
    const dx = ix - a.p.x, dz = iz - a.p.z, d = Math.hypot(dx, dz) || 1;
    const sp = clamp(d / 0.3, 6, 13.5);
    a.slide = { t: 0, dur: 0.36, vx: (dx / d) * sp, vz: (dz / d) * sp };
    a.sliding = true; a.manual = true; a.body.r = 0.95; a.slideCool = 4;
    a.p.yaw = Math.atan2(dx, dz); a.p.slideTackle();
    audio.slide();
  }

  /** М'яч зачепив того, хто в підкаті: чи то вибив, чи то м'яч проскочив. */
  onSlideContact(a, speed, nx, nz) {
    if (a.slideHit === this.shotId) return true;
    a.slideHit = this.shotId;
    const base = a.side > 0 ? 0.42 + 0.42 * a.sk.tack : 0.22 + 0.42 * a.sk.tack + 0.2 * this.oppTeam.press;
    const p = clamp(base - Math.max(0, speed - 26) * 0.011, 0.15, 0.9);
    const b = this.ball, v = this.view;
    if (Math.random() < p) {
      // вибив: м'яч летить подалі від своїх воріт, повільніше й зі зміщенням
      const dir = a.side > 0 ? 1 : -1, ang = rand(-0.7, 0.7), sp = clamp(speed * 0.45, 12, 22);
      b.vx = Math.cos(ang) * sp * dir; b.vz = Math.sin(ang) * sp;
      this.floatAt(a.p.x, a.p.z, 'ПІДКАТ! ВИБИВ', a.side > 0 ? 'good' : 'warn');
      audio.thud(); this.game.addTrauma(0.3); v.ball.squash(nx, nz, 0.3); if (a.side > 0) this.addXp(a, 25);
      v.particles.burst(a.p.x, 0.3, a.p.z, 12, 5, 0.6, 0.3, ['#4f7d3a', '#8fb98a', '#f1efe8'], 10, 0.8);
      this.shotBy = 0; this.protectT = 0;
    } else {
      this.floatAt(a.p.x, a.p.z, 'ПРОСКОЧИВ', 'good'); audio.wall(0, 6);
    }
    return true;
  }

  /** Воротарі реагують заздалегідь: стрибок у куток, стрибок на місці або тільки руки; потім лежать і встають. */
  updateKeepers(dt) {
    const keepers = [this.mine[0], this.opp[0]];
    for (let k = 0; k < 2; k++) {
      const g = keepers[k], d = g.dive;
      if (d) {
        d.t += dt;
        const f = Math.max(0, 1 - (d.t / d.dur) * 0.55);
        g.p.z += d.vz * dt * f; g.p.vx = g.p.vz = 0;
        if (d.t >= d.dur) { g.dive = null; g.frozen = 1.3; g.manual = g === this.holder || g === this.taker; g.p.vx = g.p.vz = 0; }
        continue;
      }
      if (this.bs !== 'roll' || g.frozen > 0 || g.decided === this.shotId || g.manual) continue;
      const b = this.ball, side = g.side, sp = Math.hypot(b.vx, b.vz);
      const toward = -b.vx * side;
      if (toward < 8 || sp < 18) continue;
      const line = -side * L + side * 1.9, eta = (line - b.x) / b.vx;
      if (eta < 0.06 || eta > 0.3 + 0.35 * g.sk.iq) continue;
      const predZ = b.z + b.vz * eta;
      if (Math.abs(predZ) > G + 0.7) continue;          // мимо воріт: воротар не стрибає
      g.decided = this.shotId;
      const react = clamp(0.3 + 0.64 * g.sk.react, 0.25, 0.98);
      if (Math.random() > react) continue;               // не зреагував: гол
      const lateral = predZ - g.p.z;
      if (Math.abs(lateral) > 1.5) {
        const dir = Math.sign(lateral), reach = Math.min(Math.abs(lateral) + 1.0, 2.2 + g.sk.reach * 3.4 + (side < 0 ? this.oppTeam.gkSpeed : this.myTeam.gkSpeed) * 0.12);
        g.dive = { t: 0, dur: 0.36, vz: dir * reach / 0.3 };
        g.manual = true; g.p.yaw = side > 0 ? Math.PI / 2 : -Math.PI / 2; g.p.gkDive(dir, Math.abs(lateral) > 3.2 ? 0 : 1);
        audio.slide(); this.floatAt(g.p.x, g.p.z, 'СТРИБОК!', side > 0 ? 'good' : 'warn');
      } else { g.p.gkJump(); }
    }
  }

  /** Святкування: автор голу біжить до кута й ковзає на колінах, найближчі партнери біжать до нього, суперники плетуться назад. */
  updateCelebration(dt) {
    const c = this.celeb; if (!c) return;
    c.t += dt;
    const sc = c.scorer, team = c.mine ? this.mine : this.opp, other = c.mine ? this.opp : this.mine, dir = c.mine ? 1 : -1;
    if (sc && !sc.isGK) {
      if (!c.kneeled) {
        sc.move(c.tx, c.tz, 9.2, dt);
        if (Math.hypot(sc.p.vx, sc.p.vz) > 0.5) sc.p.yaw = Math.atan2(sc.p.vx, sc.p.vz);
        if (c.t > 1.0 || Math.hypot(c.tx - sc.p.x, c.tz - sc.p.z) < 2.4) { sc.p.kneel(); c.kneeled = true; c.kx = sc.p.x; c.kz = sc.p.z; sc.p.vx = sc.p.vz = 0; }
      } else { sc.p.vx = sc.p.vz = 0; }
    }
    // найближчі партнери збігаються до автора голу
    if (!c.assigned) for (let pass = 0; pass < 4; pass++) {
      let best = null, bd = 1e9;
      for (let i = 1; i < team.length; i++) {
        const a = team[i]; if (a === sc || a.hug) continue;
        const d = (a.p.x - sc.p.x) * (a.p.x - sc.p.x) + (a.p.z - sc.p.z) * (a.p.z - sc.p.z);
        if (d < bd) { bd = d; best = a; }
      }
      if (best) best.hug = true;
    }
    c.assigned = true;
    for (let i = 1; i < team.length; i++) {
      const a = team[i]; if (a === sc) continue;
      if (a.hug) {
        const ang = i * 1.9, rx = Math.cos(ang) * 1.6, rz = Math.sin(ang) * 1.6;
        a.move(sc.p.x + rx, sc.p.z + rz, 8.5, dt);
        const d = Math.hypot(sc.p.x - a.p.x, sc.p.z - a.p.z);
        a.p.yaw = d > 2 ? Math.atan2(a.p.vx, a.p.vz) : Math.atan2(sc.p.x - a.p.x, sc.p.z - a.p.z);
      } else { a.p.vx *= 0.9; a.p.vz *= 0.9; }
    }
    // команда-суперник: ті, що програли, плетуться до своєї половини опустивши голови
    for (let i = 1; i < other.length; i++) { const a = other[i]; a.move(a.p.x * 0.92, a.p.z, 2.1, dt); a.p.yaw = Math.atan2(a.p.vx, a.p.vz) || a.p.yaw; }
    team[0].p.vx = team[0].p.vz = 0; other[0].p.vx = other[0].p.vz = 0;
  }

  /** М'яч завис серед гравців: найближчий вільний гравець (з невеликою перевагою своїх) отримує його. */
  fallbackPick() {
    const b = this.ball; let best = null, bd = 1e9;
    for (let i = 0; i < this.actors.length; i++) {
      const a = this.actors[i];
      if (a.frozen > 0 || a.sliding || a.dive || a.manual) continue;
      const d = Math.hypot(a.p.x - b.x, a.p.z - b.z) * (a.side > 0 ? 0.82 : 1);
      if (d < bd) { bd = d; best = a; }
    }
    if (!best) return;
    this.looseT = 0; best.noTrap = 0; best.cool = 0;
    if (best.side > 0) this.trapMine(best, 0); else this.trapOpp(best, 0);
  }

  /**
   * Виконавець. Якщо він вже біля м'яча, стоїть. Інакше обережно підходить, обходячи гравців (суперника не штовхає).
   * Під час прицілу він не пересувається: потрібну позицію для удару займає лише на мить замаху.
   */
  updateHolder(dt) {
    if (this.bs !== 'ready' && this.bs !== 'aim') return;
    const a = this.holder, b = this.ball;
    if (!a) return;
    if (this.bs === 'ready') {
      const d = Math.hypot(a.p.x - b.x, a.p.z - b.z);
      if (d > 2.4) {
        const sx = b.x > -L + 5 ? b.x - 1.5 : b.x + 1.5;
        this.myTeam.avoid(a, this.actors);
        a.move(sx, b.z + 0.1, 15, dt);
      } else { a.p.vx *= 0.7; a.p.vz *= 0.7; }
      a.p.yaw = Math.atan2(b.x - a.p.x, b.z - a.p.z);
    } else { a.p.vx *= 0.6; a.p.vz *= 0.6; }
  }

  /** Хто фізично заважає м'ячу: поки м'яч у нас, свої не заважають; суперник не блокує власний удар. */
  updateSolidity(bs) {
    const holding = this.bs === 'ready' || this.bs === 'aim' || this.bs === 'wind' || this.bs === 'held';
    const oppShot = this.shotBy === -1 && this.bs === 'roll' && bs > 18;
    const mineSolid = !(this.shotBy === 1 && this.bs === 'roll' && bs > 26);   // сильний удар проходить між своїми, повільний пас гасять
    for (let i = 0; i < this.mine.length; i++) { const a = this.mine[i]; a.body.on = !holding && mineSolid && a.cool <= 0 && !(a.ghostBall > 0) && (!a.manual || a.sliding || !!a.dive); }
    const stand = this.bs === 'ready' || this.bs === 'aim';
    for (let i = 0; i < this.opp.length; i++) { const a = this.opp[i]; a.body.on = (stand || !oppShot) && a.cool <= 0 && !(a.ghostBall > 0) && (!a.manual || a.sliding || !!a.dive); }
  }

  // ------------------------------------------------------------------ візуальна синхронізація
  syncView(dt) {
    const v = this.view, b = this.ball;
    for (let i = 0; i < v.players.length; i++) v.players[i].animate(dt);
    const h = v.ball.update(dt, b.x, b.z, b.vx, b.vz);
    v.updateShadows(b.x, b.z, h);
    v.stands.update(dt, this.time);
    v.particles.update(dt);
    if (this.bs === 'ready') {
      const pr = this.danger;
      const k = 1.15 + Math.sin(this.time * (5 + pr * 8)) * 0.12;
      v.ring.visible = true; v.band.visible = false; v.ring.material.color.setHSL(0.36 * (1 - pr * pr), 0.55 + 0.3 * pr, 0.65 - 0.1 * pr);
      v.ring.position.set(b.x, 0.07, b.z); v.ring.scale.setScalar(k);
      if (pr > 0.62 && !this.pressWarn) { this.pressWarn = true; this.ui.hud.warn('ТИСК! БИЙ ЗАРАЗ'); }
      else if (pr < 0.45 && this.pressWarn) { this.pressWarn = false; this.ui.hud.warn(null); }
    } else if (this.pressWarn && this.bs !== 'ready') { this.pressWarn = false; if (this.bs !== 'held') this.ui.hud.warn(null); }
    const sp = Math.hypot(b.vx, b.vz);
    if (sp > 20 && dt > 0 && Math.random() < 0.6) v.particles.emit(b.x, 0.25, b.z, (Math.random() - 0.5) * 1.2, 0.7, (Math.random() - 0.5) * 1.2, 0.3, 0.17, '#e8f2e4', 0, 1, 0, -1);
  }

  floatAt(x, z, text, kind) { this.game.floatWorld(x, 1.9, z, text, kind); }

  // ------------------------------------------------------------------ завершення
  pause() { if (this.phase === 'play' || this.phase === 'intro') { this.prevPhase = this.phase; this.phase = 'paused'; this.cancelAim(); audio.crowd(0.2); } }
  resume() { if (this.phase === 'paused') { this.phase = this.prevPhase; audio.crowd(0.7); } }
  isPlaying() { return this.phase === 'play' || this.phase === 'intro'; }

  end() {
    const spec = this.spec, me = this.score.me, opp = this.score.opp;
    const outcome = me > opp ? 'win' : me < opp ? 'loss' : 'draw';
    this.phase = 'end'; this.endT = 0; this.resultSent = false; this.cancelAim();
    this.ui.hud.warn(null); this.ui.hud.clearGoal();
    audio.whistle(true); audio.crowd(0.35);
    const win = outcome === 'win';
    for (let i = 0; i < this.mine.length; i++) this.mine[i].p[win ? 'cheer' : 'sad'](3);
    for (let i = 0; i < this.opp.length; i++) this.opp[i].p[win ? 'sad' : 'cheer'](3);
    if (win) this.view.stands.cheer(3);
    if (this.holder) this.holder.manual = false;

    const lines = [];
    const base = Math.round((win ? 120 : outcome === 'draw' ? 45 : 20) * spec.scale);
    lines.push({ label: win ? 'Перемога' : outcome === 'draw' ? 'Нічия' : 'Участь', value: base });
    lines.push({ label: 'Голи та рикошети', value: this.coins });
    let sub = base + this.coins, cup = false;
    if (win && spec.final) { cup = true; const cb = Math.round(300 * spec.scale); lines.push({ label: 'Кубок ліги', value: cb }); sub += cb; }
    const mult = incomeMult(), bonus = Math.round(sub * (mult - 1));
    if (bonus > 0) lines.push({ label: 'Дохід стадіону й академії', value: bonus });
    const total = sub + bonus;

    S.coins += total;
    for (let i = 0; i < 11; i++) { const e = S.squad[i]; e.apps++; gainXp(e, this.xp[i] + 10 + (win ? 20 : 0), this.levelUps); }
    this.ui.hud.setCard(null);
    S.stats.matches++; S.stats.goals += this.stats.goals; S.stats.bestCombo = Math.max(S.stats.bestCombo, this.stats.combo);
    let tickets = 0, promoted = null, newSeason = false, chapter = null;
    if (win) {
      S.stats.wins++; tickets += 1;
      const ch = CHRONICLE.find((c) => c.wins === S.stats.wins); if (ch) chapter = ch.year + ' · ' + ch.title;
      const prevLeague = spec.league;
      S.fixture++;
      if (S.fixture >= FIXTURES.length) { S.fixture = 0; S.season++; newSeason = true; }
      if (cup) { S.trophies++; tickets += 3; }
      if (FIXTURES[S.fixture].league !== prevLeague) promoted = FIXTURES[S.fixture].league;
    }
    S.tickets += tickets;
    S.academy.progress = Math.min(ACADEMY.need, S.academy.progress + (win ? 2 : 1));
    if (S.academy.progress >= ACADEMY.need) S.academy.ready = true;
    commit();
    this.result = { outcome, me, opp, spec, lines, total, tickets, cup, promoted, newSeason, academyReady: S.academy.ready, stats: this.stats, levelUps: this.levelUps, chapter };
    if (win) audio.win(); else if (outcome === 'loss') audio.lose();
  }

  exit() {
    this.phase = 'idle'; this.cancelAim();
    if (this.slow) { this.slow = false; this.ui.setSlow(false); }
    this.view.particles.clear();
    audio.crowd(0);
  }
}
