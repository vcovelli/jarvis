#!/usr/bin/env bash
set -euo pipefail

base_url="${JARVIS_BASE_URL:-http://127.0.0.1:3000}"
if [[ -z "${INTERNAL_JOB_SECRET:-}" ]]; then
  echo "INTERNAL_JOB_SECRET is required" >&2
  exit 1
fi
curl --fail --silent --show-error --request POST --header "Authorization: Bearer $INTERNAL_JOB_SECRET" "$base_url/api/internal/finance-sync"
echo
