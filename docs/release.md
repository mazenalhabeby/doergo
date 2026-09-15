# Releasing HBCField

The release pipeline, end to end:

```
checks (CI) → images built in CI (GHCR) → approve → backup → server deploy, one
service at a time, health checked → smoke tests → automatic rollback on failure

phones: store build or OTA, decided from the diff → staged rollout → update prompt
```

Nothing here deploys by itself. A push to `main` runs checks and builds images;
a human starts every release, and the `production` environment asks for approval
before the job does anything.

---

## 1. The workflows

| Workflow | Trigger | What it does |
|---|---|---|
| **CI** (`.github/workflows/ci.yml`) | every PR and push to `main`/`develop` | migration safety, image build invariants, workflow lint, tsc in every app, jest in every app, the web production build, `pnpm audit` |
| **Images** (`images.yml`) | push to `main` (or by hand) | builds the six production images from the repo's Dockerfiles and pushes them to `ghcr.io/<owner>/hbcfield-<service>:<full sha>` |
| **Deploy** (`deploy.yml`) | by hand: sha + `deploy` | refuses unless CI **and** Images passed for that sha; ships the commit to the server as a git bundle; runs `infra/release/deploy.sh` there; posts the result as the job summary |
| **Mobile release** (`mobile.yml`) | by hand | decides store build vs OTA from the diff; OTA to the current train only, or a store build on a new train with auto-submit |

### CI in detail

