#!/bin/bash
set -e

echo "=========================================="
echo "  Doergo - Production Deployment Script"
echo "=========================================="

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Check if .env exists
if [ ! -f infra/docker/.env ]; then
    echo -e "${RED}Error: infra/docker/.env not found${NC}"
    echo "Copy .env.production to .env and fill in your values:"
    echo "  cp infra/docker/.env.production infra/docker/.env"
    echo "  nano infra/docker/.env"
    exit 1
fi

echo -e "${GREEN}[1/5]${NC} Building Docker images..."
docker compose -f infra/docker/docker-compose.yml build --no-cache

echo -e "${GREEN}[2/5]${NC} Starting infrastructure (PostgreSQL + Redis)..."
docker compose -f infra/docker/docker-compose.yml up -d postgres redis
echo "Waiting for database to be ready..."
sleep 10

echo -e "${GREEN}[3/5]${NC} Running database migrations..."
docker compose -f infra/docker/docker-compose.yml run --rm auth-service sh -c "cd apps/api/auth-service && npx prisma migrate deploy"

echo -e "${GREEN}[4/5]${NC} Seeding database..."
docker compose -f infra/docker/docker-compose.yml run --rm auth-service sh -c "cd apps/api/auth-service && npx prisma db seed"

echo -e "${GREEN}[5/5]${NC} Starting all services..."
docker compose -f infra/docker/docker-compose.yml up -d

echo ""
echo -e "${GREEN}=========================================="
echo "  Deployment Complete!"
echo "==========================================${NC}"
echo ""
echo "Services running:"
docker compose -f infra/docker/docker-compose.yml ps
echo ""
echo -e "${YELLOW}URLs:${NC}"
echo "  Web App:    http://YOUR_SERVER_IP"
echo "  API:        http://YOUR_SERVER_IP/api/v1"
echo "  Swagger:    http://YOUR_SERVER_IP/docs"
echo "  Bull Board: http://YOUR_SERVER_IP/admin/queues"
echo ""
echo -e "${YELLOW}Logs:${NC}"
echo "  docker compose -f infra/docker/docker-compose.yml logs -f"
