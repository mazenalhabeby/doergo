# HBCField — Master Build Plan: Scalable Architecture → Voice/Video Calling

> **Purpose.** One detailed, phased plan to (A) migrate HBCField to an auto-scaling,
> near-zero-idle-cost architecture on **Azure**, then (B) add **voice + video calling**
> that is best-in-class quality, high security, and costs almost nothing.
>
> **Sequencing.** Do **Part A first** (the platform), then **Part B** (calling). Part B
> is designed so the *media plane is owned by Cloudflare* — it needs no always-on server
> and therefore does not break Part A's scale-to-zero model.
>
> **Status legend:** ☐ todo · ◐ in progress · ☑ done
>
> _Last updated: 2026-08-16_

---

## 0. Principles (apply to every phase)

- **Each phase is independently shippable and reversible.** Never a big-bang cutover.
- **Stateless services.** Sessions in Redis/JWT, uploads in object storage, no local disk,
  DB via a pooler, config via secret manager. This is the real migration work.
- **Infra as code.** Terraform for everything (platform, DB, Redis, storage, DNS, secrets).
- **Secrets never in git.** Azure Key Vault (or platform secret store). `.env.production`
  stays off the repo (as today).
- **Observability from day one.** Metrics, logs, alerts (email + Telegram) per environment.
- **Three environments:** `dev` / `staging` / `prod`, isolated.
- **Media servers are NOT serverless.** WebRTC relays (TURN/SFU) need always-on, stateful,
  UDP endpoints — so we **don't self-host them**; Cloudflare Realtime provides them at the
  edge. This is the single most important design decision tying Part A and Part B together.

---

# PART A — Scalable Architecture on Azure

## A.1 Current state (baseline)

- Single Hetzner VPS, Docker Compose behind nginx, Cloudflare in front.
- Shares the box with ~6 unrelated projects (~30 containers). We want HBCField isolated.
- Services (NestJS microservices + Next.js + Expo):
  - `web-app` (Next.js) · `api-gateway` (public API) · `auth-service` · `task-service`
    · `notification-service` (Socket.IO) · `tracking-service`
- Data: PostgreSQL + PostGIS, Redis, PgBouncer, Photon geocoder (large in-memory OSM index).
- Object storage: Hetzner S3-compatible (bucket `hbcfield`) — already used for uploads.
- Traffic near-zero today; must scale to real paying users.

## A.2 Target architecture

```
                       ┌──────────────────────────────┐
   Users ────────────► │  Cloudflare (DNS/TLS/CDN/WAF) │  DDoS, edge cache, TURN/SFU (Part B)
                       └───────────────┬──────────────┘
                                       │ HTTPS
                       ┌───────────────▼──────────────┐
                       │  Azure Container Apps ingress │  (built-in HTTP LB + TLS + revisions)
                       └───────────────┬──────────────┘
                                       │  (internal ingress, VNet-private svc-to-svc)
   ┌───────────┬───────────┬──────────┼───────────┬─────────────┬──────────────┐
   ▼           ▼           ▼          ▼           ▼             ▼              ▼
 web-app   api-gateway  auth-svc   task-svc  notification-svc tracking-svc  photon-geocoder
 (Next.js) (public)    0→N        0→N        min=1 (sockets)   0→N          min=1 (always-on)
 min=1     min=1
   └───────────┴───────────┴──────────┼───────────┴─────────────┘
                                       │  Managed data (private endpoints / TLS)
   ┌───────────────────────────────────┼───────────────────────────────────┐
   ▼                                   ▼                                     ▼
 Postgres + PostGIS                 Redis                               Object storage
 (Azure Flexible Server OR Neon)    (Azure Cache OR Upstash)            (Cloudflare R2 OR Azure Blob)
 pooled (PgBouncer/built-in)        sessions, cache, BullMQ queues      uploads, assets (S3-compatible)
```

### A.2.1 Platform choice — **Azure Container Apps (ACA)**
You're going Azure, so ACA is the pick (managed Kubernetes-less containers with built-in
ingress LB, TLS, revisions, and KEDA autoscaling incl. **scale-to-zero**).

