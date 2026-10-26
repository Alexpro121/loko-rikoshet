import * as THREE from 'three';
import { PITCH } from '../config.js';
import { VoxelBuilder, rng } from './voxel.js';

const { L, W, WALL, GOAL_D } = PITCH;
const ROW_D = 1.45, ROW_H = 0.92;

function canvasTex(w, h, draw, opts = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (opts.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  return t;
}

/** Фасад над верхніми рядами: бетон, діагональні смуги лівреї УЗ, велика назва клубу й емблема. */
function facadeTexture() {
  return canvasTex(2048, 200, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#59636a'); gr.addColorStop(1, '#3c454b'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    // діагональні шеврони
    for (let x = -200; x < w; x += 170) { g.fillStyle = '#c8202b'; g.beginPath(); g.moveTo(x, h); g.lineTo(x + 60, h); g.lineTo(x + 140, 0); g.lineTo(x + 80, 0); g.fill(); g.fillStyle = '#1f8f3f'; g.beginPath(); g.moveTo(x + 70, h); g.lineTo(x + 110, h); g.lineTo(x + 190, 0); g.lineTo(x + 150, 0); g.fill(); g.fillStyle = '#f1efe8'; g.beginPath(); g.moveTo(x + 62, h); g.lineTo(x + 68, h); g.lineTo(x + 148, 0); g.lineTo(x + 142, 0); g.fill(); }
    g.fillStyle = 'rgba(8,14,12,0.66)'; g.fillRect(0, 0, w, h);                         // затемнення під текст
    g.fillStyle = '#f1efe8'; g.font = '800 120px Rubik, "Arial Black", sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'center';
    g.fillText('ЛОКОМОТИВ', w * 0.3, h * 0.5);
    g.fillStyle = '#e02a38'; g.font = '800 56px Rubik, "Arial Black", sans-serif'; g.fillText('ЗАЛІЗНИЧНИКИ · КИЇВ', w * 0.7, h * 0.34);
    g.fillStyle = '#f1efe8'; g.font = '800 54px Rubik, sans-serif'; g.fillText('З 1919 РОКУ', w * 0.7, h * 0.7);
    // емблема-трикутник
    const cx = w * 0.5, cy = h * 0.5; g.fillStyle = '#d4202c'; g.beginPath(); g.moveTo(cx, cy - 80); g.lineTo(cx + 78, cy + 66); g.lineTo(cx - 78, cy + 66); g.closePath(); g.fill();
    g.fillStyle = '#f1efe8'; g.beginPath(); g.moveTo(cx, cy - 46); g.lineTo(cx + 48, cy + 46); g.lineTo(cx - 48, cy + 46); g.closePath(); g.fill();
    g.fillStyle = '#1f8f3f'; g.beginPath(); g.moveTo(cx, cy - 6); g.lineTo(cx + 28, cy + 44); g.lineTo(cx - 28, cy + 44); g.closePath(); g.fill();
    g.fillStyle = '#ffe9a6'; for (let i = 0; i < 48; i++) g.fillRect(i * (w / 48) + 6, 6, w / 48 - 12, 8);    // ряд ламп угорі
  });
}

function windowsTexture() {
  return canvasTex(64, 128, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    for (let y = 6; y < h - 4; y += 16) for (let x = 6; x < w - 4; x += 14) { g.fillStyle = (x * 7 + y * 3) % 5 === 0 ? '#ffe9a6' : '#5d7a93'; g.fillRect(x, y, 8, 10); }
  }, { repeat: true });
}

/**
 * Оточення стадіону: фасади над трибунами, залізниця з електричками й опорами контактної мережі, багатоповерхівки, дерева й земля.
 * Усе поза зоною кадру геймплею; поїзд у кольорах Локо їздить за далекою трибуною.
 */
