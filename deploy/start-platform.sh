#!/usr/bin/env sh
set -eu

ROOT=${SAPSII_ROOT:-/opt/sapsii}
SUPABASE_DIR=${SUPABASE_SOURCE_DIR:-$ROOT/supabase-src}/docker
APP_DIR=${SAPSII_APP_DIR:-$ROOT/app}

[ -f "$SUPABASE_DIR/.env" ] || { echo "Run deploy/install-supabase.sh first" >&2; exit 1; }
[ -f "$APP_DIR/deploy/supabase.override.yaml" ] || { echo "Sapsii checkout missing at $APP_DIR" >&2; exit 1; }

docker network inspect sapsii-supabase-gateway >/dev/null 2>&1 || docker network create sapsii-supabase-gateway
docker network inspect sapsii-supabase-database >/dev/null 2>&1 || docker network create sapsii-supabase-database

compose_platform() {
  docker compose \
    --project-directory "$SUPABASE_DIR" \
    --env-file "$SUPABASE_DIR/.env" \
    -f "$SUPABASE_DIR/docker-compose.yml" \
    -f "$APP_DIR/deploy/supabase.override.yaml" \
    "$@"
}

# The homelab uplink is a single Wi-Fi connection. Pulling ten images at once
# periodically drops a registry connection and aborts the whole pull, so keep
# the fan-out small and retry a bounded number of times before giving up.
export COMPOSE_PARALLEL_LIMIT="${COMPOSE_PARALLEL_LIMIT:-2}"
attempt=1
while :; do
  if compose_platform pull; then
    break
  fi
  if [ "$attempt" -ge 3 ]; then
    echo "Image pull failed after $attempt attempts" >&2
    exit 1
  fi
  echo "Image pull attempt $attempt failed; retrying" >&2
  attempt=$((attempt + 1))
  sleep 10
done

compose_platform up -d --remove-orphans

echo "Supabase started at pinned revision $(cat "$APP_DIR/deploy/SUPABASE_VERSION")"
