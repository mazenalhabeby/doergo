# HBCField — IT Operations & Handover Document

> **Purpose:** everything an external IT/DevOps team needs to run, deploy, maintain
> and extend the HBCField platform. Read this end‑to‑end before touching production.
> **Last updated:** 2026‑07‑12.
> **Audience:** IT company / DevOps engineers taking over operations.

---

## 0. TL;DR — what you're taking over

HBCField is a **field‑service management SaaS** (task dispatch, GPS/route tracking,
attendance/clock‑in, service reports, subscriptions/billing). It runs as a set of
**Docker containers on a single Linux server**, fronted by **nginx + Let's Encrypt**,
with a **Next.js web app**, **NestJS microservices**, **PostgreSQL + Redis**, and a
**React Native (Expo) mobile app** shipped via **EAS** to the App Store / Play Store.
Payments run through **Stripe** (currently in **TEST mode** — no real charges yet).

**The three things you must know before deploying:**
1. The production server **cannot `git pull`** (its GitHub deploy key is broken). Deploys are delivered via **git‑bundle over SSH + `git merge --ff-only`** (see §7). `deploy.sh` as written will fail at the `git pull` step.
2. Database migrations are applied by the **auth‑service container on startup** (`prisma migrate deploy`). For migrations that need to run *before* the new app serves traffic (e.g. anything the new code depends on), run them via a one‑off container **first** (see §6.3).
3. **Stripe is in TEST mode.** Going live requires creating live products/prices, swapping keys, and enabling tax — see §8.6. Do not tell anyone "payments are open" until that's done.

---

## 1. Contents
1. TL;DR
2. Product overview
3. Architecture & tech stack
4. Infrastructure (server, containers, ports, nginx, TLS)
5. Access & credentials you need
6. Database (Postgres, schema, migrations, backups)
7. Deployment procedure (the real one)
8. Billing / Stripe subscription system
9. Mobile app (EAS builds, OTA updates, store releases)
10. Environment configuration (all variables)
11. Monitoring & health checks
12. Operations runbook (restart, logs, rollback, scale)
13. Known limitations & technical debt
14. Outstanding tasks / roadmap
15. Troubleshooting

---

## 2. Product overview

- **Roles:** effectively **ADMIN** + a **dynamic MEMBER**. A member's capabilities come from a per‑user *Access Profile* (`User.enabledModules`: which platforms web/mobile/both, which spaces, which screens/modules), not a fixed role. (Prisma still stores ADMIN/MANAGER/EMPLOYEE + a legacy CLIENT→ADMIN mapping, plus optional custom `org_roles`.)
- **Clients:** **Web app** (Next.js, admins/managers/office) and **Mobile app** (Expo/React Native, technicians).
- **Core flow:** Admin creates task → assigns technician → technician executes on mobile (accept → en‑route with GPS tracking → arrive → in‑progress → complete with a service report) → real‑time updates via WebSockets.
- **Billing:** office seats priced by plan tier (€29/€59/€99/mo), field (mobile‑only) seats €19 flat, Enterprise from €199. 14‑day Professional trial. See §8.

---

## 3. Architecture & tech stack

```
                          Internet (HTTPS)
                                │
                    ┌───────────▼───────────┐
                    │  nginx (host)          │  TLS via Let's Encrypt/Certbot
                    │  hbcfield.com          │
                    └─────┬──────┬──────┬────┘
              /           │ /api/ │ /socket.io/
              ▼           ▼       ▼
      web-app:3001   gateway:4000  notification:4001
       (Next.js)      (NestJS)      (Socket.IO)
                          │
        ┌─────────────────┼───────────────────────────┐
        ▼                 ▼                 ▼           ▼
  auth-service      task-service      tracking-service  notification-service
  (JWT, users,      (tasks, reports,  (GPS/route)       (Socket.IO, email, push)
   billing/Stripe)   attendance,BullMQ)
        │                 │                 │           │
        └──────── PostgreSQL (doergo) ───────┘   Redis (cache + Pub/Sub + BullMQ)
```