- **Why ACA over AKS:** no cluster to run; per-revision traffic splitting = zero-downtime
  deploys + instant rollback; scale rules by HTTP concurrency / CPU / queue length; native
  Dapr/KEDA. AKS is overkill until you need fine-grained orchestration.
- **Scale rules:**
  - `web-app`, `api-gateway`: **min=1** (never cold-start a user), max by budget.
  - `auth-service`, `task-service`, `tracking-service`: **min=0** (scale-to-zero), scale on
    HTTP concurrency; ~1–3s cold start acceptable for rare/background hits.
  - `notification-service`: **min=1** — it holds **Socket.IO** connections (real-time
    presence, chat, geofence, shift-issue events, **and Part B signaling**). WebSocket
    servers must stay warm and sticky; do **not** scale this to zero. Enable **session
    affinity** on its ingress, and use the **Redis Socket.IO adapter** so multiple replicas
    share rooms (see A.4.3).
  - `photon-geocoder`: **min=1** — the OSM index is huge and slow to cold-start. Always-on
    small instance, or swap to a hosted geocoding API.

### A.2.2 Data layer options (pick per cost/control)
| Concern | Option 1 (Azure-native) | Option 2 (best-of-breed serverless) |
|---|---|---|
| Postgres+PostGIS | **Azure DB for PostgreSQL Flexible Server** (PostGIS extension supported; built-in connection pooling) | **Neon** (autoscale + sleep-when-idle, branching, pooled) |
| Redis | **Azure Managed Redis** | **Upstash** (serverless, per-request) |
| Object storage | **Azure Blob** (S3-compat via API differences) | **Cloudflare R2** (S3-compatible, zero egress fees) |

- **Recommendation:** For a clean Azure footprint use **Azure PostgreSQL Flexible Server +
  Azure Managed Redis**, and keep object storage on **Cloudflare R2** (S3-compatible so the
  existing `@aws-sdk/client-s3` code works unchanged, and **R2 has no egress fees** — big
  win for serving uploaded photos/attachments). If you prefer scale-to-zero DB economics,
  Neon is excellent and Postgres-wire-compatible.
- **PostGIS:** confirm the extension is enabled on the target Postgres; tracking-service +
  spatial queries depend on it.
- **Pooling:** ACA scale-out multiplies DB connections. Keep a pooler (Flexible Server's
  built-in pooling or PgBouncer sidecar). Prisma runtime URL uses the pooled endpoint;
  **migrations use the DIRECT url** (as today).

## A.3 Statelessness audit (the prerequisite — do before moving anything)

Audit each service for local state and remove it:

- ☐ **Uploads / local disk.** Anything writing to the container filesystem must go to object
  storage. Known culprits from the current app: **avatar/cover uploads served from
  gateway `/uploads/`** (local files → nginx alias today). Move these to R2/Blob + signed
  URLs, exactly like task/worklog/shift-issue attachments already do. Also the **APK/download
  files** served from a host nginx alias — move to object storage + Cloudflare.
- ☐ **Sessions.** Confirm auth is JWT + refresh in DB/Redis (it is) — no in-memory session.
- ☐ **Socket.IO.** Currently single-instance. For >1 replica, add the **Redis adapter**
  (`@socket.io/redis-adapter`) so rooms/broadcasts fan out across replicas. (Required before
  scaling notification-service, and for Part B signaling at scale.)
- ☐ **BullMQ.** Already Redis-backed — fine, but ensure the Redis is the shared managed one.
- ☐ **In-memory caches.** e.g. the gateway's per-request token/user cache and the
  notification-routing TTL cache are fine (per-instance, self-healing), but must not be a
  correctness dependency across instances.
- ☐ **Cron/singletons.** Trial-expiry `@Cron`, no-show sweep, recurring-task poller,
  SLA/geofence timers — these must run **exactly once**, not once-per-replica. Options:
  a dedicated `min=1,max=1` "worker" revision, or a distributed lock in Redis, or ACA
  scheduled jobs. **Audit every `@Cron`/`setInterval`/poller and pin it to a single runner.**
