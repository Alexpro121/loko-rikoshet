# Сервер LOKO RUSH

Сервер гри для онлайн-режиму: вхід через Telegram, профіль онлайн-клубу в базі, власний сервер PeerJS і тимчасові паролі до ретранслятора coturn. Сторінки гри цей сервер не роздає: вони й далі на GitHub Pages.

Що вже є:

- `POST /auth/telegram` перевіряє підпис Telegram (`initData`) токеном бота гри й видає сесію на 30 днів.
- `GET /me` повертає гравця і його онлайн-клуб.
- `POST /club` створює клуб за правилами гри (`newClub` із `src/online/profile.js`); повторний виклик повертає наявний. Монети записуються в журнал `coin_ledger`.
- `GET /turn` видає пароль до coturn на 6 годин лише гравцеві, що увійшов.
- `/p/` (через Caddy) це сервер PeerJS, що знайомить гравців онлайн-матчу.

Чого ще немає: дій із клубом на сервері (тренування, скаут, нагороди за матч), підтвердження результату обома гравцями, ринку. Гра поки тримає клуб у себе, як і раніше.

## Локально

Потрібен Node.js 24 (база це вбудований `node:sqlite`).

```bash
cd server
npm install
npm test
BOT_TOKEN=123:abc ALLOWED_ORIGINS=http://localhost:5173 npm start
```

## На сервері

Потрібні домен або піддомен, що вказує на сервер, і бот гри в BotFather.

```bash
curl -fsSL https://raw.githubusercontent.com/Alexpro121/loko-rikoshet/main/server/deploy/install.sh -o install.sh
sudo DOMAIN=api.приклад.ua GAME_ORIGIN=https://alexpro121.github.io bash install.sh
```

Перший запуск створить `/etc/loko-game/env` і зупиниться: впишіть `BOT_TOKEN` і запустіть ще раз. Скрипт ставить Node.js, Caddy, coturn, службу `loko-game` з обмеженням пам'яті й відкриває у фаєрволі 80, 443, 3478 і діапазон портів ретранслятора. Якщо в `env` заповнено `LITESTREAM_*`, він ще й налаштує безперервну копію бази в Cloudflare R2 чи Backblaze B2.

Оновлення до свіжого коду:

```bash
sudo bash /opt/loko-game/app/server/deploy/update.sh
```

Після запуску впишіть адресу сервера в `SERVER_URL` у `src/online/server.js` і опублікуйте гру: до того гра працює з публічним PeerJS, як раніше.

## Файли

| Файл | Що робить |
|---|---|
| `src/server.js` | Запуск API і PeerJS |
| `src/app.js` | Маршрути API, сесії, CORS, обмеження частоти входу |
| `src/telegram.js` | Перевірка підпису Telegram |
| `src/turn.js` | Паролі coturn |
| `src/db.js` | База й міграції схеми |
| `src/rules.js` | Правила гри з `src/online/profile.js` із заглушками браузера |
| `src/config.js` | Налаштування з оточення |
| `deploy/` | Встановлення, оновлення, служба, Caddy, coturn, Litestream |
