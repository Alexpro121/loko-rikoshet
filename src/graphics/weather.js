import * as THREE from 'three';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
const X = 78, Z = 52, Y = 28;

/** Погода: дощ і сніг — дві пули InstancedMesh, що падають над ареною й «загортаються» вгору. */
export class Weather {
  constructor() {
    this.group = new THREE.Group();
    this.n = 900;
    this.rain = new THREE.InstancedMesh(new THREE.BoxGeometry(0.035, 1.0, 0.035), new THREE.MeshBasicMaterial({ color: '#d4e4ff', transparent: true, opacity: 0.5, depthWrite: false }), this.n);
    this.snow = new THREE.InstancedMesh(new THREE.BoxGeometry(0.15, 0.15, 0.15), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.95, depthWrite: false }), this.n);
    for (const m of [this.rain, this.snow]) { m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.visible = false; this.group.add(m); }
    this.x = new Float32Array(this.n); this.y = new Float32Array(this.n); this.z = new Float32Array(this.n); this.k = new Float32Array(this.n);
    for (let i = 0; i < this.n; i++) { this.x[i] = (Math.random() * 2 - 1) * X; this.y[i] = Math.random() * Y; this.z[i] = (Math.random() * 2 - 1) * Z; this.k[i] = Math.random() * 6.28; }
    this.type = 'clear';
  }

  set(type) {
    this.type = type;
    this.rain.visible = type === 'rain'; this.snow.visible = type === 'snow';
  }

  update(dt) {
    const rain = this.type === 'rain', snow = this.type === 'snow';
    if (!rain && !snow) return;
    const mesh = rain ? this.rain : this.snow, vy = rain ? 40 : 3.2, vx = rain ? -4 : 0, t = performance.now() * 0.001;
    for (let i = 0; i < this.n; i++) {
      this.y[i] -= vy * dt * (rain ? 1 : 0.7 + (i % 5) * 0.12);
      this.x[i] += (vx + (snow ? Math.sin(t * 0.9 + this.k[i]) * 1.1 : 0)) * dt;
      if (this.y[i] < 0) { this.y[i] = Y; this.x[i] = (Math.random() * 2 - 1) * X; this.z[i] = (Math.random() * 2 - 1) * Z; }
      if (this.x[i] < -X) this.x[i] += 2 * X;
      _p.set(this.x[i], this.y[i], this.z[i]);
      if (rain) { _s.set(1, 1, 1); _q.setFromAxisAngle(_p.clone().set(0, 0, 1), 0.1); } else { _s.set(1, 1, 1); _q.identity(); }
      _m.compose(_p, _q, _s); mesh.setMatrixAt(i, _m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }
}