- ☐ **File-system temp.** Any PDF/report generation writing temp files → use `/tmp` only as
  ephemeral scratch, never as durable state.

**Deliverable:** a checklist PR per service proving "no durable local state."

## A.4 Phased migration

### Phase A0 — Foundations (no traffic moved) ☐
- ☐ New Azure subscription + resource groups per env (`hbcfield-dev/staging/prod`).
- ☐ **Terraform** skeleton: ACA environment, VNet, Key Vault, Postgres, Redis, storage,
  Log Analytics, Container Registry (ACR). State in an Azure Storage backend.
- ☐ **Secrets → Key Vault**; wire ACA secret references (no plaintext env).
- ☐ **CI/CD**: GitHub Actions — build each service image → push to ACR → `az containerapp
  update` per service. Reuse the existing per-service Dockerfiles.
- ☐ Cloudflare: add the new hostnames (staging first), keep prod DNS on Hetzner until cutover.

### Phase A1 — Make services stateless ☐
- ☐ Execute the A.3 audit fixes (avatars/APK → object storage; Socket.IO Redis adapter;
  pin all cron/pollers to a single runner). Ship to the **current Hetzner box first** (each
  fix is independently deployable and reversible) so statelessness is proven before the move.

### Phase A2 — Stand up the data layer ☐
- ☐ Provision Postgres (Flexible Server or Neon) + enable **PostGIS**.
- ☐ Provision Redis (Azure Managed / Upstash).
- ☐ Provision object storage (R2/Blob); migrate existing bucket objects (rclone/`mc`).
- ☐ **DB migration:** `pg_dump` prod → restore to target; verify PostGIS, row counts, and a
  `prisma migrate diff` shows no drift. Rehearse on **staging** with a prod snapshot.

### Phase A3 — Deploy to ACA (staging) ☐
- ☐ Deploy all services to the **staging** ACA env pointed at staging data.
- ☐ Configure scale rules (A.2.1), ingress, session affinity for notification-service,
  health probes, and revisions.
- ☐ End-to-end test: auth, tasks, attendance, tracking, chat/sockets, uploads, billing
  webhooks, push. Load-test cold-start behavior.

### Phase A4 — Prod cutover ☐
- ☐ Freeze writes briefly (or use logical replication for near-zero downtime), final DB sync.
- ☐ Point Cloudflare DNS → ACA prod ingress. Watch metrics.
- ☐ **Rollback path:** keep the Hetzner stack running & in-sync for N days; DNS flip back if
  needed. Tag the last Hetzner release.
- ☐ Decommission Hetzner once stable.

### Phase A5 — Observability & hardening ☐
- ☐ Log Analytics dashboards + alerts (5xx rate, latency, DB conns, Redis, queue depth,
  cold-starts) → email + Telegram (reuse existing alerting).
- ☐ Autoscale tuning, budget caps (`max` replicas per service), WAF rules on Cloudflare.

## A.5 Cost estimate (order-of-magnitude, EUR/mo)

| Scenario | web+gateway (min=1) | scale-to-zero svcs | notif+photon (min=1) | Postgres | Redis | Storage | ~Total |
|---|---|---|---|---|---|---|---|
| **Idle** | ~10–25 | ~0 | ~15–25 | ~15 (or ~0 Neon sleep) | ~10 (or ~0 Upstash) | ~1 | **~€40–70** |
| **~10k MAU** | ~25–50 | ~10–30 | ~25–40 | ~30–60 | ~10–20 | ~5 | **~€120–220** |
| **~100k MAU** | ~80–150 | ~60–150 | ~60–120 | ~120–300 | ~40–80 | ~20 | **~€400–900** |

> Numbers are indicative; the levers are `min`/`max` replicas and DB tier. R2's zero egress
> keeps media-serving cheap regardless of scale.

