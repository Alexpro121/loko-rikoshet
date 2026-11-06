#!/usr/bin/env bash
# Оновлення сервера гри до свіжого коду з гілки (за замовчуванням main), разом із налаштуваннями служб.
#   sudo bash /opt/loko-game/app/server/deploy/update.sh
# Спершу підтягує код, потім запускає вже новий install.sh (без apt: пакети оновлює unattended-upgrades).
set -euo pipefail
APP=/opt/loko-game
BRANCH="${BRANCH:-main}"
[ "$(id -u)" -eq 0 ] || { echo "Потрібні права root"; exit 1; }
sudo -u loko-game git -C "$APP/app" fetch -q --depth 1 origin "$BRANCH"
sudo -u loko-game git -C "$APP/app" reset -q --hard "origin/$BRANCH"
SKIP_APT=1 BRANCH="$BRANCH" exec bash "$APP/app/server/deploy/install.sh"
