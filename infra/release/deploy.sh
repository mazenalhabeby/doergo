#!/usr/bin/env bash
#
# HBCField release — run ON the production server, by .github/workflows/deploy.yml
# over SSH or by a human:
#
#   infra/release/deploy.sh <commit-sha> [--bundle <file.bundle>] [--expect-head <sha>]
#                                        [--registry ghcr.io/<owner>] [--check]
#
# What it does, in order. Every step is logged with a timestamp to
# $RELEASE_DIR/<stamp>_<sha>.log, and any failure after the first change rolls
# the release back automatically.
#
#   1. assert the checkout is clean and HEAD is what the caller expects
#   2. fetch <sha> (from --bundle, else git fetch) — the checkout does not move yet
#   3. preflight: disk, memory, Postgres + Redis healthy, preflight.d hooks
#   4. pull the six images tagged <sha> from GHCR (a missing image costs nothing)
#   5. BACKUP, with the table count asserted against the live database
#   6. record the running images (the rollback point)
#   7. fast-forward the checkout, then bring services up ONE AT A TIME:
#      auth → task → notification → tracking → gateway → web, waiting for each
#      to be healthy and checking its secrets by name
#   8. publish static assets (infra/sync-static.sh)
#   9. smoke tests
#
# --check stops after step 4: a full dry run that changes nothing.
#
# Why a rollback of CODE is safe: migrations are additive by policy, enforced in
# CI by tools/release/check-migrations.ts. The previous images run against the
# migrated database. A migration that needed a human's `destructive-approved`
# marker is exactly the release where that is not true — the backup from step 5
# is the restore point then, and this script says so.
#
# ⚠️ Never run infra/deploy.sh on production: it seeds the database.
# ⚠️ Every compose call runs FROM infra/docker with --env-file .env.production
#    and NO -f, so docker-compose.override.yml (the production secrets) merges.
#
# Exit codes: 0 released · 1 refused before changing anything · 10 failed and
# rolled back · 20 failed and the ROLLBACK failed too (a human is needed now).

set -Eeuo pipefail

# ─── Configuration ──────────────────────────────────────────────────────────
ROOT_DIR="${ROOT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
COMPOSE_DIR="$ROOT_DIR/infra/docker"
ENV_FILE="$COMPOSE_DIR/.env.production"
RELEASE_DIR="${RELEASE_DIR:-/opt/doergo/releases}"
BACKUP_DIR="${BACKUP_DIR:-/opt/doergo/backups}"
REQUIRED_ENV_FILE="${REQUIRED_ENV_FILE:-$ROOT_DIR/infra/release/required-env.conf}"
HOOKS_DIR="${HOOKS_DIR:-$ROOT_DIR/infra/release/preflight.d}"
MIN_FREE_GB="${MIN_FREE_GB:-8}"
MIN_AVAILABLE_MB="${MIN_AVAILABLE_MB:-1024}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-240}"
AUTH_MIGRATE_TIMEOUT="${AUTH_MIGRATE_TIMEOUT:-600}"
SMOKE_DOMAIN="${SMOKE_DOMAIN:-}"

# Start order matters: the gateway's depends_on wants the four services healthy,
# and the web app wants the gateway. Infrastructure (postgres, redis, pgbouncer)
# is never touched by a release.
SERVICES=(auth-service task-service notification-service tracking-service api-gateway web-app)

# ─── Arguments ──────────────────────────────────────────────────────────────
TARGET=""
BUNDLE=""
EXPECT_HEAD=""
REGISTRY="${HBCFIELD_REGISTRY:-}"
CHECK_ONLY=0
while [ $# -gt 0 ]; do
  case "$1" in
    --bundle)      BUNDLE="${2:?--bundle needs a file}"; shift 2 ;;
    --expect-head) EXPECT_HEAD="${2:?--expect-head needs a sha}"; shift 2 ;;
    --registry)    REGISTRY="${2:?--registry needs a value}"; shift 2 ;;
    --check)       CHECK_ONLY=1; shift ;;
    -h|--help)     sed -n '2,40p' "$0"; exit 0 ;;
    -*)            echo "unknown option: $1" >&2; exit 1 ;;
    *)             [ -z "$TARGET" ] || { echo "one commit only" >&2; exit 1; }; TARGET="$1"; shift ;;
  esac
