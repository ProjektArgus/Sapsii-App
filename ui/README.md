# Sapsii UI

Next.js dashboard backed by the authenticated Sapsii API. The map, recent telemetry, analytics, and fleet-health pages contain no generated or hardcoded domain data.

## Configuration

Copy `ui/.env.example` to the ignored `ui/.env` and set the server-only values. Next.js loads it automatically:

- `SAPSII_API_URL`
- `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` for production Supabase Auth sessions
- `SAPSII_API_BEARER_TOKEN` only as a local demo fallback
- `SAPSII_ORGANIZATION_ID` when that identity has multiple memberships
- `SAPSII_DEFAULT_BBOX` for the initial issue viewport (the default covers Patiala; maximum span: 5° per axis)
- `NEXT_PUBLIC_CARTO_API_KEY` for CARTO's vector basemap service

The map uses MapLibre GL JS with CARTO's `dark-matter` vector style. Infrastructure issues, raw road-defect observations, traffic heatmaps, live route trails, and interpolated device positions are separate GPU-rendered layers. Initial bounds come from returned geodata rather than a static center. Live positions are refreshed through the server-side `/api/devices` proxy, keeping the OIDC bearer token out of browser JavaScript.

Production login uses Supabase email/password through a Next.js Server Action. Access and refresh tokens remain in secure HTTP-only cookies, are refreshed in `src/proxy.ts`, and the current access token is forwarded by the server-only DAL to Fastify. Do not expose either token with a `NEXT_PUBLIC_` prefix. The Supabase publishable key is safe to supply to the server but does not need to be browser-visible in this implementation. The CARTO basemap key is intentionally browser-visible and must be restricted according to CARTO's controls.

Without API/auth configuration, the UI renders an explicit configuration state; it never falls back to mock data. See [`../docs/self-hosted-deployment.md`](../docs/self-hosted-deployment.md) for the production container flow.

## Development

From the repository root:

```bash
npm ci
npm run dev:ui
```

Open [http://localhost:3000](http://localhost:3000).

## Verification

```bash
npm run lint --workspace @sapsii/ui
npm run build --workspace @sapsii/ui
```
