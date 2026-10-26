import * as THREE from 'three';
import { VoxelBuilder, vcMat, lambert, rng, shade } from './voxel.js';
import { locoMesh, wagonMesh, LOCO_LEN, WAGON_LEN, GAP } from './train.js';
import { netTexture, netPlane, signTexture } from './textures.js';

const SEAT = ['#a8182b', '#1f7a4f', '#e4e2da'];
const HX = 12.4, HZ = 10.6, R = 3.2, HALF = 14;      // колія навколо стадіону
const easeBack = (t) => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

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
    this.curTier = -1;
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
    for (const [x, z, s] of [[-12.6, -9, 1.2], [12.8, 8.6, 1.5], [-13, 3, 0.9], [11, -12.8, 1.1]]) {
      b.box(x, s * 0.35, z, s * 1.6, s * 0.7, s * 1.2, '#7b8590', rnd() * 3); b.box(x + 0.4, s * 0.8, z + 0.2, s, s * 0.6, s * 0.8, '#98a2ac', rnd() * 3);
    }
    const cone = new THREE.CylinderGeometry(0, 1, 2.4, 6);
    for (const [x, z, s] of [[-13, -12.6, 1], [13, -13, 1.2], [-12.8, 12.8, 1.1], [13, 12.6, 0.9], [-5, 13, 0.9], [6, -13.2, 1]]) {
      b.box(x, 0.5 * s, z, 0.5 * s, s, 0.5 * s, '#6b4a2e');
      b.shape(cone, x, 2.0 * s, z, '#2f8a56', 0, rnd() * 3, 0, 1.3 * s, 1.1 * s, 1.3 * s);
      b.shape(cone, x, 3.1 * s, z, '#256e47', 0, rnd() * 3, 0, 0.95 * s, 0.9 * s, 0.95 * s);
    }
    // станція «Локомотив»
    b.box(-9.6, 0.9, 6.4, 3.4, 1.8, 2.2, '#f4f4f2'); b.box(-9.6, 2.0, 6.4, 3.8, 0.4, 2.6, '#e11d2e');
    b.box(-9.6, 2.5, 6.4, 3.0, 0.5, 1.6, '#e11d2e'); b.box(-9.6, 1.0, 7.52, 3.0, 0.5, 0.06, '#12a150');
    b.box(-9.6, 0.1, 8.5, 5.6, 0.25, 1.3, '#cfd5d8');
    // семафор
    b.box(-6.2, 1.6, 8.0, 0.2, 3.2, 0.2, '#dfe3e6'); b.box(-6.2, 3.1, 8.0, 0.5, 0.5, 0.3, '#222'); b.box(-6.2, 3.1, 8.17, 0.26, 0.26, 0.1, '#35e07a');
    this.base = b.mesh();
    this.group.add(this.base);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.62), new THREE.MeshBasicMaterial({ map: signTexture('ЛОКОМОТИВ · 1919') }));
    sign.position.set(-9.6, 1.52, 7.53); this.group.add(sign);
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
    // 3: прожектори
    add((bb) => {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const x = sx * 7.4, z = sz * 5.5;
        bb.box(x, 3.4, z, 0.3, 6.8, 0.3, '#aeb6bb'); bb.box(x, 6.9, z, 1.6, 0.9, 0.3, '#3a4247', Math.atan2(-sx, -sz));
        for (let i = 0; i < 3; i++) bb.box(x - sx * 0.3 + (i - 1) * 0.5, 6.9, z - sz * 0.2, 0.4, 0.5, 0.1, '#fff4b8', Math.atan2(-sx, -sz));
      }
    });
    // 4: другий ярус на далекій і бічних
    add((bb) => { stand(bb, 0, -5.3, Math.PI, 13.6, 5, 9, 0.55, 0.85, 0.6, true); stand(bb, 7.6, 0, Math.PI / 2, 8.6, 5, 8, 0.55, 0.85, 0.6); stand(bb, -7.6, 0, -Math.PI / 2, 8.6, 5, 8, 0.55, 0.85, 0.6); });
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
    this.trophyHolder = new THREE.Group(); this.trophyHolder.position.set(9.4, 0, -7.6); this.trophyHolder.add(this.trophy);
    const pb = new VoxelBuilder(); pb.box(0, 0.4, 0, 4.6, 0.8, 4.6, '#dfe3e6'); pb.box(0, 0.85, 0, 3.8, 0.2, 3.8, '#e11d2e');
    this.trophyHolder.add(pb.mesh());
    this.trophy.position.y = 0.9;
    this.group.add(this.trophyHolder);
    // шафа кубків: міні-копії
    this.mini = new THREE.InstancedMesh(this.trophyGeo, vcMat(), 8);
    this.mini.count = 0; this.mini.frustumCulled = false;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(0.2, 0.2, 0.2);
    for (let i = 0; i < 8; i++) { m.compose(new THREE.Vector3(-5.6 + i * 1.6, 1.2, 8.7), q, s); this.mini.setMatrixAt(i, m); }
    const shelf = new VoxelBuilder(); shelf.box(0, 0.45, 8.7, 14, 0.9, 1.3, '#dfe3e6'); shelf.box(0, 0.95, 8.7, 13.6, 0.1, 1.1, '#12a150');
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
      const a = (i / 10) * 6.28 + rnd(), r = 24 + rnd() * 18;
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
    this.tierGroups.forEach((g, i) => {
      const want = i <= tier;
      if (want && !g.visible) {
        g.visible = true;
        if (animate && from >= 0) { g.scale.set(1, 0.001, 1); this.pops.push({ g, t: -i * 0.0 }); this.dust(i); } else g.scale.set(1, 1, 1);
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
    for (let k = 0; k < 40; k++) P.emit(9.4 + (Math.random() - 0.5) * 3, 5 + Math.random() * 3, -7.6 + (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 8, 5 + Math.random() * 5, (Math.random() - 0.5) * 8, 1.6, 0.4, ['#ffc61a', '#ffffff', '#e11d2e', '#12a150'][k & 3], 12, 0.4, 10);
  }

  update(dt, t) {
    this.t = t;
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
      this.particles.emit(9.4 + (Math.random() - 0.5) * 3, 3 + Math.random() * 4, -7.6 + (Math.random() - 0.5) * 3, 0, 1.4, 0, 1.1, 0.26, Math.random() > 0.5 ? '#fff6b0' : '#ffffff', -0.2, 0.2, 6, -1);
    }
    // яруси «вискакують»
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const p = this.pops[i]; p.t += dt / 0.85;
      const k = Math.min(1, Math.max(0.001, p.t));
      p.g.scale.set(1, Math.max(0.001, easeBack(k)), 1);
      if (p.t >= 1) { p.g.scale.set(1, 1, 1); this.pops.splice(i, 1); }
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
