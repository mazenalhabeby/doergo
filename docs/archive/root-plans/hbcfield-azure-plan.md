# HBCField on Azure — the plan

> Supersedes the target architecture in `hbcfield-scalable-architecture.md`, which was
> written from a diagram. This one is written from measurements taken off production.
> Keep both: that document's *reasons* for moving still stand, its `min=0` design does not.
>
> Measured 23 Aug 2026. Cost figures are directional — price them in the Azure
> calculator for Germany West Central and confirm current SKU names before committing.

**The rule this plan follows: right-size the spend, never the architecture.**
Buy small, because the workload is small. Build so that growing is a number you
change, not a system you rewrite.

---

## 1. Start from the measurements

| | |
|---|---|
| Database | **24 MB** |
| RAM, all services combined | **490 MB** |
| CPU at rest | **< 1 %** |
| Local uploads on disk | **64 KB** |
| Users | **17** |

Ten containers, none above 103 MB, on a box with 8 vCPU / 15 GB shared with six
unrelated projects.

> ⚠️ **Say this out loud before starting.** Azure will cost **more** than the Hetzner
> box, not less. That VPS is ~€50/month carrying seven projects. A right-sized Azure
> footprint for HBCField alone is **~€140–200/month**; a careless one is near €800.
>
> You are buying isolation, managed backups and patching, real CI/CD, secrets that
> aren't plaintext, and room to scale. Saving money is not on the list, and a
> migration sold internally on cost will look like a failure by month two.

---

## 2. The existing plan's central assumption is wrong

`hbcfield-scalable-architecture.md` puts auth, task, notification and tracking at
`min=0`. **They cannot go there.**

All four are NestJS microservices that **subscribe to Redis channels**; the gateway
reaches them with `ClientProxy.send()`. A container scaled to zero has no subscriber,
so the call does not cold-start anything — it waits and times out. Scale-to-zero here
is not a tuning knob, it is a different transport.

| In the code | Count | Consequence |
|---|---|---|
| Services subscribing to Redis (`Transport.REDIS`) | 4 | Cannot be `min=0` |
| BullMQ processors in task-service | 7 | Persistent queue consumers |
| Cron schedules — one runs **every minute** | 5 | Needs an always-on instance |
| Services writing to local disk (`/uploads/`) | 1 | Breaks at two replicas, anywhere |
| Socket.IO with the Redis adapter already wired | 1 | ✅ already fine |

Realistic shape: **six always-on containers, one that genuinely sleeps.** Do not
rewrite the transport during the migration — move first, optimise later.

---

## 3. The stack

| Layer | Choice | Why | ≈ /month |
|---|---|---|---|
| Compute | **Container Apps** | Revisions = zero-downtime deploys + one-command rollback. AKS is far too much operational surface for six services. | €75–110 |
| Database | **PostgreSQL Flexible Server**, Burstable | PostGIS supported; **built-in PgBouncer deletes your PgBouncer container**; your `DIRECT_DATABASE_URL` split maps straight across. | €18–25 |
| Redis | **Managed Redis**, smallest tier **with a replica** | Spend here — see §6. | €35–45 |
| Object storage | **Hetzner S3** — keep | S3-compatible, working, presigned URLs already built. Rewriting for Blob is change with no payoff. | unchanged |
| Email | **HTTP provider** (Resend / Postmark / ACS) | Azure blocks outbound :25; ACA has no stable egress IP without NAT. See §7. | ~€1 |
| Registry | **Container Registry**, Basic | Seven images, low pull volume. | €5 |
| Secrets | **Key Vault** + managed identity | Today: plaintext in `.env.production`, with 15 backup copies beside it. | <€1 |
| Logs | **Log Analytics**, **with a daily cap** | The classic runaway line on an Azure bill. | €5–15 |
| Edge | **Cloudflare** — keep | Already in place, already paid for. | unchanged |
| PgBouncer container | **delete** | Replaced by the managed pooler. | — |
| | **Right-sized, before reservations** | | **€140–200** |