export function buildSurround() {
  const group = new THREE.Group();
  const rnd = rng(11);

  // земля навколо стадіону
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshLambertMaterial({ color: '#58724e' }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.6; group.add(ground);

  // фасади над трибунами
  const ft = facadeTexture(), fm = new THREE.MeshLambertMaterial({ map: ft, side: THREE.DoubleSide });
  const zf = W + WALL + 3.2, farBack = -(zf + 10 * ROW_D + 0.6), farH = 1 + 10 * ROW_H + 0.6;
  const far = new THREE.Mesh(new THREE.PlaneGeometry(2 * L + 20, 12), fm); far.position.set(0, farH + 6, farBack); group.add(far);
  const endW = 2 * W + 10;
  for (const sd of [-1, 1]) {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(endW, 9), fm.clone()); f.material.map = ft;
    const ex = sd * (L + GOAL_D + 4.5 + 8 * ROW_D + 0.6); f.position.set(ex, 1 + 8 * ROW_H + 0.6 + 4.5, 0); f.rotation.y = sd > 0 ? -Math.PI / 2 : Math.PI / 2; group.add(f);
  }

  // залізниця: насип, дві колії, шпали, опори контактної мережі
  const rz = -78, b = new VoxelBuilder(0.25);
  b.box(0, 0.3, rz, 420, 0.8, 9, '#6f6a60');
  for (const dz of [-1.4, 1.4]) { b.box(0, 0.95, rz + dz - 0.6, 420, 0.12, 0.14, '#b9c0c4'); b.box(0, 0.95, rz + dz + 0.6, 420, 0.12, 0.14, '#b9c0c4'); }
  for (let x = -208; x <= 208; x += 1.6) for (const dz of [-1.4, 1.4]) b.box(x, 0.8, rz + dz, 0.5, 0.1, 2.6, '#4a3a2a');
  for (let x = -200; x <= 200; x += 22) { b.box(x, 5, rz - 4.2, 0.35, 10, 0.35, '#59636a'); b.box(x, 9.6, rz - 2, 0.3, 0.3, 4.6, '#59636a'); b.box(x, 8.4, rz - 1.4, 0.15, 0.4, 0.15, '#9aa3a8'); b.box(x, 8.4, rz + 1.4, 0.15, 0.4, 0.15, '#9aa3a8'); }
  b.box(0, 8.1, rz - 1.4, 420, 0.06, 0.06, '#2a2f33'); b.box(0, 8.1, rz + 1.4, 420, 0.06, 0.06, '#2a2f33');
  group.add(b.mesh());

  // електричка в кольорах Локо: тепловоз + 5 вагонів
  const tb = new VoxelBuilder(0.2);
  const car = (x0, len, head) => {
    tb.box(x0 + len / 2, 2.1, rz - 1.4, len - 0.3, 2.6, 2.7, '#d4202c');
    for (let k = 0; k < 4; k++) tb.box(x0 + 1.4 + k * (len - 2.8) / 3, 2.5, rz - 1.4, (len - 2.8) / 3 - 0.5, 1.0, 2.76, '#15202a');
    tb.box(x0 + len / 2, 1.2, rz - 1.4, len - 0.3, 0.7, 2.76, '#1f8f3f');
    tb.box(x0 + len / 2, 0.55, rz - 1.4, len - 1.4, 0.5, 2.2, '#23272b');
    if (head) { tb.box(x0 + len - 0.1, 2.0, rz - 1.4, 0.6, 2.0, 2.5, '#d4202c'); tb.box(x0 + len + 0.12, 2.2, rz - 1.4, 0.2, 0.9, 1.9, '#1a2630'); tb.box(x0 + len + 0.2, 1.1, rz - 0.4, 0.15, 0.3, 0.3, '#fff6dc'); tb.box(x0 + len + 0.2, 1.1, rz - 2.4, 0.15, 0.3, 0.3, '#fff6dc'); }
  };
  for (let i = 0; i < 5; i++) car(-i * 12.4 - 12, 12, false);
  car(0, 12, true);
  const train = tb.mesh(); train.frustumCulled = false; group.add(train);

  // багатоповерхівки за залізницею (текстура вікон + різні кольори)
  const wt = windowsTexture(), cols = ['#d9d4c8', '#c7d1d6', '#e0c9bd', '#cfd6c4', '#b9c0c8', '#e4dccb'];
  for (let i = 0; i < 18; i++) {
    const w = 14 + rnd() * 10, h = 20 + rnd() * 26, d = 12 + rnd() * 6, x = -190 + i * 22 + (rnd() - 0.5) * 8, z = -112 - rnd() * 18;
    const t = wt.clone(); t.needsUpdate = true; t.repeat.set(Math.round(w / 3.2), Math.round(h / 5));
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ map: t, color: cols[i % cols.length] }));
    m.position.set(x, h / 2 - 0.5, z); group.add(m);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.6, d + 0.6), new THREE.MeshLambertMaterial({ color: '#4a5258' })); roof.position.set(x, h - 0.2, z); group.add(roof);
  }

  // дерева вздовж насипу
  const tg = new THREE.ConeGeometry(2.2, 6, 6), trunk = new THREE.CylinderGeometry(0.3, 0.4, 2, 5);
  const trees = new THREE.InstancedMesh(tg, new THREE.MeshLambertMaterial({ color: '#2e6a3e', flatShading: true }), 90);
  const trunks = new THREE.InstancedMesh(trunk, new THREE.MeshLambertMaterial({ color: '#5a4630' }), 90);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < 90; i++) {
    const x = -200 + rnd() * 400, z = -90 - rnd() * 18, s = 0.8 + rnd() * 0.9;
    m4.compose(new THREE.Vector3(x, 4 * s, z), new THREE.Quaternion(), new THREE.Vector3(s, s, s)); trees.setMatrixAt(i, m4);
    m4.compose(new THREE.Vector3(x, 0.6 * s, z), new THREE.Quaternion(), new THREE.Vector3(s, s, s)); trunks.setMatrixAt(i, m4);
  }
  group.add(trees, trunks);

  let tt = 0;
  return {
    group,
    update(dt) {
      tt += dt;
      const period = 46, ph = (tt % period) / period;              // поїзд проїжджає за ~14 с, далі пауза
      const x = -230 + ph * 560;
      train.position.x = x;
    },
  };
}