done
[[ "$TARGET" =~ ^[0-9a-f]{7,40}$ ]] || { echo "usage: deploy.sh <commit-sha> [--bundle f] [--expect-head sha] [--registry r] [--check]" >&2; exit 1; }
if [ -z "$REGISTRY" ]; then
  # ghcr.io/<owner> from the repository's GitHub remote, lower-cased (GHCR refuses upper case).
  owner="$(git -C "$ROOT_DIR" remote get-url origin 2>/dev/null | sed -E 's#^.*github(\.com|-[a-z0-9-]+)[:/]([^/]+)/.*$#\2#' | tr '[:upper:]' '[:lower:]')"
  [ -n "$owner" ] || { echo "cannot derive the registry; pass --registry ghcr.io/<owner>" >&2; exit 1; }
  REGISTRY="ghcr.io/$owner"
fi

STAMP="$(date -u +%Y%m%d_%H%M%S)"
mkdir -p "$RELEASE_DIR"
LOG="$RELEASE_DIR/${STAMP}_${TARGET:0:12}.log"
exec > >(tee -a "$LOG") 2>&1

ts()   { date -u +%Y-%m-%dT%H:%M:%SZ; }
log()  { printf '%s  %s\n' "$(ts)" "$*"; }
step() { printf '\n%s  ── %s\n' "$(ts)" "$*"; }

# ─── State the rollback reads ───────────────────────────────────────────────
PHASE="preflight"          # preflight → changing → released
PREV_HEAD=""
GIT_MOVED=0
TOUCHED=()                  # services recreated so far
BACKUP=""
FULL_SHA=""
ROLLBACK_TAG="rollback-$STAMP"
STATE_DIR="$RELEASE_DIR/$STAMP"
PREVIOUS="$STATE_DIR/previous-images.txt"   # "<service> <image id> <image name>" per line
mkdir -p "$STATE_DIR"
: > "$PREVIOUS"
# Plain files and indexed arrays only: the script runs under any bash ≥ 3.2, so
# it can be exercised on a laptop against fakes (tools/release/deploy-sh.test.ts).
prev_field() { awk -v s="$1" -v f="$2" '$1 == s { print $f; exit }' "$PREVIOUS"; }
touched() { printf '%s\n' ${TOUCHED[@]+"${TOUCHED[@]}"}; }

compose() {
  (cd "$COMPOSE_DIR" && HBCFIELD_REGISTRY="$REGISTRY" HBCFIELD_TAG="${COMPOSE_TAG:-$FULL_SHA}" docker compose --env-file "$ENV_FILE" "$@")
}
container_of() { echo "hbcfield-$1"; }

result() {
  # One machine-readable line the workflow greps for.
  printf '\nRESULT: %s  sha=%s  log=%s  backup=%s\n' "$1" "${FULL_SHA:-$TARGET}" "$LOG" "${BACKUP:-none}"
}

