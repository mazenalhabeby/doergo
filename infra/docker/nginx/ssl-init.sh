#!/bin/bash
# SSL Certificate Initialization Script
# Run this ONCE on first deployment to obtain Let's Encrypt certificates.
#
# Usage: ./ssl-init.sh doergo.hbc-solution.io your@email.com
#
# Prerequisites:
# - Docker and Docker Compose installed
# - DNS A record pointing to this server
# - Ports 80 and 443 open

set -e

DOMAIN=${1:?Usage: ./ssl-init.sh <domain> <email>}
EMAIL=${2:?Usage: ./ssl-init.sh <domain> <email>}
COMPOSE_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== Doergo SSL Certificate Setup ==="
echo "Domain: $DOMAIN"
echo "Email:  $EMAIL"
echo ""

# Step 1: Create a temporary nginx config for the ACME challenge
echo "→ Creating temporary nginx config for certificate challenge..."
mkdir -p "$COMPOSE_DIR/nginx"
cat > "$COMPOSE_DIR/nginx/default.conf.tmp" << 'TMPCONF'
server {
    listen 80;
    server_name _;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location = /health {
        return 200 'ok';
        add_header Content-Type text/plain;
    }

    location / {
        return 200 'Waiting for SSL setup...';
        add_header Content-Type text/plain;
    }
}
TMPCONF

# Step 2: Start nginx with temporary config
echo "→ Starting nginx with temporary config..."
docker run -d --name doergo-ssl-init \
  -p 80:80 \
  -v "$COMPOSE_DIR/nginx/default.conf.tmp:/etc/nginx/conf.d/default.conf:ro" \
  -v "doergo-certbot-www:/var/www/certbot" \
  nginx:1.27-alpine

# Step 3: Obtain certificate
echo "→ Requesting certificate from Let's Encrypt..."
docker run --rm \
  -v "doergo-certbot-conf:/etc/letsencrypt" \
  -v "doergo-certbot-www:/var/www/certbot" \
  certbot/certbot certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    --email "$EMAIL" \
    --agree-tos \
    --no-eff-email \
    -d "$DOMAIN"

# Step 4: Cleanup temporary nginx
echo "→ Cleaning up temporary nginx..."
docker stop doergo-ssl-init && docker rm doergo-ssl-init
rm -f "$COMPOSE_DIR/nginx/default.conf.tmp"

# Step 5: Update nginx config with the actual domain
echo "→ Updating nginx config with domain: $DOMAIN"
sed -i.bak "s/\${DOMAIN}/$DOMAIN/g" "$COMPOSE_DIR/nginx/default.conf"
rm -f "$COMPOSE_DIR/nginx/default.conf.bak"

echo ""
echo "=== SSL Setup Complete ==="
echo "Certificates stored in Docker volume: doergo-certbot-conf"
echo ""
echo "Next steps:"
echo "  1. Review .env.production and set all required values"
echo "  2. Run: docker compose --env-file .env.production up -d"
echo "  3. Verify: curl -I https://$DOMAIN"
