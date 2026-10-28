import * as THREE from 'three';
import { PITCH } from '../config.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const EXPR = ['neutral', 'happy', 'shock', 'angry'];
// суглоби гравця, які пишемо в повтор: позиція й орієнтація кожного (обличчя — окремо, кодом виразу)
const NODES = ['root', 'body', 'pose', 'pelvis', 'lean', 'thorax', 'neck', 'legL', 'legR', 'shinL', 'shinR', 'footL', 'footR', 'armL', 'armR', 'foreL', 'foreR', 'handL', 'handR'];
const _q = [0, 0, 0, 0];

/**
 * Повтор: кільцевий буфер останніх ~7 с гри (30 кадрів/с) — готові пози всіх 22 гравців і м'яча, як їх було намальовано.
 * Програвання не чіпає симуляцію: лише виставляє записані трансформи між двома найближчими кадрами (lerp/slerp).
 */
export class Replay {
  constructor(view, seconds = 7, hz = 30) {
    this.v = view; this.hz = hz;
    this.nodes = view.players.map((p) => NODES.map((k) => p[k]));
    this.per = NODES.length * 7 + 1;
    this.N = view.players.length * this.per + 11;
    this.cap = Math.ceil(seconds * hz);
    this.buf = new Float32Array(this.cap * this.N); this.ts = new Float64Array(this.cap);
    this.live = new Float32Array(this.N);
    this.ball = new THREE.Vector3();
    this.clear();
  }
  clear() { this.n = 0; this.head = 0; this.last = -1e9; }
  idx(k) { return (this.head - this.n + k + this.cap * 2) % this.cap; }
  get t0() { return this.n ? this.ts[this.idx(0)] : 0; }
  get t1() { return this.n ? this.ts[this.idx(this.n - 1)] : 0; }

  rec(t) {
    if (t - this.last < 1 / this.hz) return;
    this.last = t;
    const i = this.head; this.write(this.buf, i * this.N); this.ts[i] = t;
    this.head = (i + 1) % this.cap; this.n = Math.min(this.cap, this.n + 1);
  }
  write(a, o) {
    const P = this.v.players;
    for (let i = 0; i < P.length; i++) {
      const ns = this.nodes[i];
      for (let j = 0; j < ns.length; j++) { const n = ns[j]; n.position.toArray(a, o); n.quaternion.toArray(a, o + 3); o += 7; }
      a[o++] = Math.max(0, EXPR.indexOf(P[i].expr));
    }
    const B = this.v.ball; B.group.position.toArray(a, o); B.spin.quaternion.toArray(a, o + 3); B.group.scale.toArray(a, o + 7); a[o + 10] = B.vs || 1;
  }
  blend(A, oa, Bf, ob, al) {
    const P = this.v.players, l = (k) => A[oa + k] + (Bf[ob + k] - A[oa + k]) * al;
    for (let i = 0; i < P.length; i++) {
      const ns = this.nodes[i];
      for (let j = 0; j < ns.length; j++) {
        const n = ns[j];
        n.position.set(l(0), l(1), l(2));
        THREE.Quaternion.slerpFlat(_q, 0, A, oa + 3, Bf, ob + 3, al); n.quaternion.fromArray(_q);
        oa += 7; ob += 7;
      }
      const e = EXPR[(al < 0.5 ? A[oa] : Bf[ob]) | 0] || 'neutral';
      if (P[i].expr !== e) P[i].setExpr(e);
      oa++; ob++;
    }
    const B = this.v.ball;
    // у грі здалеку м'яч збільшено (щоб не губився); у повторі камера близько — справжній розмір і справжня висота
    const vs = Math.max(1, l(10)), R0 = PITCH.BALL_VIS;
    B.group.position.set(l(0), l(1) - R0 * (vs - 1), l(2)); THREE.Quaternion.slerpFlat(_q, 0, A, oa + 3, Bf, ob + 3, al); B.spin.quaternion.fromArray(_q);
    B.group.scale.set(l(7) / vs, l(8) / vs, l(9) / vs); B.vs = 1; B.rad = R0;
    this.ball.copy(B.group.position);
    this.v.updateShadows(this.ball.x, this.ball.z, Math.max(0, this.ball.y - B.rad));
  }
  /** Показати мить t (час гри, за яким писали). */
  apply(t) {
    if (!this.n) return;
    let lo = 0, hi = this.n - 1;
    if (t <= this.ts[this.idx(0)]) hi = 0;
    else if (t >= this.ts[this.idx(hi)]) lo = hi;
    else while (hi - lo > 1) { const m = (lo + hi) >> 1; if (this.ts[this.idx(m)] <= t) lo = m; else hi = m; }
    const ia = this.idx(lo), ib = this.idx(hi), ta = this.ts[ia], tb = this.ts[ib];
    this.blend(this.buf, ia * this.N, this.buf, ib * this.N, tb > ta ? clamp((t - ta) / (tb - ta), 0, 1) : 0);
  }
  /** Вирізати фрагмент [a, b] (час гри) у окремий кліп — для підбірки моментів тайму. null — якщо запису замало. */
  cut(a, b) {
    const ks = [];
    for (let k = 0; k < this.n; k++) { const i = this.idx(k), t = this.ts[i]; if (t >= a && t <= b) ks.push(i); }
    if (ks.length < 10) return null;
    const N = this.N, buf = new Float32Array(ks.length * N), ts = new Float64Array(ks.length);
    ks.forEach((i, j) => { buf.set(this.buf.subarray(i * N, (i + 1) * N), j * N); ts[j] = this.ts[i]; });
    return { buf, ts, n: ks.length };
  }
  /** Показати мить t зі збереженого кліпу. */
  applyClip(c, t) {
    let lo = 0, hi = c.n - 1;
    if (t <= c.ts[0]) hi = 0; else if (t >= c.ts[hi]) lo = hi;
    else while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c.ts[m] <= t) lo = m; else hi = m; }
    const ta = c.ts[lo], tb = c.ts[hi];
    this.blend(c.buf, lo * this.N, c.buf, hi * this.N, tb > ta ? clamp((t - ta) / (tb - ta), 0, 1) : 0);
  }
  saveLive() { this.write(this.live, 0); }
  restoreLive() { this.blend(this.live, 0, this.live, 0, 0); }
}

