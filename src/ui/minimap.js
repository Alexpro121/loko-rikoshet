// Мінімапа матчу: Minimap малює поле, гравців, напрямок бігу й траєкторію м'яча; MapHud ставить її на екран і веде режим перетягування.
// Читає лише сцену (view.players, view.ball), тож однаково працює в Match і GuestMatch і нічого не шле мережею.
import * as THREE from 'three';
import { PITCH } from '../config.js';
import { camPreset } from '../core/camera.js';
import { vibrate } from '../core/audio.js';
import { S, commit } from '../state/save.js';
import { myKit, matchKit } from '../state/squad.js';
import { DemoMatch } from './minimap-demo.js';

const { L, W, G, GOAL_D } = PITCH;
const LONG_M = GOAL_D + 1, SIDE_M = 1;                  // запас навколо поля на мапі (од.): ворота й гравці за лінією
const ASPECT = (2 * L + 2 * LONG_M) / (2 * W + 2 * SIDE_M);
const SAMPLE = 0.05;                                    // крок запису руху, с ігрового часу
const BALL_CAP = 30;                                    // траєкторія м'яча: останні 1.5 с
const BANDS = 5;                                        // лінія згасає смугами: одна смуга — один stroke
const BAND_A = [0.8, 0.56, 0.36, 0.2, 0.09];
const LOOK_AHEAD = 0.9;                                 // пунктир «куди біжить»: положення за стільки секунд на нинішній швидкості
const BALL_AHEAD = 0.6;                                 // пунктир «куди летить» м'яч
const BREAK_D2 = 16;                                    // гравець зрушив більш ніж на 4 од. за крок: це не біг, а розстановка
const BALL_BREAK_D2 = 100;                              // м'яч — більш ніж на 10 од.: його поставили на нове місце, лінію рвемо
const HOLD_D2 = 2.56, KICK_V2 = 121;                    // м'яч у межах 1.6 од. від гравця й не швидший за 11 од./с — він при нозі, це не політ
const DASH = [2, 3], SOLID = [];
const DRAW_T = 1 / 30, DRAW_T_LOW = 1 / 20;
const SNAP_PX = 14;
const NOTCH = [0, 0.5, 1];
const DEF_POS = { x: 1, y: 0 };                         // правий верхній кут, одразу під кнопкою паузи
const MIN_BAND = 60;                                    // мапа не менша за стільки пікселів: нижче її вже не прочитати
const FADE = 0.3;                                       // м'яч під мапою: вона майже зникає, щоб не закривати гру

const _v = new THREE.Vector3();
const CORNERS = [-1, -1, 1, -1, 1, 1, -1, 1];
// готові місця на схемі екрана; by — що саме мапа обходить, коли стоїть там
const SPOTS = [
  { x: 0, y: 0, name: 'Зліва вгорі' }, { x: 1, y: 0, name: 'Справа вгорі' }, { x: 0.5, y: 1, name: 'Знизу по центру' },
  { x: 0, y: 1, name: 'Зліва внизу' }, { x: 1, y: 1, name: 'Справа внизу' },
];
const AVOID = { bug: 'під табло', pause: 'під кнопкою паузи', card: 'над карткою гравця', joy: 'над джойстиком' };