rollback() {
  local reason="$1"
  # A rollback must run to the end: one failed step is recorded, never re-entered.
  trap - ERR
  set +e
  step "ROLLING BACK — $reason"
  local ok=1

  if [ "$GIT_MOVED" = 1 ] && [ -n "$PREV_HEAD" ]; then
    # --keep, not --hard: it refuses rather than discards if anything tracked was
    # edited meanwhile. The commits being stepped off exist on GitHub/the bundle.
    if git -C "$ROOT_DIR" reset --keep "$PREV_HEAD"; then
      log "repository back at ${PREV_HEAD:0:12}"
    else
      log "!! could not move the repository back to $PREV_HEAD"; ok=0
    fi
  fi

  local svc id name
  for svc in $(touched); do
    id="$(prev_field "$svc" 2)"
    name="$(prev_field "$svc" 3)"
    if [ -z "$id" ]; then
      log "!! $svc had no previous container recorded — stopping the new one would take it down; leaving it"; ok=0; continue
    fi
    # Both names point at the previous bits: the rollback tag for a compose file
    # that has `image:`, and the original name for one that predates it.
    docker tag "$id" "$REGISTRY/hbcfield-$svc:$ROLLBACK_TAG"
    if [ -n "$name" ]; then docker tag "$id" "$name" 2>/dev/null; fi
    if COMPOSE_TAG="$ROLLBACK_TAG" compose up -d --no-deps --no-build "$svc"; then
      log "$svc → previous image ${id:7:12}"
    else
      log "!! $svc could not be restarted on its previous image"; ok=0
    fi
  done

  for svc in $(touched); do
    wait_healthy "$svc" "$HEALTH_TIMEOUT" || { log "!! $svc is not healthy after rollback"; ok=0; }
  done
  if touched | grep -qx web-app && [ -x "$ROOT_DIR/infra/sync-static.sh" ]; then
    "$ROOT_DIR/infra/sync-static.sh" || log "static sync after rollback failed (site still serves via Node)"
  fi

  if [ "$ok" = 1 ]; then
    log "rolled back. Database backup from this attempt: ${BACKUP:-none taken}"
    log "Migrations this release applied stay applied; they are additive by policy, so the previous code runs on them."
    result "rolled-back"
    exit 10
  fi
  log "ROLLBACK INCOMPLETE — act now. Previous images: $(tr '\n' ';' < "$PREVIOUS")"
  log "Restore point if the database is at fault: ${BACKUP:-none}"
  result "rollback-failed"
  exit 20
}

fail() {
  local msg="$1"
  if [ "$PHASE" = "changing" ]; then
    rollback "$msg"
  fi
  step "REFUSED — $msg"
  if [ "$GIT_MOVED" = 1 ] && [ -n "$PREV_HEAD" ]; then
    git -C "$ROOT_DIR" reset --keep "$PREV_HEAD" && log "repository back at ${PREV_HEAD:0:12}"
  fi
  log "nothing running was changed"
  result "refused"
  exit 1
}
trap 'fail "unexpected error at line $LINENO (exit $?)"' ERR

# ─── Helpers ────────────────────────────────────────────────────────────────

# Is the container healthy, and did it STAY up? A container that restarts is not
# healthy just because one of its lives passed a check.
wait_healthy() {
  local svc="$1" timeout="$2" name restarts status deadline health running count
  name="$(container_of "$svc")"
  deadline=$(( $(date +%s) + timeout ))
  restarts="$(docker inspect -f '{{.RestartCount}}' "$name" 2>/dev/null || echo 0)"
  while :; do
    status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}|{{.State.Running}}|{{.RestartCount}}' "$name" 2>/dev/null || echo 'missing|false|0')"
    IFS='|' read -r health running count <<<"$status"
    if [ "$count" != "$restarts" ]; then log "$svc restarted (count $restarts → $count)"; return 1; fi
    if [ "$running" != "true" ]; then log "$svc is not running ($health)"; return 1; fi
    case "$health" in
      healthy|running) [ "$health" = running ] && sleep 10; return 0 ;;
      unhealthy) log "$svc reports unhealthy"; return 1 ;;
    esac
    [ "$(date +%s)" -lt "$deadline" ] || { log "$svc not healthy within ${timeout}s (last: $health)"; return 1; }
    sleep 5
  done
}

# auth-service's healthcheck is `pgrep node`, which `npx prisma migrate deploy`
# satisfies. Healthy therefore says nothing about migrations; the entrypoint's own
# line does.
wait_auth_migrated() {
  local name deadline since
  name="$(container_of auth-service)"
  since="$(docker inspect -f '{{.State.StartedAt}}' "$name")"
  deadline=$(( $(date +%s) + AUTH_MIGRATE_TIMEOUT ))
  while :; do
    if docker logs --since "$since" "$name" 2>&1 | grep -q 'Starting auth-service'; then
      docker logs --since "$since" "$name" 2>&1 | grep -E 'migrations? (have been|are)|No pending migrations|Applying migration' | sed 's/^/    /' || true
      return 0
    fi
    if [ "$(docker inspect -f '{{.State.Running}}' "$name")" != "true" ]; then
      docker logs --since "$since" --tail 30 "$name" 2>&1 | sed 's/^/    /'
      return 1
    fi
    [ "$(date +%s)" -lt "$deadline" ] || { log "migrations did not finish within ${AUTH_MIGRATE_TIMEOUT}s"; return 1; }
    sleep 5
  done
}

