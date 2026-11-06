// portrait: рендерить 3D-модель гравця один раз у PNG для карток.
import * as THREE from 'three';
import { Player } from '../graphics/player.js';
import { S } from '../state/save.js';

/** Портрети для карток: справжня 3D-модель гравця, відрендерена один раз у PNG. */
let ctx = null;
const cache = new Map();

function init(renderer) {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9a7458, 1.25));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(-4, 8, 7); scene.add(sun);
  const cam = new THREE.PerspectiveCamera(26, 1, 1, 60);
  cam.position.set(0, 1.45, 6.6); cam.lookAt(0, 1.3, 0);
  const rt = new THREE.WebGLRenderTarget(256, 256, { samples: 4 });
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  const c2 = document.createElement('canvas'); c2.width = 256; c2.height = 256;
  ctx = { renderer, scene, cam, rt, c2, g: c2.getContext('2d'), buf: new Uint8Array(256 * 256 * 4), player: null };
}

export function portrait(renderer, look, key) {
  if (cache.has(key)) return cache.get(key);
  if (!ctx) init(renderer);
  const c = ctx;
  if (!c.player) { c.player = new Player(look); c.scene.add(c.player.root); }
  const p = c.player;
  p.setLook(look);
  p.root.scale.setScalar(1.0);
  p.yaw = 0.0; p.bodyYaw = 0.5; p.vx = p.vz = 0; p.mode = 'idle'; p.kicking = 0; p.x = 0; p.z = 0; p.diveT = 0;
  p.setExpr('happy');
  for (let i = 0; i < 8; i++) p.animate(0.05);   // суглоби встигають зайняти позу
  p.body.rotation.y = 0.5;
  if (look.gk) { p.armL.rotation.z = -0.9; p.armR.rotation.z = 0.9; }
  const prevRT = renderer.getRenderTarget(), prevColor = renderer.getClearColor(new THREE.Color()), prevA = renderer.getClearAlpha();
  renderer.setRenderTarget(c.rt); renderer.setClearColor(0x000000, 0); renderer.clear();
  renderer.render(c.scene, c.cam);
  renderer.readRenderTargetPixels(c.rt, 0, 0, 256, 256, c.buf);
  renderer.setRenderTarget(prevRT); renderer.setClearColor(prevColor, prevA);
  const img = c.g.createImageData(256, 256), d = img.data;
  for (let y = 0; y < 256; y++) d.set(c.buf.subarray((255 - y) * 1024, (256 - y) * 1024), y * 1024);
  c.g.putImageData(img, 0, 0);
  const url = c.c2.toDataURL('image/png');
  cache.set(key, url);
  return url;
}

// ------------------------------------------------------------------ гравець на весь зріст
// Живий 3D у власному контексті WebGL: одна канва на всю гру переходить туди, де зараз відкрито перегляд.
// Цикл працює, лише поки канву видно; обертається камера, а світло йде разом із нею, тож спина не темна.
const SPIN = (Math.PI * 2) / 9, _box = new THREE.Box3(), TAN = Math.tan((13 * Math.PI) / 180);
let v = null, vFailed = false, vRelease = 0;
const RELEASE_MS = 15000;                                           // сховали надовго: контекст звільняємо, у матчі телефону пам'ять потрібніша

function viewerInit() {
  const canvas = document.createElement('canvas'); canvas.className = 'on-tt-cv';
  const low = S.settings.quality === 'low', coarse = matchMedia('(pointer: coarse)').matches;
  const r = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: !low });
  r.setPixelRatio(Math.min(window.devicePixelRatio || 1, low ? 1 : coarse ? 1.5 : 2)); r.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9a7458, 1.25));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6); scene.add(sun);
  v = { canvas, r, scene, sun, cam: new THREE.PerspectiveCamera(26, 1, 1, 60), player: null, key: null, ang: 0, vel: 0, spin: SPIN, wait: 0, drag: null, run: 0, w: 0, h: 0, fit: 2.6, last: 0, gap: coarse || low ? 30 : 0, still: matchMedia('(prefers-reduced-motion: reduce)').matches };
  canvas.addEventListener('pointerdown', (e) => { v.drag = { id: e.pointerId, x: e.clientX, t: performance.now() }; v.vel = 0; try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ } canvas.classList.add('grab'); });
  canvas.addEventListener('pointermove', (e) => {
    const d = v.drag; if (!d || e.pointerId !== d.id) return;
    const da = -((e.clientX - d.x) / Math.max(1, canvas.clientWidth)) * Math.PI * 1.6, now = performance.now();
    v.ang += da; v.vel = da / Math.max(0.008, (now - d.t) / 1000); d.x = e.clientX; d.t = now;
  });
  const up = (e) => { const d = v.drag; if (!d || e.pointerId !== d.id) return; if (performance.now() - d.t > 90) v.vel = 0; v.drag = null; v.spin = 0; v.wait = performance.now() + 2200; canvas.classList.remove('grab'); };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
}
function viewerRelease() {
  if (!v || v.run) return;
  v.r.dispose(); v.r.forceContextLoss(); v = null;
}
/**
 * Звільнити другий WebGL-контекст одразу, а не через RELEASE_MS: матч стартує (збирає шейдери й текстури), а два контексти
 * на телефоні — це пам'ять, через яку браузер може забрати головний (графіка зникає). Наступний mountTurntable збудує заново.
 */
