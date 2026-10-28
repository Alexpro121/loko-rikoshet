import * as THREE from 'three';
import { PITCH } from '../config.js';

const _ax = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _UP = new THREE.Vector3(0, 1, 0);

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
  const white = new THREE.Color('#ffffff'), black = new THREE.Color('#15161a');
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

/** Мінімальний діаметр м'яча на екрані — частка висоти кадру (~1.6%): здалеку м'яч не губиться на газоні. */
const MIN_SCREEN = 0.016;

export class BallView {
  constructor() {
    this.group = new THREE.Group();       // у світових осях: пружне стискання при ударі
    this.spin = new THREE.Group();        // обертання котіння (окремо від масштабу видимості)
    // яскравий матеріал: білі панелі ледь світяться, тож м'яч вирізняється на траві й у тіні трибун
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: 0x3a3a3a });
    this.mesh = new THREE.Mesh(ballGeometry(PITCH.BALL_VIS), mat);
    // тонкий темний контур (вивернута оболонка) — чіткий силует проти зеленого
    this.outline = new THREE.Mesh(new THREE.IcosahedronGeometry(PITCH.BALL_VIS * 1.13, 1), new THREE.MeshBasicMaterial({ color: 0x0b0f12, side: THREE.BackSide }));
    this.spin.add(this.mesh); this.group.add(this.spin, this.outline);
    this.sx = 1; this.sy = 1; this.sz = 1;
    this.hop = 0;
    this.cam = null;                      // камера, з якої дивимось (для мінімального розміру на екрані)
    this.vs = 1;                          // поточне збільшення видимості (1 — справжній розмір)
    this.rad = PITCH.BALL_VIS;            // видимий радіус зараз
  }

  /** Удар об перешкоду: стискаємо уздовж нормалі (світові осі). */
  squash(nx, nz, amount = 0.28) {
    const ax = Math.abs(nx), az = Math.abs(nz);
    this.sx = 1 - amount * ax + amount * 0.4 * az;
    this.sz = 1 - amount * az + amount * 0.4 * ax;
    this.sy = 1 + amount * 0.3;
    this.hop = Math.min(0.6, this.hop + amount * 1.1);
  }

  /** y — висота м'яча над газоном (навіс), w — бокове обертання (підкрутка): видно, як кручений м'яч крутиться в польоті. */
  update(dt, x, z, vx, vz, y = 0, w = 0) {
    const sp = Math.hypot(vx, vz);
    if (sp > 0.05) {
      _ax.set(-vz / sp, 0, vx / sp);
      _q.setFromAxisAngle(_ax, (sp / PITCH.BALL_VIS) * dt * (y > 0 ? 0.35 : 1));   // у повітрі котіння не «наганяє» швидкість
      this.spin.quaternion.premultiply(_q);
    }
    if (w !== 0) { _q.setFromAxisAngle(_UP, w * 2.2 * dt); this.spin.quaternion.premultiply(_q); }
    const k = Math.min(1, dt * 16);
    this.sx += (1 - this.sx) * k; this.sy += (1 - this.sy) * k; this.sz += (1 - this.sz) * k;
    this.hop = Math.max(0, this.hop - dt * 3.2);
    // зблизька — справжній розмір, здалеку м'яч росте так, щоб на екрані був не меншим за MIN_SCREEN висоти кадру
    if (this.cam) {
      const c = this.cam, d = Math.hypot(c.position.x - x, c.position.y - this.rad, c.position.z - z);
      const want = 0.5 * MIN_SCREEN * 2 * d * Math.tan((c.fov * Math.PI) / 360);
      this.vs += (Math.max(1, want / PITCH.BALL_VIS) - this.vs) * Math.min(1, dt * 8);
    }
    this.rad = PITCH.BALL_VIS * this.vs;
    const h = (y > 0 ? 0 : this.hop * Math.abs(Math.sin(this.hop * 9)) * 0.9) + y;
    this.group.position.set(x, this.rad + h, z);
    this.group.scale.set(this.sx * this.vs, this.sy * this.vs, this.sz * this.vs);
    return h;
  }
}