# Names only: `test -n` inside the container, so no value is ever read out.
check_required_env() {
  local svc="$1" line vars missing=()
  [ -f "$REQUIRED_ENV_FILE" ] || return 0
  line="$(grep -E "^${svc}[[:space:]]" "$REQUIRED_ENV_FILE" | head -1 || true)"
  [ -n "$line" ] || return 0
  read -r _ vars <<<"$line"
  for v in $vars; do
    docker exec "$(container_of "$svc")" sh -c "test -n \"\${$v:-}\"" || missing+=("$v")
  done
  if [ ${#missing[@]} -gt 0 ]; then
    log "$svc is missing: ${missing[*]} (compose run without the override, or not in .env.production)"
    return 1
  fi
  log "$svc environment: $(echo $vars | wc -w | tr -d ' ') required variables present"
}

http_code() { curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$@" || echo 000; }

expect_code() {
  local label="$1" want="$2"; shift 2
  local got; got="$(http_code "$@")"
  if [[ "$got" =~ ^($want)$ ]]; then log "smoke ok    $label → $got"; return 0; fi
  log "smoke FAIL  $label → $got (want $want)"; return 1
}

read_env() { grep -E "^${1}=" "$ENV_FILE" | tail -1 | cut -d= -f2- || true; }

# ═══ 1. The checkout ════════════════════════════════════════════════════════
step "Release ${TARGET:0:12} → $REGISTRY  (log $LOG)"
command -v docker >/dev/null || fail "docker not found"
command -v curl >/dev/null || fail "curl not found"
[ -f "$ENV_FILE" ] || fail "$ENV_FILE not found — production secrets live only on this box"

# One release at a time. Released on every exit, including a failure.
LOCK_DIR="${TMPDIR:-/tmp}/hbcfield-deploy.lock"
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  holder="$(cat "$LOCK_DIR/pid" 2>/dev/null || echo unknown)"
  if [ "$holder" != unknown ] && kill -0 "$holder" 2>/dev/null; then fail "release $holder is already running"; fi
  log "clearing a stale lock left by pid $holder"; rm -rf "$LOCK_DIR"; mkdir "$LOCK_DIR"
fi
echo $$ > "$LOCK_DIR/pid"
trap 'rm -rf "$LOCK_DIR" 2>/dev/null || true' EXIT

# Untracked files are legitimate here (.env.production, the override, backups);
# a MODIFIED TRACKED file is an edit on the box a release would silently bury.
dirty="$(git -C "$ROOT_DIR" status --porcelain --untracked-files=no)"
[ -z "$dirty" ] || fail "tracked files are modified on the server:
$dirty"
PREV_HEAD="$(git -C "$ROOT_DIR" rev-parse HEAD)"
log "server HEAD ${PREV_HEAD:0:12} ($(git -C "$ROOT_DIR" log -1 --format=%s "$PREV_HEAD" | cut -c1-70))"
if [ -n "$EXPECT_HEAD" ] && [[ "$PREV_HEAD" != "$EXPECT_HEAD"* ]]; then
  fail "server HEAD is ${PREV_HEAD:0:12}, the caller expected ${EXPECT_HEAD:0:12} — something moved it; look before releasing"
fi

# ═══ 2. Fetch the commit ══════════════════════════════════════════
step "Fetching ${TARGET:0:12}"
if [ -n "$BUNDLE" ]; then
  # The server's deploy key has been dead since July; a bundle over SSH needs no GitHub auth.
  git -C "$ROOT_DIR" bundle verify "$BUNDLE" >/dev/null || fail "bundle $BUNDLE does not verify against this repository"
  git -C "$ROOT_DIR" fetch --quiet "$BUNDLE" "+refs/heads/*:refs/release-bundle/*" || fail "could not fetch from $BUNDLE"
else
  timeout 60 git -C "$ROOT_DIR" fetch --quiet origin || log "git fetch origin failed (deploy key?) — continuing only if the commit is already here"
fi
FULL_SHA="$(git -C "$ROOT_DIR" rev-parse --verify --quiet "${TARGET}^{commit}" || true)"
[ -n "$FULL_SHA" ] || fail "commit $TARGET is not in the repository (pass --bundle)"
if [ "$FULL_SHA" != "$PREV_HEAD" ]; then
  git -C "$ROOT_DIR" merge-base --is-ancestor "$PREV_HEAD" "$FULL_SHA" \
    || fail "${FULL_SHA:0:12} does not contain the server's HEAD ${PREV_HEAD:0:12}: the server has commits the release does not. Reconcile by hand (merge, never reset)."
fi
log "target ${FULL_SHA:0:12} ($(git -C "$ROOT_DIR" log -1 --format=%s "$FULL_SHA" | cut -c1-70))"

# ═══ 3. Preflight ═══════════════════════════════════════════════════════════
step "Preflight"
grep -q "CHANGE_ME" "$ENV_FILE" && fail "$ENV_FILE still contains CHANGE_ME placeholders"
COMPOSE_TAG="$FULL_SHA" compose config --quiet || fail "compose does not render with $ENV_FILE"

for dir in "$(docker info -f '{{.DockerRootDir}}' 2>/dev/null || echo /)" "$BACKUP_DIR" "$ROOT_DIR"; do
  mkdir -p "$dir" 2>/dev/null || true
  free_gb=$(( $(df -Pk "$dir" | awk 'NR==2{print $4}') / 1024 / 1024 ))
  [ "$free_gb" -ge "$MIN_FREE_GB" ] || fail "only ${free_gb}G free on $dir (need ${MIN_FREE_GB}G)"
  log "disk $dir: ${free_gb}G free"
done
if [ -r /proc/meminfo ]; then
  avail_mb=$(( $(awk '/^MemAvailable:/{print $2}' /proc/meminfo) / 1024 ))
  [ "$avail_mb" -ge "$MIN_AVAILABLE_MB" ] || fail "only ${avail_mb}MB memory available (need ${MIN_AVAILABLE_MB}MB)"
  log "memory available: ${avail_mb}MB"
fi

PG_USER="$(read_env POSTGRES_USER)"; PG_USER="${PG_USER:-doergo}"
PG_DB="$(read_env POSTGRES_DB)"; PG_DB="${PG_DB:-doergo}"
docker exec hbcfield-postgres pg_isready -U "$PG_USER" -d "$PG_DB" >/dev/null || fail "Postgres is not ready"
log "postgres ready ($PG_USER@$PG_DB)"
docker exec hbcfield-redis sh -c 'redis-cli -a "$REDIS_PASSWORD" --no-auth-warning ping' | grep -q PONG || fail "Redis does not answer PING"
log "redis PONG"
for c in hbcfield-postgres hbcfield-redis hbcfield-pgbouncer; do
  st="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$c" 2>/dev/null || echo missing)"
  [[ "$st" =~ ^(healthy|running)$ ]] || fail "$c is $st"
done

if [ -d "$HOOKS_DIR" ]; then
  for hook in "$HOOKS_DIR"/*.sh; do
    [ -e "$hook" ] || continue
    log "hook $(basename "$hook")"
    TARGET_SHA="$FULL_SHA" PREV_SHA="$PREV_HEAD" ROOT_DIR="$ROOT_DIR" ENV_FILE="$ENV_FILE" PG_USER="$PG_USER" PG_DB="$PG_DB" \
      bash "$hook" || fail "preflight hook $(basename "$hook") refused the release"
  done
fi

# ═══ 4. Pull — before the backup, so a missing image costs nothing ═══════
step "Pulling images ${FULL_SHA:0:12}"
for svc in "${SERVICES[@]}"; do
  ref="$REGISTRY/hbcfield-$svc:$FULL_SHA"
  docker pull --quiet "$ref" >/dev/null || fail "cannot pull $ref (CI images job not finished, or the server is not logged in to ghcr.io)"
  log "pulled $ref ($(docker image inspect -f '{{.Id}}' "$ref" | cut -c8-19))"
done

# The image must carry the migrations the commit has: `migrate deploy` from a
# stale image reports "No pending migrations" for one sitting in the tree.
tree_migrations="$(git -C "$ROOT_DIR" ls-tree --name-only "$FULL_SHA" apps/api/auth-service/prisma/migrations/ | grep -c '/[0-9]' || true)"
image_migrations="$(docker run --rm --entrypoint sh "$REGISTRY/hbcfield-auth-service:$FULL_SHA" -c 'ls -1 /app/apps/api/auth-service/prisma/migrations | grep -c "^[0-9]"' | tr -d '\r' | tail -1)"
[ "$tree_migrations" = "$image_migrations" ] || fail "auth-service image has $image_migrations migrations, commit has $tree_migrations"
log "migrations: commit $tree_migrations = image $image_migrations"

if [ "$CHECK_ONLY" = 1 ]; then
  log "--check: preflight passed, images present. Stopping before the backup."
  result "checked"
  exit 0
fi

# ═══ 5. Backup ══════════════════════════════════════════════════════════════
step "Backing up the database"
mkdir -p "$BACKUP_DIR"
BACKUP="$BACKUP_DIR/pre-release-${FULL_SHA:0:8}_${STAMP}.sql.gz"
docker exec hbcfield-postgres pg_dump -U "$PG_USER" "$PG_DB" | gzip > "$BACKUP"
[ "${PIPESTATUS[0]}" = 0 ] || fail "pg_dump failed"

# pg_dump exits 0 while writing a valid EMPTY gzip when the user/db is wrong, so
# the exit code proves nothing. Count what was dumped against what is live.
# Extension-owned tables (PostGIS's spatial_ref_sys) are not dumped and not counted.
live_tables="$(docker exec hbcfield-postgres psql -U "$PG_USER" -d "$PG_DB" -Atc "
  SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind IN ('r','p')
    AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%'
    AND c.relname <> 'spatial_ref_sys'
    AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype = 'e')" | tr -d '[:space:]')"
dumped_tables="$(gzip -dc "$BACKUP" | grep -c '^CREATE TABLE' || true)"
[ -n "$live_tables" ] && [ "$live_tables" -gt 0 ] || fail "could not count live tables"
[ "$dumped_tables" -ge "$live_tables" ] || fail "backup has $dumped_tables tables, the live database has $live_tables — refusing to release on a backup that would not restore"
log "backup $BACKUP ($(du -h "$BACKUP" | cut -f1), $dumped_tables tables, live $live_tables)"

# ═══ 6. Rollback point ══════════════════════════════════════════════════════
step "Recording the running release"
{
  echo "prev_head=$PREV_HEAD"
  echo "target=$FULL_SHA"
  echo "registry=$REGISTRY"
  echo "backup=$BACKUP"
} > "$STATE_DIR/release.env"
for svc in "${SERVICES[@]}"; do
  c="$(container_of "$svc")"
  if docker inspect "$c" >/dev/null 2>&1; then
    id="$(docker inspect -f '{{.Image}}' "$c")"
    name="$(docker inspect -f '{{.Config.Image}}' "$c")"
    # Tag now, so pruning between here and a rollback cannot take the bits away.
    docker tag "$id" "$REGISTRY/hbcfield-$svc:$ROLLBACK_TAG"
    echo "$svc $id $name" >> "$PREVIOUS"
    log "$svc running $name (${id:7:12})"
  else
    log "$svc has no container yet"
  fi
done
git -C "$ROOT_DIR" tag -f "prod-pre-release-$STAMP" "$PREV_HEAD" >/dev/null
log "git tag prod-pre-release-$STAMP → ${PREV_HEAD:0:12}; image tag $ROLLBACK_TAG"

# ═══ 7. Change things, one service at a time ════════════════════════════════
PHASE="changing"
step "Moving the repository to ${FULL_SHA:0:12}"
if [ "$FULL_SHA" != "$PREV_HEAD" ]; then
  GIT_MOVED=1
  git -C "$ROOT_DIR" merge --ff-only --quiet "$FULL_SHA" || fail "fast-forward refused"
fi
[ "$(git -C "$ROOT_DIR" rev-parse HEAD)" = "$FULL_SHA" ] || fail "HEAD is not ${FULL_SHA:0:12} after the merge"
log "HEAD ${FULL_SHA:0:12}"

for svc in "${SERVICES[@]}"; do
  step "Starting $svc"
  TOUCHED+=("$svc")
  compose up -d --no-deps --no-build "$svc" || fail "compose up $svc failed"
  running_image="$(docker inspect -f '{{.Image}}' "$(container_of "$svc")")"
  wanted_image="$(docker image inspect -f '{{.Id}}' "$REGISTRY/hbcfield-$svc:$FULL_SHA")"
  [ "$running_image" = "$wanted_image" ] || fail "$svc is running ${running_image:7:12}, not the release image ${wanted_image:7:12}"
  if [ "$svc" = auth-service ]; then
    wait_auth_migrated || fail "auth-service did not finish its migrations"
  fi
  wait_healthy "$svc" "$HEALTH_TIMEOUT" || fail "$svc did not become healthy"
  check_required_env "$svc" || fail "$svc started without required configuration"
  case "$svc" in
    api-gateway)          expect_code "gateway /api/v1/health" 200 http://127.0.0.1:4000/api/v1/health || fail "gateway health endpoint" ;;
    notification-service) expect_code "notification /health" 200 http://127.0.0.1:4001/health || fail "notification health endpoint" ;;
    web-app)              expect_code "web :3001 /" '200|307|308' http://127.0.0.1:3001/ || fail "web app does not answer" ;;
  esac
  log "$svc healthy on ${FULL_SHA:0:12}"
done

# ═══ 8. Static assets ═══════════════════════════════════════════════════════
step "Publishing static assets"
# Not a rollback reason: nginx falls back to Node for anything missing, so a
# failed copy costs the optimisation and nothing a visitor would see.
if "$ROOT_DIR/infra/sync-static.sh"; then log "static synced"; else log "WARNING: sync-static failed — site serves assets through Node until it is re-run"; fi

# ═══ 9. Smoke tests ═════════════════════════════════════════════════════════
step "Smoke tests"
domain="${SMOKE_DOMAIN:-$(read_env DOMAIN)}"
smoke_failed=0
if [ -n "$domain" ]; then
  # Through THIS box's nginx (TLS vhost, static locations, proxy) by default, not
  # through Cloudflare: a bot challenge on a request from a datacentre IP would
  # otherwise roll back a healthy release. SMOKE_VIA_PUBLIC=1 goes the long way.
  via=(--resolve "$domain:443:127.0.0.1" -k)
  [ "${SMOKE_VIA_PUBLIC:-0}" = 1 ] && via=()
  expect_code "https://$domain/ (homepage)" 200 ${via[@]+"${via[@]}"} "https://$domain/" || smoke_failed=1
  expect_code "https://$domain/api/v1/health" 200 ${via[@]+"${via[@]}"} "https://$domain/api/v1/health" || smoke_failed=1
else
  log "DOMAIN not set in $ENV_FILE — public checks skipped"
fi
expect_code "POST /auth/login with bad credentials" '400|401' -X POST -H 'Content-Type: application/json' \
  --data '{"email":"release-smoke@invalid.hbcfield.com","password":"not-the-password-0"}' \
  http://127.0.0.1:4000/api/v1/auth/login || smoke_failed=1
# 401 means the route exists AND refuses a missing token. 404 means METRICS_TOKEN
# is unset, which silently blinds Prometheus — also a failure.
expect_code "GET /sync/metrics without a token" 401 http://127.0.0.1:4000/api/v1/sync/metrics || smoke_failed=1
restarting="$(docker ps --filter name=hbcfield- --filter status=restarting --format '{{.Names}}' | tr '\n' ' ')"
[ -z "${restarting// /}" ] || { log "restarting containers: $restarting"; smoke_failed=1; }
[ "$smoke_failed" = 0 ] || fail "smoke tests failed"

PHASE="released"
echo "$FULL_SHA" > "$RELEASE_DIR/current"
git -C "$ROOT_DIR" tag -f "prod-release-$STAMP" "$FULL_SHA" >/dev/null
step "Released ${FULL_SHA:0:12}"
log "rollback by hand: infra/release/deploy.sh ${PREV_HEAD:0:12}   (images for it must exist in GHCR), or see docs/release.md"
result "released"
