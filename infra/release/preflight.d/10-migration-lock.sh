#!/usr/bin/env bash
#
# Refuse a release while Prisma's migration lock is held.
#
# `prisma migrate deploy` takes session advisory lock 72707369. On 2026-08-26 a
# migration reached Postgres through PgBouncer, the lock outlived its session,
# and every later auth-service start queued behind it until logins stopped.
# Releasing into that state recreates auth-service, which then hangs on the same
# lock — so the release would roll back for a reason that has nothing to do with
# the code. Find it first, and say what to do.
#
# Environment from deploy.sh: PG_USER, PG_DB.
set -euo pipefail

held="$(docker exec hbcfield-postgres psql -U "${PG_USER:-doergo}" -d "${PG_DB:-doergo}" -Atc \
  "SELECT count(*) FROM pg_locks WHERE locktype = 'advisory' AND objid = 72707369 AND granted" | tr -d '[:space:]')"

if [ "${held:-0}" != "0" ]; then
  echo "Prisma's migration advisory lock (72707369) is held. Find the holder with:"
  echo "  SELECT pid, application_name, state, query_start FROM pg_stat_activity"
  echo "  WHERE pid IN (SELECT pid FROM pg_locks WHERE locktype='advisory' AND objid=72707369);"
  echo "and end it (pg_terminate_backend) once you know what it is."
  exit 1
fi
echo "migration lock free"
