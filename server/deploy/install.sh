#!/usr/bin/env bash
# Встановлення сервера гри на Ubuntu (24.04) поруч з іншими службами. Повторний запуск безпечний.
#
#   sudo DOMAIN=api.приклад.ua GAME_ORIGIN=https://alexpro121.github.io bash install.sh
#
# Перший запуск створює /etc/loko-game/env і зупиняється: впишіть туди BOT_TOKEN бота гри й запустіть ще раз.
set -euo pipefail

REPO="${REPO:-https://github.com/Alexpro121/loko-rikoshet.git}"
BRANCH="${BRANCH:-main}"
APP=/opt/loko-game
ETC=/etc/loko-game
ENV_FILE="$ETC/env"
USER_NAME=loko-game
NODE_MAJOR=24
LITESTREAM_VERSION=0.3.13
RELAY_MIN=49160
RELAY_MAX=49200

say() { printf '\n== %s\n' "$*"; }
[ "$(id -u)" -eq 0 ] || { echo "Потрібні права root"; exit 1; }
: "${DOMAIN:?Вкажіть DOMAIN, наприклад api.приклад.ua (DNS має вказувати на цей сервер)}"
: "${GAME_ORIGIN:?Вкажіть GAME_ORIGIN, адресу сторінки гри, наприклад https://alexpro121.github.io}"

say "Налаштування"
install -d -m 750 "$ETC"
if [ ! -f "$ENV_FILE" ]; then
  cat > "$ENV_FILE" <<EOF
# Секрети сервера гри. Файл не потрапляє в git.
BOT_TOKEN=
ALLOWED_ORIGINS=$GAME_ORIGIN
TURN_SECRET=$(openssl rand -hex 32)
TURN_URLS=turn:$DOMAIN:3478?transport=udp,turn:$DOMAIN:3478?transport=tcp
DATA_DIR=$APP/data
PORT=8787
PEER_PORT=9000
# Копії бази в Cloudflare R2 чи Backblaze B2 (необов'язково): заповніть, і install.sh налаштує Litestream
LITESTREAM_BUCKET=
LITESTREAM_ENDPOINT=
LITESTREAM_ACCESS_KEY_ID=
LITESTREAM_SECRET_ACCESS_KEY=
EOF
  chmod 640 "$ENV_FILE"
fi
# shellcheck disable=SC1090
set -a; . "$ENV_FILE"; set +a
if [ -z "${BOT_TOKEN:-}" ]; then
  echo "Впишіть BOT_TOKEN бота гри в $ENV_FILE і запустіть скрипт ще раз."
  exit 2
fi

say "Пакети: Node.js $NODE_MAJOR, Caddy, coturn"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q ca-certificates curl gnupg git debian-keyring debian-archive-keyring apt-transport-https coturn
if ! node -v 2>/dev/null | grep -q "^v$NODE_MAJOR\."; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y -q nodejs
fi
if ! command -v caddy >/dev/null; then
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -q
  apt-get install -y -q caddy
fi

say "Код гри"
id "$USER_NAME" >/dev/null 2>&1 || useradd --system --home "$APP" --shell /usr/sbin/nologin "$USER_NAME"
install -d -o "$USER_NAME" -g "$USER_NAME" "$APP" "$APP/data"
if [ ! -d "$APP/app/.git" ]; then
  sudo -u "$USER_NAME" git clone -q --branch "$BRANCH" "$REPO" "$APP/app"
else
  sudo -u "$USER_NAME" git -C "$APP/app" fetch -q origin "$BRANCH"
  sudo -u "$USER_NAME" git -C "$APP/app" reset -q --hard "origin/$BRANCH"
fi
(cd "$APP/app/server" && sudo -u "$USER_NAME" npm ci --omit=dev --no-audit --no-fund)
chgrp "$USER_NAME" "$ENV_FILE"

say "Служба loko-game"
DEPLOY="$APP/app/server/deploy"
install -m 644 "$DEPLOY/loko-game.service" /etc/systemd/system/loko-game.service
systemctl daemon-reload
systemctl enable -q loko-game
systemctl restart loko-game

say "Ретранслятор coturn"
sed -e "s|@DOMAIN@|$DOMAIN|g" -e "s|@TURN_SECRET@|$TURN_SECRET|g" -e "s|@MIN@|$RELAY_MIN|g" -e "s|@MAX@|$RELAY_MAX|g" \
  "$DEPLOY/turnserver.conf" > /etc/turnserver.conf
chmod 640 /etc/turnserver.conf
chgrp turnserver /etc/turnserver.conf 2>/dev/null || true
# старіші пакети coturn не стартують без цього прапора
[ -f /etc/default/coturn ] && sed -i 's/^#\?TURNSERVER_ENABLED=.*/TURNSERVER_ENABLED=1/' /etc/default/coturn
systemctl enable -q coturn
systemctl restart coturn

say "HTTPS: Caddy"
sed -e "s|@DOMAIN@|$DOMAIN|g" "$DEPLOY/Caddyfile" > /etc/caddy/Caddyfile
systemctl reload caddy 2>/dev/null || systemctl restart caddy

say "Фаєрвол"
if command -v ufw >/dev/null; then
  ufw allow 80/tcp >/dev/null
  ufw allow 443/tcp >/dev/null
  ufw allow 3478 >/dev/null
  ufw allow "$RELAY_MIN:$RELAY_MAX/udp" >/dev/null
fi

if [ -n "${LITESTREAM_BUCKET:-}" ]; then
  say "Копії бази: Litestream"
  if ! command -v litestream >/dev/null; then
    deb="/tmp/litestream-$LITESTREAM_VERSION.deb"
    curl -fsSL -o "$deb" "https://github.com/benbjohnson/litestream/releases/download/v$LITESTREAM_VERSION/litestream-v$LITESTREAM_VERSION-linux-amd64.deb"
    dpkg -i "$deb"
  fi
  sed -e "s|@DB@|$DATA_DIR/game.db|g" -e "s|@BUCKET@|$LITESTREAM_BUCKET|g" -e "s|@ENDPOINT@|$LITESTREAM_ENDPOINT|g" \
    "$DEPLOY/litestream.yml" > /etc/litestream.yml
  install -d /etc/systemd/system/litestream.service.d
  printf '[Service]\nEnvironmentFile=%s\nUser=%s\n' "$ENV_FILE" "$USER_NAME" > /etc/systemd/system/litestream.service.d/env.conf
  systemctl daemon-reload
  systemctl enable -q litestream
  systemctl restart litestream
fi

say "Перевірка"
sleep 3
systemctl is-active --quiet loko-game && echo "loko-game працює" || { journalctl -u loko-game -n 30 --no-pager; exit 1; }
curl -fsS "http://127.0.0.1:${PORT}/health" && echo
echo "Готово. Перевірте ззовні: https://$DOMAIN/health"
