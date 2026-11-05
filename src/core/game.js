// Game: рендерер, сцена меню, стейт-машина MENU/MATCH/GOAL/RESULT, головний цикл, ввід, камера матчу, якість.
import * as THREE from 'three';
import { StateMachine } from './stateMachine.js';
import { audio } from './audio.js';
import { S, commit } from '../state/save.js';
import { COL, matchSpec, PITCH } from '../config.js';
import { stadiumTier } from '../state/economy.js';
import { Island } from '../graphics/island.js';
import { Particles } from '../graphics/particles.js';
import { Match } from '../match/match.js';
import { CineFX } from '../graphics/cinefx.js';
import { CamDirector, camInfoBlank } from './camera.js';
import { appHidden, inTelegram, tgFullscreen, tgEnterFullscreen, tgToggleFullscreen } from './telegram.js';
import { DETAIL, MAX_LEVEL, loadPerf, savePerf } from './perf.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const _v = new THREE.Vector3();
const _d = new THREE.Vector3();
const SPLASH_FLY = 1.25, SPLASH_LOCK = 0.2;   // с: камера екрана ЛОКО РАШ спершу летить разом із м'ячем, потім доїжджає до центрального кола
const _co = { asp: 1, preset: '', dist: 100, tilt: 0, follow: 100, snap: false };   // параметри режисера камери: без нового об'єкта щокадру
/** Крок критично загасаної пружини: точка x зі швидкістю v до цілі tg. */
function springStep(x, v, tg, w, h) {
  v.x += (w * w * (tg.x - x.x) - 2 * w * v.x) * h; v.y += (w * w * (tg.y - x.y) - 2 * w * v.y) * h; v.z += (w * w * (tg.z - x.z) - 2 * w * v.z) * h;
  x.x += v.x * h; x.y += v.y * h; x.z += v.z * h;
}

/** Екран поверх усього: графіка не запустилась або не повернулась (замість мовчазного порожнього поля). */
export function gfxFail(text) {
  const root = document.getElementById('ui') || document.body;
  if (root.querySelector('#gfx-fail')) return;
  const el = document.createElement('section');
  el.className = 'overlay'; el.id = 'gfx-fail'; el.style.zIndex = 99; el.style.background = '#08402c';
  el.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;gap:calc(var(--u) * 3);max-width:80vw;text-align:center;color:#fff;font-weight:800;font-size:var(--fs-m)">${text}<button type="button" class="big"><b>ОНОВИТИ СТОРІНКУ</b></button></div>`;
  el.querySelector('button').addEventListener('click', () => location.reload());
  root.appendChild(el);
}

