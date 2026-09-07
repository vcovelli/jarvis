#!/usr/bin/env bash
set -euo pipefail

backup_file="${1:-}"
if [[ -z "$backup_file" || ! -f "$backup_file" ]]; then
  echo "Usage: RESTORE_CHECK_DATABASE_URL=... $0 /path/to/backup.dump" >&2
  exit 1
fi
if [[ -z "${RESTORE_CHECK_DATABASE_URL:-}" ]]; then
  echo "RESTORE_CHECK_DATABASE_URL is required" >&2
  exit 1
fi
if [[ -n "${DATABASE_URL:-}" && "$RESTORE_CHECK_DATABASE_URL" == "$DATABASE_URL" ]]; then
  echo "Refusing to restore into DATABASE_URL" >&2
  exit 1
fi

database_name="$(node -e 'const value=new URL(process.env.RESTORE_CHECK_DATABASE_URL); console.log(value.pathname.replace(/^\//, ""))')"
if [[ ! "$database_name" =~ ^jarvis_restore_check_ ]]; then
  echo "Restore-check database name must start with jarvis_restore_check_" >&2
  exit 1
fi

pg_restore --list "$backup_file" >/dev/null
pg_restore --clean --if-exists --no-owner --no-acl --dbname "$RESTORE_CHECK_DATABASE_URL" "$backup_file"
psql "$RESTORE_CHECK_DATABASE_URL" -v ON_ERROR_STOP=1 -c 'SELECT COUNT(*) AS users FROM "User";' >/dev/null
psql "$RESTORE_CHECK_DATABASE_URL" -v ON_ERROR_STOP=1 -c 'SELECT COUNT(*) AS migrations FROM "_prisma_migrations";' >/dev/null
echo "Restore check passed in disposable database: $database_name"
