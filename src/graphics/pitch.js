import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PITCH } from '../config.js';
import { VoxelBuilder, rng } from './voxel.js';
import { netTexture, netPlane, grassTexture, boardTexture } from './textures.js';

const { L, W, G, CH, WALL, WALL_H, GOAL_D } = PITCH;
const LINE = '#e6ede3';

/** Контур арени за годинниковою (без розривів під воротами). */
export const OUTLINE = [[-L + CH, -W], [L - CH, -W], [L, -W + CH], [L, W - CH], [L - CH, W], [-L + CH, W], [-L, W - CH], [-L, -W + CH]];

function lineSeg(b, x1, z1, x2, z2, th = 0.16, y = 0.03) {
  const dx = x2 - x1, dz = z2 - z1, len = Math.hypot(dx, dz);
  b.box((x1 + x2) / 2, y, (z1 + z2) / 2, len + th * 0.5, 0.03, th, LINE, -Math.atan2(dz, dx));
}

function insetPolygon(pts, d) {
  const n = pts.length, out = [];
  const lines = pts.map((p, i) => {
    const q = pts[(i + 1) % n], dx = q[0] - p[0], dz = q[1] - p[1], l = Math.hypot(dx, dz);
    return { px: p[0] - (dz / l) * d, pz: p[1] + (dx / l) * d, dx: dx / l, dz: dz / l };
  });
  for (let i = 0; i < n; i++) {
    const a = lines[(i + n - 1) % n], c = lines[i];
    const det = a.dx * -c.dz + c.dx * a.dz;
    const t = ((c.px - a.px) * -c.dz + c.dx * (c.pz - a.pz)) / det;
    out.push([a.px + a.dx * t, a.pz + a.dz * t]);
  }
  return out;
}

