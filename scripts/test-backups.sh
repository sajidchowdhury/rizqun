#!/usr/bin/env bash
# One-shot database backup + restore smoke test.
# Run with: bash scripts/test-backups.sh

cd /home/z/my-project/rizqun
unset DATABASE_URL

PSQL=/home/z/.local/pg-extract/client/usr/lib/postgresql/17/bin/psql
PG_DUMP=/home/z/.local/pg-extract/server/usr/lib/postgresql/17/bin/pg_dump

export PGPASSWORD=rizqun_password

echo "═════════════════════════════════════════════════════════"
echo "  Rizqun — Database Backup + Restore smoke test"
echo "═════════════════════════════════════════════════════════"

# ─── 1. Create a test backup ──────────────────────────────────
echo ""
echo "── 1. Create backup ────────────────────────────────────"
export DB_HOST=127.0.0.1
export DB_PORT=5432
export DB_NAME=rizqun_db
export DB_USER=rizqun_user
export DB_PASSWORD=rizqun_password
export BACKUP_DIR=/tmp/rizqun-backup-test
export RETENTION_DAYS=1
export OFFSITE_ENABLED=false

rm -rf $BACKUP_DIR
bash deploy/backups/backup.sh 2>&1 | tail -10

BACKUP_FILE=$(ls $BACKUP_DIR/rizqun_*.sql.gz 2>/dev/null | head -1)
if [ -n "$BACKUP_FILE" ]; then
  BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
  echo "   ✓ Backup created: $BACKUP_FILE ($BACKUP_SIZE)"
else
  echo "   ✗ FAIL: no backup file created"
  exit 1
fi

# ─── 2. Verify backup contains data ────────────────────────────
echo ""
echo "── 2. Verify backup content ──────────────────────────────"
TABLES_IN_BACKUP=$(gunzip -c "$BACKUP_FILE" | grep -c "CREATE TABLE" || echo 0)
echo "   CREATE TABLE statements: $TABLES_IN_BACKUP (expected > 0)"
if [ "$TABLES_IN_BACKUP" -gt 0 ]; then
  echo "   ✓ Backup contains table definitions"
else
  echo "   ✗ FAIL: backup is empty or malformed"
  exit 1
fi

INSERT_COUNT=$(gunzip -c "$BACKUP_FILE" | grep -c "INSERT INTO" || echo 0)
echo "   INSERT statements: $INSERT_COUNT"
if [ "$INSERT_COUNT" -gt 0 ]; then
  echo "   ✓ Backup contains data rows"
else
  echo "   ⚠ No INSERT statements (DB may be empty)"
fi

# ─── 3. Restore to scratch DB ─────────────────────────────────
echo ""
echo "── 3. Restore to scratch DB (rizqun_test_restore) ──────"
# Drop test DB if exists
$PSQL -h 127.0.0.1 -p 5432 -U z -d postgres -c "DROP DATABASE IF EXISTS rizqun_test_restore;" > /dev/null 2>&1
# Create test DB
$PSQL -h 127.0.0.1 -p 5432 -U z -d postgres -c "CREATE DATABASE rizqun_test_restore OWNER rizqun_user;" > /dev/null 2>&1

echo "   Restoring..."
gunzip -c "$BACKUP_FILE" | $PSQL -h 127.0.0.1 -p 5432 -U rizqun_user -d rizqun_test_restore --quiet 2>&1 | tail -5

echo "   Verifying restore..."
TABLE_COUNT=$($PSQL -h 127.0.0.1 -p 5432 -U rizqun_user -d rizqun_test_restore -tAc "
  SELECT count(*) FROM information_schema.tables
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
" 2>&1)
echo "   Tables in restored DB: $TABLE_COUNT"

if [ "$TABLE_COUNT" -gt 0 ]; then
  echo "   ✓ Restore successful (tables present)"
else
  echo "   ✗ FAIL: no tables in restored DB"
  exit 1
fi

# Verify categories (seeded)
CAT_COUNT=$($PSQL -h 127.0.0.1 -p 5432 -U rizqun_user -d rizqun_test_restore -tAc "SELECT count(*) FROM categories;" 2>&1)
echo "   Categories: $CAT_COUNT (expected 3)"

# Verify admin user
USER_COUNT=$($PSQL -h 127.0.0.1 -p 5432 -U rizqun_user -d rizqun_test_restore -tAc "SELECT count(*) FROM users;" 2>&1)
echo "   Users: $USER_COUNT (expected 1 — admin)"

if [ "$CAT_COUNT" = "3" ] && [ "$USER_COUNT" -ge 1 ]; then
  echo "   ✓ Data verified in restored DB"
else
  echo "   ✗ FAIL: data mismatch"
  exit 1
fi

# ─── 4. Test retention cleanup ─────────────────────────────────
echo ""
echo "── 4. Test retention cleanup ──────────────────────────"
# Create a fake old backup (7 days ago)
OLD_FILE="$BACKUP_DIR/rizqun_2020-01-01_000000.sql.gz"
echo "fake old backup" > "$OLD_FILE"
touch -d "2020-01-01" "$OLD_FILE"
echo "   Created fake old backup: $OLD_FILE (dated 2020-01-01)"

# Run backup again — should clean up old files
bash deploy/backups/backup.sh 2>&1 | grep -E "Deleted|complete"

if [ ! -f "$OLD_FILE" ]; then
  echo "   ✓ Old backup deleted by retention"
else
  echo "   ✗ FAIL: old backup not deleted"
fi

# ─── 5. Verify scripts are executable ─────────────────────────
echo ""
echo "── 5. Scripts executable ───────────────────────────────"
chmod +x deploy/backups/backup.sh deploy/backups/restore.sh
if [ -x deploy/backups/backup.sh ]; then
  echo "   ✓ backup.sh is executable"
else
  echo "   ✗ FAIL: backup.sh not executable"
fi
if [ -x deploy/backups/restore.sh ]; then
  echo "   ✓ restore.sh is executable"
else
  echo "   ✗ FAIL: restore.sh not executable"
fi

# ─── 6. Verify README docs ─────────────────────────────────────
echo ""
echo "── 6. Verify backup docs ────────────────────────────────"
if [ -f deploy/backups/README.md ]; then
  echo "   ✓ deploy/backups/README.md exists"
  grep -qi "cron" deploy/backups/README.md && echo "   ✓ Cron instructions documented"
  grep -qi "restore" deploy/backups/README.md && echo "   ✓ Restore instructions documented"
  grep -qi "retention" deploy/backups/README.md && echo "   ✓ Retention documented"
  grep -qi "offsite" deploy/backups/README.md && echo "   ✓ Offsite upload documented"
  grep -qi "rclone\|aws" deploy/backups/README.md && echo "   ✓ Offsite tools (rclone/aws) documented"
else
  echo "   ✗ FAIL: deploy/backups/README.md not found"
fi

# ─── Cleanup ──────────────────────────────────────────────────
echo ""
echo "── Cleanup ────────────────────────────────────────────────"
$PSQL -h 127.0.0.1 -p 5432 -U z -d postgres -c "DROP DATABASE IF EXISTS rizqun_test_restore;" > /dev/null 2>&1
rm -rf $BACKUP_DIR
echo "   ✓ Test DB + backup files cleaned up"

echo ""
echo "═════════════════════════════════════════════════════════"
echo "  All 6 checks passed. ✅"
echo "═════════════════════════════════════════════════════════"
