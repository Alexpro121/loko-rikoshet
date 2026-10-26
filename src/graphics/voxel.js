import * as THREE from 'three';

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _nm = new THREE.Matrix3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _c = new THREE.Color();
const UNIT = new THREE.BoxGeometry(1, 1, 1);

/** Збирає десятки кубиків в один BufferGeometry з вершинними кольорами = один draw call. */
export class VoxelBuilder {
  constructor(ao = 0.2, useUV = false) { this.pos = []; this.nor = []; this.col = []; this.idx = []; this.n = 0; this.ao = ao; this.uv = useUV ? [] : null; }

  /** ao: запечене «затемнення» знизу кожного куба (м'яка об'ємність без динамічних тіней). */
  geo(geometry, color, matrix, ao = 0, uvRects = null) {
    const p = geometry.attributes.position, nr = geometry.attributes.normal, ix = geometry.index;
    _nm.getNormalMatrix(matrix);
    _c.set(color);
    for (let i = 0; i < p.count; i++) {
      const f = ao > 0 ? 1 - ao * (0.5 - p.getY(i)) : 1;
      _v.fromBufferAttribute(p, i).applyMatrix4(matrix);
      this.pos.push(_v.x, _v.y, _v.z);
      _n.fromBufferAttribute(nr, i).applyMatrix3(_nm).normalize();
      this.nor.push(_n.x, _n.y, _n.z);
      this.col.push(_c.r * f, _c.g * f, _c.b * f);
      if (this.uv) {
        const r = uvRects && geometry === UNIT ? uvRects[(i / 4) | 0] : null;
        if (r) { const ua = geometry.attributes.uv; this.uv.push(r[0] + ua.getX(i) * (r[2] - r[0]), r[1] + ua.getY(i) * (r[3] - r[1])); }
        else this.uv.push(0.0625, 0.96875);
      }
    }
    if (ix) for (let i = 0; i < ix.count; i++) this.idx.push(ix.getX(i) + this.n);
    else for (let i = 0; i < p.count; i++) this.idx.push(i + this.n);
    this.n += p.count;
    return this;
  }

  /** Куб із центром (x,y,z), розмірами (sx,sy,sz), поворотом Ейлера (rx,ry,rz). */
  box(x, y, z, sx, sy, sz, color, ry = 0, rx = 0, rz = 0, uvRects = null) {
    _e.set(rx, ry, rz, 'YXZ');
    _q.setFromEuler(_e);
    _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
    return this.geo(UNIT, color, _m, this.ao, uvRects);
  }

  /** Довільна геометрія (циліндр, кільце) з позицією/поворотом. */
  shape(geometry, x, y, z, color, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    _e.set(rx, ry, rz, 'YXZ');
    _q.setFromEuler(_e);
    _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
    return this.geo(geometry, color, _m);
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    if (this.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.n > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }

  mesh(material = vcMat(), { static: isStatic = true } = {}) {
    const m = new THREE.Mesh(this.build(), material);
    if (isStatic) { m.matrixAutoUpdate = false; m.updateMatrix(); }
    return m;
  }
}

let _vc = null;
/** Єдиний матеріал для всіх зібраних мешів. */
export function vcMat() {
  if (!_vc) _vc = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  return _vc;
}

const _lam = new Map();
export function lambert(color, extra = {}) {
  const key = color + JSON.stringify(extra);
  let m = _lam.get(key);
  if (!m) { m = new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra }); _lam.set(key, m); }
  return m;
}

const _bas = new Map();
export function basic(color, extra = {}) {
  const key = color + JSON.stringify(extra);
  let m = _bas.get(key);
  if (!m) { m = new THREE.MeshBasicMaterial({ color, ...extra }); _bas.set(key, m); }
  return m;
}

export function shade(hex, f) {
  _c.set(hex);
  _c.multiplyScalar(f);
  return '#' + _c.getHexString();
}

/** Детерміністичний ГПВЧ, щоб острів завжди виглядав однаково. */
export function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
