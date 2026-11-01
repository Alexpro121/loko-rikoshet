// Tactics: екран складу для кар'єри й онлайн-клубу. Вибір схеми, поле з фішками, запас, обмін місцями, гравець на весь зріст.
// Що саме показувати й як міняти склад, вирішує адаптер кожного режиму.
import { audio } from '../core/audio.js';
import { FORMATIONS } from '../config.js';
import { mountTurntable } from './portrait.js';
import { esc } from '../online/profile.js';

export const formName = (f) => String(f).split('').join('-');
/** Висота ролі на полі у відсотках (0 свої ворота, 100 чужі). */
const DEPTH = { GK: 9, CB: 20, LB: 25, RB: 25, DM: 39, CM: 50, LM: 52, RM: 52, AM: 63, LW: 72, RW: 72, ST: 84 };
const lastWord = (n) => String(n).trim().split(' ').slice(-1)[0];

/**
 * a (адаптер): list() усі гравці (перші 11 — основа), forms, form(), setForm(f), swap(i, j), canSwap(i), col(e), portrait(e),
 * view(e) → { look, key }, role(e, i), detail(e, i), defaultSel(), render(), changed(), toast(t), host(), renderer(), deny.
 */
export class Tactics {
  constructor(a) { this.a = a; this.sel = null; this.seen = -1; this.swapFrom = null; this.formOpen = false; }
  pos(i) {
    const r = i === 0 ? { name: 'GK', v: 0 } : (FORMATIONS[this.a.form()] || FORMATIONS['433'])[i - 1];
    return `left:${(50 + r.v * 41).toFixed(1)}%;bottom:${DEPTH[r.name] || 50}%`;
  }
  token(e, i, bench) {
    const a = this.a;
    return `<button class="on-tk ${bench ? 'bench' : ''} ${i === this.sel ? 'on' : ''}" data-hid="${esc(e.id)}" data-act="tk-sel:${i}" style="${bench ? '' : this.pos(i) + ';'}--rc:${a.col(e)}"><i class="on-tk-f"><img data-pi alt=""/></i><b>${a.ovr(e)}</b><span>${esc(lastWord(e.name))}</span></button>`;
  }
  formsHtml() { return `<small>Схема</small><b>${formName(this.a.form())}</b><span>Змінити</span>`; }
  /** Усі схеми одразу, без прокрутки: кожна з міні-полем. Вікно лягає поверх лівої колонки й не забирає в поля висоти. */
  popHtml() {
    const a = this.a, dot = (v, name) => `<circle cx="${(15 + v * 12.3).toFixed(1)}" cy="${(40 - DEPTH[name] * 0.4).toFixed(1)}" r="1.9"/>`;
    return a.forms.map((f) => `<button class="${a.form() === f ? 'on' : ''}" data-act="tk-form:${f}"><svg viewBox="0 0 30 40" aria-hidden="true">${dot(0, 'GK')}${FORMATIONS[f].map((r) => dot(r.v, r.name)).join('')}</svg><b>${formName(f)}</b></button>`).join('') + `<button class="on-fclose" data-act="tk-fopen" aria-label="Закрити вибір схеми">${'✕'}</button>`;
  }
  swapHtml() {
    if (!this.a.canSwap(this.sel)) return `<small class="on-note">${this.a.deny}</small>`;
    const on = this.swapFrom != null;
    return `<button class="on-dice ${on ? 'lit' : ''}" data-act="tk-swap"><b>${on ? 'ТОРКНИСЬ ІНШОГО' : 'ПОМІНЯТИ МІСЦЯМИ'}</b></button>`;
  }
  ttSig(e, i) { return `${this.a.view(e).key}|${this.a.ovr(e)}|${this.a.role(e, i)}`; }
  ttHtml(e, i) {
    const a = this.a;
    return `<div class="on-tt-s" style="--rc:${a.col(e)}" data-ttk="${esc(this.ttSig(e, i))}"><i class="on-rays"></i><i class="on-tt-f"></i><canvas data-tt></canvas><i class="on-ovr big">${a.ovr(e)}</i><span class="on-tt-n">№${e.num}</span></div><div class="on-tt-c"><b>${esc(e.name)}</b><small>${a.role(e, i)}</small></div>`;
  }
  html() {
    const a = this.a, L = a.list();
    if (this.sel == null || !L[this.sel]) this.sel = a.defaultSel();
    const fresh = this.seen !== this.sel; this.seen = this.sel;
    const e = L[this.sel], bench = L.slice(11);
    return `<div class="on-heroes">
      <section class="on-tac on-a">
        <button class="on-formb" data-forms data-act="tk-fopen">${this.formsHtml()}</button>
        <div class="on-fpop" data-fpop ${this.formOpen ? '' : 'hidden'}>${this.popHtml()}</div>
        <div class="on-pitch ${this.swapFrom != null ? 'swap' : ''}" data-pitch><i class="on-p-mid"></i><i class="on-p-box"></i><i class="on-p-box up"></i>${L.slice(0, 11).map((p, i) => this.token(p, i, false)).join('')}</div>
        ${bench.length ? `<div class="on-bench" data-bench><small>Запас</small>${bench.map((p, j) => this.token(p, 11 + j, true)).join('')}</div>` : ''}
        <div class="on-fe-row" data-swapb>${this.swapHtml()}</div>
      </section>
      <section class="on-tt on-a" style="--d:1" data-tts>${this.ttHtml(e, this.sel)}</section>
      <div class="sq-d on-a ${fresh ? 'on-flip' : ''}" style="--d:2;--rc:${a.col(e)}" data-hdetail>${a.detail(e, this.sel)}</div>
    </div>`;
  }
  /** Після перемальовування панелі: живий перегляд сідає на своє місце. */
  afterRender() {
    this.fill();
    const ph = this.a.host().querySelector('canvas[data-tt]'), e = this.a.list()[this.sel];
    if (!ph || !e) return;
    const v = this.a.view(e); mountTurntable(ph, v.look, v.key, () => this.a.portrait(e));
  }
  /** Обличчя фішок: готові одразу, нові малюються частинами між кадрами, щоб відкриття панелі на телефоні не підвисало. */
  fill() {
    const a = this.a, L = a.list(), imgs = a.host().querySelectorAll('img[data-pi]'), t0 = performance.now();
    for (const img of imgs) {
      if (performance.now() - t0 > 8) { requestAnimationFrame(() => this.fill()); return; }
      const e = L.find((p) => p.id === img.closest('[data-hid]').dataset.hid);
      img.removeAttribute('data-pi'); if (e) img.src = a.portrait(e);
    }
  }
  /** Вибір, обмін і схема без перемальовування панелі: фішки їдуть полем на нові місця, а не з'являються заново. */
  patch(newSel) {
    const a = this.a, P = a.host(), L = a.list(), pitch = P.querySelector('[data-pitch]');
    if (!pitch) return a.render();
    L.forEach((e, i) => {
      const t = P.querySelector(`[data-hid="${e.id}"]`); if (!t) return;
      if (i < 11) t.setAttribute('style', `${this.pos(i)};--rc:${a.col(e)}`);
      t.dataset.act = 'tk-sel:' + i; t.classList.toggle('on', i === this.sel); t.querySelector('b').textContent = a.ovr(e);
    });
    pitch.classList.toggle('swap', this.swapFrom != null);
    P.querySelector('[data-forms]').innerHTML = this.formsHtml();
    const pop = P.querySelector('[data-fpop]'); pop.innerHTML = this.popHtml(); pop.hidden = !this.formOpen;
    P.querySelector('[data-swapb]').innerHTML = this.swapHtml();
    const e = L[this.sel], tts = P.querySelector('[data-tts]'), cur = tts.querySelector('[data-ttk]');
    if (!cur || cur.dataset.ttk !== this.ttSig(e, this.sel)) { tts.innerHTML = this.ttHtml(e, this.sel); this.afterRender(); }
    const d = P.querySelector('[data-hdetail]'); d.innerHTML = a.detail(e, this.sel); d.style.setProperty('--rc', a.col(e));
    if (newSel) { d.scrollTop = 0; d.classList.remove('on-a', 'on-flip'); void d.offsetWidth; d.classList.add('on-flip'); }
  }
  act(cmd) {
    const a = this.a, [k, x] = cmd.split(':');
    if (k === 'tk-fopen') { audio.click(); this.formOpen = !this.formOpen; this.swapFrom = null; return this.patch(false); }
    if (k === 'tk-form') { this.formOpen = false; if (a.setForm(x)) { audio.click(); this.swapFrom = null; a.changed(); } return this.patch(false); }
    if (k === 'tk-swap') { audio.click(); this.swapFrom = this.swapFrom == null ? this.sel : null; return this.patch(false); }
    const i = +x, from = this.swapFrom;
    if (from == null) { audio.click(); this.sel = this.seen = i; return this.patch(true); }
    this.swapFrom = null;
    if (i === from) { audio.back(); return this.patch(false); }
    if (!a.swap(from, i)) { audio.deny(); a.toast(a.deny); return this.patch(false); }
    audio.buy(); this.sel = this.seen = i; a.changed();
    return from >= 11 || i >= 11 ? a.render() : this.patch(true);        // запас змінив склад фішок: перемальовуємо
  }
}
