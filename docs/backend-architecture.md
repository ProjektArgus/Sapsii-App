# Sapsii backend architecture

Status: proposed Stage 1 baseline

## Product boundary

**Sapseed** is the runtime-independent edge sensing unit. **Sapsii** is the centralized urban intelligence platform in this repository.

The target system turns multi-camera public buses into mobile sensing units. The architecture keeps the long-term product vision, but the first backend only claims capabilities supported by the current edge output.

## Repository findings

- `ui/` is a Next.js dashboard using mock data. It currently has map, analytics, and fleet-health screens but no backend client.
- `api/` is a strict TypeScript/Fastify scaffold with OpenAPI, health routes, and provider-neutral auth/evidence ports. It has no persistence or business modules yet.
- `db/` uses Drizzle for typed schemas, reviewed SQL migrations, and a provider-neutral `pg` connection.
- `../Sapseed` has runtime-independent Kotlin models and an Android implementation. It queues at most 60 events/60 MiB and retries uploads.
- The current edge uploader sends **one** `UrbanEvent` at a time as multipart metadata plus JPEG evidence. It does not implement the required JSON batch protocol yet.
- The current `UrbanEvent.type` includes unsupported derived conclusions such as missing infrastructure, congestion, rash driving, and hit-and-run. Those values are extension points, not evidence that these capabilities currently exist.
- The current detector produces normalized bounding boxes, labels, confidence, optional tracking IDs, frame timestamps, and GPS. Device IDs are currently included in client JSON and must not be trusted by the API.

## Capability horizons

### Demonstrable with the current detector

- Positive sightings of the 21 detector classes
- Road-defect observations for potholes, cracks, damaged/unsurfaced road, waterlogging, and speed bumps
- Repeated-sighting aggregation into candidate/confirmed issues
- Object-presence observations for vehicles, people, and animals
- Approximate vehicle counts only when tracking prevents duplicate counting within a defined window
- Fleet/device status once heartbeat telemetry is sent

### Requires more edge context or calibration

- Reliable vehicle flow/counting across frames: tracking, line crossing, camera identity, direction, and duplicate suppression
- Congestion/density: calibrated field of view, observable road area, stationary duration, road geometry, and temporal baselines
- Route delay: route/trip assignment plus schedule/AVL data
- Road-condition scores: sampled road coverage and normalization, not just defect totals
- Missing signs, dividers, or crossings: expected-infrastructure inventory/road context and repeated negative evidence

### Requires additional models and governance

- Rash driving and hit-and-run detection
- Vulnerable pedestrian situations rather than simple person detection
- Registration OCR, vehicle re-identification, and cross-camera tracking
- Origin-destination estimates
- Privacy redaction, evidentiary chain of custody, and incident-sharing workflows

The schema reserves extensible event/payload fields for these capabilities without labeling current detections as those conclusions.

## Runtime architecture

One deployable API process is sufficient for the prototype:

```text
Sapseed devices ──HTTPS──> Fastify API ──SQL──> PostgreSQL + PostGIS
                              │                     │
Sapsii UI ───────HTTPS───────>│                     └── jobs table
                              │                              │
                              └── object-storage port        └── in-process worker
```

The worker runs in the same deployment initially, claims jobs with `FOR UPDATE SKIP LOCKED`, and can later run as a separate process without changing the domain model. No Kafka, Kubernetes, or microservices are needed.

## API modules

- `fleet`: organizations, buses, trips, devices, heartbeats, credential rotation/revocation
- `ingestion`: authenticated batch validation and idempotent raw observation writes
- `issues`: defect matching, lifecycle, observation history, and status changes
- `traffic`: time-window measurements with explicit methodology/quality metadata
- `events`: higher-level derived incidents, initially mostly unpopulated
- `dashboard`: viewport/map projections, recent observations, summaries, and fleet status
- `evidence`: private object metadata and signed upload/download requests
- `jobs`: durable retryable aggregation work
- `audit`: sensitive human actions and credential lifecycle

Each module owns its routes, service logic, and purpose-specific repository interfaces. SQL implementations live under `src/infrastructure/postgres`; hosting/auth/storage provider integrations cannot leak into domain modules.

## Portability contract

