# Jarvis Deployment and Recovery Runbook

Jarvis supports controlled single-host or managed Node.js deployment with PostgreSQL. The production baseline is Node.js 20.9+, HTTPS, stable secrets, committed Prisma migrations, a working mail relay when verification is enforced, and a tested database backup. Optional integrations add their own network and filesystem requirements.

This repository does not include a container image or PM2 ecosystem file. The deployment helper expects an existing PM2 process and never creates one.

## Production preflight

- Record the release Git SHA and current PM2 process name.
- Confirm Node.js 20.9+, npm, PostgreSQL client tools, and PM2 are installed.
- Confirm `DATABASE_URL` targets the intended database and that migrations are allowed.
- Confirm the browser-facing HTTPS origin exactly matches `NEXTAUTH_URL`.
- Take and verify a PostgreSQL backup before applying migrations.
- Keep registration in `disabled`, `access_code`, or `invite` mode for controlled rollout.
- Confirm `/api/health` and `/api/ready` are monitored.
- Verify every enabled provider from the application host.

From `apps/web`, validate without changing the database:

```bash
npm ci
npm run config:validate -- --production
npm run prisma:generate
npx prisma validate
npx prisma migrate status
npm run verify
```

`prisma migrate status` is read-only. `prisma:migrate:deploy` is the explicit production migration step and must not be used until the backup and rollout window are approved.

## Environment configuration

Use `apps/web/.env.example` as the canonical template. Store production secrets in the platform or process manager, never in Git.

### Core and sessions

| Variable | Required/default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Required | PostgreSQL connection string. |
| `NEXTAUTH_URL` | Required | Canonical absolute HTTPS origin. |
| `NEXTAUTH_SECRET` | Required; 32+ chars in production | JWT signing and default encryption key material. |
| `FINANCIAL_DATA_KEY` | Recommended | Stable finance encryption material; use 64 hex chars from `openssl rand -hex 32`. Falls back to `NEXTAUTH_SECRET`. |
| `TRUST_PROXY_HEADERS` | `false` | Trust `X-Forwarded-For` for rate limits/audit IPs only when a trusted proxy overwrites it. |

Credentials sessions use secure cookies in production and expire after seven days. Password reset, password change, and the account **Sign out everywhere** action increment `User.sessionVersion`; existing JWTs stop authenticating on their next server check. Normal NextAuth sign-out removes the current browser session.

Keep `NEXTAUTH_SECRET` and `FINANCIAL_DATA_KEY` stable. Rotating the auth secret signs everyone out; changing the finance key makes existing encrypted Plaid access tokens unreadable.

### Registration, recovery, and email

| Variable | Default | Purpose |
| --- | --- | --- |
| `REGISTRATION_MODE` | `open` | `open`, `access_code`, `invite`, or `disabled`. |
| `REGISTRATION_DISABLED` | `false` | Legacy emergency override; `true` always closes registration. |
| `REGISTRATION_ACCESS_CODE` | Empty | Shared code required in `access_code` mode. |
| `EMAIL_VERIFICATION_REQUIRED` | `false` | When `true`, unverified users cannot sign in. Kept false for backward compatibility. |
| `EMAIL_FROM` | Empty | Sender passed to the configured mail relay. |
| `EMAIL_WEBHOOK_URL` | Empty | HTTPS relay receiving auth-email JSON. |
| `EMAIL_WEBHOOK_BEARER_TOKEN` | Empty | Optional relay bearer credential. |
| `AUTH_DEV_EXPOSE_TOKENS` | `false` | Non-production only: include recovery/verification URL in the API/UI response. Ignored in production. |
| `JARVIS_ADMIN_EMAILS` | Empty | Comma-separated emails treated as `ADMIN` by entitlement policy checks. |

The mail relay receives JSON with `from`, `to`, `subject`, `text`, `html`, and `kind`. Password-reset links expire in 30 minutes; email-verification links expire in 24 hours. Only SHA-256 token hashes are stored, tokens are type-scoped and single-use, and reset requests always return the same 202 response whether an account exists or not.

When enabling required verification, configure and test the relay first:

```bash
npm run config:validate -- --production
```

Create a one-time database-backed invitation after migrations are deployed and `DATABASE_URL` is available to the shell:

```bash
npm run invite:create -- --email=person@example.com --days=7
```

The command prints the plaintext code once. Only its hash is stored. Omit `--email` for a non-email-restricted code; `--days` accepts 1–90.

