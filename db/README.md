# Sapsii database

Portable PostgreSQL/PostGIS schema and migrations built with Drizzle.

## Compatibility contract

The database layer may use standard PostgreSQL features and PostGIS, but not provider-owned schemas, auth functions, storage APIs, serverless extensions, or deployment metadata. Core migrations do not depend on Supabase `auth`/`storage` schemas or Neon/Render administration APIs.

Provider-specific provisioning belongs outside `migrations/`. Moving providers consists of provisioning PostgreSQL with PostGIS, restoring data, changing `DATABASE_URL`, running migrations, and validating extensions/indexes—not rewriting application tables.

Organization isolation is represented in application-owned columns and constraints. Any row-level policies use application-controlled PostgreSQL session context rather than provider JWT helper functions.

## Source of truth

- `src/schema/` contains typed Drizzle table definitions shared by the API.
- `migrations/` contains reviewed, generated SQL and Drizzle snapshots.
- `src/client.ts` constructs a standard `pg` pool and typed Drizzle client.
- `drizzle.config.ts` generates migrations without requiring provider credentials.

Drizzle's custom PostGIS type is used for typed schema ownership, while generated migrations are reviewed to ensure `geography(Point, 4326)` is emitted as SQL rather than a quoted type name. Meter-based PostGIS operations remain explicit SQL expressions.

## Requirements

- PostgreSQL with PostGIS available
- A standard PostgreSQL connection URL in `DATABASE_URL`
- Permission to create `postgis`, or the extension enabled by the database administrator

## Commands

Copy `db/.env.example` to the ignored `db/.env`; database commands load it automatically. From the repository root:

```bash
npm run db:generate
npm run db:migrate
npm run db:clear-test-data -- --organization sapsii-dev
npm run db:seed-demo -- --organization sapsii-dev
npm run db:simulate-demo -- --organization sapsii-dev
npm run typecheck --workspace @sapsii/db
npm run check --workspace @sapsii/db
```

`db:clear-test-data` removes an organization's observations, ingestion batches, issue/event aggregations, traffic windows, jobs, trips, audit entries, and evidence metadata, and resets device telemetry while preserving organization membership, buses, devices, and credentials. Follow it with `db:seed-demo` to restore a clean demonstration baseline without invalidating a provisioned test edge device. It does not delete orphaned objects from external object storage.

`db:seed-demo` idempotently creates or refreshes a Patiala demonstration fleet, recent observations, infrastructure issues, and traffic windows using stable identifiers. `db:simulate-demo` continuously moves those five devices along the precomputed Patiala–Rajpura Road geometry and updates their GPS timestamp, heading, speed, and health at `DEMO_SIMULATION_INTERVAL_MS`; it is a local demonstration process, not a production worker.

Generate and review migrations locally, commit both SQL and snapshots, and run `db:migrate` as a separate release step. The API never mutates its schema during startup. Test every migration against both a clean database and an upgraded database.
