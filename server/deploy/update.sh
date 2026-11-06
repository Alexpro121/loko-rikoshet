#!/usr/bin/env bash
# Оновлення сервера гри до свіжого коду з гілки (за замовчуванням main).
#   sudo bash /opt/loko-game/app/server/deploy/update.sh
set -euo pipefail
APP=/opt/loko-game
BRANCH="${BRANCH:-main}"
[ "$(id -u)" -eq 0 ] || { echo "Потрібні права root"; exit 1; }
sudo -u loko-game git -C "$APP/app" fetch -q origin "$BRANCH"
sudo -u loko-game git -C "$APP/app" reset -q --hard "origin/$BRANCH"
(cd "$APP/app/server" && sudo -u loko-game npm ci --omit=dev --no-audit --no-fund)
systemctl restart loko-game
sleep 3
systemctl is-active --quiet loko-game && echo "Оновлено: $(git -C "$APP/app" log --oneline -1)" || { journalctl -u loko-game -n 30 --no-pager; exit 1; }
