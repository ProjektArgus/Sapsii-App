# Sapsii

Sapsii is an AI-powered urban sensing platform that uses public buses equipped with Sapseed edge-sensing units.

## Repository layout

- [`ui/`](ui/) — Next.js dashboard
- [`api/`](api/) — provider-neutral Node.js/TypeScript API (Fastify)
- [`db/`](db/) — portable PostgreSQL/PostGIS migrations and database assets

The Sapseed edge application lives separately in [ProjektArgus/Sapseed](https://github.com/ProjektArgus/Sapseed).

## Local development

Copy each package's checked-in `.env.example` to its ignored `.env` file, then configure the values. API and database commands load their package `.env`; Next.js loads `ui/.env` natively.

```bash
npm ci
npm run db:migrate
npm run dev:api
npm run dev:ui
```

For the configured Patiala recording environment, start the local OIDC fixture, API, road-following GPS simulator, and UI together:

```bash
npm run demo
```

The API serves OpenAPI at `http://localhost:3001/docs`; the dashboard runs at `http://localhost:3000`. See each package README and `.env.example` for database, OIDC, private object-storage, and server-only UI API configuration.

The API and database use replaceable adapters and standard PostgreSQL/PostGIS, OIDC/JWKS, and S3-compatible contracts. They do not depend on a hosting provider's runtime or proprietary schemas. Sapseed now uploads authenticated observation batches and optional private evidence using the same contract documented in [`docs/ingestion-v1.md`](docs/ingestion-v1.md).

See [`docs/ps124-prototype-reconciliation.md`](docs/ps124-prototype-reconciliation.md) for the evidence-based boundary between the PS124 capabilities demonstrated by this prototype and capabilities that still require calibration, additional models, or governance.
