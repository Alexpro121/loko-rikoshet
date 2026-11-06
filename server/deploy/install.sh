#!/usr/bin/env bash
# Встановлення сервера гри на Ubuntu (24.04 чи новіша) поруч із ботом LOKO. Повторний запуск безпечний.
#
#   sudo DOMAIN=api.приклад.ua GAME_ORIGIN=https://alexpro121.github.io bash install.sh
#
# Перший запуск створює /etc/loko-game/env і зупиняється: впишіть туди BOT_TOKEN бота гри й запустіть ще раз.
# Далі DOMAIN і GAME_ORIGIN беруться з env, тож update.sh просто запускає цей скрипт знову.
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
RELAY_MAX=49359
SWAP_FILE=/swapfile

say() { printf '\n== %s\n' "$*"; }
[ "$(id -u)" -eq 0 ] || { echo "Потрібні права root"; exit 1; }

say "Налаштування"
install -d -m 750 "$ETC"
if [ ! -f "$ENV_FILE" ]; then
  : "${DOMAIN:?Вкажіть DOMAIN, наприклад api.приклад.ua (DNS має вказувати на цей сервер)}"
  : "${GAME_ORIGIN:?Вкажіть GAME_ORIGIN, адресу сторінки гри, наприклад https://alexpro121.github.io}"
  cat > "$ENV_FILE" <<EOF
# Секрети сервера гри. Файл не потрапляє в git.
DOMAIN=$DOMAIN
BOT_TOKEN=
ALLOWED_ORIGINS=$GAME_ORIGIN
TURN_SECRET=$(openssl rand -hex 32)
TURN_URLS=turn:$DOMAIN:3478?transport=udp,turn:$DOMAIN:3478?transport=tcp
DATA_DIR=$APP/data
PORT=8787
PEER_PORT=9000
# Копії бази в Backblaze B2 чи Cloudflare R2 (необов'язково): заповніть тут або в $ETC/backup.env, і install.sh налаштує Litestream
LITESTREAM_BUCKET=
LITESTREAM_ENDPOINT=
LITESTREAM_ACCESS_KEY_ID=
LITESTREAM_SECRET_ACCESS_KEY=
EOF
  chmod 640 "$ENV_FILE"
fi
BACKUP_ENV="$ETC/backup.env"              # ключі сховища копій (B2 чи R2) окремо: лише root, гра їх не бачить
# shellcheck disable=SC1090
set -a; . "$ENV_FILE"; [ -f "$BACKUP_ENV" ] && . "$BACKUP_ENV"; set +a
: "${DOMAIN:?У $ENV_FILE немає DOMAIN}"
if [ -z "${BOT_TOKEN:-}" ]; then
  echo "Впишіть BOT_TOKEN бота гри в $ENV_FILE і запустіть скрипт ще раз."
  exit 2
fi

if [ -z "${SKIP_APT:-}" ]; then
  say "Пакети: Node.js $NODE_MAJOR, Caddy, coturn"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -q
  apt-get install -y -q ca-certificates curl gnupg git openssl debian-keyring debian-archive-keyring apt-transport-https coturn
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
fi

say "Запас пам'яті (на користь і боту LOKO)"
# swap на 1 ГБ: без нього рідкісний сплеск пам'яті одразу вбиває процес, зі swap лише трохи пригальмовує
if ! swapon --show | grep -q .; then
  [ -f "$SWAP_FILE" ] || { fallocate -l 1G "$SWAP_FILE"; chmod 600 "$SWAP_FILE"; mkswap -q "$SWAP_FILE"; }
  swapon "$SWAP_FILE"
  grep -q "^$SWAP_FILE " /etc/fstab || echo "$SWAP_FILE none swap sw 0 0" >> /etc/fstab
fi
echo 'vm.swappiness=10' > /etc/sysctl.d/90-loko-swap.conf
sysctl -q -p /etc/sysctl.d/90-loko-swap.conf

say "Код гри"
id "$USER_NAME" >/dev/null 2>&1 || useradd --system --home "$APP" --shell /usr/sbin/nologin "$USER_NAME"
install -d -o "$USER_NAME" -g "$USER_NAME" "$APP" "$APP/data"
if [ ! -d "$APP/app/.git" ]; then
  sudo -u "$USER_NAME" git clone -q --depth 1 --branch "$BRANCH" "$REPO" "$APP/app"
else
  sudo -u "$USER_NAME" git -C "$APP/app" fetch -q --depth 1 origin "$BRANCH"
  sudo -u "$USER_NAME" git -C "$APP/app" reset -q --hard "origin/$BRANCH"
