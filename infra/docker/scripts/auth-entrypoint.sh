#!/bin/sh
set -e

echo "Running database migrations..."
cd /app/apps/api/auth-service
npx prisma migrate deploy
echo "Migrations complete."

echo "Starting auth-service..."
exec node /app/apps/api/auth-service/dist/main.js