| Layer | Technology |
|---|---|
| Web frontend | Next.js 15 (App Router), Tailwind + shadcn/ui, TanStack Query |
| Mobile | React Native + Expo SDK 54, expo-router, react-native-maps, expo-location, **expo-updates (OTA)** |
| Backend | NestJS microservices (TypeScript), communicating over **Redis transport** (`ClientProxy.send`) |
| API | REST (via gateway, prefix `/api/v1`) + Swagger at `/docs`; WebSockets (Socket.IO) |
| Auth | JWT access + refresh (rotation, SHA‑256 hashed refresh tokens), RBAC guards |
| DB | PostgreSQL (+ PostGIS), **Prisma** ORM (schema in `apps/api/auth-service/prisma/schema.prisma`) |
| Queue | BullMQ (Redis) — exactly‑once task processing |
| Cache/PubSub | Redis |
| Payments | Stripe (hosted Checkout + Customer Portal + webhooks) |
| Email | Nodemailer (SMTP) · Push: Expo Push |
| Repo | pnpm monorepo (`apps/*`, `packages/shared`) |

**Monorepo layout:** `apps/web-app`, `apps/mobile`, `apps/api/{gateway,auth-service,task-service,notification-service,tracking-service}`, `packages/shared` (shared types, guards, billing logic, etc.).

---

## 4. Infrastructure

**Server:** `<SERVER_IP>` (Hetzner), Ubuntu (kernel 6.8), Docker **29.1.3**, hostname `hbct-prod-1`.
**⚠️ Shared server:** this box also runs *other unrelated projects* (fire‑protection.tech, hbc‑solution.io, ourmoda, hbc‑engineering, monitoring/portainer). **Only touch containers/paths prefixed `hbcfield-` / `/opt/doergo`.** Do not restart the whole Docker daemon or run `docker compose down` at the wrong path.

**Project path:** `/opt/doergo` — git checkout of the monorepo (branch `main`).
**Compose:** `/opt/doergo/infra/docker/docker-compose.yml` (+ `docker-compose.override.yml` for Stripe env injection — see §10.2).
**Env file:** `/opt/doergo/infra/docker/.env.production` (secrets live here; **not** in git).

### 4.1 Containers & ports (all bound to 127.0.0.1 — nginx is the only public entry)

| Container | Internal port | Published | Public? |
|---|---|---|---|
| `hbcfield-web-app` | 3000 | 127.0.0.1:3001 | via nginx `/` |
| `hbcfield-api-gateway` | 4000 | 127.0.0.1:4000 | via nginx `/api/` |
| `hbcfield-notification-service` | 4001 | 127.0.0.1:4001 | via nginx `/socket.io/` |
| `hbcfield-auth-service` | — | (internal only) | no |
| `hbcfield-task-service` | — | (internal only) | no |
| `hbcfield-tracking-service` | — | (internal only) | no |
| `hbcfield-postgres` | 5432 | 127.0.0.1:5434 | no |
| `hbcfield-redis` | 6379 | 127.0.0.1:6379 | no |

### 4.2 nginx routing (host, `/etc/nginx/sites-available/hbcfield.com`)
- `/`            → `http://127.0.0.1:3001` (web app)
- `/api/`        → `http://127.0.0.1:4000` (gateway → `/api/v1/...`)
- `/socket.io/`  → `http://127.0.0.1:4001` (realtime)
- `/downloads/`  → static (APK downloads)
- **TLS:** Let's Encrypt via **Certbot**, cert at `/etc/letsencrypt/live/hbcfield.com/`. Certbot auto‑renews; verify the cron/systemd timer is active.

---

## 5. Access & credentials you will need

