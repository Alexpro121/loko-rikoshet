import '@fontsource/rubik/cyrillic-600.css';
import '@fontsource/rubik/cyrillic-800.css';
import '@fontsource/rubik/latin-600.css';
import '@fontsource/rubik/latin-800.css';
import './style.css';
import { UI } from './ui/ui.js';
import { Game, gfxFail } from './core/game.js';
import { ensureSquad } from './state/squad.js';
import { OnlineScreen } from './online/screen.js';

async function boot() {
  try {
    await Promise.race([
      Promise.all([document.fonts.load('800 40px Rubik', 'ЛОКОabc'), document.fonts.load('600 20px Rubik', 'ЛОКОabc')]),
      new Promise((r) => setTimeout(r, 1500)),
    ]);
  } catch (e) { /* шрифт підвантажиться пізніше */ }
  ensureSquad();
  const ui = new UI(document.getElementById('ui'));
  let game;
  try { game = new Game(document.getElementById('gl'), ui); }
  catch (e) { console.error(e); gfxFail('Не вдалося запустити графіку. Для гри потрібен WebGL2: онови браузер або увімкни апаратне прискорення.'); return; }
  ui.online = new OnlineScreen(ui, game);
  window.__loko = game;
}

boot();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  addEventListener('load', () => navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).catch(() => {}));
}
