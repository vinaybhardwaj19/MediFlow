#!/bin/bash
# MongoDB backup script for MediFlow
echo "Backup started at $(date)"

if [ -z "$MONGO_URI" ]; then
  echo "Error: MONGO_URI is not set"
  exit 1
fi

BACKUP_DIR="/backups/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

mongodump --uri="$MONGO_URI" --gzip --out="$BACKUP_DIR"

echo "Cleaning up backups older than 30 days..."
find /backups/ -type d -mtime +30 -exec rm -rf {} +

echo "Backup completed at $(date)"
