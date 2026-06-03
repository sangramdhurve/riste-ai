#!/usr/bin/env bash
# Restore a backup from S3.  Usage: scripts/restore.sh riste-20260103-030000.sql.gz
set -euo pipefail

: "${DATABASE_URL:?set DATABASE_URL}"
: "${S3_BUCKET:?set S3_BUCKET}"
KEY="${1:?usage: restore.sh <backup-filename>}"

TMP="/tmp/${KEY}"
echo "[restore] downloading s3://${S3_BUCKET}/backups/${KEY}…"
aws s3 cp "s3://${S3_BUCKET}/backups/${KEY}" "${TMP}"

echo "[restore] restoring into database… (this overwrites current data)"
gunzip -c "${TMP}" | psql "${DATABASE_URL}"
rm -f "${TMP}"
echo "[restore] done."