const rgb = (h) => { const n = parseInt(String(h).slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const hex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const mix = (h, t, k) => { const a = rgb(h), b = rgb(t); return hex(a.map((v, i) => v + (b[i] - v) * k)); };
const lum = (h) => { const c = rgb(h); return (0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]) / 255; };
const near = (a, b) => { const p = rgb(a), q = rgb(b); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) < 110; };
/** Темна форма на темному полі зникла б: підсвічуємо до читабельної яскравості. */
const readable = (h) => { const l = lum(h); return l < 0.42 ? mix(h, '#ffffff', Math.min(0.6, (0.42 - l) * 1.6)) : h; };
const kitHex = (k, d) => (k && /^#[0-9a-f]{6}$/i.test(k.main) ? k.main : d);

export class Minimap {
  constructor() {
    this.px = new Float32Array(22); this.pz = new Float32Array(22); this.vis = new Uint8Array(22);   // 0–10 свої, 11–21 суперники; свої завжди атакують +X
    this.bt = new Float32Array(BALL_CAP * 2);
    this.vx = new Float32Array(11); this.vz = new Float32Array(11);
    this.lx = new Float32Array(11); this.lz = new Float32Array(11);
    this.quad = new Float32Array(8);
    this.head = 0; this.cnt = 0; this.acc = 0; this.demoT = 0; this.sampT = 0; this.blx = NaN; this.blz = 0; this.bvx = 0; this.bvz = 0;
    this.bx = 0; this.bz = 0; this.by = 0;
    this.w = 0; this.h = 0; this.vert = false; this.dpr = 1;
    this.layer = null; this.cv = null; this.g = null; this.sim = null;
    this.setKits('#d4202c', '#2b6fd6');
  }

  attach(cv) { if (cv === this.cv) return; this.cv = cv; this.g = cv.getContext('2d'); this.w = 0; }

  setKits(own, opp) {
    own = readable(own); opp = readable(opp);
    if (near(own, opp)) opp = lum(own) > 0.7 ? '#ffb020' : '#f1efe8';   // однакові форми: суперник стає контрастним
    this.own = own; this.opp = opp; this.line = mix(own, '#ffffff', 0.55);
  }

  /** Новий розмір або орієнтація: поле перемальовуємо один раз у запасний канвас, далі лише копіюємо. */
  resize(w, h, vert) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (w === this.w && h === this.h && vert === this.vert && dpr === this.dpr) return;
    this.w = w; this.h = h; this.vert = vert; this.dpr = dpr;
    this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr);
    this.k = (vert ? h : w) / (2 * L + 2 * LONG_M);
    this.r = Math.max(2.5, Math.max(w, h) * 0.0165);
    this.bake();
  }

  sx(x, z) { return this.vert ? (z + W + SIDE_M) * this.k : (x + L + LONG_M) * this.k; }
  sy(x, z) { return this.vert ? (L + LONG_M - x) * this.k : (z + W + SIDE_M) * this.k; }

  bake() {
    const c = this.layer ??= document.createElement('canvas');
    c.width = this.cv.width; c.height = this.cv.height;
    const g = c.getContext('2d'), s = this.dpr;
    g.setTransform(s, 0, 0, s, 0, 0);
    g.fillStyle = '#0c2d1f'; g.fillRect(0, 0, this.w, this.h);
    const strip = (x0, x1, col) => {
      const ax = this.sx(x0, -W), ay = this.sy(x0, -W), bx = this.sx(x1, W), by = this.sy(x1, W);
      g.fillStyle = col; g.fillRect(Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay));
    };
    for (let i = 0; i < 10; i++) strip(-L + i * L / 5, -L + (i + 1) * L / 5, i % 2 ? '#17543a' : '#134a32');
    const pts = (a) => { g.beginPath(); for (let i = 0; i < a.length; i += 2) { const x = this.sx(a[i], a[i + 1]), y = this.sy(a[i], a[i + 1]); if (i) g.lineTo(x, y); else g.moveTo(x, y); } g.stroke(); };
    const lw = Math.max(1, Math.max(this.w, this.h) * 0.005);
    g.lineWidth = lw; g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineJoin = 'round';
    const X = L - 0.9, Z = W - 0.9;
    pts([-X, -Z, X, -Z, X, Z, -X, Z, -X, -Z]); pts([0, -Z, 0, Z]);
    for (let sd = -1; sd <= 1; sd += 2) {
      pts([sd * X, -19, sd * (L - 15.6), -19, sd * (L - 15.6), 19, sd * X, 19]);
      pts([sd * X, -8.6, sd * (L - 5.2), -8.6, sd * (L - 5.2), 8.6, sd * X, 8.6]);
    }
    g.beginPath(); g.arc(this.sx(0, 0), this.sy(0, 0), 8.7 * this.k, 0, Math.PI * 2); g.stroke();
    // ворота: наші стримані, чужі золоті; шеврони — куди ми атакуємо
    g.lineWidth = lw * 1.8;
    g.strokeStyle = 'rgba(255,255,255,0.55)'; pts([-L, -G, -L - GOAL_D, -G, -L - GOAL_D, G, -L, G]);
    g.strokeStyle = '#e3b33a'; pts([L, -G, L + GOAL_D, -G, L + GOAL_D, G, L, G]);
    g.lineWidth = lw; g.strokeStyle = 'rgba(255,255,255,0.2)';
    for (let i = 0; i < 2; i++) { const x = 26 + i * 6; pts([x, -5, x + 4, 0, x, 5]); }
  }

  reset() { this.head = 0; this.cnt = 0; this.sampT = 0; this.blx = NaN; this.bvx = this.bvz = 0; this.vx.fill(0); this.vz.fill(0); this.lx.fill(NaN); }

  /** Позиції зі сцени. Гість бачить поле навпаки й грає за другу половину списку. */
  read(m, game) {
    const P = m.view.players, fl = game.flipCam, sg = fl ? -1 : 1, from = fl ? 11 : 0, n = Math.min(P.length, 22);
    for (let i = 0; i < n; i++) {
      const r = P[(i + from) % n].root;
      this.px[i] = r.position.x * sg; this.pz[i] = r.position.z * sg; this.vis[i] = r.visible ? 1 : 0;
    }
    const b = m.view.ball.group.position;
    this.bx = b.x * sg; this.bz = b.z * sg; this.by = b.y;
    // що зараз у кадрі: чотири кути екрана, опущені на газон
    const cam = game.matchCam, o = cam.position;
    for (let i = 0; i < 4; i++) {
      _v.set(CORNERS[i * 2], CORNERS[i * 2 + 1], 0.5).unproject(cam);
      const dy = Math.min(_v.y - o.y, -1e-3), t = -o.y / dy;
      this.quad[i * 2] = Math.max(-300, Math.min(300, o.x + (_v.x - o.x) * t)) * sg;
      this.quad[i * 2 + 1] = Math.max(-300, Math.min(300, o.z + (_v.z - o.z) * t)) * sg;
    }
  }

  /** Маленька гра для зразка в налаштуваннях і перетягування в меню. */
  demo(dt) { (this.sim ??= new DemoMatch(this)).step(dt); }

  /** Рух пишемо в ігровому часі: у сповільненні, поки цілишся, лінія м'яча не стискається в крапку. */
  sample(dt) {
    this.sampT += dt;
    if (this.sampT < SAMPLE) return;
    const el = this.sampT; this.sampT = 0;
    for (let p = 0; p < 11; p++) {
      const x = this.px[p], z = this.pz[p], had = this.vis[p] && this.lx[p] === this.lx[p];
      const dx = had ? x - this.lx[p] : 0, dz = had ? z - this.lz[p] : 0;
      if (!had || dx * dx + dz * dz > BREAK_D2) this.vx[p] = this.vz[p] = 0;
      else { this.vx[p] += (dx / el - this.vx[p]) * 0.2; this.vz[p] += (dz / el - this.vz[p]) * 0.2; }
      this.lx[p] = this.vis[p] ? x : NaN; this.lz[p] = z;
    }
    // м'яч: лише справжній політ — пас, удар, відскок; коли його ведуть, лінії немає
    const had = this.blx === this.blx, dx = had ? this.bx - this.blx : 0, dz = had ? this.bz - this.blz : 0, d2 = dx * dx + dz * dz, jump = d2 > BALL_BREAK_D2;
    const held = d2 / (el * el) < KICK_V2 && this.nearBall(22) >= 0;
    const h = this.head = (this.head + 1) % BALL_CAP;
    if (this.cnt < BALL_CAP) this.cnt++;
    if (jump || held) { this.bt[h * 2] = NaN; this.bvx = this.bvz = 0; } else {
      this.bt[h * 2] = this.bx; this.bt[h * 2 + 1] = this.bz;
      if (had) { this.bvx += (dx / el - this.bvx) * 0.5; this.bvz += (dz / el - this.bvz) * 0.5; }
    }
    this.blx = this.bx; this.blz = this.bz;
  }

  tick(dt, m, game) {
    this.acc += dt;
    if (this.acc < (game && game.level === 0 || S.settings.quality === 'low' ? DRAW_T_LOW : DRAW_T)) return;
    const el = this.acc; this.acc = 0;
    if (m) {
      this.read(m, game);
      if (m.phase !== 'paused') this.sample(el * (m.ts ?? (m.slow ? 0.3 : 1)));
    } else { this.demo(el); this.sample(el); }
    this.draw();
  }

  draw() {
    const g = this.g, st = S.settings, s = this.dpr; if (!g || !this.w) return;
    g.setTransform(s, 0, 0, s, 0, 0);
    g.globalAlpha = 1;
    g.drawImage(this.layer, 0, 0, this.w, this.h);
    if (st.mapCam) this.drawView(g);
    if (st.mapRun) this.drawRuns(g, st);
    if (st.mapBall) this.drawBallPath(g, st);
    g.globalAlpha = 1;
    if (st.mapOpp) this.drawTeam(g, 11, 22, this.opp, this.r * 0.84, 'rgba(0,0,0,0.65)');
    this.drawTeam(g, 0, 11, this.own, this.r, '#ffffff');
    this.drawBall(g, st);
  }

  drawView(g) {
    const q = this.quad;
    g.beginPath();
    for (let i = 0; i < 4; i++) { const x = this.sx(q[i * 2], q[i * 2 + 1]), y = this.sy(q[i * 2], q[i * 2 + 1]); if (i) g.lineTo(x, y); else g.moveTo(x, y); }
    g.closePath();
    g.fillStyle = '#ffffff'; g.globalAlpha = 0.055; g.fill();
    g.strokeStyle = '#ffffff'; g.lineWidth = 1; g.globalAlpha = 0.2; g.stroke();
    g.globalAlpha = 1;
  }

  /** Куди біжать свої зараз: короткий пунктир уперед, за гравцем нічого не лишається. */
  drawRuns(g, st) {
    g.strokeStyle = this.line; g.lineWidth = Math.max(1, this.r * 0.42); g.lineCap = 'round';
    g.globalAlpha = st.mapTrailA / 100 * 0.7; g.setLineDash(DASH);
    g.beginPath();
    for (let p = 1; p < 11; p++) {
      const vx = this.vx[p], vz = this.vz[p];
      if (!this.vis[p] || vx * vx + vz * vz < 4) continue;
      const x = this.px[p], z = this.pz[p];
      g.moveTo(this.sx(x, z), this.sy(x, z));
      g.lineTo(this.sx(x + vx * LOOK_AHEAD, z + vz * LOOK_AHEAD), this.sy(x + vx * LOOK_AHEAD, z + vz * LOOK_AHEAD));
    }
    g.stroke(); g.setLineDash(SOLID);
  }

  /** Траєкторія м'яча: звідки летить (згасає) і короткий пунктир, куди летить. */
  drawBallPath(g, st) {
    const a0 = st.mapTrailA / 100, bt = this.bt, n = this.cnt;
    g.strokeStyle = '#ffffff'; g.lineWidth = Math.max(1, this.r * 0.36); g.lineCap = 'round'; g.lineJoin = 'round';
    for (let b = 0; b < BANDS; b++) {
      const from = Math.floor(n * b / BANDS), to = Math.min(n - 1, Math.floor(n * (b + 1) / BANDS));
      let pen = false;
      g.globalAlpha = a0 * BAND_A[b];
      g.beginPath();
      for (let i = from; i <= to; i++) {
        const k = ((this.head - i + BALL_CAP) % BALL_CAP) * 2, x = bt[k], z = bt[k + 1];
        if (x !== x) { pen = false; continue; }
        if (b === 0 && i === 0) { g.moveTo(this.sx(this.bx, this.bz), this.sy(this.bx, this.bz)); pen = true; }
        const ax = this.sx(x, z), ay = this.sy(x, z);
        if (pen) g.lineTo(ax, ay); else g.moveTo(ax, ay);
        pen = true;
      }
      g.stroke();
    }
    const vx = this.bvx, vz = this.bvz;
    if (vx * vx + vz * vz > 25) {
      g.globalAlpha = a0 * 0.7; g.setLineDash(DASH);
      g.beginPath();
      g.moveTo(this.sx(this.bx, this.bz), this.sy(this.bx, this.bz));
      g.lineTo(this.sx(this.bx + vx * BALL_AHEAD, this.bz + vz * BALL_AHEAD), this.sy(this.bx + vx * BALL_AHEAD, this.bz + vz * BALL_AHEAD));
      g.stroke(); g.setLineDash(SOLID);
    }
  }

  drawTeam(g, a, b, col, r, edge) {
    g.fillStyle = col; g.strokeStyle = edge; g.lineWidth = Math.max(1, r * 0.34);
    g.beginPath();
    for (let i = a; i < b; i++) {
      if (!this.vis[i]) continue;
      const x = this.sx(this.px[i], this.pz[i]), y = this.sy(this.px[i], this.pz[i]);
      if (i === a) g.rect(x - r, y - r, r * 2, r * 2);   // воротар — квадрат, його видно з першого погляду
      else { g.moveTo(x + r, y); g.arc(x, y, r, 0, Math.PI * 2); }
    }
    g.fill(); g.stroke();
  }

  nearBall(lim) {
    let best = HOLD_D2, who = -1;
    for (let i = 0; i < lim; i++) { if (!this.vis[i]) continue; const dx = this.px[i] - this.bx, dz = this.pz[i] - this.bz, d = dx * dx + dz * dz; if (d < best) { best = d; who = i; } }
    return who;
  }

  drawBall(g, st) {
    const x = this.sx(this.bx, this.bz), y = this.sy(this.bx, this.bz), r = Math.max(2, this.r * 0.8) * (1 + Math.min(0.8, Math.max(0, this.by - 0.3) * 0.09));   // високий м'яч трохи більший
    // хто з м'ячем: кільце навколо найближчого гравця, якщо він справді при м'ячі
    const who = this.nearBall(st.mapOpp ? 22 : 11);
    if (who >= 0) {
      g.strokeStyle = '#ffe28a'; g.lineWidth = Math.max(1, this.r * 0.4);
      g.beginPath(); g.arc(this.sx(this.px[who], this.pz[who]), this.sy(this.px[who], this.pz[who]), this.r + g.lineWidth * 1.4, 0, Math.PI * 2); g.stroke();
    }
    g.fillStyle = '#ffffff'; g.strokeStyle = '#0a241b'; g.lineWidth = 1;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.stroke();
  }
}

