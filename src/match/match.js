// Match: уся логіка матчу: фази, ввід удару, м'яч, відбори, воротарі, голи, кат-сцени, нагороди. Огляд: docs/ARCHITECTURE.md.
import * as THREE from 'three';
import { PITCH, PHYS, FIXTURES, ACADEMY, KEEPERS, shotSkill } from '../config.js';
import { CLUB, CHRONICLE } from '../club.js';
import { World } from '../physics/world.js';
import { AimPath } from '../physics/aim.js';
import { ground, BallPlan } from '../physics/ballmodel.js';
import { dribbleStep, keepBallIn } from './dribble.js';
import { MatchView } from './view.js';
import { Actor, Team } from './team.js';
import { JOB, zoneValue, shotQuality, passRisk, pickCarry, laneDist } from './brain.js';
import { audio, vibrate } from '../core/audio.js';
import { S, commit } from '../state/save.js';
import { incomeMult, striker, keeper } from '../state/economy.js';
import { oppSquad, skillOf, gkBonus, gainXp, ovr, tierOf, keysFor, ROLE_UA, STAT_NAMES } from '../state/squad.js';

import { Penalties } from './penalty.js';
import { Replay, Slaps, shakeHands, patShoulder } from './cinema.js';
import { Walkout } from './walkout.js';
import { diveKin, GK_STRIKE, angDiff } from '../graphics/player.js';
import { evolveSpec, recordMatch } from '../state/rivals.js';
import { ONLINE_AIM, ONLINE_GK } from '../online/profile.js';
import { pathPoint } from '../core/camera.js';
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
const _fr = new THREE.Frustum(), _pv = new THREE.Matrix4(), _sp = new THREE.Sphere(new THREE.Vector3(), 2.5);
const _c1 = new THREE.Vector3(), _c2 = new THREE.Vector3(), _cp = { x: 0, z: 0 }, _pa = { x: 0, z: 0 };
const H = 1 / PHYS.hz;
const MAX_STEPS = Math.ceil(0.1 * PHYS.hz) + 1;   // кадр не довший за 0.1 с (game.js): усі кроки фізики вміщаються, м'яч не відстає від гравців на низькому FPS
const AIM_UNIT = 3;                 // скаутинг: одиниця «довго цілиться» — ~3 с реального часу (пороги — у rivals.js)
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
    // прогноз руху м'яча для ШІ й воротарів (та сама фізика: відскоки від тіл, поперечини, бортів)
    this.plan = new BallPlan(this.world); this.planT = 0; this.planShot = -1; this._cr = { t: 0, z: 0, y: 0 }; this._cg = { t: 0, z: 0, y: 0 };
    const v = this.view;
    this.mine = v.mine.map((p, i) => new Actor(p, 1, i === 0 ? 0.95 : 0.5));
    this.opp = v.opp.map((p, i) => new Actor(p, -1, i === 0 ? 0.95 : 0.5));
    this.oppBodies = this.opp.map((a) => a.body);
    this.keepers = [this.mine[0], this.opp[0]];
    this.mine[0].body.e = this.opp[0].body.e = 0.8; this.mine[0].body.sep = this.opp[0].body.sep = 4;
    this.myTeam = new Team(1, this.mine); this.oppTeam = new Team(-1, this.opp);
    this.actors = [...this.mine, ...this.opp];
    this.world.bodies = this.actors.map((a) => a.body);
    this.ball = this.world.ball;
    this.ctx = { ball: this.ball, bs: 'ready', owner: 1, readyT: 0, opps: this.opp, all: this.actors };
    this.protectT = 0; this.receiverT = 0; this.passTarget = null; this.pressWarn = false;
    this.slow = false; this.slowT = 0; this.beatT = 0; this.danger = 0;
    this.kickoff = true; this.shotId = 0; this.slideT = 0; this.slideShotId = -1; this.slideTries = 0; this.slid = false;
    this.glideT = 0; this.glideX = 0; this.glideZ = 0; this.celeb = null; this.shooter = null; this.lastOppTaker = null;

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
    this.slaps = new Slaps((c) => { audio.clap(); this.view.particles.burst(c.x, c.y, c.z, 7, 2.6, 0.22, 0.13, ['#ffffff', '#fff2c4'], 4, 0.5); }); this.brk = null; this.endPairs = null;
  }

  // ------------------------------------------------------------------ старт
  start(spec) {
    const on = spec.online;                            // онлайн: суперник — жива людина (гість), склади й форма — онлайн-клубів
    if (!on) spec = evolveSpec(spec);                  // стиль клубу, реванш і вивчена ними наша гра (rivals.js)
    this.spec = spec; this.scoutLog = { shots: [], aims: [] };
    if (this.link && (!on || this.link !== on.link)) this.link.uninstall();   // попередній онлайн-матч (реванш)
    this.link = on ? on.link : null; this.netCmd = null; this.netAim = null; this.netWaitT = 0; this.netAuto = false;
    const v = this.view;
    this.mySquad = on ? spec.mySquad : S.squad; this.oppSq = on ? spec.oppSquad : oppSquad(spec);
    v.setup(spec, spec.myForm || S.tactic || MY_FORMATION, this.mySquad, this.oppSq);
    if (this.link) this.link.install(this);            // з цієї миті табло, звуки й ефекти віддзеркалюються гостю
    const gb = on ? 0 : gkBonus();
    this.mine.forEach((a, i) => { a.info = this.mySquad[i]; a.sk = skillOf(a.info, i === 0 ? gb : 0); });
    this.opp.forEach((a, i) => { a.info = this.oppSq[i]; a.sk = skillOf(a.info); });
    // воротарі — як люди: час реакції (≈0.26 с у новачка → 0.13 с у топа, «Реакція») і швидкість рук (~5.5–9 м/с, «Ловля»)
    for (const g of this.keepers) { g.p.reactT = 0.26 - 0.13 * g.sk.react; g.p.handV = 5.5 + 3.5 * g.sk.hands; }
    this.xp = new Array(11).fill(0); this.levelUps = []; this.goalsBy = new Array(11).fill(0);   // голи авторів: у картки гравців ідуть лише в end, покинутий матч їх не чіпає
    this.kk = on ? ONLINE_GK : keeper(); this.st = on ? ONLINE_AIM : striker();
    this.myTeam.setFormation(spec.myForm || S.tactic || MY_FORMATION); this.oppTeam.setFormation(spec.formation);
    const mg = this.mine[0].sk, og = this.opp[0].sk;
    for (const g of this.keepers) g.kReach = 0;
    if (!on) this.mine[0].kReach = this.kk.reach - KEEPERS[0].reach;   // «Досяжність» куплена воротаря: довші руки й ширший стрибок
    Object.assign(this.myTeam, { speed: 9.2, gkSpeed: 6 + 7 * mg.react + (on ? 0 : (this.kk.speed - KEEPERS[0].speed) * 0.4), gkErr: (1.15 - mg.react) * 3.0 });
    // у кар'єрі суперник навмисно слабший за нас за тих самих показників (задум); онлайн — двоє людей: воротарі й захист однакові
    Object.assign(this.oppTeam, { speed: spec.runSpeed, press: spec.press, line: spec.line, gkSpeed: on ? 6 + 7 * og.react : 5 + 6 * og.react, gkErr: on ? (1.15 - og.react) * 3.0 : (1.2 - og.react) * 3.4 });
    this.myTeam.even = this.oppTeam.even = !!on;
    // вивчили нашу гру: воротар стоїть ближче до нашого улюбленого кута, блок зсувається на наш улюблений фланг
    this.oppTeam.cheatZ = spec.scout.corner * 0.45; this.oppTeam.zBias = spec.scout.flank * 2.5;
    this.score = { me: 0, opp: 0 };
    this.pens = null; this.penRes = null;
    this.clock = spec.time; this.period = 1; this.periodEnd = false; this.timeUp = false; this.timeUpWait = 0;
    this.periodGoals = 0; this.addMin = 0; this.addShown = false; this.scorers = [];
    this.coins = 0; this.stats = { goals: 0, combo: 1, saves: 0 };
    this.phase = 'intro'; this.introT = 0; this.skipAt = undefined; this.hitStop = 0; this.ts = 1; this.acc = 0;
    this.aiming = false; this.endT = 0; this.goalT = 0; this.resultSent = false;
    this.lastClock = -1;
    this.holder = null; this.taker = null; this.shooter = null; this.lastOppTaker = null; this.saveId = -1; this.pauseWanted = false;   // ні автор, ні прохання про паузу не переходять із минулого матчу
    this.firstKick = Math.random() < 0.5 ? 1 : -1;     // жереб: хто розводить 1-й тайм (далі — по черзі)
    this.formation(this.kickFor(1));
    const hud = this.ui.hud;
    hud.show(spec);
    hud.setScore(0, 0); hud.setTime(this.timeText(), false, this.halfText(), null); hud.addedTime(null); hud.setCoins(0);
    hud.warn(null); hud.hint(null);
    if (on) hud.banner(spec.club.name, 'Онлайн-матч · ти граєш удома', 'Суперник: ' + spec.club.name);
    else hud.banner(spec.club.name, spec.leagueName + ' · матч ' + spec.no + ' з ' + spec.of + (spec.final ? ' · ФІНАЛ' : ''), spec.note || CLUB.slogan);
    audio.music('match'); audio.crowd(0.7);
    this.game.renderer.toneMappingExposure = this.view.exposure || 1.1;
    this.introTgt = [this.mine, this.opp].map((arr) => arr.map((a) => ({ x: a.p.x, z: a.p.z })));
    this.introFlags = { wave: false, clap: false, cheer: false, roar: false, anthem: false, hs: false, fans: false };
    this.rp = null; this.hl = null; this.clips = []; this.moments = []; this.walk.start(spec.club, spec.home);
    for (const a of this.actors) { a.lane = null; a._st = 0; a.post = null; a._jr = Math.random(); a.p.gaze = true; a._ix = a._iz = undefined; }
    this.introEndAt = null; this.skipEnd = false; this._cx = undefined; this._camT = undefined; this.brk = null; this.endPairs = null; this.replay.clear();
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
        let x = -side * L + side * f * L, z = a.role.v * side * (W - 4.5);
        if (a !== hold) {                                      // поза центральним колом
          const d = Math.hypot(x, z);
          if (d < R0) { if (d < 0.01) { x = -side * R0; z = 0; } else { x *= R0 / d; z *= R0 / d; } }
        }
        a.place(x, z); a.kx = x; a.kz = z;
        a.manual = false; a.cool = 0; a.noTrap = 0; a.stun = 0; a.receiver = false; a.cheered = false; a.frozen = 0; a.slide = null; a.dive = null; a.sliding = false; a.slideCool = 0; a.decided = -1; a.body.r = a.baseR; a.p.dribble = false; a.p.setThreat(0, 0); a.body.on = true; a.p.setMode('idle');
      });
      t.gk.manual = false; t.gk.cool = 0; t.gk.noTrap = 0; t.gk.stun = 0; t.gk.frozen = 0; t.gk.slide = null; t.gk.dive = null; t.gk.sliding = false; t.gk.slideCool = 0; t.gk.decided = -1; t.gk.saveShift = null; t.gk.body.r = t.gk.baseR; t.gk.p.setMode('idle');
      for (const a of [t.gk, ...t.out]) a.p.yaw = side > 0 ? Math.PI / 2 : -Math.PI / 2;
    }
    hold.place(-1.8 * kick, 0); hold.kx = -1.8 * kick; hold.kz = 0;
    this.kickoff = true; this.kickT = 0; this.hitStop = 0; this.koQ = null; this.koRun = false;
    if (kick > 0) this.makeReady(hold, true);
    else { this.trapOpp(hold, 0); this.ui.hud.warn(null); hold.p.setMode('idle'); hold.p.yaw = -Math.PI / 2; }   // м'яч поставили, а не прийняли: без пози прийому
    b.x = 0; b.z = 0; b.vx = b.vz = 0; ground(b); this.glideT = 0;   // і висота: м'яч, що був у повітрі, інакше висів би над центром усю кат-сцену (tick у ній не йде)
    this.bpx = undefined;                                    // м'яч поставили: малювати без змішування зі старим кроком фізики
    this.hideAim();
    this.shotBy = 0; this.shotBounces = 0; this.looseT = 0; this.protectT = 0; this.pressWarn = false;
    for (const a of this.actors) { a.tkl = 0; a.nearT = 0; }       // випад, що не завершився до розстановки, не тягне гравця
  }

  /** Хто розводить тайм n (1..4): за жеребом перший, далі команди по черзі, як у футболі. 1 — ми, −1 — суперник. */
  kickFor(n) { return (n % 2 ? 1 : -1) * (this.firstKick || 1); }

  /** Час як на ТБ: стиснутий 90-хвилинний матч. У доданий час головний годинник стоїть на межі тайму («45:00»), а поруч біжить «+1:20». */
  timeText() {
    const f = clamp(1 - this.clock / this.spec.time, 0, 1), cap = Math.round(5400 * Math.min(4, this.period || 1) / 4);
    const gs = Math.min(Math.floor(f * 5400), cap), m = (gs / 60) | 0, r = gs % 60;
    return (m < 10 ? '0' : '') + m + ':' + (r < 10 ? '0' : '') + r;
  }
  /** Межа поточного тайму на годиннику-зворотнику і скільки реальних секунд триває хвилина гри. */
  periodBound() { return this.spec.time * (1 - Math.min(4, this.period) / 4); }
  gameMin() { return this.spec.time / 90; }
  /** Скільки хвилин гри минуло понад межу тайму (0 — ще основний час). */
  overMin() { return this.periodEnd ? Math.max(0, (this.periodBound() - this.clock) / this.gameMin()) : 0; }
  extraText() {
    if (!this.periodEnd) return null;
    const gs = Math.floor(this.overMin() * 60), m = (gs / 60) | 0, r = gs % 60;
    return '+' + m + ':' + (r < 10 ? '0' : '') + r;
  }
  /** Хвилина події для табло: «34'» або «45+2'». */
  minuteLabel() {
    if (this.periodEnd) return Math.round(22.5 * Math.min(4, this.period)) + '+' + Math.max(1, Math.ceil(this.overMin())) + "'";
    const f = clamp(1 - this.clock / this.spec.time, 0, 1);
    return Math.max(1, Math.ceil(f * 90)) + "'";
  }
  /** Скільки додати: наприкінці половин більше, кожен гол у таймі — ще трохи (святкування), плюс випадок. */
  stoppage() {
    const n = this.period, base = n === 2 || n === 4 ? 2 : 1;
    return clamp(base + Math.round(this.periodGoals * 0.6 + Math.random() * 1.3), 1, 5);
  }
  /** Удар уже випущено (замах) або м'яч летить (удар, прострiл) — свисток у цю мить украв би момент. */
  ballFlying() { return this.bs === 'wind' || (this.bs === 'roll' && Math.hypot(this.ball.vx, this.ball.vz) > 7); }
  /** Спокійна мить для свистка: м'яч у руках воротаря або в середній зоні й ніхто не б'є. */
  calmBall() {
    if (this.bs === 'net') return false;
    const gk = ((this.bs === 'ready' || this.bs === 'aim') && this.holder && this.holder.isGK) || (this.bs === 'held' && this.taker && this.taker.isGK);
    if (gk) return true;
    if (this.ballFlying()) return false;
    return Math.abs(this.ball.x) < L * 0.42;
  }
  /** Свисток на кінець тайму: перерва або кінець матчу. */
  whistlePeriod() { if (this.period < 4) this.nextPeriod(); else this.timeOver(); }
  setClockHud(held = false) {
    const hud = this.ui.hud, P = this.spec.time / 4, start = this.spec.time * (1 - (Math.min(4, this.period) - 1) / 4);
    hud.setTime(this.timeText(), this.period === 4 && this.periodEnd, this.halfText(), this.extraText());
    // смужка тайму під годинником; у доданий час — заповнюється червоним до кінця доданого
    hud.setProg(this.periodEnd ? clamp(this.overMin() / Math.max(1, this.addMin), 0, 1) : clamp((start - this.clock) / P, 0, 1), this.periodEnd, held);
  }
  halfText() {
    if (this.phase === 'pens') return 'Пенальті';
    const f = clamp(1 - this.clock / this.spec.time, 0, 1);
    return Math.min(4, (this.period || 1)) + '-й тайм';
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
    this.bs = 'wind'; this.ts = 1;
    if (!this.holder.isGK) this.scoutLog.aims.push(this.readyReal / AIM_UNIT);   // скільки цілився (реальний час: у сповільненні ігровий майже стоїть) — суперники це помічають
    const hp = this.holder.p, hands = this.holder.isGK && !this.holder.footBall;
    // рукою воротар кидає одразу; ногою — гравець спершу підходить до м'яча (обходить його, розбігається), удар — у мить,
    // коли опорна нога стає біля м'яча (kickApproach / kickReady), м'яч летить через ~0.13 с, у контакті
    this.wnd = { t: 0, run: false, kicked: hands, hands, carry: this.carries(this.holder) };
    if (hands) { this.windT = 0.14; hp.yaw = Math.atan2(this.shot.dirx, this.shot.dirz); hp.throwBall(); } else { this.windT = 0.13; hp.setMode('idle'); }
    if (!S.tutorial && !this.spec.online) { S.tutorial = true; commit(); }   // онлайн не чіпає кар'єру
  }
  hideAim() { const v = this.view; v.aim.hide(); v.ring.visible = false; v.band.visible = false; }
  cancelAim() {
    if (this.bs === 'aim') { this.bs = 'ready'; this.aiming = false; this.hideAim(); this.holder.p.setMode('idle'); }
  }

  /** Сильний удар залежить від навички «Удар» виконавця; пас — від «Пасу» (точність). */
  /** Похибка удару чи паса, рад: приціл нападника плюс власна майстерність виконавця (на максимумі навички — нуль). */
  kickErr(v) { return (this.st.jitter * (1.5 - 0.9 * v) + 1.2 * (1 - v)) * DEG; }
  shotMul(p) { return p >= 0.45 ? shotSkill(this.holder.sk.shoot) : 1; }

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
      // суперник упритул до м'яча на мить не блокує удар (ghostBall у launchShot) — приціл теж його не бачить
      const cs = (this._aimC ??= []); cs.length = 0;
      for (let i = 0; i < this.oppBodies.length; i++) { const q = this.oppBodies[i]; if (Math.hypot(q.x - b.x, q.z - b.z) >= 1.9) cs.push(q); }
      this.path.setCircles(cs, null);
      this.path.simulate(b.x, b.z, sh.vx, sh.vz, this.st.bounces);
      // удар у створ проходить між своїми; пас і удар мимо — ні: пунктир закінчується на тому, до кого м'яч дійде
      const ok = (sh.dirx > 0.05 && Math.abs(b.z + sh.dirz * (L - b.x) / sh.dirx) < G + 1.2 && L - b.x < 60) || (sh.power >= 0.45 && this.path.goal && this.path.x[this.path.n - 1] > 0);
      if (!ok) this.cutAimAtMates();
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
    if (this.holder.isGK && !this.holder.footBall) p.yaw = Math.atan2(sh.dirx, sh.dirz);   // з м'ячем у руках — просто розвертається
    p.setMode('aim'); p.power = sh.power;
  }

  /** Обриває пунктир на першому своєму гравці на шляху (крім виконавця й тих, хто впритул до м'яча: вони на мить не тверді). */
  cutAimAtMates() {
    const pa = this.path, b = this.ball;
    for (let i = 1; i < pa.n; i++) {
      const x0 = pa.x[i - 1], z0 = pa.z[i - 1], ex = pa.x[i] - x0, ez = pa.z[i] - z0, l2 = ex * ex + ez * ez || 1e-6;
      for (let j = 0; j < this.mine.length; j++) {
        const m = this.mine[j]; if (m === this.holder) continue;
        const rr = m.body.r + R, t = clamp(((m.p.x - x0) * ex + (m.p.z - z0) * ez) / l2, 0, 1), dx = x0 + ex * t - m.p.x, dz = z0 + ez * t - m.p.z;
        if (dx * dx + dz * dz >= rr * rr || Math.hypot(m.p.x - b.x, m.p.z - b.z) < 1.9) continue;
        pa.x[i] = x0 + ex * t; pa.z[i] = z0 + ez * t; pa.cum[i] = pa.cum[i - 1] + (pa.cum[i] - pa.cum[i - 1]) * t;
        pa.n = i + 1; pa.length = pa.cum[i]; pa.goal = false;
        return;
      }
    }
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
    this.deflectId = this.shotId;                                       // м'яч відскочив: це вже не удар, партнери знову тверді (updateSolidity)
    if (impact > 6) this.view.stands.react('gasp');
    if (impact > 12) { this.hitStop = Math.max(this.hitStop, 0.045); if (this.shotBy !== 0) this.markMoment('post'); }   // мить завмирання: дзвін штанги; момент — у підбірку тайму
    audio.wall(5, impact); this.view.ball.squash(nx, nz, 0.3);
    this.view.particles.burst(this.ball.x, 0.6, this.ball.z, 8, 6, 0.5, 0.22, ['#ffffff', '#d9dcd8'], 10, 0.6);
    this.game.addTrauma(0.18);
    this.floatAt(this.ball.x, this.ball.z, 'ШТАНГА!', 'warn');
  }

  onBody(b, vn, nx, nz, speed) {
    const a = b.ref, v = this.view;
    if (a.sliding && this.bs === 'roll') return this.onSlideContact(a, speed, nx, nz);
    if (this.bs === 'ready' || this.bs === 'aim') {          // суперник дотягнувся до м'яча, який ми тримаємо
      if (a.side < 0 && !(this.holder && this.holder.isGK && !this.holder.footBall) && !this.oppLunging() && a.stun <= 0 && a.noTrap <= 0) this.startTackle(a);   // м'яч у руках воротаря забрати не можна
      return true;
    }
    if (this.bs !== 'roll') return true;
    // м'яч на рівні голови: не прийом, а удар головою — до воріт суперника (відбиває й захисник: подалі від своїх воріт)
    const hy = this.ball.y;
    if (!a.isGK && hy > 1.4) {
      // удар головою — один дотик: двоє біля м'яча інакше перебивали його один в одного десятки разів за кадр (кожен удар міняв shotId, і headId нікого не стримував)
      if (a.headId === this.shotId || this.time - (this.headT ?? -9) < 0.3) return true;
      a.headId = this.shotId; this.headT = this.time;
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
      // удар у корпус до ~90–130 км/год воротар ловить (за «Ловлею»); раніше межа була ~18–30 од/с, а удари долітають ~25 — лише відбивав
      const sk = a.sk, limit = a.receiver ? 38 : 26 + 12 * sk.hands;
      // ловить, лише якщо м'яч прийшов у рукавиці; удар у ноги чи тулуб — відскік (повільний м'яч біля ніг — підбере сам)
      const outBox = (this.ball.x + a.side * L) * a.side > PITCH.BOX_D || Math.abs(this.ball.z) > PITCH.BOX_W;   // поза штрафним — грає ногою, як польовий
      const strike = a.isGK && GK_STRIKE.has(a.p.mode) && speed > 5;   // кулаками, долонею, ногою, тілом — відбиває, а не ловить
      // у позі ловлі («кошик», на коліні, ловля перед собою) м'яч, що влучив у ноги чи тулуб, воротар забирає руками —
      // тіло позаду рук саме для цього; раніше низовий м'яч першим торкався гомілок, і це завжди був відскок
      const gather = (a.p.mode === 'scoop' || a.p.mode === 'gkknee' || a.p.mode === 'catch') && this.facesBall(a);
      if (!strike && speed < limit && a.noTrap <= 0 && (outBox || gather || this.inGloves(a, 0.16) || (speed < 5 && this.facesBall(a)))) {
        if (a.side > 0) { this.trapMine(a, speed); return true; }
        // воротар суперника ловить і одразу після нашого удару (protectT — захист від перехоплення польовими, не від воротаря)
        if (a.receiver || this.spec.online || Math.random() < (0.64 + 0.34 * this.oppTeam.press) * (0.7 + 0.6 * sk.hands)) { this.trapOpp(a, speed); return true; }
        a.noTrap = 0.45;
      }
    }
    if (a.isGK) {
      const shotAt = this.shotBy === -a.side;                // удар суперника, а не свій пас чи вільний м'яч
      this.saveReact(a);
      if (shotAt) { audio.save(); this.creditSave(a); }
      a.p.parry(); audio.thud(); if (speed > 18) this.view.stands.react('gasp');
      { const k = clamp(speed / 25, 0.3, 1.4); a.p.impulse(-0.9 * k, 2.0 * k, 0, -3 * k, -3 * k, 0.7 * k); if (speed > 22) this.game.addTrauma(0.05 + 0.04 * k); }   // м'яч б'є в руки чи тіло — тіло «віддає»
      if (speed > 20 && shotAt) this.markMoment('save');   // сильний удар відбито — у підбірку моментів тайму
      if (shotAt) this.floatAt(a.p.x, a.p.z, a.side > 0 ? 'ВРЯТУВАВ!' : 'ВОРОТАР!', a.side > 0 ? 'good' : 'warn');
    } else {
      audio.wall(0, 8);
      if (speed > 24) { if (hy < 0.6) a.p.block(); else a.p.hit(); }   // голова лише вище ~1.4 (гілка вгорі): низький м'яч блокує ногою, на рівні тіла приймає корпусом
      else if (speed > 6 && a.p.mode === 'idle' && !a.p.kicking) a.p.receive(this.ball.y, speed);   // зачепив, але не втримав — рух ногою/тілом видно
    }
    v.ball.squash(nx, nz, 0.22); this.planT = 0; this.deflectId = this.shotId;   // м'яч змінив курс — прогноз перерахувати одразу; партнери того, хто бив, знову тверді
    return false;
  }

  /** Сейв нашого воротаря: досвід і рядок «Порятунки воротаря» на екрані результату. Один удар — один сейв, навіть якщо відбив і потім спіймав. */
  creditSave(g) {
    if (g.side < 0 || this.saveId === this.shotId) return;
    this.saveId = this.shotId; this.stats.saves++; this.addXp(g, 25);
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
   *  • краще, коли м'яч попереду (обличчям до нього), ближче й повільніше відносно ноги; «Ведення» — м'якший прийом.
   * Свої не чіпають наш удар у створ; суперник одразу після нашого удару бере лише повільніший м'яч.
   */
  controlScore(a) {
    if (a.isGK || a.noTrap > 0 || a.cool > 0 || a.frozen > 0 || a.stun > 0 || a.sliding || a.dive || a.tkl > 0 || a.p.downed) return 0;
    const b = this.ball, p = a.p;
    // онлайн удар гостя у створ теж проходить повз його партнерів, як наш (shotBy −1 у remoteRelease — лише удар у створ)
    if (b.y > 1.5 || (this.deflectId !== this.shotId && (a.side > 0 ? this.shotBy === 1 && this.shotOnTarget : this.spec.online && this.shotBy === -1) && Math.hypot(b.vx, b.vz) > 18)) return 0;
    const dx = b.x - p.x, dz = b.z - p.z, d = Math.hypot(dx, dz), chest = b.y > 0.6;
    // м'яч притиснуло до борту: гравець не стане ближче ~1.3 м до нього (межа поля), нога дотягується через цю межу
    const wall = Math.abs(b.z) > W - 0.7 || (Math.abs(b.x) > L - 0.7 && Math.abs(b.z) > G);
    const reach = a.body.r + R + (chest ? 0.25 : 0.45) + 0.2 * a.sk.drib + (wall ? 0.3 : 0);
    if (d > reach) return 0;
    const vr = Math.hypot(b.vx - p.vx, b.vz - p.vz);
    // одразу після удару суперник бере лише повільніший м'яч; онлайн це дзеркально й для удару гостя (тоді shotBy < 0)
    const vmax = (a.receiver ? 30 : 13 + 15 * a.sk.drib) * (chest ? 0.7 : 1) * ((this.spec.online && this.shotBy < 0 ? a.side > 0 : a.side < 0) && this.protectT > 0 && !a.receiver ? 0.6 : 1);
    if (vr > vmax) return 0;
    const yaw = p.bodyYaw ?? p.yaw, face = d > 1e-3 ? (dx * Math.sin(yaw) + dz * Math.cos(yaw)) / d : 1;
    return 0.05 + 0.55 * (1 - d / reach) + 0.2 * (0.5 + 0.5 * face) + 0.12 * (1 - vr / vmax) + 0.08 * a.sk.drib;
  }

  /**
   * Вільний м'яч: щокроку дивимось, хто може його взяти (controlScore). Найкращий від кожної команди; якщо поруч обидва —
   * боротьба: шанс за якістю позиції й навичками («Ведення» того, хто бере, проти «Відбору» суперника). Хто програв —
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
      const lose = win === bm ? bo : bm; lose.noTrap = Math.max(lose.noTrap, 0.4); lose.p.hit();
      this.floatAt(win.p.x, win.p.z, 'ВИГРАВ М’ЯЧ', win.side > 0 ? 'good' : 'warn');
    }
    const sp = Math.hypot(this.ball.vx, this.ball.vz);
    if (win.side > 0) this.trapMine(win, sp); else this.trapOpp(win, sp);
  }

  /** Шанс відбору: навичка «Відбір» супротивника проти «Веденню» виконавця; сила ліги задає базу. */
  tackleChance(a, h) { return clamp(this.spec.tackle * (0.75 + 0.5 * a.sk.tack) - (h.sk.drib - 0.4) * 0.35, 0.3, 0.97); }

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
    // наш виконавець веде м'яч, переставляючи його (швидкість м'яча 0) — рух м'яча беремо з його бігу
    const hp = (this.bs === 'ready' || this.bs === 'aim') && this.holder ? this.holder.p : null, bvx = hp ? hp.vx : b.vx, bvz = hp ? hp.vz : b.vz;
    a.tkl = T; a.tklX = b.x + bvx * lead; a.tklZ = b.z + bvz * lead; a.nearT = 0;
    a.frozen = Math.max(a.frozen, T + 0.42);                         // ШІ команди не кермує, поки триває випад і відновлення (анімація tackle: T + 0.4)
    a.p.yaw = Math.atan2(a.tklX - a.p.x, a.tklZ - a.p.z);
    a.p.tackle(T);
    // дриблер бачить випад і може піти вбік (навичка «Ведення»)
    if (this.bs === 'held' && this.taker && a.side > 0 && Math.random() < 0.15 + 0.5 * this.taker.sk.drib) {
      const sn = Math.random() < 0.5 ? -1 : 1, ldx = this.dribDx, ldz = this.dribDz;
      this.dribDx = ldx * 0.5 - sn * ldz * 0.87; this.dribDz = ldz * 0.5 + sn * ldx * 0.87; this.thinkT = 0.6;
    }
  }

  /** Випади, що тривають: тіло йде вперед до м'яча, у мить контакту — результат. */
  updateTackles(dt) {
    for (let i = 0; i < this.actors.length; i++) {
      const a = this.actors[i];
      if (!(a.tkl > 0)) continue;
      if (a.p.downed) { a.tkl = 0; continue; }
      // нога йде туди, де м'яч буде в мить контакту: у випаді захисник бачить м'яч і доводить ціль (розумніший — точніше),
      // а не б'є в точку, де м'яч був на старті (м'яч, що котиться з дриблером, раніше майже завжди «тікав»)
      { const b = this.ball, hp = (this.bs === 'ready' || this.bs === 'aim') && this.holder ? this.holder.p : null, bvx = hp ? hp.vx : b.vx, bvz = hp ? hp.vz : b.vz;
        const q = 0.4 + 0.6 * a.sk.iq, k = Math.min(1, dt * 10 * q); a.tklX += (b.x + bvx * a.tkl * q - a.tklX) * k; a.tklZ += (b.z + bvz * a.tkl * q - a.tklZ) * k; }
      const dx = a.tklX - a.p.x, dz = a.tklZ - a.p.z, d = Math.hypot(dx, dz) || 1;
      // стопа має дістати м'яч, тіло зупиняється ~0.85 м від нього. Швидкість — не більше ~6 м/с (м'яч утік — під кінець
      // випаду тіло не «вистрілює» вперед) і набирається з поточної за ~0.08 с, без стрибка
      if (d > 0.3) a.p.yaw += angDiff(a.p.yaw, Math.atan2(dx, dz)) * Math.min(1, dt * 14);   // нога й корпус ідуть туди, куди летить тіло: дотяг у resolveTackle рахується від напрямку корпуса
      const lunge = Math.min(7.5, Math.min(1.6, Math.max(0, d - 0.85)) / Math.max(0.05, a.tkl)), kv = Math.min(1, dt * 12);
      a.p.vx += ((dx / d) * lunge - a.p.vx) * kv; a.p.vz += ((dz / d) * lunge - a.p.vz) * kv; a.p.x += a.p.vx * dt; a.p.z += a.p.vz * dt;
      a.tkl -= dt;
      if (a.tkl <= 0) { a.tkl = 0; a.p.vx *= 0.3; a.p.vz *= 0.3; this.resolveTackle(a); }
    }
  }

  /** Мить контакту: чи дістала нога м'яч і чи переграв захисник носія. Виграв — чисто забрав або вибив м'яч у боротьбу. */
  resolveTackle(a) {
    const b = this.ball, fy = a.p.yaw, fx = a.p.x + Math.sin(fy) * 0.85, fz = a.p.z + Math.cos(fy) * 0.85;
    const reach = 0.7 + 0.4 * a.sk.tack, near = Math.hypot(b.x - fx, b.z - fz) < reach;
    const vsMine = a.side < 0 && (this.bs === 'ready' || this.bs === 'aim') && this.holder && !(this.holder.isGK && !this.holder.footBall);   // воротар ногою — як польовий
    const vsOpp = a.side > 0 && this.bs === 'held' && this.taker && !(this.taker.isGK && !this.taker.footBall);
    if (!vsMine && !vsOpp) { a.stun = Math.max(a.stun, 0.4); return; }   // м'яч уже пішов — нога в порожнечу
    const h = vsMine ? this.holder : this.taker;
    const chance = vsMine || this.spec.online ? this.tackleChance(a, h) : clamp(0.5 + (a.sk.tack - h.sk.drib) * 0.6, 0.2, 0.92);   // онлайн: обидві сторони за однією формулою
    if (near && Math.random() < chance) {
      if (a.side > 0) this.addXp(a, 25);
      h.stun = Math.max(h.stun, 0.9); h.noTrap = 0.7;
      if (Math.random() < 0.08 + 0.25 * Math.min(1, Math.hypot(a.p.vx, a.p.vz) / 4)) { this.bump(h, a, 0.12); this.game.addTrauma(0.12); this.hitStop = Math.max(this.hitStop, 0.03); }   // зрідка — ще й зачепив ногу (жорсткий контакт)
      else h.p.hit();
      if (Math.random() < 0.3 + 0.4 * a.sk.tack) {                 // чисто: м'яч лишається в ногах захисника
        this.floatAt(a.p.x, a.p.z, vsMine ? 'ВІДІБРАВ!' : 'ПЕРЕХОПИЛИ!', vsMine ? 'warn' : 'good'); audio.pass();
        if (vsMine) { this.cancelAim(); h.p.setThreat(0, 0); h.manual = false; this.trapOpp(a, 0); }
        else { h.manual = false; this.taker = null; h.p.dribble = false; this.placeBallAt(a, true); a.noTrap = 0; this.makeReady(a); a.p.receive(0, 4); }   // receive після makeReady: він скидає режим на idle
      } else {                                                     // вибив: м'яч відскакує вперед-убік — боротьба за нього
        const ang = fy + rand(-0.9, 0.9), sp = rand(5, 9);
        this.looseBall(Math.sin(ang) * sp, Math.cos(ang) * sp);
        a.noTrap = 0.15; audio.thud();
        this.floatAt(a.p.x, a.p.z, 'ВИБИВ!', vsMine ? 'warn' : 'good');
      }
    } else {
      // промах: захисник «провалився» у випаді — відновлюється, носій лишається з м'ячем
      a.stun = 1.0; a.noTrap = 0.9; (a.side > 0 ? this.myTeam : this.oppTeam).missT = this.time;   // партнер не кидається слідом тієї ж миті (lungePause)
      if (Math.random() < 0.25) this.bump(a, h, 0.1); else a.p.hit();
      if (vsMine) { this.floatAt(h.p.x, h.p.z, 'ЗАХИСТИВ М’ЯЧ!', 'good'); audio.pass(); this.addXp(h, 12); }
      else this.floatAt(a.p.x, a.p.z, 'НЕ ДОТЯГНУВСЯ', 'warn');
    }
  }

  /** Чи м'яч зараз справді в цього гравця: holder лишається й після удару чи перехоплення, тому дивимось і на стан м'яча. */
  hasBall(a) { return (a === this.holder && (this.bs === 'ready' || this.bs === 'aim' || this.bs === 'wind')) || (a === this.taker && this.bs === 'held'); }

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
    this.bs = 'roll'; this.owner = 0; this.shotBy = 0; this.shotBounces = 0; this.looseT = 0; this.protectT = 0; this.shotId++;
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
    const saved = a.isGK && this.bs === 'roll' && this.shotBy === -1;   // спіймав удар суперника; свій пас назад — це не сейв
    if (saved) this.creditSave(a);
    const y0 = this.ball.y;                                             // висота до placeBallAt: ground її обнуляє, а від неї залежить прийом (стопа, стегно, груди)
    this.placeBallAt(a, true); audio.pass();
    a.p.setExpr('happy', 0.5);
    if (a.isGK) { this.ball.y = y0; this.gkReceive(a, speed); ground(this.ball); if (saved && !a.footBall) this.floatAt(a.p.x, a.p.z, 'ВРЯТУВАВ!', 'good'); }   // воротар вибирає прийом за справжньою висотою: раніше завжди «кошик»
    this.view.ball.hop = clamp(y0, 0.3, 0.6);
    this.clearReceivers();
    this.makeReady(a);
    if (!a.isGK) a.p.receive(y0, speed);                                // після makeReady: він скидає режим на idle, тож раніше прийом наших гравців не показувався
  }

  makeReady(a, kickoff) {
    this.pendKick = null; this.holdStop = false;
    this.bs = 'ready'; this.owner = 1; this.readyT = 0; this.readyReal = 0; this.shotBy = 0; this.telegraph = false; this.shotWound = false;
    if (this.holder && this.holder !== a) this.holder.manual = false;
    if (this.holder && this.holder !== a) this.holder.p.setThreat(0, 0);
    this.holder = a; a.manual = true;
    if (!a.isGK || kickoff) a.p.setMode('idle');
    this.showCard(a);
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
    const y0 = this.ball.y;                                             // висота до placeBallAt: ground її обнуляє
    this.placeBallAt(a, true);
    if (y0 > 0.3) this.view.ball.hop = Math.min(y0, 0.6);
    if (this.holder) this.holder.manual = false;
    this.bs = 'held'; this.owner = -1; this.taker = a; a.manual = true;
    this.showCard(a);
    this.dribbleT = 0; this.tackleT = 0; this.telegraph = false; this.thinkT = 0.15; this.dribDx = -1; this.dribDz = 0; this.clearReceivers();
    if (!a.isGK) a.p.receive(y0, speed);                                // воротар приймає нижче (gkReceive): поза ногою скидала вже розпочату ловлю руками
    a.p.dribble = !a.isGK;
    this.netCmd = null; this.netAim = null; this.netWaitT = 0; this.netAuto = !!this.link && this.link.newPoss();
    this.ui.hud.warn(this.link ? 'М’ЯЧ У СУПЕРНИКА' : 'КОНТРАТАКА!');
    a.p.setExpr('angry', 1);
    if (a.isGK) { this.ball.y = y0; this.gkReceive(a, speed); ground(this.ball); if (!a.footBall) audio.save(); this.gkHoldT = a.footBall ? 0.3 : 0.7 + Math.random() * 0.4; }   // коротко: прийняв, притиснув — і грає далі
    this.aiming = false; this.hideAim();
  }

  clearReceivers() { for (const a of this.actors) a.receiver = false; this.passTarget = null; this.receiverT = 0; }

  /** Вільна лінія (x1,z1)-(x2,z2), як laneDist у brain.js: хто позаду її початку, не закриває. Нульовий відрізок дає відстань до найближчого (хто тримає адресата). */
  laneClear(x1, z1, x2, z2, list, from) {
    if (x1 === x2 && z1 === z2) { let m = 99; for (let i = from; i < list.length; i++) { const p = list[i].p, d = Math.hypot(p.x - x1, p.z - z1); if (d < m) m = d; } return m; }
    return laneDist(x1, z1, x2, z2, list, from);
  }

  /** Куди летить пас цьому адресатові: тому, хто забігає, на хід; решті майже в ноги. Вибір адресата й сам пас беруть ту саму точку. */
  passAim(q, len, hands, out) {
    const lead = !hands && (q.job === JOB.RUN || q.job === JOB.GO) ? clamp(len / 26, 0.4, 1.1) : 0.35;
    out.x = clamp(q.p.x + q.p.vx * lead, -L + 3, L - 3); out.z = clamp(q.p.z + q.p.vz * lead, -W + 3, W - 3);
    return out;
  }

  /**
   * Вибір паса, як у людини: що дасть передача (наскільки небезпечнішою стане точка), чи встигне хтось на лінію, чи вільний
   * адресат і куди він біжить. Ризик дорожчий у своїй третині й коли ведемо наприкінці, дешевший, коли треба рятувати матч.
   * Партнера за спиною слабкий гравець часто просто не бачить.
   */
  choosePass(a, pm) {
    let best = null, bs = -99, bc = 0;
    const gkTaker = a.isGK, p = a.p, iq = a.sk.iq, br = this.oppTeam.brain, z0 = zoneValue(p.x, p.z, -1), inRange = !gkTaker && p.x + L < 45;
    const yaw = p.bodyYaw ?? p.yaw, fx = Math.sin(yaw), fz = Math.cos(yaw);
    const riskW = (3.1 - br.ment * 1.1) * (p.x > L * 0.35 ? 1.5 : 1);
    for (let i = 1; i < this.opp.length; i++) {
      const q = this.opp[i];
      if (q === a || q.stun > 0 || q.frozen > 0 || q.sliding || q.p.downed) continue;
      const dx = q.p.x - p.x, dz = q.p.z - p.z, len = Math.hypot(dx, dz);
      if (len < 5 || len > 46) continue;
      if (!gkTaker && (dx * fx + dz * fz) / len < -0.2 && pm > 3 && Math.random() > 0.3 + 0.8 * iq) continue;
      // лінія, простір і ризик там, куди полетить м'яч (doPass), а не там, де адресат зараз: забіг за спину захисника видно лише в цій точці
      const run = q.job === JOB.RUN || q.job === JOB.GO, aim = this.passAim(q, len, gkTaker && !a.footBall, _pa), lx = aim.x, lz = aim.z;
      const lane = this.laneClear(p.x, p.z, lx, lz, this.mine, 0);
      if (lane < (gkTaker ? 2.6 : 1.3)) continue;
      const free = this.laneClear(lx, lz, lx, lz, this.mine, 1), open = clamp(free / 6, 0, 1.3);
      // воротар кидає рукою (повільніше за пас ногою): лише тому, хто відкритий (суперник не ближче ~4 м) і недалеко
      if (gkTaker && (free < 4 || len > 32)) continue;
      const risk = passRisk(p.x, p.z, lx, lz, this.mine, clamp(16 + len * 0.9, 22, 46));
      // випередив останню лінію: пас за спину захисту — головне, заради чого біжать у забіг
      const through = run && -lx > br.oppLast - 1 && free > 2.2 ? 1.3 : 0;
      const back = q === this.passFrom && this.time - this.passFromT < 2.5 && pm > 3.5 ? 1.5 : 0;    // не перекидає той самий м'яч туди-сюди, хіба під тиском
      // біля чужих воріт важить не лише зона, а й чи зможе адресат звідти бити: лінія, кут, де стоїть воротар. Так видно відкат на вільного
      const chance = inRange ? shotQuality(lx, lz, -1, this.mine).q * (1 - risk) * 0.85 : 0;
      const score = (zoneValue(lx, lz, -1) - z0) * 13 + open * 1.2 - risk * riskW + through + chance * 2.5 + (q.callT > 0 ? 0.45 : 0) - len * 0.012 - back + (Math.random() - 0.5) * (1 - iq) * 2.6;
      if (score > bs) { bs = score; best = q; bc = chance; }
    }
    if (!best) return null;
    this.passScore = bs; this.passChance = bc;
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

  /**
   * Пас/кидок суперника — як у людини: гравець розвертається до адресата, робить замах (анімація удару чи кидка), і м'яч
   * летить лише в мить контакту (~0.13 с; кидок ~0.18). Раніше м'яч вилітав одразу, а нога ще не рушила — і пас убік
   * виглядав як м'яч, що полетів сам.
   */
  passTo(a, best, long = false) {
    if (this.pendKick) return;
    const hands = a.isGK && !a.footBall && !long, b = this.ball;
    const tx = best.p.x - b.x, tz = best.p.z - b.z, tl = Math.hypot(tx, tz) || 1;
    a.p.dribble = false;
    // адресат збоку чи позаду — гравець не б'є м'яч, що лежить у нього збоку, і не крутиться в ударі на 180°: обходить м'яч,
    // стає за ним на лінії паса, і лише тоді замах (kickApproach). Рукою воротар кидає одразу
    const swing = () => { if (hands) a.p.throwBall(); else a.p.kick(long ? 0.9 : 0.35); };
    this.pendKick = { dx: tx / tl, dz: tz / tl, hands, run: false, w: 0, t: hands ? 0.18 : -1, pw: long ? 0.9 : 0.35, q: long ? null : best, chk: 0.1, swing, fn: () => this.doPass(a, best, long) };
    if (hands) { a.p.yaw = Math.atan2(tx, tz); swing(); }
  }

  /**
   * М'яч ще під ногою, а пас обраний до ~1 с тому: гравець дивиться, чи адресат досі вільний. Лінію закрили або адресат упав — віддає іншому,
   * а нема кому — веде далі. Вікно замаху не починається спочатку. Слабкий помічає не завжди.
   */
  recheckPass(a, k) {
    k.chk = 0.12;
    const q = k.q, b = this.ball;
    if (Math.random() > 0.35 + 0.65 * a.sk.iq) return;
    const aim = this.passAim(q, Math.hypot(q.p.x - b.x, q.p.z - b.z), false, _pa);
    if (!(q.stun > 0 || q.frozen > 0 || q.sliding || q.p.downed) && this.laneClear(b.x, b.z, aim.x, aim.z, this.mine, 0) >= 1.1) return;
    let pm = 99;
    for (let i = 1; i < this.mine.length; i++) { const m = this.mine[i].p, d = Math.hypot(m.x - a.p.x, m.z - a.p.z); if (d < pm) pm = d; }
    const w = k.w, opt = this.choosePass(a, pm);
    if (opt === q) return;
    this.pendKick = null;
    if (opt) { this.passTo(a, opt); this.pendKick.w = w; } else { a.p.dribble = !a.isGK; this.thinkT = 0.1; }
  }

  /** Куди повернути корпус в ударі на бігу: у бік удару, але не далі ~40° від курсу бігу — решту робить стопа (пас щічкою). */
  kickYaw(p, dx, dz) {
    const v = Math.hypot(p.vx, p.vz), k = Math.atan2(dx, dz); if (v < 1.5) return k;
    const run = Math.atan2(p.vx, p.vz); return run + clamp(angDiff(run, k), -0.7, 0.7);
  }

  /** Чи веде наш виконавець м'яч на бігу (польовий, не розведення з центру; воротар — розігрує з місця). */
  carries(a) { return !!a && !a.isGK && !this.kickoff && this.phase === 'play' && !this.holdStop; }

  /**
   * Ведення м'яча нашим виконавцем: біжить курсом бігу (want — куди доводить курс, із кутовою швидкістю turn), швидкість
   * плавно йде до vT (обмежені прискорення в move), м'яч — у ногах попереду, з легким «дихання» дотиків. Біля бортів і
   * воріт курс заходить усередину поля. Повертає курс (кут).
   */
  carry(a, dt, want, turn, vT) {
    const p = a.p, b = this.ball, v = Math.hypot(p.vx, p.vz);
    let cur = v > 0.6 ? Math.atan2(p.vx, p.vz) : (a.carryH ?? p.bodyYaw);
    if (want != null) cur += clamp(angDiff(cur, want), -turn * dt, turn * dt);
    let hx = Math.sin(cur), hz = Math.cos(cur);
    // борт попереду — курс уздовж нього, а не в нього
    const ex = Math.abs(p.x) > L - 5 && Math.sign(hx) === Math.sign(p.x), ez = Math.abs(p.z) > W - 4 && Math.sign(hz) === Math.sign(p.z);
    if (ex || ez) { if (ex) hx *= 0.3; if (ez) hz *= 0.3; const l = Math.hypot(hx, hz) || 1; hx /= l; hz /= l; cur = Math.atan2(hx, hz); }
    a.carryH = cur;
    this.myTeam.avoid(a, this.actors); a.avx *= 0.4; a.avz *= 0.4;
    a.move(p.x + hx * 4, p.z + hz * 4, vT, dt);
    p.yaw = cur;
    // м'яч попереду біля ноги: відстань «дихає» з кроками (дотики), а не приклеєна точка
    const sp = Math.hypot(p.vx, p.vz), lead = 0.62 + 0.12 * Math.min(1, sp / 4) * (1 + Math.sin(this.time * (5 + sp * 1.6)));
    const tx = p.x + hx * lead, tz = p.z + hz * lead, k = Math.min(1, dt * 14);
    b.x += (tx - b.x) * k; b.z += (tz - b.z) * k; b.vx = b.vz = 0; this.glideT = 0;
    if (this.bs === 'aim') this.aimDirty = true;
    return cur;
  }

  /**
   * Підхід до м'яча перед ударом у напрямку (dx, dz): гравець обходить м'яч по дузі (не крізь нього) за точку back позаду
   * на лінії удару, дивлячись на м'яч; вирівнявшись — дивиться в бік удару. run — розбіг: біжить на м'яч, щоб опорна нога
   * стала поруч із ним. Повертає кут від «прямо позаду» (0) і відстань позаду м'яча вздовж лінії удару.
   */
  kickApproach(a, dx, dz, back, sp, dt, run = false, okA = 0.4) {
    const b = this.ball, p = a.p, rx = p.x - b.x, rz = p.z - b.z, r = Math.hypot(rx, rz) || 1e-3;
    const behind = -(rx * dx + rz * dz), ang = Math.acos(clamp(behind / r, -1, 1)), st = (this._kap ??= { ang: 0, behind: 0 });
    let tx, tz;
    if (ang > okA) {                                       // м'яч між ним і лінією удару — обходить по колу навколо м'яча
      const R = clamp(r, 0.95, back + 0.35), cur = Math.atan2(rx, rz), da = angDiff(cur, Math.atan2(-dx, -dz));
      const na = cur + Math.sign(da) * Math.min(Math.abs(da), 1.3);   // ціль на дузі далі — обходить м'яч бігом, а не дрібно
      tx = b.x + Math.sin(na) * R; tz = b.z + Math.cos(na) * R;
    } else if (run) { tx = b.x + rx / r * -1.2; tz = b.z + rz / r * -1.2; }   // розбіг на м'яч з того боку, де стоїть (під кутом теж), без гальмування
    else if (ang < 0.4) { tx = b.x - dx * back; tz = b.z - dz * back; }
    else { tx = p.x; tz = p.z; }                          // уже під прийнятним кутом — не переставляється
    a.avx = a.avz = 0; a.move(tx, tz, sp, dt);
    p.yaw = ang < 0.4 ? Math.atan2(dx, dz) : ang < okA ? Math.atan2(b.x - p.x, b.z - p.z) + angDiff(Math.atan2(b.x - p.x, b.z - p.z), Math.atan2(dx, dz)) * 0.5 : Math.atan2(b.x - p.x, b.z - p.z);
    st.ang = ang; st.behind = behind;
    return st;
  }

  /** Чи можна починати замах: гравець за м'ячем (кут від лінії удару ≤ maxAng), тіло розвернуте, і за ~0.13 с замаху опорна нога стане біля м'яча. */
  kickReady(a, st, dx, dz, maxAng = 0.4) {
    const vA = Math.max(0, a.p.vx * dx + a.p.vz * dz);
    return st.ang < maxAng && st.behind > 0.42 * Math.cos(st.ang) && st.behind - 0.62 <= vA * 0.13 + 0.1 && Math.abs(angDiff(a.p.bodyYaw, Math.atan2(dx, dz))) < 0.7 + maxAng;
  }

  /**
   * Пас чи удар із ведення, без зупинки: гравець біжить за м'ячем і кожним дотиком повертає його до ~55° у бік удару
   * (розворот дугою на бігу, як у людини, а не на місці). Повертає true, коли можна бити: м'яч перед ногою, а корпус
   * відхилений від напрямку удару не більше maxAng.
   */
  dribbleKick(a, dx, dz, dt, maxAng) {
    const b = this.ball, p = a.p, ds = (a.dribSt ??= { t: 0, steps: 0 }), hv = Math.hypot(b.vx, b.vz);
    let ux = dx, uz = dz;
    if (hv > 1) { const cur = Math.atan2(b.vx, b.vz), na = cur + clamp(angDiff(cur, Math.atan2(dx, dz)), -1.25, 1.25); ux = Math.sin(na); uz = Math.cos(na); }
    a.avx = a.avz = 0;
    a.move(b.x + b.vx * 0.2 - ux * 0.55, b.z + b.vz * 0.2 - uz * 0.55, (a.side > 0 ? this.myTeam : this.oppTeam).speed * 0.85 * (0.84 + 0.34 * a.sk.pace), dt);
    if (Math.hypot(p.vx, p.vz) > 0.5) p.yaw = Math.atan2(p.vx, p.vz);
    dribbleStep(ds, p, b, ux, uz, dt); keepBallIn(b);
    // де м'яч буде відносно тіла в мить контакту (через ~0.13 с замаху): нога дістає до ~1 м, і м'яч має бути попереду
    const T = 0.13, rx = b.x + (b.vx - p.vx) * T - p.x, rz = b.z + (b.vz - p.vz) * T - p.z, d = Math.hypot(rx, rz), al = rx * Math.sin(p.bodyYaw) + rz * Math.cos(p.bodyYaw);
    return d < 1.0 && d > 0.35 && al > 0.2 && Math.abs(angDiff(p.bodyYaw, Math.atan2(dx, dz))) < maxAng;
  }

  /** Замах на бігу: м'яч котиться далі (трава гальмує), тіло наздоганяє його так, щоб опорна нога стала поруч, і розвертається в удар. */
  kickFollow(a, dx, dz, dt, rem = 0.13) {
    const b = this.ball, k = Math.exp(-dt * 1.4);
    b.vx *= k; b.vz *= k; b.x += b.vx * dt; b.z += b.vz * dt; keepBallIn(b);
    // швидкість бігу зберігається (не гальмує перед ударом): лише курс трохи доводиться так, щоб опорна нога стала біля м'яча
    // ціль — ~0.6 м до м'яча (де він буде в мить контакту) з того боку, звідки гравець біжить; прискорення — людське (≤ +2 м/с)
    const p = a.p, R = Math.max(0.02, rem), fx = b.x + b.vx * R, fz = b.z + b.vz * R, ox = fx - p.x, oz = fz - p.z, ol = Math.hypot(ox, oz) || 1;
    const tx = ox - (ox / ol) * 0.6, tz = oz - (oz / ol) * 0.6, tl = Math.hypot(tx, tz), v0 = Math.hypot(p.vx, p.vz);
    const vs = (a.kickV ??= v0), v = clamp(tl / R, Math.max(1.5, vs * 0.85), Math.min(9, vs + 1.2));   // від швидкості на початку замаху
    const wx = tl > 0.15 ? (tx / tl) * v : b.vx, wz = tl > 0.15 ? (tz / tl) * v : b.vz, kk = Math.min(1, dt * 16);
    p.vx += (wx - p.vx) * kk; p.vz += (wz - p.vz) * kk; p.x += p.vx * dt; p.z += p.vz * dt;
    p.yaw = this.kickYaw(p, dx, dz);
  }

  doPass(a, best, long) {
    const b = this.ball, hands = a.isGK && !a.footBall && !long;   // кидок рукою (long — воротар вибиває ногою)
    const err = (1 - a.sk.pass) * (hands ? 1.2 : 3.2);                // рукою точніше
    // тому, хто забігає, — на хід, у простір перед ним; решті — майже в ноги
    const aim = this.passAim(best, Math.hypot(best.p.x - b.x, best.p.z - b.z), hands, _pa), lx = aim.x, lz = aim.z;
    const dx = lx - b.x + (Math.random() - 0.5) * err, dz = lz - b.z + (Math.random() - 0.5) * err, d = Math.hypot(dx, dz) || 1;
    // воротар кидає рукою — м'якше, ніж б'є польовий (до ~32 м/с)
    const sp = (hands ? clamp(10 + d * 0.55, 13, 26) * GK_THROW : clamp(16 + d * 0.9, 22, 46)) * (0.92 + 0.16 * a.sk.pass);
    b.vx = (dx / d) * sp; b.vz = (dz / d) * sp;
    a.cool = 0.35; a.noTrap = 1.3; a.manual = false; this.taker = null; this.lastOppTaker = a; a.passT = this.time; this.passFrom = a; this.passFromT = this.time;
    best.receiver = true; this.passTarget = best; this.receiverT = 3.2;
    audio.pass();
    this.bs = 'roll'; this.owner = 0; this.shotBy = -2; this.shotBounces = 0; this.looseT = 0; this.protectT = 0; this.shotId++; this.ui.hud.setCard(null);
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
    let sp = spec.counterSpeed * (a.isGK ? 1.05 : 1) * shotSkill(a.sk.shoot);
    if (!a.isGK) sp = Math.min(PHYS.maxSpeed, Math.max(sp, this.launchFor(d, spec.counterSpeed * 0.6 * (0.85 + 0.3 * a.sk.shoot))));
    // м'яч ще ведеться до самого удару: запам'ятовується ціль, сила й навмисна похибка (одна на удар), а напрям рахується від м'яча (aimCounter)
    this.counterZ = z; this.counterSp = sp;
    this.counterJ = rand(-1, 1) * 2.5 * DEG * (spec.gkErr / 3) * (1.7 - 1.2 * a.sk.shoot);
    this.aimCounter(); this.counterPath();
    this.view.aim.mat.color.setHex(0xe5484d);
  }

  /** Напрям удару ШІ від того місця, де м'яч зараз, у вибрану точку воріт (counterV, ще без навмисної похибки). */
  aimCounter() {
    const b = this.ball, c = this.counterV, dx = -L - 1 - b.x, dz = this.counterZ - b.z, d = Math.hypot(dx, dz) || 1;
    c.vx = (dx / d) * this.counterSp; c.vz = (dz / d) * this.counterSp;
  }

  /** Червоний пунктир удару ШІ: звідки м'яч зараз і куди справді полетить, разом із похибкою. Симуляція дорога, тож не щокадру. */
  counterPath() {
    const b = this.ball, c = this.counterV, cs = Math.cos(this.counterJ), sn = Math.sin(this.counterJ), list = (this._telC ??= []);
    list.length = 0; for (let i = 0; i < this.mine.length; i++) list.push(this.mine[i].body);   // сильний удар проходить крізь його партнерів (updateSolidity): пунктир упирається лише в наших
    this.path.setCircles(list, null);
    this.path.simulate(b.x, b.z, c.vx * cs - c.vz * sn, c.vx * sn + c.vz * cs, 1);
    this.counterPT = 0.07;
  }

  /**
   * Рішення носія раз на ~0.3 с, як у людини: порівнює удар, пас і ведення. Б'є, коли момент справді кращий за передачу, а
   * не тому що близько чи минув час; віддає, коли це дає більше, ніж вести; веде, куди вільно, і під тиском іде від суперника.
   */
  takerThink(a, pm, toGoal) {
    if (this.telegraph) return;
    const br = this.oppTeam.brain, opt = this.choosePass(a, pm), ps = opt ? this.passScore : -99;
    if (!a.isGK && toGoal < 58) {
      const sq = shotQuality(a.p.x, a.p.z, -1, this.mine), v = sq.q * (0.72 + 0.56 * a.sk.shoot) * (1 + br.ment * 0.3);
      // близько — і за відстанню до воріт, і за кутом: від прапорця ворота майже не видно, звідти м'яч іде лише в бічну сітку
      const dG = Math.hypot(toGoal, a.p.z), close = dG < 18 && sq.vis > 0.2 && sq.clear > 0.8, far = dG > 26;
      // сильний момент — б'є; добрий — якщо передача нічого кращого не дає; під пресом біля воріт — хоч як, але б'є (майже без кута — лише коли нема кому віддати)
      // здалеку лише коли передача й справді нічого не дає: дальній удар віддає м'яч воротареві; партнер, що стоїть для удару явно краще, отримує м'яч (відкат)
      if (v > 0.3 || close || (v > 0.15 && ps < (far ? 0.3 : 1.4)) || (toGoal < 30 && pm < 3 && v > 0.06 && (sq.vis > 0.2 || !opt)) || (v > (far ? 0.13 : 0.09) && this.dribbleT > 2.4 && ps < 0.6)) {
        if (opt && a.sk.iq > 0.35 && this.passChance > 0.25 && this.passChance > sq.q * 1.6) this.passTo(a, opt); else this.startShot(a, sq.z);
        return;
      }
    }
    // пас: під тиском охоче, інакше — коли дає помітно більше, ніж вести далі; поріг слабшає, що довше тримає м'яч
    if (opt) {
      // щойно прийняв і ніхто не наступає — спершу підніме голову: пас за пасом без паузи виглядає як настільний футбол
      // перед ним вільно, а суперник збоку чи позаду — веде сам, доки передача не дасть більше: хто вправніше веде, той тримає м'яч довше. Темп гри задає не лише пас
      const room = !a.isGK && pm > 2 && !(toGoal < 16 && Math.abs(a.p.z) > PITCH.BOX_W) ? Math.min(laneDist(a.p.x, a.p.z, a.p.x - 12, a.p.z * 0.9, this.mine, 1), 6) / 6 : 0;
      const settle = !a.isGK && this.dribbleT < 0.55 + room * 0.35 && pm > 3.2;
      const need = a.isGK ? -9 : pm < 2.8 ? -1.2 + room * (0.6 + a.sk.drib * 1.2) : pm < 4.5 ? 0.15 + room * 0.8 : Math.max(0.5, 2 + room * 0.9 - this.dribbleT * 0.45 + (br.counter ? -0.5 : 0));
      if (!settle && ps > need) { this.passTo(a, opt); return; }
    }
    // воротарю нема кому кинути: ще трохи чекає (партнери відкриваються), потім вибиває ногою далеко — своєму, найдальшому
    // вільному; і лише якщо зовсім нікого — просто подалі в поле
    if (a.isGK && this.dribbleT > 2.2) { const q = this.longTarget(a); if (q) this.passTo(a, q, true); else this.startShot(a, rand(-G + 1, G - 1)); return; }
    // ведення: куди саме, вирішує pickCarry
    if (!a.isGK) { const cr = pickCarry(a, -1, this.mine, pm, this.dribDx, this.dribDz); this.dribDx = cr.dx; this.dribDz = cr.dz; }
    // загрався: віддає будь-кому, хто не під ударом, а біля чужих воріт б'є; на своїй половині навмання не б'є ніколи
    if (this.dribbleT > 5.5) { if (opt) this.passTo(a, opt); else if (toGoal < 40) { const sq = shotQuality(a.p.x, a.p.z, -1, this.mine); this.startShot(a, sq.z); } }
  }

  /** Володіння суперника: ведення, спроба відбору нашими, пас або удар. */
  updateTaker(dt) {
    const a = this.taker, b = this.ball;
    if (this.pendKick) {
      const k = this.pendKick;
      if (k.t < 0) {
        // не зупиняється обходити м'яч: веде далі й дотиками розвертає м'яч у бік паса, а б'є, щойно м'яч перед ногою, а
        // корпус повернутий достатньо (пас — внутрішньою стороною стопи, до ~85° від бігу; довгий — до ~45°)
        k.w += dt;
        if (k.q && (k.chk -= dt) <= 0) { this.recheckPass(a, k); if (this.pendKick !== k) return; }
        if (this.dribbleKick(a, k.dx, k.dz, dt, k.pw > 0.6 ? 0.8 : 1.75) || k.w > 1.1) { a.p.yaw = Math.atan2(k.dx, k.dz); k.swing(); k.t = 0.13; a.kickV = null; }
        else this.matesTackle(a, dt);                                // поки ще веде м'яч під пас, його можна встигнути відібратиться
      } else {                                                       // замах на бігу: м'яч котиться до ноги, тіло його наздоганяє
        k.t -= dt;
        if (!k.hands) this.kickFollow(a, k.dx, k.dz, dt, k.t); else { a.p.vx *= 0.85; a.p.vz *= 0.85; }
        if (k.t <= 0) { this.pendKick = null; k.fn(); }
      }
      return;
    }
    const rc = this.remoteCtl();                                   // онлайн: цим гравцем керує гість — ШІ лише веде й тримає м'яч
    if (!rc && this.netAim) { this.netAim = null; if (a.p.mode === 'aim') a.p.setMode('idle'); }   // гість зник чи здався ШІ — приціл не тримає гравця в позі
    if (rc && this.netCmd && this.remoteWaiting()) { const c = this.netCmd; this.netCmd = null; this.remoteKick(a, c); return; }
    if (this.kickoff) {                                            // розведення суперника: мить постоїть у центрі, потім гра пішла
      this.kickT = (this.kickT || 0) + dt;
      if (rc) { a.p.vx = a.p.vz = 0; this.remoteAimPose(a); return; }   // гість розводить сам
      // розведення як у футболі: перший пас своєму — назад або вбік (на свою половину), а не біг із м'ячем уперед
      let q = this.koQ, bs = -1e9;
      if (!q) for (let i = 1; i < this.opp.length; i++) {
        const m = this.opp[i]; if (m === a) continue;
        const dx = m.p.x - a.p.x, dz = m.p.z - a.p.z, d = Math.hypot(dx, dz);
        if (d < 5 || d > 26 || dx < -2) continue;                      // не вперед (суперник атакує в бік −x)
        const sc = -Math.abs(d - 11) * 0.3 + this.laneClear(a.p.x, a.p.z, m.p.x, m.p.z, this.mine, 0) * 0.5 + Math.random();
        if (sc > bs) { bs = sc; q = m; }
      }
      this.koQ = q;
      if (!q) { a.p.vx = a.p.vz = 0; if (this.kickT < 1.0) return; this.kickoff = false; }
      else {
        // поки гра стоїть, обходить м'яч і стає за ним на лінії паса: раніше годинник уже йшов, а він ще до ~1.1 с вів м'яч, щоб розвернутись
        a.p.dribble = false;
        const ux = q.p.x - b.x, uz = q.p.z - b.z, ul = Math.hypot(ux, uz) || 1, st = this.kickApproach(a, ux / ul, uz / ul, 0.95, 3.5, dt, this.koRun);
        if (this.kickT >= 1.0 && st.ang < 0.4 && st.behind > 0.6) this.koRun = true;
        const ready = this.kickReady(a, st, ux / ul, uz / ul);
        if (this.kickT < 1.0 || (this.kickT < 2.0 && !ready)) return;
        this.kickoff = false; this.passTo(a, q);
        const k = this.pendKick; if (k && ready) { a.p.yaw = Math.atan2(k.dx, k.dz); k.swing(); k.t = 0.13; a.kickV = null; }   // не встиг обійти м'яч: розверне його дотиками (гілка k.t < 0), а не б'є спиною до адресата
        return;
      }
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
    if (this.thinkT <= 0 && !rc) { this.thinkT = 0.5 - 0.3 * a.sk.iq; this.takerThink(a, pm, toGoal); if (this.bs !== 'held') return; }
    if (!a.isGK && this.telegraph) {
      // удар: веде м'яч далі, дотиком накочує його собі під удар і б'є з ходу — без зупинки
      this.aimCounter();
      const c = this.counterV, cl = Math.hypot(c.vx, c.vz) || 1, ux = c.vx / cl, uz = c.vz / cl;
      if (!this.shotWound) {
        const ready = this.dribbleKick(a, ux, uz, dt, 0.75);
        if ((this.shootT <= 0.13 && ready) || this.shootT <= -1.0) {
          this.shotWound = true; this.shotWT = 0.13; a.p.yaw = Math.atan2(ux, uz); a.p.dribble = false; a.p.kick(0.9); a.kickV = null;
        }
      } else this.kickFollow(a, ux, uz, dt, this.shotWT);
    } else if (!a.isGK && rc) {
      this.remoteHold(a, dt);
    } else if (!a.isGK) {
      // ведення дотиками (dribble.js): бажаний напрямок — до мети; гравець біжить до точки трохи позаду м'яча на цьому
      // напрямку (наздоганяє його), а дотиком ноги скеровує м'яч. Поворот — ногою: м'яч котиться старим курсом, доки
      // гравець не підбʼє його в новий бік
      let dx = this.dribDx, dz = this.dribDz;
      const nearX = a.p.x < -L + 7 && dx < 0;                         // біля лінії воріт і борту не впирається в них
      if (nearX || (a.p.x > L - 7 && dx > 0)) dx = 0;
      if (Math.abs(a.p.z) > W - 3 && dz * a.p.z > 0) dz = 0;
      const dl = Math.hypot(dx, dz);
      if (dl > 0.01) { dx /= dl; dz /= dl; }
      else if (nearX) { const tx = -L + 12 - a.p.x, tz = -a.p.z, tl = Math.hypot(tx, tz) || 1; dx = tx / tl; dz = tz / tl; }   // уперся в кут біля чужих воріт — у поле, а не назад у лінію
      else { dx = -1; dz = 0; }                                      // уперся в борт — уздовж нього в бік атаки
      const ds = (a.dribSt ??= { t: 0, steps: 0 });
      if (this.dribbleT < 0.05) { ds.t = 0; b.vx = a.p.vx; b.vz = a.p.vz; }
      this.oppTeam.avoid(a, this.actors);
      const tempo = pm < 4 ? 1.0 : this.oppTeam.brain.ment < -0.4 && pm > 9 ? 0.68 : 0.9;       // ведуть наприкінці й ніхто не тисне — не поспішає
      // нижче 30 кадрів/с — підкроками: на великому dt гравець і м'яч розгойдуються, м'яч тікає й телепортується до ноги
      const subs = dt > 1 / 29 ? Math.ceil(dt * 30) : 1, sdt = dt / subs;
      for (let i = 0; i < subs; i++) {
        a.move(b.x + b.vx * 0.2 - dx * 0.55, b.z + b.vz * 0.2 - dz * 0.55, this.oppTeam.speed * tempo * (0.84 + 0.34 * a.sk.pace), sdt);
        dribbleStep(ds, a.p, b, dx, dz, sdt); keepBallIn(b);
      }
      if (Math.hypot(a.p.vx, a.p.vz) > 0.5) a.p.yaw = Math.atan2(a.p.vx, a.p.vz);
    } else {
      a.p.vx = a.p.vz = 0; if (!a.dive) a.p.yaw = -Math.PI / 2;
      const kf = Math.min(1, dt * 22); b.x += (a.p.x - 1.15 - b.x) * kf; b.z += (a.p.z - b.z) * kf; b.vx = b.vz = 0;
      if (rc) this.remoteAimPose(a);
    }
    this.glideT = 0;
    this.matesTackle(a, dt);
    if (this.telegraph) {
      this.shootT -= dt;
      if ((this.counterPT -= dt) <= 0) this.counterPath();
      this.view.aim.draw(this.path, 1.1, 1.3, this.time * 3);
      // замах починається за ~0.13 с до удару: гравець розвертається до воріт, і м'яч летить у мить контакту ноги
      if (a.isGK && this.shootT <= 0.13 && !this.shotWound) { this.shotWound = true; this.shotWT = 0.13; a.p.yaw = Math.atan2(this.counterV.vx, this.counterV.vz); a.p.dribble = false; a.p.throwBall(); }
      // м'яч летить у мить контакту ноги — через ~0.13 с після початку замаху (польовий б'є, коли підійшов, див. вище)
      if (this.shotWound && (this.shotWT -= dt) <= 0) this.releaseCounter();
    }
  }

  /** Наші захисники: стоять у стійці перед дриблером і в слушну мить роблять випад (результат — у resolveTackle). Воротар у руках — поза грою. */
  matesTackle(a, dt) {
    if (a.isGK && !a.footBall) return;
    const b = this.ball;
    for (let i = 1; i < this.mine.length; i++) if (this.mine[i].tkl > 0) return;
    if (this.lungePause(this.myTeam)) return;
    for (let i = 1; i < this.mine.length; i++) {
      const m = this.mine[i];
      if (m.manual || m.frozen > 0 || m.stun > 0 || m.noTrap > 0 || m.sliding) { m.nearT = 0; continue; }
      const db = Math.hypot(m.p.x - b.x, m.p.z - b.z);
      if (this.tackleReady(m, db, this.tacklePatience(m, this.myTeam, db), dt)) { this.startTackle(m); break; }
    }
  }

  releaseCounter() {
    const b = this.ball, a = this.taker, c = this.counterV;
    this.aimCounter();                                                  // за час замаху м'яч ще зсунувся: б'є туди, куди цілився, а не паралельно старій лінії
    const j = this.counterJ, cs = Math.cos(j), sn = Math.sin(j);
    b.vx = c.vx * cs - c.vz * sn; b.vz = c.vx * sn + c.vz * cs;
    a.p.dribble = false; if (!this.shotWound) { if (a.isGK) a.p.throwBall(); else a.p.kick(0.9); }
    this.shotWound = false;
    a.cool = 0.35; a.noTrap = 1.3; a.manual = false; this.taker = null; this.lastOppTaker = a;
    audio.kick(0.8);
    this.bs = 'roll'; this.owner = 0; this.shotBy = -1; this.shotBounces = 0; this.looseT = 0; this.protectT = 0; this.shotId++; this.ui.hud.setCard(null);
    this.hideAim(); this.ui.hud.warn(null);
  }

  // ------------------------------------------------------------------ онлайн: гравець гостя
  /** Чи керує зараз м'ячем гість онлайн-матчу (його гравець із м'ячем, ще не б'є). Гість не на зв'язку або 14 с без удару — ШІ. */
  remoteCtl() { return !!this.link && this.link.net.open && !this.netAuto && this.phase === 'play' && this.bs === 'held' && !!this.taker && !this.pendKick && !this.telegraph; }
  /** Воротар гостя тримає м'яч, поки наші не відійшли (як і наш) — бити ще не можна. */
  gkHoldNow() { const a = this.taker; return !!a && a.isGK && (this.gkHoldT > 0 || (!a.footBall && !this.gkClear && this.gkHoldT > -0.8)); }
  remoteWaiting() { return this.remoteCtl() && !this.gkHoldNow(); }

  /** Гість цілиться: його гравець розвертається в бік удару й заносить ногу (поза прицілу), як наш. */
  remoteAimPose(a) {
    const ai = this.netAim, p = a.p;
    if (ai) { if (!a.isGK || a.footBall) p.setMode('aim'); p.power = ai.pw; if (a.isGK && !a.footBall) p.yaw = Math.atan2(ai.dx, ai.dz); }
    else if (p.mode === 'aim') p.setMode('idle');
  }

  /** Гість думає над ударом: гравець гальмує з м'ячем у ногах; цілиться — обходить м'яч і стає на лінію удару. */
  remoteHold(a, dt) {
    const p = a.p, b = this.ball, ai = this.netAim;
    p.dribble = false;
    if (ai) { this.kickApproach(a, ai.dx, ai.dz, 1.0 + 0.5 * ai.pw, 3.2, dt, false, ai.pw < 0.45 ? 1.25 : 0.65); this.remoteAimPose(a); b.vx = b.vz = 0; return; }
    this.remoteAimPose(a);
    const k = Math.exp(-dt * 3.2); p.vx *= k; p.vz *= k; p.x += p.vx * dt; p.z += p.vz * dt;
    const sp = Math.hypot(p.vx, p.vz);
    if (sp > 0.3) {                                                  // ще котиться з розгону — м'яч попереду біля ноги
      const hd = Math.atan2(p.vx, p.vz), kf = Math.min(1, dt * 14); p.yaw = hd;
      b.x += (p.x + Math.sin(hd) * 0.62 - b.x) * kf; b.z += (p.z + Math.cos(hd) * 0.62 - b.z) * kf;
    } else p.yaw = Math.atan2(b.x - p.x, b.z - p.z);
    b.vx = b.vz = 0;
  }

  /** Команда гостя: удар чи пас у напрямку (dx, dz) із силою pw — та сама формула, що й для нашого удару. */
  remoteKick(a, c) {
    const hands = a.isGK && !a.footBall, l = Math.hypot(c.dx, c.dz) || 1, dx = c.dx / l, dz = c.dz / l, pw = clamp(c.pw, 0, 1);
    const speed = hands ? (9 + 17 * pw) * GK_THROW : Math.min(PHYS.maxSpeed, PHYS.baseShot * (0.28 + 0.72 * pw) * (pw >= 0.45 ? shotSkill(a.sk.shoot) : 1));
    this.kickoff = false; this.netAim = null; this.netWaitT = 0;
    a.p.dribble = false; if (a.p.mode === 'aim') a.p.setMode('idle');
    const swing = () => { if (hands) a.p.throwBall(); else a.p.kick(pw); };
    this.pendKick = { dx, dz, hands, run: false, w: 0, t: hands ? 0.18 : -1, pw: Math.max(0.35, pw), q: null, chk: 0, swing, fn: () => this.remoteRelease(a, dx * speed, dz * speed, pw) };
    if (hands) { a.p.yaw = Math.atan2(dx, dz); swing(); }
  }

  remoteRelease(a, vx, vz, pw) {
    const b = this.ball, j = rand(-1, 1) * this.kickErr(pw >= 0.45 ? a.sk.shoot : a.sk.pass), cs = Math.cos(j), sn = Math.sin(j);
    b.vx = vx * cs - vz * sn; b.vz = vx * sn + vz * cs; ground(b);
    a.p.dribble = false; a.cool = 0.35; a.noTrap = 1.4; a.manual = false; this.taker = null; this.lastOppTaker = a;
    audio.kick(pw);
    this.bs = 'roll'; this.owner = 0; this.shotBounces = 0; this.looseT = 0; this.protectT = 2.2; this.shotId++; this.kickoff = false;
    this.ui.hud.setCard(null); this.ui.hud.warn(null); this.hideAim();
    // у створ наших воріт — це удар (наш воротар реагує); інакше пас: свій найкращий на лінії м'яча біжить приймати
    const v = Math.hypot(b.vx, b.vz) || 1, ux = b.vx / v, uz = b.vz / v, zAt = ux < -0.05 ? b.z + uz * (-L - b.x) / ux : 99;
    const onT = (ux < -0.05 && Math.abs(zAt) < G + 1.2 && b.x + L < 60) || (pw >= 0.45 && !a.isGK && this.ricochetGoal(-1, b.vx, b.vz, this.st.bounces));
    this.shotBy = onT ? -1 : -2;
    if (!onT) this.pickOppReceiver(a); else this.clearReceivers();
    for (let i = 0; i < this.actors.length; i++) { const q = this.actors[i]; if (q !== a && Math.hypot(q.p.x - b.x, q.p.z - b.z) < 1.9) { q.ghostBall = 0.22; q.body.on = false; } }
    this.view.particles.burst(b.x, 0.3, b.z, 6, 3 + pw * 4, 0.45, 0.24, ['#8fb98a', '#f2f5ee'], 8, 0.5);
  }

  /** Пас гостя: приймач — партнер, що найкраще стоїть на лінії м'яча й встигає до неї (дзеркально до pickMyReceiver). */
  pickOppReceiver(h) {
    const b = this.ball, v = Math.hypot(b.vx, b.vz) || 1, ux = b.vx / v, uz = b.vz / v;
    this.clearReceivers();
    let best = null, bs = 1e9;
    for (let i = 1; i < this.opp.length; i++) {
      const q = this.opp[i]; if (q === h || q.stun > 0 || q.frozen > 0 || q.p.downed) continue;
      const rx = q.p.x - b.x, rz = q.p.z - b.z, along = rx * ux + rz * uz, perp = Math.abs(rx * uz - rz * ux);
      if (along < 3) continue;
      const tBall = (along / v) * 1.4 + 0.15;
      if (perp >= 1.2 + 7.5 * tBall * (0.84 + 0.34 * q.sk.pace)) continue;
      const sc = perp * 1.6 + along * 0.08;
      if (sc < bs) { bs = sc; best = q; }
    }
    if (best) { best.receiver = true; this.passTarget = best; this.receiverT = 3; }
  }

  /**
   * Удар у створ (м'яч іде в ворота суперника, прямо чи рикошетом від бортів) — свої його пропускають, щоб не заблокувати. Будь-який інший удар — це пас:
   * партнер, що найкраще стоїть на лінії м'яча й встигає до неї, стає приймачем — біжить на перехоплення й гасить навіть
   * сильний м'яч (до ~30–40 м/с за «Веденням»), а інші свої на шляху теж не пропускають його повз себе.
   */
  /** Чи заходить удар у ворота суперника (side — хто б'є) після відскоків: той самий прогноз, що й приціл; гравців не рахує, як і прямий удар. */
  ricochetGoal(side, vx, vz, bounces) {
    const pa = this.path, b = this.ball, np = this.world.netPush;
    pa.nc = 0; pa.simulate(b.x, b.z, vx, vz, bounces); this.world.netPush = np;   // прогноз не прогинає справжню сітку
    return pa.goal && pa.x[pa.n - 1] * side > 0;
  }

  pickMyReceiver(h) {
    const b = this.ball, v = Math.hypot(b.vx, b.vz) || 1, ux = b.vx / v, uz = b.vz / v;
    this.clearReceivers();
    const zAt = ux > 0.05 ? b.z + uz * (L - b.x) / ux : 99;
    this.shotOnTarget = ux > 0.05 && Math.abs(zAt) < G + 1.2 && (L - b.x) < 60; this.shotGz = zAt;
    if (!this.shotOnTarget && this.shot.power >= 0.45 && !(h.isGK && !h.footBall) && this.ricochetGoal(1, b.vx, b.vz, this.st.bounces)) { this.shotOnTarget = true; this.shotGz = this.path.z[this.path.n - 1]; }
    if (this.shotOnTarget) return;
    let best = null, bs = 1e9;
    for (let i = 1; i < this.mine.length; i++) {
      const q = this.mine[i]; if (q === h || q.stun > 0 || q.frozen > 0 || q.p.downed) continue;
      const rx = q.p.x - b.x, rz = q.p.z - b.z, along = rx * ux + rz * uz, perp = Math.abs(rx * uz - rz * ux);
      if (along < 3) continue;
      // м'яч долітає до точки навпроти партнера за ~along/v·1.4 с (з гальмуванням); партнер має встигнути збоку
      const tBall = (along / v) * 1.4 + 0.15, can = perp < 1.2 + 7.5 * tBall * (0.84 + 0.34 * q.sk.pace);
      if (!can) continue;
      const sc = perp * 1.6 + along * 0.08 - (q.callT > 0 ? 1.2 : 0);   // хто підняв руку, той чекає м'яч першим
      if (sc < bs) { bs = sc; best = q; }
    }
    if (best) { best.receiver = true; this.passTarget = best; this.receiverT = 3; }
  }

  launchShot() {
    const b = this.ball, sh = this.shot, h = this.holder;
    const j = rand(-1, 1) * this.kickErr(sh.power >= 0.45 ? h.sk.shoot : h.sk.pass), cs = Math.cos(j), sn = Math.sin(j);
    b.vx = sh.vx * cs - sh.vz * sn; b.vz = sh.vx * sn + sh.vz * cs; ground(b);
    this.bs = 'roll'; this.owner = 0; this.shotBy = 1; this.shotBounces = 0; this.looseT = 0; this.ts = 1; this.shotId++; this.kickoff = false; this.ui.hud.setCard(null);
    this.glideT = 0;                                   // м'яч, що ще докочувався до ніг, більше не гальмується
    h.cool = 0.35; h.noTrap = 1.4; h.manual = false; this.protectT = 2.2; if (sh.power < 0.45) h.passT = this.time;
    h.p.setThreat(0, 0); this.shooter = h;
    this.pickMyReceiver(h);
    if (this.shotOnTarget && !h.isGK) {                // удар у створ — суперники запам'ятовують, куди й звідки ми б'ємо
      this.scoutLog.shots.push({ gz: this.shotGz, bz: b.z, dist: L - b.x });
    }
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
    this.ui.hud.cine(true);
    this.hideAim(); this.ui.hud.warn(null); this.ui.hud.setCard(null);
    if (this.holder) this.holder.manual = false;
    if (this.taker) { this.taker.manual = false; this.taker = null; }
    const gx = side * (L + 1);
    const sc = mine ? (this.shooter || this.mine[1]) : (this.lastOppTaker || this.opp[1]);
    // автор лише в того, чия команда справді била (суперник: удар −1, пас −2). Інакше автогол: гол є, автора й досвіду немає
    const byTeam = mine ? this.shotBy === 1 : this.shotBy < 0;
    let gt;
    if (mine) {
      this.score.me++; this.stats.goals++;
      const bn = this.shotBounces, mult = bn >= 2 ? Math.min(4, 1 + 0.5 * (bn - 1)) : 1;
      this.stats.combo = Math.max(this.stats.combo, mult);
      const c = Math.round(50 * spec.scale * mult);
      this.coins += c; this.ui.hud.setCoins(this.coins);
      const si = byTeam ? this.mine.indexOf(this.shooter) : -1;
      if (si >= 0) { this.addXp(this.shooter, 60 + (bn >= 2 ? 20 : 0)); this.goalsBy[si]++; }
      gt = ['ГОЛ!', spec.online ? (bn >= 2 ? 'РИКОШЕТ ×' + mult : 'у сітці!') : (bn >= 2 ? 'РИКОШЕТ ×' + mult + ' · ' : '') + '+' + c, 'me'];
      v.stands.react('goal', { mine: true });
      for (let i = 0; i < this.opp.length; i++) this.opp[i].p.sad(5);
      v.particles.burst(gx, 1.4, 0, 60, 11, 1.8, 0.4, ['#b3162a', '#117a4a', '#f1efe8', '#e8b923'], 12, 1.0);
      audio.goal(); this.game.addTrauma(0.6); this.game.fovKick(4); vibrate([30, 40, 60]);
      this.ui.flash('rgba(255,255,255,.4)');
    } else {
      this.score.opp++;
      gt = ['ПРОПУСТИЛИ', spec.online ? 'суперник забив' : 'контратака спрацювала', 'opp']; v.stands.react('goal', { mine: false });
      for (let i = 0; i < this.mine.length; i++) this.mine[i].p.sad(5);
      v.particles.burst(gx, 1.4, 0, 24, 8, 1.4, 0.35, ['#9ca3af', '#4b5563', '#f1efe8'], 12, 1.0);
      audio.concede(); this.game.addTrauma(0.4); vibrate(80);
    }
    // важливість гола: від неї — святкування, розпач суперника, трибуни, салют і підпис
    const { I, tag } = this.goalImportance(mine);
    this.setupCelebration(mine, sc, side, I);
    this.ui.hud.goal(gt[0], tag ? tag + ' · ' + gt[1] : gt[1], gt[2]);
    if (I > 0.55) { v.stands.react('goal', { mine, dur: 3.8 + 3 * I }); audio.crowd(1); this.walk.fireworks(3 + Math.round(4 * I)); this.game.addTrauma(0.25 * I); }
    this.periodGoals++;
    const scName = !byTeam ? 'Автогол' : sc && sc.info ? String(sc.info.name).split(' ').slice(-1)[0] : (mine ? (spec.home ? spec.home.name : 'Локомотив') : spec.club.name);
    this.scorers.push({ mine, name: scName, min: this.minuteLabel() });
    this.ui.hud.scored({ mine, name: scName, min: this.minuteLabel() });
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
    if (this.periodEnd && this.overMin() >= this.addMin) { this.game.sm.go('MATCH', { resume: true }); this.whistlePeriod(); this.pendingPause(); return; }   // гол у доданий час, що вже вийшов — свисток після повтору
    this.formation(this.nextKick || 1);
    this.game.sm.go('MATCH', { resume: true });
    this.pendingPause();
  }
  /** Вікно втратило фокус під час святкування (ui.pause): пауза стає тут, коли кат-сцена гола вже закінчилась. */
  pendingPause() { if (this.pauseWanted) { this.pauseWanted = false; this.ui.pause(); } }

  // ------------------------------------------------------------------ головний цикл
  update(rawDt) {
    if (this.phase === 'pens') { const pd = this.pens.update(rawDt); this.syncView(pd); this.pens.post(); return; }
    if (this.phase === 'paused') { if (!this.rp) this.syncView(0); return; }   // у повторі кадр уже виставив applyClip: живі пози його не перезаписують
    if (this.phase === 'break') { this.updateBreak(rawDt); return; }
    if (this.hitStop > 0) { this.hitStop -= rawDt; this.syncView(0); return; }
    this.updateSlow(rawDt);
    const k = this.slow ? this.slowTarget : 1;
    this.ts += (k - this.ts) * Math.min(1, rawDt * (this.slow ? 14 : 20));
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
      // фінальний свисток: гра зупинилась (жодного ШІ, м'яч не грає) — переможці біжать обіймати свого воротаря й радіють,
      // ті, що програли, зупиняються й сумують. Через ~4 с — екран результату
      // далі пари гравців двох команд сходяться й тиснуть руки; камера — крупно на рукостисканнях, потім загальний план
      this.endT += rawDt; this.endCelebrate(rawDt); if (this.endT > 1.0) this.endShake(rawDt); this.endTalk(rawDt); this.syncView(rawDt);
      if (this.endT > END_T && !this.resultSent) { this.resultSent = true; this.ui.hud.cine(false); this.game.sm.go('RESULT', this.result); }
      return;
    }
    if (this.phase === 'play') {
      // годинник іде в темпі гри (у сповільненні теж повільніший) і стоїть, доки м'яч не розвели з центру
      const held = this.kickoff;
      if (!held) this.clock -= dt;
      const bound = this.periodBound(), gm = this.gameMin();
      // за хвилину до кінця тайму резервний суддя піднімає табличку з доданим часом
      if (!this.addShown && this.clock <= bound + gm) { this.addShown = true; this.addMin = this.stoppage(); this.ui.hud.addedTime(this.addMin); }
      if (this.clock <= bound && !this.periodEnd) { this.periodEnd = true; if (this.period === 4) this.timeUp = true; }
      this.setClockHud(held);                                       // щокадру: секунди біжать рівно, без стрибків по 7 с
      // доданий час вийшов — суддя чекає спокійної миті: не свистить посеред атаки чи коли м'яч летить у ворота.
      // Якщо атака затяглася на ~1.5 хв понад додане — свисток, щойно м'яч не в польоті; за 3 хв — будь-як
      if (this.periodEnd) {
        const over = this.overMin();
        if (over >= this.addMin && (this.calmBall() || (over >= this.addMin + 1.5 && !this.ballFlying()) || over >= this.addMin + 3)) { this.cancelAim(); this.whistlePeriod(); return; }
      }
    }
    this.tick(dt, rawDt);
  }

  /** Перерва між таймами: свисток, табличка, розстановка з центру; годинник — рівно на межі тайму. */
  nextPeriod() {
    const n = this.period;
    this.period++; this.periodEnd = false; this.periodGoals = 0; this.addShown = false; this.addMin = 0;
    this.clock = this.spec.time * (1 - n / 4);
    audio.whistle(true);
    this.ui.hud.addedTime(null); this.clearSlow();
    this.ui.hud.scoreCard({ title: 'Кінець ' + n + '-го тайму', me: this.score.me, opp: this.score.opp, scorers: this.scorers, note: n === 2 ? 'Перерва · далі 3-й тайм' : 'Далі ' + (n + 1) + '-й тайм' }, 3.4);
    this.startBreak(n);
    this.setClockHud();
  }

  timeOver() {
    if (this.phase === 'pens') return;
    if (this.score.me === this.score.opp && !this.penRes && !this.spec.online) {   // онлайн: нічия — це нічия
      audio.whistle(true);
      this.ui.hud.scoreCard({ title: 'Кінець основного часу', me: this.score.me, opp: this.score.opp, scorers: this.scorers, note: 'Нічия · серія пенальті' }, 3);
      this.clearSlow(); this.pens = new Penalties(this); this.pens.start();
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
    // до старту обидві колони вже стоять у тунелі; рушають плавно — за секунду набирають крок
    if (t < A_END) return [0, 0];
    if (t < E_END) { const u = t - A_END; return u < 1 ? [WALK_V * u * u / 2, WALK_V * u] : [WALK_V * (u - 0.5), WALK_V]; }
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
    if (s < S1) { out.x = cx; out.z = tz + s; out.vx = 0; out.vz = v; }                   // s < 0 — ще в тунелі, у черзі
    else if (s < S1 + A) {                                                                    // дуга: центр (cx + dir·R, lz − R)
      const th = (s - S1) / R, sn = Math.sin(th), cs = Math.cos(th);
      out.x = cx + dir * R * (1 - cs); out.z = lz - R + R * sn; out.vx = dir * sn * v; out.vz = cs * v;
    } else { out.x = cx + dir * (R + (s - S1 - A)); out.z = lz; out.vx = dir * v; out.vz = 0; }
    out.yaw = Math.atan2(out.vx || (s >= S1 ? dir : 0), out.vz || (s < S1 ? 1 : 0));
    out.done = v < 0.12 && d > Lt;                                                            // майже зупинився — розвертається до трибуни
    out.hidden = false;                                                                       // у тунелі видно — вони там стоять із самого початку
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
          // у черзі в тунелі стоять на місці («дихання» дистанції — лише на ходу, вмикається разом із кроком)
          const ph = jr * 20 + ti * 3, go = clamp(lsp / WALK_V, 0, 1), wob = go * (0.18 * Math.sin(t * 0.55 + ph) + 0.08 * Math.sin(t * 1.3 + ph * 1.9));
          this.procAt(sd, lx, lead - (10 - i) * COL_GAP - 0.25 * jr + wob, lsp + go * (0.18 * 0.55 * Math.cos(t * 0.55 + ph) + 0.08 * 1.3 * Math.cos(t * 1.3 + ph * 1.9)), R);
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
          if (t < E_END + 1.5 && a._ix !== undefined && Math.hypot(x - a._ix, z - a._iz) < 1.2) { const kk = Math.min(1, dt * 5); x = a._ix + (x - a._ix) * kk; z = a._iz + (z - a._iz) * kk; }   // далі — склейка (пропуск), без ковзання
          if (t >= E_END) yaw = 0.2 * (jr - 0.5);                         // у шерензі — обличчям до трибуни, не крутиться
        }
        const px = a._ix === undefined ? x : a._ix, pz = a._iz === undefined ? z : a._iz;
        // склейка: початок інтро (корпус ще з минулої сцени — напр. після матчу заходив у тунель обличчям усередину) чи
        // пропуск фрагмента (процесія «перескочила»). Тоді гравець одразу стоїть обличчям за маршрутом — інакше перші
        // кроки з тунелю йшов спиною, поки ноги переступали на 180°
        const cut = a._ix === undefined || Math.hypot(x - px, z - pz) > 1.2;
        a._ix = x; a._iz = z;
        // швидкість: на маршруті процесії — справжня (стрибки на монтажних склейках її не смикають), інакше — з переміщення
        if (vx === null) { vx = dt > 0 ? (x - px) / dt : 0; vz = dt > 0 ? (z - pz) / dt : 0; if (Math.hypot(vx, vz) > 12) vx = vz = 0; }
        a.place(x, z); a.p.vx = vx; a.p.vz = vz; a.sync();
        const sp = Math.hypot(vx, vz);
        if (yaw === null) yaw = sp > 0.6 ? Math.atan2(vx, vz) : 0.24 * (jr - 0.5);
        if (cut) a.p.faceNow(yaw); else a.p.yaw = yaw;
      });
    });
    if (t >= E_END && dt > 0) this.introSeparate();
    if (t >= HS_T) this.crowdBox();
    // церемонія: великий прапор, прапороносці попереду колон (після шикування стоять з краю, потім ідуть до тунелю)
    if (dt > 0) {
      const tz = v.tunnel.userData.startZ;
      const poleAt = (k, out) => {
        const sd = k ? 1 : -1, sx = sd * 19.6; out.hidden = false;
        if (t < E_END) this.procAt(sd, sx, lead + 2.5, lsp, out);
        else if (t < HS_T + 0.5) { out.x = sx; out.z = LZ; out.vx = out.vz = 0; out.yaw = 0; }
        else {                                                            // рушають з розгону до тунелю (а не прямо в трибуну) і зникають у ньому
          const u = t - HS_T - 0.5, e = Math.exp(-2 * u), ex = sd * 1.1 - sx, ez = tz - 6 - LZ, el = Math.hypot(ex, ez), ux = ex / el, uz = ez / el;   // зникають углибині тунелю
          const s = Math.min(el, 1.7 * (u - 0.5 * (1 - e))), v = s < el ? 1.7 * (1 - e) : 0;
          out.x = sx + ux * s; out.z = LZ + uz * s; out.vx = ux * v; out.vz = uz * v; out.yaw = Math.atan2(ux, uz); out.hidden = s >= el;
        }
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
    const L = (a.lane ??= { j: 0, v: 1.75 + 0.45 * (a._jr ?? 0.5), gp: Math.random(), inLane: false, slapT: -9 });   // звичайний крок, у кожного свій
    a._ix = a.p.x; a._iz = a.p.z; a.avx = a.avz = 0;
    if (t - HS_T < i * 0.11 + 0.15 * (a._jr ?? 0)) { a.p.vx = a.p.vz = 0; a.sync(); return; }   // ще стоїть у своїй шерензі
    if (!L.inLane && Math.abs(a.p.z - LANE_Z) < 0.12) L.inLane = true;
    let tx = L.inLane ? -(2 + 11 * LINE_DX + 3) : a.p.x - 1.1, sp = L.v;                       // проміжок між командами — бадьоро
    // дистанція — до найближчого гостя попереду (за X), що вже в черзі чи на доріжці. Раніше — лише до гостя з номером i−1
    // і лише коли той уже на доріжці: хто зупинявся перед нею, того наступні не бачили й обходили, а він стояв, доки
    // не пропустить усіх
    let gap = Infinity;
    for (const o of this.opp) { if (o === a || !o.lane || o.post) continue; const g = a.p.x - o.p.x; if (g > 0 && g < gap) gap = g; }
    { const want = 1.35 + 0.6 * L.gp; if (gap < want + 0.6) sp = Math.min(sp, Math.max(0, (gap - want) * 2.2)); }   // кожен тримає свою дистанцію
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
    const lean = L.inLane ? 0.3 * Math.max(0, 1 - Math.abs(t - L.slapT) / 0.55) : 0;   // з півкроком господаря (0.3) — ще 0.85 м, розштовхування (0.8) не відкидає гостя
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
      if (dt > 0) a.move(wp.x, wp.z, d > 5 ? 4.6 + 1.4 * jr : 2.0, dt);   // підтюпцем-бігом: повільніше інтро тяглося до ~90 с
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
        if (d < 1e-4) { dx = d = 1e-4; dz = 0; }                                // збіглися — розводимо вздовж X (одиничний напрям, без множника 1/d)
        const pen = R - d, wa = da ? (db ? 0.5 : 1) : 0, wb = db ? (da ? 0.5 : 1) : 0;
        a.p.x -= (dx / d) * pen * wa; a.p.z -= (dz / d) * pen * wa; b.p.x += (dx / d) * pen * wb; b.p.z += (dz / d) * pen * wb;
        a.sync(); b.sync(); a._ix = a.p.x; a._iz = a.p.z; b._ix = b.p.x; b._iz = b.p.z;
      }
    }
  }
  /** Кат-сцени: гравці роззираються довкола (у грі погляд — на м'яч). */
  setGaze(on) { for (const a of this.actors) a.p.gaze = on; }
  endIntro() {
    this.view.pitch.decals.fadeOut(); this.view.tunnel.userData.carpet.visible = false;   // доріжку прибрали — на газоні лише гра
    this.formation(this.kickFor(1));
    for (const a of [...this.mine, ...this.opp]) { a._ix = undefined; a._iz = undefined; }
    this.ui.hud.cine(false); this.setGaze(false); this.walk.hide();
    for (const a of this.actors) a.p.root.visible = true;
    audio.crowd(0.7); this.phase = 'play'; this.readyT = 0; this.slowT = 0; audio.whistle(true);
    // онлайн: розводить гість — підказка про приціл не нам
    this.ui.hud.hint(S.tutorial || (this.link && this.bs === 'held') ? null : (this.ui.useJoy() ? 'Час сповільнено: тягни джойстик у бік удару й відпусти' : 'Час сповільнено: відтягни від м’яча й відпусти'));
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

  /** Серію запустили посеред кат-сцени: прибрати її залишки — кадр повтору, перерву, доріжку, прапори, кінорежим. */
  clearCine() {
    if (this.hl) this.replay.restoreLive();
    this.rp = null; this.hl = null; this.brk = null; this.world.netPush = null;
    if (this.phase === 'intro') {
      this.view.pitch.decals.fadeOut(); this.view.tunnel.userData.carpet.visible = false; this.walk.hide(); this.slaps.clear();
      for (const a of this.actors) a.p.root.visible = true;
    }
    this.setGaze(false); this.ui.hud.cine(false); this.clearSlow();
  }

  /** Запуск серії пенальті достроково (з паузи). */
  startPens() {
    if (this.link) return;
    if (this.phase === 'pens' || this.phase === 'end' || this.phase === 'idle') return;
    this.cancelAim(); this.penRes = null; this.timeUp = false;
    this.clearCine();
    this.pens = new Penalties(this); this.pens.start();
  }
  /** Що важливо для ігрової камери (core/camera.js): м'яч, хто з ним, адресат паса, куди цілимось. Наші атакують +X. */
  camInfo(o) {
    const b = this.ball, pl = o.pl;
    o.bx = b.x; o.bz = b.z; o.bvx = b.vx; o.bvz = b.vz;
    for (let i = 0; i < this.actors.length; i++) { const a = this.actors[i], q = pl[i] || (pl[i] = {}); q.x = a.p.x; q.z = a.p.z; q.side = a.side; q.gk = a.isGK; }
    o.n = this.actors.length;
    const bs = this.bs, h = bs === 'ready' || bs === 'aim' || bs === 'wind' ? this.holder : bs === 'held' ? this.taker : null;
    o.carrier = h ? this.actors.indexOf(h) : -1;
    o.receiver = this.passTarget && this.passTarget.receiver ? this.actors.indexOf(this.passTarget) : -1;
    o.aiming = this.aiming; o.aimOn = this.aiming && this.shot.valid && this.path.n > 1;
    if (o.aimOn) { pathPoint(this.path, this.path.goal ? 1e9 : 28, _cp); o.ax = _cp.x; o.az = _cp.z; }
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
    this.playClips(list, 'ДОБІРКА · ' + n + '-Й ТАЙМ', () => { this.ui.hud.cine(true, this.brk && this.brk.n === 2 ? 'ПЕРЕРВА' : null); if (this.brk) this.brk.t = 0; });
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
    const name = { goal: 'ГОЛ', save: 'ПОРЯТУНОК', post: 'ШТАНГА' }[c.kind];
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

  /**
   * Перерва між таймами: гравці кроком розходяться на свої місця (хтось плескає, хтось махає трибунам), камера
   * облітає стадіон, потім — крупно той, хто розводить. Далі свисток.
   */
  startBreak(n) {
    const from = this.actors.map((a) => ({ x: a.p.x, z: a.p.z }));
    this.formation(this.kickFor(n + 1));
    this.brkTo = this.actors.map((a) => ({ x: a.p.x, z: a.p.z, yaw: a.p.yaw }));
    this.actors.forEach((a, i) => { a.place(from[i].x, from[i].z); if (!a.isGK && Math.random() < 0.5) a.p.gesture(1.8, [1, 2, 5, 6, 7, 8, 11, 12, 16][(Math.random() * 9) | 0]); });
    this.brk = { t: 0, n }; this.setGaze(true);
    this.phase = 'break';
    this.view.stands.react('clap', { dur: 3 });
    this.ui.hud.cine(true, n === 2 ? 'ПЕРЕРВА' : null);
    this.takeMoments();
    if (this.clips.length) this.brk.hlAt = 3.4;                       // спершу табло з рахунком тайму, потім підбірка моментів
  }
  updateBreak(dt) {
    if (this.hl) { this.updateClip(dt); return; }
    const B = this.brk; B.t += dt;
    if (B.hlAt != null && B.t >= B.hlAt) { B.hlAt = null; this.startHighlights(B.n); return; }
    // темп — щоб кожен устиг на своє місце до свистка (далекі — бігом); хто ще не дійшов, на того свисток чекає (до ~4 с).
    // Раніше всі йшли однаково повільно, а за 4 с ті, хто був далеко, «телепортувались» на позицію (до 40 м)
    let far = 0;
    this.actors.forEach((a, i) => {
      const to = this.brkTo[i], d = Math.hypot(to.x - a.p.x, to.z - a.p.z);
      a.avx = a.avz = 0;
      if (d > 0.35) {
        far = Math.max(far, d);
        a.move(to.x, to.z, clamp(1.3 * d / Math.max(0.8, BREAK_T - B.t), 3.4, 8.5), dt);
        if (Math.hypot(a.p.vx, a.p.vz) > 0.6) a.p.yaw = Math.atan2(a.p.vx, a.p.vz);
      } else { const k = Math.exp(-dt * 6); a.p.vx *= k; a.p.vz *= k; a.p.yaw = to.yaw; }
    });
    this.time += dt;
    this.syncView(dt);
    if (B.t > BREAK_T && (far < 0.4 || B.t > BREAK_T + 4)) this.endBreak();
  }
  endBreak() {
    this.actors.forEach((a, i) => { const to = this.brkTo[i]; a.place(to.x, to.z); a.p.yaw = to.yaw; });
    this.brk = null; this.phase = 'play'; this.readyT = 0; this.replay.clear(); this.setGaze(false);
    this.ui.hud.cine(false); audio.whistle(true);
  }
  breakCam() {
    const t = this.brk.t;
    if (t < 2.5) { const a = 0.5 + t * 0.16; return { p: _c1.set(Math.sin(a) * 50, 24, Math.cos(a) * 40), l: _c2.set(0, 0, 0), fov: 40, shot: 'brk1', rate: 4 }; }
    const h = ((this.bs === 'held' && this.taker) || this.holder || this.mine[1]).p;   // крупно той, хто розводить (і суперник)
    return { p: _c1.set(h.x - 4.2, 1.45, h.z + 3.6), l: _c2.set(h.x + 0.4, 1.15, h.z), fov: 32, shot: 'brk2', rate: 5, dof: 0.016 };
  }

  /**
   * Після свистка кожен поводиться по-своєму, а не всі разом біжать тиснути руки:
   *  • руки тиснуть лише суперники, що справді поруч (до ~6 м), — підходять кроком;
   *  • переможці біля свого воротаря збігаються в купу, далекі — йдуть до трибуни й аплодують;
   *  • ті, хто програв, сідають на газон, лягають на спину, стоять руки на колінах або просто сумують;
   *  • дехто по двоє з одноклубником повільно йде до тунелю й розмовляє (говорять по черзі).
   * У нічиїй — спокійніше: рукостискання, розмови, хтось сідає, хтось аплодує.
   */
  assignEndRoles() {
    const R = Math.random, d2 = (a, b) => Math.hypot(a.p.x - b.p.x, a.p.z - b.p.z);
    for (const a of this.actors) { a.endRole = null; a.endDone = false; a.endAt = 0.8 + 1.6 * R(); }
    const cand = [];
    for (const a of this.mine) for (const b of this.opp) { const d = d2(a, b); if (d < 6 && !a.isGK && !b.isGK) cand.push([d, a, b]); }
    cand.sort((x, y) => x[0] - y[0]);
    const pairs = [];
    for (const [d, a, b] of cand) {
      if (a.endRole || b.endRole) continue;
      a.endRole = b.endRole = 'pair';
      const ok = d > 0.01, ux = ok ? (b.p.x - a.p.x) / d : 1, uz = ok ? (b.p.z - a.p.z) / d : 0;
      pairs.push({ a, b, d, mx: (a.p.x + b.p.x) / 2, mz: (a.p.z + b.p.z) / 2, ux, uz, gap: 0.42, off: 0.26, mt: 0, met: false, ready: false, after: 0, kind: R() < 0.3 ? 'hug' : R() < 0.5 ? 'pat' : 'shake' });
      if (a.p.mode === 'cheer' || a.p.mode === 'hug') a.p.setMode('idle');
      if (b.p.mode === 'cheer' || b.p.mode === 'hug') b.p.setMode('idle');
    }
    this.endPairs = pairs;
    this.endTalks = [];
    const tz = this.view.tunnel.userData.startZ;
    for (const T of [this.mine, this.opp]) {
      const won = this.endWin === T, lost = this.endLose === T;
      for (const a of T) {
        if (a.endRole || a.isGK || R() > (won ? 0.2 : 0.35)) continue;
        let b = null, bd = 10;
        for (const q of T) { if (q === a || q.endRole || q.isGK) continue; const d = d2(a, q); if (d < bd) { bd = d; b = q; } }
        if (!b) continue;
        a.endRole = b.endRole = 'talk';
        const mx = (a.p.x + b.p.x) / 2, mz = (a.p.z + b.p.z) / 2, dl = Math.hypot(mx, tz - mz) || 1, ux = -mx / dl, uz = (tz - mz) / dl;
        const sa = Math.sign((a.p.x - mx) * uz - (a.p.z - mz) * ux) || 1;   // хто ліворуч, хто праворуч — як стояли
        this.endTalks.push({ a, b, sa, at: 0.6 + R() * 1.2, spk: R() < 0.5 ? 0 : 1, swT: 0.3 });
      }
      for (const a of T) {
        if (a.endRole) continue;
        const r = R();
        if (a.isGK) a.endRole = won ? 'hub' : lost ? (r < 0.5 ? 'lie' : 'sit') : 'stand';
        else if (won) a.endRole = Math.hypot(this.endHub.x - a.p.x, this.endHub.z - a.p.z) < 22 ? 'hub' : 'fans';
        else if (lost) a.endRole = r < 0.3 ? 'sit' : r < 0.5 ? 'lie' : r < 0.75 ? 'knees' : 'stand';
        else a.endRole = r < 0.25 ? 'knees' : r < 0.45 ? 'sit' : r < 0.75 ? 'fans' : 'stand';
      }
    }
    // крупні плани: дві найближчі пари; бракує — розмова або той, хто сів чи ліг
    const solo = this.actors.filter((a) => (a.endRole === 'sit' || a.endRole === 'lie') && !a.isGK).map((a) => ({ a, b: a, solo: true }));
    this.endFeat = [...pairs.slice(0, 2), ...this.endTalks.map((T) => ({ a: T.a, b: T.b })), ...solo].slice(0, 2);
  }
  endShake(dt) {
    if (!this.endPairs) return;
    const win = this.endWin;
    for (const P of this.endPairs) {
      // стають трохи навскіс (кожен зсунутий уліво на ширину плеча): праві плечі навпроти, долоні сходяться перед ними
      const { a, b } = P, rx = P.uz * P.off, rz = -P.ux * P.off, yA = Math.atan2(P.ux, P.uz), yB = Math.atan2(-P.ux, -P.uz);
      const ends = [[a, P.mx - P.ux * P.gap - rx, P.mz - P.uz * P.gap - rz, yA], [b, P.mx + P.ux * P.gap + rx, P.mz + P.uz * P.gap + rz, yB]];
      let here = 0, turned = 0;
      for (const [X, tx, tz, yw] of ends) {
        const d = Math.hypot(tx - X.p.x, tz - X.p.z);
        if (d > 0.3 && !P.met) { X.avx = X.avz = 0; X.move(tx, tz, 1.6, dt);   // поруч — підходять кроком, а не біжать
          X.p.yaw = d < 1.6 ? yw : Math.hypot(X.p.vx, X.p.vz) > 0.6 ? Math.atan2(X.p.vx, X.p.vz) : X.p.yaw; }
        else {   // дотягується до місця кроком: швидкість — та сама, що й зсув (інакше хода бачить нуль і стопи ковзають)
          here++; const kk = Math.min(1, dt * 3), sx = (tx - X.p.x) * kk, sz = (tz - X.p.z) * kk;
          X.p.x += sx; X.p.z += sz; X.p.vx = dt > 0 ? sx / dt : 0; X.p.vz = dt > 0 ? sz / dt : 0; X.p.yaw = yw;
        }
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
      if (P.solo) {                                                     // хто сів чи ліг: низько, спереду-збоку
        const q = P.a.p, y = q.bodyYaw ?? q.yaw, fx = Math.sin(y + 0.6 * sgn), fz = Math.cos(y + 0.6 * sgn);
        return { p: _c1.set(q.x + fx * 3.6, 1.0, q.z + fz * 3.6), l: _c2.set(q.x, 0.5, q.z), fov: 34, shot: id, rate: 4, dof: 0.014 };
      }
      const mx = (P.a.p.x + P.b.p.x) / 2, mz = (P.a.p.z + P.b.p.z) / 2, d = Math.hypot(P.b.p.x - P.a.p.x, P.b.p.z - P.a.p.z) || 1;
      const ux = (P.b.p.x - P.a.p.x) / d, uz = (P.b.p.z - P.a.p.z) / d, nx = -uz * sgn, nz = ux * sgn;
      return { p: _c1.set(mx + nx * 4.3 + ux * 0.8, 1.55, mz + nz * 4.3 + uz * 0.8), l: _c2.set(mx, 1.1, mz), fov: 34, shot: id, rate: 4, dof: 0.014 };
    };
    if (t < 5.6 && F[0]) return pairCam(F[0], 'end2', 1);
    if (t < 7.6 && (F[1] || F[0])) return pairCam(F[1] || F[0], 'end3', -1);
    const q = sm((t - 7.6) / 1.8);
    return { p: _c1.set(0, L2(16, 38, q), L2(30, 58, q)), l: _c2.set(0, 0, 0), fov: L2(40, 44, q), shot: 'end4', rate: 1.6 };
  }

  /** Гра зупинилась (перерва, пенальті, фінал): віньєтка й приглушений натовп не лишаються — updateSlow там уже не працює. */
  clearSlow() { if (this.slow) { this.slow = false; this.ui.setSlow(false); audio.slowmo(false); } }

  /** Режим володіння: поки м'яч у нас, час сповільнюється до удару або до відбору. */
  updateSlow(rawDt) {
    // сповільнення — лише коли ви справді прицілюєтесь. Поки ваш воротар тримає м'яч і суперники відходять (цілитись ще не
    // можна), гра йде в звичайному темпі — інакше вони відходили в 7 разів повільніше, і гра ніби завмирала після сейву
    const gkWait = this.holder && this.holder.isGK && !this.holder.footBall && !this.gkClear;
    // онлайн: гість думає над ударом — сповільнення таке саме (час гри спільний); 14 с без удару — його гравцем грає ШІ
    const remote = !!this.link && this.remoteWaiting();
    if (remote) { this.netWaitT += rawDt; if (this.netWaitT > 14) { this.netAuto = true; this.link.timedOut(); } }
    const want = this.phase === 'play' && (((this.bs === 'ready' || this.bs === 'aim') && !gkWait) || remote);
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
    if (this.holder.isGK && !this.holder.footBall) return;          // воротар тримає м'яч у руках: захисники не втручаються
    const b = this.ball;
    // прицілом час сповільнено, а випад іде в часі гри: людина завжди встигає віддати, і захисник лише падає в порожнечу. Поки приціл короткий, він лишається в стійці; довгий приціл карається випадом. Онлайн без змін: гість цілиться без такого сповільнення
    if (this.bs === 'aim' && this.shot.valid && !this.spec.online && this.readyReal < 2.2) return;
    if (this.oppLunging() || this.lungePause(this.oppTeam)) return;   // один випад за раз
    for (let i = 1; i < this.opp.length; i++) {
      const a = this.opp[i];
      if (a.stun > 0 || a.noTrap > 0 || a.frozen > 0 || a.sliding || a.manual) { a.nearT = 0; continue; }
      const db = Math.hypot(a.p.x - b.x, a.p.z - b.z);
      if (this.tackleReady(a, db, this.tacklePatience(a, this.oppTeam, db), dt)) { this.startTackle(a); return; }
    }
  }

  /** Чи хтось із суперників уже у випаді. */
  oppLunging() { for (let i = 0; i < this.opp.length; i++) if (this.opp[i].tkl > 0) return true; return false; }

  /** Партнер щойно провалився у випаді: наступний не кидається тієї ж миті на того самого носія, а дає йому зробити наступну дію. */
  lungePause(team) { return this.time - (team.missT ?? -9) < 0.45; }

  /** Скільки захисник вичікує в стійці. Суперник у кар'єрі залежить від пресингу ліги, наш — від інтелекту; онлайн обидві сторони однакові. Без страховки останній чекає довше. */
  tacklePatience(a, team, db) {
    const opp = team.side < 0 || team.even, base = opp ? 0.15 + 0.55 * (1 - team.press) : 0.2 + 0.4 * (1 - a.sk.iq);
    return base * (db < 2.5 && !team.hasCover(a, this.ball) ? (opp ? 1.5 : 1.7) : 1);
  }

  /** Захисник у стійці біля м'яча вичікує момент (терпіння patience с, з розкидом), потім іде у випад. Куди нога вже не дістане (носій тікає), туди не кидається. */
  tackleReady(a, db, patience, dt) {
    if (db > 2.5) { a.nearT = 0; return false; }
    if (!a.nearT) a.patT = patience * (0.6 + 0.8 * Math.random());
    a.nearT = (a.nearT || 0) + dt;
    if (!(a.nearT > a.patT || (db < 1.25 && a.nearT > 0.1))) return false;   // зовсім впритул — б'є майже одразу
    const b = this.ball, hp = (this.bs === 'ready' || this.bs === 'aim') && this.holder ? this.holder.p : null, T = 0.2 + 0.12 * (1 - a.sk.tack);
    return Math.hypot(b.x + (hp ? hp.vx : b.vx) * T - a.p.x, b.z + (hp ? hp.vz : b.vz) * T - a.p.z) < 1.6 + 0.85 + 0.7 + 0.4 * a.sk.tack;   // тіло пролетить до 1.6 м, стопа ще 0.85, дотяг (resolveTackle)
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
    ctx.carrier = this.owner > 0 ? this.holder : this.owner < 0 ? this.taker : null; ctx.diff = this.score.me - this.score.opp; ctx.tf = clamp(this.clock / this.spec.time, 0, 1);
    const hv = (this.bs === 'ready' || this.bs === 'aim') ? this.holder : this.spec.online && this.bs === 'held' ? this.taker : null;
    ctx.holdV = hv ? Math.hypot(hv.p.vx, hv.p.vz) : 0;                      // темп виконавця (онлайн і гостя) — захисник не відстає
    if (this.bs !== 'roll' && this.bs !== 'net') ground(b);                 // м'яч у ногах чи руках
    if (this.bs === 'roll') {                                             // прогноз польоту: раз на 0.1 с або одразу після удару
      // таблиця рахує час від миті побудови, а ШІ й воротарі читають її як «від зараз»: швидкий м'яч — щокадру, повільний — раз на 0.1 с
      this.planT -= dt;
      if (bs > 12 || this.planT <= 0 || this.planShot !== this.shotId) { const np = this.world.netPush; this.plan.build(b); this.world.netPush = np; this.planT = 0.1; this.planShot = this.shotId; }
      ctx.plan = this.plan;
    } else ctx.plan = null;
    if (this.phase !== 'play') this.readyT = this.readyReal = 0;
    else if (this.bs === 'ready' || this.bs === 'aim' || this.bs === 'wind') { this.readyT += dt; this.readyReal += rawDt; } else this.readyT = this.readyReal = 0;
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
      // після прицілу — як у людини: обходить м'яч, розбігається, ставить опорну ногу біля м'яча і б'є; м'яч летить у мить
      // контакту ноги (~0.13 с після початку замаху). Раніше гравця за 0.14 с переносило за м'яч — телепорт
      const a = this.holder, h = a.p, sh = this.shot, w = this.wnd;
      w.t += dt;
      if (!w.kicked && w.carry) {
        // веде м'яч — б'є з ходу: удар у бік бігу одразу; під кутом — рішучий розворот із м'ячем на бігу (без зупинки) і удар,
        // щойно кут прийнятний (пас — внутрішньою стороною стопи до ~90°, удар — до ~35°). Перед ударом трохи прискорюється
        const want = Math.atan2(sh.dirx, sh.dirz), okA = sh.power < 0.45 ? 1.55 : 0.6;
        const hd = this.carry(a, dt, want, 5.5, (3.6 + 1.6 * sh.power) * (0.84 + 0.34 * a.sk.pace));
        if (Math.abs(angDiff(hd, want)) < okA || w.t > 1.0) {
          w.kicked = true; this.windT = 0.13; h.yaw = this.kickYaw(h, sh.dirx, sh.dirz); h.kick(sh.power);
        }
      } else if (!w.kicked) {
        // пас — внутрішньою стороною стопи й під кутом до ~70° (без обходу м'яча), удар — з розбігу під кутом до ~37°
        const okA = sh.power < 0.45 ? 1.25 : 0.65;
        const st = this.kickApproach(a, sh.dirx, sh.dirz, 0.95, 4.5 + 2.5 * sh.power, dt, w.run, okA);
        if (st.ang < okA && st.behind > 0.6) w.run = true;
        // м'яч біля борту, удар у поле: стати за м'ячем не дасть межа поля — б'є збоку, не чекаючи таймаута
        const blocked = Math.abs(b.x - sh.dirx * 0.45) > L - 1.3 || Math.abs(b.z - sh.dirz * 0.45) > W - 1.3 || Math.abs(b.x - sh.dirx * 0.45) + Math.abs(b.z - sh.dirz * 0.45) > L + W - PITCH.CH - 1.3 * Math.SQRT2;
        if (this.kickReady(a, st, sh.dirx, sh.dirz, okA) || w.t > (blocked ? 0.5 : 1.3)) {
          w.kicked = true; this.windT = 0.13; h.yaw = Math.atan2(sh.dirx, sh.dirz);
          h.kick(sh.power, Math.hypot(h.vx, h.vz) < 1.2 ? 1 : undefined);   // з місця — правою, як у стійці прицілу
        }
      } else {
        if (w.carry) this.carry(a, dt, null, 0, Math.max(2.5, Math.hypot(h.vx, h.vz)));          // замах на бігу: м'яч біля ноги до контакту
        else if (!w.hands) { a.avx = a.avz = 0; a.move(b.x - sh.dirx * 0.55, b.z - sh.dirz * 0.55, 2.5, dt); }   // опорна нога стала — тіло гальмує над м'ячем
        else { h.vx *= 0.6; h.vz *= 0.6; }
        h.yaw = w.carry ? this.kickYaw(h, sh.dirx, sh.dirz) : Math.atan2(sh.dirx, sh.dirz);
        if ((this.windT -= dt) <= 0) this.launchShot();
      }
    }
    if (this.bs === 'roll') {
      if (bs < 2.5 && this.ball.y < 0.3) { this.looseT += dt; if (this.looseT > 1.3) this.fallbackPick(); } else this.looseT = 0;
    }
    for (let i = 0; i < this.actors.length; i++) this.actors[i].sync();
    this.acc += dt;
    let steps = 0;
    while (this.acc >= H && steps < MAX_STEPS) {
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
    const A = this.actors, n = A.length, xm = L - 1.3, zm = W - 1.3, cm = L + W - PITCH.CH - 1.3 * Math.SQRT2;
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
      for (let i = 0; i < n; i++) {
        const p = A[i].p; p.x = clamp(p.x, -xm, xm); p.z = clamp(p.z, -zm, zm);
        const o = Math.abs(p.x) + Math.abs(p.z) - cm;                     // зріз кута: та сама відстань, що й від прямого борту, інакше кут межі стоїть за щитом
        if (o > 0) { p.x -= Math.sign(p.x) * o / 2; p.z -= Math.sign(p.z) * o / 2; }
      }
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
      const k = 1.3 * Math.max(0, 1 - s.t / s.dur);                     // гальмує до нуля (раніше обривалось із ~⅓ швидкості)
      a.p.x += s.vx * dt * k; a.p.z += s.vz * dt * k; a.p.vx = a.p.vz = 0;
      if (s.t >= s.dur) {
        a.slide = null; a.sliding = false; a.body.r = a.baseR; a.frozen = Math.max(1.15, a.p.mode === 'slide' ? a.p.modeT + 0.02 : 0); a.stun = 1.3; a.slideCool = 4;   // встає до кінця анімації (її час має випадковий розкид)
        a.manual = this.hasBall(a);
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
    const list = this.shotBy === 1 ? this.opp : this.mine, tm = this.shotBy === 1 ? this.oppTeam : this.myTeam;
    // шукаємо єдиного, хто справді може дотягнутися: близько до лінії, встигає за часом польоту м'яча
    let best = null, bestScore = 1e9, bx = 0, bz = 0, bperp = 0;
    for (let i = 1; i < list.length; i++) {
      const a = list[i];
      if (a.manual || a.frozen > 0 || a.stun > 0 || a.slideCool > 0 || a.receiver || a.decided === this.shotId || a.sliding || a.dive) continue;
      const rx = a.p.x - b.x, rz = a.p.z - b.z, along = rx * ux + rz * uz, perp = Math.abs(rx * uz - rz * ux);
      if (along < 3.5 || along > 18 || perp > 3.4) continue;                       // далеко від траєкторії
      const tb = along / (sp * 0.9), need = Math.max(0, perp - 1.1) / Math.max(0.05, tb);
      if (tb < 0.16 || tb > 0.42 || need > 10.5) continue;                          // не встигає або м'яч ще далеко: ковзання (0.36 с) закінчиться раніше, ніж він долетить
      { const ss = clamp(perp / 0.3, 6, 13.5), tt = Math.min(tb, 0.36); if (ss * 1.3 * (tt - (tt * tt) / 0.72) + 1.1 < perp) continue; }   // за час до м'яча ковзання (startSlide, гальмує до нуля) не дістане лінії
      if (b.y + b.vy * tb - 4.9 * tb * tb > 1.1) continue;                          // м'яч пройде над тим, хто ковзає
      const score = perp + along * 0.04;
      if (score < bestScore) { bestScore = score; best = a; bx = b.x + ux * along; bz = b.z + uz * along; bperp = perp; }
    }
    if (!best) return;
    best.decided = this.shotId; this.slideTries++;
    const p = (this.shotBy === 1 || tm.even ? 0.3 + 0.4 * tm.press : 0.5) * (1 - bperp / 4.4) * (0.6 + 0.8 * best.sk.iq) * (tm.even ? 0.6 : this.shotBy === 1 ? 0.44 : 0.79);   // онлайн: обидві сторони однакові. Підкат тепер починається вчасно й дістає частіше, тож падати треба рідше, а не блокувати більше: множник тримає кількість контактів такою, як була
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
    const base = a.side > 0 && !this.spec.online ? 0.42 + 0.42 * a.sk.tack : 0.22 + 0.42 * a.sk.tack + 0.2 * (a.side > 0 ? this.myTeam : this.oppTeam).press;   // онлайн: однаково для обох сторін
    const p = clamp(base - Math.max(0, speed - 26) * 0.011, 0.15, 0.9);
    const b = this.ball, v = this.view;
    if (Math.random() < p) {
      // вибив: м'яч летить подалі від своїх воріт, повільніше й зі зміщенням
      const dir = a.side > 0 ? 1 : -1, ang = rand(-0.7, 0.7), sp = clamp(speed * 0.45, 12, 22);
      b.vx = Math.cos(ang) * sp * dir; b.vz = Math.sin(ang) * sp;
      this.floatAt(a.p.x, a.p.z, 'ПІДКАТ! ВИБИВ', a.side > 0 ? 'good' : 'warn');
      audio.thud(); this.game.addTrauma(0.3); this.hitStop = Math.max(this.hitStop, 0.04); v.ball.squash(nx, nz, 0.3); if (a.side > 0) this.addXp(a, 25);
      v.particles.burst(a.p.x, 0.3, a.p.z, 12, 5, 0.6, 0.3, ['#4f7d3a', '#8fb98a', '#f1efe8'], 10, 0.8);
      this.shotBy = 0; this.protectT = 0; this.planT = 0;
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
    for (let k = 0; k < 2; k++) {
      const g = this.keepers[k];
      if (g.dive || g.frozen > 0 || g.cool > 0 || g.noTrap > 0 || g.stun > 0 || g.p.downed || (this.shotBy === g.side && this.shooter === g)) continue;
      const goalX = -g.side * L, inBox = (b.x - goalX) * g.side < PITCH.BOX_D && Math.abs(b.z) < PITCH.BOX_W;
      if (!inBox || b.y > 1.9 + 0.5 * (g.sk.reach ?? 0.5) + 0.5 * g.kReach) continue;          // вище витягнутих рук — не дістає
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
    for (let i = 0; i < caps.length; i++) {
      const c = caps[i];
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
    const b = this.ball, goalX = -g.side * L, inBox = (b.x - goalX) * g.side < PITCH.BOX_D && Math.abs(b.z) < PITCH.BOX_W;
    g.footBall = !inBox;
    if (g.dive || g.p.mode === 'gkfall') return;                      // упав на м'яч (стрибок чи падіння на бік) — так і лежить із ним
    if (g.footBall) { g.p.receive(b.y, speed); return; }
    g.p.catchBall(b.y < 0.35 && (b.y < 0.1 || speed < 14));
    { const k = clamp(speed / 22, 0.2, 1.3); g.p.impulse(-0.7 * k, 1.4 * k, 0, -2 * k, -2 * k, 0.9 * k); }   // ловить — гасить м'яч тілом: груди й руки подаються назад
  }

  /**
   * Вихід у ноги: суперник із м'ячем у штрафному, ближче ~2.8 м — воротар (після своєї реакції) кидається йому в ноги,
   * боком, перекриваючи тілом. Через ~0.3 с — чи накрив м'яч: виграв — м'яч його, ні — лежить, а нападник обходить.
   */
  gkRush(dt) {
    if (this.phase !== 'play' || this.kickoff) return;
    for (let k = 0; k < 2; k++) {
      const g = this.keepers[k];
      if (g.dive || g.frozen > 0 || g.stun > 0 || g.p.downed || g.manual) { g.rushT = 0; continue; }
      const vsMine = g.side < 0 && (this.bs === 'ready' || this.bs === 'aim') && this.holder && !this.holder.isGK;
      const vsOpp = g.side > 0 && this.bs === 'held' && this.taker && !this.taker.isGK;
      if (!vsMine && !vsOpp) { g.rushT = 0; continue; }
      const b = this.ball, goalX = -g.side * L, inBox = (b.x - goalX) * g.side < PITCH.BOX_D && Math.abs(b.z) < PITCH.BOX_W;
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
    audio.slide(); this.floatAt(p.x, p.z, 'У НОГИ!', g.side > 0 ? 'good' : 'warn');
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
    const keepers = this.keepers;
    for (let k = 0; k < 2; k++) {
      const g = keepers[k], d = g.dive;
      // випад-крок у сейві на місці: таз плавно переходить до м'яча за час до його прильоту
      const sh = g.saveShift;
      if (sh) { if (d) g.saveShift = null; else { sh.t += dt; g.p.z = sh.z0 + sh.dz * smooth01(sh.t / sh.T); if (sh.t >= sh.T) g.saveShift = null; } }
      // суперник цілиться чи замахується на удар — воротар бачить це й стає «готовим» (див. час реакції нижче)
      if ((g.side < 0 && (this.bs === 'aim' || this.bs === 'wind')) || (g.side > 0 && this.telegraph)) g.setAt = this.time;
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
        if (d.t >= d.dur) { g.dive = null; g.frozen = 0.15; g.manual = this.hasBall(g); g.p.vx = g.p.vz = 0; g.p.afterDive = !g.manual; }
        continue;
      }
      // рішення «руками» (зловити, вистрибнути) воротар ще може змінити на стрибок, якщо м'яч пішов інакше (підкрутка,
      // рикошет, помилка прочитання, що зменшується з наближенням м'яча); стрибок чи удар — остаточні
      if (this.bs !== 'roll' || g.frozen > 0 || g.manual || (g.decided === this.shotId && g.decType !== 'hands')) continue;
      const b = this.ball, side = g.side, sp = Math.hypot(b.vx, b.vz);
      const toward = -b.vx * side;
      if (toward < 2 || sp < 3) continue;                              // і повільний м'яч (удар здалеку докочується) — теж читає
      // людина бачить удар і може рушити лише через час реакції: удар зблизька, що долітає швидше, воротар не встигає.
      // Помилку прочитання удару й рідкісне «завмер» вирішуємо раз на удар (а не щокадру)
      if (g.seenId !== this.shotId) { g.seenId = this.shotId; g.seenT = this.time; g.rdU = Math.random() * 2 - 1; g.rdV = Math.random() * 2 - 1; g.froze = Math.random() > 0.97 + 0.03 * g.sk.react; }
      // бачив замах (суперник цілився чи вже б'є) — стоїть «готовим» на носках і реагує на ~третину швидше; удар
      // зненацька (рикошет, з ходу) — повний час реакції
      // суперник вивчив наш улюблений кут: удар туди воротар чекає й реагує швидше, в інший — трохи повільніше (він «грав» туди)
      const ch = side < 0 ? this.spec.scout.corner : 0, cz0 = ch ? this.plan.cross(g.p.x, -side, this._cr).z - g.p.z : 0;
      const ant = ch && Math.abs(cz0) > 0.4 ? (Math.sign(cz0) === Math.sign(ch) ? 1 - 0.3 * Math.abs(ch) : 1 + 0.15 * Math.abs(ch)) : 1;
      const ready = this.time - (g.setAt ?? -9) < 1.2, rt = g.p.reactT * (ready ? 0.65 : 1) * ant;
      if (this.time - g.seenT < rt || g.froze) continue;
      // де й на якій висоті м'яч перетне лінію воротаря — з прогнозу польоту (дуга, підкрутка, відскоки)
      // лінія рішення — площина, де воротар зараз стоїть (він міг вийти на 5–9 м), а не лінія воріт позаду нього
      const line = g.p.x, cr = this.plan.cross(line, -side, this._cr), eta = cr.t;
      if (eta < 0.06) continue;
      // у створі чи мимо — за лінією воріт (на косому ударі z у його площині й на лінії різняться на кілька одиниць); стрибок
      // і зміщення цілять туди, де м'яч перетне його площину. Лінію x = ±L м'яч перетинає лише в сам створ: мимо чи над ним
      // воротар не стрибає й не парирує. Повільний м'яч може й не докотитись — його читаємо, як раніше, у площині воротаря
      const cg = this.plan.cross(-side * L, -side, this._cg);
      if (cg.t <= 0 && (sp >= 16 || Math.abs(cr.z) > G + 0.7)) continue;
      // над ним, але м'яч ще опускається у ворота за спиною (парашут, удар здалеку, коли воротар вийшов) — відступає (team.js),
      // а рішення приймає вже з нової позиції; над поперечиною не реагує. Ще не опускається чи він уже біля лінії — до самої поперечини: долонею чи стрибком
      if (cr.y > PITCH.GOAL_H || (cr.y > 2.45 && (g.p.x + side * L) * side > 1.6 && cg.t > 0 && cg.y < cr.y)) continue;
      // воротар читає удар не ідеально: точка зсунута тим більше, чим слабший «Інтелект» і чим раніше він вирішує.
      // У польоті руки виправляють помилку за тим, що він бачить, — якщо є шанс, дотягується
      // похибка — до ~0.4 м у слабкого й ~0.06 м у найкращого (раніше до 0.67 м: на центральний удар стрибав у бік)
      const er = (0.06 + 0.34 * (1 - g.sk.iq)) * Math.min(1, eta / 0.5);
      const predZ = cr.z + g.rdU * er, predY = Math.max(0, cr.y + g.rdV * er * 0.5);
      const lateral = predZ - g.p.z;
      // м'яч, що скаче по газону, у мить перетину може бути на верхівці відскоку — але поруч він торкається трави: для воротаря
      // це низовий м'яч (ловить «кошиком», падає низом, тілом на газоні перекриває й відскок), а не «середній» над ним
      let yLow = predY; { const P = this.plan, i0 = Math.round(eta / P.dt); for (let i = Math.max(0, i0 - 4); i <= Math.min(P.len - 1, i0 + 4); i++) yLow = Math.min(yLow, P.y[i]); }
      const lowBall = predY < 0.5 || (predY < 0.95 && yLow < 0.3);
      // скільки воротар дістає руками, не стрибаючи: високий м'яч — ~0.7 м убік; на рівні пояса — ~0.5 м; низом по траві стоячи
      // руки до землі збоку не дістають — уже з ~0.35 м падає на бік (короткий стрибок низом)
      const handR = predY > 1.4 ? 0.7 : !lowBall ? 0.5 : 0.35, need = Math.abs(lateral) - handR;
      const at = { x: line, y: PITCH.BALL_VIS + predY, z: predZ }, bsp = Math.hypot(b.vx, b.vy || 0, b.vz), bar = PITCH.GOAL_H - predY;
      // сейви без стрибка тримають воротаря на місці (ШІ не веде його, поки триває рух)
      const strike = (fn) => { g.decided = this.shotId; g.decType = 'strike'; g.frozen = Math.max(g.frozen, eta + 0.45); g.p.vx = g.p.vz = 0; fn(); };
      // уже вирішив ловити: лишає як є, поки м'яч справді йде в руки; пішов убік (підкрутка, рикошет) — лише стрибок
      const redo = g.decided === this.shotId;
      if (redo && (need < 0.15 || eta < 0.12)) continue;
      let lowDive = false;
      const lat = Math.abs(lateral), hands = (fn) => { g.decided = this.shotId; g.decType = 'hands'; g.frozen = Math.max(g.frozen, eta + 0.35); g.p.vx = g.p.vz = 0; fn(); };
      if (!redo) {
        // упритул сильно на рівні тіла, часу ні на що нема — «зірочка»
        if (eta < 0.24 && bsp > 16 && need > 0 && lat < 1.25 && predY >= 0.5 && predY < 1.7) { strike(() => g.p.gkStar(at, eta)); continue; }
        if (need <= 0) {                                                 // на лінії удару: ловить
          if (eta > 0.45) continue;
          // під саму поперечину — переводить долонею; сильний високий — кулаками; високо по центру — вистрибує; інакше ловить
          // (низом — «кошиком», на рівні тіла — «віконцем»), руки назустріч точно до прильоту
          if (predY > 1.75 && bar < 0.5) strike(() => g.p.gkTip(at, eta));
          else if (predY > 1.35 && bsp > 22 && Math.random() < 0.3 + 0.4 * (1 - g.sk.hands)) strike(() => g.p.gkPunch(at, eta));
          else { g.decided = this.shotId; g.decType = 'hands'; if (predY > 1.4) g.p.gkJump(); else g.p.catchBall(lowBall && predY < 0.6, eta); }
          continue;
        }
        // поруч, але не в руки — швидка реакція без польоту (як справжній воротар на близький м'яч): чекає до ~0.3 с і тоді
        // низом — на коліно («барʼєр», ловить), далі — ногою, ще далі — падає на бік із рукою до м'яча; на рівні пояса — падає на бік
        // ногою чи падінням на бік — лише коли удар зблизька (м'яч летить < ~0.6 с) і на стрибок часу нема; з далекого
        // удару воротар устигає стати на лінію — тоді на коліно (поруч) або короткий стрибок низом, а не нога навмання
        const close = this.time - g.seenT + eta < 0.6;
        const quick = (lowBall ? lat < 1.45 : predY < 1.1 ? lat < 1.1 : false) && (close || (lowBall && lat < 1.0));
        if (quick) {
          if (eta > 0.3) continue;
          // сейв на місці — з коротким випадом-кроком до м'яча (до ~0.55 м): так ноги й руки дістають м'яч, що йде ~1–1.5 м
          // убік (раніше нога чи падіння на бік на місці не діставали, і такий м'яч проходив поруч у ворота)
          const shift = (keep) => { const s = Math.sign(lateral) * clamp(lat - keep, 0, 0.55); g.saveShift = s ? { z0: g.p.z, dz: s, t: 0, T: Math.max(0.12, eta * 0.8) } : null; };
          if (lowBall && lat < 1.0) { shift(0.3); hands(() => g.p.gkKnee(at, eta)); }      // «барʼєр» на коліні — ловить руками
          else if (lowBall && lat < 1.3 && bsp > 12) { shift(0.7); strike(() => g.p.gkFoot(at, eta)); }
          // низом далі — короткий стрибок уздовж газону, нижня рука по траві до м'яча. Падіння на бік з місця лише нахиляло
          // корпус (плечі ~0.9 м над газоном): нижня рука до трави не діставала, м'яч проходив під верхньою
          else if (lowBall) lowDive = true;
          else { shift(0.75); g.decided = this.shotId; g.decType = 'hands'; g.frozen = Math.max(g.frozen, eta + 1.2); g.p.vx = g.p.vz = 0; g.p.gkFall(at, eta); }
          if (!lowDive) continue;
        }
        // під поперечину трохи збоку — відштовхується й дотягується однією рукою, переводить через перекладину
        if (!lowDive && predY > 1.8 && need < 0.4) { if (eta > 0.45) continue; strike(() => g.p.gkTip(at, eta)); continue; }
      }
      // бігти чи стрибати — як справжній воротар: поки встигає ногами (приставним/бігом, team.js), біжить на лінію удару;
      // стрибає, лише коли ногами вже не встигне, — і саме тоді, коли стрибку лишається рівно стільки часу, скільки він триває
      // (не надто рано — тоді б завис у повітрі, і не в останню мить, коли м'яч уже поруч)
      // сила стрибка — як у професійного воротаря (до ~9 м/с убік з кроком); розгін, з яким він ішов у бік м'яча, теж іде в стрибок
      const vLeg = 6.8 + 2.2 * g.sk.reach + 2 * g.kReach;               // «Досяжність» і куплені «довші руки»: далі летить за той самий час
      const carry = Math.max(0, g.p.vz * Math.sign(lateral || 1));
      // Як справжній воротар: стрибок завжди стартує з поставлених ніг із запасом — за ~0.3–0.55 с до м'яча (що далі
      // летіти, то раніше), а не «добіжу — не добіжу». Раніше модель вважала, що він миттєво біжить 7 м/с: він біг, гальмував
      // і стрибав уже тоді, коли на політ часу не лишалось. Поки м'яч далеко (> ~0.6 с), team.js зміщує його на лінію удару
      // (що ближче став — то менше летіти), далі він стоїть у стійці; встиг стати на лінію — ловить без стрибка (вище)
      // тіло в стрибку реально летить убік ~6 м/с (з розгоном — швидше), а не на повну силу ніг: далекий м'яч — стрибає
      // одразу, як прочитав удар (до ~0.75 с), а не чекає й не запізнюється
      const tOpt = clamp(0.24 + need / (5.8 + 0.5 * carry), 0.3, 0.75);
      if (!lowDive && eta > tOpt + 0.03) continue;
      g.decided = this.shotId; g.decType = 'dive';
      {
        const dir = Math.sign(lateral);
        // висота стрибка — за висотою м'яча: високий — угору-вбік, середній — у політ, низом (по траві чи нижче ~0.5 м) — низом,
        // навіть далеко (тоді витягнутим тілом уздовж газону), а не над м'ячем
        // м'яч, що скаче по газону, у мить перетину може бути на верхівці відскоку — але поруч він торкається трави: такий
        // теж низом (тіло на газоні перекриває і відскок), а не «середнім» стрибком над ним
        const kind = predY > 1.3 ? 0 : predY > 0.6 && !lowBall ? 1 : 2;
        g.dive = { t: 0, dur: 0.9, z0: g.p.z, dist: 0, kind };
        // стрибок за фізикою: воротар відштовхується так, щоб руки встигли туди, де м'яч перетне його лінію; сила ніг — за навичкою.
        // Не встигає (задалеко, запізно) — летить, скільки дозволяють ноги, як справжній
        // летить уздовж лінії, тож і площина тіла вздовж неї: до м'яча корпус довертається лише на ~11°, і не миттю, а на відштовхуванні
        const st0 = side > 0 ? Math.PI / 2 : -Math.PI / 2, yb = Math.atan2(b.x - g.p.x, b.z - g.p.z), dy0 = Math.atan2(Math.sin(yb - st0), Math.cos(yb - st0));
        g.manual = true; g.p.yaw = st0 + clamp(dy0, -0.2, 0.2); g.p.gkDive(dir, kind, { x: line, y: PITCH.BALL_VIS + predY, z: predZ }, eta, vLeg + 0.5 * carry);
        audio.slide(); this.floatAt(g.p.x, g.p.z, 'СТРИБОК!', side > 0 ? 'good' : 'warn');
      }
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
    if (this.timeUp) { I += 0.25; tag = 'У ДОДАНИЙ ЧАС!'; }
    if (sp.final) I += 0.12;
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
    let zs = sc.p.z >= 0 ? 1 : -1; const team = mine ? this.mine : this.opp;
    // до фанатів лише на бік дальньої трибуни (z < 0): з боку камери трибуни немає. Не добіжить туди за час пробіжки (~26 од.) — інше святкування
    if (kind === 'fans' || kind === 'board' || kind === 'shush') { if (sc.p.z + W - 3.4 > 26) kind = pick(I < 0.35 ? ['calm', 'jump', 'salute'] : ['corner', 'airplane', 'dance']); else zs = -1; }
    let tx = sc.p.x, tz = sc.p.z;
    if (kind === 'corner') { tx = side * (L - 7.5); tz = zs * (W - 5); }
    else if (kind === 'fans' || kind === 'board' || kind === 'shush') { tx = clamp(sc.p.x + side * 4, -L + 8, L - 8); tz = zs * (W - (kind === 'board' ? 1.1 : 3.4)); }
    else if (kind === 'airplane') { tx = clamp(sc.p.x - side * 7, -L + 8, L - 8); tz = zs * (W - 9); }
    else if (kind === 'calm') { tx = sc.p.x - side * 9; tz = sc.p.z * 0.6; }
    this.celeb = { mine, scorer: sc, t: 0, kind, I, side, zs, tx, tz, dur: 4.4 + 4.2 * I, st: 'run', actT: 0, huggers: 0, hugOn: 0, maxHug: kind === 'pile' ? 6 : I > 0.6 ? 4 : 3, bursts: 0 };
    for (const a of this.actors) { a.celebHug = false; a.hugOn = false; a.cheered = false; a.hf = false; a.celebJoin = false; }
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
        a.move(a.p.x - c.side * 4, a.p.z, 2.4, dt); if (Math.hypot(a.p.vx, a.p.vz) > 0.4) a.p.yaw = Math.atan2(a.p.vx, a.p.vz);   // ціль на кілька метрів уперед (2.5·dt було ближче за поріг move — стояли)
        continue;
      }
      const close = a.celebHug, ang = close ? a.hugAng : i * 2.4 + c.t * 0.35, rad = close ? 0.75 : 1.8 + (i % 3) * 0.8;
      const tx = sc.p.x + Math.cos(ang) * rad, tz = sc.p.z + Math.sin(ang) * rad;
      const busy = a.p.mode === 'cheer' || a.p.mode === 'hug';
      if (busy) { a.p.vx *= Math.exp(-dt * 10); a.p.vz *= Math.exp(-dt * 10); a.p.x += a.p.vx * dt; a.p.z += a.p.vz * dt; }
      else a.move(tx, tz, close ? 4.5 : 8.8 + (i % 4) * 0.5 + 1.2 * I, dt);
      const d = Math.hypot(sc.p.x - a.p.x, sc.p.z - a.p.z);
      a.p.yaw = d > 3 ? (Math.hypot(a.p.vx, a.p.vz) > 0.3 ? Math.atan2(a.p.vx, a.p.vz) : a.p.yaw) : Math.atan2(sc.p.x - a.p.x, sc.p.z - a.p.z);
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
    for (let i = 1; i < other.length; i++) { const a = other[i]; a.move(a.p.x * 0.92, a.p.z, 2.1 - 0.8 * I, dt); if (Math.hypot(a.p.vx, a.p.vz) > 0.3) a.p.yaw = Math.atan2(a.p.vx, a.p.vz); }
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
        if (Math.hypot(a.p.x - sc.p.x, a.p.z - sc.p.z) < 1.3 && this.slaps.add(sc.p, a.p, 0.32)) { a.hf = true; break; }   // далі долоні не зустрічаються
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
      if (a.frozen > 0 || a.sliding || a.dive || a.manual || a.p.downed) continue;
      const d = Math.hypot(a.p.x - b.x, a.p.z - b.z) * (a.side > 0 && !this.spec.online ? 0.82 : 1);
      if (d < bd) { bd = d; best = a; }
    }
    if (!best) return;
    if (bd > 3.2 && this.looseT < 5) return;                            // хтось уже біжить: м'яч не перелітає до нього сам (раніше ~4.4 м за 0.4 с)
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
    if (this.carries(a)) {
      // прийняв м'яч на бігу — гальмує з м'ячем у ногах і зупиняється: далі гра чекає на твій удар чи пас (раніше він
      // вів м'яч далі бігом, і захисник, що біг не швидше, ніколи не діставав до відбору). Поки цілишся й гальмує —
      // корпус доводиться в бік удару
      const aim = this.bs === 'aim' && this.shot.valid;
      this.carry(a, dt, aim ? Math.atan2(this.shot.dirx, this.shot.dirz) : null, 2.2, 0);
      if (Math.hypot(a.p.vx, a.p.vz) < 0.4) this.holdStop = true;   // зупинився — далі стоїть біля м'яча
      return;
    }
    if (this.bs === 'ready') {
      const d = Math.hypot(a.p.x - b.x, a.p.z - b.z);
      if (d > 2.4) {
        const sx = b.x > -L + 5 ? b.x - 1.5 : b.x + 1.5;
        this.myTeam.avoid(a, this.actors);
        a.move(sx, b.z + 0.1, 15, dt);
      } else { a.p.vx *= 0.7; a.p.vz *= 0.7; }
      a.p.yaw = Math.atan2(b.x - a.p.x, b.z - a.p.z);
    } else if (this.shot.valid && !(a.isGK && !a.footBall)) {
      // приціл: гравець не крутиться на місці, а кроками обходить м'яч і стає позаду нього на лінії удару — на відстані
      // розбігу (сильніший удар — довший розбіг)
      this.kickApproach(a, this.shot.dirx, this.shot.dirz, 1.0 + 0.5 * this.shot.power, 3.2, dt, false, this.shot.power < 0.45 ? 1.25 : 0.65);
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
    for (let k = 0; k < 2; k++) {
      const a = this.keepers[k], hit = a.p.hitCaps, b = a.body; if (!hit) continue;
      const cs = (b.caps ??= Object.assign(hit.map(() => ({ ax: 0, ay: 0, az: 0, bx: 0, by: 0, bz: 0, r: 0, vx: 0, vy: 0, vz: 0 })), { n: 0 }));
      let n = 0;
      for (let i = 0; i < hit.length; i++) {
        const c = hit[i], o = cs[n++];
        o.ax = c.ax; o.ay = c.ay; o.az = c.az; o.bx = c.bx; o.by = c.by; o.bz = c.bz; o.r = c.r + (c.glove ? 0.08 + 0.12 * a.sk.reach + 0.25 * a.kReach : 0.03);   // тіло — точно; рукавиці трохи «прощаючі» (долоні, пальці), що більша дотяжка, то ширше
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
    const clean = this.deflectId !== this.shotId;                       // відскочив від тіла чи штанги — вже не удар, м'яч не йде крізь нападника (рикошет від борту удару не скасовує)
    const oppShot = clean && this.shotBy === -1 && this.bs === 'roll' && bs > 18;
    const mineSolid = !(clean && this.shotBy === 1 && this.bs === 'roll' && bs > 18 && this.shotOnTarget);   // удар у створ проходить між своїми (повільніший — приймають, controlScore), пас — ні
    for (let i = 0; i < this.mine.length; i++) { const a = this.mine[i]; a.body.on = !holding && mineSolid && a.cool <= 0 && !(a.ghostBall > 0) && (!a.manual || a.sliding || !!a.dive); }
    const stand = this.bs === 'ready' || this.bs === 'aim';
    for (let i = 0; i < this.opp.length; i++) { const a = this.opp[i]; a.body.on = (stand || !oppShot) && a.cool <= 0 && !(a.ghostBall > 0) && (!a.manual || a.sliding || !!a.dive); }
  }

  // ------------------------------------------------------------------ візуальна синхронізація
  /** Анімація гравців. У живій грі ті, кого камера зараз не бачить, рахуються ~30 разів на секунду (час не губиться, лише збирається). */
  animatePlayers(dt) {
    const cam = this.game.matchCam, lod = dt > 0 && this.phase === 'play' && !this.link && !this.rp && !this.hl;
    if (lod) _fr.setFromProjectionMatrix(_pv.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    for (let i = 0; i < this.actors.length; i++) {
      const a = this.actors[i], p = a.p;
      if (lod && !a.isGK && a !== this.holder && a !== this.taker && !a.receiver && !a.manual && !a.sliding && !a.dive && !p.downed && !p.rag) {
        _sp.center.set(p.x, 1, p.z);
        if (!_fr.intersectsSphere(_sp)) { p.lodT = (p.lodT || 0) + dt; if (p.lodT < 0.03) continue; const d = p.lodT; p.lodT = 0; p.animate(d); continue; }
      }
      const d = dt + (p.lodT || 0); p.lodT = 0; p.animate(d);
    }
  }

  syncView(dt) {
    const v = this.view, b = this.ball;
    const by = v.ball.group.position.y;                               // воротарі бачать м'яч: руки стежать за ним, ловлять і відбивають
    const vr = v.ball.rad;                                            // видимий радіус (здалеку м'яч збільшений): руки беруть саме такий м'яч
    this.mine[0].p.ballAt(b.x, by, b.z, vr); this.opp[0].p.ballAt(b.x, by, b.z, vr);
    if (dt > 0) this.slaps.update(dt);
    // дрібні «живі» рухи (поправити футболку, витерти піт, руки на коліна…) — у всіх, крім тих, хто зараз із м'ячем чи на прийомі
    for (let i = 0; i < this.actors.length; i++) { const a = this.actors[i]; a.p.fidget = !(a === this.holder || a === this.taker || a.receiver || a.manual || a.sliding || a.dive); }
    this.animatePlayers(dt);
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
      for (let k = 0; k < 2; k++) {
        const g = this.keepers[k], holding = (this.holder === g && (this.bs === 'ready' || this.bs === 'aim')) || (this.taker === g && this.bs === 'held');
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
        // у воротах межі немає: м'яч біля бічної сітки не вискакує за лінію
        if (Math.abs(gp.z) > G - 0.2 && Math.abs(b.x) <= L) { const xl = L - v.ball.rad; gp.x = Math.max(-xl, Math.min(xl, gp.x)); }
      }
    }
    v.updateShadows(rx, rz, h);
    this.netBulge(dt);
    v.stands.update(dt, this.time); v.weather.update(dt); v.surround.update(dt); v.pitch.decals.update(dt); v.pitch.boards.texture.offset.x = (this.time * 0.018) % 1;
    v.particles.update(dt);
    // кільце володіння — лише в живій грі (не в інтро, перерві, пенальті чи на фіналі)
    const live = (this.phase === 'paused' ? this.prevPhase : this.phase) === 'play';
    if (!live) { v.ring.visible = false; v.band.visible = false; }
    if (live && this.bs === 'ready') {
      const pr = this.danger;
      const k = 1.15 + Math.sin(this.time * (5 + pr * 8)) * 0.12;
      v.ring.visible = true; v.band.visible = false; v.ring.material.color.setHSL(0.36 * (1 - pr * pr), 0.55 + 0.3 * pr, 0.65 - 0.1 * pr);
      v.ring.position.set(b.x, 0.07, b.z); v.ring.scale.setScalar(k);
      if (pr > 0.62 && !this.pressWarn) { this.pressWarn = true; this.ui.hud.warn('ТИСК! БИЙ ЗАРАЗ'); }
      else if (pr < 0.45 && this.pressWarn) { this.pressWarn = false; this.ui.hud.warn(null); }
    } else if (this.pressWarn) { this.pressWarn = false; if (this.bs !== 'held') this.ui.hud.warn(null); }
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
  pause() { if (this.link) return; if (this.phase === 'play' || this.phase === 'intro' || this.phase === 'pens' || this.phase === 'break') { this.prevPhase = this.phase; this.phase = 'paused'; this.cancelAim(); audio.crowd(0.2); } }
  resume() { if (this.phase === 'paused') { this.phase = this.prevPhase; audio.crowd(this.slow ? 0.18 : 0.7); } }
  isPlaying() { return this.phase === 'play' || this.phase === 'intro' || this.phase === 'pens' || this.phase === 'break'; }

  /** Після фінального свистка: переможці збігаються до свого воротаря (кожен на своє місце довкола) і радіють; решта стоїть. */
  endCelebrate(dt) {
    const t = this.endT, pick = (a) => a[(Math.random() * a.length) | 0];
    for (const a of this.actors) {
      const r = a.endRole, p = a.p;
      if (r === 'pair' || r === 'talk') continue;
      if (r === 'hub') {
        // переможці збігаються в купу посеред своєї групи (воротар теж прибігає)
        const gk = this.endHub, i = this.endWin.indexOf(a), ang = i * Math.PI * 2 / Math.max(1, this.endWin.length - 1), rr = a.isGK ? 0 : 1.7, tx = gk.x + Math.cos(ang) * rr, tz = gk.z + Math.sin(ang) * rr;
        if (!a.endHug) {
          a.avx = a.avz = 0; a.move(tx, tz, 6.5, dt);
          const sp = Math.hypot(p.vx, p.vz); if (sp > 0.6) p.yaw = Math.atan2(p.vx, p.vz);
          const dh = Math.hypot(tx - p.x, tz - p.z);                    // далекий добігає, а не завмирає посеред поля з розгону
          if (dh < 1.0 || (t > 3.2 && dh < 3)) { a.endHug = true; p.yaw = Math.atan2(gk.x - p.x, gk.z - p.z); p.cheer(4); }
        } else { p.vx *= Math.exp(-dt * 6); p.vz *= Math.exp(-dt * 6); p.x += p.vx * dt; p.z += p.vz * dt; }
        continue;
      }
      if (r === 'fans' && t > a.endAt && t < a.endAt + 2.6) {
        // кілька кроків до найближчої трибуни, далі — оплески над головою чи помах
        const sz = (p.z >= 0 ? 1 : -1) * (W - 2); a.avx = a.avz = 0; a.move(p.x, sz, 1.4, dt);
        if (Math.hypot(p.vx, p.vz) > 0.4) p.yaw = Math.atan2(p.vx, p.vz);
        continue;
      }
      const k = Math.exp(-dt * 4); p.vx *= k; p.vz *= k; p.x += p.vx * dt; p.z += p.vz * dt;   // гальмує й стоїть
      if (p.mode === 'rest') p.vx = p.vz = 0;
      if (t < a.endAt + (r === 'fans' ? 2.6 : 0) || a.endDone || Math.hypot(p.vx, p.vz) > 1.2) continue;
      a.endDone = true;
      const lost = this.endLose && this.endLose.includes(a);
      if (r === 'sit') p.rest(p.persona.sitV);                         // кожен сідає й лягає по-своєму
      else if (r === 'lie') p.rest(p.persona.lieV);
      else if (r === 'knees') p.gesture(12, 9);
      else if (r === 'fans') { p.yaw = p.z >= 0 ? 0 : Math.PI; p.gesture(5, this.endWin && this.endWin.includes(a) ? pick([16, 5]) : 16); }
      else if (lost) p.sad(8, pick([5, 6, 0, 8, 1]));
      else p.gesture(5, pick([11, 12, 7]));                          // нічия: видихає, розминає шию, витирає піт
    }
  }

  /** По двоє до тунелю: ідуть поруч повільним кроком, говорить то один, то інший, слухач повертає голову до нього. */
  endTalk(dt) {
    if (!this.endTalks) return;
    const tz = this.view.tunnel.userData.startZ;
    for (const T of this.endTalks) {
      const { a, b } = T;
      if (this.endT < T.at) { for (const X of [a, b]) { const k = Math.exp(-dt * 4); X.p.vx *= k; X.p.vz *= k; X.p.x += X.p.vx * dt; X.p.z += X.p.vz * dt; } continue; }
      if (a.p.mode === 'sad' || a.p.mode === 'cheer') a.p.setMode('idle');
      if (b.p.mode === 'sad' || b.p.mode === 'cheer') b.p.setMode('idle');
      const mx = (a.p.x + b.p.x) / 2, mz = (a.p.z + b.p.z) / 2, dl = Math.hypot(mx, tz - mz) || 1, ux = -mx / dl, uz = (tz - mz) / dl, rx = uz, rz = -ux;
      const far = dl > 6;                                               // біля тунелю — зупиняються й договорюють
      for (const [X, sg] of [[a, T.sa], [b, -T.sa]]) {
        const tx = mx + (far ? ux * 2.5 : 0) + rx * 0.5 * sg, tzz = mz + (far ? uz * 2.5 : 0) + rz * 0.5 * sg;
        X.avx = X.avz = 0; X.move(tx, tzz, far ? 1.5 : 1.0, dt);
        if (Math.hypot(X.p.vx, X.p.vz) > 0.4) X.p.yaw = Math.atan2(X.p.vx, X.p.vz);
      }
      T.swT -= dt;
      if (T.swT <= 0) { T.spk ^= 1; T.swT = 1.6 + Math.random() * 1.8; (T.spk ? b : a).p.gesture(T.swT, 44); }
      const S = T.spk ? b : a, Lr = S === a ? b : a;
      Lr.p.engage(Math.atan2(S.p.x - Lr.p.x, S.p.z - Lr.p.z), 0, 0.55);   // слухає — дивиться на того, хто говорить
      S.p.engage(Math.atan2(Lr.p.x - S.p.x, Lr.p.z - S.p.z), 0, 0.3);
    }
  }

  end() {
    const spec = this.spec, me = this.score.me, opp = this.score.opp;
    const outcome = this.penRes ? (this.penRes.win ? 'win' : 'loss') : me > opp ? 'win' : me < opp ? 'loss' : 'draw';
    this.phase = 'end'; this.endT = 0; this.resultSent = false; this.cancelAim(); this.hideAim(); this.telegraph = false; this.setGaze(true);   // пунктир замаху суперника не лишається на фінал
    this.ui.hud.warn(null); this.ui.hud.clearGoal();
    this.clearSlow(); audio.whistle(true); audio.crowd(0.35);
    const win = outcome === 'win';
    this.endWin = outcome === 'draw' ? null : win ? this.mine : this.opp; this.endLose = outcome === 'draw' ? null : win ? this.opp : this.mine;
    for (const a of this.actors) { a.endHug = false; a.manual = false; a.frozen = 0; }
    this.endPairs = null; this.endFeat = null; this.endHub = null; this.ui.hud.cine(true, 'КІНЕЦЬ МАТЧУ');
    this.ui.hud.addedTime(null);
    this.ui.hud.scoreCard({ title: 'Фінальний свисток', me, opp, scorers: this.scorers, pens: this.penRes, note: outcome === 'win' ? 'Перемога' : outcome === 'loss' ? 'Поразка' : 'Нічия', final: true }, END_T - 1.2);
    if (this.endWin) {
      let hx = 0, hz = 0; for (let i = 1; i < this.endWin.length; i++) { hx += this.endWin[i].p.x; hz += this.endWin[i].p.z; }
      this.endHub = { x: clamp(hx / 10, -L * 0.6, L * 0.6), z: clamp(hz / 10, -W * 0.6, W * 0.6) };
      for (let i = 0; i < this.endLose.length; i++) this.endLose[i].p.sad(5);
    }
    this.assignEndRoles();
    if (win) this.view.stands.react('wave'); else if (outcome === 'loss') this.view.stands.react('groan');
    if (this.holder) this.holder.manual = false;
    if (this.spec.online) {                                        // онлайн не чіпає кар'єру: нагороди — онлайн-клубу (session.js)
      this.result = { online: true, outcome, me, opp, spec, scorers: this.scorers.slice() };
      if (win) audio.win(); else if (outcome === 'loss') audio.lose();
      return;
    }

    const lines = [];
    const base = Math.round((win ? 120 : outcome === 'draw' ? 45 : 20) * spec.scale);
    lines.push({ label: win ? 'Перемога' : outcome === 'draw' ? 'Нічия' : 'Участь', value: base });
    lines.push({ label: 'Голи та рикошети', value: this.coins });
    let sub = base + this.coins, cup = false;
    if (win && spec.final) { cup = true; const cb = Math.round(300 * spec.scale); lines.push({ label: spec.cupName, value: cb }); sub += cb; }
    const mult = incomeMult(), bonus = Math.round(sub * (mult - 1));
    if (bonus > 0) lines.push({ label: 'Дохід стадіону й академії', value: bonus });
    const total = sub + bonus;

    S.coins += total;
    for (let i = 0; i < 11; i++) { const e = S.squad[i]; e.apps++; e.goals += this.goalsBy[i]; gainXp(e, this.xp[i] + 10 + (win ? 20 : 0), this.levelUps); }
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
      if (!newSeason && FIXTURES[S.fixture].league !== prevLeague) promoted = FIXTURES[S.fixture].league;
    }
    S.tickets += tickets;
    S.academy.progress = Math.min(ACADEMY.need, S.academy.progress + (win ? 2 : 1));
    if (S.academy.progress >= ACADEMY.need) S.academy.ready = true;
    commit();
    recordMatch(spec, me, opp, this.scoutLog, outcome); commit();
    this.result = { pens: this.penRes, outcome, me, opp, spec, scorers: this.scorers.slice(), lines, total, tickets, cup, promoted, newSeason, academyReady: S.academy.ready, stats: this.stats, levelUps: this.levelUps, chapter };
    if (win) audio.win(); else if (outcome === 'loss') audio.lose();
  }

  exit() {
    if (this.link) { this.link.uninstall(); this.link = null; }
    this.phase = 'idle'; this.cancelAim(); this.game.renderer.toneMappingExposure = 1.1;
    this.rp = null; this.brk = null; this.ui.hud.cine(false); this.walk.hide();
    if (this.pens) { this.pens.dispose(); this.pens = null; }   // вихід посеред серії: панель пенальті й клавіші не лишаються в меню
    for (const a of this.actors) a.p.root.visible = true;
    if (this.slow) { this.slow = false; this.ui.setSlow(false); }
    this.view.particles.clear();
    audio.crowd(0);
  }
}
