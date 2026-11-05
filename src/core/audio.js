// AudioEngine: гібрид. Натовп, удар, свисток, сітка, стовп, рукавиці це справжні записи (audio-bank.js), тонкі шари, інтерфейс
// і музика меню це синтез WebAudio. Поки запису ще нема, грає запасний синтез, тож гра завжди зі звуком і старт його не чекає.
// Шини: ball, play, stad → world (приглушення сповільненням) → sfx → tone → майстер; ui → sfx; music → tone. Спільний простір rev.
// Випадковість лише своя (rnd): Math.random у грі належить симулятору, і звук не має зсувати його послідовність.
import { S } from '../state/save.js';
import { tgHaptic } from './telegram.js';
import { Bank, LOOP_LEN, MARGIN } from './audio-bank.js';
import { loadPerf } from './perf.js';

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const VOICES = 26;                                     // скільки одноразових голосів разом; понад це тихі звуки пропускаємо
const BED = 0.62, TENSE = 0.5, CHANT = 0.34;           // рівні шарів натовпу при crowd(1)
const MUS = 0.26;                                      // рівень музики меню

export class AudioEngine {
  constructor(bank = new Bank()) {
    this.bank = bank;
    this.ctx = null;
    this.noise = null;
    this.musicMode = 'off';
    this.musicStyle = 'keys';
    this.step = 0;
    this.nextT = 0;
    this.timer = 0;
    this.wakeUntil = 0;
    this.want = 'off';
    this.tOff = 0;                                     // зсув часу для рендеру сцени в OfflineAudioContext
    this.offline = false;
    this.seed = 0x2f6e2b1;
    this.active = 0;
    this.lastAt = {};                                  // обмеження частоти за назвою
    // стан натовпу
    this.level = 0; this.tension = 0; this.tTick = 0; this.chantLv = 0; this.duck = 1;
    this.layers = {}; this.boost = 0; this.boostUntil = 0;
    this.bed2Mix = 0.45; this.nextRot = 0; this.nextTense = 60; this.nextChant = 60; this.rotWhich = false;
    // де м'яч відносно камери: панорама й віддаленість
    this.pan = 0; this.far = 0;
  }