## A.6 Risks / notes
- **Cold starts** on `min=0` services — mitigated by keeping user-facing services warm.
- **Socket.IO across replicas** — requires the Redis adapter + sticky ingress (do it in A1).
- **Cron duplication** — the #1 correctness trap when scaling; pin to a single runner.
- **PostGIS parity** — verify extension + spatial index behavior on the target.
- **Stripe webhooks** — keep the raw-body handling + a stable public URL through Cloudflare.

---

# PART B — Voice + Video Calling

> Build **after** Part A. Media is owned by **Cloudflare Realtime**; your services only do
> **signaling** (Socket.IO, already `min=1`) and **credential minting** (auth-service).

## B.1 Architecture

```
Caller (mobile/web)                                   Callee (mobile/web)
   │  1. "call user X"  (Socket.IO via notification-service)
   ├──────────────────────────────────────────────────────►│  2. ring (socket + push)
   │  3. exchange SDP offer/answer + ICE candidates (Socket.IO relay)
   │◄──────────────────────────────────────────────────────►│
   │                                                         │
   │  media: DTLS-SRTP encrypted, P2P DIRECT when possible ──┤  (1:1 = lowest latency)
   │                        │ if NAT blocks P2P ▼            │
   │              Cloudflare Realtime TURN (global anycast, turns:// TLS)
   │                                                         │
   └── (Phase B2 group only) Cloudflare Realtime SFU ────────┘
```

- **Topology:** **P2P for 1:1** (best quality — no server hop), **SFU for 3+** (Phase B2).
- **Signaling:** reuse **notification-service Socket.IO** — new events only, no new infra.
- **ICE servers:** Cloudflare **STUN** (`stun.cloudflare.com`, free/unlimited) + Cloudflare
  **TURN** (ephemeral credentials, `turns://` over TLS, 1,000 GB/mo free then $0.05/GB).
- **Ringing when app is backgrounded:** push (Expo/FCM/APNs) with a high-priority call
  payload; on iOS use **CallKit**, on Android **ConnectionService/Notifee full-screen intent**
  for native call UX (Phase B1.5, optional but recommended for reliability).

## B.2 Security
- **Media E2E-encrypted by default** (DTLS-SRTP) — non-negotiable, automatic.
- **Ephemeral TURN credentials** minted per call by auth-service via the Cloudflare API
  (short TTL, never shipped in the app bundle).
- **Signaling authorization:** only authenticated users; verify caller & callee share an org
  (or an allowed relationship) before relaying SDP — reuse the existing guard chain.
- **Call authorization model:** who can call whom (same org; admin↔member; issue participants).
- **Optional E2EE for SFU/group** via insertable streams (Phase B2, if required).
- **Privacy/consent:** explicit mic/camera permission prompts; optional "recording" is a
  separate, clearly-consented feature (not in scope now).

## B.3 Data model (Prisma — minimal, for history/audit)
```
model Call {
  id             String   @id @default(cuid())
  organizationId String
  initiatorId    String
  kind           String   // AUDIO | VIDEO
  status         String   // RINGING | ONGOING | ENDED | MISSED | DECLINED
  startedAt      DateTime @default(now())
  answeredAt     DateTime?
  endedAt        DateTime?
  // context (optional): where the call was started from
  contextType    String?  // CHAT | MEMBER | ISSUE
  contextId      String?
  participants   CallParticipant[]
  @@index([organizationId, startedAt])
}
model CallParticipant {
  id       String @id @default(cuid())
  callId   String
  call     Call   @relation(fields: [callId], references: [id], onDelete: Cascade)
  userId   String
  joinedAt DateTime?
  leftAt   DateTime?
  @@index([callId])
}
```
Migration: additive, idempotent (same hand-authored pattern used across the app).

## B.4 Backend work
- ☐ **auth-service:** `POST /calls/ice-servers` → returns Cloudflare STUN + freshly-minted
  ephemeral TURN credentials (call the Cloudflare Realtime TURN API with the account key
  from Key Vault). Short TTL.
- ☐ **gateway:** `POST /calls` (start → creates `Call` RINGING), `POST /calls/:id/answer`,
  `/decline`, `/end`; `GET /calls` (history). All org-scoped.