> **Note on placeholders:** this document contains **no secrets and no identifying
> infrastructure details**. Anything shown as `<PLACEHOLDER>` (e.g. `<SERVER_IP>`,
> `<STRIPE_ACCOUNT_ID>`, `<EXPO_PROJECT_ID>`, `<APPLE_TEAM_ID>`, `<OWNER_EMAIL>`) is
> **provided separately by the owner through a secure channel**. All actual secret
> values (Stripe keys, DB password, JWT secrets, SMTP, API keys) live only in the
> server env file `/opt/doergo/infra/docker/.env.production` and are never in this doc.

Request access to the following from the owner:

| System | What / where |
|---|---|
| **Server SSH** | `root@<SERVER_IP>` (SSH key). Everything ops‑related is done here. |
| **GitHub repo** | The monorepo. **Note:** server's deploy key is broken → use the bundle workaround (§7) OR fix the deploy key so `git pull` works. |
| **Stripe** | Dashboard login (account "HBC GmbH", `<STRIPE_ACCOUNT_ID>`). Secret keys are **never** in git — only in the server env file. |
| **Expo / EAS** | Account `amd07dev`, project `@amd07dev/doergo` (projectId `<EXPO_PROJECT_ID>`). For mobile builds/OTA. |
| **Apple Developer** | Team `<APPLE_TEAM_ID>`, App Store Connect app id `<ASC_APP_ID>`, Apple ID `<OWNER_EMAIL>`. Needed for iOS submissions (2FA required). |
| **Google Play Console** | For Android releases. Service account key is on the server: `apps/mobile/play-store-key.json`. |
| **DNS / domain** | `hbcfield.com` registrar/DNS — to manage records + certs. |
| **SMTP** | Transactional email provider (creds in `.env.production`: `SMTP_*`). |
| **Google Maps** | API key (`GOOGLE_MAPS_API_KEY` / `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`). |

---

## 6. Database

- **Engine:** PostgreSQL in container `hbcfield-postgres`. DB + user are both **`doergo`**. Reachable on the host at `127.0.0.1:5434` (maps to container `5432`). Password is in `.env.production` (`POSTGRES_PASSWORD`).
- **Access:** `docker exec -it hbcfield-postgres psql -U doergo -d doergo`
- **ORM:** Prisma. **Canonical schema:** `apps/api/auth-service/prisma/schema.prisma`. Migrations: `apps/api/auth-service/prisma/migrations/`.

### 6.1 Prisma version note
Prisma **v7** is in use. Generate the client with `pnpm db:generate` (not `npx prisma generate`).

