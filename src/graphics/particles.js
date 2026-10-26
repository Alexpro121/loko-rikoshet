import * as THREE from 'three';

const _c = new THREE.Color();

/**
 * Пул вокселів-частинок в одному InstancedMesh.
 * Жодних алокацій у кадрі: усе в типізованих масивах, матриці пишуться напряму.
 */
export class Particles {
  constructor(max = 480, size = 1) {
    this.max = max;
    this.n = 0;
    this.px = new Float32Array(max); this.py = new Float32Array(max); this.pz = new Float32Array(max);
    this.vx = new Float32Array(max); this.vy = new Float32Array(max); this.vz = new Float32Array(max);
    this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
    this.size = new Float32Array(max); this.grav = new Float32Array(max); this.drag = new Float32Array(max);
    this.spin = new Float32Array(max); this.ang = new Float32Array(max); this.grow = new Float32Array(max);
    this.cr = new Float32Array(max); this.cg = new Float32Array(max); this.cb = new Float32Array(max);
    const geo = new THREE.BoxGeometry(size, size, size);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial(), max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
  }

  /** Створити частинку. grow>0 розширює, <0 стискає; life — секунди. */
  emit(x, y, z, vx, vy, vz, life, size, color, grav = 14, drag = 0.6, spin = 0, grow = -1) {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.px[i] = x; this.py[i] = y; this.pz[i] = z;
    this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
    this.life[i] = life; this.maxLife[i] = life;
    this.size[i] = size; this.grav[i] = grav; this.drag[i] = drag;
    this.spin[i] = spin; this.ang[i] = Math.random() * 6.28; this.grow[i] = grow;
    _c.set(color);
    this.cr[i] = _c.r; this.cg[i] = _c.g; this.cb[i] = _c.b;
  }

  burst(x, y, z, count, speed, life, size, colors, grav = 16, up = 0.7) {
    for (let k = 0; k < count; k++) {
      const a = Math.random() * 6.283, s = speed * (0.35 + Math.random() * 0.65);
      this.emit(x, y, z, Math.cos(a) * s, speed * up * (0.3 + Math.random()), Math.sin(a) * s,
        life * (0.6 + Math.random() * 0.6), size * (0.6 + Math.random() * 0.8), colors[(Math.random() * colors.length) | 0], grav, 0.5, (Math.random() - 0.5) * 12);
    }
  }

  update(dt) {
    const m = this.mesh.instanceMatrix.array, col = this.mesh.instanceColor.array;
    for (let i = 0; i < this.n;) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {            // swap-remove
        const l = --this.n;
        if (i !== l) {
          this.px[i] = this.px[l]; this.py[i] = this.py[l]; this.pz[i] = this.pz[l];
          this.vx[i] = this.vx[l]; this.vy[i] = this.vy[l]; this.vz[i] = this.vz[l];
          this.life[i] = this.life[l]; this.maxLife[i] = this.maxLife[l];
          this.size[i] = this.size[l]; this.grav[i] = this.grav[l]; this.drag[i] = this.drag[l];
          this.spin[i] = this.spin[l]; this.ang[i] = this.ang[l]; this.grow[i] = this.grow[l];
          this.cr[i] = this.cr[l]; this.cg[i] = this.cg[l]; this.cb[i] = this.cb[l];
        }
        continue;
      }
      const d = Math.max(0, 1 - this.drag[i] * dt);
      this.vx[i] *= d; this.vz[i] *= d; this.vy[i] = this.vy[i] * d - this.grav[i] * dt;
      this.px[i] += this.vx[i] * dt; this.py[i] += this.vy[i] * dt; this.pz[i] += this.vz[i] * dt;
      if (this.py[i] < 0.05 && this.grav[i] > 0) { this.py[i] = 0.05; this.vy[i] *= -0.35; this.vx[i] *= 0.7; this.vz[i] *= 0.7; }
      this.ang[i] += this.spin[i] * dt;
      const t = this.life[i] / this.maxLife[i];
      const g = this.grow[i];
      const s = this.size[i] * (g < 0 ? Math.min(1, t * 3) : (g > 0 ? 1 + (1 - t) * g : 1) * Math.min(1, t * 4));
      const c = Math.cos(this.ang[i]) * s, sn = Math.sin(this.ang[i]) * s, o = i * 16;
      m[o] = c; m[o + 1] = 0; m[o + 2] = -sn; m[o + 3] = 0;
      m[o + 4] = 0; m[o + 5] = s; m[o + 6] = 0; m[o + 7] = 0;
      m[o + 8] = sn; m[o + 9] = 0; m[o + 10] = c; m[o + 11] = 0;
      m[o + 12] = this.px[i]; m[o + 13] = this.py[i]; m[o + 14] = this.pz[i]; m[o + 15] = 1;
      col[i * 3] = this.cr[i]; col[i * 3 + 1] = this.cg[i]; col[i * 3 + 2] = this.cb[i];
      i++;
    }
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
  }

  clear() { this.n = 0; this.mesh.count = 0; }
}
