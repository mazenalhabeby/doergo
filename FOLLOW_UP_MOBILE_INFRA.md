> **Superseded 2026-08-25.** Both areas have since been audited —
> `docs/audit/14-mobile.md` and `docs/audit/15-infrastructure.md`. This file is kept
> for the reasoning about *why* they were originally out of scope; the open items in it
> that remain are consolidated at the end of the two reports.

# Follow-up: Mobile app & Infrastructure

Two areas the 13-area web audit (`WEB_AUDIT.md`, `docs/audit/`) deliberately did **not**
cover. Neither has been examined. This file is the scope and the reasoning, not a findings
list — nothing here has been verified.

Written 2026-08-25, after the web audit and the database / secrets / deploy work.

---

## Why these were left out

The audit's inventory was the **web app and the API it talks to**. That was a scoping choice,
not a judgement that these are fine. Two things follow from it:

- **The mobile app is the primary client for field staff.** Everything the audit found about
  authorization was verified from the web side. Mobile hits the same gateway, so the
  server-side guards apply — but mobile-specific storage, permissions and background
  behaviour are untested territory.
- **Infrastructure is where "highest security" is actually decided.** A perfectly audited
  application on an unpatched box with no WAF is not secure. The audit could not see any of
  that from the repository.

---

## A. Mobile app (`apps/mobile`, React Native / Expo)

### What makes it different from the web
It ships a **binary to a device you do not control**. Anything embedded in the bundle is
readable by whoever holds the phone, and an update takes an OTA push or a store review rather
than a deploy.

### Worth auditing, roughly in order

1. **Secrets in the bundle.** `EXPO_PUBLIC_*` variables are inlined at build time and are
   readable in the shipped app. Check what is in there — especially the Google Maps key and
   the API URL. A key that is not origin/IP-restricted is a live key in every user's pocket.
   > Related and already known: `eas update` inlines `EXPO_PUBLIC_API_URL` from the local
   > `.env`, which has produced an OTA pointing at `localhost`. That is an availability bug
   > today; it is the same mechanism that would leak a secret.
2. **Token storage.** Tokens are in `expo-secure-store` (encrypted) — confirm nothing has
   drifted to `AsyncStorage`, and check what happens to them on logout, on account deletion,
   and when a device is shared between staff.
3. **Background location.** The GPS tracker runs as a background `TaskManager` task with
   "Always allow". Audit what it captures when a shift is **not** active, whether stopping is
   reliable, and what the battery/permission story looks like if a member revokes access
   mid-shift.
4. **Offline behaviour and the write queue.** What happens to a clock-in or a completed task
   raised with no signal — is it queued, retried, deduplicated? A duplicated clock-in is a
   payroll error.
5. **Certificate/transport.** Confirm no cleartext exemptions (`NSAllowsArbitraryLoads`,
   Android `usesCleartextTraffic`) survive in the production build.
6. **Deep links and push payloads.** A notification taps through to a screen; check the
   payload cannot navigate somewhere it should not, and that ids in it are re-authorized
   server-side rather than trusted.
7. **The same six audit passes** as the web areas, against the mobile screens: what the
   feature really is, security, performance, live-sync, DRY/SOLID, surface (i18n is 5
   languages here too).

### Reusable from the web audit
The four guard tests added there protect the **server**, which mobile shares — gating keys,
phantom invalidation keys, tenant override, operator secret. Mobile inherits those for free.

---

## B. Infrastructure

Single Hetzner box, ~30 containers, manual deploy. `infra/docker/docker-compose.yml`.

### Already done (2026-08-25, recorded so it is not repeated)
- `POSTGRES_PASSWORD` no longer has a baked-in default in the production compose. It was
  `hbcfield_secret` — **published in this repository** — in 7 places, so an env-less start
  came up with a known password. It now fails closed, matching the JWT and Redis secrets,
  which already had no defaults.
- Postgres now loads `pg_stat_statements` and logs statements over 1s. There was **no
  slow-query visibility at all** before: `log_min_duration_statement = -1` and an empty
  `shared_preload_libraries`. ⚠️ **Needs a Postgres restart to take effect.**
- `infra/docker/deploy.sh` rewritten to encode the real procedure with its known failure
  modes: mandatory `--env-file`, a pre-deploy backup **whose table count is asserted** (a
  wrong-user `pg_dump` exits 0 and writes a valid, empty gzip), images built one at a time
  (building all of them has OOM-killed the box), `migrate deploy` before `up`, a rollback
  tag, and health verification that treats a restarting container as a failure.

### Still to do

1. **Verify a backup RESTORE.** Backups run nightly to Hetzner S3. Nobody has restored one.
   An unrestored backup is a hypothesis. Restore into a scratch database and diff the row
   counts — this is the single highest-value item in this file.
2. **Dependency CVEs beyond the three fixed.** `socket.io-parser`, `path-to-regexp` and
   `effect` are patched via `pnpm.overrides`. `pnpm audit --prod` still reports ~135 findings,
   **dominated by the Expo/React-Native build chain, which does not ship to a server**. I did
   not verify each one — `pnpm audit` reads the whole monorepo lockfile and cannot be scoped
   per service. Establish which actually land in a server image, then set up recurring
   scanning so this is not a once-a-year exercise.
3. **No WAF, no CDN, no rate limiting above the app.** Every limit is enforced inside the
   gateway. That is now Redis-backed and therefore correct across replicas, but it still means
   an application process handles every abusive request.
4. **TLS and headers at the edge.** Helmet is set in-app; the nginx config (`infra/nginx/`)
   has not been reviewed for protocol versions, ciphers, HSTS, or OCSP stapling.
5. **Single point of failure.** One box runs Postgres, Redis, PgBouncer, five services, two
   web apps and Photon. The cron-lock work (`runWithCronLock`) and the Redis throttler make
   horizontal scaling *possible*; nothing has been scaled. Decide whether that matters before
   it decides for you — see `hbcfield-azure-plan.md`, where the answer was "stay on Hetzner,
   finish the features".
6. **Postgres has a 1 GB memory limit** in compose. Low for a production database; worth
   confirming against the box's actual capacity and the working set.
7. **Secrets rotation.** They live in `/opt/doergo/infra/docker/.env.production` on one box.
   No rotation procedure, no inventory of who has seen them, and the Stripe account is shared
   with an unrelated project. At minimum: write down what exists and when it was last changed.
8. **Log retention and PII.** Container logs go to the default json-file driver. Check what
   the gateway's audit interceptor writes, whether request bodies are redacted (they are for
   the audit log — confirm for error paths), and how long anything is kept.

---

## Suggested order

1. Restore a backup. Everything else is optional next to knowing you can recover.
2. Deploy the audit fixes — 5 Highs are live in production until you do.
3. Restart Postgres so slow-query logging starts collecting; look at
   `pg_stat_statements` a week later, when there is something to see.
4. Mobile audit, areas 14+, using the same six passes.
5. Edge hardening (TLS review, WAF) and the CVE sweep.
