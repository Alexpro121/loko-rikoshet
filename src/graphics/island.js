import * as THREE from 'three';
import { VoxelBuilder, vcMat, lambert, rng, shade } from './voxel.js';
import { locoMesh, wagonMesh, LOCO_LEN, WAGON_LEN, GAP } from './train.js';
import { netTexture, netPlane, signTexture } from './textures.js';

const SEAT = ['#a8182b', '#1f7a4f', '#e4e2da'];
const HX = 17.5, HZ = 15.5, R = 3.6, HALF = 19;      // колія навколо стадіону
const easeBack = (t) => { const c1 = 0.9, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const easeOutQuint = (t) => 1 - Math.pow(1 - t, 5);
const glowTex = (() => { let t = null; return () => { if (t) return t; const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,246,214,1)'); gr.addColorStop(0.3, 'rgba(255,236,180,0.5)'); gr.addColorStop(1, 'rgba(255,230,170,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); t = new THREE.CanvasTexture(c); return t; }; })();

function stand(b, cx, cz, ang, len, r0, r1, rowH, rowD, y0, back = true) {
  const ca = Math.cos(ang), sa = Math.sin(ang);
  const P = (lx, lz) => [cx + lx * ca + lz * sa, cz - lx * sa + lz * ca];
  for (let r = r0; r < r1; r++) {
    const h = 0.55 + r * rowH, lz = r * rowD + rowD / 2;
    const [x, z] = P(0, lz);
    b.box(x, y0 + h / 2, z, len, h, rowD, r % 2 ? '#e7eaec' : '#dde1e4', ang);
    const n = Math.floor(len / 0.8);
    for (let k = 0; k < n; k++) {
      const [sx, sz] = P((k - (n - 1) / 2) * 0.8, lz + 0.05);
      b.box(sx, y0 + h + 0.16, sz, 0.62, 0.32, 0.5, SEAT[(k + r * 2) % 3], ang);
    }
  }
  if (back) {
    const H = 0.55 + r1 * rowH, [x, z] = P(0, r1 * rowD + 0.3);
    b.box(x, y0 + H / 2, z, len + 0.5, H, 0.6, '#cfd5d8', ang);
  }
  for (const sd of [-1, 1]) {
    const H = 0.55 + r1 * rowH, [x, z] = P(sd * (len / 2 + 0.2), (r1 * rowD) / 2);
    b.box(x, y0 + H / 2, z, 0.4, H, r1 * rowD, '#f1f3f4', ang);
  }
}

function buildLoop() {
  const pts = [];
  const add = (x, z) => pts.push(x, z);
  const straight = (x1, z1, x2, z2) => { const n = Math.ceil(Math.hypot(x2 - x1, z2 - z1) / 0.25); for (let i = 0; i < n; i++) add(x1 + (x2 - x1) * i / n, z1 + (z2 - z1) * i / n); };
  const arc = (cx, cz, a0, a1) => { const n = Math.ceil(Math.abs(a1 - a0) * R / 0.25); for (let i = 0; i < n; i++) { const a = a0 + (a1 - a0) * i / n; add(cx + Math.cos(a) * R, cz + Math.sin(a) * R); } };
  straight(0, -HZ, HX - R, -HZ); arc(HX - R, -HZ + R, -Math.PI / 2, 0);
  straight(HX, -HZ + R, HX, HZ - R); arc(HX - R, HZ - R, 0, Math.PI / 2);
  straight(HX - R, HZ, -HX + R, HZ); arc(-HX + R, HZ - R, Math.PI / 2, Math.PI);
  straight(-HX, HZ - R, -HX, -HZ + R); arc(-HX + R, -HZ + R, Math.PI, Math.PI * 1.5);
  straight(-HX + R, -HZ, 0, -HZ);
  const n = pts.length / 2, cum = new Float32Array(n + 1);
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; cum[i + 1] = cum[i] + Math.hypot(pts[j * 2] - pts[i * 2], pts[j * 2 + 1] - pts[i * 2 + 1]); }
  return { pts, n, cum, len: cum[n] };
}

export class Island {
  constructor(particles) {
    this.group = new THREE.Group();
    this.particles = particles;
    this.t = 0; this.smokeT = 0; this.fwT = 3;
    this.tierGroups = []; this.pops = []; this.flags = [];
    this.curTier = -1; this.extent = 19; this.extentTarget = 19;
    this.loop = buildLoop();
    this.buildBase();
    this.buildTrack();
    this.buildStadium();
    this.buildTrophy();
    this.buildSky();
    this.buildTrain();
  }

