// Game: рендерер, сцена меню, стейт-машина MENU/MATCH/GOAL/RESULT, головний цикл, ввід, камера матчу, якість.
import * as THREE from 'three';
import { StateMachine } from './stateMachine.js';
import { audio } from './audio.js';
import { S, commit } from '../state/save.js';
import { COL, matchSpec } from '../config.js';
import { stadiumTier } from '../state/economy.js';
import { Island } from '../graphics/island.js';
import { Particles } from '../graphics/particles.js';
import { Match } from '../match/match.js';
import { CineFX } from '../graphics/cinefx.js';
import { CamDirector, camInfoBlank } from './camera.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const _v = new THREE.Vector3();
const _d = new THREE.Vector3();

/** Екран поверх усього: графіка не запустилась або не повернулась (замість мовчазного порожнього поля). */
export function gfxFail(text) {
  const root = document.getElementById('ui');
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
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: S.settings.quality !== 'low', powerPreference: 'high-performance', stencil: false, alpha: false });
    this.renderer.setClearColor(COL.skyMenu, 1);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.1;
    this.coarse = coarse;
    this.res = coarse ? 0.85 : 1; this.ema = 16; this.evalT = 0; this.goodRuns = 0; this.pr = 0;
    this.slowT = 1; this.govBase = 0; this.govRes = 1; this.govStuck = false; this.upNeed = 3;
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
  ensureMatch() { if (!this.solo) { this.solo = new Match(this); this.match = this.solo; this.computeMatchBase(); } if (!this.match) this.match = this.solo; return this.solo; }

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
        if (data.guest) { g.ensureMatch(); g.match = data.guest; data.guest.start(data.spec, data.hudSpec); return; }   // онлайн-гість: показ гри господаря
        g.match = g.ensureMatch(); g.match.start(data.spec);
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
    const pr = Math.min(dpr, 2);
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

  /** Динамічна роздільність: тримаємо ~60 fps, не чіпаючи картинку без потреби. */
  governor(dt) {
    // поодинокий фриз (збірка сцени, GC) — не навантаження: у середнє не йде
    const slow = dt > 0.05, lone = slow && this.slowT > 0.5;
    this.slowT = slow ? 0 : this.slowT + dt;
    if (!lone) this.ema += (dt * 1000 - this.ema) * 0.08;
    this.evalT += dt;
    if (this.evalT < 1.4 || S.settings.quality !== 'auto') return;
    this.evalT = 0;
    if (this.ema > 20.5) {
      if (this.govStuck) return;
      if (this.res > 0.7) {
        if (!this.govBase) { this.govBase = this.ema; this.govRes = this.res; this.upNeed = Math.min(96, this.upNeed * 2); }   // кожен новий спад — обережніше піднімаємо назад
        this.res = Math.max(0.7, this.res - 0.1); this.goodRuns = 0; this.applyPixelRatio(false);
      } else if (this.govBase && this.ema > this.govBase * 0.9) {
        // роздільність не допомогла: упираємось не в GPU (режим економії 30 Гц, процесор) — повертаємо чітку картинку
        this.res = this.govRes; this.govStuck = true; this.goodRuns = 0; this.applyPixelRatio(false);
      }
      return;
    }
    this.govStuck = false; this.govBase = 0;
    // рівні 60 Гц дають ~16.7 мс: поріг вище за них, інакше на таких екранах роздільність не верталась би ніколи
    if (this.ema < 17.6 && this.res < 1) { if (++this.goodRuns >= this.upNeed) { this.res = Math.min(1, this.res + 0.06); this.goodRuns = 0; this.applyPixelRatio(false); } }
    else this.goodRuns = 0;
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
    this.lost = false; clearTimeout(this.lostT); this.last = performance.now();
    const f = document.getElementById('gfx-fail'); if (f) f.remove();
    if (!document.hidden) audio.resume();
  }

  onVisibility() {
    // онлайн-матч не стає на паузу (час спільний) — меню паузи не вискакує
    if (document.hidden) { audio.suspend(); if (this.match && this.match.isPlaying() && !(this.online && this.online.inMatch())) this.ui.pause(); }
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
    cd.update(dt, this.camI, cv, { asp: this.w / this.h, preset: st.camMode, dist: st.camDist, tilt: st.camTiltOff, follow: st.camFollow, snap });
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
          for (const [x, v, tg] of [[o.p, o.pv, ov.p], [o.l, o.lv, ov.l]]) {
            v.x += (w * w * (tg.x - x.x) - 2 * w * v.x) * h; v.y += (w * w * (tg.y - x.y) - 2 * w * v.y) * h; v.z += (w * w * (tg.z - x.z) - 2 * w * v.z) * h;
            x.x += v.x * h; x.y += v.y * h; x.z += v.z * h;
          }
          o.fv += (w * w * (ov.fov - o.f) - 2 * w * o.fv) * h; o.f += o.fv * h;
        }
      }
      cam.position.copy(this._ov.p); cam.lookAt(this._ov.l);
      // кінорежим: фокус там, куди дивиться камера (на героях кадру); aperture — з кадру (0 — без розмиття)
      if (ov.dof > 0 && S.settings.quality !== 'low') {
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
    for (const p of m.view.players) {
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
    for (const t of ['pointerdown', 'touchend', 'click']) addEventListener(t, () => { if (!this.lost && !document.hidden) audio.resume(); }, { capture: true, passive: true });
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
    const calm = this.sm.name === 'MENU' && (this.ui.panel || !this.ui.started);   // острів під панеллю чи заставкою: ~30 кадрів достатньо
    if (calm && now - this.last < 30) return;
    let dt = (now - this.last) / 1000; this.last = now;
    if (dt > 0.1) dt = 0.1; if (dt < 0) dt = 0;
    if (this.lost) return;
    if (!calm) this.governor(dt);
    this.sm.update(dt);
    if (this.link) this.link.frame();                 // онлайн-господар: кадр поз гостю
    const menu = this.sm.name === 'MENU';
    // кінофокус; якщо пристрій його не тягне (буфер чи шейдер) — той самий кадр звичайним рендером
    let done = false;
    if (!menu && this.dof && !this.cineBroken) { try { done = (this.cinefx ??= new CineFX(this.renderer)).render(this.match.view.scene, this.matchCam, this.dof.focus, this.dof.ap, dt); } catch (_) { this.cineBroken = true; } }
    // перші кадри з ефектом перевіряємо: однотонний кадр (білий/небо) — драйвер телефона зламав прохід; тоді ефект вимикаємо
    if (done && (this.cineChecks = (this.cineChecks || 0) + 1) <= 4 && this.cineFlat()) { this.cineBroken = true; done = false; }
    if (!done) this.renderer.render(menu ? this.menuScene : this.match.view.scene, menu ? this.menuCam : this.matchCam);
    if (this.fps) this.fps(dt);
  }
}
