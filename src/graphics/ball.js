import * as THREE from 'three';
import { vcMat } from './voxel.js';
import { PITCH } from '../config.js';

const _ax = new THREE.Vector3();
const _q = new THREE.Quaternion();

/** М'яч-«усічений ікосаедр»: ікосаедр деталізації 1, чорні «п'ятикутники» навколо 12 вершин. */
function ballGeometry(r) {
  let g = new THREE.IcosahedronGeometry(r, 1).toNonIndexed();
  const base = new THREE.IcosahedronGeometry(1, 0).attributes.position;
  const verts = [];
  for (let i = 0; i < base.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(base, i).normalize();
    if (!verts.some((u) => u.distanceTo(v) < 1e-3)) verts.push(v);
  }
  const pos = g.attributes.position, col = new Float32Array(pos.count * 3);
  const white = new THREE.Color('#f6f6f2'), black = new THREE.Color('#1c1c1e');
  const c = new THREE.Vector3();
  for (let f = 0; f < pos.count; f += 3) {
    c.set(0, 0, 0);
    for (let k = 0; k < 3; k++) c.x += pos.getX(f + k), c.y += pos.getY(f + k), c.z += pos.getZ(f + k);
    c.normalize();
    let best = -1;
    for (const v of verts) best = Math.max(best, v.dot(c));
    const col3 = best > 0.905 ? black : white;
    for (let k = 0; k < 3; k++) { col[(f + k) * 3] = col3.r; col[(f + k) * 3 + 1] = col3.g; col[(f + k) * 3 + 2] = col3.b; }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

export class BallView {
  constructor() {
    this.group = new THREE.Group();       // у світових осях: пружне стискання при ударі
    this.mesh = new THREE.Mesh(ballGeometry(PITCH.R), vcMat());
    this.group.add(this.mesh);
    this.sx = 1; this.sy = 1; this.sz = 1;
    this.hop = 0;
  }

  /** Удар об перешкоду: стискаємо уздовж нормалі (світові осі). */
  squash(nx, nz, amount = 0.28) {
    const ax = Math.abs(nx), az = Math.abs(nz);
    this.sx = 1 - amount * ax + amount * 0.4 * az;
    this.sz = 1 - amount * az + amount * 0.4 * ax;
    this.sy = 1 + amount * 0.3;
    this.hop = Math.min(0.6, this.hop + amount * 1.1);
  }

  update(dt, x, z, vx, vz) {
    const sp = Math.hypot(vx, vz);
    if (sp > 0.05) {
      _ax.set(-vz / sp, 0, vx / sp);
      _q.setFromAxisAngle(_ax, (sp / PITCH.R) * dt);
      this.mesh.quaternion.premultiply(_q);
    }
    const k = Math.min(1, dt * 16);
    this.sx += (1 - this.sx) * k; this.sy += (1 - this.sy) * k; this.sz += (1 - this.sz) * k;
    this.hop = Math.max(0, this.hop - dt * 3.2);
    const h = this.hop * Math.abs(Math.sin(this.hop * 9)) * 0.9;
    this.group.position.set(x, PITCH.R + h, z);
    this.group.scale.set(this.sx, this.sy, this.sz);
    return h;
  }
}
