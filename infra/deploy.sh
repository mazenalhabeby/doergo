#!/bin/bash
set -e

echo "=========================================="
echo "  Doergo - Production Deployment"
echo "=========================================="

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

cd "$(dirname "$0")/.."

# Check if .env exists
if [ ! -f infra/docker/.env ]; then
    echo -e "${RED}Error: infra/docker/.env not found${NC}"
    echo "Run these commands first:"
    echo "  cp infra/docker/.env.production infra/docker/.env"
    echo "  nano infra/docker/.env   # fill in passwords & secrets"
    exit 1
fi

echo -e "${GREEN}[1/5]${NC} Building Docker images..."
docker compose -f infra/docker/docker-compose.yml build

echo -e "${GREEN}[2/5]${NC} Starting infrastructure (PostgreSQL + Redis)..."
docker compose -f infra/docker/docker-compose.yml up -d postgres redis
echo "Waiting for database to be ready..."
sleep 10

echo -e "${GREEN}[3/5]${NC} Running database migrations..."
docker compose -f infra/docker/docker-compose.yml run --rm auth-service sh -c "cd apps/api/auth-service && npx prisma migrate deploy"

echo -e "${GREEN}[4/5]${NC} Seeding database..."
docker compose -f infra/docker/docker-compose.yml run --rm auth-service sh -c "cd apps/api/auth-service && npx prisma db seed" || echo "Seed skipped (may already exist)"

echo -e "${GREEN}[5/5]${NC} Starting all services..."
docker compose -f infra/docker/docker-compose.yml up -d

echo ""
echo -e "${GREEN}Deployment complete!${NC}"
docker compose -f infra/docker/docker-compose.yml ps