export function releaseTurntable() {
  if (!v) return;
  clearTimeout(vRelease); v.run = 0;
  viewerRelease();
}
function viewerLook(look, key) {
  if (v.key === key) return;
  v.key = key;
  if (!v.player) { v.player = new Player(look); v.scene.add(v.player.root); } else v.player.setLook(look);
  const p = v.player;
  p.root.scale.setScalar(1.0);
  p.yaw = 0; p.bodyYaw = 0; p.vx = p.vz = 0; p.mode = 'idle'; p.kicking = 0; p.x = 0; p.z = 0; p.diveT = 0;
  p.setExpr('happy');
  for (let i = 0; i < 8; i++) p.animate(0.05);
  _box.setFromObject(p.root);
  v.fit = Math.max(1.6, Math.min(3.4, _box.max.y));
}
function viewerTick(now) {
  if (!v) return;                                                     // контекст звільнили наперед (releaseTurntable)
  const c = v.canvas;
  if (!c.isConnected || !c.offsetParent) { v.run = 0; clearTimeout(vRelease); vRelease = setTimeout(viewerRelease, RELEASE_MS); return; }
  if (v.gap && now - v.last < v.gap) { requestAnimationFrame(viewerTick); return; }   // телефон: 30 кадрів, плавності вистачає
  const dt = Math.min(0.1, (now - v.last) / 1000); v.last = now;
  if (!v.drag && !v.still) {
    v.ang += v.vel * dt; v.vel *= Math.exp(-dt * 3.2);               // кинутий пальцем докручується й стихає
    if (now > v.wait && v.fixed) {                                  // стоїть (головна хабу): після повороту пальцем повертається обличчям найкоротшим шляхом
      v.ang = v.rest + ((((v.ang - v.rest + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
      v.ang += (v.rest - v.ang) * Math.min(1, dt * 1.4);
    } else if (now > v.wait) { v.spin += (SPIN - v.spin) * Math.min(1, dt * 1.6); v.ang += v.spin * dt; }
  }
  const w = c.clientWidth, h = c.clientHeight;
  if (w && h && (w !== v.w || h !== v.h)) { v.w = w; v.h = h; v.r.setSize(w, h, false); v.cam.aspect = w / h; v.cam.updateProjectionMatrix(); }
  if (!v.still) v.player.animate(dt);
  const f = v.fit, d = Math.max(f * 0.58, f * 0.42 / (v.cam.aspect || 1)) / TAN, sn = Math.sin(v.ang), cs = Math.cos(v.ang);
  v.cam.position.set(sn * d, f / 2 + 0.15, cs * d); v.cam.lookAt(0, f / 2, 0);
  v.sun.position.set(-4 * cs + 7 * sn, 8, 7 * cs + 4 * sn);
  v.r.render(v.scene, v.cam);
  requestAnimationFrame(viewerTick);
}
/**
 * Ставить живого гравця на місце заглушки ph. Якщо WebGL недоступний, лишається звичайна картинка still.
 * opts.fixed — гравець стоїть під кутом opts.rest (головна онлайн-хабу), а не обертається; пальцем його все одно можна покрутити.
 */
export function mountTurntable(ph, look, key, still, opts = {}) {
  if (!v && !vFailed) { try { viewerInit(); } catch (_) { vFailed = true; } }
  if (!v) { const img = new Image(); img.className = 'on-tt-cv'; img.src = still(); img.alt = ''; ph.replaceWith(img); return; }
  clearTimeout(vRelease);
  const fixed = !!opts.fixed;
  if (fixed && (!v.fixed || v.key !== key)) { v.ang = opts.rest ?? 0.32; v.vel = 0; }
  v.fixed = fixed; v.rest = opts.rest ?? 0.32;
  viewerLook(look, key);
  ph.replaceWith(v.canvas);
  if (!v.run) { v.run = 1; v.last = performance.now(); requestAnimationFrame(viewerTick); }
}