export class Game {
  constructor(canvas, ui) {
    this.canvas = canvas; this.ui = ui; ui.game = this;
    const coarse = matchMedia('(pointer: coarse)').matches;
    this.aa = S.settings.quality !== 'low';                  // згладжування контексту незмінне: нова «якість» діє на нього лише після перезапуску
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: this.aa, powerPreference: 'high-performance', stencil: false, alpha: false });
    this.renderer.setClearColor(COL.skyMenu, 1);
    if (!(import.meta.env && import.meta.env.DEV)) this.renderer.debug.checkShaderErrors = false;   // перевірка логів шейдера щоразу чекає драйвер: зайвий фриз у грі
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.1;
    this.coarse = coarse;
    const pf = loadPerf(coarse);
    this.res = pf.res; this.savedLevel = pf.level; this.level = this.fixedLevel() ?? pf.level; this.ema = 16; this.evalT = 0; this.goodRuns = 0; this.pr = 0;
    this.lvBase = 0; this.lvTop = 0; this.lvMiss = 0; this.lvDone = false; this.lvDoneAt = 0; this.lvMax = MAX_LEVEL;
    this.slowT = 1; this.govBase = 0; this.govRes = 1; this.govStuck = false; this.govProbe = 0; this.upNeed = 3;
    this.trauma = 0; this.fov = 0; this.time = 0;
    this.w = 1; this.h = 1;

    // меню: острів, що висить у небі
    const ms = (this.menuScene = new THREE.Scene());
    ms.background = new THREE.Color(COL.skyMenu); ms.fog = new THREE.Fog(COL.skyMenu, 110, 260);
    ms.add(new THREE.HemisphereLight(0xffffff, 0xb08a70, 1.25));
    const sun = new THREE.DirectionalLight(0xfff3dc, 1.5); sun.position.set(-22, 34, 18); ms.add(sun);
    this.menuParticles = new Particles(300, 1);
    this.island = new Island(this.menuParticles);
    ms.add(this.island.group, this.menuParticles.mesh);
    this.menuCam = new THREE.PerspectiveCamera(30, 1, 1, 500);
    this.matchCam = new THREE.PerspectiveCamera(34, 1, 1, 400);
    this.camDir = new CamDirector(); this.camI = camInfoBlank();
    this.orbit = { az: 0.55, drag: 0, vel: 0, dragging: false };

    this.sm = new StateMachine();
    this.match = null;
    this.buildStates();
    this.bindInput();
    this.resize();
    addEventListener('resize', () => this.resize());
    addEventListener('orientationchange', () => setTimeout(() => this.resize(), 200));
    if (window.visualViewport) visualViewport.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => this.onVisibility());
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.onGlLost(); });
    canvas.addEventListener('webglcontextrestored', () => this.onGlRestored());

    this.island.setTier(stadiumTier(), false);
    this.island.setTrophies(S.trophies);
    this.last = performance.now();
    this.tick = this.tick.bind(this);
    requestAnimationFrame(this.tick);
  }

  /** Чи щойно намальований кадр однотонний (9 точок однакового кольору). */
  cineFlat() {
    const gl = this.renderer.getContext(), W = gl.drawingBufferWidth, H = gl.drawingBufferHeight, p = new Uint8Array(4);
    let first = null;
    for (const fy of [0.3, 0.5, 0.7]) for (const fx of [0.3, 0.5, 0.7]) {
      gl.readPixels((W * fx) | 0, (H * fy) | 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p);
      const k = p[0] >> 2 | (p[1] >> 2) << 6 | (p[2] >> 2) << 12;
      if (first === null) first = k; else if (k !== first) return false;
    }
    return true;
  }

  /** Звичайний матч (і сцена матчу, яку позичає онлайн-гість). */
  ensureMatch() { if (!this.solo) { this.solo = new Match(this); this.match = this.solo; this.computeMatchBase(); this.solo.view.setDetail(DETAIL[this.level]); } if (!this.match) this.match = this.solo; return this.solo; }

  /** Екран ЛОКО РАШ стоїть на справжньому стадіоні: камера в центрі поля дивиться на трибуни. Гравців і м'яча ще немає. Сцену матчу все одно збудував би «ГРАТИ». */
  startSplash() {
    if (this.splash || this.level < 1 || this.lost) return false;
    try {
      const v = this.ensureMatch().view, off = [...v.players.map((p) => p.root), v.ball.group, v.shadows, v.aim.mesh, v.ring, v.band];
      const was = off.map((o) => o.visible);
      for (const o of off) o.visible = false;
      v.setEnv('day', 'clear');
      this.renderer.toneMappingExposure = v.exposure || 1.1;
      const cam = new THREE.PerspectiveCamera(46, this.w / this.h, 0.5, 500); cam.rotation.order = 'YXZ';
      this.splash = { v, cam, off, was, t: 0, roar: 0, show: true, ball: null, ballCam: v.ball.cam, ct: 0, p0: new THREE.Vector3(), v0: new THREE.Vector3(), pv: new THREE.Vector3() };
      this.warmShaders(false);
      this.updateSplash(0);
      return true;
    } catch (e) { console.warn(e); this.splash = null; return false; }
  }
  /** Під заслоном стадіону не видно: тоді ні оновлення, ні кадру. Вмикає вхід, коли отвір O стає прозорим. */
  splashView(on) { if (this.splash) this.splash.show = on; }
  /**
   * Камера повільно оглядає трибуни; після удару назви короткий поштовх. До м'яча вона стоїть трохи позаду центрального кола.
   * Щойно з'явився 3D-м'яч, камера стартує з його швидкістю (м'яч на екрані стоїть, як і плаский перед ним) і плавно гальмує
   * до центрального кола: крива Ерміта з початковою швидкістю м'яча й нульовою в кінці, тож без ривка й без відкату назад.
   */
  updateSplash(dt) {
    const sp = this.splash, v = sp.v, c = sp.cam; sp.t += dt;
    if (!sp.show) return;
    sp.roar = Math.max(0, sp.roar - dt * 1.6);
    if (sp.ball) this.splashBallStep(dt);
    v.stands.update(dt, this.time); v.surround.update(dt); v.pitch.boards.texture.offset.x = (this.time * 0.018) % 1;
    if (c.aspect !== this.w / this.h) { c.aspect = this.w / this.h; c.fov = c.aspect < 1.5 ? 50 : 40; c.updateProjectionMatrix(); }
    const sx = Math.sin(sp.t * 0.5) * 0.06;
    if (sp.ball) {
      sp.ct = Math.min(SPLASH_LOCK + SPLASH_FLY, sp.ct + dt);
      if (sp.ct < SPLASH_LOCK) {                                                       // поки тане плаский м'яч, камера летить точно з 3D-м'ячем: він стоїть у кадрі
        const b = sp.ball; c.position.set(b.x - sp.v0.x, b.y - sp.v0.y, b.z - sp.v0.z);
        sp.p0.copy(c.position); sp.pv.set(b.vx, b.vy, b.vz);
      } else {
        const T = SPLASH_FLY, s = (sp.ct - SPLASH_LOCK) / T, s2 = s * s, s3 = s2 * s, h0 = 2 * s3 - 3 * s2 + 1, h1 = (s3 - 2 * s2 + s) * T, h2 = 3 * s2 - 2 * s3;
        c.position.set(sp.p0.x * h0 + sp.pv.x * h1, sp.p0.y * h0 + sp.pv.y * h1 + 1.5 * h2 + sx, sp.p0.z * h0 + sp.pv.z * h1 - 8 * h2);
      }
    } else c.position.set(0, 2 + sx, -3);
    const shake = sp.roar * sp.roar * 0.012;
    c.rotation.set(0.2 + Math.sin(sp.t * 0.31) * 0.012 + Math.sin(sp.t * 41) * shake, Math.sin(sp.t * 0.16) * 0.2 + Math.cos(sp.t * 37) * shake, 0);
  }
  /**
   * М'яч у отворі O стає справжнім 3D-м'ячем гри в тій самій точці кадру й того самого розміру (плаский над ним ще тане),
   * далі гравітація, відскоки від газону й котіння. at: {x, y, d} у пікселях екрана (d — діаметр), або нічого, якщо вхід пропустили.
   */
  splashBall(at) {
    const sp = this.splash; if (!sp || sp.ball) return;
    sp.show = true;
    const c = sp.cam, v = sp.v, r = PITCH.BALL_VIS, w = this.w, h = this.h;
    const px = at ? at.x : w * 0.5, py = at ? at.y : h * 0.45, dpx = at ? Math.max(8, at.d) : h * 0.12;
    c.updateMatrixWorld();
    _d.set((px / w) * 2 - 1, -(py / h) * 2 + 1, 0.5).unproject(c).sub(c.position).normalize();
    const dist = (r * h) / (dpx * 0.5 * 2 * Math.tan((c.fov * Math.PI) / 360));   // відстань, на якій м'яч займає dpx пікселів
    _v.copy(c.position).addScaledVector(_d, dist);
    const sp0 = 11;                                                                   // швидкість удару, од./с: лоб, що падає перед камерою
    sp.ball = { x: _v.x, y: _v.y, z: _v.z, vx: _d.x * sp0, vy: _d.y * sp0 + 3.4, vz: _d.z * sp0, rest: false };
    sp.v0.set(_v.x - c.position.x, _v.y - c.position.y, _v.z - c.position.z); sp.ct = 0;   // v0 тут: зсув камери від м'яча, який тримаємо, поки тане плаский
    sp.p0.copy(c.position); sp.pv.set(sp.ball.vx, sp.ball.vy, sp.ball.vz);
    v.ball.cam = null; v.ball.vs = 1; v.ball.group.visible = true; v.shadows.visible = true;   // cam = null: розмір видимості рахує splashBallStep
    this.splashBallStep(0);
  }
  /** Політ і відскоки 3D-м'яча екрана ЛОКО РАШ. Без алокацій: стан у sp.ball. */
  splashBallStep(dt) {
    const sp = this.splash, b = sp.ball, v = sp.v, r = PITCH.BALL_VIS, G = 9.81 / 0.9;
    if (!b.rest) {
      b.vy -= G * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      if (b.y <= r) {                                                                  // газон: відскок із втратою, тертя гальмує по землі
        b.y = r;
        if (b.vy < -0.6) { b.vy = -b.vy * 0.55; b.vx *= 0.82; b.vz *= 0.82; v.ball.squash(0, 0, Math.min(0.3, -b.vy * 0.04)); }
        else { b.vy = 0; const f = Math.max(0, 1 - dt * 1.6); b.vx *= f; b.vz *= f; if (Math.hypot(b.vx, b.vz) < 0.05) b.rest = true; }
      }
      if (b.z < -PITCH.W + 1) { b.z = -PITCH.W + 1; b.vz = -b.vz * 0.4; }             // до щитів не докотиться, а якщо докотиться, відскочить
    }
    const hgt = Math.max(0, b.y - r), c = sp.cam;
    // здалеку м'яч не дрібніший за ~3 % висоти кадру, як і в матчі (там поріг менший); справжній розмір зблизька
    const want = (0.015 * Math.hypot(c.position.x - b.x, c.position.y - b.y, c.position.z - b.z) * 2 * Math.tan((c.fov * Math.PI) / 360)) / r;
    v.ball.vs += (Math.max(1, want) - v.ball.vs) * Math.min(1, dt * 8 || 1);
    v.ball.update(dt, b.x, b.z, b.rest ? 0 : b.vx, b.rest ? 0 : b.vz, hgt, 0);
    v.updateShadows(b.x, b.z, hgt);
  }
  /** Назва впала на місце: трибуни вибухають. */
  splashRoar() { const sp = this.splash; if (!sp) return; sp.roar = 1; sp.v.stands.react('goal', { mine: true, dur: 4.5 }); }
  /** Екран сховано: далі знову острів, сцена матчу лишається для першого матчу. */
  stopSplash() {
    const sp = this.splash; if (!sp) return;
    sp.off.forEach((o, i) => { o.visible = sp.was[i]; });
    sp.v.ball.cam = sp.ballCam; sp.v.ball.vs = 1;
    this.renderer.toneMappingExposure = 1.1;
    this.splash = null;
  }

  /**
   * Шейдери наперед, лише де компіляція не стоїть у кадрі (KHR_parallel_shader_compile): програми збираються паралельно, а не
   * по одній у першому кадрі. Без розширення нічого не робимо: той самий фриз лише переїхав би на іншу мить.
   * other — набір прожекторів іншого часу доби: кількість світла входить у ключ програми, тому день і ніч це різні шейдери.
   */
  warmShaders(other) {
    const v = this.solo && this.solo.view, r = this.renderer;
    if (!v || this.lost || !r.extensions.has('KHR_parallel_shader_compile')) return;
    if (other) v.swapSpots();
    let n = 0; for (const sl of v.spots) if (sl.visible) n++;
    if (!(this.warmed & (1 << n))) {                         // кожен набір один раз: обхід сцени теж не безкоштовний
      this.warmed |= 1 << n;
      try { r.compile(v.scene, this.matchCam); } catch (e) { console.warn(e); }
    }
    if (other) v.swapSpots();
  }

  // ---------------------------------------------------------------- стани
  buildStates() {
    const g = this;
    this.sm.add('MENU', {
      enter(_, from) {
        if (g.match) g.match.exit();
        g.match = g.solo || null; g.link = null; g.flipCam = false;
        g.ui.hud.hide(); g.ui.showMenu();
        g.island.setTier(stadiumTier(), false); g.island.setTrophies(S.trophies);
        audio.music('menu');
        if (from === 'RESULT') g.island.celebrate();
        g.warmShaders(true);
      },
      update(dt) {
        g.time += dt;
        if (g.splash) return g.updateSplash(dt);
        g.island.update(dt, g.time);
        g.menuParticles.update(dt);
        g.updateMenuCam(dt);
      },
    });
    this.sm.add('MATCH', {
      enter(data) {
        if (data && data.resume) return;
        g.ui.hideMenu();
        if (data.guest) { g.ensureMatch(); g.match = data.guest; data.guest.start(data.spec, data.hudSpec); g.warmShaders(false); return; }   // онлайн-гість: показ гри господаря
        g.match = g.ensureMatch(); g.match.start(data.spec); g.warmShaders(false);
      },
      update(dt) { g.time += dt; g.match.update(dt); g.updateMatchCam(dt); },
    });
    this.sm.add('GOAL', {
      enter() { /* логіка в Match.onGoal */ },
      update(dt) { g.time += dt; g.match.updateGoal(dt); g.updateMatchCam(dt); },
    });
    this.sm.add('RESULT', {
      enter(result) { g.ui.showResult(result); },
      exit() { g.ui.hideResult(); },
      update(dt) { g.time += dt; g.match.update(dt); g.updateMatchCam(dt); },
    });
    this.sm.go('MENU');
  }

  play() {
    const spec = matchSpec(S.fixture, S.season);
    this.sm.go('MATCH', { spec });
  }
  toMenu() { this.sm.go('MENU'); }
  quitMatch() { if (this.online && this.online.inMatch()) { this.online.leave(); return; } if (this.match) this.match.exit(); this.ui.hud.hide(); this.sm.go('MENU'); }

  onStadiumUpgraded() {
    this.island.setTier(stadiumTier(), true);
  }

  // ---------------------------------------------------------------- розмір, продуктивність
  resize() {
    const vv = window.visualViewport;
    const w = Math.max(2, Math.round(vv ? vv.width : innerWidth)), h = Math.max(2, Math.round(vv ? vv.height : innerHeight));
    this.w = w; this.h = h;
    this.applyPixelRatio(true);
    for (const c of [this.menuCam, this.matchCam]) { c.aspect = w / h; c.updateProjectionMatrix(); }
    this.rect = this.canvas.getBoundingClientRect();
    if (this.match) this.computeMatchBase();
    this.ui.onResize(w, h);
  }

  basePixelRatio() {
    const q = S.settings.quality, dpr = window.devicePixelRatio || 1;
    if (q === 'low') return Math.min(dpr, 1);
    const pr = Math.min(dpr, this.coarse ? 3 : 2);             // телефони з щільністю 3 теж отримують повну чіткість, якщо тягнуть
    if (q === 'high') return pr;
    // авто: планшети й великі екрани не малюємо більше за ~1080p (телефон) і ~1440p (ПК): різниці майже не видно, а GPU вдвічі легше
    return Math.min(pr, Math.max(1, Math.sqrt((this.coarse ? 2.2e6 : 4.2e6) / (this.w * this.h))));
  }

  applyPixelRatio(force) {
    const q = S.settings.quality;
    const pr = Math.max(0.6, this.basePixelRatio() * (q === 'auto' ? this.res : 1));
    if (!force && Math.abs(pr - this.pr) < 0.01) return;
    this.pr = pr;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(this.w, this.h, false);
    this.canvas.style.width = this.w + 'px'; this.canvas.style.height = this.h + 'px';
  }

  /** Найменша частка роздільності: не менше ~1.1 пікселя на точку екрана, на телефоні з щільністю 3 це 0.37, а не 0.7. */
  resMin() { return Math.min(0.7, Math.max(0.35, 1.1 / this.basePixelRatio())); }

  /** Рівень, який задає сам гравець у налаштуваннях; null: «Авто», рівень веде governor. */
  fixedLevel() { const q = S.settings.quality; return q === 'high' ? MAX_LEVEL : q === 'low' ? 1 : null; }

  setLevel(l) {
    if (l === this.level) return;
    this.level = l;
    if (this.solo) this.solo.view.setDetail(DETAIL[l]);
  }

  /** Гравець змінив якість у налаштуваннях. */
  qualityChanged() {
    this.lvDone = false; this.lvMax = MAX_LEVEL; this.lvBase = 0; this.lvMiss = 0; this.govStuck = false; this.govBase = 0; this.govProbe = 0;
    this.setLevel(this.fixedLevel() ?? this.savedLevel);
    this.applyPixelRatio(true);
  }

  /**
   * Роздільність не допомогла або вже на межі: упираємось у процесор чи кількість об'єктів, тож спрощуємо сцену. Якщо два кроки
   * поспіль нічого не дали, це не навантаження, а обмеження екрана (економія енергії 30 Гц): повертаємо все як було.
   */
  levelDown() {
    if (this.lvDone) {
      // кадр після здачі ще помітно подовжився: це вже справжнє навантаження (перегрів), пробуємо знижувати знову
      if (this.ema > this.lvDoneAt * 1.25) { this.lvDone = false; this.govStuck = false; this.govBase = 0; this.lvBase = 0; this.lvMiss = 0; }
      return;
    }
    if (this.lvBase) {
      if (this.ema > this.lvBase * 0.93) { if (++this.lvMiss >= 2) { this.setLevel(this.lvTop); this.lvMax = this.lvTop; this.lvDone = true; this.lvDoneAt = this.ema; this.lvBase = 0; return; } }
      else { this.lvMiss = 0; this.lvMax = this.level; savePerf(this.level, this.res); }
    } else this.lvTop = this.level;
    if (this.level > 0) { this.lvBase = this.ema; this.setLevel(this.level - 1); }
    else { this.lvDone = true; this.lvDoneAt = this.ema; }
  }

  /** Динамічна роздільність і рівень деталізації: тримаємо ~60 fps, не чіпаючи картинку без потреби. */
  governor(dt) {
    // поодинокий фриз (збірка сцени, GC) — не навантаження: у середнє не йде
    const slow = dt > 0.05, lone = slow && this.slowT > 0.5;
    this.slowT = slow ? 0 : this.slowT + dt;
    if (!lone) this.ema += (dt * 1000 - this.ema) * 0.08;
    this.evalT += dt;
    if (this.evalT < 1.4 || S.settings.quality !== 'auto') return;
    this.evalT = 0;
    if (this.ema > 20.5) {
      if (this.govProbe) {
        // щойно повернули чіткість: кадр став помітно довшим, отже упирались таки в GPU — назад, і цей рівень запам'ятовуємо як базу
        const worse = this.ema > this.govProbe * 1.2; this.govProbe = 0;
        if (worse) { this.govBase = this.ema; this.govStuck = false; this.res = 0.7; this.goodRuns = 0; this.applyPixelRatio(false); return; }
      }
      if (this.govStuck) return this.levelDown();
      const floor = this.resMin();
      if (this.res > floor + 1e-3) {
        if (!this.govBase) { this.govBase = this.ema; this.govRes = this.res; this.upNeed = Math.min(96, this.upNeed * 2); }   // кожен новий спад — обережніше піднімаємо назад
        this.res = Math.max(floor, this.res - 0.1); this.goodRuns = 0; this.applyPixelRatio(false); savePerf(this.level, this.res);
      } else if (!this.govBase) {
        // уже на межі після минулого спаду, і кадр різко подовжився (увімкнувся режим економії 30 Гц): наступна оцінка перевірить, чи допомагає роздільність
        if (this.ema > 26) this.govBase = this.ema; else this.levelDown();
      } else if (this.ema > this.govBase * 0.9) {
        // роздільність не допомогла: упираємось не в GPU (режим економії 30 Гц, процесор) — повертаємо чітку картинку
        this.res = this.govRes; this.govStuck = true; this.govProbe = this.ema; this.goodRuns = 0; this.applyPixelRatio(false);
      } else this.levelDown();                                  // роздільність допомогла, але її вже нема куди знижувати
      return;
    }
    if (this.lvBase) { this.lvMax = this.level; savePerf(this.level, this.res); }   // цього рівня вистачило: вище в цій сесії не піднімаємось, щоб не гойдатись
    this.govStuck = false; this.govBase = 0; this.govProbe = 0; this.lvBase = 0; this.lvMiss = 0;
    // рівні 60 Гц дають ~16.7 мс: поріг вище за них, інакше на таких екранах роздільність не верталась би ніколи
    // запас є: спершу чіткість, далі деталі. Так телефон використовує всю потужність, а доведена межа запам'ятовується вище
    if (this.ema < 17.6 && (this.res < 1 || this.level < this.lvMax)) {
      if (++this.goodRuns >= this.upNeed) {
        this.goodRuns = 0;
        if (this.res < 1) { this.res = Math.min(1, this.res + 0.06); this.applyPixelRatio(false); }
        else { this.setLevel(this.level + 1); this.upNeed = Math.min(96, this.upNeed * 2); }
        savePerf(this.level, this.res);
      }
    } else this.goodRuns = 0;
  }

  /** Контекст WebGL загублено: зупиняємо гру й звук; якщо не повернувся за кілька секунд — кажемо гравцю, що робити. */
  onGlLost() {
    this.lost = true; audio.suspend();
    if (this.match && this.match.isPlaying() && !(this.online && this.online.inMatch())) this.ui.pause();
    this.ui.toast('Графіку втрачено, відновлюємо…');
    clearTimeout(this.lostT);
    this.lostT = setTimeout(() => { if (this.lost) gfxFail('Графіка не повернулась. Онови сторінку, щоб продовжити.'); }, 5000);
  }
  onGlRestored() {
    this.lost = false; clearTimeout(this.lostT); this.last = performance.now(); this.warmed = 0;
    const f = !this.dead && document.getElementById('gfx-fail'); if (f) f.remove();
    if (!appHidden()) audio.resume();
  }

  onVisibility() {
    // онлайн-матч не стає на паузу (час спільний) — меню паузи не вискакує
    if (appHidden()) { audio.suspend(); if (this.match && this.match.isPlaying() && !(this.online && this.online.inMatch())) this.ui.pause(); }
    else { if (!this.lost) audio.resume(); this.last = performance.now(); if (this.ui.started) this.acquireWake(); }
  }

  // ---------------------------------------------------------------- камери
  updateMenuCam(dt) {
    const o = this.orbit, cam = this.menuCam, t = this.time;
    if (!o.dragging) { o.drag += o.vel * dt; o.vel *= Math.pow(0.04, dt); o.drag *= Math.pow(0.55, dt); }
    const az = 0.62 + Math.sin(t * 0.17) * 0.28 + o.drag, el = 0.64 + Math.sin(t * 0.23) * 0.025;
    const asp = this.w / this.h;
    const fov = cam.fov * Math.PI / 180;
    const ex = this.island.extent / 19, dV = 18.2 * ex / Math.tan(fov / 2) / 0.78, dH = 21.5 * ex / (Math.tan(fov / 2) * asp) / 0.86;
    const d = Math.max(dV, dH);
    const ty = 3.0 - 1.0 * clamp((asp - 1.3), 0, 1);
    cam.position.set(Math.sin(az) * Math.cos(el) * d, Math.sin(el) * d + ty, Math.cos(az) * Math.cos(el) * d);
    cam.lookAt(0, ty - 0.6, 1.2);
  }

  /** Змінились налаштування камери чи розмір екрана: режисер підлаштовується плавно (пресет, відстань, нахил). */
  computeMatchBase() { this.updateMatchCam(0, false); }
  snapCamera() { this.camDir.snap(); this.updateMatchCam(0, true); }

  addTrauma(v) { this.trauma = Math.min(1, this.trauma + v); }
  /** Поштовх кута огляду (удар, гол): набігає за ~0.1 с і спадає — не стрибком, що смикав кадр. */
  fovKick(v) { this.fovImp = Math.max(-4, Math.min(8, (this.fovImp || 0) + v)); }

  updateMatchCam(dt, snap) {
    const cam = this.matchCam, m = this.match, cd = this.camDir; if (!m) return;
    this.trauma = Math.max(0, this.trauma - dt * 1.7);
    this.fovImp = (this.fovImp || 0) * Math.exp(-dt * 5);
    this.fov += (this.fovImp - this.fov) * (1 - Math.exp(-dt * 14));
    // що важливо в моменті (м'яч, власник, хто тисне, адресат, приціл) — у координатах гравця: його команда атакує +X
    if (m.camInfo) m.camInfo(this.camI);
    const cv = m.celebView ? m.celebView() : null, st = S.settings;
    _co.asp = this.w / this.h; _co.preset = st.camMode; _co.dist = st.camDist; _co.tilt = st.camTiltOff; _co.follow = st.camFollow; _co.snap = snap;
    cd.update(dt, this.camI, cv, _co);
    if (m.view && m.view.dense) m.view.fitFog(cd.d);
    const s = st.camShake === false ? 0 : this.trauma * this.trauma, t = this.time;
    const sx = (Math.sin(t * 23) + 0.5 * Math.sin(t * 37 + 2)) * 0.4 * s, sy = (Math.sin(t * 29 + 1) + 0.5 * Math.sin(t * 41)) * 0.3 * s;   // м'який гул, а не дрібне тремтіння
    cam.position.set(cd.px + sx, cd.py + sy, cd.pz);
    cam.lookAt(cd.tx, 0, cd.tz);
    // онлайн-гість дивиться з протилежного боку (поворот на 180°): його команда атакує зліва направо, як і в господаря
    if (this.flipCam) { cam.position.x = -cam.position.x; cam.position.z = -cam.position.z; cam.lookAt(-cd.tx, 0, -cd.tz); }
    const f = cd.fov - this.fov;
    if (Math.abs(cam.fov - f) > 0.01) { cam.fov = f; cam.updateProjectionMatrix(); }
    const ov = m && m.camOverride ? m.camOverride() : null;
    if (ov) {
      // кат-сцени монтуються кадрами: новий кадр (shot) — склейка без перельоту, усередині кадру — плавний супровід
      const cut = ov.shot !== undefined && (!this._ov || ov.shot !== this._ovShot);
      if (!this._ov) this._ov = { p: cam.position.clone(), l: new THREE.Vector3(this.flipCam ? -cd.tx : cd.tx, 0, this.flipCam ? -cd.tz : cd.tz), f: cam.fov, pv: new THREE.Vector3(), lv: new THREE.Vector3(), fv: 0 };
      this._ovShot = ov.shot;
      const o = this._ov;
      if (cut || snap) { o.p.copy(ov.p); o.l.copy(ov.l); o.f = ov.fov; o.pv.set(0, 0, 0); o.lv.set(0, 0, 0); o.fv = 0; }
      else if (ov.smooth === false) {
        const k = 1 - Math.exp(-dt * (ov.rate || 2.6));
        o.p.lerp(ov.p, k); o.l.lerp(ov.l, k); o.f += (ov.fov - o.f) * k;
      } else {
        // як операторський кран чи стедікам: камера — маса на пружині з критичним загасанням. Ціль може смикатися
        // (гравець пригальмував, зупинився) — камера рухається плавно, без ривків швидкості й без перельоту
        const w = 1.25 * (ov.rate || 2.6), n = Math.max(1, Math.ceil(dt / 0.008)), h = dt / n;
        for (let i = 0; i < n; i++) {
          springStep(o.p, o.pv, ov.p, w, h); springStep(o.l, o.lv, ov.l, w, h);
          o.fv += (w * w * (ov.fov - o.f) - 2 * w * o.fv) * h; o.f += o.fv * h;
        }
      }
      cam.position.copy(this._ov.p); cam.lookAt(this._ov.l);
      // кінорежим: фокус там, куди дивиться камера (на героях кадру); aperture — з кадру (0 — без розмиття)
      if (ov.dof > 0 && this.level >= 2) {
        // автофокус, як у камери: на найближчій людині біля центру кадру (хто в кадрі головний), а не на точці, куди
        // «дивиться» камера (там часто порожньо — і різко не було нічого). Фокус переводиться плавно, на склейці — одразу
        const f = this.autoFocus(cam, m, o.p.distanceTo(o.l));
        this.focusS = cut || !this.dof ? f : this.focusS + (f - this.focusS) * (1 - Math.exp(-dt * 3.5));
        this.dof = { focus: this.focusS, ap: ov.dof };
      } else this.dof = null;
      if (Math.abs(cam.fov - this._ov.f) > 0.01) { cam.fov = this._ov.f; cam.updateProjectionMatrix(); }
    } else { this._ov = null; this._ovShot = undefined; this.dof = null; }
  }

  /**
   * Відстань фокуса: найближчий гравець (груди), що в кадрі ближче ~13° від центру; якщо таких нема — найближчий у
   * ширшому конусі (~24°); інакше — точка, куди дивиться камера.
   */
  autoFocus(cam, m, fallback) {
    const fw = _d.set(0, 0, -1).applyQuaternion(cam.quaternion);
    let best = 1e9, wide = 1e9;
    const pl = m.view.players;
    for (let i = 0; i < pl.length; i++) {
      const p = pl[i];
      if (!p.root.visible) continue;
      _v.set(p.root.position.x, 1.25, p.root.position.z).sub(cam.position);
      const d = _v.length(); if (d < 1.2) continue;
      const c = _v.dot(fw) / d;
      if (c > 0.974 && d < best) best = d; else if (c > 0.91 && d < wide) wide = d;
    }
    return best < 1e9 ? best : wide < 1e9 ? wide : fallback;
  }

  /** Екран → площина газону (y = 0). */
  screenToGround(px, py, out) {
    const cam = this.matchCam, r = this.rect;
    const nx = ((px - r.left) / r.width) * 2 - 1, ny = -((py - r.top) / r.height) * 2 + 1;
    cam.updateMatrixWorld();
    _d.set(nx, ny, 0.5).unproject(cam).sub(cam.position);
    const t = -cam.position.y / _d.y;
    out.x = cam.position.x + _d.x * t; out.z = cam.position.z + _d.z * t;
    return out;
  }

  /** Світова точка → піксель екрана (для прицілу джойстиком). */
  worldToScreen(x, z, out) {
    _v.set(x, 0.5, z).project(this.matchCam);
    out.x = (_v.x * 0.5 + 0.5) * this.w; out.y = (-_v.y * 0.5 + 0.5) * this.h;
    return out;
  }

  /** Не даємо телефону гасити екран під час гри. */
  async acquireWake() {
    try {
      if ('wakeLock' in navigator && !this.wake) {
        this.wake = await navigator.wakeLock.request('screen');
        this.wake.addEventListener('release', () => { this.wake = null; });
      }
    } catch (_) { /* не підтримується */ }
  }

  floatWorld(x, y, z, text, kind) {
    const cam = this.matchCam;
    _v.set(x, y, z).project(cam);
    this.ui.hud.float((_v.x * 0.5 + 0.5) * this.w, (-_v.y * 0.5 + 0.5) * this.h, text, kind);
  }

  // ---------------------------------------------------------------- ввід
  bindInput() {
    const c = this.canvas;
    let pid = -1, sx = 0, sy = 0, lx = 0, moved = false, t0 = 0;
    // палець на джойстику цілиться сам: дотики по полю його приціл не завершують і не скасовують
    const joyAim = () => this.ui.joyActive && this.match && this.match.joyMode;
    // iOS після дзвінка чи блокування не дає відновити звук без жесту: пробуємо на кожному дотику
    for (const t of ['pointerdown', 'touchend', 'click']) addEventListener(t, () => { if (!this.lost && !appHidden()) audio.resume(); }, { capture: true, passive: true });
    c.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;   // приціл і тап — лише лівою кнопкою
      if (pid !== -1 && this.match && !this.ui.joyActive) this.match.cancelAim();   // попередній жест загубився: починаємо спочатку (приціл джойстиком не чіпаємо)
      pid = e.pointerId; try { c.setPointerCapture(pid); } catch (_) { /* ignore */ }
      sx = lx = e.clientX; sy = e.clientY; moved = false; t0 = performance.now();
      if (this.sm.name === 'MATCH' && this.match) this.match.pointerDown(e.clientX, e.clientY);
      if (this.sm.name === 'GOAL' && this.match) this.match.skipCine();
      if (this.sm.name === 'MENU') { this.orbit.dragging = true; this.orbit.vel = 0; }
      e.preventDefault();
    });
    c.addEventListener('pointermove', (e) => {
      if (e.pointerId !== pid) return;
      if (this.sm.name === 'MATCH' && this.match) this.match.pointerMove(e.clientX, e.clientY);
      if (this.sm.name === 'MENU') {
        const dx = e.clientX - lx; lx = e.clientX;
        if (Math.abs(e.clientX - sx) + Math.abs(e.clientY - sy) > 9) moved = true;
        if (moved) { this.orbit.drag += dx * 0.006; this.orbit.vel = dx * 0.006 * 40; }
      }
    });
    const up = (e) => {
      if (e.pointerId !== pid) return;
      pid = -1; try { c.releasePointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      if (this.sm.name === 'MATCH' && this.match && !joyAim()) this.match.pointerUp();
      if (this.sm.name === 'MENU') {
        this.orbit.dragging = false;
        if (!moved && performance.now() - t0 < 500) this.ui.menuTap();
      }
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', (e) => { if (e.pointerId === pid) { pid = -1; this.orbit.dragging = false; if (this.match && !joyAim()) this.match.cancelAim(); } });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('blur', () => {
      pid = -1; this.orbit.dragging = false; if (this.match) this.match.cancelAim();
      // ПК: вікно втратило фокус, але лишилось видимим (visibilitychange мовчить) — матч не йде без гравця
      if (!this.coarse && this.match && this.match.isPlaying() && !(this.online && this.online.inMatch())) this.ui.pause();
    });
  }

  // ---------------------------------------------------------------- повний екран
  isFullscreen() { return inTelegram() ? tgFullscreen() : !!(document.fullscreenElement || document.webkitFullscreenElement); }
  async enterFullscreen() {
    if (inTelegram()) return tgEnterFullscreen();   // вебв'ю Telegram не дає браузерного fullscreen
    const el = document.documentElement;
    try {
      if (!this.isFullscreen()) { const f = el.requestFullscreen || el.webkitRequestFullscreen; if (f) await f.call(el, { navigationUI: 'hide' }); }
    } catch (_) { /* iOS Safari не підтримує */ }
    try { if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape'); } catch (_) { /* потребує fullscreen */ }
  }
  toggleFullscreen() {
    if (inTelegram()) return tgToggleFullscreen();
    if (this.isFullscreen()) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); }
    else this.enterFullscreen();
  }

  // ---------------------------------------------------------------- цикл
  tick(now) {
    if (this.dead) return;
    requestAnimationFrame(this.tick);
    try { this.step(now); this.badFrames = 0; }
    catch (e) { this.onFrameError(e); }
  }

  /** Виняток у кадрі: один-два пропускаємо (у консоль), а якщо гра падає кадр за кадром — зупиняємо цикл і кажемо гравцю. */
  onFrameError(e) {
    this.badFrames = (this.badFrames || 0) + 1;
    if (this.badFrames <= 3) console.error(e);
    if (this.badFrames < 30) return;
    this.dead = true;
    try { audio.suspend(); } catch (_) { /* ignore */ }
    try { gfxFail('У грі сталася помилка. Онови сторінку, щоб продовжити.'); } catch (_) { /* ignore */ }
  }

  step(now) {
    // телефон із екраном 120 Гц: 60 рівних кадрів замість вдвічі більшої роботи й перегріву за кілька хвилин. 90 Гц тут не ріжеться: у них 11 мс
    if (this.coarse && S.settings.quality !== 'high' && now - this.last < 10.5) return;
    const calm = this.sm.name === 'MENU' && (this.ui.panel || !this.ui.started);   // острів під панеллю чи заставкою: ~30 кадрів достатньо
    if (calm && (this.coarse || !this.splash) && now - this.last < 30) return;     // на ПК камера стадіону йде плавно
    if (calm && this.ui.panelCovers()) { this.last = now; return; }
    // пауза: кадр стоїть під оверлеєм, ~15 кадрів вистачає (на панелі камери кадр за нею ще рухається)
    const still = this.match === this.solo && this.match && this.match.phase === 'paused' && this.sm.name === 'MATCH';
    if (still && now - this.last < 60) return;
    let dt = (now - this.last) / 1000; this.last = now;
    if (dt > 0.1) dt = 0.1; if (dt < 0) dt = 0;
    if (this.lost) return;
    if (!calm && !still) this.governor(dt);
    this.sm.update(dt);
    this.ui.map.update(dt);
    if (this.link) this.link.frame();                 // онлайн-господар: кадр поз гостю
    const menu = this.sm.name === 'MENU';
    // кінофокус; якщо пристрій його не тягне (буфер чи шейдер) — той самий кадр звичайним рендером
    let done = false;
    if (!menu && this.dof && !this.cineBroken) { try { done = (this.cinefx ??= new CineFX(this.renderer)).render(this.match.view.scene, this.matchCam, this.dof.focus, this.dof.ap, dt); } catch (_) { this.cineBroken = true; } }
    // перші кадри з ефектом перевіряємо: однотонний кадр (білий/небо) — драйвер телефона зламав прохід; тоді ефект вимикаємо
    if (done && (this.cineChecks = (this.cineChecks || 0) + 1) <= 4 && this.cineFlat()) { this.cineBroken = true; done = false; }
    if (menu && this.splash && !this.splash.show) return;   // екран ЛОКО РАШ: стадіон під суцільним заслоном не малюємо
    if (!done) { const sp = menu && this.splash; this.renderer.render(sp ? sp.v.scene : menu ? this.menuScene : this.match.view.scene, sp ? sp.cam : menu ? this.menuCam : this.matchCam); }
  }
}