const _sa = new THREE.Vector3(), _sb = new THREE.Vector3();
/**
 * Рукостискання двох гравців: праві долоні сходяться посередині між плечима, трохи нижче пояса грудей, і разом
 * коротко «качають» угору-вниз. Працює, лише коли плечі ближче ~1.3 м (інакше руки самі плавно опускаються).
 */
export function shakeHands(pa, pb, t, w = 1) {
  pa.armR.getWorldPosition(_sa); pb.armR.getWorldPosition(_sb);
  const d = Math.hypot(_sa.x - _sb.x, _sa.z - _sb.z), k = w * smooth((1.3 - d) / 0.35);
  if (k <= 0.01) return 0;
  const y = Math.min(_sa.y, _sb.y) - 0.44 + 0.045 * Math.sin(t * 12) * k, x = (_sa.x + _sb.x) / 2, z = (_sa.z + _sb.z) / 2;
  pa.reach(1, x, y, z, k); pb.reach(1, x, y, z, k);
  return k;
}

/** Після рукостискання права долоня гравця pa лягає на плече партнера pb (втішає, дякує за гру). */
export function patShoulder(pa, pb, w = 1) {
  pb.armR.getWorldPosition(_sb); pa.armR.getWorldPosition(_sa);
  _sb.y += 0.04; _sb.lerp(_sa, 0.12);
  pa.reach(1, _sb.x, _sb.y, _sb.z, w);
}

