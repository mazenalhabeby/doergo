#!/bin/bash
#
# HBCField production deploy.
#
# Encodes the procedure that actually works on this box, including the failures
# that have bitten before. Each guard below exists because of a specific incident,
# noted inline — please do not "simplify" one away without reading why it is there.
#
#   ./deploy.sh              full deploy (backup → build → migrate → up → verify)
#   ./deploy.sh --no-build   restart/migrate only, skip image builds
#   ./deploy.sh --check      run the pre-flight checks and stop
#
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="$SCRIPT_DIR/.env.production"
BACKUP_DIR="${BACKUP_DIR:-/opt/doergo/backups}"
STAMP="$(date +%Y%m%d_%H%M%S)"

DO_BUILD=1
CHECK_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --no-build) DO_BUILD=0 ;;
    --check)    CHECK_ONLY=1 ;;
    *) echo "unknown argument: $arg" >&2; exit 2 ;;
  esac
done

step() { printf '\n\033[1m→ %s\033[0m\n' "$*"; }
die()  { printf '\n\033[31mFAILED: %s\033[0m\n' "$*" >&2; exit 1; }
trap 'die "aborted at line $LINENO"' ERR

# ── Pre-flight ──────────────────────────────────────────────────────────────
step "Pre-flight checks"

[ -f "$ENV_FILE" ] || die "$ENV_FILE not found. Secrets live only on this box, never in git."

# Every compose command MUST pass --env-file. Without it the stack comes up with
# an empty REDIS_PASSWORD (redis crash-loops) and the wrong web DOMAIN. Since the
# audit, POSTGRES_PASSWORD has no default either, so an env-less run now fails
# immediately instead of silently starting with a password published in the repo.
compose() { docker compose --env-file "$ENV_FILE" "$@"; }

grep -q "CHANGE_ME" "$ENV_FILE" && die "$ENV_FILE still contains CHANGE_ME placeholders."

# Read the DB identity FROM THE ENV FILE rather than hardcoding it. A previous
# backup ran as the wrong user, and pg_dump exited 0 while writing a valid, EMPTY
# 20-byte gzip — a backup that looked fine and restored nothing.
#
# Parsed, never SOURCED. A compose env file is not a shell script: values are
# literal, so they are not quoted, and `. "$ENV_FILE"` hands the shell whatever
# is in them. A password containing `#` aborted the entire pre-flight with
# "command not found" — the shell had reached the middle of a secret and tried
# to run it. Anything after `$(`, a backtick or `;` would have been worse.
read_env() { grep -E "^${1}=" "$ENV_FILE" | tail -1 | cut -d= -f2-; }
POSTGRES_USER="$(read_env POSTGRES_USER)"
POSTGRES_DB="$(read_env POSTGRES_DB)"
: "${POSTGRES_USER:?POSTGRES_USER missing from $ENV_FILE}"
: "${POSTGRES_DB:?POSTGRES_DB missing from $ENV_FILE}"
# Presence only — never read into a variable that could be echoed or leak into
# a trace. The container gets the password from the env file itself.
grep -qE "^POSTGRES_PASSWORD=.+" "$ENV_FILE" || die "POSTGRES_PASSWORD missing or empty in $ENV_FILE"

compose config --quiet || die "compose file does not render with this env file"

# The server cannot `git pull` — the deploy key is dead. Code arrives as a git
# bundle pushed over SSH and merged by hand. Refuse to deploy a dirty tree rather
# than silently shipping a local edit nobody can trace.
# --untracked-files=no on purpose. The production checkout legitimately carries
# untracked files that must never be committed and must never be deleted: the
# distributed APKs, a decade of .env.production backups, and
# docker-compose.override.yml, which holds prod-only configuration. Counting
# those as "dirty" refuses every deploy for the wrong reason. What matters here
# is a MODIFIED TRACKED file — an edit made directly on the box that a deploy
# would silently overwrite.
if [ -n "$(git -C "$ROOT_DIR" status --porcelain --untracked-files=no)" ]; then
  die "tracked files are modified on the server. Commit or stash before deploying:
