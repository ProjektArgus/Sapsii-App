# Self-hosted Sapsii on the Proxmox homelab

This runbook targets the existing `../../proxmox` topology:

- Proxmox bridge: `vmbr0`, `10.10.10.1/24`
- Gateway LXC: `10.10.10.2`, running the only `cloudflared` connector and central Caddy
- Attendit LXC: `10.10.10.20`
- New Sapsii LXC: `10.10.10.30`
- No router port forwarding and no inbound SSH deployment

It runs the standard pinned Supabase stack and Sapsii API/UI in one Docker-capable LXC. Supabase provides PostgreSQL/PostGIS, Auth, Storage/S3, Studio, PostgREST, Realtime, Edge Runtime, and imgproxy. Sapsii continues to use only its portable PostgreSQL, OIDC, and S3 boundaries.

Backup automation is intentionally not included at this prototype stage.

## 1. Create the Sapsii LXC

Create an unprivileged Debian 13 LXC with:

```text
CT ID:       202
Hostname:    sapsii
Address:     10.10.10.30/24
Gateway:     10.10.10.1
Bridge:      vmbr0
CPU limit:   4
RAM limit:   6144 MiB
Swap:        2048 MiB
Root disk:   50-60 GB thin-provisioned on local-lvm
Features:    nesting=1,keyctl=1
Start boot:  yes (after Gateway)
```

The memory value is a ceiling, not physically reserved RAM. Build images in GitHub Actions rather than in this LXC. If Docker in the unprivileged LXC proves unreliable, use the same allocation in a small VM rather than weakening the Proxmox host.

Inside the guest, install only runtime prerequisites:

```sh
apt update
apt install -y ca-certificates curl git jq nftables python3 util-linux
curl -fsSL https://get.docker.com | sh
docker compose version
```

Compose must be recent enough to support the `!reset` override tag.

## 2. Prepare GitHub

Repository: `ProjektArgus/Sapsii-App`.

Set repository variable `NEXT_PUBLIC_CARTO_API_KEY`. It is a browser-visible map key and is embedded during the immutable UI image build.

The workflows do the following:

- `.github/workflows/ci.yml`: tests, typechecks, Drizzle validation, UI lint/build, and both container builds.
- `.github/workflows/publish-images.yml`: after successful CI on `main`, publishes commit-SHA-only images to GHCR and stores an immutable digest manifest as a workflow artifact.

Published images:

```text
ghcr.io/projektargus/sapsii-api:<full-commit-sha>
ghcr.io/projektargus/sapsii-ui:<full-commit-sha>
```

No `latest` tag is used by deployment.

Create a read-only GitHub token for the LXC. It needs repository Contents read, Actions read, and Packages read (`repo` plus `read:packages` for a classic PAT). GitHub Actions receives no production secret.

## 3. Install the pinned Supabase source

Place a checkout of this repository at `/opt/sapsii/app`, then run:

```sh
cd /opt/sapsii/app
./deploy/install-supabase.sh
```

The script sparse-checks out the official Supabase Docker stack at the exact revision in `deploy/SUPABASE_VERSION`, generates Supabase secrets, and leaves the populated file at:

```text
/opt/sapsii/supabase-src/docker/.env
```

Edit that file before first startup:

```env
SUPABASE_PUBLIC_URL=https://sapsii.imxone.com
API_EXTERNAL_URL=https://sapsii.imxone.com/auth/v1
SITE_URL=https://sapsii.imxone.com
ADDITIONAL_REDIRECT_URLS=https://sapsii.imxone.com/**

ENABLE_PHONE_SIGNUP=false
# Keep email signup disabled for a closed prototype; create users through Studio.
DISABLE_SIGNUP=true

POOLER_DEFAULT_POOL_SIZE=5
POOLER_MAX_CLIENT_CONN=50
```

Keep every generated password/key. Do not copy the example values. The base stack deliberately omits the optional Logflare/Vector override to fit the laptop; this does not remove any Sapsii capability.

Start Supabase:

```sh
cd /opt/sapsii/app
./deploy/start-platform.sh
```

This creates two non-published Docker networks and applies `deploy/supabase.override.yaml`, which removes host publication of the Supabase gateway, PostgreSQL, and Supavisor ports. Only app-local Caddy will publish port 8080.

## 4. Create the isolated Sapsii database

Generate a separate hexadecimal password:

```sh
openssl rand -hex 32
```

Copy `deploy/.env.example` to `/etc/sapsii/sapsii.env`, set permissions, and populate it from the generated Supabase `.env`:

```sh
mkdir -p /etc/sapsii
cp deploy/.env.example /etc/sapsii/sapsii.env
chmod 600 /etc/sapsii/sapsii.env
```

Mappings:

```text
SUPABASE_PUBLISHABLE_KEY       <- Supabase SUPABASE_PUBLISHABLE_KEY
S3_ACCESS_KEY_ID               <- Supabase S3_PROTOCOL_ACCESS_KEY_ID
S3_SECRET_ACCESS_KEY           <- Supabase S3_PROTOCOL_ACCESS_KEY_SECRET
S3_REGION                      <- Supabase REGION (normally stub)
```

Use the generated hexadecimal password in both `SAPSII_DB_PASSWORD` and `DATABASE_URL`; hexadecimal requires no URL encoding.

Create a separate `sapsii` database and least-privilege application role inside the Supabase PostgreSQL cluster:

