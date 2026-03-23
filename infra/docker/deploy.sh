#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="$SCRIPT_DIR/.env.production"

echo "=== Doergo Deployment ==="
echo "Root: $ROOT_DIR"
echo ""

# Check env file exists
if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: $ENV_FILE not found. Copy .env.production and fill in values."
  exit 1
fi

# Check for placeholder values
if grep -q "CHANGE_ME" "$ENV_FILE"; then
  echo "WARNING: .env.production contains CHANGE_ME placeholders."
  echo "Please update all secrets before deploying to production."
  read -p "Continue anyway? (y/N) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi

cd "$SCRIPT_DIR"

echo "→ Pulling latest code..."
git -C "$ROOT_DIR" pull origin main

echo "→ Building images..."
docker compose --env-file "$ENV_FILE" build

echo "→ Starting services..."
docker compose --env-file "$ENV_FILE" up -d

echo ""
echo "→ Container status:"
docker compose --env-file "$ENV_FILE" ps

echo ""
echo "=== Deployment complete ==="