### Sizing

Nothing measured above 103 MB. **0.25 vCPU / 0.5 GiB per container** is already 5× the
observed memory. ACA bills per vCPU-second and GiB-second, so this one choice is most
of the compute bill. Resist round numbers.

| App | Min | Max | Scales on |
|---|---|---|---|
| api-gateway | 1 | 10 | Concurrent HTTP requests |
| web-app | 1 | 10 | Concurrent HTTP requests |
| auth-service | 1 | 4 | CPU — Redis subscriber, cannot sleep |
| task-service | 1 | 6 | **Redis queue depth (KEDA)** — the one that earns its scaling |
| notification-service | 1 | 4 | CPU — holds Socket.IO connections |
| tracking-service | 1 | 4 | CPU — GPS batches arrive in bursts |
| admin-app | **0** | 2 | HTTP — the only genuine scale-to-zero win |

---

## 4. Built small, ready to be big

> 🛑 **Fix before any service runs two replicas.**
> There are **eight `@Cron` schedules across four services and no leader election
> anywhere** — no advisory lock, no mutex. NestJS runs a cron in *every* instance.
> Harmless today because every service runs exactly one.
>
> The day auth-service scales to two, all of them run twice: hourly trial expiry, the
> **nightly billing reconcile that writes Stripe subscription lines**, and a customer
> reminder that fires **every minute** — duplicate emails to real customers, and a
> billing sweep racing itself.
>
> A Postgres advisory lock per job, or a dedicated single-replica worker service.
> **This gates every other scaling decision**, and it is invisible until the moment you
> need it to work.

| Concern | At scale | Cost to change later |
|---|---|---|
| Container size / replica counts | Instantly | a number |
| Database tier | Scale up in place; read replicas for reporting | a restart |
| Socket.IO fan-out | Redis adapter already wired | already done |
| Queue throughput | KEDA adds workers on queue depth | already planned |
| **Cron correctness** | Duplicates on every replica | **blocks scaling** |
| **Local disk state** | Breaks at two replicas | **blocks scaling** |
| One Redis for four jobs | Becomes the contention point | splittable *if config allows separate URLs* |
| Redis as the service bus | Ceiling well past your first 1,000 customers | real refactor, not needed yet |

**Design for today without acting:** let the Redis connection be configured **per role**
(cache / queue / pub-sub), even if all three point at one instance. Splitting later
then costs three environment variables instead of a code change under load.

### The tables that actually grow

Not the ones with customers in them. `activity_logs` is already the largest real table —
the audit interceptor records every mutation, so it grows with **usage**, not customer
count. `location_history` is near-empty only because GPS tracking is barely switched on;
one van emits a point every 25 metres.

- Both need retention windows (GPS has 90 days — confirm the audit log does too), and
  the nightly purge must be one of the jobs you protect with a lock.
- **Partition by month** past a few million rows. Early is cheap; on a live hot table
  it is an outage.
- Send reporting to a **read replica** before it competes with the product.

### Thresholds

| When | Do |
|---|---|
| Today → ~500 users | Nothing. Watch the budget alerts. |
| ~5,000 users | DB tier up. Read replica for reporting. Partition `activity_logs`. Cron locks must already exist. |
| ~20,000 users | Split Redis by role. task-service → HTTP request path at `min=0` + one always-on worker holding queues and crons. |
| Multi-region | A different project, driven by a contract or measured latency — not a growth chart. |

---

## 5. Performance

| Path | Today | Note |
|---|---|---|
| `/auth/me` — gateway → Redis → auth-service → back | ~220 ms | includes internet leg + Cloudflare |
| `/` — Next.js server render | ~450 ms | most user-visible number you have |
| Redis round-trip, on the box | **0–1 ms** | ✅ not the problem |

**The microservice hop everyone worries about costs about a millisecond.** Redis is not
your latency and Azure will not make it your latency. The architecture is already the
right shape. Three things underneath it matter:

