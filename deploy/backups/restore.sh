#!/usr/bin/env bash
# Database restore script for Rizqun.
#
# Restores a gzipped pg_dump backup to a PostgreSQL database.
# Can restore to the original DB or a scratch DB for testing.
#
# Usage:
#   ./deploy/backups/restore.sh <backup_file.sql.gz> [target_db_name]
#
# Examples:
#   # Restore to original DB (rizqun_db):
#   ./deploy/backups/restore.sh backups/rizqun_2026-08-26_020000.sql.gz
#
#   # Restore to a scratch DB for testing:
#   ./deploy/backups/restore.sh backups/rizqun_2026-08-26_020000.sql.gz rizqun_test_restore
#
# WARNING: Restoring to the original DB will DROP and recreate all tables.
# Stop the API first (pm2 stop rizqun-api) before restoring.

set -euo pipefail

# ─── Validate arguments ────────────────────────────────────────
if [ $# -lt 1 ]; then
  echo "Usage: $0 <backup_file.sql.gz> [target_db_name]"
  echo ""
  echo "  backup_file.sql.gz - Path to the gzipped backup file"
  echo "  target_db_name     - Optional: target database (default: rizqun_db)"
  echo ""
  echo "WARNING: Restoring to rizqun_db will DROP and recreate all tables."
  echo "         Stop the API first: pm2 stop rizqun-api"
  exit 1
fi

BACKUP_FILE="$1"
TARGET_DB="${2:-rizqun_db}"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "ERROR: Backup file not found: $BACKUP_FILE"
  exit 1
fi

# ─── Load .env ────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
if [ -f "$SCRIPT_DIR/.env" ]; then
  set -a
  source "$SCRIPT_DIR/.env"
  set +a
fi

# ─── Configuration ────────────────────────────────────────────
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-rizqun_user}"
DB_PASSWORD="${DB_PASSWORD:-}"

if [ -z "$DB_PASSWORD" ]; then
  echo "ERROR: DB_PASSWORD is required"
  exit 1
fi

# Find psql — check env override, then PATH, then common paths
PSQL="${PSQL:-}"
if [ -z "$PSQL" ]; then
  PSQL=$(which psql 2>/dev/null || echo "")
fi
if [ -z "$PSQL" ]; then
  for path in /usr/bin/psql /usr/lib/postgresql/17/bin/psql /usr/lib/postgresql/16/bin/psql /usr/lib/postgresql/15/bin/psql /home/z/.local/pg-extract/client/usr/lib/postgresql/17/bin/psql /home/z/.local/pg-extract/server/usr/lib/postgresql/17/bin/psql; do
    if [ -x "$path" ]; then
      PSQL="$path"
      break
    fi
  done
fi
if [ -z "$PSQL" ]; then
  echo "ERROR: psql not found. Install postgresql-client."
  exit 1
fi

export PGPASSWORD="$DB_PASSWORD"

# ─── Confirm ──────────────────────────────────────────────────
FILE_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "═════════════════════════════════════════════════════════"
echo "  Rizqun Database Restore"
echo "═════════════════════════════════════════════════════════"
echo "  Backup file: $BACKUP_FILE ($FILE_SIZE)"
echo "  Target DB:   $TARGET_DB"
echo "  Host:        $DB_HOST:$DB_PORT"
echo "  User:        $DB_USER"
echo "═════════════════════════════════════════════════════════"
echo ""
echo "WARNING: This will DROP and recreate all tables in '$TARGET_DB'."
echo "         Make sure the API is stopped: pm2 stop rizqun-api"
echo ""
read -p "Type 'RESTORE' to proceed: " CONFIRM
if [ "$CONFIRM" != "RESTORE" ]; then
  echo "Aborted."
  exit 1
fi

# ─── Restore ─────────────────────────────────────────────────
echo ""
echo "[$(date -Iseconds)] Starting restore..."

# Drop and recreate the target database
echo "  Dropping database '$TARGET_DB'..."
$PSQL -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "DROP DATABASE IF EXISTS \"$TARGET_DB\";" 2>&1 || true

echo "  Creating database '$TARGET_DB'..."
$PSQL -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "CREATE DATABASE \"$TARGET_DB\";" 2>&1

echo "  Restoring from backup..."
gunzip -c "$BACKUP_FILE" | $PSQL -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$TARGET_DB" --quiet 2>&1

echo "[$(date -Iseconds)] Restore complete."

# ─── Verify ──────────────────────────────────────────────────
echo ""
echo "  Verifying restore..."
TABLE_COUNT=$($PSQL -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$TARGET_DB" -tAc "
  SELECT count(*) FROM information_schema.tables
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
" 2>&1)
USER_COUNT=$($PSQL -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$TARGET_DB" -tAc "SELECT count(*) FROM users;" 2>&1 || echo "N/A")
ORDER_COUNT=$($PSQL -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$TARGET_DB" -tAc "SELECT count(*) FROM orders;" 2>&1 || echo "N/A")

echo "  Tables: $TABLE_COUNT"
echo "  Users:  $USER_COUNT"
echo "  Orders: $ORDER_COUNT"
echo ""
echo "═════════════════════════════════════════════════════════"
echo "  Restore successful. ✅"
echo "  Restart the API: pm2 start rizqun-api"
echo "═════════════════════════════════════════════════════════"
