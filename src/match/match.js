import * as THREE from 'three';
import { PITCH, PHYS, FIXTURES, ACADEMY } from '../config.js';
import { CLUB, CHRONICLE } from '../club.js';
import { World } from '../physics/world.js';
import { AimPath } from '../physics/aim.js';
import { ground, BallPlan } from '../physics/ballmodel.js';
import { dribbleStep } from './dribble.js';
import { MatchView } from './view.js';
import { Actor, Team } from './team.js';
import { audio, vibrate } from '../core/audio.js';
import { S, commit } from '../state/save.js';
import { incomeMult, striker, keeper } from '../state/economy.js';
import { oppSquad, skillOf, gkBonus, gainXp, ovr, tierOf, keysFor, ROLE_UA, STAT_NAMES } from '../state/squad.js';

import { Penalties } from './penalty.js';
import { Replay, Slaps, shakeHands, patShoulder } from './cinema.js';
import { Walkout } from './walkout.js';
import { diveKin } from '../graphics/player.js';
const { L, W, G, R } = PITCH;
// інтро (кат-сцена виходу), с: A — проліт над стадіоном; B — вихід із тунелю; C — камера задкує перед колонами;
// D — бічний телеоб'єктив; E — шикування; далі гімн і «п'ятірки» (HS_T): кожен гість проходить усю шеренгу господарів;
// хто вже пройшов (і господар, повз якого пройшли всі), аплодує трибунам і підтюпцем біжить на свою позицію
const A_END = 4.5, B_END = 9.5, C_END = 15.5, D_END = 21.5, E_END = 33.0, AN_T = 35.2;
const HS_T = 37.4, HS_MAX = HS_T + 60;   // «п'ятірки» йдуть, доки кожен гість не пройде всю шеренгу (з запобіжником)
const LINE_DX = 1.25;                      // крок між гравцями в шерензі
const WALK_V = 1.6, COL_GAP = 1.5;
const BREAK_T = 4.0;                // перерва між таймами (кат-сцена)
const END_T = 9.4;                  // після фінального свистка: радість, рукостискання, загальний план — далі результат
const LZ = -14;                     // лінія шикування: ближче до тунелю (команди доходять до неї без монтажних «стрибків»)
const LANE_Z = LZ + 1.45;           // доріжка гостей — перед шеренгою господарів (між ними й трибуною), на відстані витягнутої руки
const _c1 = new THREE.Vector3(), _c2 = new THREE.Vector3();
const H = 1 / PHYS.hz;
const GK_THROW = 1.25;              // сила кидка воротаря рукою (×1.25 до колишньої)
const GK_CLEAR = 7;                 // на скільки суперники відходять від воротаря з м'ячем у руках
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth01 = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const rand = (a, b) => a + Math.random() * (b - a);
const DEG = Math.PI / 180;
const MY_FORMATION = '433';

export class Match {
  constructor(game) {
    this.game = game; this.ui = game.ui;
    this.world = new World();
    this.view = new MatchView();
    this.path = new AimPath(this.world);
    // прогноз руху м'яча для ІІ й воротарів (та сама фізика: відскоки від тіл, поперечини, бортів)
    this.plan = new BallPlan(this.world); this.planT = 0; this.planShot = -1; this._cr = { t: 0, z: 0, y: 0 };
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
    // кінематографія: повтори голів, «драматична» камера на сейвах і штангах, перерви, рукостискання
    this.replay = new Replay(this.view); this.rp = null; this.walk = new Walkout(this.view);
    // «дай п'ять»: ляпас, легкий спалах білих іскор між долонями
    this.slaps = new Slaps((c) => { audio.clap(); this.view.particles.burst(c.x, c.y, c.z, 7, 2.6, 0.22, 0.13, ['#ffffff', '#fff2c4'], 4, 0.5); }); this.drama = null; this.dramaCool = 0; this.brk = null; this.endPairs = null;
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
    // воротарі — як люди: час реакції (≈0.26 с у новачка → 0.13 с у топа, «Реакція») і швидкість рук (~5.5–9 м/с, «Ловля»)
    for (const g of [this.mine[0], this.opp[0]]) { g.p.reactT = 0.26 - 0.13 * g.sk.react; g.p.handV = 5.5 + 3.5 * g.sk.hands; }
    this.xp = new Array(11).fill(0); this.levelUps = [];
    this.kk = keeper(); this.st = striker();
    this.myTeam.setFormation(MY_FORMATION); this.oppTeam.setFormation(spec.formation);
    const mg = this.mine[0].sk, og = this.opp[0].sk;
    Object.assign(this.myTeam, { speed: 9.2, gkSpeed: 6 + 7 * mg.react, gkTrack: 0.35 + 0.6 * mg.iq, gkErr: (1.15 - mg.react) * 3.0 });
    Object.assign(this.oppTeam, { speed: 8.4, press: spec.press, line: spec.line, gkSpeed: 5 + 6 * og.react, gkTrack: 0.25 + 0.65 * og.iq, gkErr: (1.2 - og.react) * 3.4 });
    this.mine[0].body.r = this.mine[0].baseR = Math.max(0.9, 0.7 + 0.6 * mg.reach);
    this.opp[0].body.r = this.opp[0].baseR = Math.max(0.9, 0.7 + 0.6 * og.reach);
    this.score = { me: 0, opp: 0 };
    this.pens = null; this.penRes = null;
    this.clock = spec.time; this.period = 1; this.periodEnd = false; this.golden = false; this.timeUp = false; this.timeUpWait = 0;
    this.coins = 0; this.stats = { goals: 0, combo: 1, saves: 0 };
    this.phase = 'intro'; this.introT = 0; this.introCheer = false; this.hitStop = 0; this.ts = 1; this.acc = 0;
    this.aiming = false; this.endT = 0; this.goalT = 0; this.resultSent = false;
    this.lastClock = -1;
    this.holder = null; this.taker = null;
    this.formation();
    const hud = this.ui.hud;
    hud.show(spec);
    hud.setScore(0, 0); hud.setTime(this.timeText(), false, this.halfText()); hud.setCoins(0);
    hud.warn(null); hud.hint(null);
    hud.banner(spec.club.name, spec.leagueName + ' · матч ' + spec.no + ' з ' + spec.of + (spec.final ? ' · ФІНАЛ' : ''), spec.note || CLUB.slogan);
    audio.music('match'); audio.crowd(0.7);
    this.game.renderer.toneMappingExposure = this.view.exposure || 1.1;
    this.game.setIntroCam(false);
    this.introTgt = [this.mine, this.opp].map((arr) => arr.map((a) => ({ x: a.p.x, z: a.p.z })));
    this.introFlags = { wave: false, clap: false, cheer: false, roar: false, anthem: false, hs: false, fans: false };
    this.introFrom = null; this.rp = null; this.hl = null; this.clips = []; this.moments = []; this.walk.start(spec.club);
    for (const a of this.actors) { a.lane = null; a._st = 0; a.post = null; a._jr = Math.random(); a.p.gaze = true; }
    this.introEndAt = null; this.skipEnd = false; this._cx = undefined; this._fx = undefined; this._h0 = null; this._hs = null; this._camT = undefined; this.drama = null; this.dramaCool = 0; this.brk = null; this.endPairs = null; this.replay.clear();
    this.ui.hud.cine(true);
    this.driveIntro(0, 0);
    this.game.snapCamera();
  }

  /**
   * Стартова розстановка за правилами: кожна команда на своїй половині, суперник поза центральним колом,
   * нападник із м'ячем у центрі. Поки не зроблено перший удар, ніхто не рухається з місця.
   */
  formation(kick = 1) {
    this.pendKick = null; if (this.moments) this.takeMoments(true); this.replay.clear(); this.slaps.clear();   // перед очищенням запису — вирізати моменти
    const b = this.ball;
    b.x = 0; b.z = 0; b.vx = b.vz = 0;
    // м'яч, що ще «докочувався» до ніг попереднього власника, не тягнемо з собою (через це тайм починався не з центру)
    this.glideT = 0; this.telegraph = false; this.hideAim();
    if (this.taker) { this.taker.manual = false; this.taker = null; }
    this.clearReceivers();
    const FR = { D: 0.46, M: 0.68, W: 0.8, F: 0.9 };         // частка половини від своїх воріт
    // виконавець: центральний нападник мого складу
    // розводить kick: 1 — ми, −1 — суперник (та команда, якій забили)
    const kt = kick > 0 ? this.mine : this.opp;
    let hold = kt[1], bv = 9;
    for (let i = 1; i < kt.length; i++) { const r = kt[i].role; if (r.line === 'F' && Math.abs(r.v) < bv) { bv = Math.abs(r.v); hold = kt[i]; } }
    for (const t of [this.myTeam, this.oppTeam]) {
      const side = t.side, R0 = side === kick ? 9.4 : 10.4;
      t.gk.place(-side * L + side * 1.9, 0);
      t.out.forEach((a) => {
        const f = FR[a.role.line] || 0.7;
        let x = -side * L + side * f * L, z = a.role.v * (W - 4.5);
        if (a !== hold) {                                      // поза центральним колом
          const d = Math.hypot(x, z);
          if (d < R0) { if (d < 0.01) { x = -side * R0; z = 0; } else { x *= R0 / d; z *= R0 / d; } }
        }
        a.place(x, z); a.kx = x; a.kz = z;
        a.manual = false; a.cool = 0; a.noTrap = 0; a.stun = 0; a.receiver = false; a.hug = false; a.hugged = false; a.cheered = false; a.frozen = 0; a.slide = null; a.dive = null; a.sliding = false; a.slideCool = 0; a.decided = -1; a.body.r = a.baseR; a.p.dribble = false; a.p.setThreat(0, 0); a.body.on = true; a.p.setMode('idle');
      });
      t.gk.manual = false; t.gk.cool = 0; t.gk.noTrap = 0; t.gk.stun = 0; t.gk.frozen = 0; t.gk.slide = null; t.gk.dive = null; t.gk.sliding = false; t.gk.slideCool = 0; t.gk.decided = -1; t.gk.body.r = t.gk.baseR; t.gk.p.setMode('idle');
      for (const a of [t.gk, ...t.out]) a.p.yaw = side > 0 ? Math.PI / 2 : -Math.PI / 2;
    }
    hold.place(-1.8 * kick, 0); hold.kx = -1.8 * kick; hold.kz = 0;
    this.kickoff = true; this.kickT = 0; this.hitStop = 0;
    if (kick > 0) this.makeReady(hold, true);
    else { this.trapOpp(hold, 0); this.ui.hud.warn(null); hold.p.yaw = -Math.PI / 2; }
    b.x = 0; b.z = 0; b.vx = b.vz = 0; this.glideT = 0;
    this.hideAim();
    this.shotBy = 0; this.shotBounces = 0; this.counter = false; this.looseT = 0; this.protectT = 0; this.pressWarn = false;
    for (const a of this.actors) { a.tkl = 0; a.nearT = 0; }       // випад, що не завершився до розстановки, не тягне гравця
  }

  /** Час як на ТБ: стиснутий 90-хвилинний матч, «45:00», у доданий час «90+N». */
  timeText() {
    const f = clamp(1 - this.clock / this.spec.time, 0, 1), gs = Math.floor(f * 5400), m = (gs / 60) | 0, r = gs % 60;
    if (this.timeUp && f >= 1) return '90+' + (1 + ((this.timeUpWait * 1.5) | 0));
    return (m < 10 ? '0' : '') + m + ':' + (r < 10 ? '0' : '') + r;
  }
  halfText() {
    if (this.phase === 'pens') return 'Пенальті';
    const f = clamp(1 - this.clock / this.spec.time, 0, 1);
    return f >= 1 ? 'Дод. час' : Math.min(4, (this.period || 1)) + '-й тайм';
  }

  // ------------------------------------------------------------------ керування
  /** Наш воротар із м'ячем у руках не розігрує, поки суперники не відійшли (хіба що чекати довелося понад ~3 с). */
  gkWaitBlock() { if (this.holder && this.holder.isGK && !this.holder.footBall && !this.gkClear) { audio.click(); return true; } return false; }

  pointerDown(x, y) {
    if (this.phase === 'intro') { this.skipIntroPart(); return; }
    if (this.phase === 'break') { if (this.hl && this.rp) { this.rp.t = this.rp.b; this.rp.hold = 1; } else if (this.brk && this.brk.t > 0.6) this.brk.t = BREAK_T; return; }
    if (this.phase === 'end') { if (this.endT > 0.8) this.endT = Math.max(this.endT, END_T); return; }
    if (this.phase !== 'play' || this.bs !== 'ready') return;
    if (this.gkWaitBlock()) return;
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
    if (this.gkWaitBlock()) return;
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
    this.bs = 'wind'; this.windT = 0.14; this.ts = 1; if (this.holder.isGK && !this.holder.footBall) this.holder.p.throwBall(); else { this.holder.p.kick(this.shot.power); this.holder.p.setMode('idle'); }
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
    let speed = Math.min(PHYS.maxSpeed, PHYS.baseShot * (0.28 + 0.72 * sh.power) * this.shotMul(sh.power));
    // воротар із м'ячем у руках кидає рукою — це не удар: до ~32 м/с (від ~11 — короткий кидок партнеру поруч)
    if (this.holder && this.holder.isGK && !this.holder.footBall) {
      speed = (9 + 17 * sh.power) * GK_THROW;
      // воротар кидає своєму: найближчий до напрямку прицілу партнер (у межах ~45°) — кидок точно йому, на випередження,
      // і не слабше, ніж треба, щоб м'яч до нього докотився
      let q = null, ba = 0.8;
      for (let i = 1; i < this.mine.length; i++) {
        const m = this.mine[i], dx = m.p.x - b.x, dz = m.p.z - b.z, dl = Math.hypot(dx, dz); if (dl < 4 || dl > 40) continue;
        const an = Math.acos(clamp((dx * dirx + dz * dirz) / dl, -1, 1)); if (an < ba) { ba = an; q = m; }
      }
      if (q) {
        const dl = Math.hypot(q.p.x - b.x, q.p.z - b.z), t = dl / Math.max(9, speed);
        const tx = q.p.x + q.p.vx * t - b.x, tz = q.p.z + q.p.vz * t - b.z, tl = Math.hypot(tx, tz) || 1;
        dirx = tx / tl; dirz = tz / tl; sh.dirx = dirx; sh.dirz = dirz;
        speed = clamp(Math.max(speed, this.launchFor(tl, 4)), 9, 26 * GK_THROW);
      }
    }
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
    if (impact > 28) this.game.addTrauma(Math.min(0.12, (impact - 28) / 220));   // камера здригається лише від справді сильного удару в борт
    if (this.bs === 'roll' && this.shotBy > 0 && this.shotBounces >= 2) this.ui.hud.combo(this.shotBounces);
  }
  onPost(nx, nz, impact) {
    if (impact > 6) this.view.stands.react('gasp');
    if (impact > 12) { this.hitStop = Math.max(this.hitStop, 0.045); if (this.shotBy !== 0) this.markMoment('post'); }   // мить завмирання: дзвін штанги; момент — у підбірку тайму
    audio.wall(5, impact); this.view.ball.squash(nx, nz, 0.3);
    this.view.particles.burst(this.ball.x, 0.6, this.ball.z, 8, 6, 0.5, 0.22, ['#ffffff', '#d9dcd8'], 10, 0.6);
    this.game.addTrauma(0.18);
    this.floatAt(this.ball.x, this.ball.z, 'СТОВП!', 'warn');
  }

  onBody(b, vn, nx, nz, speed) {
    const a = b.ref, v = this.view;
    if (a.sliding && this.bs === 'roll') return this.onSlideContact(a, speed, nx, nz);
    if (this.bs === 'ready' || this.bs === 'aim') {          // суперник дотягнувся до м'яча, який ми тримаємо
      if (a.side < 0 && !(this.holder && this.holder.isGK) && !(a.tkl > 0) && a.stun <= 0 && a.noTrap <= 0) this.startTackle(a);   // м'яч у руках воротаря забрати не можна
      return true;
    }
    if (this.bs !== 'roll') return true;
    // м'яч на рівні голови: не прийом, а удар головою — до воріт суперника (відбиває й захисник: подалі від своїх воріт)
    const hy = this.ball.y;
    if (!a.isGK && hy > 1.4) {
      if (a.headId === this.shotId) return true;
      a.headId = this.shotId;
      const B = this.ball, gx = a.side > 0 ? L + 1 : -L - 1, tx = gx - a.p.x, tz = rand(-G, G) * 0.8 - a.p.z, tl = Math.hypot(tx, tz) || 1;
      const err = (1 - (a.sk.shoot + a.sk.iq) / 2) * 0.9, ang = Math.atan2(tz / tl, tx / tl) + rand(-err, err);
      const sp = clamp(7 + speed * 0.4, 9, 24);
      B.vx = Math.cos(ang) * sp; B.vz = Math.sin(ang) * sp; B.vy = rand(-1.5, 3); B.w = 0;
      a.p.header(); audio.thud(); this.view.ball.squash(nx, nz, 0.25);
      this.shotBy = a.side > 0 ? 1 : -1; this.shotOnTarget = true; this.shotBounces = 0; this.shotId++; a.headId = this.shotId; this.planT = 0;
      if (a.side > 0) { this.shooter = a; this.addXp(a, 8); } else this.lastOppTaker = a;
      this.clearReceivers();
      this.floatAt(a.p.x, a.p.z, 'ГОЛОВОЮ!', a.side > 0 ? 'good' : 'warn');
      return true;
    }
    // польовий: м'яч, що торкнувся тіла, гравець бере під контроль за тими самими правилами, що й поруч (controlScore):
    // відносна швидкість м'яча і ноги, техніка. Не взяв — м'яч відскакує від тіла (нижче). Повільний — не штовхаємо:
    // його візьме той, хто ближче й краще стоїть (claimBall)
    if (!a.isGK) {
      if (this.controlScore(a) > 0) { if (a.side > 0) this.trapMine(a, speed); else this.trapOpp(a, speed); return true; }
      if (speed < 6) return true;
    } else {
      const sk = a.sk, limit = a.receiver ? 34 : PHYS.trapSpeed * (1.2 + 0.8 * sk.hands);
      // ловить, лише якщо м'яч прийшов у рукавиці; удар у ноги чи тулуб — відскік (повільний м'яч біля ніг — підбере сам)
      const outBox = (this.ball.x + a.side * L) * a.side > 17 || Math.abs(this.ball.z) > 17;   // поза штрафним — грає ногою, як польовий
      if (speed < limit && a.noTrap <= 0 && (outBox || this.inGloves(a, 0.16) || (speed < 5 && this.facesBall(a)))) {
        if (a.side > 0) { this.trapMine(a, speed); return true; }
        if (a.receiver || (this.protectT <= 0 && Math.random() < (0.64 + 0.34 * this.oppTeam.press) * (0.7 + 0.6 * sk.hands))) { this.trapOpp(a, speed); return true; }
        a.noTrap = 0.45;
      }
    }
    if (a.isGK) {
      this.saveReact(a);
      audio.save(); this.stats.saves += a.side < 0 ? 1 : 0;
      a.p.parry(); audio.thud(); if (a.side > 0) this.addXp(a, 25); if (speed > 18) this.view.stands.react('gasp');
      if (speed > 20 && this.shotBy === -a.side) this.markMoment('save');   // сильний удар відбито — у підбірку моментів тайму
      this.floatAt(a.p.x, a.p.z, a.side > 0 ? 'СЕЙВ!' : 'ВОРОТАР!', a.side > 0 ? 'good' : 'warn');
    } else {
      audio.wall(0, 8);
      if (speed > 24) { const q = Math.random(); if (q < 0.4) a.p.header(); else if (q < 0.7) a.p.block(); else a.p.hit(); }
      else if (speed > 6 && a.p.mode === 'idle' && !a.p.kicking) a.p.receive(this.ball.y, speed);   // зачепив, але не втримав — рух ногою/тілом видно
    }
    v.ball.squash(nx, nz, 0.22);
    return false;
  }