const _c = new THREE.Vector3(), _h = new THREE.Vector3();
const easeOutBack = (t) => { t = clamp(t, 0, 1); const c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
/**
 * «Дай п'ять» з ударом — двоє гравців мають спільну мить контакту (t = 0). Долоня йде заданою траєкторією (її ставить
 * CCD-IK у player.js), тіло включається в рух:
 *  замах (−D…−0.16 с) — рука злітає над плече (з легким перельотом), груди розвертаються до партнера, корпус трохи назад;
 *  удар (−0.16…0) — розгін долоні з прискоренням (найшвидша в мить контакту), корпус подається вперед;
 *  контакт — ляпас, іскри, обидва здригаються (jolt);
 *  відскок — долоня пружно відлітає, рука опускається, вага IK і повороту згасає.
 * Висота зустрічі — над головами, наскільки дістають руки (стоять далі — нижче).
 */
export class Slaps {
  constructor(onHit) { this.list = []; this.onHit = onHit; }
  busy(p) { return !!this.of(p); }
  of(p) { for (const s of this.list) if (s.a === p || s.b === p) return s; return null; }
  /** ha/hb — якою рукою б'є кожен (0 — ліва, 1 — права); stayA — перший не розвертає груди (стоїть, як стояв). */
  add(pa, pb, delay = 0.42, low = false, ha = 1, hb = 1, stayA = false) {
    // рука, що вже відбила попередню «п'ятірку» й опускається, може одразу дати наступну (у шерензі гості йдуть один за одним)
    for (const p of [pa, pb]) { const o = this.of(p); if (o && o.t < 0.22) return false; }
    for (const p of [pa, pb]) { const o = this.of(p); if (o) this.list.splice(this.list.indexOf(o), 1); }
    this.list.push({ a: pa, b: pb, t: -Math.max(0.3, delay), D: Math.max(0.3, delay), hit: false, low, ha, hb, stayA });
    return true;
  }
  clear() { this.list.length = 0; }
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const s = this.list[i]; s.t += dt;
      if (s.t > 0.8) { this.list.splice(i, 1); continue; }
      (s.ha ? s.a.armR : s.a.armL).getWorldPosition(_sa); (s.hb ? s.b.armR : s.b.armL).getWorldPosition(_sb);
      const half = 0.5 * Math.hypot(_sa.x - _sb.x, _sa.z - _sb.z), up = Math.sqrt(Math.max(0, 0.6 * 0.6 - half * half));
      _c.addVectors(_sa, _sb).multiplyScalar(0.5); _c.y = Math.max(_sa.y, _sb.y) + (s.low ? -0.1 : Math.min(0.32, up));
      if (!s.hit && s.t >= 0) {
        s.hit = true;
        const m = s.low ? 0.75 : 1; s.a.jolt(m, s.ha); s.b.jolt(m, s.hb);
        if (this.onHit) this.onHit(_c, s);
      }
      this.move(s.a, s.b, _sa, s, s.ha, s.stayA);
      this.move(s.b, s.a, _sb, s, s.hb, false);
    }
  }
  move(p, o, S, s, hand = 1, stay = false) {
    const t = s.t;
    let hx = _c.x - S.x, hz = _c.z - S.z; const hl = Math.hypot(hx, hz) || 1; hx /= hl; hz /= hl;   // до точки зустрічі (по горизонталі)
    // ключові точки долоні: замах (над плечем), зустріч (долоні, а не зап'ястя), спокій (рука внизу)
    const cx = _c.x - hx * 0.05, cz = _c.z - hz * 0.05;
    // замах — рука над плечем, але відведена назовні від голови (інакше читається як «рука на маківці»)
    let ox = S.x - p.x, oz = S.z - p.z; const ol = Math.hypot(ox, oz) || 1; ox /= ol; oz /= ol;
    const hi = p.persona ? p.persona.slapHi : 1;                       // хтось замахується високо, хтось — ледь над плечем
    const P0x = S.x + hx * 0.06 + ox * 0.2, P0y = S.y + 0.44 * hi, P0z = S.z + hz * 0.06 + oz * 0.2;
    let x, y, z, w = 1, lean = 0;
    if (t < -0.16) {
      const u = (t + s.D) / (s.D - 0.16), e = easeOutBack(u);
      x = S.x + (P0x - S.x) * e; y = S.y - 0.5 + (P0y - S.y + 0.5) * e; z = S.z + (P0z - S.z) * e; w = smooth(u * 1.6); lean = -0.1 * smooth(u);
    } else if (t < 0) {
      const u = (t + 0.16) / 0.16, e = u * u * u;
      x = P0x + (cx - P0x) * e; y = P0y + (_c.y - P0y) * e; z = P0z + (cz - P0z) * e; lean = -0.1 + 0.28 * e;
    } else {
      const r = t, bk = 0.16 * Math.sin(Math.PI * Math.min(1, r / 0.22)) * Math.exp(-r * 3), dn = smooth((r - 0.1) / 0.45);
      x = cx - hx * bk; z = cz - hz * bk; y = _c.y + 0.05 * Math.sin(Math.PI * Math.min(1, r / 0.22)) - 0.75 * dn;
      w = 1 - smooth((r - 0.25) / 0.45); lean = 0.18 * (1 - smooth(r / 0.5));
    }
    p.reach(hand, x, y, z, w, true);
    // хто «стоїть» — лише ледь подається корпусом, груди лишаються до трибуни; інший розвертає груди до партнера
    p.engage(stay ? (p.bodyYaw ?? 0) : Math.atan2(o.x - p.x, o.z - p.z), stay ? lean * 0.5 : lean, w);
  }
}