- ☐ **notification-service (Socket.IO signaling):** events
  `call:invite` · `call:ringing` · `call:answer` · `call:decline` · `call:ice` (candidate
  relay) · `call:sdp` (offer/answer relay) · `call:end`. Rooms per `call:{id}`; deliver
  `call:invite` to the callee's `user:{id}` room + a push. Requires the **Redis Socket.IO
  adapter** from Phase A1 if notification-service runs >1 replica.
- ☐ **push:** high-priority call notification (data-only) that triggers the native ringer.

## B.5 Web work
- ☐ Browser WebRTC (`RTCPeerConnection`) — no dependency to install.
- ☐ Call UI: incoming-call modal (accept/decline), in-call screen (local+remote video,
  mute, camera flip/off, hang up, connection-quality indicator).
- ☐ Entry points (decide which): chat header, member profile, shift-issue thread.
- ☐ Reconnection handling (ICE restart on network change).

## B.6 Mobile work (Expo) — **needs a fresh EAS build**
- ☐ Add `react-native-webrtc` + `@config-plugins/react-native-webrtc` (config plugin;
  camera/mic permission strings). **Not Expo Go, not OTA-able** — requires a dev build to
  test and a **store re-submission** to ship.
- ☐ Call screens mirroring web; `expo-av`/`InCallManager` for speaker/proximity/ringtone.
- ☐ **CallKit (iOS)** + **ConnectionService/full-screen notification (Android)** for
  ringing when the app is killed/backgrounded (Phase B1.5).
- ☐ Wire ICE servers from `/calls/ice-servers`; signaling over the existing socket.

## B.7 Phasing
- **Phase B1 — 1:1 voice + video** (P2P + Cloudflare STUN/TURN, socket signaling, in-app
  ring, call screens web+mobile). One EAS build. Covers ~all field-service needs. ☐
- **Phase B1.5 — native call UX** (CallKit / ConnectionService + push ringing when
  backgrounded). ☐
- **Phase B2 — group calls** (add Cloudflare Realtime **SFU**; multi-tile UI; optional
  E2EE). Only if team huddles are wanted. ☐

## B.8 Cost (calling)
| Piece | Cost |
|---|---|
| Signaling (existing Socket.IO) | €0 |
| STUN (Cloudflare) | €0 unlimited |
| TURN (Cloudflare) | €0 up to 1,000 GB/mo, then $0.05/GB |
| SFU groups (Cloudflare, Phase B2) | €0 within shared free tier, then $0.05/GB |
| Media servers to operate | **none** |

## B.9 Why this fits Part A
- No always-on media box → **doesn't break scale-to-zero**.
- Only touches `notification-service` (already `min=1`) + `auth-service` (credential mint).
- Cloudflare is already your edge → the media plane rides the same global network.

---

# PART C — Platform Control Center (company super-admin) + Dynamic Pricing

> The company/platform owner's cockpit to run the whole SaaS: every organization,
> subscriptions, seats, members/roles, feature modules, and — the hard part —
> **editable pricing that syncs to live Stripe**.
>
> ⚠️ **This touches LIVE billing on real paying customers.** Editable prices are
> built *last*, behind a rehearsed Stripe-migration path, never bolted onto a UI.

## C.1 What exists today (baseline)
- Hidden **`/operator`** console, gated by `PLATFORM_ADMIN_KEY` (pasted once →
  sessionStorage → sent as `x-platform-admin-key`; no customer login). Today it lists
  orgs (`GET /billing/admin/orgs`) and sets an org's tier.
- **Pricing is hard-coded** in `packages/shared/src/billing/plans.ts` + `seats.ts`
  (EUR cents), and **tied to live Stripe price IDs resolved from env** (8 prices).
  Office seat by tier; field seat flat €15/€19; in-house field €9. Annual = ×10.
- **Modules are tier-gated, NOT individually billed** (`tierAllows()` + `enabledModules`).
  Per-module *pricing* does not exist.