fi
(cd "$APP/app/server" && sudo -u "$USER_NAME" npm ci --omit=dev --no-audit --no-fund --loglevel=error)
chgrp "$USER_NAME" "$ENV_FILE"
DEPLOY="$APP/app/server/deploy"

say "Журнал і автооновлення пакетів"
install -d /etc/systemd/journald.conf.d
install -m 644 "$DEPLOY/journald.conf" /etc/systemd/journald.conf.d/loko.conf
systemctl restart systemd-journald
# Node.js і Caddy зі сторонніх сховищ теж отримують виправлення безпеки самі, як і решта системи
echo 'Unattended-Upgrade::Origins-Pattern { "site=deb.nodesource.com"; "site=dl.cloudsmith.io"; };' > /etc/apt/apt.conf.d/52loko-game-upgrades

say "Служба loko-game"
install -m 644 "$DEPLOY/loko-game.service" /etc/systemd/system/loko-game.service
for svc in coturn caddy litestream; do
  install -d "/etc/systemd/system/$svc.service.d"
  install -m 644 "$DEPLOY/limits.conf" "/etc/systemd/system/$svc.service.d/loko-limits.conf"
done
systemctl daemon-reload
systemctl enable -q loko-game
systemctl restart loko-game

say "Ретранслятор coturn"
deny_self=""
for ip in $(hostname -I); do deny_self+="denied-peer-ip=$ip"$'\n'; done
sed -e "s|@DOMAIN@|$DOMAIN|g" -e "s|@TURN_SECRET@|$TURN_SECRET|g" -e "s|@MIN@|$RELAY_MIN|g" -e "s|@MAX@|$RELAY_MAX|g" \
  "$DEPLOY/turnserver.conf" | awk -v d="$deny_self" '{ if ($0 == "@DENY_SELF@") printf "%s", d; else print }' > /etc/turnserver.conf
chmod 640 /etc/turnserver.conf
chgrp turnserver /etc/turnserver.conf 2>/dev/null || true
# старіші пакети coturn не стартують без цього прапора
[ -f /etc/default/coturn ] && sed -i 's/^#\?TURNSERVER_ENABLED=.*/TURNSERVER_ENABLED=1/' /etc/default/coturn
systemctl enable -q coturn
systemctl restart coturn

say "HTTPS: Caddy"
sed -e "s|@DOMAIN@|$DOMAIN|g" "$DEPLOY/Caddyfile" > /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null
systemctl enable -q caddy
systemctl reload caddy 2>/dev/null || systemctl restart caddy

say "Фаєрвол"
if command -v ufw >/dev/null; then
  ufw allow 80/tcp >/dev/null
  ufw allow 443/tcp >/dev/null
  ufw allow 3478 >/dev/null
  ufw allow "$RELAY_MIN:$RELAY_MAX/udp" >/dev/null
  ufw delete allow 49160:49200/udp >/dev/null 2>&1 || true   # вужчий діапазон першої версії
fi

if [ -n "${LITESTREAM_BUCKET:-}" ]; then
  say "Копії бази: Litestream"
  if ! command -v litestream >/dev/null; then
    deb="/tmp/litestream-$LITESTREAM_VERSION.deb"
    arch=$(dpkg --print-architecture)
    curl -fsSL -o "$deb" "https://github.com/benbjohnson/litestream/releases/download/v$LITESTREAM_VERSION/litestream-v$LITESTREAM_VERSION-linux-$arch.deb"
    dpkg -i "$deb"
    rm -f "$deb"
  fi
  sed -e "s|@DB@|$DATA_DIR/game.db|g" -e "s|@BUCKET@|$LITESTREAM_BUCKET|g" -e "s|@ENDPOINT@|$LITESTREAM_ENDPOINT|g" \
    "$DEPLOY/litestream.yml" > /etc/litestream.yml
  # Litestream читає ключі зі своїх файлів оточення: systemd відкриває їх від root ще до переходу на користувача гри
  printf '[Service]\nEnvironmentFile=%s\nEnvironmentFile=-%s\nUser=%s\n' "$ENV_FILE" "$BACKUP_ENV" "$USER_NAME" > /etc/systemd/system/litestream.service.d/env.conf
  systemctl daemon-reload
  systemctl enable -q litestream
  systemctl restart litestream
fi

say "Перевірка"
sleep 3
systemctl is-active --quiet loko-game && echo "loko-game працює" || { journalctl -u loko-game -n 30 --no-pager; exit 1; }
systemctl is-active --quiet coturn && echo "coturn працює" || { journalctl -u coturn -n 30 --no-pager; exit 1; }
curl -fsS "http://127.0.0.1:${PORT}/health" && echo
echo "Готово ($(git -C "$APP/app" log --oneline -1)). Перевірте ззовні: https://$DOMAIN/health"
