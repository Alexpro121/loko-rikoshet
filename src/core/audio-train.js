// Звуки паку-потяга (src/ui/packtrain.js): гул і перестук коліс за швидкістю, гудок, гальма, повітря, двері, табло, акорди рідкості.
// Лише синтез, без файлів: примітиви, шина ui і власний генератор rnd з AudioEngine, тож Math.random не чіпаємо.
import { audio } from './audio.js';

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);      // MIDI → Гц

export class TrainSound {
  /** bare — без гулу ходу: лише окремі звуки (акорд після пропуску). */
  constructor(bare = false) {
    const a = audio, c = a.ctx;
    this.ok = !!(c && a.live() && a.ui);
    if (!this.ok) return;
    this.bus = c.createGain(); this.bus.gain.value = 1; this.bus.connect(a.ui);
    this.soft = c.createBiquadFilter(); this.soft.type = 'lowpass'; this.soft.frequency.value = 1500; this.soft.Q.value = 0.6; this.soft.connect(this.bus);
    this.src = null;
    if (bare) return;
    // гул ходу: шум крізь низький фільтр, гучність іде за швидкістю, панорама — звідки потяг під'їжджає
    const s = c.createBufferSource(); s.buffer = a.noise; s.loop = true;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 170; lp.Q.value = 0.8;
    const body = c.createBiquadFilter(); body.type = 'peaking'; body.frequency.value = 75; body.Q.value = 1.1; body.gain.value = 7;
    this.rg = c.createGain(); this.rg.gain.value = 0.0001;
    this.pan = c.createStereoPanner ? c.createStereoPanner() : null;
    s.connect(lp); lp.connect(body); body.connect(this.rg);
    if (this.pan) { this.rg.connect(this.pan); this.pan.connect(this.bus); } else this.rg.connect(this.bus);
    s.start(c.currentTime, a.rnd() * 0.5);
    this.src = s;
  }
  /** Мітка performance.now() (мс) → секунди від «зараз» для примітивів AudioEngine. */
  rel(ms) { return Math.max(0, (ms - performance.now()) / 1000); }
  at(ms) { return audio.ctx.currentTime + this.rel(ms); }

  /** Гул за швидкістю: точки [мс, частка повної швидкості]. Швидкість між ними лінійна (стале прискорення), тож і гучність. */
  rumble(pts) {
    if (!this.ok || !this.src) return;
    const g = this.rg.gain, t0 = this.at(pts[0][0]);
    g.cancelScheduledValues(audio.ctx.currentTime); g.setValueAtTime(Math.max(0.0001, g.value), audio.ctx.currentTime);
    for (const [ms, k] of pts) g.linearRampToValueAtTime(0.0001 + 0.2 * Math.pow(Math.max(0, k), 1.3), Math.max(t0, this.at(ms)));
  }
  /** Звідки чути потяг: -1 ліворуч, 0 по центру. */
  panTo(v, ms, dur) { if (this.ok && this.pan) { this.pan.pan.setValueAtTime(this.pan.pan.value, this.at(ms)); this.pan.pan.linearRampToValueAtTime(v, this.at(ms) + dur); } }

  /** Вісь колісної пари на стику рейок. k — частка швидкості: тихіше й глухіше, коли потяг повзе. */
  clack(ms, k) {
    if (!this.ok || k < 0.04) return;
    const a = audio, w = this.rel(ms);
    a.hiss(1150 + a.rnd() * 450, 2.4, 0.04, 0.025 + 0.07 * k, w, 'bandpass', this.bus);
    a.tone('sine', 110 + a.rnd() * 15, 52, 0.08, 0.04 + 0.11 * k, w, this.bus);
  }