  buildBase() {
    const b = new VoxelBuilder(), rnd = rng(5);
    // верх: ґрунт із плямами
    b.box(0, -0.5, 0, 2 * HALF, 1, 2 * HALF, '#a8664c');
    for (let i = 0; i < 70; i++) {
      const x = (rnd() - 0.5) * (2 * HALF - 1), z = (rnd() - 0.5) * (2 * HALF - 1), s = 0.5 + rnd() * 1.8;
      b.box(x, 0.01, z, s, 0.03, s * (0.6 + rnd() * 0.8), rnd() > 0.5 ? '#9c5b42' : '#b7745a', rnd() * 3);
    }
    // шари під островом
    for (let i = 0; i < 11; i++) {
      const sz = 2 * HALF - 1.6 - i * 2.3, y = -1.6 - i * 1.5;
      b.box(0, y, 0, sz, 1.5, sz, i % 2 ? '#86493a' : '#9a5841');
      for (let k = 0; k < 4; k++) { const s = 1 + rnd() * 2.2; const side = (rnd() > 0.5 ? 1 : -1) * sz / 2; if (rnd() > 0.5) b.box(side, y, (rnd() - 0.5) * sz, 0.8, 1.5, s, i % 2 ? '#9a5841' : '#86493a'); else b.box((rnd() - 0.5) * sz, y, side, s, 1.5, 0.8, i % 2 ? '#9a5841' : '#86493a'); }
    }
    // камені, дерева
    for (const [x, z, s] of [[-18, -12, 1.2], [17.9, 11.5, 1.5], [-18, 4, 0.9], [15, -17.5, 1.1]]) {
      b.box(x, s * 0.35, z, s * 1.6, s * 0.7, s * 1.2, '#7b8590', rnd() * 3); b.box(x + 0.4, s * 0.8, z + 0.2, s, s * 0.6, s * 0.8, '#98a2ac', rnd() * 3);
    }
    const cone = new THREE.CylinderGeometry(0, 1, 2.4, 6);
    for (const [x, z, s] of [[-18, -17, 1], [18, -18, 1.2], [-17.8, 17.5, 1.1], [18, 17.2, 0.9], [-7, 18, 0.9], [8, -18, 1]]) {
      b.box(x, 0.5 * s, z, 0.5 * s, s, 0.5 * s, '#6b4a2e');
      b.shape(cone, x, 2.0 * s, z, '#2f8a56', 0, rnd() * 3, 0, 1.3 * s, 1.1 * s, 1.3 * s);
      b.shape(cone, x, 3.1 * s, z, '#256e47', 0, rnd() * 3, 0, 0.95 * s, 0.9 * s, 0.95 * s);
    }
    // станція «Локомотив»
    b.box(-14.7, 0.9, 11.3, 3.4, 1.8, 2.2, '#f4f4f2'); b.box(-14.7, 2.0, 11.3, 3.8, 0.4, 2.6, '#e11d2e');
    b.box(-14.7, 2.5, 11.3, 3.0, 0.5, 1.6, '#e11d2e'); b.box(-14.7, 1.0, 12.42, 3.0, 0.5, 0.06, '#12a150');
    b.box(-14.7, 0.1, 13.4, 5.6, 0.25, 1.3, '#cfd5d8');
    // семафор
    b.box(-11.3, 1.6, 12.9, 0.2, 3.2, 0.2, '#dfe3e6'); b.box(-11.3, 3.3, 12.9, 0.55, 1.15, 0.3, '#15191c');
    // лавки й ліхтарі на платформі
    for (const bx of [-16.2, -13.2]) { b.box(bx, 0.45, 13.65, 1.1, 0.12, 0.38, '#7a5a3a'); b.box(bx - 0.4, 0.28, 13.65, 0.1, 0.3, 0.3, '#2a2f33'); b.box(bx + 0.4, 0.28, 13.65, 0.1, 0.3, 0.3, '#2a2f33'); b.box(bx, 0.7, 13.8, 1.1, 0.3, 0.08, '#7a5a3a'); }
    for (const lx of [-16.7, -12.7]) { b.box(lx, 1.5, 13.9, 0.1, 3.0, 0.1, '#3a4247'); b.box(lx, 3.05, 13.9, 0.5, 0.14, 0.2, '#3a4247'); }
    // квіти й кущі
    for (let i = 0; i < 46; i++) { const fx = (rnd() - 0.5) * 36, fz = (rnd() - 0.5) * 36; if (Math.abs(fx) < 16.5 && Math.abs(fz) < 14.5) continue; b.box(fx, 0.12, fz, 0.16, 0.24, 0.16, ['#ffd24a', '#ff7a8a', '#ffffff', '#c9a6ff'][i % 4]); b.box(fx, 0.03, fz, 0.3, 0.06, 0.3, '#3a8a4a'); }
    this.base = b.mesh();
    this.group.add(this.base);
    // анімовані дрібниці: лампи семафора, годинник станції, птахи
    this.semR = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.26, 0.1), new THREE.MeshBasicMaterial({ color: '#ff4b57' })); this.semR.position.set(-11.3, 3.62, 13.07);
    this.semG = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.26, 0.1), new THREE.MeshBasicMaterial({ color: '#35e07a' })); this.semG.position.set(-11.3, 3.1, 13.07);
    this.group.add(this.semR, this.semG);
    const cl = new THREE.Mesh(new THREE.CircleGeometry(0.34, 18), new THREE.MeshBasicMaterial({ color: '#f4f4ee' })); cl.position.set(-13.3, 1.4, 12.43); this.group.add(cl);
    this.hand = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.26, 0.02), new THREE.MeshBasicMaterial({ color: '#14201f' })); this.hand.geometry.translate(0, 0.12, 0); this.hand.position.set(-13.3, 1.4, 12.45); this.group.add(this.hand);
    this.birds = [];
    for (let i = 0; i < 4; i++) {
      const bg = new THREE.Group(), wm = new THREE.MeshBasicMaterial({ color: '#2a3238' });
      const wl = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.22), wm), wr = wl.clone(); wl.position.x = -0.26; wr.position.x = 0.26;
      bg.add(wl, wr, new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.14, 0.34), wm)); this.group.add(bg); this.birds.push({ g: bg, wl, wr, ph: i * 1.7, r: 7 + i * 2.2, h: 9 + i * 1.3 });
    }
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.62), new THREE.MeshBasicMaterial({ map: signTexture('ЛОКОМОТИВ · 1919') }));
    sign.position.set(-14.7, 1.52, 12.43); this.group.add(sign);
  }

  buildTrack() {
    const b = new VoxelBuilder(), { pts, n } = this.loop;
    for (let i = 0; i < n; i += 3) {
      const j = (i + 1) % n, k = (i + 3) % n;
      const x = pts[i * 2], z = pts[i * 2 + 1], dx = pts[k * 2] - x, dz = pts[k * 2 + 1] - z, yaw = Math.atan2(dx, dz);
      b.box(x, 0.06, z, 1.9, 0.1, 0.34, '#6b4a33', yaw);
    }
    for (let i = 0; i < n; i++) {
      const k = (i + 1) % n, x = pts[i * 2], z = pts[i * 2 + 1], dx = pts[k * 2] - x, dz = pts[k * 2 + 1] - z, l = Math.hypot(dx, dz), yaw = Math.atan2(dx, dz);
      const nx = Math.cos(yaw) * 0.7, nz = -Math.sin(yaw) * 0.7;
      for (const sd of [-1, 1]) b.box(x + dx / 2 + nx * sd, 0.17, z + dz / 2 + nz * sd, 0.14, 0.12, l + 0.06, '#c9d1d6', yaw);
    }
    this.group.add(b.mesh());
  }

  buildStadium() {
    const root = (this.stadium = new THREE.Group());
    this.group.add(root);
    // 0: поле, ворота
    const b = new VoxelBuilder();
    b.box(0, 0.3, 0, 14.8, 0.6, 10.6, '#2b3438');
    for (let i = 0; i < 8; i++) b.box(-5.6 + i * 1.6 + 0.8 - 0.8 + 0.0, 0.62, 0, 1.6, 0.06, 8.6, i % 2 ? '#34c84d' : '#2bb544');
    const ln = '#f4fff4';
    b.box(0, 0.66, 0, 0.12, 0.03, 8.2, ln);
    b.shape(new THREE.RingGeometry(1.4, 1.52, 24), 0, 0.68, 0, ln, -Math.PI / 2);
    for (const sd of [-1, 1]) {
      b.box(sd * 4.9, 0.66, 0, 0.12, 0.03, 4.8, ln); b.box(sd * 5.6, 0.66, 2.4, 1.6, 0.03, 0.12, ln); b.box(sd * 5.6, 0.66, -2.4, 1.6, 0.03, 0.12, ln);
      b.box(sd * 6.7, 1.1, 1.4, 0.2, 1.0, 0.2, '#fff'); b.box(sd * 6.7, 1.1, -1.4, 0.2, 1.0, 0.2, '#fff'); b.box(sd * 6.7, 1.6, 0, 0.2, 0.2, 2.9, '#fff');
    }
    root.add(b.mesh());
    const netMat = new THREE.MeshBasicMaterial({ map: netTexture(), transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, depthWrite: false });
    for (const sd of [-1, 1]) {
      const m = new THREE.Mesh(netPlane(2.9, 1.0, 0.3), netMat); m.position.set(sd * 7.1, 1.1, 0); m.rotation.y = Math.PI / 2; root.add(m);
    }
    // яруси
    const add = (fn, extra) => {
      const bb = new VoxelBuilder(); fn(bb);
      const g = new THREE.Group(); if (bb.n) g.add(bb.mesh()); if (extra) extra(g);
      g.visible = false; root.add(g); this.tierGroups.push(g);
    };
    // 1: дальня трибуна + низька ближня
    add((bb) => { stand(bb, 0, -5.3, Math.PI, 13.6, 0, 5, 0.55, 0.85, 0.6); stand(bb, 0, 5.4, 0, 8, 0, 2, 0.5, 0.8, 0.6); });
    // 2: бічні трибуни
    add((bb) => { stand(bb, 7.6, 0, Math.PI / 2, 8.6, 0, 5, 0.55, 0.85, 0.6); stand(bb, -7.6, 0, -Math.PI / 2, 8.6, 0, 5, 0.55, 0.85, 0.6); });

    // 2: тунель гравців і лавки запасних
    add((bb) => {
      bb.box(0, 0.62, 5.62, 2.6, 1.0, 0.7, '#14181b'); bb.box(0, 1.2, 5.45, 3.0, 0.22, 1.0, '#c9ced1'); bb.box(-1.4, 0.85, 5.62, 0.22, 1.7, 0.7, '#c9ced1'); bb.box(1.4, 0.85, 5.62, 0.22, 1.7, 0.7, '#c9ced1');
      bb.box(0, 0.66, 5.2, 1.7, 0.05, 1.0, '#a8182b');
      for (const sx of [-1, 1]) {
        const x = sx * 4.4;
        bb.box(x, 0.45, 5.45, 2.8, 0.14, 0.5, '#3a4247'); bb.box(x, 0.8, 5.65, 2.8, 0.5, 0.1, '#e11d2e');
        bb.box(x, 1.55, 5.7, 3.0, 0.1, 1.0, '#d4e8f2'); for (const dx of [-1.4, 1.4]) bb.box(x + dx, 0.8, 5.7, 0.08, 1.6, 0.08, '#aeb6bb');
        for (let i = 0; i < 5; i++) bb.box(x - 1.1 + i * 0.55, 0.62, 5.45, 0.4, 0.4, 0.4, ['#e11d2e', '#12a150', '#f4f4f2'][i % 3]);
      }
    });
    // 3: прожектори: конічна щогла з поперечками, площадка з перилами, ряд самосвітних ламп, сяйво й промені
    add((bb) => {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const x = sx * 7.4, z = sz * 5.5, yaw = Math.atan2(-sx, -sz);
        bb.box(x, 0.35, z, 0.9, 0.7, 0.9, '#8d979d'); bb.box(x, 2.2, z, 0.5, 3.2, 0.5, '#b4bcc1'); bb.box(x, 4.6, z, 0.38, 2.4, 0.38, '#b4bcc1'); bb.box(x, 6.2, z, 0.3, 1.0, 0.3, '#b4bcc1');
        for (let k = 0; k < 6; k++) { bb.box(x, 0.9 + k * 0.95, z, 0.78 - k * 0.06, 0.07, 0.07, '#8d979d', yaw); bb.box(x, 0.9 + k * 0.95, z, 0.07, 0.07, 0.78 - k * 0.06, '#8d979d', yaw); }
        bb.box(x, 6.75, z, 1.9, 0.14, 1.2, '#4a5359', yaw);                                  // площадка
        bb.box(x, 7.15, z, 2.1, 1.35, 0.26, '#2b3236', yaw);                                  // рама ламп
        bb.box(x, 7.95, z, 2.1, 0.1, 0.34, '#e11d2e', yaw);                                   // червона смуга
      }
    }, (g) => {
      this.lamps = [];
      const lm = new THREE.MeshBasicMaterial({ color: '#fff3c0', fog: false });
      const spm = (o) => new THREE.SpriteMaterial({ map: glowTex(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0, fog: false });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const x = sx * 7.4, z = sz * 5.5, yaw = Math.atan2(-sx, -sz), holder = new THREE.Group();
        holder.position.set(x, 7.15, z); holder.rotation.y = yaw;
        const meshes = [];
        for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
          const lmesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.46, 0.08), lm.clone()); lmesh.position.set((i - 1) * 0.62, (j - 0.5) * 0.56, 0.16); holder.add(lmesh); meshes.push(lmesh);
        }
        const sp = new THREE.Sprite(spm()); sp.scale.set(5.4, 3.6, 1); sp.position.set(0, 0, 0.5); holder.add(sp);
        const beam = new THREE.Mesh(new THREE.ConeGeometry(2.8, 11, 14, 1, true), new THREE.MeshBasicMaterial({ color: '#fff3c0', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
        beam.rotation.x = -Math.PI / 2 - 0.5; beam.position.set(0, -2.0, 5.4); holder.add(beam);
        g.add(holder); this.lamps.push({ meshes, sp, beam });
      }
      this.lampK = 0;
    });
    // 4: другий ярус на далекій і бічних
    add((bb) => { stand(bb, 0, -5.3, Math.PI, 13.6, 5, 9, 0.55, 0.85, 0.6, true); stand(bb, 7.6, 0, Math.PI / 2, 8.6, 5, 8, 0.55, 0.85, 0.6); stand(bb, -7.6, 0, -Math.PI / 2, 8.6, 5, 8, 0.55, 0.85, 0.6); });
    // 5: LED-борти навколо поля й кутові екрани
    add((bb) => {
      const cols = ['#e11d2e', '#f4f4f2', '#12a150', '#1c2328'];
      for (let i = 0; i < 12; i++) { bb.box(-6.6 + i * 1.2, 0.85, 5.6, 1.1, 0.42, 0.1, cols[i % 4]); bb.box(-6.6 + i * 1.2, 0.85, -5.6, 1.1, 0.42, 0.1, cols[(i + 2) % 4]); }
      for (let i = 0; i < 7; i++) { bb.box(7.55, 0.85, -4.2 + i * 1.4, 0.1, 0.42, 1.3, cols[(i + 1) % 4]); bb.box(-7.55, 0.85, -4.2 + i * 1.4, 0.1, 0.42, 1.3, cols[(i + 3) % 4]); }
      for (const sx of [-1, 1]) { bb.box(sx * 6.4, 3.2, 6.5, 0.3, 4.6, 0.3, '#aeb6bb'); bb.box(sx * 6.4, 5.4, 6.5, 2.8, 1.6, 0.3, '#10161a'); bb.box(sx * 6.4, 5.4, 6.62, 2.5, 1.3, 0.05, '#35e07a'); bb.box(sx * 6.4, 5.4, 6.67, 1.4, 0.3, 0.04, '#ffffff'); }
    });
    // 5: дах і табло
    add((bb) => {
      bb.box(0, 6.2, -8.2, 14.4, 0.3, 4.6, '#f4f4f2', 0, -0.18, 0); bb.box(0, 6.0, -10.3, 14.4, 0.6, 0.3, '#e11d2e');
      for (const sx of [-6.8, 6.8]) bb.box(sx, 3.1, -10.2, 0.35, 6.2, 0.35, '#aeb6bb');
      bb.box(0, 5.2, -10.0, 5.2, 1.5, 0.3, '#14201f'); bb.box(0, 5.2, -9.85, 4.8, 1.1, 0.06, '#35e07a');
      for (let i = 0; i < 4; i++) bb.box(-1.6 + i * 1.07, 5.2, -9.8, 0.7, 0.6, 0.06, i % 2 ? '#14201f' : '#fff');
    });
    // 6: прапори
    add(() => {}, (g) => {
      const pole = new VoxelBuilder();
      const spots = [[-6.5, -9.2], [6.5, -9.2], [-8.8, 5.6], [8.8, 5.6], [0, -11.0], [-8.8, -4.5]];
      spots.forEach(([x, z], i) => {
        pole.box(x, 4.2, z, 0.18, 8.4, 0.18, '#dfe3e6');
        const fb = new VoxelBuilder(); fb.box(0.8, 0, 0, 1.6, 0.5, 0.06, '#e11d2e'); fb.box(0.8, -0.5, 0, 1.6, 0.5, 0.06, '#12a150');
        const fm = fb.mesh(vcMat(), { static: false }); const holder = new THREE.Group(); holder.position.set(x, 8.0, z); holder.add(fm); g.add(holder);
        this.flags.push({ holder, ph: i * 1.3 });
      });
      g.add(pole.mesh());
    });
    // 8: розширення території + клубний магазин і кафе
    const frame = (bb, h0, h1) => {
      const m = (h0 + h1) / 2, d = h1 - h0;
      for (const [cx, cz, w, dd] of [[0, -m, 2 * h1, d], [0, m, 2 * h1, d], [m, 0, d, 2 * h0], [-m, 0, d, 2 * h0]]) {
        bb.box(cx, -0.5, cz, w, 1, dd, '#a8664c');
        for (let i = 0; i < 3; i++) bb.box(cx, -1.6 - i * 1.5, cz, w - 1.4 - i * 1.2, 1.5, dd - 0.8 - i * 0.6, i % 2 ? '#86493a' : '#9a5841');
        bb.box(cx, 0.02, cz, w - 0.6, 0.05, dd - 0.6, '#5fa05c');
      }
    };
    add((bb) => {
      frame(bb, 19, 24);
      // магазин «ЛОКО»
      bb.box(-8, 1.5, 21, 6, 3, 4.2, '#d4202c'); bb.box(-8, 3.1, 21, 6.6, 0.3, 4.8, '#f4f4f2'); bb.box(-8, 1.1, 18.85, 4.6, 1.6, 0.1, '#14201f');
      for (let i = 0; i < 6; i++) bb.box(-10.5 + i * 1.0, 2.55, 18.7, 1.0, 0.6, 0.5, i % 2 ? '#f4f4f2' : '#d4202c');
      // кафе з парасолями
      bb.box(4, 1.3, 21, 5, 2.6, 4, '#1f8f3f'); bb.box(4, 2.8, 21, 5.6, 0.3, 4.6, '#f4f4f2');
      for (const [x, z] of [[1, 17.6], [4, 17.2], [7, 17.6]]) { bb.box(x, 0.45, z, 0.1, 0.9, 0.1, '#c9ced1'); bb.box(x, 0.92, z, 0.8, 0.06, 0.8, '#f4f4f2'); bb.shape(new THREE.ConeGeometry(1.0, 0.5, 8), x, 1.9, z, ['#d4202c', '#f4f4f2', '#1f8f3f'][(x | 0) % 3], 0, 0, 0, 1, 1, 1); bb.box(x, 1.2, z, 0.06, 1.4, 0.06, '#59636a'); }
      for (const [x, z, s2] of [[-14, 22, 1], [12, 22.5, 1.1], [-2, 22.5, 0.9]]) { bb.box(x, 0.5 * s2, z, 0.5 * s2, s2, 0.5 * s2, '#6b4a2e'); bb.shape(new THREE.ConeGeometry(1, 2.4, 6), x, 2.0 * s2, z, '#2f8a56', 0, 0, 0, 1.3 * s2, 1.1 * s2, 1.3 * s2); }
    }, (g) => {
      const sg = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.62), new THREE.MeshBasicMaterial({ map: signTexture('ЛОКО ШОП', '#d4202c') })); sg.position.set(-8, 3.55, 18.7); g.add(sg);
      const sc = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 0.6), new THREE.MeshBasicMaterial({ map: signTexture('КАФЕ «ВПЕРЕД»', '#157a46') })); sc.position.set(4, 3.15, 18.97); g.add(sc);
    });
    // 9: тренувальне поле
    add((bb) => {
      bb.box(0, 0.08, -21, 11, 0.16, 6.2, '#2b3438');
      for (let i = 0; i < 6; i++) bb.box(-4.6 + i * 1.85 + 0.9, 0.2, -21, 1.85, 0.06, 5.6, i % 2 ? '#34c84d' : '#2bb544');
      bb.box(0, 0.24, -21, 0.1, 0.03, 5.6, '#f4fff4'); bb.shape(new THREE.RingGeometry(0.9, 1.0, 20), 0, 0.26, -21, '#f4fff4', -Math.PI / 2);
      for (const sx of [-1, 1]) { bb.box(sx * 5.3, 0.6, -21.7, 0.12, 0.9, 0.12, '#fff'); bb.box(sx * 5.3, 0.6, -20.3, 0.12, 0.9, 0.12, '#fff'); bb.box(sx * 5.3, 1.05, -21, 0.12, 0.12, 1.6, '#fff'); }
      for (let i = 0; i < 6; i++) bb.shape(new THREE.ConeGeometry(0.22, 0.36, 6), -2.4 + i * 0.9, 0.38, -22.8, '#ff8a2a');
      bb.box(0, 0.5, -24.2, 6, 0.9, 0.8, '#e8e4d8'); bb.box(0, 1.1, -24.2, 6.4, 0.2, 1.2, '#d4202c');
    });
    // 10: розширення + музей «Зал слави»
    add((bb) => {
      frame(bb, 24, 29);
      bb.box(-26.5, 2.2, 0, 7, 4.4, 9, '#cfe6f0'); bb.box(-26.5, 4.6, 0, 7.6, 0.4, 9.6, '#14201f');
      for (let i = 0; i < 5; i++) bb.box(-22.95, 2.2, -3.6 + i * 1.8, 0.1, 3.4, 1.4, '#9ec7d8');
      bb.box(-23.1, 0.5, 0, 0.9, 1, 3.4, '#dfe3e6'); bb.box(-23.1, 1.0, 0, 3.8, 0.2, 3.8, '#e11d2e');
      bb.shape(new THREE.CylinderGeometry(0.4, 0.7, 1.4, 8), -26.5, 5.5, 0, '#ffc61a');
      bb.shape(new THREE.CylinderGeometry(0.9, 0.5, 0.5, 8), -26.5, 6.5, 0, '#ffdd55');
      for (const [x, z, s2] of [[-27, -9, 1], [-27, 9, 1.1], [-23, 11, 0.9], [-23, -11, 1]]) { bb.box(x, 0.5 * s2, z, 0.5 * s2, s2, 0.5 * s2, '#6b4a2e'); bb.shape(new THREE.ConeGeometry(1, 2.4, 6), x, 2.0 * s2, z, '#2f8a56', 0, 0, 0, 1.3 * s2, 1.1 * s2, 1.3 * s2); }
    }, (g) => {
      const sg = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 0.7), new THREE.MeshBasicMaterial({ map: signTexture('ЗАЛ СЛАВИ ЛОКО', '#14201f', '#ffc61a') })); sg.position.set(-22.9, 3.6, 0); sg.rotation.y = Math.PI / 2; g.add(sg);
    });
    // 11: готель і офіс клубу
    add((bb) => {
      bb.box(26.5, 7.5, 0, 7, 15, 7, '#f1efe8'); bb.box(26.5, 15.3, 0, 7.5, 0.6, 7.5, '#1f8f3f');
      for (let r = 0; r < 7; r++) for (let c = 0; c < 4; c++) { bb.box(23.3, 2 + r * 1.9, -2.4 + c * 1.6, 0.08, 1.1, 1.0, (r + c) % 5 === 0 ? '#ffe9a6' : '#5d7a93'); bb.box(26.5 + (c - 1.5) * 1.6, 2 + r * 1.9, 3.55, 1.0, 1.1, 0.08, (r * 3 + c) % 4 === 0 ? '#ffe9a6' : '#5d7a93'); }
      bb.box(23.3, 7.5, 0, 0.12, 15, 0.9, '#d4202c'); bb.box(23.3, 7.5, 0, 0.14, 0.4, 7, '#d4202c');
      bb.box(26.5, 16.2, 0, 0.3, 1.8, 0.3, '#aeb6bb'); bb.box(26.5, 17.2, 0, 2.6, 0.9, 0.3, '#10161a'); bb.box(26.5, 17.2, 0.16, 2.3, 0.6, 0.05, '#35e07a');
    });
    // 12: розширення + паркінг і клубні автобуси
    add((bb) => {
      frame(bb, 29, 34);
      bb.box(0, 0.06, 31.5, 24, 0.12, 6, '#3b4247');
      for (let i = 0; i < 12; i++) bb.box(-10.4 + i * 1.9, 0.14, 30.2, 0.08, 0.04, 2.6, '#f4f4f2');
      const cc = ['#d4202c', '#f4f4f2', '#1f8f3f', '#1c2328', '#c9ced1', '#254e9c'];
      for (let i = 0; i < 9; i++) { const x = -10 + i * 2.1; bb.box(x, 0.45, 30.3, 1.5, 0.6, 0.9, cc[i % 6]); bb.box(x, 0.85, 30.3, 0.9, 0.3, 0.8, '#15202a'); }
      for (const bx of [4, 9]) { bb.box(bx, 0.95, 33, 4.2, 1.5, 1.4, '#d4202c'); bb.box(bx, 0.8, 33, 4.2, 0.6, 1.42, '#1f8f3f'); bb.box(bx, 1.45, 33, 3.6, 0.5, 1.44, '#15202a'); }
      for (const x of [-12, 0, 12]) { bb.box(x, 3, 33.8, 0.15, 6, 0.15, '#59636a'); bb.box(x, 6.1, 33.8, 1.2, 0.2, 0.5, '#fff6dc'); }
    });
    // 7: золота арена
    add((bb) => {
      bb.box(0, 6.55, -8.2, 14.8, 0.18, 4.8, '#ffc61a', 0, -0.18, 0);
      for (const sd of [-1, 1]) { bb.box(sd * 7.7, 2.6, 4.3, 0.5, 5.2, 0.5, '#ffc61a'); bb.shape(new THREE.SphereGeometry(0.55, 6, 5), sd * 7.7, 5.4, 4.3, '#ffe27a'); }
      bb.box(0, 0.66, 0, 15.4, 0.14, 11.2, '#ffc61a');
    });
  }

  buildTrophy() {
    const b = new VoxelBuilder();
    const cyl = (rt, rb, h, y, col) => b.shape(new THREE.CylinderGeometry(rt, rb, h, 8), 0, y, 0, col);
    cyl(1.9, 2.2, 0.5, 0.25, '#e0a800'); cyl(1.5, 1.8, 0.5, 0.75, '#ffc61a'); cyl(1.1, 1.3, 0.4, 1.2, '#ffdd55');
    cyl(0.4, 0.55, 1.3, 2.0, '#ffc61a'); cyl(0.9, 0.5, 0.35, 2.75, '#e0a800');
    cyl(1.7, 0.7, 1.9, 3.85, '#ffc61a'); cyl(1.78, 1.7, 0.3, 4.95, '#ffdd55');
    for (const sd of [-1, 1]) {
      b.box(sd * 1.95, 4.1, 0, 0.35, 1.3, 0.35, '#e0a800', 0, 0, sd * 0.35);
      b.box(sd * 2.25, 4.7, 0, 0.8, 0.35, 0.35, '#e0a800'); b.box(sd * 1.95, 3.5, 0, 0.8, 0.35, 0.35, '#e0a800');
    }
    b.box(0, 3.9, 1.5, 0.55, 1.4, 0.2, '#fff0a0'); b.box(0, 3.9, -1.5, 0.55, 1.4, 0.2, '#fff0a0');
    this.trophyGeo = b.build();
    this.trophy = new THREE.Mesh(this.trophyGeo, vcMat());
    this.trophyHolder = new THREE.Group(); this.trophyHolder.position.set(14.5, 0, -12.5); this.trophyHolder.add(this.trophy);
    const pb = new VoxelBuilder(); pb.box(0, 0.4, 0, 4.6, 0.8, 4.6, '#dfe3e6'); pb.box(0, 0.85, 0, 3.8, 0.2, 3.8, '#e11d2e');
    this.trophyHolder.add(pb.mesh());
    this.trophy.position.y = 0.9;
    this.group.add(this.trophyHolder);
    // шафа кубків: міні-копії
    this.mini = new THREE.InstancedMesh(this.trophyGeo, vcMat(), 8);
    this.mini.count = 0; this.mini.frustumCulled = false;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(0.2, 0.2, 0.2);
    for (let i = 0; i < 8; i++) { m.compose(new THREE.Vector3(-5.6 + i * 1.6, 1.2, 13.6), q, s); this.mini.setMatrixAt(i, m); }
    const shelf = new VoxelBuilder(); shelf.box(0, 0.45, 13.6, 14, 0.9, 1.3, '#dfe3e6'); shelf.box(0, 0.95, 13.6, 13.6, 0.1, 1.1, '#12a150');
    this.shelf = shelf.mesh(); this.shelf.visible = false;
    this.group.add(this.mini, this.shelf);
  }

  setTrophies(n) {
    this.trophyScale = 0.75 + Math.min(n, 12) * 0.075;
    this.trophy.scale.setScalar(this.trophyScale);
    const c = Math.min(8, n);
    this.mini.count = c; this.shelf.visible = c > 0;
    this.mini.instanceMatrix.needsUpdate = true;
  }

  buildSky() {
    const rnd = rng(31);
    const mk = (n, spread, y0) => {
      const b = new VoxelBuilder();
      for (let i = 0; i < n; i++) {
        const cx = (rnd() - 0.5) * spread, cz = (rnd() - 0.5) * spread * 0.7;
        for (let k = 0; k < 4; k++) b.box(cx + (k - 1.5) * 2.2, y0 + (k % 2) * 0.6, cz, 2.6 + rnd() * 2, 1.6 + rnd(), 2.6 + rnd() * 1.6, '#ffffff');
      }
      const m = new THREE.Mesh(b.build(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: 0x6a8c88 }));
      this.group.add(m); return m;
    };
    this.clouds = [mk(3, 160, 18), mk(3, 190, 30), mk(2, 130, 9)];
    this.cloudSpeed = [1.1, 0.6, 1.7];
    this.clouds[2].position.z = 45; this.clouds[0].position.z = -50; this.clouds[1].position.z = -90;
    const rock = new THREE.BoxGeometry(1, 1, 1);
    this.debris = new THREE.InstancedMesh(rock, lambert('#a85838'), 10);
    this.debris.frustumCulled = false;
    this.debrisData = [];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * 6.28 + rnd(), r = 34 + rnd() * 18;
      this.debrisData.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, y: -4 + rnd() * 10, s: 0.8 + rnd() * 2.2, ph: rnd() * 6, rot: rnd() * 3 });
    }
    this.debris.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.debris);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._p = new THREE.Vector3(); this._s = new THREE.Vector3(); this._e = new THREE.Euler();
  }

  buildTrain() {
    this.loco = locoMesh(); this.w1 = wagonMesh(true); this.w2 = wagonMesh(false);
    const sc = 0.34;
    for (const m of [this.loco, this.w1, this.w2]) { m.scale.setScalar(sc); this.group.add(m); }
    this.trainS = 0; this.trainSc = sc;
  }

  trackAt(s, out) {
    const { pts, n, cum, len } = this.loop;
    s = ((s % len) + len) % len;
    let lo = 0, hi = n;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= s) lo = mid; else hi = mid; }
    const j = (lo + 1) % n, t = (s - cum[lo]) / Math.max(1e-6, cum[lo + 1] - cum[lo]);
    out.x = pts[lo * 2] + (pts[j * 2] - pts[lo * 2]) * t; out.z = pts[lo * 2 + 1] + (pts[j * 2 + 1] - pts[lo * 2 + 1]) * t;
    out.yaw = Math.atan2(pts[j * 2] - pts[lo * 2], pts[j * 2 + 1] - pts[lo * 2 + 1]);
  }

  /** Показати яруси до tier включно (animate — «вискакують» із землі). */
  setTier(tier, animate = false) {
    const from = this.curTier;
    this.curTier = tier;
    this.extentTarget = tier >= 12 ? 34 : tier >= 10 ? 29 : tier >= 8 ? 24 : 19;
    if (!animate) this.extent = this.extentTarget;
    let order = 0;
    this.tierGroups.forEach((g, i) => {
      const want = i <= tier;
      if (want && !g.visible) {
        g.visible = true;
        if (animate && from >= 0) { g.scale.set(1, 0.001, 1); this.pops.push({ g, t: -order * 0.45, i }); this.dust(i); order++; } else g.scale.set(1, 1, 1);
        if (i === 2) this.lampK = animate ? -1.2 : 3;
      } else if (!want) g.visible = false;
    });
  }

  dust(i) {
    const P = this.particles; if (!P) return;
    for (let k = 0; k < 26; k++) {
      const a = Math.random() * 6.28, r = 3 + Math.random() * 5;
      P.emit(Math.cos(a) * r, 0.7, Math.sin(a) * r * 0.8, Math.cos(a) * 3, 3 + Math.random() * 3, Math.sin(a) * 3, 1.1, 0.8, '#efe9df', -0.5, 1.6, 4, 2);
    }
  }

  celebrate() {
    const P = this.particles; if (!P) return;
    for (let k = 0; k < 40; k++) P.emit(14.5 + (Math.random() - 0.5) * 3, 5 + Math.random() * 3, -12.5 + (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 8, 5 + Math.random() * 5, (Math.random() - 0.5) * 8, 1.6, 0.4, ['#ffc61a', '#ffffff', '#e11d2e', '#12a150'][k & 3], 12, 0.4, 10);
  }

  update(dt, t) {
    this.t = t;
    this.extent += (this.extentTarget - this.extent) * Math.min(1, dt * 0.9);
    // потяг
    const spd = 5.2; this.trainS += spd * dt;
    const o = this._o || (this._o = { x: 0, z: 0, yaw: 0 }), sc = this.trainSc;
    const place = (m, s) => { this.trackAt(s, o); m.position.set(o.x, 0.2, o.z); m.rotation.y = o.yaw; };
    const s1 = this.trainS - (LOCO_LEN / 2 + GAP + WAGON_LEN / 2) * sc;
    place(this.loco, this.trainS); place(this.w1, s1); place(this.w2, s1 - (WAGON_LEN + GAP) * sc);
    // дим
    this.smokeT -= dt;
    if (this.smokeT <= 0 && this.particles) {
      this.smokeT = 0.16; this.trackAt(this.trainS - 0.4, o);
      this.particles.emit(o.x + Math.sin(o.yaw) * 0.4, 1.7, o.z + Math.cos(o.yaw) * 0.4, (Math.random() - 0.5) * 0.4, 1.8, (Math.random() - 0.5) * 0.4, 1.7, 0.42, '#f1f1ee', -0.6, 0.5, 2, 2.4);
    }
    // кубок
    this.trophyHolder.rotation.y = t * 0.5;
    this.trophy.position.y = 0.9 + Math.sin(t * 1.6) * 0.12;
    if (this.particles && Math.random() < dt * 5) {
      this.particles.emit(14.5 + (Math.random() - 0.5) * 3, 3 + Math.random() * 4, -12.5 + (Math.random() - 0.5) * 3, 0, 1.4, 0, 1.1, 0.26, Math.random() > 0.5 ? '#fff6b0' : '#ffffff', -0.2, 0.2, 6, -1);
    }
    // яруси «вискакують»
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const p = this.pops[i]; p.t += dt / 1.7;
      const k = Math.min(1, Math.max(0.001, p.t));
      const sy = k < 0.75 ? easeOutQuint(k / 0.75) : 1 + 0.04 * Math.sin(((k - 0.75) / 0.25) * Math.PI);   // плавний підйом і м'яке «осідання»
      p.g.scale.set(1 + 0.02 * (1 - k), Math.max(0.001, sy), 1 + 0.02 * (1 - k));
      p.g.position.y = -0.5 * (1 - easeOutQuint(k));
      if (this.particles && k > 0 && k < 0.8 && Math.random() < dt * 40) { const a = Math.random() * 6.28, rr = 3 + Math.random() * 6; this.particles.emit(Math.cos(a) * rr, 0.7, Math.sin(a) * rr * 0.8, Math.cos(a) * 1.6, 1.4 + Math.random() * 2, Math.sin(a) * 1.6, 0.9, 0.55, '#efe9df', -0.4, 1.8, 3, 2); }
      if (p.t >= 1) { p.g.scale.set(1, 1, 1); p.g.position.y = 0; this.pops.splice(i, 1); }
    }
    // прожектори розгораються по черзі з мерехтінням; потім рівне сяйво
    if (this.lamps) {
      this.lampK += dt;
      this.lamps.forEach((L, i) => {
        const k = Math.max(0, Math.min(1, (this.lampK - i * 0.18) / 0.9)), fl = k < 1 ? (Math.random() < 0.35 ? 0.4 : 1) : 1, v = k * fl;
        L.meshes.forEach((m, j) => { const vv = Math.max(0.12, v * (0.85 + 0.15 * Math.sin(t * 2 + j))); m.material.color.setRGB(1 * vv, 0.95 * vv, 0.75 * vv); });
        L.sp.material.opacity = 0.85 * v; L.beam.material.opacity = 0.06 * v;
      });
    }
    // семафор перемикається, годинник йде, птахи кружляють
    const ph = (t % 7) / 7; this.semG.visible = ph < 0.55; this.semR.visible = ph >= 0.55 && ph < 0.92;
    this.hand.rotation.z = -t * 0.3;
    if (this.birds) for (const bd of this.birds) {
      const a = t * 0.35 + bd.ph; bd.g.position.set(Math.cos(a) * bd.r, bd.h + Math.sin(t * 0.9 + bd.ph) * 0.6, Math.sin(a) * bd.r * 0.8); bd.g.rotation.y = -a;
      const f = Math.sin(t * 9 + bd.ph); bd.wl.rotation.z = f * 0.7; bd.wr.rotation.z = -f * 0.7;
    }
    for (let k = 0; k < this.flags.length; k++) this.flags[k].holder.rotation.y = Math.sin(t * 3.4 + this.flags[k].ph) * 0.45;
    // салют на золотому ярусі
    if (this.curTier >= 6 && this.particles) {
      this.fwT -= dt;
      if (this.fwT <= 0) {
        this.fwT = 2.4 + Math.random() * 1.6;
        const x = (Math.random() - 0.5) * 12, y = 9 + Math.random() * 4, z = -2 + (Math.random() - 0.5) * 8;
        const cols = [['#ffc61a', '#fff6b0'], ['#e11d2e', '#ff8a92'], ['#12a150', '#7af0a8']][(Math.random() * 3) | 0];
        this.particles.burst(x, y, z, 26, 6, 1.3, 0.32, cols, 5, 0.9);
      }
    }
    // хмари та уламки
    for (let i = 0; i < 3; i++) { const c = this.clouds[i]; c.position.x += this.cloudSpeed[i] * dt; if (c.position.x > 130) c.position.x = -130; }
    const m = this._m, q = this._q, p = this._p, s = this._s, e = this._e;
    for (let i = 0; i < this.debrisData.length; i++) {
      const d = this.debrisData[i];
      e.set(0.3 * Math.sin(t * 0.4 + d.ph), d.rot + t * 0.1, 0); q.setFromEuler(e);
      m.compose(p.set(d.x, d.y + Math.sin(t * 0.7 + d.ph) * 0.8, d.z), q, s.set(d.s * 1.4, d.s, d.s * 1.1));
      this.debris.setMatrixAt(i, m);
    }
    this.debris.instanceMatrix.needsUpdate = true;
  }
}
