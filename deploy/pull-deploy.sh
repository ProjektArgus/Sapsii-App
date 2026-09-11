#!/usr/bin/env sh
set -eu

ROOT=${SAPSII_ROOT:-/opt/sapsii}
ENV_FILE=${SAPSII_ENV_FILE:-/etc/sapsii/sapsii.env}
STATE_DIR=$ROOT/state
RELEASES_DIR=$ROOT/releases
DEPLOYER_DIR=$ROOT/deployer

exec 9>/run/lock/sapsii-deploy.lock
flock -n 9 || exit 0

[ -r "$ENV_FILE" ] || { echo "Cannot read $ENV_FILE" >&2; exit 1; }
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a
: "${GH_TOKEN:?set GH_TOKEN in $ENV_FILE}"
: "${GITHUB_REPOSITORY:=ProjektArgus/Sapsii-App}"
: "${GITHUB_WORKFLOW_FILE:=publish-images.yml}"
: "${SAPSII_API_IMAGE:=ghcr.io/projektargus/sapsii-api}"
: "${SAPSII_UI_IMAGE:=ghcr.io/projektargus/sapsii-ui}"
: "${SAPSII_PUBLIC_HOST:=sapsii.imxone.com}"
export GITHUB_REPOSITORY GITHUB_WORKFLOW_FILE SAPSII_API_IMAGE SAPSII_UI_IMAGE SAPSII_PUBLIC_HOST

mkdir -p "$STATE_DIR" "$RELEASES_DIR" "$DEPLOYER_DIR"
RUNS_JSON=$(mktemp)
ARCHIVE=$(mktemp)
trap 'rm -f "$RUNS_JSON" "$ARCHIVE"' EXIT

curl --fail --silent --show-error --location \
  -H "Authorization: Bearer $GH_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/repos/$GITHUB_REPOSITORY/actions/workflows/$GITHUB_WORKFLOW_FILE/runs?branch=main&status=success&per_page=1" \
  > "$RUNS_JSON"

RELEASE_SHA=$(python3 -c 'import json,sys; runs=json.load(open(sys.argv[1])).get("workflow_runs", []); print(runs[0]["head_sha"] if runs else "")' "$RUNS_JSON")
[ -n "$RELEASE_SHA" ] || { echo "No successful main image publication found" >&2; exit 1; }
CURRENT_SHA=$(cat "$STATE_DIR/deployed-sha" 2>/dev/null || true)
[ "$RELEASE_SHA" != "$CURRENT_SHA" ] || exit 0

RELEASE_DIR=$RELEASES_DIR/$RELEASE_SHA
if [ ! -f "$RELEASE_DIR/deploy/compose.yaml" ]; then
  rm -rf "$RELEASE_DIR"
  mkdir -p "$RELEASE_DIR"
  curl --fail --silent --show-error --location \
    -H "Authorization: Bearer $GH_TOKEN" \
    -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/$GITHUB_REPOSITORY/tarball/$RELEASE_SHA" \
    > "$ARCHIVE"
  tar -xzf "$ARCHIVE" --strip-components=1 -C "$RELEASE_DIR"
fi

printf '%s' "$GH_TOKEN" | docker login ghcr.io --username x-access-token --password-stdin >/dev/null
export SAPSII_IMAGE_TAG="$RELEASE_SHA"
compose() {
  docker compose --env-file "$ENV_FILE" -f "$RELEASE_DIR/deploy/compose.yaml" "$@"
}

compose pull api ui
API_DIGEST=$(docker image inspect "$SAPSII_API_IMAGE:$RELEASE_SHA" --format '{{index .RepoDigests 0}}')
UI_DIGEST=$(docker image inspect "$SAPSII_UI_IMAGE:$RELEASE_SHA" --format '{{index .RepoDigests 0}}')
printf '{"commit":"%s","api":"%s","ui":"%s"}\n' "$RELEASE_SHA" "$API_DIGEST" "$UI_DIGEST" > "$STATE_DIR/candidate-manifest.json"

# Migrations are deliberately a release step and are never run by API startup.
compose --profile tools run --rm migrate
compose up -d --remove-orphans api ui web

healthy=false
for _ in $(seq 1 30); do
  if curl --fail --silent --show-error -H "Host: $SAPSII_PUBLIC_HOST" http://127.0.0.1:8080/readyz >/dev/null \
    && curl --fail --silent --show-error -H "Host: $SAPSII_PUBLIC_HOST" http://127.0.0.1:8080/login >/dev/null; then
    healthy=true
    break
  fi
  sleep 2
done

if [ "$healthy" != true ]; then
  echo "Release $RELEASE_SHA failed health checks" >&2
  if [ -n "$CURRENT_SHA" ] && [ -f "$RELEASES_DIR/$CURRENT_SHA/deploy/compose.yaml" ]; then
    export SAPSII_IMAGE_TAG="$CURRENT_SHA"
    docker compose --env-file "$ENV_FILE" -f "$RELEASES_DIR/$CURRENT_SHA/deploy/compose.yaml" up -d --remove-orphans api ui web
    echo "Application containers rolled back to $CURRENT_SHA; database migrations were not rolled back" >&2
  fi
  exit 1
fi

mv "$STATE_DIR/candidate-manifest.json" "$STATE_DIR/deployed-manifest.json"
printf '%s\n' "$RELEASE_SHA" > "$STATE_DIR/deployed-sha"
ln -sfn "$RELEASE_DIR" "$ROOT/current"
cp "$RELEASE_DIR/deploy/pull-deploy.sh" "$DEPLOYER_DIR/pull-deploy.sh.new"
chmod 755 "$DEPLOYER_DIR/pull-deploy.sh.new"
mv "$DEPLOYER_DIR/pull-deploy.sh.new" "$DEPLOYER_DIR/pull-deploy.sh"

# Retain the active and immediately previous source releases for rollback.
find "$RELEASES_DIR" -mindepth 1 -maxdepth 1 -type d ! -name "$RELEASE_SHA" ! -name "$CURRENT_SHA" -mtime +7 -exec rm -rf {} +
echo "Deployed Sapsii $RELEASE_SHA ($API_DIGEST, $UI_DIGEST)"