/** Мапа на екрані: розмір і місце з налаштувань, обхід табло, паузи, картки й джойстика, режим перетягування. */
export class MapHud {
  constructor(root, ui) {
    this.ui = ui; this.root = root;
    root.insertAdjacentHTML('afterbegin', `
<div class="map-zones" id="map-zones"><i class="z-bug"><span>ТАБЛО</span></i><i class="z-pause"><span>ПАУЗА</span></i><i class="z-card"><span>КАРТКА ГРАВЦЯ</span></i><i class="z-joy"><span>ДЖОЙСТИК</span></i></div>
<div class="mmap off" id="mmap"><canvas></canvas></div>
<div class="map-bar joy-bar" id="map-bar" hidden><span>Перетягни мапу</span><div class="rng"><label>Розмір<output id="map-bar-size"></output></label><input type="range" min="60" max="170" step="5" data-range="mapSize" aria-label="Розмір мінімапи"/></div><button class="btn alt" data-act="map-reset"><b>СКИНУТИ</b></button><button class="btn go" data-act="map-done"><b>ГОТОВО</b></button></div>`);
    const q = (id) => root.querySelector('#' + id);
    this.el = q('mmap'); this.zones = q('map-zones'); this.bar = q('map-bar');
    this.z = { bug: this.zones.querySelector('.z-bug'), pause: this.zones.querySelector('.z-pause'), card: this.zones.querySelector('.z-card'), joy: this.zones.querySelector('.z-joy') };
    this.mm = new Minimap(); this.mm.attach(this.el.querySelector('canvas'));
    this.prev = null; this.prevOn = false;
    this.shown = false; this.want = false; this.editing = false; this.fade = 1; this.alpha = -1;
    this.rect = { l: 0, t: 0, w: 0, h: 0, by: '' };
    this.planPos = null;
    this.drag = -1; this.dx = 0; this.dy = 0; this.snap = '';
    this.initDrag();
    addEventListener('resize', () => this.apply());
  }