  /** Сейв: воротар (піднявшись, якщо лежить) коротко радіє, а той, хто бив, засмучений. Раз на удар. */
  saveReact(g, caught = false) {
    const shooterSide = -g.side, isShot = (shooterSide > 0 && this.shotBy === 1) || (shooterSide < 0 && this.shotBy === -1);
    if (!isShot || this.saveReactId === this.shotId) return;
    this.saveReactId = this.shotId;
    if (!caught && Math.random() < 0.7) g.p.react('save', 1.6);           // спіймав — тримає м'яч, радіє вже на ходу (не перериваємо прийом)
    const sh = shooterSide > 0 ? this.shooter : this.lastOppTaker;
    if (sh && !sh.isGK && Math.random() < 0.85) sh.p.react('miss', 1.8);
  }

  /**
   * Чи може польовий гравець зараз узяти м'яч під контроль, і наскільки добре (0 — ні, далі — «якість» позиції). Як у людини:
   *  • м'яч у досяжності ноги (≈ тіло + 0.45–0.65 м, на рівні грудей — ближче) і не вище грудей;
   *  • важить ВІДНОСНА швидкість м'яча й гравця: м'яч, що котиться поруч із ним у тому ж напрямку, легко взяти й на бігу
   *    (раніше рахувалась абсолютна — і гравець, що біг із м'ячем, не міг його «взяти»); назустріч — лише добрий технік;
   *  • краще, коли м'яч попереду (обличчям до нього), ближче й повільніше відносно ноги; «Дриблінг» — м'якший прийом.
   * Свої не чіпають наш удар у створ; суперник одразу після нашого удару бере лише повільніший м'яч.
   */
  controlScore(a) {
    if (a.isGK || a.noTrap > 0 || a.cool > 0 || a.frozen > 0 || a.stun > 0 || a.sliding || a.dive || a.tkl > 0 || a.p.downed) return 0;
    const b = this.ball, p = a.p;
    if (b.y > 1.5 || (a.side > 0 && this.shotBy === 1 && this.shotOnTarget && Math.hypot(b.vx, b.vz) > 18)) return 0;
    const dx = b.x - p.x, dz = b.z - p.z, d = Math.hypot(dx, dz), chest = b.y > 0.6;
    const reach = a.body.r + R + (chest ? 0.25 : 0.45) + 0.2 * a.sk.drib;
    if (d > reach) return 0;
    const vr = Math.hypot(b.vx - p.vx, b.vz - p.vz);
    const vmax = (a.receiver ? 30 : 13 + 15 * a.sk.drib) * (chest ? 0.7 : 1) * (a.side < 0 && this.protectT > 0 && !a.receiver ? 0.6 : 1);
    if (vr > vmax) return 0;
    const yaw = p.bodyYaw ?? p.yaw, face = d > 1e-3 ? (dx * Math.sin(yaw) + dz * Math.cos(yaw)) / d : 1;
    return 0.05 + 0.55 * (1 - d / reach) + 0.2 * (0.5 + 0.5 * face) + 0.12 * (1 - vr / vmax) + 0.08 * a.sk.drib;
  }