## C.2 Security model (super-admin)
- Keep it **out of the customer app**. Two options, decide in C.7:
  1. **Keep the `PLATFORM_ADMIN_KEY` header** model (simple, already there), OR
  2. Introduce a real **PLATFORM_ADMIN user role** with its own login + 2FA + audit
     (better long-term; more work).
- Every mutating action **audit-logged** (who/when/what — reuse the audit interceptor),
  especially price changes and org suspensions. Rate-limit. IP-allowlist optional.

## C.3 Phase C1 — Control Center foundation (SAFE, no billing risk) ☐
Extend `/operator` into a real dashboard (or a new `/platform` area):
- ☐ **Overview**: total orgs, active subs, trialing, past-due, MRR/ARR, seat totals
  (office/field/in-house), new signups, churn — computed from existing billing data.
- ☐ **Organizations** list + **detail drawer**: plan/tier, subStatus, trial/period dates,
  member count + **seat breakdown**, enabled modules, Stripe customer link, created date.
- ☐ **Org actions**: set tier (exists), **extend/adjust trial**, **suspend/reactivate**
  (flip `subStatus` → SubscriptionGuard read-only lock), **offboard** (careful, soft),
  **impersonate/support-view** (read-only, heavily audited — optional).
- ☐ **Members & roles view** (per org): roster + seat classification (office/field/
  in-house), access profiles, member roles.
- ☐ **Pricing & modules (READ-ONLY here)**: render the live plan/seat/module config so
  it's all visible in one place before it becomes editable.
- Backend: extend the existing `billing/admin/*` (auth-service) endpoints; all behind the
  platform-admin gate. **No Stripe writes in C1.**

## C.4 Phase C2 — Pricing becomes DATA (still no live-Stripe mutation) ☐
Move pricing from hard-coded constants → a **DB source of truth**, seeded from today's
values so nothing changes on day one:
- ☐ New Prisma models (auth-service schema):
  ```
  model PricingConfig {          // one active row = current price book (versioned)
    id String @id @default(cuid())
    version Int
    currency String @default("eur")
    active Boolean @default(false)
    createdAt DateTime @default(now())
    createdBy String?
    seatPrices  SeatPrice[]
    modulePrices ModulePrice[]
  }
  model SeatPrice {              // office(by tier) / field / field_inhouse
    id String @id @default(cuid())
    configId String
    seatType String               // office | field | field_inhouse
    tier String?                  // for office: starter|professional|business
    monthlyCents Int
    annualCents Int
    stripePriceId String?         // filled by the sync layer (C3)
  }
  model ModulePrice {            // per-module add-on price (NEW concept)
    id String @id @default(cuid())
    configId String
    moduleKey String              // matches AVAILABLE_MODULES
    monthlyCents Int
    annualCents Int
    billingScope String           // per_org | per_office_seat | per_space
    stripePriceId String?
  }
  ```
- ☐ Backend reads prices from the **active PricingConfig** (fallback to `plans.ts`
  constants if none) — the app/marketing/gating all read one place, as today.
- ☐ Control Center **price editor** writes a **new draft version**; publishing swaps
  `active`. Editing here changes **display + NEW checkouts** only — existing Stripe subs
  untouched until C3. Fully reversible (roll back to the previous version).
- ☐ Idempotent, additive migration; seed v1 from current `plans.ts`/`seats.ts` values.

## C.5 Phase C3 — Live Stripe sync (HIGH RISK — rehearse first) ☐
The hard part: reflect edited prices onto **live** Stripe + existing subscriptions.
- ☐ **Stripe prices are immutable** → on publish, for each changed SeatPrice/ModulePrice:
  create a **new Stripe Price**, store its id on the row, set it as the product's default
  for new checkouts.
- ☐ **Existing subscriptions**: decide policy (in C.7): **grandfather** (keep old price
  until renewal) vs **migrate** (Stripe Subscription update to new price with proration).
  Default = **grandfather** (safest; no surprise charges).
- ☐ **Per-module billing** (new): when a module has a `ModulePrice`, adding it to an org/
  space adds a Stripe subscription item (quantity by `billingScope`); reconcile like seats.