### 6.2 How migrations run in production
The **auth‑service container entrypoint runs `prisma migrate deploy` on startup**, applying any pending migrations. `task-service` uses the auth‑service Prisma client (its own schema copy may lag — treat auth‑service's schema as source of truth).

### 6.3 Applying a migration safely (when new code depends on it)
Run the migration via a one‑off container **before** swapping the app, so there's no window where new code runs against an old schema:
```bash
cd /opt/doergo/infra/docker
docker compose --env-file .env.production run --rm auth-service npx prisma migrate deploy
# (or bring up auth-service alone first, which runs migrate on boot, then the rest)
```
⚠️ **Prod schema has historical drift** (some objects were once created via `db push`). When authoring new migrations, generate them against the live DB (`prisma migrate diff --from-url <prod>`) and make them **idempotent** (`ADD COLUMN IF NOT EXISTS`, etc.).

### 6.4 Backups (ACTION REQUIRED — verify/establish)
Confirm a backup exists. Recommended: nightly `pg_dump` off‑server.
```bash
docker exec hbcfield-postgres pg_dump -U doergo -d doergo | gzip > /backups/doergo_$(date +%F).sql.gz
```
Set up a cron + off‑site copy + periodic restore test. **This is a gap to close on day one if not already in place.**

---

## 7. Deployment procedure (the REAL process)

> `deploy.sh` exists but its first step is `git pull origin main`, which **fails** because the server's GitHub deploy key is unauthorized. Until that key is fixed, use the **git‑bundle** delivery below. (Fixing the deploy key so `git pull` works is a worthwhile day‑one task — then `deploy.sh` becomes usable.)

### 7.1 Delivery via git bundle (from a machine that has the repo + SSH to the server)
```bash
# 1. On your machine: create an incremental bundle of new commits
SERVER_MAIN=$(ssh root@<SERVER_IP> 'cd /opt/doergo && git rev-parse HEAD')
git bundle create /tmp/deploy.bundle main --not $SERVER_MAIN

# 2. Ship it
scp /tmp/deploy.bundle root@<SERVER_IP>:/tmp/deploy.bundle

# 3. On the server: tag a rollback point, fast-forward main
ssh root@<SERVER_IP> 'cd /opt/doergo && \
  git tag -f prod-rollback '"$SERVER_MAIN"' && \
  git fetch /tmp/deploy.bundle main && \
  git merge --ff-only FETCH_HEAD'
```
**Never `git reset`** on the server — use `merge --ff-only`. The server may hold local‑only commits and a locally‑modified `.env.production`/override that must be preserved.

### 7.2 Build + run (on the server, in `/opt/doergo/infra/docker`)
```bash
cd /opt/doergo/infra/docker
# Build only the services whose code changed (faster). Example: all backend + web:
docker compose --env-file .env.production build auth-service api-gateway task-service web-app
# Apply migrations first if the new code needs them (see §6.3), then:
docker compose --env-file .env.production up -d
docker compose --env-file .env.production ps   # verify all healthy
```
For a change that touches the DB schema and the guards (like billing): bring up **auth‑service first** (applies migration), run any data backfill, **then** bring up the rest. This avoids a window where the new gateway rejects requests against un‑backfilled data.

### 7.3 Rollback
```bash
cd /opt/doergo && git reset --hard prod-rollback    # (or the tagged pre-deploy commit)
cd infra/docker && docker compose --env-file .env.production build <services> && \
  docker compose --env-file .env.production up -d
```
DB migrations are additive; a code rollback usually needs no DB rollback. Existing rollback tags on the server include `prod-pre-billing`, `prod-pre-trialsweep`.

---

## 8. Billing / Stripe subscription system

Full technical detail lives in `docs/billing-feature-gating.md`, `docs/billing-architecture.md`, `docs/billing-plan.md`. Summary for operators:

### 8.1 Pricing model
- **Office seat** (web‑access user): €29 / €59 / €99 per user/mo by tier (Starter/Professional/Business).
- **Field seat** (mobile‑only user): €19 flat.
- **Enterprise:** from €199 (sales‑assisted).
- **Annual** = 2 months free (monthly × 10). **14‑day Professional trial**, no card.
- Seat type is derived from **platform access**, not role (source of truth: `packages/shared/src/billing/{plans,seats}.ts`).

### 8.2 How enforcement works (server‑side)
Gateway global guard chain: `Throttler → JwtAuthGuard → RolesGuard → OnboardingCompleteGuard → PermissionsGuard → SubscriptionGuard → PlanGuard → ModuleGuard`.
- **SubscriptionGuard** — blocks all writes (HTTP **402**) when the org's `subStatus` is locked (canceled/incomplete); reads and `/billing`,`/auth` paths pass.
- **PlanGuard** (`@RequirePlan`) — gates premium capabilities by tier (402 with the required tier). Reads pass.
- **ModuleGuard** (`@RequireModule`) — gates task‑feature modules (sprints/epics/phases/etc.). Reads pass.
- All are **O(1)** token‑field reads (no DB per request) → ~25 ms API latency.

### 8.3 Stripe integration
- **Hosted Checkout + Customer Portal + webhooks** — the app never sees card data (PCI SAQ‑A).
- Webhook endpoint: `POST https://hbcfield.com/api/v1/billing/webhooks/stripe` → gateway (reads raw body) → auth‑service verifies signature (`STRIPE_WEBHOOK_SECRET`) and applies events idempotently (`billing_events.stripeEventId` unique).
- Purchased tier is resolved from the **actual Stripe price IDs** on each webhook (never trusted from the client).
- **StripeService lives only in auth‑service.** The gateway just forwards the webhook.

### 8.4 Current Stripe state — ⚠️ TEST MODE
- Keys on the server are **test** keys. **No real charges happen.** Real cards are declined at checkout.
- Test products/prices/webhook exist in the Stripe **sandbox** (account HBC GmbH).
- Existing production orgs are **grandfathered to Professional/Active** (no Stripe subscription) — they keep full access without paying.

### 8.5 Trial expiry
An hourly cron in auth‑service (`BillingService.expireTrials`) locks no‑card trials whose 14‑day window has passed (`subStatus → INCOMPLETE`, read‑only) — restored when they subscribe. Card‑on‑file trials are governed by Stripe's own events.

### 8.6 Going LIVE with Stripe (step‑by‑step — DO NOT skip tax)
1. **Stripe account activation** — already done (the account has real payout history).
2. **VAT/tax** — HBC GmbH is an EU company; VAT applies. Set up **Stripe Tax** (origin address + registrations + B2B reverse‑charge) *before* going live, or handle VAT another way. This is a **compliance decision for the owner/accountant.**
3. **Create LIVE products/prices** (Stripe → Live mode): 4 products, 8 recurring EUR prices — Office Starter €29/€290, Office Professional €59/€590, Office Business €99/€990, Field €19/€190 (monthly/annual).
4. **Create a LIVE webhook** → `https://hbcfield.com/api/v1/billing/webhooks/stripe`, events: `checkout.session.completed`, `customer.subscription.created/updated/deleted`, `invoice.paid`, `invoice.payment_failed`.
5. **Swap env** in `/opt/doergo/infra/docker/.env.production`: replace the test `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and the 8 `STRIPE_PRICE_*` IDs with the **live** values; set `STRIPE_AUTOMATIC_TAX=true` (only after Stripe Tax is active).
6. **Recreate auth‑service:** `docker compose --env-file .env.production up -d auth-service`.
7. **Test with a real card** (small amount) end‑to‑end, then announce.

The 8 price IDs + `STRIPE_AUTOMATIC_TAX` are non‑secret; the 2 secrets (`sk_live_…`, `whsec_…`) must be pasted by a human — do not commit them.

---

## 9. Mobile app (Expo / EAS)

- **Managed Expo workflow** (no committed `android/`/`ios` dirs — EAS prebuilds them). SDK **54**, bundle id `com.hbcfield.app` (both platforms).
- **Config:** `apps/mobile/app.config.ts` (dynamic), build profiles in `apps/mobile/eas.json`.
- **Versioning:** `appVersionSource: remote` + `autoIncrement` — EAS manages build numbers. App `version` is `1.0.0`.
- **API base (prod builds):** `EXPO_PUBLIC_API_URL=https://hbcfield.com/api/v1`.

### 9.1 EAS Update (OTA) — configured
- `expo-updates` is installed; update URL `https://u.expo.dev/<EXPO_PROJECT_ID>`; **`runtimeVersion` policy = `appVersion`** (i.e. tied to the `version` string `1.0.0`).
- **⚠️ Do NOT switch to the `fingerprint` runtime policy** — it fails the EAS "Configure expo‑updates" phase for this managed project (fingerprint mismatches pre/post prebuild). Stay on `appVersion`.
- **OTA rule:** JS‑only changes → publish OTA (`eas update --branch production --message "…"`), reaches installed apps of the same `version`. **Native changes** (new native lib, permission, config) → **bump `version` in `app.config.ts`** and do a full build + store submission, so old OTA payloads can't reach the new build.
- Channels (eas.json): `production`, `preview`, `development`.

### 9.2 Build & submit
```bash
cd apps/mobile
# Build (both platforms), queue on EAS servers:
eas build --platform all --profile production --non-interactive
# Submit:
eas submit -p android --profile production --latest   # → Play internal track (service account, non-interactive)
eas submit -p ios --profile production --latest        # → App Store Connect (requires Apple 2FA — interactive)
```
After submit: **Android** — promote Internal → Production in Play Console. **iOS** — submit for review + release in App Store Connect.

### 9.3 Current mobile state (2026‑07‑12)
- Latest production build: **iOS build 8 + Android version code 8** (commit `54c1422`), includes the billing subscription‑lock UI and the OTA base.
- **Android build 8 submitted** to Play internal track (status COMPLETED). **iOS build 8 NOT yet submitted** (needs Apple 2FA).
- The mobile subscription lock is **defense‑in‑depth** — the real enforcement is server‑side (402), so there's no gap even on older installed app versions.

---

## 10. Environment configuration

### 10.1 `.env.production` (server, `/opt/doergo/infra/docker/`) — keys (values are secret)
| Key | Purpose |
|---|---|
| `DOMAIN` | `hbcfield.com` |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Postgres creds (`doergo`) |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | JWT signing (rotate carefully — invalidates sessions) |
| `JWT_ACCESS_EXPIRATION` / `JWT_REFRESH_EXPIRATION` | Token lifetimes |
| `SMTP_HOST/PORT/USER/PASS/FROM` | Transactional email |
| `GOOGLE_MAPS_API_KEY` | Maps |
| `SOCKET_ADMIN_USER` / `SOCKET_ADMIN_PASSWORD` | Socket.IO Admin UI |
| `STRIPE_SECRET_KEY` | Stripe secret (**test** now) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing (**test** now) |
| `STRIPE_AUTOMATIC_TAX` | `false` (turn on with Stripe Tax) |
| `STRIPE_PRICE_*` (8) | Stripe price IDs (starter/pro/business office + field, monthly/annual) |

### 10.2 docker-compose.override.yml (IMPORTANT)
The compose services use explicit `environment:` lists, **not** `env_file`. The `STRIPE_*` variables are injected into **auth‑service** via `docker-compose.override.yml` (references only, e.g. `STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY}` — values interpolate from `.env.production`). If you add new env that a service needs, add it to that service's `environment:` (base compose or the override), not just `.env.production`.

---

## 11. Monitoring & health checks

| Check | How |
|---|---|
| Container health | `docker ps --filter name=hbcfield- ` (all should be `healthy`) |
| Web up | `curl -s -o /dev/null -w '%{http_code}' https://hbcfield.com/` → 200 |
| API up | `curl … https://hbcfield.com/api/v1/auth/me` → 401 (unauthed) |
| Billing webhook wired | `curl -X POST …/api/v1/billing/webhooks/stripe -d '{}'` → 400 "Invalid signature" |
| Logs | `docker logs --tail 100 hbcfield-<service>` |
| Bull Board (jobs) | `http://localhost:4000/admin/queues` (via SSH tunnel) |
| Socket.IO stats | `curl http://localhost:4001/socket/stats` |
| Swagger | `http://localhost:4000/docs` (via SSH tunnel) |
| Prometheus/Grafana | monitoring‑* containers exist on the host (shared) |

**Recommended to add:** external uptime monitor on `https://hbcfield.com/` and the API, alerting on non‑200 / container unhealthy, and disk‑space alerts (shared box).

---

## 12. Operations runbook

- **Restart one service:** `cd /opt/doergo/infra/docker && docker compose --env-file .env.production up -d <service>` (or `restart <container>`).
- **Tail logs:** `docker logs -f hbcfield-<service>`.
- **DB shell:** `docker exec -it hbcfield-postgres psql -U doergo -d doergo`.
- **Redis shell:** `docker exec -it hbcfield-redis redis-cli`.
- **Apply a hotfix:** deliver via §7.1 bundle → build the changed service(s) → `up -d`.
- **Change an env value:** edit `.env.production` → recreate the affected service(s) (`up -d <service>`); env changes need a container recreate, not just restart.
- **Rollback:** §7.3.
- **Free a stuck BullMQ job:** Bull Board (`/admin/queues`) → retry/remove; or `docker exec hbcfield-redis redis-cli` → inspect `bull:*`.

---

## 13. Known limitations & technical debt

1. **Broken server deploy key** → no `git pull`; bundle workaround required (§7). *Fix this early.*
2. **No verified DB backup** — confirm/establish (§6.4). *Highest‑priority gap.*
3. **Billing enforcement lag ≤60s** — the gateway caches the validated token (`AUTH_CACHE_TTL`, default 60s), so plan/subscription changes reflect within ≤60s. Bounded and by‑design (it's what makes requests fast). To make lock/unlock instant, add org‑scoped cache invalidation.
4. **Seat‑reconcile debounce is per‑process** — fine on one auth‑service instance; needs a Redis lock before running multiple auth‑service replicas.
5. **Prod schema drift** — write new migrations idempotently against the live DB (§6.3).
6. **task-service Prisma schema may lag** auth‑service's — auth‑service is source of truth.
7. **Stripe in test mode** — real payments not enabled (§8.6).
8. **No self‑service account/data deletion** — GDPR erasure is currently a manual DB+Stripe operation.
9. **Single server, shared with other projects** — no HA/failover; a host issue affects all tenants. Consider isolating HBCField and adding redundancy as it grows.

---

## 14. Outstanding tasks / roadmap

**Immediate (owner or IT):**
- [ ] **iOS submit** build 8 (`eas submit -p ios …`, Apple 2FA) + release in App Store Connect.
- [ ] **Promote Android** build 8 Internal → Production in Play Console.
- [ ] **Verify/establish DB backups** (§6.4).
- [ ] **Fix the server GitHub deploy key** (so `git pull`/`deploy.sh` work).

**Before charging real money:**
- [ ] **Stripe Tax** setup (owner/accountant) → then the **test→live switch** (§8.6).

**Nice‑to‑have / scale:**
- [ ] External uptime + disk monitoring/alerting.
- [ ] Org‑scoped auth‑cache invalidation (instant billing enforcement).
- [ ] Redis lock for seat‑reconcile before multi‑replica.
- [ ] Self‑service "close account & delete data" flow (GDPR).
- [ ] Email templates (email notifications are partial).

---

## 15. Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Deploy `git pull` fails | Broken deploy key — use bundle delivery (§7.1). |
| Web/API 502 | A container is down/unhealthy → `docker ps`, `docker logs …`, `up -d <service>`. |
| Webhook returns 503 "Billing not configured" | auth‑service missing `STRIPE_*` env → check `docker-compose.override.yml` + recreate auth‑service (§10.2). |
| Webhook 400 "Invalid signature" on a real Stripe event | `STRIPE_WEBHOOK_SECRET` doesn't match the webhook endpoint's secret (test vs live mismatch). |
| Existing customers lose premium after a billing deploy | Backfill not run — orgs with `planTier IS NULL` are blocked. Backfill: `UPDATE organizations SET "planTier"='PROFESSIONAL',"subStatus"='ACTIVE' WHERE "planTier" IS NULL;` |
| Real card declined in checkout | Stripe is in **test mode** — only test card `4242 4242 4242 4242` works. Go live to accept real cards (§8.6). |
| Mobile build fails at "Configure expo‑updates" | Do not use `fingerprint` runtime policy — keep `appVersion` (§9.1). |
| Duplicate tasks / stuck jobs | BullMQ — Bull Board `/admin/queues`; kill zombie processes; ensure single processor. |
| DB "column does not exist" after deploy | Migration not applied — run `prisma migrate deploy` via one‑off container (§6.3). |

---

### Reference docs (in this repo, `docs/`)
- `billing-feature-gating.md` — deep billing/gating architecture + Stripe go‑live checklist.
- `billing-architecture.md` — Stripe flows, security, performance.
- `billing-plan.md` — pricing/product decisions. · `pricing.md` — pricing strategy.
- `CLAUDE.md` (repo root) — full API/endpoint/schema reference for developers.