> ⚠️ **The Burstable database is a trap — and it is the tier recommended above.**
> B-series banks CPU credits and **throttles hard when they run out**, so the database
> gets slow *exactly when you get busy*: degradation that correlates with success.
>
> At 17 users it is genuinely the right buy, and pretending otherwise wastes ~€70/month
> for years. Take it — and **set the alarm now** on the CPU credit balance. Move to
> General Purpose when it trends down, not after somebody complains. Tier change +
> restart, roughly €18 → €90.

**The migration makes N+1 queries 10× more expensive.** Postgres is on localhost today
(~0.1 ms). On Azure it is 1–2 ms in-region — fine for one query, brutal for fifty. An
endpoint doing 50 round trips goes from ~5 ms of DB time to ~75 ms. **The code will not
change and the latency will.** Audit the hot endpoints *before* moving. This is the one
performance regression the migration introduces by itself.

**The 450 ms homepage is not infrastructure.** It is Next.js rendering the marketing
page every request. Cache or statically generate it — more perceived speed than any
tier upgrade, and free. Fix on Hetzner, carry across.

**What not to do:** bigger containers (you use <1% CPU); caching layers with no
measurement saying where; multi-region for customers in one country. **Do** put
Application Insights on the gateway with p95 alerts — every number here has a shelf life.

---

## 6. Redis is not a cache here

In this system Redis is **four load-bearing things at once**: the transport every
microservice call travels over, BullMQ's job store, the Socket.IO adapter, and the token
cache. If it blips the product stops — not degrades.

Take the smallest tier with **a replica, an SLA, and persistence**. Persistence matters
because queued jobs live in Redis; losing the instance without it loses accepted work.
Memory is not the constraint — you are using **8.9 MB**.

---

## 7. Email, deliberately separated

**Human mailboxes** and **app mail** are different products. Today both run through one
cheap shared mailbox host, so the app's sending reputation is pooled with every other
customer of that host — and a run of messages to bouncing addresses got the whole IP
hard-blocked. **Mail landing in spam and mail not sending at all are the same root cause.**

The DNS is already right — `hbcfield.com` publishes strict SPF (`-all`), DKIM, and DMARC
at `p=quarantine` with reporting. What is wrong is **where mail is sent from**.

- **App mail → transactional provider, on its own subdomain.** Send from
  `mail.hbcfield.com` with its own SPF/DKIM. Structural point: a future bad address then
  damages the subdomain's reputation and **not the domain customers write to**. No such
  firewall exists today.
- **Mailboxes → Microsoft 365** once in Azure. Same tenant, same identity, SSO, and an
  inbox that does not sign you out. ~€6/user/month.
- **Keep the old host for aliases** if you like — just stop routing the product through it.
- **Tighten DMARC to `p=reject`** once on a provider you trust, and read the `rua`
  reports you already collect.

Two properties this buys: the provider **handles bounces and keeps a suppression list**
(whose absence caused the block), and it sends over **HTTPS not SMTP** (Azure blocks
outbound :25 and ACA has no stable egress IP without a NAT Gateway). Doing this now
removes email from the migration entirely.

---

## 8. Security

- **Nothing but Container Apps reachable from the internet.** VNet-integrated
  environment; private endpoints for Postgres and Redis. Today both are containers on a
  box shared with six unrelated projects.
- **Secrets in Key Vault, read with a managed identity.** No connection string, Stripe
  key or JWT secret in an env file — and no fifteen backup copies beside it.
- **Lock ingress to Cloudflare IP ranges** so nobody bypasses the WAF by hitting the
  origin hostname.
- **Do not touch auth during an infrastructure move.** Hashed refresh tokens, rotation,
  90-day expiry, revocation on password change — it is already the strong part.
- **Separate subscriptions (or at least resource groups) and Key Vaults per environment.**
  The failure this prevents: a staging deploy holding a production Stripe key.
