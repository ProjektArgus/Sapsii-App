#!/usr/bin/env sh
set -eu

[ "$(id -u)" -eq 0 ] || { echo "Run as root" >&2; exit 1; }
SCRIPT_DIR=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
ROOT=${SAPSII_ROOT:-/opt/sapsii}
ENV_DIR=${SAPSII_ENV_DIR:-/etc/sapsii}

command -v docker >/dev/null
command -v curl >/dev/null
command -v python3 >/dev/null
command -v flock >/dev/null

mkdir -p "$ROOT/deployer" "$ROOT/releases" "$ROOT/state" "$ENV_DIR"
install -m 755 "$SCRIPT_DIR/pull-deploy.sh" "$ROOT/deployer/pull-deploy.sh"
install -m 644 "$SCRIPT_DIR/systemd/sapsii-deploy.service" /etc/systemd/system/sapsii-deploy.service
install -m 644 "$SCRIPT_DIR/systemd/sapsii-deploy.timer" /etc/systemd/system/sapsii-deploy.timer
install -m 644 "$SCRIPT_DIR/systemd/sapsii-firewall.service" /etc/systemd/system/sapsii-firewall.service
install -m 600 "$SCRIPT_DIR/sapsii-filter.nft" "$ENV_DIR/sapsii-filter.nft"
if [ ! -f "$ENV_DIR/sapsii.env" ]; then
  install -m 600 "$SCRIPT_DIR/.env.example" "$ENV_DIR/sapsii.env"
  echo "Populate $ENV_DIR/sapsii.env before enabling the timer."
fi
systemctl daemon-reload
printf '%s\n' \
  "Deployer installed but not started." \
  "After configuring Supabase, the Sapsii database, GHCR login, and $ENV_DIR/sapsii.env:" \
  "  systemctl enable --now sapsii-firewall.service" \
  "  systemctl start sapsii-deploy.service" \
  "  systemctl enable --now sapsii-deploy.timer"
