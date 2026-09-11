#!/usr/bin/env sh
set -eu

ROOT=${SAPSII_ROOT:-/opt/sapsii}
SOURCE_DIR=${SUPABASE_SOURCE_DIR:-$ROOT/supabase-src}
ARGUS_HOST=${ARGUS_PUBLIC_HOST:-argus.imxone.com}
SCRIPT_DIR=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
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

ENV_FILE=$SOURCE_DIR/docker/.env
if [ ! -f "$ENV_FILE" ]; then
  cp "$SOURCE_DIR/docker/.env.example" "$ENV_FILE"
fi

# Both Supabase utilities print new secrets and only persist them when told to
# with --update-env. Without it the stack silently starts on the documented
# example secrets, so generate them explicitly and only when they are still
# missing. Re-running must not rotate POSTGRES_PASSWORD under a live database.
secrets_missing() {
  grep -q '^JWT_SECRET=your-super-secret' "$ENV_FILE" && return 0
  grep -q '^SUPABASE_PUBLISHABLE_KEY=$' "$ENV_FILE" && return 0
  grep -q '^JWT_KEYS=$' "$ENV_FILE" && return 0
  return 1
}

if secrets_missing; then
  (
    cd "$SOURCE_DIR/docker"
    sh utils/generate-keys.sh --update-env >/dev/null
    sh utils/add-new-auth-keys.sh --update-env >/dev/null
  )
  chmod 600 "$ENV_FILE"
  echo "Generated Supabase secrets into $ENV_FILE"
fi

if grep -q '^JWT_SECRET=your-super-secret' "$ENV_FILE"; then
  echo "Refusing to continue: $ENV_FILE still holds the example JWT_SECRET" >&2
  exit 1
fi
if grep -q '^SUPABASE_PUBLISHABLE_KEY=$' "$ENV_FILE"; then
  echo "Refusing to continue: $ENV_FILE has no SUPABASE_PUBLISHABLE_KEY" >&2
  exit 1
fi

printf '%s\n' \
  "Pinned Supabase source installed at $SOURCE_DIR" \
  "Edit $ENV_FILE before starting:" \
  "  SUPABASE_PUBLIC_URL=https://$ARGUS_HOST/platform" \
  "  API_EXTERNAL_URL=https://$ARGUS_HOST/platform/auth/v1" \
  "  SITE_URL=https://$ARGUS_HOST" \
  "  ADDITIONAL_REDIRECT_URLS=https://$ARGUS_HOST/**" \
  "  DISABLE_SIGNUP=true (after creating the prototype operator)" \
  "Then run deploy/start-platform.sh from the Sapsii checkout."