- **Managed backups with a *tested* restore** before cutover. A backup you have never
  restored is a hope.

---

## 9. Cost control that works without discipline

- **Budget with alerts at 50 / 80 / 100 %**, to email and Telegram. Five minutes; the
  difference between noticing in a day and noticing on the invoice.
- **Daily cap on Log Analytics.** The most common Azure surprise is ingestion, not
  compute. Set it before the first deploy.
- **Tag everything** `app=hbcfield`, `env=prod`. Attribution cannot be added
  retrospectively — you currently cannot tell which project's bounces blocked your SMTP.
- **Right-size from measurements, re-check monthly.**
- **Reserve the database once stable** (~40 % off, 1 year). Do not reserve compute —
  that is the part you still expect to tune.
- **Staging scales to zero out of hours.** Non-production is where cost quietly doubles.
- **Anomaly alerts on.**
- **Defender for Cloud is not free.** Hard to justify at 17 users; easy at your first
  enterprise security questionnaire. Treat it as a sales requirement, not an infra one.

---

## 10. Four things to do before migrating

All four are worth doing on the Hetzner box regardless, and each removes a way the
cutover — or the first scale-up — can fail.

**P0 — Make the cron jobs safe in more than one process.**
Eight schedules, four services, no leader election. Harmless at one replica, wrong at
two — and two replicas is the entire point of moving. Advisory lock per job, or a
single-replica worker service. **Gates every other scaling decision.**

**P1 — Get `/uploads/` off local disk.**
Avatars and portal cover images write to the gateway's filesystem. Breaks at two
replicas on any platform. It is **64 KB** — small change today, data-loss incident if
discovered during cutover.

**P2 — Teach the Redis config to speak TLS.**
Azure Managed Redis is TLS on 6380 with access keys. The shared config factories assume
host/port/password. Small change; fails loudly at boot if missed.

**P3 — Move email onto an HTTP provider.**
Removes SMTP from the migration entirely — and fixes the outage you have *right now*,
months before Azure lands. The fallback slot already exists in the code; it needs a
provider and five environment variables.

---

## 11. The cutover

Each phase independently shippable, and reversible until the last.

1. **Infrastructure as code, empty.** Bicep over Terraform unless you want multi-cloud —
   idiomatic on Azure, no state file to protect. Resource group, VNet, Key Vault,
   registry, database, Redis, with nothing deployed onto them.
2. **Database, restored and verified.** Dump → Flexible Server, enable PostGIS, migrate
   against the direct connection. **Assert table and row counts** — a `pg_dump` with the
   wrong `-U` produces a valid, empty archive, which has bitten this project before.
3. **CI/CD before the first real deploy.** GitHub Actions → registry → ACA revision.
   Build it before you need it; the manual git-bundle-over-SSH flow does not survive two
   environments.
4. **Deploy to a staging hostname.** Full stack, real database copy, hostname nobody
   uses. Exercise what is structurally different: Stripe webhooks with raw-body
   signature verification, Socket.IO across two replicas, a BullMQ job end to end, a
   presigned upload.
5. **Cut over at Cloudflare, keep the VPS running.** DNS is the switch and the rollback.
   Leave Hetzner running and untouched for at least a week, with its database read-only
   once traffic moves so nothing is written in two places.
6. **Decommission deliberately.** Final backup, verify a restore, then remove HBCField
   from the shared box — leaving the other six projects alone.

---

## 12. Still to answer

- **Is it only HBCField moving?** If the other six stay on Hetzner that is the cleanest
  split — and it is what stops another project's mail bounces taking your email down.
- **Staging on day one?** Roughly doubles fixed cost. At 17 users it is defensible to run
  prod only and add staging when there is something to protect.
- **Data residency commitments?** A customer contract naming a country decides the region,
  not latency.
- **What is the real deadline?** The four prerequisites are worth doing this month whatever
  happens to the migration. The migration itself has no forcing function — a good
  position, if nobody invents one.