  /** Змінились налаштування, розмір вікна чи стан матчу. */
  apply(want = this.want) {
    this.want = want;
    const on = this.editing || (want && S.settings.mapOn);
    if (on && !this.shown) { this.mm.reset(); this.setKits(); }
    this.shown = on;
    this.el.classList.toggle('off', !on);
    if (on) this.layout();
    this.applyAlpha();
    this.root.style.setProperty('--map-a', (S.settings.mapAlpha / 100).toFixed(2));
    if (this.editing) this.syncBar();
  }

  setKits() {
    const sp = this.ui.hud.spec, live = this.ui.matchActive && sp;
    if (!live) { this.mm.setKits(kitHex(myKit(), '#d4202c'), '#2b6fd6'); return; }
    this.mm.setKits(kitHex(sp.home ? sp.home.kit : matchKit(sp.club), '#d4202c'), kitHex(sp.club && sp.club.kit, '#2b6fd6'));
  }

  applyAlpha() {
    const a = this.shown ? S.settings.mapAlpha / 100 * (this.editing ? 1 : this.fade) : -1;
    if (a !== this.alpha) { this.alpha = a; this.el.style.opacity = a < 0 ? '' : a; }
  }

  /** Місце задане часткою вільного простору (0 — лівий/верхній край, 1 — правий/нижній): кути лишаються кутами на будь-якому екрані. */
  layout() {
    const st = S.settings, vw = innerWidth, vh = innerHeight, u = Math.min(vh * 0.01, vw * 0.007);
    this.placeJoyZone(u);
    const r = this.compute(st.mapX, st.mapY, this.rect), s = this.el.style;
    s.left = r.l + 'px'; s.top = r.t + 'px'; s.width = r.w + 'px'; s.height = r.h + 'px';
    this.mm.resize(r.w, r.h, r.vert);
    if (this.editing) this.bar.classList.toggle('low', r.t < vh * 0.34 && r.l + r.w > vw * 0.2 && r.l < vw * 0.8);
  }