  /** Тон, що тримається (гудок, гальма): стала гучність, плавні край. */
  hold(type, f0, f1, dur, vol, ms, dest = this.soft) {
    if (!this.ok) return;
    const c = audio.ctx, t = this.at(ms), o = c.createOscillator(), g = c.createGain();
    if (!audio.claim(true, o)) return;
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.linearRampToValueAtTime(f1, t + dur);
    o.detune.value = (audio.rnd() - 0.5) * 10;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.06);
    g.gain.setValueAtTime(vol, t + Math.max(0.07, dur - 0.12)); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
  }

  /** Гудок локомотива: два голоси терцією, довгий і короткий. */
  horn(ms) {
    this.hold('sawtooth', 311, 306, 0.85, 0.05, ms); this.hold('sawtooth', 370, 364, 0.85, 0.042, ms);
    this.hold('sawtooth', 311, 307, 0.32, 0.045, ms + 1050); this.hold('sawtooth', 370, 365, 0.32, 0.038, ms + 1050);
  }

  /** Скрип гальм між мітками ms0 і ms1; hard — легенда: голосніше й із тріском іскор. */
  squeal(ms0, ms1, hard) {
    if (!this.ok || ms1 - ms0 < 120) return;
    const a = audio, c = a.ctx, t0 = this.at(ms0), t1 = this.at(ms1);
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2700; bp.Q.value = 7;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(hard ? 0.05 : 0.03, t0 + (t1 - t0) * 0.75); g.gain.linearRampToValueAtTime(hard ? 0.07 : 0.042, t1 - 0.05); g.gain.linearRampToValueAtTime(0.0001, t1 + 0.05);
    bp.connect(g); g.connect(this.bus);
    for (const f of [2380, 3160]) {
      const o = c.createOscillator(); if (!a.claim(true, o)) continue;
      o.type = 'sawtooth'; o.frequency.setValueAtTime(f * (1 + a.rnd() * 0.02), t0); o.frequency.linearRampToValueAtTime(f * 0.94, t1);
      o.connect(bp); o.start(t0); o.stop(t1 + 0.1);
    }
    a.hiss(3900, 3, (t1 - t0) * 0.6, hard ? 0.035 : 0.018, this.rel(ms0) + (t1 - t0) * 0.4, 'bandpass', this.bus);
    if (hard) this.sparks(ms0 + (ms1 - ms0) * 0.3, ms1);
  }
  /** Тріск іскор з-під коліс. */
  sparks(ms0, ms1) {
    if (!this.ok) return;
    const a = audio, n = Math.round((ms1 - ms0) / 60);
    for (let i = 0; i < n; i++) a.hiss(3800 + a.rnd() * 3500, 5, 0.018, 0.02 + a.rnd() * 0.03, this.rel(ms0 + a.rnd() * (ms1 - ms0)), 'bandpass', this.bus);
  }
  /** Потяг став: гальма відпускають повітря. */
  air(ms) {
    if (!this.ok) return;
    audio.hiss(3300, 0.7, 0.8, 0.075, this.rel(ms), 'highpass', this.bus);
    audio.hiss(800, 0.9, 0.35, 0.035, this.rel(ms), 'bandpass', this.bus);
  }
  /** Двері: пневматика шипить, полотно котиться, наприкінці глухий стук. fast — легенда: різко й коротко. */
  door(ms, fast) {
    if (!this.ok) return;
    const a = audio, w = this.rel(ms), d = fast ? 0.22 : 0.45;
    a.hiss(1750, 1.2, 0.3, 0.085, w, 'bandpass', this.bus);
    a.hiss(460, 0.8, d, 0.07, w + 0.06, 'lowpass', this.bus);
    a.tone('sine', 150, 68, 0.11, 0.13, w + 0.06 + d, this.bus);
  }
  /** Зчеплення набігло чи відкотилося: металевий удар. k — гучність (далі від камери — тихіше). */
  clank(ms, k) {
    if (!this.ok || k <= 0) return;
    const a = audio, w = this.rel(ms);
    a.tone('square', 200 + a.rnd() * 50, 92, 0.07, 0.03 * k, w, this.soft);
    a.hiss(2300 + a.rnd() * 900, 3, 0.05, 0.045 * k, w, 'bandpass', this.bus);
    a.tone('sine', 95, 55, 0.12, 0.08 * k, w, this.bus);
  }
  /** Потяг став: глухий удар усього складу. */
  thud(ms) { if (this.ok) { audio.tone('sine', 72, 38, 0.32, 0.22, this.rel(ms), this.bus); audio.hiss(260, 0.7, 0.25, 0.06, this.rel(ms), 'lowpass', this.bus); } }
  /** Щиток табло перегорнувся. */
  flap(ms) {
    if (!this.ok) return;
    audio.hiss(5200 + audio.rnd() * 900, 2.2, 0.013, 0.045, this.rel(ms), 'bandpass', this.bus);
  }
  /** Крок героя на перон. */
  step(ms) { if (this.ok) audio.tone('sine', 125, 58, 0.09, 0.1, this.rel(ms), this.bus); }

  /** Акорд розкриття: що вища рідкість, то ширший і довший. */
  chord(rar, ms) {
    if (!this.ok) return;
    const a = audio, w = this.rel(ms), b = this.bus;
    if (rar === 'c') { [72, 76, 79].forEach((n, i) => a.mallet(NOTE(n), 0.11, w + i * 0.05, b)); return; }
    if (rar === 'r') {
      [74, 78, 81, 86].forEach((n, i) => a.mallet(NOTE(n), 0.12, w + i * 0.06, b, 0.4));
      [62, 69].forEach((n) => this.hold('triangle', NOTE(n), NOTE(n), 1.1, 0.05, ms, b));
      return;
    }
    if (rar === 'e') {
      [64, 67, 71, 74, 78].forEach((n, i) => a.mallet(NOTE(n), 0.11, w + i * 0.09, b, 0.6));
      [52, 59, 64].forEach((n) => this.hold('triangle', NOTE(n), NOTE(n) * 1.004, 1.6, 0.05, ms, b));
      return;
    }
    a.tone('sine', 82, 38, 0.9, 0.3, w, b);                    // легенда: гуп
    [60, 64, 67, 72, 76, 79].forEach((n) => this.hold('triangle', NOTE(n), NOTE(n), 1.9, 0.045, ms, b));
    [84, 88, 91, 96, 100].forEach((n, i) => a.mallet(NOTE(n), 0.07, w + 0.12 + i * 0.07, b, 0.5));
  }

  /** Мить тиші перед легендою: майстер стихає й повертається. */
  silence(ms, dur) {
    if (!this.ok) return;
    const g = audio.master.gain, t = this.at(ms), v = 0.68;
    g.cancelScheduledValues(t); g.setTargetAtTime(0.03, t, 0.04); g.setTargetAtTime(v, t + dur, 0.02); g.setValueAtTime(v, t + dur + 0.15);
  }

  /** Усе гасне за fade мс і від'єднується. */
  stop(fade = 250) {
    if (!this.ok) return;
    this.ok = false;
    const c = audio.ctx, t = c.currentTime, g = this.bus.gain;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0.0001, t + fade / 1000);
    if (this.src) try { this.src.stop(t + fade / 1000 + 0.05); } catch (_) { /* ignore */ }
    setTimeout(() => { try { this.bus.disconnect(); } catch (_) { /* ignore */ } }, fade + 200);
  }
}
