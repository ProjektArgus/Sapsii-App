#!/usr/bin/env sh
set -eu

ROOT=${SAPSII_ROOT:-/opt/sapsii}
SUPABASE_DIR=${SUPABASE_SOURCE_DIR:-$ROOT/supabase-src}/docker
APP_DIR=${SAPSII_APP_DIR:-$ROOT/app}

[ -f "$SUPABASE_DIR/.env" ] || { echo "Run deploy/install-supabase.sh first" >&2; exit 1; }
[ -f "$APP_DIR/deploy/supabase.override.yaml" ] || { echo "Sapsii checkout missing at $APP_DIR" >&2; exit 1; }

docker network inspect sapsii-supabase-gateway >/dev/null 2>&1 || docker network create sapsii-supabase-gateway
docker network inspect sapsii-supabase-database >/dev/null 2>&1 || docker network create sapsii-supabase-database

docker compose \
  --project-directory "$SUPABASE_DIR" \
  --env-file "$SUPABASE_DIR/.env" \
  -f "$SUPABASE_DIR/docker-compose.yml" \
  -f "$APP_DIR/deploy/supabase.override.yaml" \
  up -d

echo "Supabase started at pinned revision $(cat "$APP_DIR/deploy/SUPABASE_VERSION")"