```sh
./deploy/bootstrap-sapsii-database.sh /etc/sapsii/sapsii.env
```

Supabase's Auth/Storage schemas remain in database `postgres`. Sapsii's Drizzle tables remain in database `sapsii` and are therefore not automatically exposed through Supabase PostgREST.

## 5. Add Gateway and Cloudflare routes

Add these handlers before the Gateway Caddy fallback in `../../proxmox/deploy/gateway/Caddyfile`:

```caddyfile
@sapsii host sapsii.imxone.com sapsii-admin.imxone.com
handle @sapsii {
    reverse_proxy http://10.10.10.30:8080
}
```

Reload Gateway Caddy and verify from Gateway:

```sh
curl -I http://10.10.10.30:8080 -H 'Host: sapsii.imxone.com'
caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy
```

In Cloudflare Tunnel, add both public hostnames pointing to the existing connector:

```text
sapsii.imxone.com       -> HTTP http://127.0.0.1:8080
sapsii-admin.imxone.com -> HTTP http://127.0.0.1:8080
```

Apply Cloudflare Access only to `sapsii-admin.imxone.com`. The public app hostname must not use interactive Cloudflare Access because physical Sapseed devices call its `/v1` and `/storage/v1/s3` routes.

App-local routing is defined in `deploy/Caddyfile`:

```text
/v1, /healthz, /readyz, /docs -> Fastify
/auth/v1, /storage/v1, /rest/v1, /realtime/v1, /functions/v1 -> Supabase gateway
all other public paths -> Next.js
admin hostname -> Supabase Studio through the gateway
```

## 6. Install and run the pull deployer

```sh
cd /opt/sapsii/app
sudo ./deploy/install-deployer.sh
```

Populate every value in `/etc/sapsii/sapsii.env`. Wait for `Publish images` to succeed on `main`, then:

```sh
systemctl enable --now sapsii-firewall.service
systemctl start sapsii-deploy.service
systemctl status sapsii-deploy.service
systemctl enable --now sapsii-deploy.timer
```

The timer polls outbound every five minutes. For each successful publication it:

1. obtains the successful workflow's exact commit SHA;
2. downloads that source revision;
3. pulls only the matching SHA-tagged API/UI images;
4. records their pulled GHCR digests locally;
5. runs Drizzle migrations as a one-shot release step;
6. rolls out API/UI/Caddy;
7. verifies readiness and login-page health;
8. rolls application containers back on failure.

Database migrations are never automatically reversed, so migrations must remain backward-compatible with the previous app image.

Useful commands:

```sh
systemctl start sapsii-deploy.service
journalctl -u sapsii-deploy.service -n 100 --no-pager
systemctl list-timers sapsii-deploy.timer
docker compose --env-file /etc/sapsii/sapsii.env -f /opt/sapsii/current/deploy/compose.yaml ps
```

## 7. Initialize prototype data and identities

Open `https://sapsii-admin.imxone.com` through Cloudflare Access.

1. Create a private Storage bucket named `evidence`.
2. Create and confirm the human operator under Authentication -> Users.
3. Copy that user's UUID; it is the OIDC subject.

Run the storage compatibility smoke test. It exercises the exact signed PUT, checksum, HEAD, signed GET, and delete operations used by Sapseed:

```sh
docker compose --env-file /etc/sapsii/sapsii.env \
  -f /opt/sapsii/current/deploy/compose.yaml \
  exec api node api/dist/cli/verify-object-store.js
```

Seed the Patiala demonstration baseline:

```sh
docker compose --env-file /etc/sapsii/sapsii.env \
  -f /opt/sapsii/current/deploy/compose.yaml --profile tools run --rm \
  db-cli db/dist/seed-demo.js --organization sapsii-dev
```

Provision the Supabase Auth user as a Sapsii organization member. The issuer must exactly match `OIDC_ISSUER`:

```sh
docker compose --env-file /etc/sapsii/sapsii.env \
  -f /opt/sapsii/current/deploy/compose.yaml --profile tools run --rm \
  db-cli api/dist/cli/provision-member.js \
  --organization sapsii-dev \
  --issuer https://sapsii.imxone.com/auth/v1 \
  --subject USER_UUID \
  --role organization_admin
```

Provision the physical Sapseed device through the existing CLI and copy its printed `Device ...` credential into the Android app:

```sh
docker compose --env-file /etc/sapsii/sapsii.env \
  -f /opt/sapsii/current/deploy/compose.yaml --profile tools run --rm \
  db-cli api/dist/cli/provision-device.js \
  --organization sapsii-dev --device PHONE_EXTERNAL_ID
```

The browser authenticates with Supabase email/password. Next.js keeps the access and refresh tokens in secure HTTP-only cookies and forwards the current access token to Fastify. Sapseed authentication remains separate.

## 8. Acceptance checks

```sh
curl -fsS https://sapsii.imxone.com/healthz
curl -fsS https://sapsii.imxone.com/readyz
curl -I https://sapsii.imxone.com/login
curl -I https://sapsii.imxone.com/auth/v1/health
curl -I https://sapsii-admin.imxone.com
```

Then verify:

- Supabase login reaches the live dashboard.
- Patiala seed data renders.
- A physical Sapseed observation uploads evidence and metadata.
- The observation appears in telemetry and on the GIS map.
- Nearby repeated defects reconcile into one issue.
- `docker stats --no-stream` remains inside the LXC memory ceiling.
