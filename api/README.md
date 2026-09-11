# Sapsii API

Provider-neutral Fastify/TypeScript API for the Sapsii urban-sensing platform.

## Implemented core

- Slow-hashed, revocable device credentials independent of human login
- Versioned batch observation ingestion with exact batch replay and per-item results
- Authenticated `/v1/telemetry/position` GPS updates for buses and standalone devices; stale fixes cannot replace newer positions
- Durable PostgreSQL jobs claimed with `FOR UPDATE SKIP LOCKED`
- Accuracy-aware PostGIS road-defect aggregation with independent-device confirmation
- Five-minute tracking-aware traffic measurements
- Organization-scoped issue, observation, traffic, fleet, and summary dashboard APIs
- Generic OIDC/JWKS human authentication and role checks
- Private S3-compatible evidence reservation, signed upload/download, completion, linking, and orphan cleanup
- OpenAPI UI at `/docs`; liveness/readiness at `/healthz` and `/readyz`

## Boundaries

- `src/core/ports` defines identity and evidence contracts without vendor types.
- `src/modules` contains domain logic and HTTP modules.
- `src/infrastructure` contains replaceable PostgreSQL, OIDC, and S3-compatible adapters.
- `src/app.ts` constructs an injectable application; `src/server.ts` owns process lifecycle and workers.

Core modules do not import hosting-provider SDKs. PostgreSQL/PostGIS, OIDC, and the S3 protocol are the portability contracts. Provider URLs are configuration and are never persisted as evidence identifiers.

## Configuration

Copy `api/.env.example` to `api/.env` and configure it. API development and provisioning commands load that ignored file automatically:

- `DATABASE_URL`; optionally `DATABASE_MAX_CONNECTIONS`
- `HOST`, `PORT`, and `LOG_LEVEL`
- `OIDC_ISSUER`, `OIDC_AUDIENCE`, and `OIDC_JWKS_URL` together to enable dashboard JWT authentication
- `S3_BUCKET` and `S3_REGION` to enable evidence; optional endpoint/credentials/path-style settings support MinIO, R2, AWS S3, and compatible stores

Without OIDC, dashboard routes fail closed with `401`. Without object storage, evidence routes fail closed with `503`; ingestion without evidence remains available. `DEMO_OIDC_PUBLIC_JWK_BASE64` is only for the local `demo:oidc` fixture and is not a production identity provider.

## Development

From the repository root:

```bash
npm ci
npm run db:migrate
npm run dev:api
```

Provision an edge credential (the secret is printed once):

```bash
npm run device:provision --workspace @sapsii/api -- --organization <slug> --device <external-id> [--bus <external-id>]
```

Bind a verified OIDC subject to an organization:

```bash
npm run member:provision --workspace @sapsii/api -- --organization <slug> --issuer <oidc-issuer> --subject <oidc-subject> [--role organization_admin|operator|viewer]
```

Verify the configured S3-compatible store with the exact signed operation set used by evidence uploads:

```bash
npm run object-store:verify --workspace @sapsii/api
```

Verification:

```bash
npm test --workspace @sapsii/api
npm run typecheck --workspace @sapsii/api
npm run build --workspace @sapsii/api
```

`@sapsii/db` is consumed through its published `exports` map, so testing and typechecking need `db/dist`. Both commands build the database workspace first, which keeps a fresh checkout working without a manual build step.

## Deployment

Run migrations as a separate release step, then start the normal Node process or included Docker image. The API never mutates its schema at startup. Build `api/Dockerfile` with the repository root as its context because it compiles both `@sapsii/db` and `@sapsii/api` workspaces. The same immutable image contains the compiled migration, provisioning, simulator, and object-store verification entry points. See [`../docs/self-hosted-deployment.md`](../docs/self-hosted-deployment.md).
