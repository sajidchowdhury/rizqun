#!/usr/bin/env bash
# Database backup script for Rizqun.
#
# Creates a gzipped pg_dump of the rizqun_db database, with:
#   - Timestamped filename (rizqun_YYYY-MM-DD_HHMMSS.sql.gz)
#   - Local retention (keeps last 30 days)
#   - Optional offsite upload (S3-compatible storage via rclone or aws-cli)
#
# Usage:
#   ./deploy/backups/backup.sh
#
# Cron (run nightly at 2 AM):
#   0 2 * * * /home/rizqun/rizqun/deploy/backups/backup.sh >> /home/rizqun/logs/backup.log 2>&1
#
# Environment variables (set in .env or shell):
#   DB_HOST       - PostgreSQL host (default: 127.0.0.1)
#   DB_PORT       - PostgreSQL port (default: 5432)
#   DB_NAME       - Database name (default: rizqun_db)
#   DB_USER       - Database user (default: rizqun_user)
#   DB_PASSWORD   - Database password (required)
#   BACKUP_DIR    - Local backup directory (default: ./backups)
#   RETENTION_DAYS - Days to keep locally (default: 30)
#   OFFSITE_ENABLED - Set to 'true' to upload offsite (default: false)
#   OFFSITE_CMD   - Command to upload (e.g. 'rclone copy' or 'aws s3 cp')
#   OFFSITE_TARGET - Target path (e.g. 's3:my-bucket/rizqun-backups/')

set -euo pipefail

# ─── Load .env if it exists ────────────────────────────────────
# Source .env for DB credentials if not already set in environment.
# In production, set these via cron environment or a separate .env.backup file.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
if [ -f "$SCRIPT_DIR/.env" ]; then
  # Extract only DB_* vars from .env (avoid loading JWT secrets etc.)
  while IFS='=' read -r key value; do
    case "$key" in
      DB_HOST|DB_PORT|DB_NAME|DB_USER|DB_PASSWORD|BACKUP_DIR|RETENTION_DAYS|OFFSITE_ENABLED|OFFSITE_CMD|OFFSITE_TARGET)
        # Only set if not already in environment
        if [ -z "${!key:-}" ]; then
          export "$key=$value"
        fi
        ;;
    esac
  done < "$SCRIPT_DIR/.env"
fi

# Parse DB_PASSWORD from DATABASE_URL if not set directly
if [ -z "${DB_PASSWORD:-}" ] && [ -n "${DATABASE_URL:-}" ]; then
  DB_PASSWORD=$(echo "$DATABASE_URL" | sed -n 's|.*://[^:]*:\([^@]*\)@.*||p')
fi

# ─── Configuration ────────────────────────────────────────────
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-rizqun_db}"
DB_USER="${DB_USER:-rizqun_user}"
DB_PASSWORD="${DB_PASSWORD:-}"

BACKUP_DIR="${BACKUP_DIR:-$SCRIPT_DIR/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
OFFSITE_ENABLED="${OFFSITE_ENABLED:-false}"
OFFSITE_CMD="${OFFSITE_CMD:-}"
OFFSITE_TARGET="${OFFSITE_TARGET:-}"

# ─── Validate ────────────────────────────────────────────────
if [ -z "$DB_PASSWORD" ]; then
  echo "ERROR: DB_PASSWORD is required (set in .env or environment)"
  exit 1
fi

# Find pg_dump — check env override, then PATH, then common paths
PG_DUMP="${PG_DUMP:-}"
if [ -z "$PG_DUMP" ]; then
  PG_DUMP=$(which pg_dump 2>/dev/null || echo "")
fi
if [ -z "$PG_DUMP" ]; then
  for path in /usr/bin/pg_dump /usr/lib/postgresql/17/bin/pg_dump /usr/lib/postgresql/16/bin/pg_dump /usr/lib/postgresql/15/bin/pg_dump /home/z/.local/pg-extract/client/usr/lib/postgresql/17/bin/pg_dump /home/z/.local/pg-extract/server/usr/lib/postgresql/17/bin/pg_dump; do
    if [ -x "$path" ]; then
      PG_DUMP="$path"
      break
    fi
  done
fi
if [ -z "$PG_DUMP" ]; then
  echo "ERROR: pg_dump not found. Install postgresql-client or add to PATH."
  exit 1
fi

# ─── Create backup directory ──────────────────────────────────
mkdir -p "$BACKUP_DIR"

# ─── Generate backup ─────────────────────────────────────────
TIMESTAMP=$(date +"%Y-%m-%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/rizqun_${TIMESTAMP}.sql.gz"

echo "[$(date -Iseconds)] Starting backup: $BACKUP_FILE"

export PGPASSWORD="$DB_PASSWORD"

# pg_dump with custom format options:
#   -Fc = custom format (supports parallel restore) — but we use plain SQL for simplicity
#   -U  = user
#   -h  = host
#   -p  = port
# We pipe through gzip for compression (typically 5-10x for SQL)
"$PG_DUMP" \
  -h "$DB_HOST" \
  -p "$DB_PORT" \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  --no-owner \
  --no-privileges \
  | gzip -9 > "$BACKUP_FILE"

BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "[$(date -Iseconds)] Backup created: $BACKUP_FILE ($BACKUP_SIZE)"

# ─── Offsite upload (optional) ────────────────────────────────
if [ "$OFFSITE_ENABLED" = "true" ] && [ -n "$OFFSITE_CMD" ] && [ -n "$OFFSITE_TARGET" ]; then
  echo "[$(date -Iseconds)] Uploading to offsite storage..."
  $OFFSITE_CMD "$BACKUP_FILE" "$OFFSITE_TARGET"
  echo "[$(date -Iseconds)] Offsite upload complete"
else
  echo "[$(date -Iseconds)] Offsite upload skipped (OFFSITE_ENABLED != true)"
fi

# ─── Local retention cleanup ─────────────────────────────────
echo "[$(date -Iseconds)] Cleaning up backups older than $RETENTION_DAYS days..."
DELETED=$(find "$BACKUP_DIR" -name "rizqun_*.sql.gz" -mtime +$RETENTION_DAYS -print -delete | wc -l)
echo "[$(date -Iseconds)] Deleted $DELETED old backup(s)"

# ─── Summary ──────────────────────────────────────────────────
TOTAL_BACKUPS=$(find "$BACKUP_DIR" -name "rizqun_*.sql.gz" | wc -l)
TOTAL_SIZE=$(du -sh "$BACKUP_DIR" | cut -f1)
echo "[$(date -Iseconds)] Backup complete. $TOTAL_BACKUPS backup(s) on disk, total: $TOTAL_SIZE"