### Rate limiting

Application-level fixed-window limits protect login, registration, password changes/resets, verification, assistant calls, transcription, finance sync, Plaid Link/exchange, live real-estate lookup, and internal jobs. Limits apply by client IP and, once authenticated, by user. A blocked request returns HTTP 429 with `Retry-After` and `X-RateLimit-*` headers.

Override a profile with `RATE_LIMIT_<PROFILE>_MAX` and `RATE_LIMIT_<PROFILE>_WINDOW_SECONDS`; camel-case profiles become uppercase snake case, for example:

```dotenv
RATE_LIMIT_LOGIN_MAX="10"
RATE_LIMIT_LOGIN_WINDOW_SECONDS="900"
RATE_LIMIT_FINANCE_SYNC_MAX="6"
RATE_LIMIT_FINANCE_SYNC_WINDOW_SECONDS="600"
```

`RATE_LIMIT_DISABLED=true` works only outside production. The current in-memory store is appropriate for one Node process and deliberately sits behind a replaceable store interface. Multi-process or horizontally scaled deployments must provide an edge/shared limiter before relying on global counts.

### Plaid and scheduled finance sync

| Variable | Default | Purpose |
| --- | --- | --- |
| `PLAID_ENV` | `sandbox` | `sandbox`, `development`, or `production`. |
| `PLAID_CLIENT_ID` / `PLAID_SECRET` | Empty | Credentials for the selected environment. |
| `PLAID_COUNTRY_CODES` | `US` | Comma-separated Link country codes. |
| `PLAID_WEBHOOK_URL` | Empty | Public HTTPS URL, normally `<origin>/api/finance/plaid/webhook`. |
| `PLAID_REDIRECT_URI` | Empty | Registered OAuth redirect URI. |
| `INTERNAL_JOB_SECRET` | Empty | Random bearer secret for `/api/internal/finance-sync`. |

The webhook validates the `Plaid-Verification` ES256 JWT, its body hash, timestamp, and Plaid verification key before processing. `ExternalWebhookEvent.eventKey` makes delivery idempotent. It matches connections by stored Plaid item ID and isolates sync failures per connection. Configure the exact public endpoint in Plaid and smoke-test it in the selected environment.

The scheduled job acquires a database lease to prevent overlapping all-user runs; each connection also has its own lease. One failing connection does not stop the rest. A simple single-host scheduler can invoke:

```bash
JARVIS_BASE_URL="http://127.0.0.1:3000" \
INTERNAL_JOB_SECRET="<from-secret-store>" \
./scripts/finance-sync.sh
```

Run that command from cron or a systemd timer at the desired interval. Protect the secret through a root-readable environment file rather than placing it directly in a crontab. HTTP 409 means a previous leased run is still active; alert on repeated 401, 429, 5xx, or partial failures.

### Optional integrations

- OpenAI: `OPENAI_API_KEY`, `OPENAI_TRANSCRIPTION_MODEL`, `OPENAI_INTENT_MODEL`.
- OpenClaw: gateway URL/credentials, agent/session settings, and optional local state paths from `.env.example`.
- RentCast: API key, monthly limit/reserve, and cache TTL. Its usage ledger is host-local, so multi-instance deployment needs a shared quota.
- Homelab: documentation root, Prometheus URL, and Grafana URL. Filesystem and private-network access are intentional host capabilities.

## Security headers and external domains

The global Next.js policy sets CSP, HSTS in production, clickjacking protection, MIME sniffing protection, a strict referrer policy, permissions restrictions, and a popup-compatible opener policy. Browser connections/frames are limited to the app plus Plaid domains; Plaid Link scripts may load from `https://cdn.plaid.com`. PWA manifests, same-origin assets, data/blob images, microphone audio, and blob workers remain allowed.

If a future browser integration needs another origin, add the narrowest directive in `next.config.ts` and test Plaid Link plus PWA install behavior. Server-side outbound calls are not controlled by browser CSP.

## Health, readiness, audit, and logs

- `GET /api/health` is liveness only and does not query dependencies.
- `GET /api/ready` validates non-secret core configuration state and a database query; it returns 503 when not ready.
- `AuditLog` stores account, auth, finance, sync, and webhook security events with outcome, user/IP/user agent, and sanitized bounded metadata. Password/token/secret/credential keys are stripped.
- Server logs use stable event names and structured identifiers/statuses. Do not add raw request bodies, provider payloads, access tokens, cookies, or full exception objects.

