# Area 15 — Infrastructure

Single Hetzner box, ~30 containers, manual deploy. `infra/docker/docker-compose.yml`.

Status: **4 findings fixed, restore capability proven.** The remaining items need
production access or are decisions rather than defects.

---

## Findings

| ID | Sev | Title | Status |
|----|-----|-------|--------|
| IN-B1 | **H** | The production database password had a default published in this repository | **fixed** |
| IN-P1 | M | No slow-query visibility of any kind | **fixed** |
| IN-P2 | M | 18 redundant indexes on the hottest write tables | **fixed** |
| IN-D1 | M | The deploy script did not match the procedure that actually works | **fixed** |
| IN-D2 | — | Backups had never been restored | **capability proven; production run still needed** |

### IN-B1 — a password in the repository **(High)**

`POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-hbcfield_secret}` appeared **7 times** in the
production compose. If the variable was ever unset — and it has been, which is why
"always pass `--env-file`" is written down as a rule — the stack came up with a password
that is **committed to this repository**.

The other secrets were already correct: `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` and
`REDIS_PASSWORD` have no defaults, so they fail loudly. Postgres was the exception. It now
uses `:?` and refuses to start without an explicit value — verified by rendering the compose
file with and without it.

### IN-P1 — nothing could tell you what was slow

`log_min_duration_statement = -1`, `shared_preload_libraries` empty, `track_io_timing = off`.
So "which query is slow?" had **no answer and no way to obtain one** — which is also why the
question "is production performance good?" could not be answered in either direction.

Postgres now loads `pg_stat_statements`, logs statements over **1 s** — deliberately not 0,
where the log volume becomes its own performance problem — and tracks IO timing, which is
what separates *slow because of disk* from *slow because of CPU*.
⚠️ **Requires a Postgres restart**; the extension is created by migration.

### IN-P2 — indexes that cost writes and returned nothing

18 indexes were a strict **prefix** of another index on the same table. Postgres serves a
leading-column query from the composite, so `(organizationId)` adds nothing that
`(organizationId, status)` does not — but every INSERT and UPDATE maintained it, on
`tasks`, `time_entries` and `task_events`, the hottest write paths in the product. `tasks`
went from 25 indexes to 19.

Verified against the live schema before writing the migration; `schema.prisma` updated in the
same commit so Prisma cannot re-add them. Foreign keys are unaffected — a composite still
covers the FK check on its leading column.

> Index *coverage* was found to be good: composites carrying comments that name the query
> each one serves. This was redundancy, not absence.

### IN-D1 — the deploy script described a procedure nobody uses

It ran `git pull origin main` (**the deploy key is dead** — code arrives as a bundle over
SSH), built every image in one command (**this has OOM-killed the box**), took **no backup**,
and ran **no migrations**.

Rewritten with each guard tied to the incident behind it: mandatory `--env-file`; the database
identity read *from* the env file rather than hardcoded; a pre-deploy backup whose table count
is **asserted**; images built one at a time; `migrate deploy` before `up`, with the backup
named in the failure message; a rollback tag; and verification that treats a *restarting*
container as a failure and prints both the rollback and the restore command.

### IN-D2 — backups were a hypothesis

Backups have run nightly to Hetzner S3 for over a month. **None had ever been restored.**

`infra/scripts/verify-restore.sh` now does it: takes (or accepts) a backup, restores it into a
**throwaway** database beside the live one, and compares table, index and row counts. It never
writes to the live database and drops the scratch copy on exit.

**Proven, not assumed** — run against the local stack:

```
220K, 92 CREATE TABLE statements
restored with 0 errors
tables  live=94  restored=94   ok        users          live=48   restored=48   ok
indexes live=364 restored=364  ok        time_entries   live=713  restored=713  ok
=== RESTORE VERIFIED — this backup is recoverable ===
```

And the failure it exists to catch was **reproduced deliberately**: dumping as the wrong user
produced a **20-byte gzip containing 0 tables**, with `pg_dump` exiting 0. The assertion
rejected it. That is the exact silent failure recorded from an earlier incident.

> ⚠️ This proves the **mechanism** and the local stack. It does **not** prove the production
> nightly backups, which run from a different script as a different user against a different
> volume. Run `verify-restore.sh` on the box, ideally against a file already retrieved from
> S3, and put it on a monthly cadence.

---

## Still open — needs production access or a decision

1. **Run the restore verification on production.** Everything above is the mechanism working
   locally.
2. **Dependency CVEs beyond the three fixed.** `socket.io-parser`, `path-to-regexp` and
   `effect` are patched via `pnpm.overrides`. `pnpm audit --prod` still reports ~135, and they
   are dominated by the Expo/React-Native build chain, which does not ship to a server — but
   `pnpm audit` reads the whole monorepo lockfile and cannot be scoped per service, so I did
   **not** verify which of the rest land in a server image. Recurring scanning is not set up.
3. **No WAF, no CDN.** Every request, including abusive ones, is handled by an application
   process. The limits are now Redis-backed and therefore correct across replicas, but they
   are still enforced inside the app.
4. **The nginx edge** (`infra/nginx/`) has not been reviewed — TLS versions, ciphers, HSTS,
   OCSP stapling.
5. **Single point of failure.** One box runs Postgres, Redis, PgBouncer, five services, two
   web apps and Photon. `runWithCronLock` and the Redis throttler make horizontal scaling
   *possible*; nothing is scaled. See `hbcfield-azure-plan.md`, where the decision was "stay
   on Hetzner, finish the features".
6. **Postgres has a 1 GB memory limit** in compose — low for a production database.
7. **Secrets rotation.** They live in one file on one box. No rotation procedure, no record of
   who has seen them, and the Stripe account is shared with an unrelated project.

## Verdict

**PASS WITH FIXES** for what is reachable from the repository. The High was a password in
version control; the most consequential fix is that a restore has now actually been performed
rather than assumed.