- PostgreSQL + PostGIS is the database contract; Neon, Supabase, Render, a VPS, or another conforming host is replaceable.
- Core migrations cannot call provider-owned auth/storage schemas or helper functions.
- Human authentication uses OIDC/JWT through `HumanAuthenticator`. A Supabase Auth adapter is optional, not foundational.
- Device authentication is API-owned and separate from human auth.
- Evidence uses opaque object keys through `EvidenceStore`; no public or provider URL is persisted.
- S3-compatible storage is the preferred production adapter because it is widely portable. A local filesystem adapter can support development.
- Standard environment variables (`DATABASE_URL`, OIDC settings, object-storage settings) form the deployment interface.
- Migrations run as a release step, never implicitly during API startup.

## Minimum viable backend

The implemented first vertical slice includes:

1. Organization, bus, device, and revocable device credential records
2. Device authentication and heartbeat
3. `POST /v1/ingestion/batches` for observation batches with optional reserved/uploaded evidence references
4. Raw road-defect observation persistence with at-least-once/idempotent semantics
5. Durable aggregation jobs
6. GPS-aware candidate/confirmed issue matching with preserved observation history
7. Bounding-box issue map queries and issue detail/status APIs
8. Basic tracking-aware vehicle measurement windows
9. UI replacement of mock map/fleet data

Evidence upload is implemented as reservation → signed S3-compatible PUT → completion → batch reference. Sapseed uses this single JSON batch contract; no temporary multipart compatibility is maintained.

## Geospatial issue matching

GPS-only matching cannot reliably distinguish adjacent lanes, divided roads, parallel roads, GPS multipath, or two nearby defects. Therefore matching is scored, not a fixed-radius merge:

1. Preserve every valid raw observation, even when its GPS quality is too poor for aggregation.
2. Only aggregate supported road-defect classes above class-specific confidence thresholds and with acceptable GPS accuracy.
3. Retrieve unresolved candidates of the same defect class in a broad PostGIS search radius.
4. Score candidates using distance relative to combined GPS uncertainty, recency, confidence, independent-device sightings, and lifecycle state.
5. Attach only when the best score exceeds a threshold and clearly beats the second-best candidate; otherwise create a new `candidate` issue.
6. Confirm after independent evidence (for example two devices, or separated passes from one device), not repeated adjacent frames from one track.
7. Maintain a weighted issue location and uncertainty while retaining all original points in observation history.
8. Never silently merge resolved/dismissed issues; a new sighting creates a candidate or an explicit reopen proposal.

Later scoring can add road-segment IDs, travel heading, lane/side, and visual embeddings without changing raw observations.

## Data placement rules

- Typed columns: identity, organization ownership, timestamps, class/type, confidence, lifecycle, foreign keys, sizes, versions, and fields used for filtering/indexing.
- PostGIS `geography(Point, 4326)`: captured observation points and canonical issue locations for indexed meter-based distance queries.
- PostGIS `geometry`: future road segments/routes and viewport geometry operations where appropriate.
- JSONB: bounded, versioned type-specific payloads, model metadata, quality/methodology details, and non-indexed extension metadata.
- Object storage: image/video bytes only.
- PostgreSQL evidence rows: object key, hash, MIME type, size, privacy state, retention state, and upload lifecycle.

Frequently queried fields are promoted from JSONB into typed columns through migrations; JSONB is not a substitute for schema design.

## Security model

- A device credential is a high-entropy opaque secret associated with a credential ID. Only a slow hash is stored. Credentials can overlap during rotation and be revoked individually.
- Authenticated device identity and organization come from the credential, never request JSON.
- A bus/trip supplied by a device is accepted only if it belongs to the authenticated organization and is valid for that device assignment.
- Human JWT identity is mapped to application-owned organization membership and `organization_admin`, `operator`, or `viewer` roles.
- Every repository method is organization-scoped. Generic PostgreSQL RLS using application session context can be added as defense in depth; API authorization remains mandatory.
- Rate limits are keyed separately for device ingestion and human dashboard use.
- Credential changes, evidence access, and issue-state changes are audited.

## Reliability

- Valid items in a batch are inserted transactionally with their jobs; invalid items receive per-item errors.
- A database failure rejects the whole attempted write with a retryable response.
- Unique `(device_id, client_event_id)` constraints make at-least-once retries safe.
- Jobs have attempt count, availability time, lease time, and last error. Dead jobs remain inspectable.
- Readiness checks database connectivity once persistence is wired; liveness only checks the process.
- Structured logs include request ID, organization/device IDs, batch ID, and counts, but never credentials or sensitive payloads.
