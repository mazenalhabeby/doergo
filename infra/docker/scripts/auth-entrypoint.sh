#!/bin/sh
set -e

echo "Running database migrations..."
cd /app/apps/api/auth-service
# Migrations must use a DIRECT Postgres connection — PgBouncer transaction pooling
# breaks Prisma migrate's advisory locks. Fall back to DATABASE_URL if no direct URL.
DATABASE_URL="${DIRECT_DATABASE_URL:-$DATABASE_URL}" npx prisma migrate deploy
echo "Migrations complete."

echo "Starting auth-service..."
exec node /app/apps/api/auth-service/dist/main.js
