// Кадр онлайн-матчу: готові пози всіх 22 гравців (19 суглобів, як у повторі), м'яч, камера кат-сцен і стан гри.
// Господар рахує гру, гість лише показує — тож у гостя гравці рухаються точно як у господаря (і в ударах, і в сейвах,
// і в святкуваннях). Стиснення: кватерніон — 3 × int16 (w ≥ 0 відновлюється), позиція суглоба — 3 × int16 (2.5 мм),
// і лише якщо суглоб зсунувся відносно пози спокою (маска) — зазвичай ~2.5–3.5 КБ на кадр.
export const NODES = ['root', 'body', 'pose', 'pelvis', 'lean', 'thorax', 'neck', 'legL', 'legR', 'shinL', 'shinR', 'footL', 'footR', 'armL', 'armR', 'foreL', 'foreR', 'handL', 'handR'];
export const EXPR = ['neutral', 'happy', 'shock', 'angry'];
const NN = NODES.length;
export const PER = NN * 7 + 2;                 // на гравця: суглоби (pos3 + quat4), вираз, видимість
export const BALL = 8;                         // м'яч: позиція видимого м'яча (3), обертання (4), видимий радіус у господаря
const PS = 400, QS = 32767;
export const PHASES = ['idle', 'intro', 'play', 'break', 'end', 'pens', 'paused'];
/** Біти прапорців кадру. */
export const F = { SLOW: 1, TURN: 2, KICKOFF: 4, GKWAIT: 8, GOAL: 16, RESULT: 32, GKFOOT: 64, AUTO: 128 };   // GKFOOT — воротар гостя з м'ячем у ногах; AUTO — гість не відповідав, ним грає ШІ

/** Поза спокою всіх суглобів одразу після налаштування складу — однакова в обох гравців (той самий код і вигляд). */
export function captureRef(view) {
  const ref = new Float32Array(view.players.length * NN * 3);
  view.players.forEach((p, i) => NODES.forEach((k, j) => p[k].position.toArray(ref, (i * NN + j) * 3)));
  return ref;
}

const buf = new ArrayBuffer(16384), dv = new DataView(buf);
/**
 * h: { seq, t, flags, phase, taker, ball:{x,z,vx,vz,y}, danger, cam (або null), dof (або null), net (або null), score:[a,b] }.
 */
export function encode(view, ref, h) {
  let o = 0;
  const u8 = (v) => { dv.setUint8(o, v); o += 1; }, u16 = (v) => { dv.setUint16(o, v, true); o += 2; }, u32 = (v) => { dv.setUint32(o, v, true); o += 4; };
  const f32 = (v) => { dv.setFloat32(o, v, true); o += 4; }, i16 = (v) => { dv.setInt16(o, Math.max(-32767, Math.min(32767, Math.round(v))), true); o += 2; };
  u8(1); u8(h.flags); u8(h.phase); u8(h.taker); u32(h.seq); dv.setFloat64(o, h.t, true); o += 8;
  const b = h.ball; f32(b.x); f32(b.z); f32(b.vx); f32(b.vz); f32(b.y);
  u8((h.cam ? 1 : 0) | (h.dof ? 2 : 0) | (h.net ? 4 : 0) | (h.cv ? 8 : 0)); u8(Math.round(h.danger * 255)); u8(h.score[0]); u8(h.score[1]);
  if (h.cam) { const c = h.cam; f32(c.p.x); f32(c.p.y); f32(c.p.z); f32(c.q.x); f32(c.q.y); f32(c.q.z); f32(c.q.w); f32(c.fov); u16(c.shot & 0xffff); }
  if (h.dof) { f32(h.dof.focus); f32(h.dof.ap); }
  if (h.net) { f32(h.net.sd); f32(h.net.depth); f32(h.net.z); f32(h.net.y); }
  if (h.cv) { f32(h.cv.tx); f32(h.cv.tz); f32(h.cv.ang || 0); f32(h.cv.zoom); }
  const P = view.players;
  for (let i = 0; i < P.length; i++) {
    const p = P[i]; let mask = p.root.visible ? 1 << 30 : 0;
    for (let j = 0; j < NN; j++) {
      const v = p[NODES[j]].position, r = (i * NN + j) * 3;
      if (j === 0 || Math.abs(v.x - ref[r]) > 0.0015 || Math.abs(v.y - ref[r + 1]) > 0.0015 || Math.abs(v.z - ref[r + 2]) > 0.0015) mask |= 1 << j;
    }
    u32(mask >>> 0); u8(Math.max(0, EXPR.indexOf(p.expr)));
    for (let j = 0; j < NN; j++) {
      const n = p[NODES[j]];
      if (mask & (1 << j)) { i16(n.position.x * PS); i16(n.position.y * PS); i16(n.position.z * PS); }
      const q = n.quaternion, s = q.w < 0 ? -QS : QS; i16(q.x * s); i16(q.y * s); i16(q.z * s);
    }
  }
  const B = view.ball, g = B.group.position, q = B.spin.quaternion, s = q.w < 0 ? -QS : QS;
  f32(g.x); f32(g.y); f32(g.z); i16(q.x * s); i16(q.y * s); i16(q.z * s); f32(B.rad);
  return buf.slice(0, o);
}