  /** Де реально стане мапа з цим місцем: той самий розрахунок для гри й для схеми екрана в налаштуваннях. */
  compute(x, y, out) {
    const st = S.settings, vw = innerWidth, vh = innerHeight, u = Math.min(vh * 0.01, vw * 0.007);
    const safe = this.zones.getBoundingClientRect(), vert = camPreset(st.camMode, vw / vh).yaw !== 0;
    let long = Math.max(150, Math.min(46 * u, 320)) * st.mapSize / 100;
    long = Math.min(long, (vert ? safe.height : safe.width) * 0.62, (vert ? safe.width : safe.height) * 0.62 * ASPECT);
    long = Math.round(long);
    let short = Math.round(long / ASPECT), w = vert ? short : long, h = vert ? long : short;
    let l = safe.left + x * Math.max(0, safe.width - w);
    let t = safe.top + y * Math.max(0, safe.height - h), by = '';
    const gap = u * 1.2;
    const hit = (z) => z.width > 0 && l < z.right && l + w > z.left && t < z.bottom && t + h > z.top;
    // табло й пауза зверху, картка й джойстик знизу: мапа стає поруч, а не поверх них
    for (const k of ['bug', 'pause']) { const z = this.z[k].getBoundingClientRect(); if (hit(z)) { t = z.bottom + gap; by = k; } }
    for (const k of ['card', 'joy']) { const z = this.z[k].getBoundingClientRect(); if (hit(z)) { t = z.top - gap - h; by = k; } }
    // обхід знизу повернув мапу на верхні зони: між ними менше місця, ніж її висота, тож вона зменшується до цієї смуги. Збережені розмір і місце не міняються
    let top = -Infinity, bottom = safe.bottom;
    for (const k of ['bug', 'pause']) { const z = this.z[k].getBoundingClientRect(); if (hit(z)) top = Math.max(top, z.bottom + gap); }
    if (top > -Infinity) {
      for (const k of ['card', 'joy']) { const z = this.z[k].getBoundingClientRect(); if (z.width > 0 && l < z.right && l + w > z.left) bottom = Math.min(bottom, z.top - gap); }
      if (bottom - top >= MIN_BAND) {
        h = Math.min(h, Math.round(bottom - top)); w = Math.round(vert ? h / ASPECT : h * ASPECT);
        l = safe.left + x * Math.max(0, safe.width - w); t = top;
      }
    }
    t = Math.max(safe.top, Math.min(safe.bottom - h, t));
    return Object.assign(out || {}, { l, t, w, h, vert, by });
  }

