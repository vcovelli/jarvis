#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
web_dir="$repo_dir/apps/web"
dry_run=false
if [[ "${1:-}" == "--dry-run" ]]; then dry_run=true; shift; fi
if [[ $# -ne 0 ]]; then echo "Usage: $0 [--dry-run]" >&2; exit 2; fi

run() {
  if $dry_run; then printf 'DRY RUN:'; printf ' %q' "$@"; printf '\n'; else "$@"; fi
}

cd "$web_dir"
run node scripts/validate-env.mjs --production
run npm ci
run npm run prisma:generate
run npm run verify
run npm run prisma:migrate:deploy

if [[ -n "${HOMELAB_DOCS_REFRESH_COMMAND:-}" ]]; then
  if $dry_run; then echo "DRY RUN: HOMELAB_DOCS_REFRESH_COMMAND (configured)"; else bash -lc "$HOMELAB_DOCS_REFRESH_COMMAND"; fi
fi

pm2_name="${JARVIS_PM2_NAME:-jarvis}"
run pm2 restart "$pm2_name" --update-env
if ! $dry_run; then
  base_url="${JARVIS_BASE_URL:-http://127.0.0.1:3000}"
  for attempt in 1 2 3 4 5; do
    if curl --fail --silent --show-error "$base_url/api/health" >/dev/null && curl --fail --silent --show-error "$base_url/api/ready" >/dev/null; then break; fi
    if [[ "$attempt" == "5" ]]; then echo "Deployment health verification failed" >&2; exit 1; fi
    sleep 2
  done
fi
run pm2 status "$pm2_name"