  /**
   * Вільний м'яч: щокроку дивимось, хто може його взяти (controlScore). Найкращий від кожної команди; якщо поруч обидва —
   * боротьба: шанс за якістю позиції й навичками («Дриблінг» того, хто бере, проти «Відбору» суперника). Хто програв —
   * на мить відскакує (не хапає м'яч щокадру).
   */
  claimBall() {
    if (this.bs !== 'roll' || this.phase !== 'play') return;
    let bm = null, sm = 0, bo = null, so = 0;
    for (let i = 0; i < this.actors.length; i++) {
      const a = this.actors[i], s = this.controlScore(a); if (s <= 0) continue;
      if (a.side > 0) { if (s > sm) { sm = s; bm = a; } } else if (s > so) { so = s; bo = a; }
    }
    if (!bm && !bo) return;
    let win = bm || bo;
    if (bm && bo) {
      const pm = clamp(0.5 + (sm - so) * 1.6 + 0.25 * (bm.sk.drib - bo.sk.tack), 0.08, 0.92);
      win = Math.random() < pm ? bm : bo;
      const lose = win === bm ? bo : bm; lose.noTrap = Math.max(lose.noTrap, 0.4);
      this.floatAt(win.p.x, win.p.z, 'ВИГРАВ М’ЯЧ', win.side > 0 ? 'good' : 'warn');
    }
    const sp = Math.hypot(this.ball.vx, this.ball.vz);
    if (win.side > 0) this.trapMine(win, sp); else this.trapOpp(win, sp);
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

  /**
   * Контакт у відборі. Падає лише від жорсткого контакту — і тим імовірніше, чим швидше біг (chance — база, ×0.5 стоячи …
   * ×1.5 на швидкості ≥6 м/с); інакше гравця відкидає, він ловить рівновагу кроками й за ~0.5 с грає далі.
   */
  bump(a, src, chance) {
    const dx = a.p.x - src.p.x, dz = a.p.z - src.p.z, sp = Math.hypot(a.p.vx, a.p.vz);
    if (Math.random() < chance * (0.5 + Math.min(1, sp / 6))) { a.p.stumble(); a.frozen = Math.max(a.frozen, 1.0); }
    else { a.p.stagger(dx || 1, dz, 1.5 + Math.random() * 1.2); a.frozen = Math.max(a.frozen, 0.45); }
  }

  /**
   * Відбір — не зіткнення тіл, а випад ногою до м'яча. Захисник стоїть у стійці ~1.6–2 м, вибирає момент і робить випад:
   * ~0.2–0.3 с (швидше з кращим «Відбором») підсідає на опорну ногу й викидає ударну до м'яча, тіло пролітає ~1 м уперед.
   * Ціль — де м'яч буде в мить контакту (розумніші передбачають ведення). Поки триває випад, носій ще може віддати пас
   * чи вдарити, а суперник-дриблер — змінити напрям; тоді нога б'є в порожнечу.
   */
  startTackle(a) {
    const b = this.ball, T = 0.2 + 0.12 * (1 - a.sk.tack), lead = T * (0.4 + 0.6 * a.sk.iq);
    a.tkl = T; a.tklX = b.x + b.vx * lead; a.tklZ = b.z + b.vz * lead; a.nearT = 0;
    a.frozen = Math.max(a.frozen, T + 0.3);                          // ІІ команди не кермує, поки триває випад
    a.p.yaw = Math.atan2(a.tklX - a.p.x, a.tklZ - a.p.z);
    a.p.tackle(T);
    // дриблер бачить випад і може піти вбік (навичка «Дриблінг»)
    if (this.bs === 'held' && this.taker && a.side > 0 && Math.random() < 0.15 + 0.5 * this.taker.sk.drib) {
      this.dribZ = clamp(this.taker.p.z + (Math.random() < 0.5 ? -1 : 1) * 7, -W + 3, W - 3); this.thinkT = 0.6;
    }
  }

  /** Випади, що тривають: тіло йде вперед до м'яча, у мить контакту — результат. */
  updateTackles(dt) {
    for (let i = 0; i < this.actors.length; i++) {
      const a = this.actors[i];
      if (!(a.tkl > 0)) continue;
      if (a.p.downed) { a.tkl = 0; continue; }
      const dx = a.tklX - a.p.x, dz = a.tklZ - a.p.z, d = Math.hypot(dx, dz) || 1;
      const lunge = Math.min(1.3, Math.max(0, d - 0.85)) / Math.max(0.05, a.tkl);   // стопа має дістати м'яч, тіло зупиняється ~0.85 м від нього
      a.p.vx = (dx / d) * lunge; a.p.vz = (dz / d) * lunge; a.p.x += a.p.vx * dt; a.p.z += a.p.vz * dt;
      a.tkl -= dt;
      if (a.tkl <= 0) { a.tkl = 0; a.p.vx *= 0.3; a.p.vz *= 0.3; this.resolveTackle(a); }
    }
  }

  /** Мить контакту: чи дістала нога м'яч і чи переграв захисник носія. Виграв — чисто забрав або вибив м'яч у боротьбу. */
  resolveTackle(a) {
    const b = this.ball, fy = a.p.yaw, fx = a.p.x + Math.sin(fy) * 0.85, fz = a.p.z + Math.cos(fy) * 0.85;
    const reach = 0.7 + 0.4 * a.sk.tack, near = Math.hypot(b.x - fx, b.z - fz) < reach;
    const vsMine = a.side < 0 && (this.bs === 'ready' || this.bs === 'aim') && this.holder && !this.holder.isGK;
    const vsOpp = a.side > 0 && this.bs === 'held' && this.taker && !this.taker.isGK;
    if (!vsMine && !vsOpp) { a.stun = Math.max(a.stun, 0.4); return; }   // м'яч уже пішов — нога в порожнечу
    const h = vsMine ? this.holder : this.taker;
    const chance = vsMine ? this.tackleChance(a) : clamp(0.5 + (a.sk.tack - h.sk.drib) * 0.6, 0.2, 0.92);
    if (near && Math.random() < chance) {
      if (a.side > 0) this.addXp(a, 25);
      h.stun = Math.max(h.stun, 0.9); h.noTrap = 0.7;
      if (Math.random() < 0.08 + 0.25 * Math.min(1, Math.hypot(a.p.vx, a.p.vz) / 4)) { this.bump(h, a, 0.12); this.game.addTrauma(0.12); this.hitStop = Math.max(this.hitStop, 0.03); }   // зрідка — ще й зачепив ногу (жорсткий контакт)
      else h.p.hit();
      if (Math.random() < 0.3 + 0.4 * a.sk.tack) {                 // чисто: м'яч лишається в ногах захисника
        this.floatAt(a.p.x, a.p.z, vsMine ? 'ВІДІБРАВ!' : 'ПЕРЕХОПИЛИ!', vsMine ? 'warn' : 'good'); audio.pass();
        if (vsMine) { this.cancelAim(); h.p.setThreat(0, 0); h.manual = false; this.trapOpp(a, 0); }
        else { h.manual = false; this.taker = null; h.p.dribble = false; this.placeBallAt(a, true); a.noTrap = 0; a.p.receive(0, 4); this.makeReady(a); }
      } else {                                                     // вибив: м'яч відскакує вперед-убік — боротьба за нього
        const ang = fy + rand(-0.9, 0.9), sp = rand(5, 9);
        this.looseBall(Math.sin(ang) * sp, Math.cos(ang) * sp);
        a.noTrap = 0.15; audio.thud();
        this.floatAt(a.p.x, a.p.z, 'ВИБИВ!', vsMine ? 'warn' : 'good');
      }
    } else {
      // промах: захисник «провалився» у випаді — відновлюється, носій лишається з м'ячем
      a.stun = 1.0; a.noTrap = 0.9;
      if (Math.random() < 0.25) this.bump(a, h, 0.1); else a.p.hit();
      if (vsMine) { this.floatAt(h.p.x, h.p.z, 'ЗАХИСТИВ М’ЯЧ!', 'good'); audio.pass(); this.addXp(h, 12); }
      else this.floatAt(a.p.x, a.p.z, 'НЕ ДОТЯГНУВСЯ', 'warn');
    }
  }

  /** М'яч вибили з ніг: нічий, котиться — хто перший, того й м'яч. */
  looseBall(vx, vz) {
    this.pendKick = null;
    const b = this.ball;
    if (this.bs === 'aim') this.cancelAim();
    this.hideAim(); this.aiming = false;
    if (this.holder) { this.holder.manual = false; this.holder.p.setThreat(0, 0); this.holder.cool = 0.3; }
    if (this.taker) { this.taker.manual = false; this.taker.p.dribble = false; this.taker.cool = 0.3; this.taker = null; }
    this.telegraph = false;
    b.vx = vx; b.vz = vz;
    this.bs = 'roll'; this.owner = 0; this.shotBy = 0; this.shotBounces = 0; this.looseT = 0; this.counter = false; this.protectT = 0; this.shotId++;
    this.ui.hud.setCard(null); this.ui.hud.warn(null);
  }

  // ------------------------------------------------------------------ володіння
  /** Ставить м'яч до ніг: soft — м'яч плавно докочується, замість миттєвого стрибка. */
  placeBallAt(a, soft) {
    const b = this.ball, dir = a.side > 0 ? 1 : -1;
    b.vx = b.vz = 0; ground(b);
    const tx = clamp(a.p.x + dir * 1.25, -L + 2, L - 2), tz = clamp(a.p.z, -W + 1.5, W - 1.5);
    if (soft) { this.glideX = tx; this.glideZ = tz; this.glideT = 0.4; } else { b.x = tx; b.z = tz; this.glideT = 0; }
  }

  /** Мій гравець «приймає» м'яч і стає виконавцем: можна цілитись (це й є пас). */
  trapMine(a, speed = 0) {
    if (a.cool > 0) return;
    if (a.isGK) this.saveReact(a, true);
    if (this.shotBy === 1 && this.shooter && a !== this.shooter && this.bs === 'roll') { this.addXp(this.shooter, 10); this.addXp(a, 6); this.floatAt(a.p.x, a.p.z, 'ПАС!', 'good'); }
    if (a.isGK) this.addXp(a, 25);
    this.placeBallAt(a, true); audio.pass();
    a.p.setExpr('happy', 0.5);
    if (a.isGK) { this.gkReceive(a, speed); if (!a.footBall) this.floatAt(a.p.x, a.p.z, 'СЕЙВ!', 'good'); }
    else a.p.receive(this.ball.y, speed);
    this.view.ball.hop = 0.3;
    this.clearReceivers();
    this.makeReady(a);
  }

  makeReady(a, kickoff) {
    this.pendKick = null;
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
    if (a.isGK) this.saveReact(a, true);
    this.pendKick = null; this.shotWound = false;
    this.placeBallAt(a, true);
    if (this.holder) this.holder.manual = false;
    this.bs = 'held'; this.owner = -1; this.taker = a; a.manual = true; this.counter = true;
    this.showCard(a);
    this.dribbleT = 0; this.tackleT = 0; this.telegraph = false; this.thinkT = 0.15; this.dribZ = a.p.z; this.clearReceivers();
    a.p.receive(this.ball.y, speed);
    a.p.dribble = !a.isGK;
    this.ui.hud.warn('КОНТРАТАКА!');
    a.p.setExpr('angry', 1);
    if (a.isGK) { this.gkReceive(a, speed); if (!a.footBall) audio.save(); this.gkHoldT = a.footBall ? 0.3 : 0.7 + Math.random() * 0.4; }   // коротко: прийняв, притиснув — і грає далі
    this.aiming = false; this.hideAim();
  }

  clearReceivers() { for (const a of this.actors) a.receiver = false; this.passTarget = null; this.receiverT = 0; }

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
      if (lane < (gkTaker ? 2.6 : 1.7)) continue;
      const free = this.laneClear(q.p.x, q.p.z, q.p.x, q.p.z, this.mine, 1), open = clamp(free / 6, 0, 1.3);
      // воротар кидає рукою (повільніше за пас ногою): лише тому, хто відкритий (суперник не ближче ~4 м) і недалеко
      if (gkTaker && (free < 4 || len > 32)) continue;
      const deep = q.p.x + L < 26 ? 1 + (this.laneClear(q.p.x, q.p.z, -L, 0, this.mine, 0) > 2.5 ? 1 : 0) : 0;
      const score = fwd * 2.4 + open * 1.7 + Math.min(lane, 4) * 0.5 + deep - len * 0.03 + (Math.random() - 0.5) * (1 - a.sk.iq) * 3.5;
      if (score > bs) { bs = score; best = q; }
    }
    if (!best) return null;
    this.passScore = bs;
    return best;
  }

  /** Кому воротар суперника вибиває ногою: найдальший уперед свій, біля якого наших немає ближче ~3.5 м. */
  longTarget(a) {
    let best = null, bf = -1e9;
    for (let i = 1; i < this.opp.length; i++) {
      const q = this.opp[i]; if (q.stun > 0 || q.frozen > 0 || q.sliding) continue;
      const d = Math.hypot(q.p.x - a.p.x, q.p.z - a.p.z); if (d < 12 || d > 60) continue;
      const free = this.laneClear(q.p.x, q.p.z, q.p.x, q.p.z, this.mine, 1); if (free < 3.5) continue;
      const f = (a.p.x - q.p.x) + free * 2;                              // далі вперед і вільніше
      if (f > bf) { bf = f; best = q; }
    }
    return best;
  }

  /** Віддати пас партнеру: м'яч летить на випередження, партнер біжить на прийом. */
  /**
   * Пас/кидок суперника — як у людини: гравець розвертається до адресата, робить замах (анімація удару чи кидка), і м'яч
   * летить лише в мить контакту (~0.13 с; кидок ~0.18). Раніше м'яч вилітав одразу, а нога ще не рушила — і пас убік
   * виглядав як м'яч, що полетів сам.
   */
  passTo(a, best, long = false) {
    if (this.pendKick) return;
    const hands = a.isGK && !a.footBall && !long, b = this.ball;
    a.p.yaw = Math.atan2(best.p.x - b.x, best.p.z - b.z);
    a.p.dribble = false; if (hands) a.p.throwBall(); else a.p.kick(long ? 0.9 : 0.35);
    this.pendKick = { t: hands ? 0.18 : 0.13, fn: () => this.doPass(a, best, long) };
  }

  doPass(a, best, long) {
    const b = this.ball, hands = a.isGK && !a.footBall && !long;   // кидок рукою (long — воротар вибиває ногою)
    const err = (1 - a.sk.pass) * (hands ? 1.2 : 3.2);                // рукою точніше
    const dx = best.p.x + best.p.vx * 0.35 - b.x + (Math.random() - 0.5) * err, dz = best.p.z + best.p.vz * 0.35 - b.z + (Math.random() - 0.5) * err, d = Math.hypot(dx, dz) || 1;
    // воротар кидає рукою — м'якше, ніж б'є польовий (до ~32 м/с)
    const sp = (hands ? clamp(10 + d * 0.55, 13, 26) * GK_THROW : clamp(16 + d * 0.9, 22, 46)) * (0.92 + 0.16 * a.sk.pass);
    b.vx = (dx / d) * sp; b.vz = (dz / d) * sp;
    a.cool = 0.35; a.noTrap = 1.3; a.manual = false; this.taker = null; this.lastOppTaker = a;
    best.receiver = true; this.passTarget = best; this.receiverT = 3.2;
    audio.pass();
    this.bs = 'roll'; this.owner = 0; this.shotBy = -2; this.shotBounces = 0; this.looseT = 0; this.counter = true; this.protectT = 0; this.shotId++; this.ui.hud.setCard(null);
    this.ui.hud.warn(null);
  }

  /** Початкова швидкість, з якою м'яч пролетить dist і матиме там швидкість vEnd (гальмування як у world.js: v' = −k·v − r). */
  launchFor(dist, vEnd) {
    const k = PHYS.drag, r = PHYS.roll, h = 1 / 120;
    const reach = (v0) => { let v = v0, s = 0; while (s < dist && v > vEnd) { v = v * Math.exp(-k * h) - r * h; s += v * h; } return v; };
    let lo = vEnd, hi = PHYS.maxSpeed;
    for (let i = 0; i < 18; i++) { const m = (lo + hi) / 2; if (reach(m) < vEnd) lo = m; else hi = m; }
    return hi;
  }

  /** Підготувати удар у вибрану точку воріт (з попередженням-прицілом). */
  startShot(a, tz) {
    const b = this.ball, spec = this.spec;
    this.telegraph = true; this.shootT = 0.5; this.shotWound = false;
    const z = tz * (0.55 + 0.45 * this.kk.concede);
    const dx = -L - 1 - b.x, dz = z - b.z, d = Math.hypot(dx, dz) || 1;
    // сила удару — під відстань: м'яч у грі сильно гальмує (з 40 м удар у 40 м/с долітав ледь живим, ~10 м/с), тож бот
    // б'є так, щоб біля воріт м'яч ще мав ~20–43 м/с (сильніша ліга й кращий «Удар» — швидше). Воротар (довгий вибив) — без змін
    let sp = spec.counterSpeed * (a.isGK ? 1.05 : 1) * (0.9 + 0.2 * a.sk.shoot);
    if (!a.isGK) sp = Math.min(PHYS.maxSpeed, Math.max(sp, this.launchFor(d, spec.counterSpeed * 0.6 * (0.85 + 0.3 * a.sk.shoot))));
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
    // воротарю нема кому кинути: ще трохи чекає (партнери відкриваються), потім вибиває ногою далеко — своєму, найдальшому
    // вільному; і лише якщо зовсім нікого — просто подалі в поле
    if (a.isGK && this.dribbleT > 2.2) { const q = this.longTarget(a); if (q) this.passTo(a, q, true); else this.startShot(a, rand(-G + 1, G - 1)); return; }
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
    if (this.pendKick) {                                           // замах: тіло гальмує, м'яч чекає на ногу
      const k = this.pendKick; k.t -= dt; a.p.vx *= 0.85; a.p.vz *= 0.85; b.vx *= 0.8; b.vz *= 0.8;
      if (k.t <= 0) { this.pendKick = null; k.fn(); }
      return;
    }
    if (this.kickoff) {                                            // розведення суперника: мить постоїть у центрі, потім гра пішла
      this.kickT = (this.kickT || 0) + dt; a.p.vx = a.p.vz = 0;
      if (this.kickT < 1.0) return;
      this.kickoff = false;
      // розведення як у футболі: перший пас своєму — назад або вбік (на свою половину), а не біг із м'ячем уперед
      let q = null, bs = -1e9;
      for (let i = 1; i < this.opp.length; i++) {
        const m = this.opp[i]; if (m === a) continue;
        const dx = m.p.x - a.p.x, dz = m.p.z - a.p.z, d = Math.hypot(dx, dz);
        if (d < 5 || d > 26 || dx < -2) continue;                      // не вперед (суперник атакує в бік −x)
        const sc = -Math.abs(d - 11) * 0.3 + this.laneClear(a.p.x, a.p.z, m.p.x, m.p.z, this.mine, 0) * 0.5 + Math.random();
        if (sc > bs) { bs = sc; q = m; }
      }
      if (q) { this.passTo(a, q); return; }
    }
    // воротар суперника спіймав м'яч: не викидає миттєво, а тримає — довершує прийом, притискає до грудей, оглядає поле й
    // робить кілька кроків уперед; лише потім розігрує (кидком чи ударом)
    if (a.isGK && (this.gkHoldT > 0 || (!a.footBall && !this.gkClear && this.gkHoldT > -0.8))) {   // тримає, поки суперники не відійдуть (до ~0.8 с)
      this.gkHoldT -= dt;
      const busy = a.p.mode !== 'idle' || a.dive;
      if (!busy) { const ex = L - 13; a.move(Math.min(a.p.x, ex + 4), a.p.z * 0.98, 1.3, dt); } else { a.p.vx = a.p.vz = 0; }
      if (!a.dive) a.p.yaw = -Math.PI / 2;
      b.x = a.p.x - 0.5; b.z = a.p.z; b.vx = b.vz = 0; this.glideT = 0;
      return;
    }
    this.dribbleT += dt; this.thinkT -= dt;
    const toGoal = a.p.x + L;
    let pm = 99;
    for (let i = 1; i < this.mine.length; i++) { const m = this.mine[i].p, d = Math.hypot(m.x - a.p.x, m.z - a.p.z); if (d < pm) pm = d; }
    if (this.thinkT <= 0) { this.thinkT = 0.5 - 0.3 * a.sk.iq; this.takerThink(a, pm, toGoal); if (this.bs !== 'held') return; }
    if (!a.isGK) {
      // ведення дотиками (dribble.js): бажаний напрямок — до мети; гравець біжить до точки трохи позаду м'яча на цьому
      // напрямку (наздоганяє його), а дотиком ноги скеровує м'яч. Поворот — ногою: м'яч котиться старим курсом, доки
      // гравець не підбʼє його в новий бік
      const gx = -L + 22, gz = clamp(this.dribZ === undefined ? a.p.z : this.dribZ, -W + 3, W - 3);
      let dx = gx - a.p.x, dz = gz - a.p.z; const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
      const ds = (a.dribSt ??= { t: 0, steps: 0 });
      if (this.dribbleT < 0.05) { ds.t = 0; b.vx = a.p.vx; b.vz = a.p.vz; }
      this.oppTeam.avoid(a, this.actors);
      a.move(b.x + b.vx * 0.2 - dx * 0.55, b.z + b.vz * 0.2 - dz * 0.55, this.oppTeam.speed * (pm < 4 ? 1.0 : 0.9), dt);
      if (Math.hypot(a.p.vx, a.p.vz) > 0.5) a.p.yaw = Math.atan2(a.p.vx, a.p.vz);
      dribbleStep(ds, a.p, b, dx, dz, dt);
    } else {
      a.p.vx = a.p.vz = 0; if (!a.dive) a.p.yaw = -Math.PI / 2;
      const kf = Math.min(1, dt * 22); b.x += (a.p.x - 1.15 - b.x) * kf; b.z += (a.p.z - b.z) * kf; b.vx = b.vz = 0;
    }
    this.glideT = 0;
    // наші захисники: стоять у стійці перед дриблером і в слушну мить роблять випад (результат — у resolveTackle)
    if (!a.isGK && !this.mine.some((m) => m.tkl > 0)) {
      for (let i = 1; i < this.mine.length; i++) {
        const m = this.mine[i];
        if (m.manual || m.frozen > 0 || m.stun > 0 || m.noTrap > 0 || m.sliding) { m.nearT = 0; continue; }
        if (this.tackleReady(m, Math.hypot(m.p.x - b.x, m.p.z - b.z), 0.2 + 0.4 * (1 - m.sk.iq), dt)) { this.startTackle(m); break; }
      }
    }
    if (this.telegraph) {
      this.shootT -= dt;
      this.view.aim.draw(this.path, 1.1, 1.3, this.time * 3);
      // замах починається за ~0.13 с до удару: гравець розвертається до воріт, і м'яч летить у мить контакту ноги
      if (this.shootT <= 0.13 && !this.shotWound) { this.shotWound = true; a.p.yaw = Math.atan2(this.counterV.vx, this.counterV.vz); a.p.dribble = false; if (a.isGK) a.p.throwBall(); else a.p.kick(0.9); }
      if (this.shootT <= 0) this.releaseCounter();
    }
  }

  releaseCounter() {
    const b = this.ball, a = this.taker, c = this.counterV;
    const j = rand(-1, 1) * 2.5 * DEG * (this.spec.gkErr / 3) * (1.7 - 1.2 * a.sk.shoot), cs = Math.cos(j), sn = Math.sin(j);
    b.vx = c.vx * cs - c.vz * sn; b.vz = c.vx * sn + c.vz * cs;
    a.p.dribble = false; if (!this.shotWound) { if (a.isGK) a.p.throwBall(); else a.p.kick(0.9); }
    this.shotWound = false;
    a.cool = 0.35; a.noTrap = 1.3; a.manual = false; this.taker = null; this.lastOppTaker = a;
    audio.kick(0.8);
    this.bs = 'roll'; this.owner = 0; this.shotBy = -1; this.shotBounces = 0; this.looseT = 0; this.protectT = 0; this.shotId++; this.ui.hud.setCard(null);
    this.hideAim(); this.ui.hud.warn(null);
  }

  /**
   * Удар у створ (м'яч іде в ворота суперника) — свої його пропускають, щоб не заблокувати. Будь-який інший удар — це пас:
   * партнер, що найкраще стоїть на лінії м'яча й встигає до неї, стає приймачем — біжить на перехоплення й гасить навіть
   * сильний м'яч (до ~30–40 м/с за «Дриблінгом»), а інші свої на шляху теж не пропускають його повз себе.
   */
  pickMyReceiver(h) {
    const b = this.ball, v = Math.hypot(b.vx, b.vz) || 1, ux = b.vx / v, uz = b.vz / v;
    this.clearReceivers();
    const zAt = ux > 0.05 ? b.z + uz * (L - b.x) / ux : 99;
    this.shotOnTarget = ux > 0.05 && Math.abs(zAt) < G + 1.2 && (L - b.x) < 60;
    if (this.shotOnTarget) return;
    let best = null, bs = 1e9;
    for (let i = 1; i < this.mine.length; i++) {
      const q = this.mine[i]; if (q === h || q.stun > 0 || q.frozen > 0 || q.p.downed) continue;
      const rx = q.p.x - b.x, rz = q.p.z - b.z, along = rx * ux + rz * uz, perp = Math.abs(rx * uz - rz * ux);
      if (along < 3) continue;
      // м'яч долітає до точки навпроти партнера за ~along/v·1.4 с (з гальмуванням); партнер має встигнути збоку
      const tBall = (along / v) * 1.4 + 0.15, can = perp < 1.2 + 7.5 * tBall * (0.84 + 0.34 * q.sk.pace);
      if (!can) continue;
      const sc = perp * 1.6 + along * 0.08;
      if (sc < bs) { bs = sc; best = q; }
    }
    if (best) { best.receiver = true; this.passTarget = best; this.receiverT = 3; }
  }

  launchShot() {
    const b = this.ball, sh = this.shot, h = this.holder;
    const j = rand(-1, 1) * this.st.jitter * (1.5 - 0.9 * (sh.power >= 0.45 ? h.sk.shoot : h.sk.pass)) * DEG, cs = Math.cos(j), sn = Math.sin(j);
    b.vx = sh.vx * cs - sh.vz * sn; b.vz = sh.vx * sn + sh.vz * cs; ground(b);
    this.bs = 'roll'; this.owner = 0; this.shotBy = 1; this.shotBounces = 0; this.looseT = 0; this.ts = 1; this.shotId++; this.kickoff = false; this.ui.hud.setCard(null);
    this.glideT = 0;                                   // м'яч, що ще докочувався до ніг, більше не гальмується
    h.cool = 0.35; h.noTrap = 1.4; h.manual = false; this.protectT = 2.2;
    h.p.setThreat(0, 0); this.shooter = h;
    this.pickMyReceiver(h);
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
    this.bs = 'net'; this.owner = 0;                               // м'яч летить далі — у пружну сітку, відскакує й падає
    this.nextKick = mine ? -1 : 1;                                 // з центру розводить та команда, якій забили
    this.goalMine = mine; this.goalT = 0; this.goalTime = this.time; this.rp = null;
    this.endDrama(); this.ui.hud.cine(true);
    this.hideAim(); this.ui.hud.warn(null); this.ui.hud.setCard(null);
    if (this.holder) this.holder.manual = false;
    if (this.taker) { this.taker.manual = false; this.taker = null; }
    const gx = side * (L + 1);
    const sc = mine ? (this.shooter || this.mine[1]) : (this.lastOppTaker || this.opp[1]);
    let gt;
    if (mine) {
      this.score.me++; this.stats.goals++;
      const bn = this.shotBounces, mult = bn >= 2 ? Math.min(4, 1 + 0.5 * (bn - 1)) : 1;
      this.stats.combo = Math.max(this.stats.combo, mult);
      const c = Math.round(50 * spec.scale * mult);
      this.coins += c; this.ui.hud.setCoins(this.coins);
      if (this.shooter && this.mine.indexOf(this.shooter) >= 0) { this.addXp(this.shooter, 60 + (bn >= 2 ? 20 : 0)); if (this.shooter.info) this.shooter.info.goals++; }
      gt = ['ГОЛ!', (bn >= 2 ? 'РИКОШЕТ ×' + mult + ' · ' : '') + '+' + c, 'me'];
      v.stands.react('goal', { mine: true });
      for (let i = 0; i < this.opp.length; i++) this.opp[i].p.sad(5);
      v.particles.burst(gx, 1.4, 0, 60, 11, 1.8, 0.4, ['#b3162a', '#117a4a', '#f1efe8', '#e8b923'], 12, 1.0);
      audio.goal(); this.game.addTrauma(0.6); this.game.fovKick(4); vibrate([30, 40, 60]);
      this.ui.flash('rgba(255,255,255,.4)');
    } else {
      this.score.opp++;
      gt = ['ПРОПУСТИЛИ', 'контратака спрацювала', 'opp']; v.stands.react('goal', { mine: false });
      for (let i = 0; i < this.mine.length; i++) this.mine[i].p.sad(5);
      v.particles.burst(gx, 1.4, 0, 24, 8, 1.4, 0.35, ['#9ca3af', '#4b5563', '#f1efe8'], 12, 1.0);
      audio.concede(); this.game.addTrauma(0.4); vibrate(80);
    }
    // важливість гола: від неї — святкування, розпач суперника, трибуни, салют і підпис
    const { I, tag } = this.goalImportance(mine);
    this.setupCelebration(mine, sc, side, I);
    this.ui.hud.goal(gt[0], tag ? tag + ' · ' + gt[1] : gt[1], gt[2]);
    if (I > 0.55) { v.stands.react('goal', { mine, dur: 3.8 + 3 * I }); audio.crowd(1); this.walk.fireworks(3 + Math.round(4 * I)); this.game.addTrauma(0.25 * I); }
    this.ui.hud.setScore(this.score.me, this.score.opp);
    this.ts = 0.28;
    this.game.sm.go('GOAL', { mine });
  }

  updateGoal(rawDt) {
    if (this.rp) { this.updateClip(rawDt); return; }
    this.goalT += rawDt;
    // мить гола — сповільнення (×0.28); важливий гол — сповільнення довше. Далі плавно назад до звичайного темпу
    const I = this.celeb ? this.celeb.I : 0.3, k = clamp((this.goalT - (0.45 + 0.8 * I)) / 0.7, 0, 1);
    this.ts = 0.28 + (1 - 0.28) * k;
    this.tick(rawDt * this.ts, rawDt);
    // святкування (довше для важливого гола) → повтор гола → розведення з центру; гол ще й у підбірку тайму
    if (this.goalT > (this.celeb ? this.celeb.dur : 5)) {
      const clip = this.storeClip('goal', this.goalTime, this.goalMine ? 1 : -1);
      if (clip) this.playClips([clip], 'ПОВТОР', () => this.afterGoal()); else this.afterGoal();
    }
  }
  afterGoal() {
    this.ui.hud.clearGoal(); this.ui.hud.cine(false);
    if (this.golden || this.timeUp) { this.game.sm.go('MATCH', { resume: true }); this.end(); return; }
    this.formation(this.nextKick || 1);
    this.game.sm.go('MATCH', { resume: true });
  }

  // ------------------------------------------------------------------ головний цикл
  update(rawDt) {
    if (this.phase === 'pens') { const pd = this.pens.update(rawDt); this.syncView(pd); this.pens.post(); return; }
    if (this.phase === 'paused') { this.syncView(0); return; }
    if (this.phase === 'break') { this.updateBreak(rawDt); return; }
    if (this.dramaCool > 0) this.dramaCool -= rawDt;
    if (this.drama) { this.drama.t += rawDt; if (this.drama.t > this.drama.dur || this.bs !== 'roll' || this.phase !== 'play') this.endDrama(); }
    if (this.hitStop > 0) { this.hitStop -= rawDt; this.syncView(0); return; }
    this.updateSlow(rawDt);
    const k = this.drama ? 0.3 : this.slow ? this.slowTarget : 1;      // драматичний момент — сповільнена зйомка
    this.ts += (k - this.ts) * Math.min(1, rawDt * (this.slow || this.drama ? 14 : 20));
    const dt = rawDt * this.ts;

    if (this.phase === 'intro') {
      this.introT += rawDt;
      this.driveIntro(this.introT, rawDt);
      // свисток — коли всі вже на позиціях (до 4 с запасу), щоб на склейці з ігровою камерою ніхто не «перескакував»
      if (this.introEndAt != null && this.introT >= this.introEndAt && (this.introT > this.introEndAt + 4 || this.skipEnd || this.actors.every((a) => a.post && a.post.st === 'home'))) this.endIntro();
      this.syncView(rawDt);
      return;
    }
    if (this.phase === 'end') {
      // фінальний свисток: гра зупинилась (жодного ІІ, м'яч не грає) — переможці біжать обіймати свого воротаря й радіють,
      // ті, що програли, зупиняються й сумують. Через ~4 с — екран результату
      // далі пари гравців двох команд сходяться й тиснуть руки; камера — крупно на рукостисканнях, потім загальний план
      this.endT += rawDt; this.endCelebrate(rawDt); if (this.endT > 2.8) this.endShake(rawDt); this.syncView(rawDt);
      if (this.endT > END_T && !this.resultSent) { this.resultSent = true; this.ui.hud.cine(false); this.game.sm.go('RESULT', this.result); }
      return;
    }
    if (this.phase === 'play') {
      this.clock -= dt;                  // годинник іде в темпі гри: у сповільненні він теж повільніший
      const s = Math.ceil(Math.max(0, this.clock));
      if (s !== this.lastClock) {
        this.lastClock = s; this.ui.hud.setTime(this.timeText(), this.clock <= 10, this.halfText());
        if (s <= 5 && s > 0) audio.click();
      }
      // кінець тайму (їх 4): свисток у першу паузу (м'яч у нас) або за ~4 с, коротка перерва, новий тайм — з центру
      if (this.period < 4 && !this.timeUp && this.clock <= this.spec.time * (1 - this.period / 4)) {
        if (!this.periodEnd) { this.periodEnd = true; this.periodWait = 0; }
        this.periodWait += rawDt;
        if (this.bs === 'ready' || this.bs === 'aim' || this.periodWait > 4) { this.cancelAim(); this.nextPeriod(); return; }
      }
      if (this.clock <= 0 && !this.timeUp) { this.timeUp = true; this.timeUpWait = 0; }
      if (this.timeUp) {
        this.timeUpWait += rawDt;
        if (this.bs === 'ready' || this.bs === 'aim' || this.timeUpWait > 5) { this.cancelAim(); this.timeOver(); return; }
      }
    }
    this.tick(dt, rawDt);
  }

  /** Перерва між таймами: свисток, табличка, розстановка з центру; годинник — рівно на межі тайму. */
  nextPeriod() {
    const n = this.period;
    this.period++; this.periodEnd = false;
    this.clock = this.spec.time * (1 - n / 4);
    audio.whistle(true);
    this.ui.hud.banner('Кінець ' + n + '-го тайму', this.score.me + ' : ' + this.score.opp, n === 2 ? 'Перерва — далі 3-й тайм' : 'Далі ' + (n + 1) + '-й тайм');
    this.endDrama(); this.startBreak(n);
    this.ui.hud.setTime(this.timeText(), false, this.halfText());
  }

  timeOver() {
    if (this.phase === 'pens') return;
    if (this.score.me === this.score.opp && !this.penRes) {
      this.pens = new Penalties(this); this.pens.start();
      return;
    }
    this.end();
  }
  /**
   * Вихід команд — кат-сцена перед матчем (монтаж: між кадрами процесія «перескакує» вперед, як у кіно):
   * A — проліт над стадіоном: посеред поля волонтери розгортають великий прапор клубу, на трибунах фаєри;
   * B — вихід із тунелю на камеру (крок), попереду прапороносці; C — камера задкує перед колонами; D — бічний план;
   * E — шикування, салют; гімн (долоня на серці); «п'ятірки» вздовж шеренги; розбіг на позиції.
   */
  procLead(t) {
    // процесія йде безперервно в темпі кроку від тунелю до лінії шикування — кадри лише змінюють ракурс, ніхто не «стрибає»
    if (t < A_END) return [-99, 0];
    if (t < E_END) return [WALK_V * (t - A_END), WALK_V];
    return [999, 0];
  }
  /**
   * Де на маршруті процесії точка на відстані d: від тунелю прямо, потім плавна дуга (радіус до ~3 м — як людина
   * заходить у поворот, без кута) уздовж лінії шикування (z = LZ) до свого місця, і м'яка зупинка — крок сповільнюється
   * за останній метр, а не обривається.
   */
  procAt(sd, lx, d, sp, out) {
    const tz = this.view.tunnel.userData.startZ, lz = LZ, cx = sd * 1.1, L2 = Math.abs(lx - cx), dir = Math.sign(lx - cx) || 1;
    const R = clamp(L2, 0.6, 3.2), S1 = lz - R - tz, A = Math.PI * R / 2, Lt = S1 + A + (L2 - R), b = 0.9;
    let s = d, v = d >= 0 ? sp : 0;
    if (d > Lt - b) { const e = Math.exp(-(d - (Lt - b)) / b); s = Lt - b * e; v = sp * e; }
    if (s < S1) { out.x = cx; out.z = tz + Math.max(0, s); out.vx = 0; out.vz = v; }
    else if (s < S1 + A) {                                                                    // дуга: центр (cx + dir·R, lz − R)
      const th = (s - S1) / R, sn = Math.sin(th), cs = Math.cos(th);
      out.x = cx + dir * R * (1 - cs); out.z = lz - R + R * sn; out.vx = dir * sn * v; out.vz = cs * v;
    } else { out.x = cx + dir * (R + (s - S1 - A)); out.z = lz; out.vx = dir * v; out.vz = 0; }
    out.yaw = Math.atan2(out.vx || (s >= S1 ? dir : 0), out.vz || (s < S1 ? 1 : 0));
    out.done = v < 0.12 && d > Lt;                                                            // майже зупинився — розвертається до трибуни
    out.hidden = d < 0;
    return out;
  }
  driveIntro(t, dt) {
    const F = this.introFlags, v = this.view;
    if (t > 0.3 && !F.wave) { F.wave = true; v.stands.react('wave', { dur: 5 }); audio.crowd(0.9); }
    if (t > 1.2 && !F.fw0) { F.fw0 = true; this.walk.fireworks(3); }
    if (t > A_END && !F.out) { F.out = true; v.stands.react('wave', { dur: 7 }); audio.crowd(1.0); }
    if (t > E_END - 0.3 && !F.fw1) { F.fw1 = true; this.walk.fireworks(6); v.stands.react('goal', { mine: true, dur: 2.5 }); }
    if (t > E_END + 0.1 && !F.anthem) { F.anthem = true; for (const arr of [this.mine, this.opp]) arr.forEach((a, i) => { a.p.gesture(2.0 + (i % 3) * 0.1, 4); a.p.setExpr('angry', 2); }); audio.crowd(0.55); }
    if (t > HS_T && !F.clap) { F.clap = true; v.stands.react('clap', { dur: 8 }); audio.crowd(0.8); }
    // усі дійшли (оплески позаду, біжать на місця) — останній кадр інтро: підйом камери до ігрового плану
    if (t > HS_T && !this.introEndAt) {
      // свисток — лише коли всі майже на позиціях (без телепорту на склейці з ігровою камерою)
      const tg = (a) => this.introTgt[a.side > 0 ? 0 : 1][(a.side > 0 ? this.mine : this.opp).indexOf(a)];
      const near = (a) => a.post && (a.post.st === 'home' || (a.post.st === 'run' && Math.hypot(tg(a).x - a.p.x, tg(a).z - a.p.z) < 3.4 * 3.2));
      if (this.actors.every(near)) { this.introEndAt = t + 3.4; v.stands.react('wave', { dur: 4 }); this.walk.fireworks(6); audio.crowd(1.0); }
      else if (t > HS_MAX) this.introEndAt = t + 1;
    }
    const [lead, lsp] = this.procLead(t), R = (this._pr ??= {});
    [this.mine, this.opp].forEach((arr, ti) => {
      const sd = ti === 0 ? -1 : 1;
      arr.forEach((a, i) => {
        const tgt = this.introTgt[ti][i], jr = a._jr ?? 0.5, lx = sd * (2.0 + i * LINE_DX) + (i ? 0.4 * (jr - 0.5) : 0), lz = LZ;   // шеренга не по лінійці
        if (t >= HS_T) {
          if (this.postStep(a, ti, t, dt, tgt)) return;                   // уже пройшов: оплески, пробіжка на позицію
          if (ti === 1) { this.laneStep(a, i, t, dt); return; }
        }
        let x, z, yaw = null, vx = null, vz = null;
        if (t < E_END) {
          // процесія: колону веде останній за номером (іде найдалі), воротар замикає; кожен — на 1.4 м позаду попереднього
          // дистанція й лінія в кожного своя (не стрій по лінійці)
          // «дихання» дистанції невелике: сусіди в колоні ніколи не зближуються ближче ~0.75 м
          const ph = jr * 20 + ti * 3, wob = 0.18 * Math.sin(t * 0.55 + ph) + 0.08 * Math.sin(t * 1.3 + ph * 1.9);
          this.procAt(sd, lx, lead - (10 - i) * COL_GAP - 0.25 * jr + wob, lsp + 0.18 * 0.55 * Math.cos(t * 0.55 + ph) + 0.08 * 1.3 * Math.cos(t * 1.3 + ph * 1.9), R);
          // свій бік у колоні — лише на прямій від тунелю; за ~3 м до повороту плавно сходить нанівець (без зсуву на повороті)
          { const d0 = lead - (10 - i) * COL_GAP, L1 = LZ - this.view.tunnel.userData.startZ; R.x += 0.28 * (jr - 0.5) * clamp((L1 - 3.4 - d0) / 2.5, 0, 1); }   // сходить нанівець до початку дуги
          a.p.root.visible = !R.hidden;
          x = R.x; z = R.z; vx = R.vx; vz = R.vz; yaw = R.done ? 0.24 * (jr - 0.5) : R.yaw;
          // на ходу кожен по-своєму: аплодує трибунам, махає, показує в небо, цілує емблему, розминає шию…
          if (!R.hidden && !R.done && dt > 0) {
            a._wg = (a._wg ?? 0.5 + 2.5 * jr) - dt;
            if (a._wg <= 0) { a._wg = 2.4 + Math.random() * 3; const w = a.p.persona.walk; if (Math.random() < 0.65 && a.p.mode === 'idle') a.p.gesture(1.4 + Math.random() * 0.8, w[(Math.random() * w.length) | 0]); }   // кожен — своїми жестами
          }
        } else {
          a.p.root.visible = true;
          // господар стоїть обличчям до трибуни весь час; кому зараз дають «п'ять» — робить півкроку вперед, назустріч гостю
          const sl = ti === 0 && t > HS_T ? this.slaps.of(a.p) : null, inT = sl ? 1 - smooth01((sl.t - 0.25) / 0.45) : 0;
          a._st = (a._st || 0) + (0.3 * inT - (a._st || 0)) * Math.min(1, dt * 6);
          x = lx; z = lz + a._st;
          // перші півтори секунди після шикування — м'яко «доходить» останні міліметри до свого місця, без ривка
          if (t < E_END + 1.5 && a._ix !== undefined) { const kk = Math.min(1, dt * 5); x = a._ix + (x - a._ix) * kk; z = a._iz + (z - a._iz) * kk; }
          if (t >= E_END) yaw = 0.2 * (jr - 0.5);                         // у шерензі — обличчям до трибуни, не крутиться
        }
        const px = a._ix === undefined ? x : a._ix, pz = a._iz === undefined ? z : a._iz;
        a._ix = x; a._iz = z;
        // швидкість: на маршруті процесії — справжня (стрибки на монтажних склейках її не смикають), інакше — з переміщення
        if (vx === null) { vx = dt > 0 ? (x - px) / dt : 0; vz = dt > 0 ? (z - pz) / dt : 0; if (Math.hypot(vx, vz) > 12) vx = vz = 0; }
        a.place(x, z); a.p.vx = vx; a.p.vz = vz; a.sync();
        const sp = Math.hypot(vx, vz);
        if (yaw === null) yaw = sp > 0.6 ? Math.atan2(vx, vz) : 0.24 * (jr - 0.5);
        a.p.yaw = yaw;
      });
    });
    if (t >= E_END && dt > 0) this.introSeparate();
    if (t >= HS_T) this.crowdBox();
    // церемонія: великий прапор, прапороносці попереду колон (після шикування стоять з краю, потім ідуть до тунелю)
    if (dt > 0) {
      const tz = v.tunnel.userData.startZ;
      const poleAt = (k, out) => {
        const sd = k ? 1 : -1, sx = sd * 19.6;
        if (t < E_END) { this.procAt(sd, sx, lead + 2.5, lsp, out); if (out.hidden) { out.x = sd * 1.1; out.z = tz; } }
        else if (t < HS_T + 0.5) { out.x = sx; out.z = LZ; out.vx = out.vz = 0; out.yaw = 0; }
        else { const u = t - HS_T - 0.5, e = Math.exp(-2 * u); out.x = sx; out.z = Math.max(tz, LZ - 1.7 * (u - 0.5 * (1 - e))); out.vx = 0; out.vz = out.z > tz ? -1.7 * (1 - e) : 0; out.yaw = Math.PI; }   // рушають до тунелю з розгону
        return out;
      };
      this.walk.update(dt, t, poleAt, t > E_END && t < HS_T ? 1 : t < A_END ? 1 : 0.3, t > HS_T);
    }
  }
  /**
   * Гість на доріжці вздовж шеренги господарів — сам іде кроком (власна швидкість, розгін і гальмування, тримає дистанцію
   * до того, хто попереду), а порівнявшись із черговим господарем, сповільнюється й дає йому «п'ять» з ляпасом.
   */
  laneStep(a, i, t, dt) {
    const L = (a.lane ??= { j: 0, v: 1.35 + 0.45 * (a._jr ?? 0.5), gp: Math.random(), inLane: false, slapT: -9 });   // звичайний крок, у кожного свій
    a._ix = a.p.x; a._iz = a.p.z; a.avx = a.avz = 0;
    if (t - HS_T < i * 0.11 + 0.15 * (a._jr ?? 0)) { a.p.vx = a.p.vz = 0; a.sync(); return; }   // ще стоїть у своїй шерензі
    if (!L.inLane && Math.abs(a.p.z - LANE_Z) < 0.12) L.inLane = true;
    let tx = L.inLane ? -(2 + 11 * LINE_DX + 3) : a.p.x - 1.1, sp = L.v;                       // проміжок між командами — бадьоро
    const ahead = i > 0 ? this.opp[i - 1] : null;
    if (ahead && ahead.lane && ahead.lane.inLane && !ahead.post) { const gap = a.p.x - ahead.p.x, want = 1.6 + 0.8 * L.gp; if (gap < want + 0.6) sp = Math.min(sp, Math.max(0, (gap - want) * 2.2)); }   // кожен тримає свою дистанцію
    if (t > L.slapT - 0.45 && t < L.slapT + 0.25) sp *= 0.8;                                    // на «п'ятірці» пригальмовує, далі йде своїм кроком
    // наступний господар. Гість іде вздовж −X: «попереду» — це менший X. Удар — поки господар ще трохи попереду
    // (~0.4 м до мить контакту): гість тягнеться вперед-убік, а не назад через плече, коли вже пройшов
    let m = null;
    while (L.j < this.mine.length) { m = this.mine[L.j]; if (a.p.x - m.p.x > -0.05) break; L.j++; m = null; }   // уже поруч чи позаду — запізно, наступний
    if (m && L.inLane && t > L.slapT + 0.1) {
      const ahead = a.p.x - m.p.x, v = Math.max(0.6, Math.hypot(a.p.vx, a.p.vz)), lead = 0.38;
      if (ahead - v * 0.65 * lead < 0.45 && this.slaps.add(m.p, a.p, lead, false, 1, 0, true)) { L.slapT = t + lead; L.j++; }   // господар — правою, не розвертаючись; гість — лівою
    }
    // на «п'ятірці» гість на крок подається до шеренги (на відстань руки), потім повертається на доріжку
    const lean = L.inLane ? 0.45 * Math.max(0, 1 - Math.abs(t - L.slapT) / 0.55) : 0;
    a.move(tx, LANE_Z - lean, sp, dt); a.sync();
    const vy = Math.hypot(a.p.vx, a.p.vz) > 0.4 ? Math.atan2(a.p.vx, a.p.vz) : a.p.yaw;
    a.p.yaw = vy;                                                                                   // груди до господаря повертає сам жест (engage)
  }
  /**
   * Після шеренги — кожен у свій час. Гість, що пройшов останнього господаря, сходить із доріжки (щоб не заважати
   * тим, хто йде слідом), а господар — коли повз нього пройшли всі гості: зупиняється, розвертається до трибуни,
   * аплодує вболівальникам (своїм способом) — і підтюпцем біжить на свою позицію, де й чекає свистка.
   */
  postStep(a, ti, t, dt, tgt) {
    let P = a.post;
    if (!P) {
      const last = this.mine[this.mine.length - 1].p.x;
      const passed = ti === 1 ? !!a.lane && a.lane.j >= this.mine.length && a.p.x < last - 0.6
        : t > HS_T + 1 && !this.slaps.busy(a.p) && this.opp.every((o) => o.p.x < a.p.x - 0.9 || (o.post && o.post.st !== 'lane'));
      if (!passed) return false;
      const jr = a._jr ?? 0.5, off = ti === 1;
      P = a.post = { st: 'clap', t0: t, dur: 1.4 + 1.1 * jr, sx: a.p.x + (off ? -0.8 : 0), sz: off ? LANE_Z + 1.4 + 0.8 * jr : a.p.z };   // гість сходить із доріжки до трибуни — за нею вже ніхто не йде
      a.p.gesture(P.dur, a.p.persona.clap); a.p.setExpr('happy', P.dur + 0.5);
    }
    a.p.root.visible = true; a.avx = a.avz = 0;
    const jr = a._jr ?? 0.5;
    const wp = P.st === 'run' ? this.detour(a, tgt) : null;
    if (P.st !== 'home' && dt > 0) this.steerAround(a, wp ? wp.x : P.sx, wp ? wp.z : P.sz);
    if (P.st === 'clap') {
      if (dt > 0) a.move(P.sx, P.sz, 1.5, dt);
      if (t - P.t0 > P.dur) { P.st = 'run'; P.t1 = t; }
    } else if (P.st === 'run') {
      const d = Math.hypot(tgt.x - a.p.x, tgt.z - a.p.z);
      if (dt > 0) a.move(wp.x, wp.z, d > 5 ? 3.3 + 1.1 * jr : 2.0, dt);
      if (d < 0.35) P.st = 'home';
    } else { const k = Math.exp(-dt * 6); a.p.vx *= k; a.p.vz *= k; a.p.x += a.p.vx * dt; a.p.z += a.p.vz * dt; }
    a._ix = a.p.x; a._iz = a.p.z; a.sync();
    const sp = Math.hypot(a.p.vx, a.p.vz);
    a.p.yaw = sp > 0.7 ? Math.atan2(a.p.vx, a.p.vz)
      : P.st === 'clap' ? clamp(-a.p.x * 0.02, -0.4, 0.4) + 0.25 * (jr - 0.5)            // до трибуни, трохи до центру
      : a.side > 0 ? Math.PI / 2 : -Math.PI / 2;                                           // на позиції — до воріт суперника
    return true;
  }
  /**
   * Тап під час інтро пропускає лише поточний фрагмент: проліт → тунель → поле → бічний план → шикування → гімн →
   * «п'ятірки» (усі одразу біжать на позиції) → фінальний кадр (свисток). Між тапами — щонайменше 0.4 с.
   */
  skipIntroPart() {
    const t = this.introT;
    if (t < 0.6 || t - (this.skipAt ?? -9) < 0.4) return;
    this.skipAt = t;
    const next = [A_END, B_END, C_END, D_END, E_END, HS_T].find((b) => b > t + 0.05);
    if (next !== undefined) { this.introT = next + 0.01; this.skipAt = this.introT; return; }
    if (this.introEndAt == null) {
      this.slaps.clear();
      for (const a of this.actors) { a.post = a.post || { st: 'run', t0: t, dur: 0 }; if (a.post.st === 'clap') a.post.st = 'run'; a.p.setMode('idle'); a.p.root.visible = true; }
      this.introEndAt = t + 3.4;
    } else { this.introEndAt = t; this.skipEnd = true; }
  }
  /**
   * Де зараз «натовп» церемонії — шеренга господарів, доріжка з гостями й ті, хто аплодує: прямокутник із запасом.
   * Хто вже біжить на позицію, у нього не входить.
   */
  crowdBox() {
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const a of this.actors) {
      if (!a.p.root.visible || (a.post && a.post.st !== 'clap')) continue;
      x0 = Math.min(x0, a.p.x); x1 = Math.max(x1, a.p.x); z0 = Math.min(z0, a.p.z); z1 = Math.max(z1, a.p.z);
    }
    this._box = x0 > x1 ? null : { x0: x0 - 1.3, x1: x1 + 1.3, z0: z0 - 1.3, z1: z1 + 1.3 };
  }
  /**
   * Куди бігти зараз, щоб оминути натовп повністю: якщо прямий шлях до позиції перетинає прямокутник церемонії —
   * спершу збоку виходимо з нього (на ближчий край), далі біжимо вздовж зовнішнього боку до кута й лише тоді — на позицію.
   */
  detour(a, tgt) {
    const B = this._box, p = a.p, out = (this._wp ??= { x: 0, z: 0 });
    out.x = tgt.x; out.z = tgt.z;
    if (!B) return out;
    // чи перетинає відрізок p→tgt прямокутник (метод «плит»)
    const dx = tgt.x - p.x, dz = tgt.z - p.z;
    let t0 = 0, t1 = 1;
    for (const [o, d, lo, hi] of [[p.x, dx, B.x0, B.x1], [p.z, dz, B.z0, B.z1]]) {
      if (Math.abs(d) < 1e-6) { if (o < lo || o > hi) return out; continue; }
      let ta = (lo - o) / d, tb = (hi - o) / d; if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) return out;
    }
    // з якого боку оминати: за шеренгою господарів (+Z) чи за доріжкою (−Z) — де ближче разом до себе й до позиції
    const zc = (B.z0 + B.z1) / 2, side = (p.z - zc) + 0.6 * (tgt.z - zc) >= 0 ? 1 : -1, wz = side > 0 ? B.z1 + 0.6 : B.z0 - 0.6;
    const inBand = p.z > B.z0 && p.z < B.z1, dirx = Math.sign(dx) || 1;
    if (inBand) { out.x = p.x + dirx * 0.7; out.z = wz; }                                   // вийти з натовпу вбік
    else { out.x = dirx > 0 ? B.x1 + 0.8 : B.x0 - 0.8; out.z = wz; }                         // уздовж краю до кута
    return out;
  }
  /**
   * Обхід людей на шляху (як пішохід у натовпі): ті, хто попереду на курсі, — відштовхують убік від себе (обходимо збоку,
   * а не впираємось), поруч — легко розсуваємо. Результат — у a.avx/avz (додається до бажаної швидкості в move).
   */
  steerAround(a, tx, tz) {
    const p = a.p; let dx = tx - p.x, dz = tz - p.z; const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
    let ax = 0, az = 0;
    for (const q of this.actors) {
      if (q === a || !q.p.root.visible) continue;
      const rx = q.p.x - p.x, rz = q.p.z - p.z, d = Math.hypot(rx, rz);
      if (d > 2.6 || d < 1e-4) continue;
      const ahead = (rx * dx + rz * dz) / d, w = (1 - d / 2.6) ** 2;
      ax -= (rx / d) * w * 0.9; az -= (rz / d) * w * 0.9;                       // від людини
      if (ahead > 0.3) {                                                        // на курсі — обходимо збоку (в той бік, де людини нема)
        const side = Math.sign(rx * -dz + rz * dx) || 1;
        ax += dz * side * w * 1.6 * ahead; az += -dx * side * w * 1.6 * ahead;
      }
    }
    a.avx = ax * 2.4; a.avz = az * 2.4;
  }
  /**
   * Ніхто ні в кого не заходить: якщо двоє ближче ~0.8 м (плечі кубічних фігур), їх розводить на межу — той, хто рухається
   * сам (іде доріжкою, аплодує, біжить на позицію), поступається; шеренга господарів стоїть на місці.
   */
  introSeparate() {
    const A = this.actors, R = 0.8;
    const dyn = (a) => !!a.post || (a.side < 0 && !!a.lane);
    for (let i = 0; i < A.length; i++) {
      const a = A[i]; if (!a.p.root.visible) continue;
      for (let j = i + 1; j < A.length; j++) {
        const b = A[j]; if (!b.p.root.visible) continue;
        const da = dyn(a), db = dyn(b); if (!da && !db) continue;
        let dx = b.p.x - a.p.x, dz = b.p.z - a.p.z, d = Math.hypot(dx, dz);
        if (d >= R) continue;
        if (d < 1e-4) { dx = 1; dz = 0; d = 1e-4; }
        const pen = R - d, wa = da ? (db ? 0.5 : 1) : 0, wb = db ? (da ? 0.5 : 1) : 0;
        a.p.x -= (dx / d) * pen * wa; a.p.z -= (dz / d) * pen * wa; b.p.x += (dx / d) * pen * wb; b.p.z += (dz / d) * pen * wb;
        a.sync(); b.sync(); a._ix = a.p.x; a._iz = a.p.z; b._ix = b.p.x; b._iz = b.p.z;
      }
    }
  }
  /** Кат-сцени: гравці роззираються довкола (у грі погляд — на м'яч). */
  setGaze(on) { for (const a of this.actors) a.p.gaze = on; }
  endIntro() {
    this.view.pitch.decals.fadeOut();
    this.formation();
    for (const a of [...this.mine, ...this.opp]) { a._ix = undefined; a._iz = undefined; }
    this.introFrom = null; this.ui.hud.cine(false); this.setGaze(false); this.walk.hide();
    for (const a of this.actors) a.p.root.visible = true;
    audio.crowd(0.7); this.phase = 'play'; this.readyT = 0; this.slowT = 0; audio.whistle(true);
    this.ui.hud.hint(S.tutorial ? null : (this.ui.useJoy() ? 'Час сповільнено: тягни джойстик у бік удару й відпусти' : 'Час сповільнено: відтягни від м’яча й відпусти'));
  }
  /**
   * Кадри інтро: переліт над стадіоном, супровід виходу, проїзд камери вздовж облич обох шеренг під гімн, низька камера,
   * що йде поруч із гостями на рукостисканнях, кран над шеренгою — і підйом до ігрового плану. Між кадрами — монтажні склейки.
   */
  introCam(t) {
    const L2 = (a, b, q) => a + (b - a) * clamp(q, 0, 1);
    const V3 = (x, y, z) => new THREE.Vector3(x, y, z), zl = this.view.tunnel.userData.startZ + this.procLead(t)[0];
    // Кінематографічно: середні плани (видно всіх, але близько), камера перед людьми й над ними на висоті крана (5–8 м),
    // телеоб'єктив із розмитим фоном; фокус — автоматичний (найближчий гравець біля центру кадру). Процесія між
    // кадрами йде далі без пропусків — склейка лише змінює ракурс
    // A: дрон спускається спіраллю з неба над стадіоном до великого прапора
    if (t < A_END) { const q = t / A_END, an = L2(2.1, 1.25, q), R = L2(92, 50, q); return { p: V3(Math.sin(an) * R, L2(56, 22, q), 8 + Math.cos(an) * R * 0.85), l: V3(0, 1.5, L2(0, 5, q)), fov: L2(38, 44, q), shot: 'A', rate: 2.5, dof: 0 }; }
    // B: перед тунелем трохи збоку, на висоті людини: команди виходять із темряви
    if (t < B_END) { const q = (t - A_END) / (B_END - A_END); return { p: V3(L2(3.2, 2.6, q), 2.1, L2(-28.5, -27.5, q)), l: V3(0, 1.6, Math.max(zl + 2.5, -37)), fov: 40, shot: 'B', rate: 2.5, dof: 0.014 }; }
    // C: перед колонами, камера їде назад разом із ними
    if (t < C_END) return { p: V3(0.4 * Math.sin(t * 0.7), 1.3, zl + 9), l: V3(0, 1.85, zl - 1.5), fov: 42, shot: 'C', rate: 6, smooth: false, dof: 0.012 };
    // D: над колонами, невисоко (кран ~6.5 м), попереду — прапори на передньому плані, колони йдуть за ними
    if (t < D_END) return { p: V3(5, 6.5, Math.min(zl + 7.5, LZ + 4)), l: V3(0, 0.6, Math.min(zl - 3, LZ - 2)), fov: 46, shot: 'D', rate: 2.5, dof: 0.006 };
    // E: прямо перед усіма — команди розходяться вздовж лінії й стають у шеренги
    if (t < E_END) { const q = (t - D_END) / (E_END - D_END); return { p: V3(L2(-3, 1, q), 2.4, LZ + 12), l: V3(L2(-2, 0, q), 1.3, LZ), fov: 58, shot: 'E', rate: 2, dof: 0.008 }; }
    // гімн: перед шеренгою на середній відстані, повільний проїзд — різкі обличчя, розмиті трибуни
    if (t < AN_T) { const q = (t - E_END) / (AN_T - E_END); return { p: V3(L2(-9, -5, q), 1.9, LZ + 6.5), l: V3(L2(-8, -4.5, q), 1.5, LZ), fov: 38, shot: 2, rate: 2.5, dof: 0.016 }; }
    if (t < HS_T) { const q = (t - AN_T) / (HS_T - AN_T); return { p: V3(L2(9, 5, q), 1.9, LZ + 6.5), l: V3(L2(8, 4.5, q), 1.5, LZ), fov: 38, shot: 3, rate: 2.5, dof: 0.016 }; }
    // фінал: камера піднімається над полем до ігрового плану, поки всі добігають на позиції
    if (this.introEndAt != null && t > this.introEndAt - 3.4) { const q = (t - this.introEndAt + 3.4) / 3.4; return { p: V3(-8, L2(12, 18, q), L2(LZ + 22, 34, q)), l: V3(-8, 0, L2(LZ + 4, 0, q)), fov: 42, shot: 6, rate: 2.5, dof: 0 }; }
    // «п'ятірки»: господарі обличчям до трибуни, гості йдуть перед ними; монтаж по ~4 с, центр подій іде дуже повільно
    const dtc = clamp(t - (this._camT ?? t), 0, 0.1); this._camT = t;
    let X = 0, n = 0; for (const o of this.opp) if (!o.post && o.lane && o.lane.inLane) { X += o.p.x; n++; }
    X = n ? X / n : this.mine[5].p.x;
    this._cx = this._cx === undefined ? X : this._cx + (X - this._cx) * (1 - Math.exp(-dtc * 0.5));
    const C = this._cx, u = t - HS_T, k = Math.floor(u / 4) % 5, us = u - 4 * Math.floor(u / 4), id = Math.floor(u / 4), Z = LZ + 0.7;
    // перед усіма: обличчя господарів, гості проходять перед ними
    if (k === 0) return { p: V3(C - 0.5 * us, 2.3, LZ + 8.5), l: V3(C - 0.5 * us, 1.3, Z), fov: 50, shot: 'W0' + id, rate: 2, dof: 0.01 };
    // над ними невисоко (~7.5 м), повільний проліт уздовж шеренги
    if (k === 1) return { p: V3(C + 3 - 0.8 * us, 7.5, LZ + 8), l: V3(C - 0.8 * us, 0.5, Z), fov: 44, shot: 'W1' + id, rate: 2, dof: 0.005 };
    // на доріжці попереду гостей: вони йдуть на камеру, праворуч — шеренга господарів
    if (k === 2) return { p: V3(C - 6.5, 1.65, LANE_Z + 1.3), l: V3(C + 1, 1.45, LANE_Z - 0.3), fov: 40, shot: 'W2' + id, rate: 2, dof: 0.014 };
    // довгий об'єктив уздовж шеренги з її кінця: тісно, фон розмитий — як на трансляції
    if (k === 3) { const end = this.mine[this.mine.length - 1].p.x; return { p: V3(end - 10, 1.8, Z + 0.6), l: V3(C, 1.45, Z), fov: 20, shot: 'W3' + id, rate: 2, dof: 0.02 }; }
    // повільний облет краном навколо центру подій (~5 м), з боку трибуни
    const an = -0.7 + 0.12 * us; return { p: V3(C + Math.sin(an) * 10, 5, Z + Math.cos(an) * 10), l: V3(C, 1, Z), fov: 46, shot: 'W4' + id, rate: 2, dof: 0.008 };
  }

  /** Запуск серії пенальті достроково (з паузи). */
  startPens() {
    if (this.phase === 'pens' || this.phase === 'end' || this.phase === 'idle') return;
    this.cancelAim(); this.penRes = null; this.timeUp = false;
    this.pens = new Penalties(this); this.pens.start();
  }
  camOverride() {
    const ph = this.phase === 'paused' ? this.prevPhase : this.phase;
    if (ph === 'intro') return this.introCam(this.introT);
    if (this.rp) return this.replayCam();
    if (ph === 'break' && this.brk) return this.breakCam();
    if (ph === 'end') return this.endCam();
    return ph === 'pens' && this.pens ? this.pens.camOverride() : null;
  }

  // ------------------------------------------------------------------ кат-сцени
  /**
   * Підбірка моментів тайму. Під час гри нічого не перериваємо: голи, сильні сейви й удари в штангу лише запам'ятовуємо —
   * через секунду після події вирізаємо з запису (кільцевий буфер) ~4 с навколо неї. У перерві між таймами їх показуємо.
   */
  markMoment(kind) {
    if (this.phase !== 'play') return;
    const last = this.moments[this.moments.length - 1];
    if (last && this.time - last.t < 2.5) return;                          // той самий епізод
    this.moments.push({ kind, t: this.time, side: this.ball.x >= 0 ? 1 : -1 });
  }
  storeClip(kind, tE, side) {
    const c = this.replay.cut(tE - 3.0, tE + 1.0); if (!c) return;
    Object.assign(c, { kind, tE, side, pr: kind === 'goal' ? 3 : kind === 'save' ? 2 : 1 });
    this.clips.push(c);
    if (this.clips.length > 4) { let w = 0; this.clips.forEach((x, i) => { if (x.pr < this.clips[w].pr) w = i; }); this.clips.splice(w, 1); }   // лишаємо найважливіші
    return c;
  }
  /** Чергові запам'ятовані моменти — вирізати, щойно після них минула секунда запису. */
  takeMoments(force = false) {
    while (this.moments.length && (force || this.time > this.moments[0].t + 1.05)) { const m = this.moments.shift(); this.storeClip(m.kind, m.t, m.side); }
  }
  /** Показ підбірки: кліп за кліпом — спершу в реальному темпі, останні ~2 с — сповільнено, з різних ракурсів. */
  startHighlights(n) {
    const list = this.clips.slice().sort((a, b) => a.tE - b.tE);
    this.clips = []; this.moments = [];
    this.playClips(list, 'ПІДБІРКА · ' + n + '-Й ТАЙМ', () => { this.ui.hud.cine(true, this.brk && this.brk.n === 2 ? 'ПЕРЕРВА' : null); if (this.brk) this.brk.t = 0; });
  }
  /** Програти кліпи один за одним (стан гри відкладено; після — повернуто як був), потім done(). */
  playClips(list, title, done) {
    this.hl = { list, i: -1, title, done };
    this.replay.saveLive();
    this.nextClip();
  }
  nextClip() {
    const H = this.hl; H.i++;
    if (H.i >= H.list.length) { this.endClips(); return; }
    const c = H.list[H.i], a = c.ts[0], b = c.ts[c.n - 1];
    this.rp = { a, b, slowAt: Math.max(a + 0.3, c.tE - 1.15), t: a, side: c.side, view: (Math.random() * 2) | 0, hold: 0, clip: c };
    const name = { goal: 'ГОЛ', save: 'СЕЙВ', post: 'ШТАНГА' }[c.kind];
    this.ui.hud.clearGoal();
    this.ui.hud.cine(true, H.list.length > 1 ? H.title + ' · ' + name + ' ' + (H.i + 1) + '/' + H.list.length : H.title);
    this.ui.flash('rgba(255,255,255,.4)');
    this.replay.applyClip(c, a);
  }
  updateClip(rawDt) {
    const r = this.rp, slow = r.t >= r.slowAt;
    if (slow && !r.slowOn) { r.slowOn = true; this.ui.flash('rgba(255,255,255,.22)'); }
    if (r.t < r.b) r.t = Math.min(r.b, r.t + rawDt * (slow ? 0.4 : 1)); else r.hold += rawDt;
    this.time += rawDt;                                                 // натовп і погода живуть далі
    this.replay.applyClip(r.clip, r.t);
    // сітка в повторі прогинається так само, як у грі (за положенням м'яча з запису)
    const B = this.replay.ball, sd = B.x > 0 ? 1 : -1, dep = Math.abs(B.x) - (L + PITCH.GOAL_D - PITCH.R);
    this.world.netPush = dep > 0 && Math.abs(B.z) < G + 0.5 ? { sd, depth: Math.min(0.55, dep), y: B.y, z: B.z } : null;
    this.netBulge(rawDt);
    const v = this.view; v.stands.update(rawDt, this.time); v.weather.update(rawDt); v.surround.update(rawDt); v.pitch.decals.update(rawDt); v.particles.update(rawDt);
    if (r.hold > 0.45) this.nextClip();
  }
  endClips() {
    const H = this.hl;
    this.replay.restoreLive(); this.rp = null; this.hl = null; this.world.netPush = null;
    this.ui.flash('rgba(255,255,255,.35)');
    if (H && H.done) H.done();
  }
  replayCam() {
    const r = this.rp, B = this.replay.ball, sd = r.side, gx = sd * L, tE = r.clip ? r.clip.tE : r.b;
    // 1) реальний темп — загальний план з боку головної трибуни, супровід м'яча
    if (r.t < r.slowAt) return { p: _c1.set(B.x - sd * 5, 8.5, Math.min(W - 6, B.z + 21)), l: _c2.set(B.x + sd * 2, 0.6, B.z * 0.7), fov: 34, shot: 'rpA', rate: 3 };
    // 2) сповільнено — низько за м'ячем: попереду ворота й воротар
    if (r.t < tE - 0.2) return { p: _c1.set(B.x - sd * 5.5, 1.5, B.z * 0.85 + (B.z > 0 ? -1.2 : 1.2)), l: _c2.set(gx, 1.2, B.z * 0.4), fov: 38, shot: 'rpB', rate: 5, dof: 0.01 };
    // 3) удар у сітку — збоку воріт, з поля біля стійки (видно, як м'яч перетинає лінію й прогинає сітку), або згори над сіткою
    if (r.view === 0) return { p: _c1.set(gx - sd * 2.6, 1.35, (B.z >= 0 ? -1 : 1) * (G + 4.5)), l: _c2.set(gx + sd * 0.8, 1.0, B.z), fov: 40, shot: 'rpC', rate: 6, dof: 0.012 };
    return { p: _c1.set(gx + sd * (PITCH.GOAL_D + 2.5), 6.2, B.z * 0.3), l: _c2.set(gx - sd * 1.5, 0.6, B.z * 0.8), fov: 44, shot: 'rpD', rate: 5, dof: 0.008 };
  }
  /** Тап під час святкування гола — одразу далі гра. */
  skipCine() {
    if (this.rp && this.hl) { this.rp.t = this.rp.b; this.rp.hold = 1; return; }      // повтор — далі
    if (this.game.sm.name === 'GOAL' && this.goalT > 1.0) this.goalT = Math.max(this.goalT, this.celeb ? this.celeb.dur : 5);
  }
  endDrama() { if (!this.drama) return; this.drama = null; this.ui.hud.cine(false); }

  /**
   * Перерва між таймами: гравці кроком розходяться на свої місця (хтось плескає, хтось махає трибунам), камера
   * облітає стадіон, потім — крупно той, хто розводить. Далі свисток.
   */
  startBreak(n) {
    const from = this.actors.map((a) => ({ x: a.p.x, z: a.p.z }));
    this.formation();
    this.brkTo = this.actors.map((a) => ({ x: a.p.x, z: a.p.z, yaw: a.p.yaw }));
    this.actors.forEach((a, i) => { a.place(from[i].x, from[i].z); if (!a.isGK && Math.random() < 0.5) a.p.gesture(1.8, [1, 2, 5, 6, 7, 8, 11, 12, 16][(Math.random() * 9) | 0]); });
    this.brk = { t: 0, n }; this.setGaze(true);
    this.phase = 'break';
    this.view.stands.react('clap', { dur: 3 });
    this.ui.hud.cine(true, n === 2 ? 'ПЕРЕРВА' : null);
    this.takeMoments();
    if (this.clips.length) this.startHighlights(n);
  }
  updateBreak(dt) {
    if (this.hl) { this.updateClip(dt); return; }
    const B = this.brk; B.t += dt;
    this.actors.forEach((a, i) => {
      const to = this.brkTo[i], d = Math.hypot(to.x - a.p.x, to.z - a.p.z);
      a.avx = a.avz = 0;
      if (d > 0.35) { a.move(to.x, to.z, d > 14 ? 6.5 : 3.4, dt); if (Math.hypot(a.p.vx, a.p.vz) > 0.6) a.p.yaw = Math.atan2(a.p.vx, a.p.vz); }
      else { const k = Math.exp(-dt * 6); a.p.vx *= k; a.p.vz *= k; a.p.yaw = to.yaw; }
    });
    this.time += dt;
    this.syncView(dt);
    if (B.t > BREAK_T) this.endBreak();
  }
  endBreak() {
    this.actors.forEach((a, i) => { const to = this.brkTo[i]; a.place(to.x, to.z); a.p.yaw = to.yaw; });
    this.brk = null; this.phase = 'play'; this.readyT = 0; this.replay.clear(); this.setGaze(false);
    this.ui.hud.cine(false); audio.whistle(true);
  }
  breakCam() {
    const t = this.brk.t;
    if (t < 2.5) { const a = 0.5 + t * 0.16; return { p: _c1.set(Math.sin(a) * 50, 24, Math.cos(a) * 40), l: _c2.set(0, 0, 0), fov: 40, shot: 'brk1', rate: 4 }; }
    const h = (this.holder || this.mine[1]).p;
    return { p: _c1.set(h.x - 4.2, 1.45, h.z + 3.6), l: _c2.set(h.x + 0.4, 1.15, h.z), fov: 32, shot: 'brk2', rate: 5, dof: 0.016 };
  }

  /**
   * Після свистка: гравці двох команд розбиваються на пари (найближчі один до одного), сходяться й тиснуть руки;
   * дехто ще обіймається чи кладе долоню на плече. Потім переможці махають трибунам, решта аплодує вболівальникам.
   */
  buildPairs() {
    const cand = [];
    for (const a of this.mine) for (const b of this.opp) { const d = Math.hypot(a.p.x - b.p.x, a.p.z - b.p.z); if (d < 50) cand.push([d, a, b]); }
    cand.sort((x, y) => x[0] - y[0]);
    const used = new Set(), pairs = [];
    for (const [d, a, b] of cand) {
      if (used.has(a) || used.has(b)) continue;
      used.add(a); used.add(b);
      const ok = d > 0.01, ux = ok ? (b.p.x - a.p.x) / d : 1, uz = ok ? (b.p.z - a.p.z) / d : 0;
      pairs.push({ a, b, d, mx: (a.p.x + b.p.x) / 2, mz: (a.p.z + b.p.z) / 2, ux, uz, gap: 0.42, off: 0.26, mt: 0, met: false, ready: false, after: 0, kind: Math.random() < 0.3 ? 'hug' : Math.random() < 0.5 ? 'pat' : 'shake' });
    }
    // кого показувати крупно: дві пари, що зійдуться найшвидше
    this.endFeat = pairs.slice().sort((x, y) => x.d - y.d).slice(0, 2);
    this.endPairs = pairs;
    for (const a of this.actors) { a.endPair = used.has(a); if (a.endPair && (a.p.mode === 'cheer' || a.p.mode === 'hug')) a.p.setMode('idle'); }
  }
  endShake(dt) {
    if (!this.endPairs) this.buildPairs();
    const win = this.endWin;
    for (const P of this.endPairs) {
      // стають трохи навскіс (кожен зсунутий уліво на ширину плеча): праві плечі навпроти, долоні сходяться перед ними
      const { a, b } = P, rx = P.uz * P.off, rz = -P.ux * P.off, yA = Math.atan2(P.ux, P.uz), yB = Math.atan2(-P.ux, -P.uz);
      const ends = [[a, P.mx - P.ux * P.gap - rx, P.mz - P.uz * P.gap - rz, yA], [b, P.mx + P.ux * P.gap + rx, P.mz + P.uz * P.gap + rz, yB]];
      let here = 0, turned = 0;
      for (const [X, tx, tz, yw] of ends) {
        const d = Math.hypot(tx - X.p.x, tz - X.p.z);
        if (d > 0.3 && !P.met) { X.avx = X.avz = 0; X.move(tx, tz, d > 6 ? 7 : 3, dt); X.p.yaw = d < 1.6 ? yw : Math.hypot(X.p.vx, X.p.vz) > 0.6 ? Math.atan2(X.p.vx, X.p.vz) : X.p.yaw; }
        else { here++; const k = Math.exp(-dt * 7); X.p.vx *= k; X.p.vz *= k; X.p.x += (tx - X.p.x) * Math.min(1, dt * 3); X.p.z += (tz - X.p.z) * Math.min(1, dt * 3); X.p.yaw = yw; }
        let e = (X.p.bodyYaw - yw) % (Math.PI * 2); if (e > Math.PI) e -= Math.PI * 2; if (e < -Math.PI) e += Math.PI * 2;
        if (Math.abs(e) < 0.3) turned++;
      }
      if (here === 2) P.met = true;
      if (!P.met) continue;
      if (turned === 2) P.ready = true;                                  // руку подають, коли вже стоять обличчям одне до одного
      if (!P.ready) continue;
      P.mt += dt;
      if (P.mt > 0.2 && P.mt < 1.8) shakeHands(a.p, b.p, P.mt);
      // переможець кладе долоню на плече тому, хто програв (у нічиїй — гість господареві)
      if (P.mt > 1.9 && P.mt < 3.2 && P.kind === 'pat') { const w = win && win.includes(b) ? b : a, l = w === a ? b : a; patShoulder(w.p, l.p); }
      if (P.mt > 1.8 && !P.after) { P.after = 1; P.gap = 0.36; if (P.kind === 'hug') { P.off = 0; a.p.hug(1.6); b.p.hug(1.6); } }
      if (P.mt > 3.4 && P.after === 1) {
        P.after = 2;
        for (const X of [a, b]) { X.p.gesture(2.4, win && win.includes(X) && Math.random() < 0.6 ? 5 : 6); X.p.yaw = X.p.z >= 0 ? 0 : Math.PI; }   // до найближчої трибуни
      }
    }
  }
  endCam() {
    const t = this.endT, L2 = (a, b, q) => a + (b - a) * clamp(q, 0, 1), sm = (q) => { q = clamp(q, 0, 1); return q * q * (3 - 2 * q); };
    if (t < 2.8) {
      const c = this.endHub && this.endWin ? this.endHub : { x: this.ball.x, z: this.ball.z }, a = 0.4 + t * 0.25;
      return { p: _c1.set(clamp(c.x + Math.sin(a) * 8, -L + 1, L - 1), 2.6, clamp(c.z + Math.cos(a) * 8, -W + 1, W - 1)), l: _c2.set(c.x, 1.1, c.z), fov: 36, shot: 'end1', rate: 3, dof: 0.01 };
    }
    const F = this.endFeat || [];
    const pairCam = (P, id, sgn) => {
      const mx = (P.a.p.x + P.b.p.x) / 2, mz = (P.a.p.z + P.b.p.z) / 2, nx = -P.uz * sgn, nz = P.ux * sgn;
      return { p: _c1.set(mx + nx * 4.3 + P.ux * 0.8, 1.55, mz + nz * 4.3 + P.uz * 0.8), l: _c2.set(mx, 1.1, mz), fov: 34, shot: id, rate: 4, dof: 0.014 };
    };
    if (t < 5.6 && F[0]) return pairCam(F[0], 'end2', 1);
    if (t < 7.6 && (F[1] || F[0])) return pairCam(F[1] || F[0], 'end3', -1);
    const q = sm((t - 7.6) / 1.8);
    return { p: _c1.set(0, L2(16, 38, q), L2(30, 58, q)), l: _c2.set(0, 0, 0), fov: L2(40, 44, q), shot: 'end4', rate: 1.6 };
  }

  /** Режим володіння: поки м'яч у нас, час сповільнюється до удару або до відбору. */
  updateSlow(rawDt) {
    // сповільнення — лише коли ви справді прицілюєтесь. Поки ваш воротар тримає м'яч і суперники відходять (цілитись ще не
    // можна), гра йде в звичайному темпі — інакше вони відходили в 7 разів повільніше, і гра ніби завмирала після сейву
    const gkWait = this.holder && this.holder.isGK && !this.holder.footBall && !this.gkClear;
    const want = this.phase === 'play' && (this.bs === 'ready' || this.bs === 'aim') && !gkWait;
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
  checkTackles(dt) {
    if (this.holder.isGK) return;                                   // воротар тримає м'яч у руках: захисники не втручаються
    const b = this.ball;
    for (let i = 1; i < this.opp.length; i++) {
      const a = this.opp[i];
      if (a.tkl > 0) return;                                        // один випад за раз
      if (a.stun > 0 || a.noTrap > 0 || a.frozen > 0 || a.sliding || a.manual) { a.nearT = 0; continue; }
      if (this.tackleReady(a, Math.hypot(a.p.x - b.x, a.p.z - b.z), 0.15 + 0.55 * (1 - this.oppTeam.press), dt)) { this.startTackle(a); return; }
    }
  }

  /** Захисник у стійці біля м'яча вичікує момент (терпіння patience с, з розкидом), потім іде у випад. */
  tackleReady(a, db, patience, dt) {
    if (db > 2.5) { a.nearT = 0; return false; }
    if (!a.nearT) a.patT = patience * (0.6 + 0.8 * Math.random());
    a.nearT = (a.nearT || 0) + dt;
    return a.nearT > a.patT || db < 1.25;                          // зовсім впритул — б'є одразу
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
    // воротар із м'ячем у руках: суперники відходять від нього (team.js), а кидає він, коли всі не ближче GK_CLEAR
    {
      const gk = (this.bs === 'ready' || this.bs === 'aim') && this.holder && this.holder.isGK && !this.holder.footBall ? this.holder
        : this.bs === 'held' && this.taker && this.taker.isGK && !this.taker.footBall ? this.taker : null;
      let clear = true;
      if (gk) { const opp = gk.side > 0 ? this.opp : this.mine; for (let i = 1; i < opp.length; i++) if (Math.hypot(opp[i].p.x - gk.p.x, opp[i].p.z - gk.p.z) < GK_CLEAR - 0.5) { clear = false; break; } }
      this.gkHandsT = gk ? (this.gkHandsT || 0) + dt : 0;
      this.gkClear = clear || this.gkHandsT > 0.9; ctx.gkHands = gk;   // гра не стоїть: чекаємо, щоб відійшли, не довше ~0.9 с
      const wait = !!(gk && gk.side > 0 && this.bs === 'ready' && !this.gkClear);
      if (wait !== !!this.gkWaitShown) { this.gkWaitShown = wait; this.ui.hud.warn(wait ? 'СУПЕРНИКИ ВІДХОДЯТЬ…' : null); }
    }
    ctx.bs = this.bs; ctx.owner = this.owner; ctx.kickoff = this.kickoff; ctx.t = this.time; ctx.shotBy = this.shotBy; ctx.shotId = this.shotId;
    if (this.bs !== 'roll' && this.bs !== 'net') ground(b);                 // м'яч у ногах чи руках
    if (this.bs === 'roll') {                                             // прогноз польоту: раз на 0.1 с або одразу після удару
      this.planT -= dt;
      if (this.planT <= 0 || this.planShot !== this.shotId) { this.plan.build(b); this.planT = 0.1; this.planShot = this.shotId; }
      ctx.plan = this.plan;
    } else ctx.plan = null;
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
    this.gkRush(dt);
    this.keeperCollect();
    if ((this.bs === 'ready' || this.bs === 'aim') && this.holder && this.phase === 'play' && !this.kickoff) this.checkTackles(dt);
    this.updateTackles(dt);
    if (this.glideT > 0) { this.glideT -= dt; const k = Math.min(1, dt * 16); b.x += (this.glideX - b.x) * k; b.z += (this.glideZ - b.z) * k; b.vx = b.vz = 0; }
    for (let i = 0; i < this.actors.length; i++) { const a = this.actors[i]; if (a.cool > 0) a.cool -= dt; if (a.noTrap > 0) a.noTrap -= dt; if (a.ghostBall > 0) a.ghostBall -= dt; }
    if (this.protectT > 0) this.protectT -= dt;
    if (this.receiverT > 0) { this.receiverT -= dt; if (this.receiverT <= 0) this.clearReceivers(); }
    this.resolvePlayers();
    this.claimBall();                                                    // хто поруч із вільним м'ячем — бере його під контроль
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
      this.bpx = b.x; this.bpz = b.z; this.bpy = b.y;                      // стан до кроку — для плавного малювання між кроками
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

  /**
   * Тверді гравці: ніхто не проходить крізь іншого; борти тримають усередині поля. Кілька проходів, і межу поля враховуємо
   * в кожному: той, кого вже притиснуло до борту, не посувається — розступається інший (раніше межа після розштовхування
   * заганяла гравців назад одне в одного, і біля борту всі злипались). Заодно кожен знає найближчого — і відштовхує його рукою.
   */
  resolvePlayers() {
    const A = this.actors, n = A.length, xm = L - 1.3, zm = W - 1.3;
    const hold = (this.bs === 'ready' || this.bs === 'aim' || this.bs === 'wind') ? this.holder : null;
    for (let it = 0; it < 5; it++) {
      for (let i = 0; i < n; i++) {
        const ai = A[i], a = ai.p;
        for (let j = i + 1; j < n; j++) {
          const aj = A[j], q = aj.p, dx = q.x - a.x, dz = q.z - a.z, d2 = dx * dx + dz * dz;
          const min = (ai.body.r + aj.body.r) * 1.1;
          if (d2 < min * min && d2 > 1e-6) {
            const d = Math.sqrt(d2), push = min - d;
            let wi = ai.manual ? 0.5 : 1, wj = aj.manual ? 0.5 : 1;
            if (a.downed && !q.downed) { wi = 0.02; wj = 1; } else if (q.downed && !a.downed) { wi = 1; wj = 0.02; }   // того, хто лежить, не штовхають — його обходять
            if (hold && ai === hold && aj.side < 0) { wi = 1; wj = 0; }          // виконавець відступає, суперник не посувається
            else if (hold && aj === hold && ai.side < 0) { wi = 0; wj = 1; }
            const nx = dx / d, nz = dz / d;
            // притиснутий до борту (рух від партнера вивів би його за межу) не посувається — розступається інший
            const pinI = (Math.abs(a.x) >= xm - 0.01 && Math.sign(a.x) === -Math.sign(nx)) || (Math.abs(a.z) >= zm - 0.01 && Math.sign(a.z) === -Math.sign(nz));
            const pinJ = (Math.abs(q.x) >= xm - 0.01 && Math.sign(q.x) === Math.sign(nx)) || (Math.abs(q.z) >= zm - 0.01 && Math.sign(q.z) === Math.sign(nz));
            if (pinI && !pinJ) wi = 0; else if (pinJ && !pinI) wj = 0;
            const tot = wi + wj || 1, k = it < 4 ? 0.7 : 1;                     // м'яко за кілька проходів, а не стрибком за один
            a.x -= nx * push * k * (wi / tot); a.z -= nz * push * k * (wi / tot);
            q.x += nx * push * k * (wj / tot); q.z += nz * push * k * (wj / tot);
            // зіткнення мас: зустрічні швидкості вздовж лінії контакту гасяться імпульсом (майже непружно, e ≈ 0.25) —
            // той, хто врізався, гальмує, а того, в кого врізались, відносить; обмежене прискорення в move() далі
            // плавно повертає кожного до його бігу, тож контакт видно як поштовх, а не як телепорт
            if (it === 0 && tot > 0) {
              const c = Math.min(1, push / 0.3);                                  // щільність контакту — для пози «плече в плече»
              a.jostle(nx, nz, c); q.jostle(-nx, -nz, c);
              const vn = (q.vx - a.vx) * nx + (q.vz - a.vz) * nz;
              if (vn < 0) {
                const J = -(1 + 0.25) * vn / tot;
                a.vx -= nx * J * wi; a.vz -= nz * J * wi; q.vx += nx * J * wj; q.vz += nz * J * wj;
              }
            }
          }
        }
      }
      for (let i = 0; i < n; i++) { const p = A[i].p; p.x = clamp(p.x, -xm, xm); p.z = clamp(p.z, -zm, zm); }
    }
    // руки: найближчий гравець ближче ~2 м — тримає його на відстані витягнутою рукою (бік і висота — куди він стоїть)
    for (let i = 0; i < n; i++) {
      const a = A[i].p; let best = null, bd = 2.1;
      for (let j = 0; j < n; j++) { if (j === i) continue; const q = A[j].p, d = Math.hypot(q.x - a.x, q.z - a.z); if (d < bd) { bd = d; best = q; } }
      if (best) a.fendAt(best.x - a.x, best.z - a.z, clamp((2.1 - bd) / 0.6, 0, 1)); else a.fendAt(0, 0, 0);
    }
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
      audio.thud(); this.game.addTrauma(0.3); this.hitStop = Math.max(this.hitStop, 0.04); v.ball.squash(nx, nz, 0.3); if (a.side > 0) this.addXp(a, 25);
      v.particles.burst(a.p.x, 0.3, a.p.z, 12, 5, 0.6, 0.3, ['#4f7d3a', '#8fb98a', '#f1efe8'], 10, 0.8);
      this.shotBy = 0; this.protectT = 0;
    } else {
      this.floatAt(a.p.x, a.p.z, 'ПРОСКОЧИВ', 'good'); audio.wall(0, 6);
    }
    return true;
  }

  /**
   * Воротар бере в руки м'яч, що котиться поруч: у межах дотягу рук (≈1.5–2 м за навичкою) і не надто швидкий — ловить, а не
   * чекає, поки м'яч влучить у тіло. Лише у своєму штрафному, не в стрибку й не тоді, коли сам щойно віддав м'яч.
   */
  keeperCollect() {
    if (this.bs !== 'roll' || this.phase !== 'play') return;
    const b = this.ball, sp = Math.hypot(b.vx, b.vz);
    for (const g of [this.mine[0], this.opp[0]]) {
      if (g.dive || g.frozen > 0 || g.cool > 0 || g.noTrap > 0 || g.stun > 0 || g.p.downed || (this.shotBy === g.side && this.shooter === g)) continue;
      const goalX = -g.side * L, inBox = (b.x - goalX) * g.side < 20 && Math.abs(b.z) < 18;
      if (!inBox || b.y > 1.9 + 0.5 * (g.sk.reach ?? 0.5)) continue;          // вище витягнутих рук — не дістає
      // бере, лише коли м'яч справді в рукавицях (руки самі тягнуться до нього — handsIK); поруч чи збоку — ні, не «телепорт» у руки
      const lim = PHYS.trapSpeed * (1.4 + 0.8 * (g.sk.hands ?? 0.5));
      // м'яч поруч і йде до нього, а руки ще не внизу — присідає й опускає руки до м'яча (далі бере, лише коли той у рукавицях)
      const near = Math.hypot(b.x - g.p.x, b.z - g.p.z);
      if (near < 1.6 && sp < lim && !g.manual && g.p.mode !== 'catch' && g.p.mode !== 'scoop' && this.facesBall(g)) g.p.catchBall(b.y < 0.6);
      if (sp < lim && this.inGloves(g, 0.1 + 0.08 * (g.sk.hands ?? 0.5))) { if (g.side > 0) this.trapMine(g, sp); else this.trapOpp(g, sp); return; }
    }
  }

  /**
   * Чи воротар лицем до м'яча: м'яч перед грудьми (не позаду і не збоку-ззаду), а летить на нього спереду (або вже
   * майже зупинився). Спиною — прийняти не може: м'яч відскакує від тіла.
   */
  facesBall(g) {
    // у стрибку тіло розвернуте боком — «лице» воротаря тоді рахуємо від своїх воріт у поле
    const p = g.p, b = this.ball, y = p.bodyYaw ?? p.yaw, fx = g.dive || p.downed ? g.side : Math.sin(y), fz = g.dive || p.downed ? 0 : Math.cos(y);
    const dx = b.x - p.x, dz = b.z - p.z, d = Math.hypot(dx, dz) || 1e-3;
    if ((dx * fx + dz * fz) / d < 0.15) return false;                     // м'яч позаду або збоку-ззаду
    const sp = Math.hypot(b.vx, b.vz);
    return sp < 3 || (b.vx * fx + b.vz * fz) / sp < 0.3;                 // летить назустріч (не в спину й не вздовж)
  }

  /**
   * Чи м'яч у рукавицях воротаря: відстань від центра м'яча до відрізка рукавиці (за скелетом) не більша за товщину
   * рукавиці + радіус м'яча + запас (кращі руки — трохи більший). Для ловлі достатньо однієї рукавиці, якщо м'яч повільний,
   * або обох поруч — якщо швидкий.
   */
  inGloves(g, extra = 0.08) {
    const caps = g.p.hitCaps; if (!caps) return false;
    if (!this.facesBall(g)) return false;                                // спиною (чи боком-позаду) до м'яча — не ловить
    const b = this.ball, by = b.y + PITCH.R, sp = Math.hypot(b.vx, b.vy || 0, b.vz);
    let n = 0;
    for (const c of caps) {
      if (!c.glove || !c.ok) continue;
      const ex = c.bx - c.ax, ey = c.by - c.ay, ez = c.bz - c.az, l2 = ex * ex + ey * ey + ez * ez || 1e-6;
      let t = ((b.x - c.ax) * ex + (by - c.ay) * ey + (b.z - c.az) * ez) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const d = Math.hypot(b.x - c.ax - ex * t, by - c.ay - ey * t, b.z - c.az - ez * t);
      if (d < c.r + PITCH.BALL_VIS + extra) n++;
    }
    return n >= 1;
  }

  /**
   * Як воротар приймає м'яч. У своєму штрафному — руками: низом по траві — «кошиком» (підбирає, присівши), на рівні грудей
   * і вище — ловить і притискає. Поза штрафним руками не можна — приймає ногою, як польовий, і далі грає ногою.
   */
  gkReceive(g, speed) {
    const b = this.ball, goalX = -g.side * L, inBox = (b.x - goalX) * g.side < 17 && Math.abs(b.z) < 17;
    g.footBall = !inBox;
    if (g.dive) return;                                               // упав на м'яч у стрибку — так і лежить із ним
    if (g.footBall) { g.p.receive(b.y, speed); return; }
    g.p.catchBall(b.y < 0.35 && (b.y < 0.1 || speed < 14));
  }

  /**
   * Вихід у ноги: суперник із м'ячем у штрафному, ближче ~2.8 м — воротар (після своєї реакції) кидається йому в ноги,
   * боком, перекриваючи тілом. Через ~0.3 с — чи накрив м'яч: виграв — м'яч його, ні — лежить, а нападник обходить.
   */
  gkRush(dt) {
    if (this.phase !== 'play' || this.kickoff) return;
    for (const g of [this.mine[0], this.opp[0]]) {
      if (g.dive || g.frozen > 0 || g.stun > 0 || g.p.downed || g.manual) { g.rushT = 0; continue; }
      const vsMine = g.side < 0 && (this.bs === 'ready' || this.bs === 'aim') && this.holder && !this.holder.isGK;
      const vsOpp = g.side > 0 && this.bs === 'held' && this.taker && !this.taker.isGK;
      if (!vsMine && !vsOpp) { g.rushT = 0; continue; }
      const b = this.ball, goalX = -g.side * L, inBox = (b.x - goalX) * g.side < 17 && Math.abs(b.z) < 17;
      if (!inBox || Math.hypot(b.x - g.p.x, b.z - g.p.z) > 2.8) { g.rushT = 0; continue; }
      g.rushT = (g.rushT || 0) + dt;
      if (g.rushT < 0.12 + 0.25 * (1 - g.sk.react)) continue;
      g.rushT = 0; this.startSmother(g, vsMine ? this.holder : this.taker);
    }
  }

  startSmother(g, h) {
    const b = this.ball, p = g.p, dx = b.x - p.x, dz = b.z - p.z;
    const yaw = Math.atan2(dx, dz) + (Math.random() < 0.5 ? 1 : -1) * Math.PI / 2;   // боком до м'яча — перекриває тілом
    p.yaw = p.bodyYaw = yaw;
    const lb = dx * Math.cos(yaw) - dz * Math.sin(yaw), dir = -(Math.sign(lb) || 1) * (Math.sign(Math.sin(yaw)) || 1);
    g.manual = true;
    g.dive = { t: 0, dur: 1.1, z0: p.z, dist: 0, kind: 2, free: true, smother: true, h, res: 0.3 };
    p.gkDive(dir, 2, { x: b.x, y: 0.12, z: b.z }, 0.3, 5.5 + 1.5 * g.sk.reach);
    audio.slide(); this.floatAt(p.x, p.z, 'В НОГИ!', g.side > 0 ? 'good' : 'warn');
  }

  resolveSmother(g, h) {
    const b = this.ball, still = (g.side < 0 && (this.bs === 'ready' || this.bs === 'aim') && this.holder === h) || (g.side > 0 && this.bs === 'held' && this.taker === h);
    if (!still) return;                                               // встиг ударити чи віддати — воротар лише впав
    const near = Math.hypot(b.x - g.p.x, b.z - g.p.z) < 2.0;
    const chance = clamp(0.45 + 0.3 * g.sk.reach + 0.2 * g.sk.react - 0.35 * ((h.sk.drib ?? 0.5) - 0.5), 0.2, 0.92);
    if (!near || Math.random() > chance) { this.floatAt(h.p.x, h.p.z, g.side > 0 ? 'ОБІЙШОВ' : 'ОБІЙШОВ!', g.side > 0 ? 'warn' : 'good'); return; }
    h.stun = Math.max(h.stun, 0.8); h.noTrap = 0.8; h.p.hit();
    this.floatAt(g.p.x, g.p.z, 'НАКРИВ М’ЯЧ!', g.side > 0 ? 'good' : 'warn'); audio.save();
    if (g.side < 0) { this.cancelAim(); h.p.setThreat(0, 0); h.manual = false; this.trapOpp(g, 0); }
    else { h.manual = false; this.taker = null; h.p.dribble = false; this.placeBallAt(g, true); g.noTrap = 0; g.footBall = false; this.makeReady(g); }
  }

  /** Воротарі реагують заздалегідь: стрибок у куток, стрибок на місці або тільки руки; потім лежать і встають. */
  updateKeepers(dt) {
    const keepers = [this.mine[0], this.opp[0]];
    for (let k = 0; k < 2; k++) {
      const g = keepers[k], d = g.dive;
      if (d) {
        d.t += dt;
        // переміщення за фазами стрибка: присід на місці → розгін на відштовхуванні → політ → ковзання по траві
        // до відриву тіло веде стрибок; після відриву воно летить і лежить саме — і вже ніколи не «доставляється» в заплановану
        // точку (раніше, коли стрибок закінчувався, воротаря миттєво переносило туди, і він опинявся бозна-де)
        if (g.p.diveFree) d.free = true;
        if (!d.free && !g.p.diveFree && g.p.mode === 'pdive') g.p.z = d.z0 + d.dist * diveKin(Math.min(1, g.p.diveP || 0), d.kind).travel;
        g.p.vx = g.p.vz = 0;
        if (g.p.landImpact && !d.landed) { d.landed = true; this.view.particles.burst(g.p.x, 0.2, g.p.z, 8, 3, 0.5, 0.2, ['#8fb98a', '#cfd8c9', '#f2f5ee'], 10, 0.5); audio.thud(); }
        if (d.smother && d.res > 0 && (d.res -= dt) <= 0) this.resolveSmother(g, d.h);
        // стрибок скінчився: не стоїть «замороженим» секунду — щойно підведеться, жестом підганяє своїх і йде на позицію
        if (d.t >= d.dur) { g.dive = null; g.frozen = 0.15; g.manual = g === this.holder || g === this.taker; g.p.vx = g.p.vz = 0; g.p.afterDive = !g.manual; }
        continue;
      }
      if (this.bs !== 'roll' || g.frozen > 0 || g.decided === this.shotId || g.manual) continue;
      const b = this.ball, side = g.side, sp = Math.hypot(b.vx, b.vz);
      const toward = -b.vx * side;
      if (toward < 2 || sp < 3) continue;                              // і повільний м'яч (удар здалеку докочується) — теж читає
      // людина бачить удар і може рушити лише через час реакції: удар зблизька, що долітає швидше, воротар не встигає
      if (g.seenId !== this.shotId) { g.seenId = this.shotId; g.seenT = this.time; }
      if (this.time - g.seenT < g.p.reactT) continue;
      // де й на якій висоті м'яч перетне лінію воротаря — з прогнозу польоту (дуга, підкрутка, відскоки)
      // лінія рішення — площина, де воротар зараз стоїть (він міг вийти на 5–9 м), а не лінія воріт позаду нього
      const line = g.p.x, cr = this.plan.cross(line, -side, this._cr), eta = cr.t;
      if (eta < 0.06 || eta > 0.3 + 0.35 * g.sk.iq + (b.y > 0 || b.vy > 0 ? 0.35 : 0)) continue;
      if (Math.abs(cr.z) > G + 0.7 || cr.y > PITCH.GOAL_H) continue;   // мимо воріт або над поперечиною: воротар не стрибає
      g.decided = this.shotId;
      if (Math.random() > 0.97 + 0.03 * g.sk.react) continue;   // дуже зрідка «завмер» — не рушив зовсім
      // воротар читає удар не ідеально: точка, куди він стрибає, зсунута тим більше, чим слабший «Інтелект» і чим раніше він
      // мусить вирішити. У польоті руки виправляють помилку за тим, що він бачить, — якщо є шанс, дотягується
      const er = (0.12 + 0.55 * (1 - g.sk.iq)) * Math.min(1, eta / 0.4);
      const predZ = cr.z + (Math.random() * 2 - 1) * er, predY = Math.max(0, cr.y + (Math.random() * 2 - 1) * er * 0.5);
      const lateral = predZ - g.p.z;
      // скільки воротар дістає руками, не стрибаючи: високий м'яч — ~0.7 м убік; на рівні пояса — ~0.5 м; низом по траві стоячи
      // руки до землі збоку не дістають — уже з ~0.35 м падає на бік (короткий стрибок низом)
      const handR = predY > 1.4 ? 0.7 : predY > 0.5 ? 0.5 : 0.35;
      if (Math.abs(lateral) > handR) {                                   // далі — тільки стрибком (руками не дістає)
        const dir = Math.sign(lateral), reach = Math.min(Math.abs(lateral) + (Math.abs(lateral) < 0.8 ? 0.6 : 1.0), (2.2 + g.sk.reach * 3.4 + (side < 0 ? this.oppTeam.gkSpeed : this.myTeam.gkSpeed) * 0.12) * (G / 7.2));   // дотяжка в масштабі воріт: складність як раніше
        // м'яч у матчі котиться газоном: стрибок низом, а коли треба дотягнутись далеко — у польоті на середній висоті
        // висота стрибка — за висотою м'яча: високий — угору-вбік, середній — у політ, низом (по траві чи нижче ~0.5 м) — низом,
        // навіть далеко (тоді витягнутим тілом уздовж газону), а не над м'ячем
        const kind = predY > 1.3 ? 0 : predY > 0.45 ? 1 : 2;
        g.dive = { t: 0, dur: 0.9, z0: g.p.z, dist: dir * reach, kind };
        // стрибок за фізикою: воротар відштовхується так, щоб руки встигли туди, де м'яч перетне його лінію; сила ніг — за навичкою.
        // Не встигає (задалеко, запізно) — летить, скільки дозволяють ноги, як справжній
        g.manual = true; g.p.yaw = g.p.bodyYaw = side > 0 ? Math.PI / 2 : -Math.PI / 2; g.p.gkDive(dir, kind, { x: line, y: PITCH.BALL_VIS + predY, z: predZ }, eta, 6.2 + 1.8 * g.sk.reach);
        audio.slide(); this.floatAt(g.p.x, g.p.z, 'СТРИБОК!', side > 0 ? 'good' : 'warn');
      } else if (predY > 1.4) { g.p.gkJump(); }          // високо по центру — вистрибує вгору
      else { g.p.catchBall(); }                       // м'яч у воротаря: ловить (низький — підбирає з трави), руки йдуть до м'яча
    }
  }

  /**
   * Важливість гола 0..1 — від неї залежить, наскільки бурхливе святкування й розпач суперника: сильніший суперник,
   * останні хвилини й доданий час, зрівняв чи вийшов уперед (а не просто збільшив відрив), фінал, золотий гол.
   * Повертає { I, tag } — tag для підпису («НА ОСТАННІХ СЕКУНДАХ!», «ВІДІГРАЛИСЯ!»…).
   */
  goalImportance(mine) {
    const sp = this.spec, f = clamp(1 - this.clock / sp.time, 0, 1);
    const avg = (arr) => { let s = 0; for (let i = 1; i < arr.length; i++) s += arr[i].info ? ovr(arr[i].info) : 60; return s / (arr.length - 1); };
    const gap = mine ? avg(this.opp) - avg(this.mine) : avg(this.mine) - avg(this.opp);
    const us = mine ? this.score.me : this.score.opp, them = mine ? this.score.opp : this.score.me, d = us - them;
    let I = 0.25 + clamp(gap / 12, -0.1, 0.25), tag = '';
    if (gap > 4) tag = 'ПРОТИ ФАВОРИТА';
    if (d === 0) { I += 0.22; tag = 'ВІДІГРАЛИСЯ!'; }
    else if (d === 1) { I += them > 0 || f > 0.5 ? 0.25 : 0.12; if (them > 0) tag = 'ВИХІД УПЕРЕД!'; }
    else if (d >= 3) I -= 0.15;
    if (f > 0.85) { I += 0.35 * (f - 0.85) / 0.15; if (f > 0.93) tag = 'НА ОСТАННІХ ХВИЛИНАХ!'; }
    if (this.timeUp) { I += 0.25; tag = 'НА ОСТАННІХ СЕКУНДАХ!'; }
    if (sp.final) I += 0.12;
    if (this.golden) { I = 1; tag = 'ЗОЛОТИЙ ГОЛ!'; }
    return { I: clamp(I, 0, 1), tag };
  }

  /**
   * Сценарій святкування — щоразу інший і за важливістю гола. Спокійні: показати на партнера й «п'ятірки» дорогою,
   * стрибок, віддання честі. Яскравіші: ковзання на колінах до кутового, до трибун із жестами, «літак», танець із
   * партнерами, «тихо!». Найважливіші: до самого борту до фанатів (стрибок до них, конфетті й дим на трибуні) і купа-мала.
   */
  setupCelebration(mine, sc, side, I) {
    const pick = (a) => a[(Math.random() * a.length) | 0];
    let kind = sc.isGK ? 'jump' : pick(I < 0.35 ? ['calm', 'calm', 'jump', 'salute', 'fans', 'corner'] : I < 0.65 ? ['corner', 'fans', 'board', 'airplane', 'jump', 'dance', 'shush'] : ['board', 'board', 'pile', 'corner', 'airplane', 'fans', 'shush']);
    const zs = sc.p.z >= 0 ? 1 : -1, team = mine ? this.mine : this.opp;
    let tx = sc.p.x, tz = sc.p.z;
    if (kind === 'corner') { tx = side * (L - 7.5); tz = zs * (W - 5); }
    else if (kind === 'fans' || kind === 'board' || kind === 'shush') { tx = clamp(sc.p.x + side * 4, -L + 8, L - 8); tz = zs * (W - (kind === 'board' ? 1.1 : 3.4)); }
    else if (kind === 'airplane') { tx = clamp(sc.p.x - side * 7, -L + 8, L - 8); tz = zs * (W - 9); }
    else if (kind === 'calm') { tx = sc.p.x - side * 9; tz = sc.p.z * 0.6; }
    this.celeb = { mine, scorer: sc, t: 0, kind, I, side, zs, tx, tz, dur: 4.4 + 4.2 * I, st: 'run', actT: 0, huggers: 0, hugOn: 0, maxHug: kind === 'pile' ? 6 : I > 0.6 ? 4 : 3, bursts: 0 };
    for (const a of this.actors) { a.celebHug = false; a.hugOn = false; a.cheered = false; a.hugged = false; a.hf = false; a.celebJoin = false; a.hug = false; }
    // хто біжить до автора гола: найближчі (неважливий гол — двоє-троє, важливий — уся команда)
    const joinN = I < 0.35 ? 3 : I < 0.65 ? 6 : 10;
    team.slice(1).filter((a) => a !== sc).sort((a, b) => Math.hypot(a.p.x - sc.p.x, a.p.z - sc.p.z) - Math.hypot(b.p.x - sc.p.x, b.p.z - sc.p.z)).forEach((a, k) => { a.celebJoin = k < joinN; });
    if (kind === 'airplane' || kind === 'calm') sc.p.gesture(2.6, kind === 'airplane' ? 43 : 10);
  }

  /** Кадри святкування: крупний план автора, потім гурт, потім загальний; біля трибун — з поля на трибуну за спиною. */
  celebView() {
    const c = this.celeb; if (!c || this.game.sm.name !== 'GOAL' || this.rp) return null;
    const sc = c.scorer, team = c.mine ? this.mine : this.opp;
    const shot = c.t < 1.8 ? 0 : c.t < 3.8 ? 1 : c.t < 5.8 ? 2 : 3;
    if (c.shot !== shot) { c.shot = shot; this.game.addTrauma(0.12 + 0.1 * c.I); this.game.fovKick(2 + 2 * c.I); if (shot > 0) this.ui.flash('rgba(255,255,255,.2)'); }
    if (shot === 0) return { tx: sc.p.x, tz: sc.p.z, zoom: 0.5, ang: -0.55 + c.t * 0.35 };
    if (shot === 1 || shot === 3) {
      let cx = sc.p.x, cz = sc.p.z, n = 1;
      for (let i = 1; i < team.length; i++) { const a = team[i]; if (a !== sc && Math.hypot(a.p.x - sc.p.x, a.p.z - sc.p.z) < 6) { cx += a.p.x; cz += a.p.z; n++; } }
      const fan = c.kind === 'fans' || c.kind === 'board' || c.kind === 'shush';
      return { tx: cx / n, tz: cz / n, zoom: shot === 3 ? 0.62 : 0.72, ang: fan ? (c.zs > 0 ? 2.6 : 0.35) : 0.15 + (c.t - 1.8) * 0.3 };
    }
    return { tx: sc.p.x * 0.8, tz: sc.p.z * 0.8, zoom: 1.1, ang: 0.85 - (c.t - 3.8) * 0.2 };
  }

  /** Вболівальники біля автора гола: конфетті з трибуни й дим фаєрів (кольори команди, що забила). */
  fanBurst(x, zs, mine) {
    const P = this.view.particles, z = zs * (W + 4.5), cols = mine ? ['#d4202c', '#1f8f3f', '#f1efe8', '#e8b923'] : ['#f1efe8', '#9ca3af', '#e8b923'];
    P.burst(x, 3.5, z, 40, 6, 1.6, 0.22, cols, 4, 0.5);
    for (let i = 0; i < 6; i++) P.emit(x + (Math.random() - 0.5) * 8, 1.6, zs * (W + 2.2), (Math.random() - 0.5) * 0.8, 0.8 + Math.random() * 0.6, 0, 2.4, 0.9, mine ? (i % 2 ? '#c4303a' : '#2f8a4c') : '#9aa3ad', -0.12, 0.9, 0, 0.9);
  }

  updateCelebration(dt) {
    const c = this.celeb; if (!c) return;
    c.t += dt;
    const sc = c.scorer, team = c.mine ? this.mine : this.opp, other = c.mine ? this.opp : this.mine, I = c.I;
    const pick = (a) => a[(Math.random() * a.length) | 0], face = (p, x, z) => { p.yaw = Math.atan2(x - p.x, z - p.z); };
    // ---- автор гола
    if (sc && !sc.isGK) {
      const p = sc.p, d = Math.hypot(c.tx - p.x, c.tz - p.z), runs = c.kind !== 'jump' && c.kind !== 'pile' && c.kind !== 'salute' && c.kind !== 'dance';
      if (c.st === 'run') {
        if (runs && d > 1.2 && c.t < 3.2) {
          sc.move(c.tx, c.tz, c.kind === 'calm' ? 5.5 : 9.2, dt);
          if (Math.hypot(p.vx, p.vz) > 0.5) p.yaw = Math.atan2(p.vx, p.vz);
          if (c.kind === 'airplane' && p.mode !== 'gesture') p.gesture(1.6, 43);
          if (c.kind === 'corner' && d < 3.2) { c.st = 'act'; c.actT = c.t; p.kneel(); p.vx = p.vz = 0; }   // з розгону — на коліна, ковзає
        } else { c.st = 'act'; c.actT = c.t; }
        if (c.st === 'act') {
          const fanSide = c.kind === 'fans' || c.kind === 'board' || c.kind === 'shush';
          if (fanSide) { p.yaw = c.zs > 0 ? 0 : Math.PI; this.fanBurst(p.x, c.zs, c.mine); this.view.stands.react('goal', { mine: c.mine, dur: 2.5 + 2 * I }); }
          if (c.kind === 'fans') p.cheer(2.6, pick([18, 19, 20, 15, 16]));
          else if (c.kind === 'board') p.cheer(1.5, 18);                                       // «не чую!» — а потім стрибок до них
          else if (c.kind === 'shush') p.cheer(2.8, 8);
          else if (c.kind === 'airplane') p.cheer(2.2, pick([17, 20, 13]));
          else if (c.kind === 'jump') p.cheer(1.8, pick([0, 16, 13]));
          else if (c.kind === 'pile') p.cheer(1.4, 16);
          else if (c.kind === 'salute') p.cheer(2.4, 11);
          else if (c.kind === 'dance') p.cheer(3.2, pick([4, 6]));
          else if (c.kind === 'calm') p.gesture(2.2, 14);
        }
      } else {
        const k = Math.exp(-dt * 6);
        if (c.kind !== 'corner' || p.mode !== 'kneel') { p.vx *= k; p.vz *= k; p.x += p.vx * dt; p.z += p.vz * dt; }
        const u = c.t - c.actT;
        if (c.kind === 'board' && !c.leap && u > 1.5) { c.leap = true; p.cheer(2.4, 0); this.fanBurst(p.x, c.zs, c.mine); this.game.addTrauma(0.15); }   // стрибок до фанатів
        if (c.kind === 'corner' && !c.roar && u > 1.6) { c.roar = true; p.cheer(2.2, I > 0.6 ? 17 : pick([16, 13, 20])); }
        // хтось добіг — обіймає у відповідь; ніхто — радіє далі своїм жестом
        if (!c.special && u > (c.kind === 'board' ? 3.4 : 2.0)) {
          c.special = true;
          const h = team.find((m) => m.hugOn);
          if (h) { face(p, h.p.x, h.p.z); p.hug(2.2); } else p.cheer(2.4, pick(p.persona.cheer));
        }
      }
    }
    // ---- партнери: ті, хто біжить до автора, обіймають (перші — впритул, кожен зі свого боку) або радіють колом;
    // решта (неважливий гол) — радіють на місці й підтюпцем повертаються на свою половину
    for (let i = 1; i < team.length; i++) {
      const a = team[i]; if (a === sc) continue;
      if (!a.celebJoin) {
        if (!a.cheered && c.t > 0.5 + 0.4 * (i % 3)) { a.cheered = true; a.p.gesture(1.6, pick([10, 14, 6, 16])); }
        a.move(a.p.x - c.side * 2.5 * dt, a.p.z, 2.4, dt); if (Math.hypot(a.p.vx, a.p.vz) > 0.4) a.p.yaw = Math.atan2(a.p.vx, a.p.vz);
        continue;
      }
      a.hug = true;
      const close = a.celebHug, ang = close ? a.hugAng : i * 2.4 + c.t * 0.35, rad = close ? 0.75 : 1.8 + (i % 3) * 0.8;
      const tx = sc.p.x + Math.cos(ang) * rad, tz = sc.p.z + Math.sin(ang) * rad;
      const busy = a.p.mode === 'cheer' || a.p.mode === 'hug';
      if (busy) { a.p.vx *= Math.exp(-dt * 10); a.p.vz *= Math.exp(-dt * 10); a.p.x += a.p.vx * dt; a.p.z += a.p.vz * dt; }
      else a.move(tx, tz, close ? 4.5 : 8.8 + (i % 4) * 0.5 + 1.2 * I, dt);
      const d = Math.hypot(sc.p.x - a.p.x, sc.p.z - a.p.z);
      a.p.yaw = d > 3 ? Math.atan2(a.p.vx, a.p.vz) || a.p.yaw : Math.atan2(sc.p.x - a.p.x, sc.p.z - a.p.z);
      const scStill = Math.hypot(sc.p.vx, sc.p.vz) < 1 && c.st === 'act';
      if (d < 3.4 && !a.cheered) {
        a.cheered = true;
        if (c.huggers < c.maxHug && c.t > 0.6 && scStill) { a.celebHug = true; a.hugAng = Math.atan2(a.p.z - sc.p.z, a.p.x - sc.p.x) + (c.huggers - 1) * (c.kind === 'pile' ? 0.6 : 0.9); c.huggers++; }
        else a.p.cheer(2.4 + (i % 3) * 0.5, c.kind === 'dance' ? pick([4, 6]) : pick(a.p.persona.cheer));
      }
      if (a.celebHug && !a.hugOn && d < 1.1) { a.hugOn = true; c.hugOn++; a.p.vx = a.p.vz = 0; face(a.p, sc.p.x, sc.p.z); a.p.hug(2.4 + Math.random() * 0.6 + 1.2 * I); }
    }
    // воротар: важливий гол — біжить кілька десятків метрів назустріч і радіє; звичайний — радіє біля воріт
    {
      const gk = team[0];
      if (I > 0.6 && c.t < 3) { gk.move(gk.p.x + c.side * 6, gk.p.z * 0.9, 6, dt); if (Math.hypot(gk.p.vx, gk.p.vz) > 0.5) gk.p.yaw = Math.atan2(gk.p.vx, gk.p.vz); }
      else { gk.p.vx *= Math.exp(-dt * 6); gk.p.vz *= Math.exp(-dt * 6); gk.p.x += gk.p.vx * dt; gk.p.z += gk.p.vz * dt; }
      if (c.t > 0.8 && !gk.cheered) { gk.cheered = true; gk.p.cheer(2.5 + 2 * I, I > 0.6 ? pick([0, 16, 14]) : pick([14, 13])); }
    }
    // команда, якій забили: плетуться до своєї половини; чим важливіший гол — тим важчий розпач (присіли, руки на голові)
    if (!c.fx) {
      c.fx = true;
      for (let i = 0; i < other.length; i++) other[i].p.sad(4 + 3 * I, I > 0.6 ? pick([7, 0, 5, 6, 4]) : undefined);
      this.game.addTrauma(0.2 + 0.2 * I);
    }
    for (let i = 1; i < other.length; i++) { const a = other[i]; a.move(a.p.x * 0.92, a.p.z, 2.1 - 0.8 * I, dt); a.p.yaw = Math.atan2(a.p.vx, a.p.vz) || a.p.yaw; }
    other[0].p.vx = other[0].p.vz = 0;
    // партнери, що радіють поруч один з одним, б'ють «п'ять» — кожен лише раз
    if (c.t > 1.0) {
      c.hf ??= [];
      for (let i = 1; i < team.length; i++) {
        const a = team[i]; if (a === sc || a.celebHug || a.hf || !a.celebJoin) continue;
        for (let j = i + 1; j < team.length; j++) {
          const b = team[j]; if (b === sc || b.celebHug || b.hf) continue;
          if (Math.hypot(a.p.x - b.p.x, a.p.z - b.p.z) < 1.8) { a.hf = b.hf = true; c.hf.push({ a, b, t: 0 }); break; }
        }
      }
      for (const h of c.hf) {
        if (h.t > 0.9) continue;
        h.t += dt;
        if (!h.on) h.on = this.slaps.add(h.a.p, h.b.p, 0.34);
        const A = h.a.p, B = h.b.p, dx = B.x - A.x, dz = B.z - A.z, d = Math.hypot(dx, dz) || 1, st = d > 1.0 && h.t < 0.4 ? 0.5 * (d - 1.0) * Math.min(1, dt * 6) : 0;
        A.x += dx / d * st; A.z += dz / d * st; B.x -= dx / d * st; B.z -= dz / d * st;
        A.yaw = Math.atan2(dx, dz); B.yaw = Math.atan2(-dx, -dz);
      }
      // спокійне святкування: автор дорогою б'є «п'ять» тим, повз кого пробігає
      if (c.kind === 'calm' && sc) for (const a of team) {
        if (a === sc || a.hf || a.isGK) continue;
        if (Math.hypot(a.p.x - sc.p.x, a.p.z - sc.p.z) < 1.7 && this.slaps.add(sc.p, a.p, 0.32)) { a.hf = true; break; }
      }
    }
    // салют часточок над автором гола; важливий гол — більше й довше, і салют над трибунами
    const nb = 2 + Math.round(4 * I);
    if (sc && c.t > c.bursts * 0.75 + 0.3 && c.bursts < nb) {
      c.bursts++;
      const cols = c.mine ? ['#b3162a', '#117a4a', '#f1efe8', '#e8b923'] : ['#f1efe8', '#9ca3af', '#e8b923'];
      this.view.particles.burst(sc.p.x, 1.8, sc.p.z, 20 + Math.round(16 * I), 7, 1.5, 0.3, cols, 12, 1.0);
      if (I > 0.6 && c.bursts % 2 === 0) this.walk.fireworks(2);
    }
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

  /**
   * Тіло воротаря для фізики м'яча — за скелетом: частини, що опустились нижче ~0.5 м (ноги, рукавиці, тулуб у стрибку),
   * стають відрізками на площині з радіусом частини й запасом (рукавиці ширші — прощаюча фізика). Стоячи лишається й коло
   * «дотягу» навколо воротаря; у стрибку його замінює саме тіло, що лежить уздовж лінії стрибка.
   */
  keeperBodies() {
    // м'яч тепер літає: частини тіла воротаря — справжні 3D-капсули (руки й рукавиці ловлять і високі м'ячі);
    // коло «дотягу» навколо воротаря — лише до пояса, вище працюють руки
    for (const a of [this.mine[0], this.opp[0]]) {
      const hit = a.p.hitCaps, b = a.body; if (!hit) continue;
      const cs = (b.caps ??= Object.assign(hit.map(() => ({ ax: 0, ay: 0, az: 0, bx: 0, by: 0, bz: 0, r: 0, vx: 0, vy: 0, vz: 0 })), { n: 0 }));
      let n = 0;
      for (const c of hit) {
        const o = cs[n++];
        o.ax = c.ax; o.ay = c.ay; o.az = c.az; o.bx = c.bx; o.by = c.by; o.bz = c.bz; o.r = c.r + (c.glove ? 0.14 : 0.03);   // тіло — точно; рукавиці трохи «прощаючі» (долоні, пальці)
        o.vx = clamp((c.vax + c.vbx) / 2, -12, 12); o.vy = clamp((c.vay + c.vby) / 2, -12, 12); o.vz = clamp((c.vaz + c.vbz) / 2, -12, 12);
      }
      // для м'яча: у стрибку — тіло (коло 0.45) і капсули; стоячи — капсули й невелика зона ніг і тулуба (0.5 м, а не 0.9–1.3)
      cs.n = n; b.capsOnly = false;
      if (!a.sliding) b.r = a.dive ? 0.45 : 0.5;
      b.h = a.dive ? 0.6 : 1.1;
    }
  }

  /** Хто фізично заважає м'ячу: поки м'яч у нас, свої не заважають; суперник не блокує власний удар. */
  updateSolidity(bs) {
    const holding = this.bs === 'ready' || this.bs === 'aim' || this.bs === 'wind' || this.bs === 'held';
    const oppShot = this.shotBy === -1 && this.bs === 'roll' && bs > 18;
    const mineSolid = !(this.shotBy === 1 && this.bs === 'roll' && bs > 26 && this.shotOnTarget);   // удар у створ проходить між своїми, пас — ні
    for (let i = 0; i < this.mine.length; i++) { const a = this.mine[i]; a.body.on = !holding && mineSolid && a.cool <= 0 && !(a.ghostBall > 0) && (!a.manual || a.sliding || !!a.dive); }
    const stand = this.bs === 'ready' || this.bs === 'aim';
    for (let i = 0; i < this.opp.length; i++) { const a = this.opp[i]; a.body.on = (stand || !oppShot) && a.cool <= 0 && !(a.ghostBall > 0) && (!a.manual || a.sliding || !!a.dive); }
  }

  // ------------------------------------------------------------------ візуальна синхронізація
  syncView(dt) {
    const v = this.view, b = this.ball;
    const by = v.ball.group.position.y;                               // воротарі бачать м'яч: руки стежать за ним, ловлять і відбивають
    const vr = v.ball.rad;                                            // видимий радіус (здалеку м'яч збільшений): руки беруть саме такий м'яч
    this.mine[0].p.ballAt(b.x, by, b.z, vr); this.opp[0].p.ballAt(b.x, by, b.z, vr);
    if (dt > 0) this.slaps.update(dt);
    // дрібні «живі» рухи (поправити футболку, витерти піт, руки на коліна…) — у всіх, крім тих, хто зараз із м'ячем чи на прийомі
    for (let i = 0; i < this.actors.length; i++) { const a = this.actors[i]; a.p.fidget = !(a === this.holder || a === this.taker || a.receiver || a.manual || a.sliding || a.dive); }
    for (let i = 0; i < v.players.length; i++) v.players[i].animate(dt);
    this.keeperBodies();
    v.ball.cam = this.game.matchCam;                                  // м'яч знає камеру: здалеку не губиться на екрані
    // фізика йде кроками 1/120 с, кадр — коли завгодно (60, 90, 144 Гц): м'яч малюємо між двома останніми кроками
    // за часткою накопиченого часу, тож він рухається рівно, без смикання; великий стрибок (м'яч поставили) — без змішування
    let rx = b.x, rz = b.z, ry = b.y;
    if (this.bpx !== undefined && Math.abs(b.x - this.bpx) + Math.abs(b.z - this.bpz) < 3) {
      const al = clamp(this.acc / H, 0, 1) - 1;                          // −1..0: від попереднього кроку до поточного
      rx += (b.x - this.bpx) * al; rz += (b.z - this.bpz) * al; ry = Math.max(0, ry + (b.y - this.bpy) * al);
    }
    const h = v.ball.update(dt, rx, rz, b.vx, b.vz, ry, b.w);
    {   // м'яч у руках воротаря: поки той тримає його (до удару чи кидка), видимий м'яч — між рукавицями; віддав — плавно до ноги
      let gk = null;
      for (const g of [this.mine[0], this.opp[0]]) {
        const holding = (this.holder === g && (this.bs === 'ready' || this.bs === 'aim')) || (this.taker === g && this.bs === 'held');
        g.p.holdBall = holding && !g.footBall; if (holding && !g.footBall) gk = g;
      }
      this.gkBallW = (this.gkBallW || 0) + ((gk ? 1 : 0) - (this.gkBallW || 0)) * Math.min(1, dt * 12);
      if (gk) this.gkBallP = gk.p;
      const hp = this.gkBallP;
      if (hp && this.gkBallW > 0.01 && hp.hk && hp.hk.src === 'hold') v.ball.group.position.lerp(hp.hk.V, this.gkBallW * Math.min(1, hp.hk.w[0] * 1.5));
    }
    {   // збільшений здалеку м'яч не заходить у борти: центр зсуваємо на різницю видимого й фізичного радіуса (крім рамки воріт)
      const gp = v.ball.group.position, ex = v.ball.rad - R;
      if (ex > 0) {
        const zl = W - v.ball.rad; gp.z = Math.max(-zl, Math.min(zl, gp.z));
        if (Math.abs(gp.z) > G - 0.2) { const xl = L - v.ball.rad; gp.x = Math.max(-xl, Math.min(xl, gp.x)); }
      }
    }
    v.updateShadows(rx, rz, h);
    this.netBulge(dt);
    v.stands.update(dt, this.time); v.weather.update(dt); v.surround.update(dt); v.pitch.decals.update(dt); v.pitch.boards.texture.offset.x = (this.time * 0.018) % 1;
    v.particles.update(dt);
    if (this.bs === 'ready') {
      const pr = this.danger;
      const k = 1.15 + Math.sin(this.time * (5 + pr * 8)) * 0.12;
      v.ring.visible = true; v.band.visible = false; v.ring.material.color.setHSL(0.36 * (1 - pr * pr), 0.55 + 0.3 * pr, 0.65 - 0.1 * pr);
      v.ring.position.set(b.x, 0.07, b.z); v.ring.scale.setScalar(k);
      if (pr > 0.62 && !this.pressWarn) { this.pressWarn = true; this.ui.hud.warn('ТИСК! БИЙ ЗАРАЗ'); }
      else if (pr < 0.45 && this.pressWarn) { this.pressWarn = false; this.ui.hud.warn(null); }
    } else if (this.pressWarn && this.bs !== 'ready') { this.pressWarn = false; if (this.bs !== 'held') this.ui.hud.warn(null); }
    if (this.phase === 'play' && !this.rp && (this.bs !== 'net' || this.time < this.goalTime + 1.2)) { this.replay.rec(this.time); this.takeMoments(); }   // запис для підбірки моментів
    const sp = Math.hypot(b.vx, b.vz);
    if (sp > 20 && dt > 0 && Math.random() < 0.6) v.particles.emit(b.x, 0.25, b.z, (Math.random() - 0.5) * 1.2, 0.7, (Math.random() - 0.5) * 1.2, 0.3, 0.17, '#e8f2e4', 0, 1, 0, -1);
  }

  /** Сітка воріт прогинається там, куди влетів м'яч (глибина — з пружної сітки фізики), і плавно розпрямляється. */
  netBulge(dt) {
    const np = this.world.netPush, nets = this.view.pitch.nets;
    for (let k = 0; k < 2; k++) {
      const back = nets[k].children[0], sd = k ? 1 : -1, U = back.userData, hit = np && np.sd === sd;
      U.amt = (U.amt ?? 0) + ((hit ? np.depth : 0) - (U.amt ?? 0)) * Math.min(1, dt * (hit ? 25 : 6));
      if (hit) { U.cx = -np.z; U.cy = np.y - back.position.y; }
      if (U.amt < 0.003 && !U.dirty) continue;
      const pos = back.geometry.attributes.position, base = (U.base ??= pos.array.slice()), a = pos.array;
      for (let i = 0; i < pos.count; i++) {
        const dx = base[i * 3] - (U.cx ?? 0), dy = base[i * 3 + 1] - (U.cy ?? 0);
        a[i * 3 + 2] = base[i * 3 + 2] + sd * U.amt * Math.exp(-(dx * dx + dy * dy) / 0.7);
      }
      pos.needsUpdate = true; U.dirty = U.amt >= 0.003;
    }
  }

  floatAt(x, z, text, kind) { this.game.floatWorld(x, 1.9, z, text, kind); }

  // ------------------------------------------------------------------ завершення
  pause() { if (this.phase === 'play' || this.phase === 'intro' || this.phase === 'pens' || this.phase === 'break') { this.prevPhase = this.phase; this.phase = 'paused'; this.cancelAim(); audio.crowd(0.2); } }
  resume() { if (this.phase === 'paused') { this.phase = this.prevPhase; audio.crowd(0.7); } }
  isPlaying() { return this.phase === 'play' || this.phase === 'intro' || this.phase === 'pens' || this.phase === 'break'; }

  /** Після фінального свистка: переможці збігаються до свого воротаря (кожен на своє місце довкола) і радіють; решта стоїть. */
  endCelebrate(dt) {
    for (const a of this.actors) {
      if (a.endPair) continue;                                         // уже йде тиснути руку суперникові
      const win = this.endWin && this.endWin.includes(a);
      if (!win) {
        // ті, що програли, повільно плетуться ближче до переможців (потиснути руки); у нічиїй — стоять
        const h = this.endHub, d = h ? Math.hypot(h.x - a.p.x, h.z - a.p.z) : 0;
        if (h && d > 7 && !a.isGK) { a.avx = a.avz = 0; a.move(h.x, h.z, 2.4, dt); if (Math.hypot(a.p.vx, a.p.vz) > 0.6) a.p.yaw = Math.atan2(a.p.vx, a.p.vz); }
        else { a.p.vx *= Math.exp(-dt * 4); a.p.vz *= Math.exp(-dt * 4); a.p.x += a.p.vx * dt; a.p.z += a.p.vz * dt; }
        continue;
      }
      // переможці збігаються в купу посеред своєї групи (воротар теж прибігає) — звідти ж потім ідуть тиснути руки суперникам
      const gk = this.endHub, i = this.endWin.indexOf(a), ang = i * 0.65, rr = a.isGK ? 0 : 1.7, tx = gk.x + Math.cos(ang) * rr, tz = gk.z + Math.sin(ang) * rr;
      if (!a.endHug) {
        a.avx = a.avz = 0; a.move(tx, tz, 7.5, dt);
        const sp = Math.hypot(a.p.vx, a.p.vz); if (sp > 0.6) a.p.yaw = Math.atan2(a.p.vx, a.p.vz);
        if (Math.hypot(tx - a.p.x, tz - a.p.z) < 1.0 || this.endT > 2.6) { a.endHug = true; a.p.yaw = Math.atan2(gk.x - a.p.x, gk.z - a.p.z); a.p.cheer(4); }
      } else { a.p.vx *= Math.exp(-dt * 6); a.p.vz *= Math.exp(-dt * 6); a.p.x += a.p.vx * dt; a.p.z += a.p.vz * dt; }
    }
  }

  end() {
    const spec = this.spec, me = this.score.me, opp = this.score.opp;
    const outcome = this.penRes ? (this.penRes.win ? 'win' : 'loss') : me > opp ? 'win' : me < opp ? 'loss' : 'draw';
    this.phase = 'end'; this.endT = 0; this.resultSent = false; this.cancelAim(); this.setGaze(true);
    this.ui.hud.warn(null); this.ui.hud.clearGoal();
    audio.whistle(true); audio.crowd(0.35);
    const win = outcome === 'win';
    this.endWin = outcome === 'draw' ? null : win ? this.mine : this.opp; this.endLose = outcome === 'draw' ? null : win ? this.opp : this.mine;
    for (const a of this.actors) { a.endHug = false; a.manual = false; a.frozen = 0; a.endPair = false; }
    this.endPairs = null; this.endFeat = null; this.endHub = null; this.endDrama(); this.ui.hud.cine(true, 'КІНЕЦЬ МАТЧУ');
    if (this.endWin) {
      let hx = 0, hz = 0; for (let i = 1; i < this.endWin.length; i++) { hx += this.endWin[i].p.x; hz += this.endWin[i].p.z; }
      this.endHub = { x: clamp(hx / 10, -L * 0.6, L * 0.6), z: clamp(hz / 10, -W * 0.6, W * 0.6) };
      for (let i = 0; i < this.endLose.length; i++) this.endLose[i].p.sad(5);
    }
    if (win) this.view.stands.react('wave'); else if (outcome === 'loss') this.view.stands.react('groan');
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
    for (const e of S.bench || []) gainXp(e, 6 + (win ? 6 : 0));   // запасні теж тренуються
    this.ui.hud.setCard(null);
    S.form = [...(S.form || []), win ? 'W' : outcome === 'draw' ? 'D' : 'L'].slice(-5);
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
    this.result = { pens: this.penRes, outcome, me, opp, spec, lines, total, tickets, cup, promoted, newSeason, academyReady: S.academy.ready, stats: this.stats, levelUps: this.levelUps, chapter };
    if (win) audio.win(); else if (outcome === 'loss') audio.lose();
  }

  exit() {
    this.phase = 'idle'; this.cancelAim(); this.game.renderer.toneMappingExposure = 1.1;
    this.rp = null; this.drama = null; this.brk = null; this.ui.hud.cine(false); this.walk.hide();
    for (const a of this.actors) a.p.root.visible = true;
    if (this.slow) { this.slow = false; this.ui.setSlow(false); }
    this.view.particles.clear();
    audio.crowd(0);
  }
}
