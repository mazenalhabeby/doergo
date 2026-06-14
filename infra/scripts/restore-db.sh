#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# HBCField Database Restore Script
#
# Usage:
#   ./restore-db.sh /path/to/backup.sql.gz
#   ./restore-db.sh latest                    # Restore most recent backup
#
# WARNING: This will DROP and recreate the database schema!
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-$(dirname "$0")/../../backups}"

if [ $# -eq 0 ]; then
  echo "Usage: $0 <backup_file.sql.gz | latest>"
  echo ""
  echo "Available backups:"
  ls -lh "$BACKUP_DIR"/hbcfield_*.sql.gz 2>/dev/null || echo "  No backups found in $BACKUP_DIR"
  exit 1
fi

BACKUP_FILE="$1"

# Handle "latest" shortcut
if [ "$BACKUP_FILE" = "latest" ]; then
  BACKUP_FILE=$(ls -t "$BACKUP_DIR"/hbcfield_*.sql.gz 2>/dev/null | head -1)
  if [ -z "$BACKUP_FILE" ]; then
    echo "ERROR: No backups found in $BACKUP_DIR"
    exit 1
  fi
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "ERROR: Backup file not found: $BACKUP_FILE"
  exit 1
fi

echo "╔══════════════════════════════════════════════════════╗"
echo "║  WARNING: This will overwrite the current database  ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "Backup file: $BACKUP_FILE"
echo "File size:   $(du -h "$BACKUP_FILE" | cut -f1)"
echo ""
read -p "Are you sure? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
  echo "Aborted."
  exit 0
fi

DB_HOST="${PGHOST:-localhost}"
DB_PORT="${PGPORT:-5432}"
DB_NAME="${PGDATABASE:-hbcfield}"
DB_USER="${PGUSER:-hbcfield}"

echo "[$(date)] Restoring from $BACKUP_FILE..."

if [ -n "${DATABASE_URL:-}" ]; then
  gunzip -c "$BACKUP_FILE" | psql "$DATABASE_URL"
else
  PGPASSWORD="${PGPASSWORD:-hbcfield_secret}" gunzip -c "$BACKUP_FILE" | \
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME"
fi

echo "[$(date)] Restore complete."
echo ""
echo "Next steps:"
echo "  1. Run 'pnpm db:generate' to regenerate Prisma client"
echo "  2. Restart all services"