- **Migrations are additive** — `tools/release/check-migrations.ts` reads every
  migration file the change adds or edits and refuses `DROP TABLE/COLUMN/TYPE`,
  `TRUNCATE`, `ALTER COLUMN … TYPE`, renames of tables/columns/enum values/types,
  `ADD COLUMN … NOT NULL` without `DEFAULT` on an existing table, `SET NOT NULL`
  on an existing table, enum value removal (Prisma's `CREATE TYPE "X_new"` swap),
  `DELETE` without `WHERE`, and editing or deleting a migration that already
  exists. Non-idempotent additions (no `IF NOT EXISTS`) and unique indexes on
  existing tables are warnings.
  This is what makes an automatic rollback safe: the previous images run on the
  migrated database.
  **Override** — only when a human has decided a rollback may need a database
  restore — with a line in that migration file:
  ```sql
  -- release: destructive-approved worker_costs has had no reader since 2026-08-09
  ```
  The reason is required. The usual better answer is two releases: add now,
  remove later once nothing reads the old thing.
- **Image build invariants** — `tools/release/check-images.ts`: every web build
  arg compose passes is declared (`ARG` + `ENV`) in `apps/web-app/Dockerfile`
  and passed by `images.yml`, and vice versa (Docker drops an undeclared arg
  silently — the map tiles incident); every shipped Dockerfile uses
  `--frozen-lockfile` on both `pnpm install` and `pnpm deploy`; the images
  workflow builds exactly the six services the release deploys.
- **Tests** — jest in every app. Guard specs (`external-observer-writes`,
  `document-scope-guard`, …) are specs and run there.
- **Quarantined tests** — `tools/release/quarantined-tests.json`. Files listed
  there are excluded from the gating run and run in a separate non-gating job
  that says when they start passing. Today: `mrz-ocr.spec.ts` (auth-service),
  which fails on clean `main` because it renders its specimen with the host's
  fonts and downloads its OCR model at first use. The contract/receipt PDF
  specs pass locally and gate. If the first CI run shows another file failing
  on clean `main` for an environmental reason, add it there with its reason —
  never to turn a real failure green.

### Images in detail

- Tags: `:<full sha>` (what a release deploys) and `:main` (convenience only).
- Build cache: GitHub Actions cache per service (`type=gha`).
- The web job refuses to build without the map variables and then verifies the
  baked bundle: no `localhost:4000/4001`, contains `https://<DOMAIN>/api/v1`,
  contains the tile host.
- A final job checks the auth-service image carries every migration in the commit.

### Deploy in detail (`infra/release/deploy.sh`)

Runs on the server. Every line is timestamped and written to
`/opt/doergo/releases/<stamp>_<sha>.log`.

1. Refuses if a tracked file is modified on the server, or if HEAD is not the
   one the workflow saw a moment earlier.
2. Fetches the commit from the bundle (the server's GitHub deploy key is dead),
   and refuses if the commit does not contain the server's HEAD — the server
   carries a commit GitHub does not; merge it by hand, never reset.
3. Preflight: disk (8 GB free on docker root, backups, repo), memory (1 GB
   available), Postgres ready, Redis PONG, pgbouncer up, then every
   `infra/release/preflight.d/*.sh` hook (today: Prisma's migration advisory lock
   is not held).
4. Pulls the six images for the sha and checks the auth-service image carries
   the commit's migrations. **Nothing has changed yet** — `--check` stops here.
5. Backup: `pg_dump -U doergo doergo`, gzipped to
   `/opt/doergo/backups/pre-release-<sha>_<stamp>.sql.gz`, refused unless the
   dump's `CREATE TABLE` count is at least the live base-table count (PostGIS's
   extension-owned `spatial_ref_sys` excluded).
6. Records the running image of every service and tags it
   `rollback-<stamp>`; tags git `prod-pre-release-<stamp>`.
7. Fast-forwards the checkout, then starts **one service at a time**:
   auth-service → task-service → notification-service → tracking-service →
   api-gateway → web-app, each with
   `docker compose --env-file .env.production up -d --no-deps --no-build <svc>`
   from `infra/docker` (never `-f`, so the override with the secrets merges).
   For each: the container runs the release image, auth-service's entrypoint
   finished its migrations, the healthcheck is healthy without restarts, the
   variables in `infra/release/required-env.conf` are present (checked by name
   inside the container, never read out), and the gateway/notification/web
   endpoints answer.
8. `infra/sync-static.sh` (a failure is a warning — nginx falls back to Node).
9. Smoke tests: homepage 200 and `/api/v1/health` 200 through this box's nginx,
   login with bad credentials 400/401, `/api/v1/sync/metrics` without a token
   401 (404 means `METRICS_TOKEN` is unset), no container restarting.

**Any failure after step 6 rolls back**: the checkout returns to the previous
commit and every service already touched is started again on its recorded
previous image. The result line is one of:

| `RESULT:` | Exit | Meaning |
|---|---|---|
| `released` | 0 | done |
| `checked` | 0 | `--check` dry run passed |
| `refused` | 1 | stopped before changing anything |
| `rolled-back` | 10 | failed, production is back on the previous release |
| `rollback-failed` | 20 | failed and the rollback did not complete — act now; the log lists the previous image ids and the backup |

`infra/deploy.sh` must never run on production: it seeds the database.

---

## 2. One-time setup

### GitHub

1. **Environment** — Settings → Environments → New environment `production`:
   - Required reviewers: you.
   - Deployment branches: `main` only.
2. **Environment secrets** (in `production`):

   | Secret | Value |
   |---|---|
   | `PROD_SSH_KEY` | private key of a key pair made for this (`ssh-keygen -t ed25519 -C hbcfield-release`), public half in the server's `/root/.ssh/authorized_keys` |
   | `PROD_HOST` | the server's address |
   | `PROD_KNOWN_HOSTS` | *recommended*: output of `ssh-keyscan <server>` — without it the host key is trusted on first use each run |
   | `EXPO_TOKEN` | expo.dev → Account settings → Access tokens (a robot user's token is best) |
   | `PLAY_STORE_SERVICE_ACCOUNT_JSON` | the contents of `apps/mobile/play-store-key.json` (store builds only) |

3. **Repository variables** (Settings → Secrets and variables → Actions →
   Variables) — the web build args, copied from `infra/docker/.env.production`.
   They end up in public JavaScript, so they are variables, not secrets:

   | Variable | From `.env.production` |
   |---|---|
   | `DOMAIN` | `DOMAIN` (defaults to `hbcfield.com`) |
   | `GOOGLE_MAPS_API_KEY` | `GOOGLE_MAPS_API_KEY` |
   | `MAP_TILE_URL` | `MAP_TILE_URL` |
   | `MAP_TILE_ATTRIBUTION` | `MAP_TILE_ATTRIBUTION` |
   | `PROD_USER`, `PROD_REPO_DIR` | optional; default `root`, `/opt/doergo` |

   Until these are set, the Images workflow's web job fails on purpose.
4. **Workflow permissions** — Settings → Actions → General → Workflow
   permissions: *Read and write* is not needed globally; each workflow declares
   its own. If `main` is branch-protected, the Mobile release's version-bump push
   is refused — then bump `version` in `apps/mobile/app.config.ts` in a PR and run
   it again (it will not bump twice).

### The server

1. **Pull access to GHCR** — the packages are private. Create a *classic*
   personal access token with only `read:packages` (ideally on a machine user
   with read access to the repo), then on the server as root:
   ```bash
   echo '<token>' | docker login ghcr.io -u <github user> --password-stdin
   ```
   The credential lives in `/root/.docker/config.json`; its scope is read-only.
   Check: `docker pull ghcr.io/<owner>/hbcfield-web-app:main`.
2. The deploy key is still dead — nothing to do; releases arrive as bundles. If
   it is ever fixed, `deploy.sh` without `--bundle` fetches from `origin`.
3. `/opt/doergo/releases` is created on the first run.

### The first release after merging this

- Compose now names the six app images
  `${HBCFIELD_REGISTRY:-hbcfield}/hbcfield-<svc>:${HBCFIELD_TAG:-local}`.
  A hand build keeps working exactly as before (it tags `hbcfield/…:local`).
  The running containers were started from the old default names
  (`docker-<svc>`); the first release records those and can roll back to them.
- Run **Deploy** with `check_only` first: it proves SSH, the bundle, the GHCR
  login, the preflight and the image pull without touching anything.
- Mobile: tag the commit the current store binaries (1.0.6) were built from, so
  the change detection starts from the right place:
  `git tag mobile-build-v1.0.6 <commit>` and push the tag. `eas build:list`
  shows the commit (`gitCommitHash`); the workflow asks EAS itself first, and
  without either it falls back to the commit that set `version: '1.0.6'`
  (`e865bbd7`), which can only err towards a store build.

---

## 3. Releasing the server

1. Merge to `main`. Wait for **CI** and **Images** to go green for that commit.
2. Actions → **Deploy** → Run workflow → `sha`, type `deploy` (tick
   `check_only` for a dry run) → approve in the `production` environment.
3. Read the job summary. On `rolled-back`, production is already back; the log
   in the summary says which step failed.

By hand on the server (the same script):

```bash
cd /opt/doergo
infra/release/deploy.sh <sha> --bundle /root/x.bundle --registry ghcr.io/<owner> [--check]
```

---

## 4. Rolling back

- **Automatic** — any failure during a release (see the table above).
- **A release that passed but is wrong — preferred**: `git revert` the change on
  `main`, let CI and Images run, and **Deploy** that commit. Releases only move
  forward (deploy.sh refuses a sha that does not contain the server's HEAD), so
  the history stays honest and the server never carries a state GitHub lacks.
- **The same, when minutes matter** — put the previous images back on the
  server directly; every release left them tagged `rollback-<stamp>`:
  ```bash
  cd /opt/doergo/infra/docker
  cat /opt/doergo/releases/<stamp>/previous-images.txt     # what was running before
  git -C /opt/doergo reset --keep prod-pre-release-<stamp>  # compose file of that release
  for s in auth-service task-service notification-service tracking-service api-gateway web-app; do
    HBCFIELD_REGISTRY=ghcr.io/<owner> HBCFIELD_TAG=rollback-<stamp> \
      docker compose --env-file .env.production up -d --no-deps --no-build "$s"
  done
  /opt/doergo/infra/sync-static.sh
  ```
- **The database** — only when a migration itself is at fault (by policy it
  cannot be, unless it carried `destructive-approved`):
  ```bash
  gzip -dc /opt/doergo/backups/pre-release-<sha>_<stamp>.sql.gz \
    | docker exec -i hbcfield-postgres psql -U doergo -d doergo
  ```
  into an emptied database, services stopped. Everything written since the
  backup is lost — decide that with eyes open.

---

## 5. Releasing phones

Actions → **Mobile release** → Run workflow. `kind: auto` decides:

| The diff since the last store build contains | Result |
|---|---|
| a dependency in `apps/mobile/package.json` with native code (added, or range changed), or a lockfile re-resolution of one | **store build** |
| a change to the evaluated `app.config.ts` outside `extra.gitCommit/builtAt/buildProfile` — plugins, permissions, infoPlist, entitlements, `version`, `runtimeVersion`, icons, splash | **store build** |
| `apps/mobile/plugins/**`, an asset the config points at, `eas.json` build profiles | **store build** |
| only JavaScript under `apps/mobile` or `packages/shared` (tests and docs ignored) | **OTA** |
| nothing | nothing |

The rules live in `tools/release/mobile-change-kind.ts`; run it locally:
`node tools/release/mobile-change-kind.ts --base auto`.

**OTA** — exported with `EXPO_PUBLIC_API_URL=https://hbcfield.com/api/v1`
inline, refused unless that URL is in the bundle, published with
`eas update --branch production` to the **current** `version` train only and at
`ota_rollout` percent (default 20). Widen it when it looks healthy:
```bash
cd apps/mobile && eas update:edit --rollout-percentage 100
```
Undo it: `eas update:roll-back-to-embedded --branch production --runtime-version <version>`.
Never publish to an older train — an older binary crashes on current JS. The
workflow cannot: it refuses an OTA when `app.config.ts`'s version is not the last
store build's.

**Store build** — bumps the patch version (unless already bumped), commits it to
`main`, runs `eas build --platform all --profile production --auto-submit`, and
tags `mobile-build-v<version>`.
- Android: production track, **20 % staged rollout** (`eas.json`
  `submit.production.android.rollout`). Raise it in Play Console.
- iOS: submitted for review. In App Store Connect, on the version, choose
  *Automatically release* with **Phased release for automatic updates** (7 days).

**The update prompt** — once both stores list the new version, set
`MOBILE_LATEST_VERSION=<version>` in `infra/docker/.env.production` and recreate
api-gateway (`docker compose --env-file .env.production up -d --no-deps api-gateway`
from `infra/docker`, or ship it with the next release). Do not raise
`MOBILE_MIN_VERSION` until the fleet has moved.

---

## 6. Not automated (yet)

- The Release page in the admin console (history, one-click deploy/rollback).
- The admin app (`admin-app`, admin.hbcfield.com) is not part of the image
  pipeline; it is still built by hand on the server.
- Setting `MOBILE_LATEST_VERSION` after store approval.
- Promoting a staged rollout (Play %, iOS phased release, OTA %).
- Database restore — deliberately a human decision.

## 7. Tests for the pipeline itself

```bash
cd tools/release
node --test check-migrations.test.ts mobile-change-kind.test.ts check-images.test.ts deploy-sh.test.ts
../../node_modules/.bin/tsc -p tsconfig.json
```

`deploy-sh.test.ts` runs the real `deploy.sh` against a fake `docker`/`curl` and
a throwaway git checkout: the good path, rollback on an unhealthy service, a
failed `up`, a missing secret, a metrics 404, and each refusal before change.