$(git -C "$ROOT_DIR" status --short --untracked-files=no | head -20)"
fi
DEPLOY_SHA="$(git -C "$ROOT_DIR" rev-parse --short HEAD)"
echo "  deploying $DEPLOY_SHA ($(git -C "$ROOT_DIR" log -1 --format=%s | cut -c1-60))"

if [ "$CHECK_ONLY" = 1 ]; then echo; echo "pre-flight OK — stopping (--check)"; exit 0; fi

# ── Rollback point ──────────────────────────────────────────────────────────
step "Tagging the current release for rollback"
PREV_SHA="$(git -C "$ROOT_DIR" rev-parse --short HEAD@{1} 2>/dev/null || echo "$DEPLOY_SHA")"
git -C "$ROOT_DIR" tag -f "prod-pre-$STAMP" HEAD >/dev/null
echo "  rollback tag: prod-pre-$STAMP   (previous HEAD: $PREV_SHA)"

# ── Backup ──────────────────────────────────────────────────────────────────
step "Backing up the database"
mkdir -p "$BACKUP_DIR"
BACKUP="$BACKUP_DIR/pre-deploy_${STAMP}.sql.gz"
compose exec -T postgres pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "$BACKUP"

# NEVER trust pg_dump's exit code alone — it is 0 on the empty-dump failure above.
# Assert the dump actually contains tables.
TABLES="$(gzip -dc "$BACKUP" | grep -c '^CREATE TABLE' || true)"
[ "${TABLES:-0}" -ge 20 ] || die "backup looks empty (only ${TABLES:-0} CREATE TABLE). Refusing to migrate. File: $BACKUP"
echo "  $BACKUP  ($(du -h "$BACKUP" | cut -f1), $TABLES tables)"

# ── Build ───────────────────────────────────────────────────────────────────
if [ "$DO_BUILD" = 1 ]; then
  step "Building images ONE AT A TIME"
  # Building everything in one command has OOM-killed this box. The web build is
  # the heavy one, so it goes first and alone.
  for svc in web-app api-gateway auth-service task-service notification-service tracking-service admin-app; do
    compose config --services | grep -qx "$svc" || continue
    echo "  building $svc…"
    compose build "$svc" || die "build failed for $svc"
  done
fi

# ── Migrate ─────────────────────────────────────────────────────────────────
step "Applying database migrations"
# migrate deploy, never migrate dev: the shadow database this project needs for
# `dev` is broken by an old migration. Runs against DIRECT_DATABASE_URL because
# PgBouncer is in transaction pooling mode and cannot carry a migration session.
compose run --rm auth-service sh -c 'cd apps/api/auth-service && npx prisma migrate deploy' \
  || die "migrations failed — the stack has NOT been restarted, and $BACKUP is your restore point"

# ── Start ───────────────────────────────────────────────────────────────────
step "Starting services"
compose up -d

# ── Verify ──────────────────────────────────────────────────────────────────
step "Verifying"
sleep 8
compose ps

FAILED=0
for url in "http://localhost:4000/api/v1/health" "http://localhost:4001/health"; do
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$url" || echo 000)"
  printf '  %-45s %s\n' "$url" "$code"
  [ "$code" = "200" ] || FAILED=1
done

# A container that is up but restarting is not a successful deploy.
RESTARTING="$(compose ps --format '{{.Name}} {{.State}}' | grep -ci restarting || true)"
[ "$RESTARTING" = "0" ] || { echo "  $RESTARTING container(s) restarting"; FAILED=1; }

if [ "$FAILED" != 0 ]; then
  echo
  echo "  Deploy finished but health checks FAILED."
  echo "  Roll back:  git -C $ROOT_DIR reset --hard prod-pre-$STAMP && $0"
  echo "  Restore DB: gzip -dc $BACKUP | docker compose --env-file $ENV_FILE exec -T postgres psql -U $POSTGRES_USER $POSTGRES_DB"
  exit 1
fi

printf '\n\033[32m=== Deployed %s — healthy ===\033[0m\n' "$DEPLOY_SHA"
echo "rollback tag: prod-pre-$STAMP    backup: $BACKUP"