  /** Свій генератор (xorshift): не чіпає Math.random, який у грі належить симулятору. */
  rnd() { let x = this.seed; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; this.seed = x >>> 0; return this.seed / 4294967296; }
  jit(amount) { return 1 + (this.rnd() * 2 - 1) * amount; }
  chance(p) { return this.rnd() < p; }
  clock() { return this.ctx ? this.ctx.currentTime + this.tOff : 0; }
  /** Не частіше ніж раз на gap секунд. */
  gate(name, gap) { const t = this.clock(), l = this.lastAt[name]; if (l !== undefined && t - l < gap) return false; this.lastAt[name] = t; return true; }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.attach(new AC({ latencyHint: 'interactive' }));
      this.wakeUntil = performance.now() + 300;
      this.bank.load(this.ctx, () => this.rnd());
    }
    this.resume();
    this.applySettings();
    this.music(this.want || 'off');
  }

  /** Зібрати граф на контексті. Лабораторна сторінка дає сюди OfflineAudioContext і рендерить без звуку. */
  attach(ctx, opts = {}) {
    const c = this.ctx = ctx;
    this.offline = !!opts.offline;
    this.forceOn = !!(opts.offline || opts.forceOn);      // сторінка прослуховування грає незалежно від налаштувань гравця
    const gain = (v, to) => { const g = c.createGain(); g.gain.value = v; if (to) g.connect(to); return g; };
    // майстер: спокійна компресія лише на піках, без помпування; верх трохи приглушений, щоб не різало за годину гри
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -9; comp.knee.value = 12; comp.ratio.value = 3; comp.attack.value = 0.008; comp.release.value = 0.3;
    comp.connect(this.out = opts.dest || c.destination);
    this.comp = comp;
    this.master = gain(0.68, comp);       // компресор сам додає підсилення близько 3 дБ, тож запас тут
    const shelf = c.createBiquadFilter(); shelf.type = 'highshelf'; shelf.frequency.value = 6000; shelf.gain.value = -4;
    const harsh = c.createBiquadFilter(); harsh.type = 'peaking'; harsh.frequency.value = 3100; harsh.Q.value = 0.8; harsh.gain.value = -3;
    harsh.connect(shelf); shelf.connect(this.master);
    this.tone_ = harsh;
    this.sfx = gain(1, harsh);
    this.mus = gain(S.settings.music || this.forceOn ? 1 : 0, harsh);
    this.musMix = gain(MUS, this.mus);
    this.ui = gain(0.8, this.sfx);
    // світ гри: сповільнення приглушує саме його, а інтерфейс лишається чітким
    this.worldLP = c.createBiquadFilter(); this.worldLP.type = 'lowpass'; this.worldLP.frequency.value = 18000; this.worldLP.Q.value = 0.4;
    this.worldLP.connect(this.sfx);
    this.world = gain(1, this.worldLP);
    // тіло удару в смузі, яку телефон ще відтворює
    this.body = c.createBiquadFilter(); this.body.type = 'peaking'; this.body.frequency.value = 240; this.body.Q.value = 0.9; this.body.gain.value = 4;
    this.body.connect(this.world);
    this.ball = gain(0.95, this.body);
    this.play = gain(0.85, this.world);
    this.stad = gain(1, this.world);
    // простір стадіону один на всі звуки: короткий імпульс, згортка одна. Вона дає +60% до ціни звуку, тож на слабкому телефоні дві затримки
    const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    const lite = this.lite = opts.lite === undefined ? loadPerf(coarse).level <= 1 : opts.lite;
    if (!opts.offline && !opts.forceOn) this.bank.mono = coarse;   // телефон і Telegram: WebView тісний, а динамік один. Моно вдвічі легше в пам'яті
    this.revOut = gain(0.8, this.world);
    if (lite) {
      this.revIn = c.createBiquadFilter(); this.revIn.type = 'lowpass'; this.revIn.frequency.value = 1900;
      for (const [sec, v] of [[0.083, 0.3], [0.147, 0.24]]) { const d = c.createDelay(0.3); d.delayTime.value = sec; this.revIn.connect(d); d.connect(gain(v, this.revOut)); }
    } else {
      this.rev = c.createConvolver(); this.rev.buffer = this.makeIR(c);
      this.revIn = gain(1, this.rev);
      this.rev.connect(this.revOut);
    }
    const len = c.sampleRate;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = this.rnd() * 2 - 1;
    this.bank.onLoad = (slot) => this.slotReady(slot);
    this.buildCrowd();
  }

  /** Імпульс відкритої чаші: кілька ранніх відбиттів від трибун і короткий темний хвіст. */
  makeIR(c) {
    const sr = c.sampleRate, n = Math.floor(sr * 0.62), ir = c.createBuffer(2, n, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr, a = Math.exp(-t * 8), k = 0.5 * Math.exp(-t * 7) + 0.04;   // що далі, то темніше
        lp += k * ((this.rnd() * 2 - 1) - lp);
        d[i] = lp * a * 0.5;
      }
      const ER = ch ? [0.071, 0.133, 0.207, 0.289] : [0.058, 0.117, 0.183, 0.311];
      for (let e = 0; e < ER.length; e++) d[Math.floor(ER[e] * sr)] += (e & 1 ? -0.34 : 0.4) / (1 + e * 0.6);
    }
    return ir;
  }

  applySettings() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, st = S.settings;
    this.sfx.gain.setTargetAtTime(st.sfx || this.forceOn ? 1 : 0, t, 0.02);
    this.mus.gain.setTargetAtTime(st.music || this.forceOn ? 1 : 0, t, 0.05);
    if (st.sfx || this.forceOn) this.syncCrowd(); else this.stopLayers();   // вимкнений звук не тримає петель
  }

  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }
  // interrupted — стан iOS після дзвінка чи блокування; без жесту браузер може відмовити, тоді спробуємо на наступному дотику
  resume() { if (this.ctx && (this.ctx.state === 'suspended' || this.ctx.state === 'interrupted')) { this.wakeUntil = performance.now() + 300; this.ctx.resume().catch(() => {}); } }
  /**
   * Чи можна планувати ефект. Зупинений контекст стоїть у часі: усе заплановане заграло б разом після відновлення, тому
   * такі звуки пропускаємо. Виняток — мить після resume чи створення контексту: він оживе за кадр-два, а звук цього дотику потрібен.
   */
  live() { const c = this.ctx; return !!c && (this.offline || c.state === 'running' || performance.now() < this.wakeUntil); }

  // --- примітиви ---
  /** Лічильник голосів: важливі події (prio) звучать завжди, дрібниці при перевантаженні пропускаємо. */
  claim(prio, src) {
    if (this.active >= VOICES && !prio) return false;
    if (this.offline) return true;                     // офлайн-сцена планує все наперед, час у ній не йде
    this.active++;
    src.onended = () => { this.active--; };
    return true;
  }

  tone(type, f0, f1, dur, vol, when = 0, dest = this.ui) {
    if (!this.live()) return;
    const c = this.ctx, t = this.clock() + when;
    const o = c.createOscillator(), g = c.createGain();
    if (!this.claim(false, o)) return;
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.012, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.02);
  }

  hiss(freq, q, dur, vol, when = 0, type = 'bandpass', dest = this.ui) {
    if (!this.live()) return;
    const c = this.ctx, t = this.clock() + when;
    const s = c.createBufferSource(); s.buffer = this.noise; s.loop = true;   // буфер 1 с, а шум буває довшим
    if (!this.claim(false, s)) return;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.012, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest);
    s.start(t, this.rnd() * 0.5); s.stop(t + dur + 0.02);
  }

  /** Коротка затухла нота (дерево, м'яка дзвінка): основа інтерфейсу й клавіш меню. */
  mallet(f, vol, when = 0, dest = this.ui, dur = 0.22) {
    this.tone('sine', f, f, dur, vol, when, dest);
    this.tone('sine', f * 2.76, f * 2.76, dur * 0.28, vol * 0.16, when, dest);
    this.hiss(Math.min(3200, f * 3), 1, 0.012, vol * 0.1, when, 'bandpass', dest);
  }

  /**
   * Відтворити запис. Повертає false, якщо його ще немає: тоді метод грає запасний синтез.
   * o: bus, gain, rate, lp (Гц), pan, send (частка в простір), when, prio, atk/fade (сек), off (початок у файлі).
   */
  sample(slot, o = {}) {
    if (!this.live()) return true;                     // звук цієї миті пропущено: синтез теж не потрібен
    const buf = this.bank.pick(slot, () => this.rnd());
    if (!buf) return false;
    const c = this.ctx, t = this.clock() + (o.when || 0), s = c.createBufferSource();
    if (!this.claim(o.prio, s)) return true;
    s.buffer = buf; s.playbackRate.value = o.rate || 1;
    const g = c.createGain(); const vol = o.gain === undefined ? 1 : o.gain;
    if (o.atk) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0001, vol), t + o.atk); } else g.gain.value = vol;
    if (o.dur) { g.gain.setValueAtTime(vol, t + Math.max(0, o.dur - (o.fade || 0.3))); g.gain.linearRampToValueAtTime(0, t + o.dur); }
    let tail = s;
    if (o.lp) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; f.Q.value = 0.5; tail.connect(f); tail = f; }
    if (o.hp) { const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = o.hp; f.Q.value = 0.5; tail.connect(f); tail = f; }
    tail.connect(g); tail = g;
    if (o.pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = o.pan; tail.connect(p); tail = p; }
    tail.connect(o.bus || this.ball);
    if (o.send) { const r = c.createGain(); r.gain.value = o.send; tail.connect(r); r.connect(this.revIn); }
    s.start(t, o.off || 0);
    if (o.dur) s.stop(t + o.dur + 0.02);
    return true;
  }

  // --- м'яч ---
  /** Сила міняє не лише гучність: слабкий удар темніший і нижчий за тембром, сильний відкритий і лунає трибунами. */
  kick(power = 1) {
    const p = clamp01(power), far = this.far;
    const gain = (0.4 + 0.5 * p) * (1 - far * 0.45);
    const ok = this.sample('kick', { gain, rate: (1.1 - 0.2 * p) * this.jit(0.03), lp: (1600 + 7000 * p * p) * (1 - far * 0.4), pan: this.pan, send: 0.08 + 0.16 * p + far * 0.25, prio: true });
    // поєднання: сильний удар отримує тіло з іншого запису, слабкий іноді дотик ногою, тож двох однакових ударів майже немає
    if (ok && p > 0.55 && this.chance(0.7)) this.sample('kick', { gain: gain * 0.26, rate: (0.82 + this.rnd() * 0.12), lp: 2600, pan: this.pan, when: this.rnd() * 0.004 });
    else if (ok && p < 0.4 && this.chance(0.4)) this.sample('touch', { gain: gain * 0.5, rate: this.jit(0.08), lp: 3200, pan: this.pan });
    // тіло для телефона: коротка нота вище 100 Гц
    this.tone('sine', 175 + 45 * p, 96, 0.075 + 0.03 * p, (0.2 + 0.34 * p) * (1 - far * 0.45), 0, this.ball);
    if (!ok) this.hiss(1100 + 900 * p, 0.7, 0.05, 0.1 + 0.16 * p, 0, 'bandpass', this.ball);
  }
  /** Дотик ногою: тихий і короткий, не «буп». */
  pass() {
    const far = this.far, gain = 0.3 * (1 - far * 0.5);
    if (!this.gate('pass', 0.04)) return;
    const ok = this.sample('touch', { gain, rate: this.jit(0.06), lp: 3600, pan: this.pan, send: 0.05 + far * 0.2 });
    this.tone('sine', 205, 120, 0.05, 0.16 * (1 - far * 0.5), 0, this.ball);
    if (!ok) this.hiss(900, 0.8, 0.03, 0.09, 0, 'bandpass', this.ball);
  }
  /** Борт: глухий поштовх, а висота тону несе рахунок рикошетів (n). */
  wall(n = 0, speed = 20) {
    if (!this.gate('wall', 0.045)) return;
    const k = clamp01(speed / 34), f = 148 * Math.pow(2, Math.min(n, 9) * 1.5 / 12), far = this.far;
    const v = (0.22 + 0.5 * k) * (1 - far * 0.4);
    this.tone('triangle', f * 1.25, f, 0.1 + 0.05 * k, v, 0, this.play);
    this.tone('sine', f * 2.4, f * 2.25, 0.05, v * 0.3, 0, this.play);
    if (!this.sample('bounce', { bus: this.play, gain: v * 0.8, rate: (0.92 + Math.min(n, 9) * 0.035) * this.jit(0.03), lp: 1900 + 2200 * k, pan: this.pan, send: 0.12 + far * 0.2 })) this.hiss(1100, 0.8, 0.04, v * 0.3, 0, 'bandpass', this.play);
    this.revPing(v * 0.28);
  }
  /** Стовп: окремо від борту. Запис глухий, тож дзвін дають негармонічні частоти сталевої труби. */
  post(impact = 16) {
    if (!this.gate('post', 0.12)) return;
    const k = clamp01(impact / 28), v = 0.11 + 0.17 * k;
    this.sample('post', { bus: this.play, gain: 0.32 + 0.3 * k, rate: this.jit(0.03), lp: 3000 + 1800 * k, pan: this.pan, send: 0.22, prio: true });
    const j = this.jit(0.012);
    this.tone('sine', 612 * j, 606 * j, 0.42, v, 0.002, this.play);
    this.tone('sine', 1483 * j, 1470 * j, 0.26, v * 0.5, 0.002, this.play);
    this.tone('sine', 2591 * j, 2570 * j, 0.14, v * 0.17, 0.002, this.play);
    this.tone('sine', 180, 118, 0.07, 0.3 + 0.25 * k, 0, this.play);
    this.revPing(v * 0.5);
  }
  /** М'яч у сітці: шурхіт мотузки. Частоту обмежено, бо ворота двічі ловлять той самий м'яч. */
  net(power = 0.8) {
    if (!this.gate('net', 0.9)) return;
    const p = clamp01(power);
    const ok = this.sample('net', { bus: this.play, gain: 0.55 + 0.45 * p, rate: this.jit(0.05), hp: 500, send: 0.1, prio: true });
    // запис суто шурхіт: додаємо тіло сітки, що прогинається
    this.hiss(1500, 0.5, ok ? 0.3 : 0.5, (ok ? 0.1 : 0.26) * (0.6 + 0.4 * p), 0, 'bandpass', this.play);
    this.tone('sine', 210, 120, 0.1, 0.14 + 0.1 * p, 0, this.play);
  }
  /** Рукавиці: ляск по шкірі плюс глухий удар м'яча в долоні. */
  save() {
    if (!this.gate('save', 0.06)) return;
    if (!this.sample('glove', { bus: this.play, gain: 0.85, rate: this.jit(0.05), lp: 5200, pan: this.pan, send: 0.14, prio: true })) this.hiss(1300, 0.8, 0.05, 0.16, 0, 'bandpass', this.play);
    else if (this.chance(0.45)) this.sample('glove', { bus: this.play, gain: 0.34, rate: 0.9 * this.jit(0.06), lp: 3600, pan: this.pan });
    this.tone('sine', 165, 92, 0.11, 0.32, 0, this.play);
  }
  /** Глухий контакт із тілом: голова, спина, захисник. */
  thud() {
    if (!this.gate('thud', 0.05)) return;
    const ok = this.sample('bounce', { bus: this.play, gain: 0.55, rate: 0.78 * this.jit(0.05), lp: 1400, pan: this.pan, send: 0.08 });
    this.tone('sine', 138, 76, 0.13, 0.3, 0, this.play);
    if (!ok) this.hiss(420, 0.7, 0.07, 0.14, 0, 'bandpass', this.play);
  }
  slide() {
    if (!this.gate('slide', 0.1)) return;
    // шурхіт трави: темний шум, що згасає разом зі швидкістю
    this.hiss(880, 0.5, 0.34, 0.2, 0, 'bandpass', this.play);
    this.hiss(2100, 0.5, 0.2, 0.05, 0.02, 'bandpass', this.play);
    this.tone('sine', 120, 72, 0.14, 0.12, 0, this.play);
  }
  clap() { this.hiss(1500, 0.9, 0.05, 0.28, 0, 'bandpass', this.play); this.hiss(760, 0.9, 0.035, 0.18, 0, 'bandpass', this.play); this.revPing(0.05); }   // ляпас долонь

  /** Дрібний поштовх у простір для синтезу, який сам не має хвоста. */
  revPing(v) {
    if (!this.live() || !this.gate('revPing', 0.03)) return;
    const c = this.ctx, t = this.clock(), s = c.createBufferSource(), g = c.createGain();
    if (!this.claim(false, s)) return;
    s.buffer = this.noise; g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    s.connect(g); g.connect(this.revIn); s.start(t, this.rnd() * 0.5); s.stop(t + 0.04);
  }

  // --- суддя й стадіон ---
  /** Свисток лунає здалеку: тихіше за м'яч, із простором. Це найрізкіший звук гри, тому верх зрізано окремо. */
  whistle(long = false) {
    const slot = long ? 'whistle-long' : 'whistle-short';
    if (this.sample(slot, { bus: this.stad, gain: 0.34, rate: this.jit(0.012), lp: 5200, send: 0.42, prio: true })) return;
    // запасний: два близькі тони з «горошиною», а не один чистий синус
    if (!this.live()) return;
    const c = this.ctx, t = this.clock(), dur = long ? 1.0 : 0.42;
    const g = c.createGain(), l = c.createOscillator(), lg = c.createGain(), r = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.055, t + 0.025);
    g.gain.setValueAtTime(0.055, t + dur - 0.08); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    l.frequency.value = 31; lg.gain.value = 0.022; l.connect(lg); lg.connect(g.gain);
    r.gain.value = 0.45; g.connect(this.stad); g.connect(r); r.connect(this.revIn);
    l.start(t); l.stop(t + dur + 0.02);
    for (const f of [2320, 2465]) { const o = c.createOscillator(); o.frequency.value = f; o.connect(g); o.start(t); o.stop(t + dur + 0.02); }
  }
  /** Далекий гудок поїзда (ідентичність «Локо»): той самий акорд, але темний, із повільною атакою й простором. */
  horn() {
    if (!this.live()) return;
    const c = this.ctx, t = this.clock(), dur = 1.3;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.5;
    lp.frequency.setValueAtTime(420, t); lp.frequency.linearRampToValueAtTime(760, t + 0.2); lp.frequency.linearRampToValueAtTime(520, t + dur);
    const g = c.createGain(), r = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.17, t + 0.14);
    g.gain.setValueAtTime(0.17, t + dur - 0.35); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    r.gain.value = 0.5;
    lp.connect(g); g.connect(this.stad); g.connect(r); r.connect(this.revIn);
    const fs = [233, 294, 349];
    for (let i = 0; i < 3; i++) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = fs[i]; o.detune.value = (this.rnd() - 0.5) * 12;
      o.connect(lp); o.start(t); o.stop(t + dur + 0.02);
    }
  }
  /** Гол своїх: сітка й рев трибун. Гість чує concede через SWAP_SND, тож вони мають різнитись і без картинки. Кожен гол збирається по-новому. */
  goal() {
    this.net(1);
    this.lift(1, 7);
    const two = this.chance(0.65);
    if (!this.sample('crowd-goal', { bus: this.stad, gain: two ? 0.44 : 0.52, atk: 0.18, prio: true, when: 0.08 })) { this.hiss(800, 0.5, 2.6, 0.34, 0.08, 'bandpass', this.stad); this.hiss(1900, 0.6, 1.6, 0.1, 0.12, 'bandpass', this.stad); return; }
    if (two) this.sample('crowd-goal', { bus: this.stad, gain: 0.18 + this.rnd() * 0.14, atk: 0.5, when: 0.35 + this.rnd() * 0.9, rate: this.jit(0.03), pan: (this.rnd() - 0.5) * 0.8, dur: 8, fade: 3 });
    if (this.chance(0.5)) this.sample('crowd-clap', { bus: this.stad, gain: 0.26, atk: 1, when: 5 + this.rnd() * 2, rate: this.jit(0.03) });
  }
  /** Пропустили: сітка, важке зітхання домашніх і далекий сектор гостей збоку. */
  concede() {
    this.net(0.8);
    this.lift(-0.5, 4);
    if (!this.sample('crowd-groan', { bus: this.stad, gain: 0.72, atk: 0.2, prio: true, when: 0.05 })) { this.hiss(420, 0.5, 1.6, 0.26, 0.05, 'bandpass', this.stad); return; }
    if (this.chance(0.5)) this.sample('crowd-groan', { bus: this.stad, gain: 0.26, atk: 0.3, when: 0.4 + this.rnd() * 0.5, rate: this.jit(0.03), pan: (this.rnd() - 0.5) * 0.6 });
    if (this.chance(0.6)) this.sample('crowd-ooh', { bus: this.stad, gain: 0.24, atk: 0.06, rate: 0.96 * this.jit(0.02) });
    this.sample('crowd-goal', { bus: this.stad, gain: 0.13, rate: 1.03, lp: 1500, pan: 0.65, send: 0.2, atk: 0.3, when: 0.25, dur: 5, fade: 2 });
  }
  /** «Ох», зітхання, оплески: кличе Stands.react, тож гість чує те саме, що бачить. */
  crowdReact(type) {
    if (!this.ctx || this.level <= 0.01) return;
    if (type === 'gasp') {
      if (!this.gate('ooh', 2.6)) return;
      const v = 0.34 + this.level * 0.16;
      if (!this.sample('crowd-ooh', { bus: this.stad, gain: v, atk: 0.1, rate: this.jit(0.02), when: 0.05 })) this.hiss(620, 0.6, 1.1, 0.16, 0.05, 'bandpass', this.stad);
      else if (this.chance(0.35)) this.sample('crowd-ooh', { bus: this.stad, gain: v * 0.45, atk: 0.15, when: 0.2 + this.rnd() * 0.3, rate: this.jit(0.03), pan: (this.rnd() - 0.5) * 0.7 });
      this.lift(0.35, 3);
    } else if (type === 'groan') {
      if (!this.gate('groan', 3)) return;
      if (!this.sample('crowd-groan', { bus: this.stad, gain: 0.55, atk: 0.2, rate: this.jit(0.02) })) this.hiss(380, 0.6, 1.6, 0.16, 0, 'bandpass', this.stad);
      else if (this.chance(0.3)) this.sample('crowd-groan', { bus: this.stad, gain: 0.2, atk: 0.3, when: 0.3 + this.rnd() * 0.4, rate: this.jit(0.03), pan: (this.rnd() - 0.5) * 0.6 });
    } else if (type === 'clap') {
      if (!this.gate('applause', 5)) return;
      this.sample('crowd-clap', { bus: this.stad, gain: 0.5, atk: 0.4, rate: this.jit(0.03) });
    } else if (type === 'wave') this.lift(0.5, 4);
  }
  /** Перемога: стадіон замість мелодії. Викликається й у меню (нагорода), там звучить так само коротко. */
  win() {
    if (!this.sample('crowd-goal', { bus: this.stad, gain: 0.46, atk: 0.3, when: 0.3, dur: 7, fade: 3, prio: true })) { this.hiss(800, 0.5, 2, 0.18, 0.3, 'bandpass', this.stad); return; }
    this.sample('crowd-goal', { bus: this.stad, gain: 0.2, atk: 0.6, when: 1.1 + this.rnd() * 0.6, rate: this.jit(0.03), pan: (this.rnd() - 0.5) * 0.8, dur: 6, fade: 3 });
    this.sample('crowd-clap', { bus: this.stad, gain: 0.3, atk: 1, when: 2.5 + this.rnd(), rate: this.jit(0.03) });
  }
  lose() {
    if (!this.sample('crowd-groan', { bus: this.stad, gain: 0.55, atk: 0.25, when: 0.25, prio: true })) { this.hiss(380, 0.6, 1.6, 0.16, 0.25, 'bandpass', this.stad); return; }
    this.sample('crowd-groan', { bus: this.stad, gain: 0.22, atk: 0.3, when: 0.7 + this.rnd() * 0.5, rate: this.jit(0.03), pan: (this.rnd() - 0.5) * 0.6 });
    if (this.chance(0.5)) this.sample('crowd-clap', { bus: this.stad, gain: 0.14, atk: 1, when: 3 + this.rnd(), rate: this.jit(0.03) });
  }
  bell() { this.mallet(698, 0.13, 0, this.ui, 0.5); this.mallet(1047, 0.07, 0.01, this.ui, 0.4); }
  /** Поїзд здалеку: важкий шум у смузі, яку чує телефон, без різких країв. */
  rumble() { this.hiss(120, 0.7, 2.2, 0.4, 0, 'lowpass', this.stad); this.hiss(240, 0.8, 1.9, 0.1, 0.15, 'bandpass', this.stad); }

  // --- інтерфейс: тихо, коротко, дерево замість чіптюну ---
  click() { if (!this.gate('click', 0.02)) return; this.tone('sine', 520, 430, 0.032, 0.11); this.hiss(1800, 1.1, 0.014, 0.05); }
  back() { if (!this.gate('click', 0.02)) return; this.tone('sine', 380, 300, 0.04, 0.1); this.hiss(1200, 1.1, 0.014, 0.04); }
  /** Висота тону несе довжину ланцюга (chain): це ігровий зміст, тому лишається, але тембр м'який. */
  coin(chain = 0) {
    const k = Math.pow(1.0595, Math.min(chain, 12) * 2);
    this.mallet(784 * k, 0.1, 0, this.ui, 0.2);
    this.mallet(1175 * k, 0.07, 0.07, this.ui, 0.26);
  }
  buy() { this.mallet(523, 0.11, 0, this.ui, 0.2); this.mallet(659, 0.1, 0.07, this.ui, 0.22); this.mallet(784, 0.09, 0.14, this.ui, 0.3); }
  deny() { this.tone('sine', 170, 150, 0.07, 0.15); this.tone('sine', 142, 124, 0.09, 0.14, 0.09); }

  /** Сповільнення йде при кожному володінні м'ячем, тож воно тонке: світ темнішає, натовп трохи відходить, без свисту. */
  slowmo(on) {
    if (!this.ctx) return;
    const t = this.clock();
    this.worldLP.frequency.cancelScheduledValues(t);
    this.worldLP.frequency.setTargetAtTime(on ? 2800 : 18000, t, on ? 0.14 : 0.18);
    this.duck = on ? 0.8 : 1;
    this.syncCrowd(0.6);
    if (on) this.hiss(360, 0.6, 0.38, 0.1, 0, 'lowpass', this.ui);
    else this.hiss(1100, 0.5, 0.22, 0.05, 0, 'bandpass', this.ui);
  }
  /** Серце в прицілі: тихо, бо звучить постійно. Обертон 124 Гц лишає його чутним на телефоні. */
  beat(danger = 0) {
    const v = 0.08 + danger * 0.1;
    this.tone('sine', 66, 46, 0.2, v, 0, this.play); this.tone('sine', 128, 104, 0.09, v * 0.5, 0, this.play);
    if (danger > 0.55) { this.tone('sine', 66, 46, 0.16, v * 0.7, 0.17, this.play); this.tone('sine', 128, 104, 0.07, v * 0.35, 0.17, this.play); }
  }

  // --- натовп ---
  /** Вузли шарів. Живі джерела стартують лише за потреби. bed2 це другий варіант гулу під основним: разом вони дають поєднання, яке весь час міняється. */
  buildCrowd() {
    const c = this.ctx, g = () => { const n = c.createGain(); n.gain.value = 0; n.connect(this.stad); return n; };
    for (const key of ['crowd-bed', 'bed2', 'crowd-tense', 'crowd-chant']) this.layers[key] = { gain: g(), v: null };
    this.synthGain = g();
  }
  /** Постійний гул: рівень кличе гра подіями, різких стрибків немає. */
  crowd(level) {
    if (!this.ctx) return;
    this.level = level;
    if (level < 0.05 && this.duck !== 1) {             // вихід посеред сповільнення: Match.exit не кличе slowmo(false)
      this.duck = 1; this.worldLP.frequency.cancelScheduledValues(this.clock()); this.worldLP.frequency.setTargetAtTime(18000, this.clock(), 0.1);
    }
    this.syncCrowd(level < 0.05 ? 0.3 : 0.8);
  }
  /** Тимчасово підняти або опустити напругу: tension повертається сам у track. */
  lift(amount, sec) { this.boost = amount; this.boostUntil = this.clock() + sec; this.syncCrowd(0.5); }
  /** Записати цілі шарів. Викликається подіями й 4 рази на секунду з track, не кожен кадр. */
  syncCrowd(tc = 0.8) {
    const c = this.ctx;
    if (!c) return;
    const t = this.clock(), on = this.level > 0.005 && (S.settings.sfx || this.forceOn);
    if (!on) { for (const k in this.layers) this.layers[k].gain.gain.setTargetAtTime(0, t, tc); this.synthGain.gain.setTargetAtTime(0, t, tc); this.stopTimer(); return; }
    const boost = this.boostUntil > this.clock() ? this.boost : 0, ten = clamp01(this.tension + boost);
    const lv = this.level * this.duck, hasBed = this.bank.has('crowd-bed');
    this.ensureLayer('crowd-bed'); this.ensureLayer('bed2'); this.ensureLayer('crowd-tense');
    const bed = hasBed ? lv * BED * (1 - 0.3 * ten) : 0;
    this.layers['crowd-bed'].gain.gain.setTargetAtTime(bed * (this.lite ? 1 : 0.86), t, tc);
    this.layers.bed2.gain.gain.setTargetAtTime(bed * this.bed2Mix, t, tc);
    this.layers['crowd-tense'].gain.gain.setTargetAtTime(this.bank.has('crowd-tense') ? lv * TENSE * ten * ten : 0, t, tc);
    const chant = this.bank.has('crowd-chant') ? lv * CHANT * this.chantLv * (1 - 0.6 * ten) : 0;
    if (chant > 0.001) this.ensureLayer('crowd-chant');
    this.layers['crowd-chant'].gain.gain.setTargetAtTime(chant, t, tc);
    // шум лише поки немає запису
    this.ensureSynth(!hasBed);
    this.synthGain.gain.setTargetAtTime(hasBed ? 0 : lv * 0.09, t, tc);
  }
  /** Запустити петлю, якщо є запис. Зупинені петлі не їдять процесор, тож у меню їх немає. */
  ensureLayer(key) {
    const L = this.layers[key], slot = key === 'bed2' ? 'crowd-bed' : key;
    if (L.v || !this.bank.has(slot) || (key === 'bed2' && (this.lite || this.bank.count(slot) < 2))) return;
    this.startVoice(key, this.bank.pick(slot, () => this.rnd()), 0);
  }
  /** Голос петлі: свій варіант, своє місце в ній і трохи інша швидкість, тож той самий запис щоразу лягає інакше. */
  startVoice(key, buf, fade) {
    const L = this.layers[key], slot = key === 'bed2' ? 'crowd-bed' : key, c = this.ctx, t = this.clock(), len = LOOP_LEN[slot];
    const s = c.createBufferSource(), g = c.createGain();
    s.buffer = buf; s.loop = true; s.loopStart = MARGIN; s.loopEnd = MARGIN + len; s.playbackRate.value = this.jit(0.025);
    if (fade) { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + fade); }
    s.connect(g); g.connect(L.gain); s.start(t, MARGIN + this.rnd() * len);
    L.v = { s, g, buf };
  }
  dropVoice(L, fade) {
    const v = L.v, t = this.clock();
    if (!v) return;
    L.v = null;
    if (fade) { v.g.gain.setValueAtTime(1, t); v.g.gain.linearRampToValueAtTime(0, t + fade); }
    try { v.s.stop(t + fade + 0.05); } catch (_) { /* ignore */ }
  }
  /** Плавно замінити один із двох варіантів гулу. Рівень другого теж новий: натовп живе хвилями, а не петлею. */
  rotateBed() {
    const key = this.lite || this.rotWhich ? 'crowd-bed' : 'bed2', L = this.layers[key], t = this.clock();
    if (!L.v) { this.nextRot = t + 8; return; }
    const buf = this.bank.take('crowd-bed', L.v.buf, () => this.rnd());
    if (!buf) { this.nextRot = t + 6; return; }
    this.rotWhich = !this.rotWhich;
    this.dropVoice(L, 7); this.startVoice(key, buf, 7);
    this.nextRot = t + 30 + this.rnd() * 35;
    this.bed2Mix = 0.3 + this.rnd() * 0.32;
    this.syncCrowd(2.5);
  }
  /** Змінити варіант петлі, поки її не чути: так у пам'яті завжди лише один її запис. */
  swapQuiet(key) {
    const L = this.layers[key];
    this.bank.swap(key, () => this.rnd()).then((buf) => {
      if (!buf || this.layers[key] !== L || this.level <= 0.005) return;
      this.dropVoice(L, 0); this.startVoice(key, buf, 0);
    });
  }
  /** Зміна поєднань, 4 рази на секунду з track. */
  tick() {
    const t = this.clock();
    if (this.level <= 0.005) return;
    if (!this.nextRot) this.nextRot = t + 25 + this.rnd() * 20;
    if (t > this.nextRot) this.rotateBed();
    if (this.tension < 0.04 && t > this.nextTense) { this.nextTense = t + 40 + this.rnd() * 40; this.swapQuiet('crowd-tense'); }
    if (this.chantLv < 0.01 && t > this.nextChant) { this.nextChant = t + 30 + this.rnd() * 30; this.swapQuiet('crowd-chant'); }
  }
  ensureSynth(want) {
    if (want && !this.synthSrc) {
      const c = this.ctx, s = c.createBufferSource(); s.buffer = this.noise; s.loop = true;
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 620; bp.Q.value = 0.45;
      s.connect(bp); bp.connect(this.synthGain); s.start(); this.synthSrc = s;
    } else if (!want && this.synthSrc) { const s = this.synthSrc; this.synthSrc = null; try { s.stop(this.clock() + 1.5); } catch (_) { /* ignore */ } }
  }
  /** Зупинити петлі через кілька секунд після затихання (вихід із матчу, вимкнений звук). */
  stopTimer() {
    if (this.stopT || this.offline) return;
    this.stopT = setTimeout(() => { this.stopT = 0; if (this.level <= 0.005 || !S.settings.sfx) this.stopLayers(); }, 2500);
  }
  stopLayers() {
    for (const k in this.layers) this.dropVoice(this.layers[k], 0);
    this.ensureSynth(false);
  }
  slotReady(slot) { if (slot === 'crowd-bed' || slot === 'crowd-tense' || slot === 'crowd-chant') this.syncCrowd(1.2); }
  /** Хор на трибунах: Stands дає обвідну, ми беремо її раз на 250 мс разом із track. */
  chant(env) { this.chantLv = env; }

  /**
   * Кожен кадр матчу: де м'яч відносно камери. Без алокацій. tx, tz — напрям погляду камери (не нормований). L — половина поля.
   * Панорама й віддаленість читають звуки м'яча, а напругу натовпу пишемо лише 4 рази на секунду.
   */
  track(bx, bz, bvx, bvz, cx, cz, tx, tz, L) {
    const dx = bx - cx, dz = bz - cz, n = Math.hypot(tx, tz) || 1, rx = -tz / n, rz = tx / n;
    const side = dx * rx + dz * rz, d = Math.hypot(dx, dz), p = side / 38;
    this.pan = p < -0.55 ? -0.55 : p > 0.55 ? 0.55 : p;
    const f = (d - 22) / 48; this.far = f < 0 ? 0 : f > 1 ? 1 : f;
    if (!this.ctx) return;
    const t = this.clock();
    if (t - this.tTick < 0.25) return;
    this.tTick = t;
    const near = clamp01((Math.abs(bx) / L - 0.55) / 0.4), run = clamp01(Math.hypot(bvx, bvz) / 22);
    const want = near * (0.55 + 0.45 * run);
    this.tension += (want - this.tension) * 0.22;      // дуже плавно: натовп реагує на тенденцію, а не на кожен пас
    this.tick();
    this.syncCrowd(1.1);
  }

  // --- музика меню. У матчі її немає свідомо: там звучить стадіон ---
  music(mode) {
    this.want = mode;
    if (mode === 'menu' && this.level > 0) this.crowd(0);   // після вступу натовп не лишається гудіти під меню
    if (!this.ctx || (mode === this.musicMode && (this.timer || mode !== 'menu'))) return;
    this.musicMode = mode;
    clearInterval(this.timer); this.timer = 0;
    const t = this.ctx.currentTime;
    this.musMix.gain.setTargetAtTime(mode === 'menu' ? MUS : 0, t, mode === 'menu' ? 0.8 : 0.35);
    if (mode !== 'menu') return;
    this.step = 0; this.nextT = t + 0.1;
    this.timer = setInterval(() => this.schedule(), 300);
    this.schedule();
  }
  /** Один акорд на 4 такти. Вузли створюємо лише наперед на ~1 с; вимкнена музика чи зупинений контекст не створюють нічого (CR-13). */
  schedule() {
    const c = this.ctx;
    if (!c || c.state !== 'running' || !(S.settings.music || this.forceOn)) { if (c) this.nextT = Math.max(this.nextT, c.currentTime); return; }
    while (this.nextT < c.currentTime + 1) this.playBar(this.nextT - c.currentTime);
  }
  /** Такт (4 долі по 0.86 с): у міжгір'ї акордів рідкі м'які ноти клавіш; style міняє лише сторінка прослуховування. */
  playBar(when) {
    const beat = 0.86, bar = this.step, chordI = Math.floor(bar / 4) % PROG.length, ch = PROG[chordI];
    if (bar % 4 === 0) this.padChord(ch, when, beat * 16);
    if (this.musicStyle !== 'pad') {
      for (let b = 0; b < 4; b++) {
        if (this.rnd() < (b === 0 ? 0.75 : 0.38)) {
          const n = ch[1 + Math.floor(this.rnd() * (ch.length - 1))] * (this.rnd() < 0.35 ? 2 : 1);
          this.key(n, when + b * beat + (this.rnd() - 0.5) * 0.03, 0.12 + this.rnd() * 0.06);
        }
      }
    }
    this.step++; this.nextT += beat * 4;
  }
  /** Теплий пад: дві розстроєні трикутні на ноту під спільним низьким фільтром, із повільною атакою. */
  padChord(ch, when, dur) {
    const c = this.ctx, t = c.currentTime + when;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.3;
    lp.frequency.setValueAtTime(520, t); lp.frequency.linearRampToValueAtTime(820, t + dur * 0.5); lp.frequency.linearRampToValueAtTime(480, t + dur);
    const g = c.createGain(), r = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.075, t + 2.6);
    g.gain.setValueAtTime(0.075, t + dur - 2.2); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.6);
    r.gain.value = 0.35;
    lp.connect(g); g.connect(this.musMix); g.connect(r); r.connect(this.revIn);
    for (let i = 0; i < ch.length; i++) {
      for (const d of [-5, 5]) {
        const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = ch[i]; o.detune.value = d;
        o.connect(lp); o.start(t); o.stop(t + dur + 0.7);
      }
    }
  }
  /** Клавіша з повстю: основний тон згасає довго, обертони швидко, м'який удар молоточка. */
  key(f, when, vol) {
    const c = this.ctx, t = c.currentTime + when;
    const g = c.createGain(), r = c.createGain(); r.gain.value = 0.42;
    g.connect(this.musMix); g.connect(r); r.connect(this.revIn);
    const part = [[1, 1, 2.4], [2, 0.32, 1.1], [3, 0.1, 0.5], [4.01, 0.04, 0.24]];
    for (let i = 0; i < part.length; i++) {
      const o = c.createOscillator(), e = c.createGain(), P = part[i];
      o.frequency.value = f * P[0];
      e.gain.setValueAtTime(0.0001, t); e.gain.exponentialRampToValueAtTime(vol * P[1], t + 0.018);
      e.gain.exponentialRampToValueAtTime(0.0001, t + P[2]);
      o.connect(e); e.connect(g); o.start(t); o.stop(t + P[2] + 0.05);
    }
  }
}

// Fmaj7 → Am7 → Dm9 → Csus/G: без «ввідного» тяжіння, тож не набридає й не потребує розв'язки
const PROG = [
  [87.31, 174.61, 261.63, 329.63, 440],
  [110, 164.81, 261.63, 329.63, 392],
  [73.42, 146.83, 261.63, 349.23, 440],
  [98, 146.83, 261.63, 293.66, 392],
];

export const audio = new AudioEngine();

export function vibrate(ms) {
  if (!S.settings.haptics || tgHaptic(ms)) return;
  if (navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) { /* ignore */ } }
}
