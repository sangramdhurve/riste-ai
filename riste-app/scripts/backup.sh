#!/usr/bin/env bash
# Nightly backup: pg_dump -> gzip -> S3. Keeps the last 14 days.
# Run from host cron, e.g.:  0 3 * * *  /path/riste-app/scripts/backup.sh
set -euo pipefail

: "${DATABASE_URL:?set DATABASE_URL}"
: "${S3_BUCKET:?set S3_BUCKET}"

TS="$(date +%Y%m%d-%H%M%S)"
TMP="/tmp/riste-${TS}.sql.gz"

echo "[backup] dumping database…"
pg_dump "${DATABASE_URL}" | gzip > "${TMP}"

echo "[backup] uploading to s3://${S3_BUCKET}/backups/…"
aws s3 cp "${TMP}" "s3://${S3_BUCKET}/backups/riste-${TS}.sql.gz"
rm -f "${TMP}"

# Retention: delete backups older than 14 days.
CUTOFF="$(date -d '14 days ago' +%Y%m%d 2>/dev/null || date -v-14d +%Y%m%d)"
aws s3 ls "s3://${S3_BUCKET}/backups/" | awk '{print $4}' | while read -r key; do
  [ -z "${key}" ] && continue
  d="$(echo "${key}" | sed -E 's/riste-([0-9]{8})-.*/\1/')"
  if [ -n "${d}" ] && [ "${d}" -lt "${CUTOFF}" ] 2>/dev/null; then
    aws s3 rm "s3://${S3_BUCKET}/backups/${key}"
  fi
done

echo "[backup] done."
