#!/bin/bash
#
# Verify that a backup can actually be restored.
#
# An unrestored backup is a hypothesis. This takes one (or reads a file you name),
# restores it into a THROWAWAY database beside the live one, and compares table
# and row counts. It never writes to the live database.
#
#   ./verify-restore.sh                          back up now, then restore-test it
#   ./verify-restore.sh /path/to/backup.sql.gz   restore-test an existing backup
#
# Run it monthly, and after any change to the backup job. The failure this exists
# to catch is silent: pg_dump as the wrong user exits 0 and writes a valid, EMPTY
# 20-byte gzip — a backup that looks fine and restores nothing.
#
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="${ENV_FILE:-$SCRIPT_DIR/../docker/.env.production}"
SCRATCH_DB="restore_verify_$(date +%s)"

die() { printf '\n\033[31mFAILED: %s\033[0m\n' "$*" >&2; exit 1; }
step() { printf '\n\033[1m→ %s\033[0m\n' "$*"; }

[ -f "$ENV_FILE" ] || die "$ENV_FILE not found (override with ENV_FILE=…)"
# shellcheck disable=SC1090
set -a; . "$ENV_FILE"; set +a
: "${POSTGRES_USER:?missing from $ENV_FILE}"
: "${POSTGRES_DB:?missing from $ENV_FILE}"

PG="${PG_CONTAINER:-hbcfield-postgres}"
docker inspect "$PG" >/dev/null 2>&1 || die "container $PG not running (override with PG_CONTAINER=…)"

psql_scratch() { docker exec -i "$PG" psql -U "$POSTGRES_USER" -d "$SCRATCH_DB" "$@"; }
psql_admin()   { docker exec -i "$PG" psql -U "$POSTGRES_USER" -d postgres "$@"; }

cleanup() { psql_admin -qc "DROP DATABASE IF EXISTS $SCRATCH_DB;" >/dev/null 2>&1 || true; }
trap cleanup EXIT

# ── 1. Obtain a backup ──────────────────────────────────────────────────────
if [ $# -ge 1 ]; then
  BACKUP="$1"
  [ -f "$BACKUP" ] || die "no such file: $BACKUP"
  step "Using existing backup: $BACKUP"
else
  BACKUP="$(mktemp -t verify-restore).sql.gz"
  step "Taking a fresh backup"
  docker exec "$PG" pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "$BACKUP"
fi

TABLES_IN_DUMP="$(gzip -dc "$BACKUP" | grep -c '^CREATE TABLE' || true)"
echo "  $(du -h "$BACKUP" | cut -f1), $TABLES_IN_DUMP CREATE TABLE statements"
[ "${TABLES_IN_DUMP:-0}" -ge 20 ] \
  || die "this backup is effectively empty ($TABLES_IN_DUMP tables). THE BACKUP IS BAD — check the pg_dump user."

# ── 2. Restore into a scratch database ──────────────────────────────────────
step "Restoring into $SCRATCH_DB (the live database is not touched)"
psql_admin -qc "CREATE DATABASE $SCRATCH_DB;" >/dev/null
LOG="$(mktemp)"
gzip -dc "$BACKUP" | psql_scratch -q > "$LOG" 2>&1 || true
ERRS="$(grep -ci '^ERROR' "$LOG" || true)"
if [ "${ERRS:-0}" -gt 0 ]; then
  echo "  $ERRS error line(s) during restore:"
  grep -i '^ERROR' "$LOG" | sort | uniq -c | sort -rn | head -5
  rm -f "$LOG"
  die "restore produced errors — this backup does not cleanly restore"
fi
rm -f "$LOG"
echo "  restored with 0 errors"

# ── 3. Compare against the live database ────────────────────────────────────
step "Comparing structure and row counts"
count_live()    { docker exec "$PG" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "$1"; }
count_scratch() { docker exec "$PG" psql -U "$POSTGRES_USER" -d "$SCRATCH_DB"  -tAc "$1"; }

FAILED=0
for q in \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'|tables" \
  "SELECT count(*) FROM pg_indexes WHERE schemaname='public'|indexes" ; do
  sql="${q%|*}"; label="${q##*|}"
  a="$(count_live "$sql")"; b="$(count_scratch "$sql")"
  printf '  %-10s live=%-6s restored=%-6s %s\n' "$label" "$a" "$b" "$([ "$a" = "$b" ] && echo ok || echo MISMATCH)"
  [ "$a" = "$b" ] || FAILED=1
done

# Row counts for the tables that would hurt most to lose.
for t in users organizations tasks time_entries company_locations customers assets invoices; do
  a="$(count_live "SELECT count(*) FROM \"$t\";" 2>/dev/null || echo skip)"
  [ "$a" = "skip" ] && continue
  b="$(count_scratch "SELECT count(*) FROM \"$t\";" 2>/dev/null || echo ERR)"
  printf '  %-20s live=%-8s restored=%-8s %s\n' "$t" "$a" "$b" "$([ "$a" = "$b" ] && echo ok || echo MISMATCH)"
  [ "$a" = "$b" ] || FAILED=1
done

[ "$FAILED" = 0 ] || die "the restored copy does not match the live database"
printf '\n\033[32m=== RESTORE VERIFIED — this backup is recoverable ===\033[0m\n'
echo "backup: $BACKUP"
