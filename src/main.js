import '@fontsource/rubik/cyrillic-600.css';
import '@fontsource/rubik/cyrillic-800.css';
import '@fontsource/rubik/latin-600.css';
import '@fontsource/rubik/latin-800.css';
import './style.css';
import { UI } from './ui/ui.js';
import { Game } from './core/game.js';
import { ensureSquad } from './state/squad.js';

async function boot() {
  try {
    await Promise.race([
      Promise.all([document.fonts.load('800 40px Rubik', 'ЛОКОabc'), document.fonts.load('600 20px Rubik', 'ЛОКОabc')]),
      new Promise((r) => setTimeout(r, 1500)),
    ]);
  } catch (e) { /* шрифт підвантажиться пізніше */ }
  ensureSquad();
  const ui = new UI(document.getElementById('ui'));
  const game = new Game(document.getElementById('gl'), ui);
  window.__loko = game;
}

boot();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
