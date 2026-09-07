#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi
if [[ -z "${JARVIS_BACKUP_DIR:-}" ]]; then
  echo "JARVIS_BACKUP_DIR must be an explicit backup directory" >&2
  exit 1
fi

mkdir -p -- "$JARVIS_BACKUP_DIR"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
target="$JARVIS_BACKUP_DIR/jarvis-$timestamp.dump"
pg_dump --format=custom --no-owner --no-acl --file "$target" "$DATABASE_URL"
chmod 600 "$target"
pg_restore --list "$target" >/dev/null
echo "Backup created and catalog verified: $target"