/** Розпакувати кадр у плаский масив out (поза) і повернути заголовок. */
export function decode(ab, out, ref, nPlayers) {
  const v = new DataView(ab); let o = 0;
  const u8 = () => v.getUint8(o++), u16 = () => { const x = v.getUint16(o, true); o += 2; return x; }, u32 = () => { const x = v.getUint32(o, true); o += 4; return x; };
  const f32 = () => { const x = v.getFloat32(o, true); o += 4; return x; }, i16 = () => { const x = v.getInt16(o, true); o += 2; return x; };
  if (u8() !== 1) return null;
  const h = { flags: u8(), phase: u8(), taker: u8(), seq: u32() };
  h.t = v.getFloat64(o, true); o += 8;
  h.ball = { x: f32(), z: f32(), vx: f32(), vz: f32(), y: f32() };
  const fl = u8(); h.danger = u8() / 255; h.score = [u8(), u8()];
  h.cam = fl & 1 ? { p: [f32(), f32(), f32()], q: [f32(), f32(), f32(), f32()], fov: f32(), shot: u16() } : null;
  h.dof = fl & 2 ? { focus: f32(), ap: f32() } : null;
  h.net = fl & 4 ? { sd: f32(), depth: f32(), z: f32(), y: f32() } : null;
  h.cv = fl & 8 ? { tx: f32(), tz: f32(), ang: f32(), zoom: f32() } : null;
  for (let i = 0; i < nPlayers; i++) {
    const mask = u32(), base = i * PER;
    out[base + NN * 7] = u8(); out[base + NN * 7 + 1] = mask & (1 << 30) ? 1 : 0;
    for (let j = 0; j < NN; j++) {
      const k = base + j * 7, r = (i * NN + j) * 3;
      if (mask & (1 << j)) { out[k] = i16() / PS; out[k + 1] = i16() / PS; out[k + 2] = i16() / PS; } else { out[k] = ref[r]; out[k + 1] = ref[r + 1]; out[k + 2] = ref[r + 2]; }
      const x = i16() / QS, y = i16() / QS, z = i16() / QS;
      out[k + 3] = x; out[k + 4] = y; out[k + 5] = z; out[k + 6] = Math.sqrt(Math.max(0, 1 - x * x - y * y - z * z));
    }
  }
  const bo = nPlayers * PER;
  out[bo] = f32(); out[bo + 1] = f32(); out[bo + 2] = f32();
  const x = i16() / QS, y = i16() / QS, z = i16() / QS;
  out[bo + 3] = x; out[bo + 4] = y; out[bo + 5] = z; out[bo + 6] = Math.sqrt(Math.max(0, 1 - x * x - y * y - z * z));
  out[bo + 7] = f32();
  return h;
}
