// RingTone: колір кільця під м'ячем за станом гри (вільно, тиск, зона удару, загроза нашим воротам). Спільний для Match і GuestMatch.
import * as THREE from 'three';

// стримані кольори: м'ята — вільно, золото — є удар, бурштин → цегляний — тиснуть, приглушений червоний — суперник б'є по наших воротах
const FREE = new THREE.Color('#86cfa4'), ZONE = new THREE.Color('#f0c35a'), PRESS = new THREE.Color('#e9a04a'), HOT = new THREE.Color('#d9605a'), THREAT = new THREE.Color('#cf5a60');
const _c = new THREE.Color();
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/**
 * Пороги з гістерезисом, щоб колір не блимав на межі: тиск вмикається з danger > 0.62 і гасне нижче 0.45,
 * зона удару — з якості удару (shotQuality) > 0.38 і до 0.3. Колір і прозорість згладжуються за ~0.2 с.
 */
export class RingTone {
  constructor() { this.col = new THREE.Color().copy(FREE); this.op = 0; this.hot = false; this.zone = false; this.thr = false; }
  reset() { this.hot = false; this.zone = false; this.thr = false; this.op = 0; }

  /**
   * ring — меш кільця. mode: 1 — м'яч у нас (чекає удару), −1 — м'яч у суперника, 0 — кільця немає.
   * danger 0..1 — наскільки близько найближчий суперник (зокрема позаду); q — якість удару з цієї точки
   * (для −1 — по наших воротах). t — час для пульсу. Без алокацій.
   */
  update(ring, dt, mode, danger, q, x, z, t) {
    let target = 0;
    if (mode > 0) {
      this.thr = false;
      this.hot = this.hot ? danger > 0.45 : danger > 0.62;
      this.zone = this.zone ? q > 0.3 : q > 0.38;
      if (this.hot) _c.copy(PRESS).lerp(HOT, clamp((danger - 0.45) / 0.4, 0, 1));
      else if (this.zone) _c.copy(ZONE);
      else _c.copy(FREE).lerp(PRESS, clamp(danger / 0.62, 0, 1) * 0.55);
      target = 0.85;
    } else if (mode < 0) {
      this.hot = false; this.zone = false;
      this.thr = this.thr ? q > 0.3 : q > 0.38;
      if (this.thr) { _c.copy(THREAT); target = 0.5; }
    } else { this.hot = false; this.zone = false; this.thr = false; }
    if (target > 0 && this.op < 0.02) this.col.copy(_c);                 // щойно з'явилось — одразу свій колір, без переливу зі старого
    else if (target > 0) this.col.lerp(_c, Math.min(1, dt * 6));
    this.op += (target - this.op) * Math.min(1, dt * 8);
    if (this.op < 0.02) { ring.visible = false; return; }
    ring.visible = true;
    ring.material.color.copy(this.col); ring.material.opacity = this.op;
    const pulse = mode > 0 ? 1.15 + Math.sin(t * (4 + danger * 7)) * (0.05 + 0.08 * danger) : 1.05 + Math.sin(t * 3) * 0.05;
    ring.position.set(x, 0.07, z); ring.scale.setScalar(pulse);
  }
}
