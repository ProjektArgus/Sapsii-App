#!/usr/bin/env sh
# Sync the deployment checkout to origin exactly.
#
# Commits on this repository are occasionally amended or rebased and force
# pushed, so `git pull` can fail or leave the checkout on a rewritten branch.
# The deployer itself never relies on this: it downloads each release as a
# tarball pinned to the published commit. This helper exists for the manual
# steps in docs/self-hosted-deployment.md.
set -eu

APP_DIR=${SAPSII_APP_DIR:-/opt/sapsii/app}
BRANCH=${SAPSII_BRANCH:-main}

[ -d "$APP_DIR/.git" ] || { echo "No git checkout at $APP_DIR" >&2; exit 1; }

git -C "$APP_DIR" fetch --prune origin
# --hard only touches tracked files, so an untracked local .env survives.
git -C "$APP_DIR" reset --hard "origin/$BRANCH"

echo "deploy checkout now at $(git -C "$APP_DIR" rev-parse --short HEAD)"
