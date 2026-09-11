#!/usr/bin/env sh
set -eu

ROOT=${SAPSII_ROOT:-/opt/sapsii}
SOURCE_DIR=${SUPABASE_SOURCE_DIR:-$ROOT/supabase-src}
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REF=$(tr -d '\r\n' < "$SCRIPT_DIR/SUPABASE_VERSION")

mkdir -p "$ROOT"
if [ ! -d "$SOURCE_DIR/.git" ]; then
  git init "$SOURCE_DIR"
  git -C "$SOURCE_DIR" remote add origin https://github.com/supabase/supabase.git
  git -C "$SOURCE_DIR" sparse-checkout init --cone
  git -C "$SOURCE_DIR" sparse-checkout set docker
fi

git -C "$SOURCE_DIR" fetch --depth 1 origin "$REF"
git -C "$SOURCE_DIR" checkout --detach FETCH_HEAD

if [ ! -f "$SOURCE_DIR/docker/.env" ]; then
  cp "$SOURCE_DIR/docker/.env.example" "$SOURCE_DIR/docker/.env"
  (
    cd "$SOURCE_DIR/docker"
    sh utils/generate-keys.sh
    sh utils/add-new-auth-keys.sh
  )
  chmod 600 "$SOURCE_DIR/docker/.env"
fi

printf '%s\n' \
  "Pinned Supabase source installed at $SOURCE_DIR" \
  "Edit $SOURCE_DIR/docker/.env before starting:" \
  "  SUPABASE_PUBLIC_URL=https://sapsii.imxone.com" \
  "  API_EXTERNAL_URL=https://sapsii.imxone.com/auth/v1" \
  "  SITE_URL=https://sapsii.imxone.com" \
  "  ADDITIONAL_REDIRECT_URLS=https://sapsii.imxone.com/**" \
  "  DISABLE_SIGNUP=true (after creating the prototype operator)" \
  "Then run deploy/start-platform.sh from the Sapsii checkout."
