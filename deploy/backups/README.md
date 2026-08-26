# Database Backups — Setup Guide

## Backup script

**File:** `deploy/backups/backup.sh`

Creates a gzipped `pg_dump` of the `rizqun_db` database with:
- Timestamped filename (`rizqun_YYYY-MM-DD_HHMMSS.sql.gz`)
- Local retention (30 days, configurable)
- Optional offsite upload (S3-compatible storage)

### Setup

1. **Make the scripts executable:**
   ```bash
   chmod +x deploy/backups/backup.sh deploy/backups/restore.sh
   ```

2. **Test manually:**
   ```bash
   ./deploy/backups/backup.sh
   # Should create: backups/rizqun_2026-08-26_020000.sql.gz
   ```

3. **Add to cron (nightly at 2 AM):**
   ```bash
   crontab -e
   # Add this line:
   0 2 * * * /home/rizqun/rizqun/deploy/backups/backup.sh >> /home/rizqun/logs/backup.log 2>&1
   ```

### Configuration (in `.env` or environment)

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_HOST` | `127.0.0.1` | PostgreSQL host |
| `DB_PORT` | `5432` | PostgreSQL port |
| `DB_NAME` | `rizqun_db` | Database name |
| `DB_USER` | `rizqun_user` | Database user |
| `DB_PASSWORD` | (required) | Database password |
| `BACKUP_DIR` | `./backups` | Local backup directory |
| `RETENTION_DAYS` | `30` | Days to keep locally |
| `OFFSITE_ENABLED` | `false` | Set to `true` to enable offsite upload |
| `OFFSITE_CMD` | (empty) | Upload command (e.g. `rclone copy` or `aws s3 cp`) |
| `OFFSITE_TARGET` | (empty) | Target path (e.g. `s3:my-bucket/rizqun-backups/`) |

### Offsite upload (optional)

Using **rclone** (recommended — supports S3, GCS, Azure, Backblaze, etc.):

```bash
# Install rclone
curl https://rclone.org/install.sh | sudo bash

# Configure your remote (interactive)
rclone config
# → name: offsite
# → type: s3 (or your provider)
# → enter keys

# Set in .env:
OFFSITE_ENABLED=true
OFFSITE_CMD="rclone copy"
OFFSITE_TARGET="offsite:rizqun-backups/"
```

Using **aws-cli**:

```bash
# Install aws-cli
sudo apt install awscli

# Configure
aws configure

# Set in .env:
OFFSITE_ENABLED=true
OFFSITE_CMD="aws s3 cp"
OFFSITE_TARGET="s3://my-bucket/rizqun-backups/"
```

### Retention

- **Local:** 30 days (configurable via `RETENTION_DAYS`)
- **Offsite:** managed by your storage provider's lifecycle rules
  - S3: set bucket lifecycle → delete after 90 days
  - Or use `rclone delete --min-age 90d offsite:rizqun-backups/` in a second cron

## Restore script

**File:** `deploy/backups/restore.sh`

Restores a gzipped backup to a PostgreSQL database.

### Usage

```bash
# Stop the API first!
pm2 stop rizqun-api

# Restore to original DB (will DROP and recreate all tables)
./deploy/backups/restore.sh backups/rizqun_2026-08-26_020000.sql.gz

# Restore to a scratch DB for testing
./deploy/backups/restore.sh backups/rizqun_2026-08-26_020000.sql.gz rizqun_test_restore

# After restore, restart the API
pm2 start rizqun-api
```

### What the restore does

1. Asks for confirmation (type `RESTORE`)
2. Drops the target database
3. Recreates it
4. Restores from the gzipped SQL dump
5. Verifies: table count, user count, order count

### Test restore (recommended monthly)

```bash
# Create a test backup
./deploy/backups/backup.sh

# Restore to a test DB
./deploy/backups/restore.sh backups/rizqun_$(date +%Y-%m-%d)_*.sql.gz rizqun_test_restore

# Verify
psql -h 127.0.0.1 -U rizqun_user -d rizqun_test_restore -c "SELECT count(*) FROM users;"

# Cleanup
psql -h 127.0.0.1 -U rizqun_user -d postgres -c "DROP DATABASE rizqun_test_restore;"
```