  /** Схема екрана для налаштувань: HUD, п'ять готових місць і мапа там, де вона стоїть насправді. */
  planHtml() {
    const st = S.settings, vw = innerWidth, vh = innerHeight;
    this.placeJoyZone(Math.min(vh * 0.01, vw * 0.007));
    const pos = (r) => `left:${(r.left ?? r.l) / vw * 100}%;top:${(r.top ?? r.t) / vh * 100}%;width:${(r.width ?? r.w) / vw * 100}%;height:${(r.height ?? r.h) / vh * 100}%`;
    const zone = (k, cls, label) => { const z = this.z[k].getBoundingClientRect(); return z.width ? `<i class="ms-z ${cls}" style="${pos(z)}">${label}</i>` : ''; };
    const cur = this.compute(st.mapX, st.mapY), spot = SPOTS.find((p) => p.x === st.mapX && p.y === st.mapY);
    const spots = SPOTS.map((p) => {
      const r = this.compute(p.x, p.y), by = r.by ? ', ' + AVOID[r.by] : '';
      return `<button class="ms-spot ${p === spot ? 'on' : ''}" style="${pos(r)}" data-act="map-at:${p.x},${p.y}" aria-label="${p.name}${by}" title="${p.name}${by}"></button>`;
    }).join('');
    const say = spot ? spot.name + (cur.by ? ', ' + AVOID[cur.by] : '') : 'Своє місце';
    this.planTo = pos(cur);
    return `<div class="map-screen" style="--r:${(vw / vh).toFixed(3)}">${zone('bug', 'ms-bug', 'табло')}${zone('pause', 'ms-pause', '')}${zone('card', 'ms-card', 'картка')}${zone('joy', 'ms-joy', '')}${spots}<b class="ms-cur" id="ms-cur" style="${this.planPos || this.planTo}"></b></div><small class="map-say">${say}</small>`;
  }

