#!/usr/bin/env sh
set -eu

ENV_FILE=${1:-/etc/sapsii/sapsii.env}
if [ ! -r "$ENV_FILE" ]; then
  echo "Cannot read $ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a
: "${SAPSII_DB_PASSWORD:?set SAPSII_DB_PASSWORD in $ENV_FILE}"

# Supabase's official Compose stack names this container supabase-db. Keep the
# platform's auth/storage schemas in database postgres and Sapsii's tables in a
# separate database named sapsii.
# $SAPSII_DB_PASSWORD is expanded by the container's shell, not this one.
# shellcheck disable=SC2016
docker exec -i \
  -e SAPSII_DB_PASSWORD="$SAPSII_DB_PASSWORD" \
  supabase-db sh -eu -c 'psql -U postgres -d postgres -v ON_ERROR_STOP=1 --set=db_password="$SAPSII_DB_PASSWORD"' <<'SQL'
SELECT format('CREATE ROLE sapsii LOGIN PASSWORD %L', :'db_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sapsii') \gexec
SELECT format('ALTER ROLE sapsii PASSWORD %L', :'db_password') \gexec
SELECT 'CREATE DATABASE sapsii OWNER sapsii'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'sapsii') \gexec
\connect sapsii
CREATE EXTENSION IF NOT EXISTS postgis;
GRANT ALL ON SCHEMA public TO sapsii;
SQL

echo "Sapsii database and role are ready. Run the checked-in Drizzle migration next."
