import * as THREE from 'three';
import { Player } from '../graphics/player.js';

/** Портрети для карток: справжня 3D-модель гравця, відрендерена один раз у PNG. */
let ctx = null;
const cache = new Map();

function init(renderer) {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9a7458, 1.25));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(-4, 8, 7); scene.add(sun);
  const cam = new THREE.PerspectiveCamera(26, 1, 1, 60);
  cam.position.set(0, 2.0, 8.6); cam.lookAt(0, 1.62, 0);
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