  /** Повзунок розміру: схема оновлюється, решта сторінки не чіпається. */
  refreshPlan(host) {
    const e = host.querySelector('#map-plan'); if (!e) return;
    e.innerHTML = this.planHtml(); this.animatePlan(host);
  }

  /** Мапа на схемі пливе зі старого місця на нове: одразу видно, куди вона пересунулась. */
  animatePlan(host) {
    const e = host.querySelector('#ms-cur'); if (!e) return;
    void e.offsetWidth;
    e.style.cssText = this.planTo;
    this.planPos = this.planTo;
  }

  /** Місце джойстика на схемі збігається зі справжнім, зокрема після його перетягування. */
  placeJoyZone(u) {
    const st = S.settings, e = this.z.joy, s = e.style, box = this.zones.getBoundingClientRect();
    e.hidden = !this.ui.useJoy();
    const size = u * 32 * st.joySize / 100;
    s.width = s.height = size + 'px';
    if (st.joyX >= 0 && st.joyY >= 0) { const c = this.ui.joyCenter(st.joyX, st.joyY); s.left = c.x - box.left - size / 2 + 'px'; s.top = c.y - box.top - size / 2 + 'px'; s.right = s.bottom = 'auto'; }
    else { const left = st.hand === 'left'; s.left = left ? u * 1.2 + 'px' : 'auto'; s.right = left ? 'auto' : u * 1.2 + 'px'; s.top = 'auto'; s.bottom = u * 1.2 + 'px'; }
  }

