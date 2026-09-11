# Sapsii UI

Next.js dashboard backed by the authenticated Sapsii API. The map, recent telemetry, analytics, and fleet-health pages contain no generated or hardcoded domain data.

## Configuration

Copy `ui/.env.example` to the ignored `ui/.env` and set the server-only values. Next.js loads it automatically:

- `SAPSII_API_URL`
- `SAPSII_API_BEARER_TOKEN` — an OIDC access token accepted by the API
- `SAPSII_ORGANIZATION_ID` when that identity has multiple memberships
- `SAPSII_DEFAULT_BBOX` for the initial issue viewport (the default covers Patiala; maximum span: 5° per axis)
- `NEXT_PUBLIC_CARTO_API_KEY` for CARTO's vector basemap service

The map uses MapLibre GL JS with CARTO's `dark-matter` vector style. Infrastructure issues, raw road-defect observations, traffic heatmaps, live route trails, and interpolated device positions are separate GPU-rendered layers. Initial bounds come from returned geodata rather than a static center. Live positions are refreshed through the server-side `/api/devices` proxy every two seconds, keeping the OIDC bearer token out of the browser.

Do not expose the API bearer token with a `NEXT_PUBLIC_` prefix. The CARTO basemap key is intentionally browser-visible and must be restricted according to CARTO's controls. API access is centralized in `src/lib/api.ts`, marked `server-only`, and returns minimal dashboard DTOs to client components.

Without API credentials, the UI renders an explicit `API_NOT_CONFIGURED` state; it never falls back to mock data.

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
