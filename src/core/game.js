import * as THREE from 'three';
import { StateMachine } from './stateMachine.js';
import { audio } from './audio.js';
import { S, commit } from '../state/save.js';
import { PITCH, COL, matchSpec } from '../config.js';
import { stadiumTier } from '../state/economy.js';
import { Island } from '../graphics/island.js';
import { Particles } from '../graphics/particles.js';
import { Match } from '../match/match.js';

const { L, W, GOAL_D } = PITCH;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const _v = new THREE.Vector3();
const _d = new THREE.Vector3();

export class Game {
  constructor(canvas, ui) {
    this.canvas = canvas; this.ui = ui; ui.game = this;
    const coarse = matchMedia('(pointer: coarse)').matches;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !(coarse && (window.devicePixelRatio || 1) >= 2), powerPreference: 'high-performance', stencil: false, alpha: false });
    this.renderer.setClearColor(COL.skyMenu, 1);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.1;
    this.coarse = coarse;
    this.res = 1; this.ema = 16; this.evalT = 0; this.goodRuns = 0; this.pr = 0;
    this.trauma = 0; this.fov = 0; this.time = 0; this.introK = 1; this.intro = false;
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
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.lost = true; });
    canvas.addEventListener('webglcontextrestored', () => { this.lost = false; });

    this.island.setTier(stadiumTier(), false);
    this.island.setTrophies(S.trophies);
    this.last = performance.now();
    this.tick = this.tick.bind(this);
    requestAnimationFrame(this.tick);
  }

  ensureMatch() { if (!this.match) { this.match = new Match(this); this.computeMatchBase(); } return this.match; }

  // ---------------------------------------------------------------- стани
  buildStates() {
    const g = this;
    this.sm.add('MENU', {
      enter(_, from) {
        if (g.match) g.match.exit();
        g.ui.hud.hide(); g.ui.showMenu();
        g.island.setTier(stadiumTier(), false); g.island.setTrophies(S.trophies);
        audio.music('menu');
        if (from === 'RESULT') g.island.celebrate();
      },
      update(dt) {
        g.time += dt;
        g.island.update(dt, g.time);
        g.menuParticles.update(dt);
        g.updateMenuCam(dt);
      },
    });
    this.sm.add('MATCH', {
      enter(data) {
        if (data && data.resume) return;
        g.ui.hideMenu();
        g.ensureMatch().start(data.spec);
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
  quitMatch() { if (this.match) this.match.exit(); this.ui.hud.hide(); this.sm.go('MENU'); }

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
    return Math.min(dpr, this.coarse ? 2 : 2);
  }

  applyPixelRatio(force) {
    const q = S.settings.quality;
    const pr = Math.max(0.5, this.basePixelRatio() * (q === 'auto' ? this.res : 1));
    if (!force && Math.abs(pr - this.pr) < 0.01) return;
    this.pr = pr;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(this.w, this.h, false);
    this.canvas.style.width = this.w + 'px'; this.canvas.style.height = this.h + 'px';
  }

  /** Динамічна роздільність: тримаємо ~60 fps, не чіпаючи картинку без потреби. */
  governor(dt) {
    this.ema += (dt * 1000 - this.ema) * 0.08;
    this.evalT += dt;
    if (this.evalT < 1.4 || S.settings.quality !== 'auto') return;
    this.evalT = 0;
    if (this.ema > 20.5 && this.res > 0.55) { this.res = Math.max(0.55, this.res - 0.12); this.goodRuns = 0; this.applyPixelRatio(false); }
    else if (this.ema < 14.2 && this.res < 1) { if (++this.goodRuns >= 3) { this.res = Math.min(1, this.res + 0.06); this.goodRuns = 0; this.applyPixelRatio(false); } }
    else this.goodRuns = 0;
  }

  onVisibility() {
    if (document.hidden) { audio.suspend(); if (this.match && this.match.isPlaying()) this.ui.pause(); }
    else { audio.resume(); this.last = performance.now(); }
  }

  // ---------------------------------------------------------------- камери
  updateMenuCam(dt) {
    const o = this.orbit, cam = this.menuCam, t = this.time;
    if (!o.dragging) { o.drag += o.vel * dt; o.vel *= Math.pow(0.04, dt); o.drag *= Math.pow(0.55, dt); }
    const az = 0.62 + Math.sin(t * 0.17) * 0.28 + o.drag, el = 0.64 + Math.sin(t * 0.23) * 0.025;
    const asp = this.w / this.h;
    const fov = cam.fov * Math.PI / 180;
    const dV = 13.2 / Math.tan(fov / 2) / 0.78, dH = 15.5 / (Math.tan(fov / 2) * asp) / 0.86;
    const d = Math.max(dV, dH);
    const ty = 3.0 - 1.0 * clamp((asp - 1.3), 0, 1);
    cam.position.set(Math.sin(az) * Math.cos(el) * d, Math.sin(el) * d + ty, Math.cos(az) * Math.cos(el) * d);
    cam.lookAt(0, ty - 0.6, 1.2);
  }

  /** Параметри слідкуючої камери: видима зона ~27 одиниць по Z і ≥44 по X. */
  computeMatchBase() {
    const cam = this.matchCam, asp = this.w / this.h;
    const el = 57 * Math.PI / 180, half = Math.tan(cam.fov * Math.PI / 360);
    const dV = (37 * Math.sin(el)) / (2 * half), dH = 58 / (2 * half * asp);
    this.mBase = { dist: Math.max(dV, dH), dirY: Math.sin(el), dirZ: Math.cos(el), fov: cam.fov, half, asp, tx: this.mBase ? this.mBase.tx : 0, tz: this.mBase ? this.mBase.tz : 0, zoom: this.mBase ? this.mBase.zoom : 1 };
    this.updateMatchCam(0, true);
  }
  snapCamera() { if (this.mBase) { this.mBase.tx = 0; this.mBase.tz = 0; this.mBase.zoom = 1.8; } this.updateMatchCam(0, true); }

  setIntroCam(on, k = 0) { this.intro = on; this.introK = on ? k : 1; }
  addTrauma(v) { this.trauma = Math.min(1, this.trauma + v); }
  fovKick(v) { this.fov = Math.min(8, this.fov + v); }

  updateMatchCam(dt, snap) {
    const b = this.mBase, cam = this.matchCam; if (!b) return;
    this.trauma = Math.max(0, this.trauma - dt * 1.7);
    this.fov += (0 - this.fov) * Math.min(1, dt * 6);
    const m = this.match, ball = m ? m.ball : { x: 0, z: 0, vx: 0, vz: 0 };
    const aiming = m && m.aiming;
    // ціль: м'яч з упередженням у напрямку руху; під час прицілу кадр не рухається
    if (!aiming) {
      const lead = Math.min(1, Math.hypot(ball.vx, ball.vz) / 50);
      b.gx = ball.x * 0.94 + Math.max(-7, Math.min(7, ball.vx * 0.22)) * lead; b.gz = ball.z * 0.55 + Math.max(-4, Math.min(4, ball.vz * 0.15)) * lead - 2.4;
    }
    if (b.gx === undefined) { b.gx = 0; b.gz = 0; }
    const zoomT = (this.intro ? 1 + (1 - (1 - Math.pow(1 - this.introK, 3))) * 0.8 : 1) * (aiming ? 1.16 : (m && m.slow ? 0.94 : 1));
    const hx = b.dist * b.zoom * 2 * b.half * b.asp / 2, hz = 18 * b.zoom;
    const maxX = Math.max(0, L + 7 - hx), maxZ = Math.max(0, W + 3 - hz);
    const tx = Math.max(-maxX, Math.min(maxX, b.gx)), tz = Math.max(-maxZ, Math.min(maxZ, b.gz));
    const kf = snap ? 1 : 1 - Math.exp(-dt * 3.4), kz = snap ? 1 : 1 - Math.exp(-dt * 4);
    b.tx += (tx - b.tx) * kf; b.tz += (tz - b.tz) * kf; b.zoom += (zoomT - b.zoom) * kz;
    const dist = b.dist * b.zoom;
    const s = this.trauma * this.trauma, t = this.time;
    const sx = Math.sin(t * 47) * 0.6 * s, sy = Math.sin(t * 61 + 1) * 0.45 * s;
    cam.position.set(b.tx + sx, b.dirY * dist + sy, b.tz + b.dirZ * dist);
    cam.lookAt(b.tx, 0, b.tz);
    const f = b.fov - this.fov;
    if (Math.abs(cam.fov - f) > 0.01) { cam.fov = f; cam.updateProjectionMatrix(); }
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

  floatWorld(x, y, z, text, kind) {
    const cam = this.matchCam;
    _v.set(x, y, z).project(cam);
    this.ui.hud.float((_v.x * 0.5 + 0.5) * this.w, (-_v.y * 0.5 + 0.5) * this.h, text, kind);
  }

  // ---------------------------------------------------------------- ввід
  bindInput() {
    const c = this.canvas;
    let pid = -1, sx = 0, sy = 0, lx = 0, moved = false, t0 = 0;
    c.addEventListener('pointerdown', (e) => {
      if (pid !== -1 && this.match) this.match.cancelAim();   // попередній жест загубився: починаємо спочатку
      pid = e.pointerId; try { c.setPointerCapture(pid); } catch (_) { /* ignore */ }
      sx = lx = e.clientX; sy = e.clientY; moved = false; t0 = performance.now();
      if (this.sm.name === 'MATCH' && this.match) this.match.pointerDown(e.clientX, e.clientY);
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
      if (this.sm.name === 'MATCH' && this.match) this.match.pointerUp();
      if (this.sm.name === 'MENU') {
        this.orbit.dragging = false;
        if (!moved && performance.now() - t0 < 500) this.ui.menuTap();
      }
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', (e) => { if (e.pointerId === pid) { pid = -1; this.orbit.dragging = false; if (this.match) this.match.cancelAim(); } });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('blur', () => { pid = -1; this.orbit.dragging = false; if (this.match) this.match.cancelAim(); });
  }

  // ---------------------------------------------------------------- повний екран
  isFullscreen() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }
  async enterFullscreen() {
    const el = document.documentElement;
    try {
      if (!this.isFullscreen()) { const f = el.requestFullscreen || el.webkitRequestFullscreen; if (f) await f.call(el, { navigationUI: 'hide' }); }
    } catch (_) { /* iOS Safari не підтримує */ }
    try { if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape'); } catch (_) { /* потребує fullscreen */ }
  }
  toggleFullscreen() {
    if (this.isFullscreen()) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); }
    else this.enterFullscreen();
  }

  // ---------------------------------------------------------------- цикл
  tick(now) {
    requestAnimationFrame(this.tick);
    let dt = (now - this.last) / 1000; this.last = now;
    if (dt > 0.1) dt = 0.1; if (dt < 0) dt = 0;
    if (this.lost) return;
    this.governor(dt);
    this.sm.update(dt);
    const menu = this.sm.name === 'MENU';
    this.renderer.render(menu ? this.menuScene : this.match.view.scene, menu ? this.menuCam : this.matchCam);
    if (this.fps) this.fps(dt);
  }
}
