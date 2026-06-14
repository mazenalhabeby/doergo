#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# HBCField Database Backup Script
#
# Usage:
#   ./backup-db.sh                    # Backup with default settings
#   BACKUP_DIR=/mnt/backups ./backup-db.sh  # Custom backup directory
#
# Cron (daily at 2 AM):
#   0 2 * * * /opt/hbcfield/infra/scripts/backup-db.sh >> /var/log/hbcfield-backup.log 2>&1
#
# Environment variables:
#   DATABASE_URL    - PostgreSQL connection string (required)
#   BACKUP_DIR      - Directory to store backups (default: ./backups)
#   RETENTION_DAYS  - Number of days to keep backups (default: 30)
#   S3_BUCKET       - S3 bucket for offsite backup (optional)
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

# Configuration
BACKUP_DIR="${BACKUP_DIR:-$(dirname "$0")/../../backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/hbcfield_${TIMESTAMP}.sql.gz"

# Ensure backup directory exists
mkdir -p "$BACKUP_DIR"

echo "[$(date)] Starting database backup..."

# Extract connection details from DATABASE_URL or use defaults
DB_HOST="${PGHOST:-localhost}"
DB_PORT="${PGPORT:-5432}"
DB_NAME="${PGDATABASE:-hbcfield}"
DB_USER="${PGUSER:-hbcfield}"

# Perform backup
if [ -n "${DATABASE_URL:-}" ]; then
  pg_dump "$DATABASE_URL" --no-owner --no-privileges | gzip > "$BACKUP_FILE"
else
  PGPASSWORD="${PGPASSWORD:-hbcfield_secret}" pg_dump \
    -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
    --no-owner --no-privileges | gzip > "$BACKUP_FILE"
fi

BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "[$(date)] Backup created: $BACKUP_FILE ($BACKUP_SIZE)"

# Upload to S3 if configured
if [ -n "${S3_BUCKET:-}" ]; then
  aws s3 cp "$BACKUP_FILE" "s3://${S3_BUCKET}/db-backups/$(basename "$BACKUP_FILE")"
  echo "[$(date)] Uploaded to S3: s3://${S3_BUCKET}/db-backups/$(basename "$BACKUP_FILE")"
fi

# Clean up old backups
DELETED=$(find "$BACKUP_DIR" -name "hbcfield_*.sql.gz" -mtime +"$RETENTION_DAYS" -delete -print | wc -l)
if [ "$DELETED" -gt 0 ]; then
  echo "[$(date)] Cleaned up $DELETED old backup(s) (older than ${RETENTION_DAYS} days)"
fi

echo "[$(date)] Backup complete."