Monitor readiness failures, repeated 429s, login failures, password resets, account deletion, provider link/unlink, sync failures, partial scheduled runs, webhook verification failures, database capacity, and backup jobs. Audit records are operational/security history, not an immutable compliance ledger.

## Backup and restore drill

Backups require PostgreSQL `pg_dump`/`pg_restore`. Set an explicit directory; the helper creates a timestamped custom-format dump with mode 0600 and verifies its catalog:

```bash
DATABASE_URL="<production-url>" \
JARVIS_BACKUP_DIR="/srv/backups/jarvis" \
./scripts/db-backup.sh
```

Copy backups to encrypted off-host storage and define retention, owner, recovery point, and recovery time targets. Browser-only theme/view preferences and the disposable RentCast cache are not in PostgreSQL; back up external homelab documents separately.

Restore drills must use a pre-created disposable database whose name starts with `jarvis_restore_check_`. The script refuses an identical `DATABASE_URL` and uses `--clean` only against that named check database:

```bash
DATABASE_URL="<production-url>" \
RESTORE_CHECK_DATABASE_URL="postgres://.../jarvis_restore_check_20260907" \
./scripts/db-restore-check.sh /srv/backups/jarvis/jarvis-YYYYMMDDTHHMMSSZ.dump
```

It verifies both the `User` and `_prisma_migrations` tables. Inspect application-level sample records after the command, then drop the disposable database through the normal database-admin workflow. Never point the restore check at production.

## Deployment helper

From the repository root, inspect the exact actions without executing them:

```bash
./scripts/deploy.sh --dry-run
```

The real helper validates production configuration, runs `npm ci`, generates Prisma Client, runs the full verification gate, applies committed migrations, optionally refreshes homelab docs, restarts the existing PM2 process with updated environment, checks health/readiness, and prints PM2 status.

Configure these operator variables as needed:

```dotenv
JARVIS_PM2_NAME="jarvis"
JARVIS_BASE_URL="http://127.0.0.1:3000"
HOMELAB_DOCS_REFRESH_COMMAND=""
```

After taking a verified backup and approving the window:

```bash
./scripts/deploy.sh
```

Do not run two deployment helpers concurrently. The helper does not create a backup, provision PM2, alter the reverse proxy, or roll back automatically.

## Rollback

1. Stop routing new traffic or enable the deployment's maintenance procedure.
2. Preserve logs and record the failing release SHA, PM2 status, readiness response, and applied migrations.
3. If migrations have not run, restore the previous code/build and restart the existing PM2 process.
4. If the additive security-foundation migration has run, older application code can generally ignore its added tables/column; still verify compatibility before switching. Do not manually drop the new schema objects.
5. Check out/build the last known-good compatible release, restart `JARVIS_PM2_NAME`, then check `/api/health`, `/api/ready`, login, and one read/write smoke flow.
6. Restore a database backup only for confirmed data corruption and only through an approved database-admin procedure. A restore loses writes after the backup and is not the default code rollback.
7. Keep the failed release artifacts and document the incident before attempting a corrected rollout.

Prisma migrations are forward operations. Prefer a new corrective migration over editing or deleting an applied migration.

## Post-deploy browser checklist

1. `/api/health` returns 200 and `/api/ready` returns 200 without exposing configuration values.
2. Registration matches the selected mode; invalid codes/invites fail.
3. Login, current-browser sign-out, sign-out everywhere, password change, reset, verification, and resend behave as configured.
4. Reusing or using an expired recovery token fails; reset/change invalidates prior sessions.
5. Create and delete a mood, custom mood tag, todo, and habit; refresh and confirm deleted state does not reappear.
6. Export the disposable user's data and verify no hashes, credentials, raw provider records, or encrypted access tokens are present.
7. Connect/sync/remove a Plaid sandbox item, verify the webhook, and confirm one user cannot access another user's connection.
8. Trigger the scheduled sync twice and confirm overlap returns 409 while unrelated connections remain isolated.
9. Delete a disposable account and confirm owned records disappear; inspect provider unlink outcome.
10. Check Home/Plan/Finances, bottom navigation, and representative theme combinations on desktop and a narrow phone viewport.
11. Confirm CSP/security headers are present and Plaid Link/PWA behavior still works.
12. Confirm audit/log monitoring receives expected events without credentials or token values.