  /** Щокадру з ігрового циклу (Game.tick). */
  update(dt) {
    const ui = this.ui, g = ui.game;
    if (this.shown) {
      const m = ui.matchActive ? g.match : null;
      this.mm.tick(dt, m || null, g);
      if (m && !this.editing) this.ballCheck(m, g);
    }
    if (this.prevOn) {
      if (!this.prev.cv || !this.prev.cv.isConnected || ui.el.settings.hidden) this.prevOn = false;
      else this.prev.tick(dt, null, g);
    }
  }

  /** М'яч зайшов під мапу на екрані: вона стає майже прозорою, поки він там. */
  ballCheck(m, g) {
    const r = this.rect, pad = 24;
    _v.copy(m.view.ball.group.position).project(g.matchCam);
    const x = (_v.x + 1) * 0.5 * g.w, y = (1 - _v.y) * 0.5 * g.h;
    const f = x > r.l - pad && x < r.l + r.w + pad && y > r.t - pad && y < r.t + r.h + pad ? FADE : 1;
    if (f !== this.fade) { this.fade = f; this.applyAlpha(); }
  }

  /** Живий зразок на вкладці налаштувань. */
  bindPreview(cv) {
    if (!cv) { this.prevOn = false; return; }
    this.prev ??= new Minimap();
    this.prev.attach(cv); this.prev.setKits(kitHex(myKit(), '#d4202c'), '#2b6fd6');
    this.prevOn = true;
    this.fitPreview();
  }
  /** Зразок живе в розмітці сторінки: новий розмір вікна — новий буфер канви, інакше картинка розтягнута. */
  fitPreview() {
    if (!this.prevOn || !this.prev.cv.isConnected || this.ui.el.settings.hidden) return;
    const cv = this.prev.cv; this.prev.resize(cv.offsetWidth || 240, cv.offsetHeight || 150, false);
  }

  place(x, y) { S.settings.mapX = x; S.settings.mapY = y; commit(); this.apply(); }
  resetPlace() { S.settings.mapSize = 100; this.place(DEF_POS.x, DEF_POS.y); }

  setEdit(on) {
    this.editing = on; this.drag = -1;
    this.el.classList.toggle('edit', on); this.zones.classList.toggle('on', on);
    this.bar.hidden = !on; this.fade = 1;
    this.apply();
  }
  syncBar() {
    this.bar.querySelector('input').value = S.settings.mapSize;
    this.bar.querySelector('output').textContent = S.settings.mapSize + '%';
  }

  initDrag() {
    const el = this.el;
    el.addEventListener('pointerdown', (e) => {
      if (!this.editing) return;
      this.drag = e.pointerId; this.dx = e.clientX - this.rect.l; this.dy = e.clientY - this.rect.t;
      this.snap = '';
      try { el.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      el.classList.add('held'); e.preventDefault();
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.drag) return;
      const safe = this.zones.getBoundingClientRect(), r = this.rect, fw = Math.max(1, safe.width - r.w), fh = Math.max(1, safe.height - r.h);
      let x = (e.clientX - this.dx - safe.left) / fw, y = (e.clientY - this.dy - safe.top) / fh;
      x = Math.max(0, Math.min(1, x)); y = Math.max(0, Math.min(1, y));
      // прилипає до країв і центру: кути й середини знаходяться самі
      let key = '';
      for (let i = 0; i < 3; i++) {
        if (Math.abs(x - NOTCH[i]) * fw < SNAP_PX) { x = NOTCH[i]; key += 'x' + i; }
        if (Math.abs(y - NOTCH[i]) * fh < SNAP_PX) { y = NOTCH[i]; key += 'y' + i; }
      }
      if (key !== this.snap) { this.snap = key; if (key) vibrate(8); el.classList.toggle('snapped', !!key); }
      S.settings.mapX = x; S.settings.mapY = y;
      this.layout();
    });
    const up = (e) => {
      if (e.pointerId !== this.drag) return;
      this.drag = -1; el.classList.remove('held', 'snapped'); commit(); this.layout();
    };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', (e) => {
      if (!this.editing) return;
      e.preventDefault();
      S.settings.mapSize = Math.max(60, Math.min(170, S.settings.mapSize + (e.deltaY < 0 ? 5 : -5))); commit(); this.apply();
    }, { passive: false });
  }
}
