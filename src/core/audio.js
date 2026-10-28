// Увесь звук синтезується на льоту (WebAudio): жодних файлів, нуль завантаження.
import { S } from '../state/save.js';

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.noise = null;
    this.lastWall = 0;
    this.musicMode = 'off';
    this.step = 0;
    this.nextT = 0;
    this.timer = 0;
    this.crowdGain = null;
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC({ latencyHint: 'interactive' });
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.8;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 6;
      this.master.connect(comp); comp.connect(this.ctx.destination);
      this.sfx = this.ctx.createGain(); this.sfx.connect(this.master);
      this.mus = this.ctx.createGain(); this.mus.gain.value = 0.32; this.mus.connect(this.master);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.startCrowd();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.applySettings();
    this.music(this.want || 'off');
  }

  applySettings() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.sfx.gain.setTargetAtTime(S.settings.sfx ? 1 : 0, t, 0.02);
    this.mus.gain.setTargetAtTime(S.settings.music ? 0.32 : 0, t, 0.05);
  }

  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  // --- примітиви ---
  tone(type, f0, f1, dur, vol, when = 0, dest = this.sfx) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime + when;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.02);
  }

  hiss(freq, q, dur, vol, when = 0, type = 'bandpass', dest = this.sfx) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime + when;
    const s = c.createBufferSource(); s.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }

  // --- ефекти гри ---
  kick(power = 1) {
    this.tone('sine', 190, 52, 0.16, 0.7 * (0.5 + power * 0.5));
    this.hiss(1400, 0.8, 0.07, 0.25 + power * 0.25);
  }
  wall(n = 0, speed = 20) {
    const now = performance.now();
    if (now - this.lastWall < 45) return;
    this.lastWall = now;
    const v = Math.min(0.5, 0.12 + speed / 90);
    this.tone('triangle', 260 + Math.min(n, 9) * 55, 200 + Math.min(n, 9) * 40, 0.09, v);
    this.hiss(2200, 1.2, 0.04, v * 0.4);
  }
  coin(chain = 0) {
    const k = Math.pow(1.0595, Math.min(chain, 12) * 2);
    this.tone('square', 880 * k, 880 * k, 0.07, 0.16);
    this.tone('square', 1318 * k, 1318 * k, 0.12, 0.16, 0.06);
  }
  pass() { this.tone('triangle', 520, 780, 0.1, 0.3); }
  ram() {
    this.tone('square', 120, 38, 0.3, 0.45);
    this.hiss(500, 0.6, 0.25, 0.5);
    this.tone('sawtooth', 700, 200, 0.18, 0.18);
  }
  save() { this.tone('triangle', 330, 160, 0.14, 0.4); this.hiss(900, 0.7, 0.08, 0.25); }
  whistle(long = false) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime, dur = long ? 0.9 : 0.4;
    const o = c.createOscillator(), g = c.createGain(), l = c.createOscillator(), lg = c.createGain();
    o.type = 'sine'; o.frequency.value = 2850;
    l.frequency.value = 26; lg.gain.value = 140; l.connect(lg); lg.connect(o.frequency);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.28, t + 0.02);
    g.gain.setValueAtTime(0.28, t + dur - 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.sfx); o.start(t); l.start(t); o.stop(t + dur + 0.02); l.stop(t + dur + 0.02);
  }
  horn() {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime, dur = 1.15;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1300;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.38, t + 0.06);
    g.gain.setValueAtTime(0.38, t + dur - 0.25); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    lp.connect(g); g.connect(this.sfx);
    for (const f of [233, 294, 349]) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = (Math.random() - 0.5) * 12;
      o.connect(lp); o.start(t); o.stop(t + dur + 0.02);
    }
  }
  goal() {
    this.horn();
    this.hiss(900, 0.5, 1.8, 0.5, 0.05);
    this.hiss(2400, 0.6, 1.2, 0.2, 0.1);
  }
  concede() {
    this.tone('sawtooth', 300, 120, 0.7, 0.28);
    this.hiss(500, 0.5, 0.9, 0.22);
  }
  bell() {
    this.tone('sine', 1040, 1040, 0.35, 0.3);
    this.tone('sine', 1560, 1560, 0.28, 0.14);
  }
  rumble() { this.hiss(130, 0.7, 2.2, 0.6, 0, 'lowpass'); }
  click() { this.tone('sine', 760, 520, 0.05, 0.28); }
  back() { this.tone('sine', 520, 360, 0.06, 0.25); }
  buy() { [523, 659, 784, 1047].forEach((f, i) => this.tone('square', f, f, 0.09, 0.14, i * 0.06)); }
  deny() { this.tone('square', 150, 110, 0.14, 0.2); }
  win() { [392, 523, 659, 784, 1047].forEach((f, i) => this.tone('triangle', f, f, 0.22, 0.3, i * 0.11)); }
  lose() { [330, 262, 196].forEach((f, i) => this.tone('triangle', f, f * 0.98, 0.3, 0.28, i * 0.18)); }
  /** Вхід/вихід із режиму сповільнення: «бух» униз і «вжих» угору. */
  slowmo(on) {
    if (on) { this.tone('sine', 520, 70, 0.4, 0.45); this.hiss(900, 0.6, 0.35, 0.18, 0, 'lowpass'); this.crowd(0.18); }
    else { this.tone('sine', 90, 640, 0.22, 0.32); this.hiss(2800, 0.8, 0.18, 0.2); this.crowd(0.7); }
  }
  beat(danger = 0) { this.tone('sine', 80, 42, 0.2, 0.34 + danger * 0.3); if (danger > 0.55) this.tone('sine', 80, 42, 0.16, 0.22, 0.17); }
  slide() { this.hiss(1500, 0.5, 0.28, 0.34); this.tone('sine', 140, 70, 0.18, 0.2); }
  clap() { this.hiss(2300, 1.1, 0.06, 0.6); this.hiss(900, 0.9, 0.04, 0.35); this.tone('sine', 260, 120, 0.04, 0.18); }   // ляпас долонь
  thud() { this.tone('sine', 110, 50, 0.16, 0.4); this.hiss(400, 0.7, 0.1, 0.25); }
  chug() { this.hiss(180, 0.6, 0.09, 0.5, 0, 'lowpass'); }

  startCrowd() {
    const c = this.ctx;
    const s = c.createBufferSource(); s.buffer = this.noise; s.loop = true;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 650; bp.Q.value = 0.4;
    this.crowdGain = c.createGain(); this.crowdGain.gain.value = 0;
    s.connect(bp); bp.connect(this.crowdGain); this.crowdGain.connect(this.sfx);
    s.start();
  }
  crowd(level) {
    if (!this.crowdGain) return;
    this.crowdGain.gain.setTargetAtTime(level * 0.07, this.ctx.currentTime, 0.4);
  }

  // --- музика: залізничний ритм + пентатоніка ---
  music(mode) {
    this.want = mode;
    if (!this.ctx || (mode === this.musicMode && this.timer)) return;
    this.musicMode = mode;
    clearInterval(this.timer); this.timer = 0;
    if (mode === 'off') return;
    this.step = 0; this.nextT = this.ctx.currentTime + 0.05;
    this.timer = setInterval(() => this.schedule(), 40);
  }
  schedule() {
    const c = this.ctx;
    if (!c || c.state !== 'running') { if (c) this.nextT = Math.max(this.nextT, c.currentTime); return; }
    const bpm = this.musicMode === 'match' ? 126 : 104;
    const dt = 60 / bpm / 4;
    const scale = [220, 261.6, 293.7, 329.6, 392, 440, 523.3, 587.3];
    while (this.nextT < c.currentTime + 0.14) {
      const s = this.step, w = this.nextT - c.currentTime;
      if (s % 4 === 0) this.tone('sine', 110, 55, 0.14, 0.5, w, this.mus);
      if (s % 4 === 2) this.hiss(5200, 1.5, 0.03, 0.12, w, 'highpass', this.mus);
      if (s % 8 === 3 || s % 8 === 5) this.hiss(2600, 2, 0.025, 0.09, w, 'bandpass', this.mus); // «тук-тук» колес
      if (s % 2 === 0) {
        const pat = [0, 2, 4, 2, 5, 4, 2, 3, 0, 2, 4, 6, 5, 4, 2, 1];
        const n = scale[pat[(s >> 1) % pat.length] % scale.length];
        this.tone('triangle', n, n, 0.18, 0.18, w, this.mus);
      }
      this.step++; this.nextT += dt;
    }
  }
}

export const audio = new AudioEngine();

export function vibrate(ms) {
  if (S.settings.haptics && navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) { /* ignore */ } }
}
