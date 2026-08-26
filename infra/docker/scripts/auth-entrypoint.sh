#!/bin/sh
set -e

cd /app/apps/api/auth-service

# ── Migrations must NOT reach the database through PgBouncer ────────────────
#
# `prisma migrate deploy` takes a session-scoped advisory lock. PgBouncer runs
# transaction pooling, so that lock outlives its transaction on a server
# connection that is then handed to other clients, and nothing ever releases it.
# Every later migration — so every service start — blocks on it forever.
#
# This is not hypothetical. On 2026-08-26 a migration reached Postgres through
# the pooler and held advisory lock 72707369 for over an hour. auth-service
# could not finish starting, failed its health check, was restarted, queued
# another waiter, and repeated until 94 of the 100 connection slots were
# blocked and NOBODY COULD LOG IN.
#
# The line that did it read:
#     DATABASE_URL="${DIRECT_DATABASE_URL:-$DATABASE_URL}" npx prisma migrate deploy
# The fallback is the whole bug. When DIRECT_DATABASE_URL was missing it quietly
# used the pooled URL and looked like it had worked. A missing direct URL has to
# stop the container, not downgrade it to the one connection that must never be
# used here.
if [ -z "$DIRECT_DATABASE_URL" ]; then
  echo "FATAL: DIRECT_DATABASE_URL is not set." >&2
  echo "  Migrations need a direct (non-pooled) connection. Refusing to fall back" >&2
  echo "  to DATABASE_URL, which points at PgBouncer." >&2
  exit 1
fi

case "$DIRECT_DATABASE_URL" in
  *pgbouncer*|*:6432*)
    echo "FATAL: DIRECT_DATABASE_URL points at PgBouncer:" >&2
    echo "  $(echo "$DIRECT_DATABASE_URL" | sed -E 's#://[^@]*@#://***:***@#')" >&2
    echo "  Migrate needs Postgres directly (port 5432), not the pooler." >&2
    exit 1
    ;;
esac

echo "Running database migrations (direct connection)..."
DATABASE_URL="$DIRECT_DATABASE_URL" npx prisma migrate deploy
echo "Migrations complete."

echo "Starting auth-service..."
exec node /app/apps/api/auth-service/dist/main.js