export function buildPitch() {
  const group = new THREE.Group();

  // --- газон: віяло трикутників по контуру арени, UV = проєкція на текстуру
  {
    const pos = [0, 0, 0], uv = [0.5, 0.5], idx = [];
    OUTLINE.forEach(([x, z], i) => { pos.push(x, 0, z); uv.push((x + L) / (2 * L), (W - z) / (2 * W)); idx.push(0, i + 1, ((i + 1) % OUTLINE.length) + 1); });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    g.setIndex(idx);
    // порядок обходу дає нормаль вниз: змінюємо напрям
    const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
    const grassMat = group.userData.grassMat = new THREE.MeshLambertMaterial({ map: grassTexture(L, W, G) });
    const m = new THREE.Mesh(g, grassMat);
    m.matrixAutoUpdate = false;
    group.add(m);
  }

  const b = new VoxelBuilder(0);
  // --- земля навколо: бетонна площадка, далі темна смуга
  b.box(0, -0.6, 0, 2 * L + 130, 1, 2 * W + 110, '#8b9296');
  b.box(0, -0.58, 0, 2 * L + 34, 0.04, 2 * W + 30, '#7a8185');
  b.box(0, -0.56, 0, 2 * L + 17, 0.04, 2 * W + 14, '#9aa1a4');
  const rnd = rng(11);
  for (let i = 0; i < 40; i++) {            // тріщини/плями на бетоні
    const x = (rnd() - 0.5) * (2 * L + 110), z = (rnd() - 0.5) * (2 * W + 90);
    if (Math.abs(x) < L + 4 && Math.abs(z) < W + 4) continue;
    b.box(x, -0.53, z, 1 + rnd() * 3, 0.02, 0.8 + rnd() * 2, rnd() > 0.5 ? '#868d91' : '#a5acaf', rnd() * 3);
  }
  // підлога воріт
  for (const sd of [-1, 1]) b.box(sd * (L + GOAL_D / 2), -0.02, 0, GOAL_D, 0.04, 2 * G + 0.4, '#2e6a36');

  // --- розмітка
  const ip = insetPolygon(OUTLINE, 0.9);
  for (let i = 0; i < ip.length; i++) {
    const a = ip[i], c = ip[(i + 1) % ip.length];
    if (i === 2 || i === 6) {
      const zs = Math.min(a[1], c[1]), ze = Math.max(a[1], c[1]);
      lineSeg(b, a[0], zs, a[0], -G - 0.1); lineSeg(b, a[0], G + 0.1, a[0], ze);
      continue;
    }
    lineSeg(b, a[0], a[1], c[0], c[1]);
  }
  lineSeg(b, 0, -W + 0.9, 0, W - 0.9);
  b.shape(new THREE.RingGeometry(8.6, 8.78, 56), 0, 0.04, 0, LINE, -Math.PI / 2);
  b.shape(new THREE.CircleGeometry(0.4, 14), 0, 0.045, 0, LINE, -Math.PI / 2);
  for (const sd of [-1, 1]) {
    const x0 = sd * (L - 0.9), x1 = sd * (L - 15.6), x2 = sd * (L - 5.2), ph = 19, gh = 8.6;
    lineSeg(b, x1, -ph, x1, ph); lineSeg(b, x1, -ph, x0, -ph); lineSeg(b, x1, ph, x0, ph);
    lineSeg(b, x2, -gh, x2, gh); lineSeg(b, x2, -gh, x0, -gh); lineSeg(b, x2, gh, x0, gh);
    b.shape(new THREE.CircleGeometry(0.3, 12), sd * (L - 10.4), 0.045, 0, LINE, -Math.PI / 2);
    const th0 = sd > 0 ? Math.PI - 0.93 : -0.93;
    b.shape(new THREE.RingGeometry(8.5, 8.68, 36, 1, th0, 1.86), sd * (L - 10.4), 0.04, 0, LINE, -Math.PI / 2);
  }

  // кутові прапорці
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    b.box(sx * (L - 1.9), 1.1, sz * (W - 1.9), 0.14, 2.2, 0.14, '#f1efe8');
    b.box(sx * (L - 1.9) - sx * 0.38, 2.0, sz * (W - 1.9), 0.8, 0.5, 0.06, '#e8b923');
  }

  // --- борти: корпус + шапка; рекламні панелі нижче окремим мешем
  const wallPlanes = [];
  const bt = boardTexture(), texW = bt.width * 0.0049;
  let cum = 0;
  for (let i = 0; i < 8; i++) {
    const [x1, z1] = OUTLINE[i], [x2, z2] = OUTLINE[(i + 1) % 8];
    // кожен відрізок ділимо на дві частини, якщо це торцева стінка з воротами
    const segs = (i === 2 || i === 6) ? (() => { const s = i === 2 ? 1 : -1; const zA = Math.min(z1, z2), zB = Math.max(z1, z2); return [[x1, zA, x1, -G], [x1, G, x1, zB]]; })() : [[x1, z1, x2, z2]];
    for (const [ax, az, bx, bz] of segs) {
      const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
      if (len < 0.1) continue;
      const ux = dx / len, uz = dz / len;
      let nx = uz, nz = -ux;
      const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      if (nx * mx + nz * mz < 0) { nx = -nx; nz = -nz; }
      const atGoal = (x, z) => Math.abs(Math.abs(x) - L) < 0.01 && Math.abs(Math.abs(z) - G) < 0.01;
      const e1 = atGoal(ax, az) ? 0 : WALL * 0.5, e2 = atGoal(bx, bz) ? 0 : WALL * 0.5;
      const L2 = len + e1 + e2;
      const cx = mx + ux * (e2 - e1) / 2 + nx * WALL / 2, cz = mz + uz * (e2 - e1) / 2 + nz * WALL / 2;
      const ry = -Math.atan2(dz, dx);
      b.box(cx, WALL_H / 2 - 0.5, cz, L2, WALL_H + 1, WALL, '#262c30', ry);
      b.box(cx, WALL_H + 0.06, cz, L2, 0.12, WALL + 0.12, '#4a5358', ry);
      // рекламна панель: на внутрішній (side=1) і на зовнішній стороні
      const u0 = cum / texW, u1 = (cum + len) / texW;
      for (const side of [1, -1]) {
        const g2 = new THREE.PlaneGeometry(len, 1.02), uv2 = g2.attributes.uv;
        uv2.setXY(0, u0, 1); uv2.setXY(1, u1, 1); uv2.setXY(2, u0, 0); uv2.setXY(3, u1, 0);
        g2.rotateY(Math.atan2(-nx * side, -nz * side));
        const off = side > 0 ? -0.02 : WALL + 0.02;
        g2.translate(mx + nx * off, 0.6, mz + nz * off);
        wallPlanes.push(g2);
      }
      cum += len;
    }
  }
  group.add(b.mesh());
  const boards = new THREE.Mesh(mergeGeometries(wallPlanes), new THREE.MeshBasicMaterial({ map: bt.texture, color: 0xf2f2f2 }));       // LED-борти світяться самі
  boards.matrixAutoUpdate = false;
  group.add(boards);

  // --- ворота: білі стійки й перекладина, окремо сітка
  const gb = new VoxelBuilder(0.1);
  for (const sd of [-1, 1]) {
    const x0 = sd * L, x1 = sd * (L + GOAL_D), th = 0.3, H = PITCH.GOAL_H, H2 = PITCH.GOAL_H * 0.75;
    for (const zz of [-G, G]) {
      gb.box(x0, H / 2, zz, th, H, th, '#eceeea'); gb.box(x1, H2 / 2, zz, th, H2, th, '#d9dcd8');
      gb.box((x0 + x1) / 2, (H + H2) / 2, zz, Math.hypot(GOAL_D, H - H2) + th, th, th, '#e4e6e2', 0, 0, sd * Math.atan2(H2 - H, GOAL_D));
    }
    gb.box(x0, H, 0, th, th, 2 * G + th, '#eceeea'); gb.box(x1, H2, 0, th, th, 2 * G + th, '#d9dcd8');
  }
  group.add(gb.mesh());

  const netMat = new THREE.MeshBasicMaterial({ map: netTexture(), transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, depthWrite: false, opacity: 0.9 });
  const nets = [];
  for (const sd of [-1, 1]) {
    const ng = new THREE.Group();
    const back = new THREE.Mesh(netPlane(2 * G, PITCH.GOAL_H * 0.75), netMat); back.position.set(sd * (L + GOAL_D), PITCH.GOAL_H * 0.375, 0); back.rotation.y = Math.PI / 2;
    const roof = new THREE.Mesh(netPlane(GOAL_D, 2 * G), netMat); roof.position.set(sd * (L + GOAL_D / 2), PITCH.GOAL_H * 0.875, 0); roof.rotation.x = -Math.PI / 2;
    const sideA = new THREE.Mesh(netPlane(GOAL_D, PITCH.GOAL_H * 0.875), netMat); sideA.position.set(sd * (L + GOAL_D / 2), PITCH.GOAL_H * 0.4375, G);
    const sideB = sideA.clone(); sideB.position.z = -G;
    ng.add(back, roof, sideA, sideB);
    group.add(ng); nets.push(ng);
  }
  return { group, nets, grassMat: group.userData.grassMat, boards: bt };
}