- ☐ **Rehearsal is mandatory**: run the whole publish→sync→proration flow against a
  **Stripe test clock** on a staging Stripe account before touching live. Verify invoices.
- ☐ **Guardrails**: dry-run/preview ("this will create N prices, affect M subs, ~€X
  proration"), require explicit confirm, audit every change, one-click rollback of the
  config version (Stripe prices stay but product default reverts).
- ☐ Backfill note: new prod DBs must have an active PricingConfig or gating/checkout break
  (same lesson as `planTier IS NULL` grandfathering).

## C.6 Phase C4 — Everything else the cockpit needs ☐
- ☐ **Feature-module catalog editor**: toggle which modules exist, group them, set which
  tier unlocks them, mark which are paid add-ons (drives `AVAILABLE_MODULES`/tier maps —
  currently code; move to config like pricing).
- ☐ **Coupons/discounts** (Stripe promotion codes), **manual credits**, **refunds** (link
  out to Stripe or thin wrappers).
- ☐ **Global metrics/BI**: MRR movement, cohort retention, seat mix, module adoption.
- ☐ **Ops**: feature flags, maintenance banner, broadcast announcement, impersonation log.

## C.7 Open decisions (Part C)
- ☐ Auth: keep `PLATFORM_ADMIN_KEY` header, or add a real PLATFORM_ADMIN role + 2FA login?
- ☐ Existing-subscription policy on price change: **grandfather** (recommended) vs migrate?
- ☐ Per-module billing scope: **per org**, **per office seat**, or **per space**?
- ☐ Which modules become **paid add-ons** vs stay **tier-gated** (free within tier)?
- ☐ Surface: extend `/operator`, or a new `/platform` control center?

## C.8 Build order (Part C)
1. **C1** — Control Center foundation (safe; org mgmt + overview + read-only pricing).
2. **C2** — pricing as DB data (editable display/new-checkout prices; no live mutation).
3. **C3** — live Stripe sync (rehearsed on a test clock; grandfather by default).
4. **C4** — module-catalog editor, coupons, BI, ops.

> **Sequencing rule:** never merge C3 without a green test-clock rehearsal. C1+C2 deliver
> most of the visible "control everything" value with zero live-billing risk.

---

# Build order (recommended)

1. **A1** — statelessness fixes on the current box (safe, reversible, valuable immediately).
2. **A0/A2/A3** — Terraform + Azure + data layer, prove on **staging**.
3. **A4/A5** — prod cutover + observability.
4. **C1/C2** — Platform Control Center + pricing-as-data (safe; no live-billing mutation).
5. **B1** — 1:1 calling (one EAS build).
6. **C3** — live Stripe price sync (only after a green test-clock rehearsal).
7. **B1.5 / B2 / C4** — native call UX / group calls / module-catalog + BI, as needed.

> Note: **C1/C2 can start immediately** (they don't depend on the Azure move) and deliver
> most of the "control everything" value with zero billing risk. **C3** is the only piece
> that must wait for a rehearsed Stripe path.

---

# Open decisions (fill in before building)

- ☐ Data layer: **Azure PostgreSQL + Azure Redis** vs **Neon + Upstash**? (recommendation:
  Azure-native for a clean footprint, R2 for storage.)
- ☐ Object storage: **Cloudflare R2** (zero egress, keep current SDK) vs **Azure Blob**?
- ☐ Budget caps: `max` replicas per service; monthly ceiling.
- ☐ Region(s): primary Azure region (EU — e.g. West Europe) for data residency.
- ☐ Calling entry points: chat / member profile / shift-issue thread (any/all).
- ☐ Group calls (Phase B2): needed, or 1:1 only for now?

**Sources (calling research):** Cloudflare Realtime TURN/SFU pricing (1,000 GB free, then
$0.05/GB); WebRTC topology guidance (P2P for 2, SFU for 3–12); `@config-plugins/react-native-webrtc`
(native, not Expo Go / not OTA).
